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

/** 단일 카드를 PNG로 다운로드 */
export async function downloadCardAsPng(
  sourceEl: HTMLElement | null,
  index: number,
  cardWidth: number,
  cardHeight: number,
): Promise<void> {
  if (!sourceEl) return;
  const canvas = await captureNodeAsCanvas(sourceEl, cardWidth, cardHeight);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `card_${index + 1}.png`;
  a.click();
}

/**
 * 모든 카드를 PNG Blob 배열로 캡처 — ZIP 다운로드와 동일한 패턴이지만
 * 파일 시스템에 떨어뜨리지 않고 메모리에 모음. 카드뉴스 → 쇼츠 변환에서
 * FormData에 multipart로 올릴 때 사용.
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

/** 모든 카드를 ZIP으로 다운로드 */
export async function downloadAllAsZip(
  cardRefs: (HTMLElement | null)[],
  slidesCount: number,
  cardWidth: number,
  cardHeight: number,
  topic?: string,
): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (let i = 0; i < slidesCount; i++) {
    const sourceEl = cardRefs[i];
    if (!sourceEl) continue;
    const canvas = await captureNodeAsCanvas(sourceEl, cardWidth, cardHeight);
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b as Blob), 'image/png');
    });
    zip.file(`card_${i + 1}.png`, blob);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(zipBlob);
  const safeTopic = topic ? topic.replace(/[^가-힣a-zA-Z0-9]/g, '_').slice(0, 20) : '';
  a.download = safeTopic ? `카드뉴스_${safeTopic}.zip` : `cardnews_${Date.now()}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 단일 카드를 JPG로 다운로드 (용량 작음, 투명도 없음) */
export async function downloadCardAsJpg(
  sourceEl: HTMLElement | null,
  index: number,
  cardWidth: number,
  cardHeight: number,
  quality: number = 0.9,
): Promise<void> {
  if (!sourceEl) return;
  const canvas = await captureNodeAsCanvas(sourceEl, cardWidth, cardHeight);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/jpeg', quality);
  a.download = `card_${index + 1}.jpg`;
  a.click();
}

/** 모든 카드를 PDF 한 파일로 다운로드 (JPEG 90% 품질) */
export async function downloadAllAsPdf(
  cardRefs: (HTMLElement | null)[],
  slidesCount: number,
  cardWidth: number,
  cardHeight: number,
  topic?: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf');

  // 카드 비율에 맞는 페이지 방향 자동 결정
  const orientation: 'portrait' | 'landscape' = cardWidth > cardHeight ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [cardWidth, cardHeight],
    compress: true,
  });

  let firstPage = true;
  for (let i = 0; i < slidesCount; i++) {
    const sourceEl = cardRefs[i];
    if (!sourceEl) continue;

    if (!firstPage) pdf.addPage([cardWidth, cardHeight], orientation);
    firstPage = false;

    const canvas = await captureNodeAsCanvas(sourceEl, cardWidth, cardHeight);
    const imgData = canvas.toDataURL('image/jpeg', 0.9);
    pdf.addImage(imgData, 'JPEG', 0, 0, cardWidth, cardHeight);
  }

  const safeTopic = topic ? topic.replace(/[^가-힣a-zA-Z0-9]/g, '_').slice(0, 20) : '';
  pdf.save(safeTopic ? `카드뉴스_${safeTopic}.pdf` : `cardnews_${Date.now()}.pdf`);
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
