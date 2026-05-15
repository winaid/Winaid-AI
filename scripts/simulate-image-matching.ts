/**
 * 회귀 케이스 매칭 시뮬레이션 — read-only.
 *
 * WS-2 마이그레이션 + 보강 적용 후, 실제 라이브러리 데이터에서 confusable 쌍
 * 글 시나리오에 대해 pickBestLibraryImage 가 의도대로 동작하는지 검증.
 *
 * 출력:
 *   - 콘솔: 7 케이스 PASS/FAIL 요약
 *   - docs/image-matching-simulation-<YYYY-MM-DD>-<LABEL>.md
 *
 * 실행:
 *   SUPABASE_URL=https://<프로젝트>.supabase.co \
 *     SUPABASE_SERVICE_ROLE_KEY=<key> \
 *     SUPABASE_PROJECT_LABEL=next-app \
 *     npx tsx scripts/simulate-image-matching.ts
 *
 * read-only — DB 쓰기 안 함.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import {
  pickBestLibraryImage,
  scoreLibraryImage,
  type LibraryImageRecord,
} from '../packages/blog-core/src/imageMatcher';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PROJECT_LABEL = process.env.SUPABASE_PROJECT_LABEL || 'unknown';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // eslint-disable-next-line no-console
  console.error('[simulate] SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 환경변수 필요');
  process.exit(1);
}

const DATE = new Date().toISOString().slice(0, 10);

interface SimulationCase {
  id: string;
  title: string;
  category: '치과' | '피부과' | '성형외과' | '정형외과' | '내과' | '한의원' | '안과';
  bodyKeywords: string[];
  /** top1 의 tag/alt/desc 에 이 토큰 중 하나라도 포함되면 의도 일치. */
  expectInclude: string[];
  /** top1 의 tag/alt/desc 에 이 토큰이 포함되면 잘못된 매칭 — FAIL. */
  expectAvoid: string[];
  /** 마진 임계치 — top1 과 top2 점수 차이가 이 값 미만이면 marginal 표기. */
  marginThreshold: number;
}

const CASES: SimulationCase[] = [
  {
    id: 'C1-implant',
    title: '임플란트 식립 후 관리법',
    category: '치과',
    bodyKeywords: ['임플란트', '식립', '관리'],
    expectInclude: ['임플란트'],
    expectAvoid: ['사랑니'],
    marginThreshold: 1.5,
  },
  {
    id: 'C2-wisdom',
    title: '사랑니 발치 회복기간',
    category: '치과',
    bodyKeywords: ['사랑니', '발치', '회복'],
    expectInclude: ['사랑니'],
    expectAvoid: ['임플란트'],
    marginThreshold: 1.5,
  },
  {
    id: 'C3-botox',
    title: '보톡스 시술 부작용',
    category: '피부과',
    bodyKeywords: ['보톡스', '시술', '부작용'],
    expectInclude: ['보톡스'],
    expectAvoid: ['필러'],
    marginThreshold: 1.5,
  },
  {
    id: 'C4-filler',
    title: '필러 부작용 대처',
    category: '피부과',
    bodyKeywords: ['필러', '부작용', '대처'],
    expectInclude: ['필러'],
    expectAvoid: ['보톡스'],
    marginThreshold: 1.5,
  },
  {
    id: 'C5-doubleeyelid',
    title: '쌍커풀 수술 회복',
    category: '성형외과',
    bodyKeywords: ['쌍커풀', '수술', '회복'],
    expectInclude: ['쌍커풀'],
    expectAvoid: ['코재수술', '코수술'],
    marginThreshold: 1.5,
  },
  {
    id: 'C6-rhinorevision',
    title: '코 재수술 주의사항',
    category: '성형외과',
    bodyKeywords: ['재수술', '주의사항'],
    expectInclude: ['코재수술', '재수술', '코수술'],
    expectAvoid: ['쌍커풀'],
    marginThreshold: 1.5,
  },
  {
    id: 'C7-discnonop',
    title: '디스크 비수술 치료',
    category: '정형외과',
    bodyKeywords: ['디스크', '비수술', '치료'],
    expectInclude: ['디스크', '비수술'],
    expectAvoid: ['수술'],
    marginThreshold: 1.5,
  },
];

type Verdict = 'PASS' | 'FAIL' | 'INSUFFICIENT_DATA' | 'NO_MATCH';

interface CaseResult {
  caseId: string;
  title: string;
  verdict: Verdict;
  reason: string;
  top1?: { id: string; tags: string[]; alt: string | null; score: number };
  top2Score?: number;
  marginal: boolean;
  topFive: Array<{ id: string; tags: string[]; alt: string | null; score: number }>;
}

interface ImageRow {
  id: string;
  hospital_name: string | null;
  tags: string[] | null;
  alt_text: string | null;
  ai_description: string | null;
  exclude_keywords: string[] | null;
}

function rowToRecord(row: ImageRow): LibraryImageRecord & { tags: string[]; altText: string | null; aiDescription: string | null } {
  return {
    id: row.id,
    tags: row.tags || [],
    altText: row.alt_text,
    aiDescription: row.ai_description,
    excludeKeywords: row.exclude_keywords || [],
  };
}

function hasAnyToken(haystack: string, tokens: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().normalize('NFC');
  const h = norm(haystack);
  for (const t of tokens) {
    if (h.includes(norm(t))) return t;
  }
  return null;
}

function evaluate(
  candidates: Array<ReturnType<typeof scoreLibraryImage>>,
  caseDef: SimulationCase,
): { verdict: Verdict; reason: string; marginal: boolean; top2Score?: number } {
  if (candidates.length === 0) {
    return { verdict: 'NO_MATCH', reason: '관련 이미지 0개 (score>0 후보 없음)', marginal: false };
  }
  const top1 = candidates[0];
  const top2 = candidates[1];
  const marginal = top2 ? top1.score - top2.score < caseDef.marginThreshold : false;

  const img = top1.image;
  const blob = [
    ...(img.tags || []),
    img.altText || '',
    img.aiDescription || '',
  ].join(' ');

  const avoidHit = hasAnyToken(blob, caseDef.expectAvoid);
  if (avoidHit) {
    return {
      verdict: 'FAIL',
      reason: `top1 이 expectAvoid 토큰 "${avoidHit}" 포함 — 잘못된 매칭`,
      marginal,
      top2Score: top2?.score,
    };
  }

  const includeHit = hasAnyToken(blob, caseDef.expectInclude);
  if (!includeHit) {
    return {
      verdict: 'FAIL',
      reason: `top1 에 expectInclude (${caseDef.expectInclude.join('|')}) 토큰 부재`,
      marginal,
      top2Score: top2?.score,
    };
  }
  return {
    verdict: 'PASS',
    reason: `expectInclude "${includeHit}" 매칭, expectAvoid 없음`,
    marginal,
    top2Score: top2?.score,
  };
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
    console.error('[simulate] select 실패:', error.message);
    process.exit(2);
  }

  const images = (data || []) as ImageRow[];
  const records = images.map(rowToRecord);

  const MIN_LIBRARY_SIZE = 10;
  if (records.length < MIN_LIBRARY_SIZE) {
    // eslint-disable-next-line no-console
    console.warn(
      `[simulate] 라이브러리 표본 ${records.length} < ${MIN_LIBRARY_SIZE} — 통계적 의미 약함. 모든 케이스에 INSUFFICIENT_DATA 표기.`,
    );
  }

  const results: CaseResult[] = [];

  for (const c of CASES) {
    // 본 시뮬레이션은 가상의 글 → top 5 picking. 실제 코드 흐름과 동일하게
    // pickBestLibraryImage 호출 (top1) + 추가로 score 기준 sort 해 top5 출력.
    const scored = records
      .map((img) => scoreLibraryImage(img, {
        title: c.title,
        bodyKeywords: c.bodyKeywords,
      }))
      .filter((r) => !r.excluded && r.score > 0)
      .sort((a, b) => b.score - a.score);

    if (records.length < MIN_LIBRARY_SIZE) {
      results.push({
        caseId: c.id,
        title: c.title,
        verdict: 'INSUFFICIENT_DATA',
        reason: `라이브러리 ${records.length} < ${MIN_LIBRARY_SIZE} — 통계 의미 약함`,
        marginal: false,
        topFive: scored.slice(0, 5).map((r) => ({
          id: r.image.id,
          tags: (r.image.tags as string[]) || [],
          alt: (r.image.altText as string | null) ?? null,
          score: r.score,
        })),
      });
      continue;
    }

    const evalResult = evaluate(scored, c);
    results.push({
      caseId: c.id,
      title: c.title,
      verdict: evalResult.verdict,
      reason: evalResult.reason,
      marginal: evalResult.marginal,
      top1: scored[0] && {
        id: scored[0].image.id,
        tags: (scored[0].image.tags as string[]) || [],
        alt: (scored[0].image.altText as string | null) ?? null,
        score: scored[0].score,
      },
      top2Score: evalResult.top2Score,
      topFive: scored.slice(0, 5).map((r) => ({
        id: r.image.id,
        tags: (r.image.tags as string[]) || [],
        alt: (r.image.altText as string | null) ?? null,
        score: r.score,
      })),
    });
  }

  // 요약 카운트.
  const passCount = results.filter((r) => r.verdict === 'PASS').length;
  const failCount = results.filter((r) => r.verdict === 'FAIL').length;
  const noMatchCount = results.filter((r) => r.verdict === 'NO_MATCH').length;
  const insufficient = results.filter((r) => r.verdict === 'INSUFFICIENT_DATA').length;
  const marginalCount = results.filter((r) => r.marginal).length;

  // 마크다운 출력.
  const lines: string[] = [
    `# 매칭 시뮬레이션 — ${DATE} (${PROJECT_LABEL})`,
    '',
    `생성: ${new Date().toISOString()}`,
    `Supabase: ${SUPABASE_URL}`,
    `라이브러리 표본: ${records.length} 개`,
    '',
    '## 요약',
    '',
    `- PASS: **${passCount}** / ${results.length}`,
    `- FAIL: **${failCount}**`,
    `- NO_MATCH (관련 이미지 0개): **${noMatchCount}**`,
    `- INSUFFICIENT_DATA: **${insufficient}** (라이브러리 ${records.length} < 10)`,
    `- marginal (top1-top2 점수 차이 < threshold): **${marginalCount}**`,
    '',
    '## 케이스별 결과',
    '',
  ];

  for (const r of results) {
    const verdictIcon =
      r.verdict === 'PASS' ? '✅' :
      r.verdict === 'FAIL' ? '❌' :
      r.verdict === 'NO_MATCH' ? '⚪' :
      '⚠️';
    lines.push(`### ${verdictIcon} ${r.caseId} — "${r.title}"`);
    lines.push('');
    lines.push(`- 결과: **${r.verdict}**${r.marginal ? ' (marginal)' : ''}`);
    lines.push(`- 사유: ${r.reason}`);
    if (r.top1) {
      lines.push(`- top1: \`${r.top1.id}\` score=${r.top1.score.toFixed(2)} tags=[${r.top1.tags.join(', ')}] alt="${r.top1.alt || ''}"`);
    }
    if (r.top2Score !== undefined) {
      lines.push(`- top2 score: ${r.top2Score.toFixed(2)} (margin: ${(r.top1!.score - r.top2Score).toFixed(2)})`);
    }
    if (r.topFive.length > 0) {
      lines.push('');
      lines.push('top 5 후보:');
      lines.push('');
      lines.push('| rank | score | tags | alt |');
      lines.push('|---|---|---|---|');
      r.topFive.forEach((t, i) => {
        lines.push(`| ${i + 1} | ${t.score.toFixed(2)} | ${t.tags.join(', ')} | ${t.alt || ''} |`);
      });
    }
    lines.push('');
  }

  lines.push('## 결론');
  lines.push('');
  if (insufficient === results.length) {
    lines.push('⚠️ 모든 케이스가 INSUFFICIENT_DATA — 라이브러리 표본 부족. 실제 매칭 동작 검증 불가. 운영자 시드 추가 권장.');
  } else if (failCount === 0 && passCount >= 6) {
    lines.push('✅ 매칭 동작 정상. confusable 쌍 분리 invariant 유지.');
  } else if (failCount >= 2) {
    lines.push(`❌ FAIL ${failCount} 건 — 마이그레이션 후 보강 미흡. 원인 분석은 docs/image-exclusions-fix-todo-${DATE}-${PROJECT_LABEL}.md 참조.`);
  } else {
    lines.push('🟡 일부 케이스 미흡 — 운영자 수동 보강 권장.');
  }

  const out = `docs/image-matching-simulation-${DATE}-${PROJECT_LABEL}.md`;
  writeFileSync(out, lines.join('\n') + '\n', 'utf-8');

  // eslint-disable-next-line no-console
  console.log(`[simulate] (${PROJECT_LABEL}) PASS ${passCount}/${results.length}  FAIL ${failCount}  marginal ${marginalCount}`);
  // eslint-disable-next-line no-console
  console.log(`[simulate] → ${out}`);

  // 머신-readable 결과 stdout (다음 단계 fix-todo 생성용).
  // eslint-disable-next-line no-console
  console.log('---RESULTS-JSON---');
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ projectLabel: PROJECT_LABEL, librarySize: records.length, results }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[simulate] fatal:', e);
  process.exit(99);
});
