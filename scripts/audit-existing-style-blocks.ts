/**
 * 기존 DB 의 hospital_style_profiles 행 중 prompt injection 패턴 detect 되는 행 audit.
 * Read-only — DB 쓰기 없음. 실행은 user 승인 후 (감사 #3 후속).
 *
 * 본 스크립트:
 *   1. style_profile.style_profile.analyzedStyle 에서 텍스트 필드 추출
 *      (representativeParagraphs / goodExamples / openingStyle / vocabulary 등).
 *   2. promptInjectionGuard.detectInjection() 으로 분석.
 *   3. shouldBlock=true 행을 docs/style-blocks-injection-audit-<DATE>-<LABEL>.md
 *      table 로 출력.
 *
 * 환경:
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (style_profile 테이블 RLS 우회 필요).
 *   SUPABASE_PROJECT_LABEL=next-app | public-app
 *
 * 실행:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_PROJECT_LABEL=next-app \
 *     npx tsx scripts/audit-existing-style-blocks.ts
 *
 * 양 인스턴스 각각 실행. 실제 정리 (저장된 payload 재처리 또는 row 삭제) 는
 * user 결정 — 본 스크립트는 진단만.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { detectInjection } from '../packages/blog-core/src/promptInjectionGuard';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_LABEL = process.env.SUPABASE_PROJECT_LABEL || 'unknown';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // eslint-disable-next-line no-console
  console.error('[audit-style] SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 환경변수 필요');
  process.exit(1);
}

const DATE = new Date().toISOString().slice(0, 10);

interface ProfileRow {
  hospital_name: string;
  style_profile: {
    analyzedStyle?: {
      representativeParagraphs?: string[];
      goodExamples?: string[];
      openingStyle?: string;
      vocabulary?: string[];
      sentenceEndings?: string[];
      uniqueExpressions?: string[];
    };
    name?: string;
  } | null;
}

async function main() {
  const sb = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // hospital_style_profiles 테이블명은 운영자 환경에 따라 다를 수 있음.
  // 일반적 이름 시도 — 실패 시 사용자가 테이블명 알려줘야 함.
  const TABLE_CANDIDATES = ['hospital_style_profiles', 'style_profiles', 'hospital_styles'];
  let data: ProfileRow[] | null = null;
  let usedTable = '';
  let lastErr = '';
  for (const t of TABLE_CANDIDATES) {
    const { data: rows, error } = await sb
      .from(t)
      .select('hospital_name, style_profile');
    if (!error && rows) {
      data = rows as ProfileRow[];
      usedTable = t;
      break;
    }
    lastErr = error?.message || 'unknown';
  }
  if (!data) {
    // eslint-disable-next-line no-console
    console.error(`[audit-style] 테이블 조회 실패 (시도: ${TABLE_CANDIDATES.join(', ')}). 마지막 에러: ${lastErr}`);
    process.exit(2);
  }
  // eslint-disable-next-line no-console
  console.log(`[audit-style] 테이블: ${usedTable}, 행: ${data.length}`);

  interface FlaggedRow {
    hospital: string;
    fieldsHit: string[];
    highPatterns: string[];
    lowPatterns: string[];
    lengthAnomaly: boolean;
  }
  const flagged: FlaggedRow[] = [];

  for (const row of data) {
    const as_ = row.style_profile?.analyzedStyle;
    if (!as_) continue;

    const fieldsHit: string[] = [];
    const allHigh = new Set<string>();
    const allLow = new Set<string>();
    let lengthAnomaly = false;

    const checkText = (field: string, text: string | undefined | null) => {
      if (!text) return;
      const det = detectInjection(text);
      if (det.shouldBlock || det.lengthAnomaly) {
        fieldsHit.push(field);
        det.highConfidencePatterns.forEach((p) => allHigh.add(p));
        det.lowConfidencePatterns.forEach((p) => allLow.add(p));
        if (det.lengthAnomaly) lengthAnomaly = true;
      }
    };

    checkText('openingStyle', as_.openingStyle);
    (as_.representativeParagraphs || []).forEach((p, i) =>
      checkText(`representativeParagraphs[${i}]`, p),
    );
    (as_.goodExamples || []).forEach((p, i) => checkText(`goodExamples[${i}]`, p));

    if (fieldsHit.length > 0) {
      flagged.push({
        hospital: row.hospital_name || '(unknown)',
        fieldsHit,
        highPatterns: [...allHigh],
        lowPatterns: [...allLow],
        lengthAnomaly,
      });
    }
  }

  const lines: string[] = [
    `# 기존 hospital_style_profiles injection audit — ${DATE} (${PROJECT_LABEL})`,
    '',
    `생성: ${new Date().toISOString()}`,
    `Supabase: ${SUPABASE_URL}`,
    `테이블: ${usedTable}`,
    '',
    '## 요약',
    '',
    `- 전체 행: ${data.length}`,
    `- Injection 의심 행: **${flagged.length}**`,
    '',
    '## Flagged 행',
    '',
  ];

  if (flagged.length === 0) {
    lines.push('없음 ✅ — 모든 저장된 style block 이 injection 패턴 0건.');
  } else {
    lines.push('| hospital | hit fields | HIGH patterns | LOW patterns | 길이 이상 |');
    lines.push('|---|---|---|---|---|');
    for (const f of flagged) {
      lines.push(
        `| ${f.hospital} | ${f.fieldsHit.join(', ')} | ${f.highPatterns.join(', ')} | ${f.lowPatterns.join(', ')} | ${f.lengthAnomaly ? '⚠️' : ''} |`,
      );
    }
    lines.push('');
    lines.push('## 권장 조치');
    lines.push('');
    lines.push('1. 본 행들의 `style_profile.analyzedStyle` 을 어드민 UI 에서 검토.');
    lines.push('2. injection payload 가 실제 사용자 의도면 (예: 가이드 본문에 "ignore previous" 라는 영어 표현 자체를 인용한 경우) 통과시킴.');
    lines.push('3. 외부 사이트 조작으로 들어온 payload 면 해당 hospital 의 style_profile 재학습 또는 row 삭제.');
    lines.push('4. 본 라운드 머지 후 sanitizeAnalyzedStylePii 가 사용 시점 strip 적용 — 기존 행도 builder 도달 시 자동 strip 됨.');
  }

  const out = `docs/style-blocks-injection-audit-${DATE}-${PROJECT_LABEL}.md`;
  writeFileSync(out, lines.join('\n') + '\n', 'utf-8');
  // eslint-disable-next-line no-console
  console.log(`[audit-style] (${PROJECT_LABEL}) flagged ${flagged.length}/${data.length} → ${out}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[audit-style] fatal:', e);
  process.exit(99);
});
