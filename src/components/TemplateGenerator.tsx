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
  resizeImageForReference,
  CALENDAR_THEME_OPTIONS,
  type ClosedDay,
  type ShortenedDay,
  type VacationDay,
  type StylePreset,
  type CategoryTemplate,
  type SavedStyleHistory,
} from '../services/calendarTemplateService';

type DayMark = 'closed' | 'shortened' | 'vacation';
type TemplateCategory = 'schedule' | 'event' | 'doctor' | 'notice' | 'greeting' | 'hiring' | 'caution';
type ScheduleLayout = 'full_calendar' | 'week' | 'highlight';

const CATEGORIES: { id: TemplateCategory; name: string; icon: string; desc: string }[] = [
  { id: 'schedule', name: '진료 일정', icon: '\u{1F4C5}', desc: '휴진/단축진료' },
  { id: 'event', name: '이벤트', icon: '\u{1F389}', desc: '시술 할인' },
  { id: 'doctor', name: '의사 소개', icon: '\u{1F9D1}\u200D\u2695\uFE0F', desc: '전문의 부임' },
  { id: 'notice', name: '공지사항', icon: '\u{1F4E2}', desc: '변경/이전' },
  { id: 'greeting', name: '명절 인사', icon: '\u{1F38A}', desc: '설날/추석' },
  { id: 'hiring', name: '채용/공고', icon: '\u{1F4CB}', desc: '직원 모집' },
  { id: 'caution', name: '주의사항', icon: '\u26A0\uFE0F', desc: '시술/진료 후' },
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

const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400';
const textareaCls = `${inputCls} resize-none`;
const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';

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
        {/* 상단 블루 바 */}
        <rect x="0" y="0" width="120" height="12" rx="6" fill={c} />
        <rect x="0" y="6" width="120" height="6" fill={c} />
        <text x="60" y="8" textAnchor="middle" fontSize="3" fontWeight="700" fill="white">{name}</text>
        {/* 큰 타이틀 */}
        <text x="60" y="30" textAnchor="middle" fontSize="12" fontWeight="900" fill="#1e293b">{mo}월 진료일정</text>
        <text x="60" y="40" textAnchor="middle" fontSize="2.8" fill="#64748b">착오 없으시길 바랍니다</text>
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
        <circle cx="24" cy="138" r="3" fill={c} fillOpacity="0.15" />
        <text x="30" y="140" fontSize="2.5" fontWeight="600" fill="#475569">휴진</text>
        <circle cx="50" cy="138" r="3" fill="#fbbf24" fillOpacity="0.2" />
        <text x="56" y="140" fontSize="2.5" fontWeight="600" fill="#475569">단축</text>
        <text x="60" y="154" textAnchor="middle" fontSize="3" fontWeight="700" fill={c}>🦷 {name}</text>
      </>);
    }
    if (hint === 'cal_bubble') {
      // 2) 가을 단풍 — 오렌지 그라데이션 + 단풍잎 + 풀 달력
      return wrap(<>
        {/* 따뜻한 그라데이션 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#fecaca" />
        <rect x="0" y="0" width="120" height="90" rx="6" fill={c} fillOpacity="0.85" />
        {/* 단풍잎 장식 */}
        <text x="4" y="18" fontSize="10" fill="#dc2626" fillOpacity="0.5">🍁</text>
        <text x="92" y="14" fontSize="8" fill="#f59e0b" fillOpacity="0.45">🍂</text>
        <text x="100" y="30" fontSize="5" fill="#dc2626" fillOpacity="0.35">🍁</text>
        <text x="2" y="38" fontSize="4" fill="#f59e0b" fillOpacity="0.25">🍂</text>
        {/* 흰 곡선 */}
        <path d="M0,55 Q40,42 80,58 Q100,64 120,50" fill="none" stroke="white" strokeWidth="0.4" strokeOpacity="0.35" />
        {/* 타이틀 */}
        <text x="60" y="50" textAnchor="middle" fontSize="10" fontWeight="900" fill="white">{mo}월 진료일정</text>
        <text x="60" y="60" textAnchor="middle" fontSize="2.8" fontWeight="500" fill="white" fillOpacity="0.85">착오 없으시길 바랍니다</text>
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
        {/* 벚꽃 장식 */}
        <text x="4" y="16" fontSize="8" fill="#f9a8d4" fillOpacity="0.5">🌸</text>
        <text x="96" y="12" fontSize="6" fill="#fbcfe8" fillOpacity="0.55">🌸</text>
        <text x="88" y="28" fontSize="4" fill="#f9a8d4" fillOpacity="0.3">🌸</text>
        <text x="4" y="148" fontSize="7" fill="#fbcfe8" fillOpacity="0.35">🌸</text>
        <text x="100" y="150" fontSize="5" fill="#f9a8d4" fillOpacity="0.3">🌸</text>
        <circle cx="110" cy="44" r="1.5" fill="#f9a8d4" fillOpacity="0.4" />
        <circle cx="8" cy="72" r="1" fill="#f9a8d4" fillOpacity="0.3" />
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
        {/* 네이비 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#1e293b" />
        {/* 골드 장식 라인 */}
        <line x1="14" y1="10" x2="106" y2="10" stroke="#d4a853" strokeWidth="0.4" />
        <line x1="14" y1="12" x2="106" y2="12" stroke="#d4a853" strokeWidth="0.2" />
        {/* 병원명 */}
        <text x="60" y="24" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#d4a853" letterSpacing="1">{name}</text>
        {/* 큰 월 표시 */}
        <text x="60" y="44" textAnchor="middle" fontSize="16" fontWeight="900" fill="white">{mo}월</text>
        <text x="60" y="52" textAnchor="middle" fontSize="3.5" fontWeight="400" fill="#d4a853" letterSpacing="2">SCHEDULE</text>
        {/* 화이트 카드 달력 */}
        <rect x="8" y="58" width="104" height="72" rx="5" fill="white" fillOpacity="0.97" />
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
        <rect x="0" y="134" width="120" height="1" fill="#d4a853" fillOpacity="0.5" />
        <circle cx="28" cy="146" r="3" fill="white" fillOpacity="0.2" />
        <text x="34" y="148" fontSize="2.8" fontWeight="600" fill="#d4a853">휴진</text>
        <circle cx="60" cy="146" r="3" fill="#f59e0b" fillOpacity="0.3" />
        <text x="66" y="148" fontSize="2.8" fontWeight="600" fill="#d4a853">단축</text>
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
        <text x="22" y="24" fontSize="4" fill="#fbbf24" fillOpacity="0.4">★</text>
        <text x="92" y="28" fontSize="3" fill={c} fillOpacity="0.3">✦</text>
        <text x="30" y="45" fontSize="2.5" fill="#f472b6" fillOpacity="0.3">♥</text>
        <text x="86" y="42" fontSize="2.5" fill={c} fillOpacity="0.3">✧</text>
        {/* 하트/구름 장식 */}
        <ellipse cx="20" cy="55" rx="8" ry="3" fill="#e0f2fe" fillOpacity="0.5" />
        <ellipse cx="96" cy="52" rx="6" ry="2.5" fill="#fce7f3" fillOpacity="0.4" />
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
        <ellipse cx="60" cy="16" rx="42" ry="18" fill="#e8795a" fillOpacity="0.8" />
        <text x="60" y="14" textAnchor="middle" fontSize="7" fontWeight="900" fill="white">{mo}월</text>
        <text x="60" y="24" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">진료일정 안내</text>
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
      // 폴백용 기본 캘린더
      return wrap(<>
        <rect x="8" y="6" width="104" height="20" rx="4" fill={c} fillOpacity="0.06" />
        <text x="60" y="14" textAnchor="middle" fontSize="4" fontWeight="600" fill={a} letterSpacing="0.5">{name}</text>
        <text x="60" y="22" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={c}>{mo}월 진료안내</text>
        <rect x="8" y="29" width="104" height="82" rx="5" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
        <rect x="8" y="29" width="104" height="12" rx="5" fill={c} fillOpacity="0.08" />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <text key={d} x={16 + i * 14} y="38" textAnchor="middle" fontSize="3.2" fontWeight="700" fill={i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#94a3b8'}>{d}</text>
        ))}
        {[0,1,2,3,4].map(row => Array.from({length: 7}, (_, col) => {
          const day = row * 7 + col + 1;
          if (day > 31) return null;
          const closed = PREVIEW_CLOSED.has(day);
          const short = PREVIEW_SHORT.has(day);
          const cx = 16 + col * 14, cy = 44 + row * 11;
          return <g key={`${row}-${col}`}>
            {isRunStart(day, col) && closedRunLength(day, col) > 1 && <rect x={cx - 5} y={cy - 4} width={14 * (closedRunLength(day, col) - 1) + 10} height="10" rx="5" fill={c} fillOpacity="0.15" />}
            {isRunStart(day, col) && closedRunLength(day, col) === 1 && <rect x={cx - 5} y={cy - 4} width="10" height="10" rx="3" fill={c} fillOpacity="0.15" />}
            {short && <rect x={cx - 5} y={cy - 4} width="10" height="10" rx="3" fill="#f59e0b" fillOpacity="0.12" />}
            <text x={cx} y={cy + 3} textAnchor="middle" fontSize="3.8" fontWeight={closed || short ? '800' : '400'} fill={closed ? c : short ? '#b45309' : col === 0 ? '#ef4444' : '#475569'}>{day}</text>
          </g>;
        }))}
        <g transform="translate(12, 114)">
          <rect width="10" height="5" rx="1.5" fill={c} fillOpacity="0.15" />
          <text x="13" y="4" fontSize="2.8" fill="#64748b">휴진</text>
          <rect x="28" width="10" height="5" rx="1.5" fill="#f59e0b" fillOpacity="0.15" />
          <text x="41" y="4" fontSize="2.8" fill="#64748b">단축</text>
        </g>
        <rect x="8" y="122" width="104" height="30" rx="5" fill={c} fillOpacity="0.04" />
        <text x="60" y="132" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={c}>진료시간 09:30 ~ 18:00</text>
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
      // 기본 주간 폴백
      return wrap(<>
        <text x="60" y="13" textAnchor="middle" fontSize="4" fontWeight="600" fill={a} letterSpacing="0.5">{name}</text>
        <text x="60" y="25" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={c}>{mo}월 셋째 주</text>
        <rect x="6" y="31" width="108" height="56" rx="6" fill="white" fillOpacity="0.95" filter={`url(#shadow_${t.id})`} />
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <g key={d}>
            <text x={14 + i * 14} y="41" textAnchor="middle" fontSize="3" fontWeight="700" fill={i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#94a3b8'}>{d}</text>
            {(i === 3) ? <>
              <rect x={14 + i * 14 - 7} y="46" width="14" height="14" rx="4" fill={c} fillOpacity="0.12" />
              <text x={14 + i * 14} y="56" textAnchor="middle" fontSize="6" fontWeight="800" fill={c}>{15 + i}</text>
              <text x={14 + i * 14} y="67" textAnchor="middle" fontSize="2.2" fontWeight="700" fill={c}>휴진</text>
            </> : (i === 0) ? <>
              <rect x={14 + i * 14 - 7} y="46" width="14" height="14" rx="4" fill="#ef4444" fillOpacity="0.08" />
              <text x={14 + i * 14} y="56" textAnchor="middle" fontSize="6" fontWeight="700" fill="#ef4444">{15 + i}</text>
            </> : <>
              <text x={14 + i * 14} y="56" textAnchor="middle" fontSize="6" fontWeight="500" fill="#64748b">{15 + i}</text>
            </>}
          </g>
        ))}
      </>);
    }
    if (hint === 'wk_bar') {
      // 기와지붕 전통 스타일
      return wrap(<>
        {/* 베이지 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f5e6d0" />
        {/* 코럴 반원 해 */}
        <ellipse cx="60" cy="20" rx="40" ry="22" fill="#e8795a" fillOpacity="0.85" />
        <text x="60" y="16" textAnchor="middle" fontSize="7" fontWeight="900" fill="white">{mo}월</text>
        <text x="60" y="26" textAnchor="middle" fontSize="5" fontWeight="800" fill="white">진료일정 안내</text>
        {/* 기와지붕 */}
        <path d="M8,38 Q20,32 30,38 Q40,32 50,38 Q60,32 70,38 Q80,32 90,38 Q100,32 112,38 L112,42 L8,42 Z" fill="#3f3f46" />
        <rect x="8" y="40" width="104" height="3" fill="#57534e" />
        {/* 전통 코너 장식 */}
        <path d="M16,48 L22,48 L22,50" fill="none" stroke="#92400e" strokeWidth="0.6" />
        <path d="M104,48 L98,48 L98,50" fill="none" stroke="#92400e" strokeWidth="0.6" />
        {/* 주간 달력 카드 */}
        <rect x="14" y="50" width="92" height="60" rx="5" fill="white" fillOpacity="0.95" filter={`url(#shadow_${t.id})`} />
        {/* 달력 링 */}
        {[28,36,44,52,60,68,76,84,88].map(x => <rect key={x} x={x} y="47" width="2" height="5" rx="1" fill="#94a3b8" />)}
        {/* 요일 헤더 */}
        <rect x="14" y="56" width="92" height="9" fill="#3f3f46" rx="0" />
        {['일','월','화','수','목','금','토'].map((d,i) => (
          <text key={d} x={22 + i * 12} y="63" textAnchor="middle" fontSize="3" fontWeight="700" fill="white">{d}</text>
        ))}
        {/* 날짜 행 */}
        {[0,1].map(row => ['일','월','화','수','목','금','토'].map((d,i) => {
          const day = 15 + row * 7 + i;
          if (day > 21) return null;
          const isClosed = (row === 0 && i === 3);
          const cx = 22 + i * 12, cy = 76 + row * 18;
          return <g key={`${row}-${i}`}>
            <text x={cx} y={cy} textAnchor="middle" fontSize="5" fontWeight={isClosed ? '900' : '500'} fill={isClosed ? '#e8795a' : i === 0 ? '#ef4444' : '#1f2937'}>{day}</text>
            {isClosed && <><rect x={cx - 8} y={cy + 2} width="16" height="5" rx="2.5" fill="#e8795a" /><text x={cx} y={cy + 6} textAnchor="middle" fontSize="2.5" fontWeight="700" fill="white">휴진</text></>}
          </g>;
        }))}
        {/* 하단 안내 */}
        <text x="60" y="122" textAnchor="middle" fontSize="4" fontWeight="800" fill="#1f2937">정상진료</text>
        {/* 병원명 */}
        <text x="60" y="150" textAnchor="middle" fontSize="3" fontWeight="600" fill="#92400e">{name}</text>
        {/* 전통 하단 코너 장식 */}
        <path d="M16,142 L22,142 L22,140" fill="none" stroke="#92400e" strokeWidth="0.6" />
        <path d="M104,142 L98,142 L98,140" fill="none" stroke="#92400e" strokeWidth="0.6" />
      </>);
    }
    if (hint === 'wk_cards') {
      // 단풍 가을 스타일
      return wrap(<>
        {/* 따뜻한 그라데이션 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#fecaca" />
        <rect x="0" y="0" width="120" height="90" rx="6" fill="#f97316" fillOpacity="0.85" />
        <rect x="0" y="60" width="120" height="40" fill="#f97316" fillOpacity="0" />
        {/* 단풍잎 장식 */}
        <text x="8" y="18" fontSize="10" fill="#dc2626" fillOpacity="0.6">🍁</text>
        <text x="94" y="14" fontSize="8" fill="#f59e0b" fillOpacity="0.5">🍂</text>
        <text x="102" y="30" fontSize="6" fill="#dc2626" fillOpacity="0.4">🍁</text>
        <text x="4" y="40" fontSize="5" fill="#f59e0b" fillOpacity="0.3">🍂</text>
        {/* 흰 곡선 장식 */}
        <path d="M0,50 Q40,35 80,55 Q100,62 120,48" fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.4" />
        {/* 타이틀 */}
        <text x="60" y="52" textAnchor="middle" fontSize="9" fontWeight="900" fill="white">{mo}월 진료일정</text>
        <text x="60" y="62" textAnchor="middle" fontSize="3" fontWeight="500" fill="white" fillOpacity="0.85">착오 없으시길 바랍니다</text>
        {/* 달력 카드 */}
        <rect x="10" y="68" width="100" height="70" rx="6" fill="white" fillOpacity="0.97" filter={`url(#shadow_${t.id})`} />
        <rect x="10" y="68" width="100" height="10" rx="6" fill="#3f3f46" />
        <rect x="10" y="74" width="100" height="4" fill="#3f3f46" />
        {['일','월','화','수','목','금','토'].map((d,i) => (
          <text key={d} x={18 + i * 13} y="76" textAnchor="middle" fontSize="2.8" fontWeight="700" fill="white">{d}</text>
        ))}
        {/* 날짜 행 */}
        {[0,1].map(row => Array.from({length:7}, (_,i) => {
          const day = 15 + row * 7 + i;
          if (day > 28 || (row === 1 && day > 21)) return null;
          const isClosed = (row === 0 && i === 4); // 목요일 정기휴진
          const cx = 18 + i * 13, cy = 90 + row * 22;
          return <g key={`${row}-${i}`}>
            <text x={cx} y={cy} textAnchor="middle" fontSize="4.5" fontWeight={isClosed ? '800' : '400'} fill={i === 0 ? '#ef4444' : '#1f2937'}>{day}</text>
            {isClosed && <><rect x={cx - 9} y={cy + 2} width="18" height="5" rx="2.5" fill="#fbbf24" /><text x={cx} y={cy + 6} textAnchor="middle" fontSize="2.3" fontWeight="700" fill="#78350f">정기휴진</text></>}
          </g>;
        }))}
        {/* 로고 */}
        <text x="60" y="152" textAnchor="middle" fontSize="3.2" fontWeight="700" fill="#c2410c">{name}</text>
      </>);
    }
    if (hint === 'wk_timeline') {
      // 수묵화 한국풍 스타일
      return wrap(<>
        {/* 베이지 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f0ece4" />
        {/* 수묵화 산 (하단) */}
        <path d="M0,130 Q15,110 30,125 Q45,108 60,120 Q75,105 90,118 Q105,108 120,130 L120,160 L0,160 Z" fill="#2d2d2d" fillOpacity="0.12" />
        <path d="M0,140 Q20,125 40,138 Q60,120 80,132 Q100,118 120,140 L120,160 L0,160 Z" fill="#1a1a1a" fillOpacity="0.15" />
        {/* 태극기 캐릭터 (간소화) */}
        <circle cx="18" cy="20" r="5" fill="#fbbf24" fillOpacity="0.3" />
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
        <text x="8" y="18" fontSize="7" fill="#f9a8d4" fillOpacity="0.5">🌸</text>
        <text x="96" y="12" fontSize="5" fill="#fbcfe8" fillOpacity="0.6">🌸</text>
        <text x="100" y="148" fontSize="4" fill="#f9a8d4" fillOpacity="0.3">🌸</text>
        <text x="6" y="150" fontSize="6" fill="#fbcfe8" fillOpacity="0.3">🌸</text>
        <circle cx="105" cy="35" r="1.5" fill="#f9a8d4" fillOpacity="0.4" />
        <circle cx="10" cy="65" r="1" fill="#f9a8d4" fillOpacity="0.3" />
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
      // 블루 클린 스타일
      return wrap(<>
        {/* 하얀 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        {/* 블루 상단 바 */}
        <rect x="0" y="0" width="120" height="14" rx="6" fill="#2563eb" />
        <rect x="0" y="8" width="120" height="6" fill="#2563eb" />
        {/* 로고/아이콘 */}
        <rect x="52" y="3" width="16" height="8" rx="3" fill="white" fillOpacity="0.2" />
        <text x="60" y="9" textAnchor="middle" fontSize="4" fill="white">🦷</text>
        {/* 타이틀 */}
        <text x="60" y="24" textAnchor="middle" fontSize="2.8" fontWeight="500" fill="#94a3b8">{name}</text>
        <text x="60" y="36" textAnchor="middle" fontSize="7" fontWeight="900" fill="#1e293b">진료시간 안내</text>
        {/* 정보 카드 */}
        <rect x="12" y="42" width="96" height="72" rx="5" fill="white" stroke="#e2e8f0" strokeWidth="0.5" />
        {[
          {label:'월·수·목·금', time:'09:30 - 18:30', badge:null},
          {label:'화 요 일', time:'09:30 - 20:30', badge:'야간'},
          {label:'토 · 일', time:'09:30 - 14:00', badge:'연속'},
          {label:'휴 게 시 간', time:'13:00 - 14:00', badge:null},
        ].map((row, i) => {
          const y = 50 + i * 16;
          return <g key={i}>
            <text x="18" y={y + 4} fontSize="2.8" fontWeight="500" fill="#475569">{row.label}</text>
            <text x="55" y={y + 4} fontSize="2.2" fill="#94a3b8">:</text>
            <text x="60" y={y + 4} fontSize="3" fontWeight="700" fill="#1e293b">{row.time}</text>
            {row.badge && <><rect x="90" y={y - 2} width="14" height="7" rx="3.5" fill="#dbeafe" /><text x="97" y={y + 3} textAnchor="middle" fontSize="2" fontWeight="700" fill="#2563eb">{row.badge}</text></>}
            {i < 3 && <line x1="16" y1={y + 10} x2="104" y2={y + 10} stroke="#f1f5f9" strokeWidth="0.4" />}
          </g>;
        })}
        {/* 하단 위치 정보 */}
        <rect x="22" y="122" width="76" height="10" rx="5" fill="#f0fdf4" stroke="#86efac" strokeWidth="0.3" />
        <text x="60" y="129" textAnchor="middle" fontSize="2.5" fontWeight="600" fill="#166534">🚇 도보 3분 거리</text>
        {/* 하단 로고 */}
        <text x="60" y="150" textAnchor="middle" fontSize="3" fontWeight="700" fill="#2563eb">🦷 {name}</text>
      </>);
    }
    if (hint === 'wk_neon') {
      // 눈꽃 겨울 스타일
      return wrap(<>
        {/* 아이시 블루 배경 */}
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#e0f2fe" />
        <rect x="0" y="100" width="120" height="60" rx="6" fill="white" fillOpacity="0.6" />
        {/* 눈꽃 장식 */}
        <text x="10" y="16" fontSize="6" fill="#bae6fd" fillOpacity="0.6">❄</text>
        <text x="98" y="20" fontSize="4" fill="#7dd3fc" fillOpacity="0.4">❄</text>
        <text x="50" y="12" fontSize="3" fill="#bae6fd" fillOpacity="0.5">✧</text>
        <text x="104" y="90" fontSize="3" fill="#bae6fd" fillOpacity="0.3">❄</text>
        <text x="8" y="120" fontSize="4" fill="#bae6fd" fillOpacity="0.3">❄</text>
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
      // 수묵화 휴무 스타일 (삼일절 참고)
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f0ece4" />
        {/* 수묵화 산 */}
        <path d="M0,128 Q15,112 30,122 Q45,106 60,118 Q75,104 90,116 Q105,106 120,128 L120,160 L0,160 Z" fill="#2d2d2d" fillOpacity="0.1" />
        <path d="M0,138 Q20,122 40,134 Q60,118 80,130 Q100,115 120,138 L120,160 L0,160 Z" fill="#1a1a1a" fillOpacity="0.13" />
        {/* 태극기 모티프 */}
        <text x="14" y="18" fontSize="6">🇰🇷</text>
        <text x="100" y="20" fontSize="6">🇰🇷</text>
        {/* 타이틀 */}
        <text x="60" y="18" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="#e8634a">대체공휴일</text>
        <text x="60" y="34" textAnchor="middle" fontSize="11" fontWeight="900" fill="#1a1a1a">휴무 안내</text>
        <text x="60" y="46" textAnchor="middle" fontSize="2.8" fill="#525252">착오 없으시길 바랍니다</text>
        {/* 3일 미니 달력 */}
        <rect x="14" y="54" width="92" height="52" rx="5" fill="white" fillOpacity="0.95" filter={`url(#shadow_${t.id})`} />
        {[30,42,54,66,78,90].map(x => <rect key={x} x={x} y="51" width="2" height="5" rx="1" fill="#94a3b8" />)}
        {[{d:'일요일',n:'1',cls:true},{d:'월요일',n:'2',cls:true},{d:'화요일',n:'3',cls:false}].map((item,i) => {
          const cx = 30 + i * 30;
          return <g key={i}>
            <text x={cx} y="66" textAnchor="middle" fontSize="2.5" fontWeight="600" fill={item.cls ? '#e8634a' : '#525252'}>{item.d}</text>
            {item.cls && <rect x={cx - 5} y="64" width="10" height="5" rx="2.5" fill="#e8634a" fillOpacity="0.15" />}
            <text x={cx} y="84" textAnchor="middle" fontSize="14" fontWeight="900" fill={item.cls ? '#e8634a' : '#1a1a1a'}>{item.n}</text>
            <text x={cx} y="98" textAnchor="middle" fontSize="3" fontWeight="700" fill={item.cls ? '#e8634a' : '#1a1a1a'}>{item.cls ? '휴무' : '정상 영업'}</text>
            {i < 2 && <line x1={cx + 14} y1="60" x2={cx + 14} y2="102" stroke="#e5e7eb" strokeWidth="0.4" />}
          </g>;
        })}
        <text x="104" y="10" textAnchor="end" fontSize="2.8" fontWeight="600" fill="#525252">{name}</text>
      </>);
    }
    if (hint === 'hl_stamp') {
      // 동백꽃 일러스트 프레임
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#f5f0e8" />
        {/* 동백꽃 장식 (코너) */}
        <circle cx="12" cy="12" r="8" fill="#dc2626" fillOpacity="0.25" />
        <circle cx="8" cy="18" r="6" fill="#ef4444" fillOpacity="0.2" />
        <circle cx="18" cy="8" r="5" fill="#b91c1c" fillOpacity="0.2" />
        <ellipse cx="10" cy="28" rx="4" ry="6" fill="#16a34a" fillOpacity="0.15" transform="rotate(-20 10 28)" />
        <circle cx="108" cy="14" r="7" fill="#dc2626" fillOpacity="0.2" />
        <circle cx="112" cy="22" r="5" fill="#ef4444" fillOpacity="0.18" />
        <ellipse cx="104" cy="30" rx="4" ry="6" fill="#16a34a" fillOpacity="0.12" transform="rotate(20 104 30)" />
        <circle cx="10" cy="142" r="9" fill="#dc2626" fillOpacity="0.22" />
        <circle cx="20" cy="148" r="6" fill="#ef4444" fillOpacity="0.18" />
        <ellipse cx="16" cy="134" rx="4" ry="6" fill="#16a34a" fillOpacity="0.12" transform="rotate(30 16 134)" />
        <circle cx="110" cy="145" r="8" fill="#dc2626" fillOpacity="0.2" />
        <circle cx="102" cy="150" r="5" fill="#ef4444" fillOpacity="0.15" />
        <ellipse cx="106" cy="136" rx="4" ry="6" fill="#16a34a" fillOpacity="0.1" transform="rotate(-25 106 136)" />
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
        <circle cx="100" cy="12" r="20" fill="#14b8a6" fillOpacity="0.06" />
        <circle cx="15" cy="150" r="15" fill="#14b8a6" fillOpacity="0.05" />
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
      // 블루 진료시간표 스타일
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="white" />
        {/* 블루 상단 바 */}
        <rect x="0" y="0" width="120" height="14" rx="6" fill="#2563eb" />
        <rect x="0" y="8" width="120" height="6" fill="#2563eb" />
        <text x="60" y="9" textAnchor="middle" fontSize="4" fill="white">🦷</text>
        {/* 타이틀 */}
        <text x="60" y="24" textAnchor="middle" fontSize="2.5" fontWeight="500" fill="#94a3b8">{name}</text>
        <text x="60" y="36" textAnchor="middle" fontSize="7" fontWeight="900" fill="#1e293b">진료시간 안내</text>
        {/* 정보 카드 */}
        <rect x="12" y="42" width="96" height="72" rx="5" fill="white" stroke="#dbeafe" strokeWidth="0.5" />
        {[
          {l:'월·수·목·금', t:'09:30-18:30'},
          {l:'화 요 일', t:'09:30-20:30', badge:'야간'},
          {l:'토 · 일', t:'09:30-14:00'},
          {l:'휴게시간', t:'13:00-14:00'},
        ].map((r,i) => {
          const y = 52 + i * 16;
          return <g key={i}>
            <text x="18" y={y} fontSize="2.8" fontWeight="500" fill="#475569">{r.l}</text>
            <text x="56" y={y} fontSize="2.2" fill="#94a3b8">:</text>
            <text x="62" y={y} fontSize="3" fontWeight="700" fill="#1e293b">{r.t}</text>
            {r.badge && <><rect x="90" y={y - 5} width="13" height="6" rx="3" fill="#dbeafe" /><text x="96.5" y={y - 1} textAnchor="middle" fontSize="2" fontWeight="700" fill="#2563eb">{r.badge}</text></>}
            {i < 3 && <line x1="16" y1={y + 6} x2="104" y2={y + 6} stroke="#f1f5f9" strokeWidth="0.4" />}
          </g>;
        })}
        {/* 위치 정보 */}
        <rect x="22" y="120" width="76" height="10" rx="5" fill="#f0fdf4" stroke="#86efac" strokeWidth="0.3" />
        <text x="60" y="127" textAnchor="middle" fontSize="2.5" fontWeight="600" fill="#166534">🚇 1번 출구 도보 3분</text>
        <text x="60" y="150" textAnchor="middle" fontSize="3" fontWeight="700" fill="#2563eb">🦷 {name}</text>
      </>);
    }
    if (hint === 'hl_countdown') {
      // 네이비 프리미엄
      return wrap(<>
        <rect x="0" y="0" width="120" height="160" rx="6" fill="#1e293b" />
        {/* 골드 장식 */}
        <line x1="14" y1="10" x2="106" y2="10" stroke="#d4a853" strokeWidth="0.4" />
        <line x1="14" y1="12" x2="106" y2="12" stroke="#d4a853" strokeWidth="0.2" />
        <text x="60" y="24" textAnchor="middle" fontSize="3" fontWeight="600" fill="#d4a853" letterSpacing="1">{name}</text>
        {/* 타이틀 */}
        <text x="60" y="42" textAnchor="middle" fontSize="10" fontWeight="900" fill="white">{mo}월 휴진</text>
        <text x="60" y="54" textAnchor="middle" fontSize="4" fontWeight="500" fill="#d4a853" letterSpacing="2">안내</text>
        {/* 화이트 카드 */}
        <rect x="14" y="62" width="92" height="52" rx="5" fill="white" fillOpacity="0.97" />
        {[{d:'월',n:9,cls:true},{d:'화',n:10},{d:'수',n:11},{d:'목',n:12},{d:'금',n:13},{d:'토',n:14},{d:'일',n:15,cls:true}].map((item,i) => {
          const cx = 22 + i * 12;
          return <g key={i}>
            <text x={cx} y="72" textAnchor="middle" fontSize="2.5" fontWeight="600" fill={item.cls ? '#d4a853' : '#94a3b8'}>{item.d}</text>
            <text x={cx} y="88" textAnchor="middle" fontSize="5" fontWeight={item.cls ? '900' : '400'} fill={item.cls ? '#1e293b' : '#64748b'}>{item.n}</text>
            {item.cls && <rect x={cx - 7} y="92" width="14" height="5" rx="2.5" fill="#1e293b" fillOpacity="0.1" />}
            {item.cls && <text x={cx} y="96" textAnchor="middle" fontSize="2" fontWeight="700" fill="#1e293b">휴진</text>}
          </g>;
        })}
        <line x1="14" y1="108" x2="106" y2="108" stroke="#d4a853" strokeWidth="0.3" />
        {/* 하단 */}
        <rect x="14" y="114" width="92" height="16" rx="4" fill="#d4a853" fillOpacity="0.08" />
        <text x="60" y="124" textAnchor="middle" fontSize="3" fontWeight="600" fill="#d4a853">진료시간 09:30~18:00</text>
        <line x1="14" y1="148" x2="106" y2="148" stroke="#d4a853" strokeWidth="0.2" />
        <text x="60" y="155" textAnchor="middle" fontSize="2.5" fill="#d4a853">{name}</text>
      </>);
    }
    if (hint === 'stamp' || hint === 'rip' || hint === 'slash') {
      // 레거시 폴백
      return wrap(<>
        <text x="60" y="13" textAnchor="middle" fontSize="4" fontWeight="600" fill={a} letterSpacing="0.5">{name}</text>
        <text x="60" y="26" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={c}>{mo}월 휴진 안내</text>
        <circle cx="40" cy="58" r="20" fill={c} fillOpacity="0.04" stroke={c} strokeWidth="2" />
        <text x="40" y="55" textAnchor="middle" fontSize="14" fontWeight="900" fill={c}>9</text>
        <text x="40" y="68" textAnchor="middle" fontSize="3.5" fontWeight="700" fill={a}>CLOSED</text>
        <circle cx="80" cy="58" r="20" fill="#ef4444" fillOpacity="0.04" stroke="#ef4444" strokeWidth="2" />
        <text x="80" y="55" textAnchor="middle" fontSize="14" fontWeight="900" fill="#ef4444">15</text>
        <text x="80" y="68" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="#dc2626">CLOSED</text>
        <rect x="10" y="106" width="100" height="20" rx="5" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
      </>);
    }
    if (hint === 'circle' || hint === 'countdown') {
      // 레거시 폴백
      return wrap(<>
        <text x="60" y="13" textAnchor="middle" fontSize="4" fontWeight="600" fill={a} letterSpacing="0.5">{name}</text>
        <text x="60" y="26" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={c}>{mo}월 휴진</text>
        <circle cx="60" cy="64" r="28" fill="white" fillOpacity="0.5" />
        <circle cx="60" cy="64" r="28" fill="none" stroke={`url(#accent_${t.id})`} strokeWidth="2.5" strokeDasharray="44 132" strokeLinecap="round" transform="rotate(-90 60 64)" />
        <text x="60" y="61" textAnchor="middle" fontSize="16" fontWeight="900" fill={c}>D-3</text>
        <text x="60" y="73" textAnchor="middle" fontSize="4" fontWeight="600" fill={a}>휴진까지</text>
      </>);
    }
    // list layout
    return wrap(<>
      <text x="60" y="13" textAnchor="middle" fontSize="4" fontWeight="600" fill={a} letterSpacing="0.5">{name}</text>
      <text x="60" y="25" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={c}>{mo}월 진료 안내</text>
      {[
        {d:'9일 (월)', s:'휴진', sc:'#ef4444', bg:'#fef2f2'},
        {d:'15일 (일)', s:'휴진', sc:'#ef4444', bg:'#fef2f2'},
        {d:'22일 (토)', s:'단축진료', sc:'#d97706', bg:'#fffbeb'},
      ].map(({d,s,sc,bg: bgc}, i) => (<g key={i}>
        <rect x="10" y={34 + i * 20} width="100" height="16" rx="5" fill={bgc} />
        <circle cx="22" cy={42 + i * 20} r="4" fill={sc} fillOpacity="0.15" />
        <text x="22" y={43.5 + i * 20} textAnchor="middle" fontSize="3.5" fontWeight="800" fill={sc}>{i+1}</text>
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
    if (h === 'price') {
      return wrap(<>
        {/* 할인 배너 - 대형 할인율 + 가격 비교 */}
        <rect x="8" y="5" width="104" height="24" rx="5" fill={`url(#accent_${t.id})`} fillOpacity="0.9" />
        <text x="60" y="14" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="white" letterSpacing="0.5">{name}</text>
        <text x="60" y="24" textAnchor="middle" fontSize="5.5" fontWeight="800" fill="white">임플란트 이벤트</text>
        {/* 대형 할인 배지 */}
        <circle cx="60" cy="50" r="18" fill={c} fillOpacity="0.1" />
        <circle cx="60" cy="50" r="14" fill={c} fillOpacity="0.15" />
        <text x="60" y="48" textAnchor="middle" fontSize="12" fontWeight="900" fill={c}>30%</text>
        <text x="60" y="56" textAnchor="middle" fontSize="4" fontWeight="800" fill={a}>OFF</text>
        {/* 가격 비교 카드 */}
        <rect x="12" y="72" width="96" height="32" rx="6" fill="white" fillOpacity="0.95" filter={`url(#shadow_${t.id})`} />
        <text x="60" y="83" textAnchor="middle" fontSize="4.5" fill="#94a3b8" textDecoration="line-through">990,000원</text>
        <text x="60" y="97" textAnchor="middle" fontSize="11" fontWeight="900" fill={c}>690,000원</text>
        <rect x="15" y="108" width="90" height="9" rx="4.5" fill={c} fillOpacity="0.06" />
        <text x="60" y="114.5" textAnchor="middle" fontSize="3.5" fill="#64748b">2026.03.01 ~ 03.31</text>
        <rect x="20" y="122" width="80" height="14" rx="7" fill={`url(#accent_${t.id})`} fillOpacity="0.9" />
        <text x="60" y="131.5" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">지금 바로 예약하세요</text>
      </>);
    }
    if (h === 'elegant') {
      return wrap(<>
        {/* 엘레강스 - 골드 라인 장식 */}
        <text x="60" y="14" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={a} letterSpacing="1">{name}</text>
        <line x1="20" y1="18" x2="100" y2="18" stroke={c} strokeOpacity="0.15" strokeWidth="0.4" />
        <text x="60" y="32" textAnchor="middle" fontSize="3.5" fill={a} letterSpacing="2">IMPLANT EVENT</text>
        <text x="60" y="46" textAnchor="middle" fontSize="8" fontWeight="800" fill={c}>임플란트 이벤트</text>
        <line x1="30" y1="52" x2="90" y2="52" stroke={c} strokeOpacity="0.15" strokeWidth="0.4" />
        {/* 우아한 가격 */}
        <rect x="15" y="58" width="90" height="36" rx="6" fill="white" fillOpacity="0.6" stroke={c} strokeOpacity="0.08" strokeWidth="0.3" />
        <text x="60" y="70" textAnchor="middle" fontSize="4" fill="#94a3b8" letterSpacing="1">SPECIAL PRICE</text>
        <text x="60" y="87" textAnchor="middle" fontSize="12" fontWeight="800" fill={c}>690,000원</text>
        <line x1="20" y1="98" x2="100" y2="98" stroke={c} strokeOpacity="0.15" strokeWidth="0.4" />
        <text x="60" y="108" textAnchor="middle" fontSize="3.5" fill="#64748b">2026.03.01 ~ 03.31</text>
        <rect x="25" y="116" width="70" height="12" rx="6" fill={`url(#accent_${t.id})`} fillOpacity="0.85" />
        <text x="60" y="124" textAnchor="middle" fontSize="3.8" fontWeight="700" fill="white">예약 상담</text>
      </>);
    }
    if (h === 'pop') {
      return wrap(<>
        {/* 팝 컬러풀 - 폭발 효과 + 활기찬 */}
        <text x="60" y="12" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={a}>{name}</text>
        {/* 폭발 배경 */}
        {[0,45,90,135,180,225,270,315].map((angle, i) => (
          <line key={i} x1="60" y1="58" x2={60 + Math.cos(angle * Math.PI / 180) * 32} y2={58 + Math.sin(angle * Math.PI / 180) * 32} stroke={c} strokeOpacity="0.06" strokeWidth="2" />
        ))}
        <circle cx="60" cy="58" r="26" fill={c} fillOpacity="0.1" />
        <circle cx="60" cy="58" r="20" fill={c} fillOpacity="0.12" />
        <text x="60" y="50" textAnchor="middle" fontSize="4" fontWeight="800" fill={a}>EVENT</text>
        <text x="60" y="62" textAnchor="middle" fontSize="12" fontWeight="900" fill={c}>30%</text>
        <text x="60" y="70" textAnchor="middle" fontSize="4" fontWeight="800" fill={a}>할인</text>
        <text x="60" y="86" textAnchor="middle" fontSize="7" fontWeight="800" fill={c}>임플란트</text>
        <rect x="20" y="92" width="80" height="12" rx="6" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
        <text x="60" y="100.5" textAnchor="middle" fontSize="5" fontWeight="900" fill={c}>690,000원</text>
        <text x="60" y="112" textAnchor="middle" fontSize="3.5" fill="#64748b">2026.03.01 ~ 03.31</text>
        <rect x="20" y="118" width="80" height="14" rx="7" fill={`url(#accent_${t.id})`} fillOpacity="0.9" />
        <text x="60" y="127.5" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">지금 바로 예약!</text>
      </>);
    }
    if (h === 'minimal') {
      return wrap(<>
        {/* 미니멀 모던 - 넓은 여백 + 단순 */}
        <text x="60" y="20" textAnchor="middle" fontSize="3" fontWeight="500" fill="#94a3b8" letterSpacing="2">IMPLANT EVENT</text>
        <text x="60" y="42" textAnchor="middle" fontSize="7" fontWeight="800" fill={c}>임플란트</text>
        <text x="60" y="54" textAnchor="middle" fontSize="7" fontWeight="800" fill={c}>특별 할인</text>
        <rect x="45" y="60" width="30" height="0.5" fill={c} fillOpacity="0.2" />
        <rect x="15" y="68" width="90" height="30" rx="6" fill="white" fillOpacity="0.95" filter={`url(#shadow_${t.id})`} />
        <text x="60" y="80" textAnchor="middle" fontSize="3.5" fill="#94a3b8" letterSpacing="0.5">Special Offer</text>
        <text x="60" y="93" textAnchor="middle" fontSize="11" fontWeight="800" fill={c}>690,000원</text>
        <text x="60" y="110" textAnchor="middle" fontSize="3" fill="#94a3b8">2026.03.01 ~ 03.31</text>
        <rect x="30" y="118" width="60" height="12" rx="6" fill={c} fillOpacity="0.08" />
        <text x="60" y="126" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={c}>예약 문의</text>
        <text x="60" y="152" textAnchor="middle" fontSize="2.5" fill="#94a3b8">{name}</text>
      </>);
    }
    if (h === 'wave') {
      return wrap(<>
        {/* 그라데이션 웨이브 - 물결 배경 */}
        <text x="60" y="14" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={a}>{name}</text>
        <text x="60" y="28" textAnchor="middle" fontSize="7" fontWeight="800" fill={c}>임플란트 이벤트</text>
        {/* 물결 패턴 */}
        <path d="M0,36 Q30,30 60,36 Q90,42 120,36 L120,50 Q90,56 60,50 Q30,44 0,50 Z" fill={c} fillOpacity="0.06" />
        <path d="M0,44 Q30,38 60,44 Q90,50 120,44 L120,58 Q90,64 60,58 Q30,52 0,58 Z" fill={c} fillOpacity="0.04" />
        <rect x="15" y="62" width="90" height="36" rx="8" fill="white" fillOpacity="0.85" filter={`url(#shadow_${t.id})`} />
        <text x="60" y="74" textAnchor="middle" fontSize="3.5" fill={a} letterSpacing="0.5">Limited Time Offer</text>
        <text x="60" y="90" textAnchor="middle" fontSize="11" fontWeight="800" fill={c}>690,000원</text>
        <path d="M0,104 Q30,98 60,104 Q90,110 120,104 L120,118 Q90,124 60,118 Q30,112 0,118 Z" fill={c} fillOpacity="0.04" />
        <text x="60" y="112" textAnchor="middle" fontSize="3.5" fill="#64748b">2026.03.01 ~ 03.31</text>
        <rect x="25" y="124" width="70" height="12" rx="6" fill={`url(#accent_${t.id})`} fillOpacity="0.9" />
        <text x="60" y="132" textAnchor="middle" fontSize="3.8" fontWeight="700" fill="white">예약하기</text>
      </>);
    }
    // season (fallback)
    return wrap(<>
      {/* 시즌 스페셜 - 계절감 장식 */}
      <text x="60" y="12" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={a}>{name}</text>
      {/* 상단 배너 */}
      <rect x="10" y="16" width="100" height="26" rx="6" fill={c} fillOpacity="0.06" stroke={c} strokeOpacity="0.1" strokeWidth="0.4" />
      <text x="60" y="26" textAnchor="middle" fontSize="3" fill={a} letterSpacing="1">SEASON SPECIAL</text>
      <text x="60" y="37" textAnchor="middle" fontSize="6" fontWeight="800" fill={c}>임플란트 이벤트</text>
      {/* 꽃잎/별 장식 */}
      <circle cx="20" cy="52" r="4" fill={c} fillOpacity="0.06" />
      <circle cx="100" cy="52" r="3" fill={c} fillOpacity="0.05" />
      <circle cx="15" cy="90" r="2.5" fill={c} fillOpacity="0.04" />
      <rect x="15" y="50" width="90" height="38" rx="8" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
      <text x="60" y="63" textAnchor="middle" fontSize="3.5" fill={a}>Season Special</text>
      <text x="60" y="80" textAnchor="middle" fontSize="11" fontWeight="800" fill={c}>690,000원</text>
      <rect x="20" y="94" width="80" height="9" rx="4.5" fill={c} fillOpacity="0.06" />
      <text x="60" y="100.5" textAnchor="middle" fontSize="3.5" fill="#64748b">2026.03.01 ~ 03.31</text>
      <rect x="20" y="110" width="80" height="14" rx="7" fill={`url(#accent_${t.id})`} fillOpacity="0.9" />
      <text x="60" y="119.5" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">지금 바로 예약하세요</text>
    </>);
  }

  if (category === 'doctor') {
    return wrap(<>
      <text x="60" y="12" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={a} letterSpacing="0.5">{name}</text>
      {t.layoutHint === 'split' ? <>
        {/* 좌우 분할 */}
        <rect x="5" y="18" width="50" height="94" rx="6" fill={c} fillOpacity="0.06" />
        <circle cx="30" cy="50" r="17" fill="white" fillOpacity="0.8" stroke={c} strokeOpacity="0.15" strokeWidth="0.5" />
        <rect x="22" y="42" width="16" height="16" rx="3" fill={c} fillOpacity="0.08" />
        <text x="30" y="52" textAnchor="middle" fontSize="5" fill={c} fillOpacity="0.5">PHOTO</text>
        <text x="85" y="36" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={c}>김윈에이드</text>
        <rect x="67" y="40" width="36" height="8" rx="4" fill={c} fillOpacity="0.08" />
        <text x="85" y="46" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={a}>치과 전문의</text>
        {['서울대 치대 졸업','임플란트 전문','경력 10년'].map((t2,i) => (
          <g key={i}>
            <circle cx="63" cy={59 + i * 10} r="1" fill={c} fillOpacity="0.3" />
            <text x="67" y={61 + i * 10} fontSize="3.2" fill="#64748b">{t2}</text>
          </g>
        ))}
        <text x="85" y="100" textAnchor="middle" fontSize="3" fill={a}>"환자분의 미소가 저의 보람입니다"</text>
      </> : t.layoutHint === 'luxury' ? <>
        {/* 다크 프리미엄 */}
        <rect x="5" y="16" width="110" height="130" rx="6" fill="#0f172a" />
        <line x1="25" y1="24" x2="95" y2="24" stroke="#d4a017" strokeOpacity="0.2" strokeWidth="0.3" />
        <circle cx="60" cy="52" r="18" fill="#d4a017" fillOpacity="0.05" stroke="#d4a017" strokeOpacity="0.2" strokeWidth="0.5" />
        <text x="60" y="55" textAnchor="middle" fontSize="5" fill="#d4a017" fillOpacity="0.4">PHOTO</text>
        <text x="60" y="82" textAnchor="middle" fontSize="7" fontWeight="800" fill="#d4a017">김윈에이드</text>
        <rect x="35" y="86" width="50" height="9" rx="4.5" fill="#d4a017" fillOpacity="0.08" />
        <text x="60" y="92.5" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#b8860b">치과 전문의</text>
        <text x="60" y="106" textAnchor="middle" fontSize="3" fill="#94a3b8">서울대 치대 | 임플란트 전문</text>
        <line x1="30" y1="115" x2="90" y2="115" stroke="#d4a017" strokeOpacity="0.15" strokeWidth="0.3" />
        <text x="60" y="128" textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#d4a017">{name}</text>
      </> : t.layoutHint === 'portrait' ? <>
        {/* 정장 포트레이트 - 공식 프로필형 */}
        <rect x="10" y="18" width="100" height="120" rx="6" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
        <rect x="10" y="18" width="100" height="28" rx="6" fill={c} fillOpacity="0.06" />
        {/* 사각 프로필 */}
        <rect x="35" y="22" width="50" height="50" rx="4" fill={c} fillOpacity="0.04" stroke={c} strokeOpacity="0.1" strokeWidth="0.5" />
        <text x="60" y="50" textAnchor="middle" fontSize="5" fill={c} fillOpacity="0.3">PHOTO</text>
        <text x="60" y="82" textAnchor="middle" fontSize="7" fontWeight="800" fill={c}>김윈에이드</text>
        <rect x="30" y="86" width="60" height="8" rx="4" fill={`url(#accent_${t.id})`} fillOpacity="0.9" />
        <text x="60" y="92" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white">치과 전문의</text>
        {['서울대 치의학 박사','임플란트 전문','경력 10년'].map((t2,i) => (
          <g key={i}>
            <rect x="18" y={100 + i * 10} width="84" height="8" rx="2" fill={c} fillOpacity={i % 2 === 0 ? 0.03 : 0.01} />
            <text x="60" y={106 + i * 10} textAnchor="middle" fontSize="3.2" fill="#64748b">{t2}</text>
          </g>
        ))}
        <text x="60" y="145" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={a}>{name}</text>
      </> : t.layoutHint === 'curve' ? <>
        {/* 친근한 곡선형 */}
        <path d="M0,55 Q60,35 120,55 L120,160 L0,160 Z" fill={c} fillOpacity="0.04" />
        <circle cx="60" cy="48" r="22" fill="white" fillOpacity="0.95" filter={`url(#shadow_${t.id})`} />
        <circle cx="60" cy="48" r="20" fill={c} fillOpacity="0.03" stroke={c} strokeOpacity="0.08" strokeWidth="0.5" />
        <text x="60" y="51" textAnchor="middle" fontSize="5" fill={c} fillOpacity="0.3">PHOTO</text>
        <text x="60" y="82" textAnchor="middle" fontSize="7" fontWeight="800" fill={c}>김윈에이드</text>
        <rect x="35" y="86" width="50" height="8" rx="4" fill={c} fillOpacity="0.08" />
        <text x="60" y="92" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={a}>치과 전문의</text>
        <rect x="15" y="100" width="90" height="30" rx="8" fill="white" fillOpacity="0.8" filter={`url(#shadow_${t.id})`} />
        <text x="60" y="112" textAnchor="middle" fontSize="3.2" fill={a} fontStyle="italic">"환자분의 미소가</text>
        <text x="60" y="120" textAnchor="middle" fontSize="3.2" fill={a} fontStyle="italic">저의 보람입니다"</text>
        <text x="60" y="145" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={a}>{name}</text>
      </> : t.layoutHint === 'story' ? <>
        {/* 따뜻한 스토리형 - 인사말 중심 */}
        <rect x="8" y="16" width="104" height="128" rx="6" fill="white" fillOpacity="0.5" />
        <circle cx="30" cy="32" r="12" fill={c} fillOpacity="0.04" stroke={c} strokeOpacity="0.1" strokeWidth="0.5" />
        <text x="30" y="35" textAnchor="middle" fontSize="4" fill={c} fillOpacity="0.3">PHOTO</text>
        <text x="80" y="28" fontSize="3" fontWeight="600" fill={a}>치과 전문의</text>
        <text x="80" y="38" fontSize="5.5" fontWeight="800" fill={c}>김윈에이드</text>
        <line x1="15" y1="50" x2="105" y2="50" stroke={c} strokeOpacity="0.08" strokeWidth="0.3" />
        <rect x="12" y="56" width="96" height="52" rx="6" fill={c} fillOpacity="0.03" />
        <text x="60" y="68" textAnchor="middle" fontSize="3.8" fill="#475569">"안녕하세요.</text>
        <text x="60" y="76" textAnchor="middle" fontSize="3.8" fill="#475569">여러분의 건강한 미소를</text>
        <text x="60" y="84" textAnchor="middle" fontSize="3.8" fill="#475569">위해 항상 노력하겠습니다.</text>
        <text x="60" y="98" textAnchor="middle" fontSize="3.8" fill={a} fontWeight="600">편안하게 찾아주세요."</text>
        <rect x="15" y="114" width="90" height="18" rx="5" fill="white" fillOpacity="0.8" filter={`url(#shadow_${t.id})`} />
        {['서울대 치대 | 임플란트 전문 | 경력 10년'].map((t2,i) => (
          <text key={i} x="60" y={125} textAnchor="middle" fontSize="3" fill="#94a3b8">{t2}</text>
        ))}
        <text x="60" y="148" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={a}>{name}</text>
      </> : t.layoutHint === 'grid' ? <>
        {/* 클린 그리드 - 정보 정리형 */}
        <circle cx="36" cy="36" r="14" fill="white" fillOpacity="0.9" stroke={c} strokeOpacity="0.1" strokeWidth="0.5" filter={`url(#shadow_${t.id})`} />
        <text x="36" y="39" textAnchor="middle" fontSize="4" fill={c} fillOpacity="0.3">PHOTO</text>
        <text x="84" y="30" textAnchor="middle" fontSize="5.5" fontWeight="800" fill={c}>김윈에이드</text>
        <rect x="67" y="34" width="36" height="7" rx="3.5" fill={c} fillOpacity="0.08" />
        <text x="85" y="39.5" textAnchor="middle" fontSize="3" fontWeight="600" fill={a}>치과 전문의</text>
        {/* 그리드 정보 카드 */}
        {[
          {label:'학력', val:'서울대 치대'},
          {label:'전공', val:'임플란트'},
          {label:'경력', val:'10년 이상'},
          {label:'학회', val:'대한치과의사협회'},
        ].map((item, i) => (
          <g key={i}>
            <rect x={i % 2 === 0 ? 8 : 64} y={56 + Math.floor(i/2) * 28} width="52" height="24" rx="4" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
            <text x={i % 2 === 0 ? 34 : 90} y={65 + Math.floor(i/2) * 28} textAnchor="middle" fontSize="2.8" fontWeight="700" fill={c}>{item.label}</text>
            <text x={i % 2 === 0 ? 34 : 90} y={74 + Math.floor(i/2) * 28} textAnchor="middle" fontSize="3.2" fill="#64748b">{item.val}</text>
          </g>
        ))}
        <rect x="25" y="120" width="70" height="10" rx="5" fill={`url(#accent_${t.id})`} fillOpacity="0.9" />
        <text x="60" y="148" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={a}>{name}</text>
      </> : <>
        {/* 기본형 - 원형 프로필 */}
        <circle cx="60" cy="48" r="19" fill="white" fillOpacity="0.9" stroke={c} strokeOpacity="0.1" strokeWidth="0.5" filter={`url(#shadow_${t.id})`} />
        <text x="60" y="51" textAnchor="middle" fontSize="5" fill={c} fillOpacity="0.35">PHOTO</text>
        <text x="60" y="80" textAnchor="middle" fontSize="7" fontWeight="800" fill={c}>김윈에이드</text>
        <rect x="30" y="84" width="60" height="9" rx="4.5" fill={c} fillOpacity="0.06" />
        <text x="60" y="90.5" textAnchor="middle" fontSize="3.8" fontWeight="600" fill={a}>치과 전문의</text>
        <rect x="12" y="98" width="96" height="32" rx="5" fill="white" fillOpacity="0.8" filter={`url(#shadow_${t.id})`} />
        {['서울대 치의학 박사','임플란트 10,000+ 케이스','대한치과의사협회 정회원'].map((t2,i) => (
          <g key={i}>
            <circle cx="20" cy={107 + i * 9} r="1.2" fill={c} fillOpacity="0.3" />
            <text x="25" y={109 + i * 9} fontSize="3.2" fill="#64748b">{t2}</text>
          </g>
        ))}
        <text x="60" y="145" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={a}>{name}</text>
      </>}
    </>);
  }

  if (category === 'notice') {
    return wrap(<>
      <text x="60" y="12" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={a} letterSpacing="0.5">{name}</text>
      {t.layoutHint === 'alert' ? <>
        <rect x="10" y="18" width="100" height="20" rx="5" fill={c} fillOpacity="0.1" />
        <circle cx="22" cy="28" r="4" fill={c} fillOpacity="0.15" />
        <text x="22" y="30" textAnchor="middle" fontSize="4.5" fontWeight="800" fill={c}>!</text>
        <text x="65" y="30" textAnchor="middle" fontSize="6" fontWeight="800" fill={c}>진료실 이전 안내</text>
        {/* 내용 카드 */}
        <rect x="10" y="42" width="100" height="62" rx="6" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
        {['2026년 4월 1일부터','새로운 장소에서 진료합니다.','','신주소: 서울시 강남구 ...'].map((line, i) => (
          <text key={i} x="60" y={53 + i * 10} textAnchor="middle" fontSize="3.8" fill={i === 0 ? c : '#475569'} fontWeight={i === 0 ? '700' : '400'}>{line}</text>
        ))}
      </> : t.layoutHint === 'formal' ? <>
        <rect x="10" y="18" width="100" height="2" rx="1" fill="#1f2937" />
        <text x="60" y="32" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#1f2937" letterSpacing="2">공 지 사 항</text>
        <rect x="10" y="36" width="100" height="0.5" fill="#1f2937" fillOpacity="0.3" />
        <rect x="10" y="42" width="100" height="62" rx="2" fill="white" fillOpacity="0.9" />
        {['2026년 4월 1일부터','새로운 장소에서 진료합니다.','','신주소: 서울시 강남구 ...'].map((line, i) => (
          <text key={i} x="60" y={53 + i * 10} textAnchor="middle" fontSize="3.8" fill={i === 0 ? '#1f2937' : '#475569'} fontWeight={i === 0 ? '700' : '400'}>{line}</text>
        ))}
        <rect x="10" y="106" width="100" height="0.5" fill="#1f2937" fillOpacity="0.2" />
      </> : t.layoutHint === 'timeline' ? <>
        <text x="60" y="28" textAnchor="middle" fontSize="6" fontWeight="800" fill={c}>진료실 이전 안내</text>
        {/* 타임라인 레이아웃 */}
        <rect x="18" y="36" width="2" height="80" rx="1" fill={c} fillOpacity="0.1" />
        {[
          {d:'3/15', t:'이전 공지'},
          {d:'3/25', t:'새 장소 준비'},
          {d:'4/1', t:'새 장소 진료 시작'},
          {d:'4/7', t:'정상 진료'},
        ].map((item, i) => (
          <g key={i}>
            <circle cx="19" cy={44 + i * 20} r="4" fill="white" stroke={c} strokeWidth="0.8" strokeOpacity="0.3" />
            <circle cx="19" cy={44 + i * 20} r="1.5" fill={c} fillOpacity="0.5" />
            <text x="28" y={42 + i * 20} fontSize="3" fontWeight="700" fill={c}>{item.d}</text>
            <text x="28" y={49 + i * 20} fontSize="3.2" fill="#64748b">{item.t}</text>
          </g>
        ))}
      </> : t.layoutHint === 'bulletin' ? <>
        {/* 게시판 스타일 - 핀/압정 장식 */}
        <rect x="8" y="16" width="104" height="120" rx="4" fill="#fefce8" stroke="#d4a017" strokeOpacity="0.15" strokeWidth="0.5" />
        {/* 압정 */}
        <circle cx="60" cy="16" r="3" fill="#d97706" fillOpacity="0.4" />
        <circle cx="60" cy="16" r="1.5" fill="#92400e" />
        <text x="60" y="30" textAnchor="middle" fontSize="6" fontWeight="800" fill="#92400e">진료실 이전 안내</text>
        <rect x="16" y="36" width="88" height="0.5" fill="#d4a017" fillOpacity="0.2" />
        {['2026년 4월 1일부터','새로운 장소에서 진료합니다.','','신주소: 서울시 강남구 ...'].map((line, i) => (
          <text key={i} x="60" y={48 + i * 10} textAnchor="middle" fontSize="3.8" fill={i === 0 ? '#92400e' : '#78350f'} fontWeight={i === 0 ? '700' : '400'}>{line}</text>
        ))}
        <text x="60" y="105" textAnchor="middle" fontSize="3" fill="#a16207">양해 부탁드립니다</text>
      </> : t.layoutHint === 'soft' ? <>
        {/* 소프트 안내 - 부드러운 라운드 */}
        <rect x="10" y="18" width="100" height="18" rx="9" fill={c} fillOpacity="0.06" />
        <circle cx="22" cy="27" r="3.5" fill={c} fillOpacity="0.1" />
        <text x="22" y="29" textAnchor="middle" fontSize="4" fill={c}>i</text>
        <text x="65" y="29" textAnchor="middle" fontSize="5" fontWeight="700" fill={c}>진료실 이전 안내</text>
        {/* 둥근 내용 카드들 */}
        {['2026년 4월 1일부터','새 장소에서 진료합니다','서울시 강남구 ...'].map((line, i) => (
          <g key={i}>
            <rect x="12" y={42 + i * 18} width="96" height="14" rx="7" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
            <circle cx="22" cy={49 + i * 18} r="2" fill={c} fillOpacity="0.1" />
            <text x="30" y={51 + i * 18} fontSize="3.5" fill="#475569">{line}</text>
          </g>
        ))}
        <rect x="25" y="102" width="70" height="12" rx="6" fill={c} fillOpacity="0.06" />
        <text x="60" y="110" textAnchor="middle" fontSize="3.2" fill={a}>양해 부탁드립니다</text>
      </> : t.layoutHint === 'popup' ? <>
        {/* 카드 팝업 - 떠오르는 카드 */}
        <rect x="14" y="20" width="92" height="110" rx="8" fill="white" fillOpacity="0.95" filter={`url(#shadow_${t.id})`} />
        <rect x="14" y="20" width="92" height="18" rx="8" fill={`url(#accent_${t.id})`} />
        <circle cx="24" cy="29" r="3" fill="white" fillOpacity="0.3" />
        <text x="24" y="31" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">!</text>
        <text x="64" y="31" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="white">이전 안내</text>
        {['2026년 4월 1일부터','새로운 장소에서 진료합니다.','','신주소: 서울시 강남구 ...'].map((line, i) => (
          <text key={i} x="60" y={48 + i * 10} textAnchor="middle" fontSize="3.8" fill={i === 0 ? c : '#475569'} fontWeight={i === 0 ? '700' : '400'}>{line}</text>
        ))}
        <rect x="30" y="102" width="60" height="12" rx="6" fill={`url(#accent_${t.id})`} fillOpacity="0.9" />
        <text x="60" y="110" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="white">확인</text>
      </> : <>
        <text x="60" y="28" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={c}>진료실 이전 안내</text>
        <rect x="10" y="38" width="100" height="62" rx="6" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
        {['2026년 4월 1일부터','새로운 장소에서 진료합니다.','','신주소: 서울시 강남구 ...'].map((line, i) => (
          <text key={i} x="60" y={49 + i * 10} textAnchor="middle" fontSize="3.8" fill={i === 0 ? c : '#475569'} fontWeight={i === 0 ? '700' : '400'}>{line}</text>
        ))}
      </>}
      <text x="60" y="112" textAnchor="middle" fontSize="3" fill="#94a3b8">양해 부탁드립니다</text>
      <text x="60" y="148" textAnchor="middle" fontSize="3" fill="#94a3b8">{name}</text>
    </>);
  }

  if (category === 'greeting') {
    // 명절별 전용 텍스트 & 장식 (템플릿 ID 접두사로 판별)
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

    // 설날 전용 장식 — 복주머니 + 전통 문양
    const seolDeco = isSeol ? <>
      {/* 좌상단 복주머니 */}
      <ellipse cx="18" cy="22" rx="8" ry="10" fill="#dc2626" fillOpacity="0.25" />
      <path d="M12,16 Q18,12 24,16" fill="none" stroke="#fbbf24" strokeWidth="0.8" strokeOpacity="0.5" />
      <text x="18" y="24" textAnchor="middle" fontSize="4" fontWeight="700" fill="#dc2626" fillOpacity="0.4">福</text>
      {/* 우상단 매듭 장식 */}
      <circle cx="102" cy="18" r="3" fill="#dc2626" fillOpacity="0.2" />
      <line x1="102" y1="21" x2="102" y2="32" stroke="#dc2626" strokeWidth="0.5" strokeOpacity="0.2" />
      <path d="M99,26 Q102,24 105,26 Q102,28 99,26" fill="#dc2626" fillOpacity="0.15" />
      {/* 하단 전통 구름 */}
      <path d="M10,135 Q20,130 30,135 Q38,130 46,135" fill="none" stroke={c} strokeWidth="0.6" strokeOpacity="0.15" />
      <path d="M74,140 Q84,135 94,140 Q102,135 110,140" fill="none" stroke={c} strokeWidth="0.6" strokeOpacity="0.12" />
      {/* 금색 동전 장식 */}
      <circle cx="100" cy="130" r="3" fill="#fbbf24" fillOpacity="0.15" stroke="#fbbf24" strokeWidth="0.4" strokeOpacity="0.2" />
      <rect x="98.5" y="129" width="3" height="2" rx="1" fill="#fbbf24" fillOpacity="0.12" />
    </> : null;
    // 추석 전용 장식 — 대형 보름달 + 코스모스 + 벼이삭
    const chskDeco = isChsk ? <>
      {/* 대형 보름달 */}
      <circle cx="60" cy="30" r="18" fill="#fbbf24" fillOpacity="0.2" />
      <circle cx="60" cy="30" r="14" fill="#fbbf24" fillOpacity="0.15" />
      <circle cx="55" cy="27" r="2" fill="#fbbf24" fillOpacity="0.1" />
      <circle cx="64" cy="32" r="1.5" fill="#fbbf24" fillOpacity="0.08" />
      {/* 좌측 벼이삭 */}
      <path d="M8,100 Q10,80 14,60" fill="none" stroke="#d97706" strokeWidth="0.7" strokeOpacity="0.25" />
      <ellipse cx="12" cy="70" rx="3" ry="1.5" fill="#fbbf24" fillOpacity="0.15" transform="rotate(-20 12 70)" />
      <ellipse cx="10" cy="78" rx="3" ry="1.5" fill="#fbbf24" fillOpacity="0.12" transform="rotate(-25 10 78)" />
      <ellipse cx="13" cy="86" rx="3" ry="1.5" fill="#fbbf24" fillOpacity="0.1" transform="rotate(-15 13 86)" />
      {/* 우측 코스모스 */}
      <circle cx="106" cy="80" r="4" fill="#f9a8d4" fillOpacity="0.15" />
      <circle cx="106" cy="80" r="1" fill="#fbbf24" fillOpacity="0.2" />
      <circle cx="100" cy="90" r="3" fill="#ec4899" fillOpacity="0.12" />
      <circle cx="100" cy="90" r="0.8" fill="#fbbf24" fillOpacity="0.15" />
      {/* 하단 단풍잎 라인 */}
      <path d="M20,145 Q40,140 60,145 Q80,140 100,145" fill="none" stroke="#ea580c" strokeWidth="0.6" strokeOpacity="0.2" />
    </> : null;
    // 새해 전용 장식 — 불꽃놀이 + 별
    const newyDeco = isNewy ? <>
      {/* 배경 2026 워터마크 */}
      <text x="60" y="30" textAnchor="middle" fontSize="14" fontWeight="900" fill={c} fillOpacity="0.12">2026</text>
      {/* 불꽃놀이 - 좌측 */}
      {[0,60,120,180,240,300].map((deg, i) => (
        <line key={`fl${i}`} x1="22" y1="20" x2={22 + Math.cos(deg * Math.PI / 180) * 8} y2={20 + Math.sin(deg * Math.PI / 180) * 8} stroke="#fbbf24" strokeWidth="0.8" strokeOpacity="0.35" />
      ))}
      <circle cx="22" cy="20" r="2" fill="#fbbf24" fillOpacity="0.25" />
      {/* 불꽃놀이 - 우측 */}
      {[0,45,90,135,180,225,270,315].map((deg, i) => (
        <line key={`fr${i}`} x1="98" y1="18" x2={98 + Math.cos(deg * Math.PI / 180) * 6} y2={18 + Math.sin(deg * Math.PI / 180) * 6} stroke="#a78bfa" strokeWidth="0.6" strokeOpacity="0.35" />
      ))}
      <circle cx="98" cy="18" r="1.5" fill="#a78bfa" fillOpacity="0.25" />
      {/* 별/반짝임 */}
      <text x="40" y="14" fontSize="3" fill="#fbbf24" fillOpacity="0.35">✦</text>
      <text x="80" y="36" fontSize="2" fill="#ec4899" fillOpacity="0.25">✦</text>
      <text x="15" y="45" fontSize="2.5" fill="#60a5fa" fillOpacity="0.25">✧</text>
      <text x="105" y="50" fontSize="2" fill="#34d399" fillOpacity="0.2">★</text>
      {/* 컨페티 */}
      <rect x="30" y="10" width="2" height="4" rx="1" fill="#ec4899" fillOpacity="0.2" transform="rotate(25 31 12)" />
      <rect x="88" y="30" width="1.5" height="3.5" rx="0.75" fill="#fbbf24" fillOpacity="0.18" transform="rotate(-15 89 32)" />
      <rect x="12" y="55" width="1.5" height="3" rx="0.75" fill="#60a5fa" fillOpacity="0.15" transform="rotate(35 13 56)" />
    </> : null;
    // 어버이날 전용 장식 — 풍성한 카네이션
    const parentDeco = isParent ? <>
      {/* 좌상단 큰 카네이션 */}
      <g transform="translate(20,20)">
        <circle cx="0" cy="0" r="6" fill="#e11d48" fillOpacity="0.3" />
        <circle cx="-3" cy="-3" r="4" fill="#e11d48" fillOpacity="0.25" />
        <circle cx="3" cy="-2" r="3.5" fill="#fb7185" fillOpacity="0.2" />
        <circle cx="0" cy="-5" r="3" fill="#f43f5e" fillOpacity="0.15" />
        <path d="M-1,6 Q0,14 1,22" fill="none" stroke="#22c55e" strokeWidth="1" strokeOpacity="0.25" />
        <ellipse cx="-4" cy="12" rx="3" ry="1.5" fill="#22c55e" fillOpacity="0.15" transform="rotate(-30 -4 12)" />
        <ellipse cx="4" cy="16" rx="3" ry="1.5" fill="#22c55e" fillOpacity="0.12" transform="rotate(25 4 16)" />
      </g>
      {/* 우상단 카네이션 */}
      <g transform="translate(100,24) scale(0.7)">
        <circle cx="0" cy="0" r="5" fill="#e11d48" fillOpacity="0.25" />
        <circle cx="-2" cy="-3" r="3.5" fill="#fb7185" fillOpacity="0.2" />
        <circle cx="2" cy="-2" r="3" fill="#f43f5e" fillOpacity="0.15" />
        <path d="M0,5 Q0,12 1,18" fill="none" stroke="#22c55e" strokeWidth="0.8" strokeOpacity="0.2" />
      </g>
      {/* 좌하단 작은 카네이션 */}
      <g transform="translate(14,120) scale(0.5)">
        <circle cx="0" cy="0" r="5" fill="#e11d48" fillOpacity="0.2" />
        <circle cx="-2" cy="-2" r="3" fill="#fb7185" fillOpacity="0.15" />
        <path d="M0,5 Q0,10 0,15" fill="none" stroke="#22c55e" strokeWidth="0.6" strokeOpacity="0.18" />
      </g>
      {/* 우하단 카네이션 잎 */}
      <g transform="translate(106,130) scale(0.4)">
        <circle cx="0" cy="0" r="4" fill="#e11d48" fillOpacity="0.15" />
        <path d="M0,4 Q0,8 0,12" fill="none" stroke="#22c55e" strokeWidth="0.5" strokeOpacity="0.15" />
      </g>
      {/* 리본 */}
      <path d="M50,10 Q60,6 70,10" fill="none" stroke="#e11d48" strokeWidth="0.8" strokeOpacity="0.2" />
    </> : null;
    // 크리스마스 전용 장식 — 풍성한 트리 + 오너먼트 + 눈
    const xmasDeco = isXmas ? <>
      {/* 트리 레이어 */}
      <polygon points="60,8 48,24 72,24" fill="#22c55e" fillOpacity="0.22" />
      <polygon points="60,16 44,34 76,34" fill="#16a34a" fillOpacity="0.18" />
      <polygon points="60,24 40,42 80,42" fill="#15803d" fillOpacity="0.15" />
      <rect x="57" y="42" width="6" height="5" rx="1" fill="#78350f" fillOpacity="0.2" />
      {/* 별 토퍼 */}
      <text x="60" y="10" textAnchor="middle" fontSize="5" fill="#fbbf24" fillOpacity="0.5">★</text>
      {/* 오너먼트 (트리 위) */}
      <circle cx="53" cy="22" r="1.8" fill="#ef4444" fillOpacity="0.3" />
      <circle cx="67" cy="22" r="1.5" fill="#fbbf24" fillOpacity="0.25" />
      <circle cx="48" cy="32" r="1.5" fill="#3b82f6" fillOpacity="0.25" />
      <circle cx="72" cy="32" r="1.8" fill="#ef4444" fillOpacity="0.2" />
      <circle cx="56" cy="38" r="1.2" fill="#fbbf24" fillOpacity="0.2" />
      <circle cx="64" cy="36" r="1.5" fill="#22c55e" fillOpacity="0.15" />
      {/* 눈꽃 흩날림 */}
      <circle cx="16" cy="18" r="1.2" fill="white" fillOpacity="0.35" />
      <circle cx="100" cy="14" r="1" fill="white" fillOpacity="0.3" />
      <circle cx="28" cy="8" r="0.8" fill="white" fillOpacity="0.25" />
      <circle cx="92" cy="28" r="0.9" fill="white" fillOpacity="0.25" />
      <circle cx="10" cy="40" r="0.7" fill="white" fillOpacity="0.2" />
      <circle cx="110" cy="45" r="0.8" fill="white" fillOpacity="0.18" />
      <circle cx="20" cy="55" r="0.6" fill="white" fillOpacity="0.15" />
      {/* 선물 박스 */}
      <rect x="10" y="140" width="8" height="7" rx="1" fill="#ef4444" fillOpacity="0.15" />
      <rect x="102" y="138" width="7" height="6" rx="1" fill="#22c55e" fillOpacity="0.12" />
    </> : null;

    return wrap(<>
      {seolDeco}{chskDeco}{newyDeco}{parentDeco}{xmasDeco}
      {hint === 'traditional' ? <>
        {/* ━━ 전통 프레임 ━━ 강한 이중 테두리 + 큰 코너 장식 + 중앙 본문 */}
        <rect x="6" y="4" width="108" height="152" rx="3" fill={isDark ? '#0f172a' : '#fef9f0'} fillOpacity={isDark ? 0.6 : 0.7} stroke={c} strokeOpacity="0.35" strokeWidth="1.2" />
        <rect x="11" y="9" width="98" height="142" rx="2" fill="none" stroke={c} strokeOpacity="0.15" strokeWidth="0.5" strokeDasharray="3 2" />
        {/* 4코너 전통 ㄱ자 — 크고 진하게 */}
        <path d="M13,12 L32,12 L32,14.5 L15.5,14.5 L15.5,30 L13,30 Z" fill={c} fillOpacity="0.3" />
        <path d="M88,12 L107,12 L107,30 L104.5,30 L104.5,14.5 L88,14.5 Z" fill={c} fillOpacity="0.3" />
        <path d="M13,130 L13,148 L32,148 L32,145.5 L15.5,145.5 L15.5,130 Z" fill={c} fillOpacity="0.2" />
        <path d="M107,130 L107,148 L88,148 L88,145.5 L104.5,145.5 L104.5,130 Z" fill={c} fillOpacity="0.2" />
        {/* 코너 원 장식 */}
        <circle cx="24" cy="24" r="2.5" fill={c} fillOpacity="0.12" />
        <circle cx="96" cy="24" r="2.5" fill={c} fillOpacity="0.12" />
        {/* 상단 병원명 */}
        <text x="60" y="44" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={isDark ? '#fbbf24' : a}>{name}</text>
        {/* 굵은 인사말 */}
        <text x="60" y="62" textAnchor="middle" fontSize="10" fontWeight="900" fill={isDark ? '#fbbf24' : c}>{line1}</text>
        <text x="60" y="78" textAnchor="middle" fontSize="9" fontWeight="900" fill={isDark ? '#fbbf24' : c}>{line2}</text>
        <line x1="30" y1="86" x2="90" y2="86" stroke={c} strokeOpacity="0.2" strokeWidth="0.6" />
        <text x="60" y="98" textAnchor="middle" fontSize="3.5" fill={isDark ? '#94a3b8' : a}>{subLine}</text>
        {closureText && <><rect x="22" y="108" width="76" height="14" rx="5" fill={c} fillOpacity="0.08" /><text x="60" y="117" textAnchor="middle" fontSize="3.2" fill={isDark ? '#94a3b8' : '#64748b'}>{closureText}</text></>}
        <text x="60" y="140" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={isDark ? '#d4a017' : a}>{name}</text>
      </> : hint === 'luxury' ? <>
        {/* ━━ 럭셔리 다크 ━━ 네이비 배경 + 골드 프레임 + 큰 중앙 원 */}
        <rect x="4" y="3" width="112" height="154" rx="5" fill="#0f172a" />
        {/* 골드 테두리 */}
        <rect x="9" y="8" width="102" height="144" rx="4" fill="none" stroke="#d4a017" strokeOpacity="0.3" strokeWidth="0.6" />
        {/* 코너 골드 장식 */}
        <path d="M12,11 L24,11 L24,13 L14,13 L14,23 L12,23 Z" fill="#d4a017" fillOpacity="0.2" />
        <path d="M108,11 L96,11 L96,13 L106,13 L106,23 L108,23 Z" fill="#d4a017" fillOpacity="0.2" />
        <path d="M12,149 L12,137 L14,137 L14,147 L24,147 L24,149 Z" fill="#d4a017" fillOpacity="0.15" />
        <path d="M108,149 L108,137 L106,137 L106,147 L96,147 L96,149 Z" fill="#d4a017" fillOpacity="0.15" />
        {/* 큰 중앙 원형 장식 */}
        <circle cx="60" cy="56" r="28" fill="none" stroke="#d4a017" strokeOpacity="0.12" strokeWidth="0.5" />
        <circle cx="60" cy="56" r="24" fill="none" stroke="#d4a017" strokeOpacity="0.08" strokeWidth="0.3" strokeDasharray="2 2" />
        {/* 상단 골드 라인 */}
        <line x1="20" y1="22" x2="100" y2="22" stroke="#d4a017" strokeOpacity="0.2" strokeWidth="0.5" />
        <circle cx="18" cy="22" r="1.2" fill="#d4a017" fillOpacity="0.15" />
        <circle cx="102" cy="22" r="1.2" fill="#d4a017" fillOpacity="0.15" />
        {/* 본문 */}
        <text x="60" y="46" textAnchor="middle" fontSize="10.5" fontWeight="900" fill="#d4a017">{line1}</text>
        <text x="60" y="64" textAnchor="middle" fontSize="9.5" fontWeight="900" fill="#d4a017">{line2}</text>
        <line x1="35" y1="74" x2="85" y2="74" stroke="#d4a017" strokeOpacity="0.2" strokeWidth="0.4" />
        <text x="60" y="88" textAnchor="middle" fontSize="3.3" fill="#b8860b">{subLine}</text>
        {closureText && <><rect x="22" y="98" width="76" height="14" rx="4" fill="#d4a017" fillOpacity="0.06" /><text x="60" y="107" textAnchor="middle" fontSize="3" fill="#78716c">{closureText}</text></>}
        <line x1="20" y1="130" x2="100" y2="130" stroke="#d4a017" strokeOpacity="0.15" strokeWidth="0.3" />
        <text x="60" y="142" textAnchor="middle" fontSize="3.8" fontWeight="700" fill="#d4a017">{name}</text>
      </> : hint === 'cute' ? <>
        {/* ━━ 귀여운 스타일 ━━ 컬러풀 큰 도트 + 하트/별 + 상단에 병원명 */}
        {/* 파스텔 배경 서클들 — 크고 잘 보이게 */}
        <circle cx="20" cy="20" r="14" fill={c} fillOpacity="0.12" />
        <circle cx="100" cy="25" r="10" fill={a} fillOpacity="0.1" />
        <circle cx="60" cy="140" r="18" fill={c} fillOpacity="0.08" />
        <circle cx="10" cy="100" r="8" fill={a} fillOpacity="0.06" />
        <circle cx="108" cy="90" r="12" fill={c} fillOpacity="0.07" />
        {/* 하트/별 장식 — 잘 보이게 */}
        <text x="14" y="50" fontSize="5" fill={c} fillOpacity="0.3">♡</text>
        <text x="104" y="55" fontSize="4" fill={a} fillOpacity="0.25">✧</text>
        <text x="96" y="14" fontSize="3.5" fill={c} fillOpacity="0.2">♡</text>
        <text x="20" y="85" fontSize="3" fill={c} fillOpacity="0.2">★</text>
        <text x="100" y="120" fontSize="4" fill={a} fillOpacity="0.15">♡</text>
        <text x="14" y="130" fontSize="3" fill={c} fillOpacity="0.2">✧</text>
        {/* 상단 병원명 + 리본 */}
        <text x="60" y="14" textAnchor="middle" fontSize="3.5" fontWeight="700" fill={c}>{name}</text>
        {/* 큰 둥근 카드 영역 */}
        <rect x="16" y="22" width="88" height="80" rx="16" fill={c} fillOpacity="0.06" />
        {/* 본문 — 크고 둥근 느낌 */}
        <text x="60" y="50" textAnchor="middle" fontSize="10" fontWeight="900" fill={c}>{line1}</text>
        <text x="60" y="66" textAnchor="middle" fontSize="9" fontWeight="900" fill={c}>{line2}</text>
        <text x="60" y="86" textAnchor="middle" fontSize="3.5" fill={a}>{subLine}</text>
        {closureText && <><rect x="22" y="108" width="76" height="13" rx="6.5" fill={c} fillOpacity="0.1" /><text x="60" y="117" textAnchor="middle" fontSize="3" fill="#64748b">{closureText}</text></>}
        <text x="60" y="145" textAnchor="middle" fontSize="3" fill="#94a3b8">{name}</text>
      </> : hint === 'nature' ? <>
        {/* ━━ 자연/풍경 ━━ 상단에 하늘 그라데이션 + 하단에 큰 산 실루엣 */}
        {/* 하늘 영역 */}
        <rect x="5" y="4" width="110" height="60" rx="4" fill={isDark ? '#1e3a5f' : c} fillOpacity={isDark ? 0.3 : 0.08} />
        {/* 태양/달 */}
        <circle cx="85" cy="22" r="10" fill="#fbbf24" fillOpacity="0.2" />
        <circle cx="85" cy="22" r="7" fill="#fbbf24" fillOpacity="0.15" />
        {/* 구름 */}
        <ellipse cx="30" cy="18" rx="12" ry="4" fill="white" fillOpacity="0.15" />
        <ellipse cx="24" cy="16" rx="8" ry="3.5" fill="white" fillOpacity="0.12" />
        {/* 산 실루엣 — 크고 뚜렷하게 */}
        <path d="M0,110 Q15,80 35,95 Q50,70 65,88 Q80,65 95,82 Q110,72 120,90 L120,160 L0,160 Z" fill={c} fillOpacity="0.12" />
        <path d="M0,120 Q20,95 40,108 Q55,85 70,100 Q85,80 100,95 Q115,85 120,100 L120,160 L0,160 Z" fill={c} fillOpacity="0.08" />
        {/* 나무 실루엣 */}
        <path d="M15,120 L18,108 L21,120 Z" fill={c} fillOpacity="0.15" />
        <path d="M95,115 L99,100 L103,115 Z" fill={c} fillOpacity="0.12" />
        <rect x="17" y="120" width="2" height="5" fill={c} fillOpacity="0.1" />
        <rect x="97" y="115" width="2" height="5" fill={c} fillOpacity="0.08" />
        {/* 상단 병원명 */}
        <text x="60" y="14" textAnchor="middle" fontSize="3.2" fontWeight="600" fill={isDark ? 'rgba(255,255,255,0.6)' : a}>{name}</text>
        {/* 본문 — 하늘 영역 위 */}
        <text x="60" y="38" textAnchor="middle" fontSize="9.5" fontWeight="900" fill={isDark ? '#ffffff' : c}>{line1}</text>
        <text x="60" y="52" textAnchor="middle" fontSize="8.5" fontWeight="900" fill={isDark ? '#ffffff' : c}>{line2}</text>
        {/* 중간 메시지 */}
        <text x="60" y="78" textAnchor="middle" fontSize="3.5" fill={isDark ? 'rgba(255,255,255,0.6)' : a}>{subLine}</text>
        {closureText && <><rect x="20" y="86" width="80" height="14" rx="5" fill="white" fillOpacity="0.5" /><text x="60" y="95" textAnchor="middle" fontSize="3.2" fill="#64748b">{closureText}</text></>}
        <text x="60" y="148" textAnchor="middle" fontSize="3.2" fill={isDark ? 'rgba(255,255,255,0.4)' : '#94a3b8'}>{name}</text>
      </> : hint === 'minimal' ? <>
        {/* ━━ 미니멀 ━━ 극대화된 타이포, 비대칭 레이아웃, 좌측 정렬 */}
        {/* 상단 작은 병원명 + 가는 선 */}
        <text x="16" y="16" fontSize="3" fontWeight="500" fill={isDark ? 'rgba(255,255,255,0.4)' : '#94a3b8'} letterSpacing="1">{name}</text>
        <line x1="16" y1="20" x2="50" y2="20" stroke={c} strokeOpacity="0.2" strokeWidth="0.4" />
        {/* 거대한 메인 텍스트 — 좌측 정렬로 차별화 */}
        <text x="16" y="58" fontSize="14" fontWeight="900" fill={isDark ? '#ffffff' : c}>{line1}</text>
        <text x="16" y="80" fontSize="12" fontWeight="900" fill={isDark ? '#ffffff' : c}>{line2}</text>
        {/* 세로 악센트 바 */}
        <rect x="12" y="44" width="2" height="44" rx="1" fill={c} fillOpacity="0.25" />
        {/* 서브 텍스트 */}
        <text x="16" y="102" fontSize="3.5" fill={isDark ? 'rgba(255,255,255,0.5)' : a} letterSpacing="1">{subLine}</text>
        {closureText && <><rect x="14" y="112" width="60" height="12" rx="6" fill={c} fillOpacity="0.06" /><text x="44" y="120" textAnchor="middle" fontSize="2.8" fill={isDark ? '#64748b' : '#94a3b8'}>{closureText}</text></>}
        {/* 하단 우측 정렬 병원명 */}
        <text x="104" y="148" textAnchor="end" fontSize="3" fill={isDark ? 'rgba(255,255,255,0.3)' : '#94a3b8'}>{name}</text>
        {/* 우하단 장식 점 */}
        <circle cx="108" cy="145" r="1" fill={c} fillOpacity="0.15" />
      </> : <>
        {/* ━━ warm / fallback ━━ 큰 둥근 배경 + 부드러운 곡선 + 중앙 정렬 */}
        {/* 큰 둥근 배경 카드 */}
        <rect x="8" y="20" width="104" height="105" rx="14" fill={isDark ? 'rgba(255,255,255,0.05)' : c} fillOpacity={isDark ? 0.05 : 0.07} />
        {/* 상단 병원명 */}
        <text x="60" y="14" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={isDark ? 'rgba(255,255,255,0.5)' : a}>{name}</text>
        {/* 따뜻한 곡선 장식 — 눈에 잘 보이게 */}
        <path d="M8,24 Q30,14 60,24 Q90,34 112,24" fill="none" stroke={c} strokeWidth="0.8" strokeOpacity="0.15" />
        <path d="M8,120 Q30,130 60,120 Q90,110 112,120" fill="none" stroke={c} strokeWidth="0.8" strokeOpacity="0.12" />
        {/* 둥근 장식 */}
        <circle cx="18" cy="34" r="6" fill={c} fillOpacity="0.1" />
        <circle cx="102" cy="38" r="5" fill={c} fillOpacity="0.08" />
        <circle cx="12" cy="58" r="3" fill={c} fillOpacity="0.06" />
        <circle cx="108" cy="100" r="4" fill={c} fillOpacity="0.05" />
        {/* 본문 */}
        <text x="60" y="54" textAnchor="middle" fontSize="9" fontWeight="800" fill={isDark ? '#ffffff' : c}>{line1}</text>
        <text x="60" y="70" textAnchor="middle" fontSize="8.5" fontWeight="800" fill={isDark ? '#ffffff' : c}>{line2}</text>
        <rect x="30" y="78" width="60" height="0.6" fill={c} fillOpacity="0.15" />
        <text x="60" y="92" textAnchor="middle" fontSize="3.3" fill={isDark ? 'rgba(255,255,255,0.5)' : a} fontStyle="italic">{subLine}</text>
        {closureText && <><rect x="14" y="104" width="92" height="14" rx="7" fill={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.7)'} /><text x="60" y="113" textAnchor="middle" fontSize="3" fill="#64748b">{closureText}</text></>}
        <text x="60" y="146" textAnchor="middle" fontSize="3.2" fill={isDark ? 'rgba(255,255,255,0.3)' : '#94a3b8'}>{name}</text>
      </>}
    </>);
  }

  if (category === 'hiring') {
    return wrap(<>
      <text x="60" y="12" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={a} letterSpacing="0.5">{name}</text>
      {t.layoutHint === 'urgent' ? <>
        {/* 긴급채용 - 대담한 레드 */}
        <rect x="10" y="18" width="100" height="22" rx="6" fill={c} />
        <text x="60" y="26" textAnchor="middle" fontSize="3" fontWeight="700" fill="white" fillOpacity="0.7" letterSpacing="1">URGENT</text>
        <text x="60" y="35" textAnchor="middle" fontSize="6.5" fontWeight="900" fill="white">간호사 급구</text>
      </> : t.layoutHint === 'corporate' ? <>
        {/* 기업형 클린 */}
        <rect x="10" y="18" width="100" height="2" rx="1" fill={`url(#accent_${t.id})`} />
        <text x="60" y="30" textAnchor="middle" fontSize="3" fontWeight="600" fill={a} letterSpacing="1">RECRUITMENT</text>
        <text x="60" y="40" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={c}>간호사 모집</text>
      </> : t.layoutHint === 'team' ? <>
        {/* 팀 친근형 */}
        <rect x="10" y="18" width="100" height="26" rx="6" fill={c} fillOpacity="0.06" />
        <text x="60" y="28" textAnchor="middle" fontSize="3" fill={a}>We're Hiring!</text>
        <text x="60" y="39" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={c}>간호사 모집</text>
      </> : t.layoutHint === 'modern' ? <>
        {/* 모던 스타트업 */}
        <rect x="30" y="18" width="60" height="8" rx="4" fill={`url(#accent_${t.id})`} fillOpacity="0.8" />
        <text x="60" y="24" textAnchor="middle" fontSize="3" fontWeight="700" fill="white" letterSpacing="0.5">JOIN OUR TEAM</text>
        <text x="60" y="40" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={c}>간호사 모집</text>
      </> : t.layoutHint === 'brand' ? <>
        {/* 프리미엄 브랜드 */}
        <line x1="20" y1="20" x2="100" y2="20" stroke={c} strokeOpacity="0.1" strokeWidth="0.3" />
        <text x="60" y="30" textAnchor="middle" fontSize="3" fill={a} letterSpacing="1.5">CAREER OPPORTUNITY</text>
        <text x="60" y="40" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={c}>간호사 모집</text>
      </> : <>
        {/* 복리후생/기본 */}
        <text x="60" y="28" textAnchor="middle" fontSize="3" fill={a}>We're Hiring</text>
        <text x="60" y="40" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={c}>간호사 모집</text>
      </>}
      {/* 서브타이틀 */}
      <text x="60" y="52" textAnchor="middle" fontSize="3.5" fill={a}>함께 성장할 인재를 찾습니다</text>
      {/* 조건 카드 - 아이콘 + 텍스트 */}
      <rect x="10" y="58" width="100" height="52" rx="6" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
      {[
        {icon:'briefcase', t:'정규직 / 경력 1년 이상'},
        {icon:'shield', t:'4대보험 완비'},
        {icon:'gift', t:'중식 제공 / 인센티브'},
        {icon:'clock', t:'채용시까지 상시 모집'},
      ].map(({t: txt}, i) => (
        <g key={i}>
          <circle cx="20" cy={67 + i * 11} r="3" fill={c} fillOpacity="0.08" />
          <circle cx="20" cy={67 + i * 11} r="1.2" fill={c} fillOpacity="0.3" />
          <text x="27" y={69 + i * 11} fontSize="3.5" fill="#475569">{txt}</text>
        </g>
      ))}
      {/* CTA 버튼 */}
      <rect x="20" y="118" width="80" height="14" rx="7" fill={`url(#accent_${t.id})`} fillOpacity="0.9" />
      <text x="60" y="127.5" textAnchor="middle" fontSize="4" fontWeight="700" fill="white">지원하기</text>
      {/* 연락처 */}
      <text x="60" y="152" textAnchor="middle" fontSize="2.8" fill="#94a3b8">{name}</text>
    </>);
  }

  if (category === 'caution') {
    return wrap(<>
      <text x="60" y="12" textAnchor="middle" fontSize="3.5" fontWeight="600" fill={a} letterSpacing="0.5">{name}</text>
      {t.layoutHint === 'warning' ? <>
        <rect x="10" y="18" width="100" height="20" rx="5" fill={c} fillOpacity="0.08" />
        <path d="M55,22 L60,18 L65,22 Z" fill={c} fillOpacity="0.3" />
        <text x="60" y="33" textAnchor="middle" fontSize="5.5" fontWeight="800" fill={c}>시술 후 주의사항</text>
      </> : t.layoutHint === 'timeline' ? <>
        <rect x="10" y="18" width="100" height="16" rx="5" fill={c} fillOpacity="0.05" />
        <text x="60" y="29" textAnchor="middle" fontSize="5.5" fontWeight="800" fill={c}>회복 가이드</text>
      </> : <>
        <text x="60" y="28" textAnchor="middle" fontSize="5.5" fontWeight="800" fill={c}>시술 후 주의사항</text>
      </>}
      {t.layoutHint === 'checklist' ? <>
        {/* 체크리스트형 - 체크마크 스타일 */}
        {['혀로 건드리지 마세요','음주/흡연 금지','부기 2~3일 내 소실','딱딱한 음식 금지'].map((item, i) => (
          <g key={i}>
            <rect x="10" y={40 + i * 22} width="100" height="18" rx="5" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
            <rect x="14" y={43 + i * 22} width="12" height="12" rx="3" fill={c} fillOpacity="0.08" />
            <text x="20" y={51 + i * 22} textAnchor="middle" fontSize="4.5" fontWeight="700" fill={c}>{i + 1}</text>
            <text x="32" y={51 + i * 22} fontSize="3.5" fill="#475569">{item}</text>
          </g>
        ))}
      </> : t.layoutHint === 'card' ? <>
        {/* 카드형 - 개별 카드 + 아이콘 */}
        {['혀로 건드리지 마세요','음주/흡연 금지','딱딱한 음식 금지','냉찜질 권장'].map((item, i) => (
          <g key={i}>
            <rect x={i % 2 === 0 ? 8 : 64} y={38 + Math.floor(i/2) * 34} width="52" height="28" rx="6" fill="white" fillOpacity="0.95" filter={`url(#shadow_${t.id})`} />
            <circle cx={i % 2 === 0 ? 22 : 78} cy={48 + Math.floor(i/2) * 34} r="5" fill={i < 2 ? '#fef2f2' : '#ecfdf5'} />
            <text x={i % 2 === 0 ? 22 : 78} y={50 + Math.floor(i/2) * 34} textAnchor="middle" fontSize="4" fontWeight="700" fill={i < 2 ? '#ef4444' : '#22c55e'}>{i < 2 ? 'X' : 'O'}</text>
            <text x={i % 2 === 0 ? 42 : 98} y={52 + Math.floor(i/2) * 34} textAnchor="middle" fontSize="3" fill="#475569">{item}</text>
          </g>
        ))}
      </> : t.layoutHint === 'guide' ? <>
        {/* 친절한 가이드형 - 단계별 아이콘 */}
        <rect x="10" y="38" width="100" height="82" rx="8" fill="white" fillOpacity="0.7" filter={`url(#shadow_${t.id})`} />
        {['혀로 건드리지 마세요','음주/흡연 금지','부기 2~3일 내 소실','딱딱한 음식 금지'].map((item, i) => (
          <g key={i}>
            <circle cx="22" cy={50 + i * 18} r="5" fill={c} fillOpacity="0.06" />
            <circle cx="22" cy={50 + i * 18} r="3" fill={c} fillOpacity="0.1" />
            <text x="22" y={52 + i * 18} textAnchor="middle" fontSize="3" fontWeight="700" fill={c}>{i + 1}</text>
            <text x="32" y={52 + i * 18} fontSize="3.5" fill="#475569">{item}</text>
            {i < 3 && <line x1="22" y1={55 + i * 18} x2="22" y2={63 + i * 18} stroke={c} strokeOpacity="0.1" strokeWidth="0.5" />}
          </g>
        ))}
      </> : t.layoutHint === 'timeline' ? <>
        {/* 세련된 타임라인 */}
        <rect x="18" y="40" width="2" height="80" rx="1" fill={c} fillOpacity="0.08" />
        {[{d:'당일',t:'혀로 건드리지 마세요'},{d:'1주일',t:'딱딱한 음식 금지'},{d:'2주일',t:'정상 식사 가능'},{d:'1개월',t:'정기검진 내원'}].map((item, i) => (
          <g key={i}>
            <circle cx="19" cy={48 + i * 20} r="4" fill="white" stroke={c} strokeWidth="1" strokeOpacity="0.3" />
            <circle cx="19" cy={48 + i * 20} r="1.8" fill={c} fillOpacity="0.5" />
            <text x="28" y={46 + i * 20} fontSize="3.2" fontWeight="700" fill={c}>{item.d}</text>
            <text x="28" y={53 + i * 20} fontSize="3.2" fill="#64748b">{item.t}</text>
          </g>
        ))}
      </> : t.layoutHint === 'infographic' ? <>
        {/* 인포그래픽 - 아이콘 그리드 */}
        {[{t:'혀 금지', y:40},{t:'음주 금지', y:62},{t:'냉찜질', y:84},{t:'부드러운 음식', y:106}].map((item, i) => (
          <g key={i}>
            <rect x={i % 2 === 0 ? 10 : 64} y={40 + Math.floor(i/2) * 34} width="50" height="28" rx="5" fill="white" fillOpacity="0.9" filter={`url(#shadow_${t.id})`} />
            <circle cx={i % 2 === 0 ? 24 : 78} cy={50 + Math.floor(i/2) * 34} r="5" fill={i < 2 ? '#fef2f2' : '#ecfdf5'} />
            <text x={i % 2 === 0 ? 24 : 78} y={52 + Math.floor(i/2) * 34} textAnchor="middle" fontSize="4" fill={i < 2 ? '#ef4444' : '#22c55e'}>{i < 2 ? 'X' : 'O'}</text>
            <text x={i % 2 === 0 ? 44 : 98} y={54 + Math.floor(i/2) * 34} textAnchor="middle" fontSize="3" fill="#475569">{item.t}</text>
          </g>
        ))}
      </> : <>
        {/* 기본 줄무늬형 */}
        {['혀로 건드리지 마세요','음주/흡연 금지','부기 2~3일 내 소실','딱딱한 음식 금지'].map((item, i) => (
          <g key={i}>
            <rect x="10" y={40 + i * 22} width="100" height="18" rx="5" fill={c} fillOpacity={i % 2 === 0 ? 0.04 : 0.01} />
            <circle cx="20" cy={49 + i * 22} r="2" fill={c} fillOpacity="0.2" />
            <text x="26" y={51 + i * 22} fontSize="3.5" fill="#475569">{item}</text>
          </g>
        ))}
      </>}
      {/* 응급 연락처 */}
      <rect x="15" y="130" width="90" height="14" rx="5" fill={c} fillOpacity="0.05" />
      <text x="60" y="152" textAnchor="middle" fontSize="2.8" fill="#94a3b8">{name}</text>
    </>);
  }

  // fallback
  return wrap(<>
    <text x="60" y="80" textAnchor="middle" fontSize="6" fill={c}>{t.name}</text>
  </>);
}

export default function TemplateGenerator() {
  const now = new Date();

  // 공통
  const [category, setCategory] = useState<TemplateCategory>('schedule');
  const [hospitalName, setHospitalName] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<StylePreset>(AI_STYLE_PRESETS[0]);
  const [selectedCatTemplate, setSelectedCatTemplate] = useState<CategoryTemplate | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [extraPrompt, setExtraPrompt] = useState('');
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

  // 현재 사용할 스타일 프롬프트 결정 (히스토리 > 카테고리 템플릿 > 일반 프리셋)
  const activeStylePrompt = selectedHistory?.stylePrompt || selectedCatTemplate?.aiPrompt || selectedStyle.aiPrompt;
  const activeStyleName = selectedHistory?.name || selectedCatTemplate?.name || selectedStyle.name;

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
    const suffixes: Record<TemplateCategory, string> = { schedule: `${month}월_진료안내`, event: '이벤트', doctor: '의사소개', notice: '공지사항', greeting: '인사', hiring: '채용공고', caution: '주의사항' };
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
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-start">
      <div className="space-y-4">

        {/* 카테고리 */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)} className={`flex-1 min-w-[56px] py-2 px-1 rounded-xl text-center transition-all ${category === c.id ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              <div className="text-lg leading-none">{c.icon}</div>
              <div className="text-[10px] font-bold mt-1 leading-tight">{c.name}</div>
            </button>
          ))}
        </div>

        {/* 병원 브랜딩 */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-slate-600">병원 브랜딩</label>
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

        {/* 카테고리별 디자인 템플릿 (6개씩) */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-2">
            디자인 템플릿 {selectedHistory && <span className="text-violet-400 font-normal">(내 스타일 선택 시 무시됨)</span>}
          </label>
          {category === 'schedule' ? (
            /* 진료 일정: 달력 테마 카드 */
            <div className="grid grid-cols-3 gap-2">
              {CALENDAR_THEME_OPTIONS.map(t => {
                const THEME_META: Record<string, { bg: string; headerBg: string; headerColor: string; decor: string; cellColor: string; badgeColor: string }> = {
                  autumn:             { bg: '#f97316', headerBg: '#3d3d3d', headerColor: '#fff',    decor: '🍁', cellColor: '#fff',    badgeColor: '#fcd34d' },
                  korean_traditional: { bg: '#fdfaf5', headerBg: '#fff',    headerColor: '#111',   decor: '🦢', cellColor: '#fff',    badgeColor: '#9b1c1c' },
                  winter:             { bg: '#bae6fd', headerBg: '#1e3a8a', headerColor: '#fff',    decor: '❄', cellColor: '#fff',    badgeColor: '#facc15' },
                  cherry_blossom:     { bg: '#ec4899', headerBg: '#ec4899', headerColor: '#fff',    decor: '🌸', cellColor: '#fff',    badgeColor: '#7c3aed' },
                  spring_kids:        { bg: '#bfdbfe', headerBg: '#f9a8d4', headerColor: '#fff',    decor: '🌼', cellColor: '#fff',    badgeColor: '#f472b6' },
                  medical_notebook:   { bg: '#3b9fe8', headerBg: '#f8fafc', headerColor: '#1e3a8a', decor: '👩‍⚕️', cellColor: '#ef4444', badgeColor: '#ef4444' },
                };
                const m = THEME_META[t.value] || { bg: '#e2e8f0', headerBg: '#94a3b8', headerColor: '#fff', decor: '📅', cellColor: '#fff', badgeColor: '#ef4444' };
                const isSelected = calendarTheme === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setCalendarTheme(t.value)}
                    className={`rounded-xl border-2 transition-all overflow-hidden ${isSelected ? 'shadow-lg scale-[1.02] border-blue-400 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300 hover:shadow-md'}`}
                  >
                    {/* 달력 미니 SVG 미리보기 */}
                    <svg viewBox="0 0 90 120" className="w-full" xmlns="http://www.w3.org/2000/svg">
                      {/* 배경 */}
                      <rect width="90" height="120" fill={m.bg} />
                      {/* 데코 이모지 표현 (텍스트) */}
                      <text x="50%" y="18" textAnchor="middle" fontSize="14" dominantBaseline="middle">{m.decor}</text>
                      {/* 흰 달력 카드 */}
                      <rect x="5" y="26" width="80" height="88" rx="5" ry="5" fill="white" />
                      {/* 헤더 바 */}
                      <rect x="5" y="26" width="80" height="14" rx="5" ry="5" fill={m.headerBg} />
                      <rect x="5" y="32" width="80" height="8" fill={m.headerBg} />
                      {/* 요일 헤더 */}
                      {['일','월','화','수','목','금','토'].map((d, i) => (
                        <text key={d} x={5 + i * 11.5 + 5.5} y="48" textAnchor="middle" fontSize="5" fill={m.headerColor} fontWeight="bold">{d}</text>
                      ))}
                      {/* 달력 셀 (5행 × 7열) */}
                      {Array.from({length: 5}).map((_, row) =>
                        Array.from({length: 7}).map((_, col) => {
                          const day = row * 7 + col + 1;
                          if (day > 31) return null;
                          const x = 5 + col * 11.5 + 1;
                          const y = 52 + row * 12 + 1;
                          const isClosed = [5, 12, 19, 26].includes(day);
                          return (
                            <g key={`${row}-${col}`}>
                              <rect x={x} y={y} width="10" height="10" fill={isClosed ? m.cellColor : '#f8fafc'} rx="1" />
                              <text x={x + 5} y={y + 7} textAnchor="middle" fontSize="5.5" fill={isClosed ? (m.cellColor === '#fff' ? '#1e293b' : '#fff') : '#374151'} fontWeight={isClosed ? 'bold' : 'normal'}>{day}</text>
                            </g>
                          );
                        })
                      )}
                      {/* 배지 예시 */}
                      <rect x="20" y="65" width="18" height="6" rx="3" fill={m.badgeColor} opacity="0.9" />
                      <text x="29" y="69.5" textAnchor="middle" fontSize="4" fill="white" fontWeight="bold">휴진</text>
                    </svg>
                    <div className={`py-1.5 px-1 text-center ${isSelected ? 'bg-blue-50' : 'bg-white'}`} style={{ borderTop: `1.5px solid ${isSelected ? '#60a5fa' : '#f1f5f9'}` }}>
                      <div className={`text-[10px] font-bold leading-tight ${isSelected ? 'text-blue-700' : 'text-slate-600'}`}>{t.label.replace(/^[\S]+\s/, '')}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* 기타 카테고리: 기존 AI 스타일 템플릿 */
            <div className={`grid grid-cols-3 gap-2 ${selectedHistory ? 'opacity-40 pointer-events-none' : ''}`}>
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
                    className={`rounded-xl border-2 transition-all overflow-hidden ${isSelected ? 'shadow-lg scale-[1.03]' : 'border-slate-200 hover:border-slate-300 hover:shadow-md'}`}
                    style={isSelected ? { borderColor: tmpl.color } : undefined}
                  >
                    <div className="relative w-full overflow-hidden" style={{ aspectRatio: '3/4', background: tmpl.previewImage ? '#f8fafc' : `linear-gradient(160deg, ${tmpl.bg} 0%, white 80%)` }}>
                      <TemplateSVGPreview template={tmpl} category={category} hospitalName={hospitalName || '윈에이드 치과'} />
                    </div>
                    <div className="py-1.5 px-1 bg-white text-center" style={{ borderTop: `1.5px solid ${isSelected ? tmpl.color : '#f1f5f9'}` }}>
                      <div className="text-[10px] font-bold leading-tight" style={{ color: isSelected ? tmpl.color : '#334155' }}>{tmpl.name}</div>
                      <div className="text-[8px] mt-0.5" style={{ color: '#94a3b8' }}>{tmpl.desc}</div>
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
        <button onClick={handleGenerate} disabled={generating} className={`w-full py-3 rounded-xl text-white font-bold text-base transition-all shadow-lg ${generating ? 'bg-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 active:scale-[0.98]'}`}>
          {generating ? (<span className="flex items-center justify-center gap-2"><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>AI 디자인 생성 중...</span>) : 'AI 디자인 생성'}
        </button>
      </div>

      {/* 오른쪽: 미리보기 */}
      <div className="flex flex-col items-center min-h-[480px]">
        {error&&<div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}
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
          <div className="flex flex-col items-center justify-center py-16 relative group">
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
              <div className="absolute top-8 right-8 w-32 h-32 bg-violet-100/30 rounded-full blur-[60px]" />
              <div className="absolute bottom-8 left-8 w-24 h-24 bg-blue-100/20 rounded-full blur-[50px]" />
            </div>
            <div className="relative flex flex-col items-center">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-violet-50 to-indigo-100/80 border border-violet-200/30">
                <svg className="w-9 h-9 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">{ph[category].t}</h3>
              <p className="text-sm font-medium text-slate-400 leading-relaxed mb-5 text-center">{ph[category].d}</p>
              {category==='schedule'&&(<div className="flex justify-center gap-4 text-xs text-slate-400 mb-4"><div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-100 border border-red-300 rounded" /> 휴진</div><div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-amber-100 border border-amber-300 rounded" /> 단축</div><div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-purple-100 border border-purple-300 rounded" /> 휴가</div></div>)}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-violet-50/80 text-violet-500 border border-violet-100/50">
                <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse" />
                AI 대기 중
              </div>
            </div>
          </div>
        )}
      </div>

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
