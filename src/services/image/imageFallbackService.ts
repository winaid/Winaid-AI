/**
 * Image Fallback Service — 스타일 인식 보조 비주얼
 *
 * AI 이미지 생성 실패 시 "보조 비주얼 모드"로 전환.
 *
 * ── 스타일 계약 준수 ──
 * medical: 임상 팔레트(blue-white-teal) + 추상 의학 도형 + 텍스트/이모지 없음
 * photo/illustration: 기존 그라디언트 + 키워드 카드 (CTA 제거)
 *
 * "실패 대체물"이 아닌 "세트에서 튀지 않는 비주얼"이 목적.
 */

import type { ImageRole } from './imageTypes';
import { getStyleContract } from './imagePromptBuilder';

// ── generic 그라디언트 팔레트 (photo/illustration/custom용) ──
const GENERIC_GRADIENTS: [string, string][] = [
  ['#667eea', '#764ba2'], // purple-violet
  ['#4facfe', '#00f2fe'], // blue-cyan
  ['#43e97b', '#38f9d7'], // green-teal
  ['#a18cd1', '#fbc2eb'], // lavender-pink
];

/**
 * medical 전용 SVG: 임상 팔레트 + 추상 의학 도형
 * - emoji 없음
 * - 텍스트 없음
 * - CTA 없음
 * - blue-white-teal 계열만 사용
 * - 세트에서 가능한 한 덜 튀도록 설계
 */
function buildMedicalFallbackSvg(promptText: string, role: ImageRole): string {
  const contract = getStyleContract('medical');
  const { primary, secondary, accent } = contract.fallbackPalette;
  const w = 1280;
  const h = 720;

  // 프롬프트 해시로 도형 위치/크기 변동 (매번 같은 그림이 아니도록)
  const hash = promptText.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const seed = (n: number) => ((hash * 7 + n * 13) % 100) / 100;

  const cx1 = 300 + seed(1) * 200;
  const cy1 = 200 + seed(2) * 100;
  const cx2 = 700 + seed(3) * 250;
  const cy2 = 350 + seed(4) * 150;
  const cx3 = 500 + seed(5) * 200;
  const cy3 = 500 + seed(6) * 100;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${primary}"/>
      <stop offset="100%" style="stop-color:${secondary}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:${accent};stop-opacity:0.3"/>
      <stop offset="100%" style="stop-color:${accent};stop-opacity:0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:rgba(255,255,255,0.15)"/>
      <stop offset="100%" style="stop-color:rgba(255,255,255,0)"/>
    </radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="40"/></filter>
    <filter id="blur2"><feGaussianBlur stdDeviation="20"/></filter>
  </defs>
  <rect fill="url(#bg)" width="${w}" height="${h}"/>
  <!-- abstract clinical shapes — no text, no emoji, no icon -->
  <ellipse cx="${cx1}" cy="${cy1}" rx="180" ry="120" fill="url(#glow1)" filter="url(#blur)"/>
  <ellipse cx="${cx2}" cy="${cy2}" rx="140" ry="100" fill="url(#glow2)" filter="url(#blur)"/>
  <circle cx="${cx3}" cy="${cy3}" r="90" fill="rgba(61,194,236,0.12)" filter="url(#blur2)"/>
  <!-- thin clinical grid lines -->
  <line x1="0" y1="${h * 0.3}" x2="${w}" y2="${h * 0.3}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
  <line x1="0" y1="${h * 0.6}" x2="${w}" y2="${h * 0.6}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
  <line x1="${w * 0.35}" y1="0" x2="${w * 0.35}" y2="${h}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
  <line x1="${w * 0.65}" y1="0" x2="${w * 0.65}" y2="${h}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
  <!-- subtle cross shape (medical motif, not a red cross) -->
  <rect x="${w / 2 - 3}" y="${h / 2 - 40}" width="6" height="80" rx="3" fill="rgba(255,255,255,0.06)"/>
  <rect x="${w / 2 - 40}" y="${h / 2 - 3}" width="80" height="6" rx="3" fill="rgba(255,255,255,0.06)"/>
</svg>`;
}

/**
 * generic SVG: photo/illustration/custom용 (CTA 텍스트 제거, 키워드만 표시)
 */
function buildGenericFallbackSvg(
  promptText: string,
  style: string,
  role: ImageRole,
): string {
  const koreanWords = promptText.match(/[\uAC00-\uD7A3]{2,}/g) || [];
  const keywords = koreanWords.slice(0, 3).join(' · ') || '건강 정보';

  const hash = promptText.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const [c1, c2] = GENERIC_GRADIENTS[hash % GENERIC_GRADIENTS.length];

  const w = 1280;
  const h = 720;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${c1}"/>
      <stop offset="100%" style="stop-color:${c2}"/>
    </linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="60"/></filter>
  </defs>
  <rect fill="url(#bg)" width="${w}" height="${h}" rx="0"/>
  <circle cx="${w * 0.7}" cy="${h * 0.3}" r="200" fill="rgba(255,255,255,0.08)" filter="url(#blur)"/>
  <circle cx="${w * 0.3}" cy="${h * 0.7}" r="160" fill="rgba(255,255,255,0.06)" filter="url(#blur)"/>
  <rect fill="rgba(255,255,255,0.12)" x="60" y="60" width="${w - 120}" height="${h - 120}" rx="24"/>
  <text x="${w / 2}" y="${h / 2 - 10}" text-anchor="middle" font-family="Apple SD Gothic Neo,Noto Sans KR,sans-serif" font-size="26" fill="rgba(255,255,255,0.75)" font-weight="600">${keywords}</text>
</svg>`;
}

/**
 * SVG 기반 보조 비주얼 생성 (raw SVG 문자열)
 * 스타일별로 분기하여 세트 톤을 유지한다.
 */
export function buildTemplateFallbackSvg(
  promptText: string,
  style: string,
  role: ImageRole,
): string {
  if (style === 'medical') {
    return buildMedicalFallbackSvg(promptText, role);
  }
  return buildGenericFallbackSvg(promptText, style, role);
}

/**
 * 템플릿 폴백 → data URI 반환 (base64 SVG)
 */
export function generateTemplateFallback(promptText: string, style: string, role: ImageRole): string {
  const svg = buildTemplateFallbackSvg(promptText, style, role);
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}
