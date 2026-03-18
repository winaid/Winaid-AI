/**
 * Image Storage Service
 * base64 이미지를 Supabase Storage에 업로드하고 public URL 반환
 * persisted content에서 대용량 base64 제거 → URL/assetId만 저장
 *
 * SVG template 정책:
 *   - SVG template (image/svg+xml) 는 Supabase 업로드 대상에서 제외
 *   - SVG는 수KB 이하이므로 inline data URI로 HTML에 보존
 *   - Supabase Storage가 image/svg+xml을 거부하므로 업로드 시도 자체를 하지 않음
 *   - 이는 "실패 허용"이 아니라 "SVG template는 display-only 자산"이라는 정책적 결정
 */

import { supabase } from '../../lib/supabase';

const BUCKET_NAME = 'blog-images';

// Supabase Storage가 허용하는 raster 이미지 MIME 타입만
const UPLOADABLE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

// SVG template data URI 판별
function isSvgDataUri(data: string): boolean {
  return data.startsWith('data:image/svg');
}

// base64 data URI → Uint8Array + mime type 파싱
function parseBase64DataUri(dataUri: string): { bytes: Uint8Array; mimeType: string; ext: string } | null {
  const match = dataUri.match(/^data:(image\/([\w+.-]+));base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1];
  const rawExt = match[2];
  const ext = rawExt === 'svg+xml' ? 'svg' : rawExt === 'jpeg' ? 'jpg' : rawExt;
  const base64 = match[3];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { bytes, mimeType, ext };
}

// 고유 경로 생성
function generatePath(imageIndex: number, ext: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return `posts/${ts}_${rand}/img_${imageIndex}.${ext}`;
}

/**
 * 이미지 데이터를 정규화
 * - data:image/... → 그대로
 * - raw base64 → data:image/png;base64, 래핑
 * - blob/http/empty → null (업로드 불가/불필요)
 */
function normalizeImageData(data: string | null | undefined, imageIndex: number): string | null {
  if (!data || data.length === 0) {
    console.warn(`[IMG-NORMALIZE] IMG_${imageIndex}: empty data`);
    return null;
  }
  if (data.startsWith('data:image/')) return data;
  if (data.startsWith('blob:')) {
    console.warn(`[IMG-NORMALIZE] IMG_${imageIndex}: blob URL cannot be uploaded, skipping`);
    return null;
  }
  if (data.startsWith('http://') || data.startsWith('https://')) {
    console.info(`[IMG-NORMALIZE] IMG_${imageIndex}: already a remote URL, skipping upload`);
    return null;
  }
  if (/^[A-Za-z0-9+/]/.test(data) && data.length > 100) {
    console.info(`[IMG-NORMALIZE] IMG_${imageIndex}: raw base64 detected, wrapping as data:image/png`);
    return `data:image/png;base64,${data}`;
  }
  console.warn(`[IMG-NORMALIZE] IMG_${imageIndex}: unrecognized format (${data.substring(0, 50)}...)`);
  return null;
}

/**
 * base64 raster 이미지 1장을 Supabase Storage에 업로드
 * SVG template는 여기에 들어오지 않음 (uploadAllImages에서 사전 필터)
 * @returns public URL or null
 */
export async function uploadBase64Image(
  dataUri: string,
  imageIndex: number
): Promise<string | null> {
  try {
    const normalized = normalizeImageData(dataUri, imageIndex);
    if (!normalized) return null;

    const parsed = parseBase64DataUri(normalized);
    if (!parsed) {
      console.warn(`[IMG-UPLOAD] IMG_${imageIndex}: invalid data URI format after normalize (${normalized.substring(0, 60)}...)`);
      return null;
    }

    // MIME 타입 검증 — Supabase가 허용하지 않는 타입은 업로드하지 않음
    if (!UPLOADABLE_MIME_TYPES.has(parsed.mimeType)) {
      console.info(`[IMG-UPLOAD] IMG_${imageIndex}: mime type ${parsed.mimeType} is not uploadable, keeping as inline`);
      return null;
    }

    const path = generatePath(imageIndex, parsed.ext);

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, parsed.bytes, {
        contentType: parsed.mimeType,
        cacheControl: '31536000',
        upsert: false,
      });

    if (error) {
      console.warn(`[IMG-UPLOAD] IMG_${imageIndex}: upload failed — ${error.message}`);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(path);

    if (!urlData?.publicUrl) {
      console.warn(`[IMG-UPLOAD] IMG_${imageIndex}: getPublicUrl failed`);
      return null;
    }

    console.info(`[IMG-UPLOAD] IMG_${imageIndex}: uploaded ${Math.round(parsed.bytes.length / 1024)}KB → ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (err) {
    console.warn(`[IMG-UPLOAD] IMG_${imageIndex}: exception —`, err);
    return null;
  }
}

/**
 * 여러 이미지를 병렬 업로드
 * SVG template는 업로드 대상에서 제외하고, inline data URI로 보존
 */
export async function uploadAllImages(
  images: { index: number; data: string; prompt: string }[]
): Promise<{ urlMap: Map<number, string>; svgIndices: Set<number> }> {
  const urlMap = new Map<number, string>();
  const svgIndices = new Set<number>();

  // raster 이미지만 업로드 대상, SVG는 보존 대상으로 분류
  const rasterImages: typeof images = [];
  for (const img of images) {
    if (!img.data) continue;
    if (isSvgDataUri(img.data)) {
      svgIndices.add(img.index);
      console.info(`[IMG-UPLOAD] IMG_${img.index}: SVG template — 업로드 제외, inline 보존`);
    } else if (img.data.startsWith('data:image')) {
      rasterImages.push(img);
    }
  }

  if (rasterImages.length === 0) {
    console.info(`[IMG-UPLOAD] 업로드 대상 raster 이미지 없음 (SVG ${svgIndices.size}건 보존)`);
    return { urlMap, svgIndices };
  }

  const results = await Promise.allSettled(
    rasterImages.map(async (img) => {
      const url = await uploadBase64Image(img.data, img.index);
      return { index: img.index, url };
    })
  );

  let uploadedCount = 0;
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.url) {
      urlMap.set(result.value.index, result.value.url);
      uploadedCount++;
    }
  }

  console.info(`[IMG-UPLOAD] 완료: raster ${uploadedCount}/${rasterImages.length}장 업로드, SVG ${svgIndices.size}장 보존`);
  return { urlMap, svgIndices };
}

/**
 * HTML 내 base64 이미지를 Supabase Storage URL로 교체
 * SVG template는 교체하지 않고 보존
 */
export function replaceBase64WithUrls(
  html: string,
  urlMap: Map<number, string>
): string {
  if (urlMap.size === 0) return stripLargeBase64FromHtml(html);

  let result = html;
  for (const [index, url] of urlMap) {
    const p1 = new RegExp(
      `(<img[^>]*data-image-index="${index}"[^>]*src=")data:image/[^"]*(")`,'gi'
    );
    result = result.replace(p1, `$1${url}$2`);
    const p2 = new RegExp(
      `(<img[^>]*src=")data:image/[^"]*("[^>]*data-image-index="${index}")`,'gi'
    );
    result = result.replace(p2, `$1${url}$2`);
  }

  result = stripLargeBase64FromHtml(result);
  return result;
}

/**
 * HTML에서 대용량 raster base64만 제거, SVG template는 보존
 *
 * 정책:
 * - data:image/svg+xml → 보존 (template fallback, 수KB 이하)
 * - data:image/png|jpeg|webp|gif (대용량 raster) → placeholder로 교체
 * - blob: URL → placeholder로 교체
 *
 * 이 함수가 SVG template를 지우면 hero 이미지가 사라지므로 절대 건드리지 않는다.
 */
const TRANSPARENT_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
export function stripLargeBase64FromHtml(html: string): string {
  // raster base64만 교체 (png, jpeg, jpg, webp, gif + 100자 이상 = 대용량)
  // SVG data URI는 건드리지 않음
  let result = html.replace(
    /src="data:image\/(?!svg)([\w+.-]+);base64,[A-Za-z0-9+/=]{100,}"/gi,
    `src="${TRANSPARENT_PLACEHOLDER}"`
  );
  // blob URL → placeholder
  result = result.replace(/src="blob:[^"]*"/gi, `src="${TRANSPARENT_PLACEHOLDER}"`);
  return result;
}

// 하위 호환: 기존 코드에서 stripBase64FromHtml을 호출하는 곳이 있을 수 있으므로 alias
export const stripBase64FromHtml = stripLargeBase64FromHtml;

/**
 * blob/base64 URL을 업로드된 URL로 복원
 * SVG template는 업로드 없이 inline data URI로 보존
 */
export async function restoreAndUploadImages(
  html: string,
  generatedImages?: { index: number; data: string; prompt: string }[]
): Promise<string> {
  if (!generatedImages || generatedImages.length === 0) {
    return stripLargeBase64FromHtml(html);
  }

  // 1. 이미지 업로드 (SVG는 자동 제외)
  const { urlMap, svgIndices } = await uploadAllImages(generatedImages);

  // 2. 업로드된 이미지: blob/base64 URL → Supabase public URL 교체
  let restored = html;
  for (const img of generatedImages) {
    const uploadedUrl = urlMap.get(img.index);
    if (!uploadedUrl) continue;

    // blob: URL 교체
    const p1 = new RegExp(
      `(<img[^>]*data-image-index="${img.index}"[^>]*src=")(blob:[^"]*)(")`, 'gi'
    );
    restored = restored.replace(p1, `$1${uploadedUrl}$3`);
    const p2 = new RegExp(
      `(<img[^>]*src=")(blob:[^"]*?)("[^>]*data-image-index="${img.index}")`, 'gi'
    );
    restored = restored.replace(p2, `$1${uploadedUrl}$3`);

    // base64 data: URL 교체
    const p3 = new RegExp(
      `(<img[^>]*data-image-index="${img.index}"[^>]*src=")data:image/[^"]*(")`,'gi'
    );
    restored = restored.replace(p3, `$1${uploadedUrl}$2`);
    const p4 = new RegExp(
      `(<img[^>]*src=")data:image/[^"]*("[^>]*data-image-index="${img.index}")`,'gi'
    );
    restored = restored.replace(p4, `$1${uploadedUrl}$2`);
  }

  // 3. SVG template 이미지: blob URL이 있으면 원본 data URI로 복원
  for (const svgIdx of svgIndices) {
    const svgImg = generatedImages.find(i => i.index === svgIdx);
    if (!svgImg) continue;

    // blob URL → 원본 SVG data URI로 복원
    const bp1 = new RegExp(
      `(<img[^>]*data-image-index="${svgIdx}"[^>]*src=")(blob:[^"]*)(")`, 'gi'
    );
    restored = restored.replace(bp1, `$1${svgImg.data}$3`);
    const bp2 = new RegExp(
      `(<img[^>]*src=")(blob:[^"]*?)("[^>]*data-image-index="${svgIdx}")`, 'gi'
    );
    restored = restored.replace(bp2, `$1${svgImg.data}$3`);
  }

  // 4. 남은 대용량 raster base64/blob만 안전 제거 (SVG 보존)
  restored = stripLargeBase64FromHtml(restored);

  const uploadedCount = urlMap.size;
  const svgCount = svgIndices.size;
  const totalImages = generatedImages.filter(i => i.data?.startsWith('data:')).length;
  console.info(`[IMG-PERSIST] 완료 | raster uploaded=${uploadedCount} | svg preserved=${svgCount} | total=${totalImages} | html=${restored.length}자(${Math.round(restored.length * 2 / 1024)}KB)`);

  return restored;
}
