/**
 * CalendarPreviews.tsx — 달력 테마 프리뷰 컴포넌트
 *
 * 12개 달력 테마(autumn, cherry, ocean 등)의 SVG 미리보기.
 * TemplatePreviews.tsx에서 분리.
 *
 * 소비자: TemplatePreviews.tsx (dispatcher), TemplateGenerator.tsx
 */
import React from 'react';

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
