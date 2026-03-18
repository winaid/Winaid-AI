/**
 * TemplatePreviews — 카테고리별 템플릿 프리뷰 컴포넌트 모음
 *
 * TemplateGenerator.tsx에서 추출.
 * CalendarThemePreview (12개 달력 테마 SVG)
 * + 7개 카테고리 프리뷰 (Event/Doctor/Notice/Greeting/Hiring/Caution/Pricing)
 * + TemplateSVGPreview (dispatcher)
 */
import React from 'react';
import type { CategoryTemplate } from '../config/categoryTemplates';
import type { TemplateCategory } from '../config/templatePresets';

export function CalendarThemePreview({ themeValue, groupColor, size = 'sm' }: { themeValue: string; groupColor: string; size?: 'sm' | 'lg' }) {
  const s = size === 'lg';
  const c = groupColor;

  // ── Family 1: autumn — 실무형 스프레드시트 (정보 밀도 헤더 + zebra 격자 + 범례 풋터) ──
  if (themeValue === 'autumn') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: 'white' }}>
        {/* 정보 밀도 헤더 — 훅: 병원명+제목+진료시간이 한 블록에 응축 */}
        <div style={{ background: '#1e293b' }}>
          <div className="flex items-center justify-between" style={{ padding: s ? '6px 10px 2px' : '3px 5px 1px' }}>
            <span className={`${s ? 'text-[14px]' : 'text-[7px]'} font-black text-white leading-tight tracking-tight`}>3월 진료일정</span>
            <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-bold text-slate-400`}>OO치과</span>
          </div>
          <div className="flex items-center justify-between" style={{ padding: s ? '0 10px 5px' : '0 5px 2.5px' }}>
            <div className={`${s ? 'text-[7px]' : 'text-[3px]'} font-medium text-slate-400`}>평일 09–18 · 토 09–13 · 점심 13–14</div>
            <div className={`${s ? 'text-[7px]' : 'text-[3px]'} text-slate-500`}>2026</div>
          </div>
        </div>
        {/* 요일 헤더 — 슬레이트 중간톤 */}
        <div className="grid grid-cols-7" style={{ background: '#e2e8f0', borderBottom: '2px solid #94a3b8' }}>
          {days.map((d, i) => (
            <div key={d} className={`text-center font-black ${s ? 'text-[9px] py-[3px]' : 'text-[4px] py-[1.5px]'}`}
              style={{ color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#334155', borderRight: '1px solid #cbd5e1' }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — zebra stripe + 두꺼운 보더 */}
        <div className="grid grid-cols-7 flex-1">
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            const rowIdx = Math.floor(i / 7);
            const zebraEven = rowIdx % 2 === 0;
            if (!d) return <div key={`e${i}`} style={{ borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', background: zebraEven ? '#f8fafc' : '#f1f5f9' }} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            return (
              <div key={i} className="flex flex-col items-center justify-center"
                style={{
                  borderRight: '1px solid #cbd5e1',
                  borderBottom: '1px solid #cbd5e1',
                  background: isClosed ? '#e2e8f0' : isShort ? '#fef9c3' : zebraEven ? '#ffffff' : '#f8fafc',
                }}>
                <span className={`${s ? 'text-[11px]' : 'text-[5.5px]'} font-bold`}
                  style={{
                    color: isClosed ? '#64748b' : isShort ? '#92400e' : i % 7 === 0 ? '#dc2626' : i % 7 === 6 ? '#2563eb' : '#1e293b',
                    textDecoration: isClosed ? 'line-through' : 'none',
                    textDecorationColor: '#64748b',
                    textDecorationThickness: s ? '2px' : '1px',
                  }}>{d}</span>
                {isClosed && <span className={`${s ? 'text-[6px]' : 'text-[2.5px]'} font-black leading-none`} style={{ color: '#dc2626' }}>휴</span>}
                {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-bold leading-none`} style={{ color: '#92400e' }}>△단축</span>}
              </div>
            );
          })}
        </div>
        {/* 풋터 — 범례 바 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '3px 10px' : '1.5px 5px', background: '#1e293b' }}>
          <div className={`flex items-center gap-1.5 ${s ? 'text-[7px]' : 'text-[3px]'} font-medium text-white/70`}>
            <span className="flex items-center gap-0.5"><span className={`inline-block ${s ? 'w-2 h-2' : 'w-1 h-1'} rounded-sm`} style={{ background: '#e2e8f0' }} />휴진</span>
            <span className="flex items-center gap-0.5"><span className={`inline-block ${s ? 'w-2 h-2' : 'w-1 h-1'} rounded-sm`} style={{ background: '#fef9c3' }} />단축</span>
          </div>
          <span className={`${s ? 'text-[7px]' : 'text-[3px]'} text-white/40`}>02-000-0000</span>
        </div>
      </div>
    );
  }

  // ── Family 2: korean_traditional — 전통 한방 프레임 (기와+한지 프레임이 훅) ──
  if (themeValue === 'korean_traditional') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#f5ebe0' }}>
        {/* 기와 문양 — 전통 건축 프레임 상단 */}
        <div className="w-full overflow-hidden" style={{ height: s ? '10px' : '5px' }}>
          <svg viewBox="0 0 200 10" className="w-full h-full" preserveAspectRatio="none">
            <rect width="200" height="4" fill="#5c3520" />
            <path d="M0,10 Q5,4 10,10 Q15,4 20,10 Q25,4 30,10 Q35,4 40,10 Q45,4 50,10 Q55,4 60,10 Q65,4 70,10 Q75,4 80,10 Q85,4 90,10 Q95,4 100,10 Q105,4 110,10 Q115,4 120,10 Q125,4 130,10 Q135,4 140,10 Q145,4 150,10 Q155,4 160,10 Q165,4 170,10 Q175,4 180,10 Q185,4 190,10 Q195,4 200,10" fill="#78350f" />
          </svg>
        </div>
        {/* 한방 헤더 — 세리프 큰 "3" + 병원명 (이 카드는 숫자가 주인공) */}
        <div className="flex flex-col items-center" style={{ padding: s ? '8px 12px 5px' : '4px 6px 2.5px', background: 'linear-gradient(180deg, #78350f 0%, #92400e 100%)' }}>
          <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} text-white/50 tracking-[0.4em] font-medium`}>OO 한의원</div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className={`${s ? 'text-[24px]' : 'text-[12px]'} font-black text-white leading-none`} style={{ fontFamily: 'Georgia, serif' }}>3</span>
            <span className={`${s ? 'text-[11px]' : 'text-[5.5px]'} font-bold text-white/80`}>월 진료일정</span>
          </div>
        </div>
        {/* 한지 프레임 — 이중 테두리 (훅) */}
        <div className="flex-1 flex flex-col" style={{ margin: s ? '4px 6px' : '2px 3px', border: '2px solid #d4a574', borderRadius: s ? '4px' : '2px', padding: s ? '1.5px' : '0.5px' }}>
          <div style={{ border: '0.5px solid #d4a57466', borderRadius: s ? '3px' : '1.5px', flex: 1, display: 'flex', flexDirection: 'column', background: '#fffcf5' }}>
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7" style={{ borderBottom: '1px solid #d4a57433', background: '#f5ebe0' }}>
              {days.map((d, i) => (
                <div key={d} className={`text-center font-extrabold ${s ? 'text-[9px] py-[3px]' : 'text-[4px] py-[1.5px]'}`} style={{ color: i === 0 ? '#b91c1c' : i === 6 ? '#1d4ed8' : '#78350f' }}>{d}</div>
              ))}
            </div>
            {/* 날짜 격자 */}
            <div className="grid grid-cols-7 flex-1">
              {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
                if (!d) return <div key={`e${i}`} style={{ borderRight: '0.5px solid #d4a57415', borderBottom: '0.5px solid #d4a57415' }} />;
                const isClosed = d === 9 || d === 23;
                const isShort = d === 16;
                return (
                  <div key={i} className="flex flex-col items-center justify-center"
                    style={{ borderRight: '0.5px solid #d4a57415', borderBottom: '0.5px solid #d4a57415', background: isClosed ? '#dc262610' : 'transparent' }}>
                    <span className={`${s ? 'text-[10px]' : 'text-[4.5px]'} font-bold`}
                      style={{ color: isClosed ? '#b91c1c' : i % 7 === 0 ? '#b91c1c' : i % 7 === 6 ? '#1d4ed8' : '#5c3d2e' }}>{d}</span>
                    {isClosed && <span className={`${s ? 'text-[5px]' : 'text-[2px]'} font-black text-red-600 leading-none`}>휴진</span>}
                    {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2px]'} font-bold leading-none`} style={{ color: '#92400e' }}>단축</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {/* 풋터 — 한지 톤 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '3px 10px 5px' : '1.5px 5px 2.5px' }}>
          <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium`} style={{ color: '#92400e' }}>
            평일 09~18 · 토 09~13
          </div>
          <div className={`${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: '#92400e88' }}>02-000-0000</div>
        </div>
      </div>
    );
  }

  // ── Family 3: winter — 딥블루 프로스트 (전면 딥블루 침잠 — 유일한 풀다크 카드) ──
  if (themeValue === 'winter') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: 'linear-gradient(170deg, #051e38 0%, #0c3557 30%, #0c4a6e 60%, #0e5a8a 100%)' }}>
        {/* 히어로 존 — 큰 타이포 + 서리 라인 (훅: 전면 딥블루 안에 빛나는 타이포) */}
        <div style={{ padding: s ? '10px 10px 5px' : '5px 5px 2.5px' }}>
          <div className={`${s ? 'text-[16px]' : 'text-[8px]'} font-black text-white leading-tight`} style={{ letterSpacing: '-0.02em' }}>3월 진료안내</div>
          <div className="flex items-center justify-between mt-0.5">
            <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium`} style={{ color: '#7dd3fc' }}>OO정형외과 · 2026</span>
            <span className={`${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: 'rgba(186,230,253,0.4)' }}>09~18 · 토 09~13</span>
          </div>
        </div>
        {/* 서리 라인 — 밝은 그라데이션 디바이더 (프로스트 훅) */}
        <div style={{ height: s ? '1.5px' : '1px', background: 'linear-gradient(90deg, transparent 5%, rgba(125,211,252,0.5) 30%, rgba(186,230,253,0.7) 50%, rgba(125,211,252,0.5) 70%, transparent 95%)', margin: s ? '0 6px' : '0 3px' }} />
        {/* 요일 헤더 — 아이시 블루 */}
        <div className="grid grid-cols-7" style={{ padding: s ? '2px 4px 0' : '1px 2px 0' }}>
          {days.map((d, i) => (
            <div key={d} className={`text-center font-extrabold ${s ? 'text-[8px] py-[2px]' : 'text-[3.5px] py-[1px]'}`}
              style={{ color: i === 0 ? '#fca5a5' : i === 6 ? '#93c5fd' : 'rgba(186,230,253,0.7)' }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — 프로스트 글래스 셀 (넓은 간격 + 라운드 = 유리 조각) */}
        <div className="grid grid-cols-7 flex-1" style={{ padding: s ? '2px 4px 4px' : '1px 2px 2px', gap: s ? '2px' : '1px' }}>
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            return (
              <div key={i} className="flex flex-col items-center justify-center"
                style={{
                  borderRadius: s ? 5 : 2.5,
                  background: isClosed ? 'rgba(239,68,68,0.2)' : isShort ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.06)',
                  border: isClosed ? '1px solid rgba(248,113,113,0.35)' : '0.5px solid rgba(186,230,253,0.1)',
                }}>
                <span className={`${s ? 'text-[10px]' : 'text-[5px]'} font-bold`}
                  style={{ color: isClosed ? '#fca5a5' : isShort ? '#fde68a' : i % 7 === 0 ? '#fca5a5' : i % 7 === 6 ? '#93c5fd' : '#e0f2fe' }}>{d}</span>
                {isClosed && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-extrabold leading-none`} style={{ color: '#fca5a5' }}>휴진</span>}
                {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-bold leading-none`} style={{ color: '#fde68a' }}>단축</span>}
              </div>
            );
          })}
        </div>
        {/* 하단 서리 라인 */}
        <div style={{ height: s ? '1px' : '0.5px', background: 'linear-gradient(90deg, transparent 10%, rgba(125,211,252,0.3) 50%, transparent 90%)', margin: s ? '0 6px' : '0 3px' }} />
        {/* 풋터 — 미니멀 */}
        <div className="flex items-center justify-center" style={{ padding: s ? '3px' : '1.5px' }}>
          <span className={`${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: 'rgba(186,230,253,0.35)' }}>02-000-0000</span>
        </div>
      </div>
    );
  }

  // ── Family 4: cherry_blossom — 블러시 로즈 (훅: 로즈골드 그라데이션 밴드) ──
  if (themeValue === 'cherry_blossom') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: 'linear-gradient(180deg, #fdf2f4 0%, #faf7f5 30%, #faf7f5 100%)' }}>
        {/* 로즈골드 밴드 — 훅: 이 그라데이션 밴드가 전체 카드 정체성 */}
        <div style={{ background: 'linear-gradient(135deg, #9a6b7a 0%, #be7e8a 40%, #d4a0aa 100%)' }}>
          <div className="flex items-center justify-between" style={{ padding: s ? '8px 10px 3px' : '4px 5px 1.5px' }}>
            <span className={`${s ? 'text-[14px]' : 'text-[7px]'} font-black text-white leading-tight tracking-tight`}>3월 진료안내</span>
            <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium text-white/50`}>2026</span>
          </div>
          <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium text-white/65`} style={{ padding: s ? '0 10px 6px' : '0 5px 3px' }}>OO피부과의원</div>
        </div>
        {/* 로즈골드 악센트 라인 */}
        <div style={{ height: s ? '2px' : '1px', background: 'linear-gradient(90deg, #d4a0aa, #e8c8ce, #d4a0aa)' }} />
        {/* 요일 헤더 — 로즈 베이지 */}
        <div className="grid grid-cols-7" style={{ background: '#fdf2f4', borderBottom: '1px solid #fce7ec' }}>
          {days.map((d, i) => (
            <div key={d} className={`text-center font-extrabold ${s ? 'text-[9px] py-[3px]' : 'text-[4px] py-[1.5px]'}`}
              style={{ color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#9a6b7a' }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — 갭 셀, 블러시 틴트 */}
        <div className="grid grid-cols-7 flex-1" style={{ padding: s ? '2px 4px 3px' : '1px 2px 1.5px', gap: s ? '2px' : '1px' }}>
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
                {isClosed && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-black leading-none`} style={{ color: '#be123c' }}>휴진</span>}
                {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-bold leading-none`} style={{ color: '#92400e' }}>단축</span>}
              </div>
            );
          })}
        </div>
        {/* 풋터 — 로즈 정보 바 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '4px 10px' : '2px 5px', background: '#fdf2f4', borderTop: '1px solid #fce7ec' }}>
          <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium`} style={{ color: '#6b3a4a' }}>09–18 · 토 09–13</span>
          <span className={`${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: '#be7e8a' }}>02-000-0000</span>
        </div>
      </div>
    );
  }

  // ── Family 5: spring_kids — 차콜 프레임 (훅: 차콜 액자형 프레임 — 상하좌우 프레임이 주인공) ──
  if (themeValue === 'spring_kids') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#292524' }}>
        {/* 차콜 프레임 상단 — 타이틀 존 */}
        <div style={{ padding: s ? '7px 10px 5px' : '3.5px 5px 2.5px' }}>
          <div className="flex items-center justify-between">
            <span className={`${s ? 'text-[14px]' : 'text-[7px]'} font-black text-white leading-tight tracking-tight`}>3월 진료안내</span>
            <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium text-stone-400`}>2026</span>
          </div>
          <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium text-stone-400`}>OO의원</div>
        </div>
        {/* 프레임 안쪽 — 흰 캔버스 (차콜이 액자 역할) */}
        <div className="flex-1 flex flex-col" style={{ margin: s ? '0 6px' : '0 3px', background: 'white', borderRadius: s ? '2px' : '1px' }}>
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7" style={{ background: '#f5f5f4', borderBottom: '2px solid #292524' }}>
            {days.map((d, i) => (
              <div key={d} className={`text-center font-black ${s ? 'text-[9px] py-[3px]' : 'text-[4px] py-[1.5px]'}`}
                style={{ color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#292524' }}>{d}</div>
            ))}
          </div>
          {/* 달력 격자 — 풀 레드 셀 휴진 (킬러 피처) */}
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
        </div>
        {/* 차콜 프레임 하단 — 정보+범례 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '5px 10px' : '2.5px 5px' }}>
          <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium text-white/80`}>09–18 · 토 09–13</span>
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

  // ── Family 6: medical_notebook — 모던 미니멀 (훅: 타이포+2단 라인 — 여백이 디자인) ──
  if (themeValue === 'medical_notebook') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#ffffff' }}>
        {/* 미니멀 히어로 — 큰 "3" + 정보 (이 카드는 타이포가 주인공) */}
        <div className="flex items-end justify-between" style={{ padding: s ? '10px 10px 4px' : '5px 5px 2px' }}>
          <div className="flex items-baseline" style={{ gap: s ? 4 : 2 }}>
            <span className={`${s ? 'text-[36px]' : 'text-[18px]'} font-black leading-none`} style={{ color: '#0f172a', letterSpacing: '-0.03em' }}>3</span>
            <div>
              <div className={`${s ? 'text-[12px]' : 'text-[6px]'} font-black leading-tight`} style={{ color: '#334155' }}>월</div>
              <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium`} style={{ color: '#94a3b8' }}>진료안내</div>
            </div>
          </div>
          <div className="flex flex-col items-end" style={{ paddingBottom: s ? '2px' : '1px' }}>
            <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-bold`} style={{ color: '#475569' }}>OO내과</div>
            <div className={`${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: '#94a3b8' }}>2026</div>
          </div>
        </div>
        {/* 2단 라인 — 상단 (두꺼운+얇은) */}
        <div style={{ padding: s ? '0 8px' : '0 4px' }}>
          <div style={{ height: s ? '2.5px' : '1.5px', background: '#0f172a' }} />
          <div style={{ height: s ? '0.5px' : '0.5px', background: '#cbd5e1', marginTop: s ? '2px' : '1px' }} />
        </div>
        {/* 요일 헤더 — 한글, 모노톤 */}
        <div className="grid grid-cols-7" style={{ padding: s ? '0 8px' : '0 4px' }}>
          {days.map((d, i) => (
            <div key={d} className={`text-center font-bold ${s ? 'text-[8px] py-[3px]' : 'text-[3.5px] py-[1.5px]'}`}
              style={{ color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#64748b' }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — 극세 규선, 도트/라인 마커 */}
        <div className="grid grid-cols-7 flex-1" style={{ padding: s ? '0 8px' : '0 4px' }}>
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            if (!d) return <div key={`e${i}`} style={{ borderBottom: '0.5px solid #f1f5f9' }} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            return (
              <div key={i} className="flex flex-col items-center justify-center"
                style={{ borderBottom: '0.5px solid #f1f5f9' }}>
                <span className={`${s ? 'text-[10px]' : 'text-[5px]'} font-medium`}
                  style={{
                    color: isClosed ? '#dc2626' : isShort ? '#b45309' : i % 7 === 0 ? '#dc2626' : i % 7 === 6 ? '#2563eb' : '#334155',
                    textDecoration: isClosed ? 'line-through' : 'none',
                    textDecorationColor: '#dc2626',
                  }}>{d}</span>
                {isClosed && <div className={`${s ? 'w-1.5 h-1.5' : 'w-0.5 h-0.5'} rounded-full bg-red-500 mt-[1px]`} />}
                {isShort && <div className={`${s ? 'w-3 h-[1.5px]' : 'w-1.5 h-[0.5px]'} bg-amber-400 mt-[1px] rounded-full`} />}
              </div>
            );
          })}
        </div>
        {/* 2단 라인 — 하단 */}
        <div style={{ padding: s ? '0 8px' : '0 4px' }}>
          <div style={{ height: s ? '0.5px' : '0.5px', background: '#cbd5e1' }} />
          <div style={{ height: s ? '2.5px' : '1.5px', background: '#0f172a', marginTop: s ? '2px' : '1px' }} />
        </div>
        {/* 풋터 — 미니멀 범례 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '4px 10px' : '2px 5px' }}>
          <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium`} style={{ color: '#475569' }}>
            09–18 · 토 09–13
          </div>
          <div className={`flex items-center gap-1.5 ${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: '#64748b' }}>
            <span className="flex items-center gap-0.5"><span className={`inline-block ${s ? 'w-1.5 h-1.5' : 'w-0.5 h-0.5'} rounded-full bg-red-500`} />휴진</span>
            <span className="flex items-center gap-0.5"><span className={`inline-block ${s ? 'w-2.5 h-[1.5px]' : 'w-1 h-[0.5px]'} bg-amber-400 rounded-full`} />단축</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Family 7: autumn_spring_note — 야간진료 (훅: 앰버 스트라이프 밴드 + 화목 컬럼 강조) ──
  if (themeValue === 'autumn_spring_note') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#fafaf9' }}>
        {/* 다크 헤더 — 타이틀 */}
        <div style={{ padding: s ? '7px 10px 5px' : '3.5px 5px 2.5px', background: '#1c1917' }}>
          <div className="flex items-center justify-between">
            <span className={`${s ? 'text-[14px]' : 'text-[7px]'} font-black text-white leading-tight`}>3월 진료안내</span>
            <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium text-stone-400`}>OO병원</span>
          </div>
        </div>
        {/* 앰버 스트라이프 밴드 — 훅: 야간 정보가 밴드 형태로 강하게 (썸네일에서 즉시 보임) */}
        <div className="flex items-center justify-center" style={{ padding: s ? '4px 10px' : '2px 5px', background: 'linear-gradient(90deg, #d97706, #f59e0b, #fbbf24, #f59e0b, #d97706)' }}>
          <span className={`${s ? 'text-[9px]' : 'text-[4px]'} font-black text-white tracking-wider`}>야간진료 화·목 ~21시</span>
        </div>
        {/* 요일 헤더 — 화·목 앰버 셀 강조 */}
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const isNight = i === 2 || i === 4;
            return (
              <div key={d} className={`text-center font-extrabold ${s ? 'text-[9px] py-[3px]' : 'text-[4px] py-[1.5px]'}`}
                style={{ background: isNight ? '#fef3c7' : i === 0 ? '#fef2f2' : '#fafaf9', color: isNight ? '#92400e' : i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#57534e', borderBottom: isNight ? '2px solid #d97706' : '1px solid #e7e5e4' }}>
                {d}{isNight ? '●' : ''}
              </div>
            );
          })}
        </div>
        {/* 달력 격자 — 화·목 앰버 컬럼 (진하게) */}
        <div className="grid grid-cols-7 flex-1">
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            if (!d) return <div key={`e${i}`} style={{ borderRight: '0.5px solid #f5f5f4', borderBottom: '0.5px solid #f5f5f4', background: (i % 7 === 2 || i % 7 === 4) ? '#fef9c3' : 'transparent' }} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            const isNightCol = i % 7 === 2 || i % 7 === 4;
            return (
              <div key={i} className="flex flex-col items-center justify-center"
                style={{
                  borderRight: '0.5px solid #f5f5f4',
                  borderBottom: '0.5px solid #f5f5f4',
                  background: isClosed ? '#fef2f2' : isNightCol ? '#fef9c3' : 'white',
                }}>
                <span className={`${s ? 'text-[10px]' : 'text-[5px]'} font-bold`}
                  style={{ color: isClosed ? '#dc2626' : isShort ? '#a16207' : i % 7 === 0 ? '#dc2626' : isNightCol ? '#92400e' : '#374151' }}>{d}</span>
                {isClosed && <span className={`${s ? 'text-[5px] px-1' : 'text-[2.5px] px-0.5'} font-black text-white leading-none rounded-sm bg-red-500`}>휴진</span>}
                {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-black text-amber-600 leading-none`}>단축</span>}
              </div>
            );
          })}
        </div>
        {/* 풋터 — 따뜻한 다크 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '4px 10px' : '2px 5px', background: '#1c1917' }}>
          <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} text-stone-300`}>
            09~18 · <span className="text-amber-400 font-bold">화목 ~21시</span> · 토 09~13
          </div>
          <span className={`${s ? 'text-[7px]' : 'text-[3px]'} text-stone-500`}>02-000-0000</span>
        </div>
      </div>
    );
  }

  // ── Family 8: autumn_holiday — SNS 볼드 (훅: 볼드 타이포 + 코랄 악센트 — 공지형 카드) ──
  if (themeValue === 'autumn_holiday') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: 'white' }}>
        {/* 볼드 타이포 헤더 — 흰 바탕 위에 큰 글씨 + 코랄 좌측 바 (훅: 볼드 공지 타이포) */}
        <div className="flex" style={{ padding: s ? '8px 10px 5px' : '4px 5px 2.5px' }}>
          <div style={{ width: s ? '4px' : '2px', background: '#f97316', borderRadius: 2, marginRight: s ? '8px' : '4px', flexShrink: 0 }} />
          <div className="flex-1">
            <div className={`${s ? 'text-[16px]' : 'text-[8px]'} font-black leading-tight`} style={{ color: '#1c1917', letterSpacing: '-0.03em' }}>3월 진료안내</div>
            <div className="flex items-center justify-between mt-0.5">
              <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-bold`} style={{ color: '#78716c' }}>OO치과의원 · 2026</span>
              <span className={`${s ? 'text-[7px] px-2 py-[2px]' : 'text-[3px] px-1 py-[0.5px]'} font-black rounded`} style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa' }}>휴진 9·23일</span>
            </div>
          </div>
        </div>
        {/* 코랄 라인 디바이더 */}
        <div style={{ height: s ? '2px' : '1px', background: '#f97316' }} />
        {/* 요일 헤더 — 라운드 필 뱃지 */}
        <div className="grid grid-cols-7" style={{ padding: s ? '4px 4px 2px' : '2px 2px 1px', gap: s ? '2px' : '1px' }}>
          {days.map((d, i) => (
            <div key={d} className={`text-center font-extrabold ${s ? 'text-[9px] py-[2px]' : 'text-[4px] py-[1px]'}`}
              style={{ background: i === 0 ? '#fef2f2' : i === 6 ? '#eff6ff' : '#fafaf9', borderRadius: s ? 6 : 3, color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#57534e' }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — 라운드 셀, 간격 */}
        <div className="grid grid-cols-7 flex-1" style={{ padding: s ? '0 4px 4px' : '0 2px 2px', gap: s ? '2px' : '1px' }}>
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            return (
              <div key={i} className="flex flex-col items-center justify-center"
                style={{
                  borderRadius: s ? 6 : 3,
                  background: isClosed ? '#fff7ed' : isShort ? '#fffbeb' : '#fafaf9',
                  border: isClosed ? '1.5px solid #f97316' : '0.5px solid #e7e5e4',
                }}>
                <span className={`${s ? 'text-[10px]' : 'text-[5px]'} font-bold`}
                  style={{ color: isClosed ? '#ea580c' : isShort ? '#a16207' : i % 7 === 0 ? '#dc2626' : i % 7 === 6 ? '#2563eb' : '#1c1917' }}>{d}</span>
                {isClosed && <span className={`${s ? 'text-[5px] px-1.5 py-[0.5px]' : 'text-[2.5px] px-0.5'} font-black text-white rounded-full leading-none`} style={{ background: '#f97316' }}>휴진</span>}
                {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-black text-amber-600 leading-none`}>단축</span>}
              </div>
            );
          })}
        </div>
        {/* 풋터 — 코랄 라인 위 정보 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '4px 10px' : '2px 5px', borderTop: '2px solid #fed7aa' }}>
          <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium`} style={{ color: '#78716c' }}>09~18 · 토 09~13</span>
          <span className={`${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: '#a8a29e' }}>02-000-0000</span>
        </div>
      </div>
    );
  }

  // ── Family 9: hanok_roof — 골드 클래식 (훅: 골드 밴드 + 다이아몬드 + 세리프 타이포) ──
  if (themeValue === 'hanok_roof') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: 'linear-gradient(175deg, #faf7f2 0%, #f5ebe0 100%)' }}>
        {/* 골드 밴드 상단 — 훅: 골드 프리미엄 정체성 */}
        <div style={{ height: s ? '4px' : '2px', background: 'linear-gradient(90deg, #b8962e, #d4b04a, #e8d5a0, #d4b04a, #b8962e)' }} />
        {/* 우아한 헤더 — 세리프 타이포 주도 */}
        <div className="flex flex-col items-center" style={{ padding: s ? '6px 0 3px' : '3px 0 1.5px' }}>
          <div className={`${s ? 'text-[7px]' : 'text-[3px]'} tracking-[0.4em] font-medium`} style={{ color: '#a3836a' }}>OO피부과의원</div>
          <div className="flex items-center" style={{ gap: s ? 6 : 3, margin: s ? '3px 0' : '1.5px 0' }}>
            <div style={{ width: s ? 20 : 10, height: '1px', background: 'linear-gradient(90deg, transparent, #c9a96e)' }} />
            <div style={{ width: s ? 6 : 3, height: s ? 6 : 3, background: '#c9a96e33', border: '1px solid #c9a96e', transform: 'rotate(45deg)' }} />
            <div style={{ width: s ? 20 : 10, height: '1px', background: 'linear-gradient(90deg, #c9a96e, transparent)' }} />
          </div>
          <div className={`${s ? 'text-[15px]' : 'text-[7.5px]'} font-black leading-none`} style={{ color: '#5c3d2e', fontFamily: 'Georgia, serif' }}>3월 진료안내</div>
          <div className={`${s ? 'text-[7px]' : 'text-[3px]'} font-medium mt-0.5`} style={{ color: '#a3836a' }}>2026</div>
        </div>
        {/* 요일 헤더 — 세리프, 골드 라인 */}
        <div className="grid grid-cols-7" style={{ borderBottom: '1px solid #c9a96e55', borderTop: '1px solid #c9a96e55' }}>
          {days.map((d, i) => (
            <div key={d} className={`text-center font-bold ${s ? 'text-[8px] py-[3px]' : 'text-[3.5px] py-[1.5px]'}`}
              style={{ color: i === 0 ? '#b91c1c' : i === 6 ? '#1d4ed8' : '#78350f', fontFamily: 'Georgia, serif' }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — 점선, 세리프 숫자 */}
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
        {/* 풋터 — 골드 라인 + 정보 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '3px 10px' : '1.5px 5px', borderTop: '1px solid #c9a96e55' }}>
          <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium`} style={{ color: '#92400e' }}>
            10~19 · 토 10~15
          </div>
          <div className={`${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: '#a3836a88' }}>02-000-0000</div>
        </div>
        {/* 골드 밴드 하단 */}
        <div style={{ height: s ? '4px' : '2px', background: 'linear-gradient(90deg, #b8962e, #d4b04a, #e8d5a0, #d4b04a, #b8962e)' }} />
      </div>
    );
  }

  // ── Family 10: dark_green_clinic — 프리미엄 그린 (밝은 세이지 전체 톤 — 웰니스/고요한 치유) ──
  if (themeValue === 'dark_green_clinic') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#f0f7f2' }}>
        {/* 세이지 헤더 — 밝은 그린 톤 위에 짙은 그린 타이포 (훅: 전면 밝은 세이지 톤) */}
        <div style={{ padding: s ? '9px 10px 5px' : '4.5px 5px 2.5px', background: 'linear-gradient(180deg, #e6f2ea 0%, #f0f7f2 100%)' }}>
          <div className="flex items-center justify-between">
            <span className={`${s ? 'text-[15px]' : 'text-[7.5px]'} font-black leading-tight`} style={{ color: '#1a3a2a', letterSpacing: '-0.02em' }}>3월 진료안내</span>
            <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-bold`} style={{ color: '#2d6a4f' }}>OO의원</span>
          </div>
          <div className={`${s ? 'text-[7px]' : 'text-[3px]'} font-medium mt-0.5`} style={{ color: '#5e8a72' }}>2026 · 09–18 · 토 09–13</div>
        </div>
        {/* 에메랄드 그라데이션 라인 — 자연+치유 인상 */}
        <div style={{ height: s ? '2px' : '1px', background: 'linear-gradient(90deg, #a7d7be, #6ec898, #34d399, #6ec898, #a7d7be)' }} />
        {/* 요일 헤더 — 세이지 배경, 짙은 그린 텍스트 */}
        <div className="grid grid-cols-7" style={{ background: '#e6f2ea' }}>
          {days.map((d, i) => (
            <div key={d} className={`text-center font-extrabold ${s ? 'text-[9px] py-[3px]' : 'text-[4px] py-[1.5px]'}`}
              style={{ color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#2d6a4f' }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — 밝은 세이지 배경, 녹색 셀 보더 */}
        <div className="grid grid-cols-7 flex-1">
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            if (!d) return <div key={`e${i}`} style={{ borderRight: '0.5px solid #d1e8d8', borderBottom: '0.5px solid #d1e8d8' }} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            return (
              <div key={i} className="flex flex-col items-center justify-center"
                style={{
                  borderRight: '0.5px solid #d1e8d8',
                  borderBottom: '0.5px solid #d1e8d8',
                  background: isClosed ? '#fef2f2' : isShort ? '#fefce8' : '#f7fcf9',
                  borderLeft: isClosed ? '2px solid #2d6a4f' : undefined,
                }}>
                <span className={`${s ? 'text-[10px]' : 'text-[5px]'} font-bold`}
                  style={{ color: isClosed ? '#dc2626' : isShort ? '#92400e' : i % 7 === 0 ? '#dc2626' : i % 7 === 6 ? '#2563eb' : '#1a3a2a' }}>{d}</span>
                {isClosed && <span className={`${s ? 'text-[5px] px-1' : 'text-[2.5px] px-0.5'} font-black text-white leading-none rounded-sm`} style={{ background: '#2d6a4f' }}>휴진</span>}
                {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-bold leading-none`} style={{ color: '#92400e' }}>단축</span>}
              </div>
            );
          })}
        </div>
        {/* 에메랄드 하단 라인 */}
        <div style={{ height: s ? '2px' : '1px', background: 'linear-gradient(90deg, #a7d7be, #6ec898, #34d399, #6ec898, #a7d7be)' }} />
        {/* 풋터 — 세이지 톤 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '4px 10px' : '2px 5px', background: '#e6f2ea' }}>
          <div className={`flex items-center gap-1.5 ${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: '#3d7a5a' }}>
            <span className="flex items-center gap-0.5"><span className={`inline-block ${s ? 'w-2 h-[2px]' : 'w-1 h-[1px]'}`} style={{ background: '#2d6a4f' }} />휴진</span>
            <span className="flex items-center gap-0.5"><span className={`inline-block ${s ? 'w-2 h-2' : 'w-1 h-1'} rounded-sm`} style={{ background: '#fefce8' }} />단축</span>
          </div>
          <span className={`${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: '#5e8a72' }}>02-000-0000</span>
        </div>
      </div>
    );
  }

  // ── Family 11: dark_blue_modern — 네이비 모던 (순백 + 네이비 라인/텍스트 — 비즈니스 서류형) ──
  if (themeValue === 'dark_blue_modern') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: '#ffffff' }}>
        {/* 네이비 텍스트 헤더 — 순백 바탕 위에 네이비 타이포만 (훅: 유일한 흰 바탕 구조) */}
        <div style={{ padding: s ? '8px 10px 4px' : '4px 5px 2px' }}>
          <div className="flex items-center justify-between">
            <span className={`${s ? 'text-[15px]' : 'text-[7.5px]'} font-black leading-tight`} style={{ color: '#1e3a5f', letterSpacing: '-0.02em' }}>3월 진료안내</span>
            <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-bold`} style={{ color: '#1e3a5f' }}>OO내과</span>
          </div>
          <div className={`${s ? 'text-[7px]' : 'text-[3px]'} font-medium mt-0.5`} style={{ color: '#64748b' }}>2026 · 평일 09–18 · 토 09–13</div>
        </div>
        {/* 네이비 2px 실선 — 구조 디바이더 */}
        <div style={{ height: s ? '2.5px' : '1.5px', background: '#1e3a5f', margin: s ? '0 8px' : '0 4px' }} />
        {/* 요일 헤더 — 순백 위 네이비 텍스트 */}
        <div className="grid grid-cols-7" style={{ margin: s ? '0 8px' : '0 4px', borderBottom: '1px solid #e2e8f0' }}>
          {days.map((d, i) => (
            <div key={d} className={`text-center font-black ${s ? 'text-[9px] py-[3px]' : 'text-[4px] py-[1.5px]'}`}
              style={{ color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#1e3a5f' }}>{d}</div>
          ))}
        </div>
        {/* 달력 격자 — 순백, 네이비 좌측 보더 휴진, 깔끔한 슬레이트 보더 */}
        <div className="grid grid-cols-7 flex-1" style={{ margin: s ? '0 8px' : '0 4px' }}>
          {[null,null,null,null,null,null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,null,null,null,null,null].slice(0,35).map((d, i) => {
            if (!d) return <div key={`e${i}`} style={{ borderRight: '0.5px solid #f1f5f9', borderBottom: '0.5px solid #f1f5f9' }} />;
            const isClosed = d === 9 || d === 23;
            const isShort = d === 16;
            return (
              <div key={i} className="flex flex-col items-center justify-center"
                style={{
                  borderRight: '0.5px solid #e2e8f0',
                  borderBottom: '0.5px solid #e2e8f0',
                  background: isClosed ? '#f8fafc' : 'white',
                  borderLeft: isClosed ? `2.5px solid #1e3a5f` : undefined,
                }}>
                <span className={`${s ? 'text-[10px]' : 'text-[5px]'} font-bold`}
                  style={{ color: isClosed ? '#1e3a5f' : isShort ? '#92400e' : i % 7 === 0 ? '#dc2626' : i % 7 === 6 ? '#2563eb' : '#1e293b' }}>{d}</span>
                {isClosed && <span className={`${s ? 'text-[5px] px-1' : 'text-[2.5px] px-0.5'} font-black text-white leading-none rounded-sm`} style={{ background: '#1e3a5f' }}>휴진</span>}
                {isShort && <span className={`${s ? 'text-[5px]' : 'text-[2.5px]'} font-bold text-amber-600 leading-none`}>단축</span>}
              </div>
            );
          })}
        </div>
        {/* 네이비 하단 실선 */}
        <div style={{ height: s ? '2.5px' : '1.5px', background: '#1e3a5f', margin: s ? '0 8px' : '0 4px' }} />
        {/* 풋터 — 순백 위 네이비 텍스트 범례 */}
        <div className="flex items-center justify-between" style={{ padding: s ? '4px 10px' : '2px 5px' }}>
          <span className={`${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: '#64748b' }}>02-000-0000</span>
          <div className={`flex items-center gap-1.5 ${s ? 'text-[7px]' : 'text-[3px]'}`} style={{ color: '#475569' }}>
            <span className="flex items-center gap-0.5"><span className={`inline-block ${s ? 'w-2 h-[2.5px]' : 'w-1 h-[1.5px]'}`} style={{ background: '#1e3a5f' }} />휴진</span>
            <span className="flex items-center gap-0.5"><span className={`inline-block ${s ? 'w-2 h-2' : 'w-1 h-1'} rounded-sm`} style={{ background: '#fef3c7' }} />단축</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Family 12: lavender_sparkle — 라벤더 소프트 (훅: 라벤더 그라데이션 무드 — 톤 자체가 주인공) ──
  if (themeValue === 'lavender_sparkle') {
    const days = ['일','월','화','수','목','금','토'];
    return (
      <div className="w-full h-full flex flex-col" style={{ background: 'linear-gradient(180deg, #f3eff8 0%, #f9f7fc 40%, #fefcff 100%)', borderRadius: s ? 10 : 5, overflow: 'hidden' }}>
        {/* 라벤더 헤더 — 부드러운 퍼플 그라데이션 밴드 */}
        <div style={{ background: 'linear-gradient(135deg, #6b5b7b 0%, #8b7a9e 50%, #a090b0 100%)' }}>
          <div className="flex items-center justify-between" style={{ padding: s ? '8px 10px 3px' : '4px 5px 1.5px' }}>
            <span className={`${s ? 'text-[14px]' : 'text-[7px]'} font-black text-white leading-tight tracking-tight`}>3월 진료안내</span>
            <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium text-white/50`}>2026</span>
          </div>
          <div className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium text-white/60`} style={{ padding: s ? '0 10px 6px' : '0 5px 3px' }}>OO의원</div>
        </div>
        {/* 라벤더 악센트 라인 */}
        <div style={{ height: s ? '1.5px' : '0.5px', background: 'linear-gradient(90deg, #c4b5d4, #ddd4e8, #c4b5d4)' }} />
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
        <div className="flex items-center justify-between" style={{ padding: s ? '5px 10px' : '2.5px 5px', background: 'linear-gradient(135deg, #6b5b7b, #8b7a9e)' }}>
          <span className={`${s ? 'text-[8px]' : 'text-[3.5px]'} font-medium text-white/80`}>09–18 · 토 09–13</span>
          <div className="flex gap-1.5">
            <span className={`flex items-center gap-0.5 ${s ? 'text-[7px]' : 'text-[3px]'} text-white/60`}>
              <span className={`inline-block ${s ? 'w-2 h-2' : 'w-1 h-1'}`} style={{ borderRadius: s ? 3 : 1.5, background: '#fce8ec' }} />휴진
            </span>
            <span className={`flex items-center gap-0.5 ${s ? 'text-[7px]' : 'text-[3px]'} text-white/60`}>
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
export function TemplateSVGPreview({ template: t, category, hospitalName }: { template: CategoryTemplate; category: TemplateCategory; hospitalName: string }) {
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

