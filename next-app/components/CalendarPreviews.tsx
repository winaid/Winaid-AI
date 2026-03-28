/**
 * CalendarPreviews.tsx — 달력 테마 프리뷰 컴포넌트
 *
 * 12개 달력 테마(sch_spreadsheet, sch_charcoal_frame 등)의 미리보기.
 * 각 프리뷰는 3월 샘플 데이터: 9일/23일 휴진, 16일 단축
 */
import React from 'react';

// 3월 샘플 달력 데이터 — 1일=토요일 (앞에 빈칸 6개)
const MARCH_DAYS: (number | null)[] = [
  null, null, null, null, null, null, 1,
  2, 3, 4, 5, 6, 7, 8,
  9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22,
  23, 24, 25, 26, 27, 28, 29,
  30, 31, null, null, null, null, null,
];
const CLOSED = new Set([9, 23]);
const SHORTENED = new Set([16]);
const DOW = ['일','월','화','수','목','금','토'];

export function CalendarThemePreview({ themeValue, size = 'sm' }: { themeValue: string; groupColor?: string; size?: 'sm' | 'lg' }) {
  const s = size === 'lg';
  const fs = s ? 'text-[8px]' : 'text-[4px]';
  const fsNum = s ? 'text-[9px]' : 'text-[4.5px]';
  const fsTiny = s ? 'text-[6px]' : 'text-[3px]';
  const fsTitle = s ? 'text-[13px]' : 'text-[6px]';
  const gap = s ? 'gap-[2px]' : 'gap-[1px]';
  const pad = s ? 'p-[3px]' : 'p-[1.5px]';
  const hdrPad = s ? 'px-[8px] py-[4px]' : 'px-[4px] py-[2px]';

  // ── 1. 실무 스프레드시트 ──
  if (themeValue === 'sch_spreadsheet') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#fff' }}>
        <div style={{ background: '#1e293b' }} className={hdrPad}>
          <div className={`${fsTitle} font-black text-white`}>3월 진료일정</div>
          <div className={`${fsTiny} text-slate-400`}>OO치과</div>
        </div>
        <div className={`grid grid-cols-7 ${gap} flex-1`} style={{ padding: s ? '3px' : '1.5px' }}>
          {DOW.map((d, i) => (
            <div key={d} className={`${fsTiny} font-bold text-center`} style={{ background: '#e2e8f0', color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#475569', padding: '1px 0' }}>{d}</div>
          ))}
          {MARCH_DAYS.map((day, i) => {
            if (day === null) return <div key={i} />;
            const closed = CLOSED.has(day);
            const short = SHORTENED.has(day);
            return (
              <div key={i} className={`${fsNum} text-center font-medium relative`}
                style={{ background: closed ? '#e2e8f0' : short ? '#fef9c3' : i % 2 === 0 ? '#f8fafc' : '#f1f5f9', padding: '1px 0' }}>
                <span style={{ textDecoration: closed ? 'line-through' : 'none', color: closed ? '#94a3b8' : '#334155' }}>{day}</span>
                {closed && <span className={`${fsTiny} text-red-500 ml-[1px]`}>휴</span>}
              </div>
            );
          })}
        </div>
        <div style={{ background: '#1e293b', padding: s ? '2px 8px' : '1px 4px' }}>
          <div className={`${fsTiny} text-slate-400 flex gap-2`}>
            <span>■ 휴진</span><span>■ 단축</span>
          </div>
        </div>
      </div>
    );
  }

  // ── 2. 차콜 프레임 ──
  if (themeValue === 'sch_charcoal_frame') {
    const framePx = s ? 6 : 3;
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#292524', padding: framePx }}>
        <div className={`${fsTitle} font-black text-white text-center`} style={{ paddingBottom: s ? 3 : 1.5 }}>3월 진료일정</div>
        <div className="flex-1 flex flex-col" style={{ background: '#fff', borderRadius: s ? 4 : 2 }}>
          <div className={`grid grid-cols-7 ${gap} flex-1 ${pad}`}>
            {DOW.map((d, i) => (
              <div key={d} className={`${fsTiny} font-bold text-center`} style={{ background: '#292524', color: '#fff', padding: '1px 0', borderRadius: 1 }}>{d}</div>
            ))}
            {MARCH_DAYS.map((day, i) => {
              if (day === null) return <div key={i} />;
              const closed = CLOSED.has(day);
              const short = SHORTENED.has(day);
              return (
                <div key={i} className={`${fsNum} text-center font-medium`}
                  style={{ background: closed ? '#ef4444' : '#fff', color: closed ? '#fff' : '#292524', borderLeft: short ? '2px solid #f59e0b' : '1px solid #a8a29e', padding: '1px 0' }}>
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── 3. 모던 미니멀 ──
  if (themeValue === 'sch_modern_note') {
    return (
      <div className="w-full h-full flex flex-col bg-white" style={{ padding: s ? 8 : 4 }}>
        <div className={`${s ? 'text-[28px]' : 'text-[14px]'} font-black text-gray-800 leading-none`}>3</div>
        <div style={{ borderTop: '2px solid #111827', marginTop: s ? 2 : 1 }} />
        <div style={{ borderTop: '1px solid #d1d5db', marginTop: 1 }} />
        <div className={`grid grid-cols-7 ${gap} flex-1 mt-[3px]`}>
          {DOW.map((d, i) => (
            <div key={d} className={`${fsTiny} font-medium text-center`} style={{ color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#6b7280' }}>{d}</div>
          ))}
          {MARCH_DAYS.map((day, i) => {
            if (day === null) return <div key={i} />;
            const closed = CLOSED.has(day);
            const short = SHORTENED.has(day);
            return (
              <div key={i} className={`${fsNum} text-center text-gray-700 relative`}>
                {day}
                {closed && <div className="absolute" style={{ width: s ? 4 : 2, height: s ? 4 : 2, background: '#ef4444', borderRadius: '50%', bottom: 0, left: '50%', transform: 'translateX(-50%)' }} />}
                {short && <div className="absolute" style={{ width: '80%', height: 1, background: '#f59e0b', bottom: 0, left: '10%' }} />}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 4. 야간진료 ──
  if (themeValue === 'sch_night_clinic') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#1c1917' }}>
        <div className={hdrPad} style={{ background: '#d97706' }}>
          <div className={`${fsTitle} font-black text-white`}>3월 진료일정</div>
        </div>
        <div className={`grid grid-cols-7 ${gap} flex-1 ${pad}`}>
          {DOW.map((d, i) => (
            <div key={d} className={`${fsTiny} font-bold text-center`} style={{ color: '#d97706' }}>{d}</div>
          ))}
          {MARCH_DAYS.map((day, i) => {
            if (day === null) return <div key={i} />;
            const closed = CLOSED.has(day);
            const col = i % 7;
            const isTuThu = col === 2 || col === 4;
            return (
              <div key={i} className={`${fsNum} text-center font-medium`}
                style={{ background: isTuThu ? 'rgba(217,119,6,0.15)' : 'transparent', color: closed ? '#fff' : '#e5e7eb', borderRadius: closed ? 99 : 0, ...(closed ? { background: '#ef4444' } : {}) }}>
                {day}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 5. 블러시 로즈 ──
  if (themeValue === 'sch_blushy_rose') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#fff1f2' }}>
        <div className={hdrPad} style={{ background: 'linear-gradient(135deg, #fda4af, #e11d48)' }}>
          <div className={`${fsTitle} font-black text-white`}>3월 진료일정</div>
        </div>
        <div className={`grid grid-cols-7 ${gap} flex-1 ${pad}`}>
          {DOW.map((d, i) => (
            <div key={d} className={`${fsTiny} font-bold text-center`} style={{ color: i === 0 ? '#e11d48' : '#9f1239' }}>{d}</div>
          ))}
          {MARCH_DAYS.map((day, i) => {
            if (day === null) return <div key={i} />;
            const closed = CLOSED.has(day);
            return (
              <div key={i} className={`${fsNum} text-center font-medium`}
                style={{ background: closed ? '#fda4af' : 'rgba(255,255,255,0.6)', color: closed ? '#9f1239' : '#881337', borderRadius: '50%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {day}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 6. SNS 볼드 ──
  if (themeValue === 'sch_sns_bold') {
    return (
      <div className="w-full h-full flex flex-row" style={{ background: '#fff' }}>
        <div style={{ width: s ? 6 : 3, background: '#f97316', flexShrink: 0 }} />
        <div className="flex-1 flex flex-col">
          <div className={`${hdrPad}`}>
            <div className={`${fsTitle} font-black text-gray-800`}>3월 진료일정</div>
          </div>
          <div className={`grid grid-cols-7 ${gap} flex-1 ${pad}`}>
            {DOW.map((d, i) => (
              <div key={d} className={`${fsTiny} font-bold text-center`} style={{ color: i === 0 ? '#ef4444' : '#374151' }}>{d}</div>
            ))}
            {MARCH_DAYS.map((day, i) => {
              if (day === null) return <div key={i} />;
              const closed = CLOSED.has(day);
              return (
                <div key={i} className={`${fsNum} text-center font-bold`}
                  style={{ color: closed ? '#f97316' : '#374151', border: closed ? '1.5px solid #f97316' : 'none', borderRadius: closed ? 99 : 4, padding: '1px 0' }}>
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── 7. 라벤더 소프트 ──
  if (themeValue === 'sch_lavender_soft') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: 'linear-gradient(180deg, #f3eff8, #fefcff)' }}>
        <div className={hdrPad} style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}>
          <div className={`${fsTitle} font-black text-white`}>3월 진료일정</div>
        </div>
        <div className={`grid grid-cols-7 ${gap} flex-1 ${pad}`}>
          {DOW.map((d) => (
            <div key={d} className={`${fsTiny} font-bold text-center text-violet-500`}>{d}</div>
          ))}
          {MARCH_DAYS.map((day, i) => {
            if (day === null) return <div key={i} />;
            const closed = CLOSED.has(day);
            return (
              <div key={i} className={`${fsNum} text-center font-medium`}
                style={{ background: closed ? '#7c3aed' : 'rgba(255,255,255,0.5)', color: closed ? '#fff' : '#5b21b6', borderRadius: 99, padding: '1px 0' }}>
                {day}
              </div>
            );
          })}
        </div>
        {/* 스파클 */}
        <div className="absolute" style={{ top: s ? 20 : 10, right: s ? 8 : 4, color: '#c4b5fd', fontSize: s ? 8 : 4 }}>✦</div>
      </div>
    );
  }

  // ── 8. 한방 전통 ──
  if (themeValue === 'sch_korean_classic') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#f5e6d0' }}>
        {/* 기와 보더 — 톱니 패턴 */}
        <div style={{ height: s ? 4 : 2, background: 'repeating-linear-gradient(90deg, #92400e 0px, #92400e 4px, #f5e6d0 4px, #f5e6d0 8px)', opacity: 0.4 }} />
        <div className={`${hdrPad} text-center`}>
          <div style={{ width: s ? 32 : 16, height: s ? 16 : 8, background: '#e8795a', borderRadius: `${s ? 32 : 16}px ${s ? 32 : 16}px 0 0`, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className={`${s ? 'text-[12px]' : 'text-[6px]'} font-black text-white`}>3</span>
          </div>
          <div className={`${fsTiny} font-bold text-amber-800 mt-[1px]`}>진료일정</div>
        </div>
        <div className={`grid grid-cols-7 ${gap} flex-1 ${pad}`}>
          {DOW.map((d, i) => (
            <div key={d} className={`${fsTiny} font-bold text-center`} style={{ color: i === 0 ? '#b91c1c' : '#92400e' }}>{d}</div>
          ))}
          {MARCH_DAYS.map((day, i) => {
            if (day === null) return <div key={i} />;
            const closed = CLOSED.has(day);
            return (
              <div key={i} className={`${fsNum} text-center font-medium`} style={{ color: closed ? '#b91c1c' : '#78350f' }}>
                {day}{closed && <span className={`${fsTiny} text-red-700`}>●</span>}
              </div>
            );
          })}
        </div>
        <div style={{ height: s ? 4 : 2, background: 'repeating-linear-gradient(90deg, #92400e 0px, #92400e 4px, #f5e6d0 4px, #f5e6d0 8px)', opacity: 0.4 }} />
      </div>
    );
  }

  // ── 9. 딥블루 프로스트 ──
  if (themeValue === 'sch_deep_frost') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center" style={{ background: '#0f2444', padding: s ? 6 : 3 }}>
        <div className="w-full flex-1 flex flex-col" style={{ background: '#fff', borderRadius: s ? 6 : 3, overflow: 'hidden' }}>
          <div className={`${hdrPad}`} style={{ background: '#0f2444' }}>
            <div className={`${fsTitle} font-black text-white`}>3월 진료일정</div>
          </div>
          <div className={`grid grid-cols-7 ${gap} flex-1 ${pad}`}>
            {DOW.map((d, i) => (
              <div key={d} className={`${fsTiny} font-bold text-center`} style={{ color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#1e3a5f' }}>{d}</div>
            ))}
            {MARCH_DAYS.map((day, i) => {
              if (day === null) return <div key={i} />;
              const closed = CLOSED.has(day);
              return (
                <div key={i} className={`${fsNum} text-center font-medium`}
                  style={{ background: closed ? '#dbeafe' : '#fff', color: '#1e3a5f', border: '0.5px solid #e2e8f0', padding: '1px 0' }}>
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── 10. 골드 클래식 ──
  if (themeValue === 'sch_gold_classic') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#faf7f2' }}>
        <div style={{ height: s ? 4 : 2, background: 'linear-gradient(90deg, #c9a96e, #e8d5a8, #c9a96e)' }} />
        <div className={`${hdrPad} text-center`}>
          <div className={`${fsTitle} font-black font-serif`} style={{ color: '#854d0e' }}>3월 진료일정</div>
          <div className={`${fsTiny}`} style={{ color: '#a16207' }}>◆ OO치과 ◆</div>
        </div>
        <div className={`grid grid-cols-7 ${gap} flex-1 ${pad}`}>
          {DOW.map((d, i) => (
            <div key={d} className={`${fsTiny} font-bold text-center font-serif`} style={{ color: i === 0 ? '#b91c1c' : '#854d0e' }}>{d}</div>
          ))}
          {MARCH_DAYS.map((day, i) => {
            if (day === null) return <div key={i} />;
            const closed = CLOSED.has(day);
            return (
              <div key={i} className={`${fsNum} text-center font-serif`}
                style={{ color: closed ? '#b91c1c' : '#78350f', borderBottom: closed ? '1px solid #c9a96e' : '0.5px dotted #d6cebf', padding: '1px 0' }}>
                {day}
              </div>
            );
          })}
        </div>
        <div style={{ height: s ? 4 : 2, background: 'linear-gradient(90deg, #c9a96e, #e8d5a8, #c9a96e)' }} />
      </div>
    );
  }

  // ── 11. 프리미엄 그린 ──
  if (themeValue === 'sch_premium_green') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#f0f7f2' }}>
        <div className={hdrPad} style={{ background: '#2d6a4f' }}>
          <div className={`${fsTitle} font-black text-white`}>3월 진료일정</div>
        </div>
        <div style={{ height: s ? 2 : 1, background: 'linear-gradient(90deg, #059669, #10b981, #34d399)' }} />
        <div className={`grid grid-cols-7 ${gap} flex-1 ${pad}`}>
          {DOW.map((d, i) => (
            <div key={d} className={`${fsTiny} font-bold text-center`} style={{ color: i === 0 ? '#ef4444' : '#2d6a4f' }}>{d}</div>
          ))}
          {MARCH_DAYS.map((day, i) => {
            if (day === null) return <div key={i} />;
            const closed = CLOSED.has(day);
            const short = SHORTENED.has(day);
            return (
              <div key={i} className={`${fsNum} text-center font-medium`}
                style={{ borderLeft: closed ? '2px solid #ef4444' : short ? '2px solid #f59e0b' : '1px solid transparent', color: '#1b4332', padding: '1px 2px' }}>
                {day}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 12. 네이비 모던 ──
  if (themeValue === 'sch_navy_modern') {
    return (
      <div className="w-full h-full flex flex-col bg-white" style={{ padding: s ? 6 : 3 }}>
        <div style={{ borderBottom: '2.5px solid #1e3a5f', paddingBottom: s ? 4 : 2 }}>
          <div className={`${fsTitle} font-black`} style={{ color: '#1e3a5f' }}>3월 진료일정</div>
        </div>
        <div className={`grid grid-cols-7 ${gap} flex-1 mt-[2px]`}>
          {DOW.map((d, i) => (
            <div key={d} className={`${fsTiny} font-bold text-center`} style={{ color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#1e3a5f' }}>{d}</div>
          ))}
          {MARCH_DAYS.map((day, i) => {
            if (day === null) return <div key={i} />;
            const closed = CLOSED.has(day);
            const short = SHORTENED.has(day);
            return (
              <div key={i} className={`${fsNum} text-center font-medium`}
                style={{ borderLeft: closed ? '2px solid #1e3a5f' : short ? '2px solid #f59e0b' : 'none', color: '#1e3a5f', padding: '1px 2px' }}>
                {day}
              </div>
            );
          })}
        </div>
        <div style={{ borderTop: '2.5px solid #1e3a5f', marginTop: s ? 2 : 1, paddingTop: 1 }} />
      </div>
    );
  }

  // ── Fallback ──
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-50">
      <span className="text-[10px] text-slate-400">미리보기 없음</span>
    </div>
  );
}
