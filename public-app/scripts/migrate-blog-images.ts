/**
 * migrate-blog-images.ts
 *
 * #146 후속: 기존 generated_posts.content 의 인라인 base64 이미지를
 * Supabase Storage(blog-images) 로 업로드하고 <img src="..."> 를 public URL 로 치환.
 *
 * 사용법:
 *   # 환경변수 (필수)
 *   export SUPABASE_URL="https://<project>.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
 *
 *   # 1) dry-run (변경 없이 영향 row 수 + 절감 추정)
 *   npx tsx public-app/scripts/migrate-blog-images.ts
 *
 *   # 2) 실제 실행 (UPDATE 적용)
 *   npx tsx public-app/scripts/migrate-blog-images.ts --confirm
 *
 *   # 옵션: 한 번에 처리할 row 수 (기본 50)
 *   npx tsx public-app/scripts/migrate-blog-images.ts --confirm --limit 100
 *
 * 특징:
 *   - idempotent: content LIKE '%data:image/%base64,%' 인 row 만 처리, 다음 실행 시 미처리 row 재시도
 *   - 실패 row 는 로그 후 건너뛰기 (계속 진행)
 *   - upload 시 충돌 방지: blog/migration/${row.id}_${index}.${ext}
 *
 * 사전 권고:
 *   - 운영 환경에서 실행 전 Supabase 백업 (`pg_dump` 또는 콘솔 백업) 권장
 *   - dry-run 으로 영향 row 수 확인 후 --confirm
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const LIMIT = (() => {
  const idx = args.indexOf('--limit');
  if (idx >= 0 && args[idx + 1]) {
    const n = Number(args[idx + 1]);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 50;
})();

// ---------------------------------------------------------------------------
// Env guard
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[migrate-blog-images] FATAL: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = 'blog-images';

// ---------------------------------------------------------------------------
// data:URL extractor (정규식 — cheerio 불필요)
// 매칭: <img ... src="data:image/png;base64,XXXX..." ... />
// ---------------------------------------------------------------------------
const DATA_URL_PATTERN = /data:(image\/[a-zA-Z+]+);base64,([A-Za-z0-9+/=\s]+?)(?=["')\s])/g;

interface ExtractedImage {
  fullDataUrl: string;
  mimeType: string;
  base64: string;
  byteLength: number;
}

function extractDataUrls(content: string): ExtractedImage[] {
  const out: ExtractedImage[] = [];
  const seen = new Set<string>();
  for (const m of content.matchAll(DATA_URL_PATTERN)) {
    const fullDataUrl = m[0];
    if (seen.has(fullDataUrl)) continue;
    seen.add(fullDataUrl);
    const mimeType = m[1];
    const base64 = m[2].replace(/\s+/g, '');
    out.push({
      fullDataUrl,
      mimeType,
      base64,
      byteLength: Math.floor((base64.length * 3) / 4),
    });
  }
  return out;
}

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'png';
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// 단일 이미지 업로드
// ---------------------------------------------------------------------------
async function uploadOne(rowId: string, index: number, img: ExtractedImage): Promise<string | null> {
  const ext = extFromMime(img.mimeType);
  const fileName = `blog/migration/${rowId}_${index}.${ext}`;
  const buffer = Buffer.from(img.base64, 'base64');

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, buffer, { contentType: img.mimeType, upsert: true });

  if (uploadErr) {
    console.warn(`[upload] row=${rowId} idx=${index}: 실패 — ${uploadErr.message}`);
    return null;
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
  return urlData?.publicUrl || null;
}

// ---------------------------------------------------------------------------
// row 처리
// ---------------------------------------------------------------------------
interface RowResult {
  id: string;
  imagesFound: number;
  imagesReplaced: number;
  bytesBefore: number;
  bytesAfter: number;
  updated: boolean;
  error?: string;
}

async function processRow(row: { id: string; content: string }): Promise<RowResult> {
  const result: RowResult = {
    id: row.id,
    imagesFound: 0,
    imagesReplaced: 0,
    bytesBefore: Buffer.byteLength(row.content, 'utf8'),
    bytesAfter: 0,
    updated: false,
  };

  const images = extractDataUrls(row.content);
  result.imagesFound = images.length;

  if (images.length === 0) {
    result.bytesAfter = result.bytesBefore;
    return result;
  }

  if (!CONFIRM) {
    // dry-run: data url 길이 합산으로 절감 추정 (인라인 → URL ≈ 200B)
    const inlineBytes = images.reduce((s, im) => s + im.fullDataUrl.length, 0);
    const urlBytes = images.length * 200;
    result.bytesAfter = result.bytesBefore - inlineBytes + urlBytes;
    return result;
  }

  let newContent = row.content;
  let idx = 0;
  for (const img of images) {
    idx += 1;
    const publicUrl = await uploadOne(row.id, idx, img);
    if (!publicUrl) continue;
    newContent = newContent.replaceAll(img.fullDataUrl, publicUrl);
    result.imagesReplaced += 1;
  }

  if (result.imagesReplaced === 0) {
    result.bytesAfter = result.bytesBefore;
    result.error = 'all-uploads-failed';
    return result;
  }

  // 부분 성공도 저장 (남은 base64 는 다음 실행 시 재시도 — idempotent)
  const { error: updErr } = await supabase
    .from('generated_posts')
    .update({ content: newContent })
    .eq('id', row.id);

  if (updErr) {
    result.error = `update-failed: ${updErr.message}`;
    return result;
  }

  result.updated = true;
  result.bytesAfter = Buffer.byteLength(newContent, 'utf8');
  return result;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log('==============================================');
  console.log('  migrate-blog-images — generated_posts');
  console.log('  mode:', CONFIRM ? 'CONFIRM (writes UPDATE)' : 'DRY-RUN (read only)');
  console.log('  batch limit:', LIMIT);
  console.log('==============================================');

  // 1) count 추정
  const { count, error: countErr } = await supabase
    .from('generated_posts')
    .select('id', { count: 'exact', head: true })
    .like('content', '%data:image/%base64,%');

  if (countErr) {
    console.error('[count] failed:', countErr.message);
    process.exit(2);
  }
  console.log(`[count] base64 인라인 보유 row 추정: ${count ?? 0}`);

  if (!count || count === 0) {
    console.log('[done] 처리할 row 가 없습니다. 스크립트는 idempotent — 추후 재발 시 재사용 가능.');
    return;
  }

  // 2) 대상 row 페치 (id, content 만)
  const { data: rows, error: selErr } = await supabase
    .from('generated_posts')
    .select('id, content')
    .like('content', '%data:image/%base64,%')
    .order('created_at', { ascending: true })
    .limit(LIMIT);

  if (selErr) {
    console.error('[select] failed:', selErr.message);
    process.exit(3);
  }
  if (!rows || rows.length === 0) {
    console.log('[done] 0 rows fetched.');
    return;
  }

  console.log(`[fetch] ${rows.length} rows 처리 시작`);

  let totalImages = 0;
  let totalReplaced = 0;
  let totalUpdated = 0;
  let totalBefore = 0;
  let totalAfter = 0;
  const failures: { id: string; error: string }[] = [];

  for (const row of rows) {
    const r = await processRow(row as { id: string; content: string });
    totalImages += r.imagesFound;
    totalReplaced += r.imagesReplaced;
    totalBefore += r.bytesBefore;
    totalAfter += r.bytesAfter;
    if (r.updated) totalUpdated += 1;
    if (r.error) failures.push({ id: r.id, error: r.error });
    console.log(
      `  row=${r.id}: imgs=${r.imagesFound} replaced=${r.imagesReplaced} bytes=${r.bytesBefore}→${r.bytesAfter}` +
        (r.updated ? ' [UPDATED]' : '') +
        (r.error ? ` ERR=${r.error}` : ''),
    );
  }

  console.log('----------------------------------------------');
  console.log(`[summary] rows=${rows.length} updated=${totalUpdated} images=${totalImages} replaced=${totalReplaced}`);
  console.log(`[summary] bytes: ${totalBefore} → ${totalAfter} (절감 ${(totalBefore - totalAfter) / 1024 | 0} KB)`);
  if (failures.length) {
    console.log(`[summary] failures=${failures.length}:`);
    for (const f of failures) console.log(`   - ${f.id}: ${f.error}`);
  }
  console.log('==============================================');
  if (!CONFIRM) {
    console.log('NOTE: dry-run only. 적용하려면 --confirm 플래그를 추가하세요.');
  } else if (count && count > rows.length) {
    console.log(`NOTE: ${count - rows.length} rows 가 남아 있습니다. 다시 실행하세요 (idempotent).`);
  }
}

main().catch((e) => {
  console.error('[migrate-blog-images] uncaught:', e);
  process.exit(99);
});
