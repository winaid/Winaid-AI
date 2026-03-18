// html2canvas용 oklch 색상 제거 함수
// 클론된 Document에서 모든 스타일시트의 oklch를 제거하고 인라인 스타일에 안전한 색상 적용
export const removeOklchFromClonedDoc = (clonedDoc: Document, clonedElement: HTMLElement) => {
  try {
    // 1. 모든 <style> 태그에서 oklch 제거
    const styleTags = clonedDoc.querySelectorAll('style');
    styleTags.forEach(styleTag => {
      if (styleTag.textContent) {
        // oklch(...), oklab(...), color(...) 함수를 안전한 색상으로 대체
        styleTag.textContent = styleTag.textContent
          .replace(/oklch\([^)]+\)/gi, 'transparent')
          .replace(/oklab\([^)]+\)/gi, 'transparent')
          .replace(/color\([^)]+\)/gi, 'transparent');
      }
    });

    // 2. 모든 요소의 인라인 스타일에서 oklch 제거
    const allElements = clonedElement.querySelectorAll('*');
    const processElement = (el: Element) => {
      if (el instanceof HTMLElement && el.style) {
        const styleAttr = el.getAttribute('style');
        if (styleAttr && (styleAttr.includes('oklch') || styleAttr.includes('oklab') || styleAttr.includes('color('))) {
          el.setAttribute('style', styleAttr
            .replace(/oklch\([^)]+\)/gi, 'transparent')
            .replace(/oklab\([^)]+\)/gi, 'transparent')
            .replace(/color\([^)]+\)/gi, 'transparent')
          );
        }
      }
    };

    processElement(clonedElement);
    allElements.forEach(processElement);

    // 3. <link> 스타일시트 제거 (외부 CSS에 oklch가 있을 수 있음)
    const linkTags = clonedDoc.querySelectorAll('link[rel="stylesheet"]');
    linkTags.forEach(link => link.remove());

    // 4. CSS 변수(--*)도 제거 - Tailwind가 여기에 oklch를 넣음
    const rootStyle = clonedDoc.documentElement.style;
    if (rootStyle) {
      // CSS 변수를 모두 제거
      const cssText = rootStyle.cssText;
      if (cssText.includes('oklch') || cssText.includes('oklab')) {
        clonedDoc.documentElement.setAttribute('style', cssText
          .replace(/oklch\([^)]+\)/gi, 'transparent')
          .replace(/oklab\([^)]+\)/gi, 'transparent')
        );
      }
    }

    console.log('✅ oklch 색상 제거 완료');
  } catch (e) {
    console.warn('oklch 제거 중 오류:', e);
  }
};

// AI 수정 프롬프트 템플릿
export const AI_PROMPT_TEMPLATES = [
  { label: '친근하게', prompt: '전체적으로 더 친근하고 따뜻한 톤으로 수정해줘', icon: '💗' },
  { label: 'CTA 강화', prompt: '마지막 부분의 CTA를 더 강력하게 수정해줘. 독자가 행동하고 싶게 만들어줘', icon: '🎯' },
  { label: '전문적으로', prompt: '더 전문적이고 신뢰감 있는 톤으로 수정해줘. 의학 용어도 적절히 사용해줘', icon: '👨‍⚕️' },
  { label: '짧게 요약', prompt: '전체 내용을 20% 정도 줄여서 핵심만 간결하게 정리해줘', icon: '✂️' },
  { label: '예시 추가', prompt: '각 섹션에 독자가 공감할 수 있는 구체적인 예시나 상황을 추가해줘', icon: '📝' },
  { label: 'SEO 강화', prompt: '키워드 밀도를 높이고 소제목을 SEO에 최적화된 형태로 수정해줘', icon: '🔍' },
];

// blob URL → base64 복원: 저장/export 시 HTML 내 blob: URL을 원본 base64로 되돌림
// geminiService, useDocumentExport, ResultPreview(autosave) 등에서 공통 사용
// ⚠️ src가 이미 data: (base64)이면 건드리지 않음 — 이미지 재생성 후 새 이미지 보존
export function restoreBase64Images(
  html: string,
  generatedImages?: { index: number; data: string; prompt: string }[]
): string {
  if (!generatedImages || generatedImages.length === 0) return html;
  let restored = html;
  let restoredCount = 0;
  let skippedCount = 0;
  for (const img of generatedImages) {
    // data-image-index="N" 속성을 가진 img 태그의 src를 base64로 복원
    // src가 data-image-index 뒤에 올 수 있으므로 두 패턴 모두 처리
    // 단, src가 이미 data: (base64)이면 건드리지 않음 (재생성 이미지 보존)
    const p1 = new RegExp(
      `(<img[^>]*data-image-index="${img.index}"[^>]*src=")(blob:[^"]*)(")`, 'gi'
    );
    const before1 = restored;
    restored = restored.replace(p1, `$1${img.data}$3`);
    const p2 = new RegExp(
      `(<img[^>]*src=")(blob:[^"]*?)("[^>]*data-image-index="${img.index}")`, 'gi'
    );
    const before2 = restored;
    restored = restored.replace(p2, `$1${img.data}$3`);
    if (restored !== before1 || restored !== before2) {
      restoredCount++;
    } else {
      skippedCount++;
    }
  }
  if (restoredCount > 0 || skippedCount > 0) {
    console.info(`[IMG_REGEN_SYNC] restoreBase64Images | restored=${restoredCount} | skipped=${skippedCount} (already base64 or no match)`);
  }
  return restored;
}

// 임시저장 키
export const AUTOSAVE_KEY = 'hospitalai_autosave';
export const AUTOSAVE_HISTORY_KEY = 'hospitalai_autosave_history'; // 여러 저장본 관리
export const CARD_PROMPT_HISTORY_KEY = 'hospitalai_card_prompt_history';
export const CARD_REF_IMAGE_KEY = 'hospitalai_card_ref_image'; // 카드뉴스 참고 이미지 고정용

// 자동저장 히스토리 타입
export interface AutoSaveHistoryItem {
  html: string;
  theme: string;
  postType: string;
  imageStyle?: string;
  savedAt: string;
  title: string; // 첫 번째 제목 추출
}

// 카드 프롬프트 히스토리 타입
export interface CardPromptHistoryItem {
  subtitle: string;
  mainTitle: string;
  description: string;
  imagePrompt: string;
  savedAt: string;
}

// HTML에서 제목 추출하는 함수
export const extractTitle = (html: string): string => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // 카드뉴스: .card-main-title 또는 .hidden-title
  const cardTitle = tempDiv.querySelector('.card-main-title, .hidden-title');
  if (cardTitle) return (cardTitle.textContent || '').slice(0, 30) || '카드뉴스';

  // 블로그: h1, h2, .blog-title
  const blogTitle = tempDiv.querySelector('h1, h2, .blog-title');
  if (blogTitle) return (blogTitle.textContent || '').slice(0, 30) || '블로그 글';

  return '저장된 글';
};

// 이미지 URL을 ArrayBuffer로 변환하는 함수
export const fetchImageAsArrayBuffer = async (url: string): Promise<ArrayBuffer | null> => {
  try {
    // base64 데이터인 경우
    if (url.startsWith('data:')) {
      const base64Data = url.split(',')[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }
    // 일반 URL인 경우
    const response = await fetch(url);
    return await response.arrayBuffer();
  } catch (e) {
    console.error('이미지 로드 실패:', e);
    return null;
  }
};

// HTML에서 깨끗한 텍스트 추출 (태그 제거, 정리)
export const cleanText = (text: string | null): string => {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')  // 연속 공백을 하나로
    .replace(/\n+/g, ' ')  // 줄바꿈을 공백으로
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width 문자 제거
    .replace(/[\u0332-\u0338]/g, '') // Combining 밑줄 문자 제거 (̲)
    .replace(/[\u035C-\u0362]/g, '') // 기타 Combining 문자 제거
    .replace(/[^\x20-\x7E\uAC00-\uD7A3\u3131-\u318E\u1100-\u11FF\u3000-\u303F\uFF00-\uFFEF]/g, (char) => {
      // 한글, 영문, 숫자, 기본 특수문자, 한글 자모, CJK 기호 외에는 검사
      const code = char.charCodeAt(0);
      // 이모지 범위 확인 (U+1F300-U+1F9FF, U+2600-U+26FF, U+2700-U+27BF)
      if ((code >= 0x1F300 && code <= 0x1F9FF) ||
          (code >= 0x2600 && code <= 0x26FF) ||
          (code >= 0x2700 && code <= 0x27BF)) {
        return char; // 이모지는 유지
      }
      // 그 외 특수 유니코드는 제거
      return '';
    })
    .trim();
};

// Word 2016 호환을 위한 HTML 변환 함수
export const convertToWordCompatibleHtml = (html: string): string => {
  let result = html;

  // 🎯 0. naver-post-container div 제거 (border 박스 방지!)
  // 컨테이너 div의 border가 워드에서 네모 박스로 나타나는 문제 해결
  result = result.replace(/<div[^>]*class="naver-post-container"[^>]*>/gi, '');
  result = result.replace(/<\/div>\s*$/gi, ''); // 마지막 닫는 태그 제거

  // 🎯 1-1. h2 메인 제목에 밑줄 추가 (Word 2016 호환)
  // 제목 아래 #787fff 색상 밑줄 (테이블로 변환하여 Word 호환성 확보)
  result = result.replace(
    /<h2[^>]*>(.*?)<\/h2>/gi,
    (match, content) => {
      const textContent = content.replace(/<[^>]*>/g, '').trim();
      return `<table style="width: 100%; border-collapse: collapse; margin: 0 0 30px 0; border: none;">
        <tr>
          <td style="padding: 0 0 15px 0; font-size: 32px; font-weight: bold; color: #1a1a1a; font-family: '맑은 고딕', Malgun Gothic, sans-serif; line-height: 1.4; border: none;">${textContent}</td>
        </tr>
        <tr>
          <td style="height: 4px; background-color: #787fff; border: none;"></td>
        </tr>
      </table>`;
    }
  );

  // 🎯 1-2. h3 소제목을 테이블로 변환 (Word 2016에서 border-left 안 먹음)
  // 네이버 블로그에서는 border-left로 보이지만, 워드 복사용으로 테이블 변환
  // ⚠️ 밑줄 없이 왼쪽 세로줄만 표시
  result = result.replace(
    /<h3[^>]*>(.*?)<\/h3>/gi,
    (match, content) => {
      const textContent = content.replace(/<[^>]*>/g, '').trim();
      return `<table style="width: 100%; border-collapse: collapse; margin: 25px 0 15px 0; border: none;">
        <tr>
          <td style="width: 4px; background-color: #787fff; border: none;"></td>
          <td style="padding: 12px 16px; font-size: 18px; font-weight: bold; color: #1e40af; font-family: '맑은 고딕', Malgun Gothic, sans-serif; border: none;">${textContent}</td>
        </tr>
      </table>`;
    }
  );

  // 2. linear-gradient를 단색 배경으로 변환
  result = result.replace(/background:\s*linear-gradient\([^)]+\)/gi, 'background-color: #f8fafc');
  result = result.replace(/background-image:\s*linear-gradient\([^)]+\)/gi, 'background-color: #f8fafc');

  // 3. font-weight: 700/800/900 등을 bold로 통일 (Word 호환성)
  result = result.replace(/font-weight:\s*[6-9]00/gi, 'font-weight: bold');

  // 4. rgba 색상을 hex로 변환 (Word 2016에서 rgba 지원 불안정)
  result = result.replace(/rgba\(0,\s*0,\s*0,\s*0\.1\)/gi, '#e5e5e5');
  result = result.replace(/rgba\(0,\s*0,\s*0,\s*0\.06\)/gi, '#f0f0f0');
  result = result.replace(/rgba\(0,\s*0,\s*0,\s*0\.08\)/gi, '#ebebeb');

  // 5. box-shadow 제거 (Word에서 지원 안 함)
  result = result.replace(/box-shadow:\s*[^;]+;/gi, '');

  // 6. border-radius 제거 (Word 2016에서 지원 안 함 - 네모 박스 문제 원인!)
  result = result.replace(/border-radius:\s*[^;]+;/gi, '');

  // 7. border 속성 완전 제거 (Word 네모 박스 문제 완전 해결!)
  // 테이블 소제목의 border는 background-color로 대체됨
  result = result.replace(/border\s*:\s*[^;]+;/gi, '');
  result = result.replace(/border-top\s*:\s*[^;]+;/gi, '');
  result = result.replace(/border-bottom\s*:\s*[^;]+;/gi, '');
  result = result.replace(/border-left\s*:\s*[^;]+;/gi, '');
  result = result.replace(/border-right\s*:\s*[^;]+;/gi, '');

  // 8. p 태그 박스 문제 해결: background, padding 제거 (Word에서 박스로 보임)
  result = result.replace(/<p([^>]*)style="([^"]*)">/gi, (match, before, style) => {
    const cleanStyle = style
      .replace(/background\s*:[^;]+;?/gi, '')
      .replace(/background-color\s*:[^;]+;?/gi, '')
      .replace(/padding\s*:[^;]+;?/gi, '');
    return `<p${before}style="${cleanStyle}">`;
  });

  // 8. aspect-ratio 제거 (Word에서 지원 안 함)
  result = result.replace(/aspect-ratio:\s*[^;]+;/gi, '');

  // 9. 웹폰트를 시스템 폰트로 변경 (Word 호환)
  result = result.replace(/font-family:\s*[^;]+;/gi, 'font-family: "맑은 고딕", Malgun Gothic, sans-serif;');

  return result;
};

// ── HTML 메트릭스 계산 (글자 수 + 카드 수) ──
// ResultPreview 외부에서 순수 함수로 실행하여 document.createElement를 useEffect 밖으로 격리

export interface HtmlMetrics {
  charCount: number;
  cardCount: number;
}

export function computeHtmlMetrics(html: string, postType: string): HtmlMetrics {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // CSS <style> / <script> 태그 제거
  tempDiv.querySelectorAll('style, script').forEach(el => el.remove());

  // 카드 수 계산
  const cardCount = tempDiv.querySelectorAll('.card-slide').length;

  // 숨겨진 요소 제거
  tempDiv.querySelectorAll('.hidden-title, [style*="display: none"], [style*="display:none"]').forEach(el => el.remove());

  let charCount: number;

  if (postType === 'card_news') {
    // 메타정보 제거
    tempDiv.querySelectorAll('.pill-tag, .card-footer-row, .legal-box-card, .brand-text, .arrow-icon').forEach(el => el.remove());
    // 실제 콘텐츠 텍스트만 추출
    let contentText = '';
    tempDiv.querySelectorAll('.card-subtitle, .card-main-title, .card-desc').forEach(el => {
      contentText += (el.textContent || '') + ' ';
    });
    charCount = contentText.replace(/\s+/g, '').length;
  } else {
    // 해시태그 문단 제거
    tempDiv.querySelectorAll('p').forEach(el => {
      const text = el.textContent || '';
      if ((text.match(/#/g) || []).length >= 2) el.remove();
    });
    // main-title 제거
    tempDiv.querySelectorAll('.main-title').forEach(el => el.remove());
    charCount = (tempDiv.textContent || '')
      .replace(/\[IMG_\d+\]/g, '')
      .replace(/\s+/g, '')
      .trim().length;
  }

  return { charCount, cardCount };
}

// ── 카드뉴스 오버레이/배지 HTML 주입 ──
// contentEditable에 표시되는 카드 HTML에 overlay + badge를 삽입한다.
// 기존 useEffect + document.createElement 패턴을 대체한다.

export function injectCardOverlays(html: string): string {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const cards = tempDiv.querySelectorAll('.card-slide');
  cards.forEach((card, index) => {
    // 이미 오버레이가 있으면 스킵
    if (card.querySelector('.card-overlay')) return;

    // 카드 번호 배지
    const badge = document.createElement('div');
    badge.className = 'card-number-badge';
    badge.textContent = index === 0 ? '표지' : `${index + 1}`;
    card.appendChild(badge);

    // 오버레이
    const overlay = document.createElement('div');
    overlay.className = 'card-overlay';
    overlay.innerHTML = `
      <button class="card-overlay-btn regen" data-index="${index}">🔄 재생성</button>
      <button class="card-overlay-btn download" data-index="${index}">💾 다운로드</button>
    `;
    card.appendChild(overlay);
  });
  return tempDiv.innerHTML;
}
