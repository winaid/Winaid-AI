/**
 * 이미지 라이브러리 현황 audit — read-only.
 *
 * WS-2 마이그레이션 (sql/migrations/2026-05-15_hospital_images_exclude_keywords.sql)
 * 적용 후 실제 라이브러리 데이터에서 excludeKeywords 채움률, 토큰 분포, 자기
 * 모순 (excludeKeywords ↔ 자체 tags 겹침) 을 점검.
 *
 * 출력:
 *   - 콘솔 요약
 *   - docs/image-exclusions-audit-<YYYY-MM-DD>.md (table 형식)
 *
 * 실행:
 *   SUPABASE_URL=https://<프로젝트>.supabase.co \
 *     SUPABASE_SERVICE_ROLE_KEY=<key> \
 *     SUPABASE_PROJECT_LABEL=next-app \
 *     npx tsx scripts/audit-image-exclusions.ts
 *
 *   양 프로젝트 각각 실행 (PROJECT_LABEL 으로 출력 파일 구분).
 *   파일명: docs/image-exclusions-audit-<DATE>-<LABEL>.md
 *
 * read-only — DB 쓰기 안 함.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PROJECT_LABEL = process.env.SUPABASE_PROJECT_LABEL || 'unknown';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // eslint-disable-next-line no-console
  console.error('[audit] SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 환경변수 필요');
  process.exit(1);
}

const DATE = new Date().toISOString().slice(0, 10);

interface ImageRow {
  id: string;
  hospital_name: string | null;
  tags: string[] | null;
  alt_text: string | null;
  ai_description: string | null;
  exclude_keywords: string[] | null;
}

// CATEGORY 추정: image 의 hospital_name 으로 hospitals 테이블 의 category 를 lookup.
// hospitals 테이블이 없거나 category 컬럼 없으면 'unknown' 으로 집계.
interface HospitalCategoryRow {
  name: string;
  category: string | null;
}

async function fetchHospitalCategories(
  sb: ReturnType<typeof createClient>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { data, error } = await sb.from('hospitals').select('name, category').limit(1000);
    if (error || !data) return map;
    for (const row of data as HospitalCategoryRow[]) {
      if (row.name && row.category) map.set(row.name, row.category);
    }
  } catch {
    // hospitals 테이블 없는 인스턴스 — silent fallback.
  }
  return map;
}

function tally<T>(items: T[], keyFn: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = keyFn(it);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function topN(m: Map<string, number>, n: number): Array<[string, number]> {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function main() {
  const sb = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await sb
    .from('hospital_images')
    .select('id, hospital_name, tags, alt_text, ai_description, exclude_keywords')
    .order('created_at', { ascending: true });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[audit] select 실패:', error.message);
    // eslint-disable-next-line no-console
    console.error(
      '  exclude_keywords 컬럼이 없을 가능성 → SQL 마이그레이션 먼저 실행:\n' +
        '  sql/migrations/2026-05-15_hospital_images_exclude_keywords.sql',
    );
    process.exit(2);
  }

  const images = (data || []) as ImageRow[];
  const hospitalCat = await fetchHospitalCategories(sb);

  const total = images.length;
  const withExclude = images.filter((i) => (i.exclude_keywords || []).length > 0);
  const fillRate = total > 0 ? (withExclude.length / total) * 100 : 0;

  // 카테고리별 집계 (hospitals 테이블 매핑 또는 unknown).
  const byCategoryTotal = tally(images, (i) => hospitalCat.get(i.hospital_name || '') || 'unknown');
  const byCategoryFilled = tally(withExclude, (i) => hospitalCat.get(i.hospital_name || '') || 'unknown');

  // 빈도 분포.
  const allExcludeTokens: string[] = [];
  for (const img of withExclude) {
    for (const kw of img.exclude_keywords || []) {
      const k = (kw || '').trim();
      if (k) allExcludeTokens.push(k);
    }
  }
  const tokenFreq = tally(allExcludeTokens, (t) => t);
  const topExcludeTokens = topN(tokenFreq, 20);

  // 자기 모순: excludeKeywords 가 본 이미지의 tags 와 겹치면 자기 자신 차단 — 이상치.
  const selfContradiction: Array<{ id: string; hospital: string; conflict: string[] }> = [];
  for (const img of images) {
    const tags = new Set((img.tags || []).map((t) => t.toLowerCase()));
    const ex = img.exclude_keywords || [];
    const conflict = ex.filter((kw) => tags.has((kw || '').toLowerCase()));
    if (conflict.length > 0) {
      selfContradiction.push({
        id: img.id,
        hospital: img.hospital_name || '(unknown)',
        conflict,
      });
    }
  }

  // 카테고리별 채움률 표.
  const categories = [...new Set([...byCategoryTotal.keys()])].sort();
  const catRows: string[] = categories.map((cat) => {
    const tot = byCategoryTotal.get(cat) || 0;
    const fil = byCategoryFilled.get(cat) || 0;
    const pct = tot > 0 ? ((fil / tot) * 100).toFixed(1) : '-';
    return `| ${cat} | ${tot} | ${fil} | ${pct}% |`;
  });

  // 마크다운 출력.
  const lines: string[] = [
    `# 이미지 라이브러리 audit — ${DATE} (${PROJECT_LABEL})`,
    '',
    `생성: ${new Date().toISOString()}`,
    `Supabase: ${SUPABASE_URL}`,
    '',
    '## 요약',
    '',
    `- 전체 이미지: **${total}** 개`,
    `- excludeKeywords 채워진 이미지: **${withExclude.length}** 개 (${fillRate.toFixed(1)}%)`,
    `- 자기 모순 이상치: **${selfContradiction.length}** 건${selfContradiction.length === 0 ? ' ✅' : ' ⚠️'}`,
    `- 카테고리 매핑 (hospitals.category): ${hospitalCat.size > 0 ? `${hospitalCat.size}개` : 'unknown (테이블 없음 또는 매핑 실패)'}`,
    '',
    '## 카테고리별 채움률',
    '',
    '| category | total | with exclude_keywords | fill rate |',
    '|---|---|---|---|',
    ...catRows,
    '',
    '## 상위 빈도 excludeKeywords (top 20)',
    '',
    '| token | count |',
    '|---|---|',
    ...topExcludeTokens.map(([t, c]) => `| ${t} | ${c} |`),
    '',
    '## 자기 모순 이상치',
    '',
  ];
  if (selfContradiction.length === 0) {
    lines.push('없음 ✅');
  } else {
    lines.push('| image_id | hospital | 충돌 키워드 |');
    lines.push('|---|---|---|');
    for (const s of selfContradiction) {
      lines.push(`| ${s.id} | ${s.hospital} | ${s.conflict.join(', ')} |`);
    }
  }
  lines.push('');
  lines.push('## 다음 단계');
  lines.push('');
  lines.push('1. 채움률 낮은 카테고리 → image-library 페이지 또는 SQL UPDATE 로 운영자 수동 보강.');
  lines.push('2. 자기 모순 이상치 있으면 → 즉시 fix (자기 차단은 무의미). image-library 페이지에서 해당 image 의 excludeKeywords 삭제.');
  lines.push('3. 매칭 시뮬레이션 결과 (`docs/image-matching-simulation-*.md`) 와 cross-check → 미흡한 보강 항목은 `docs/image-exclusions-fix-todo-*.md` 에 정리됨.');

  const out = `docs/image-exclusions-audit-${DATE}-${PROJECT_LABEL}.md`;
  writeFileSync(out, lines.join('\n') + '\n', 'utf-8');

  // 콘솔 요약.
  // eslint-disable-next-line no-console
  console.log(`[audit] (${PROJECT_LABEL}) 전체 ${total} / 채움 ${withExclude.length} (${fillRate.toFixed(1)}%) / 모순 ${selfContradiction.length}건`);
  // eslint-disable-next-line no-console
  console.log(`[audit] → ${out}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[audit] fatal:', e);
  process.exit(99);
});
