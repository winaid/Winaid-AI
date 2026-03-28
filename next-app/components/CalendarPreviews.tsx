/**
 * CalendarPreviews.tsx — 달력 테마 무드 카드 프리뷰
 *
 * 달력 격자 없이, 각 템플릿의 색상·장식·분위기만 보여주는 무드 카드.
 * 상단 60%: 시그니처 배경 + 장식
 * 하단: 3색 팔레트 바
 */

export function CalendarThemePreview({
  themeValue,
  groupColor,
  size = 'sm',
}: {
  themeValue: string;
  groupColor?: string;
  size?: 'sm' | 'lg';
}) {
  const lg = size === 'lg';

  /* ── 팔레트 바 ── */
  function Palette({ colors }: { colors: [string, string, string] }) {
    const h = lg ? 6 : 4;
    return (
      <div className="flex w-full overflow-hidden" style={{ height: h, borderRadius: 99 }}>
        {colors.map((c, i) => (
          <div key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>
    );
  }

  /* ── 공통 래퍼 ── */
  function Card({
    children,
    palette,
    bg,
  }: {
    children: React.ReactNode;
    palette: [string, string, string];
    bg?: string;
  }) {
    return (
      <div
        className={`w-full h-full flex flex-col overflow-hidden ${lg ? 'rounded-xl' : 'rounded-lg'}`}
        style={{ background: bg }}
      >
        <div className="flex-1 relative overflow-hidden flex flex-col">
          {children}
        </div>
        <div style={{ padding: lg ? '4px 6px 5px' : '2px 4px 3px' }}>
          <Palette colors={palette} />
        </div>
      </div>
    );
  }

  /* ═══ 1. sch_spreadsheet ═══ */
  if (themeValue === 'sch_spreadsheet') {
    return (
      <Card palette={['#1e293b', '#e2e8f0', '#f8fafc']} bg="#1e293b">
        <div className="flex-1 flex items-center justify-center">
          <span className={`${lg ? 'text-2xl' : 'text-lg'} font-black text-white`}>3월</span>
        </div>
        <div style={{ background: '#f8fafc', padding: lg ? '10px 12px' : '6px 8px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: 2, background: '#e2e8f0', marginBottom: i < 2 ? (lg ? 6 : 4) : 0 }} />
          ))}
        </div>
      </Card>
    );
  }

  /* ═══ 2. sch_charcoal_frame ═══ */
  if (themeValue === 'sch_charcoal_frame') {
    const p = lg ? 12 : 8;
    return (
      <Card palette={['#292524', '#ef4444', '#ffffff']} bg="#292524">
        <div className="flex-1 flex items-center justify-center" style={{ padding: p }}>
          <div className="w-full h-full bg-white flex items-center justify-center" style={{ borderRadius: lg ? 6 : 4 }}>
            <div
              className="rounded-full flex items-center justify-center"
              style={{
                width: lg ? 40 : 24,
                height: lg ? 40 : 24,
                background: '#ef4444',
              }}
            >
              <span className={`${lg ? 'text-sm' : 'text-[10px]'} font-black text-white`}>9</span>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  /* ═══ 3. sch_modern_note ═══ */
  if (themeValue === 'sch_modern_note') {
    return (
      <Card palette={['#111827', '#e5e7eb', '#ffffff']} bg="#ffffff">
        <div className="flex-1 flex flex-col items-center justify-center relative">
          <span
            className="font-black leading-none"
            style={{ fontSize: lg ? 64 : 40, color: '#111827', letterSpacing: '-0.03em' }}
          >
            3
          </span>
          <div className="w-3/5" style={{ marginTop: lg ? 4 : 2 }}>
            <div style={{ height: 2, background: '#111827' }} />
            <div style={{ height: 3 }} />
            <div style={{ height: 1, background: '#e5e7eb' }} />
          </div>
          {/* 도트 + 대시 */}
          <div className="absolute flex items-center" style={{ bottom: lg ? 12 : 8, right: lg ? 14 : 10, gap: lg ? 6 : 4 }}>
            <div style={{ width: lg ? 5 : 3, height: lg ? 5 : 3, borderRadius: '50%', background: '#ef4444' }} />
            <div style={{ width: lg ? 12 : 8, height: lg ? 3 : 2, borderRadius: 2, background: '#f59e0b' }} />
          </div>
        </div>
      </Card>
    );
  }

  /* ═══ 4. sch_night_clinic ═══ */
  if (themeValue === 'sch_night_clinic') {
    return (
      <Card palette={['#1c1917', '#d97706', '#fef9c3']} bg="#1c1917">
        {/* 앰버 밴드 */}
        <div
          className="flex items-center justify-center"
          style={{ background: '#d97706', height: '25%', flexShrink: 0 }}
        >
          <span className={`${lg ? 'text-sm' : 'text-[10px]'} font-bold text-white`}>야간</span>
        </div>
        {/* 화/목 컬럼 암시 */}
        <div className="flex-1 flex items-center justify-center" style={{ gap: lg ? 16 : 10 }}>
          <div style={{ width: '15%', height: '60%', background: 'rgba(217,119,6,0.3)', borderRadius: lg ? 3 : 2 }} />
          <div style={{ width: '15%', height: '60%', background: 'rgba(217,119,6,0.3)', borderRadius: lg ? 3 : 2 }} />
        </div>
      </Card>
    );
  }

  /* ═══ 5. sch_blushy_rose ═══ */
  if (themeValue === 'sch_blushy_rose') {
    const circleSize = lg ? 32 : 20;
    return (
      <Card palette={['#e11d48', '#fda4af', '#fff1f2']} bg="#fff1f2">
        {/* 로즈 그라데이션 바 */}
        <div style={{ height: '30%', background: 'linear-gradient(135deg, #e11d48, #f43f5e)', flexShrink: 0 }} />
        {/* 핑크 원 3개 */}
        <div className="flex-1 flex items-center justify-center" style={{ gap: lg ? 6 : 4 }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="rounded-full"
              style={{ width: circleSize, height: circleSize, background: '#fda4af' }}
            />
          ))}
        </div>
      </Card>
    );
  }

  /* ═══ 6. sch_sns_bold ═══ */
  if (themeValue === 'sch_sns_bold') {
    return (
      <Card palette={['#f97316', '#fed7aa', '#ffffff']} bg="#ffffff">
        <div className="flex-1 flex flex-row overflow-hidden">
          {/* 좌측 코랄 바 */}
          <div style={{ width: lg ? 12 : 8, background: '#f97316', flexShrink: 0 }} />
          {/* 우측 */}
          <div className="flex-1 flex flex-col items-center justify-center" style={{ gap: lg ? 8 : 4 }}>
            <span className={`${lg ? 'text-xl' : 'text-lg'} font-black`} style={{ color: '#f97316' }}>3월</span>
            <span
              className="font-semibold"
              style={{
                background: '#fff7ed',
                color: '#ea580c',
                fontSize: lg ? 10 : 7,
                padding: lg ? '2px 8px' : '1px 5px',
                borderRadius: 99,
              }}
            >
              휴진안내
            </span>
          </div>
        </div>
      </Card>
    );
  }

  /* ═══ 7. sch_lavender_soft ═══ */
  if (themeValue === 'sch_lavender_soft') {
    return (
      <Card palette={['#7c3aed', '#c4b5fd', '#f3eff8']} bg="linear-gradient(to bottom, #f3eff8, #fefcff)">
        {/* 라벤더 헤더 밴드 */}
        <div style={{ height: '25%', background: 'linear-gradient(135deg, #a78bfa, #7c3aed)', flexShrink: 0 }} />
        {/* ✦ 장식들 */}
        <div className="flex-1 relative">
          {[
            { top: lg ? 8 : 5, right: lg ? 14 : 8, size: lg ? 18 : 12, opacity: 0.5 },
            { top: lg ? 28 : 18, left: lg ? 12 : 8, size: lg ? 12 : 8, opacity: 0.3 },
            { top: lg ? 18 : 12, right: lg ? 40 : 24, size: lg ? 10 : 6, opacity: 0.2 },
          ].map((s, i) => (
            <div
              key={i}
              className="absolute pointer-events-none"
              style={{ top: s.top, left: (s as { left?: number }).left, right: (s as { right?: number }).right, color: '#c4b5fd', fontSize: s.size, opacity: s.opacity }}
            >
              ✦
            </div>
          ))}
        </div>
      </Card>
    );
  }

  /* ═══ 8. sch_korean_classic ═══ */
  if (themeValue === 'sch_korean_classic') {
    const halfW = lg ? 56 : 40;
    const halfH = lg ? 28 : 20;
    return (
      <Card palette={['#44403c', '#e8795a', '#f5e6d0']} bg="#f5e6d0">
        {/* 차콜 상단 */}
        <div className="flex flex-col items-center" style={{ background: '#44403c', height: '35%', flexShrink: 0, justifyContent: 'flex-end' }}>
          {/* 코랄 반원 */}
          <div
            className="flex items-center justify-center"
            style={{
              width: halfW,
              height: halfH,
              background: '#e8795a',
              borderRadius: `${halfW}px ${halfW}px 0 0`,
              marginBottom: -1,
            }}
          >
            <span className={`${lg ? 'text-xs' : 'text-[8px]'} font-black text-white`}>3월</span>
          </div>
        </div>
        {/* 크림 영역 + 장식 */}
        <div className="flex-1 relative">
          <div className="absolute pointer-events-none" style={{ bottom: lg ? 8 : 4, right: lg ? 10 : 6, color: '#92400e', fontSize: lg ? 14 : 9, opacity: 0.3 }}>✿</div>
          <div className="absolute pointer-events-none" style={{ bottom: lg ? 22 : 14, left: lg ? 8 : 4, color: '#92400e', fontSize: lg ? 10 : 6, opacity: 0.25 }}>◈</div>
        </div>
      </Card>
    );
  }

  /* ═══ 9. sch_deep_frost ═══ */
  if (themeValue === 'sch_deep_frost') {
    return (
      <Card palette={['#0f2444', '#7dd3fc', '#ffffff']} bg="#0f2444">
        {/* 상단 타이틀 */}
        <div className="flex items-center justify-center" style={{ height: '30%', flexShrink: 0 }}>
          <span className={`${lg ? 'text-base' : 'text-xs'} font-black text-white`}>3월</span>
        </div>
        {/* 흰 카드 */}
        <div className="flex-1 flex items-start justify-center" style={{ padding: lg ? '0 16px 12px' : '0 10px 8px' }}>
          <div
            className="w-[70%] h-full flex items-center justify-center"
            style={{
              background: '#ffffff',
              borderRadius: lg ? 8 : 5,
              boxShadow: lg ? '0 4px 16px rgba(0,0,0,0.35)' : '0 2px 8px rgba(0,0,0,0.35)',
            }}
          >
            <div className="rounded-full" style={{ width: lg ? 14 : 8, height: lg ? 14 : 8, background: '#7dd3fc' }} />
          </div>
        </div>
      </Card>
    );
  }

  /* ═══ 10. sch_gold_classic ═══ */
  if (themeValue === 'sch_gold_classic') {
    const bandH = lg ? 16 : 10;
    return (
      <Card palette={['#c9a96e', '#854d0e', '#faf7f2']} bg="#faf7f2">
        {/* 상단 골드 밴드 */}
        <div style={{ height: bandH, background: 'linear-gradient(90deg, #c9a96e, #e8d5a8, #c9a96e)', flexShrink: 0 }} />
        {/* 가운데 */}
        <div className="flex-1 flex flex-col items-center justify-center" style={{ gap: lg ? 8 : 4 }}>
          <span className={`${lg ? 'text-lg' : 'text-sm'} font-black font-serif`} style={{ color: '#854d0e' }}>
            ◆ 3월 ◆
          </span>
          <div className="w-3/5" style={{ borderTop: '1px dotted #c9a96e' }} />
        </div>
        {/* 하단 골드 밴드 */}
        <div style={{ height: bandH, background: 'linear-gradient(90deg, #c9a96e, #e8d5a8, #c9a96e)', flexShrink: 0 }} />
      </Card>
    );
  }

  /* ═══ 11. sch_premium_green ═══ */
  if (themeValue === 'sch_premium_green') {
    return (
      <Card palette={['#2d6a4f', '#10b981', '#f0f7f2']} bg="#f0f7f2">
        <div className="flex-1 flex flex-row overflow-hidden">
          {/* 에메랄드 좌측선 */}
          <div style={{ width: 3, background: 'linear-gradient(180deg, #10b981, #059669)', flexShrink: 0 }} />
          <div className="flex-1 flex flex-col">
            {/* 다크그린 헤더 */}
            <div
              className="flex items-center justify-center"
              style={{ background: '#2d6a4f', height: lg ? 32 : 20, flexShrink: 0 }}
            >
              <span className={`${lg ? 'text-xs' : 'text-[8px]'} font-bold text-white`}>진료일정</span>
            </div>
            {/* 가운데 */}
            <div className="flex-1 flex items-center justify-center">
              <span className={`${lg ? 'text-base' : 'text-xs'} font-semibold`} style={{ color: '#2d6a4f' }}>3월</span>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  /* ═══ 12. sch_navy_modern ═══ */
  if (themeValue === 'sch_navy_modern') {
    return (
      <Card palette={['#1e3a5f', '#94a3b8', '#ffffff']} bg="#ffffff">
        <div className="flex-1 flex flex-col" style={{ padding: lg ? '8px 10px' : '5px 6px' }}>
          {/* 상단 네이비 선 */}
          <div style={{ height: 2.5, background: '#1e3a5f', flexShrink: 0 }} />
          {/* 가운데 */}
          <div className="flex-1 flex items-center justify-center">
            <span className={`${lg ? 'text-lg' : 'text-sm'} font-bold`} style={{ color: '#1e3a5f' }}>3월</span>
          </div>
          {/* 하단 네이비 선 */}
          <div style={{ height: 2.5, background: '#1e3a5f', flexShrink: 0 }} />
        </div>
      </Card>
    );
  }

  /* ═══ fallback ═══ */
  return (
    <div
      className={`w-full h-full flex items-center justify-center ${lg ? 'rounded-xl' : 'rounded-lg'}`}
      style={{ background: groupColor || '#64748b' }}
    >
      <span className={`${lg ? 'text-[11px]' : 'text-[6px]'} font-bold text-white`}>미리보기</span>
    </div>
  );
}
