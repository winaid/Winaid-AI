/**
 * Image Fallback Service — 템플릿 기반 보조 비주얼
 *
 * AI 이미지 생성 실패 시 "보조 비주얼 모드"로 전환.
 * 프롬프트 기반 그라디언트 + 키워드 카드.
 * "실패 대체물"이 아닌 "완성된 비주얼"로 보이게 하는 것이 목적.
 */

import type { ImageRole } from './imageTypes';

// ── 그라디언트 팔레트 ──
const TEMPLATE_GRADIENTS = [
  ['#667eea', '#764ba2'], // purple-violet
  ['#f093fb', '#f5576c'], // pink-red
  ['#4facfe', '#00f2fe'], // blue-cyan
  ['#43e97b', '#38f9d7'], // green-teal
  ['#fa709a', '#fee140'], // pink-yellow
  ['#a18cd1', '#fbc2eb'], // lavender-pink
  ['#fccb90', '#d57eeb'], // peach-purple
  ['#96fbc4', '#f9f586'], // mint-yellow
];

const TEMPLATE_ICONS: Record<string, string> = {
  illustration: '🏥',
  medical: '🫀',
  photo: '📸',
  custom: '✨',
};

/**
 * SVG 기반 보조 비주얼 생성 (raw SVG 문자열)
 */
export function buildTemplateFallbackSvg(
  promptText: string,
  style: string,
  role: ImageRole,
): string {
  const koreanWords = promptText.match(/[\uAC00-\uD7A3]{2,}/g) || [];
  const keywords = koreanWords.slice(0, 3).join(' · ') || '건강 정보';
  const icon = TEMPLATE_ICONS[style] || '🏥';

  const hash = promptText.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const [c1, c2] = TEMPLATE_GRADIENTS[hash % TEMPLATE_GRADIENTS.length];

  const width = 1280;
  const height = 720;
  const isHero = role === 'hero';

  const ctaText = isHero
    ? '이미지를 클릭하면 AI 고품질 이미지로 업그레이드됩니다'
    : '이미지 클릭 시 AI 이미지로 전환 가능';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${c1}"/>
      <stop offset="100%" style="stop-color:${c2}"/>
    </linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="60"/></filter>
  </defs>
  <rect fill="url(#bg)" width="${width}" height="${height}" rx="0"/>
  <circle cx="${width * 0.7}" cy="${height * 0.3}" r="200" fill="rgba(255,255,255,0.08)" filter="url(#blur)"/>
  <circle cx="${width * 0.3}" cy="${height * 0.7}" r="160" fill="rgba(255,255,255,0.06)" filter="url(#blur)"/>
  <rect fill="rgba(255,255,255,0.12)" x="60" y="60" width="${width - 120}" height="${height - 120}" rx="24"/>
  <text x="${width / 2}" y="${isHero ? 280 : 300}" text-anchor="middle" font-family="Apple SD Gothic Neo,Noto Sans KR,sans-serif" font-size="${isHero ? 72 : 56}" fill="rgba(255,255,255,0.9)">${icon}</text>
  <text x="${width / 2}" y="${isHero ? 380 : 390}" text-anchor="middle" font-family="Apple SD Gothic Neo,Noto Sans KR,sans-serif" font-size="${isHero ? 32 : 26}" fill="rgba(255,255,255,0.85)" font-weight="600">${keywords}</text>
  <text x="${width / 2}" y="${isHero ? 430 : 430}" text-anchor="middle" font-family="Apple SD Gothic Neo,Noto Sans KR,sans-serif" font-size="14" fill="rgba(255,255,255,0.5)">${ctaText}</text>
</svg>`;
}

/**
 * 템플릿 폴백 → data URI 반환 (base64 SVG)
 */
export function generateTemplateFallback(promptText: string, style: string, role: ImageRole): string {
  const svg = buildTemplateFallbackSvg(promptText, style, role);
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}
