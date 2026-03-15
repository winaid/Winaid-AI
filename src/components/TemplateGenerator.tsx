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
// [DELETED] T1~T12 schedule-template imports removed — old preview system

// [DELETED] THEME_COMPONENT_MAP (T1~T12 calendar theme previews) completely removed

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

// ─── 프로덕션 프리뷰 디자인 시스템 ───
// 12개 schedule 디자인 패밀리 — 각각 고유한 레이아웃 골격

// Schedule 그룹 분류 (UI 라벨용)
const SCHEDULE_GROUPS: { label: string; desc: string; values: string[] }[] = [
  { label: '📋 클린 · 모던', desc: '깔끔한·실무·밝은 달력', values: ['medical_notebook', 'autumn', 'spring_kids', 'cherry_blossom', 'autumn_holiday', 'lavender_sparkle'] },
  { label: '✨ 프리미엄 · 클래식', desc: '격조·고급·진중한 달력', values: ['korean_traditional', 'hanok_roof', 'dark_blue_modern', 'dark_green_clinic', 'winter', 'autumn_spring_note'] },
];

function CalendarThemePreview({ themeValue, groupColor, size = 'sm' }: { themeValue: string; groupColor: string; size?: 'sm' | 'lg' }) {
  const s = size === 'lg';
  const c = groupColor;

  // ── Family 1: autumn — 실무형 스프레드시트 (컴팩트 헤더, 90% 그리드, 데이터 밀도 최대) ──
  if (themeValue === 'autumn') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: 'white' }}>
        {/* 실무 헤더 — 한 줄, 정보만 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '4px 8px' : '2px 4px', borderBottom: '1.5px solid #334155' }}>
          <span className={`${s ? 'text-[10px]' : 'text-[5px]'} font-black`} style={{ color: '#334155' }}>2026.03 진료일정</span>
          <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium`} style={{ color: '#94a3b8' }}>OO치과 · 09–18 · 토09–13</span>
        </div>
        {/* 요일 헤더 — 다크 슬레이트 배경, 엑셀 헤더 느낌 */}
        <div className="grid grid-cols-7" style={{ background: '#334155' }}>
          {days.map((d, i) => (
            <div key={d} className={`text-center font-black ${s ? 'text-[9px] py-[3px]' : 'text-[4px] py-[1.5px]'}`}
              style={{ color: i === 0 ? '#fca5a5' : i === 6 ? '#93c5fd' : '#e2e8f0' }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — 1.5px 보더, 그리드가 전체 90%+ 차지 */}
        <div className="grid grid-cols-7 flex-1">
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            if (!d) return <div key={`e${i}`} style={{ borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', background: '#f8fafc' }} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            return (
              <div key={i} className="flex flex-col items-center justify-center"
                style={{
                  borderRight: '1px solid #cbd5e1',
                  borderBottom: '1px solid #cbd5e1',
                  background: isClosed ? '#e2e8f0' : isShort ? '#fef9c3' : 'white',
                }}>
                <span className={`${s ? 'text-[11px]' : 'text-[5.5px]'} font-bold`}
                  style={{
                    color: isClosed ? '#94a3b8' : isShort ? '#92400e' : i % 7 === 0 ? '#dc2626' : i % 7 === 6 ? '#2563eb' : '#1e293b',
                    textDecoration: isClosed ? 'line-through' : 'none',
                    textDecorationColor: '#64748b',
                  }}>{d}</span>
                {isClosed && <span className={`${s ? 'text-[6px]' : 'text-[2.5px]'} font-black leading-none`} style={{ color: '#dc2626' }}>휴</span>}
                {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-bold leading-none`} style={{ color: '#92400e' }}>△단축</span>}
              </div>
            );
          })}
        </div>
        {/* 풋터 — 얇은 라인, 최소 텍스트 */}
        <div className="flex items-center justify-end" style={{ padding: s ? '2px 8px' : '1px 4px', borderTop: '1px solid #cbd5e1' }}>
          <span className={`${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: '#94a3b8' }}>휴진 9·23 | 단축 16</span>
        </div>
      </div>
    );
  }

  // ── Family 2: korean_traditional — 전통 한방 프레임 (격조 있는 한의원) ──
  if (themeValue === 'korean_traditional') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#f9f5ee' }}>
        {/* 기와 문양 장식 헤더 */}
        <div className="w-full overflow-hidden" style={{ height: s ? '8px' : '4px' }}>
          <svg viewBox="0 0 200 8" className="w-full h-full" preserveAspectRatio="none">
            <rect width="200" height="3" fill="#5c3520" />
            <path d="M0,8 Q5,3 10,8 Q15,3 20,8 Q25,3 30,8 Q35,3 40,8 Q45,3 50,8 Q55,3 60,8 Q65,3 70,8 Q75,3 80,8 Q85,3 90,8 Q95,3 100,8 Q105,3 110,8 Q115,3 120,8 Q125,3 130,8 Q135,3 140,8 Q145,3 150,8 Q155,3 160,8 Q165,3 170,8 Q175,3 180,8 Q185,3 190,8 Q195,3 200,8" fill="#78350f" />
          </svg>
        </div>
        {/* 병원명 + 월 정보 — 중앙 정렬, 격식 있는 느낌 */}
        <div className="flex flex-col items-center" style={{ padding: s ? '10px 12px 6px' : '4px 6px 3px', background: 'linear-gradient(180deg, #78350f 0%, #92400e 100%)' }}>
          <div className={`${s ? 'text-[9px]' : 'text-[4px]'} text-white/60 tracking-[0.3em] font-medium`}>OO 한의원</div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className={`${s ? 'text-[22px]' : 'text-[11px]'} font-black text-white leading-none`} style={{ fontFamily: 'Georgia, serif' }}>3</span>
            <span className={`${s ? 'text-[11px]' : 'text-[5.5px]'} font-bold text-white/80`}>월 진료일정</span>
          </div>
        </div>
        {/* 이중 테두리 프레임 달력 */}
        <div className="flex-1 flex flex-col" style={{ margin: s ? '6px 8px' : '3px 4px', border: '2px solid #d4a574', borderRadius: s ? '6px' : '3px', padding: s ? '1px' : '0.5px' }}>
          <div style={{ border: '0.5px solid #d4a57466', borderRadius: s ? '4px' : '2px', flex: 1, display: 'flex', flexDirection: 'column', background: '#fffcf5' }}>
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7" style={{ borderBottom: '1px solid #d4a57433', background: '#f5ebe0' }}>
              {days.map((d, i) => (
                <div key={d} className={`text-center font-extrabold ${s ? 'text-[9px] py-[3px]' : 'text-[4px] py-[1px]'}`} style={{ color: i === 0 ? '#b91c1c' : i === 6 ? '#1d4ed8' : '#78350f' }}>{d}</div>
              ))}
            </div>
            {/* 날짜 격자 */}
            <div className="grid grid-cols-7 flex-1">
              {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
                if (!d) return <div key={`e${i}`} style={{ borderRight: '0.5px solid #d4a57415', borderBottom: '0.5px solid #d4a57415' }} />;
                const isClosed = d === 9 || d === 23;
                return (
                  <div key={i} className="flex flex-col items-center justify-center"
                    style={{ borderRight: '0.5px solid #d4a57415', borderBottom: '0.5px solid #d4a57415', background: isClosed ? '#dc262612' : 'transparent' }}>
                    <span className={`${s ? 'text-[10px]' : 'text-[4.5px]'} font-bold`}
                      style={{ color: isClosed ? '#b91c1c' : i % 7 === 0 ? '#b91c1c' : i % 7 === 6 ? '#1d4ed8' : '#5c3d2e' }}>{d}</span>
                    {isClosed && <span className={`${s ? 'text-[6px]' : 'text-[2.5px]'} font-black text-red-600 leading-none`}>휴진</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {/* 하단 진료 정보 + 전통 문양 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '4px 10px 6px' : '2px 5px 3px' }}>
          <div className={`${s ? 'text-[9px]' : 'text-[3.5px]'} font-medium`} style={{ color: '#92400e' }}>
            평일 09~18 · 토 09~13
          </div>
          <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'}`} style={{ color: '#92400e88' }}>
            02-000-0000
          </div>
        </div>
      </div>
    );
  }

  // ── Family 3: winter — 딥블루 달력 (프로스트 글래스 + 원형 휴진 배지) ──
  if (themeValue === 'winter') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: 'linear-gradient(160deg, #0c4a6e 0%, #0369a1 50%, #0284c7 100%)' }}>
        {/* 컴팩트 헤더 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '6px 10px' : '3px 5px' }}>
          <div>
            <div className={`${s ? 'text-[12px]' : 'text-[6px]'} font-black text-white leading-tight`}>3월 진료안내</div>
            <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} text-sky-200/70`}>OO정형외과</div>
          </div>
          <div className={`${s ? 'text-[8px] px-1.5 py-0.5' : 'text-[3.5px] px-1 py-[1px]'} rounded-full text-sky-100 font-bold`} style={{ background: 'rgba(255,255,255,0.12)' }}>2026</div>
        </div>
        {/* 요일 헤더 — 아이시 블루 */}
        <div className="grid grid-cols-7" style={{ background: 'rgba(255,255,255,0.08)' }}>
          {days.map((d, i) => (
            <div key={d} className={`text-center font-extrabold ${s ? 'text-[9px] py-[3px]' : 'text-[4px] py-[1px]'}`}
              style={{ color: i === 0 ? '#fca5a5' : i === 6 ? '#93c5fd' : '#bae6fd' }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — 프로스트 글래스 셀 */}
        <div className="grid grid-cols-7 flex-1" style={{ padding: s ? '2px' : '1px', gap: s ? '1px' : '0.5px' }}>
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            return (
              <div key={i} className="flex flex-col items-center justify-center relative"
                style={{
                  borderRadius: s ? 4 : 2,
                  background: isClosed ? 'rgba(220,38,38,0.25)' : isShort ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.06)',
                  border: isClosed ? '1px solid rgba(248,113,113,0.5)' : '0.5px solid rgba(255,255,255,0.08)',
                }}>
                <span className={`${s ? 'text-[10px]' : 'text-[5px]'} font-bold`}
                  style={{ color: isClosed ? '#fca5a5' : isShort ? '#fde68a' : i % 7 === 0 ? '#fca5a5' : i % 7 === 6 ? '#93c5fd' : '#e0f2fe' }}>{d}</span>
                {isClosed && <span className={`${s ? 'text-[6px]' : 'text-[2.5px]'} font-extrabold leading-none`} style={{ color: '#fca5a5' }}>휴진</span>}
                {isShort && <span className={`${s ? 'text-[6px]' : 'text-[2.5px]'} font-extrabold leading-none`} style={{ color: '#fde68a' }}>단축</span>}
              </div>
            );
          })}
        </div>
        {/* 풋터 — 글래스 바 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '5px 10px' : '2px 5px', background: 'rgba(255,255,255,0.08)' }}>
          <div className={`flex gap-1.5 ${s ? 'text-[8px]' : 'text-[3.5px]'} text-sky-200`}>
            <span>평일 09~18</span><span>토 09~13</span>
          </div>
          <span className={`${s ? 'text-[7px]' : 'text-[3px]'} text-sky-300/60`}>02-000-0000</span>
        </div>
      </div>
    );
  }

  // ── Family 4: cherry_blossom — 블러시 로즈 브랜딩 (절제된 봄 톤 + 히어로 헤더 + 갭 셀) ──
  if (themeValue === 'cherry_blossom') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#faf7f5' }}>
        {/* 히어로 헤더 — 블러시핑크 톤, 봄 무드 */}
        <div className="flex flex-col items-center justify-center" style={{ padding: s ? '14px 12px 10px' : '7px 6px 5px', background: '#fdf8f6' }}>
          <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} tracking-[0.4em] font-medium`} style={{ color: '#be7e8a' }}>OO의원</div>
          <div className="flex items-baseline" style={{ gap: s ? 3 : 1.5, margin: s ? '4px 0 2px' : '2px 0 1px' }}>
            <span className={`${s ? 'text-[32px]' : 'text-[16px]'} font-black leading-none`} style={{ color: '#6b3a4a' }}>3</span>
            <span className={`${s ? 'text-[12px]' : 'text-[6px]'} font-bold`} style={{ color: '#9a6b7a' }}>월</span>
          </div>
          <div className={`${s ? 'text-[9px]' : 'text-[4px]'} font-bold`} style={{ color: '#9a6b7a' }}>진료안내</div>
          <div className={`${s ? 'w-10 h-[1px] mt-2' : 'w-5 h-[0.5px] mt-1'}`} style={{ background: '#e8c8ce' }} />
        </div>
        {/* 요일 헤더 — 로즈 베이지 악센트 */}
        <div className="grid grid-cols-7" style={{ padding: s ? '0 8px' : '0 4px' }}>
          {days.map((d, i) => (
            <div key={d} className={`text-center font-medium ${s ? 'text-[8px] py-[4px]' : 'text-[3.5px] py-[2px]'}`}
              style={{ color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#be7e8a', letterSpacing: '0.1em' }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — 보더 없음, 갭 분리, 블러시 틴트 */}
        <div className="grid grid-cols-7 flex-1" style={{ padding: s ? '0 8px 4px' : '0 4px 2px', gap: s ? '2px' : '1px' }}>
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            return (
              <div key={i} className="flex flex-col items-center justify-center"
                style={{
                  background: isClosed ? '#fce8ec' : '#fffbf9',
                  borderRadius: s ? 4 : 2,
                }}>
                <span className={`${s ? 'text-[11px]' : 'text-[5.5px]'} font-semibold`}
                  style={{ color: isClosed ? '#be123c' : isShort ? '#92400e' : i % 7 === 0 ? '#dc2626' : i % 7 === 6 ? '#2563eb' : '#44403c' }}>{d}</span>
                {isClosed && (
                  <div className={`${s ? 'w-4 h-[1.5px]' : 'w-2 h-[0.5px]'} mt-[1px]`} style={{ background: '#be123c' }} />
                )}
                {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-bold leading-none`} style={{ color: '#92400e' }}>단축</span>}
              </div>
            );
          })}
        </div>
        {/* 풋터 — 블러시 핑크 센터 */}
        <div className="flex flex-col items-center" style={{ padding: s ? '6px 0 8px' : '3px 0 4px', background: '#fdf8f6' }}>
          <div className={`${s ? 'text-[9px]' : 'text-[4px]'} font-medium`} style={{ color: '#6b3a4a' }}>
            평일 09–18 · 토 09–13 · 점심 13–14
          </div>
          <div className={`${s ? 'text-[7px]' : 'text-[3px]'} mt-0.5`} style={{ color: '#be7e8a' }}>02-000-0000</div>
        </div>
      </div>
    );
  }

  // ── Family 5: spring_kids — 차콜 솔리드 (차콜 프레임 + 풀레드 셀 + 두꺼운 격자) ──
  if (themeValue === 'spring_kids') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: 'white' }}>
        {/* 차콜 헤더 — 병원 프레임 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '7px 12px' : '3px 6px', background: '#292524' }}>
          <div>
            <div className={`${s ? 'text-[13px]' : 'text-[6.5px]'} font-black text-white leading-tight`}>3월 진료안내</div>
            <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium text-white/50`}>OO소아과의원</div>
          </div>
          <div className="flex flex-col items-center">
            <span className={`${s ? 'text-[20px]' : 'text-[10px]'} font-black text-white/15 leading-none`}>3</span>
            <span className={`${s ? 'text-[6px]' : 'text-[3px]'} text-white/30`}>2026</span>
          </div>
        </div>
        {/* 요일 헤더 — 밝은 회색 바, 볼드 */}
        <div className="grid grid-cols-7" style={{ background: '#f5f5f4', borderBottom: '1.5px solid #292524' }}>
          {days.map((d, i) => (
            <div key={d} className={`text-center font-black ${s ? 'text-[9px] py-[3px]' : 'text-[4px] py-[1.5px]'}`}
              style={{ color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#44403c' }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — 1px 보더 + 풀 레드 셀 휴진 (킬러 피처) */}
        <div className="grid grid-cols-7 flex-1">
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            if (!d) return <div key={`e${i}`} style={{ borderRight: '1px solid #e7e5e4', borderBottom: '1px solid #e7e5e4' }} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            return (
              <div key={i} className="flex flex-col items-center justify-center"
                style={{
                  borderRight: '1px solid #e7e5e4',
                  borderBottom: '1px solid #e7e5e4',
                  background: isClosed ? '#dc2626' : isShort ? '#fffbeb' : 'white',
                }}>
                <span className={`${s ? 'text-[11px]' : 'text-[5.5px]'} font-bold`}
                  style={{ color: isClosed ? 'white' : isShort ? '#92400e' : i % 7 === 0 ? '#dc2626' : i % 7 === 6 ? '#2563eb' : '#292524' }}>{d}</span>
                {isClosed && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-black text-white/90 leading-none`}>휴진</span>}
                {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-bold leading-none`} style={{ color: '#92400e' }}>단축</span>}
              </div>
            );
          })}
        </div>
        {/* 풋터 — 차콜 정보 바 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '4px 12px' : '2px 6px', background: '#292524' }}>
          <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium text-white/80`}>평일 09–18 · 토 09–13</span>
          <div className="flex gap-1.5">
            <span className={`flex items-center gap-0.5 ${s ? 'text-[7px]' : 'text-[3px]'} text-white/60`}>
              <span className={`inline-block ${s ? 'w-2 h-2' : 'w-1 h-1'} rounded-sm bg-red-600`} />휴진
            </span>
            <span className={`flex items-center gap-0.5 ${s ? 'text-[7px]' : 'text-[3px]'} text-white/60`}>
              <span className={`inline-block ${s ? 'w-2 h-2' : 'w-1 h-1'} rounded-sm`} style={{ background: '#fef3c7' }} />단축
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Family 6: medical_notebook — 스위스 미니멀 달력 (모노톤, 규선 격자) ──
  if (themeValue === 'medical_notebook') {
    const days = ['S','M','T','W','T','F','S'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#fafafa' }}>
        {/* 미니멀 헤더 — 큰 숫자 + 정보 */}
        <div className="flex items-end justify-between" style={{ padding: s ? '8px 12px 4px' : '4px 6px 2px', borderBottom: '1px solid #e2e8f0' }}>
          <div className="flex items-baseline" style={{ gap: s ? 3 : 1.5 }}>
            <span className={`${s ? 'text-[28px]' : 'text-[14px]'} font-black text-slate-800 leading-none`}>3</span>
            <div>
              <div className={`${s ? 'text-[9px]' : 'text-[4px]'} font-bold text-slate-500 leading-tight`}>March</div>
              <div className={`${s ? 'text-[7px]' : 'text-[3px]'} text-slate-400`}>2026</div>
            </div>
          </div>
          <div className={`${s ? 'text-[7px]' : 'text-[3px]'} text-slate-400 pb-0.5`}>OO내과</div>
        </div>
        {/* 요일 헤더 — 올캡스 영문, 극도로 얇은 라인 */}
        <div className="grid grid-cols-7" style={{ borderBottom: '0.5px solid #e2e8f0' }}>
          {days.map((d, i) => (
            <div key={`${d}${i}`} className={`text-center font-medium ${s ? 'text-[8px] py-[3px]' : 'text-[3.5px] py-[1px]'}`}
              style={{ color: i === 0 ? '#b91c1c' : '#94a3b8', letterSpacing: '0.05em' }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — 극도로 얇은 규선, 모노톤 */}
        <div className="grid grid-cols-7 flex-1">
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            if (!d) return <div key={`e${i}`} style={{ borderRight: '0.5px solid #f1f5f9', borderBottom: '0.5px solid #f1f5f9' }} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            return (
              <div key={i} className="flex flex-col items-center justify-center"
                style={{ borderRight: '0.5px solid #f1f5f9', borderBottom: '0.5px solid #f1f5f9' }}>
                <span className={`${s ? 'text-[10px]' : 'text-[5px]'} font-medium`}
                  style={{
                    color: isClosed ? '#dc2626' : isShort ? '#b45309' : i % 7 === 0 ? '#b91c1c' : '#374151',
                    textDecoration: isClosed ? 'line-through' : 'none',
                    textDecorationColor: '#dc2626',
                  }}>{d}</span>
                {isClosed && <div className={`${s ? 'w-1 h-1' : 'w-0.5 h-0.5'} rounded-full bg-red-500 mt-[1px]`} />}
                {isShort && <div className={`${s ? 'w-3 h-[1px]' : 'w-1.5 h-[0.5px]'} bg-amber-400 mt-[1px]`} />}
              </div>
            );
          })}
        </div>
        {/* 풋터 — 미니멀 정보 바 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '4px 12px' : '2px 6px', borderTop: '1px solid #e2e8f0' }}>
          <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} text-slate-500`}>
            <span className="font-medium">09–18</span> · 토 <span className="font-medium">09–13</span> · 점심 13–14
          </div>
          <div className={`flex items-center gap-1 ${s ? 'text-[7px]' : 'text-[3px]'} text-slate-400`}>
            <span className="flex items-center gap-0.5"><span className={`inline-block ${s ? 'w-1 h-1' : 'w-0.5 h-0.5'} rounded-full bg-red-500`} />휴진</span>
            <span className="flex items-center gap-0.5"><span className={`inline-block ${s ? 'w-2.5 h-[1px]' : 'w-1 h-[0.5px]'} bg-amber-400`} />단축</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Family 7: autumn_spring_note — 야간진료 달력 (다크 헤더 + 화·목 컬럼 강조) ──
  if (themeValue === 'autumn_spring_note') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#f8fafc' }}>
        {/* 다크 컴팩트 배너 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '6px 10px' : '3px 5px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
          <div>
            <div className={`${s ? 'text-[12px]' : 'text-[6px]'} font-black text-white leading-tight`}>3월 진료안내</div>
            <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} text-slate-400`}>OO병원</div>
          </div>
          <div className={`${s ? 'text-[7px] px-2 py-0.5' : 'text-[3px] px-1 py-[1px]'} rounded-full font-extrabold text-white`}
            style={{ background: 'linear-gradient(90deg, #f59e0b, #d97706)' }}>야간 화·목</div>
        </div>
        {/* 요일 헤더 — 화·목 앰버 강조 */}
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const isNight = i === 2 || i === 4; // 화, 목
            return (
              <div key={d} className={`text-center font-extrabold ${s ? 'text-[9px] py-[3px]' : 'text-[4px] py-[1px]'}`}
                style={{ background: isNight ? '#fef3c7' : i === 0 ? '#fef2f2' : '#f8fafc', color: isNight ? '#92400e' : i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#64748b' }}>
                {d}{isNight ? '★' : ''}
              </div>
            );
          })}
        </div>
        {/* 달력 격자 — 화·목 컬럼 앰버 틴트 */}
        <div className="grid grid-cols-7 flex-1">
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            if (!d) return <div key={`e${i}`} style={{ borderRight: '0.5px solid #f1f5f9', borderBottom: '0.5px solid #f1f5f9', background: (i % 7 === 2 || i % 7 === 4) ? '#fffbeb' : 'transparent' }} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            const isNightCol = i % 7 === 2 || i % 7 === 4;
            return (
              <div key={i} className="flex flex-col items-center justify-center"
                style={{
                  borderRight: '0.5px solid #f1f5f9',
                  borderBottom: '0.5px solid #f1f5f9',
                  background: isClosed ? '#fef2f2' : isShort ? '#fefce8' : isNightCol ? '#fffbeb' : 'white',
                }}>
                <span className={`${s ? 'text-[10px]' : 'text-[5px]'} font-bold`}
                  style={{ color: isClosed ? '#dc2626' : isShort ? '#a16207' : i % 7 === 0 ? '#dc2626' : isNightCol ? '#92400e' : '#374151' }}>{d}</span>
                {isClosed && <span className={`${s ? 'text-[5px] px-1' : 'text-[2.5px] px-0.5'} font-black text-white leading-none rounded-sm bg-red-500`}>휴진</span>}
                {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-black text-amber-600 leading-none`}>단축</span>}
              </div>
            );
          })}
        </div>
        {/* 풋터 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '4px 8px' : '2px 4px', background: '#1e293b' }}>
          <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} text-white/70`}>
            평일 09~18 · <span className="text-amber-400 font-bold">화목 ~21시</span> · 토 09~13
          </div>
          <span className={`${s ? 'text-[7px]' : 'text-[3px]'} text-white/40`}>02-000-0000</span>
        </div>
      </div>
    );
  }

  // ── Family 8: autumn_holiday — SNS 볼드 달력 (컬러 히어로 + 라운드 격자) ──
  if (themeValue === 'autumn_holiday') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: 'white' }}>
        {/* 컴팩트 히어로 배너 — 볼드 컬러 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '6px 10px' : '3px 5px', background: `linear-gradient(135deg, ${c}, ${c}cc)` }}>
          <div>
            <div className={`${s ? 'text-[12px]' : 'text-[6px]'} font-black text-white leading-tight`}>3월 진료안내</div>
            <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} text-white/70`}>OO치과의원</div>
          </div>
          <div className={`${s ? 'text-[16px]' : 'text-[8px]'} font-black text-white/30`}>3</div>
        </div>
        {/* 요일 헤더 — 둥근 뱃지 스타일 */}
        <div className="grid grid-cols-7" style={{ padding: s ? '4px 4px 2px' : '2px 2px 1px', gap: s ? '2px' : '1px' }}>
          {days.map((d, i) => (
            <div key={d} className={`text-center font-extrabold ${s ? 'text-[9px] py-[2px]' : 'text-[4px] py-[1px]'}`}
              style={{ background: i === 0 ? '#fef2f2' : i === 6 ? '#eff6ff' : '#f8fafc', borderRadius: s ? 6 : 3, color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#64748b' }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — 라운드 셀, 간격 있는 SNS 스타일 */}
        <div className="grid grid-cols-7 flex-1" style={{ padding: s ? '0 4px 4px' : '0 2px 2px', gap: s ? '2px' : '1px' }}>
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            return (
              <div key={i} className="flex flex-col items-center justify-center relative"
                style={{
                  borderRadius: s ? 8 : 4,
                  background: isClosed ? `${c}18` : isShort ? '#fffbeb' : '#f8fafc',
                  border: isClosed ? `1.5px solid ${c}` : '0.5px solid #e2e8f0',
                }}>
                <span className={`${s ? 'text-[10px]' : 'text-[5px]'} font-bold`}
                  style={{ color: isClosed ? c : isShort ? '#a16207' : i % 7 === 0 ? '#dc2626' : i % 7 === 6 ? '#2563eb' : '#1e293b' }}>{d}</span>
                {isClosed && <span className={`${s ? 'text-[5px] px-1.5 py-[0.5px]' : 'text-[2.5px] px-0.5'} font-black text-white rounded-full leading-none`} style={{ background: c }}>휴진</span>}
                {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-black text-amber-600 leading-none`}>단축</span>}
              </div>
            );
          })}
        </div>
        {/* 풋터 — 정보 + 휴진일 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '4px 10px' : '2px 5px', borderTop: `2px solid ${c}15` }}>
          <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} text-slate-500`}>09~18 · 토 09~13</span>
          <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-bold`} style={{ color: c }}>휴진 9·23일</span>
        </div>
      </div>
    );
  }

  // ── Family 9: hanok_roof — 프리미엄 골드 달력 (아이보리 + 세리프 + 점선 격자) ──
  if (themeValue === 'hanok_roof') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: 'linear-gradient(175deg, #faf7f2 0%, #f5ebe0 100%)' }}>
        {/* 우아한 헤더 — 센터 정렬, 골드 디바이더 */}
        <div className="flex flex-col items-center" style={{ padding: s ? '8px 0 4px' : '4px 0 2px' }}>
          <div className={`${s ? 'text-[7px]' : 'text-[3px]'} tracking-[0.4em] font-medium`} style={{ color: '#a3836a' }}>OO피부과의원</div>
          <div className="flex items-center" style={{ gap: s ? 5 : 2.5, margin: s ? '3px 0' : '1.5px 0' }}>
            <div style={{ width: s ? 14 : 7, height: '0.5px', background: 'linear-gradient(90deg, transparent, #c9a96e)' }} />
            <div style={{ width: s ? 3 : 1.5, height: s ? 3 : 1.5, border: '0.5px solid #c9a96e', transform: 'rotate(45deg)' }} />
            <div style={{ width: s ? 14 : 7, height: '0.5px', background: 'linear-gradient(90deg, #c9a96e, transparent)' }} />
          </div>
          <div className={`${s ? 'text-[14px]' : 'text-[7px]'} font-black leading-none`} style={{ color: '#5c3d2e', fontFamily: 'Georgia, serif' }}>3월 진료안내</div>
        </div>
        {/* 요일 헤더 — 세리프, 골드 밑줄 */}
        <div className="grid grid-cols-7" style={{ borderBottom: '1px solid #c9a96e44', borderTop: '1px solid #c9a96e44' }}>
          {days.map((d, i) => (
            <div key={d} className={`text-center font-bold ${s ? 'text-[8px] py-[3px]' : 'text-[3.5px] py-[1px]'}`}
              style={{ color: i === 0 ? '#b91c1c' : i === 6 ? '#1d4ed8' : '#78350f', fontFamily: 'Georgia, serif' }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — 점선 구분, 세리프 숫자, 골드 테두리 휴진 */}
        <div className="grid grid-cols-7 flex-1">
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            if (!d) return <div key={`e${i}`} style={{ borderRight: '0.5px dashed #c9a96e22', borderBottom: '0.5px dashed #c9a96e22' }} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            return (
              <div key={i} className="flex flex-col items-center justify-center"
                style={{
                  borderRight: '0.5px dashed #c9a96e22',
                  borderBottom: '0.5px dashed #c9a96e22',
                  background: isClosed ? '#78350f08' : 'transparent',
                }}>
                <span className={`${s ? 'text-[10px]' : 'text-[5px]'}`}
                  style={{
                    fontFamily: 'Georgia, serif',
                    fontWeight: isClosed ? 800 : 500,
                    color: isClosed ? '#b91c1c' : isShort ? '#a16207' : i % 7 === 0 ? '#b91c1c' : i % 7 === 6 ? '#1d4ed8' : '#5c3d2e',
                  }}>{d}</span>
                {isClosed && <span className={`${s ? 'text-[5px] px-1 border' : 'text-[2px] px-0.5 border-[0.5px]'} font-bold leading-none`}
                  style={{ color: '#b91c1c', borderColor: '#c9a96e', borderRadius: 1 }}>휴진</span>}
                {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2px]'} font-bold leading-none`} style={{ color: '#a16207' }}>단축</span>}
              </div>
            );
          })}
        </div>
        {/* 풋터 — 골드 디바이더 + 정보 */}
        <div className="flex flex-col items-center" style={{ padding: s ? '3px 0 5px' : '1.5px 0 2.5px', borderTop: '1px solid #c9a96e44' }}>
          <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium`} style={{ color: '#92400e' }}>
            평일 10~19 · 토 10~15 · 점심 13~14
          </div>
          <div className={`${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: '#a3836a88' }}>02-000-0000</div>
        </div>
      </div>
    );
  }

  // ── Family 10: dark_green_clinic — 프리미엄 그린 (다크 헤더 + 밝은 달력 본문) ──
  if (themeValue === 'dark_green_clinic') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#f8faf8' }}>
        {/* 다크 그린 헤더 — 프리미엄 느낌 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '8px 12px' : '4px 6px', background: 'linear-gradient(135deg, #14532d 0%, #166534 100%)' }}>
          <div>
            <div className={`${s ? 'text-[13px]' : 'text-[6.5px]'} font-black text-white leading-tight`}>3월 진료안내</div>
            <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium`} style={{ color: '#86efac' }}>OO의원 · 2026</div>
          </div>
          <div className={`${s ? 'text-[18px]' : 'text-[9px]'} font-black text-white/20 leading-none`}>3</div>
        </div>
        {/* 에메랄드 서브 라인 */}
        <div style={{ height: s ? '2px' : '1px', background: 'linear-gradient(90deg, #059669, #10b981, #059669)' }} />
        {/* 요일 헤더 — 밝은 그린 틴트 */}
        <div className="grid grid-cols-7" style={{ background: '#ecfdf5', borderBottom: '1px solid #d1fae5' }}>
          {days.map((d, i) => (
            <div key={d} className={`text-center font-extrabold ${s ? 'text-[9px] py-[3px]' : 'text-[4px] py-[1.5px]'}`}
              style={{ color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#166534' }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — 밝은 배경, 그린 악센트 보더 */}
        <div className="grid grid-cols-7 flex-1">
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            if (!d) return <div key={`e${i}`} style={{ borderRight: '0.5px solid #d1fae5', borderBottom: '0.5px solid #d1fae5' }} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            return (
              <div key={i} className="flex flex-col items-center justify-center"
                style={{
                  borderRight: '0.5px solid #d1fae5',
                  borderBottom: '0.5px solid #d1fae5',
                  background: isClosed ? '#fef2f2' : isShort ? '#fffbeb' : 'white',
                  borderLeft: isClosed ? '2px solid #166534' : undefined,
                }}>
                <span className={`${s ? 'text-[10px]' : 'text-[5px]'} font-bold`}
                  style={{ color: isClosed ? '#dc2626' : isShort ? '#92400e' : i % 7 === 0 ? '#dc2626' : i % 7 === 6 ? '#2563eb' : '#14532d' }}>{d}</span>
                {isClosed && <span className={`${s ? 'text-[5px] px-1' : 'text-[2.5px] px-0.5'} font-black text-white leading-none rounded-sm bg-red-600`}>휴진</span>}
                {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-bold leading-none`} style={{ color: '#92400e' }}>단축</span>}
              </div>
            );
          })}
        </div>
        {/* 풋터 — 다크 그린 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '4px 12px' : '2px 6px', background: '#14532d' }}>
          <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium text-white/80`}>09–18 · 토 09–13</span>
          <span className={`${s ? 'text-[7px]' : 'text-[3px]'} text-emerald-300/60`}>02-000-0000</span>
        </div>
      </div>
    );
  }

  // ── Family 11: dark_blue_modern — 프리미엄 블루 (좌측 패널 25% + 밝은 달력 75%) ──
  if (themeValue === 'dark_blue_modern') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex" style={{ background: '#ffffff' }}>
        {/* 좌측 딥블루 패널 — 25%, 경량화 */}
        <div className="flex flex-col items-center justify-center" style={{ width: '25%', background: 'linear-gradient(180deg, #1e3a5f 0%, #1e40af 100%)', padding: s ? '6px 0' : '3px 0' }}>
          <div className={`${s ? 'text-[6px]' : 'text-[2.5px]'} text-blue-200/40 tracking-[0.2em]`}>MARCH</div>
          <div className={`${s ? 'text-[24px]' : 'text-[12px]'} font-black text-white leading-none`}>3</div>
          <div className={`${s ? 'text-[8px]' : 'text-[4px]'} text-blue-200/70 font-bold`}>월</div>
          <div className={`${s ? 'w-5 h-[0.5px] my-1' : 'w-2.5 h-[0.5px] my-0.5'}`} style={{ background: '#60a5fa44' }} />
          <div className={`${s ? 'text-[6px]' : 'text-[2.5px]'} text-blue-200/40 text-center`}>OO내과</div>
        </div>
        {/* 우측 달력 영역 — 75%, 순백 */}
        <div className="flex-1 flex flex-col" style={{ borderLeft: '2px solid #3b82f6' }}>
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7" style={{ borderBottom: '1px solid #e2e8f0' }}>
            {days.map((d, i) => (
              <div key={d} className={`text-center font-extrabold ${s ? 'text-[8px] py-[3px]' : 'text-[3.5px] py-[1.5px]'}`}
                style={{ color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#1e3a5f' }}>{d}</div>
            ))}
          </div>
          {/* 달력 격자 — 순백, 교대 틴트 제거 */}
          <div className="grid grid-cols-7 flex-1">
            {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
              if (!d) return <div key={`e${i}`} style={{ borderRight: '0.5px solid #f1f5f9', borderBottom: '0.5px solid #f1f5f9' }} />;
              const isClosed = d === 9 || d === 23;
              const isShort = d === 16;
              return (
                <div key={i} className="flex flex-col items-center justify-center"
                  style={{
                    borderRight: '0.5px solid #f1f5f9',
                    borderBottom: '0.5px solid #f1f5f9',
                    background: isClosed ? '#fef2f2' : isShort ? '#fffbeb' : 'white',
                    borderLeft: isClosed ? '2px solid #1e40af' : undefined,
                  }}>
                  <span className={`${s ? 'text-[10px]' : 'text-[5px]'} font-bold`}
                    style={{ color: isClosed ? '#dc2626' : isShort ? '#92400e' : i % 7 === 0 ? '#dc2626' : i % 7 === 6 ? '#2563eb' : '#1e293b' }}>{d}</span>
                  {isClosed && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-black text-red-600 leading-none`}>휴진</span>}
                  {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-bold text-amber-600 leading-none`}>단축</span>}
                </div>
              );
            })}
          </div>
          {/* 풋터 */}
          <div className="flex items-center justify-between" style={{ padding: s ? '3px 8px' : '1.5px 4px', borderTop: '1px solid #e2e8f0' }}>
            <span className={`${s ? 'text-[7px]' : 'text-[3px]'} font-medium`} style={{ color: '#1e3a5f' }}>09–18 · 토 09–13</span>
            <span className={`${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: '#93c5fd' }}>02-000-0000</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Family 12: lavender_sparkle — 라벤더 소프트 클리닉 (둥근 외곽 + 갭 셀 + 절제된 라벤더 톤) ──
  if (themeValue === 'lavender_sparkle') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#f9f7fc', borderRadius: s ? 12 : 6, overflow: 'hidden', boxShadow: '0 1px 4px rgba(100,70,130,0.06)' }}>
        {/* 라벤더 그레이 헤더 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '8px 12px' : '4px 6px', background: '#f0ecf5', borderBottom: '1px solid #ddd4e8' }}>
          <div>
            <div className={`${s ? 'text-[13px]' : 'text-[6.5px]'} font-black leading-tight`} style={{ color: '#3b2d4a' }}>3월 진료안내</div>
            <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium`} style={{ color: '#8b7a9e' }}>2026년 March</div>
          </div>
          <div className="flex flex-col items-end">
            <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-bold`} style={{ color: '#6b5b7b' }}>OO의원</span>
            <span className={`${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: '#a090b0' }}>02-000-0000</span>
          </div>
        </div>
        {/* 요일 헤더 — 라벤더 필 배지 */}
        <div className="grid grid-cols-7" style={{ padding: s ? '4px 6px 2px' : '2px 3px 1px', gap: s ? '3px' : '1.5px' }}>
          {days.map((d, i) => (
            <div key={d} className={`text-center font-black ${s ? 'text-[8px] py-[2px]' : 'text-[3.5px] py-[1px]'}`}
              style={{
                color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#5b4a6b',
                background: i === 0 ? '#fef2f2' : i === 6 ? '#eff6ff' : '#f0ecf5',
                borderRadius: s ? 8 : 4,
              }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — 라벤더 틴트 라운드 셀 */}
        <div className="grid grid-cols-7 flex-1" style={{ padding: s ? '2px 6px 4px' : '1px 3px 2px', gap: s ? '2px' : '1px' }}>
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            return (
              <div key={i} className="flex flex-col items-center justify-center"
                style={{
                  borderRadius: s ? 6 : 3,
                  background: isClosed ? '#fce8ec' : isShort ? '#fef3c7' : '#fefcff',
                  border: isClosed ? '1px solid #e879a0' : '0.5px solid #e0d8ea',
                }}>
                <span className={`${s ? 'text-[10px]' : 'text-[5px]'} font-bold`}
                  style={{ color: isClosed ? '#be123c' : isShort ? '#92400e' : i % 7 === 0 ? '#dc2626' : i % 7 === 6 ? '#2563eb' : '#3b2d4a' }}>{d}</span>
                {isClosed && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-black leading-none`} style={{ color: '#be123c' }}>휴진</span>}
                {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-bold leading-none`} style={{ color: '#92400e' }}>단축</span>}
              </div>
            );
          })}
        </div>
        {/* 풋터 — 라벤더 정보 바 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '5px 12px' : '2px 6px', background: '#f0ecf5', borderTop: '1px solid #ddd4e8' }}>
          <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium`} style={{ color: '#5b4a6b' }}>평일 09–18 · 토 09–13</span>
          <div className="flex gap-1.5">
            <span className={`flex items-center gap-0.5 ${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: '#6b5b7b' }}>
              <span className={`inline-block ${s ? 'w-2 h-2' : 'w-1 h-1'}`} style={{ borderRadius: s ? 3 : 1.5, background: '#fce8ec', border: '0.5px solid #e879a0' }} />휴진
            </span>
            <span className={`flex items-center gap-0.5 ${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: '#6b5b7b' }}>
              <span className={`inline-block ${s ? 'w-2 h-2' : 'w-1 h-1'}`} style={{ borderRadius: s ? 3 : 1.5, background: '#fef3c7' }} />단축
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Fallback (should not reach)
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-50">
      <span className="text-[10px] text-slate-400">{themeValue}</span>
    </div>
  );
}

// ─── 이벤트 프리뷰 ───
function EventPreview({ t, name }: { t: CategoryTemplate; name: string }) {
  const h = t.layoutHint;
  if (h === 'price' || h === 'table') {
    // 가격 강조형 — 큰 할인율 + 취소선 원가
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(160deg, ${t.bg} 0%, white 70%)` }}>
        <div className="px-3 pt-3 pb-1">
          <div className="text-[6px] font-bold tracking-wider uppercase" style={{ color: t.accent }}>SPECIAL EVENT</div>
          <div className="text-[10px] font-extrabold mt-0.5" style={{ color: t.accent }}>봄맞이 할인</div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-3">
          <div className="text-[18px] font-black" style={{ color: t.color }}>30%</div>
          <div className="text-[7px] text-slate-400 line-through">500,000원</div>
          <div className="text-[10px] font-extrabold mt-0.5" style={{ color: t.accent }}>350,000원</div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[6px] py-1 px-2 rounded text-center font-bold text-white" style={{ background: t.color }}>예약 문의</div>
          <div className="text-[5px] text-center mt-1" style={{ color: t.accent + '99' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'elegant' || h === 'luxury') {
    // 럭셔리 프리미엄 캠페인
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(175deg, ${t.accent} 0%, ${t.color} 100%)` }}>
        <div className="flex-1 flex flex-col justify-center items-center px-3 text-center">
          <div className="text-[5px] tracking-[0.25em] font-medium text-white/60 uppercase mb-1">Premium Event</div>
          <div className="w-8 h-[0.5px] bg-white/30 mb-2" />
          <div className="text-[11px] font-extrabold text-white leading-tight">프리미엄<br/>시술 이벤트</div>
          <div className="w-8 h-[0.5px] bg-white/30 mt-2 mb-1" />
          <div className="text-[7px] text-white/80 font-medium">첫 방문 고객 특별가</div>
        </div>
        <div className="px-3 pb-3">
          <div className="text-[5px] text-white/50 text-center">{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'pop' || h === 'cute') {
    // 활기찬 SNS 피드형
    return (
      <div className="w-full h-full flex flex-col" style={{ background: t.bg }}>
        <div className="px-2.5 pt-2.5">
          <div className="rounded-lg px-2 py-0.5 inline-block text-[6px] font-extrabold text-white" style={{ background: t.color }}>EVENT</div>
        </div>
        <div className="flex-1 flex flex-col justify-center px-3">
          <div className="text-[11px] font-black leading-tight" style={{ color: t.accent }}>임플란트<br/>특가 이벤트!</div>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-[14px] font-black" style={{ color: t.color }}>50%</span>
            <span className="text-[6px] font-bold" style={{ color: t.accent }}>할인</span>
          </div>
          <div className="text-[6px] mt-1" style={{ color: t.accent + 'aa' }}>3/1 ~ 3/31</div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[5px] font-medium" style={{ color: t.accent + '80' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'minimal') {
    // 미니멀 타이포 중심
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="flex-1 flex flex-col justify-center px-4">
          <div className="text-[5px] font-medium text-slate-400 tracking-widest mb-1">EVENT</div>
          <div className="text-[11px] font-extrabold text-slate-800 leading-tight">스케일링<br/>이벤트</div>
          <div className="w-6 h-[1px] mt-2 mb-1.5" style={{ background: t.color }} />
          <div className="text-[7px] font-bold" style={{ color: t.color }}>₩ 30,000</div>
          <div className="text-[5px] text-slate-400 mt-0.5">3/1(금) ~ 3/31(일)</div>
        </div>
        <div className="px-4 pb-2.5 flex justify-between items-end">
          <div className="text-[5px] text-slate-300">{name}</div>
          <div className="text-[5px] font-bold" style={{ color: t.color }}>자세히 →</div>
        </div>
      </div>
    );
  }
  if (h === 'wave' || h === 'gradient') {
    // 그라데이션 웨이브
    return (
      <div className="w-full h-full flex flex-col relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${t.color} 0%, ${t.accent} 100%)` }}>
        <div className="absolute bottom-0 left-0 right-0 h-[40%]" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.15) 100%)' }} />
        <div className="flex-1 flex flex-col justify-center items-center px-3 text-center relative z-10">
          <div className="text-[5px] tracking-[0.2em] text-white/60 font-medium mb-1">SPECIAL OFFER</div>
          <div className="text-[11px] font-extrabold text-white leading-tight">봄맞이<br/>특별 이벤트</div>
          <div className="mt-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-0.5">
            <span className="text-[8px] font-black text-white">UP TO 40% OFF</span>
          </div>
        </div>
        <div className="px-3 pb-2 relative z-10">
          <div className="text-[5px] text-white/50 text-center">{name}</div>
        </div>
      </div>
    );
  }
  // season / nature — 시즌 일러스트 느낌
  return (
    <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(170deg, ${t.bg} 30%, white 100%)` }}>
      <div className="px-3 pt-3">
        <div className="text-[5px] font-bold" style={{ color: t.color }}>SEASONAL EVENT</div>
      </div>
      <div className="flex-1 flex flex-col justify-center px-3">
        <div className="text-[10px] font-extrabold leading-tight" style={{ color: t.accent }}>시즌 한정<br/>특별 프로모션</div>
        <div className="flex items-center gap-1 mt-1.5">
          <div className="text-[6px] line-through text-slate-400">450,000원</div>
          <div className="text-[8px] font-black" style={{ color: t.color }}>299,000원</div>
        </div>
        <div className="text-[5px] mt-1" style={{ color: t.accent + 'aa' }}>기간: 3월 1일 ~ 31일</div>
      </div>
      <div className="px-3 pb-2 flex items-center justify-between">
        <div className="text-[5px]" style={{ color: t.accent + '80' }}>{name}</div>
        <div className="text-[5px] font-bold px-1.5 py-0.5 rounded" style={{ background: t.color + '20', color: t.color }}>문의하기</div>
      </div>
    </div>
  );
}

// ─── 의사 소개 프리뷰 ───
function DoctorPreview({ t, name }: { t: CategoryTemplate; name: string }) {
  const h = t.layoutHint;
  if (h === 'portrait' || h === 'curve') {
    // 프로필 중심 — 원형/곡선 마스크
    return (
      <div className="w-full h-full flex flex-col" style={{ background: t.bg }}>
        <div className="flex-1 flex flex-col items-center justify-center px-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-1.5" style={{ background: `linear-gradient(135deg, ${t.color}30, ${t.accent}20)`, border: `2px solid ${t.color}40` }}>
            <svg className="w-6 h-6" style={{ color: t.color + '80' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </div>
          <div className="text-[10px] font-extrabold" style={{ color: t.accent }}>김철수 원장</div>
          <div className="text-[6px] font-medium mt-0.5" style={{ color: t.color }}>치과보철과 전문의</div>
          <div className="w-5 h-[0.5px] my-1.5" style={{ background: t.color + '40' }} />
          <div className="text-[5px] text-center leading-relaxed" style={{ color: t.accent + 'aa' }}>서울대 치의학 박사<br/>前 서울대치과병원</div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[5px] text-center" style={{ color: t.accent + '60' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'split' || h === 'grid') {
    // 좌우 분할 레이아웃
    return (
      <div className="w-full h-full flex flex-col" style={{ background: 'white' }}>
        <div className="flex flex-1">
          <div className="w-[40%] flex items-center justify-center" style={{ background: `linear-gradient(180deg, ${t.color} 0%, ${t.accent} 100%)` }}>
            <svg className="w-8 h-8 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </div>
          <div className="w-[60%] flex flex-col justify-center px-2.5 py-2">
            <div className="text-[9px] font-extrabold" style={{ color: t.accent }}>김철수 원장</div>
            <div className="text-[5px] font-medium mt-0.5" style={{ color: t.color }}>치과보철과 전문의</div>
            <div className="w-4 h-[0.5px] my-1" style={{ background: t.color + '40' }} />
            <div className="space-y-0.5">
              {['서울대 치의학 졸업','보철학회 정회원','경력 15년'].map((c, i) => (
                <div key={i} className="flex items-start gap-0.5">
                  <div className="w-1 h-1 rounded-full mt-[2px] flex-shrink-0" style={{ background: t.color + '60' }} />
                  <span className="text-[4.5px]" style={{ color: t.accent + 'bb' }}>{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="px-2 pb-1.5">
          <div className="text-[4px] text-right" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'story') {
    // 스토리 / 브로슈어형
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(180deg, ${t.accent} 0%, ${t.accent}ee 30%, ${t.bg} 100%)` }}>
        <div className="pt-3 px-3">
          <div className="text-[5px] text-white/50 tracking-widest">SPECIALIST</div>
          <div className="text-[10px] font-extrabold text-white mt-0.5">전문의 소개</div>
        </div>
        <div className="flex-1 flex flex-col justify-end px-3 pb-2">
          <div className="bg-white/95 rounded-lg p-2 backdrop-blur-sm" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div className="text-[8px] font-extrabold" style={{ color: t.accent }}>김철수 원장</div>
            <div className="text-[5px] mt-0.5" style={{ color: t.color }}>치과보철과 전문의</div>
            <div className="mt-1 space-y-0.5">
              {['서울대학교 치의학대학원','前 서울대치과병원 전공의'].map((c, i) => (
                <div key={i} className="text-[4.5px]" style={{ color: t.accent + 'aa' }}>• {c}</div>
              ))}
            </div>
          </div>
          <div className="text-[4px] text-center mt-1" style={{ color: t.accent + '60' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'luxury') {
    // 럭셔리 다크 카드
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(170deg, #1a1a2e 0%, ${t.accent} 100%)` }}>
        <div className="flex-1 flex flex-col items-center justify-center px-3">
          <div className="text-[5px] tracking-[0.3em] text-white/40 uppercase mb-2">Medical Director</div>
          <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center mb-2">
            <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </div>
          <div className="text-[10px] font-extrabold text-white">김철수 원장</div>
          <div className="text-[6px] mt-0.5" style={{ color: t.color }}>치과보철과 전문의</div>
          <div className="w-6 h-[0.5px] bg-white/20 my-1.5" />
          <div className="text-[5px] text-white/40 text-center leading-relaxed">서울대 치의학 박사<br/>경력 15년</div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px] text-center text-white/30">{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'minimal') {
    // 미니멀 화이트
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="flex-1 flex flex-col justify-center px-3.5">
          <div className="text-[5px] text-slate-400 tracking-widest mb-1">DOCTOR</div>
          <div className="text-[11px] font-extrabold text-slate-800">김철수</div>
          <div className="text-[6px] font-medium mt-0.5" style={{ color: t.color }}>치과보철과 전문의</div>
          <div className="w-full h-[0.5px] bg-slate-200 my-2" />
          <div className="space-y-0.5">
            {['서울대 치의학 박사','前 서울대치과병원','보철학회 정회원'].map((c, i) => (
              <div key={i} className="text-[5px] text-slate-500">{c}</div>
            ))}
          </div>
        </div>
        <div className="px-3.5 pb-2 flex justify-between">
          <div className="text-[4px] text-slate-300">{name}</div>
          <div className="w-3 h-[0.5px] self-center" style={{ background: t.color }} />
        </div>
      </div>
    );
  }
  // grid 기본 — 카드형
  return (
    <div className="w-full h-full flex flex-col" style={{ background: t.bg }}>
      <div className="h-[35%] flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${t.color}20, ${t.accent}15)` }}>
        <svg className="w-8 h-8" style={{ color: t.color + '60' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
      </div>
      <div className="flex-1 px-2.5 py-2 flex flex-col justify-center">
        <div className="text-[9px] font-extrabold" style={{ color: t.accent }}>김철수 원장</div>
        <div className="text-[5px] font-medium" style={{ color: t.color }}>치과보철과 전문의</div>
        <div className="mt-1 space-y-0.5">
          {['서울대 치의학 졸업','보철학회 정회원'].map((c, i) => (
            <div key={i} className="text-[4.5px] flex items-center gap-0.5" style={{ color: t.accent + 'aa' }}>
              <div className="w-0.5 h-0.5 rounded-full flex-shrink-0" style={{ background: t.color }} />{c}
            </div>
          ))}
        </div>
      </div>
      <div className="px-2.5 pb-1.5">
        <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
      </div>
    </div>
  );
}

// ─── 공지사항 프리뷰 ───
function NoticePreview({ t, name }: { t: CategoryTemplate; name: string }) {
  const h = t.layoutHint;
  if (h === 'alert' || h === 'warning') {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="px-3 pt-2.5 pb-1 flex items-center gap-1" style={{ borderBottom: `2px solid ${t.color}` }}>
          <div className="w-3 h-3 rounded flex items-center justify-center" style={{ background: t.color }}>
            <span className="text-[6px] text-white font-black">!</span>
          </div>
          <div className="text-[8px] font-extrabold" style={{ color: t.accent }}>긴급 공지</div>
        </div>
        <div className="flex-1 px-3 py-2 flex flex-col justify-center">
          <div className="text-[9px] font-extrabold leading-tight" style={{ color: t.accent }}>진료시간<br/>변경 안내</div>
          <div className="mt-1.5 space-y-0.5">
            {['변경일: 4월 1일부터','평일: 09:00~19:00','토요일: 09:00~14:00'].map((l, i) => (
              <div key={i} className="text-[5px]" style={{ color: t.accent + 'aa' }}>{l}</div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'soft' || h === 'popup') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center" style={{ background: t.bg }}>
        <div className="bg-white rounded-lg p-3 mx-2 text-center" style={{ boxShadow: `0 4px 16px ${t.color}20` }}>
          <div className="text-[5px] font-bold tracking-wider mb-1" style={{ color: t.color }}>NOTICE</div>
          <div className="text-[9px] font-extrabold leading-tight" style={{ color: t.accent }}>휴진 안내</div>
          <div className="w-5 h-[0.5px] mx-auto my-1.5" style={{ background: t.color + '40' }} />
          <div className="text-[5px] leading-relaxed" style={{ color: t.accent + 'aa' }}>3월 15일(토)<br/>정기 휴진입니다</div>
          <div className="text-[4px] mt-1.5" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'formal') {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="px-3 pt-3 pb-1">
          <div className="text-[5px] text-slate-400 tracking-widest">공 지 사 항</div>
          <div className="h-[0.5px] bg-slate-800 mt-1" />
          <div className="h-[0.5px] bg-slate-300 mt-[1px]" />
        </div>
        <div className="flex-1 px-3 py-2 flex flex-col justify-center">
          <div className="text-[10px] font-extrabold text-slate-800 leading-tight">진료시간<br/>변경 안내</div>
          <div className="mt-2 space-y-0.5">
            {['적용일: 2026년 4월 1일','평일 진료: 09:00~19:00','토요일 진료: 09:00~14:00'].map((l, i) => (
              <div key={i} className="text-[5px] text-slate-600">{l}</div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="h-[0.5px] bg-slate-300 mb-1" />
          <div className="text-[4px] text-center text-slate-400">{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'timeline') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: t.bg }}>
        <div className="px-3 pt-2.5">
          <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>공지사항</div>
          <div className="text-[5px] mt-0.5" style={{ color: t.color }}>업데이트 안내</div>
        </div>
        <div className="flex-1 px-3 py-2">
          <div className="border-l-[1.5px] pl-2 space-y-2" style={{ borderColor: t.color + '60' }}>
            {[{ d: '4/1', t: '진료시간 변경' }, { d: '3/15', t: '정기 휴진일' }, { d: '3/1', t: '시스템 점검' }].map((item, i) => (
              <div key={i} className="relative">
                <div className="absolute -left-[9px] top-0.5 w-2 h-2 rounded-full border" style={{ background: i === 0 ? t.color : 'white', borderColor: t.color }} />
                <div className="text-[4.5px] font-bold" style={{ color: t.accent }}>{item.d}</div>
                <div className="text-[5px]" style={{ color: t.accent + 'aa' }}>{item.t}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'bulletin') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(175deg, ${t.color} 0%, ${t.accent} 40%, ${t.bg} 100%)` }}>
        <div className="px-3 pt-3">
          <div className="text-[5px] text-white/60 tracking-wider">ANNOUNCEMENT</div>
          <div className="text-[10px] font-extrabold text-white mt-0.5">진료 안내</div>
        </div>
        <div className="flex-1 flex flex-col justify-end px-3 pb-2">
          <div className="bg-white rounded-lg p-2">
            <div className="space-y-1">
              {['평일: 09:00~18:00','토요일: 09:00~13:00','일요일/공휴일: 휴진'].map((l, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="w-1 h-1 rounded-full" style={{ background: t.color }} />
                  <span className="text-[5px]" style={{ color: t.accent }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[4px] text-center mt-1" style={{ color: t.accent + '60' }}>{name}</div>
        </div>
      </div>
    );
  }
  // minimal 기본
  return (
    <div className="w-full h-full flex flex-col bg-white">
      <div className="px-3 pt-3">
        <div className="inline-block px-1.5 py-0.5 rounded text-[5px] font-bold text-white" style={{ background: t.color }}>공지</div>
      </div>
      <div className="flex-1 px-3 py-2 flex flex-col justify-center">
        <div className="text-[10px] font-extrabold" style={{ color: t.accent }}>진료시간<br/>변경 안내</div>
        <div className="w-5 h-[0.5px] my-1.5" style={{ background: t.color + '40' }} />
        <div className="space-y-0.5">
          {['4월 1일부터 적용','평일 09:00~19:00'].map((l, i) => (
            <div key={i} className="text-[5px]" style={{ color: t.accent + 'aa' }}>{l}</div>
          ))}
        </div>
      </div>
      <div className="px-3 pb-2">
        <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
      </div>
    </div>
  );
}

// ─── 명절 인사 프리뷰 ───
function GreetingPreview({ t, name }: { t: CategoryTemplate; name: string }) {
  const h = t.layoutHint;
  // 명절 키워드 추출 (id에서)
  const id = t.id || '';
  const isSeollal = id.includes('seollal') || id.includes('lunar');
  const isChuseok = id.includes('chuseok');
  const isNewYear = id.includes('newyear') || id.includes('new_year');
  const isParents = id.includes('parent');
  const isXmas = id.includes('christmas') || id.includes('xmas');

  const holidayEmoji = isSeollal ? '🧧' : isChuseok ? '🌕' : isNewYear ? '✨' : isParents ? '🌸' : isXmas ? '🎄' : '🎊';
  const greetingText = isSeollal ? '새해 복\n많이 받으세요' : isChuseok ? '풍성한\n한가위 되세요' : isNewYear ? 'Happy\nNew Year' : isParents ? '감사합니다\n사랑합니다' : isXmas ? 'Merry\nChristmas' : '행복한\n하루 되세요';

  if (h === 'traditional') {
    return (
      <div className="w-full h-full flex flex-col relative overflow-hidden" style={{ background: `linear-gradient(170deg, ${t.bg} 0%, #fffbeb 100%)` }}>
        <div className="absolute top-0 left-0 right-0 h-3 opacity-30" style={{ background: `repeating-linear-gradient(90deg, ${t.color}40, ${t.color}40 4px, transparent 4px, transparent 8px)` }} />
        <div className="flex-1 flex flex-col items-center justify-center px-3 text-center">
          <div className="text-lg mb-1">{holidayEmoji}</div>
          <div className="text-[10px] font-extrabold leading-tight whitespace-pre-line" style={{ color: t.accent }}>{greetingText}</div>
          <div className="w-6 h-[0.5px] my-1.5" style={{ background: t.color + '60' }} />
          <div className="text-[5px]" style={{ color: t.accent + 'aa' }}>건강하고 행복한<br/>시간 되시길 바랍니다</div>
        </div>
        <div className="px-3 pb-2 text-center">
          <div className="text-[5px] font-medium" style={{ color: t.accent + '80' }}>{name} 임직원 일동</div>
        </div>
      </div>
    );
  }
  if (h === 'warm') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(175deg, ${t.bg} 0%, white 100%)` }}>
        <div className="flex-1 flex flex-col justify-center px-3">
          <div className="text-base mb-1">{holidayEmoji}</div>
          <div className="text-[10px] font-extrabold leading-tight whitespace-pre-line" style={{ color: t.accent }}>{greetingText}</div>
          <div className="mt-1.5 text-[5px] leading-relaxed" style={{ color: t.accent + 'aa' }}>늘 건강하시고<br/>행복하시길 바랍니다</div>
        </div>
        <div className="px-3 pb-2">
          <div className="h-[0.5px] mb-1.5" style={{ background: t.color + '30' }} />
          <div className="flex justify-between items-center">
            <div className="text-[5px]" style={{ color: t.accent + '70' }}>{name}</div>
            <div className="text-[4px]" style={{ color: t.accent + '50' }}>임직원 일동</div>
          </div>
        </div>
      </div>
    );
  }
  if (h === 'minimal') {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <div className="text-[5px] tracking-[0.3em] mb-2" style={{ color: t.color }}>GREETING</div>
          <div className="text-[11px] font-extrabold leading-tight whitespace-pre-line" style={{ color: t.accent }}>{greetingText}</div>
          <div className="w-4 h-[0.5px] my-2" style={{ background: t.color }} />
          <div className="text-[5px]" style={{ color: t.accent + '99' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'cute' || h === 'nature') {
    return (
      <div className="w-full h-full flex flex-col relative overflow-hidden" style={{ background: t.bg }}>
        <div className="absolute top-1 right-1 text-xl opacity-20">{holidayEmoji}</div>
        <div className="absolute bottom-1 left-1 text-base opacity-15">{holidayEmoji}</div>
        <div className="flex-1 flex flex-col justify-center px-3 relative z-10">
          <div className="text-sm mb-1">{holidayEmoji}</div>
          <div className="text-[10px] font-extrabold leading-tight whitespace-pre-line" style={{ color: t.accent }}>{greetingText}</div>
          <div className="mt-1.5 rounded-md px-1.5 py-1 inline-block" style={{ background: t.color + '15' }}>
            <div className="text-[5px]" style={{ color: t.accent }}>건강하고 행복한 하루 되세요</div>
          </div>
        </div>
        <div className="px-3 pb-2 relative z-10">
          <div className="text-[5px]" style={{ color: t.accent + '70' }}>{name}</div>
        </div>
      </div>
    );
  }
  // luxury
  return (
    <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(170deg, ${t.accent} 0%, ${t.color} 100%)` }}>
      <div className="flex-1 flex flex-col items-center justify-center px-3 text-center">
        <div className="text-[5px] tracking-[0.3em] text-white/40 uppercase mb-2">Season's Greetings</div>
        <div className="text-base mb-1.5 opacity-90">{holidayEmoji}</div>
        <div className="text-[10px] font-extrabold text-white leading-tight whitespace-pre-line">{greetingText}</div>
        <div className="w-8 h-[0.5px] bg-white/25 my-2" />
        <div className="text-[5px] text-white/60">건강하고 행복한<br/>시간 되시길 바랍니다</div>
      </div>
      <div className="px-3 pb-2">
        <div className="text-[4px] text-center text-white/40">{name} 임직원 일동</div>
      </div>
    </div>
  );
}

// ─── 채용 프리뷰 ───
function HiringPreview({ t, name }: { t: CategoryTemplate; name: string }) {
  const h = t.layoutHint;
  if (h === 'corporate') {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="h-[25%] flex items-center px-3" style={{ background: t.color }}>
          <div className="text-[9px] font-extrabold text-white">직원 모집</div>
        </div>
        <div className="flex-1 px-3 py-2 flex flex-col justify-center">
          <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>간호사 모집</div>
          <div className="mt-1.5 space-y-0.5">
            {['정규직 / 경력 우대','4대보험 / 중식 제공','연차·월차 보장'].map((l, i) => (
              <div key={i} className="text-[5px] flex items-center gap-0.5" style={{ color: t.accent + 'aa' }}>
                <span style={{ color: t.color }}>•</span> {l}
              </div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2 flex justify-between items-end">
          <div className="text-[4px]" style={{ color: t.accent + '60' }}>{name}</div>
          <div className="text-[5px] font-bold" style={{ color: t.color }}>지원하기 →</div>
        </div>
      </div>
    );
  }
  if (h === 'team') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: t.bg }}>
        <div className="px-3 pt-3">
          <div className="text-[5px] tracking-wider font-bold" style={{ color: t.color }}>WE'RE HIRING</div>
          <div className="text-[9px] font-extrabold mt-0.5" style={{ color: t.accent }}>함께 성장할<br/>인재를 찾습니다</div>
        </div>
        <div className="flex-1 px-3 py-2 flex items-center">
          <div className="flex gap-1">
            {[t.color, t.accent, t.color + 'aa'].map((c, i) => (
              <div key={i} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: c + '20', border: `1px solid ${c}40` }}>
                <svg className="w-3 h-3" style={{ color: c }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'modern') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(160deg, ${t.accent} 0%, ${t.color} 100%)` }}>
        <div className="flex-1 flex flex-col justify-center px-3">
          <div className="text-[5px] text-white/50 tracking-wider">RECRUITMENT</div>
          <div className="text-[10px] font-extrabold text-white mt-0.5 leading-tight">간호사<br/>모집합니다</div>
          <div className="w-6 h-[0.5px] bg-white/30 my-1.5" />
          <div className="space-y-0.5">
            {['정규직 채용','경력 우대'].map((l, i) => (
              <div key={i} className="text-[5px] text-white/70">{l}</div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="bg-white/15 rounded px-2 py-1 text-center">
            <div className="text-[5px] font-bold text-white">지원 문의</div>
          </div>
          <div className="text-[4px] text-center text-white/40 mt-1">{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'benefits') {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="px-3 pt-2.5">
          <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>복리후생</div>
        </div>
        <div className="flex-1 px-2.5 py-1.5">
          <div className="grid grid-cols-2 gap-1">
            {[{ icon: '🏥', l: '4대보험' }, { icon: '🍽️', l: '중식 제공' }, { icon: '📅', l: '연차 보장' }, { icon: '💰', l: '인센티브' }].map((b, i) => (
              <div key={i} className="rounded-md p-1.5 flex flex-col items-center" style={{ background: t.color + '10' }}>
                <div className="text-[8px]">{b.icon}</div>
                <div className="text-[5px] font-bold mt-0.5" style={{ color: t.accent }}>{b.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'urgent') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: t.bg }}>
        <div className="px-3 pt-2.5 flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: t.color }} />
          <div className="text-[6px] font-extrabold" style={{ color: t.color }}>급구</div>
        </div>
        <div className="flex-1 px-3 py-2 flex flex-col justify-center">
          <div className="text-[10px] font-black leading-tight" style={{ color: t.accent }}>간호사<br/>급히 모집</div>
          <div className="mt-1.5 text-[5px]" style={{ color: t.accent + 'aa' }}>채용시까지</div>
        </div>
        <div className="px-3 pb-2">
          <div className="rounded py-1 text-center text-[5px] font-bold text-white" style={{ background: t.color }}>지원하기</div>
          <div className="text-[4px] text-center mt-1" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  // brand
  return (
    <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(175deg, ${t.bg} 0%, white 100%)` }}>
      <div className="px-3 pt-3">
        <div className="text-[5px] font-bold tracking-wider" style={{ color: t.color }}>JOIN OUR TEAM</div>
      </div>
      <div className="flex-1 px-3 py-2 flex flex-col justify-center">
        <div className="text-[9px] font-extrabold leading-tight" style={{ color: t.accent }}>함께할<br/>동료를 찾습니다</div>
        <div className="w-5 h-[0.5px] my-1.5" style={{ background: t.color + '40' }} />
        <div className="text-[5px]" style={{ color: t.accent + 'aa' }}>간호사 / 치위생사</div>
        <div className="text-[5px] mt-0.5" style={{ color: t.accent + 'aa' }}>정규직 채용</div>
      </div>
      <div className="px-3 pb-2">
        <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
      </div>
    </div>
  );
}

// ─── 주의사항 프리뷰 ───
function CautionPreview({ t, name }: { t: CategoryTemplate; name: string }) {
  const h = t.layoutHint;
  if (h === 'checklist') {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="px-3 pt-2.5 pb-1" style={{ borderBottom: `1.5px solid ${t.color}30` }}>
          <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>시술 후 주의사항</div>
        </div>
        <div className="flex-1 px-3 py-2 space-y-1">
          {['음주/흡연 금지','자극적 음식 피하기','시술부위 접촉 금지','처방약 복용'].map((item, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm border flex items-center justify-center flex-shrink-0" style={{ borderColor: t.color + '60' }}>
                {i < 2 && <div className="w-1.5 h-1.5 rounded-sm" style={{ background: t.color }} />}
              </div>
              <span className="text-[5px]" style={{ color: t.accent + (i < 2 ? '' : 'aa') }}>{item}</span>
            </div>
          ))}
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: '#ef4444' }}>이상 시 즉시 연락</div>
          <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'warning') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(170deg, ${t.color} 0%, ${t.accent} 100%)` }}>
        <div className="flex-1 flex flex-col items-center justify-center px-3 text-center">
          <div className="w-8 h-8 rounded-full border-2 border-white/30 flex items-center justify-center mb-1.5">
            <span className="text-sm text-white font-black">!</span>
          </div>
          <div className="text-[9px] font-extrabold text-white">주의사항</div>
          <div className="w-6 h-[0.5px] bg-white/30 my-1.5" />
          <div className="text-[5px] text-white/70 leading-relaxed">시술 후 반드시<br/>확인해주세요</div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px] text-center text-white/40">{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'guide') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: t.bg }}>
        <div className="px-3 pt-2.5">
          <div className="text-[5px] font-bold" style={{ color: t.color }}>CARE GUIDE</div>
          <div className="text-[8px] font-extrabold mt-0.5" style={{ color: t.accent }}>시술 후 가이드</div>
        </div>
        <div className="flex-1 px-3 py-2 space-y-1.5">
          {[{ n: '01', t: '당일', d: '냉찜질 20분' }, { n: '02', t: '1~3일', d: '부드러운 음식' }, { n: '03', t: '1주일', d: '운동 금지' }].map((s, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <div className="text-[6px] font-black" style={{ color: t.color }}>{s.n}</div>
              <div>
                <div className="text-[5px] font-bold" style={{ color: t.accent }}>{s.t}</div>
                <div className="text-[4.5px]" style={{ color: t.accent + 'aa' }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'timeline') {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="px-3 pt-2.5">
          <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>회복 타임라인</div>
        </div>
        <div className="flex-1 px-3 py-1.5">
          <div className="relative">
            <div className="absolute left-[5px] top-1 bottom-1 w-[1px]" style={{ background: t.color + '40' }} />
            {[{ t: '직후', d: '냉찜질', c: t.color }, { t: '1~3일', d: '부드러운 음식', c: t.color + 'cc' }, { t: '1주', d: '운동 금지', c: t.color + '99' }, { t: '2주', d: '정상 식사', c: t.color + '66' }].map((s, i) => (
              <div key={i} className="flex items-center gap-2 mb-1 relative">
                <div className="w-2.5 h-2.5 rounded-full border-2 z-10 flex-shrink-0" style={{ borderColor: s.c, background: 'white' }} />
                <div className="flex-1">
                  <div className="text-[4.5px] font-bold" style={{ color: t.accent }}>{s.t}</div>
                  <div className="text-[4px]" style={{ color: t.accent + 'aa' }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: '#ef4444' }}>이상 시 연락: 02-000-0000</div>
        </div>
      </div>
    );
  }
  if (h === 'infographic') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(175deg, ${t.bg} 0%, white 100%)` }}>
        <div className="px-3 pt-2.5 text-center">
          <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>주의사항</div>
        </div>
        <div className="flex-1 px-2 py-1.5 grid grid-cols-2 gap-1">
          {[{ icon: '🚫', l: '음주 금지' }, { icon: '🚭', l: '흡연 금지' }, { icon: '🧊', l: '냉찜질' }, { icon: '💊', l: '약 복용' }].map((item, i) => (
            <div key={i} className="rounded-md p-1 flex flex-col items-center justify-center" style={{ background: 'white', border: `1px solid ${t.color}20` }}>
              <div className="text-[8px]">{item.icon}</div>
              <div className="text-[4.5px] font-bold mt-0.5" style={{ color: t.accent }}>{item.l}</div>
            </div>
          ))}
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px] text-center" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  // card
  return (
    <div className="w-full h-full flex flex-col bg-white">
      <div className="px-3 pt-2.5 flex items-center gap-1">
        <div className="w-3 h-3 rounded-full flex items-center justify-center" style={{ background: t.color + '20' }}>
          <span className="text-[6px]" style={{ color: t.color }}>⚠</span>
        </div>
        <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>주의사항</div>
      </div>
      <div className="flex-1 px-3 py-1.5 space-y-1">
        {['시술부위 접촉 금지','음주·흡연 삼가','자극적 음식 피하기'].map((item, i) => (
          <div key={i} className="flex items-start gap-1">
            <div className="text-[5px] font-black mt-0.5" style={{ color: t.color }}>{i + 1}</div>
            <span className="text-[5px]" style={{ color: t.accent + 'bb' }}>{item}</span>
          </div>
        ))}
      </div>
      <div className="px-3 pb-2">
        <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
      </div>
    </div>
  );
}

// ─── 가격표 프리뷰 ───
function PricingPreview({ t, name }: { t: CategoryTemplate; name: string }) {
  const h = t.layoutHint;
  const items = [{ n: '임플란트', p: '1,200,000원' }, { n: '레진 충전', p: '150,000원' }, { n: '치아 미백', p: '300,000원' }];

  if (h === 'table') {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="px-3 pt-2.5">
          <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>비급여 진료비</div>
        </div>
        <div className="flex-1 px-2.5 py-1.5">
          <div className="border rounded" style={{ borderColor: t.color + '30' }}>
            <div className="flex px-2 py-1" style={{ background: t.color, borderRadius: '3px 3px 0 0' }}>
              <div className="text-[5px] font-bold text-white flex-1">항목</div>
              <div className="text-[5px] font-bold text-white text-right">가격</div>
            </div>
            {items.map((item, i) => (
              <div key={i} className="flex px-2 py-1 items-center" style={{ background: i % 2 === 0 ? t.color + '08' : 'white', borderTop: `0.5px solid ${t.color}15` }}>
                <div className="text-[5px] flex-1" style={{ color: t.accent }}>{item.n}</div>
                <div className="text-[5px] font-bold text-right" style={{ color: t.accent }}>{item.p}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: t.accent + '60' }}>* 환자 상태에 따라 달라질 수 있습니다</div>
          <div className="text-[4px]" style={{ color: t.accent + '40' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'cards') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: t.bg }}>
        <div className="px-3 pt-2.5">
          <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>시술 안내</div>
        </div>
        <div className="flex-1 px-2.5 py-1.5 space-y-1">
          {items.map((item, i) => (
            <div key={i} className="bg-white rounded-md px-2 py-1.5 flex justify-between items-center" style={{ border: `0.5px solid ${t.color}20` }}>
              <div className="text-[5px] font-medium" style={{ color: t.accent }}>{item.n}</div>
              <div className="text-[5px] font-bold" style={{ color: t.color }}>{item.p}</div>
            </div>
          ))}
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'dark') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(170deg, ${t.accent} 0%, #1a1a2e 100%)` }}>
        <div className="px-3 pt-3">
          <div className="text-[5px] tracking-widest text-white/40">PRICE LIST</div>
          <div className="text-[8px] font-extrabold text-white mt-0.5">비급여 안내</div>
        </div>
        <div className="flex-1 px-3 py-2 space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between items-center py-0.5" style={{ borderBottom: '0.5px solid rgba(255,255,255,0.1)' }}>
              <div className="text-[5px] text-white/70">{item.n}</div>
              <div className="text-[5px] font-bold" style={{ color: t.color }}>{item.p}</div>
            </div>
          ))}
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px] text-white/30">{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'wood') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(175deg, #f5ebe0 0%, #faf7f4 100%)` }}>
        <div className="px-3 pt-2.5 text-center">
          <div className="text-[8px] font-extrabold" style={{ color: t.accent }}>MENU</div>
          <div className="w-8 h-[0.5px] mx-auto mt-1" style={{ background: t.color + '60' }} />
        </div>
        <div className="flex-1 px-3 py-1.5 space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between items-center">
              <div className="text-[5px]" style={{ color: t.accent }}>{item.n}</div>
              <div className="flex-1 mx-1 border-b border-dotted" style={{ borderColor: t.color + '30' }} />
              <div className="text-[5px] font-bold" style={{ color: t.accent }}>{item.p}</div>
            </div>
          ))}
        </div>
        <div className="px-3 pb-2 text-center">
          <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'gradient') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(135deg, ${t.color} 0%, ${t.accent} 100%)` }}>
        <div className="px-3 pt-3">
          <div className="text-[5px] text-white/50 tracking-wider">PRICE</div>
          <div className="text-[8px] font-extrabold text-white">비급여 안내</div>
        </div>
        <div className="flex-1 px-3 py-2 space-y-1">
          {items.map((item, i) => (
            <div key={i} className="bg-white/10 backdrop-blur-sm rounded px-2 py-1 flex justify-between items-center">
              <div className="text-[5px] text-white/80">{item.n}</div>
              <div className="text-[5px] font-bold text-white">{item.p}</div>
            </div>
          ))}
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px] text-white/40 text-center">{name}</div>
        </div>
      </div>
    );
  }
  // minimal
  return (
    <div className="w-full h-full flex flex-col bg-white">
      <div className="px-3 pt-3">
        <div className="text-[5px] text-slate-400 tracking-widest">PRICE</div>
        <div className="text-[8px] font-extrabold text-slate-800">비급여 진료비</div>
      </div>
      <div className="flex-1 px-3 py-2 space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex justify-between items-center py-0.5" style={{ borderBottom: `0.5px solid #f1f5f9` }}>
            <div className="text-[5px] text-slate-600">{item.n}</div>
            <div className="text-[5px] font-bold" style={{ color: t.color }}>{item.p}</div>
          </div>
        ))}
      </div>
      <div className="px-3 pb-2">
        <div className="w-4 h-[0.5px]" style={{ background: t.color }} />
        <div className="text-[4px] text-slate-400 mt-0.5">{name}</div>
      </div>
    </div>
  );
}

// ─── 통합 프리뷰 라우터 ───
function TemplateSVGPreview({ template: t, category, hospitalName }: { template: CategoryTemplate; category: TemplateCategory; hospitalName: string }) {
  if (t.previewImage) {
    return <img src={t.previewImage} alt={t.name} className="w-full h-full object-cover" loading="lazy" />;
  }
  const name = hospitalName || 'OO병원';
  if (category === 'event') return <EventPreview t={t} name={name} />;
  if (category === 'doctor') return <DoctorPreview t={t} name={name} />;
  if (category === 'notice') return <NoticePreview t={t} name={name} />;
  if (category === 'greeting') return <GreetingPreview t={t} name={name} />;
  if (category === 'hiring') return <HiringPreview t={t} name={name} />;
  if (category === 'caution') return <CautionPreview t={t} name={name} />;
  if (category === 'pricing') return <PricingPreview t={t} name={name} />;
  // schedule fallback (used in enlarged modal if needed)
  return <CalendarThemePreview themeValue={t.id} groupColor={t.color} size="lg" />;
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
            /* 진료 일정: 달력형 / 안내형 그룹 헤더 + 3열 그리드 */
            <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
              {SCHEDULE_GROUPS.map(group => {
                const groupThemes = CALENDAR_THEME_OPTIONS.filter(t => group.values.includes(t.value));
                if (groupThemes.length === 0) return null;
                return (
                  <div key={group.label}>
                    {/* 그룹 섹션 헤더 */}
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <span className="text-sm font-bold text-slate-700">{group.label}</span>
                      <span className="text-[10px] text-slate-400">{group.desc}</span>
                      <span className="text-[10px] text-slate-300 ml-auto">{groupThemes.length}종</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {groupThemes.map(t => {
                        const isSelected = calendarTheme === t.value;
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
                            <div className="relative" style={{ aspectRatio: '3/4' }}>
                              <CalendarThemePreview themeValue={t.value} groupColor={t.groupColor} />
                              {/* 선택 체크 뱃지 */}
                              {isSelected && (
                                <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: t.groupColor }}>
                                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                </div>
                              )}
                            </div>
                            {/* 카드 외부 name/desc */}
                            <div className="px-1.5 py-1.5 bg-white">
                              <div className="font-bold text-[11px] text-slate-800 leading-tight truncate">{t.label.replace(/^[^\s]+\s/, '')}</div>
                              <div className="text-[9px] text-slate-500 mt-0.5 leading-tight truncate">{t.desc}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
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
        if (!themeOpt) return null;
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
              <div className="p-6 bg-slate-50 min-h-[320px]">
                <div className="w-full max-w-sm mx-auto rounded-xl overflow-hidden shadow-lg border border-slate-200" style={{ aspectRatio: '3/4' }}>
                  <CalendarThemePreview themeValue={enlargedCalendarTheme} groupColor={themeOpt.groupColor} size="lg" />
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
