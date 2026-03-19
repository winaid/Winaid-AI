/**
 * Result Assembler — HTML 변환 파이프라인
 *
 * 구 geminiService.generateFullPost()에서 추출된 결과 조립 로직 (현재 독립 모듈).
 * 생성된 텍스트 + 이미지를 최종 HTML로 변환하는 순수 변환 함수들.
 */

import type { PostType } from "../types";
import { insertBlogImageMarkers } from "../core/generation/blogImagePlanner";

// ── 상수 ──

export const MEDICAL_DISCLAIMER = `본 콘텐츠는 의료 정보 제공 및 병원 광고를 목적으로 합니다.<br/>개인의 체질과 건강 상태에 따라 치료 결과는 차이가 있을 수 있으며, 부작용이 발생할 수 있습니다.`;

const BLOG_STYLES = `
<style>
.naver-post-container {
  font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
  line-height: 1.8;
  color: #333;
}
.naver-post-container .main-title {
  font-size: 28px;
  font-weight: 800;
  color: #1a1a1a;
  margin: 0 0 30px 0;
  line-height: 1.4;
  word-break: keep-all;
}
.naver-post-container h3 {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 40px 0 20px 0;
  padding-bottom: 10px;
  border-bottom: 2px solid #7c3aed;
  line-height: 1.5;
  word-break: keep-all;
}
.naver-post-container p {
  font-size: 16px;
  color: #444;
  margin: 0 0 20px 0;
  line-height: 1.8;
  word-break: keep-all;
}
.naver-post-container ul {
  margin: 20px 0;
  padding-left: 24px;
}
.naver-post-container li {
  font-size: 16px;
  color: #444;
  margin: 10px 0;
  line-height: 1.7;
}
.naver-post-container strong {
  font-weight: 700;
  color: #1a1a1a;
}
.content-image-wrapper {
  margin: 30px 0;
  text-align: center;
}
.legal-box-card {
  margin-top: 40px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  font-size: 14px;
  color: #666;
  line-height: 1.6;
}
</style>
`;

// ── 이미지 타입 (최소 인터페이스) ──

export interface AssemblyImage {
  index: number;
  data?: string;  // base64 data URI
  prompt: string;
}

// ── Block 3: 마크다운/JSON 안전망 ──

export function cleanMarkdownArtifacts(body: string): string {
  // ** 마크다운 볼드 제거
  let result = body.replace(/\*\*([^*]+)\*\*/g, '$1');

  // JSON 응답 복구
  if (result && (result.startsWith('[{') || result.startsWith('{"'))) {
    console.error('AI returned JSON instead of HTML, attempting to extract...');
    try {
      const parsed = JSON.parse(result);
      if (Array.isArray(parsed)) {
        result = parsed.map((item: any) => item.content || item.html || '').join('');
      } else if (parsed.content || parsed.html) {
        result = parsed.content || parsed.html;
      }
    } catch (e) {
      console.error('Failed to parse JSON content:', e);
    }
  }

  return result;
}

// ── Block 4: 컨테이너 래핑 ──

export function ensureContainerWrapper(body: string, postType: PostType): string {
  if (postType !== 'card_news' && !body.includes('class="naver-post-container"')) {
    return `<div class="naver-post-container">${body}</div>`;
  }
  return body;
}

// ── Block 4b: 카드뉴스 폴백 템플릿 ──

export function generateCardNewsFallbackTemplate(
  body: string,
  slideCount: number,
  topic: string,
): string {
  if (body.includes('class="card-slide"')) return body;

  console.warn('AI ignored card-slide structure, generating fallback template...');
  const fallbackSlides: string[] = [];

  const plainText = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const sentences = plainText.split(/[.!?。]/).filter((s: string) => s.trim().length > 5);

  for (let i = 0; i < slideCount; i++) {
    const isFirst = i === 0;
    const isLast = i === slideCount - 1;
    const sentenceIdx = Math.min(i, sentences.length - 1);
    const sentence = sentences[sentenceIdx] || topic;

    const subtitle = isFirst ? '알아봅시다' : isLast ? '함께 실천합니다' : `포인트 ${i}`;
    const mainTitle = isFirst
      ? `${topic}<br/><span class="card-highlight">총정리</span>`
      : isLast
        ? `건강한 습관<br/><span class="card-highlight">시작합니다</span>`
        : sentence.slice(0, 15) + (sentence.length > 15 ? '...' : '');
    const desc = sentence.slice(0, 50) || '건강한 생활을 위한 정보를 확인하세요.';

    fallbackSlides.push(`
      <div class="card-slide" style="background: linear-gradient(180deg, #E8F4FD 0%, #F0F9FF 100%); border-radius: 24px; overflow: hidden;">
        <div style="padding: 32px 28px; display: flex; flex-direction: column; align-items: center; text-align: center; height: 100%;">
          <p class="card-subtitle" style="font-size: 14px; font-weight: 700; color: #3B82F6; margin-bottom: 8px;">${subtitle}</p>
          <p class="card-main-title" style="font-size: 28px; font-weight: 900; color: #1E293B; line-height: 1.3; margin: 0 0 16px 0;">${mainTitle}</p>
          <div class="card-img-container" style="width: 100%; margin: 16px 0;">[IMG_${i + 1}]</div>
          <p class="card-desc" style="font-size: 15px; color: #475569; line-height: 1.6; font-weight: 500; max-width: 90%;">${desc}</p>
        </div>
      </div>
    `);
  }
  return fallbackSlides.join('\n');
}

// ── Block 5: 소제목 정규화 ──

export function normalizeSubtitles(body: string): string {
  let result = body;
  result = result.replace(/<p>\*\*([^*]+)\*\*<\/p>/gi, '<h3>$1</h3>');
  result = result.replace(/<p>##\s*([^<]+)<\/p>/gi, '<h3>$1</h3>');
  result = result.replace(/<p>\s*<strong>([^<]+)<\/strong>\s*<\/p>/gi, '<h3>$1</h3>');
  result = result.replace(/<p>\s*<b>([^<]+)<\/b>\s*<\/p>/gi, '<h3>$1</h3>');

  const h3Count = (result.match(/<h3[^>]*>/gi) || []).length;
  console.info(`✅ 소제목 형식 정규화 완료! h3 태그 ${h3Count}개 발견`);
  return result;
}

// ── Block 6: 이미지 마커 자동 삽입 ──

export function insertImageMarkers(
  body: string,
  imageCount: number,
  postType: PostType,
): string {
  let result = body;

  // 블로그: [IMG_N] 마커 없으면 자동 삽입 (blogImagePlanner 범용 정책 위임)
  if (postType !== 'card_news' && imageCount > 0 && !result.includes('[IMG_')) {
    console.log('⚠️ 블로그에 [IMG_N] 마커가 없음! 자동 삽입 중...');
    result = insertBlogImageMarkers(result, imageCount);
  }

  // 카드뉴스: [IMG_N] 마커 없으면 자동 삽입
  if (postType === 'card_news' && imageCount > 0) {
    const cardSlides = result.match(/<div[^>]*class="[^"]*card-slide[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi) || [];

    if (cardSlides.length > 0 && !result.includes('[IMG_')) {
      console.log('⚠️ 카드뉴스에 [IMG_N] 마커가 없음! 자동 삽입 중...');
      let imgIndex = 1;
      result = result.replace(
        /(<div[^>]*class="[^"]*card-slide[^"]*"[^>]*>)([\s\S]*?)(<\/div>\s*<\/div>)/gi,
        (match: string, openTag: string, content: string, closeTag: string) => {
          if (content.includes('[IMG_') || content.includes('<img')) return match;
          const markerHtml = `<div class="card-img-container" style="width: 100%; margin: 16px 0; flex: 1; display: flex; align-items: center; justify-content: center;">[IMG_${imgIndex}]</div>`;
          imgIndex++;
          if (content.includes('card-desc')) {
            return openTag + content.replace(
              /(<p[^>]*class="[^"]*card-desc[^"]*")/i,
              markerHtml + '$1'
            ) + closeTag;
          }
          return openTag + content + markerHtml + closeTag;
        }
      );
      console.log(`✅ [IMG_1] ~ [IMG_${imgIndex - 1}] 마커 자동 삽입 완료`);
    }
  }

  // 블로그 마커 수량 보장
  if (postType !== 'card_news' && imageCount > 0) {
    const existingMarkers = (result.match(/\[IMG_\d+\]/gi) || []).map(m => {
      const num = m.match(/\d+/);
      return num ? parseInt(num[0]) : 0;
    });
    const allIndices = Array.from({ length: imageCount }, (_, i) => i + 1);
    const missingIndices = allIndices.filter(idx => !existingMarkers.includes(idx));

    if (missingIndices.length > 0) {
      console.warn(`[IMG-INSERT] ⚠️ 마커 부족: ${missingIndices.length}개 누락 — 본문 끝에 보충`);
      let supplementMarkers = '';
      for (const idx of missingIndices) {
        supplementMarkers += `\n<div class="content-image-wrapper">[IMG_${idx}]</div>\n`;
      }
      if (result.includes('</div>')) {
        const lastDivIdx = result.lastIndexOf('</div>');
        result = result.substring(0, lastDivIdx) + supplementMarkers + result.substring(lastDivIdx);
      } else {
        result += supplementMarkers;
      }
    }
  }

  return result;
}

// ── Block 7: 이미지 데이터 삽입 (base64→blob 변환 포함) ──

export function insertImageData(
  body: string,
  images: AssemblyImage[],
  postType: PostType,
  selectedImageCount: number,
): { html: string; blobUrls: string[] } {
  let result = body;
  const blobUrls: string[] = [];

  console.info(`[IMG_INSERT] 이미지 삽입 전 body: ${result.length}자, 이미지 ${images.length}장`);

  images.forEach(img => {
    const pattern = new RegExp(`\\[IMG_${img.index}\\]`, "gi");

    if (img.data) {
      let displaySrc = img.data;
      try {
        const commaIdx = img.data.indexOf(',');
        if (commaIdx > 0 && img.data.startsWith('data:')) {
          const meta = img.data.substring(0, commaIdx);
          const base64Data = img.data.substring(commaIdx + 1);
          const mimeMatch = meta.match(/data:(.*?);base64/);
          const mimeType = mimeMatch?.[1] || 'image/png';
          const byteChars = atob(base64Data);
          const byteArray = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            byteArray[i] = byteChars.charCodeAt(i);
          }
          const blob = new Blob([byteArray], { type: mimeType });
          displaySrc = URL.createObjectURL(blob);
          blobUrls.push(displaySrc);
          console.info(`[IMG_INSERT] IMG_${img.index}: base64 ${img.data.length}자 → blob URL`);
        }
      } catch (blobErr) {
        console.warn(`[IMG_INSERT] IMG_${img.index}: blob 변환 실패, base64 원본 사용`, blobErr);
        displaySrc = img.data;
      }

      let imgHtml = "";
      if (postType === 'card_news') {
        imgHtml = `<img src="${displaySrc}" alt="${img.prompt}" data-image-index="${img.index}" class="card-full-img" style="width: 100%; height: auto; display: block;" />`;
      } else {
        imgHtml = `<div class="content-image-wrapper"><img src="${displaySrc}" alt="${img.prompt}" data-image-index="${img.index}" /></div>`;
      }
      result = result.replace(pattern, imgHtml);
    } else {
      result = result.replace(pattern, '');
    }
  });

  // 삽입 결과 검증
  const insertedCount = images.filter(img => img.data && result.includes(`data-image-index="${img.index}"`)).length;
  const skippedByLayout = images.length - insertedCount;
  console.info(`[IMG-INSERT] selected=${selectedImageCount} available=${images.length} inserted=${insertedCount} skippedByLayout=${skippedByLayout}`);
  if (insertedCount < selectedImageCount && images.length >= selectedImageCount) {
    console.warn(`[IMG-INSERT] ⚠️ 삽입 부족: selected=${selectedImageCount} inserted=${insertedCount}`);
  }

  // 미매칭 마커 제거
  const remainingMarkers = (result.match(/\[IMG_\d+\]/gi) || []).length;
  if (remainingMarkers > 0) {
    console.warn(`[IMG-INSERT] ⚠️ 미매칭 마커 ${remainingMarkers}개 제거`);
  }
  result = result.replace(/\[IMG_\d+\]/gi, '');

  return { html: result, blobUrls };
}

// ── Block 8: 카드뉴스 스타일 적용 ──

export function applyCardNewsStyles(
  body: string,
  analyzedStyle?: { backgroundColor?: string },
): string {
  if (!analyzedStyle?.backgroundColor) return body;

  const bgColor = analyzedStyle.backgroundColor;
  const bgGradient = bgColor.includes('gradient') ? bgColor : `linear-gradient(180deg, ${bgColor} 0%, ${bgColor}dd 100%)`;

  let result = body;
  // 기존 background 교체
  result = result.replace(
    /(<div[^>]*class="[^"]*card-slide[^"]*"[^>]*style="[^"]*)background:[^;]*;?/gi,
    `$1background: ${bgGradient};`
  );
  // background 없는 card-slide에 추가
  result = result.replace(
    /<div([^>]*)class="([^"]*card-slide[^"]*)"([^>]*)>/gi,
    (match: string, pre: string, cls: string, post: string) => {
      if (match.includes('style="')) {
        if (!match.includes('background:')) {
          return match.replace('style="', `style="background: ${bgGradient}; `);
        }
        return match;
      } else {
        return `<div${pre}class="${cls}"${post} style="background: ${bgGradient};">`;
      }
    }
  );
  return result;
}

// ── Block 9: 최종 HTML 래핑 ──

export function wrapFinalHtml(
  body: string,
  opts: {
    postType: PostType;
    topic: string;
    title: string;
  },
): string {
  if (opts.postType === 'card_news') {
    return `
    <div class="card-news-container">
       <h2 class="hidden-title">${opts.title}</h2>
       <div class="card-grid-wrapper">
          ${body}
       </div>
       <div class="legal-box-card">${MEDICAL_DISCLAIMER}</div>
    </div>
    `.trim();
  }

  // 블로그
  const mainTitle = opts.topic || opts.title;
  let finalHtml: string;

  const hasMainTitle = body.includes('class="main-title"') || body.includes("class='main-title'");

  if (hasMainTitle) {
    finalHtml = body.includes('class="naver-post-container"')
      ? body
      : `<div class="naver-post-container">${body}</div>`;
  } else {
    if (body.includes('class="naver-post-container"')) {
      finalHtml = body.replace(
        '<div class="naver-post-container">',
        `<div class="naver-post-container"><h2 class="main-title">${mainTitle}</h2>`
      );
    } else {
      finalHtml = `<div class="naver-post-container"><h2 class="main-title">${mainTitle}</h2>${body}</div>`;
    }
  }

  return BLOG_STYLES + finalHtml;
}
