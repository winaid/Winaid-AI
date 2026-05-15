/**
 * 보강 가이드 (fix-todo) 자동 생성 — read-only.
 *
 * audit-image-exclusions.ts (자기 모순 + 카테고리 채움률) + simulate-image-matching.ts
 * (회귀 케이스 FAIL) 의 분석 로직을 in-memory 재실행 → 우선순위 정렬된 보강 list 출력.
 *
 * 우선순위:
 *   HIGH   = simulation FAIL 케이스 (잘못된 confusable 매칭)
 *   MEDIUM = 자기 모순 (excludeKeywords ↔ 자체 tags 겹침)
 *   LOW    = 채움률 낮은 카테고리 (< 30%)
 *
 * 각 항목에 구체 수정 SQL + image-library 어드민 UI 가이드 동봉.
 *
 * 실행:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_PROJECT_LABEL=next-app \
 *     npx tsx scripts/build-image-fix-todo.ts
 *
 * read-only — DB 쓰기 안 함.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import {
  scoreLibraryImage,
  type LibraryImageRecord,
} from '../packages/blog-core/src/imageMatcher';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PROJECT_LABEL = process.env.SUPABASE_PROJECT_LABEL || 'unknown';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // eslint-disable-next-line no-console
  console.error('[fix-todo] SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 환경변수 필요');
  process.exit(1);
}

const DATE = new Date().toISOString().slice(0, 10);
const LOW_FILL_THRESHOLD_PCT = 30;
const MIN_LIBRARY_SIZE = 10;

interface ImageRow {
  id: string;
  hospital_name: string | null;
  tags: string[] | null;
  alt_text: string | null;
  ai_description: string | null;
  exclude_keywords: string[] | null;
}

// audit / simulate 와 동일한 케이스 정의 (drift-zero 차원에서 inline 복제 — 향후 공유 모듈 추출 가능).
const CASES = [
  { id: 'C1-implant', title: '임플란트 식립 후 관리법', bodyKeywords: ['임플란트', '식립', '관리'], expectInclude: ['임플란트'], expectAvoid: ['사랑니'] },
  { id: 'C2-wisdom', title: '사랑니 발치 회복기간', bodyKeywords: ['사랑니', '발치', '회복'], expectInclude: ['사랑니'], expectAvoid: ['임플란트'] },
  { id: 'C3-botox', title: '보톡스 시술 부작용', bodyKeywords: ['보톡스', '시술', '부작용'], expectInclude: ['보톡스'], expectAvoid: ['필러'] },
  { id: 'C4-filler', title: '필러 부작용 대처', bodyKeywords: ['필러', '부작용', '대처'], expectInclude: ['필러'], expectAvoid: ['보톡스'] },
  { id: 'C5-doubleeyelid', title: '쌍커풀 수술 회복', bodyKeywords: ['쌍커풀', '수술', '회복'], expectInclude: ['쌍커풀'], expectAvoid: ['코재수술', '코수술'] },
  { id: 'C6-rhinorevision', title: '코 재수술 주의사항', bodyKeywords: ['재수술', '주의사항'], expectInclude: ['코재수술', '재수술', '코수술'], expectAvoid: ['쌍커풀'] },
  { id: 'C7-discnonop', title: '디스크 비수술 치료', bodyKeywords: ['디스크', '비수술', '치료'], expectInclude: ['디스크', '비수술'], expectAvoid: ['수술'] },
];

interface FailItem {
  caseId: string;
  title: string;
  reason: string;
  top1: { id: string; tags: string[]; alt: string | null; score: number };
  expectInclude: string[];
  expectAvoid: string[];
}

interface SelfContradictionItem {
  id: string;
  hospital: string;
  tags: string[];
  excludeKeywords: string[];
  conflict: string[];
}

interface LowFillItem {
  category: string;
  total: number;
  filled: number;
  pct: number;
}

function hasAnyToken(haystack: string, tokens: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().normalize('NFC');
  const h = norm(haystack);
  for (const t of tokens) {
    if (h.includes(norm(t))) return t;
  }
  return null;
}

async function fetchHospitalCategories(
  sb: ReturnType<typeof createClient>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { data } = await sb.from('hospitals').select('name, category').limit(1000);
    if (!data) return map;
    for (const row of data as Array<{ name: string; category: string | null }>) {
      if (row.name && row.category) map.set(row.name, row.category);
    }
  } catch {
    // ignore — 테이블 없는 인스턴스
  }
  return map;
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
    console.error('[fix-todo] select 실패:', error.message);
    process.exit(2);
  }

  const images = (data || []) as ImageRow[];
  const records: Array<LibraryImageRecord & { tags: string[]; altText: string | null; aiDescription: string | null; hospitalName: string | null }> =
    images.map((r) => ({
      id: r.id,
      tags: r.tags || [],
      altText: r.alt_text,
      aiDescription: r.ai_description,
      excludeKeywords: r.exclude_keywords || [],
      hospitalName: r.hospital_name,
    }));

  // ── HIGH: simulation FAIL ──
  const fails: FailItem[] = [];
  if (records.length >= MIN_LIBRARY_SIZE) {
    for (const c of CASES) {
      const scored = records
        .map((img) =>
          scoreLibraryImage(img, {
            title: c.title,
            bodyKeywords: c.bodyKeywords,
          }),
        )
        .filter((r) => !r.excluded && r.score > 0)
        .sort((a, b) => b.score - a.score);
      if (scored.length === 0) continue;
      const top1 = scored[0];
      const img = top1.image;
      const blob = [...(img.tags || []), img.altText || '', img.aiDescription || ''].join(' ');
      const avoidHit = hasAnyToken(blob, c.expectAvoid);
      const includeHit = hasAnyToken(blob, c.expectInclude);
      if (avoidHit) {
        fails.push({
          caseId: c.id,
          title: c.title,
          reason: `top1 에 expectAvoid 토큰 "${avoidHit}" 포함`,
          top1: {
            id: img.id,
            tags: (img.tags as string[]) || [],
            alt: (img.altText as string | null) ?? null,
            score: top1.score,
          },
          expectInclude: c.expectInclude,
          expectAvoid: c.expectAvoid,
        });
      } else if (!includeHit) {
        fails.push({
          caseId: c.id,
          title: c.title,
          reason: `top1 에 expectInclude (${c.expectInclude.join('|')}) 토큰 부재`,
          top1: {
            id: img.id,
            tags: (img.tags as string[]) || [],
            alt: (img.altText as string | null) ?? null,
            score: top1.score,
          },
          expectInclude: c.expectInclude,
          expectAvoid: c.expectAvoid,
        });
      }
    }
  }

  // ── MEDIUM: 자기 모순 ──
  const selfContradictions: SelfContradictionItem[] = [];
  for (const img of records) {
    const tagSet = new Set(((img.tags as string[]) || []).map((t) => t.toLowerCase()));
    const ex = (img.excludeKeywords as string[]) || [];
    const conflict = ex.filter((kw) => tagSet.has((kw || '').toLowerCase()));
    if (conflict.length > 0) {
      selfContradictions.push({
        id: img.id,
        hospital: img.hospitalName || '(unknown)',
        tags: (img.tags as string[]) || [],
        excludeKeywords: ex,
        conflict,
      });
    }
  }

  // ── LOW: 채움률 낮은 카테고리 ──
  const hospitalCat = await fetchHospitalCategories(sb);
  const catTotal = new Map<string, number>();
  const catFilled = new Map<string, number>();
  for (const img of records) {
    const cat = hospitalCat.get(img.hospitalName || '') || 'unknown';
    catTotal.set(cat, (catTotal.get(cat) || 0) + 1);
    if (((img.excludeKeywords as string[]) || []).length > 0) {
      catFilled.set(cat, (catFilled.get(cat) || 0) + 1);
    }
  }
  const lowFill: LowFillItem[] = [];
  for (const [cat, total] of catTotal) {
    const filled = catFilled.get(cat) || 0;
    const pct = total > 0 ? (filled / total) * 100 : 0;
    if (pct < LOW_FILL_THRESHOLD_PCT && total >= 3) {
      lowFill.push({ category: cat, total, filled, pct });
    }
  }

  // ── 마크다운 출력 ──
  const lines: string[] = [
    `# 보강 가이드 (fix-todo) — ${DATE} (${PROJECT_LABEL})`,
    '',
    `생성: ${new Date().toISOString()}`,
    `Supabase: ${SUPABASE_URL}`,
    `라이브러리 표본: ${records.length} 개`,
    '',
    '## 요약',
    '',
    `- HIGH (FAIL 매칭): **${fails.length}** 건`,
    `- MEDIUM (자기 모순): **${selfContradictions.length}** 건`,
    `- LOW (채움률 < ${LOW_FILL_THRESHOLD_PCT}%): **${lowFill.length}** 카테고리`,
    '',
  ];

  // HIGH 섹션.
  lines.push('## 🔴 HIGH — FAIL 매칭 케이스 (즉시 보강)');
  lines.push('');
  if (fails.length === 0) {
    lines.push('없음 ✅');
  } else {
    for (const f of fails) {
      lines.push(`### ${f.caseId} — "${f.title}"`);
      lines.push('');
      lines.push(`- 사유: ${f.reason}`);
      lines.push(`- 잘못 매칭된 top1: \`${f.top1.id}\` tags=[${f.top1.tags.join(', ')}] alt="${f.top1.alt || ''}"`);
      lines.push('');
      lines.push('**제안 fix** (확인 후 실행):');
      lines.push('');
      lines.push('```sql');
      lines.push(`-- top1 이미지에 expectInclude 외 토큰이 매칭 ← excludeKeywords 보강 권장`);
      lines.push(`UPDATE hospital_images`);
      lines.push(`   SET exclude_keywords = exclude_keywords || ARRAY[${f.expectInclude.map((t) => `'${t}'`).join(', ')}]::text[]`);
      lines.push(` WHERE id = '${f.top1.id}';`);
      lines.push('```');
      lines.push('');
      lines.push(`또는 image-library 페이지에서 ${f.top1.id} 의 \`excludeKeywords\` 에 [${f.expectInclude.join(', ')}] 추가.`);
      lines.push('');
    }
  }

  // MEDIUM 섹션.
  lines.push('## 🟡 MEDIUM — 자기 모순 (excludeKeywords ↔ 자체 tags 겹침)');
  lines.push('');
  if (selfContradictions.length === 0) {
    lines.push('없음 ✅');
  } else {
    lines.push('자기 자신을 차단하는 설정 — 즉시 제거. 의미 없는 점수 손실.');
    lines.push('');
    lines.push('| image_id | hospital | 충돌 키워드 | tags | excludeKeywords |');
    lines.push('|---|---|---|---|---|');
    for (const s of selfContradictions) {
      lines.push(`| ${s.id} | ${s.hospital} | ${s.conflict.join(', ')} | ${s.tags.join(', ')} | ${s.excludeKeywords.join(', ')} |`);
    }
    lines.push('');
    lines.push('**일괄 fix SQL** (자기 모순 키워드만 제거):');
    lines.push('');
    lines.push('```sql');
    lines.push('-- 자기 자신의 tags 와 겹치는 excludeKeywords 항목 제거 (in image-library page also possible)');
    for (const s of selfContradictions) {
      const remain = s.excludeKeywords.filter((kw) => !s.conflict.map((c) => c.toLowerCase()).includes(kw.toLowerCase()));
      lines.push(`UPDATE hospital_images SET exclude_keywords = ARRAY[${remain.map((t) => `'${t}'`).join(', ')}]::text[] WHERE id = '${s.id}';`);
    }
    lines.push('```');
    lines.push('');
  }

  // LOW 섹션.
  lines.push(`## 🟢 LOW — 채움률 < ${LOW_FILL_THRESHOLD_PCT}% 카테고리 (장기 보강)`);
  lines.push('');
  if (lowFill.length === 0) {
    lines.push('없음 ✅ — 모든 카테고리가 적정 채움률.');
  } else {
    lines.push('| category | total | filled | fill% |');
    lines.push('|---|---|---|---|');
    for (const l of lowFill.sort((a, b) => a.pct - b.pct)) {
      lines.push(`| ${l.category} | ${l.total} | ${l.filled} | ${l.pct.toFixed(1)}% |`);
    }
    lines.push('');
    lines.push('보강 방법:');
    lines.push('1. 해당 카테고리 병원의 image-library 페이지에서 운영자 수동 보강.');
    lines.push('2. `scripts/migrate-image-exclusions.ts` 의 confusable boost rule 자동 제안 list 참조.');
    lines.push('');
  }

  lines.push('## 검증 후 재실행 권장');
  lines.push('');
  lines.push('보강 적용 후 동일 명령 재실행 → HIGH=0 / MEDIUM=0 으로 수렴 확인:');
  lines.push('');
  lines.push('```bash');
  lines.push('npx tsx scripts/build-image-fix-todo.ts');
  lines.push('```');
  lines.push('');

  // 결론.
  let conclusion: string;
  if (records.length < MIN_LIBRARY_SIZE) {
    conclusion = `⚠️ 라이브러리 표본 ${records.length} < ${MIN_LIBRARY_SIZE} — 통계 의미 약함. 운영자 시드 추가 후 재실행 권장.`;
  } else if (fails.length === 0 && selfContradictions.length === 0 && lowFill.length === 0) {
    conclusion = '✅ 마이그레이션 성공 — 추가 보강 필요 없음.';
  } else if (fails.length >= 2) {
    conclusion = `❌ HIGH ${fails.length} 건 — 마이그레이션 후 보강 미흡. 위 SQL/UI 가이드로 즉시 처리 필요.`;
  } else {
    conclusion = `🟡 일부 보강 필요 — HIGH ${fails.length} / MEDIUM ${selfContradictions.length} / LOW ${lowFill.length}.`;
  }
  lines.push('## 결론');
  lines.push('');
  lines.push(conclusion);

  const out = `docs/image-exclusions-fix-todo-${DATE}-${PROJECT_LABEL}.md`;
  writeFileSync(out, lines.join('\n') + '\n', 'utf-8');

  // eslint-disable-next-line no-console
  console.log(`[fix-todo] (${PROJECT_LABEL}) HIGH ${fails.length} / MEDIUM ${selfContradictions.length} / LOW ${lowFill.length}`);
  // eslint-disable-next-line no-console
  console.log(`[fix-todo] → ${out}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[fix-todo] fatal:', e);
  process.exit(99);
});
