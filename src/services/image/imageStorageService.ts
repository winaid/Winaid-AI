/**
 * Image Storage Service
 * base64 이미지를 Supabase Storage에 업로드하고 public URL 반환
 * persisted content에서 base64 제거 → URL/assetId만 저장
 */

import { supabase } from '../../lib/supabase';

const BUCKET_NAME = 'blog-images';

// base64 data URI → Uint8Array + mime type 파싱
// 주의: image/svg+xml 같은 MIME 타입도 지원해야 함 (\w+만으로는 '+'를 매칭 못함)
function parseBase64DataUri(dataUri: string): { bytes: Uint8Array; mimeType: string; ext: string } | null {
  const match = dataUri.match(/^data:(image\/([\w+.-]+));base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1];
  const rawExt = match[2];
  // svg+xml → svg, jpeg → jpg, 나머지 그대로
  const ext = rawExt === 'svg+xml' ? 'svg' : rawExt === 'jpeg' ? 'jpg' : rawExt;
  const base64 = match[3];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { bytes, mimeType, ext };
}

// 고유 경로 생성: {timestamp}_{random}/{index}.{ext}
function generatePath(imageIndex: number, ext: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return `posts/${ts}_${rand}/img_${imageIndex}.${ext}`;
}

/**
 * 이미지 데이터를 정규화하여 업로드 가능한 data URI로 변환
 * - data:image/...;base64,... → 그대로 사용
 * - raw base64 (data: prefix 없음) → data:image/png;base64, 붙여서 정규화
 * - blob: URL → 업로드 불가, null 반환
 * - http/https URL → 이미 원격, 업로드 불필요, null 반환
 * - null/empty → null 반환
 */
function normalizeImageData(data: string | null | undefined, imageIndex: number): string | null {
  if (!data || data.length === 0) {
    console.warn(`[IMG-NORMALIZE] IMG_${imageIndex}: empty data`);
    return null;
  }

  // 이미 정상 data URI
  if (data.startsWith('data:image/')) return data;

  // blob URL — 브라우저 전용, 서버 업로드 불가
  if (data.startsWith('blob:')) {
    console.warn(`[IMG-NORMALIZE] IMG_${imageIndex}: blob URL cannot be uploaded, skipping`);
    return null;
  }

  // 이미 원격 URL — 업로드 불필요
  if (data.startsWith('http://') || data.startsWith('https://')) {
    console.info(`[IMG-NORMALIZE] IMG_${imageIndex}: already a remote URL, skipping upload`);
    return null;
  }

  // raw base64 (data: prefix 없음) — PNG로 가정하여 data URI 생성
  if (/^[A-Za-z0-9+/]/.test(data) && data.length > 100) {
    console.info(`[IMG-NORMALIZE] IMG_${imageIndex}: raw base64 detected, wrapping as data:image/png`);
    return `data:image/png;base64,${data}`;
  }

  console.warn(`[IMG-NORMALIZE] IMG_${imageIndex}: unrecognized format (${data.substring(0, 50)}...)`);
  return null;
}

/**
 * base64 이미지 1장을 Supabase Storage에 업로드
 * @returns public URL or null (실패 시)
 */
export async function uploadBase64Image(
  dataUri: string,
  imageIndex: number
): Promise<string | null> {
  try {
    // 입력 데이터 정규화
    const normalized = normalizeImageData(dataUri, imageIndex);
    if (!normalized) return null;

    const parsed = parseBase64DataUri(normalized);
    if (!parsed) {
      console.warn(`[IMG-UPLOAD] IMG_${imageIndex}: invalid data URI format after normalize (${normalized.substring(0, 60)}...)`);
      return null;
    }

    const path = generatePath(imageIndex, parsed.ext);

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, parsed.bytes, {
        contentType: parsed.mimeType,
        cacheControl: '31536000', // 1년 (immutable content)
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
 * @returns 업로드 결과 배열 (index → URL mapping)
 */
export async function uploadAllImages(
  images: { index: number; data: string; prompt: string }[]
): Promise<Map<number, string>> {
  const urlMap = new Map<number, string>();

  // base64 이미지만 필터
  const base64Images = images.filter(img =>
    img.data && img.data.startsWith('data:image')
  );

  if (base64Images.length === 0) return urlMap;

  const results = await Promise.allSettled(
    base64Images.map(async (img) => {
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

  console.info(`[IMG-UPLOAD] 완료: ${uploadedCount}/${base64Images.length}장 업로드 성공`);
  return urlMap;
}

/**
 * HTML 내 base64 이미지를 Supabase Storage URL로 교체
 * upload 실패한 이미지는 src="" 처리 (빈 이미지)
 */
export function replaceBase64WithUrls(
  html: string,
  urlMap: Map<number, string>
): string {
  if (urlMap.size === 0) return stripBase64FromHtml(html);

  let result = html;
  for (const [index, url] of urlMap) {
    // data-image-index="N" 속성을 가진 img 태그의 src를 URL로 교체
    const p1 = new RegExp(
      `(<img[^>]*data-image-index="${index}"[^>]*src=")data:image/[^"]*(")`,'gi'
    );
    result = result.replace(p1, `$1${url}$2`);
    const p2 = new RegExp(
      `(<img[^>]*src=")data:image/[^"]*("[^>]*data-image-index="${index}")`,'gi'
    );
    result = result.replace(p2, `$1${url}$2`);
  }

  // 업로드 실패한 나머지 base64도 제거
  result = stripBase64FromHtml(result);
  return result;
}

/**
 * HTML에서 모든 base64 이미지 src를 빈 문자열로 대체 (안전망)
 * persisted content에 base64가 남지 않도록 보장
 */
export function stripBase64FromHtml(html: string): string {
  return html.replace(/src="data:image\/[^"]*"/gi, 'src=""');
}

/**
 * blob: URL을 업로드된 URL로 복원 (restoreBase64Images 대체)
 * generatedImages 배열에서 각 이미지를 업로드하고, HTML 내 blob: URL을 public URL로 교체
 */
export async function restoreAndUploadImages(
  html: string,
  generatedImages?: { index: number; data: string; prompt: string }[]
): Promise<string> {
  if (!generatedImages || generatedImages.length === 0) {
    return stripBase64FromHtml(html);
  }

  // 1. 모든 이미지를 Supabase Storage에 업로드
  const urlMap = await uploadAllImages(generatedImages);

  // 2. blob: URL → uploaded URL로 교체
  let restored = html;
  for (const img of generatedImages) {
    const uploadedUrl = urlMap.get(img.index);
    if (!uploadedUrl) continue;

    // blob: URL 패턴 교체
    const p1 = new RegExp(
      `(<img[^>]*data-image-index="${img.index}"[^>]*src=")(blob:[^"]*)(")`, 'gi'
    );
    restored = restored.replace(p1, `$1${uploadedUrl}$3`);
    const p2 = new RegExp(
      `(<img[^>]*src=")(blob:[^"]*?)("[^>]*data-image-index="${img.index}")`, 'gi'
    );
    restored = restored.replace(p2, `$1${uploadedUrl}$3`);

    // base64 data: URL 패턴도 교체 (재생성 후 base64가 직접 들어간 경우)
    const p3 = new RegExp(
      `(<img[^>]*data-image-index="${img.index}"[^>]*src=")data:image/[^"]*(")`,'gi'
    );
    restored = restored.replace(p3, `$1${uploadedUrl}$2`);
    const p4 = new RegExp(
      `(<img[^>]*src=")data:image/[^"]*("[^>]*data-image-index="${img.index}")`,'gi'
    );
    restored = restored.replace(p4, `$1${uploadedUrl}$2`);
  }

  // 3. 남은 base64 안전 제거
  restored = stripBase64FromHtml(restored);

  const uploadedCount = urlMap.size;
  const totalImages = generatedImages.filter(i => i.data?.startsWith('data:')).length;
  console.info(`[IMG-PERSIST] blob/base64 → URL 변환 완료 | uploaded=${uploadedCount}/${totalImages} | html=${restored.length}자(${Math.round(restored.length * 2 / 1024)}KB)`);

  return restored;
}
