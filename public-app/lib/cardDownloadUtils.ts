/**
 * 카드뉴스 다운로드/캡처 유틸리티
 * CardNewsProRenderer.tsx + card_news/page.tsx에서 추출.
 */

/**
 * html2canvas로 DOM 노드를 풀사이즈 캡처.
 * 미리보기 영역은 transform:scale()로 축소되어 있으므로,
 * cloneNode로 복제 → transform 제거 → 화면 밖 임시 컨테이너에서 캡처.
 */
export async function captureNodeAsCanvas(
  sourceEl: HTMLElement,
  cardWidth: number,
  cardHeight: number,
): Promise<HTMLCanvasElement> {
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'fixed';
  tempContainer.style.left = '-9999px';
  tempContainer.style.top = '0';
  tempContainer.style.width = `${cardWidth}px`;
  tempContainer.style.height = `${cardHeight}px`;
  tempContainer.style.zIndex = '-1';
  tempContainer.style.pointerEvents = 'none';
  document.body.appendChild(tempContainer);

  const clone = sourceEl.cloneNode(true) as HTMLElement;
  clone.style.transform = 'none';
  clone.style.position = 'static';
  clone.style.width = `${cardWidth}px`;
  clone.style.height = `${cardHeight}px`;
  clone.style.pointerEvents = 'auto';
  tempContainer.appendChild(clone);

  try {
    // 폰트(특히 Google Fonts)가 DOM에 적용될 때까지 대기
    if (typeof document !== 'undefined' && 'fonts' in document) {
      try { await (document as Document & { fonts: { ready: Promise<FontFaceSet> } }).fonts.ready; } catch { /* best-effort */ }
    }
    const html2canvas = (await import('html2canvas')).default;
    return await html2canvas(tempContainer, {
      scale: 2,
      useCORS: true,
      backgroundColor: null,
      width: cardWidth,
      height: cardHeight,
      windowWidth: cardWidth,
      windowHeight: cardHeight,
    });
  } finally {
    document.body.removeChild(tempContainer);
  }
}

/**
 * 모든 카드를 PNG Blob 배열로 캡처 — 카드뉴스 → 쇼츠 변환 전용.
 * 일반 다운로드(PNG/JPG/ZIP/PDF)는 Konva 네이티브 함수 사용.
 */
export async function captureAllSlidesAsBlobs(
  cardRefs: (HTMLElement | null)[],
  slidesCount: number,
  cardWidth: number,
  cardHeight: number,
): Promise<Blob[]> {
  const blobs: Blob[] = [];
  for (let i = 0; i < slidesCount; i++) {
    const sourceEl = cardRefs[i];
    if (!sourceEl) continue;
    const canvas = await captureNodeAsCanvas(sourceEl, cardWidth, cardHeight);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
    if (blob) blobs.push(blob);
  }
  return blobs;
}

/** 이미지 위에 로고를 canvas로 합성 */
export function overlayLogo(baseImageDataUrl: string, logoSrc: string, opacity: number = 1): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(baseImageDataUrl); return; }
    const baseImg = new Image();
    baseImg.crossOrigin = 'anonymous';
    baseImg.onload = () => {
      canvas.width = baseImg.width;
      canvas.height = baseImg.height;
      ctx.drawImage(baseImg, 0, 0);
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.onload = () => {
        const maxW = Math.min(baseImg.width * 0.15, 120);
        const scale = maxW / logoImg.width;
        const w = logoImg.width * scale;
        const h = logoImg.height * scale;
        const x = canvas.width - w - 20;
        const y = 20;
        ctx.globalAlpha = opacity;
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, opacity)})`;
        ctx.beginPath();
        ctx.roundRect(x - 8, y - 8, w + 16, h + 16, 8);
        ctx.fill();
        ctx.drawImage(logoImg, x, y, w, h);
        ctx.globalAlpha = 1; // 복원
        resolve(canvas.toDataURL('image/png'));
      };
      logoImg.onerror = () => resolve(baseImageDataUrl);
      logoImg.src = logoSrc;
    };
    baseImg.onerror = () => resolve(baseImageDataUrl);
    baseImg.src = baseImageDataUrl;
  });
}

// ══════════════════════════════════════════════════════════════
// Konva 네이티브 다운로드 (stage.toDataURL 기반)
// ══════════════════════════════════════════════════════════════

import type Konva from 'konva';

/** Konva Stage를 PNG로 다운로드 */
export function downloadKonvaStageAsPng(
  stage: Konva.Stage | null,
  index: number,
  filename?: string,
): void {
  if (!stage) return;
  const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: 'image/png' });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename || `card-${index + 1}.png`;
  a.click();
}

/** Konva Stage를 JPG로 다운로드 */
export function downloadKonvaStageAsJpg(
  stage: Konva.Stage | null,
  index: number,
  quality: number = 0.92,
  filename?: string,
): void {
  if (!stage) return;
  const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: 'image/jpeg', quality });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename || `card-${index + 1}.jpg`;
  a.click();
}

/** 모든 Konva Stage를 ZIP으로 다운로드 */
export async function downloadKonvaStagesAsZip(
  stages: (Konva.Stage | null)[],
  title?: string,
): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  stages.forEach((stage, i) => {
    if (!stage) return;
    const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: 'image/png' });
    const base64 = dataUrl.split(',')[1];
    zip.file(`${title || 'card'}-${i + 1}.png`, base64, { base64: true });
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${title || 'card-news'}.zip`;
  a.click();
}

/** 모든 Konva Stage를 PDF로 다운로드 */
export async function downloadKonvaStagesAsPdf(
  stages: (Konva.Stage | null)[],
  cardWidth: number,
  cardHeight: number,
  title?: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: cardWidth > cardHeight ? 'landscape' : 'portrait',
    unit: 'px',
    format: [cardWidth, cardHeight],
  });
  stages.forEach((stage, i) => {
    if (!stage) return;
    if (i > 0) pdf.addPage([cardWidth, cardHeight]);
    const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: 'image/png' });
    pdf.addImage(dataUrl, 'PNG', 0, 0, cardWidth, cardHeight);
  });
  pdf.save(`${title || 'card-news'}.pdf`);
}
