/**
 * 병원 달력 이미지 생성 서비스
 * HTML/CSS 템플릿 + html2canvas로 100% 정확한 달력 이미지를 프로그래밍으로 생성
 *
 * 구조 분해 후: 빌더/스토리지/타입은 src/features/template/ 에서 import
 */
import { callGemini, callGeminiRaw, TIMEOUTS } from './geminiClient';
import { isDemoSafeMode } from './image/imageOrchestrator';
import { removeOklchFromClonedDoc } from '../components/resultPreviewUtils';

// ── 추출된 모듈 import + re-export (역호환) ──

import {
  buildCalendarHTML,
  CALENDAR_THEME_OPTIONS,
  type CalendarData,
  type ClosedDay,
  type ShortenedDay,
  type VacationDay,
} from '../features/template/builders/calendarBuilders';

import {
  buildEventHTML,
  buildDoctorHTML,
  buildNoticeHTML,
  buildGreetingHTML,
  buildHiringHTML,
  buildCautionHTML,
  buildPricingHTML,
  type EventTemplateData,
  type DoctorTemplateData,
  type NoticeTemplateData,
  type GreetingTemplateData,
  type HiringTemplateData,
  type CautionTemplateData,
  type PricingTemplateData,
} from '../features/template/builders/templateBuilders';

import {
  loadStyleHistory,
  saveStyleToHistory,
  deleteStyleFromHistory,
  resizeImageToThumbnail,
  resizeImageForReference,
  type SavedStyleHistory,
} from '../features/template/storage/styleHistory';

// re-export 모든 추출 심볼 (기존 import 경로 역호환)
export {
  buildCalendarHTML,
  CALENDAR_THEME_OPTIONS,
  buildEventHTML,
  buildDoctorHTML,
  buildNoticeHTML,
  buildGreetingHTML,
  buildHiringHTML,
  buildCautionHTML,
  buildPricingHTML,
  loadStyleHistory,
  saveStyleToHistory,
  deleteStyleFromHistory,
  resizeImageToThumbnail,
  resizeImageForReference,
};
export type {
  CalendarData,
  ClosedDay,
  ShortenedDay,
  VacationDay,
  EventTemplateData,
  DoctorTemplateData,
  NoticeTemplateData,
  GreetingTemplateData,
  HiringTemplateData,
  CautionTemplateData,
  PricingTemplateData,
  SavedStyleHistory,
};

// ── 프롬프트에서 달력 데이터 추출 (AI 텍스트) ──

/**
 * 특정 월에서 특정 요일의 모든 날짜를 반환 (JS로 정확한 계산)
 * dayOfWeek: 0=일, 1=월, ..., 6=토
 */
function getAllDaysOfWeekInMonth(year: number, month: number, dayOfWeek: number): number[] {
  const days: number[] = [];
  const lastDate = new Date(year, month, 0).getDate();
  for (let d = 1; d <= lastDate; d++) {
    if (new Date(year, month - 1, d).getDay() === dayOfWeek) {
      days.push(d);
    }
  }
  return days;
}

/**
 * 해당 월의 달력 그리드 텍스트 생성 (AI에게 정확한 날짜-요일 매핑 제공)
 */
function buildCalendarGridText(year: number, month: number): string {
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();

  let grid = `${year}년 ${month}월 달력:\n`;
  grid += dayNames.join('  ') + '\n';

  let line = '    '.repeat(firstDay);
  let dow = firstDay;
  for (let d = 1; d <= lastDate; d++) {
    line += String(d).padStart(2, ' ') + '  ';
    dow++;
    if (dow === 7) { grid += line.trimEnd() + '\n'; line = ''; dow = 0; }
  }
  if (line.trim()) grid += line.trimEnd() + '\n';
  return grid;
}

export async function parseCalendarPrompt(prompt: string): Promise<CalendarData | null> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // AI에게 정확한 달력 그리드를 제공하여 날짜-요일 오류 방지
  const calendarGrid = buildCalendarGridText(currentYear, currentMonth);

  const systemInstruction = `당신은 사용자의 병원 달력 요청을 분석하여 JSON으로 변환하는 전문가입니다.
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.

{
  "month": 숫자(1-12),
  "title": "달력 제목 문자열",
  "closedDays": [{"day": 숫자, "reason": "사유"}],
  "closedWeekday": "반복 휴진 요일명 또는 null",
  "hospitalName": "병원명 또는 null",
  "notices": ["안내문구1", "안내문구2"] 또는 [],
  "colorTheme": "blue" | "green" | "pink" | "purple"
}

📅 참고: 현재 달력 (날짜-요일 정확한 매핑):
${calendarGrid}

규칙:
- month: 프롬프트에서 언급된 월. 없으면 ${currentMonth}
- title: 프롬프트에서 파악되는 제목. 없으면 "N월 진료 안내"
- closedDays: 개별 휴진/휴무 날짜만 포함 (예: "5일 휴진" → {"day": 5, "reason": "휴진"})
- closedWeekday: "매주 X요일" 패턴이면 요일명만 반환 (예: "수요일"). 날짜 계산은 하지 마세요!
- hospitalName: 병원명이 언급되면 포함
- notices: "진료시간", "점심시간" 등 안내 문구
- colorTheme: 분위기에 맞는 색상. 기본 "blue"`;

  try {
    const rawText = await callGemini({
      prompt,
      model: 'gemini-3.1-flash-lite-preview',
      responseType: 'text',
      systemInstruction,
      temperature: 0.1,
    });

    const text = (rawText || '').trim();
    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const month = parsed.month || currentMonth;

    // closedDays 구성: 개별 날짜 + 반복 요일 (JS로 정확히 계산)
    const closedDays: ClosedDay[] = (parsed.closedDays || [])
      .map((d: any) => ({ day: Number(d.day), reason: d.reason || undefined }))
      .filter((d: ClosedDay) => d.day >= 1 && d.day <= new Date(currentYear, month, 0).getDate());

    // "매주 X요일" → JS로 정확한 날짜 계산 (AI에게 맡기지 않음)
    if (parsed.closedWeekday) {
      const weekdayMap: Record<string, number> = {
        '일요일': 0, '월요일': 1, '화요일': 2, '수요일': 3,
        '목요일': 4, '금요일': 5, '토요일': 6,
        '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6,
      };
      const dowIndex = weekdayMap[parsed.closedWeekday];
      if (dowIndex !== undefined) {
        const weekdayDays = getAllDaysOfWeekInMonth(currentYear, month, dowIndex);
        const existingDays = new Set(closedDays.map(d => d.day));
        for (const day of weekdayDays) {
          if (!existingDays.has(day)) {
            closedDays.push({ day, reason: `매주 ${parsed.closedWeekday} 휴진` });
          }
        }
      }
    }

    // 날짜순 정렬
    closedDays.sort((a, b) => a.day - b.day);

    return {
      month,
      year: currentYear,
      title: parsed.title || `${month}월 진료 안내`,
      closedDays,
      hospitalName: parsed.hospitalName || undefined,
      notices: parsed.notices || [],
      colorTheme: parsed.colorTheme || 'blue',
    };
  } catch {
    return null;
  }
}

// ── HTML → 이미지 변환 ──

/**
 * HTML을 정확한 타겟 해상도의 이미지로 렌더링
 *
 * 동작 방식:
 * 1. HTML을 CSS_WIDTH(디자인 뷰포트)에서 렌더링
 * 2. html2canvas로 고해상도 캡처
 * 3. 타겟 해상도(1080x1080 등)의 새 캔버스에 콘텐츠를 fit하여 그리기
 *
 * options.width/height = 0이면 콘텐츠 크기 그대로 출력 (auto)
 */
export async function renderCalendarToImage(
  html: string,
  options?: { width?: number; height?: number },
): Promise<string> {
  const targetW = options?.width || 0;
  const targetH = options?.height || 0;
  const isAuto = targetW === 0 && targetH === 0;

  // CSS 디자인 뷰포트: 가로형이면 넓게, 아닌 경우 1080 기반
  const CSS_WIDTH = (targetW > targetH && targetH > 0) ? 960 : 540;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.zIndex = '-1';
  container.innerHTML = html;
  document.body.appendChild(container);

  const target = container.querySelector('#calendar-render-target') as HTMLElement;
  if (!target) {
    document.body.removeChild(container);
    throw new Error('Calendar render target not found');
  }

  // CSS 뷰포트 크기 설정
  target.style.width = `${CSS_WIDTH}px`;
  target.style.boxSizing = 'border-box';

  // auto가 아니면 최소 높이 설정 (콘텐츠가 타겟 비율에 맞게)
  if (!isAuto && targetH > 0) {
    const cssHeight = Math.round(CSS_WIDTH * (targetH / targetW));
    target.style.minHeight = `${cssHeight}px`;
  }

  try {
    const html2canvas = (await import('html2canvas')).default;

    // 캡처 scale: 타겟 해상도에 정확히 맞추기
    // auto면 scale=2 (고품질 기본), 아니면 타겟W / CSS_WIDTH
    const captureScale = isAuto ? 2 : targetW / CSS_WIDTH;

    const sourceCanvas = await html2canvas(target, {
      scale: captureScale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
        removeOklchFromClonedDoc(clonedDoc, clonedElement);
      },
    });

    if (isAuto) {
      // 자동: 캡처된 그대로 반환
      return sourceCanvas.toDataURL('image/png');
    }

    // 고정 사이즈: 타겟 캔버스에 콘텐츠를 중앙 배치
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetW;
    finalCanvas.height = targetH;
    const ctx = finalCanvas.getContext('2d')!;

    // 배경 흰색
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);

    // 콘텐츠를 타겟 캔버스에 fit (가로 꽉 채우고 세로 중앙)
    const contentW = sourceCanvas.width;
    const contentH = sourceCanvas.height;

    // 가로는 타겟에 맞추고, 세로가 넘치면 축소
    let drawW = targetW;
    let drawH = Math.round(contentH * (targetW / contentW));

    if (drawH > targetH) {
      // 세로가 넘치면 세로에 맞추고 가로 중앙
      drawH = targetH;
      drawW = Math.round(contentW * (targetH / contentH));
    }

    const offsetX = Math.round((targetW - drawW) / 2);
    const offsetY = Math.round((targetH - drawH) / 2);

    ctx.drawImage(sourceCanvas, offsetX, offsetY, drawW, drawH);

    return finalCanvas.toDataURL('image/png');
  } finally {
    document.body.removeChild(container);
  }
}

// ── 통합 함수: 프롬프트 → 달력 이미지 ──

export async function generateCalendarFromPrompt(
  prompt: string,
  onProgress?: (msg: string) => void,
): Promise<{ imageDataUrl: string; mimeType: string } | null> {
  const progress = (msg: string) => onProgress?.(msg);

  progress('달력 데이터 분석 중...');
  const calendarData = await parseCalendarPrompt(prompt);
  if (!calendarData) return null;

  progress('달력 디자인 렌더링 중...');
  const html = buildCalendarHTML(calendarData);
  const imageDataUrl = await renderCalendarToImage(html, { width: 1080, height: 1080 });

  return { imageDataUrl, mimeType: 'image/png' };
}

// ── 스타일 프리셋 (색상 + 분위기 + AI 프롬프트) ──

export interface StylePreset {
  id: string;
  name: string;
  color: string;
  accent: string;
  bg: string;
  desc: string;
  mood: string; // AI 프롬프트용 분위기 키워드
  aiPrompt: string; // AI에게 전달할 디자인 지시문 (영어)
}

export const AI_STYLE_PRESETS: StylePreset[] = [
  {
    id: 'fresh_start', name: '상쾌한 새출발', color: '#dc2626', accent: '#b91c1c', bg: '#fef2f2',
    desc: '희망 · 새로움',
    mood: '새해 첫날 아침같은 상쾌한 희망의 느낌',
    aiPrompt: 'Fresh new beginning design, soft champagne gold and warm coral accents, confetti and streamer decorations, crisp morning atmosphere, festive yet elegant, gentle sparkle effects, hopeful and bright mood, clean white space with pastel color pops, no radial rays or sunburst patterns',
  },
  {
    id: 'romantic_blossom', name: '로맨틱 블로썸', color: '#e11d48', accent: '#be123c', bg: '#fff1f2',
    desc: '설렘 · 로맨틱',
    mood: '이른 봄 설렘이 피어나는 로맨틱한 느낌',
    aiPrompt: 'Early spring romantic design, soft rose pink and warm red accents, delicate heart shapes, cherry blossom buds about to bloom, gentle watercolor washes, romantic yet professional mood, subtle floral borders, warm cozy atmosphere',
  },
  {
    id: 'petal_breeze', name: '꽃잎 바람', color: '#f472b6', accent: '#ec4899', bg: '#fdf2f8',
    desc: '벚꽃 · 산뜻',
    mood: '꽃잎이 흩날리는 화사하고 산뜻한 느낌',
    aiPrompt: 'Cherry blossom petal design, soft pink petals floating in the air, pastel pink and white gradient background, sakura branch illustrations, light and airy mood, gentle breeze atmosphere, fresh spring colors, delicate floral patterns',
  },
  {
    id: 'sprout_green', name: '새싹 그린', color: '#22c55e', accent: '#16a34a', bg: '#f0fdf4',
    desc: '생명력 · 치유',
    mood: '초록 새싹이 돋아나는 싱그러운 느낌',
    aiPrompt: 'Fresh sprout nature design, vibrant young green and lime accents, sprouting leaves and seedling illustrations, morning dew drops, clean fresh air mood, bright natural sunlight, growth and vitality energy, botanical elements, eco-friendly aesthetic',
  },
  {
    id: 'warm_gratitude', name: '따뜻한 감사', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb',
    desc: '카네이션 · 감성',
    mood: '카네이션 향기같은 따뜻한 감사의 느낌',
    aiPrompt: 'Warm gratitude design, carnation flower illustrations in red and pink, warm golden yellow background, heartfelt and thankful mood, soft hand-drawn floral elements, cozy family atmosphere, gentle warm lighting, watercolor texture accents',
  },
  {
    id: 'rain_droplet', name: '청량 빗방울', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff',
    desc: '빗방울 · 청량',
    mood: '빗방울이 떨어지는 청량하고 시원한 느낌',
    aiPrompt: 'Rainy season design, soft indigo and cool blue tones, gentle raindrops and water ripple patterns, transparent umbrella motifs, calm reflective puddle aesthetic, refreshing and cool mood, misty atmosphere with clarity, clean water-inspired gradients',
  },
  {
    id: 'ocean_breeze', name: '바다 물결', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff',
    desc: '시원한 · 파도',
    mood: '한여름 바다의 시원하고 청량한 느낌',
    aiPrompt: 'Summer ocean design, bright sky blue and turquoise gradients, ocean waves and seashell motifs, tropical vibes, cool refreshing mood, sunlight sparkling on water, beach sand textures, clear blue sky, vacation energy',
  },
  {
    id: 'sunflower_energy', name: '해바라기 에너지', color: '#eab308', accent: '#ca8a04', bg: '#fefce8',
    desc: '강렬 · 활력',
    mood: '해바라기처럼 강렬하고 뜨거운 에너지 느낌',
    aiPrompt: 'Midsummer sunflower design, bold golden yellow and warm orange, large sunflower illustrations, bright blazing sunshine, high energy and vibrant mood, clear summer sky, bold dynamic composition, warm saturated colors, powerful and lively atmosphere',
  },
  {
    id: 'maple_romance', name: '단풍 낭만', color: '#ea580c', accent: '#c2410c', bg: '#fff7ed',
    desc: '단풍 · 낭만',
    mood: '단풍이 물들기 시작하는 낭만적인 느낌',
    aiPrompt: 'Early autumn design, warm orange and amber tones, maple leaves turning red and gold, soft warm sunset lighting, romantic and nostalgic mood, cozy sweater weather atmosphere, gentle falling leaves, warm gradient from orange to deep red',
  },
  {
    id: 'harvest_gold', name: '풍요로운 수확', color: '#a16207', accent: '#854d0e', bg: '#fefce8',
    desc: '풍성 · 따뜻한',
    mood: '풍성한 수확의 따뜻하고 풍요로운 느낌',
    aiPrompt: 'Autumn harvest design, rich brown and burnt orange palette, pumpkin and wheat illustrations, rustic warmth, abundance and gratitude mood, golden hour lighting, cozy thanksgiving atmosphere, grain texture accents, deep earthy warm tones',
  },
  {
    id: 'quiet_fog', name: '고즈넉한 안개', color: '#78716c', accent: '#57534e', bg: '#fafaf9',
    desc: '차분 · 고즈넉',
    mood: '낙엽이 쌓인 고즈넉한 늦가을 느낌',
    aiPrompt: 'Late autumn serene design, muted warm gray and soft brown tones, dry fallen leaves scattered softly, bare tree branch silhouettes, quiet contemplative mood, gentle fog atmosphere, warm tea and book aesthetic, calm and peaceful, subtle vintage texture',
  },
  {
    id: 'snowflake_glow', name: '눈꽃 조명', color: '#b91c1c', accent: '#d4a017', bg: '#fef9f0',
    desc: '눈꽃 · 포근한',
    mood: '눈꽃과 따뜻한 조명이 어우러진 포근한 느낌',
    aiPrompt: 'Winter holiday design, warm crimson red and shimmering gold accents, delicate white snowflake patterns on warm background, cozy Christmas fairy lights glow, rich red and gold color palette, festive ornament decorations, warm candlelight ambiance, soft falling snow, elegant holiday atmosphere with warmth',
  },
];

// ══════════════════════════════════════════════════════════════
// 추출된 모듈 re-export (역호환 — 기존 import 경로 유지)
// ══════════════════════════════════════════════════════════════

// CATEGORY_TEMPLATES → features/template/config/categoryTemplates.ts
export { CATEGORY_TEMPLATES, type CategoryTemplate } from '../features/template/config/categoryTemplates';

// AI 엔진 → features/template/engine/templateAiEngine.ts
export {
  type TemplateApplicationMode,
  DESIGNER_PERSONA,
  SERIES_DESIGN_RULES,
  DESIGN_SYSTEM_V2,
  generateTemplateWithAI,
} from '../features/template/engine/templateAiEngine';
