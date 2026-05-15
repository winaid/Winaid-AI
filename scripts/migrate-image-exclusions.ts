/**
 * hospital_images.exclude_keywords 컬럼 마이그레이션 + 자동 보강 가이드.
 *
 * 본 스크립트는 다음을 한다:
 *   1) hospital_images 테이블에 `exclude_keywords text[]` 컬럼 추가 (없으면).
 *   2) 기존 행의 `tags` 를 분석해 confusable 쌍 (임플란트 vs 사랑니, 도수치료 vs
 *      추나요법 등) 의 default exclude_keywords 를 자동 제안.
 *      - 자동 적용은 안 함 (false-positive 우려). `docs/image-library-exclusion-todo.md`
 *        에 hospital_id × image_id × 제안 list 형태로 출력만.
 *
 * 실행 전 조건:
 *   - .env 에 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 설정 (next-app / public-app 의 키 둘 다 가능).
 *   - 본 스크립트는 service_role 권한 필수 — RLS 우회 schema 변경.
 *
 * 실행: `npx tsx scripts/migrate-image-exclusions.ts --dry-run`
 *       (실제 적용은 user 승인 후 `--apply` 플래그)
 *
 * Idempotent: 컬럼 추가는 IF NOT EXISTS. 제안 출력은 매번 동일.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // eslint-disable-next-line no-console
  console.error('[migrate-image-exclusions] SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 환경변수 필요');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

// confusable 쌍 — 본 list 는 _migration/_archive 의 audit 에서 식별된 보수적 셋.
// "특정 태그" 보유 시 "배제 후보" 키워드를 자동 제안.
const CONFUSABLE_PAIRS: Array<{ ifHasTag: string; suggestExclude: string[]; reason: string }> = [
  { ifHasTag: '임플란트', suggestExclude: ['사랑니'], reason: '임플란트 ↔ 사랑니 confusable' },
  { ifHasTag: '사랑니', suggestExclude: ['임플란트'], reason: '사랑니 ↔ 임플란트 confusable' },
  { ifHasTag: '도수치료', suggestExclude: ['추나요법'], reason: '도수 ↔ 추나 (양·한방)' },
  { ifHasTag: '추나요법', suggestExclude: ['도수치료'], reason: '추나 ↔ 도수' },
  { ifHasTag: '라식', suggestExclude: ['라섹', '스마일라식'], reason: '굴절교정술 분리' },
  { ifHasTag: '라섹', suggestExclude: ['라식', '스마일라식'], reason: '굴절교정술 분리' },
  { ifHasTag: '치아교정', suggestExclude: ['치아미백', '라미네이트'], reason: '교정 ↔ 심미 분리' },
  { ifHasTag: '치아미백', suggestExclude: ['치아교정', '라미네이트'], reason: '미백 ↔ 교정/심미' },
];

async function main() {
  const sb = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) 컬럼 추가 (idempotent)
  const ALTER_SQL = `
    ALTER TABLE hospital_images
      ADD COLUMN IF NOT EXISTS exclude_keywords text[] NOT NULL DEFAULT '{}';
  `;
  // eslint-disable-next-line no-console
  console.log(`[migrate-image-exclusions] ${DRY_RUN ? '[DRY-RUN]' : '[APPLY]'} ALTER TABLE`);
  if (APPLY) {
    const { error } = await sb.rpc('exec_sql' as any, { sql: ALTER_SQL });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[migrate-image-exclusions] ALTER 실패 — supabase REST 의 raw SQL exec_sql RPC 가 없으면 SQL 콘솔에서 직접 실행 필요:');
      // eslint-disable-next-line no-console
      console.warn(ALTER_SQL);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('  (dry-run — 실제 적용 안 함)');
    // eslint-disable-next-line no-console
    console.log(ALTER_SQL);
  }

  // 2) 기존 행 분석 + 제안 생성
  const { data: images, error } = await sb
    .from('hospital_images')
    .select('id, hospital_name, tags, exclude_keywords')
    .order('created_at', { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[migrate-image-exclusions] select 실패:', error.message);
    process.exit(2);
  }

  type Suggestion = {
    imageId: string;
    hospitalName: string;
    currentTags: string[];
    currentExclude: string[];
    suggestedAdd: string[];
    reasons: string[];
  };

  const suggestions: Suggestion[] = [];
  for (const img of images || []) {
    const tags: string[] = img.tags || [];
    const currentExclude: string[] = img.exclude_keywords || [];
    const toAdd = new Set<string>();
    const reasons: string[] = [];
    for (const pair of CONFUSABLE_PAIRS) {
      if (tags.includes(pair.ifHasTag)) {
        for (const ex of pair.suggestExclude) {
          if (!currentExclude.includes(ex)) toAdd.add(ex);
        }
        if (toAdd.size > 0) reasons.push(pair.reason);
      }
    }
    if (toAdd.size > 0) {
      suggestions.push({
        imageId: img.id,
        hospitalName: img.hospital_name || '(unknown)',
        currentTags: tags,
        currentExclude,
        suggestedAdd: [...toAdd],
        reasons: [...new Set(reasons)],
      });
    }
  }

  // 3) 제안을 마크다운 가이드로 출력
  const lines: string[] = [
    '# 이미지 라이브러리 — `exclude_keywords` 자동 제안 목록',
    '',
    `생성: ${new Date().toISOString()}`,
    '',
    `총 ${suggestions.length}개 이미지에 제안 (전체 ${images?.length || 0}개 중).`,
    '',
    '## 적용 방법',
    '',
    '제안은 자동 적용 안 함. 운영자가 확인 후 image-library 페이지에서 수동 보강 또는 `--apply` 와 함께 별도 boost 스크립트로 일괄 적용.',
    '',
    '| hospital | image_id | tags | suggested exclude_keywords (add) | 이유 |',
    '|---|---|---|---|---|',
  ];
  for (const s of suggestions) {
    lines.push(
      `| ${s.hospitalName} | ${s.imageId} | ${s.currentTags.join(', ')} | ${s.suggestedAdd.join(', ')} | ${s.reasons.join('; ')} |`,
    );
  }
  const out = 'docs/image-library-exclusion-suggestions.md';
  writeFileSync(out, lines.join('\n') + '\n', 'utf-8');
  // eslint-disable-next-line no-console
  console.log(`[migrate-image-exclusions] suggestions → ${out}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[migrate-image-exclusions] fatal:', e);
  process.exit(99);
});
