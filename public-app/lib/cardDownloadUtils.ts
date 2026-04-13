/**
 * 카드뉴스 다운로드/캡처 유틸리티 — Konva 네이티브 기반.
 */

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

/**
 * 모든 Konva Stage를 풀사이즈 PNG Blob 배열로 캡처 — 쇼츠 변환 전용.
 * - Stage는 스케일된 displayWidth로 마운트되어 있으므로 pixelRatio로 보정.
 * - 결과는 1080×1080(또는 cardWidth×cardHeight) PNG.
 * - 하나라도 null이면 에러 throw — 호출부에서 사용자 안내 후 중단.
 */
export async function captureAllKonvaStagesAsBlobs(
  stages: (Konva.Stage | null)[],
  cardWidth: number,
  cardHeight: number,
): Promise<Blob[]> {
  // 폰트 로드 대기 (Konva Text 는 document.fonts에서 해석)
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try { await (document as Document & { fonts: { ready: Promise<FontFaceSet> } }).fonts.ready; } catch { /* best-effort */ }
  }

  const blobs: Blob[] = [];
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    if (!stage) {
      throw new Error(`쇼츠 캡처 실패 — 슬라이드 ${i + 1}의 Konva Stage가 준비되지 않았습니다.`);
    }
    // 표시 크기 기준으로 pixelRatio 계산 → cardWidth 해상도 PNG 보장
    const stageW = stage.width();
    const pixelRatio = stageW > 0 ? cardWidth / stageW : 1;
    const dataUrl = stage.toDataURL({ pixelRatio, mimeType: 'image/png' });

    // dataURL → Blob 변환
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    blobs.push(blob);

    // 개발 모드에서 첫 프레임 해상도 검증
    if (i === 0 && process.env.NODE_ENV !== 'production') {
      const img = await new Promise<HTMLImageElement>((resolve) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => resolve(el);
        el.src = dataUrl;
      });
      // eslint-disable-next-line no-console
      console.log(`[shorts] first frame: ${img.naturalWidth}x${img.naturalHeight} (expected ${cardWidth}x${cardHeight})`);
    }
  }
  return blobs;
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
