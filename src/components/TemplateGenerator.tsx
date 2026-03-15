import React, { useState, useEffect } from 'react';
import { toast } from './Toast';
import {
  transformImageStyle,
  editImageRegion,
  type StyleTransformType,
} from '../services/imageGenerationService';
import {
  generateTemplateWithAI,
  AI_STYLE_PRESETS,
  CATEGORY_TEMPLATES,
  loadStyleHistory,
  saveStyleToHistory,
  deleteStyleFromHistory,
  resizeImageToThumbnail,
  type TemplateApplicationMode,
  resizeImageForReference,
  CALENDAR_THEME_OPTIONS,
  type ClosedDay,
  type ShortenedDay,
  type VacationDay,
  type StylePreset,
  type CategoryTemplate,
  type SavedStyleHistory,
} from '../services/calendarTemplateService';
import {
  T1SpringKindergarten,
  T2CherryBlossom,
  T3Autumn,
  T4KoreanTraditional,
  T5Notebook,
  T6Christmas,
  T7AutumnSpringNote,
  T8AutumnHoliday,
  T9HanokRoof,
  T10DarkGreenClinic,
  T11DarkBlueModern,
  T12LavenderSparkle,
  type ScheduleData,
} from './schedule-templates';

/** 달력 테마 값 → React 컴포넌트 + 샘플 데이터 */
const THEME_COMPONENT_MAP: Record<string, {
  Component: React.ComponentType<{ data: ScheduleData; width?: number }>;
  sample: ScheduleData;
}> = {
  spring_kids: {
    Component: T1SpringKindergarten,
    sample: {
      clinicName: '윈에이드 치과', monthLabel: '4월', year: 2025, month: 4,
      title: '4월 진료일정',
      events: [{ date: 5, label: '정기휴진', type: 'closed' }, { date: 12, label: '정기휴진', type: 'closed' }, { date: 19, label: '정기휴진', type: 'closed' }, { date: 26, label: '정기휴진', type: 'closed' }],
    },
  },
  cherry_blossom: {
    Component: T2CherryBlossom,
    sample: {
      clinicName: '윈에이드 치과', monthLabel: '4월', year: 2025, month: 4,
      title: '4월 진료일정',
      events: [{ date: 5, label: '정기휴진', type: 'closed' }, { date: 12, label: '정기휴진', type: 'closed' }, { date: 19, label: '정기휴진', type: 'closed' }, { date: 26, label: '정기휴진', type: 'closed' }],
    },
  },
  autumn: {
    Component: T3Autumn,
    sample: {
      clinicName: '윈에이드 치과', monthLabel: '11월', year: 2025, month: 11,
      title: '11월 진료일정',
      events: [{ date: 5, label: '정기휴진', type: 'closed' }, { date: 12, label: '정기휴진', type: 'closed' }, { date: 19, label: '정기휴진', type: 'closed' }, { date: 26, label: '정기휴진', type: 'closed' }],
    },
  },
  korean_traditional: {
    Component: T4KoreanTraditional,
    sample: {
      clinicName: '윈에이드 치과', monthLabel: '1월', year: 2025, month: 1,
      title: '1월 진료일정',
      events: [{ date: 5, label: '정기휴진', type: 'closed' }, { date: 12, label: '정기휴진', type: 'closed' }, { date: 19, label: '정기휴진', type: 'closed' }, { date: 26, label: '정기휴진', type: 'closed' }],
    },
  },
  medical_notebook: {
    Component: T5Notebook,
    sample: {
      clinicName: '윈에이드 치과', monthLabel: '7월', year: 2025, month: 7,
      title: '7월 진료일정',
      events: [{ date: 5, label: '정기휴진', type: 'closed' }, { date: 12, label: '정기휴진', type: 'closed' }, { date: 19, label: '정기휴진', type: 'closed' }, { date: 26, label: '정기휴진', type: 'closed' }],
    },
  },
  winter: {
    Component: T6Christmas,
    sample: {
      clinicName: '윈에이드 치과', monthLabel: '12월', year: 2025, month: 12,
      title: '12월 진료일정',
      events: [{ date: 5, label: '정기휴진', type: 'closed' }, { date: 12, label: '정기휴진', type: 'closed' }, { date: 19, label: '정기휴진', type: 'closed' }, { date: 26, label: '정기휴진', type: 'closed' }],
    },
  },
  autumn_spring_note: {
    Component: T7AutumnSpringNote,
    sample: {
      clinicName: '윈에이드 치과', monthLabel: '10월', year: 2025, month: 10,
      title: '10월 휴진 안내',
      events: [{ date: 5, label: '추석연휴', type: 'closed' }, { date: 6, label: '추석연휴', type: 'closed' }, { date: 7, label: '추석연휴', type: 'closed' }],
    },
  },
  autumn_holiday: {
    Component: T8AutumnHoliday,
    sample: {
      clinicName: '윈에이드 치과', monthLabel: '10월', year: 2025, month: 10,
      title: '10월 휴무',
      events: [{ date: 3, label: '개천절', type: 'closed' }, { date: 9, label: '한글날', type: 'closed' }, { date: 4, label: '정상 영업', type: 'normal' }],
    },
  },
  hanok_roof: {
    Component: T9HanokRoof,
    sample: {
      clinicName: '윈에이드 치과', monthLabel: '2월', year: 2025, month: 2,
      title: '2월 진료일정 안내',
      events: [{ date: 16, label: '휴진', type: 'closed' }, { date: 17, label: '휴진', type: 'closed' }, { date: 18, label: '휴진', type: 'closed' }],
    },
  },
  dark_green_clinic: {
    Component: T10DarkGreenClinic,
    sample: {
      clinicName: '윈에이드 치과', monthLabel: '10월', year: 2025, month: 10,
      title: '10월 진료일정',
      events: [{ date: 1, label: '정상진료', type: 'normal' }, { date: 3, label: '휴진', type: 'closed' }, { date: 9, label: '휴진', type: 'closed' }],
    },
  },
  dark_blue_modern: {
    Component: T11DarkBlueModern,
    sample: {
      clinicName: '윈에이드 치과', monthLabel: '10월', year: 2025, month: 10,
      title: '10월 휴진 일정',
      events: [{ date: 1, label: '임시공휴일', type: 'seminar' }, { date: 3, label: '개천절', type: 'closed' }, { date: 9, label: '한글날', type: 'closed' }],
    },
  },
  lavender_sparkle: {
    Component: T12LavenderSparkle,
    sample: {
      clinicName: '윈에이드 치과', monthLabel: '10월', year: 2025, month: 10,
      title: '10월 진료일정',
      events: [{ date: 1, label: '정상 진료', type: 'normal' }, { date: 3, label: '개천절 휴진', type: 'closed' }, { date: 9, label: '한글날 휴진', type: 'closed' }],
    },
  },
};

type DayMark = 'closed' | 'shortened' | 'vacation';
type TemplateCategory = 'schedule' | 'event' | 'doctor' | 'notice' | 'greeting' | 'hiring' | 'caution' | 'pricing';
type ScheduleLayout = 'full_calendar' | 'week' | 'highlight';

const CATEGORIES: { id: TemplateCategory; name: string; icon: string; desc: string }[] = [
  { id: 'schedule', name: '진료일정', icon: '\u{1F4C5}', desc: '휴진/단축진료' },
  { id: 'event', name: '이벤트', icon: '\u{1F389}', desc: '시술 할인' },
  { id: 'doctor', name: '의사소개', icon: '\u{1F9D1}\u200D\u2695\uFE0F', desc: '전문의 부임' },
  { id: 'notice', name: '공지사항', icon: '\u{1F4E2}', desc: '변경/이전' },
  { id: 'greeting', name: '명절 인사', icon: '\u{1F38A}', desc: '설날/추석' },
  { id: 'hiring', name: '채용/공고', icon: '\u{1F4CB}', desc: '직원 모집' },
  { id: 'caution', name: '주의사항', icon: '\u26A0\uFE0F', desc: '시술/진료 후' },
  { id: 'pricing', name: '비급여 안내', icon: '\u{1F4B0}', desc: '시술 가격표' },
];

// AI 스타일 프리셋 사용 (모든 템플릿 AI 생성)

const IMAGE_SIZES = [
  { id: 'square', label: '1080x1080', width: 1080, height: 1080, icon: '\u2B1C', desc: '\uC778\uC2A4\uD0C0 \uD53C\uB4DC' },
  { id: 'landscape', label: '1920x1080', width: 1920, height: 1080, icon: '\uD83D\uDDA5\uFE0F', desc: '\uAC00\uB85C\uD615 \uBC30\uB108' },
  { id: 'portrait34', label: '1080x1440', width: 1080, height: 1440, icon: '\uD83D\uDCCB', desc: '3:4 \uC138\uB85C' },
  { id: 'portrait', label: '1080x1920', width: 1080, height: 1920, icon: '\uD83D\uDCF1', desc: '9:16 \uC138\uB85C' },
  { id: 'auto', label: '\uC790\uB3D9', width: 0, height: 0, icon: '\u2728', desc: '\uCF58\uD150\uCE20 \uB9DE\uCDA4' },
] as const;

type ImageSize = typeof IMAGE_SIZES[number]['id'];

const inputCls = 'w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white placeholder:text-slate-300';
const textareaCls = `${inputCls} resize-none`;
const labelCls = 'block text-xs font-bold text-slate-500 mb-1.5';

// SVG 미리보기 - 카테고리별 세련된 레이아웃
// 미리보기용 휴진일 예시: 9, 10 (연속 2일) + 15 (단독)
const PREVIEW_CLOSED = new Set([9, 10, 15]);
const PREVIEW_SHORT = new Set([22]);

// 연속 휴진일 감지: 같은 행에서 다음날도 휴진이면 둥근 네모로 묶기
function closedRunLength(day: number, col: number): number {
  let len = 1;
  while (col + len < 7 && PREVIEW_CLOSED.has(day + len)) len++;
  return len;
}
function isRunStart(day: number, col: number): boolean {
  return PREVIEW_CLOSED.has(day) && (col === 0 || !PREVIEW_CLOSED.has(day - 1));
}
function isInRun(day: number, col: number): boolean {
  return PREVIEW_CLOSED.has(day) && col > 0 && PREVIEW_CLOSED.has(day - 1);
}

function TemplateSVGPreview({ template: t, category, hospitalName }: { template: CategoryTemplate; category: TemplateCategory; hospitalName: string }) {
  // 커스텀 미리보기 이미지가 있으면 SVG 대신 이미지 표시
  if (t.previewImage) {
    return (
      <img
        src={t.previewImage}
        alt={t.name}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    );
  }

  const c = t.color;
  const a = t.accent;
  const mo = new Date().getMonth() + 1;
  const name = hospitalName || '윈에이드 치과';
  const isDark = t.layoutHint === 'luxury' || t.bg === '#1a1a2e';

  // 공통 SVG 래퍼 - 더 세련된 배경
  const wrap = (children: React.ReactNode) => (
    <svg viewBox="0 0 120 160" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`bg_${t.id}`} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor={isDark ? '#0f172a' : t.bg} />
          <stop offset="50%" stopColor={isDark ? '#1e293b' : 'white'} />
          <stop offset="100%" stopColor={isDark ? '#0f172a' : t.bg} stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id={`accent_${t.id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={c} />
          <stop offset="100%" stopColor={a} />
        </linearGradient>
        <filter id={`shadow_${t.id}`}><feDropShadow dx="0" dy="0.5" stdDeviation="0.8" floodOpacity="0.08" /></filter>
      </defs>
      <rect width="120" height="160" fill={`url(#bg_${t.id})`} rx="6" />
      {children}
    </svg>
  );

  if (category === 'schedule') {
    const hint = t.layoutHint;
    if (hint === 'cal_corporate') {
      // 1) Clean blue corporate: full-width blue header bar, 7-col grid, bottom info strip
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        <rect x="0" y="0" width="120" height="26" rx="6" fill={c} />
        <rect x="0" y="20" width="120" height="6" fill={c} />
        <text x="10" y="11" fontSize="3" fontWeight="600" fill="white" fillOpacity="0.85">{name}</text>
        <text x="10" y="22" fontSize="10" fontWeight="900" fill="white">{mo}월 진료일정</text>
        <rect x="8" y="32" width="104" height="8" rx="3" fill={c} fillOpacity="0.08" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={16 + i * 14} y="38" textAnchor="middle" fontSize="2.5" fontWeight="700" fill={i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#64748b'}>{d}</text>
        ))}
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 16 + col * 14, cy = 50 + row * 13;
          return <g key={`${row}-${col}`}>
            {isRunStart(day, col) && closedRunLength(day, col) > 1 && <rect x={cx - 5} y={cy - 5} width={14 * (closedRunLength(day, col) - 1) + 10} height="10" rx="5" fill={c} fillOpacity="0.1" />}
            {isRunStart(day, col) && closedRunLength(day, col) === 1 && <circle cx={cx} cy={cy} r="5" fill={c} fillOpacity="0.1" />}
            {short && <rect x={cx - 5} y={cy - 5} width="10" height="10" rx="3" fill="#fbbf24" fillOpacity="0.15" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="3.5" fontWeight={closed || short ? '700' : '400'} fill={closed ? c : short ? '#d97706' : col === 0 ? '#ef4444' : '#334155'}>{day}</text>
          </g>;
        }))}
        <rect x="0" y="120" width="120" height="40" rx="0" fill={c} fillOpacity="0.04" />
        <line x1="8" y1="120" x2="112" y2="120" stroke={c} strokeWidth="0.3" strokeOpacity="0.2" />
        <circle cx="20" cy="130" r="3" fill={c} fillOpacity="0.15" />
        <text x="27" y="132" fontSize="2.8" fontWeight="600" fill="#475569">휴진</text>
        <circle cx="48" cy="130" r="3" fill="#fbbf24" fillOpacity="0.2" />
        <text x="55" y="132" fontSize="2.8" fontWeight="600" fill="#475569">단축</text>
        <text x="60" y="148" textAnchor="middle" fontSize="3" fontWeight="600" fill={c}>{name}</text>
      </>);
    }
    if (hint === 'cal_premium') {
      // 2) Beige premium: thin gold accent line top, elegant serif-style title, warm card
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#faf7f4" />
        <line x1="20" y1="8" x2="100" y2="8" stroke={a} strokeWidth="0.6" />
        <text x="60" y="20" textAnchor="middle" fontSize="3" fontWeight="600" fill={a} letterSpacing="1.5">{name}</text>
        <text x="60" y="38" textAnchor="middle" fontSize="12" fontWeight="900" fill={c}>{mo}월</text>
        <text x="60" y="48" textAnchor="middle" fontSize="3.5" fontWeight="500" fill={a} letterSpacing="2">진 료 안 내</text>
        <line x1="30" y1="52" x2="90" y2="52" stroke={a} strokeWidth="0.3" strokeOpacity="0.4" />
        <rect x="10" y="58" width="100" height="72" rx="4" fill="white" stroke={a} strokeWidth="0.4" strokeOpacity="0.3" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={18 + i * 13} y="68" textAnchor="middle" fontSize="2.5" fontWeight="700" fill={i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : c}>{d}</text>
        ))}
        <line x1="14" y1="71" x2="106" y2="71" stroke={a} strokeWidth="0.2" strokeOpacity="0.2" />
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 18 + col * 13, cy = 80 + row * 10;
          return <g key={`${row}-${col}`}>
            {closed && <circle cx={cx} cy={cy} r="4.5" fill={c} fillOpacity="0.1" />}
            {short && <circle cx={cx} cy={cy} r="4.5" fill="#fbbf24" fillOpacity="0.12" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="3" fontWeight={closed || short ? '700' : '400'} fill={closed ? c : short ? '#d97706' : col === 0 ? '#ef4444' : '#57534e'}>{day}</text>
          </g>;
        }))}
        <circle cx="28" cy="140" r="2.5" fill={c} fillOpacity="0.12" />
        <text x="34" y="142" fontSize="2.5" fontWeight="600" fill={a}>휴진</text>
        <circle cx="54" cy="140" r="2.5" fill="#fbbf24" fillOpacity="0.15" />
        <text x="60" y="142" fontSize="2.5" fontWeight="600" fill="#92400e">단축</text>
        <text x="60" y="154" textAnchor="middle" fontSize="2.8" fontWeight="600" fill={a}>{name}</text>
      </>);
    }
    if (hint === 'cal_spring') {
      // 3) Spring: subtle pink gradient top strip, clean grid, pastel accents
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#fdf2f8" />
        <rect x="0" y="0" width="120" height="18" rx="6" fill={c} fillOpacity="0.12" />
        <text x="60" y="12" textAnchor="middle" fontSize="3" fontWeight="600" fill={a}>{name}</text>
        <text x="60" y="34" textAnchor="middle" fontSize="12" fontWeight="900" fill="#831843">{mo}월</text>
        <text x="60" y="44" textAnchor="middle" fontSize="3.5" fontWeight="500" fill="#9d174d" letterSpacing="2">진 료 안 내</text>
        <rect x="10" y="52" width="100" height="78" rx="6" fill="white" fillOpacity="0.95" filter={`url(#shadow_${t.id})`} />
        <rect x="10" y="52" width="100" height="10" rx="6" fill={c} fillOpacity="0.1" />
        <rect x="10" y="58" width="100" height="4" fill={c} fillOpacity="0.1" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={18 + i * 13} y="60" textAnchor="middle" fontSize="2.5" fontWeight="700" fill={i === 0 ? '#e11d48' : i === 6 ? '#3b82f6' : '#9d174d'}>{d}</text>
        ))}
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 18 + col * 13, cy = 72 + row * 11;
          return <g key={`${row}-${col}`}>
            {isRunStart(day, col) && closedRunLength(day, col) > 1 && <rect x={cx - 5} y={cy - 4.5} width={13 * (closedRunLength(day, col) - 1) + 10} height="9" rx="4.5" fill="#fce7f3" />}
            {isRunStart(day, col) && closedRunLength(day, col) === 1 && <circle cx={cx} cy={cy} r="4.5" fill="#fce7f3" />}
            {short && <circle cx={cx} cy={cy} r="4.5" fill="#fef3c7" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="3" fontWeight={closed || short ? '700' : '400'} fill={closed ? '#e11d48' : short ? '#d97706' : col === 0 ? '#e11d48' : '#4a044e'}>{day}</text>
          </g>;
        }))}
        <circle cx="28" cy="138" r="2.5" fill="#fce7f3" />
        <text x="34" y="140" fontSize="2.5" fontWeight="600" fill="#9d174d">휴진</text>
        <circle cx="54" cy="138" r="2.5" fill="#fef3c7" />
        <text x="60" y="140" fontSize="2.5" fontWeight="600" fill="#92400e">단축</text>
        <text x="60" y="154" textAnchor="middle" fontSize="2.8" fontWeight="600" fill="#9d174d">{name}</text>
      </>);
    }
    if (hint === 'cal_autumn') {
      // 4) Autumn: warm gradient header sweep, rounded card grid, amber accents
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#fff7ed" />
        <path d="M0,0 L120,0 L120,42 Q90,36 60,42 Q30,48 0,42 Z" fill={c} fillOpacity="0.8" />
        <text x="60" y="12" textAnchor="middle" fontSize="3" fontWeight="600" fill="white" fillOpacity="0.85">{name}</text>
        <text x="60" y="30" textAnchor="middle" fontSize="11" fontWeight="900" fill="white">{mo}월 진료일정</text>
        <rect x="8" y="50" width="104" height="80" rx="8" fill="white" fillOpacity="0.97" filter={`url(#shadow_${t.id})`} />
        <rect x="8" y="50" width="104" height="10" rx="8" fill={c} fillOpacity="0.08" />
        <rect x="8" y="56" width="104" height="4" fill={c} fillOpacity="0.08" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={16 + i * 14} y="58" textAnchor="middle" fontSize="2.5" fontWeight="700" fill={i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : c}>{d}</text>
        ))}
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 16 + col * 14, cy = 70 + row * 11;
          return <g key={`${row}-${col}`}>
            {closed && <rect x={cx - 5} y={cy - 5} width="10" height="10" rx="5" fill={c} fillOpacity="0.12" />}
            {short && <rect x={cx - 5} y={cy - 5} width="10" height="10" rx="5" fill="#fbbf24" fillOpacity="0.15" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="3.2" fontWeight={closed || short ? '700' : '400'} fill={closed ? c : short ? '#d97706' : col === 0 ? '#ef4444' : '#334155'}>{day}</text>
          </g>;
        }))}
        <circle cx="24" cy="138" r="3" fill={c} fillOpacity="0.15" />
        <text x="30" y="140" fontSize="2.5" fontWeight="600" fill="#475569">휴진</text>
        <circle cx="50" cy="138" r="3" fill="#fbbf24" fillOpacity="0.2" />
        <text x="56" y="140" fontSize="2.5" fontWeight="600" fill="#475569">단축</text>
        <text x="60" y="154" textAnchor="middle" fontSize="2.8" fontWeight="600" fill={c}>{name}</text>
      </>);
    }
    if (hint === 'cal_hanok') {
      // 5) Korean traditional: geometric border pattern, dignified layout, coral accent
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f5e6d0" />
        <rect x="6" y="6" width="108" height="148" rx="3" fill="none" stroke={c} strokeWidth="0.6" strokeOpacity="0.35" />
        <rect x="9" y="9" width="102" height="142" rx="2" fill="none" stroke={c} strokeWidth="0.3" strokeOpacity="0.2" />
        {[{x:6,y:6,sx:1,sy:1},{x:114,y:6,sx:-1,sy:1},{x:6,y:154,sx:1,sy:-1},{x:114,y:154,sx:-1,sy:-1}].map((p,i) =>
          <path key={i} d={`M${p.x},${p.y + p.sy*10} L${p.x},${p.y} L${p.x + p.sx*10},${p.y}`} fill="none" stroke={c} strokeWidth="1" strokeOpacity="0.4" />
        )}
        <text x="60" y="22" textAnchor="middle" fontSize="3.2" fontWeight="700" fill={c} letterSpacing="1.5">{name}</text>
        <circle cx="60" cy="40" r="8" fill="#e8795a" fillOpacity="0.15" />
        <text x="60" y="44" textAnchor="middle" fontSize="10" fontWeight="900" fill="#78350f">{mo}월</text>
        <text x="60" y="54" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={c}>진료일정 안내</text>
        <rect x="12" y="60" width="96" height="70" rx="3" fill="white" fillOpacity="0.9" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={20 + i * 12.5} y="70" textAnchor="middle" fontSize="2.5" fontWeight="700" fill={i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#78350f'}>{d}</text>
        ))}
        <line x1="16" y1="73" x2="104" y2="73" stroke={c} strokeWidth="0.2" strokeOpacity="0.2" />
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 20 + col * 12.5, cy = 82 + row * 9;
          return <g key={`${row}-${col}`}>
            {closed && <circle cx={cx} cy={cy} r="4" fill="#e8795a" fillOpacity="0.15" />}
            {short && <circle cx={cx} cy={cy} r="4" fill="#fbbf24" fillOpacity="0.15" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="3" fontWeight={closed || short ? '700' : '400'} fill={closed ? '#dc2626' : short ? '#d97706' : col === 0 ? '#dc2626' : '#78350f'}>{day}</text>
          </g>;
        }))}
        <circle cx="28" cy="140" r="2.5" fill="#e8795a" fillOpacity="0.2" />
        <text x="34" y="142" fontSize="2.5" fontWeight="600" fill="#78350f">휴진</text>
        <circle cx="54" cy="140" r="2.5" fill="#fbbf24" fillOpacity="0.2" />
        <text x="60" y="142" fontSize="2.5" fontWeight="600" fill="#78350f">단축</text>
        <text x="60" y="154" textAnchor="middle" fontSize="2.8" fontWeight="600" fill={c}>{name}</text>
      </>);
    }
    if (hint === 'cal_kraft') {
      // 6) Kraft: simple cream background, hand-drawn-feel thin border, generous spacing
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#faf5e4" />
        <rect x="8" y="8" width="104" height="144" rx="4" fill="none" stroke="#d4a574" strokeWidth="0.5" strokeOpacity="0.4" />
        <text x="60" y="24" textAnchor="middle" fontSize="3" fontWeight="600" fill={c}>{name}</text>
        <line x1="30" y1="28" x2="90" y2="28" stroke="#d4a574" strokeWidth="0.3" strokeOpacity="0.3" />
        <text x="60" y="42" textAnchor="middle" fontSize="11" fontWeight="900" fill="#78350f">{mo}월 진료안내</text>
        <rect x="12" y="50" width="96" height="72" rx="4" fill="white" fillOpacity="0.6" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={20 + i * 12.5} y="60" textAnchor="middle" fontSize="2.5" fontWeight="700" fill={i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#78350f'}>{d}</text>
        ))}
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 20 + col * 12.5, cy = 70 + row * 10;
          return <g key={`${row}-${col}`}>
            {isRunStart(day, col) && closedRunLength(day, col) > 1 && <rect x={cx - 4} y={cy - 3.5} width={12.5 * (closedRunLength(day, col) - 1) + 8} height="7" rx="3.5" fill="#fee2e2" fillOpacity="0.6" />}
            {isRunStart(day, col) && closedRunLength(day, col) === 1 && <circle cx={cx} cy={cy} r="3.5" fill="#fee2e2" fillOpacity="0.6" />}
            {short && <circle cx={cx} cy={cy} r="3.5" fill="#fef3c7" fillOpacity="0.6" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="3" fontWeight={closed || short ? '700' : '400'} fill={closed ? '#dc2626' : short ? '#d97706' : col === 0 ? '#dc2626' : '#78350f'}>{day}</text>
          </g>;
        }))}
        <circle cx="28" cy="132" r="2.5" fill="#fee2e2" fillOpacity="0.7" />
        <text x="34" y="134" fontSize="2.5" fontWeight="600" fill="#78350f">휴진</text>
        <circle cx="54" cy="132" r="2.5" fill="#fef3c7" fillOpacity="0.7" />
        <text x="60" y="134" fontSize="2.5" fontWeight="600" fill="#78350f">단축</text>
        <text x="60" y="148" textAnchor="middle" fontSize="2.8" fontWeight="600" fill="#78350f">{name}</text>
      </>);
    }
    if (hint === 'cal_winter') {
      // 7) Winter: cool blue-to-white gradient, frosted card, geometric snowflake accent
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#e0f2fe" />
        <rect x="0" y="60" width="120" height="100" rx="6" fill="white" fillOpacity="0.6" />
        <g opacity="0.12" transform="translate(100,14) scale(0.6)">
          <line x1="0" y1="-10" x2="0" y2="10" stroke={c} strokeWidth="1" />
          <line x1="-8.66" y1="-5" x2="8.66" y2="5" stroke={c} strokeWidth="1" />
          <line x1="-8.66" y1="5" x2="8.66" y2="-5" stroke={c} strokeWidth="1" />
        </g>
        <text x="14" y="16" fontSize="3" fontWeight="600" fill="#0369a1">{name}</text>
        <text x="14" y="32" fontSize="12" fontWeight="900" fill="#0c4a6e">{mo}월</text>
        <text x="14" y="42" fontSize="3.5" fontWeight="500" fill="#0369a1">진료일정 안내</text>
        <rect x="8" y="50" width="104" height="80" rx="6" fill="white" fillOpacity="0.85" stroke="#bae6fd" strokeWidth="0.5" />
        <rect x="8" y="50" width="104" height="10" rx="6" fill="#e0f2fe" fillOpacity="0.5" />
        <rect x="8" y="56" width="104" height="4" fill="#e0f2fe" fillOpacity="0.5" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={16 + i * 14} y="58" textAnchor="middle" fontSize="2.5" fontWeight="700" fill={i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#0369a1'}>{d}</text>
        ))}
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 16 + col * 14, cy = 68 + row * 12;
          return <g key={`${row}-${col}`}>
            {isRunStart(day, col) && closedRunLength(day, col) > 1 && <rect x={cx - 5} y={cy - 5} width={14 * (closedRunLength(day, col) - 1) + 10} height="10" rx="5" fill="#0ea5e9" fillOpacity="0.1" />}
            {isRunStart(day, col) && closedRunLength(day, col) === 1 && <circle cx={cx} cy={cy} r="5" fill="#0ea5e9" fillOpacity="0.1" />}
            {short && <rect x={cx - 5} y={cy - 5} width="10" height="10" rx="3" fill="#fbbf24" fillOpacity="0.15" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="3.5" fontWeight={closed || short ? '700' : '400'} fill={closed ? '#0369a1' : short ? '#d97706' : col === 0 ? '#ef4444' : '#334155'}>{day}</text>
          </g>;
        }))}
        <circle cx="24" cy="140" r="3" fill="#0ea5e9" fillOpacity="0.12" />
        <text x="30" y="142" fontSize="2.8" fontWeight="600" fill="#0369a1">휴진</text>
        <circle cx="52" cy="140" r="3" fill="#fbbf24" fillOpacity="0.18" />
        <text x="58" y="142" fontSize="2.8" fontWeight="600" fill="#475569">단축</text>
        <text x="60" y="154" textAnchor="middle" fontSize="2.8" fontWeight="600" fill="#0369a1">{name}</text>
      </>);
    }
    if (hint === 'cal_swiss') {
      // 8) Ultra-minimal: black/white/gray, visible grid lines, maximum whitespace
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        <text x="10" y="16" fontSize="3" fontWeight="600" fill="#6b7280">{name}</text>
        <text x="10" y="34" fontSize="13" fontWeight="900" fill="#111827">{mo}월</text>
        <text x="10" y="44" fontSize="3.5" fontWeight="500" fill="#6b7280">진료일정</text>
        <line x1="8" y1="52" x2="112" y2="52" stroke="#e5e7eb" strokeWidth="0.5" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={16 + i * 14} y="60" textAnchor="middle" fontSize="2.5" fontWeight="700" fill={i === 0 ? '#ef4444' : '#9ca3af'}>{d}</text>
        ))}
        <line x1="8" y1="63" x2="112" y2="63" stroke="#e5e7eb" strokeWidth="0.3" />
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 16 + col * 14, cy = 73 + row * 12;
          return <g key={`${row}-${col}`}>
            {closed && <circle cx={cx} cy={cy} r="4.5" fill="#f3f4f6" />}
            {short && <circle cx={cx} cy={cy} r="4.5" fill="#fef3c7" fillOpacity="0.5" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="3.5" fontWeight={closed ? '700' : '400'} fill={closed ? '#111827' : short ? '#d97706' : col === 0 ? '#ef4444' : '#374151'}>{day}</text>
          </g>;
        }))}
        <circle cx="14" cy="138" r="3" fill="#f3f4f6" />
        <text x="20" y="140" fontSize="2.5" fontWeight="600" fill="#374151">휴진</text>
        <circle cx="40" cy="138" r="3" fill="#fef3c7" fillOpacity="0.5" />
        <text x="46" y="140" fontSize="2.5" fontWeight="600" fill="#374151">단축</text>
        <text x="10" y="154" fontSize="2.8" fontWeight="600" fill="#9ca3af">{name}</text>
      </>);
    }
    if (hint === 'cal_navy') {
      // 9) Dark navy: navy full bleed, white floating card, strong contrast
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#0f2444" />
        <text x="60" y="16" textAnchor="middle" fontSize="3" fontWeight="600" fill="#7dd3fc" letterSpacing="1">{name}</text>
        <text x="60" y="34" textAnchor="middle" fontSize="13" fontWeight="900" fill="white">{mo}월</text>
        <text x="60" y="44" textAnchor="middle" fontSize="3.5" fontWeight="500" fill="#7dd3fc" letterSpacing="2">SCHEDULE</text>
        <rect x="8" y="52" width="104" height="78" rx="5" fill="white" filter={`url(#shadow_${t.id})`} />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={16 + i * 14} y="64" textAnchor="middle" fontSize="2.5" fontWeight="700" fill={i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#1e3a5f'}>{d}</text>
        ))}
        <line x1="12" y1="67" x2="108" y2="67" stroke="#e5e7eb" strokeWidth="0.3" />
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 16 + col * 14, cy = 76 + row * 10;
          return <g key={`${row}-${col}`}>
            {closed && <circle cx={cx} cy={cy} r="4.5" fill="#dbeafe" />}
            {short && <circle cx={cx} cy={cy} r="4.5" fill="#fef3c7" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="3" fontWeight={closed || short ? '700' : '400'} fill={closed ? '#1e3a5f' : short ? '#d97706' : col === 0 ? '#ef4444' : '#334155'}>{day}</text>
          </g>;
        }))}
        <circle cx="24" cy="140" r="3" fill="#dbeafe" fillOpacity="0.3" />
        <text x="30" y="142" fontSize="2.8" fontWeight="600" fill="#7dd3fc">휴진</text>
        <circle cx="52" cy="140" r="3" fill="#fbbf24" fillOpacity="0.2" />
        <text x="58" y="142" fontSize="2.8" fontWeight="600" fill="#7dd3fc">단축</text>
        <text x="60" y="154" textAnchor="middle" fontSize="2.8" fontWeight="600" fill="white" fillOpacity="0.7">{name}</text>
      </>);
    }
    if (hint === 'cal_mint') {
      // 10) Mint fresh: mint accent bar left side, bento-grid layout (calendar + side info)
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f0fdfa" />
        <rect x="0" y="0" width="4" height="160" rx="2" fill={c} fillOpacity="0.7" />
        <text x="12" y="14" fontSize="3" fontWeight="700" fill={a}>{name}</text>
        <text x="12" y="30" fontSize="10" fontWeight="900" fill="#134e4a">{mo}월</text>
        <text x="12" y="40" fontSize="3.5" fontWeight="500" fill={a}>진료안내</text>
        <rect x="8" y="48" width="74" height="72" rx="5" fill="white" stroke="#99f6e4" strokeWidth="0.4" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={14 + i * 9.5} y="58" textAnchor="middle" fontSize="2.2" fontWeight="700" fill={i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#94a3b8'}>{d}</text>
        ))}
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 14 + col * 9.5, cy = 66 + row * 10;
          return <g key={`${row}-${col}`}>
            {closed && <circle cx={cx} cy={cy} r="3.5" fill={c} fillOpacity="0.12" />}
            {short && <circle cx={cx} cy={cy} r="3.5" fill="#fbbf24" fillOpacity="0.15" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="2.8" fontWeight={closed || short ? '700' : '400'} fill={closed ? c : short ? '#d97706' : col === 0 ? '#ef4444' : '#475569'}>{day}</text>
          </g>;
        }))}
        <rect x="86" y="48" width="28" height="34" rx="4" fill={c} fillOpacity="0.06" />
        <text x="100" y="60" textAnchor="middle" fontSize="2.2" fontWeight="700" fill={a}>진료시간</text>
        <text x="100" y="68" textAnchor="middle" fontSize="2" fill="#475569">평일</text>
        <text x="100" y="74" textAnchor="middle" fontSize="2.2" fontWeight="600" fill="#1e293b">09:30~18:00</text>
        <rect x="86" y="86" width="28" height="34" rx="4" fill="white" stroke="#99f6e4" strokeWidth="0.3" />
        <circle cx="92" cy="98" r="3" fill={c} fillOpacity="0.12" />
        <text x="100" y="100" fontSize="2.2" fill="#64748b">휴진</text>
        <circle cx="92" cy="108" r="3" fill="#fbbf24" fillOpacity="0.15" />
        <text x="100" y="110" fontSize="2.2" fill="#64748b">단축</text>
        <text x="60" y="140" textAnchor="middle" fontSize="2.8" fontWeight="600" fill={a}>{name}</text>
      </>);
    }
    if (hint === 'cal_glass') {
      // 11) Glass modern: frosted glass card on subtle gradient, thin border, rounded corners
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill={t.bg} />
        <rect x="0" y="0" width="120" height="80" rx="6" fill={c} fillOpacity="0.06" />
        <rect x="8" y="8" width="104" height="144" rx="10" fill="white" fillOpacity="0.75" stroke={c} strokeWidth="0.4" strokeOpacity="0.15" filter={`url(#shadow_${t.id})`} />
        <text x="60" y="24" textAnchor="middle" fontSize="3" fontWeight="600" fill={a}>{name}</text>
        <text x="60" y="42" textAnchor="middle" fontSize="12" fontWeight="900" fill={c}>{mo}월</text>
        <text x="60" y="52" textAnchor="middle" fontSize="3.5" fontWeight="500" fill={a} letterSpacing="1.5">진료일정</text>
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={18 + i * 13} y="66" textAnchor="middle" fontSize="2.5" fontWeight="700" fill={i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : c}>{d}</text>
        ))}
        <line x1="14" y1="69" x2="106" y2="69" stroke={c} strokeWidth="0.15" strokeOpacity="0.2" />
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 18 + col * 13, cy = 78 + row * 10;
          return <g key={`${row}-${col}`}>
            {isRunStart(day, col) && closedRunLength(day, col) > 1 && <rect x={cx - 5} y={cy - 4} width={13 * (closedRunLength(day, col) - 1) + 10} height="8" rx="4" fill={c} fillOpacity="0.08" />}
            {isRunStart(day, col) && closedRunLength(day, col) === 1 && <circle cx={cx} cy={cy} r="4" fill={c} fillOpacity="0.08" />}
            {short && <circle cx={cx} cy={cy} r="4" fill="#fbbf24" fillOpacity="0.12" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="3" fontWeight={closed || short ? '700' : '400'} fill={closed ? c : short ? '#d97706' : col === 0 ? '#ef4444' : '#475569'}>{day}</text>
          </g>;
        }))}
        <circle cx="30" cy="136" r="2.5" fill={c} fillOpacity="0.1" />
        <text x="36" y="138" fontSize="2.5" fontWeight="600" fill={a}>휴진</text>
        <circle cx="56" cy="136" r="2.5" fill="#fbbf24" fillOpacity="0.15" />
        <text x="62" y="138" fontSize="2.5" fontWeight="600" fill="#92400e">단축</text>
        <text x="60" y="150" textAnchor="middle" fontSize="2.8" fontWeight="600" fill={a}>{name}</text>
      </>);
    }
    if (hint === 'cal_sage') {
      // 12) Sage natural: muted sage green, organic rounded shapes, soft shadows
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f1f5f1" />
        <ellipse cx="60" cy="0" rx="70" ry="30" fill={c} fillOpacity="0.08" />
        <text x="60" y="16" textAnchor="middle" fontSize="3" fontWeight="600" fill={a}>{name}</text>
        <text x="60" y="34" textAnchor="middle" fontSize="12" fontWeight="900" fill="#1a3c32">{mo}월</text>
        <text x="60" y="44" textAnchor="middle" fontSize="3.5" fontWeight="500" fill={c} letterSpacing="1.5">진료일정</text>
        <rect x="10" y="52" width="100" height="76" rx="10" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={18 + i * 13} y="64" textAnchor="middle" fontSize="2.5" fontWeight="700" fill={i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : c}>{d}</text>
        ))}
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 18 + col * 13, cy = 74 + row * 10;
          return <g key={`${row}-${col}`}>
            {closed && <rect x={cx - 5} y={cy - 4.5} width="10" height="9" rx="4.5" fill={c} fillOpacity="0.12" />}
            {short && <rect x={cx - 5} y={cy - 4.5} width="10" height="9" rx="4.5" fill="#fbbf24" fillOpacity="0.12" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="3" fontWeight={closed || short ? '700' : '400'} fill={closed ? '#1a3c32' : short ? '#d97706' : col === 0 ? '#ef4444' : '#374151'}>{day}</text>
          </g>;
        }))}
        <rect x="24" y="134" width="8" height="6" rx="3" fill={c} fillOpacity="0.12" />
        <text x="36" y="139" fontSize="2.5" fontWeight="600" fill={c}>휴진</text>
        <rect x="50" y="134" width="8" height="6" rx="3" fill="#fbbf24" fillOpacity="0.15" />
        <text x="62" y="139" fontSize="2.5" fontWeight="600" fill="#92400e">단축</text>
        <text x="60" y="154" textAnchor="middle" fontSize="2.8" fontWeight="600" fill={c}>{name}</text>
      </>);
    }

    if (hint === 'card') {
      return wrap(<>
        {/* 상단 컬러 리본 */}
        <rect x="0" y="0" width="120" height="20" rx="6" fill={c} fillOpacity="0.9" />
        <rect x="0" y="14" width="120" height="6" fill={c} fillOpacity="0.9" />
        <text x="60" y="13" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white" letterSpacing="0.5">{name}</text>
        <text x="60" y="32" textAnchor="middle" fontSize="7" fontWeight="800" fill={c}>{mo}월 휴진 안내</text>
        {/* 날짜 카드 2개 — 윗면 둥근 */}
        <rect x="10" y="40" width="46" height="42" rx="8" fill="white" fillOpacity="0.95" filter={`url(#shadow_${t.id})`} stroke={c} strokeWidth="0.5" strokeOpacity="0.2" />
        <text x="33" y="56" textAnchor="middle" fontSize="18" fontWeight="900" fill={c}>9</text>
        <rect x="16" y="66" width="34" height="8" rx="4" fill={c} fillOpacity="0.1" />
        <text x="33" y="72" textAnchor="middle" fontSize="3" fontWeight="700" fill={c}>월요일 휴진</text>
        <rect x="64" y="40" width="46" height="42" rx="8" fill="white" fillOpacity="0.95" filter={`url(#shadow_${t.id})`} stroke="#ef4444" strokeWidth="0.5" strokeOpacity="0.2" />
        <text x="87" y="56" textAnchor="middle" fontSize="18" fontWeight="900" fill="#ef4444">15</text>
        <rect x="70" y="66" width="34" height="8" rx="4" fill="#ef4444" fillOpacity="0.1" />
        <text x="87" y="72" textAnchor="middle" fontSize="3" fontWeight="700" fill="#ef4444">일요일 휴진</text>
        {/* 단축진료 배지 — 아이콘+텍스트 */}
        <rect x="10" y="88" width="100" height="16" rx="8" fill="#fffbeb" stroke="#f59e0b" strokeOpacity="0.3" strokeWidth="0.5" />
        <rect x="14" y="91" width="10" height="10" rx="5" fill="#f59e0b" fillOpacity="0.2" />
        <text x="19" y="98" textAnchor="middle" fontSize="4" fontWeight="700" fill="#d97706">!</text>
        <text x="62" y="98" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#92400e">22일 (토) 단축 10:00~14:00</text>
        {/* 하단 정보 + CTA */}
        <rect x="10" y="110" width="100" height="18" rx="5" fill={c} fillOpacity="0.04" />
        <text x="60" y="121" textAnchor="middle" fontSize="3.5" fill="#64748b">양해 부탁드립니다</text>
        <rect x="30" y="136" width="60" height="14" rx="7" fill={c} />
        <text x="60" y="145" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white">예약하기</text>
      </>);
    }
    if (hint === 'highlight') {
      return wrap(<>
        {/* 좌상 컬러 블록 장식 */}
        <rect x="0" y="0" width="40" height="8" rx="4" fill={c} fillOpacity="0.15" />
        <rect x="0" y="0" width="8" height="40" rx="4" fill={c} fillOpacity="0.1" />
        <text x="60" y="16" textAnchor="middle" fontSize="4" fontWeight="700" fill={a} letterSpacing="0.5">{name}</text>
        {/* 대형 날짜 원형 강조 */}
        <circle cx="38" cy="56" r="22" fill={c} fillOpacity="0.08" />
        <circle cx="82" cy="56" r="22" fill={c} fillOpacity="0.08" />
        <text x="38" y="56" textAnchor="middle" fontSize="20" fontWeight="900" fill={c}>9</text>
        <text x="60" y="48" textAnchor="middle" fontSize="6" fontWeight="300" fill={a}>/</text>
        <text x="82" y="56" textAnchor="middle" fontSize="20" fontWeight="900" fill={c}>15</text>
        <text x="60" y="76" textAnchor="middle" fontSize="5" fontWeight="700" fill={c}>{mo}월 휴진일</text>
        {/* 단축진료 스트라이프 배지 */}
        <rect x="14" y="82" width="92" height="14" rx="7" fill="#fffbeb" stroke="#f59e0b" strokeWidth="0.4" strokeOpacity="0.4" />
        <text x="60" y="91" textAnchor="middle" fontSize="4" fontWeight="700" fill="#92400e">22일 단축진료 10:00~14:00</text>
        {/* 진료시간 — 3열 카드 */}
        {[{x:10,w:32,label:'평일',time:'09:30~18:00'},{x:44,w:32,label:'토요일',time:'09:30~14:00'},{x:78,w:32,label:'점심',time:'13:00~14:00'}].map(({x,w,label,time}) => (
          <g key={label}>
            <rect x={x} y="102" width={w} height="26" rx="5" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
            <text x={x+w/2} y="113" textAnchor="middle" fontSize="2.8" fontWeight="700" fill={c}>{label}</text>
            <text x={x+w/2} y="122" textAnchor="middle" fontSize="2.5" fill="#475569">{time}</text>
          </g>
        ))}
        {/* 하단 */}
        <text x="60" y="146" textAnchor="middle" fontSize="3" fill="#94a3b8">양해 부탁드립니다</text>
      </>);
    }
    if (hint === 'week') {
      // 수평 아코디언 탭 — 상단 그라데이션 바 + 탭 스트립
      return wrap(<>
        {/* 상단 컬러 배너 */}
        <rect x="0" y="0" width="120" height="28" rx="6" fill={c} fillOpacity="0.85" />
        <rect x="0" y="22" width="120" height="6" fill={c} fillOpacity="0.85" />
        <text x="60" y="12" textAnchor="middle" fontSize="3.2" fontWeight="600" fill="white" fillOpacity="0.8">{name}</text>
        <text x="60" y="24" textAnchor="middle" fontSize="6" fontWeight="800" fill="white">{mo}월 셋째 주</text>
        {/* 7개 수직 탭 스트립 */}
        {['일','월','화','수','목','금','토'].map((d, i) => {
          const isClosed = i === 3;
          const isSun = i === 0;
          const tx = 8 + i * 15;
          const tabH = isClosed ? 105 : 88;
          const tabY = 34;
          return <g key={d}>
            <rect x={tx} y={tabY} width="14" height={tabH} rx="4" fill={isClosed ? c : 'white'} fillOpacity={isClosed ? 0.12 : 0.95} stroke={isClosed ? c : '#e2e8f0'} strokeWidth={isClosed ? '1' : '0.4'} filter={`url(#shadow_${t.id})`} />
            {/* 탭 상단 컬러 도트 */}
            <circle cx={tx + 7} cy={tabY + 8} r="5" fill={isSun ? '#fef2f2' : isClosed ? c : '#f1f5f9'} fillOpacity={isClosed ? 0.2 : 1} />
            <text x={tx + 7} y={tabY + 10} textAnchor="middle" fontSize="3" fontWeight="700" fill={isSun ? '#ef4444' : isClosed ? c : '#94a3b8'}>{d}</text>
            {/* 날짜 */}
            <text x={tx + 7} y={tabY + 28} textAnchor="middle" fontSize="6.5" fontWeight={isClosed ? '900' : '500'} fill={isClosed ? c : isSun ? '#ef4444' : '#64748b'}>{15 + i}</text>
            {isClosed && <>
              <line x1={tx + 2} y1={tabY + 34} x2={tx + 12} y2={tabY + 34} stroke={c} strokeWidth="0.4" strokeOpacity="0.3" />
              <rect x={tx + 2} y={tabY + 38} width="10" height="7" rx="3.5" fill={c} fillOpacity="0.15" />
              <text x={tx + 7} y={tabY + 43.5} textAnchor="middle" fontSize="2.5" fontWeight="700" fill={c}>휴진</text>
              <text x={tx + 7} y={tabY + 56} textAnchor="middle" fontSize="1.8" fill={c} fillOpacity="0.5">종일</text>
            </>}
          </g>;
        })}
        {/* 하단 컬러 바 */}
        <rect x="0" y="148" width="120" height="12" rx="6" fill={c} fillOpacity="0.06" />
        <text x="60" y="156" textAnchor="middle" fontSize="2.8" fill="#94a3b8">양해 부탁드립니다</text>
      </>);
    }
    if (hint === 'wk_bar') {
      // 계단식 피라미드 — 도트 패턴 배경
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f8fafc" />
        {/* 도트 패턴 배경 */}
        {Array.from({length: 8}, (_, r) => Array.from({length: 6}, (__, ci) => <circle key={`d${r}${ci}`} cx={10 + ci * 20} cy={10 + r * 20} r="0.8" fill={c} fillOpacity="0.06" />))}
        <text x="60" y="16" textAnchor="middle" fontSize="4" fontWeight="600" fill={a}>{name}</text>
        <text x="60" y="30" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{mo}월 셋째 주</text>
        {/* 7개 계단 스텝 (피라미드) */}
        {['일','월','화','수','목','금','토'].map((d, i) => {
          const isClosed = i === 3;
          const isSun = i === 0;
          // 피라미드: 높이가 가운데로 갈수록 높음
          const heights = [50, 60, 70, 80, 70, 60, 50];
          const stepH = heights[i];
          const stepX = 8 + i * 15;
          const stepY = 130 - stepH;
          return <g key={d}>
            <rect x={stepX} y={stepY} width="14" height={stepH} rx="2" fill={isClosed ? c : isSun ? '#fef2f2' : '#f1f5f9'} fillOpacity={isClosed ? 0.2 : 1} stroke={isClosed ? c : '#e2e8f0'} strokeWidth={isClosed ? '0.8' : '0.3'} />
            {isClosed && <rect x={stepX} y={stepY} width="14" height={stepH} rx="2" fill={c} fillOpacity="0.06">
              <animate attributeName="fillOpacity" values="0.04;0.1;0.04" dur="2s" repeatCount="indefinite" />
            </rect>}
            {/* 요일 텍스트 상단 */}
            <text x={stepX + 7} y={stepY + 10} textAnchor="middle" fontSize="2.8" fontWeight="700" fill={isSun ? '#ef4444' : isClosed ? c : '#94a3b8'}>{d}</text>
            {/* 날짜 */}
            <text x={stepX + 7} y={stepY + 24} textAnchor="middle" fontSize="5" fontWeight={isClosed ? '800' : '500'} fill={isClosed ? c : isSun ? '#ef4444' : '#475569'}>{15 + i}</text>
            {isClosed && <>
              <rect x={stepX + 2} y={stepY + 28} width="10" height="5" rx="2.5" fill={c} fillOpacity="0.15" />
              <text x={stepX + 7} y={stepY + 32} textAnchor="middle" fontSize="2" fontWeight="700" fill={c}>휴진</text>
            </>}
          </g>;
        })}
        {/* 하단 베이스 라인 */}
        <line x1="8" y1="131" x2="113" y2="131" stroke="#e2e8f0" strokeWidth="0.5" />
        <text x="60" y="145" textAnchor="middle" fontSize="3" fontWeight="600" fill="#64748b">진료시간 09:30~18:00</text>
        <text x="60" y="155" textAnchor="middle" fontSize="2.8" fill="#94a3b8">{name}</text>
      </>);
    }
    if (hint === 'wk_cards') {
      // 흩어진 플로팅 회전 카드 — 핀보드 스타일
      const rotations = [-6, 3, -4, 5, -3, 7, -8];
      const positions = [
        {x: 8, y: 34}, {x: 38, y: 30}, {x: 72, y: 36},
        {x: 10, y: 68}, {x: 44, y: 72}, {x: 78, y: 66},
        {x: 40, y: 104}
      ];
      return wrap(<>
        {/* 코르크보드 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f5e6d3" />
        <rect x="2" y="2" width="116" height="156" rx="5" fill="#ede0cf" stroke="#c9a882" strokeWidth="0.5" />
        {/* 타이틀 — 포스트잇 스타일 */}
        <rect x="24" y="4" width="72" height="20" rx="1" fill="#fef08a" fillOpacity="0.85" filter={`url(#shadow_${t.id})`} transform="rotate(-1 60 14)" />
        <text x="60" y="14" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="#78350f">{name}</text>
        <text x="60" y="22" textAnchor="middle" fontSize="2.8" fontWeight="500" fill="#92400e">{mo}월 셋째 주 진료일정</text>
        {/* 7장의 개별 요일 카드 + 핀 */}
        {['일','월','화','수','목','금','토'].map((d, i) => {
          const isClosed = i === 3;
          const isSun = i === 0;
          const pos = positions[i];
          const rot = rotations[i];
          const pinColors = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ec4899','#06b6d4'];
          return <g key={d} transform={`rotate(${rot} ${pos.x + 18} ${pos.y + 14})`}>
            <rect x={pos.x} y={pos.y} width="36" height="28" rx="2" fill={isClosed ? '#fff1f2' : 'white'} fillOpacity="0.95" filter={`url(#shadow_${t.id})`} stroke={isClosed ? c : '#d6d3d1'} strokeWidth={isClosed ? '0.6' : '0.3'} />
            {/* 핀 */}
            <circle cx={pos.x + 18} cy={pos.y + 1} r="2.5" fill={pinColors[i]} fillOpacity="0.7" />
            <circle cx={pos.x + 18} cy={pos.y + 1} r="1" fill="white" fillOpacity="0.5" />
            <text x={pos.x + 18} y={pos.y + 12} textAnchor="middle" fontSize="2.8" fontWeight="700" fill={isSun ? '#ef4444' : isClosed ? c : '#78716c'}>{d}</text>
            <text x={pos.x + 18} y={pos.y + 22} textAnchor="middle" fontSize="7" fontWeight={isClosed ? '800' : '500'} fill={isClosed ? c : isSun ? '#ef4444' : '#475569'}>{15 + i}</text>
            {isClosed && <text x={pos.x + 18} y={pos.y + 27} textAnchor="middle" fontSize="2" fontWeight="700" fill={c}>휴진</text>}
          </g>;
        })}
        {/* 하단 */}
        <text x="60" y="148" textAnchor="middle" fontSize="3" fontWeight="600" fill="#78350f">착오 없으시길 바랍니다</text>
        <text x="60" y="156" textAnchor="middle" fontSize="2.8" fill="#92400e">{name}</text>
      </>);
    }
    if (hint === 'wk_timeline') {
      // 수묵화 한국풍 스타일 — 전통 먹 브러시 스트로크
      return wrap(<>
        {/* 한지 느낌 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f0ece4" />
        {/* 수묵화 산 (하단) — 3단 레이어 */}
        <path d="M0,125 Q10,108 25,118 Q40,100 55,115 Q70,98 85,112 Q100,102 120,125 L120,160 L0,160 Z" fill="#3d3d3d" fillOpacity="0.12" />
        <path d="M0,135 Q15,115 35,128 Q50,108 65,125 Q80,108 95,122 Q110,112 120,135 L120,160 L0,160 Z" fill="#2d2d2d" fillOpacity="0.18" />
        <path d="M0,145 Q20,132 40,142 Q60,125 80,138 Q100,128 120,145 L120,160 L0,160 Z" fill="#1a1a1a" fillOpacity="0.22" />
        {/* 먹 브러시 수직선 장식 */}
        <line x1="14" y1="8" x2="14" y2="42" stroke="#1a1a1a" strokeWidth="1.5" strokeOpacity="0.15" strokeLinecap="round" />
        <line x1="106" y1="8" x2="106" y2="42" stroke="#1a1a1a" strokeWidth="1" strokeOpacity="0.12" strokeLinecap="round" />
        {/* 전통 도장 */}
        <rect x="96" y="8" width="14" height="14" rx="1" fill="#dc2626" fillOpacity="0.25" />
        <text x="103" y="18" textAnchor="middle" fontSize="6" fontWeight="900" fill="#dc2626" fillOpacity="0.35">印</text>
        {/* 타이틀 */}
        <text x="60" y="22" textAnchor="middle" fontSize="4" fontWeight="700" fill="#e8634a">대체공휴일</text>
        <text x="60" y="38" textAnchor="middle" fontSize="10" fontWeight="900" fill="#1a1a1a">휴무 안내</text>
        <text x="60" y="50" textAnchor="middle" fontSize="2.8" fill="#525252">이용에 착오 없으시길 바랍니다</text>
        {/* 미니 달력 카드 */}
        <rect x="14" y="58" width="92" height="52" rx="5" fill="white" fillOpacity="0.95" filter={`url(#shadow_${t.id})`} />
        {/* 달력 링 */}
        {[30,42,54,66,78,90].map(x => <rect key={x} x={x} y="55" width="2" height="5" rx="1" fill="#94a3b8" />)}
        {/* 3일 표시 */}
        {[{d:'일요일',n:1,status:'휴무',isClosed:true},{d:'월요일',n:2,status:'휴무',isClosed:true},{d:'화요일',n:3,status:'정상 영업',isClosed:false}].map((item,i) => {
          const cx = 30 + i * 30;
          return <g key={i}>
            <text x={cx} y="68" textAnchor="middle" fontSize="2.5" fontWeight="600" fill={item.isClosed ? '#e8634a' : '#525252'}>{item.d}</text>
            <text x={cx} y="84" textAnchor="middle" fontSize="12" fontWeight="900" fill={item.isClosed ? '#e8634a' : '#1a1a1a'}>{item.n}</text>
            <text x={cx} y="98" textAnchor="middle" fontSize="3" fontWeight="700" fill={item.isClosed ? '#e8634a' : '#1a1a1a'}>{item.status}</text>
            {i < 2 && <line x1={cx + 14} y1="65" x2={cx + 14} y2="102" stroke="#e5e7eb" strokeWidth="0.4" />}
          </g>;
        })}
        {/* 병원명 */}
        <text x="102" y="10" textAnchor="end" fontSize="2.8" fontWeight="600" fill="#525252">{name}</text>
      </>);
    }
    if (hint === 'wk_pill') {
      // 벚꽃 봄 스타일 — 꽃잎 SVG + 가지
      return wrap(<>
        {/* 핑크 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#fdf2f8" />
        {/* 좌상 벚꽃 가지 */}
        <path d="M0,20 Q10,18 20,22 Q28,24 34,20" fill="none" stroke="#d4a89a" strokeWidth="0.8" strokeOpacity="0.4" />
        {[{x:8,y:14},{x:20,y:18},{x:32,y:16}].map((p,i) => <g key={`lf${i}`}>
          {[0,72,144,216,288].map(deg => <ellipse key={deg} cx={p.x + Math.cos(deg*Math.PI/180)*2.5} cy={p.y + Math.sin(deg*Math.PI/180)*2.5} rx="2" ry="1" fill="#f9a8d4" fillOpacity={0.55 - i*0.08} transform={`rotate(${deg} ${p.x + Math.cos(deg*Math.PI/180)*2.5} ${p.y + Math.sin(deg*Math.PI/180)*2.5})`} />)}
          <circle cx={p.x} cy={p.y} r="1" fill="#fbbf24" fillOpacity="0.4" />
        </g>)}
        {/* 우하 벚꽃 */}
        <path d="M120,140 Q110,142 100,138 Q92,136 86,140" fill="none" stroke="#d4a89a" strokeWidth="0.6" strokeOpacity="0.3" />
        {[{x:112,y:136},{x:100,y:134},{x:90,y:138}].map((p,i) => <g key={`rf${i}`}>
          {[0,72,144,216,288].map(deg => <ellipse key={deg} cx={p.x + Math.cos(deg*Math.PI/180)*2} cy={p.y + Math.sin(deg*Math.PI/180)*2} rx="1.5" ry="0.8" fill="#fbcfe8" fillOpacity={0.45 - i*0.08} transform={`rotate(${deg} ${p.x + Math.cos(deg*Math.PI/180)*2} ${p.y + Math.sin(deg*Math.PI/180)*2})`} />)}
          <circle cx={p.x} cy={p.y} r="0.8" fill="#fbbf24" fillOpacity="0.3" />
        </g>)}
        {/* 흩날리는 꽃잎 */}
        <ellipse cx="105" cy="30" rx="2" ry="0.8" fill="#f9a8d4" fillOpacity="0.4" transform="rotate(35 105 30)" />
        <ellipse cx="14" cy="130" rx="1.8" ry="0.7" fill="#fbcfe8" fillOpacity="0.35" transform="rotate(-25 14 130)" />
        {/* 타이틀 */}
        <text x="60" y="20" textAnchor="middle" fontSize="3" fontWeight="600" fill={a}>{name}</text>
        <text x="60" y="34" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{mo}월 셋째 주</text>
        <text x="60" y="43" textAnchor="middle" fontSize="3" fontWeight="500" fill="#be185d">진료 안내</text>
        {/* 7개 필 카드 */}
        {['일','월','화','수','목','금','토'].map((d, i) => {
          const isClosed = i === 3;
          const isSun = i === 0;
          const y = 50 + i * 13;
          return <g key={d}>
            <rect x="14" y={y} width="92" height="11" rx="5.5" fill={isClosed ? '#fce7f3' : 'white'} fillOpacity="0.95" filter={`url(#shadow_${t.id})`} stroke={isClosed ? c : '#f9a8d4'} strokeWidth={isClosed ? '0.8' : '0.3'} />
            <circle cx="22" cy={y + 5.5} r="3.5" fill={isSun ? '#fecdd3' : isClosed ? c : '#fdf2f8'} fillOpacity={isClosed ? 0.2 : 1} />
            <text x="22" y={y + 7.5} textAnchor="middle" fontSize="3" fontWeight="700" fill={isSun ? '#e11d48' : isClosed ? c : '#9ca3af'}>{d}</text>
            <text x="46" y={y + 8} fontSize="4" fontWeight={isClosed ? '800' : '500'} fill={isClosed ? c : '#475569'}>{15+i}일</text>
            {isClosed && <text x="96" y={y + 8} textAnchor="end" fontSize="3" fontWeight="700" fill={c}>휴진</text>}
            {!isClosed && !isSun && <text x="96" y={y + 7} textAnchor="end" fontSize="2.5" fill="#d1d5db">09:30~18:00</text>}
          </g>;
        })}
      </>);
    }
    if (hint === 'wk_flag') {
      // 빌보드/도로 표지판 — 리벳 디테일 + 반사 패턴
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#cbd5e1" />
        {/* 하이웨이 사인 — 라운드 + 리벳 */}
        <rect x="8" y="6" width="104" height="76" rx="8" fill="#115e59" filter={`url(#shadow_${t.id})`} />
        <rect x="10" y="8" width="100" height="72" rx="7" fill="none" stroke="white" strokeWidth="0.6" strokeOpacity="0.4" />
        {/* 리벳 (코너 볼트) */}
        {[{x:14,y:12},{x:106,y:12},{x:14,y:76},{x:106,y:76}].map((p,i) => <g key={i}><circle cx={p.x} cy={p.y} r="2" fill="#94a3b8" fillOpacity="0.5" /><circle cx={p.x} cy={p.y} r="0.8" fill="#64748b" /></g>)}
        {/* 사인 텍스트 */}
        <text x="60" y="26" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white" letterSpacing="1">{name}</text>
        <line x1="22" y1="30" x2="98" y2="30" stroke="white" strokeWidth="0.3" strokeOpacity="0.3" />
        <text x="60" y="42" textAnchor="middle" fontSize="6" fontWeight="900" fill="white">진료시간 안내</text>
        {/* 도로 표지판 스타일 행 */}
        {[
          {label:'평 일', time:'09:30~18:30'},
          {label:'토요일', time:'09:30~14:00'},
          {label:'점 심', time:'13:00~14:00'},
        ].map((row, i) => {
          const y = 50 + i * 10;
          return <g key={i}>
            <text x="28" y={y} fontSize="2.8" fontWeight="600" fill="#99f6e4">{row.label}</text>
            <text x="92" y={y} textAnchor="end" fontSize="3" fontWeight="700" fill="white">{row.time}</text>
            {i < 2 && <line x1="22" y1={y + 3} x2="98" y2={y + 3} stroke="white" strokeWidth="0.2" strokeOpacity="0.2" />}
          </g>;
        })}
        {/* 기둥 디테일 */}
        <rect x="36" y="80" width="4" height="30" rx="1" fill="#94a3b8" />
        <rect x="80" y="80" width="4" height="30" rx="1" fill="#94a3b8" />
        <rect x="36" y="80" width="4" height="3" rx="1" fill="#64748b" />
        <rect x="80" y="80" width="4" height="3" rx="1" fill="#64748b" />
        {/* 하단 보조 정보 */}
        <rect x="16" y="116" width="88" height="20" rx="4" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
        <text x="60" y="128" textAnchor="middle" fontSize="3" fontWeight="600" fill="#115e59">수요일 정기휴진</text>
        <text x="60" y="135" textAnchor="middle" fontSize="2.5" fill="#64748b">공휴일 휴진</text>
        <text x="60" y="150" textAnchor="middle" fontSize="3" fontWeight="700" fill="#115e59">{name}</text>
      </>);
    }
    if (hint === 'wk_neon') {
      // 눈꽃 겨울 — 눈 내리는 효과 + 아이스 프레임
      return wrap(<>
        {/* 아이시 블루 그라데이션 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#dbeafe" />
        <rect x="0" y="80" width="120" height="80" rx="6" fill="#eff6ff" />
        {/* 눈 내리는 효과 (다양한 크기) */}
        {[{x:10,y:8,r:3},{x:30,y:14,r:2},{x:50,y:6,r:2.5},{x:75,y:12,r:1.8},{x:95,y:10,r:2.5},{x:110,y:18,r:1.5},{x:18,y:92,r:2},{x:102,y:88,r:1.8},{x:8,y:120,r:2.2},{x:112,y:130,r:1.5}].map((s,i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="white" fillOpacity={0.7 - i*0.04} />)}
        {/* 아이스 프레임 */}
        <rect x="6" y="4" width="108" height="152" rx="6" fill="none" stroke="#93c5fd" strokeWidth="0.8" strokeOpacity="0.3" strokeDasharray="4 2" />
        {/* 타이틀 */}
        <text x="60" y="20" textAnchor="middle" fontSize="3" fontWeight="600" fill="#0369a1">{name}</text>
        <text x="60" y="34" textAnchor="middle" fontSize="8" fontWeight="900" fill="#0c4a6e">{mo}월 셋째 주</text>
        <text x="60" y="43" textAnchor="middle" fontSize="3" fontWeight="500" fill="#0369a1">진료 안내</text>
        {/* 주간 카드 */}
        <rect x="12" y="50" width="96" height="65" rx="6" fill="white" fillOpacity="0.85" stroke="#bae6fd" strokeWidth="0.5" filter={`url(#shadow_${t.id})`} />
        {['일','월','화','수','목','금','토'].map((d, i) => {
          const isClosed = i === 3;
          const isSun = i === 0;
          const y = 56 + i * 8;
          return <g key={d}>
            <text x="22" y={y + 4} textAnchor="middle" fontSize="2.8" fontWeight="700" fill={isSun ? '#ef4444' : isClosed ? '#0ea5e9' : '#64748b'}>{d}</text>
            <text x="44" y={y + 4} fontSize="3.5" fontWeight={isClosed ? '800' : '400'} fill={isClosed ? '#0c4a6e' : '#475569'}>{15+i}일</text>
            {isClosed && <><rect x="64" y={y - 2} width="18" height="7" rx="3.5" fill="#0ea5e9" fillOpacity="0.15" stroke="#0ea5e9" strokeWidth="0.3" /><text x="73" y={y + 3} textAnchor="middle" fontSize="2.5" fontWeight="700" fill="#0ea5e9">휴진</text></>}
          </g>;
        })}
        {/* 하단 */}
        <rect x="20" y="122" width="80" height="16" rx="5" fill="white" fillOpacity="0.7" stroke="#bae6fd" strokeWidth="0.3" />
        <text x="60" y="131" textAnchor="middle" fontSize="3" fontWeight="600" fill="#0c4a6e">진료시간 09:30~18:00</text>
        <text x="60" y="152" textAnchor="middle" fontSize="2.8" fontWeight="600" fill="#0369a1">{name}</text>
      </>);
    }
    if (hint === 'highlight') {
      // 기본 하이라이트 폴백
      return wrap(<>
        <text x="60" y="13" textAnchor="middle" fontSize="4" fontWeight="600" fill={a} letterSpacing="0.5">{name}</text>
        <rect x="12" y="20" width="96" height="42" rx="8" fill={c} fillOpacity="0.08" />
        <text x="60" y="36" textAnchor="middle" fontSize="14" fontWeight="900" fill={c} letterSpacing="2">9 / 15</text>
        <rect x="35" y="44" width="50" height="10" rx="5" fill={c} fillOpacity="0.15" />
        <text x="60" y="51" textAnchor="middle" fontSize="4.5" fontWeight="700" fill={c}>{mo}월 휴진일</text>
        <rect x="15" y="68" width="90" height="14" rx="4" fill="#fef3c7" />
        <text x="60" y="77" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="#92400e">22일 단축진료 10:00~14:00</text>
      </>);
    }
    if (hint === 'hl_bignum') {
      // 거대 숫자 + 대각선 스플릿 배경
      return wrap(<>
        <defs>
          <clipPath id={`diagClip_${t.id}`}>
            <path d="M0,0 L120,0 L120,100 L0,160 Z" />
          </clipPath>
        </defs>
        {/* 대각선 스플릿: 다크 절반 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#1e293b" />
        {/* 따뜻한/프라이머리 절반 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill={c} clipPath={`url(#diagClip_${t.id})`} />
        {/* 대각선 경계 라인 */}
        <line x1="0" y1="160" x2="120" y2="100" stroke="white" strokeWidth="0.5" strokeOpacity="0.3" />
        {/* 거대 날짜 숫자 - 스플릿 라인 위에 겹침 */}
        <text x="60" y="110" textAnchor="middle" fontSize="48" fontWeight="900" fill="white" fillOpacity="0.95">9</text>
        {/* 상단 정보 */}
        <text x="16" y="18" fontSize="3.5" fontWeight="700" fill="white" fillOpacity="0.9">{mo}월</text>
        <text x="16" y="28" fontSize="6" fontWeight="900" fill="white">휴진 안내</text>
        <text x="104" y="18" textAnchor="end" fontSize="2.8" fontWeight="600" fill="white" fillOpacity="0.7">{name}</text>
        {/* 하단 정보 */}
        <text x="60" y="138" textAnchor="middle" fontSize="4" fontWeight="700" fill="white" fillOpacity="0.8">{mo}월 9일 (수) 휴진</text>
        <text x="60" y="152" textAnchor="middle" fontSize="2.8" fill="white" fillOpacity="0.5">착오 없으시길 바랍니다</text>
      </>);
    }
    if (hint === 'hl_stamp') {
      // 동백꽃 일러스트 프레임
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f5f0e8" />
        {/* 동백꽃 장식 (코너) */}
        <circle cx="12" cy="12" r="9" fill="#dc2626" fillOpacity="0.4" />
        <circle cx="8" cy="20" r="7" fill="#ef4444" fillOpacity="0.35" />
        <circle cx="20" cy="8" r="6" fill="#b91c1c" fillOpacity="0.35" />
        <ellipse cx="10" cy="30" rx="4" ry="7" fill="#16a34a" fillOpacity="0.25" transform="rotate(-20 10 30)" />
        <circle cx="108" cy="14" r="8" fill="#dc2626" fillOpacity="0.35" />
        <circle cx="112" cy="22" r="6" fill="#ef4444" fillOpacity="0.3" />
        <ellipse cx="104" cy="30" rx="4" ry="7" fill="#16a34a" fillOpacity="0.2" transform="rotate(20 104 30)" />
        <circle cx="10" cy="142" r="10" fill="#dc2626" fillOpacity="0.35" />
        <circle cx="22" cy="148" r="7" fill="#ef4444" fillOpacity="0.3" />
        <ellipse cx="16" cy="134" rx="4" ry="7" fill="#16a34a" fillOpacity="0.2" transform="rotate(30 16 134)" />
        <circle cx="110" cy="145" r="9" fill="#dc2626" fillOpacity="0.35" />
        <circle cx="102" cy="150" r="6" fill="#ef4444" fillOpacity="0.28" />
        <ellipse cx="106" cy="136" rx="4" ry="7" fill="#16a34a" fillOpacity="0.18" transform="rotate(-25 106 136)" />
        {/* 중앙 텍스트 박스 */}
        <rect x="18" y="36" width="84" height="80" rx="2" fill="#c4a882" fillOpacity="0.35" />
        {/* 전통 코너 프레임 */}
        <path d="M22,40 L30,40 L30,42" fill="none" stroke="white" strokeWidth="0.6" />
        <path d="M98,40 L90,40 L90,42" fill="none" stroke="white" strokeWidth="0.6" />
        <path d="M22,112 L30,112 L30,110" fill="none" stroke="white" strokeWidth="0.6" />
        <path d="M98,112 L90,112 L90,110" fill="none" stroke="white" strokeWidth="0.6" />
        {/* 텍스트 */}
        <text x="60" y="56" textAnchor="middle" fontSize="7" fontWeight="900" fill="#3f2b1a">{mo}월 2일</text>
        <text x="60" y="70" textAnchor="middle" fontSize="6" fontWeight="800" fill="#3f2b1a">대체공휴일</text>
        <text x="60" y="82" textAnchor="middle" fontSize="6" fontWeight="800" fill="#3f2b1a">진료 안내</text>
        <rect x="28" y="88" width="64" height="0.5" fill="#c4a882" />
        <text x="60" y="98" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="#8b5e3c">정상 진료</text>
        <text x="60" y="108" textAnchor="middle" fontSize="2.5" fill="#6b5744">내원하실 때 참고 부탁드립니다</text>
        {/* 로고 */}
        <text x="60" y="132" textAnchor="middle" fontSize="3" fontWeight="600" fill="#8b5e3c">{name}</text>
      </>);
    }
    if (hint === 'hl_rip') {
      // 코럴 그라데이션 + 달력
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#fecaca" />
        <rect x="0" y="0" width="120" height="80" rx="6" fill="#f97316" fillOpacity="0.8" />
        <ellipse cx="30" cy="90" rx="50" ry="30" fill="#fdb99b" fillOpacity="0.3" />
        {/* 흰 곡선 */}
        <path d="M0,55 Q40,40 80,60 Q100,68 120,52" fill="none" stroke="white" strokeWidth="0.4" strokeOpacity="0.4" />
        {/* 타이틀 */}
        <text x="60" y="24" textAnchor="middle" fontSize="10" fontWeight="900" fill="white">{mo}월 진료일정</text>
        <text x="60" y="36" textAnchor="middle" fontSize="2.8" fontWeight="500" fill="white" fillOpacity="0.85">내원 및 예약에 착오 없으시길 바랍니다</text>
        {/* 달력 카드 */}
        <rect x="12" y="44" width="96" height="88" rx="6" fill="white" fillOpacity="0.97" filter={`url(#shadow_${t.id})`} />
        <rect x="12" y="44" width="96" height="10" fill="#3f3f46" rx="6" />
        <rect x="12" y="50" width="96" height="4" fill="#3f3f46" />
        {['일','월','화','수','목','금','토'].map((d,i) => (
          <text key={d} x={20 + i * 12.5} y="52" textAnchor="middle" fontSize="2.6" fontWeight="700" fill="white">{d}</text>
        ))}
        {[0,1,2,3,4].map(row => Array.from({length:7}, (_,col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const cx = 20 + col * 12.5, cy = 64 + row * 14;
          return <g key={`${row}-${col}`}>
            <text x={cx} y={cy} textAnchor="middle" fontSize="3.5" fontWeight={closed ? '800' : '400'} fill={col === 0 ? '#ef4444' : closed ? '#ea580c' : '#1f2937'}>{day}</text>
            {closed && <><rect x={cx - 8} y={cy + 1} width="16" height="5" rx="2.5" fill="#fbbf24" /><text x={cx} y={cy + 5} textAnchor="middle" fontSize="2" fontWeight="700" fill="#78350f">정기휴진</text></>}
          </g>;
        }))}
        {/* 로고 */}
        <text x="60" y="148" textAnchor="middle" fontSize="3.2" fontWeight="700" fill="#c2410c">🦷 {name}</text>
      </>);
    }
    if (hint === 'hl_slash') {
      // 민트 모던 - 큰 글씨 강조
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f0fdfa" />
        {/* 민트 기하학 장식 */}
        <circle cx="100" cy="12" r="22" fill="#14b8a6" fillOpacity="0.12" />
        <circle cx="15" cy="150" r="18" fill="#14b8a6" fillOpacity="0.08" />
        {/* 로고 */}
        <rect x="10" y="6" width="28" height="8" rx="4" fill="#14b8a6" fillOpacity="0.1" />
        <text x="24" y="12" textAnchor="middle" fontSize="3" fontWeight="700" fill="#0d9488">{name.slice(0,4)}</text>
        {/* 타이틀 - 매우 큰 글씨 */}
        <text x="60" y="38" textAnchor="middle" fontSize="9" fontWeight="900" fill="#134e4a">{mo}월 9일~15일</text>
        <text x="60" y="54" textAnchor="middle" fontSize="11" fontWeight="900" fill="#0d9488">휴진 안내</text>
        {/* 미니 달력 카드 */}
        <rect x="14" y="64" width="92" height="44" rx="5" fill="white" stroke="#99f6e4" strokeWidth="0.5" filter={`url(#shadow_${t.id})`} />
        {[{d:'월',n:9,cls:true},{d:'화',n:10,cls:false},{d:'수',n:11,cls:false},{d:'목',n:12,cls:false},{d:'금',n:13,cls:false},{d:'토',n:14,cls:false},{d:'일',n:15,cls:true}].map((item,i) => {
          const cx = 22 + i * 12;
          return <g key={i}>
            <text x={cx} y="74" textAnchor="middle" fontSize="2.5" fontWeight="600" fill={item.cls ? '#0d9488' : '#9ca3af'}>{item.d}</text>
            {item.cls ? <circle cx={cx} cy="86" r="6" fill="#14b8a6" fillOpacity="0.15" /> : null}
            <text x={cx} y="89" textAnchor="middle" fontSize="4.5" fontWeight={item.cls ? '900' : '400'} fill={item.cls ? '#0d9488' : '#475569'}>{item.n}</text>
            {item.cls && <text x={cx} y="100" textAnchor="middle" fontSize="2" fontWeight="700" fill="#0d9488">휴진</text>}
          </g>;
        })}
        {/* 진료시간 */}
        <rect x="20" y="116" width="80" height="14" rx="5" fill="#f0fdfa" stroke="#99f6e4" strokeWidth="0.3" />
        <text x="60" y="125" textAnchor="middle" fontSize="3" fontWeight="600" fill="#0d9488">정상진료 09:30 ~ 18:00</text>
        <text x="60" y="150" textAnchor="middle" fontSize="3" fontWeight="600" fill="#0d9488">{name}</text>
      </>);
    }
    if (hint === 'hl_circle') {
      // 동심원 링 정보 디스플레이
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f8fafc" />
        <text x="60" y="16" textAnchor="middle" fontSize="4" fontWeight="700" fill={c}>{name}</text>
        <text x="60" y="26" textAnchor="middle" fontSize="3" fontWeight="500" fill="#94a3b8">진료시간 안내</text>
        {/* 동심원 아크들 — 시계 모티프 */}
        <circle cx="60" cy="80" r="48" fill="none" stroke={c} strokeWidth="0.8" strokeOpacity="0.08" />
        <circle cx="60" cy="80" r="38" fill="none" stroke={c} strokeWidth="1" strokeOpacity="0.12" />
        <circle cx="60" cy="80" r="28" fill="none" stroke={c} strokeWidth="1.2" strokeOpacity="0.18" />
        <circle cx="60" cy="80" r="18" fill={c} fillOpacity="0.06" />
        {/* 외곽 링 아크 — 평일 */}
        <path d={`M ${60 + 48 * Math.cos(-Math.PI * 0.75)} ${80 + 48 * Math.sin(-Math.PI * 0.75)} A 48 48 0 0 1 ${60 + 48 * Math.cos(-Math.PI * 0.25)} ${80 + 48 * Math.sin(-Math.PI * 0.25)}`} fill="none" stroke={c} strokeWidth="3" strokeOpacity="0.2" strokeLinecap="round" />
        {/* 중간 링 아크 — 토요일 */}
        <path d={`M ${60 + 38 * Math.cos(-Math.PI * 0.7)} ${80 + 38 * Math.sin(-Math.PI * 0.7)} A 38 38 0 0 1 ${60 + 38 * Math.cos(-Math.PI * 0.4)} ${80 + 38 * Math.sin(-Math.PI * 0.4)}`} fill="none" stroke={a} strokeWidth="2.5" strokeOpacity="0.25" strokeLinecap="round" />
        {/* 내부 링 아크 — 점심 */}
        <path d={`M ${60 + 28 * Math.cos(-Math.PI * 0.55)} ${80 + 28 * Math.sin(-Math.PI * 0.55)} A 28 28 0 0 1 ${60 + 28 * Math.cos(-Math.PI * 0.45)} ${80 + 28 * Math.sin(-Math.PI * 0.45)}`} fill="none" stroke="#f59e0b" strokeWidth="2" strokeOpacity="0.3" strokeLinecap="round" />
        {/* 중심 텍스트 */}
        <text x="60" y="78" textAnchor="middle" fontSize="5" fontWeight="800" fill={c}>진료</text>
        <text x="60" y="86" textAnchor="middle" fontSize="3" fontWeight="600" fill="#64748b">시간</text>
        {/* 링 사이 라벨들 */}
        <text x="60" y="36" textAnchor="middle" fontSize="2.5" fontWeight="600" fill={c}>평일 09:30~18:30</text>
        <text x="18" y="80" textAnchor="middle" fontSize="2" fontWeight="600" fill={a}>토 09:30</text>
        <text x="18" y="86" textAnchor="middle" fontSize="2" fontWeight="600" fill={a}>~14:00</text>
        <text x="102" y="80" textAnchor="middle" fontSize="2" fontWeight="500" fill="#f59e0b">점심</text>
        <text x="102" y="86" textAnchor="middle" fontSize="2" fontWeight="500" fill="#f59e0b">13~14</text>
        {/* 하단 */}
        <text x="60" y="140" textAnchor="middle" fontSize="3" fontWeight="600" fill="#475569">수요일 정기휴진</text>
        <text x="60" y="152" textAnchor="middle" fontSize="2.8" fontWeight="600" fill={c}>{name}</text>
      </>);
    }
    if (hint === 'hl_countdown') {
      // 플립클럭 스타일
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#1e293b" />
        {/* 골드 장식 */}
        <line x1="14" y1="10" x2="106" y2="10" stroke="#d4a853" strokeWidth="0.4" />
        <text x="60" y="24" textAnchor="middle" fontSize="3" fontWeight="600" fill="#d4a853" letterSpacing="1">{name}</text>
        <text x="60" y="38" textAnchor="middle" fontSize="4" fontWeight="500" fill="white" fillOpacity="0.7">다음 휴진까지</text>
        {/* 플립클럭 디짓 패널 3개: D - 3 */}
        {[{ch: 'D', x: 16}, {ch: '-', x: 46}, {ch: '3', x: 76}].map((panel, i) => (
          <g key={i}>
            {/* 패널 배경 */}
            <rect x={panel.x} y="46" width="28" height="44" rx="3" fill="#0f172a" stroke="#334155" strokeWidth="0.5" />
            {/* 상단 반 */}
            <rect x={panel.x} y="46" width="28" height="22" rx="3" fill="#0f172a" />
            <rect x={panel.x} y="65" width="28" height="3" fill="#0f172a" rx="0" />
            {/* 플립 분할선 */}
            <line x1={panel.x} y1="68" x2={panel.x + 28} y2="68" stroke="#1e293b" strokeWidth="1" />
            <line x1={panel.x} y1="68.5" x2={panel.x + 28} y2="68.5" stroke="#000" strokeWidth="0.3" strokeOpacity="0.3" />
            {/* 디짓 텍스트 */}
            <text x={panel.x + 14} y="75" textAnchor="middle" fontSize={panel.ch === '-' ? '20' : '24'} fontWeight="900" fill="#d4a853">{panel.ch}</text>
            {/* 좌우 힌지 */}
            {panel.ch !== '-' && <>
              <circle cx={panel.x} cy="68" r="1" fill="#334155" />
              <circle cx={panel.x + 28} cy="68" r="1" fill="#334155" />
            </>}
          </g>
        ))}
        {/* 하단 정보 */}
        <text x="60" y="104" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">{mo}월 9일 (수)</text>
        <text x="60" y="114" textAnchor="middle" fontSize="3" fontWeight="500" fill="#d4a853">정기 휴진</text>
        {/* 진료시간 */}
        <rect x="14" y="122" width="92" height="14" rx="4" fill="#d4a853" fillOpacity="0.08" />
        <text x="60" y="131" textAnchor="middle" fontSize="3" fontWeight="600" fill="#d4a853">진료시간 09:30~18:00</text>
        <line x1="14" y1="148" x2="106" y2="148" stroke="#d4a853" strokeWidth="0.2" />
        <text x="60" y="155" textAnchor="middle" fontSize="2.5" fill="#d4a853">{name}</text>
      </>);
    }
    if (hint === 'stamp' || hint === 'rip' || hint === 'slash') {
      // 공식 씰/배지 스타일
      return wrap(<>
        <text x="60" y="13" textAnchor="middle" fontSize="4" fontWeight="600" fill={a} letterSpacing="0.5">{name}</text>
        <text x="60" y="26" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={c}>{mo}월 휴진 안내</text>
        {/* 원형 씰 배지 */}
        <circle cx="60" cy="72" r="32" fill="none" stroke={c} strokeWidth="1.5" />
        <circle cx="60" cy="72" r="28" fill="none" stroke={c} strokeWidth="0.5" />
        <circle cx="60" cy="72" r="34" fill="none" stroke={c} strokeWidth="0.3" strokeDasharray="2 2" />
        {/* 씰 내부 */}
        <circle cx="60" cy="72" r="24" fill={c} fillOpacity="0.04" />
        {/* 원주 텍스트 - 상단 */}
        <text x="60" y="50" textAnchor="middle" fontSize="2.5" fontWeight="700" fill={c} letterSpacing="3">OFFICIAL NOTICE</text>
        {/* 중앙 날짜 */}
        <text x="60" y="72" textAnchor="middle" fontSize="14" fontWeight="900" fill={c}>9·15</text>
        {/* 원주 텍스트 - 하단 */}
        <text x="60" y="92" textAnchor="middle" fontSize="2.5" fontWeight="700" fill={a} letterSpacing="2">CLOSED DAYS</text>
        {/* 별 장식 */}
        <circle cx="38" cy="56" r="1" fill={c} fillOpacity="0.4" />
        <circle cx="82" cy="56" r="1" fill={c} fillOpacity="0.4" />
        <circle cx="38" cy="88" r="1" fill={c} fillOpacity="0.4" />
        <circle cx="82" cy="88" r="1" fill={c} fillOpacity="0.4" />
        {/* 하단 정보 */}
        <rect x="10" y="112" width="100" height="20" rx="5" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
        <text x="60" y="124" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#475569">양해 부탁드립니다</text>
        <text x="60" y="150" textAnchor="middle" fontSize="3" fill="#94a3b8">{name}</text>
      </>);
    }
    if (hint === 'circle' || hint === 'countdown') {
      // 게이지/미터 아크 스타일
      return wrap(<>
        <text x="60" y="13" textAnchor="middle" fontSize="4" fontWeight="600" fill={a} letterSpacing="0.5">{name}</text>
        <text x="60" y="26" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={c}>{mo}월 휴진</text>
        {/* 반원형 게이지 배경 */}
        <path d={`M 20 90 A 40 40 0 0 1 100 90`} fill="none" stroke="#e2e8f0" strokeWidth="5" strokeLinecap="round" />
        {/* 게이지 채움 아크 — stroke-dasharray */}
        <path d={`M 20 90 A 40 40 0 0 1 100 90`} fill="none" stroke={`url(#accent_${t.id})`} strokeWidth="5" strokeDasharray="50 126" strokeLinecap="round" />
        {/* 눈금 표시 */}
        {Array.from({length: 7}, (_, i) => {
          const angle = Math.PI + (i / 6) * Math.PI;
          const x1 = 60 + Math.cos(angle) * 36;
          const y1 = 90 + Math.sin(angle) * 36;
          const x2 = 60 + Math.cos(angle) * 40;
          const y2 = 90 + Math.sin(angle) * 40;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94a3b8" strokeWidth="0.5" />;
        })}
        {/* 니들 인디케이터 */}
        <line x1="60" y1="90" x2={60 + Math.cos(Math.PI + 0.4 * Math.PI) * 32} y2={90 + Math.sin(Math.PI + 0.4 * Math.PI) * 32} stroke={c} strokeWidth="1" strokeLinecap="round" />
        <circle cx="60" cy="90" r="2.5" fill={c} />
        <circle cx="60" cy="90" r="1" fill="white" />
        {/* 중앙 텍스트 */}
        <text x="60" y="82" textAnchor="middle" fontSize="14" fontWeight="900" fill={c}>D-3</text>
        <text x="60" y="106" textAnchor="middle" fontSize="4" fontWeight="600" fill={a}>휴진까지</text>
        {/* 하단 정보 */}
        <text x="60" y="130" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#475569">{mo}월 9일 (수) 휴진</text>
        <text x="60" y="150" textAnchor="middle" fontSize="3" fill="#94a3b8">{name}</text>
      </>);
    }
    // list layout — 연결된 도트 인디케이터가 있는 수직 스택
    return wrap(<>
      <text x="60" y="13" textAnchor="middle" fontSize="4" fontWeight="600" fill={a} letterSpacing="0.5">{name}</text>
      <text x="60" y="25" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={c}>{mo}월 진료 안내</text>
      {/* 수직 연결선 */}
      <line x1="22" y1="42" x2="22" y2="82" stroke="#e2e8f0" strokeWidth="0.8" />
      {[
        {d:'9일 (월)', s:'휴진', sc:'#ef4444', bg:'#fef2f2'},
        {d:'15일 (일)', s:'휴진', sc:'#ef4444', bg:'#fef2f2'},
        {d:'22일 (토)', s:'단축진료', sc:'#d97706', bg:'#fffbeb'},
      ].map(({d,s,sc,bg: bgc}, i) => (<g key={i}>
        <rect x="10" y={34 + i * 20} width="100" height="16" rx="5" fill={bgc} />
        <circle cx="22" cy={42 + i * 20} r="4" fill={sc} fillOpacity="0.15" />
        <circle cx="22" cy={42 + i * 20} r="1.5" fill={sc} />
        <text x="22" y={43.5 + i * 20} textAnchor="middle" fontSize="3.5" fontWeight="800" fill="white">{i+1}</text>
        <text x="34" y={43.5 + i * 20} fontSize="3.8" fontWeight="700" fill={sc}>{d}</text>
        <rect x="75" y={37 + i * 20} width="30" height="10" rx="5" fill={sc} fillOpacity="0.12" />
        <text x="90" y={44 + i * 20} textAnchor="middle" fontSize="3.5" fontWeight="700" fill={sc}>{s}</text>
      </g>))}
      <rect x="10" y="98" width="100" height="24" rx="5" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
      {[{y:107,t:'평일 09:30 ~ 18:00'},{y:115,t:'토요일 09:30 ~ 14:00'}].map(({y,t: txt}) => (
        <text key={y} x="60" y={y} textAnchor="middle" fontSize="3.8" fill="#475569">{txt}</text>
      ))}
      <text x="60" y="150" textAnchor="middle" fontSize="3" fill="#94a3b8">{name}</text>
    </>);
  }

  if (category === 'event') {
    const h = t.layoutHint;
    const eventData: Record<string, { procedure: string; origPrice: string; price: string; discount: string }> = {
      price:   { procedure: '임플란트', origPrice: '990,000원', price: '690,000원', discount: '30%' },
      elegant: { procedure: '라미네이트', origPrice: '800,000원', price: '590,000원', discount: '26%' },
      pop:     { procedure: '치아미백', origPrice: '350,000원', price: '190,000원', discount: '45%' },
      minimal: { procedure: '교정 상담', origPrice: '', price: '무료', discount: 'FREE' },
      wave:    { procedure: '스케일링', origPrice: '80,000원', price: '50,000원', discount: '37%' },
      season:  { procedure: '건강검진', origPrice: '150,000원', price: '99,000원', discount: '34%' },
    };
    const ed = eventData[h] || eventData.price;

    if (h === 'price') {
      // ━━ 클린 대각선 분할: 컬러 상단 + 화이트 하단, 큰 할인율 ━━
      return wrap(<>
        <path d="M0,0 L120,0 L120,60 L0,90 Z" fill={c} />
        <path d="M0,90 L120,60 L120,160 L0,160 Z" fill="white" />
        {/* 상단: 큰 할인율 */}
        <text x="14" y="20" textAnchor="start" fontSize="3" fontWeight="600" fill="white" fillOpacity="0.7">{name}</text>
        <text x="14" y="52" textAnchor="start" fontSize="32" fontWeight="900" fill="white">{ed.discount.replace(/[^0-9]/g,'')}</text>
        <text x="80" y="36" textAnchor="start" fontSize="12" fontWeight="800" fill="white" fillOpacity="0.6">{ed.discount.includes('%') ? '%' : ''}</text>
        <text x="14" y="64" textAnchor="start" fontSize="5" fontWeight="700" fill="white" fillOpacity="0.8" letterSpacing="2">{ed.discount.includes('FREE') ? 'FREE' : 'OFF'}</text>
        {/* 하단: 시술명 + 가격 */}
        <text x="14" y="106" textAnchor="start" fontSize="8" fontWeight="900" fill={c}>{ed.procedure}</text>
        {ed.origPrice && <text x="14" y="118" textAnchor="start" fontSize="3.5" fill="#94a3b8" textDecoration="line-through">{ed.origPrice}</text>}
        <text x="14" y="134" textAnchor="start" fontSize="11" fontWeight="900" fill={c}>{ed.price}</text>
        <rect x="0" y="146" width="120" height="14" fill={c} />
        <text x="60" y="155.5" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white">예약하기</text>
      </>);
    }
    if (h === 'elegant') {
      // ━━ 다크 + 싱글 골드 프레임, 중앙 정렬 ━━
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#0f172a" />
        <rect x="8" y="8" width="104" height="144" rx="2" fill="none" stroke="#d4a853" strokeWidth="0.8" />
        {/* 상단 라벨 */}
        <text x="60" y="32" textAnchor="middle" fontSize="2.8" fontWeight="500" fill="#d4a853" letterSpacing="3">SPECIAL EVENT</text>
        <line x1="30" y1="38" x2="90" y2="38" stroke="#d4a853" strokeWidth="0.4" strokeOpacity="0.4" />
        {/* 중앙 콘텐츠 */}
        <text x="60" y="62" textAnchor="middle" fontSize="10" fontWeight="900" fill="white">{ed.procedure}</text>
        <text x="60" y="86" textAnchor="middle" fontSize="14" fontWeight="900" fill="#d4a853">{ed.price}</text>
        {ed.origPrice && <text x="60" y="98" textAnchor="middle" fontSize="3" fill="#94a3b8" textDecoration="line-through">{ed.origPrice}</text>}
        {/* 하단 */}
        <line x1="30" y1="116" x2="90" y2="116" stroke="#d4a853" strokeWidth="0.4" strokeOpacity="0.4" />
        <text x="60" y="130" textAnchor="middle" fontSize="3" fill="#d4a853" fillOpacity="0.6">2026.03.01 ~ 03.31</text>
        <text x="60" y="144" textAnchor="middle" fontSize="3" fontWeight="600" fill="#d4a853" fillOpacity="0.5" letterSpacing="1">{name}</text>
      </>);
    }
    if (h === 'pop') {
      // ━━ 볼드 타이포그래피 + 플로팅 가격 카드 ━━
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        {/* 병원명 */}
        <text x="14" y="20" textAnchor="start" fontSize="3" fontWeight="500" fill="#94a3b8">{name}</text>
        {/* 큰 시술명 */}
        <text x="14" y="48" textAnchor="start" fontSize="14" fontWeight="900" fill={c}>{ed.procedure}</text>
        <text x="14" y="62" textAnchor="start" fontSize="6" fontWeight="700" fill={a}>이벤트</text>
        {/* 할인 배지 */}
        <rect x="14" y="70" width="32" height="12" rx="6" fill={c} />
        <text x="30" y="78.5" textAnchor="middle" fontSize="4" fontWeight="800" fill="white">{ed.discount} OFF</text>
        {/* 플로팅 가격 카드 */}
        <rect x="14" y="92" width="92" height="36" rx="8" fill="white" filter={`url(#shadow_${t.id})`} stroke="#e2e8f0" strokeWidth="0.4" />
        {ed.origPrice && <text x="60" y="104" textAnchor="middle" fontSize="3.5" fill="#94a3b8" textDecoration="line-through">{ed.origPrice}</text>}
        <text x="60" y="120" textAnchor="middle" fontSize="12" fontWeight="900" fill={c}>{ed.price}</text>
        {/* CTA 버튼 */}
        <rect x="20" y="136" width="80" height="14" rx="7" fill={c} />
        <text x="60" y="145.5" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">예약하기</text>
      </>);
    }
    if (h === 'minimal') {
      // ━━ 스위스 그리드: 최대 여백, 교차점 배치 ━━
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#fafafa" />
        {/* 그리드 라인 */}
        <line x1="40" y1="0" x2="40" y2="160" stroke="#e5e5e5" strokeWidth="0.3" />
        <line x1="0" y1="53" x2="120" y2="53" stroke="#e5e5e5" strokeWidth="0.3" />
        <line x1="0" y1="106" x2="120" y2="106" stroke="#e5e5e5" strokeWidth="0.3" />
        {/* 콘텐츠 */}
        <text x="10" y="20" textAnchor="start" fontSize="2.5" fontWeight="500" fill="#b0b0b0" letterSpacing="3">EVENT</text>
        <rect x="10" y="24" width="12" height="1" fill={c} fillOpacity="0.5" />
        <text x="10" y="46" textAnchor="start" fontSize="16" fontWeight="900" fill="#1a1a1a">{ed.procedure}</text>
        <text x="10" y="76" textAnchor="start" fontSize="3" fontWeight="400" fill="#b0b0b0">{ed.discount === 'FREE' ? '무료' : '할인가'}</text>
        {ed.origPrice && <text x="10" y="86" textAnchor="start" fontSize="3" fill="#b0b0b0" textDecoration="line-through">{ed.origPrice}</text>}
        <text x="10" y="100" textAnchor="start" fontSize="14" fontWeight="900" fill={c}>{ed.price}</text>
        <text x="10" y="126" textAnchor="start" fontSize="2.8" fill="#b0b0b0">2026.03.01 ~ 03.31</text>
        <text x="10" y="140" textAnchor="start" fontSize="2.8" fontWeight="500" fill="#b0b0b0">{name}</text>
      </>);
    }
    if (h === 'wave') {
      // ━━ 중앙 레이아웃 + 서브틀 그라디언트 링 ━━
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        {/* 서브틀 그라디언트 링 */}
        <circle cx="60" cy="90" r="32" fill={c} fillOpacity="0.06" />
        <circle cx="60" cy="90" r="24" fill="white" />
        {/* 상단 — 병원명 + 시술명 */}
        <text x="60" y="18" textAnchor="middle" fontSize="3" fontWeight="600" fill={a}>{name}</text>
        <text x="60" y="38" textAnchor="middle" fontSize="9" fontWeight="900" fill={c}>{ed.procedure}</text>
        <text x="60" y="50" textAnchor="middle" fontSize="4" fontWeight="600" fill={a}>이벤트</text>
        {/* 가격 — 링 중앙 */}
        {ed.origPrice && <text x="60" y="84" textAnchor="middle" fontSize="3" fill="#94a3b8" textDecoration="line-through">{ed.origPrice}</text>}
        <text x="60" y="96" textAnchor="middle" fontSize="12" fontWeight="900" fill={c}>{ed.price}</text>
        {/* 하단 정보 */}
        <text x="60" y="132" textAnchor="middle" fontSize="3" fontWeight="500" fill="#64748b">2026.03.01 ~ 03.31</text>
        <rect x="28" y="140" width="64" height="12" rx="6" fill={c} />
        <text x="60" y="148.5" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white">예약하기</text>
      </>);
    }
    // season (fallback) — 상단 컬러 블록 + 하단 화이트 정보 영역
    return wrap(<>
      <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
      {/* 상단 이미지 영역 (솔리드 컬러) */}
      <rect x="0" y="0" width="120" height="70" rx="6" fill={c} fillOpacity="0.15" />
      <rect x="0" y="64" width="120" height="6" fill="white" />
      <text x="60" y="30" textAnchor="middle" fontSize="3" fontWeight="600" fill={c} fillOpacity="0.6" letterSpacing="2">SEASON</text>
      <text x="60" y="50" textAnchor="middle" fontSize="9" fontWeight="900" fill={c}>{ed.procedure}</text>
      {/* 하단 정보 영역 */}
      <text x="60" y="86" textAnchor="middle" fontSize="3.5" fontWeight="500" fill="#94a3b8">{name}</text>
      {ed.origPrice && <text x="60" y="100" textAnchor="middle" fontSize="3" fill="#94a3b8" textDecoration="line-through">{ed.origPrice}</text>}
      <text x="60" y="114" textAnchor="middle" fontSize="12" fontWeight="900" fill={c}>{ed.price}</text>
      <text x="60" y="130" textAnchor="middle" fontSize="3" fontWeight="500" fill="#64748b">2026.03.01 ~ 03.31</text>
      <rect x="28" y="140" width="64" height="12" rx="6" fill={c} />
      <text x="60" y="148.5" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white">예약하기</text>
    </>);
  }

  if (category === 'doctor') {
    const h = t.layoutHint;
    const doctorData: Record<string, { docName: string; specialty: string; credentials: string[]; greeting: string }> = {
      portrait: { docName: '김윈에이드', specialty: '치과 전문의', credentials: ['서울대 치의학 박사', '임플란트 전문', '경력 10년'], greeting: '환자분의 미소가 저의 보람입니다' },
      curve:    { docName: '이건강', specialty: '가정의학과 전문의', credentials: ['연세대 의과대학', '만성질환 관리', '경력 15년'], greeting: '온 가족의 주치의가 되겠습니다' },
      split:    { docName: '박아름', specialty: '피부과 전문의', credentials: ['고려대 의학 박사', '레이저 시술 전문', '경력 8년'], greeting: '아름다운 피부를 되찾아 드립니다' },
      story:    { docName: '최소아', specialty: '소아과 전문의', credentials: ['서울대 의과대학', '소아 알레르기', '경력 12년'], greeting: '아이들의 건강한 성장을 응원합니다' },
      luxury:   { docName: '정미인', specialty: '성형외과 전문의', credentials: ['성형외과 전문의', '안면윤곽 전문', '경력 20년'], greeting: '자연스러운 아름다움을 추구합니다' },
      grid:     { docName: '한동의', specialty: '한의학 박사', credentials: ['경희대 한의학', '침구 전문', '경력 18년'], greeting: '체질에 맞는 치료를 제공합니다' },
    };
    const dd = doctorData[h] || doctorData.portrait;
    if (h === 'split') {
      // ━━ 대각선 분할: 다크/라이트, 프로필 서클 교차점 ━━
      return wrap(<>
        <path d="M0,0 L120,0 L120,70 L0,100 Z" fill={c} />
        <path d="M0,100 L120,70 L120,160 L0,160 Z" fill="white" />
        {/* 프로필 서클 — 교차점 */}
        <circle cx="60" cy="82" r="18" fill={c} fillOpacity="0.15" stroke="white" strokeWidth="2" />
        {/* 좌상 — 병원명 */}
        <text x="14" y="20" textAnchor="start" fontSize="3" fontWeight="600" fill="white" fillOpacity="0.7">{name}</text>
        <text x="14" y="42" textAnchor="start" fontSize="10" fontWeight="900" fill="white">{dd.docName}</text>
        {/* 하단 — 전문 정보 */}
        <text x="60" y="114" textAnchor="middle" fontSize="5" fontWeight="700" fill={c}>{dd.specialty}</text>
        {dd.credentials.map((t2, i) => (
          <text key={i} x="60" y={128 + i * 10} textAnchor="middle" fontSize="3" fontWeight="500" fill="#64748b">{t2}</text>
        ))}
      </>);
    }
    if (h === 'luxury') {
      // ━━ 다크 + 골드, 정사각 프레임, 미니멀 ━━
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#0f172a" />
        <rect x="20" y="20" width="80" height="80" rx="2" fill="none" stroke="#d4a853" strokeWidth="0.8" />
        {/* 프로필 서클 */}
        <circle cx="60" cy="50" r="16" fill="#d4a853" fillOpacity="0.12" />
        {/* 이름 */}
        <text x="60" y="80" textAnchor="middle" fontSize="9" fontWeight="900" fill="#d4a853">{dd.docName}</text>
        <text x="60" y="92" textAnchor="middle" fontSize="4" fontWeight="600" fill="#d4a853" fillOpacity="0.6">{dd.specialty}</text>
        {/* 병원명 */}
        <text x="60" y="16" textAnchor="middle" fontSize="3" fontWeight="600" fill="#d4a853" letterSpacing="2">{name}</text>
        {/* 경력 */}
        {dd.credentials.map((t2, i) => (
          <text key={i} x="60" y={114 + i * 10} textAnchor="middle" fontSize="3" fontWeight="500" fill="#94a3b8">{t2}</text>
        ))}
        <line x1="30" y1="148" x2="90" y2="148" stroke="#d4a853" strokeWidth="0.4" strokeOpacity="0.4" />
      </>);
    }
    if (h === 'portrait') {
      // ━━ 대형 포토 영역 상단 50% + 하단 이름/전문 ━━
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        <rect x="0" y="0" width="120" height="80" rx="6" fill={c} fillOpacity="0.1" />
        <rect x="0" y="74" width="120" height="6" fill="white" />
        <circle cx="60" cy="40" r="22" fill={c} fillOpacity="0.08" />
        <text x="14" y="16" textAnchor="start" fontSize="3" fontWeight="600" fill={c}>{name}</text>
        <text x="60" y="98" textAnchor="middle" fontSize="12" fontWeight="900" fill="#1e293b">{dd.docName}</text>
        <text x="60" y="112" textAnchor="middle" fontSize="5" fontWeight="700" fill={c}>{dd.specialty}</text>
        {dd.credentials.map((t2, i) => (
          <text key={i} x="60" y={128 + i * 10} textAnchor="middle" fontSize="3" fontWeight="500" fill="#64748b">{t2}</text>
        ))}
      </>);
    }
    if (h === 'curve') {
      // ━━ 비대칭: 좌측 큰 이름, 우측 자격 스택 ━━
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        <circle cx="30" cy="40" r="18" fill={c} fillOpacity="0.08" />
        <text x="14" y="16" textAnchor="start" fontSize="3" fontWeight="500" fill="#94a3b8">{name}</text>
        <text x="14" y="80" textAnchor="start" fontSize="14" fontWeight="900" fill="#1e293b">{dd.docName}</text>
        <text x="14" y="96" textAnchor="start" fontSize="5" fontWeight="700" fill={c}>{dd.specialty}</text>
        <line x1="14" y1="108" x2="106" y2="108" stroke="#e5e5e5" strokeWidth="0.4" />
        {dd.credentials.map((t2, i) => (
          <text key={i} x="14" y={124 + i * 12} textAnchor="start" fontSize="3.2" fontWeight="500" fill="#64748b">{t2}</text>
        ))}
      </>);
    }
    if (h === 'story') {
      // ━━ 매거진 칼럼: 사이드바 + 콘텐츠 ━━
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        <rect x="0" y="0" width="36" height="160" rx="6" fill={c} fillOpacity="0.06" />
        <rect x="0" y="0" width="2" height="160" fill={c} />
        <circle cx="18" cy="36" r="12" fill={c} fillOpacity="0.1" />
        <text x="18" y="60" textAnchor="middle" fontSize="3" fontWeight="700" fill={c}>{dd.docName.slice(0,3)}</text>
        <text x="44" y="16" textAnchor="start" fontSize="3" fontWeight="500" fill="#94a3b8">{name}</text>
        <line x1="44" y1="20" x2="110" y2="20" stroke="#e2e8f0" strokeWidth="0.4" />
        <text x="44" y="38" textAnchor="start" fontSize="8" fontWeight="900" fill="#1e293b">{dd.docName}</text>
        <text x="44" y="52" textAnchor="start" fontSize="4" fontWeight="700" fill={c}>{dd.specialty}</text>
        <line x1="44" y1="60" x2="110" y2="60" stroke="#e2e8f0" strokeWidth="0.3" />
        <text x="44" y="76" textAnchor="start" fontSize="3.5" fill="#475569">{dd.greeting.slice(0, 14)}</text>
        <text x="44" y="88" textAnchor="start" fontSize="3.5" fill="#475569">{dd.greeting.slice(14)}</text>
        <line x1="44" y1="98" x2="110" y2="98" stroke="#e2e8f0" strokeWidth="0.3" />
        {dd.credentials.map((t2, i) => (
          <text key={i} x="44" y={114 + i * 12} textAnchor="start" fontSize="3" fontWeight="500" fill="#64748b">{t2}</text>
        ))}
      </>);
    }
    if (h === 'grid') {
      // ━━ 대시보드: 클린 카드 + 서브틀 뱃지 ━━
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f8fafc" />
        <circle cx="60" cy="32" r="16" fill={c} fillOpacity="0.08" />
        <text x="60" y="60" textAnchor="middle" fontSize="8" fontWeight="900" fill="#1e293b">{dd.docName}</text>
        <text x="60" y="74" textAnchor="middle" fontSize="4" fontWeight="600" fill={c}>{dd.specialty}</text>
        {dd.credentials.map((t2, i) => (
          <g key={i}>
            <rect x="14" y={88 + i * 20} width="92" height="16" rx="4" fill="white" filter={`url(#shadow_${t.id})`} />
            <text x="60" y={98 + i * 20} textAnchor="middle" fontSize="3.2" fontWeight="600" fill="#475569">{t2}</text>
          </g>
        ))}
        <text x="60" y="152" textAnchor="middle" fontSize="3" fontWeight="500" fill="#94a3b8">{name}</text>
      </>);
    }
    // fallback — 중앙 정렬 클린 레이아웃
    return wrap(<>
      <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
      <circle cx="60" cy="34" r="18" fill={c} fillOpacity="0.08" />
      <text x="60" y="68" textAnchor="middle" fontSize="10" fontWeight="900" fill="#1e293b">{dd.docName}</text>
      <text x="60" y="82" textAnchor="middle" fontSize="4.5" fontWeight="700" fill={c}>{dd.specialty}</text>
      <line x1="30" y1="90" x2="90" y2="90" stroke="#e5e5e5" strokeWidth="0.4" />
      {dd.credentials.map((t2, i) => (
        <text key={i} x="60" y={106 + i * 12} textAnchor="middle" fontSize="3" fontWeight="500" fill="#64748b">{t2}</text>
      ))}
      <text x="60" y="150" textAnchor="middle" fontSize="3" fontWeight="500" fill="#94a3b8">{name}</text>
    </>);
  }

  if (category === 'notice') {
    const noticeData: Record<string, { title: string; bodyLines: string[]; cta: string }> = {
      bulletin: { title: '진료시간 안내', bodyLines: ['평일 09:00 ~ 18:00','토요일 09:00 ~ 13:00','','점심시간 13:00 ~ 14:00'], cta: '확인 부탁드립니다' },
      alert:    { title: '긴급 휴진 안내', bodyLines: ['2026년 3월 20일(금)','내부 사정으로 휴진합니다.','','양해 부탁드립니다'], cta: '양해 부탁드립니다' },
      soft:     { title: '진료실 이전 안내', bodyLines: ['2026년 4월 1일부터','새로운 장소에서 진료합니다.','','신주소: 서울시 강남구 ...'], cta: '양해 부탁드립니다' },
      formal:   { title: '공 지 사 항', bodyLines: ['2026년 4월 진료과목 변경','내과 → 가정의학과','','자세한 사항은 문의 바랍니다'], cta: '양해 부탁드립니다' },
      popup:    { title: '최신 장비 도입', bodyLines: ['3D CT 스캐너 도입','보다 정밀한 진단 가능','','예약 문의 환영합니다'], cta: '확인' },
      timeline: { title: '진료시간 변경', bodyLines: ['변경 전: 09:00 ~ 18:00','변경 후: 10:00 ~ 19:00','','2026년 4월 1일부터 적용'], cta: '양해 부탁드립니다' },
    };
    const nd = noticeData[t.layoutHint] || noticeData.soft;
    const bodyLines = nd.bodyLines;
    const h = t.layoutHint;

    if (h === 'bulletin') {
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        {/* 헤더 */}
        <rect x="0" y="0" width="120" height="50" rx="6" fill={c} />
        <rect x="0" y="44" width="120" height="6" fill={c} />
        <text x="60" y="18" textAnchor="middle" fontSize="3" fontWeight="600" fill="white" fillOpacity="0.7">{name}</text>
        <text x="60" y="38" textAnchor="middle" fontSize="9" fontWeight="900" fill="white">{nd.title}</text>
        {/* 본문 카드 */}
        <rect x="10" y="56" width="100" height="64" rx="8" fill="white" filter={`url(#shadow_${t.id})`} />
        {bodyLines.filter(Boolean).map((line, i) => (
          <text key={i} x="20" y={74 + i * 14} fontSize="4" fontWeight={i === 0 ? '700' : '500'} fill={i === 0 ? '#1e293b' : '#64748b'}>{line}</text>
        ))}
        <rect x="24" y="132" width="72" height="14" rx="7" fill={c} />
        <text x="60" y="141.5" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white">{nd.cta}</text>
      </>);
    }
    if (h === 'alert') {
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        {/* 굵은 레드 헤더 */}
        <rect x="0" y="0" width="120" height="44" rx="6" fill="#dc2626" />
        <rect x="0" y="38" width="120" height="6" fill="#dc2626" />
        <text x="60" y="16" textAnchor="middle" fontSize="3" fontWeight="600" fill="white" fillOpacity="0.7">{name}</text>
        <text x="60" y="34" textAnchor="middle" fontSize="9" fontWeight="900" fill="white">{nd.title}</text>
        {/* 본문 */}
        {bodyLines.filter(Boolean).map((line, i) => (
          <text key={i} x="60" y={66 + i * 16} textAnchor="middle" fontSize="4" fontWeight={i === 0 ? '700' : '500'} fill={i === 0 ? '#1e293b' : '#64748b'}>{line}</text>
        ))}
        {/* 하단 CTA */}
        <rect x="10" y="130" width="100" height="16" rx="8" fill="#dc2626" fillOpacity="0.08" />
        <text x="60" y="140" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="#dc2626">{nd.cta}</text>
      </>);
    }
    if (h === 'soft') {
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill={t.bg || '#f5f3ff'} />
        {/* 지오메트릭 아이콘 (원 + i) */}
        <circle cx="60" cy="26" r="12" fill={c} fillOpacity="0.1" />
        <circle cx="60" cy="26" r="6" fill={c} fillOpacity="0.15" />
        <rect x="59" y="22" width="2" height="5" rx="1" fill={c} fillOpacity="0.4" />
        <circle cx="60" cy="20" r="1" fill={c} fillOpacity="0.4" />
        <text x="60" y="52" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{nd.title}</text>
        <text x="60" y="62" textAnchor="middle" fontSize="3" fontWeight="500" fill="#94a3b8">{name}</text>
        {/* 필 카드 */}
        {bodyLines.filter(Boolean).map((line, i) => (
          <g key={i}>
            <rect x="14" y={72 + i * 22} width="92" height="16" rx="8" fill="white" fillOpacity="0.9" />
            <text x="60" y={82 + i * 22} textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#1e293b">{line}</text>
          </g>
        ))}
        <rect x="24" y="138" width="72" height="12" rx="6" fill={c} fillOpacity="0.1" />
        <text x="60" y="146.5" textAnchor="middle" fontSize="3.5" fontWeight="700" fill={c}>{nd.cta}</text>
      </>);
    }
    if (h === 'formal') {
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        {/* 상단 이중 라인 */}
        <line x1="14" y1="10" x2="106" y2="10" stroke="#1f2937" strokeWidth="1.5" />
        <line x1="14" y1="13" x2="106" y2="13" stroke="#1f2937" strokeWidth="0.4" />
        <text x="60" y="28" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#64748b">{name}</text>
        <text x="60" y="46" textAnchor="middle" fontSize="10" fontWeight="900" fill="#1f2937" letterSpacing="3">{nd.title}</text>
        <line x1="30" y1="52" x2="90" y2="52" stroke="#1f2937" strokeWidth="0.4" strokeOpacity="0.3" />
        {/* 본문 */}
        {bodyLines.filter(Boolean).map((line, i) => (
          <text key={i} x="20" y={72 + i * 16} fontSize="4" fontWeight={i === 0 ? '700' : '500'} fill={i === 0 ? '#1f2937' : '#475569'}>{line}</text>
        ))}
        <text x="60" y="128" textAnchor="middle" fontSize="3" fontWeight="500" fill="#64748b">{name} 원장</text>
        {/* 하단 이중 라인 */}
        <line x1="14" y1="140" x2="106" y2="140" stroke="#1f2937" strokeWidth="0.4" />
        <line x1="14" y1="143" x2="106" y2="143" stroke="#1f2937" strokeWidth="1.5" />
      </>);
    }
    if (h === 'popup') {
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#0f172a" fillOpacity="0.6" />
        {/* 모달 카드 */}
        <rect x="10" y="22" width="100" height="116" rx="12" fill="white" filter={`url(#shadow_${t.id})`} />
        {/* 지오메트릭 아이콘 (원 + !) */}
        <circle cx="60" cy="42" r="10" fill={c} fillOpacity="0.1" />
        <rect x="59" y="35" width="2" height="8" rx="1" fill={c} />
        <circle cx="60" cy="47" r="1.2" fill={c} />
        {/* 제목 */}
        <text x="60" y="66" textAnchor="middle" fontSize="7" fontWeight="800" fill="#1e293b">{nd.title}</text>
        <text x="60" y="76" textAnchor="middle" fontSize="3" fontWeight="500" fill="#94a3b8">{name}</text>
        {/* 본문 */}
        {bodyLines.filter(Boolean).map((line, i) => (
          <text key={i} x="60" y={92 + i * 10} textAnchor="middle" fontSize="3.5" fontWeight={i === 0 ? '700' : '500'} fill={i === 0 ? '#1e293b' : '#475569'}>{line}</text>
        ))}
        <rect x="20" y="118" width="80" height="14" rx="7" fill={c} />
        <text x="60" y="127.5" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">{nd.cta}</text>
      </>);
    }
    // timeline (fallback) — Before/After 비교
    return wrap(<>
      <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
      <text x="60" y="16" textAnchor="middle" fontSize="3" fontWeight="500" fill="#94a3b8">{name}</text>
      <text x="60" y="34" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{nd.title}</text>
      {/* 좌측 BEFORE */}
      <rect x="6" y="48" width="52" height="72" rx="6" fill="#fef2f2" />
      <text x="32" y="62" textAnchor="middle" fontSize="3.5" fontWeight="800" fill="#ef4444">BEFORE</text>
      <line x1="14" y1="68" x2="50" y2="68" stroke="#ef4444" strokeWidth="0.4" strokeOpacity="0.3" />
      <text x="32" y="84" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#475569">{bodyLines[0] || ''}</text>
      <text x="32" y="100" textAnchor="middle" fontSize="3" fontWeight="400" fill="#94a3b8">{bodyLines[2] || ''}</text>
      {/* 우측 AFTER */}
      <rect x="62" y="48" width="52" height="72" rx="6" fill="#f0fdf4" />
      <text x="88" y="62" textAnchor="middle" fontSize="3.5" fontWeight="800" fill="#22c55e">AFTER</text>
      <line x1="70" y1="68" x2="106" y2="68" stroke="#22c55e" strokeWidth="0.4" strokeOpacity="0.3" />
      <text x="88" y="84" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#1e293b">{bodyLines[1] || ''}</text>
      <text x="88" y="100" textAnchor="middle" fontSize="3" fontWeight="400" fill="#475569">{bodyLines[3] || ''}</text>
      <text x="60" y="140" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={c}>{nd.cta}</text>
    </>);
  }

  if (category === 'greeting') {
    // ── 명절별 텍스트 (ID 접두사로 판별)
    const tid = t.id;
    const isSeol = tid.startsWith('grt_seol');
    const isChsk = tid.startsWith('grt_chsk');
    const isNewy = tid.startsWith('grt_newy');
    const isParent = tid.startsWith('grt_parent');
    const isXmas = tid.startsWith('grt_xmas');
    const line1 = isSeol ? '새해 복' : isChsk ? '풍성한' : isNewy ? 'HAPPY' : isParent ? '감사합니다' : isXmas ? 'Merry' : '행복한';
    const line2 = isSeol ? '많이 받으세요' : isChsk ? '한가위 보내세요' : isNewy ? 'NEW YEAR' : isParent ? '사랑합니다' : isXmas ? 'Christmas' : '명절 되세요';
    const subLine = isSeol ? '건강하고 행복한 한 해' : isChsk ? '가족과 함께 행복한 추석' : isNewy ? '건강하시길 바랍니다' : isParent ? '어버이날을 축하드립니다' : isXmas ? '따뜻한 성탄절 보내세요' : '건강과 행복이 가득하길';
    const closureText = isSeol ? '휴진: 1/28~1/30' : isChsk ? '휴진: 10/5~10/7' : isNewy ? '휴진: 1/1(수)' : isParent ? '' : isXmas ? '휴진: 12/25(목)' : '';
    const hint = t.layoutHint;

    // ── 공통 헬퍼
    const closureBadge = (y: number, fg = '#64748b', bg = c) => closureText ? (<>
      <rect x="20" y={y} width="80" height="15" rx="7.5" fill={bg} fillOpacity="0.1" />
      <text x="60" y={y + 10} textAnchor="middle" fontSize="3.2" fontWeight="600" fill={fg}>{closureText}</text>
    </>) : null;

    // ── 설날 장식 — 얇은 빨간 선 + 금색 원
    const seolDeco = isSeol ? <>
      <line x1="10" y1="8" x2="10" y2="32" stroke="#dc2626" strokeWidth="1.2" strokeOpacity="0.3" />
      <circle cx="10" cy="36" r="2.5" fill="#fbbf24" fillOpacity="0.35" />
      <line x1="110" y1="128" x2="110" y2="152" stroke="#dc2626" strokeWidth="1.2" strokeOpacity="0.2" />
      <circle cx="110" cy="126" r="2" fill="#fbbf24" fillOpacity="0.25" />
    </> : null;

    // ── 추석 장식 — 금색 보름달 + 얇은 수평선
    const chskDeco = isChsk ? <>
      <circle cx="100" cy="18" r="10" fill="#fbbf24" fillOpacity="0.15" />
      <circle cx="100" cy="18" r="6" fill="#fbbf24" fillOpacity="0.1" />
      <line x1="14" y1="148" x2="106" y2="148" stroke="#d97706" strokeWidth="0.4" strokeOpacity="0.2" />
    </> : null;

    // ── 새해 장식 — 미세한 도트 스파클
    const newyDeco = isNewy ? <>
      <circle cx="16" cy="14" r="1.5" fill={c} fillOpacity="0.15" />
      <circle cx="104" cy="10" r="1" fill={c} fillOpacity="0.12" />
      <circle cx="26" cy="146" r="1" fill={c} fillOpacity="0.1" />
      <circle cx="94" cy="150" r="1.5" fill={c} fillOpacity="0.12" />
    </> : null;

    // ── 어버이날 장식 — 핑크 원 2개
    const parentDeco = isParent ? <>
      <circle cx="16" cy="14" r="4" fill="#e11d48" fillOpacity="0.15" />
      <circle cx="104" cy="146" r="3" fill="#e11d48" fillOpacity="0.12" />
    </> : null;

    // ── 크리스마스 장식 — 작은 삼각형 + 원
    const xmasDeco = isXmas ? <>
      <polygon points="14,20 10,28 18,28" fill="#16a34a" fillOpacity="0.2" />
      <polygon points="106,14 102,22 110,22" fill="#16a34a" fillOpacity="0.15" />
      <circle cx="60" cy="8" r="2.5" fill="#dc2626" fillOpacity="0.2" />
    </> : null;

    return wrap(<>
      {seolDeco}{chskDeco}{newyDeco}{parentDeco}{xmasDeco}
      {hint === 'traditional' ? <>
        {/* ━━ traditional — 기하학 테두리, 중앙 수직 레이아웃 ━━ */}
        <rect x="6" y="4" width="108" height="152" rx="2" fill="none" stroke={c} strokeOpacity="0.2" strokeWidth="0.6" />
        <rect x="10" y="8" width="100" height="144" rx="1" fill="none" stroke={c} strokeOpacity="0.1" strokeWidth="0.3" />
        <line x1="60" y1="20" x2="60" y2="30" stroke={c} strokeOpacity="0.15" strokeWidth="0.5" />
        <text x="60" y="42" textAnchor="middle" fontSize="3.2" fontWeight="600" fill={isDark ? '#fbbf24' : a} letterSpacing="1">{name}</text>
        <text x="60" y="68" textAnchor="middle" fontSize="12" fontWeight="900" fill={isDark ? '#fbbf24' : c}>{line1}</text>
        <text x="60" y="86" textAnchor="middle" fontSize="10" fontWeight="900" fill={isDark ? '#fbbf24' : c}>{line2}</text>
        <line x1="30" y1="96" x2="90" y2="96" stroke={c} strokeOpacity="0.15" strokeWidth="0.4" />
        <text x="60" y="110" textAnchor="middle" fontSize="3.5" fill={isDark ? '#94a3b8' : a}>{subLine}</text>
        {closureBadge(120, isDark ? '#94a3b8' : '#64748b')}
        <text x="60" y="148" textAnchor="middle" fontSize="3" fontWeight="600" fill={isDark ? '#d4a017' : a}>{name}</text>
      </> : hint === 'luxury' ? <>
        {/* ━━ luxury — 블랙+골드, 봉투 V선, 밀랍 인장 ━━ */}
        <rect x="4" y="3" width="112" height="154" rx="4" fill="#0f172a" />
        <rect x="8" y="7" width="104" height="146" rx="3" fill="none" stroke="#d4a853" strokeWidth="0.4" strokeOpacity="0.3" />
        <path d="M10,9 L60,36 L110,9" fill="none" stroke="#d4a853" strokeWidth="0.8" strokeOpacity="0.5" />
        <text x="60" y="56" textAnchor="middle" fontSize="3" fontWeight="500" fill="#d4a853" fillOpacity="0.5" letterSpacing="2">{name}</text>
        <text x="60" y="76" textAnchor="middle" fontSize="12" fontWeight="900" fill="#d4a017">{line1}</text>
        <text x="60" y="94" textAnchor="middle" fontSize="10" fontWeight="900" fill="#d4a017">{line2}</text>
        <line x1="30" y1="102" x2="90" y2="102" stroke="#d4a853" strokeOpacity="0.2" strokeWidth="0.4" />
        <text x="60" y="114" textAnchor="middle" fontSize="3.5" fill="#b8860b">{subLine}</text>
        {closureText && <text x="60" y="126" textAnchor="middle" fontSize="3" fill="#a08030" fillOpacity="0.7">{closureText}</text>}
        <circle cx="60" cy="144" r="6" fill="#d4a853" fillOpacity="0.4" />
        <circle cx="60" cy="144" r="4" fill="#d4a017" fillOpacity="0.3" />
      </> : hint === 'cute' ? <>
        {/* ━━ cute — 둥근 카드, 기하학 풍선, 부드러운 부유 요소 ━━ */}
        <circle cx="20" cy="20" r="8" fill={c} fillOpacity="0.12" />
        <circle cx="34" cy="14" r="6" fill={a} fillOpacity="0.08" />
        <line x1="20" y1="28" x2="18" y2="40" stroke={c} strokeWidth="0.4" strokeOpacity="0.15" />
        <line x1="34" y1="20" x2="32" y2="40" stroke={a} strokeWidth="0.4" strokeOpacity="0.1" />
        <circle cx="100" cy="142" r="4" fill={c} fillOpacity="0.08" />
        <circle cx="108" cy="148" r="3" fill={a} fillOpacity="0.06" />
        <rect x="14" y="44" width="92" height="76" rx="16" fill="white" fillOpacity="0.85" />
        <text x="60" y="16" textAnchor="middle" fontSize="3.2" fontWeight="700" fill={c}>{name}</text>
        <text x="60" y="72" textAnchor="middle" fontSize="11" fontWeight="900" fill={c}>{line1}</text>
        <text x="60" y="90" textAnchor="middle" fontSize="10" fontWeight="900" fill={c}>{line2}</text>
        <text x="60" y="112" textAnchor="middle" fontSize="3.5" fill={a}>{subLine}</text>
        {closureBadge(126)}
        <text x="60" y="154" textAnchor="middle" fontSize="3" fill="#94a3b8">{name}</text>
      </> : hint === 'nature' ? <>
        {/* ━━ nature — 레이어드 실루엣, 텍스트 오버레이 ━━ */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill={isDark ? '#1e293b' : c} fillOpacity={isDark ? 0.2 : 0.04} />
        <path d="M0,120 Q30,100 60,112 Q90,96 120,108 L120,160 L0,160 Z" fill={c} fillOpacity="0.1" />
        <path d="M0,134 Q40,116 70,128 Q100,112 120,124 L120,160 L0,160 Z" fill={c} fillOpacity="0.15" />
        <path d="M0,146 Q50,132 80,142 Q110,130 120,138 L120,160 L0,160 Z" fill={c} fillOpacity="0.08" />
        <circle cx="96" cy="18" r="8" fill="#fbbf24" fillOpacity="0.12" />
        <text x="60" y="16" textAnchor="middle" fontSize="3.2" fontWeight="600" fill={isDark ? 'rgba(255,255,255,0.6)' : a}>{name}</text>
        <text x="60" y="48" textAnchor="middle" fontSize="12" fontWeight="900" fill={isDark ? '#ffffff' : c}>{line1}</text>
        <text x="60" y="66" textAnchor="middle" fontSize="10" fontWeight="900" fill={isDark ? '#ffffff' : c}>{line2}</text>
        <line x1="36" y1="76" x2="84" y2="76" stroke={c} strokeOpacity="0.1" strokeWidth="0.4" />
        <text x="60" y="90" textAnchor="middle" fontSize="3.5" fill={isDark ? 'rgba(255,255,255,0.5)' : a}>{subLine}</text>
        {closureText && <text x="60" y="106" textAnchor="middle" fontSize="3" fill={isDark ? '#94a3b8' : '#64748b'}>{closureText}</text>}
        <text x="60" y="154" textAnchor="middle" fontSize="3" fill={isDark ? 'rgba(255,255,255,0.35)' : '#94a3b8'}>{name}</text>
      </> : hint === 'minimal' ? <>
        {/* ━━ minimal — 대담 타이포, 얇은 악센트, 최대 여백 ━━ */}
        <line x1="59" y1="12" x2="61" y2="12" stroke={c} strokeOpacity="0.25" strokeWidth="0.8" />
        <text x="60" y="28" textAnchor="middle" fontSize="3" fontWeight="500" fill={isDark ? 'rgba(255,255,255,0.45)' : '#94a3b8'} letterSpacing="2">{name}</text>
        <text x="60" y="62" textAnchor="middle" fontSize="16" fontWeight="900" fill={isDark ? '#ffffff' : c}>{line1}</text>
        <text x="60" y="84" textAnchor="middle" fontSize="14" fontWeight="900" fill={isDark ? '#ffffff' : c}>{line2}</text>
        <line x1="40" y1="94" x2="80" y2="94" stroke={c} strokeOpacity="0.1" strokeWidth="0.3" />
        <text x="60" y="110" textAnchor="middle" fontSize="3.5" fill={isDark ? 'rgba(255,255,255,0.5)' : a} letterSpacing="1">{subLine}</text>
        {closureText && <text x="60" y="126" textAnchor="middle" fontSize="3" fill={isDark ? '#94a3b8' : '#64748b'}>{closureText}</text>}
        <circle cx="60" cy="142" r="2" fill={c} fillOpacity="0.2" />
        <text x="60" y="154" textAnchor="middle" fontSize="3" fill={isDark ? 'rgba(255,255,255,0.35)' : '#94a3b8'}>{name}</text>
      </> : <>
        {/* ━━ warm — 곡선 리본 상하단, 워터마크 원, 중앙 텍스트 ━━ */}
        <path d="M0,12 Q30,4 60,12 Q90,20 120,12 L120,0 L0,0 Z" fill={c} fillOpacity={isDark ? 0.12 : 0.15} />
        <path d="M0,148 Q30,156 60,148 Q90,140 120,148 L120,160 L0,160 Z" fill={c} fillOpacity={isDark ? 0.1 : 0.12} />
        <circle cx="60" cy="80" r="36" fill={c} fillOpacity={isDark ? 0.02 : 0.03} />
        <text x="60" y="26" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={isDark ? 'rgba(255,255,255,0.55)' : a}>{name}</text>
        <text x="60" y="60" textAnchor="middle" fontSize="12" fontWeight="900" fill={isDark ? '#ffffff' : c}>{line1}</text>
        <text x="60" y="78" textAnchor="middle" fontSize="10" fontWeight="900" fill={isDark ? '#ffffff' : c}>{line2}</text>
        <line x1="30" y1="88" x2="90" y2="88" stroke={c} strokeOpacity="0.12" strokeWidth="0.4" />
        <text x="60" y="102" textAnchor="middle" fontSize="3.5" fill={isDark ? 'rgba(255,255,255,0.5)' : a}>{subLine}</text>
        {closureBadge(114, isDark ? '#94a3b8' : '#64748b')}
        <text x="60" y="148" textAnchor="middle" fontSize="3" fill={isDark ? 'rgba(255,255,255,0.35)' : '#94a3b8'}>{name}</text>
      </>}
    </>);
  }

  if (category === 'hiring') {
    const h = t.layoutHint;
    const hiringData: Record<string, { position: string; type: string; benefits: string[] }> = {
      corporate: { position: '간호사', type: '정규직 / 경력 우대', benefits: ['4대보험 완비','주5일 근무','중식 제공','채용시까지 상시 모집'] },
      team:      { position: '물리치료사', type: '정규직 / 신입 가능', benefits: ['4대보험 완비','워크숍 지원','중식 제공','채용시까지 상시 모집'] },
      modern:    { position: '방사선사', type: '정규직 / 경력 3년↑', benefits: ['4대보험 완비','장비 교육 지원','인센티브','채용시까지 상시 모집'] },
      benefits:  { position: '접수/코디네이터', type: '정규직 / 신입 환영', benefits: ['4대보험 완비','연차 보장','중식 제공','인센티브'] },
      urgent:    { position: '치과위생사', type: '정규직 / 경력 우대', benefits: ['4대보험 완비','중식 제공 / 인센티브','채용시까지 상시 모집','급여 협의'] },
      brand:     { position: '전문의', type: '정규직 / 전문의 면허', benefits: ['경쟁력 있는 급여','학회 지원','인센티브','채용시까지 상시 모집'] },
    };
    const hd = hiringData[h] || hiringData.corporate;
    if (h === 'corporate') {
      // 기업형 — 네이비 헤더 + 테이블 행 + 다크 CTA
      return wrap(<>
        <rect x="0" y="0" width="120" height="42" fill="#1e293b" />
        <text x="60" y="16" textAnchor="middle" fontSize="3" fontWeight="600" fill="#94a3b8" letterSpacing="2">{name}</text>
        <text x="60" y="34" textAnchor="middle" fontSize="9" fontWeight="900" fill="white">{hd.position} 모집</text>
        {[
          {label: '고용형태', value: hd.type.split(' / ')[0]},
          {label: '자격요건', value: hd.type.split(' / ')[1] || '경력 무관'},
          ...hd.benefits.slice(0, 3).map(b => ({label: '혜택', value: b})),
        ].map((row, i) => (
          <g key={i}>
            <rect x="0" y={42 + i * 18} width="120" height="18" fill={i % 2 === 0 ? '#f8fafc' : 'white'} />
            <text x="14" y={54 + i * 18} fontSize="3" fontWeight="700" fill={c}>{row.label}</text>
            <text x="42" y={54 + i * 18} fontSize="3.5" fontWeight="500" fill="#334155">{row.value}</text>
          </g>
        ))}
        <rect x="0" y="132" width="120" height="28" fill="#1e293b" />
        <rect x="20" y="137" width="80" height="16" rx="8" fill={c} />
        <text x="60" y="148" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="white">지원하기</text>
      </>);
    }
    if (h === 'team') {
      // 팀 — 3개 포지션 카드 그리드
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        <text x="60" y="18" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#94a3b8">{name}</text>
        <text x="60" y="34" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>함께할 팀원</text>
        <rect x="10" y="44" width="100" height="20" rx="4" fill={c} />
        <text x="60" y="57" textAnchor="middle" fontSize="5" fontWeight="800" fill="white">{hd.position} {hd.type.split(' / ')[0]}</text>
        {hd.benefits.slice(0, 3).map((txt, i) => (
          <g key={i}>
            <rect x="10" y={72 + i * 24} width="100" height="20" rx="4" fill={c} fillOpacity={0.05 + i * 0.03} />
            <rect x="10" y={72 + i * 24} width="3" height="20" rx="1" fill={c} fillOpacity={0.6 - i * 0.15} />
            <text x="20" y={85 + i * 24} fontSize="3.8" fontWeight="600" fill="#334155">{txt}</text>
          </g>
        ))}
        <text x="60" y="154" textAnchor="middle" fontSize="3" fontWeight="500" fill="#94a3b8">채용시까지 상시 모집</text>
      </>);
    }
    if (h === 'modern') {
      // 모던 다크 — 넘버링 + 액센트 바
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#0f172a" />
        <text x="60" y="22" textAnchor="middle" fontSize="3" fontWeight="500" fill="#64748b" letterSpacing="3">WE ARE HIRING</text>
        <rect x="30" y="26" width="60" height="1" rx="0.5" fill={a} fillOpacity="0.4" />
        <text x="60" y="50" textAnchor="middle" fontSize="10" fontWeight="900" fill="white">{hd.position}</text>
        <text x="60" y="64" textAnchor="middle" fontSize="4" fontWeight="600" fill={a}>{hd.type}</text>
        {hd.benefits.slice(0, 3).map((txt, i) => (
          <g key={i}>
            <text x="22" y={86 + i * 16} fontSize="3.5" fontWeight="700" fill={a}>{`0${i + 1}`}</text>
            <rect x="32" y={80 + i * 16} width="2" height="10" rx="1" fill={a} fillOpacity="0.5" />
            <text x="40" y={86 + i * 16} fontSize="3.5" fontWeight="500" fill="white">{txt}</text>
          </g>
        ))}
        <rect x="20" y="132" width="80" height="16" rx="8" fill={a} />
        <text x="60" y="143" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="white">지원하기</text>
        <text x="60" y="156" textAnchor="middle" fontSize="2.8" fontWeight="500" fill="#64748b">{name}</text>
      </>);
    }
    if (h === 'benefits') {
      // 혜택 카드 — 깔끔한 리스트
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        <text x="60" y="16" textAnchor="middle" fontSize="3" fontWeight="600" fill="#94a3b8">{name}</text>
        <text x="60" y="32" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{hd.position}</text>
        <text x="60" y="44" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#64748b">{hd.type}</text>
        <rect x="10" y="52" width="100" height="1" fill={c} fillOpacity="0.15" />
        {hd.benefits.map((txt, i) => (
          <g key={i}>
            <rect x="10" y={60 + i * 20} width="100" height="16" rx="4" fill={c} fillOpacity="0.05" />
            <rect x="14" y={64 + i * 20} width="8" height="8" rx="2" fill={c} fillOpacity={0.2 + i * 0.1} />
            <text x="28" y={71 + i * 20} fontSize="3.5" fontWeight="600" fill="#334155">{txt}</text>
          </g>
        ))}
        <rect x="20" y="142" width="80" height="14" rx="7" fill={c} />
        <text x="60" y="151.5" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">지원하기</text>
      </>);
    }
    if (h === 'urgent') {
      // 긴급채용 — 볼드 헤더 + 클린 바디 + 강한 CTA
      return wrap(<>
        <rect x="0" y="0" width="120" height="50" fill={c} />
        <text x="60" y="20" textAnchor="middle" fontSize="12" fontWeight="900" fill="white">긴급채용</text>
        <text x="60" y="36" textAnchor="middle" fontSize="4" fontWeight="600" fill="white" fillOpacity="0.8">{name}</text>
        <rect x="30" y="42" width="60" height="1" fill="white" fillOpacity="0.3" />
        <text x="60" y="68" textAnchor="middle" fontSize="8" fontWeight="900" fill={c}>{hd.position}</text>
        <text x="60" y="82" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#64748b">{hd.type}</text>
        {hd.benefits.slice(0, 3).map((txt, i) => (
          <g key={i}>
            <rect x="16" y={92 + i * 14} width="4" height="4" rx="2" fill={c} />
            <text x="24" y={96 + i * 14} fontSize="3.5" fontWeight="600" fill="#334155">{txt}</text>
          </g>
        ))}
        <rect x="16" y="140" width="88" height="14" rx="7" fill={c} />
        <text x="60" y="149.5" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">지금 바로 지원</text>
      </>);
    }
    if (h === 'brand') {
      // 브랜드 — 좌측 세로 액센트 바 + 큰 타이틀 + 정보 스택
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        <rect x="0" y="0" width="6" height="160" fill={c} />
        <text x="20" y="24" fontSize="3" fontWeight="600" fill="#94a3b8" letterSpacing="1">{name}</text>
        <text x="20" y="50" fontSize="10" fontWeight="900" fill={c}>{hd.position}</text>
        <text x="20" y="66" fontSize="4" fontWeight="600" fill="#64748b">모집</text>
        <rect x="20" y="74" width="40" height="1.5" rx="0.75" fill={c} fillOpacity="0.3" />
        <text x="20" y="92" fontSize="4" fontWeight="700" fill={c}>{hd.type}</text>
        {hd.benefits.slice(0, 3).map((txt, i) => (
          <g key={i}>
            <rect x="20" y={100 + i * 14} width="3" height="3" rx="1" fill={c} fillOpacity="0.4" />
            <text x="28" y={103 + i * 14} fontSize="3.5" fontWeight="500" fill="#475569">{txt}</text>
          </g>
        ))}
        <rect x="20" y="142" width="90" height="14" rx="7" fill={`url(#accent_${t.id})`} />
        <text x="65" y="151.5" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">지원하기</text>
      </>);
    }
    // default — 세로 타임라인 카드
    return wrap(<>
      <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
      <text x="60" y="16" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>채용 공고</text>
      <text x="60" y="28" textAnchor="middle" fontSize="3" fontWeight="500" fill="#94a3b8">{name}</text>
      <line x1="24" y1="36" x2="24" y2="140" stroke={c} strokeWidth="2" strokeOpacity="0.15" />
      {[
        {label:'모집직종', value: hd.position},
        {label:'고용형태', value: hd.type.split(' / ')[0]},
        {label:'자격요건', value: hd.type.split(' / ')[1] || '경력 무관'},
        {label:'복리후생', value: hd.benefits[0]},
      ].map(({label, value}, i) => (
        <g key={i}>
          <circle cx="24" cy={44 + i * 24} r="5" fill={c} fillOpacity={0.15 + i * 0.08} stroke={c} strokeWidth="1" />
          <text x="24" y={47 + i * 24} textAnchor="middle" fontSize="3" fontWeight="700" fill={c}>{i + 1}</text>
          <text x="36" y={42 + i * 24} fontSize="2.8" fontWeight="600" fill="#94a3b8">{label}</text>
          <text x="36" y={52 + i * 24} fontSize="4.5" fontWeight="800" fill="#1e293b">{value}</text>
        </g>
      ))}
      <rect x="14" y="140" width="92" height="14" rx="7" fill={`url(#accent_${t.id})`} />
      <text x="60" y="149.5" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">지원하기</text>
    </>);
  }

  if (category === 'caution') {
    // 시술별 다른 예시 항목 (layoutHint별 차별화)
    const cautionData: Record<string, { title: string; items: string[]; oItems?: string[] }> = {
      warning:    { title: '임플란트 수술 후', items: ['혀로 건드리지 마세요','음주/흡연 2주 금지','부기 2~3일 내 소실','딱딱한 음식 금지'] },
      checklist:  { title: '치아미백 후', items: ['착색 음식 48시간 금지','커피/와인/카레 금지','흡연 24시간 금지','시린 증상 1~2일 정상'] },
      card:       { title: '사랑니 발치 후', items: ['거즈 1시간 물고 있기','빨대 사용 금지','당일 양치 금지','찬물 찜질 권장'], oItems: ['X','X','X','O'] },
      guide:      { title: '보톡스 시술 후', items: ['4시간 눕지 마세요','시술 부위 만지지 않기','음주 당일 금지','사우나 3일 금지'] },
      timeline:   { title: '교정 장치 부착 후', items: ['통증 2~3일 정상','왁스로 보호','딱딱한 음식 주의','정기 내원 필수'] },
      infographic:{ title: '스케일링 후', items: ['시린 증상 정상','착색 음식 하루 금지','잇몸 출혈 1~2일','부드러운 칫솔 사용'] },
    };
    const cd = cautionData[t.layoutHint] || cautionData.warning;
    // 공통 헬퍼: 응급연락처 바
    const emergencyBar = (y: number) => (<>
      <rect x="14" y={y} width="92" height="16" rx="8" fill={c} fillOpacity="0.1" stroke={c} strokeOpacity="0.2" strokeWidth="0.5" />
      <text x="24" y={y + 10} fontSize="3.2" fontWeight="700" fill={c}>전화</text>
      <text x="38" y={y + 10} fontSize="3" fontWeight="600" fill="#475569">이상 증상 시 바로 연락</text>
      <text x="98" y={y + 10} textAnchor="end" fontSize="3" fontWeight="800" fill={c}>1588-0000</text>
    </>);
    return wrap(<>
      {t.layoutHint === 'warning' ? <>
        {/* 경고형 — 헤더 바 + 넘버링 리스트 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        <rect x="0" y="0" width="120" height="36" fill={c} />
        <text x="60" y="16" textAnchor="middle" fontSize="4" fontWeight="700" fill="white" fillOpacity="0.7">{name}</text>
        <text x="60" y="30" textAnchor="middle" fontSize="6" fontWeight="900" fill="white">{cd.title}</text>
        <text x="60" y="50" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#475569">아래 사항을 꼭 지켜주세요</text>
        {cd.items.map((item, i) => (
          <g key={i}>
            <rect x="14" y={60 + i * 18} width="92" height="14" rx="4" fill={c} fillOpacity={0.04 + i * 0.02} />
            <text x="22" y={70 + i * 18} fontSize="3.5" fontWeight="800" fill={c}>{i + 1}.</text>
            <text x="30" y={70 + i * 18} fontSize="3.2" fontWeight="600" fill="#1e293b">{item}</text>
          </g>
        ))}
        {emergencyBar(138)}
      </> : t.layoutHint === 'checklist' ? <>
        {/* 체크리스트 — 컬러 헤더 + 체크박스 + 연결선 */}
        <rect x="0" y="0" width="120" height="34" fill={c} />
        <text x="60" y="14" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white" fillOpacity="0.8">{name}</text>
        <text x="60" y="28" textAnchor="middle" fontSize="5.5" fontWeight="900" fill="white">{cd.title}</text>
        <line x1="22" y1="44" x2="22" y2="128" stroke={c} strokeWidth="1" strokeOpacity="0.12" />
        {cd.items.map((item, i) => (
          <g key={i}>
            <rect x="14" y={44 + i * 24} width="14" height="14" rx="3" fill="white" stroke={c} strokeWidth="1" />
            <path d={`M18,${52 + i * 24} L21,${55 + i * 24} L26,${48 + i * 24}`} fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <text x="34" y={54 + i * 24} fontSize="3.5" fontWeight="600" fill="#1e293b">{item}</text>
          </g>
        ))}
        {emergencyBar(140)}
      </> : t.layoutHint === 'card' ? <>
        {/* DO / DON'T — 클린 2열 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        <text x="60" y="16" textAnchor="middle" fontSize="6" fontWeight="900" fill={c}>{cd.title}</text>
        <rect x="8" y="24" width="50" height="14" rx="4" fill="#22c55e" />
        <text x="33" y="34" textAnchor="middle" fontSize="4" fontWeight="800" fill="white">DO</text>
        <rect x="62" y="24" width="50" height="14" rx="4" fill="#ef4444" />
        <text x="87" y="34" textAnchor="middle" fontSize="4" fontWeight="800" fill="white">DON'T</text>
        <line x1="60" y1="24" x2="60" y2="130" stroke="#e2e8f0" strokeWidth="0.8" />
        {cd.items.map((item, i) => {
          const isGood = (cd.oItems?.[i] || 'X') === 'O';
          const col = isGood ? 8 : 62;
          const row = isGood ? [0,1,2,3].filter(j => (cd.oItems?.[j] || 'X') === 'O').indexOf(i) : [0,1,2,3].filter(j => (cd.oItems?.[j] || 'X') !== 'O').indexOf(i);
          return (
            <g key={i}>
              <rect x={col} y={44 + row * 26} width="50" height="20" rx="4" fill={isGood ? '#22c55e' : '#ef4444'} fillOpacity="0.06" />
              <text x={col + 6} y={57 + row * 26} fontSize="4" fontWeight="800" fill={isGood ? '#22c55e' : '#ef4444'}>{isGood ? 'O' : 'X'}</text>
              <text x={col + 14} y={57 + row * 26} fontSize="3" fontWeight="600" fill="#1e293b">{item.slice(0, 10)}</text>
            </g>
          );
        })}
        {emergencyBar(134)}
      </> : t.layoutHint === 'guide' ? <>
        {/* 가이드 — 좌정렬 넘버 카드 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        <text x="60" y="14" textAnchor="middle" fontSize="3.5" fontWeight="700" fill={a}>{name}</text>
        <text x="60" y="30" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{cd.title}</text>
        {cd.items.map((item, i) => (
          <g key={i}>
            <rect x="12" y={40 + i * 24} width="96" height="20" rx="4" fill={c} fillOpacity={0.05 + i * 0.02} />
            <rect x="14" y={42 + i * 24} width="16" height="16" rx="4" fill={c} fillOpacity={0.7 - i * 0.12} />
            <text x="22" y={53 + i * 24} textAnchor="middle" fontSize="5" fontWeight="900" fill="white">{i + 1}</text>
            <text x="36" y={53 + i * 24} fontSize="3.5" fontWeight="600" fill="#1e293b">{item}</text>
          </g>
        ))}
        {emergencyBar(140)}
      </> : t.layoutHint === 'timeline' ? <>
        {/* 타임라인 — 세로 게이지 (간소화) */}
        <text x="60" y="12" textAnchor="middle" fontSize="3.5" fontWeight="700" fill={a}>{name}</text>
        <text x="60" y="28" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{cd.title}</text>
        <rect x="24" y="36" width="8" height="96" rx="4" fill={c} fillOpacity="0.08" />
        {[
          {d:'당일', color:'#ef4444'},
          {d:'1주', color:'#f59e0b'},
          {d:'2주', color:'#3b82f6'},
          {d:'1개월', color:'#22c55e'},
        ].map((item, i) => {
          const y = 38 + i * 23;
          return (
            <g key={i}>
              <rect x="25" y={y} width="6" height="20" fill={item.color} fillOpacity="0.25" />
              <line x1="34" y1={y + 10} x2="40" y2={y + 10} stroke={item.color} strokeWidth="1.5" />
              <text x="44" y={y + 7} fontSize="3.5" fontWeight="800" fill={item.color}>{item.d}</text>
              <text x="44" y={y + 15} fontSize="3" fontWeight="500" fill="#475569">{cd.items[i]}</text>
            </g>
          );
        })}
        {emergencyBar(140)}
      </> : <>
        {/* 인포그래픽 — 중앙 경고 아이콘 + 방사형 */}
        <text x="60" y="12" textAnchor="middle" fontSize="3.5" fontWeight="700" fill={a}>{name}</text>
        <text x="60" y="28" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{cd.title}</text>
        <circle cx="60" cy="78" r="16" fill={c} fillOpacity="0.08" stroke={c} strokeOpacity="0.15" strokeWidth="1" />
        <text x="60" y="84" textAnchor="middle" fontSize="14" fontWeight="900" fill={c} fillOpacity="0.3">!</text>
        {cd.items.map((item, i) => {
          const positions = [
            { lx: 60, ly: 42, tx: 60, ty: 38, ta: 'middle' as const },
            { lx: 98, ly: 78, tx: 100, ty: 76, ta: 'start' as const },
            { lx: 60, ly: 114, tx: 60, ty: 120, ta: 'middle' as const },
            { lx: 22, ly: 78, tx: 20, ty: 76, ta: 'end' as const },
          ];
          const p = positions[i];
          return (
            <g key={i}>
              <line x1="60" y1="78" x2={p.lx} y2={p.ly} stroke={c} strokeWidth="0.6" strokeOpacity="0.15" />
              <circle cx={p.lx} cy={p.ly} r="4" fill={c} fillOpacity="0.12" />
              <text x={p.lx} y={p.ly + 1.5} textAnchor="middle" fontSize="3" fontWeight="800" fill={c}>{i + 1}</text>
              <text x={p.tx} y={p.ty + 10} textAnchor={p.ta} fontSize="3" fontWeight="600" fill="#1e293b">{item}</text>
            </g>
          );
        })}
        {emergencyBar(140)}
      </>}
      <text x="60" y="153" textAnchor="middle" fontSize="3" fontWeight="500" fill="#64748b">{name}</text>
    </>);
  }

  if (category === 'pricing') {
    // layoutHint별 다른 진료 항목 예시
    const pricingData: Record<string, { n: string; p: string }[]> = {
      table:    [{ n: '임플란트', p: '1,200,000원' }, { n: '올세라믹', p: '600,000원' }, { n: '레진 충전', p: '150,000원' }, { n: '교정 상담', p: '무료' }],
      cards:    [{ n: '보톡스', p: '80,000원' }, { n: '필러', p: '250,000원' }, { n: '리프팅', p: '500,000원' }, { n: '피부 상담', p: '무료' }],
      dark:     [{ n: '라미네이트', p: '800,000원' }, { n: '지르코니아', p: '700,000원' }, { n: '금 크라운', p: '550,000원' }, { n: 'PFM', p: '400,000원' }],
      wood:     [{ n: '스케일링', p: '50,000원' }, { n: '잇몸 치료', p: '120,000원' }, { n: '사랑니 발치', p: '100,000원' }, { n: '치아미백', p: '300,000원' }],
      gradient: [{ n: '교정 (메탈)', p: '2,500,000원' }, { n: '교정 (세라믹)', p: '3,000,000원' }, { n: '투명교정', p: '4,000,000원' }, { n: '유지장치', p: '200,000원' }],
      minimal:  [{ n: '턱관절치료', p: '150,000원' }, { n: '마우스가드', p: '200,000원' }, { n: '수면치료', p: '100,000원' }, { n: '불소도포', p: '30,000원' }],
    };
    const items = pricingData[t.layoutHint] || pricingData.table;
    const isDarkTheme = t.layoutHint === 'dark';
    return wrap(<>
      {isDarkTheme && <rect x="0" y="0" width="120" height="160" rx="6" fill="#0f172a" />}
      {t.layoutHint === 'table' ? <>
        {/* 영수증 — 클린 receipt */}
        <rect x="20" y="4" width="80" height="152" rx="3" fill="white" filter={`url(#shadow_${t.id})`} />
        <text x="60" y="18" textAnchor="middle" fontSize="4" fontWeight="800" fill={c}>{name}</text>
        <line x1="26" y1="22" x2="94" y2="22" stroke="#e2e8f0" strokeWidth="0.5" />
        <text x="60" y="34" textAnchor="middle" fontSize="5" fontWeight="900" fill="#1e293b">비급여 진료비</text>
        <text x="60" y="42" textAnchor="middle" fontSize="3" fontWeight="500" fill="#94a3b8">PRICE LIST</text>
        <line x1="26" y1="48" x2="94" y2="48" stroke="#e2e8f0" strokeWidth="0.5" />
        {items.map((item, i) => (
          <g key={i}>
            <text x="28" y={64 + i * 22} fontSize="3.5" fontWeight="600" fill="#1e293b">{item.n}</text>
            <text x="92" y={64 + i * 22} textAnchor="end" fontSize="3.5" fontWeight="800" fill={c}>{item.p}</text>
            {i < items.length - 1 && <line x1="28" y1={68 + i * 22} x2="92" y2={68 + i * 22} stroke="#f1f5f9" strokeWidth="0.4" />}
          </g>
        ))}
        <line x1="26" y1="138" x2="94" y2="138" stroke="#e2e8f0" strokeWidth="0.5" />
        <text x="60" y="148" textAnchor="middle" fontSize="2.5" fontWeight="500" fill="#94a3b8">* 상태에 따라 변동 가능</text>
      </> : t.layoutHint === 'cards' ? <>
        {/* 카드 — 심플 탭 + 가격 */}
        <text x="60" y="14" textAnchor="middle" fontSize="4" fontWeight="700" fill={a}>{name}</text>
        <text x="60" y="28" textAnchor="middle" fontSize="6" fontWeight="900" fill={c}>비급여 진료비 안내</text>
        {items.map((item, i) => (
          <g key={i}>
            <rect x="10" y={40 + i * 26} width="100" height="22" rx="4" fill={i === 0 ? c : 'white'} fillOpacity={i === 0 ? 1 : 1} stroke={c} strokeWidth={i === 0 ? 0 : 0.4} strokeOpacity="0.2" />
            <text x="18" y={54 + i * 26} fontSize="3.5" fontWeight="700" fill={i === 0 ? 'white' : '#334155'}>{item.n}</text>
            <text x="102" y={54 + i * 26} textAnchor="end" fontSize="3.5" fontWeight="900" fill={i === 0 ? 'white' : c}>{item.p}</text>
          </g>
        ))}
        <text x="60" y="152" textAnchor="middle" fontSize="2.5" fontWeight="500" fill="#94a3b8">* 상태에 따라 변동 가능</text>
      </> : isDarkTheme ? <>
        {/* 다크 프리미엄 — 골드 텍스트 */}
        <text x="60" y="24" textAnchor="middle" fontSize="4" fontWeight="700" fill="#f59e0b" fillOpacity="0.8">{name}</text>
        <text x="60" y="40" textAnchor="middle" fontSize="6" fontWeight="900" fill="white">PRICE LIST</text>
        <rect x="30" y="44" width="60" height="1.5" rx="0.75" fill="#f59e0b" fillOpacity="0.4" />
        {items.map((item, i) => (
          <g key={i}>
            <text x="16" y={68 + i * 22} fontSize="3.5" fontWeight="600" fill="#f59e0b" fillOpacity="0.7">{item.n}</text>
            <text x="104" y={68 + i * 22} textAnchor="end" fontSize="3.5" fontWeight="900" fill="white">{item.p}</text>
            {i < items.length - 1 && <line x1="16" y1={72 + i * 22} x2="104" y2={72 + i * 22} stroke="#f59e0b" strokeWidth="0.3" strokeOpacity="0.15" />}
          </g>
        ))}
        <text x="60" y="152" textAnchor="middle" fontSize="2.5" fontWeight="500" fill="#f59e0b" fillOpacity="0.4">* 상태에 따라 변동 가능</text>
      </> : t.layoutHint === 'minimal' ? <>
        {/* 미니멀 — 순백 최소 잉크 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        <text x="60" y="18" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#94a3b8">{name}</text>
        <text x="60" y="34" textAnchor="middle" fontSize="6" fontWeight="900" fill="#1e293b">비급여 진료비</text>
        <line x1="14" y1="42" x2="106" y2="42" stroke="#e2e8f0" strokeWidth="0.4" />
        {items.map((item, i) => (
          <g key={i}>
            <text x="14" y={62 + i * 24} fontSize="4" fontWeight="600" fill="#1e293b">{item.n}</text>
            <text x="106" y={62 + i * 24} textAnchor="end" fontSize="4" fontWeight="800" fill="#1e293b">{item.p}</text>
            {i < items.length - 1 && <line x1="14" y1={67 + i * 24} x2="106" y2={67 + i * 24} stroke="#f1f5f9" strokeWidth="0.3" />}
          </g>
        ))}
        <text x="60" y="152" textAnchor="middle" fontSize="2.5" fontWeight="400" fill="#cbd5e1">* 상태에 따라 변동 가능</text>
      </> : t.layoutHint === 'wood' ? <>
        {/* 따뜻한 톤 — 클린 리스트 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#fef7ed" />
        <rect x="0" y="0" width="120" height="40" rx="6" fill="#92400e" />
        <text x="60" y="18" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="#fef3c7" fillOpacity="0.8">PRICE LIST</text>
        <text x="60" y="32" textAnchor="middle" fontSize="5.5" fontWeight="900" fill="white">비급여 진료비 안내</text>
        {items.map((item, i) => (
          <g key={i}>
            <text x="16" y={60 + i * 24} fontSize="3.5" fontWeight="700" fill="#78350f">{item.n}</text>
            <text x="104" y={60 + i * 24} textAnchor="end" fontSize="3.5" fontWeight="900" fill="#92400e">{item.p}</text>
            {i < items.length - 1 && <line x1="16" y1={64 + i * 24} x2="104" y2={64 + i * 24} stroke="#92400e" strokeWidth="0.3" strokeOpacity="0.15" />}
          </g>
        ))}
        <text x="60" y="152" textAnchor="middle" fontSize="3" fontWeight="500" fill="#92400e" fillOpacity="0.5">{name}</text>
      </> : <>
        {/* 그라디언트 — 풀폭 헤더 + 흰 카드 */}
        <rect x="0" y="0" width="120" height="48" rx="6" fill={c} />
        <text x="60" y="18" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white" fillOpacity="0.7">{name}</text>
        <text x="60" y="36" textAnchor="middle" fontSize="6" fontWeight="900" fill="white">진료비 안내</text>
        <rect x="8" y="54" width="104" height="96" rx="4" fill="white" filter={`url(#shadow_${t.id})`} />
        {items.map((item, i) => (
          <g key={i}>
            <text x="16" y={74 + i * 20} fontSize="3.5" fontWeight="700" fill="#1e293b">{item.n}</text>
            <text x="104" y={74 + i * 20} textAnchor="end" fontSize="3.5" fontWeight="900" fill={c}>{item.p}</text>
            {i < items.length - 1 && <line x1="16" y1={78 + i * 20} x2="104" y2={78 + i * 20} stroke="#f1f5f9" strokeWidth="0.4" />}
          </g>
        ))}
        <text x="60" y="155" textAnchor="middle" fontSize="2.5" fontWeight="500" fill="#94a3b8">* 상태에 따라 변동 가능</text>
      </>}
    </>);
  }

  // fallback
  return wrap(<>
    <text x="60" y="80" textAnchor="middle" fontSize="6" fill={c}>{t.name}</text>
  </>);
}

export default function TemplateGenerator({ onSwitchToFree }: { onSwitchToFree?: () => void }) {
  const now = new Date();

  // 공통
  const [category, setCategory] = useState<TemplateCategory>('schedule');
  const [hospitalName, setHospitalName] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<StylePreset>(AI_STYLE_PRESETS[0]);
  const [selectedCatTemplate, setSelectedCatTemplate] = useState<CategoryTemplate | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [extraPrompt, setExtraPrompt] = useState('');
  const [templateAppMode, setTemplateAppMode] = useState<TemplateApplicationMode>('inspired');
  const [imageSize, setImageSize] = useState<ImageSize>('auto');
  const [brandingPos, setBrandingPos] = useState<'top' | 'bottom'>('top');

  // 병원 기본 정보
  const [clinicHours, setClinicHours] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [brandColor, setBrandColor] = useState('');
  const [brandAccent, setBrandAccent] = useState('');
  const [showHospitalInfo, setShowHospitalInfo] = useState(false);

  // 진료 일정
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleLayout, setScheduleLayout] = useState<ScheduleLayout>('full_calendar');
  const [calendarTheme, setCalendarTheme] = useState<string>('blue');
  const [notices, setNotices] = useState('');
  const [dayMarks, setDayMarks] = useState<Map<number, DayMark>>(new Map());
  const [shortenedHours, setShortenedHours] = useState<Map<number, string>>(new Map());
  const [vacationReasons, setVacationReasons] = useState<Map<number, string>>(new Map());
  const [markMode, setMarkMode] = useState<DayMark>('closed');

  // 이벤트
  const [evTitle, setEvTitle] = useState('');
  const [evSubtitle, setEvSubtitle] = useState('');
  const [evPriceRaw, setEvPriceRaw] = useState('');
  const [evOrigPriceRaw, setEvOrigPriceRaw] = useState('');
  const [evDiscount, setEvDiscount] = useState('');
  const [evPeriod, setEvPeriod] = useState('');
  const [evDesc, setEvDesc] = useState('');

  // 숫자만 추출
  const parseNum = (s: string) => Number(s.replace(/[^0-9]/g, '')) || 0;
  // 숫자 → 쉼표 포맷
  const fmtWon = (s: string) => { const n = parseNum(s); return n > 0 ? n.toLocaleString() + '원' : ''; };
  // 표시용 가격
  const evPrice = fmtWon(evPriceRaw);
  const evOrigPrice = fmtWon(evOrigPriceRaw);
  // 자동 할인율 계산
  const autoDiscount = (() => {
    const price = parseNum(evPriceRaw), orig = parseNum(evOrigPriceRaw);
    if (orig > 0 && price > 0 && price < orig) {
      const pct = Math.round((1 - price / orig) * 100);
      return `${pct}% OFF`;
    }
    return '';
  })();

  // 의사 소개
  const [docName, setDocName] = useState('');
  const [docSpecialty, setDocSpecialty] = useState('');
  const [docCareer, setDocCareer] = useState('');
  const [docGreeting, setDocGreeting] = useState('');
  const [docPhotoBase64, setDocPhotoBase64] = useState<string | null>(null);

  // 공지사항
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticeDate, setNoticeDate] = useState('');

  // 명절 인사
  const [greetHoliday, setGreetHoliday] = useState('설날');
  const [greetMsg, setGreetMsg] = useState('');
  const [greetClosure, setGreetClosure] = useState('');

  // 채용/공고
  type HiringPageType = 'cover' | 'requirements' | 'benefits' | 'contact' | 'intro' | 'free';
  interface HiringPageData { type: HiringPageType; content: string; }
  const HIRING_PAGE_TYPES: { id: HiringPageType; label: string; placeholder: string }[] = [
    { id: 'cover', label: '표지', placeholder: '간호사 모집합니다\n함께 성장할 인재를 찾습니다' },
    { id: 'requirements', label: '자격요건', placeholder: '해당 면허 소지자\n경력 1년 이상 우대\n성실하고 책임감 있는 분' },
    { id: 'benefits', label: '복리후생', placeholder: '4대보험 가입\n중식 제공\n연차/월차 보장\n인센티브 지급' },
    { id: 'contact', label: '지원방법', placeholder: '이메일: recruit@hospital.com\n전화: 02-1234-5678\n마감: 채용시까지' },
    { id: 'intro', label: '병원소개', placeholder: '최신 장비와 쾌적한 환경\n서울 강남 위치\n직원 만족도 95%' },
    { id: 'free', label: '자유입력', placeholder: '원하는 내용을 자유롭게 입력하세요' },
  ];
  const defaultPageTypes: HiringPageType[] = ['cover', 'requirements', 'benefits', 'contact', 'intro'];
  const [hiringPageCount, setHiringPageCount] = useState(1);
  const [hiringPageData, setHiringPageData] = useState<HiringPageData[]>([{ type: 'cover', content: '' }]);
  const updatePageType = (index: number, type: HiringPageType) => {
    const data = [...hiringPageData]; data[index] = { ...data[index], type }; setHiringPageData(data);
  };
  const updatePageContent = (index: number, content: string) => {
    const data = [...hiringPageData]; data[index] = { ...data[index], content }; setHiringPageData(data);
  };

  // 채용 - 병원 사진
  const [hiringPhotos, setHiringPhotos] = useState<string[]>([]);
  const handleHiringPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => setHiringPhotos(prev => [...prev, reader.result as string].slice(0, 5));
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // 주의사항 (시술/진료 후)
  const [cautionType, setCautionType] = useState('시술 후');
  const [cautionTitle, setCautionTitle] = useState('');
  const [cautionItems, setCautionItems] = useState('');
  const [cautionEmergency, setCautionEmergency] = useState('');
  // 비급여/가격 안내
  const [pricingTitle, setPricingTitle] = useState('비급여 진료비 안내');
  const [pricingItems, setPricingItems] = useState('임플란트 (1개): 1,200,000원\n레진 충전: 150,000원\n치아 미백: 300,000원\n교정 상담: 무료');
  const [pricingNotice, setPricingNotice] = useState('상기 금액은 부가세 포함 금액이며, 환자 상태에 따라 달라질 수 있습니다.');

  // 주의사항 타입별 기본 아이템
  const CAUTION_DEFAULTS: Record<string, { title: string; items: string; emergency: string }> = {
    '시술 후': {
      title: '시술 후 주의사항',
      items: '시술 부위를 혀로 건드리지 마세요\n당일 음주 및 흡연은 피해주세요\n자극적이고 뜨거운 음식은 피해주세요\n딱딱한 음식은 3일간 피해주세요\n양치 시 시술 부위 주의해서 닦아주세요\n부기나 출혈은 2~3일 내 자연 소실됩니다',
      emergency: '이상 증상 시 연락: 02-1234-5678',
    },
    '진료 후': {
      title: '진료 후 안내사항',
      items: '마취가 풀릴 때까지 식사를 피해주세요\n마취 부위를 깨물지 않도록 주의해주세요\n처방된 약은 정해진 시간에 복용해주세요\n당일 과격한 운동은 피해주세요\n통증이 지속되면 내원해주세요',
      emergency: '이상 증상 시 연락: 02-1234-5678',
    },
    '수술 후': {
      title: '수술 후 주의사항',
      items: '거즈는 1~2시간 후 제거해주세요\n수술 당일 침을 뱉지 마세요\n냉찜질을 20분 간격으로 해주세요\n2~3일간 부드러운 음식만 드세요\n음주와 흡연은 최소 1주일 금지입니다\n격한 운동은 1주일간 삼가주세요\n처방약은 반드시 복용해주세요',
      emergency: '출혈·심한 통증 시 즉시 연락: 02-1234-5678',
    },
    '복약': {
      title: '복약 안내',
      items: '식후 30분에 복용해주세요\n정해진 용량을 지켜주세요\n항생제는 끝까지 복용하세요\n알레르기 반응 시 즉시 중단하세요\n두통·어지러움 시 안정을 취하세요',
      emergency: '부작용 발생 시 연락: 02-1234-5678',
    },
    '일반': {
      title: '주의사항 안내',
      items: '안내사항을 잘 읽어주세요\n궁금한 점은 문의해주세요',
      emergency: '',
    },
  };

  const handleCautionTypeChange = (type: string) => {
    setCautionType(type);
    const defaults = CAUTION_DEFAULTS[type];
    if (defaults) {
      if (!cautionItems) setCautionItems(defaults.items);
      if (!cautionTitle) setCautionTitle(defaults.title);
      if (!cautionEmergency) setCautionEmergency(defaults.emergency);
    }
    setSelectedCatTemplate(null);
  };

  // 스타일 히스토리 (이전 생성 스타일 재사용)
  const [styleHistory, setStyleHistory] = useState<SavedStyleHistory[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<SavedStyleHistory | null>(null);

  // 결과
  const [generating, setGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState(0);
  const [resultImages, setResultImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [generatingPage, setGeneratingPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewStyleImage, setPreviewStyleImage] = useState<{ url: string; name: string } | null>(null);
  const [enlargedTemplate, setEnlargedTemplate] = useState<CategoryTemplate | null>(null);
  const [enlargedCalendarTheme, setEnlargedCalendarTheme] = useState<string | null>(null);
  // 재생성 관련
  const [showRegenMenu, setShowRegenMenu] = useState(false);
  const [regenPrompt, setRegenPrompt] = useState('');
  const [showRegenPromptInput, setShowRegenPromptInput] = useState(false);

  useEffect(() => {
    const s = localStorage.getItem('uploaded_logo'); if (s) setLogoBase64(s);
    setStyleHistory(loadStyleHistory());
    // 병원 기본 정보 복원
    const info = localStorage.getItem('hospital_info');
    if (info) {
      try {
        const p = JSON.parse(info);
        if (p.hours) setClinicHours(p.hours);
        if (p.phone) setClinicPhone(p.phone);
        if (p.address) setClinicAddress(p.address);
        if (p.brandColor) setBrandColor(p.brandColor);
        if (p.brandAccent) setBrandAccent(p.brandAccent);
      } catch {}
    }
  }, []);
  useEffect(() => { setDayMarks(new Map()); setShortenedHours(new Map()); setVacationReasons(new Map()); setResultImages([]); setCurrentPage(0); }, [month, year]);
  useEffect(() => { setResultImages([]); setCurrentPage(0); setError(null); setSelectedCatTemplate(null); }, [category]);

  // 명절 자동 기본값
  const HOLIDAY_DEFAULTS: Record<string, { msg: string; closure: string; style?: string }> = {
    '설날': { msg: '새해 복 많이 받으세요\n건강하고 행복한 한 해 되시길 바랍니다', closure: '1/28(화) ~ 1/30(목)' },
    '추석': { msg: '풍성한 한가위 보내세요\n가족과 함께 행복한 추석 되세요', closure: '10/5(일) ~ 10/7(화)' },
    '새해': { msg: 'Happy New Year!\n새해에도 건강하시길 바랍니다', closure: '1/1(수)' },
    '어버이날': { msg: '감사합니다, 사랑합니다\n어버이날을 진심으로 축하드립니다', closure: '' },
    '크리스마스': { msg: 'Merry Christmas!\n따뜻하고 행복한 성탄절 보내세요', closure: '12/25(목)' },
  };
  useEffect(() => {
    const defaults = HOLIDAY_DEFAULTS[greetHoliday];
    if (defaults && category === 'greeting') {
      if (!greetMsg) setGreetMsg(defaults.msg);
      if (!greetClosure) setGreetClosure(defaults.closure);
    }
  }, [greetHoliday]);

  // 카테고리 전환 시 명절 기본값 리셋
  useEffect(() => {
    if (category === 'greeting') {
      const defaults = HOLIDAY_DEFAULTS[greetHoliday];
      if (defaults && !greetMsg) setGreetMsg(defaults.msg);
      if (defaults && !greetClosure) setGreetClosure(defaults.closure);
    }
  }, [category]);

  // 달력 그리드
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = new Array(firstDay).fill(null);
  for (let d = 1; d <= lastDate; d++) { week.push(d); if (week.length === 7) { weeks.push(week); week = []; } }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }
  const holidays = getFixedHolidays(month);

  const handleDayClick = (day: number) => {
    const m = new Map(dayMarks);
    if (m.get(day) === markMode) { m.delete(day); const sh = new Map(shortenedHours); sh.delete(day); setShortenedHours(sh); const vr = new Map(vacationReasons); vr.delete(day); setVacationReasons(vr); }
    else { m.set(day, markMode); }
    setDayMarks(m);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const b = reader.result as string; setLogoBase64(b); localStorage.setItem('uploaded_logo', b); };
    reader.readAsDataURL(file);
  };

  const saveHospitalInfo = () => {
    localStorage.setItem('hospital_info', JSON.stringify({
      hours: clinicHours, phone: clinicPhone, address: clinicAddress,
      brandColor, brandAccent,
    }));
  };

  const handleDocPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDocPhotoBase64(reader.result as string);
    reader.readAsDataURL(file);
  };

  // 현재 사용할 스타일 프롬프트 결정 (히스토리 > 카테고리 템플릿 > 달력테마시 빈값 > 일반 프리셋)
  // 진료일정에서 달력 테마가 선택된 경우, 스타일 프리셋 프롬프트를 사용하지 않음 (테마 자체 프롬프트가 우선)
  const calendarThemeActive = category === 'schedule' && calendarTheme && !['blue', 'green', 'warm'].includes(calendarTheme);
  const activeStylePrompt = selectedHistory?.stylePrompt || selectedCatTemplate?.aiPrompt || (calendarThemeActive ? '' : selectedStyle.aiPrompt);
  const activeStyleName = selectedHistory?.name || selectedCatTemplate?.name || (calendarThemeActive ? calendarTheme : selectedStyle.name);

  const handleGenerate = async (regenExtra?: string) => {
    setGenerating(true); setError(null); setGeneratingStep(0); setResultImages([]); setCurrentPage(0); setGeneratingPage(0);
    setShowRegenMenu(false); setShowRegenPromptInput(false);
    const stepTimer = setInterval(() => setGeneratingStep(s => s + 1), 3000);
    try {
      const sizeConfig = [...IMAGE_SIZES].find(s => s.id === imageSize) || IMAGE_SIZES[3];

      const closed: ClosedDay[] = []; const shortened: ShortenedDay[] = []; const vacation: VacationDay[] = [];
      dayMarks.forEach((mark, day) => {
        if (mark === 'closed') closed.push({ day });
        else if (mark === 'shortened') shortened.push({ day, hours: shortenedHours.get(day) });
        else if (mark === 'vacation') vacation.push({ day, reason: vacationReasons.get(day) });
      });

      let templateData: Record<string, any>;
      if (category === 'schedule') {
        templateData = { month, year, title: scheduleTitle || `${month}월 휴진 안내`, closedDays: closed, shortenedDays: shortened.length > 0 ? shortened : undefined, vacationDays: vacation.length > 0 ? vacation : undefined, notices: notices.split('\n').filter(Boolean), layout: scheduleLayout, colorTheme: calendarTheme };
      } else if (category === 'event') {
        templateData = { title: evTitle, subtitle: evSubtitle || undefined, price: evPrice || undefined, originalPrice: evOrigPrice || undefined, discount: evDiscount || autoDiscount || undefined, period: evPeriod || undefined, description: evDesc || undefined };
      } else if (category === 'doctor') {
        templateData = { doctorName: docName, specialty: docSpecialty, career: docCareer.split('\n').filter(Boolean), greeting: docGreeting || undefined, doctorPhotoBase64: docPhotoBase64 || undefined };
      } else if (category === 'notice') {
        templateData = { title: noticeTitle, content: noticeContent.split('\n').filter(Boolean), effectiveDate: noticeDate || undefined };
      } else if (category === 'hiring') {
        templateData = { pageData: hiringPageData.slice(0, hiringPageCount).map(p => ({ type: p.type, content: p.content })), hospitalPhotos: hiringPhotos.length > 0 ? hiringPhotos : undefined };
      } else if (category === 'caution') {
        templateData = { type: cautionType, title: cautionTitle || `${cautionType} 주의사항`, items: cautionItems.split('\n').filter(Boolean), emergency: cautionEmergency || undefined };
      } else if (category === 'pricing') {
        templateData = { title: pricingTitle || '비급여 진료비 안내', items: pricingItems.split('\n').filter(Boolean), notice: pricingNotice || undefined };
      } else {
        templateData = { holiday: greetHoliday, greeting: greetMsg, closurePeriod: greetClosure || undefined };
      }

      const hospitalInfoLines = [clinicHours, clinicPhone, clinicAddress].filter(Boolean);
      const allExtraPrompts = [String(customMessage || '').trim(), String(extraPrompt || '').trim(), regenExtra ? String(regenExtra).trim() : ''].filter(Boolean);

      const totalPages = category === 'hiring' ? hiringPageCount : 1;
      const images: string[] = [];
      let firstPageRef: string | undefined;

      for (let page = 1; page <= totalPages; page++) {
        setGeneratingPage(page);

        const pageData = totalPages > 1
          ? { ...templateData, currentPage: page, totalPages }
          : templateData;

        // 2장째부터 1장을 스타일 참조로 사용 (톤 통일)
        // 커스텀 이미지 템플릿 선택 시 해당 이미지를 스타일 참조로 사용
        const customRef = selectedCatTemplate?.previewImage || undefined;
        const styleRef = page === 1
          ? (selectedHistory?.referenceImageUrl || customRef || undefined)
          : firstPageRef;

        const imageDataUrl = await generateTemplateWithAI(category, pageData, activeStylePrompt, {
          hospitalName: hospitalName || undefined,
          logoBase64,
          brandingPosition: brandingPos,
          styleReferenceImage: styleRef,
          extraPrompt: allExtraPrompts.join('\n') || undefined,
          imageSize: sizeConfig.width > 0 ? { width: sizeConfig.width, height: sizeConfig.height } : undefined,
          hospitalInfo: hospitalInfoLines.length > 0 ? hospitalInfoLines : undefined,
          brandColor: brandColor || undefined,
          brandAccent: brandAccent || undefined,
          applicationMode: templateAppMode,
        });

        images.push(imageDataUrl);
        setResultImages([...images]);
        setCurrentPage(images.length - 1);

        // 1장째 결과를 스타일 참조용으로 저장
        if (page === 1) {
          try { firstPageRef = await resizeImageForReference(imageDataUrl); } catch {}
        }
      }

      // 스타일 히스토리에 1장째 저장
      try {
        const [thumbnail, referenceImg] = await Promise.all([
          resizeImageToThumbnail(images[0]),
          resizeImageForReference(images[0]),
        ]);
        saveStyleToHistory({
          name: activeStyleName,
          stylePrompt: activeStylePrompt,
          thumbnailDataUrl: thumbnail,
          referenceImageUrl: referenceImg,
          presetId: selectedHistory ? selectedHistory.presetId : selectedStyle.id,
        });
        setStyleHistory(loadStyleHistory());
      } catch (e) { console.warn('스타일 히스토리 저장 실패:', e); }

    } catch (err: any) {
      console.error('🔴 handleGenerate 에러:', err, '\n스택:', err?.stack);
      const msg = typeof err?.message === 'string' ? err.message : String(err);
      setError(msg || 'AI 이미지 생성에 실패했습니다. 다시 시도해주세요.');
    } finally { clearInterval(stepTimer); setGenerating(false); setGeneratingPage(0); }
  };

  const handleDeleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteStyleFromHistory(id);
    setStyleHistory(loadStyleHistory());
    if (selectedHistory?.id === id) setSelectedHistory(null);
  };

  const handleDownload = (pageIndex?: number) => {
    if (resultImages.length === 0) return;
    const suffixes: Record<TemplateCategory, string> = { schedule: `${month}월_진료안내`, event: '이벤트', doctor: '의사소개', notice: '공지사항', greeting: '인사', hiring: '채용공고', caution: '주의사항', pricing: '비급여안내' };
    const baseName = `${hospitalName || '병원'}_${suffixes[category]}`;
    if (pageIndex !== undefined) {
      const a = document.createElement('a'); a.href = resultImages[pageIndex];
      a.download = resultImages.length > 1 ? `${baseName}_${pageIndex + 1}.png` : `${baseName}.png`; a.click();
    } else {
      resultImages.forEach((img, i) => {
        const a = document.createElement('a'); a.href = img;
        a.download = resultImages.length > 1 ? `${baseName}_${i + 1}.png` : `${baseName}.png`; a.click();
      });
    }
  };

  const closedCount = [...dayMarks.values()].filter(v => v === 'closed').length;
  const shortenedCount = [...dayMarks.values()].filter(v => v === 'shortened').length;
  const vacationCount = [...dayMarks.values()].filter(v => v === 'vacation').length;

  const ph: Record<TemplateCategory, { icon: string; t: string; d: string }> = {
    schedule: { icon: '\u{1F4C5}', t: '진료 일정 이미지', d: '정보를 입력하고 날짜를 클릭하세요' },
    event: { icon: '\u{1F389}', t: '이벤트 이미지', d: '이벤트 정보를 입력하세요' },
    doctor: { icon: '\u{1F9D1}\u200D\u2695\uFE0F', t: '의사 소개 이미지', d: '전문의 정보를 입력하세요' },
    notice: { icon: '\u{1F4E2}', t: '공지사항 이미지', d: '공지 내용을 입력하세요' },
    greeting: { icon: '\u{1F38A}', t: '명절 인사 이미지', d: '인사말을 입력하세요' },
    hiring: { icon: '\u{1F4CB}', t: '채용/공고 이미지', d: '모집 정보를 입력하세요' },
    caution: { icon: '\u26A0\uFE0F', t: '주의사항 이미지', d: '주의사항을 입력하세요' },
    pricing: { icon: '\u{1F4B0}', t: '비급여 안내 이미지', d: '시술 항목과 가격을 입력하세요' },
  };

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
      {/* 왼쪽: 설정 패널 — InputForm과 동일한 카드 스타일 */}
      <div className="w-full lg:w-[400px] xl:w-[440px] lg:flex-none bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* 헤더 - InputForm과 동일한 컬러 헤더 */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-emerald-50 border-emerald-100">
        <span>🖼️</span>
        <span className="text-xs font-bold text-emerald-700">이미지 생성</span>
        {onSwitchToFree && (
          <div className="ml-auto flex bg-white/80 rounded-lg p-0.5 border border-emerald-200/60">
            <button className="px-3 py-1 rounded-md text-xs font-bold bg-blue-600 text-white shadow-sm">템플릿</button>
            <button onClick={onSwitchToFree} className="px-3 py-1 rounded-md text-xs font-semibold text-slate-500 hover:text-slate-700 transition-all">자유 입력</button>
          </div>
        )}
      </div>
      <div className="space-y-4 p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>

        {/* 카테고리 탭 — 4열 그리드 */}
        <div className="grid grid-cols-4 gap-1.5">
          {CATEGORIES.map(c => {
            const active = category === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all duration-200 border ${
                  active
                    ? 'bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-200/50'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-500 hover:shadow-sm'
                }`}
              >
                <span className="text-sm leading-none">{c.icon}</span>
                {c.name}
              </button>
            );
          })}
        </div>

        {/* 병원 브랜딩 */}
        <div className="bg-slate-50/60 rounded-xl p-4 border border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-500">병원 브랜딩</label>
            {/* 상단/하단 위치 토글 */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
              {(['top', 'bottom'] as const).map(pos => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setBrandingPos(pos)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    brandingPos === pos
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {pos === 'top' ? '▲ 상단' : '▼ 하단'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {/* 로고 업로드 */}
            <label className="flex-shrink-0 w-12 h-12 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors overflow-hidden bg-white">
              {logoBase64 ? (
                <img src={logoBase64} alt="로고" className="w-full h-full object-contain" />
              ) : (
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = (ev) => setLogoBase64(ev.target?.result as string);
                reader.readAsDataURL(f);
              }} />
            </label>
            <input type="text" value={hospitalName} onChange={e => setHospitalName(e.target.value)} placeholder="병원명 입력 (선택)" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white" />
          </div>
        </div>

        {/* === 진료 일정 === */}
        {category === 'schedule' && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1"><label className={labelCls}>연도</label><select value={year} onChange={e => setYear(Number(e.target.value))} className={inputCls}>{[now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}년</option>)}</select></div>
              <div className="flex-1"><label className={labelCls}>월</label><select value={month} onChange={e => setMonth(Number(e.target.value))} className={inputCls}>{Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}</select></div>
            </div>
            <div><label className={labelCls}>제목</label><input type="text" value={scheduleTitle} onChange={e => setScheduleTitle(e.target.value)} placeholder={`${month}월 휴진 안내`} className={inputCls} /></div>
            <div>
              <label className={labelCls}>레이아웃 스타일</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'full_calendar' as ScheduleLayout, icon: '\u{1F4C5}', name: '전체 달력', desc: '월간 캘린더' },
                  { id: 'week' as ScheduleLayout, icon: '\u{1F4CB}', name: '한 주', desc: '주간 캘린더' },
                  { id: 'highlight' as ScheduleLayout, icon: '\u2B50', name: '강조형', desc: '날짜 강조' },
                ]).map(lt => (
                  <button
                    key={lt.id}
                    type="button"
                    onClick={() => { setScheduleLayout(lt.id); setSelectedCatTemplate(null); }}
                    className={`py-2.5 px-2 rounded-xl text-center transition-all border ${
                      scheduleLayout === lt.id
                        ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-lg">{lt.icon}</div>
                    <div className={`text-xs font-bold ${scheduleLayout === lt.id ? 'text-blue-700' : 'text-slate-700'}`}>{lt.name}</div>
                    <div className="text-[10px] text-slate-400">{lt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2">마킹 모드 (선택 후 달력 클릭)</label>
              <div className="flex gap-2">
                {([{ m: 'closed' as DayMark, l: '휴진', bg: 'bg-red-500', r: 'ring-red-300' }, { m: 'shortened' as DayMark, l: '단축', bg: 'bg-amber-500', r: 'ring-amber-300' }, { m: 'vacation' as DayMark, l: '휴가', bg: 'bg-purple-500', r: 'ring-purple-300' }]).map(({ m: md, l, bg, r }) => (
                  <button key={md} onClick={() => setMarkMode(md)} className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all ${markMode === md ? `${bg} text-white ring-2 ${r} shadow-md` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{l}</button>
                ))}
              </div>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 text-center text-sm font-bold text-slate-700">{year}년 {month}월</div>
              <table className="w-full border-collapse"><thead><tr>{['일','월','화','수','목','금','토'].map((d,i) => (<th key={d} className={`py-2 text-xs font-bold ${i===0?'text-red-500':i===6?'text-blue-500':'text-slate-500'}`}>{d}</th>))}</tr></thead>
              <tbody>{weeks.map((w,wi) => (<tr key={wi}>{w.map((d,di) => {
                if (d===null) return <td key={di} className="p-1" />;
                const mark = dayMarks.get(d); const isH = holidays.has(d); const isSun = di===0; const isSat = di===6;
                let bg = 'bg-white hover:bg-slate-50', tx = 'text-slate-700', badge = '';
                if (mark==='closed'){bg='bg-red-50 ring-1 ring-red-300';tx='text-red-600 font-bold';badge='휴진';}
                else if(mark==='shortened'){bg='bg-amber-50 ring-1 ring-amber-300';tx='text-amber-600 font-bold';badge='단축';}
                else if(mark==='vacation'){bg='bg-purple-50 ring-1 ring-purple-300';tx='text-purple-600 font-bold';badge='휴가';}
                else if(isSun||isH)tx='text-red-500'; else if(isSat)tx='text-blue-500';
                return (<td key={di} className="p-1"><button onClick={()=>handleDayClick(d)} className={`w-full rounded-lg py-1.5 text-center cursor-pointer transition-all ${bg} ${tx}`}><div className="text-sm">{d}</div>{badge&&<div className="text-[9px] font-bold -mt-0.5">{badge}</div>}{isH&&!badge&&<div className="text-[9px] text-red-400">{holidays.get(d)}</div>}</button></td>);
              })}</tr>))}</tbody></table>
            </div>
            {(closedCount>0||shortenedCount>0||vacationCount>0)&&(<div className="flex gap-2 flex-wrap text-xs">{closedCount>0&&<span className="px-2 py-1 bg-red-50 text-red-600 rounded-full font-semibold">휴진 {closedCount}일</span>}{shortenedCount>0&&<span className="px-2 py-1 bg-amber-50 text-amber-600 rounded-full font-semibold">단축 {shortenedCount}일</span>}{vacationCount>0&&<span className="px-2 py-1 bg-purple-50 text-purple-600 rounded-full font-semibold">휴가 {vacationCount}일</span>}</div>)}
            {shortenedCount>0&&(<div className="space-y-2"><label className={labelCls}>단축진료 시간</label>{[...dayMarks].filter(([,m])=>m==='shortened').sort(([a],[b])=>a-b).map(([day])=>(<div key={day} className="flex items-center gap-2"><span className="text-sm font-medium text-amber-600 w-12">{day}일</span><input type="text" value={shortenedHours.get(day)||''} onChange={e=>{const m=new Map(shortenedHours);m.set(day,e.target.value);setShortenedHours(m);}} placeholder="예: 10:00~14:00" className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs" /></div>))}</div>)}
            {vacationCount>0&&(<div className="space-y-2"><label className={labelCls}>휴가 사유</label>{[...dayMarks].filter(([,m])=>m==='vacation').sort(([a],[b])=>a-b).map(([day])=>(<div key={day} className="flex items-center gap-2"><span className="text-sm font-medium text-purple-600 w-12">{day}일</span><input type="text" value={vacationReasons.get(day)||''} onChange={e=>{const m=new Map(vacationReasons);m.set(day,e.target.value);setVacationReasons(m);}} placeholder="예: 원장님 학회" className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs" /></div>))}</div>)}
            <div><label className={labelCls}>안내 문구 (줄바꿈으로 구분)</label><textarea value={notices} onChange={e=>setNotices(e.target.value)} placeholder={"진료시간: 평일 09:00~18:00\n점심시간: 13:00~14:00"} rows={3} className={textareaCls} /></div>
          </div>
        )}

        {/* === 이벤트 === */}
        {category === 'event' && (
          <div className="space-y-3">
            <div><label className={labelCls}>이벤트 제목</label><input type="text" value={evTitle} onChange={e=>setEvTitle(e.target.value)} placeholder="예: 임플란트 봄맞이 할인 이벤트" className={inputCls} /></div>
            <div><label className={labelCls}>부제목 <span className="text-slate-400 font-normal">(선택)</span></label><input type="text" value={evSubtitle} onChange={e=>setEvSubtitle(e.target.value)} placeholder="예: 봄맞이 특별 이벤트" className={inputCls} /></div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelCls}>이벤트 가격</label>
                <input type="text" inputMode="numeric" value={evPriceRaw} onChange={e=>setEvPriceRaw(e.target.value)} placeholder="300000" className={inputCls} />
                {evPrice && <p className="text-xs text-blue-500 mt-0.5 font-medium">{evPrice}</p>}
              </div>
              <div className="flex-1">
                <label className={labelCls}>정가 <span className="text-slate-400 font-normal">(취소선)</span></label>
                <input type="text" inputMode="numeric" value={evOrigPriceRaw} onChange={e=>setEvOrigPriceRaw(e.target.value)} placeholder="150000" className={inputCls} />
                {evOrigPrice && <p className="text-xs text-slate-400 mt-0.5 line-through">{evOrigPrice}</p>}
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelCls}>할인율 <span className="text-slate-400 font-normal">(자동계산)</span></label>
                <input type="text" value={evDiscount || autoDiscount} onChange={e=>setEvDiscount(e.target.value)} placeholder={autoDiscount || '자동 계산됨'} className={inputCls} />
                {autoDiscount && !evDiscount && <p className="text-xs text-emerald-500 mt-0.5 font-medium">자동: {autoDiscount}</p>}
              </div>
              <div className="flex-1"><label className={labelCls}>이벤트 기간</label><input type="text" value={evPeriod} onChange={e=>setEvPeriod(e.target.value)} placeholder="3/1 ~ 3/31" className={inputCls} /></div>
            </div>
            <div><label className={labelCls}>상세 설명 <span className="text-slate-400 font-normal">(선택)</span></label><textarea value={evDesc} onChange={e=>setEvDesc(e.target.value)} placeholder={"임플란트+잇몸치료 패키지\n첫 방문 고객 한정"} rows={3} className={textareaCls} /></div>
          </div>
        )}

        {/* === 의사 소개 === */}
        {category === 'doctor' && (
          <div className="space-y-3">
            <div className="flex gap-3 items-start">
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <label className={labelCls}>사진</label>
                <label className="w-20 h-24 rounded-lg border-2 border-dashed border-slate-300 bg-white flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors overflow-hidden">
                  {docPhotoBase64 ? (
                    <img src={docPhotoBase64} alt="의사 사진" className="w-full h-full object-cover rounded-md" />
                  ) : (
                    <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handleDocPhotoUpload} />
                </label>
                {docPhotoBase64 && <button type="button" onClick={()=>setDocPhotoBase64(null)} className="text-xs text-red-400 hover:text-red-600">삭제</button>}
              </div>
              <div className="flex-1 space-y-2">
                <div><label className={labelCls}>의사 이름</label><input type="text" value={docName} onChange={e=>setDocName(e.target.value)} placeholder="김철수" className={inputCls} /></div>
                <div><label className={labelCls}>전문 분야</label><input type="text" value={docSpecialty} onChange={e=>setDocSpecialty(e.target.value)} placeholder="치과보철과 전문의" className={inputCls} /></div>
              </div>
            </div>
            <div><label className={labelCls}>경력/학력 <span className="text-slate-400 font-normal">(줄바꿈으로 구분)</span></label><textarea value={docCareer} onChange={e=>setDocCareer(e.target.value)} placeholder={"서울대학교 치의학대학원 졸업\n서울대치과병원 전공의\n대한치과보철학회 정회원"} rows={4} className={textareaCls} /></div>
            <div><label className={labelCls}>인사말 <span className="text-slate-400 font-normal">(선택)</span></label><textarea value={docGreeting} onChange={e=>setDocGreeting(e.target.value)} placeholder="환자분들의 건강한 삶을 위해 최선을 다하겠습니다." rows={2} className={textareaCls} /></div>
          </div>
        )}

        {/* === 공지사항 === */}
        {category === 'notice' && (
          <div className="space-y-3">
            <div><label className={labelCls}>공지 제목</label><input type="text" value={noticeTitle} onChange={e=>setNoticeTitle(e.target.value)} placeholder="진료시간 변경 안내" className={inputCls} /></div>
            <div><label className={labelCls}>공지 내용 <span className="text-slate-400 font-normal">(줄바꿈으로 구분)</span></label><textarea value={noticeContent} onChange={e=>setNoticeContent(e.target.value)} placeholder={"평일 진료시간이 변경됩니다\n변경 전: 09:00~18:00\n변경 후: 09:00~19:00"} rows={5} className={textareaCls} /></div>
            <div><label className={labelCls}>적용일 <span className="text-slate-400 font-normal">(선택)</span></label><input type="text" value={noticeDate} onChange={e=>setNoticeDate(e.target.value)} placeholder="2026년 4월 1일부터" className={inputCls} /></div>
          </div>
        )}

        {/* === 명절 인사 === */}
        {category === 'greeting' && (
          <div className="space-y-3">
            <div><label className={labelCls}>명절 종류</label>
              <div className="flex gap-1.5">{['설날','추석','새해','어버이날','크리스마스'].map(h => (<button key={h} onClick={()=>{ setGreetHoliday(h); setSelectedCatTemplate(null); const d = HOLIDAY_DEFAULTS[h]; if (d) { setGreetMsg(d.msg); setGreetClosure(d.closure); } }} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${greetHoliday===h?'bg-slate-800 text-white shadow-md':'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{h}</button>))}</div>
            </div>
            <div><label className={labelCls}>인사말</label><textarea value={greetMsg} onChange={e=>setGreetMsg(e.target.value)} placeholder={"풍성한 한가위 보내시고\n건강하고 행복한 추석 되세요"} rows={3} className={textareaCls} /></div>
            <div><label className={labelCls}>휴진 기간 <span className="text-slate-400 font-normal">(선택)</span></label><input type="text" value={greetClosure} onChange={e=>setGreetClosure(e.target.value)} placeholder="9/28(토) ~ 10/1(화)" className={inputCls} /></div>
          </div>
        )}

        {/* === 채용/공고 === */}
        {category === 'hiring' && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>페이지 수</label>
              <div className="flex gap-1.5">
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => {
                    setHiringPageCount(n);
                    setHiringPageData(prev => {
                      const data = [...prev];
                      while (data.length < n) data.push({ type: defaultPageTypes[data.length] || 'free', content: '' });
                      return data.slice(0, n);
                    });
                  }} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${hiringPageCount === n ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {n}장
                  </button>
                ))}
              </div>
              {hiringPageCount > 1 && (
                <p className="text-[10px] text-slate-400 mt-1">1장째 스타일 기준으로 나머지 페이지 톤이 통일됩니다</p>
              )}
            </div>
            {/* 병원 사진 업로드 */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-600">병원 사진 <span className="text-slate-400 font-normal">(선택, 최대 5장)</span></label>
                {hiringPhotos.length > 0 && <button type="button" onClick={() => setHiringPhotos([])} className="text-[10px] text-red-400 hover:text-red-600">전체 삭제</button>}
              </div>
              <div className="flex gap-2 flex-wrap">
                {hiringPhotos.map((photo, i) => (
                  <div key={i} className="relative group">
                    <img src={photo} alt={`병원사진 ${i + 1}`} className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
                    <button onClick={() => setHiringPhotos(prev => prev.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow">x</button>
                  </div>
                ))}
                {hiringPhotos.length < 5 && (
                  <label className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 transition-colors">
                    <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    <span className="text-[8px] text-slate-400 mt-0.5">사진 추가</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleHiringPhotoUpload} />
                  </label>
                )}
              </div>
              <p className="text-[9px] text-slate-400">병원 외관, 내부, 장비 등 사진을 넣으면 AI가 디자인에 활용합니다</p>
            </div>

            {Array.from({ length: hiringPageCount }, (_, i) => {
              const page = hiringPageData[i] || { type: 'free', content: '' };
              const typeInfo = HIRING_PAGE_TYPES.find(t => t.id === page.type) || HIRING_PAGE_TYPES[5];
              return (
                <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">{hiringPageCount > 1 ? `${i + 1}페이지` : '내용'}</span>
                    <div className="flex gap-1">
                      {HIRING_PAGE_TYPES.map(t => (
                        <button key={t.id} onClick={() => updatePageType(i, t.id)} className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${page.type === t.id ? 'bg-slate-700 text-white' : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-200'}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={page.content}
                    onChange={e => updatePageContent(i, e.target.value)}
                    placeholder={typeInfo.placeholder}
                    rows={hiringPageCount === 1 ? 5 : 3}
                    className={textareaCls}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* === 주의사항 === */}
        {category === 'caution' && (
          <div className="space-y-3">
            <div><label className={labelCls}>주의사항 유형</label>
              <div className="flex gap-1.5">{['시술 후','진료 후','수술 후','복약','일반'].map(t => (<button key={t} onClick={()=>handleCautionTypeChange(t)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${cautionType===t?'bg-slate-800 text-white shadow-md':'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{t}</button>))}</div>
            </div>
            <div><label className={labelCls}>제목 <span className="text-slate-400 font-normal">(자동 생성됨)</span></label><input type="text" value={cautionTitle} onChange={e=>setCautionTitle(e.target.value)} placeholder={`${cautionType} 주의사항`} className={inputCls} /></div>
            <div><label className={labelCls}>주의사항 항목 <span className="text-slate-400 font-normal">(줄바꿈으로 구분)</span></label><textarea value={cautionItems} onChange={e=>setCautionItems(e.target.value)} placeholder={"시술 부위를 혀로 건드리지 마세요\n당일 음주 및 흡연은 피해주세요\n부기나 출혈은 2~3일 내 자연 소실됩니다\n딱딱한 음식은 일주일간 피해주세요"} rows={5} className={textareaCls} /></div>
            <div><label className={labelCls}>응급 연락처 <span className="text-slate-400 font-normal">(선택)</span></label><input type="text" value={cautionEmergency} onChange={e=>setCautionEmergency(e.target.value)} placeholder="이상 증상 시 연락: 02-1234-5678" className={inputCls} /></div>
          </div>
        )}

        {category === 'pricing' && (
          <div className="space-y-3">
            <div><label className={labelCls}>제목</label><input type="text" value={pricingTitle} onChange={e=>setPricingTitle(e.target.value)} placeholder="비급여 진료비 안내" className={inputCls} /></div>
            <div><label className={labelCls}>항목 <span className="text-slate-400 font-normal">(줄바꿈으로 구분, "항목명: 가격" 형식)</span></label><textarea value={pricingItems} onChange={e=>setPricingItems(e.target.value)} placeholder={"임플란트 (1개): 1,200,000원\n레진 충전: 150,000원\n치아 미백: 300,000원\n교정 상담: 무료"} rows={6} className={textareaCls} /></div>
            <div><label className={labelCls}>하단 안내 <span className="text-slate-400 font-normal">(선택)</span></label><input type="text" value={pricingNotice} onChange={e=>setPricingNotice(e.target.value)} placeholder="상기 금액은 환자 상태에 따라 달라질 수 있습니다." className={inputCls} /></div>
          </div>
        )}

        {/* 추가 문구 */}
        <div>
          <label className={labelCls}>추가 문구 <span className="text-slate-400 font-normal">(선택 - 하단 표시)</span></label>
          <textarea value={customMessage} onChange={e=>setCustomMessage(e.target.value)} placeholder={"불편을 드려 죄송합니다.\n응급 시 \u260E 010-1234-5678"} rows={2} className={textareaCls} />
        </div>

        {/* 추가 프롬프트 (AI 자유 지시) */}
        <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
          <label className="block text-xs font-semibold text-indigo-700 mb-1">
            추가 프롬프트 <span className="text-indigo-400 font-normal">(AI에게 자유롭게 지시)</span>
          </label>
          <textarea value={extraPrompt} onChange={e=>setExtraPrompt(e.target.value)} placeholder={"예: 벚꽃 느낌으로 꾸며줘\n예: 하단에 전화번호 크게 넣어줘\n예: 더 고급스럽고 모던하게"} rows={2} className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 resize-none bg-white" />
        </div>

        {/* 이미지 사이즈 */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-2">이미지 사이즈</label>
          <div className="grid grid-cols-5 gap-1.5">
            {IMAGE_SIZES.map(s => (
              <button key={s.id} onClick={() => setImageSize(s.id)} className={`py-2 px-1 rounded-xl text-center transition-all ${imageSize === s.id ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                <div className="text-sm leading-none">{s.icon}</div>
                <div className="text-[10px] font-bold mt-1 leading-tight">{s.label}</div>
                <div className={`text-[8px] mt-0.5 ${imageSize === s.id ? 'text-slate-300' : 'text-slate-400'}`}>{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 내 스타일 히스토리 (이전 생성 결과 재사용) + 이미지 업로드 */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-2">
            내 스타일 {styleHistory.length > 0 && <span className="text-slate-400 font-normal">({styleHistory.length}개)</span>}
          </label>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {/* 이미지 업로드 버튼 */}
            <label className="relative flex-shrink-0 w-16 h-16 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50 flex flex-col items-center justify-center cursor-pointer hover:border-violet-500 hover:bg-violet-100 transition-all">
              <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              <span className="text-[8px] text-violet-500 font-bold mt-0.5">업로드</span>
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = async () => {
                  const dataUrl = reader.result as string;
                  const [thumb, ref] = await Promise.all([
                    resizeImageToThumbnail(dataUrl),
                    resizeImageForReference(dataUrl),
                  ]);
                  saveStyleToHistory({
                    name: '업로드 스타일',
                    stylePrompt: 'Copy the exact visual style from the reference image. Match illustration style, colors, layout, typography, and all decorative elements as closely as possible.',
                    thumbnailDataUrl: thumb,
                    referenceImageUrl: ref,
                    presetId: 'uploaded',
                  });
                  setStyleHistory(loadStyleHistory());
                };
                reader.readAsDataURL(file);
                e.target.value = '';
              }} />
            </label>
            {styleHistory.map(h => (
              <button key={h.id} onClick={() => { setSelectedHistory(selectedHistory?.id === h.id ? null : h); }} onDoubleClick={() => setPreviewStyleImage({ url: h.referenceImageUrl, name: h.name })} className={`relative flex-shrink-0 w-16 rounded-xl overflow-hidden border-2 transition-all group ${selectedHistory?.id === h.id ? 'border-violet-500 shadow-lg scale-105 ring-2 ring-violet-200' : 'border-slate-200 hover:border-slate-300'}`}>
                <img src={h.thumbnailDataUrl} alt={h.name} className="w-16 h-16 object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5">
                  <div className="text-[8px] text-white font-medium truncate">{h.name}</div>
                </div>
                <button onClick={(e) => handleDeleteHistory(h.id, e)} className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500/80 text-white rounded-full text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">x</button>
              </button>
            ))}
          </div>
          {selectedHistory && (
            <div className="mt-1.5 p-2 bg-violet-50 rounded-lg border border-violet-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-violet-700">스타일 적용 중: {selectedHistory.name}</span>
                <button onClick={() => setSelectedHistory(null)} className="text-[10px] text-violet-400 hover:text-violet-600">해제</button>
              </div>
            </div>
          )}
        </div>

        {/* 카테고리별 디자인 템플릿 (12개) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-bold text-slate-700">
              디자인 템플릿 {selectedHistory && <span className="text-violet-400 font-normal text-xs">(내 스타일 선택 시 무시됨)</span>}
            </label>
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setTemplateAppMode('strict')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${templateAppMode === 'strict' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                title="선택한 템플릿의 레이아웃·색상·구조를 그대로 복제합니다"
              >그대로</button>
              <button
                type="button"
                onClick={() => setTemplateAppMode('inspired')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${templateAppMode === 'inspired' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                title="템플릿의 분위기를 참고하되 AI가 자유롭게 재해석합니다"
              >참고</button>
            </div>
          </div>
          {/* strict/inspired 모드 설명 */}
          <p className="text-[10px] text-slate-400 -mt-1.5 mb-2">
            {templateAppMode === 'strict'
              ? '📋 레이아웃·색상·구조를 그대로 복제 — 결과가 프리뷰와 거의 동일'
              : '🎨 분위기만 참고 — AI가 색상·배치·장식을 자유롭게 재해석'}
          </p>
          {category === 'schedule' ? (
            /* 진료 일정: 달력 테마 — 3열 그리드, 스크롤 가능 */
            <div className="grid grid-cols-3 gap-3 max-h-[480px] overflow-y-auto pr-1">
              {CALENDAR_THEME_OPTIONS.map(t => {
                const isSelected = calendarTheme === t.value;
                const themeEntry = THEME_COMPONENT_MAP[t.value];
                const ThemeComp = themeEntry?.Component;
                const themeSample = themeEntry?.sample;

                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setCalendarTheme(t.value)}
                    onDoubleClick={(e) => { e.preventDefault(); setEnlargedCalendarTheme(t.value); }}
                    className={`group relative rounded-2xl overflow-hidden transition-all duration-200
                      ${isSelected
                        ? 'shadow-xl ring-2 ring-offset-2'
                        : 'shadow-sm hover:shadow-md border border-slate-200/80'
                      }`}
                    style={isSelected ? { '--tw-ring-color': t.groupColor } as React.CSSProperties : undefined}
                  >
                    <div className="relative bg-white">
                      {/* SVG 전체 이미지 — 고정 비율 컨테이너에 맞춤 */}
                      {ThemeComp && themeSample && (
                        <div className="calendar-thumb-svg" style={{ pointerEvents: 'none' }}>
                          <ThemeComp data={themeSample} width={600} />
                        </div>
                      )}
                      {/* 시각 군 태그 — 좌상단 */}
                      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold shadow-sm" style={{ backgroundColor: t.groupColor, color: 'white' }}>
                        {t.group}
                      </div>
                      {/* 선택 체크 뱃지 */}
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: t.groupColor }}>
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </div>
                      )}
                    </div>
                    {/* 카드 외부 name/desc — 가독성 강화 */}
                    <div className="px-1.5 py-1.5 bg-white">
                      <div className="font-bold text-[11px] text-slate-800 leading-tight truncate">{t.label.replace(/^[^\s]+\s/, '')}</div>
                      <div className="text-[9px] text-slate-500 mt-0.5 leading-tight truncate">{t.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* 기타 카테고리: AI 스타일 템플릿 — 3x2 그리드 */
            <div className={`grid grid-cols-3 gap-3 ${selectedHistory ? 'opacity-40 pointer-events-none' : ''}`}>
              {(CATEGORY_TEMPLATES[
                category === 'greeting' ? `greeting_${greetHoliday}` :
                category
              ] || CATEGORY_TEMPLATES[category] || []).map((tmpl) => {
                const isSelected = !selectedHistory && selectedCatTemplate?.id === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    onClick={() => { setSelectedCatTemplate(isSelected ? null : tmpl); setSelectedHistory(null); }}
                    onDoubleClick={() => setEnlargedTemplate(tmpl)}
                    className={`group relative rounded-2xl overflow-hidden transition-all duration-200
                      ${isSelected
                        ? 'shadow-xl ring-2 ring-offset-2'
                        : 'shadow-sm hover:shadow-md border border-slate-200/80'
                      }`}
                    style={isSelected ? { '--tw-ring-color': tmpl.color } as React.CSSProperties : undefined}
                  >
                    <div className="relative w-full overflow-hidden" style={{ aspectRatio: '3/4', background: tmpl.previewImage ? '#f8fafc' : `linear-gradient(160deg, ${tmpl.bg} 0%, white 80%)` }}>
                      <TemplateSVGPreview template={tmpl} category={category} hospitalName={hospitalName || '윈에이드 치과'} />
                      {/* 스타일 태그 뱃지 — 좌상단 */}
                      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold shadow-sm" style={{ backgroundColor: tmpl.color, color: 'white' }}>
                        {tmpl.layoutHint === 'price' || tmpl.layoutHint === 'table' ? '가격형' :
                         tmpl.layoutHint === 'elegant' || tmpl.layoutHint === 'luxury' ? '프리미엄' :
                         tmpl.layoutHint === 'pop' || tmpl.layoutHint === 'cute' ? '활기찬' :
                         tmpl.layoutHint === 'minimal' ? '미니멀' :
                         tmpl.layoutHint === 'wave' || tmpl.layoutHint === 'gradient' ? '그라데이션' :
                         tmpl.layoutHint === 'season' || tmpl.layoutHint === 'nature' ? '시즌' :
                         tmpl.layoutHint === 'split' || tmpl.layoutHint === 'grid' ? '분할형' :
                         tmpl.layoutHint === 'portrait' || tmpl.layoutHint === 'curve' ? '프로필' :
                         tmpl.layoutHint === 'story' ? '스토리' :
                         tmpl.layoutHint === 'alert' || tmpl.layoutHint === 'warning' ? '경고형' :
                         tmpl.layoutHint === 'formal' ? '공문형' :
                         tmpl.layoutHint === 'timeline' ? '타임라인' :
                         tmpl.layoutHint === 'bulletin' ? '게시판' :
                         tmpl.layoutHint === 'soft' ? '말풍선' :
                         tmpl.layoutHint === 'traditional' || tmpl.layoutHint === 'warm' ? '전통' :
                         tmpl.layoutHint === 'corporate' ? '기업형' :
                         tmpl.layoutHint === 'team' ? '팀워크' :
                         tmpl.layoutHint === 'modern' ? '모던' :
                         tmpl.layoutHint === 'brand' ? '브랜드' :
                         tmpl.layoutHint === 'benefits' ? '복리후생' :
                         tmpl.layoutHint === 'urgent' ? '긴급' :
                         tmpl.layoutHint === 'checklist' ? '체크리스트' :
                         tmpl.layoutHint === 'guide' ? '가이드' :
                         tmpl.layoutHint === 'card' || tmpl.layoutHint === 'cards' ? '카드형' :
                         tmpl.layoutHint === 'dark' ? '다크' :
                         tmpl.layoutHint === 'wood' ? '우드' :
                         tmpl.layoutHint === 'infographic' ? '인포' :
                         '스타일'}
                      </div>
                      {/* 선택 체크 뱃지 */}
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: tmpl.color }}>
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </div>
                      )}
                    </div>
                    {/* 카드 외부 name/desc — 가독성 강화 */}
                    <div className="px-1.5 py-1.5 bg-white">
                      <div className="font-bold text-[11px] text-slate-800 leading-tight truncate">{tmpl.name}</div>
                      <div className="text-[9px] text-slate-500 mt-0.5 leading-tight truncate">{tmpl.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {category !== 'schedule' && selectedCatTemplate && !selectedHistory && (
            <div className="mt-1.5 p-2 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-blue-700">템플릿: {selectedCatTemplate.name}</span>
                <button onClick={() => setSelectedCatTemplate(null)} className="text-[10px] text-blue-400 hover:text-blue-600">해제</button>
              </div>
            </div>
          )}
          {category !== 'schedule' && <p className="text-[10px] text-slate-400 mt-1">더블클릭하면 크게 볼 수 있습니다</p>}
        </div>

        {/* 생성 */}
        <button onClick={handleGenerate} disabled={generating} className={`w-full py-4 rounded-2xl text-white font-bold text-base transition-all duration-200 ${generating ? 'bg-slate-400 cursor-not-allowed shadow-md' : 'bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:via-indigo-700 hover:to-blue-700 active:scale-[0.97] shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40'}`}>
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
              AI 디자인 생성 중...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
              AI 디자인 생성
            </span>
          )}
        </button>
      </div>
      </div>

      {/* 오른쪽: 미리보기 / 에디터 영역 */}
      <div className="flex flex-col min-h-[480px] lg:flex-1 min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* 상단 툴바 */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200/80 bg-white">
          <div className="flex items-center gap-1">
            {(['B','I','U'] as const).map(btn => (
              <div key={btn} className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-slate-300 select-none">{btn}</div>
            ))}
          </div>
          <div className="w-px h-5 bg-slate-200" />
          <div className="flex items-center gap-1">
            {[
              <path key="a1" strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />,
              <path key="a2" strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h10.5m-10.5 5.25h16.5" />,
            ].map((icon, i) => (
              <div key={i} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>{icon}</svg>
              </div>
            ))}
          </div>
          <div className="w-px h-5 bg-slate-200" />
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" /></svg>
          </div>
        </div>
        {/* 콘텐츠 영역 */}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
        {error&&<div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 w-full max-w-lg">{error}</div>}
        {generating ? (
          <div className="flex flex-col items-center justify-center gap-6 animate-fade-in">
            <div className="relative w-24 h-24">
              <div className="absolute inset-0 rounded-full border-4 border-violet-100" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-500 animate-spin" />
              <div className="absolute inset-3 rounded-full border-4 border-transparent border-t-indigo-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl animate-pulse">{['🎨','✨','🖌️','💫'][generatingStep % 4]}</span>
              </div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-base font-bold text-slate-700">
                {generatingPage > 0 && hiringPageCount > 1
                  ? `${generatingPage}/${hiringPageCount}장 생성 중...`
                  : ['AI가 디자인 구상 중...','레이아웃 배치하는 중...','색감 입히는 중...','마무리 터치 중...','거의 다 됐어요!'][Math.min(generatingStep, 4)]
                }
              </p>
              <p className="text-xs text-slate-400">{hiringPageCount > 1 ? `총 ${hiringPageCount}장 생성 예정` : '보통 10~30초 정도 걸려요'}</p>
              <div className="flex justify-center gap-1 mt-3">
                {[0,1,2,3,4].map(i => (
                  <div key={i} className={`w-2 h-2 rounded-full transition-all duration-500 ${i <= generatingStep ? 'bg-violet-500 scale-110' : 'bg-slate-200'}`} />
                ))}
              </div>
            </div>
          </div>
        ) : previewStyleImage ? (
          <div className="space-y-4 w-full flex flex-col items-center">
            <p className="text-xs font-semibold text-violet-600">내 스타일 미리보기: {previewStyleImage.name}</p>
            <img src={previewStyleImage.url} alt={previewStyleImage.name} className="max-w-full max-h-[70vh] rounded-2xl shadow-2xl border-2 border-violet-200" />
            <button onClick={() => setPreviewStyleImage(null)} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-xl text-sm font-medium transition-colors">{resultImages.length > 0 ? '생성 결과로 돌아가기' : '닫기'}</button>
          </div>
        ): resultImages.length > 0 ? (
          <div className="space-y-4 w-full flex flex-col items-center">
            {/* 다중 페이지 네비게이션 */}
            {resultImages.length > 1 && (
              <div className="flex items-center gap-3">
                <button onClick={() => setCurrentPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0} className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 disabled:opacity-30 flex items-center justify-center transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="flex gap-1.5">
                  {resultImages.map((_, i) => (
                    <button key={i} onClick={() => setCurrentPage(i)} className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${currentPage === i ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{i + 1}</button>
                  ))}
                </div>
                <button onClick={() => setCurrentPage(Math.min(resultImages.length - 1, currentPage + 1))} disabled={currentPage === resultImages.length - 1} className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 disabled:opacity-30 flex items-center justify-center transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            )}
            <img src={resultImages[currentPage]} alt={`생성된 이미지 ${currentPage + 1}`} className="max-w-full max-h-[65vh] rounded-2xl shadow-2xl" />
            <div className="flex gap-3 flex-wrap justify-center">
              <button onClick={() => handleDownload(currentPage)} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors shadow-lg">
                {resultImages.length > 1 ? `${currentPage + 1}장 다운로드` : '다운로드'}
              </button>
              {resultImages.length > 1 && (
                <button onClick={() => handleDownload()} className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm transition-colors">전체 다운로드</button>
              )}
              {/* 다시 생성 드롭다운 */}
              <div className="relative">
                <button onClick={() => setShowRegenMenu(!showRegenMenu)} disabled={generating} className="px-6 py-2.5 bg-slate-600 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-colors flex items-center gap-1.5">
                  다시 생성
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showRegenMenu && (
                  <div className="absolute bottom-full mb-2 right-0 w-56 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-10">
                    <button onClick={() => { setShowRegenMenu(false); handleGenerate(); }} className="w-full px-4 py-3 text-left text-sm hover:bg-slate-50 transition-colors flex items-center gap-2">
                      <svg className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      <div><div className="font-bold text-slate-700">자동 재생성</div><div className="text-xs text-slate-400">같은 설정으로 새로 생성</div></div>
                    </button>
                    <div className="border-t border-slate-100" />
                    <button onClick={() => { setShowRegenMenu(false); setShowRegenPromptInput(true); setRegenPrompt(''); }} className="w-full px-4 py-3 text-left text-sm hover:bg-slate-50 transition-colors flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      <div><div className="font-bold text-slate-700">수정 후 재생성</div><div className="text-xs text-slate-400">변경 사항을 프롬프트로 지시</div></div>
                    </button>
                  </div>
                )}
              </div>
            </div>
            {/* 수정 프롬프트 입력 */}
            {showRegenPromptInput && (
              <div className="w-full max-w-lg space-y-2 mt-2">
                <textarea
                  value={regenPrompt}
                  onChange={e => setRegenPrompt(e.target.value)}
                  placeholder="예: 배경색을 좀 더 따뜻하게, 글씨 크기를 키워줘, 여백을 줄여줘..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-400 resize-none bg-white"
                  rows={3}
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowRegenPromptInput(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium transition-colors">취소</button>
                  <button onClick={() => handleGenerate(regenPrompt)} disabled={!regenPrompt.trim()} className="px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-lg text-sm font-bold transition-colors">수정 반영 재생성</button>
                </div>
              </div>
            )}
            {/* AI 이미지 편집 도구 */}
            <div className="w-full max-w-lg mt-4">
              <details className="group">
                <summary className="cursor-pointer flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors select-none">
                  <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  AI 이미지 편집 도구
                  <svg className="w-3 h-3 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </summary>
                <div className="mt-3 space-y-3">
                  {/* 스타일 변환 */}
                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-1.5">스타일 변환</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        { id: 'to_illustration' as StyleTransformType, label: '플랫 일러스트', icon: '🎨' },
                        { id: 'to_3d_clay' as StyleTransformType, label: '3D 클레이', icon: '🧱' },
                        { id: 'to_watercolor' as StyleTransformType, label: '수채화', icon: '🖌️' },
                        { id: 'to_minimal' as StyleTransformType, label: '미니멀', icon: '◻️' },
                        { id: 'to_photo' as StyleTransformType, label: '포토리얼', icon: '📷' },
                        { id: 'to_anime' as StyleTransformType, label: '애니/만화', icon: '✨' },
                      ]).map(s => (
                        <button
                          key={s.id}
                          disabled={generating}
                          onClick={async () => {
                            setGenerating(true);
                            try {
                              const transformed = await transformImageStyle(resultImages[currentPage], s.id);
                              const updated = [...resultImages];
                              updated[currentPage] = transformed;
                              setResultImages(updated);
                            } catch (e: any) {
                              toast.error(`스타일 변환 실패: ${e.message}`);
                            } finally { setGenerating(false); }
                          }}
                          className="px-2 py-2 bg-slate-50 hover:bg-violet-50 border border-slate-200 hover:border-violet-300 rounded-lg text-xs font-medium text-slate-600 hover:text-violet-700 transition-all disabled:opacity-40"
                        >
                          {s.icon} {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 자유 편집 */}
                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-1.5">AI 자유 편집</div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="예: 배경을 파란색으로, 텍스트 색상 변경..."
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-violet-400"
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && !generating) {
                            const input = e.currentTarget;
                            const instruction = input.value.trim();
                            if (!instruction) return;
                            setGenerating(true);
                            try {
                              const edited = await editImageRegion(resultImages[currentPage], instruction);
                              const updated = [...resultImages];
                              updated[currentPage] = edited;
                              setResultImages(updated);
                              input.value = '';
                            } catch (err: any) {
                              toast.error(`편집 실패: ${err.message}`);
                            } finally { setGenerating(false); }
                          }
                        }}
                      />
                      <button
                        disabled={generating}
                        onClick={async () => {
                          const input = document.querySelector<HTMLInputElement>('[placeholder*="배경을 파란색"]');
                          const instruction = input?.value?.trim();
                          if (!instruction) return;
                          setGenerating(true);
                          try {
                            const edited = await editImageRegion(resultImages[currentPage], instruction);
                            const updated = [...resultImages];
                            updated[currentPage] = edited;
                            setResultImages(updated);
                            if (input) input.value = '';
                          } catch (err: any) {
                            toast.error(`편집 실패: ${err.message}`);
                          } finally { setGenerating(false); }
                        }}
                        className="px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
                      >
                        적용
                      </button>
                    </div>
                  </div>
                </div>
              </details>
            </div>
          </div>
        ):(
          /* 빈 상태 — 블로그/매거진 스타일 */
          <div className="flex flex-col items-center justify-center py-20 px-8 max-w-md mx-auto">
            {/* Sparkle 아이콘 */}
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8 bg-gradient-to-br from-blue-50 to-indigo-100/80 border border-blue-200/40">
              <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>
            {/* 타이틀 */}
            <h2 className="text-2xl font-extrabold text-slate-800 leading-tight text-center mb-2">
              AI가 만드는<br /><span className="text-blue-500">{ph[category].t}</span>
            </h2>
            {/* 서브타이틀 */}
            <p className="text-sm text-slate-400 text-center leading-relaxed mb-8">
              왼쪽에서 정보를 입력하면<br />AI가 자동으로 디자인을 생성합니다
            </p>
            {/* 기능 불릿 */}
            <div className="space-y-3 mb-10 w-full">
              {(category === 'schedule' ? [
                '테마별 달력 디자인 자동 생성',
                '휴진/단축/야간 일정 자동 반영',
                '병원 브랜딩 로고 삽입',
              ] : category === 'event' ? [
                '이벤트 내용 기반 디자인 생성',
                '할인율/기간 자동 배치',
                '시선을 끄는 SNS용 이미지',
              ] : category === 'doctor' ? [
                '전문의 프로필 이미지 생성',
                '경력/전문분야 자동 배치',
                '신뢰감 있는 의료 디자인',
              ] : category === 'hiring' ? [
                '채용 공고 카드뉴스 자동 생성',
                '복리후생/자격요건 시각화',
                '다장 시리즈 디자인 지원',
              ] : category === 'pricing' ? [
                '비급여 항목/가격 자동 배치',
                '깔끔한 가격표 레이아웃',
                '병원 브랜딩 컬러 반영',
              ] : [
                '카테고리별 최적화 디자인',
                'AI 스타일 프리셋 지원',
                '병원 브랜딩 자동 적용',
              ]).map((feat, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                  <span className="text-sm text-slate-500">{feat}</span>
                </div>
              ))}
            </div>
            {/* AI 대기 중 뱃지 */}
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold bg-white text-slate-500 border border-slate-200 shadow-sm">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              AI 대기 중
            </div>
          </div>
        )}
        </div>
      </div>

      {/* 달력 테마 확대 모달 (더블클릭) */}
      {enlargedCalendarTheme && (() => {
        const themeOpt = CALENDAR_THEME_OPTIONS.find(t => t.value === enlargedCalendarTheme);
        const themeEntry = THEME_COMPONENT_MAP[enlargedCalendarTheme];
        if (!themeOpt || !themeEntry) return null;
        const { Component: ThemeComp, sample: themeSample } = themeEntry;
        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8" onClick={() => setEnlargedCalendarTheme(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800">{themeOpt.emoji} {themeOpt.label.replace(/^[\S]+\s/, '')}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{themeOpt.desc}</p>
                </div>
                <button onClick={() => setEnlargedCalendarTheme(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                  <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-4 flex justify-center" style={{ lineHeight: 0 }}>
                <div style={{ width: '100%', maxWidth: 480 }}>
                  <ThemeComp data={themeSample} width={480} />
                </div>
              </div>
              <div className="p-4 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => { setCalendarTheme(enlargedCalendarTheme); setEnlargedCalendarTheme(null); }}
                  className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm transition-all bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                >
                  이 템플릿 선택
                </button>
                <button onClick={() => setEnlargedCalendarTheme(null)} className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium text-sm transition-colors">닫기</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 템플릿 확대 모달 (더블클릭) */}
      {enlargedTemplate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8" onClick={() => setEnlargedTemplate(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800">{enlargedTemplate.name}</h3>
                <p className="text-xs text-slate-400">{enlargedTemplate.desc}</p>
              </div>
              <button onClick={() => setEnlargedTemplate(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 flex justify-center" style={{ background: enlargedTemplate.previewImage ? '#f8fafc' : `linear-gradient(160deg, ${enlargedTemplate.bg} 0%, white 80%)` }}>
              <div className={enlargedTemplate.previewImage ? 'w-80' : 'w-72'}>
                <TemplateSVGPreview template={enlargedTemplate} category={category} hospitalName={hospitalName || '윈에이드 치과'} />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-2">
              <button
                onClick={() => { setSelectedCatTemplate(enlargedTemplate); setSelectedHistory(null); setEnlargedTemplate(null); }}
                className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm transition-all bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
              >
                이 템플릿 선택
              </button>
              <button onClick={() => setEnlargedTemplate(null)} className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium text-sm transition-colors">닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getFixedHolidays(month: number): Map<number, string> {
  const fixed: Record<string, string> = { '1-1': '신정', '3-1': '삼일절', '5-5': '어린이날', '6-6': '현충일', '8-15': '광복절', '10-3': '개천절', '10-9': '한글날', '12-25': '성탄절' };
  const result = new Map<number, string>();
  for (const [key, name] of Object.entries(fixed)) { const [m, d] = key.split('-').map(Number); if (m === month) result.set(d, name); }
  return result;
}
