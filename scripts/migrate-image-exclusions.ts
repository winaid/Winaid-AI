/**
 * hospital_images.exclude_keywords 자동 제안 생성기 (분석 전용).
 *
 * 스키마 변경은 SQL 파일에서 처리:
 *   sql/migrations/2026-05-15_hospital_images_exclude_keywords.sql
 *   public-app-sql/migrations/2026-05-15_hospital_images_exclude_keywords.sql
 * 위 2개를 양 Supabase 프로젝트 SQL Editor 에서 실행한 후 본 스크립트 사용.
 *
 * 본 스크립트는 다음을 한다:
 *   - hospital_images 행을 읽어 `tags` 를 분석.
 *   - confusable 쌍 (임플란트 vs 사랑니, 도수치료 vs 추나요법 등) 의 default
 *     exclude_keywords 를 자동 제안.
 *   - 자동 적용은 안 함 (false-positive 우려). `docs/image-library-exclusion-suggestions.md`
 *     에 hospital × image × 제안 list 로 출력만 → 운영자가 image-library 페이지에서
 *     수동 보강 또는 SQL UPDATE 직접 실행.
 *
 * 실행 전 조건:
 *   - .env 에 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (분석 select 만 → service_role
 *     필수 아님, anon 으로도 가능하나 RLS 가 hospital_images 조회를 막을 수 있어 권장).
 *   - 양 Supabase 프로젝트 각각 실행 — env 를 인스턴스별로 분리해 두 번 호출.
 *
 * 실행:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/migrate-image-exclusions.ts
 *
 * Idempotent: select-only. 출력 파일은 매번 덮어씀.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // eslint-disable-next-line no-console
  console.error('[migrate-image-exclusions] SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 환경변수 필요');
  process.exit(1);
}

// confusable 쌍 — 보수적 boost set.
// "특정 태그 보유 시 → 다음을 excludeKeywords 에 추가 제안".
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
  const sb = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: images, error } = await sb
    .from('hospital_images')
    .select('id, hospital_name, tags, exclude_keywords')
    .order('created_at', { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[migrate-image-exclusions] select 실패:', error.message);
    // eslint-disable-next-line no-console
    console.error(
      '  exclude_keywords 컬럼이 없을 가능성 → SQL 마이그레이션 먼저 실행:\n' +
        '  sql/migrations/2026-05-15_hospital_images_exclude_keywords.sql',
    );
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

  const lines: string[] = [
    '# 이미지 라이브러리 — `exclude_keywords` 자동 제안 목록',
    '',
    `생성: ${new Date().toISOString()}`,
    `Supabase: ${SUPABASE_URL}`,
    '',
    `총 ${suggestions.length}개 이미지에 제안 (전체 ${images?.length || 0}개 중).`,
    '',
    '## 적용 방법',
    '',
    '제안은 자동 적용 안 함. 운영자가 확인 후 image-library 페이지에서 수동 보강 또는 SQL Editor 에서 UPDATE 실행.',
    '',
    '```sql',
    "-- 예시: 특정 이미지에 exclude_keywords 추가",
    "UPDATE hospital_images",
    "   SET exclude_keywords = ARRAY['사랑니']::text[]",
    " WHERE id = '<image_id>';",
    '```',
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
