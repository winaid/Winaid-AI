/**
 * lib/cardDownloadUtils.ts
 *
 * C2b 다운로드 유틸 — 4 형식 (PNG / JPG / ZIP / PDF).
 *
 * 흐름 (모든 형식 공통 1~2 단계):
 *   1) SlidePreview (size='export') DOM 을 html2canvas 로 캡처 → HTMLCanvasElement
 *   2) Canvas → blob (PNG/JPG) 또는 PDF 페이지 추가
 *
 * 다운로드 트리거 (브라우저 only):
 *   - PNG/JPG: 단일 파일 또는 첫 슬라이드 (단일 호출 시)
 *   - ZIP   : 슬라이드 N장 의 PNG 묶음
 *   - PDF   : 슬라이드 N장 의 1:1 페이지 (각 슬라이드 = 한 페이지)
 *
 * 정책:
 *   - 다운로드 대상 DOM 은 off-screen wrapper 에 mount 된 SlidePreview (size='export', 1080×1080).
 *     호출자가 ref 로 DOM 전달.
 *   - PNG 화질 1배 (1080×1080). 더 큰 해상도 (2x) 는 v2 옵션.
 *   - JPG quality 0.92 (시각적 손실 거의 없음).
 *   - 진행률 콜백 (slideIndex, total) — UI 가 spinner 표시.
 *
 * 외부 의존성: html2canvas, jspdf, jszip (package.json 살아있음 확인됨).
 */

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { getRatio, type AspectRatio } from './cardNewsPrompt';

/** html2canvas 옵션 — 외부 이미지(CORS) + scale = 1 (DOM 이 이미 절대 픽셀). */
const H2C_OPTIONS = {
  useCORS: true as const,
  backgroundColor: '#ffffff',
  scale: 1,
  logging: false,
};

export type DownloadFormat = 'png' | 'jpg' | 'zip' | 'pdf';

export interface DownloadOptions {
  /** 다운로드 대상 DOM 배열 — 각 element 가 SlidePreview (size='export'). */
  slideElements: HTMLElement[];
  /** 파일명 prefix (예: 'cardnews-임플란트') */
  filenamePrefix: string;
  /** 진행률 콜백 — 1장 캡처 완료 시마다 호출 */
  onProgress?: (slideIndex: number, total: number) => void;
  /** C2-fix-1e: aspect ratio. PDF 페이지 크기 분기. 미지정 시 '1:1'. */
  ratio?: AspectRatio;
}

/** 단일 slide DOM → canvas → blob. 내부 헬퍼. */
async function captureCanvas(el: HTMLElement): Promise<HTMLCanvasElement> {
  // html2canvas 의 타입 정의가 default export 시그니처라 호출 형태 유지.
  return html2canvas(el, H2C_OPTIONS);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('canvas toBlob 실패'));
        else resolve(blob);
      },
      type,
      quality,
    );
  });
}

/** Browser 다운로드 트리거 — Blob → <a download>. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 약간 지연 후 revoke (Safari 호환)
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── 형식별 export 함수 ──────────────────────────────────────────────────

/** PNG — 슬라이드 N장 개별 다운로드 (브라우저 다운로드 N회). */
export async function downloadAsPNG(opts: DownloadOptions): Promise<void> {
  const { slideElements, filenamePrefix, onProgress } = opts;
  for (let i = 0; i < slideElements.length; i++) {
    const canvas = await captureCanvas(slideElements[i]);
    const blob = await canvasToBlob(canvas, 'image/png');
    triggerDownload(blob, `${filenamePrefix}-${String(i + 1).padStart(2, '0')}.png`);
    onProgress?.(i + 1, slideElements.length);
  }
}

/** JPG — PNG 와 동일 패턴, quality 0.92. */
export async function downloadAsJPG(opts: DownloadOptions): Promise<void> {
  const { slideElements, filenamePrefix, onProgress } = opts;
  for (let i = 0; i < slideElements.length; i++) {
    const canvas = await captureCanvas(slideElements[i]);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    triggerDownload(blob, `${filenamePrefix}-${String(i + 1).padStart(2, '0')}.jpg`);
    onProgress?.(i + 1, slideElements.length);
  }
}

/** ZIP — 슬라이드 N장의 PNG 를 하나의 zip 으로 묶어 단일 다운로드. */
export async function downloadAsZIP(opts: DownloadOptions): Promise<void> {
  const { slideElements, filenamePrefix, onProgress } = opts;
  const zip = new JSZip();
  for (let i = 0; i < slideElements.length; i++) {
    const canvas = await captureCanvas(slideElements[i]);
    const blob = await canvasToBlob(canvas, 'image/png');
    zip.file(`${filenamePrefix}-${String(i + 1).padStart(2, '0')}.png`, blob);
    onProgress?.(i + 1, slideElements.length);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, `${filenamePrefix}.zip`);
}

/** PDF — 슬라이드별 한 페이지 (ratio 에 맞춰 1:1 또는 4:5, 단위 px). */
export async function downloadAsPDF(opts: DownloadOptions): Promise<void> {
  const { slideElements, filenamePrefix, onProgress, ratio } = opts;
  // C2-fix-1e: ratio 에 따라 PDF 페이지 크기 분기. dims 는 SlidePreview export 와 정합.
  const { w, h } = getRatio(ratio).dims;
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: [w, h],
    hotfixes: ['px_scaling'],
  });
  for (let i = 0; i < slideElements.length; i++) {
    const canvas = await captureCanvas(slideElements[i]);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    if (i > 0) pdf.addPage([w, h], 'portrait');
    pdf.addImage(dataUrl, 'JPEG', 0, 0, w, h);
    onProgress?.(i + 1, slideElements.length);
  }
  pdf.save(`${filenamePrefix}.pdf`);
}

/** 통합 dispatcher — UI 에서 format prop 만 받아 호출. */
export async function downloadCardNews(
  format: DownloadFormat,
  opts: DownloadOptions,
): Promise<void> {
  switch (format) {
    case 'png':
      return downloadAsPNG(opts);
    case 'jpg':
      return downloadAsJPG(opts);
    case 'zip':
      return downloadAsZIP(opts);
    case 'pdf':
      return downloadAsPDF(opts);
    default: {
      // 컴파일 타임 exhaustiveness 가드.
      const _exhaustive: never = format;
      throw new Error(`unsupported format: ${String(_exhaustive)}`);
    }
  }
}

/** 파일명 prefix sanitize — 한글/영문/숫자/하이픈 외 제거, 최대 40자. */
export function sanitizeFilename(input: string): string {
  return input
    .replace(/[^\w가-힣\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'cardnews';
}
