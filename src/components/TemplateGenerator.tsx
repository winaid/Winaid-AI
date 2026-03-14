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
    if (hint === 'cal_grid') {
      // 1) 블루 클린 — 상단 블루바 + 큰 제목 + 깔끔한 그리드
      return wrap(<>
        {/* 화이트 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        {/* 플로팅 칩 헤더 */}
        <rect x="20" y="6" width="80" height="16" rx="8" fill={c} filter={`url(#shadow_${t.id})`} />
        <text x="60" y="16" textAnchor="middle" fontSize="3.5" fontWeight="800" fill="white">{name}</text>
        {/* 큰 타이틀 */}
        <text x="60" y="30" textAnchor="middle" fontSize="13" fontWeight="900" fill="#1e293b">{mo}월 진료일정</text>
        <text x="60" y="41" textAnchor="middle" fontSize="3.2" fontWeight="500" fill="#475569">착오 없으시길 바랍니다</text>
        {/* 달력 카드 */}
        <rect x="8" y="46" width="104" height="82" rx="5" fill="white" stroke="#e2e8f0" strokeWidth="0.4" />
        {/* 다크 헤더 */}
        <rect x="8" y="46" width="104" height="10" rx="5" fill="#3f3f46" />
        <rect x="8" y="52" width="104" height="4" fill="#3f3f46" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={16 + i * 14} y="53.5" textAnchor="middle" fontSize="2.6" fontWeight="700" fill="white">{d}</text>
        ))}
        {/* 날짜 */}
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 16 + col * 14, cy = 64 + row * 12;
          return <g key={`${row}-${col}`}>
            {isRunStart(day, col) && closedRunLength(day, col) > 1 && <rect x={cx - 5} y={cy - 5} width={14 * (closedRunLength(day, col) - 1) + 10} height="10" rx="5" fill={c} fillOpacity="0.12" />}
            {isRunStart(day, col) && closedRunLength(day, col) === 1 && <circle cx={cx} cy={cy} r="5" fill={c} fillOpacity="0.12" />}
            {short && <rect x={cx - 5} y={cy - 5} width="10" height="10" rx="3" fill="#fbbf24" fillOpacity="0.2" />}
            <text x={cx} y={cy + 2.5} textAnchor="middle" fontSize="3.5" fontWeight={closed || short ? '800' : '400'} fill={closed ? c : short ? '#d97706' : col === 0 ? '#ef4444' : '#334155'}>{day}</text>
          </g>;
        }))}
        {/* 하단 */}
        <circle cx="24" cy="138" r="3.5" fill={c} fillOpacity="0.25" />
        <text x="31" y="140" fontSize="3" fontWeight="700" fill="#475569">휴진</text>
        <circle cx="52" cy="138" r="3.5" fill="#fbbf24" fillOpacity="0.35" />
        <text x="59" y="140" fontSize="3" fontWeight="700" fill="#475569">단축</text>
        <text x="60" y="154" textAnchor="middle" fontSize="3.5" fontWeight="800" fill={c}>🦷 {name}</text>
      </>);
    }
    if (hint === 'cal_bubble') {
      // 2) 가을 단풍 — 오렌지 그라데이션 + 단풍잎 + 풀 달력
      return wrap(<>
        {/* 따뜻한 그라데이션 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#fecaca" />
        {/* 대각선 리본 */}
        <path d="M-10,10 L80,60 L120,40 L120,0 L0,0 Z" fill={c} fillOpacity="0.8" />
        {/* 리본 내 리프 패턴 */}
        <path d="M30,15 Q35,10 40,15 Q45,10 50,15" fill="none" stroke="white" strokeWidth="0.6" strokeOpacity="0.3" />
        <path d="M60,30 Q65,25 70,30 Q75,25 80,30" fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.25" />
        {/* 타이틀 */}
        <text x="60" y="50" textAnchor="middle" fontSize="11" fontWeight="900" fill="white">{mo}월 진료일정</text>
        <text x="60" y="60" textAnchor="middle" fontSize="3.2" fontWeight="500" fill="white" fillOpacity="0.9">착오 없으시길 바랍니다</text>
        {/* 달력 카드 */}
        <rect x="8" y="66" width="104" height="72" rx="5" fill="white" fillOpacity="0.97" filter={`url(#shadow_${t.id})`} />
        <rect x="8" y="66" width="104" height="10" fill="#3f3f46" rx="5" />
        <rect x="8" y="72" width="104" height="4" fill="#3f3f46" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={16 + i * 14} y="74" textAnchor="middle" fontSize="2.5" fontWeight="700" fill="white">{d}</text>
        ))}
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 16 + col * 14, cy = 84 + row * 10;
          return <g key={`${row}-${col}`}>
            <text x={cx} y={cy} textAnchor="middle" fontSize="3.2" fontWeight={closed || short ? '800' : '400'} fill={closed ? c : short ? '#d97706' : col === 0 ? '#ef4444' : '#334155'}>{day}</text>
            {closed && <><rect x={cx - 7} y={cy + 1} width="14" height="4.5" rx="2" fill="#fbbf24" /><text x={cx} y={cy + 4.5} textAnchor="middle" fontSize="1.8" fontWeight="700" fill="#78350f">정기휴진</text></>}
          </g>;
        }))}
        {/* 하단 로고 */}
        <text x="60" y="150" textAnchor="middle" fontSize="3" fontWeight="700" fill={a}>🦷 {name}</text>
      </>);
    }
    if (hint === 'cal_nature') {
      // 3) 벚꽃 봄 — 핑크 벚꽃 프레임 + 깔끔한 달력
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#fdf2f8" />
        {/* 좌상 꽃잎 */}
        <ellipse cx="12" cy="12" rx="6" ry="3" fill="#f9a8d4" fillOpacity="0.5" transform="rotate(-30 12 12)" />
        <ellipse cx="16" cy="8" rx="5" ry="2.5" fill="#fbcfe8" fillOpacity="0.45" transform="rotate(15 16 8)" />
        <circle cx="14" cy="10" r="1.5" fill="#fbbf24" fillOpacity="0.4" />
        {/* 우상 꽃잎 */}
        <ellipse cx="106" cy="10" rx="5" ry="2.5" fill="#f9a8d4" fillOpacity="0.5" transform="rotate(20 106 10)" />
        <ellipse cx="102" cy="14" rx="4" ry="2" fill="#fbcfe8" fillOpacity="0.4" transform="rotate(-15 102 14)" />
        <circle cx="104" cy="12" r="1.2" fill="#fbbf24" fillOpacity="0.35" />
        {/* 좌하 꽃잎 */}
        <ellipse cx="8" cy="146" rx="5" ry="2.5" fill="#fbcfe8" fillOpacity="0.4" transform="rotate(30 8 146)" />
        <ellipse cx="14" cy="150" rx="4" ry="2" fill="#f9a8d4" fillOpacity="0.35" transform="rotate(-20 14 150)" />
        {/* 우하 꽃잎 */}
        <ellipse cx="108" cy="148" rx="4" ry="2" fill="#f9a8d4" fillOpacity="0.35" transform="rotate(25 108 148)" />
        {/* 줄기 연결선 */}
        <path d="M14,14 Q8,30 10,45" fill="none" stroke="#f9a8d4" strokeWidth="0.4" strokeOpacity="0.3" />
        <path d="M106,14 Q112,30 110,45" fill="none" stroke="#f9a8d4" strokeWidth="0.4" strokeOpacity="0.3" />
        {/* 타이틀 */}
        <text x="60" y="20" textAnchor="middle" fontSize="3" fontWeight="600" fill={a}>{name}</text>
        <line x1="30" y1="24" x2="90" y2="24" stroke="#f9a8d4" strokeWidth="0.3" />
        <text x="60" y="40" textAnchor="middle" fontSize="12" fontWeight="900" fill="#831843">{mo}월</text>
        <text x="60" y="50" textAnchor="middle" fontSize="3.5" fontWeight="500" fill="#9d174d" letterSpacing="2">진 료 안 내</text>
        {/* 달력 카드 */}
        <rect x="10" y="56" width="100" height="76" rx="6" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
        <rect x="10" y="56" width="100" height="9" rx="6" fill="#fce7f3" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={18 + i * 13} y="63" textAnchor="middle" fontSize="2.5" fontWeight="700" fill={i === 0 ? '#e11d48' : i === 6 ? '#3b82f6' : '#9d174d'}>{d}</text>
        ))}
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 18 + col * 13, cy = 73 + row * 11;
          return <g key={`${row}-${col}`}>
            {closed && <circle cx={cx} cy={cy} r="5" fill="#fce7f3" />}
            {short && <circle cx={cx} cy={cy} r="5" fill="#fef3c7" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="3.2" fontWeight={closed || short ? '800' : '400'} fill={closed ? '#e11d48' : short ? '#d97706' : col === 0 ? '#e11d48' : '#4a044e'}>{day}</text>
          </g>;
        }))}
        {/* 범례 */}
        <circle cx="28" cy="140" r="2.5" fill="#fce7f3" />
        <text x="34" y="142" fontSize="2.5" fontWeight="600" fill="#9d174d">휴진</text>
        <circle cx="54" cy="140" r="2.5" fill="#fef3c7" />
        <text x="60" y="142" fontSize="2.5" fontWeight="600" fill="#92400e">단축</text>
        <text x="60" y="155" textAnchor="middle" fontSize="2.8" fontWeight="600" fill="#9d174d">{name}</text>
      </>);
    }
    if (hint === 'cal_dark') {
      // 4) 네이비 프리미엄 — 딥 네이비 + 골드 악센트 + 화이트 카드
      return wrap(<>
        <defs>
          <filter id={`calNoise_${t.id}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="3" stitchTiles="stitch" result="noise" />
            <feColorMatrix type="saturate" values="0" in="noise" result="gray" />
            <feBlend in="SourceGraphic" in2="gray" mode="multiply" />
          </filter>
        </defs>
        {/* 네이비 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#1e293b" filter={`url(#calNoise_${t.id})`} />
        {/* 골드 장식 라인 */}
        <line x1="14" y1="10" x2="106" y2="10" stroke="#d4a853" strokeWidth="0.6" strokeOpacity="0.7" />
        <line x1="14" y1="12" x2="106" y2="12" stroke="#d4a853" strokeWidth="0.3" strokeOpacity="0.5" />
        {/* 병원명 */}
        <text x="60" y="24" textAnchor="middle" fontSize="3.8" fontWeight="700" fill="#d4a853" letterSpacing="1.5">{name}</text>
        {/* 큰 월 표시 */}
        <text x="60" y="44" textAnchor="middle" fontSize="18" fontWeight="900" fill="white">{mo}월</text>
        <text x="60" y="53" textAnchor="middle" fontSize="4" fontWeight="500" fill="#d4a853" letterSpacing="2.5">SCHEDULE</text>
        {/* 화이트 카드 달력 (프로스트 글래스) */}
        <rect x="8" y="58" width="104" height="72" rx="5" fill="white" fillOpacity="0.85" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={16 + i * 14} y="67" textAnchor="middle" fontSize="2.6" fontWeight="700" fill={i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#94a3b8'}>{d}</text>
        ))}
        <line x1="12" y1="69.5" x2="108" y2="69.5" stroke="#e2e8f0" strokeWidth="0.3" />
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 16 + col * 14, cy = 78 + row * 10;
          return <g key={`${row}-${col}`}>
            {isRunStart(day, col) && closedRunLength(day, col) > 1 && <rect x={cx - 5} y={cy - 4.5} width={14 * (closedRunLength(day, col) - 1) + 10} height="9" rx="4.5" fill="#1e293b" fillOpacity="0.12" />}
            {isRunStart(day, col) && closedRunLength(day, col) === 1 && <circle cx={cx} cy={cy} r="5" fill="#1e293b" fillOpacity="0.12" />}
            {short && <circle cx={cx} cy={cy} r="5" fill="#f59e0b" fillOpacity="0.12" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="3.5" fontWeight={closed || short ? '800' : '400'} fill={closed ? '#1e293b' : short ? '#d97706' : col === 0 ? '#ef4444' : '#334155'}>{day}</text>
          </g>;
        }))}
        {/* 하단 네이비 바 범례 */}
        <rect x="0" y="134" width="120" height="26" rx="0" fill="#1e293b" />
        <rect x="0" y="134" width="120" height="1.5" fill="#d4a853" fillOpacity="0.7" />
        <circle cx="28" cy="146" r="3.5" fill="white" fillOpacity="0.3" />
        <text x="35" y="148" fontSize="3.2" fontWeight="700" fill="#d4a853">휴진</text>
        <circle cx="62" cy="146" r="3.5" fill="#f59e0b" fillOpacity="0.4" />
        <text x="69" y="148" fontSize="3.2" fontWeight="700" fill="#d4a853">단축</text>
      </>);
    }
    if (hint === 'cal_kraft') {
      // 5) 벽달력 스타일 - 상단 일러스트 영역 + 하단 작은 그리드
      return wrap(<>
        <rect x="6" y="4" width="108" height="152" rx="3" fill="#fefce8" fillOpacity="0.6" />
        {/* 상단 일러스트 영역 (벽달력 그림 부분) */}
        <rect x="10" y="8" width="100" height="60" rx="4" fill="white" fillOpacity="0.5" />
        {/* 귀여운 치아 캐릭터 */}
        <rect x="44" y="14" width="32" height="36" rx="10" fill="white" filter={`url(#shadow_${t.id})`} />
        <circle cx="54" cy="28" r="2" fill="#1e293b" />
        <circle cx="66" cy="28" r="2" fill="#1e293b" />
        <path d="M54,35 Q60,40 66,35" fill="none" stroke="#1e293b" strokeWidth="0.8" />
        {/* 왕관 */}
        <polygon points="50,16 53,12 56,16 60,10 64,16 67,12 70,16" fill="#fbbf24" fillOpacity="0.5" />
        {/* 별 장식 */}
        <text x="22" y="24" fontSize="5" fill="#fbbf24" fillOpacity="0.6">★</text>
        <text x="92" y="28" fontSize="4" fill={c} fillOpacity="0.5">✦</text>
        <text x="30" y="45" fontSize="3.5" fill="#f472b6" fillOpacity="0.45">♥</text>
        <text x="86" y="42" fontSize="3.5" fill={c} fillOpacity="0.45">✧</text>
        {/* 하트/구름 장식 */}
        <ellipse cx="20" cy="55" rx="10" ry="3.5" fill="#e0f2fe" fillOpacity="0.65" />
        <ellipse cx="96" cy="52" rx="8" ry="3" fill="#fce7f3" fillOpacity="0.55" />
        {/* 큰 타이틀 */}
        <text x="60" y="58" textAnchor="middle" fontSize="5" fontWeight="900" fill={c}>{mo}월 휴진 안내</text>
        {/* 마스킹 테이프 */}
        <rect x="40" y="66" width="40" height="4" rx="0" fill="#bef264" fillOpacity="0.3" transform="rotate(-1 60 68)" />
        {/* 하단 미니 달력 */}
        <rect x="10" y="72" width="100" height="60" rx="4" fill="white" fillOpacity="0.7" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={18 + i * 13.5} y="80" textAnchor="middle" fontSize="2.5" fontWeight="700" fill={i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#78350f'}>{d}</text>
        ))}
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const cx = 18 + col * 13.5, cy = 87 + row * 9;
          return <g key={`${row}-${col}`}>
            {isRunStart(day, col) && closedRunLength(day, col) > 1 && <rect x={cx - 4} y={cy - 3.5} width={13.5 * (closedRunLength(day, col) - 1) + 8} height="7" rx="3.5" fill="#fee2e2" fillOpacity="0.7" />}
            {isRunStart(day, col) && closedRunLength(day, col) === 1 && <circle cx={cx} cy={cy} r="3.5" fill="#fee2e2" fillOpacity="0.7" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="3" fontWeight={closed ? '800' : '400'} fill={closed ? '#dc2626' : col === 0 ? '#dc2626' : '#78350f'}>{day}</text>
          </g>;
        }))}
        {/* 스티커 */}
        <text x="18" y="142" fontSize="3.5" fill="#e11d48" fillOpacity="0.3">♡</text>
        <text x="60" y="142" textAnchor="middle" fontSize="2.8" fill="#78350f" fontStyle="italic">{name}</text>
        <text x="102" y="140" fontSize="3" fill="#16a34a" fillOpacity="0.3">☘</text>
      </>);
    }
    if (hint === 'cal_glass') {
      // 6) 기와지붕 전통 — 한국 전통 기와 + 코럴 해 + 풀 달력
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f5e6d0" />
        {/* 코럴 반원 해 */}
        <ellipse cx="60" cy="16" rx="44" ry="20" fill="#e8795a" fillOpacity="0.9" />
        <text x="60" y="14" textAnchor="middle" fontSize="8" fontWeight="900" fill="white">{mo}월</text>
        <text x="60" y="25" textAnchor="middle" fontSize="4.5" fontWeight="800" fill="white">진료일정 안내</text>
        {/* 기와지붕 */}
        <path d="M6,34 Q18,28 28,34 Q38,28 48,34 Q58,28 68,34 Q78,28 88,34 Q98,28 114,34 L114,38 L6,38 Z" fill="#3f3f46" />
        <rect x="6" y="36" width="108" height="3" fill="#57534e" />
        {/* 전통 코너 장식 */}
        <path d="M12,42 L18,42 L18,44" fill="none" stroke="#92400e" strokeWidth="0.5" />
        <path d="M108,42 L102,42 L102,44" fill="none" stroke="#92400e" strokeWidth="0.5" />
        {/* 달력 카드 */}
        <rect x="10" y="44" width="100" height="82" rx="4" fill="white" fillOpacity="0.95" filter={`url(#shadow_${t.id})`} />
        {/* 달력 링 */}
        {[24,34,44,54,64,74,84,94].map(x => <rect key={x} x={x} y="41" width="2" height="5" rx="1" fill="#94a3b8" />)}
        <rect x="10" y="50" width="100" height="9" fill="#3f3f46" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={18 + i * 13} y="57" textAnchor="middle" fontSize="2.5" fontWeight="700" fill="white">{d}</text>
        ))}
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 18 + col * 13, cy = 67 + row * 11;
          return <g key={`${row}-${col}`}>
            {closed && <circle cx={cx} cy={cy} r="4.5" fill="#e8795a" fillOpacity="0.15" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="3.2" fontWeight={closed || short ? '800' : '400'} fill={closed ? '#e8795a' : short ? '#d97706' : col === 0 ? '#ef4444' : '#1f2937'}>{day}</text>
            {closed && <text x={cx} y={cy + 7.5} textAnchor="middle" fontSize="1.6" fontWeight="700" fill="#e8795a">휴진</text>}
          </g>;
        }))}
        {/* 하단 장식 */}
        <path d="M12,138 L18,138 L18,136" fill="none" stroke="#92400e" strokeWidth="0.5" />
        <path d="M108,138 L102,138 L102,136" fill="none" stroke="#92400e" strokeWidth="0.5" />
        <text x="60" y="150" textAnchor="middle" fontSize="3" fontWeight="700" fill="#92400e">{name}</text>
      </>);
    }
    if (hint === 'calendar') {
      // 벤토 그리드 레이아웃
      return wrap(<>
        {/* 대형 블록 (좌측 60%) — 월 + 달력 그리드 */}
        <rect x="6" y="6" width="72" height="148" rx="5" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
        <text x="42" y="20" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{mo}월</text>
        <rect x="10" y="24" width="64" height="8" rx="4" fill={c} fillOpacity="0.08" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={14 + i * 9} y="30" textAnchor="middle" fontSize="2.2" fontWeight="700" fill={i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#94a3b8'}>{d}</text>
        ))}
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 14 + col * 9, cy = 38 + row * 9;
          return <g key={`${row}-${col}`}>
            {isRunStart(day, col) && closedRunLength(day, col) > 1 && <rect x={cx - 4} y={cy - 3.5} width={9 * (closedRunLength(day, col) - 1) + 8} height="7" rx="3.5" fill={c} fillOpacity="0.15" />}
            {isRunStart(day, col) && closedRunLength(day, col) === 1 && <rect x={cx - 4} y={cy - 3.5} width="8" height="7" rx="3" fill={c} fillOpacity="0.15" />}
            {short && <rect x={cx - 4} y={cy - 3.5} width="8" height="7" rx="3" fill="#f59e0b" fillOpacity="0.12" />}
            <text x={cx} y={cy + 2} textAnchor="middle" fontSize="3" fontWeight={closed || short ? '800' : '400'} fill={closed ? c : short ? '#b45309' : col === 0 ? '#ef4444' : '#475569'}>{day}</text>
          </g>;
        }))}
        {/* 소형 블록 (우상단) — 진료시간 */}
        <rect x="82" y="6" width="32" height="70" rx="5" fill={c} fillOpacity="0.08" filter={`url(#shadow_${t.id})`} />
        <text x="98" y="18" textAnchor="middle" fontSize="2.5" fontWeight="700" fill={c}>진료시간</text>
        <text x="98" y="28" textAnchor="middle" fontSize="2" fill="#475569">평일</text>
        <text x="98" y="34" textAnchor="middle" fontSize="2.5" fontWeight="700" fill="#1e293b">09:30</text>
        <text x="98" y="39" textAnchor="middle" fontSize="2.5" fontWeight="700" fill="#1e293b">~18:00</text>
        <text x="98" y="49" textAnchor="middle" fontSize="2" fill="#475569">토요일</text>
        <text x="98" y="55" textAnchor="middle" fontSize="2.5" fontWeight="700" fill="#1e293b">09:30</text>
        <text x="98" y="60" textAnchor="middle" fontSize="2.5" fontWeight="700" fill="#1e293b">~14:00</text>
        <text x="98" y="70" textAnchor="middle" fontSize="2" fill="#94a3b8">점심 13~14</text>
        {/* 소형 블록 (우하단) — 범례 + 이름 */}
        <rect x="82" y="80" width="32" height="74" rx="5" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
        <rect x="87" y="90" width="8" height="5" rx="1.5" fill={c} fillOpacity="0.15" />
        <text x="98" y="94" fontSize="2.5" fill="#64748b">휴진</text>
        <rect x="87" y="100" width="8" height="5" rx="1.5" fill="#f59e0b" fillOpacity="0.15" />
        <text x="98" y="104" fontSize="2.5" fill="#64748b">단축</text>
        <text x="98" y="140" textAnchor="middle" fontSize="2.5" fontWeight="600" fill={a}>{name}</text>
      </>);
    }
    if (hint === 'card') {
      return wrap(<>
        <text x="60" y="13" textAnchor="middle" fontSize="4" fontWeight="600" fill={a} letterSpacing="0.5">{name}</text>
        <text x="60" y="24" textAnchor="middle" fontSize="7" fontWeight="800" fill={c}>{mo}월 휴진 안내</text>
        {/* 날짜 카드 2개 */}
        <rect x="10" y="32" width="46" height="44" rx="6" fill="white" fillOpacity="0.95" filter={`url(#shadow_${t.id})`} />
        <rect x="10" y="32" width="46" height="8" rx="6" fill={c} fillOpacity="0.1" />
        <text x="33" y="38" textAnchor="middle" fontSize="3" fontWeight="600" fill={c}>CLOSED</text>
        <text x="33" y="56" textAnchor="middle" fontSize="16" fontWeight="900" fill={c}>9</text>
        <text x="33" y="70" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={a}>월요일 휴진</text>
        <rect x="64" y="32" width="46" height="44" rx="6" fill="white" fillOpacity="0.95" filter={`url(#shadow_${t.id})`} />
        <rect x="64" y="32" width="46" height="8" rx="6" fill="#ef4444" fillOpacity="0.1" />
        <text x="87" y="38" textAnchor="middle" fontSize="3" fontWeight="600" fill="#ef4444">CLOSED</text>
        <text x="87" y="56" textAnchor="middle" fontSize="16" fontWeight="900" fill="#ef4444">15</text>
        <text x="87" y="70" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#dc2626">일요일 휴진</text>
        {/* 단축진료 배지 */}
        <rect x="10" y="82" width="100" height="18" rx="5" fill="#fffbeb" stroke="#f59e0b" strokeOpacity="0.2" strokeWidth="0.4" />
        <circle cx="22" cy="91" r="3.5" fill="#f59e0b" fillOpacity="0.15" />
        <text x="22" y="92.5" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="#d97706">!</text>
        <text x="62" y="93" textAnchor="middle" fontSize="3.8" fontWeight="600" fill="#92400e">22일 (토) 단축진료 10:00~14:00</text>
        {/* 하단 */}
        <rect x="10" y="108" width="100" height="20" rx="5" fill={c} fillOpacity="0.05" />
        <text x="60" y="118" textAnchor="middle" fontSize="3.5" fill="#64748b">양해 부탁드립니다</text>
        <rect x="30" y="135" width="60" height="12" rx="6" fill={`url(#accent_${t.id})`} fillOpacity="0.9" />
        <text x="60" y="143" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white">예약하기</text>
      </>);
    }
    if (hint === 'highlight') {
      return wrap(<>
        <text x="60" y="13" textAnchor="middle" fontSize="4" fontWeight="600" fill={a} letterSpacing="0.5">{name}</text>
        {/* 방사형 선 */}
        {Array.from({length: 12}, (_, i) => {
          const angle = i * 30 * Math.PI / 180;
          return <line key={i} x1="60" y1="50" x2={60 + Math.cos(angle) * 35} y2={50 + Math.sin(angle) * 35} stroke={c} strokeWidth="0.4" strokeOpacity="0.08" />;
        })}
        <circle cx="60" cy="50" r="24" fill={c} fillOpacity="0.04" />
        {/* 대형 날짜 강조 영역 */}
        <rect x="12" y="20" width="96" height="42" rx="8" fill={c} fillOpacity="0.08" />
        <text x="60" y="36" textAnchor="middle" fontSize="14" fontWeight="900" fill={c} letterSpacing="2">9 / 15</text>
        <rect x="35" y="44" width="50" height="10" rx="5" fill={c} fillOpacity="0.15" />
        <text x="60" y="51" textAnchor="middle" fontSize="4.5" fontWeight="700" fill={c}>{mo}월 휴진일</text>
        {/* 단축진료 배지 */}
        <rect x="15" y="68" width="90" height="14" rx="4" fill="#fef3c7" />
        <text x="60" y="77" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="#92400e">22일 단축진료 10:00~14:00</text>
        {/* 진료시간 카드 */}
        <rect x="15" y="88" width="90" height="34" rx="5" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
        {[{y:97,t:'평일 09:30 ~ 18:00'},{y:105,t:'토요일 09:30 ~ 14:00'},{y:113,t:'점심시간 13:00 ~ 14:00'}].map(({y,t: txt}) => (
          <text key={y} x="60" y={y} textAnchor="middle" fontSize="3.8" fill="#475569">{txt}</text>
        ))}
        {/* CTA */}
        <text x="60" y="150" textAnchor="middle" fontSize="3" fill="#94a3b8">양해 부탁드립니다</text>
      </>);
    }
    if (hint === 'week') {
      // 수평 아코디언 탭 레이아웃
      return wrap(<>
        <text x="60" y="13" textAnchor="middle" fontSize="4" fontWeight="600" fill={a} letterSpacing="0.5">{name}</text>
        <text x="60" y="25" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={c}>{mo}월 셋째 주</text>
        {/* 7개 수직 탭 스트립 */}
        {['일','월','화','수','목','금','토'].map((d, i) => {
          const isClosed = i === 3;
          const isSun = i === 0;
          const tx = 8 + i * 15;
          const tabH = isClosed ? 110 : 90;
          const tabY = 34;
          return <g key={d}>
            <rect x={tx} y={tabY} width="14" height={tabH} rx="4" ry="4" fill={isClosed ? c : 'white'} fillOpacity={isClosed ? 0.15 : 0.95} stroke={isClosed ? c : '#e2e8f0'} strokeWidth={isClosed ? '0.8' : '0.4'} filter={`url(#shadow_${t.id})`} />
            {/* 탭 상단 라운드 헤더 */}
            <rect x={tx} y={tabY} width="14" height="12" rx="4" fill={isSun ? '#fef2f2' : isClosed ? c : '#f8fafc'} />
            <text x={tx + 7} y={tabY + 9} textAnchor="middle" fontSize="3" fontWeight="700" fill={isSun ? '#ef4444' : isClosed ? 'white' : '#94a3b8'}>{d}</text>
            {/* 날짜 */}
            <text x={tx + 7} y={tabY + 28} textAnchor="middle" fontSize="6" fontWeight={isClosed ? '800' : '500'} fill={isClosed ? c : isSun ? '#ef4444' : '#64748b'}>{15 + i}</text>
            {isClosed && <>
              <rect x={tx + 2} y={tabY + 34} width="10" height="6" rx="3" fill={c} fillOpacity="0.2" />
              <text x={tx + 7} y={tabY + 39} textAnchor="middle" fontSize="2.2" fontWeight="700" fill={c}>휴진</text>
              <line x1={tx + 3} y1={tabY + 50} x2={tx + 11} y2={tabY + 50} stroke={c} strokeWidth="0.3" strokeOpacity="0.3" />
              <text x={tx + 7} y={tabY + 58} textAnchor="middle" fontSize="1.8" fill={c} fillOpacity="0.6">종일</text>
            </>}
          </g>;
        })}
        <text x="60" y="154" textAnchor="middle" fontSize="2.8" fill="#94a3b8">양해 부탁드립니다</text>
      </>);
    }
    if (hint === 'wk_bar') {
      // 계단식 피라미드 스타일
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f8fafc" />
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
      // 흩어진 플로팅 회전 카드 스타일
      const rotations = [-6, 3, -4, 5, -3, 7, -8];
      const positions = [
        {x: 8, y: 34}, {x: 38, y: 30}, {x: 72, y: 36},
        {x: 10, y: 68}, {x: 44, y: 72}, {x: 78, y: 66},
        {x: 40, y: 104}
      ];
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#fafafa" />
        {/* 타이틀 */}
        <text x="60" y="16" textAnchor="middle" fontSize="4" fontWeight="600" fill={a}>{name}</text>
        <text x="60" y="26" textAnchor="middle" fontSize="3" fontWeight="500" fill="#94a3b8">{mo}월 셋째 주 진료일정</text>
        {/* 7장의 개별 요일 카드 */}
        {['일','월','화','수','목','금','토'].map((d, i) => {
          const isClosed = i === 3;
          const isSun = i === 0;
          const pos = positions[i];
          const rot = rotations[i];
          return <g key={d} transform={`rotate(${rot} ${pos.x + 18} ${pos.y + 14})`}>
            <rect x={pos.x} y={pos.y} width="36" height="28" rx="4" fill={isClosed ? c : 'white'} fillOpacity={isClosed ? 0.12 : 0.95} stroke={isClosed ? c : '#e2e8f0'} strokeWidth={isClosed ? '0.8' : '0.4'} filter={`url(#shadow_${t.id})`} />
            <text x={pos.x + 18} y={pos.y + 10} textAnchor="middle" fontSize="2.8" fontWeight="700" fill={isSun ? '#ef4444' : isClosed ? c : '#94a3b8'}>{d}</text>
            <text x={pos.x + 18} y={pos.y + 21} textAnchor="middle" fontSize="7" fontWeight={isClosed ? '800' : '500'} fill={isClosed ? c : isSun ? '#ef4444' : '#475569'}>{15 + i}</text>
            {isClosed && <text x={pos.x + 18} y={pos.y + 27} textAnchor="middle" fontSize="2" fontWeight="700" fill={c}>휴진</text>}
          </g>;
        })}
        {/* 하단 */}
        <text x="60" y="148" textAnchor="middle" fontSize="3" fontWeight="600" fill="#64748b">착오 없으시길 바랍니다</text>
        <text x="60" y="156" textAnchor="middle" fontSize="2.8" fill="#94a3b8">{name}</text>
      </>);
    }
    if (hint === 'wk_timeline') {
      // 수묵화 한국풍 스타일
      return wrap(<>
        {/* 베이지 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f0ece4" />
        {/* 수묵화 산 (하단) */}
        <path d="M0,130 Q15,110 30,125 Q45,108 60,120 Q75,105 90,118 Q105,108 120,130 L120,160 L0,160 Z" fill="#2d2d2d" fillOpacity="0.18" />
        <path d="M0,140 Q20,125 40,138 Q60,118 80,132 Q100,115 120,140 L120,160 L0,160 Z" fill="#1a1a1a" fillOpacity="0.22" />
        {/* 태극기 캐릭터 (간소화) */}
        <circle cx="18" cy="20" r="6" fill="#fbbf24" fillOpacity="0.4" />
        <text x="18" y="22" textAnchor="middle" fontSize="5" fill="#525252">🇰🇷</text>
        <circle cx="102" cy="22" r="5" fill="#fbbf24" fillOpacity="0.3" />
        <text x="102" y="24" textAnchor="middle" fontSize="5" fill="#525252">🇰🇷</text>
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
      // 벚꽃 봄 스타일
      return wrap(<>
        {/* 핑크 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#fdf2f8" />
        {/* 벚꽃 장식 */}
        <text x="6" y="18" fontSize="9" fill="#f9a8d4" fillOpacity="0.65">🌸</text>
        <text x="94" y="12" fontSize="7" fill="#fbcfe8" fillOpacity="0.7">🌸</text>
        <text x="98" y="148" fontSize="5" fill="#f9a8d4" fillOpacity="0.45">🌸</text>
        <text x="4" y="150" fontSize="8" fill="#fbcfe8" fillOpacity="0.4">🌸</text>
        <circle cx="105" cy="35" r="2" fill="#f9a8d4" fillOpacity="0.55" />
        <circle cx="10" cy="65" r="1.5" fill="#f9a8d4" fillOpacity="0.45" />
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
      // 빌보드/도로 표지판 스타일
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#e2e8f0" />
        {/* 하이웨이 사인 */}
        <rect x="10" y="8" width="100" height="72" rx="6" fill="#115e59" filter={`url(#shadow_${t.id})`} />
        <rect x="12" y="10" width="96" height="68" rx="5" fill="none" stroke="white" strokeWidth="0.6" strokeOpacity="0.4" />
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
      // 눈꽃 겨울 스타일
      return wrap(<>
        {/* 아이시 블루 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#e0f2fe" />
        <rect x="0" y="100" width="120" height="60" rx="6" fill="white" fillOpacity="0.6" />
        {/* 눈꽃 장식 */}
        <text x="8" y="16" fontSize="8" fill="#bae6fd" fillOpacity="0.75">❄</text>
        <text x="96" y="20" fontSize="6" fill="#7dd3fc" fillOpacity="0.6">❄</text>
        <text x="50" y="12" fontSize="4" fill="#bae6fd" fillOpacity="0.6">✧</text>
        <text x="102" y="90" fontSize="4" fill="#bae6fd" fillOpacity="0.45">❄</text>
        <text x="6" y="120" fontSize="5" fill="#bae6fd" fillOpacity="0.45">❄</text>
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
    // layoutHint별 다른 시술/이벤트 예시 (차별화)
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
      // ━━ 할인 배너: 거대 30% 텍스트 + 대각선 스트라이프 패턴 ━━
      return wrap(<>
        <defs>
          <pattern id={`stripe_${t.id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="white" strokeWidth="1.5" strokeOpacity="0.35" />
          </pattern>
        </defs>
        {/* 솔리드 컬러 풀 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill={c} />
        {/* 대각선 스트라이프 텍스처 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill={`url(#stripe_${t.id})`} />
        {/* 병원명 — 좌상단 작게 */}
        <text x="8" y="12" textAnchor="start" fontSize="3" fontWeight="600" fill="white" fillOpacity="0.8">{name}</text>
        {/* HERO: 거대 할인율 텍스트 — 카드 높이 60% 차지 */}
        <text x="60" y="62" textAnchor="middle" fontSize="48" fontWeight="900" fill="white" fillOpacity="0.95">{ed.discount.replace(/[^0-9]/g,'')}</text>
        <text x="96" y="40" textAnchor="middle" fontSize="20" fontWeight="900" fill="white">{ed.discount.includes('%') ? '%' : ''}</text>
        <text x="60" y="82" textAnchor="middle" fontSize="8" fontWeight="800" fill="white" letterSpacing="4">{ed.discount.includes('FREE') ? 'FREE' : 'OFF'}</text>
        {/* 시술명 */}
        <text x="60" y="100" textAnchor="middle" fontSize="6" fontWeight="700" fill="white" fillOpacity="0.9">{ed.procedure} 이벤트</text>
        {/* 가격 — 하단 화이트 필 */}
        <rect x="20" y="112" width="80" height="16" rx="8" fill="white" />
        {ed.origPrice && <text x="60" y="117" textAnchor="middle" fontSize="3" fill="#94a3b8" textDecoration="line-through">{ed.origPrice}</text>}
        <text x="60" y="125" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{ed.price}</text>
        {/* 기간 */}
        <text x="60" y="140" textAnchor="middle" fontSize="3" fontWeight="600" fill="white" fillOpacity="0.7">2026.03.01 ~ 03.31</text>
        <rect x="24" y="144" width="72" height="10" rx="5" fill="white" fillOpacity="0.3" />
        <text x="60" y="151" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white">지금 바로 예약하세요</text>
      </>);
    }
    if (h === 'elegant') {
      // ━━ 엘레강스: 메탈릭 그라데이션 이중선 프레임 + 노이즈 텍스처 ━━
      return wrap(<>
        <defs>
          <linearGradient id={`gold_${t.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#B8860B" />
            <stop offset="35%" stopColor="#F5DEB3" />
            <stop offset="65%" stopColor="#D4A853" />
            <stop offset="100%" stopColor="#B8860B" />
          </linearGradient>
          <filter id={`grain_${t.id}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise" />
            <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
            <feBlend in="SourceGraphic" in2="grayNoise" mode="multiply" />
          </filter>
        </defs>
        {/* 풀 다크 네이비 배경 + 노이즈 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#0f172a" filter={`url(#grain_${t.id})`} />
        {/* 이중선 직사각형 프레임 */}
        <rect x="8" y="8" width="104" height="144" rx="2" fill="none" stroke={`url(#gold_${t.id})`} strokeWidth="0.8" />
        <rect x="11" y="11" width="98" height="138" rx="1" fill="none" stroke={`url(#gold_${t.id})`} strokeWidth="0.4" />
        {/* 골드 다이아몬드 장식 — 중앙 */}
        <rect x="52" y="52" width="16" height="16" rx="1" fill="none" stroke={`url(#gold_${t.id})`} strokeWidth="0.7" transform="rotate(45 60 60)" />
        <rect x="55" y="55" width="10" height="10" rx="1" fill={`url(#gold_${t.id})`} fillOpacity="0.35" transform="rotate(45 60 60)" />
        <circle cx="60" cy="60" r="2" fill={`url(#gold_${t.id})`} fillOpacity="0.8" />
        {/* 타이틀 — 큰 화이트 텍스트 */}
        <text x="60" y="88" textAnchor="middle" fontSize="8" fontWeight="800" fill="white" letterSpacing="1">{ed.procedure}</text>
        <text x="60" y="100" textAnchor="middle" fontSize="8" fontWeight="800" fill="white" letterSpacing="1">특별 이벤트</text>
        {/* 메탈릭 골드 가격 + 언더라인 */}
        <text x="60" y="122" textAnchor="middle" fontSize="11" fontWeight="900" fill={`url(#gold_${t.id})`}>{ed.price}</text>
        <line x1="30" y1="126" x2="90" y2="126" stroke={`url(#gold_${t.id})`} strokeWidth="0.6" />
        {/* 기간 */}
        <text x="60" y="136" textAnchor="middle" fontSize="2.8" fontWeight="500" fill={`url(#gold_${t.id})`} fillOpacity="0.6">2026.03.01 ~ 03.31</text>
        {/* 병원명 — 하단 */}
        <text x="60" y="146" textAnchor="middle" fontSize="3" fontWeight="600" fill={`url(#gold_${t.id})`} fillOpacity="0.5" letterSpacing="2">{name}</text>
      </>);
    }
    if (h === 'pop') {
      // ━━ 팝 컬러풀: 겹치는 원들 + 중앙 화이트 원 + 흩뿌린 도트 ━━
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        {/* 겹치는 대형 원들 — 다양한 크기와 투명도 */}
        <circle cx="20" cy="25" r="28" fill={c} fillOpacity="0.3" />
        <circle cx="95" cy="18" r="22" fill={c} fillOpacity="0.5" />
        <circle cx="10" cy="90" r="18" fill={a} fillOpacity="0.35" />
        <circle cx="105" cy="75" r="25" fill={c} fillOpacity="0.4" />
        <circle cx="35" cy="130" r="20" fill={a} fillOpacity="0.3" />
        <circle cx="100" cy="140" r="15" fill={c} fillOpacity="0.45" />
        {/* 흩뿌린 장식 도트 */}
        <circle cx="50" cy="12" r="2" fill={c} fillOpacity="0.5" />
        <circle cx="75" cy="45" r="1.5" fill={a} fillOpacity="0.6" />
        <circle cx="15" cy="60" r="1" fill={c} fillOpacity="0.4" />
        <circle cx="108" cy="55" r="1.8" fill={a} fillOpacity="0.5" />
        <circle cx="25" cy="110" r="1.2" fill={c} fillOpacity="0.55" />
        <circle cx="90" cy="105" r="1.5" fill={a} fillOpacity="0.45" />
        <circle cx="70" cy="148" r="1" fill={c} fillOpacity="0.5" />
        {/* HERO: 큰 화이트 원 — 중앙 */}
        <circle cx="60" cy="72" r="30" fill="white" filter={`url(#shadow_${t.id})`} />
        <text x="60" y="68" textAnchor="middle" fontSize="18" fontWeight="900" fill={c}>{ed.discount}</text>
        <text x="60" y="82" textAnchor="middle" fontSize="5" fontWeight="800" fill={a}>{ed.discount.includes('FREE') ? '무료' : '할인'}</text>
        {/* 시술명 */}
        <text x="60" y="112" textAnchor="middle" fontSize="6" fontWeight="800" fill={c}>{ed.procedure}</text>
        {/* 가격 배너 — 하단 */}
        <rect x="10" y="122" width="100" height="16" rx="8" fill={c} />
        {ed.origPrice && <text x="60" y="128" textAnchor="middle" fontSize="3" fill="white" fillOpacity="0.8" textDecoration="line-through">{ed.origPrice}</text>}
        <text x="60" y="135" textAnchor="middle" fontSize="6" fontWeight="900" fill="white">{ed.price}</text>
        {/* 기간 + 병원명 */}
        <text x="60" y="147" textAnchor="middle" fontSize="2.8" fontWeight="600" fill="#64748b">2026.03.01 ~ 03.31</text>
        <text x="60" y="155" textAnchor="middle" fontSize="2.8" fill="#94a3b8">{name}</text>
      </>);
    }
    if (h === 'minimal') {
      // ━━ 미니멀 모던: 수평선 디바이더, 좌측 바 없음, 최대 여백 ━━
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        {/* 전부 좌정렬 — 바 없음 */}
        <text x="14" y="28" textAnchor="start" fontSize="3" fontWeight="500" fill="#94a3b8" letterSpacing="2">EVENT</text>
        {/* HERO: 거대 타이포 */}
        <text x="14" y="58" textAnchor="start" fontSize="16" fontWeight="900" fill="#1e293b">{ed.procedure}</text>
        <text x="14" y="78" textAnchor="start" fontSize="10" fontWeight="700" fill={c}>{ed.discount === 'FREE' ? '무료 상담' : '특별 할인'}</text>
        {/* 수평 디바이더 */}
        <line x1="14" y1="88" x2="106" y2="88" stroke="#cbd5e1" strokeWidth="0.8" />
        {/* 가격 — 좌정렬 */}
        {ed.origPrice && <text x="14" y="104" textAnchor="start" fontSize="3.5" fill="#94a3b8" textDecoration="line-through">{ed.origPrice}</text>}
        <text x="14" y="118" textAnchor="start" fontSize="10" fontWeight="900" fill="#1e293b">{ed.price}</text>
        {/* 기간 */}
        <text x="14" y="136" textAnchor="start" fontSize="3" fontWeight="500" fill="#94a3b8">2026.03.01 ~ 03.31</text>
        {/* 병원명 */}
        <text x="14" y="152" textAnchor="start" fontSize="3" fontWeight="600" fill="#94a3b8">{name}</text>
      </>);
    }
    if (h === 'wave') {
      // ━━ 그라데이션 웨이브: 상단/하단 큰 물결 + 중앙 여백 ━━
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        {/* HERO: 상단 물결 — 솔리드 프라이머리, 상단 35% 커버 */}
        <path d="M0,0 L120,0 L120,48 Q100,60 80,52 Q60,44 40,54 Q20,64 0,56 Z" fill={c} />
        {/* 상단 물결 위 텍스트 */}
        <text x="60" y="18" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white" fillOpacity="0.9">{name}</text>
        <text x="60" y="36" textAnchor="middle" fontSize="7" fontWeight="900" fill="white">{ed.procedure} 이벤트</text>
        {/* 중앙 여백 — 타이틀+가격 */}
        <text x="60" y="82" textAnchor="middle" fontSize="4" fill={a} fontWeight="600" letterSpacing="1">Limited Time Offer</text>
        <text x="60" y="100" textAnchor="middle" fontSize="13" fontWeight="900" fill={c}>{ed.price}</text>
        <text x="60" y="112" textAnchor="middle" fontSize="3" fontWeight="600" fill="#64748b">2026.03.01 ~ 03.31</text>
        {/* HERO: 하단 물결 — 0.4 투명도, 하단 25% 커버 */}
        <path d="M0,122 Q20,114 40,120 Q60,126 80,118 Q100,110 120,118 L120,160 L0,160 Z" fill={c} fillOpacity="0.4" />
        <path d="M0,132 Q30,124 60,132 Q90,140 120,132 L120,160 L0,160 Z" fill={c} fillOpacity="0.35" />
        {/* 하단 물결 위 CTA */}
        <text x="60" y="148" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">예약하기</text>
      </>);
    }
    // season (fallback) — 시즌 스페셜: 대각선 리본 + 도트 그리드
    return wrap(<>
      <defs>
        <pattern id={`dots_${t.id}`} width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="5" r="0.8" fill={c} fillOpacity="0.15" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
      {/* 도트 그리드 텍스처 배경 */}
      <rect x="0" y="0" width="120" height="160" rx="6" fill={`url(#dots_${t.id})`} />
      {/* HERO: 대각선 리본 — 좌상단에서 중앙우측으로 */}
      <path d="M-10,20 L80,0 L90,16 L0,36 Z" fill={c} />
      <path d="M-10,24 L80,4 L82,8 L-8,28 Z" fill={a} fillOpacity="0.6" />
      {/* 리본 위 텍스트 */}
      <text x="36" y="16" textAnchor="middle" fontSize="5" fontWeight="800" fill="white" transform="rotate(-11 36 16)">{ed.procedure} 이벤트</text>
      {/* "시즌 한정" 뱃지 — 회전된 사각형 */}
      <rect x="70" y="36" width="40" height="14" rx="3" fill={a} transform="rotate(-8 90 43)" />
      <text x="90" y="45" textAnchor="middle" fontSize="4.5" fontWeight="800" fill="white" transform="rotate(-8 90 45)">시즌 한정</text>
      {/* 병원명 */}
      <text x="20" y="60" textAnchor="start" fontSize="3" fontWeight="600" fill="#64748b">{name}</text>
      {/* 가격 — 큰 화이트 카드 (둥근 모서리) */}
      <rect x="12" y="70" width="96" height="50" rx="12" fill="white" filter={`url(#shadow_${t.id})`} />
      {ed.origPrice && <text x="60" y="84" textAnchor="middle" fontSize="3.5" fill="#94a3b8" textDecoration="line-through">{ed.origPrice}</text>}
      <text x="60" y="100" textAnchor="middle" fontSize="14" fontWeight="900" fill={c}>{ed.price}</text>
      <text x="60" y="114" textAnchor="middle" fontSize="3" fontWeight="600" fill="#64748b">2026.03.01 ~ 03.31</text>
      {/* CTA */}
      <rect x="20" y="128" width="80" height="14" rx="7" fill={`url(#accent_${t.id})`} />
      <text x="60" y="138" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">지금 바로 예약하세요</text>
      {/* 하단 장식 도트 */}
      <circle cx="15" cy="150" r="2" fill={c} fillOpacity="0.3" />
      <circle cx="105" cy="148" r="1.5" fill={a} fillOpacity="0.35" />
    </>);
  }

  if (category === 'doctor') {
    const h = t.layoutHint;
    // layoutHint별 다른 진료과/전공 예시 (차별화)
    const doctorData: Record<string, { docName: string; specialty: string; credentials: string[]; greeting: string }> = {
      portrait: { docName: '김윈에이드', specialty: '치과 전문의', credentials: ['서울대 치의학 박사', '임플란트 전문', '경력 10년'], greeting: '환자분의 미소가 저의 보람입니다' },
      curve:    { docName: '이건강', specialty: '가정의학과 전문의', credentials: ['연세대 의과대학', '만성질환 관리', '경력 15년'], greeting: '온 가족의 주치의가 되겠습니다' },
      split:    { docName: '박아름', specialty: '피부과 전문의', credentials: ['고려대 의학 박사', '레이저 시술 전문', '경력 8년'], greeting: '아름다운 피부를 되찾아 드립니다' },
      story:    { docName: '최소아', specialty: '소아과 전문의', credentials: ['서울대 의과대학', '소아 알레르기', '경력 12년'], greeting: '아이들의 건강한 성장을 응원합니다' },
      luxury:   { docName: '정미인', specialty: '성형외과 전문의', credentials: ['성형외과 전문의', '안면윤곽 전문', '경력 20년'], greeting: '자연스러운 아름다움을 추구합니다' },
      grid:     { docName: '한동의', specialty: '한의학 박사', credentials: ['경희대 한의학', '침구 전문', '경력 18년'], greeting: '체질에 맞는 치료를 제공합니다' },
    };
    const dd = doctorData[h] || doctorData.portrait;
    const docCta = (y: number, label = '진료 예약하기') => (<>
      <rect x="16" y={y} width="88" height="16" rx="8" fill={`url(#accent_${t.id})`} />
      <text x="60" y={y + 10.5} textAnchor="middle" fontSize="3.8" fontWeight="700" fill="white">{label}</text>
    </>);
    if (h === 'split') {
      // 좌우 분할 — 좌측 풀컬러 + 우측 화이트
      return wrap(<>
        {/* 왼쪽 풀 컬러 패널 */}
        <rect x="0" y="0" width="54" height="160" rx="6" fill={c} />
        <circle cx="10" cy="14" r="12" fill="white" fillOpacity="0.1" />
        <circle cx="48" cy="150" r="16" fill="white" fillOpacity="0.08" />
        {/* 프로필 원 */}
        <circle cx="27" cy="50" r="18" fill="white" fillOpacity="0.25" />
        <circle cx="27" cy="44" r="7" fill="white" fillOpacity="0.6" />
        <ellipse cx="27" cy="58" rx="9" ry="5.5" fill="white" fillOpacity="0.35" />
        {/* 좌측 인사말 */}
        <text x="27" y="82" textAnchor="middle" fontSize="3" fill="white" fillOpacity="0.9" fontStyle="italic">"{dd.greeting.split(/[,.!]/).filter(Boolean)[0]}"</text>
        {/* 우측 정보 */}
        <text x="87" y="16" textAnchor="middle" fontSize="3.2" fontWeight="600" fill={a}>{name}</text>
        <text x="87" y="40" textAnchor="middle" fontSize="10" fontWeight="900" fill={c}>{dd.docName.slice(0,1)}원장</text>
        <rect x="62" y="46" width="50" height="12" rx="6" fill={`url(#accent_${t.id})`} />
        <text x="87" y="55" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">{dd.specialty}</text>
        {dd.credentials.map((t2, i) => (
          <g key={i}>
            <rect x="60" y={66 + i * 16} width="52" height="12" rx="4" fill={c} fillOpacity={0.06 + i * 0.02} />
            <circle cx="66" cy={72 + i * 16} r="2" fill={c} />
            <text x="72" y={74.5 + i * 16} fontSize="3.2" fontWeight="500" fill="#475569">{t2}</text>
          </g>
        ))}
        {docCta(120)}
        <rect x="0" y="155" width="120" height="3" rx="1.5" fill={`url(#accent_${t.id})`} />
      </>);
    }
    if (h === 'luxury') {
      // 다크 프리미엄 — 동심원 골드 링 + 방사형 그라데이션
      return wrap(<>
        <defs>
          <radialGradient id={`radBg_${t.id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a1a2e" />
            <stop offset="100%" stopColor="#0f172a" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="120" height="160" rx="6" fill={`url(#radBg_${t.id})`} />
        <text x="60" y="20" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="#d4a853" letterSpacing="2">{name}</text>
        {/* 동심원 골드 링 3개 */}
        <circle cx="60" cy="72" r="40" fill="none" stroke="#d4a853" strokeWidth="0.5" strokeOpacity="0.4" />
        <circle cx="60" cy="72" r="30" fill="none" stroke="#d4a853" strokeWidth="0.7" strokeOpacity="0.6" />
        <circle cx="60" cy="72" r="20" fill="none" stroke="#d4a853" strokeWidth="1" strokeOpacity="0.8" />
        {/* 프로필 — 가장 안쪽 링 내부 */}
        <circle cx="60" cy="66" r="7" fill="#d4a853" fillOpacity="0.5" />
        <ellipse cx="60" cy="80" rx="10" ry="6" fill="#d4a853" fillOpacity="0.3" />
        <text x="60" y="104" textAnchor="middle" fontSize="10" fontWeight="900" fill="#d4a853">{dd.docName.slice(0,1)}원장</text>
        <rect x="24" y="110" width="72" height="12" rx="6" fill="#d4a853" fillOpacity="0.25" />
        <text x="60" y="118.5" textAnchor="middle" fontSize="4" fontWeight="700" fill="#d4a853">{dd.specialty}</text>
        <text x="60" y="134" textAnchor="middle" fontSize="3.2" fill="#94a3b8">{dd.credentials.slice(0,2).join(' · ')}</text>
        <line x1="28" y1="140" x2="92" y2="140" stroke="#d4a853" strokeWidth="0.6" />
        <text x="60" y="152" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="#d4a853">{name}</text>
      </>);
    }
    if (h === 'portrait') {
      // 상단 풀컬러 + 유기적 웨이브 경계 + 프로필 오버랩
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        {/* 상단 컬러 영역 — 웨이브 하단 경계 */}
        <path d="M0,0 L120,0 L120,65 Q90,75 60,65 Q30,55 0,65 Z" fill={c} />
        <circle cx="18" cy="14" r="12" fill="white" fillOpacity="0.1" />
        <circle cx="104" cy="50" r="16" fill="white" fillOpacity="0.08" />
        <text x="60" y="16" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white">{name}</text>
        {/* 하단 화이트 영역 (웨이브 형태) */}
        <path d="M0,65 Q30,55 60,65 Q90,75 120,65 L120,160 L0,160 Z" fill="white" />
        {/* 프로필 — 웨이브 꼭대기에 걸침 */}
        <circle cx="60" cy="60" r="22" fill="white" stroke="white" strokeWidth="3" filter={`url(#shadow_${t.id})`} />
        <circle cx="60" cy="53" r="8" fill={c} fillOpacity="0.4" />
        <ellipse cx="60" cy="68" rx="11" ry="6.5" fill={c} fillOpacity="0.2" />
        <text x="60" y="96" textAnchor="middle" fontSize="10" fontWeight="900" fill={c}>{dd.docName.slice(0,1)}원장</text>
        <rect x="22" y="100" width="76" height="14" rx="7" fill={`url(#accent_${t.id})`} />
        <text x="60" y="110" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="white">{dd.specialty}</text>
        {dd.credentials.map((t2, i) => (
          <text key={i} x="60" y={124 + i * 10} textAnchor="middle" fontSize="3.5" fontWeight="500" fill="#475569">{t2}</text>
        ))}
        <text x="60" y="156" textAnchor="middle" fontSize="3" fontWeight="700" fill={a}>{name}</text>
      </>);
    }
    if (h === 'curve') {
      // 곡선형 — 솔리드 곡선 배경
      return wrap(<>
        <path d="M0,0 L120,0 L120,75 Q90,95 60,75 Q30,55 0,75 Z" fill={c} fillOpacity="0.6" />
        <path d="M0,0 L120,0 L120,55 Q90,75 60,55 Q30,35 0,55 Z" fill={c} />
        <circle cx="16" cy="12" r="10" fill="white" fillOpacity="0.12" />
        <circle cx="108" cy="44" r="14" fill="white" fillOpacity="0.08" />
        <text x="60" y="14" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white">{name}</text>
        {/* 프로필 */}
        <circle cx="60" cy="48" r="20" fill="white" filter={`url(#shadow_${t.id})`} />
        <circle cx="60" cy="42" r="7" fill={c} fillOpacity="0.5" />
        <ellipse cx="60" cy="56" rx="10" ry="6" fill={c} fillOpacity="0.3" />
        <text x="60" y="80" textAnchor="middle" fontSize="9" fontWeight="900" fill={c}>{dd.docName.slice(0,1)}원장</text>
        <rect x="28" y="85" width="64" height="12" rx="6" fill={`url(#accent_${t.id})`} fillOpacity="0.8" />
        <text x="60" y="93.5" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">{dd.specialty}</text>
        {/* 인사말 카드 */}
        <rect x="14" y="102" width="92" height="26" rx="8" fill={c} fillOpacity="0.08" />
        <text x="60" y="118" textAnchor="middle" fontSize="3.5" fontWeight="500" fill={a} fontStyle="italic">"{dd.greeting}"</text>
        <text x="60" y="140" textAnchor="middle" fontSize="3" fontWeight="500" fill="#64748b">{dd.credentials.join(' · ')}</text>
        <text x="60" y="154" textAnchor="middle" fontSize="3" fontWeight="700" fill={a}>{name}</text>
      </>);
    }
    if (h === 'story') {
      // 스토리형 — 매거진 에디토리얼 + 대형 인용 부호
      return wrap(<>
        <text x="60" y="12" textAnchor="middle" fontSize="3.5" fontWeight="700" fill={a}>{name}</text>
        {/* 상단 프로필 바 — 솔리드 컬러 */}
        <rect x="0" y="18" width="120" height="40" rx="0" fill={c} fillOpacity="0.85" />
        <circle cx="30" cy="38" r="14" fill="white" fillOpacity="0.3" />
        <circle cx="30" cy="32" r="5.5" fill="white" fillOpacity="0.6" />
        <ellipse cx="30" cy="44" rx="7" ry="4.5" fill="white" fillOpacity="0.35" />
        <text x="80" y="32" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white" fillOpacity="0.9">{dd.specialty}</text>
        <text x="80" y="48" textAnchor="middle" fontSize="8" fontWeight="900" fill="white">{dd.docName.slice(0,1)}원장</text>
        {/* 인사말 카드 + 대형 인용부호 배경 */}
        <rect x="10" y="64" width="100" height="52" rx="8" fill={c} fillOpacity="0.08" />
        {/* 오버사이즈 인용부호 — 에디토리얼 느낌 */}
        <text x="16" y="94" textAnchor="start" fontSize="48" fontWeight="900" fill={c} fillOpacity="0.15">{"\u201C"}</text>
        <text x="104" y="114" textAnchor="end" fontSize="48" fontWeight="900" fill={c} fillOpacity="0.15">{"\u201D"}</text>
        <text x="60" y="88" textAnchor="middle" fontSize="4" fill="#475569">{dd.greeting}</text>
        <text x="60" y="108" textAnchor="middle" fontSize="4" fill={a} fontWeight="700">편안하게 찾아주세요.</text>
        <rect x="14" y="122" width="92" height="14" rx="7" fill={c} fillOpacity="0.06" />
        <text x="60" y="131" textAnchor="middle" fontSize="3" fontWeight="500" fill="#64748b">{dd.credentials.join(' · ')}</text>
        <text x="60" y="152" textAnchor="middle" fontSize="3" fontWeight="700" fill={a}>{name}</text>
      </>);
    }
    if (h === 'grid') {
      // 벤토 그리드 — 비균등 블록 (프로필 대형 + 정보 소형)
      return wrap(<>
        <text x="60" y="12" textAnchor="middle" fontSize="3.5" fontWeight="700" fill={a}>{name}</text>
        {/* 대형 프로필 블록 — 좌측 상단 */}
        <rect x="8" y="18" width="62" height="52" rx="10" fill={c} fillOpacity="0.12" />
        <circle cx="39" cy="38" r="14" fill="white" filter={`url(#shadow_${t.id})`} />
        <circle cx="39" cy="32" r="5.5" fill={c} fillOpacity="0.4" />
        <ellipse cx="39" cy="44" rx="7" ry="4.5" fill={c} fillOpacity="0.2" />
        <text x="39" y="62" textAnchor="middle" fontSize="4" fontWeight="800" fill={c}>{dd.docName.slice(0,1)}원장</text>
        {/* 우측 상단 소형 블록 — 전문분야 */}
        <rect x="74" y="18" width="40" height="24" rx="8" fill={c} fillOpacity="0.08" />
        <text x="94" y="30" textAnchor="middle" fontSize="3" fontWeight="600" fill="#94a3b8">전문분야</text>
        <text x="94" y="38" textAnchor="middle" fontSize="4" fontWeight="800" fill={c}>{dd.credentials[1] || dd.specialty}</text>
        {/* 우측 중간 소형 블록 — 경력 */}
        <rect x="74" y="46" width="40" height="24" rx="8" fill={c} fillOpacity="0.06" />
        <text x="94" y="58" textAnchor="middle" fontSize="3" fontWeight="600" fill="#94a3b8">경력</text>
        <text x="94" y="66" textAnchor="middle" fontSize="4" fontWeight="800" fill="#334155">{dd.credentials[2] || '경력 10년'}</text>
        {/* 하단 2개 블록 */}
        <rect x="8" y="74" width="52" height="24" rx="8" fill={c} fillOpacity="0.06" />
        <text x="34" y="86" textAnchor="middle" fontSize="3" fontWeight="600" fill="#94a3b8">학력</text>
        <text x="34" y="94" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="#334155">{dd.credentials[0] || ''}</text>
        <rect x="64" y="74" width="50" height="24" rx="8" fill={c} fillOpacity="0.06" />
        <text x="89" y="86" textAnchor="middle" fontSize="3" fontWeight="600" fill="#94a3b8">전문의</text>
        <text x="89" y="94" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="#334155">{dd.specialty}</text>
        {docCta(106, '예약하기')}
        <text x="60" y="148" textAnchor="middle" fontSize="3" fontWeight="700" fill={a}>{name}</text>
      </>);
    }
    // fallback — 중첩 프레임(nested rounded rectangles)
    return wrap(<>
      <rect x="6" y="6" width="108" height="148" rx="12" fill={c} fillOpacity="0.06" />
      <rect x="14" y="14" width="92" height="132" rx="9" fill={c} fillOpacity="0.04" />
      <rect x="22" y="22" width="76" height="116" rx="6" fill="white" fillOpacity="0.95" />
      <text x="60" y="16" textAnchor="middle" fontSize="3" fontWeight="600" fill={a}>{name}</text>
      {/* 프로필 — 중첩 프레임 센터 */}
      <circle cx="60" cy="52" r="16" fill="white" filter={`url(#shadow_${t.id})`} />
      <circle cx="60" cy="46" r="6" fill={c} fillOpacity="0.4" />
      <ellipse cx="60" cy="58" rx="8" ry="5" fill={c} fillOpacity="0.2" />
      <text x="60" y="80" textAnchor="middle" fontSize="9" fontWeight="900" fill={c}>{dd.docName.slice(0,1)}원장</text>
      <rect x="30" y="84" width="60" height="12" rx="6" fill={c} fillOpacity="0.1" />
      <text x="60" y="92.5" textAnchor="middle" fontSize="4" fontWeight="700" fill={c}>{dd.specialty}</text>
      <text x="60" y="108" textAnchor="middle" fontSize="3" fontWeight="500" fill="#64748b">{dd.credentials.join(' · ')}</text>
      {docCta(118, '예약하기')}
      <text x="60" y="148" textAnchor="middle" fontSize="3" fontWeight="700" fill={a}>{name}</text>
    </>);
  }

  if (category === 'notice') {
    // 공통 헬퍼: 본문 라인들
    const noticeBody = (x: number, startY: number, lines: string[], emphColor: string) => (<>
      {lines.map((line, i) => (
        <text key={i} x={x} y={startY + i * 12} textAnchor="middle" fontSize="4.2" fill={i === 0 ? emphColor : '#475569'} fontWeight={i === 0 ? '800' : '500'}>{line}</text>
      ))}
    </>);
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
    return wrap(<>
      {t.layoutHint === 'alert' ? <>
        {/* 알림형 — 플로팅 모달 카드 + 딥 섀도우 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f1f5f9" />
        {/* 떠 있는 카드 */}
        <rect x="8" y="14" width="104" height="120" rx="12" fill="white" filter={`url(#shadow_${t.id})`} />
        {/* 두꺼운 상단 보더 */}
        <rect x="8" y="14" width="104" height="6" rx="12" fill={c} />
        {/* 느낌표 아이콘 */}
        <circle cx="60" cy="38" r="14" fill={c} fillOpacity="0.12" />
        <text x="60" y="45" textAnchor="middle" fontSize="18" fontWeight="900" fill={c}>!</text>
        <text x="60" y="62" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{nd.title}</text>
        <text x="60" y="71" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#94a3b8">{name}</text>
        {noticeBody(60, 84, bodyLines, c)}
        <rect x="20" y="118" width="80" height="14" rx="7" fill={c} fillOpacity="0.35" />
        <text x="60" y="127" textAnchor="middle" fontSize="3.5" fontWeight="700" fill={c}>{nd.cta}</text>
        <text x="60" y="152" textAnchor="middle" fontSize="3" fontWeight="600" fill="#94a3b8">{name}</text>
      </> : t.layoutHint === 'formal' ? <>
        {/* 공문 스타일 — 다크 네이비 헤더 + 이중 프레임 */}
        <rect x="0" y="0" width="120" height="48" fill="#1f2937" />
        <text x="60" y="32" textAnchor="middle" fontSize="11" fontWeight="900" fill="white" letterSpacing="6">공 지 사 항</text>
        <text x="60" y="43" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#9ca3af">{name}</text>
        {/* 이중 테두리 콘텐츠 영역 */}
        <rect x="10" y="54" width="100" height="96" rx="2" fill="white" stroke="#1f2937" strokeWidth="1" />
        <rect x="13" y="57" width="94" height="90" rx="1" fill="none" stroke="#1f2937" strokeWidth="0.5" strokeOpacity="0.4" />
        <rect x="16" y="60" width="88" height="1" fill="#1f2937" fillOpacity="0.3" />
        {noticeBody(60, 74, bodyLines, '#1f2937')}
        <rect x="16" y="115" width="88" height="1" fill="#1f2937" fillOpacity="0.3" />
        <text x="60" y="130" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#64748b">{nd.cta}</text>
        <text x="60" y="140" textAnchor="middle" fontSize="3" fontWeight="500" fill="#94a3b8">{name}</text>
      </> : t.layoutHint === 'timeline' ? <>
        {/* 메트로/지하철 노선도 스타일 */}
        <text x="60" y="16" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{nd.title}</text>
        <text x="60" y="25" textAnchor="middle" fontSize="3.2" fontWeight="600" fill="#94a3b8">{name}</text>
        {/* 곡선 메트로 라인 */}
        <path d="M22,42 C22,42 22,58 40,66 C58,74 22,82 22,90 C22,98 40,106 40,106 L40,128" fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" />
        {[
          {d:'3/15', t:'이전 공지', x:22, y:42},
          {d:'3/25', t:'새 장소 준비', x:40, y:66},
          {d:'4/1', t:'새 장소 진료 시작', x:22, y:90},
          {d:'4/7', t:'정상 진료', x:40, y:114},
        ].map((item, i) => (
          <g key={i}>
            <circle cx={item.x} cy={item.y} r="6" fill="white" stroke={c} strokeWidth="2.5" />
            <circle cx={item.x} cy={item.y} r="2.5" fill={c} />
            <text x={item.x + 12} y={item.y - 3} fontSize="4.5" fontWeight="900" fill={c}>{item.d}</text>
            <text x={item.x + 12} y={item.y + 6} fontSize="3.5" fontWeight="500" fill="#475569">{item.t}</text>
          </g>
        ))}
        <text x="60" y="150" textAnchor="middle" fontSize="3" fontWeight="600" fill="#94a3b8">{nd.cta}</text>
      </> : t.layoutHint === 'bulletin' ? <>
        {/* 게시판 — 노란 배경 전체 + 압정 + 백색 카드 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#fbbf24" />
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#fbbf24" fillOpacity="0.4" />
        {/* 압정 */}
        <circle cx="60" cy="14" r="10" fill="#dc2626" />
        <circle cx="60" cy="14" r="5" fill="#991b1b" />
        <circle cx="57" cy="11" r="2" fill="white" fillOpacity="0.4" />
        {/* 백색 종이 카드 + 그림자 */}
        <rect x="12" y="28" width="96" height="105" rx="4" fill="white" filter={`url(#shadow_${t.id})`} />
        <rect x="12" y="28" width="96" height="2" rx="1" fill="#f59e0b" fillOpacity="0.5" />
        <text x="60" y="48" textAnchor="middle" fontSize="7" fontWeight="900" fill="#92400e">{nd.title}</text>
        <rect x="24" y="52" width="72" height="1" fill="#d4a017" fillOpacity="0.5" />
        {noticeBody(60, 66, bodyLines, '#92400e')}
        <text x="60" y="110" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#a16207">{nd.cta}</text>
        <text x="60" y="122" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="#92400e">{name}</text>
        <text x="60" y="148" textAnchor="middle" fontSize="3" fontWeight="500" fill="#92400e" fillOpacity="0.6">{name}</text>
      </> : t.layoutHint === 'soft' ? <>
        {/* 말풍선 레이아웃 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill={c} fillOpacity="0.06" />
        {/* 상단 정보 pill 뱃지 — 플로팅 */}
        <circle cx="60" cy="16" r="12" fill={c} />
        <text x="60" y="20" textAnchor="middle" fontSize="9" fontWeight="800" fill="white">i</text>
        {/* 말풍선 본체 */}
        <path d={`M16,34 Q16,30 20,30 L100,30 Q104,30 104,34 L104,118 Q104,122 100,122 L68,122 L60,134 L52,122 L20,122 Q16,122 16,118 Z`} fill="white" filter={`url(#shadow_${t.id})`} />
        <text x="60" y="48" textAnchor="middle" fontSize="6" fontWeight="800" fill={c}>{nd.title}</text>
        <line x1="30" y1="54" x2="90" y2="54" stroke={c} strokeOpacity="0.15" strokeWidth="0.5" />
        {['2026년 4월 1일부터','새 장소에서 진료합니다','서울시 강남구 ...','양해 부탁드립니다'].map((line, i) => (
          <text key={i} x="60" y={68 + i * 14} textAnchor="middle" fontSize="3.8" fontWeight={i === 0 ? '700' : '500'} fill={i === 0 ? c : '#475569'}>{line}</text>
        ))}
        <text x="60" y="145" textAnchor="middle" fontSize="3.5" fontWeight="700" fill={c}>{name}</text>
        <text x="60" y="154" textAnchor="middle" fontSize="3" fontWeight="500" fill="#94a3b8">{nd.cta}</text>
      </> : <>
        {/* 카드 팝업 (popup / fallback) — 모달 팝업 */}
        {/* 어두운 오버레이 배경 */}
        <rect x="0" y="0" width="120" height="160" fill="#0f172a" fillOpacity="0.35" />
        {/* 모달 카드 + 강한 그림자 */}
        <rect x="8" y="12" width="104" height="136" rx="12" fill="white" filter={`url(#shadow_${t.id})`} />
        {/* 그라디언트 헤더 25% */}
        <rect x="8" y="12" width="104" height="40" rx="12" fill={`url(#accent_${t.id})`} />
        <rect x="8" y="40" width="104" height="12" fill={`url(#accent_${t.id})`} />
        {/* 흰색 원 안의 느낌표 아이콘 */}
        <circle cx="60" cy="28" r="12" fill="white" />
        <text x="60" y="34" textAnchor="middle" fontSize="14" fontWeight="900" fill={c}>!</text>
        <text x="60" y="58" textAnchor="middle" fontSize="6" fontWeight="800" fill={c}>{nd.title}</text>
        <text x="60" y="66" textAnchor="middle" fontSize="3.2" fontWeight="600" fill="#94a3b8">{name}</text>
        {noticeBody(60, 78, bodyLines, c)}
        {/* 큰 확인 버튼 */}
        <rect x="16" y="114" width="88" height="28" rx="14" fill={`url(#accent_${t.id})`} />
        <text x="60" y="132" textAnchor="middle" fontSize="7" fontWeight="800" fill="white">{nd.cta}</text>
      </>}
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

    // ══════════════════════════════════════════════════════════════
    // 설날 장식 — 대형 복주머니 + 금색 전통 문양 + 구름
    // ══════════════════════════════════════════════════════════════
    const seolDeco = isSeol ? <>
      <rect x="0" y="0" width="120" height="160" rx="6" fill="#fef2f2" fillOpacity="0.3" />
      {/* 좌상 복주머니 */}
      <path d="M10,18 Q10,10 20,10 L28,10 Q38,10 38,18 L38,30 Q38,42 24,44 Q10,42 10,30 Z" fill="#dc2626" fillOpacity="0.6" />
      <path d="M14,10 Q24,4 34,10" fill="none" stroke="#fbbf24" strokeWidth="1.8" />
      <path d="M18,8 Q24,2 30,8" fill="none" stroke="#fbbf24" strokeWidth="1" />
      <text x="24" y="30" textAnchor="middle" fontSize="8" fontWeight="900" fill="#fbbf24" fillOpacity="0.85">福</text>
      <line x1="24" y1="44" x2="24" y2="56" stroke="#dc2626" strokeWidth="1.2" strokeOpacity="0.5" />
      <circle cx="24" cy="58" r="2" fill="#fbbf24" fillOpacity="0.6" />
      {/* 우상 매듭 */}
      <g transform="translate(98,14)">
        <circle cx="0" cy="0" r="5" fill="#dc2626" fillOpacity="0.55" />
        <path d="M-8,0 Q-4,-6 0,0 Q4,-6 8,0" fill="#dc2626" fillOpacity="0.4" />
        <path d="M-8,0 Q-4,6 0,0 Q4,6 8,0" fill="#dc2626" fillOpacity="0.35" />
        <line x1="0" y1="5" x2="0" y2="22" stroke="#dc2626" strokeWidth="1" strokeOpacity="0.4" />
        <circle cx="-2" cy="18" r="1.5" fill="#fbbf24" fillOpacity="0.5" />
        <circle cx="2" cy="22" r="1.5" fill="#fbbf24" fillOpacity="0.4" />
      </g>
      {/* 하단 구름 문양 */}
      <path d="M0,134 Q12,126 24,134 Q32,126 40,134 Q48,126 56,134" fill="#dc2626" fillOpacity="0.12" />
      <path d="M64,138 Q76,130 88,138 Q96,130 104,138 Q112,130 120,138" fill="#dc2626" fillOpacity="0.1" />
      {/* 금색 동전 */}
      <circle cx="104" cy="128" r="5" fill="#fbbf24" fillOpacity="0.4" stroke="#d97706" strokeWidth="0.8" strokeOpacity="0.5" />
      <rect x="101.5" y="126.5" width="5" height="3" rx="1.5" fill="#d97706" fillOpacity="0.3" />
      <circle cx="14" cy="128" r="4" fill="#fbbf24" fillOpacity="0.3" stroke="#d97706" strokeWidth="0.6" strokeOpacity="0.4" />
    </> : null;

    // ══════════════════════════════════════════════════════════════
    // 추석 장식 — 거대 보름달 + 억새 + 코스모스
    // ══════════════════════════════════════════════════════════════
    const chskDeco = isChsk ? <>
      <rect x="0" y="0" width="120" height="160" rx="6" fill="#fffbeb" fillOpacity="0.35" />
      {/* 거대 보름달 */}
      <circle cx="60" cy="24" r="28" fill="#fbbf24" fillOpacity="0.35" />
      <circle cx="60" cy="24" r="22" fill="#fbbf24" fillOpacity="0.25" />
      <circle cx="60" cy="24" r="16" fill="#fde68a" fillOpacity="0.2" />
      <circle cx="52" cy="18" r="3.5" fill="#f59e0b" fillOpacity="0.1" />
      <circle cx="68" cy="26" r="2.5" fill="#f59e0b" fillOpacity="0.08" />
      {/* 좌측 억새 */}
      <path d="M4,150 Q6,110 10,70" fill="none" stroke="#a16207" strokeWidth="1.5" strokeOpacity="0.5" />
      <path d="M8,150 Q10,115 16,80" fill="none" stroke="#a16207" strokeWidth="1.2" strokeOpacity="0.4" />
      <path d="M2,150 Q4,120 6,85" fill="none" stroke="#a16207" strokeWidth="1" strokeOpacity="0.35" />
      {[70,78,86,94,102].map((y, i) => <ellipse key={`l${i}`} cx={9 + (i % 2)} cy={y} rx="5" ry="2.5" fill="#d97706" fillOpacity={0.45 - i * 0.05} transform={`rotate(${-15 - i * 3} ${9} ${y})`} />)}
      {[80,90,100].map((y, i) => <ellipse key={`l2${i}`} cx={14 + i} cy={y} rx="4" ry="2" fill="#d97706" fillOpacity={0.35 - i * 0.05} transform={`rotate(${-10 - i * 4} ${14} ${y})`} />)}
      {/* 우측 코스모스 */}
      <g transform="translate(108,75)">
        {[0,72,144,216,288].map((deg, i) => <ellipse key={`p${i}`} cx={Math.cos(deg * Math.PI / 180) * 5} cy={Math.sin(deg * Math.PI / 180) * 5} rx="3" ry="1.5" fill="#f9a8d4" fillOpacity="0.5" transform={`rotate(${deg} ${Math.cos(deg * Math.PI / 180) * 5} ${Math.sin(deg * Math.PI / 180) * 5})`} />)}
        <circle cx="0" cy="0" r="2" fill="#fbbf24" fillOpacity="0.6" />
      </g>
      <g transform="translate(100,90) scale(0.7)">
        {[0,72,144,216,288].map((deg, i) => <ellipse key={`p2${i}`} cx={Math.cos(deg * Math.PI / 180) * 5} cy={Math.sin(deg * Math.PI / 180) * 5} rx="3" ry="1.5" fill="#ec4899" fillOpacity="0.4" transform={`rotate(${deg} ${Math.cos(deg * Math.PI / 180) * 5} ${Math.sin(deg * Math.PI / 180) * 5})`} />)}
        <circle cx="0" cy="0" r="1.5" fill="#fbbf24" fillOpacity="0.5" />
      </g>
      <path d="M10,148 Q30,140 50,148 Q70,140 90,148 Q110,140 120,148" fill="#ea580c" fillOpacity="0.15" />
    </> : null;

    // ══════════════════════════════════════════════════════════════
    // 새해 장식 — 대형 불꽃놀이 + 글리터 + 컨페티
    // ══════════════════════════════════════════════════════════════
    const newyDeco = isNewy ? <>
      <rect x="0" y="0" width="120" height="160" rx="6" fill="#0f172a" fillOpacity="0.15" />
      <text x="60" y="34" textAnchor="middle" fontSize="22" fontWeight="900" fill={c} fillOpacity="0.06">2026</text>
      {/* 좌측 불꽃 — 대형, 다색 */}
      {[0,45,90,135,180,225,270,315].map((deg, i) => (
        <line key={`fl${i}`} x1="26" y1="24" x2={26 + Math.cos(deg * Math.PI / 180) * 14} y2={24 + Math.sin(deg * Math.PI / 180) * 14} stroke={['#fbbf24','#ef4444','#fbbf24','#ec4899','#fbbf24','#ef4444','#fbbf24','#ec4899'][i]} strokeWidth="1.5" strokeOpacity="0.6" />
      ))}
      {[22.5,67.5,112.5,157.5,202.5,247.5,292.5,337.5].map((deg, i) => (
        <circle key={`fd${i}`} cx={26 + Math.cos(deg * Math.PI / 180) * 12} cy={24 + Math.sin(deg * Math.PI / 180) * 12} r="1.2" fill={['#fbbf24','#ef4444','#60a5fa','#ec4899','#fbbf24','#34d399','#a78bfa','#ef4444'][i]} fillOpacity="0.65" />
      ))}
      <circle cx="26" cy="24" r="4" fill="#fbbf24" fillOpacity="0.5" />
      <circle cx="26" cy="24" r="2" fill="white" fillOpacity="0.4" />
      {/* 우측 불꽃 */}
      {[0,40,80,120,160,200,240,280,320].map((deg, i) => (
        <line key={`fr${i}`} x1="94" y1="18" x2={94 + Math.cos(deg * Math.PI / 180) * 11} y2={18 + Math.sin(deg * Math.PI / 180) * 11} stroke={i % 2 === 0 ? '#a78bfa' : '#c084fc'} strokeWidth="1.2" strokeOpacity="0.55" />
      ))}
      <circle cx="94" cy="18" r="3" fill="#a78bfa" fillOpacity="0.5" />
      <circle cx="94" cy="18" r="1.5" fill="white" fillOpacity="0.35" />
      {/* 별 — 크고 밝게 */}
      <text x="50" y="12" fontSize="6" fill="#fbbf24" fillOpacity="0.7">✦</text>
      <text x="76" y="42" fontSize="5" fill="#ec4899" fillOpacity="0.6">✦</text>
      <text x="10" y="50" fontSize="5" fill="#60a5fa" fillOpacity="0.5">✧</text>
      <text x="110" y="55" fontSize="4" fill="#34d399" fillOpacity="0.5">★</text>
      <text x="14" y="140" fontSize="4" fill="#a78bfa" fillOpacity="0.4">✦</text>
      <text x="106" y="135" fontSize="3.5" fill="#fbbf24" fillOpacity="0.4">✧</text>
      {/* 컨페티 */}
      <rect x="36" y="6" width="4" height="7" rx="2" fill="#ec4899" fillOpacity="0.5" transform="rotate(25 38 9)" />
      <rect x="84" y="34" width="3.5" height="6" rx="1.5" fill="#fbbf24" fillOpacity="0.45" transform="rotate(-18 85 37)" />
      <rect x="8" y="60" width="3" height="5" rx="1.5" fill="#60a5fa" fillOpacity="0.4" transform="rotate(35 9 62)" />
      <rect x="106" y="48" width="3" height="5" rx="1.5" fill="#34d399" fillOpacity="0.35" transform="rotate(-30 107 50)" />
      <rect x="62" y="4" width="3" height="5" rx="1.5" fill="#a78bfa" fillOpacity="0.4" transform="rotate(15 63 6)" />
    </> : null;

    // ══════════════════════════════════════════════════════════════
    // 어버이날 장식 — 대형 카네이션 꽃다발 + 줄기/잎
    // ══════════════════════════════════════════════════════════════
    const parentDeco = isParent ? <>
      <rect x="0" y="0" width="120" height="160" rx="6" fill="#fdf2f8" fillOpacity="0.3" />
      {/* 좌상 대형 카네이션 */}
      <g transform="translate(22,24)">
        <circle cx="-5" cy="2" r="5" fill="#e11d48" fillOpacity="0.55" />
        <circle cx="5" cy="2" r="5" fill="#e11d48" fillOpacity="0.5" />
        <circle cx="-3" cy="-4" r="5" fill="#f43f5e" fillOpacity="0.5" />
        <circle cx="3" cy="-4" r="5" fill="#f43f5e" fillOpacity="0.45" />
        <circle cx="0" cy="0" r="4.5" fill="#fb7185" fillOpacity="0.55" />
        <circle cx="-2" cy="-2" r="3.5" fill="#fb7185" fillOpacity="0.5" />
        <circle cx="2" cy="-1" r="3" fill="#fda4af" fillOpacity="0.45" />
        <circle cx="0" cy="-5" r="3" fill="#e11d48" fillOpacity="0.4" />
        <path d="M-4,4 Q0,2 4,4" fill="none" stroke="#be123c" strokeWidth="0.4" strokeOpacity="0.3" />
        <path d="M0,7 Q-1,18 0,32" fill="none" stroke="#16a34a" strokeWidth="1.5" strokeOpacity="0.5" />
        <ellipse cx="-6" cy="16" rx="5" ry="2.5" fill="#22c55e" fillOpacity="0.35" transform="rotate(-35 -6 16)" />
        <ellipse cx="6" cy="22" rx="5" ry="2.5" fill="#22c55e" fillOpacity="0.3" transform="rotate(30 6 22)" />
      </g>
      {/* 우상 카네이션 */}
      <g transform="translate(100,20) scale(0.8)">
        <circle cx="-4" cy="1" r="4" fill="#e11d48" fillOpacity="0.5" />
        <circle cx="4" cy="1" r="4" fill="#e11d48" fillOpacity="0.45" />
        <circle cx="0" cy="-3" r="4" fill="#f43f5e" fillOpacity="0.45" />
        <circle cx="0" cy="0" r="3.5" fill="#fb7185" fillOpacity="0.5" />
        <path d="M0,5 Q0,14 1,24" fill="none" stroke="#16a34a" strokeWidth="1.2" strokeOpacity="0.4" />
        <ellipse cx="-4" cy="12" rx="4" ry="2" fill="#22c55e" fillOpacity="0.3" transform="rotate(-25 -4 12)" />
      </g>
      {/* 좌하 카네이션 */}
      <g transform="translate(16,118) scale(0.65)">
        <circle cx="-3" cy="1" r="4" fill="#e11d48" fillOpacity="0.45" />
        <circle cx="3" cy="1" r="4" fill="#e11d48" fillOpacity="0.4" />
        <circle cx="0" cy="-3" r="3.5" fill="#f43f5e" fillOpacity="0.4" />
        <circle cx="0" cy="0" r="3" fill="#fb7185" fillOpacity="0.45" />
        <path d="M0,5 Q0,12 0,20" fill="none" stroke="#16a34a" strokeWidth="1" strokeOpacity="0.35" />
        <ellipse cx="4" cy="12" rx="3.5" ry="1.8" fill="#22c55e" fillOpacity="0.25" transform="rotate(20 4 12)" />
      </g>
      {/* 우하 봉오리 */}
      <g transform="translate(106,126) scale(0.5)">
        <circle cx="0" cy="0" r="4" fill="#e11d48" fillOpacity="0.4" />
        <circle cx="0" cy="-2" r="3" fill="#fb7185" fillOpacity="0.35" />
        <path d="M0,4 Q0,10 0,16" fill="none" stroke="#16a34a" strokeWidth="0.8" strokeOpacity="0.3" />
      </g>
      {/* 리본 */}
      <path d="M44,6 Q52,2 60,6 Q68,2 76,6" fill="#e11d48" fillOpacity="0.2" />
      <path d="M44,6 Q52,2 60,6 Q68,2 76,6" fill="none" stroke="#e11d48" strokeWidth="1.2" strokeOpacity="0.4" />
      <circle cx="60" cy="4" r="2" fill="#e11d48" fillOpacity="0.35" />
    </> : null;

    // ══════════════════════════════════════════════════════════════
    // 크리스마스 장식 — 대형 트리 + 가랜드 + 오너먼트 + 눈 + 선물
    // ══════════════════════════════════════════════════════════════
    const xmasDeco = isXmas ? <>
      <rect x="0" y="0" width="120" height="160" rx="6" fill="#0f172a" fillOpacity="0.08" />
      {/* 트리 3단 */}
      <polygon points="60,4 44,26 76,26" fill="#22c55e" fillOpacity="0.5" />
      <polygon points="60,14 38,38 82,38" fill="#16a34a" fillOpacity="0.45" />
      <polygon points="60,26 34,50 86,50" fill="#15803d" fillOpacity="0.4" />
      {/* 가랜드 */}
      <path d="M50,20 Q60,16 70,20" fill="none" stroke="#fbbf24" strokeWidth="0.8" strokeOpacity="0.5" />
      <path d="M44,32 Q60,26 76,32" fill="none" stroke="#fbbf24" strokeWidth="0.7" strokeOpacity="0.45" />
      <path d="M40,44 Q60,36 80,44" fill="none" stroke="#fbbf24" strokeWidth="0.6" strokeOpacity="0.4" />
      {/* 트렁크 */}
      <rect x="55" y="50" width="10" height="7" rx="2" fill="#92400e" fillOpacity="0.4" />
      {/* 별 토퍼 */}
      <text x="60" y="9" textAnchor="middle" fontSize="8" fill="#fbbf24" fillOpacity="0.8">★</text>
      {/* 오너먼트 */}
      <circle cx="52" cy="22" r="3" fill="#ef4444" fillOpacity="0.6" />
      <circle cx="68" cy="22" r="2.5" fill="#fbbf24" fillOpacity="0.55" />
      <circle cx="44" cy="34" r="2.5" fill="#3b82f6" fillOpacity="0.55" />
      <circle cx="76" cy="34" r="3" fill="#ef4444" fillOpacity="0.5" />
      <circle cx="54" cy="44" r="2.5" fill="#fbbf24" fillOpacity="0.45" />
      <circle cx="66" cy="42" r="2.5" fill="#22c55e" fillOpacity="0.35" />
      <circle cx="40" cy="46" r="2" fill="#a78bfa" fillOpacity="0.4" />
      <circle cx="80" cy="46" r="2" fill="#ec4899" fillOpacity="0.4" />
      {/* 눈 */}
      <circle cx="12" cy="14" r="2.5" fill="white" fillOpacity="0.65" />
      <circle cx="104" cy="10" r="2" fill="white" fillOpacity="0.6" />
      <circle cx="28" cy="6" r="1.8" fill="white" fillOpacity="0.55" />
      <circle cx="92" cy="28" r="1.8" fill="white" fillOpacity="0.5" />
      <circle cx="6" cy="36" r="1.5" fill="white" fillOpacity="0.45" />
      <circle cx="114" cy="40" r="1.8" fill="white" fillOpacity="0.4" />
      <circle cx="16" cy="52" r="1.2" fill="white" fillOpacity="0.35" />
      <circle cx="8" cy="68" r="1" fill="white" fillOpacity="0.3" />
      <circle cx="112" cy="62" r="1.3" fill="white" fillOpacity="0.3" />
      {/* 선물 */}
      <g transform="translate(8,138)">
        <rect x="0" y="0" width="12" height="11" rx="2.5" fill="#ef4444" fillOpacity="0.35" />
        <rect x="0" y="0" width="12" height="3" rx="1.5" fill="#ef4444" fillOpacity="0.25" />
        <line x1="6" y1="0" x2="6" y2="11" stroke="#fbbf24" strokeWidth="0.8" strokeOpacity="0.4" />
      </g>
      <g transform="translate(100,136)">
        <rect x="0" y="0" width="11" height="10" rx="2.5" fill="#22c55e" fillOpacity="0.3" />
        <line x1="5.5" y1="0" x2="5.5" y2="10" stroke="#ef4444" strokeWidth="0.7" strokeOpacity="0.35" />
      </g>
    </> : null;

    return wrap(<>
      {seolDeco}{chskDeco}{newyDeco}{parentDeco}{xmasDeco}
      {hint === 'traditional' ? <>
        {/* ━━ 전통 프레임 ━━ */}
        <rect x="6" y="4" width="108" height="152" rx="4" fill={isDark ? '#0f172a' : '#fef9f0'} fillOpacity={isDark ? 0.75 : 0.8} stroke={c} strokeOpacity="0.45" strokeWidth="1.8" />
        <rect x="12" y="10" width="96" height="140" rx="3" fill="none" stroke={c} strokeOpacity="0.2" strokeWidth="0.6" strokeDasharray="3 2" />
        <path d="M14,14 L36,14 L36,17.5 L17.5,17.5 L17.5,36 L14,36 Z" fill={c} fillOpacity="0.45" />
        <path d="M84,14 L106,14 L106,36 L102.5,36 L102.5,17.5 L84,17.5 Z" fill={c} fillOpacity="0.45" />
        <path d="M14,124 L14,146 L36,146 L36,142.5 L17.5,142.5 L17.5,124 Z" fill={c} fillOpacity="0.3" />
        <path d="M106,124 L106,146 L84,146 L84,142.5 L102.5,142.5 L102.5,124 Z" fill={c} fillOpacity="0.3" />
        <text x="60" y="46" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={isDark ? '#fbbf24' : a}>{name}</text>
        <text x="60" y="66" textAnchor="middle" fontSize="11" fontWeight="900" fill={isDark ? '#fbbf24' : c}>{line1}</text>
        <text x="60" y="82" textAnchor="middle" fontSize="10" fontWeight="900" fill={isDark ? '#fbbf24' : c}>{line2}</text>
        <line x1="28" y1="90" x2="92" y2="90" stroke={c} strokeOpacity="0.3" strokeWidth="0.8" />
        <text x="60" y="102" textAnchor="middle" fontSize="3.5" fill={isDark ? '#94a3b8' : a}>{subLine}</text>
        {closureBadge(110, isDark ? '#94a3b8' : '#64748b')}
        <text x="60" y="140" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={isDark ? '#d4a017' : a}>{name}</text>
      </> : hint === 'luxury' ? <>
        {/* ━━ 럭셔리 — 봉투/편지 디자인 ━━ */}
        <rect x="4" y="3" width="112" height="154" rx="6" fill="#0f172a" />
        {/* 봉투 V자 뚜껑 */}
        <path d="M10,9 L60,42 L110,9" fill="none" stroke="#d4a853" strokeWidth="1" />
        {/* 수평 접힌 선 */}
        <line x1="10" y1="52" x2="110" y2="52" stroke="#d4a853" strokeOpacity="0.2" strokeWidth="0.5" />
        {/* 편지 내용 */}
        <text x="60" y="72" textAnchor="middle" fontSize="11" fontWeight="900" fill="#d4a017">{line1}</text>
        <text x="60" y="90" textAnchor="middle" fontSize="10" fontWeight="900" fill="#d4a017">{line2}</text>
        <line x1="30" y1="98" x2="90" y2="98" stroke="#d4a017" strokeOpacity="0.3" strokeWidth="0.5" />
        <text x="60" y="112" textAnchor="middle" fontSize="3.5" fill="#b8860b">{subLine}</text>
        {closureText && <><rect x="22" y="118" width="76" height="14" rx="5" fill="#d4a017" fillOpacity="0.08" /><text x="60" y="127" textAnchor="middle" fontSize="3" fill="#a08030">{closureText}</text></>}
        {/* 밀랍 인장 */}
        <circle cx="60" cy="146" r="8" fill="#d4a853" fillOpacity="0.6" />
        <circle cx="60" cy="146" r="5" fill="#d4a017" fillOpacity="0.4" />
        <text x="60" y="149" textAnchor="middle" fontSize="4" fontWeight="900" fill="white" fillOpacity="0.8">封</text>
      </> : hint === 'cute' ? <>
        {/* ━━ 귀여운 — 풍선+별+둥근 카드 ━━ */}
        {/* 풍선 3개 — 좌상단 */}
        <ellipse cx="18" cy="30" rx="8" ry="10" fill={c} fillOpacity="0.35" />
        <line x1="18" y1="40" x2="16" y2="56" stroke={c} strokeWidth="0.6" strokeOpacity="0.3" />
        <ellipse cx="32" cy="24" rx="7" ry="9" fill={a} fillOpacity="0.25" />
        <line x1="32" y1="33" x2="30" y2="50" stroke={a} strokeWidth="0.5" strokeOpacity="0.25" />
        <ellipse cx="24" cy="18" rx="6" ry="8" fill={c} fillOpacity="0.2" />
        <line x1="24" y1="26" x2="23" y2="44" stroke={c} strokeWidth="0.5" strokeOpacity="0.2" />
        {/* 별 장식 — 우상단 */}
        <text x="92" y="18" fontSize="7" fill={c} fillOpacity="0.5">✦</text>
        <text x="104" y="30" fontSize="5" fill={a} fillOpacity="0.4">★</text>
        <text x="84" y="10" fontSize="4" fill={c} fillOpacity="0.35">✧</text>
        {/* 하단 장식 */}
        <text x="14" y="140" fontSize="5" fill={c} fillOpacity="0.3">♡</text>
        <text x="100" y="136" fontSize="4" fill={a} fillOpacity="0.25">✧</text>
        {/* 둥근 카드 */}
        <rect x="14" y="44" width="92" height="76" rx="16" fill="white" fillOpacity="0.85" filter={`url(#shadow_${t.id})`} />
        <text x="60" y="16" textAnchor="middle" fontSize="3.5" fontWeight="700" fill={c}>{name}</text>
        <text x="60" y="72" textAnchor="middle" fontSize="11" fontWeight="900" fill={c}>{line1}</text>
        <text x="60" y="90" textAnchor="middle" fontSize="10" fontWeight="900" fill={c}>{line2}</text>
        <text x="60" y="110" textAnchor="middle" fontSize="3.5" fill={a}>{subLine}</text>
        {closureBadge(126)}
        <text x="60" y="152" textAnchor="middle" fontSize="3" fill="#94a3b8">{name}</text>
      </> : hint === 'nature' ? <>
        {/* ━━ 자연/풍경 ━━ */}
        <rect x="4" y="4" width="112" height="62" rx="6" fill={isDark ? '#1e3a5f' : c} fillOpacity={isDark ? 0.4 : 0.12} />
        <circle cx="88" cy="22" r="14" fill="#fbbf24" fillOpacity="0.3" />
        <circle cx="88" cy="22" r="10" fill="#fbbf24" fillOpacity="0.25" />
        <circle cx="88" cy="22" r="6" fill="#fde68a" fillOpacity="0.2" />
        <ellipse cx="32" cy="18" rx="16" ry="6" fill="white" fillOpacity="0.25" />
        <ellipse cx="22" cy="16" rx="12" ry="5" fill="white" fillOpacity="0.2" />
        <path d="M0,106 Q15,76 35,90 Q50,64 65,82 Q80,58 95,76 Q110,66 120,84 L120,160 L0,160 Z" fill={c} fillOpacity="0.2" />
        <path d="M0,116 Q20,90 40,102 Q55,78 70,96 Q85,72 100,90 Q115,80 120,96 L120,160 L0,160 Z" fill={c} fillOpacity="0.14" />
        <path d="M13,116 L18,100 L23,116 Z" fill={c} fillOpacity="0.28" />
        <rect x="16.5" y="116" width="3" height="6" fill={c} fillOpacity="0.2" />
        <path d="M93,110 L99,92 L105,110 Z" fill={c} fillOpacity="0.22" />
        <rect x="97" y="110" width="3" height="6" fill={c} fillOpacity="0.16" />
        <text x="60" y="14" textAnchor="middle" fontSize="3.2" fontWeight="600" fill={isDark ? 'rgba(255,255,255,0.7)' : a}>{name}</text>
        <text x="60" y="38" textAnchor="middle" fontSize="10" fontWeight="900" fill={isDark ? '#ffffff' : c}>{line1}</text>
        <text x="60" y="54" textAnchor="middle" fontSize="9" fontWeight="900" fill={isDark ? '#ffffff' : c}>{line2}</text>
        <text x="60" y="78" textAnchor="middle" fontSize="3.5" fill={isDark ? 'rgba(255,255,255,0.6)' : a}>{subLine}</text>
        {closureText && <><rect x="22" y="84" width="76" height="14" rx="7" fill="white" fillOpacity="0.6" /><text x="60" y="93" textAnchor="middle" fontSize="3.2" fill="#64748b">{closureText}</text></>}
        <text x="60" y="152" textAnchor="middle" fontSize="3.2" fill={isDark ? 'rgba(255,255,255,0.45)' : '#94a3b8'}>{name}</text>
      </> : hint === 'minimal' ? <>
        {/* ━━ 미니멀 — 중앙 정렬, 액센트 도트 ━━ */}
        <text x="60" y="30" textAnchor="middle" fontSize="3" fontWeight="500" fill={isDark ? 'rgba(255,255,255,0.5)' : '#94a3b8'} letterSpacing="1">{name}</text>
        <text x="60" y="62" textAnchor="middle" fontSize="15" fontWeight="900" fill={isDark ? '#ffffff' : c}>{line1}</text>
        <text x="60" y="84" textAnchor="middle" fontSize="13" fontWeight="900" fill={isDark ? '#ffffff' : c}>{line2}</text>
        <text x="60" y="106" textAnchor="middle" fontSize="3.5" fill={isDark ? 'rgba(255,255,255,0.55)' : a} letterSpacing="1">{subLine}</text>
        {closureText && <><rect x="22" y="114" width="76" height="13" rx="6.5" fill={c} fillOpacity="0.08" /><text x="60" y="123" textAnchor="middle" fontSize="3" fill={isDark ? '#94a3b8' : '#64748b'}>{closureText}</text></>}
        {/* 액센트 도트 */}
        <circle cx="60" cy="138" r="3" fill={c} fillOpacity="0.3" />
        <text x="60" y="152" textAnchor="middle" fontSize="3" fill={isDark ? 'rgba(255,255,255,0.4)' : '#94a3b8'}>{name}</text>
      </> : <>
        {/* ━━ warm — 리본 프레임 + 중앙 워터마크 ━━ */}
        {/* 상단 리본 — 풀폭 곡선 */}
        <path d="M0,16 Q30,6 60,16 Q90,26 120,16 L120,0 L0,0 Z" fill={c} fillOpacity={isDark ? 0.15 : 0.2} />
        <path d="M0,20 Q30,10 60,20 Q90,30 120,20" fill="none" stroke={c} strokeWidth="0.8" strokeOpacity="0.3" />
        {/* 하단 리본 — 대칭 */}
        <path d="M0,144 Q30,154 60,144 Q90,134 120,144 L120,160 L0,160 Z" fill={c} fillOpacity={isDark ? 0.12 : 0.18} />
        <path d="M0,140 Q30,150 60,140 Q90,130 120,140" fill="none" stroke={c} strokeWidth="0.8" strokeOpacity="0.25" />
        {/* 중앙 대형 워터마크 원 */}
        <circle cx="60" cy="80" r="40" fill={c} fillOpacity={isDark ? 0.03 : 0.05} />
        <circle cx="60" cy="80" r="28" fill={c} fillOpacity={isDark ? 0.03 : 0.04} />
        <text x="60" y="28" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={isDark ? 'rgba(255,255,255,0.6)' : a}>{name}</text>
        <text x="60" y="56" textAnchor="middle" fontSize="11" fontWeight="900" fill={isDark ? '#ffffff' : c}>{line1}</text>
        <text x="60" y="74" textAnchor="middle" fontSize="10" fontWeight="900" fill={isDark ? '#ffffff' : c}>{line2}</text>
        {/* 양쪽 장식 라인 */}
        <line x1="16" y1="84" x2="44" y2="84" stroke={c} strokeOpacity="0.25" strokeWidth="0.6" />
        <circle cx="60" cy="84" r="1.5" fill={c} fillOpacity="0.3" />
        <line x1="76" y1="84" x2="104" y2="84" stroke={c} strokeOpacity="0.25" strokeWidth="0.6" />
        <text x="60" y="100" textAnchor="middle" fontSize="3.5" fill={isDark ? 'rgba(255,255,255,0.55)' : a}>{subLine}</text>
        {closureBadge(112, isDark ? '#94a3b8' : '#64748b')}
        <text x="60" y="148" textAnchor="middle" fontSize="3.2" fill={isDark ? 'rgba(255,255,255,0.4)' : '#94a3b8'}>{name}</text>
      </>}
    </>);
  }

  if (category === 'hiring') {
    const h = t.layoutHint;
    // 공통 헬퍼: 채용 CTA 버튼
    const hireCta = (y: number, label = '지원하기') => (<>
      <rect x="14" y={y} width="92" height="18" rx="9" fill={`url(#accent_${t.id})`} />
      <text x="60" y={y + 11.5} textAnchor="middle" fontSize="4.5" fontWeight="700" fill="white">{label}</text>
    </>);
    const hiringData: Record<string, { position: string; type: string; benefits: string[] }> = {
      corporate: { position: '간호사', type: '정규직 / 경력 우대', benefits: ['4대보험 완비','주5일 근무','중식 제공','채용시까지 상시 모집'] },
      team:      { position: '물리치료사', type: '정규직 / 신입 가능', benefits: ['4대보험 완비','워크숍 지원','중식 제공','채용시까지 상시 모집'] },
      modern:    { position: '방사선사', type: '정규직 / 경력 3년↑', benefits: ['4대보험 완비','장비 교육 지원','인센티브','채용시까지 상시 모집'] },
      benefits:  { position: '접수/코디네이터', type: '정규직 / 신입 환영', benefits: ['4대보험 완비','연차 보장','중식 제공','인센티브'] },
      urgent:    { position: '치과위생사', type: '정규직 / 경력 우대', benefits: ['4대보험 완비','중식 제공 / 인센티브','채용시까지 상시 모집','급여 협의'] },
      brand:     { position: '전문의', type: '정규직 / 전문의 면허', benefits: ['경쟁력 있는 급여','학회 지원','인센티브','채용시까지 상시 모집'] },
    };
    const hd = hiringData[h] || hiringData.corporate;
    if (h === 'urgent') {
      // 긴급채용 — 전체 카드 프라이머리 배경, 대담한 화이트 텍스트
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill={c} />
        {/* 장식 반투명 원 */}
        <circle cx="10" cy="10" r="18" fill="white" fillOpacity="0.3" />
        <circle cx="110" cy="150" r="22" fill="white" fillOpacity="0.3" />
        <circle cx="105" cy="40" r="10" fill="white" fillOpacity="0.3" />
        <text x="60" y="42" textAnchor="middle" fontSize="14" fontWeight="900" fill="white">긴급 채용</text>
        <text x="60" y="58" textAnchor="middle" fontSize="5" fontWeight="700" fill="white" fillOpacity="0.85">{hd.position}</text>
        <rect x="30" y="64" width="60" height="0.8" rx="0.4" fill="white" fillOpacity="0.4" />
        {[hd.type, ...hd.benefits].map((txt, i) => (
          <g key={i}>
            <circle cx="22" cy={78 + i * 13} r="2" fill="white" fillOpacity="0.7" />
            <text x="28" y={80 + i * 13} fontSize="3.5" fontWeight="600" fill="white" fillOpacity="0.9">{txt}</text>
          </g>
        ))}
        {/* 반전 CTA — 흰색 버튼 */}
        <rect x="14" y="132" width="92" height="18" rx="9" fill="white" />
        <text x="60" y="143.5" textAnchor="middle" fontSize="4.5" fontWeight="700" fill={c}>지금 바로 지원</text>
        <text x="60" y="156" textAnchor="middle" fontSize="3" fontWeight="500" fill="white" fillOpacity="0.6">{name}</text>
      </>);
    }
    if (h === 'corporate') {
      // 기업형 — 신문 칼럼/마스트헤드 스타일
      return wrap(<>
        <rect x="0" y="0" width="120" height="56" rx="6" fill="#1e293b" />
        <rect x="0" y="50" width="120" height="6" fill="#1e293b" />
        {/* 마스트헤드 — 상단 작은 "est" 텍스트 */}
        <text x="104" y="14" textAnchor="end" fontSize="2.5" fontWeight="500" fill="white" fillOpacity="0.4">est. 2026</text>
        <text x="60" y="20" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="white" fillOpacity="0.5" letterSpacing="1.5">{name}</text>
        <text x="60" y="42" textAnchor="middle" fontSize="10" fontWeight="900" fill="white">{hd.position} 모집</text>
        {/* 마스트헤드 룰 라인 */}
        <line x1="8" y1="50" x2="112" y2="50" stroke="white" strokeWidth="0.4" strokeOpacity="0.3" />
        {/* 신문 칼럼 구분선 */}
        <line x1="60" y1="62" x2="60" y2="122" stroke="#e2e8f0" strokeWidth="0.4" />
        {[hd.type, ...hd.benefits].map((txt, i) => (
          <g key={i}>
            <rect x="0" y={60 + i * 16} width="120" height="16" fill={i % 2 === 0 ? '#f8fafc' : 'white'} />
            <text x="18" y={71 + i * 16} fontSize="3.8" fontWeight="600" fill="#334155">{txt}</text>
          </g>
        ))}
        <rect x="14" y={130} width="92" height="18" rx="9" fill={c} />
        <text x="60" y={141.5} textAnchor="middle" fontSize="4.5" fontWeight="700" fill="white">지원하기</text>
        <text x="60" y="155" textAnchor="middle" fontSize="3" fontWeight="500" fill="#94a3b8">{name}</text>
      </>);
    }
    if (h === 'team') {
      // 팀 친근형 — 겹치는 세 원 + 따뜻한 분위기
      return wrap(<>
        {/* 팀원을 상징하는 겹치는 원 */}
        <circle cx="42" cy="32" r="18" fill={c} fillOpacity="0.3" />
        <circle cx="60" cy="28" r="18" fill={c} fillOpacity="0.45" />
        <circle cx="78" cy="32" r="18" fill={c} fillOpacity="0.6" />
        <text x="60" y="62" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>함께할 팀원을</text>
        <text x="60" y="74" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>찾습니다</text>
        {/* 솔리드 불릿 목록 */}
        {[`${hd.position} ${hd.type.split(' / ')[0]}`, hd.type.split(' / ')[1] || '', ...hd.benefits.slice(0, 2)].map((txt, i) => (
          <g key={i}>
            <circle cx="20" cy={90 + i * 12} r="3" fill={c} />
            <text x="27" y={92 + i * 12} fontSize="3.5" fontWeight="600" fill="#334155">{txt}</text>
          </g>
        ))}
        {hireCta(140)}
        <text x="60" y="157" textAnchor="middle" fontSize="2.8" fontWeight="500" fill="#94a3b8">{name}</text>
      </>);
    }
    if (h === 'modern') {
      // 모던 다크 — 아이소메트릭/3D 블록 레터 (좌측 바 제거)
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#0f172a" />
        {/* 3D 블록 효과 — 그림자 오프셋 텍스트 */}
        <text x="61.5" y="25.5" textAnchor="middle" fontSize="10" fontWeight="900" fill={a} fillOpacity="0.4" letterSpacing="3">WE ARE</text>
        <text x="60" y="24" textAnchor="middle" fontSize="10" fontWeight="900" fill="white" letterSpacing="3">WE ARE</text>
        <text x="61.5" y="41.5" textAnchor="middle" fontSize="10" fontWeight="900" fill={a} fillOpacity="0.4" letterSpacing="3">HIRING</text>
        <text x="60" y="40" textAnchor="middle" fontSize="10" fontWeight="900" fill="white" letterSpacing="3">HIRING</text>
        <rect x="30" y="46" width="60" height="1" rx="0.5" fill={a} />
        {/* 평행사변형 장식 블록 */}
        {[`${hd.position} ${hd.type.split(' / ')[0]}`, ...hd.benefits.slice(0, 3)].map((txt, i) => (
          <g key={i}>
            <path d={`M18,${58 + i * 16} L104,${58 + i * 16} L102,${70 + i * 16} L16,${70 + i * 16} Z`} fill={a} fillOpacity="0.25" />
            <text x="22" y={67 + i * 16} fontSize="3.5" fontWeight="600" fill="white">{txt}</text>
          </g>
        ))}
        {hireCta(126)}
        <text x="60" y="148" textAnchor="middle" fontSize="3" fontWeight="500" fill="#64748b">{name}</text>
      </>);
    }
    if (h === 'brand') {
      // 브랜드 — 대각선 컬러 스트라이프 + 스퀘어 마커
      return wrap(<>
        {/* 대각선 컬러 스트라이프 */}
        <path d="M120,0 L120,50 L0,100 L0,50 Z" fill={c} fillOpacity="0.35" />
        <text x="60" y="18" textAnchor="middle" fontSize="5" fontWeight="800" fill={c} letterSpacing="0.5">{name}</text>
        <rect x="20" y="22" width="80" height="1" rx="0.5" fill={c} fillOpacity="0.4" />
        <text x="60" y="42" textAnchor="middle" fontSize="9" fontWeight="900" fill={c}>{hd.position} 모집</text>
        <text x="60" y="54" textAnchor="middle" fontSize="3.5" fontWeight="500" fill="#475569">함께 성장할 인재를 찾습니다</text>
        {/* 스퀘어 마커 목록 */}
        {[hd.type, ...hd.benefits.slice(0, 3)].map((txt, i) => (
          <g key={i}>
            <rect x="18" y={68 + i * 14} width="5" height="5" rx="1" fill={c} />
            <text x="28" y={73 + i * 14} fontSize="3.5" fontWeight="600" fill="#334155">{txt}</text>
          </g>
        ))}
        {hireCta(130)}
        <text x="60" y="155" textAnchor="middle" fontSize="3" fontWeight="500" fill="#64748b">{name}</text>
      </>);
    }
    if (h === 'benefits') {
      // 퍼즐/직소 인터로킹 조각 — 복리후생 강조
      return wrap(<>
        <text x="60" y="14" textAnchor="middle" fontSize="6" fontWeight="900" fill={c}>{hd.position} 채용</text>
        <text x="60" y="24" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#94a3b8">{name}</text>
        {/* 4개 퍼즐 조각 (2x2) */}
        {[
          {label: hd.benefits[0] || '4대보험', x:10, y:32, op:0.3},
          {label: hd.benefits[1] || '연차보장', x:64, y:32, op:0.4},
          {label: hd.benefits[2] || '중식제공', x:10, y:74, op:0.5},
          {label: hd.benefits[3] || '인센티브', x:64, y:74, op:0.6},
        ].map((piece, i) => (
          <g key={i}>
            <rect x={piece.x} y={piece.y} width="48" height="36" rx="8" fill={c} fillOpacity={piece.op} />
            {/* 탭 돌출 — 우측 or 하단 */}
            {i % 2 === 0 && <circle cx={piece.x + 48} cy={piece.y + 18} r="5" fill={c} fillOpacity={piece.op + 0.05} />}
            {i < 2 && <circle cx={piece.x + 24} cy={piece.y + 36} r="5" fill={c} fillOpacity={piece.op + 0.05} />}
            <text x={piece.x + 24} y={piece.y + 22} textAnchor="middle" fontSize="4.5" fontWeight="800" fill="white">{piece.label}</text>
          </g>
        ))}
        {hireCta(120)}
        <text x="60" y="148" textAnchor="middle" fontSize="3" fontWeight="500" fill="#64748b">{name}</text>
      </>);
    }
    // default — 폴더 탭 카드 디자인
    return wrap(<>
      <text x="60" y="16" textAnchor="middle" fontSize="8" fontWeight="900" fill={c}>채용 공고</text>
      <text x="60" y="26" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#94a3b8">{name}</text>
      {/* 2열 카드 그리드 — 폴더 탭 형태 */}
      {[
        {label:'모집직종', value: hd.position},
        {label:'고용형태', value: hd.type.split(' / ')[0]},
        {label:'자격요건', value: hd.type.split(' / ')[1] || '경력 무관'},
        {label:'복리후생', value: hd.benefits[0]},
      ].map(({label, value}, i) => {
        const gx = i % 2 === 0 ? 10 : 64;
        const gy = 36 + Math.floor(i/2) * 34;
        return (
          <g key={i}>
            {/* 폴더 탭 */}
            <path d={`M${gx},${gy + 8} L${gx},${gy + 2} Q${gx},${gy} ${gx + 2},${gy} L${gx + 16},${gy} Q${gx + 18},${gy} ${gx + 18},${gy + 2} L${gx + 18},${gy + 8}`} fill={c} fillOpacity="0.3" />
            <text x={gx + 9} y={gy + 7} textAnchor="middle" fontSize="2.5" fontWeight="700" fill="white">{label}</text>
            {/* 카드 본체 */}
            <rect x={gx} y={gy + 8} width="50" height="22" rx="0 0 4 4" fill="white" filter={`url(#shadow_${t.id})`} />
            <text x={gx + 25} y={gy + 23} textAnchor="middle" fontSize="4.5" fontWeight="800" fill="#334155">{value}</text>
          </g>
        );
      })}
      {hireCta(112)}
      <text x="60" y="148" textAnchor="middle" fontSize="3" fontWeight="500" fill="#64748b">{name}</text>
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
      <rect x="14" y={y} width="92" height="18" rx="9" fill={c} fillOpacity="0.12" stroke={c} strokeOpacity="0.2" strokeWidth="0.6" />
      <text x="28" y={y + 11} fontSize="3" fontWeight="700" fill={c}>📞</text>
      <text x="36" y={y + 11} fontSize="3.2" fontWeight="700" fill="#475569">이상 증상 시 바로 연락</text>
      <text x="98" y={y + 11} textAnchor="end" fontSize="3" fontWeight="800" fill={c}>1588-0000</text>
    </>);
    return wrap(<>
      {t.layoutHint === 'warning' ? <>
        {/* 경고형 — SOLID 배너 상단 35% + path 경고 삼각형 */}
        <rect x="0" y="0" width="120" height="56" rx="6" fill={c} />
        <path d="M52,14 L60,4 L68,14 Z" fill="white" fillOpacity="0.3" />
        <path d="M55,12 L60,6 L65,12 Z" fill="white" fillOpacity="0.5" />
        <path d="M57,10.5 L60,7 L63,10.5 Z" fill="white" />
        <rect x="58.5" y="7.5" width="3" height="2" rx="0.3" fill={c} />
        <circle cx="60" cy="10.5" r="0.5" fill={c} />
        <text x="60" y="26" textAnchor="middle" fontSize="7" fontWeight="900" fill="white" letterSpacing="0.3">{cd.title}</text>
        <text x="60" y="34" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="white" fillOpacity="0.8">{name}</text>
        <rect x="30" y="38" width="60" height="0.8" rx="0.4" fill="white" fillOpacity="0.3" />
        <text x="60" y="50" textAnchor="middle" fontSize="3" fontWeight="500" fill="white" fillOpacity="0.7">아래 사항을 꼭 지켜주세요</text>
        {cd.items.map((item, i) => (
          <g key={i}>
            <text x="22" y={72 + i * 18} fontSize="5" fontWeight="900" fill={c}>{i + 1}.</text>
            <text x="32" y={72 + i * 18} fontSize="4" fontWeight="600" fill="#1e293b">{item}</text>
            {i < 3 && <line x1="18" y1={76 + i * 18} x2="102" y2={76 + i * 18} stroke={c} strokeOpacity="0.1" strokeWidth="0.4" />}
          </g>
        ))}
        {emergencyBar(134)}
      </> : t.layoutHint === 'checklist' ? <>
        {/* 체크리스트 — 치아미백 */}
        <text x="60" y="12" textAnchor="middle" fontSize="4" fontWeight="700" fill={a} letterSpacing="0.5">{name}</text>
        <text x="60" y="32" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{cd.title}</text>
        {cd.items.map((item, i) => (
          <g key={i}>
            <rect x="14" y={44 + i * 22} width="92" height="18" rx="8" fill="white" filter={`url(#shadow_${t.id})`} />
            <rect x="18" y={46 + i * 22} width="14" height="14" rx="5" fill={c} />
            <text x="25" y={56 + i * 22} textAnchor="middle" fontSize="4.5" fontWeight="800" fill="white">{i + 1}</text>
            <text x="38" y={56 + i * 22} fontSize="3.8" fontWeight="600" fill="#1e293b">{item}</text>
          </g>
        ))}
        {emergencyBar(136)}
      </> : t.layoutHint === 'card' ? <>
        {/* 사랑니 발치 — O/X 카드 */}
        <text x="60" y="12" textAnchor="middle" fontSize="4" fontWeight="700" fill={a} letterSpacing="0.5">{name}</text>
        <text x="60" y="32" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{cd.title}</text>
        {cd.items.map((item, i) => (
          <g key={i}>
            <rect x="10" y={40 + i * 20} width="100" height="18" rx="4" fill={i % 2 === 0 ? '#f8fafc' : 'white'} />
            <circle cx="22" cy={49 + i * 20} r="5.5" fill={(cd.oItems?.[i] || 'X') === 'X' ? '#ef4444' : '#22c55e'} />
            <text x="22" y={52 + i * 20} textAnchor="middle" fontSize="4.5" fontWeight="800" fill="white">{cd.oItems?.[i] || 'X'}</text>
            <text x="34" y={52 + i * 20} fontSize="3.5" fontWeight="600" fill="#1e293b">{item}</text>
            {i < 3 && <path d={`M10,${58 + i * 20} L20,${61 + i * 20} L30,${58 + i * 20} L40,${61 + i * 20} L50,${58 + i * 20} L60,${61 + i * 20} L70,${58 + i * 20} L80,${61 + i * 20} L90,${58 + i * 20} L100,${61 + i * 20} L110,${58 + i * 20}`} fill="none" stroke={c} strokeWidth="0.5" strokeOpacity="0.2" />}
          </g>
        ))}
        {emergencyBar(122)}
      </> : t.layoutHint === 'guide' ? <>
        {/* 보톡스 — 아코디언 */}
        <text x="60" y="12" textAnchor="middle" fontSize="4" fontWeight="700" fill={a} letterSpacing="0.5">{name}</text>
        <text x="60" y="32" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{cd.title}</text>
        {cd.items.map((item, i) => (
          <g key={i}>
            <path d={`M14,${42 + i * 20} L106,${44 + i * 20} L106,${60 + i * 20} L14,${58 + i * 20} Z`} fill={i % 2 === 0 ? '#f8fafc' : 'white'} stroke={c} strokeWidth="0.3" strokeOpacity="0.15" />
            <circle cx="14" cy={50 + i * 20} r="6" fill={c} fillOpacity={0.8 - i * 0.15} />
            <text x="14" y={53 + i * 20} textAnchor="middle" fontSize="4" fontWeight="900" fill="white">{i + 1}</text>
            <text x="28" y={53 + i * 20} fontSize="3.8" fontWeight="600" fill="#1e293b">{item}</text>
          </g>
        ))}
        {emergencyBar(126)}
      </> : t.layoutHint === 'timeline' ? <>
        {/* 교정 — 회복 타임라인 */}
        <text x="60" y="12" textAnchor="middle" fontSize="4" fontWeight="700" fill={a} letterSpacing="0.5">{name}</text>
        <text x="60" y="28" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{cd.title}</text>
        {/* 반원 게이지 */}
        <path d="M20,90 A40,40 0 0,1 100,90" fill="none" stroke={c} strokeWidth="6" strokeOpacity="0.15" strokeLinecap="round" />
        {[
          {d:'당일~3일', t: cd.items[0], angle:0, color:'#ef4444'},
          {d:'1주일', t: cd.items[1], angle:45, color:'#f59e0b'},
          {d:'2주일', t: cd.items[2], angle:90, color:'#3b82f6'},
          {d:'매월', t: cd.items[3], angle:135, color:'#22c55e'},
        ].map((item, i) => {
          const startAngle = (180 + i * 45) * Math.PI / 180;
          const endAngle = (180 + (i + 1) * 45) * Math.PI / 180;
          const x1 = 60 + 40 * Math.cos(startAngle);
          const y1 = 90 + 40 * Math.sin(startAngle);
          const x2 = 60 + 40 * Math.cos(endAngle);
          const y2 = 90 + 40 * Math.sin(endAngle);
          const mx = 60 + 44 * Math.cos((startAngle + endAngle) / 2);
          const my = 90 + 44 * Math.sin((startAngle + endAngle) / 2);
          return (
            <g key={i}>
              <path d={`M${x1},${y1} A40,40 0 0,1 ${x2},${y2}`} fill="none" stroke={item.color} strokeWidth="5" strokeLinecap="round" />
              <circle cx={mx} cy={my} r="3" fill={item.color} />
              <text x={i < 2 ? 16 : 104} y={104 + i * 12} textAnchor={i < 2 ? 'start' : 'end'} fontSize="3.5" fontWeight="800" fill={item.color}>{item.d}</text>
              <text x={i < 2 ? 16 : 104} y={112 + i * 12} textAnchor={i < 2 ? 'start' : 'end'} fontSize="3" fontWeight="500" fill="#475569">{item.t}</text>
            </g>
          );
        })}
        {emergencyBar(134)}
      </> : <>
        {/* 스케일링 — 모자이크 */}
        <text x="60" y="12" textAnchor="middle" fontSize="4" fontWeight="700" fill={a} letterSpacing="0.5">{name}</text>
        <text x="60" y="32" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>{cd.title}</text>
        {cd.items.map((item, i) => (
          <g key={i}>
            <rect x={i % 2 === 0 ? 10 : 64} y={42 + Math.floor(i/2) * 34} width="50" height="30" rx="4" fill={(i === 0 || i === 3) ? c : 'white'} fillOpacity={(i === 0 || i === 3) ? 0.1 : 1} />
            <circle cx={i % 2 === 0 ? 35 : 89} cy={52 + Math.floor(i/2) * 34} r="7" fill={i === 2 ? '#22c55e' : '#f59e0b'} fillOpacity="0.8" />
            <text x={i % 2 === 0 ? 35 : 89} y={55 + Math.floor(i/2) * 34} textAnchor="middle" fontSize="5" fontWeight="800" fill="white">{i === 2 ? 'O' : '!'}</text>
            <text x={i % 2 === 0 ? 35 : 89} y={67 + Math.floor(i/2) * 34} textAnchor="middle" fontSize="3.2" fontWeight="600" fill="#1e293b">{item}</text>
          </g>
        ))}
        {emergencyBar(118)}
      </>}
      <text x="60" y="153" textAnchor="middle" fontSize="3.2" fontWeight="500" fill="#64748b">{name}</text>
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
      {isDarkTheme && <rect x="14" y="3" width="92" height="2" rx="1" fill="#f59e0b" fillOpacity="0.6" />}
      <text x="60" y="12" textAnchor="middle" fontSize="4" fontWeight="700" fill={isDarkTheme ? '#f59e0b' : a}>{name}</text>
      {t.layoutHint === 'table' ? <>
        {/* 테이블형 — SOLID 헤더 + 강한 줄무늬 */}
        <rect x="14" y="18" width="92" height="16" rx="6" fill={c} />
        <text x="60" y="29" textAnchor="middle" fontSize="5.5" fontWeight="900" fill="white">비급여 진료비 안내</text>
        <rect x="14" y="38" width="92" height="84" rx="6" fill="white" filter={`url(#shadow_${t.id})`} />
        <rect x="14" y="38" width="92" height="12" rx="6" fill={c} fillOpacity="0.3" />
        <text x="26" y="46" fontSize="3.5" fontWeight="800" fill={c}>항목</text>
        <text x="98" y="46" textAnchor="end" fontSize="3.5" fontWeight="800" fill={c}>금액</text>
        {items.map((item, i) => (
          <g key={i}>
            {i % 2 === 0 && <rect x="14" y={52 + i * 16} width="92" height="16" fill="#f1f5f9" />}
            <text x="22" y={62 + i * 16} fontSize="4" fontWeight="500" fill="#1e293b">{item.n}</text>
            <text x="98" y={62 + i * 16} textAnchor="end" fontSize="4" fontWeight="800" fill={c}>{item.p}</text>
            {i < items.length - 1 && <line x1="18" y1={68 + i * 16} x2="102" y2={68 + i * 16} stroke="#e2e8f0" strokeWidth="0.4" />}
          </g>
        ))}
      </> : t.layoutHint === 'cards' ? <>
        {/* 수평 1열 미니 카드 — 약간 기울어진 4장 */}
        <text x="60" y="28" textAnchor="middle" fontSize="7" fontWeight="900" fill={c}>비급여 진료비 안내</text>
        {items.map((item, i) => (
          <g key={i} transform={`rotate(${i % 2 === 0 ? -2 : 2} ${14 + i * 26} ${62})`}>
            <rect x={8 + i * 26} y={40} width="24" height="62" rx="5" fill="white" filter={`url(#shadow_${t.id})`} />
            <rect x={8 + i * 26} y={40} width="24" height="4" rx="5" fill={c} fillOpacity={0.5 + i * 0.1} />
            <text x={20 + i * 26} y={58} textAnchor="middle" fontSize="3.2" fontWeight="700" fill="#1e293b">{item.n}</text>
            <line x1={12 + i * 26} y1={62} x2={28 + i * 26} y2={62} stroke={c} strokeOpacity="0.15" strokeWidth="0.4" />
            <text x={20 + i * 26} y={76} textAnchor="middle" fontSize="3.5" fontWeight="900" fill={c}>{item.p}</text>
          </g>
        ))}
      </> : isDarkTheme ? <>
        {/* 다크 테마 — 육각형 패턴 오버레이 */}
        <defs>
          <pattern id={`hex_${t.id}`} width="20" height="17.32" patternUnits="userSpaceOnUse">
            <path d="M10,0 L20,5 L20,12.32 L10,17.32 L0,12.32 L0,5 Z" fill="none" stroke="#f59e0b" strokeWidth="0.3" strokeOpacity="0.12" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="120" height="160" rx="6" fill={`url(#hex_${t.id})`} />
        <rect x="14" y="6" width="92" height="2" rx="1" fill="#f59e0b" fillOpacity="0.8" />
        <text x="60" y="28" textAnchor="middle" fontSize="7" fontWeight="900" fill="white">비급여 진료비 안내</text>
        {items.map((item, i) => (
          <g key={i}>
            <rect x="14" y={42 + i * 20} width="92" height="17" rx="6" fill="#1e293b" fillOpacity="0.8" />
            <text x="22" y={53 + i * 20} fontSize="4" fontWeight="500" fill="white">{item.n}</text>
            <text x="98" y={53 + i * 20} textAnchor="end" fontSize="4" fontWeight="800" fill="#f59e0b">{item.p}</text>
          </g>
        ))}
        <rect x="14" y="155" width="92" height="1.5" rx="0.75" fill="#f59e0b" fillOpacity="0.5" />
      </> : t.layoutHint === 'minimal' ? <>
        {/* 미니멀 — 도트 리더만, 사이드 바 없음 */}
        <line x1="14" y1="18" x2="106" y2="18" stroke="#e2e8f0" strokeWidth="0.6" />
        <text x="60" y="34" textAnchor="middle" fontSize="7" fontWeight="900" fill="#1e293b">비급여 진료비 안내</text>
        {items.map((item, i) => (
          <g key={i}>
            <text x="16" y={56 + i * 22} fontSize="4" fontWeight="500" fill="#475569">{item.n}</text>
            <line x1="48" y1={56 + i * 22} x2="84" y2={56 + i * 22} stroke="#cbd5e1" strokeWidth="0.8" strokeDasharray="1.5 1.5" />
            <text x="104" y={56 + i * 22} textAnchor="end" fontSize="4" fontWeight="800" fill="#1e293b">{item.p}</text>
          </g>
        ))}
        <line x1="14" y1="148" x2="106" y2="148" stroke="#e2e8f0" strokeWidth="0.6" />
      </> : t.layoutHint === 'wood' ? <>
        {/* 우드 — 카페 메뉴판 강화 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#fef3c7" />
        <rect x="8" y="5" width="104" height="150" rx="5" fill="#fffbeb" stroke="#d4a017" strokeOpacity="0.4" strokeWidth="1" />
        <rect x="22" y="12" width="76" height="14" rx="5" fill="#92400e" fillOpacity="0.25" />
        <text x="60" y="22" textAnchor="middle" fontSize="5.5" fontWeight="900" fill="#92400e">비급여 진료비 안내</text>
        <line x1="26" y1="30" x2="94" y2="30" stroke="#d4a017" strokeWidth="0.6" strokeOpacity="0.4" />
        <text x="60" y="37" textAnchor="middle" fontSize="3" fontWeight="600" fill="#a16207" letterSpacing="1.5">PRICE LIST</text>
        <line x1="26" y1="40" x2="94" y2="40" stroke="#d4a017" strokeWidth="0.4" strokeOpacity="0.25" />
        {items.map((item, i) => (
          <g key={i}>
            <text x="18" y={56 + i * 22} fontSize="4" fontWeight="700" fill="#78350f">{item.n}</text>
            <line x1="50" y1={56 + i * 22} x2="86" y2={56 + i * 22} stroke="#d4a017" strokeWidth="0.6" strokeOpacity="0.4" strokeDasharray="2 1" />
            <text x="102" y={56 + i * 22} textAnchor="end" fontSize="4" fontWeight="900" fill="#d97706">{item.p}</text>
          </g>
        ))}
        <line x1="26" y1="142" x2="94" y2="142" stroke="#d4a017" strokeWidth="0.4" strokeOpacity="0.25" />
        <text x="60" y="150" textAnchor="middle" fontSize="3" fontWeight="600" fill="#a16207">{name}</text>
      </> : <>
        {/* 라벤더 그라데이션 (gradient / fallback) — 강화 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f5f3ff" />
        <circle cx="100" cy="14" r="24" fill="#7c3aed" fillOpacity="0.15" />
        <circle cx="16" cy="148" r="20" fill="#a855f7" fillOpacity="0.1" />
        <rect x="22" y="4" width="76" height="15" rx="7.5" fill={`url(#accent_${t.id})`} />
        <text x="60" y="14" textAnchor="middle" fontSize="4" fontWeight="800" fill="white">비급여 안내</text>
        <text x="60" y="30" textAnchor="middle" fontSize="7" fontWeight="900" fill="#7c3aed">진료비 안내</text>
        <text x="60" y="38" textAnchor="middle" fontSize="3" fontWeight="500" fill="#a78bfa">{name}</text>
        <rect x="14" y="44" width="92" height="86" rx="8" fill="white" fillOpacity="0.97" filter={`url(#shadow_${t.id})`} />
        {items.map((item, i) => (
          <g key={i}>
            {i % 2 === 0 && <rect x="14" y={48 + i * 20} width="92" height="20" fill="#f5f3ff" fillOpacity="0.6" />}
            <circle cx="22" cy={60 + i * 20} r="2.5" fill="#7c3aed" fillOpacity="0.4" />
            <text x="28" y={62 + i * 20} fontSize="4" fontWeight="500" fill="#475569">{item.n}</text>
            <text x="98" y={62 + i * 20} textAnchor="end" fontSize="4" fontWeight="900" fill="#7c3aed">{item.p}</text>
            {i < items.length - 1 && <line x1="20" y1={68 + i * 20} x2="100" y2={68 + i * 20} stroke="#e9d5ff" strokeWidth="0.4" />}
          </g>
        ))}
        <rect x="32" y="136" width="56" height="1.5" rx="0.75" fill={`url(#accent_${t.id})`} fillOpacity="0.5" />
      </>}
      <text x="60" y="152" textAnchor="middle" fontSize="3" fontWeight="500" fill="#64748b">* 환자 상태에 따라 금액이 달라질 수 있습니다</text>
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
