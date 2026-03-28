/**
 * CalendarPreviews.tsx — 달력 테마 "미니 포스터" 프리뷰
 *
 * 각 프리뷰 = 실제 포스터의 축소판.
 * 상단 35-40%: 템플릿 고유 장식 (헤더/프레임/타이틀/모티프)
 * 하단 60-65%: 미니 달력 격자 (숫자 없이 색상 블록만)
 *
 * 3월 샘플: 1일=토요일, 휴진 9·23, 단축 16
 */

/* ── 공통 데이터 ── */
const MARCH_GRID: (number | null)[] = [
  null, null, null, null, null, null, 1,
  2, 3, 4, 5, 6, 7, 8,
  9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22,
  23, 24, 25, 26, 27, 28, 29,
  30, 31, null, null, null, null, null,
];
const CLOSED = new Set([9, 23]);
const SHORTENED = new Set([16]);

/* ── MiniGrid: 5x7 미니 달력 격자 ── */
function MiniGrid({
  cellBg,
  closedBg,
  shortenedBg,
  emptyBg,
  cellRadius,
  cellGap,
  size,
  borderStyle,
  colHighlight,
}: {
  cellBg: string;
  closedBg: string;
  shortenedBg: string;
  emptyBg?: string;
  cellRadius?: string;
  cellGap?: number;
  size: 'sm' | 'lg';
  borderStyle?: string;
  colHighlight?: Record<number, string>;
}) {
  const lg = size === 'lg';
  const cellSize = lg ? 6 : 4;
  const gap = cellGap ?? (lg ? 1.5 : 1);
  const radius = cellRadius || '1px';

  return (
    <div
      className="grid grid-cols-7"
      style={{ gap, padding: lg ? '2px 4px' : '1px 2px' }}
    >
      {MARCH_GRID.map((day, i) => {
        if (day === null) {
          return (
            <div
              key={i}
              style={{
                width: cellSize,
                height: cellSize,
                background: emptyBg || 'transparent',
                borderRadius: radius,
              }}
            />
          );
        }
        const closed = CLOSED.has(day);
        const short = SHORTENED.has(day);
        const col = i % 7;
        const colBg = colHighlight?.[col];

        return (
          <div
            key={i}
            style={{
              width: cellSize,
              height: cellSize,
              background: closed ? closedBg : short ? shortenedBg : colBg || cellBg,
              borderRadius: radius,
              border: borderStyle || 'none',
            }}
          />
        );
      })}
    </div>
  );
}

/* ── 메인 컴포넌트 ── */
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
  const rd = lg ? 'rounded-xl' : 'rounded-lg';

  /* ═══ 1. sch_spreadsheet ═══ */
  if (themeValue === 'sch_spreadsheet') {
    return (
      <div className={`w-full h-full flex flex-col overflow-hidden ${rd}`} style={{ background: '#fff' }}>
        {/* 다크 헤더 */}
        <div
          className="flex items-center"
          style={{ background: '#1e293b', padding: lg ? '6px 6px' : '3px 4px', flexShrink: 0 }}
        >
          <span className={`${lg ? 'text-[11px]' : 'text-[8px]'} font-bold text-white leading-tight`}>
            3월 진료일정
          </span>
        </div>
        {/* 미니 격자 */}
        <div className="flex-1 flex items-center justify-center">
          <MiniGrid
            size={size}
            cellBg="#f1f5f9"
            closedBg="#e2e8f0"
            shortenedBg="#fef9c3"
          />
        </div>
        {/* 다크 풋터 */}
        <div style={{ background: '#1e293b', height: lg ? 8 : 6, flexShrink: 0 }} />
      </div>
    );
  }

  /* ═══ 2. sch_charcoal_frame ═══ */
  if (themeValue === 'sch_charcoal_frame') {
    const p = lg ? 6 : 4;
    return (
      <div className={`w-full h-full flex flex-col overflow-hidden ${rd}`} style={{ background: '#292524', padding: p }}>
        {/* 프레임 상단 */}
        <div className="text-center" style={{ paddingBottom: lg ? 3 : 2, flexShrink: 0 }}>
          <span className={`${lg ? 'text-[10px]' : 'text-[8px]'} font-bold text-white`}>3월</span>
        </div>
        {/* 흰 내부 */}
        <div
          className="flex-1 flex items-center justify-center overflow-hidden"
          style={{ background: '#fff', borderRadius: lg ? 4 : 2 }}
        >
          <MiniGrid
            size={size}
            cellBg="#ffffff"
            closedBg="#ef4444"
            shortenedBg="#fbbf24"
            borderStyle="0.5px solid #a8a29e"
          />
        </div>
      </div>
    );
  }

  /* ═══ 3. sch_modern_note ═══ */
  if (themeValue === 'sch_modern_note') {
    return (
      <div className={`w-full h-full flex flex-col overflow-hidden bg-white ${rd}`} style={{ padding: lg ? '6px 8px' : '4px 5px' }}>
        {/* 큰 "3" + 이중선 */}
        <div style={{ flexShrink: 0 }}>
          <div className="font-black leading-none" style={{ fontSize: lg ? 36 : 24, color: '#111827', letterSpacing: '-0.03em' }}>3</div>
          <div style={{ marginTop: lg ? 2 : 1 }}>
            <div style={{ height: 2, background: '#111827' }} />
            <div style={{ height: lg ? 3 : 2 }} />
            <div style={{ height: 1, background: '#e5e7eb' }} />
          </div>
        </div>
        {/* 미니 격자 */}
        <div className="flex-1 flex items-center justify-center">
          <MiniGrid
            size={size}
            cellBg="#f9fafb"
            closedBg="#fecaca"
            shortenedBg="#fde68a"
            cellRadius="50%"
            cellGap={lg ? 2 : 1.5}
          />
        </div>
      </div>
    );
  }

  /* ═══ 4. sch_night_clinic ═══ */
  if (themeValue === 'sch_night_clinic') {
    return (
      <div className={`w-full h-full flex flex-col overflow-hidden ${rd}`} style={{ background: '#1c1917' }}>
        {/* 앰버 밴드 */}
        <div
          className="flex items-center justify-center"
          style={{ background: '#d97706', height: lg ? 16 : 10, flexShrink: 0 }}
        >
          <span className={`${lg ? 'text-[8px]' : 'text-[6px]'} font-bold text-white`}>야간진료</span>
        </div>
        {/* 미니 격자 — 화/목 컬럼 하이라이트 */}
        <div className="flex-1 flex items-center justify-center">
          <MiniGrid
            size={size}
            cellBg="rgba(255,255,255,0.08)"
            closedBg="#ef4444"
            shortenedBg="#fbbf24"
            colHighlight={{ 2: 'rgba(217,119,6,0.2)', 4: 'rgba(217,119,6,0.2)' }}
          />
        </div>
      </div>
    );
  }

  /* ═══ 5. sch_blushy_rose ═══ */
  if (themeValue === 'sch_blushy_rose') {
    return (
      <div className={`w-full h-full flex flex-col overflow-hidden ${rd}`} style={{ background: '#fff1f2' }}>
        {/* 로즈 그라데이션 바 */}
        <div
          className="flex items-center"
          style={{
            background: 'linear-gradient(135deg, #e11d48, #f43f5e)',
            padding: lg ? '5px 6px' : '3px 4px',
            flexShrink: 0,
          }}
        >
          <span className={`${lg ? 'text-[10px]' : 'text-[7px]'} font-bold text-white leading-tight`}>
            3월 진료일정
          </span>
        </div>
        {/* 미니 격자 — 원형 셀 */}
        <div className="flex-1 flex items-center justify-center">
          <MiniGrid
            size={size}
            cellBg="#fce7f3"
            closedBg="#fda4af"
            shortenedBg="#fde68a"
            cellRadius="50%"
          />
        </div>
      </div>
    );
  }

  /* ═══ 6. sch_sns_bold ═══ */
  if (themeValue === 'sch_sns_bold') {
    return (
      <div className={`w-full h-full flex flex-row overflow-hidden ${rd}`} style={{ background: '#fff' }}>
        {/* 좌측 코랄 바 */}
        <div style={{ width: lg ? 6 : 4, background: '#f97316', flexShrink: 0 }} />
        <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
          {/* 타이틀 */}
          <div style={{ padding: lg ? '5px 6px 2px' : '3px 4px 1px', flexShrink: 0 }}>
            <span className={`${lg ? 'text-[14px]' : 'text-[10px]'} font-black`} style={{ color: '#f97316' }}>3월</span>
          </div>
          {/* 미니 격자 — 라운드 셀 */}
          <div className="flex-1 flex items-center justify-center">
            <MiniGrid
              size={size}
              cellBg="#fff7ed"
              closedBg="#fb923c"
              shortenedBg="#fde68a"
              cellRadius="4px"
            />
          </div>
        </div>
      </div>
    );
  }

  /* ═══ 7. sch_lavender_soft ═══ */
  if (themeValue === 'sch_lavender_soft') {
    return (
      <div
        className={`w-full h-full flex flex-col overflow-hidden relative ${rd}`}
        style={{ background: 'linear-gradient(to bottom, #f3eff8, #fefcff)' }}
      >
        {/* 라벤더 밴드 */}
        <div
          className="flex items-center"
          style={{
            background: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
            padding: lg ? '5px 6px' : '3px 4px',
            flexShrink: 0,
          }}
        >
          <span className={`${lg ? 'text-[10px]' : 'text-[8px]'} font-bold text-white leading-tight`}>3월</span>
        </div>
        {/* ✦ 장식 */}
        <div className="absolute pointer-events-none" style={{ top: lg ? 22 : 14, right: lg ? 8 : 5, color: '#c4b5fd', fontSize: lg ? 10 : 6, opacity: 0.25 }}>✦</div>
        <div className="absolute pointer-events-none" style={{ bottom: lg ? 10 : 6, left: lg ? 6 : 4, color: '#ddd6fe', fontSize: lg ? 7 : 4, opacity: 0.2 }}>✦</div>
        {/* 미니 격자 — pill 셀 */}
        <div className="flex-1 flex items-center justify-center">
          <MiniGrid
            size={size}
            cellBg="#ede9fe"
            closedBg="#c084fc"
            shortenedBg="#fde68a"
            cellRadius="50%"
          />
        </div>
      </div>
    );
  }

  /* ═══ 8. sch_korean_classic ═══ */
  if (themeValue === 'sch_korean_classic') {
    const halfW = lg ? 12 : 8;
    const halfH = lg ? 6 : 4;
    return (
      <div className={`w-full h-full flex flex-col overflow-hidden ${rd}`} style={{ background: '#f5e6d0' }}>
        {/* 차콜 상단 */}
        <div className="flex flex-col items-center" style={{ background: '#44403c', flexShrink: 0, paddingTop: lg ? 4 : 2, paddingBottom: 0 }}>
          {/* 코랄 반원 */}
          <div
            className="flex items-center justify-center"
            style={{
              width: halfW * 2,
              height: halfH * 2,
              background: '#e8795a',
              borderRadius: `${halfW * 2}px ${halfW * 2}px 0 0`,
              marginBottom: -1,
            }}
          >
            <span className={`${lg ? 'text-[7px]' : 'text-[5px]'} font-black text-white`}>3월</span>
          </div>
        </div>
        {/* 크림 영역 + 미니 격자 */}
        <div className="flex-1 flex items-center justify-center relative">
          <MiniGrid
            size={size}
            cellBg="#fef3c7"
            closedBg="#e8795a"
            shortenedBg="#fbbf24"
          />
          {/* ✿ 장식 */}
          <div className="absolute pointer-events-none" style={{ bottom: lg ? 4 : 2, right: lg ? 5 : 3, color: '#92400e', fontSize: lg ? 8 : 5, opacity: 0.25 }}>✿</div>
        </div>
      </div>
    );
  }

  /* ═══ 9. sch_deep_frost ═══ */
  if (themeValue === 'sch_deep_frost') {
    return (
      <div className={`w-full h-full flex flex-col overflow-hidden ${rd}`} style={{ background: '#0f2444' }}>
        {/* 네이비 상단 타이틀 */}
        <div className="flex items-center" style={{ padding: lg ? '5px 6px' : '3px 4px', flexShrink: 0 }}>
          <span className={`${lg ? 'text-[10px]' : 'text-[7px]'} font-bold text-white leading-tight`}>
            3월 진료일정
          </span>
        </div>
        {/* 흰 카드 안에 미니 격자 */}
        <div className="flex-1 flex items-stretch" style={{ padding: lg ? '0 6px 6px' : '0 3px 3px' }}>
          <div
            className="flex-1 flex items-center justify-center overflow-hidden"
            style={{
              background: '#fff',
              borderRadius: lg ? 6 : 3,
              boxShadow: lg ? '0 2px 10px rgba(0,0,0,0.3)' : '0 1px 5px rgba(0,0,0,0.3)',
            }}
          >
            <MiniGrid
              size={size}
              cellBg="#eff6ff"
              closedBg="#93c5fd"
              shortenedBg="#fde68a"
            />
          </div>
        </div>
      </div>
    );
  }

  /* ═══ 10. sch_gold_classic ═══ */
  if (themeValue === 'sch_gold_classic') {
    const bandH = lg ? 10 : 6;
    return (
      <div className={`w-full h-full flex flex-col overflow-hidden ${rd}`} style={{ background: '#faf7f2' }}>
        {/* 상단 골드 밴드 */}
        <div style={{ height: bandH, background: 'linear-gradient(90deg, #c9a96e, #e8d5a8, #c9a96e)', flexShrink: 0 }} />
        {/* 타이틀 */}
        <div className="text-center" style={{ padding: lg ? '4px 0 2px' : '2px 0 1px', flexShrink: 0 }}>
          <span className={`${lg ? 'text-[10px]' : 'text-[7px]'} font-black font-serif`} style={{ color: '#854d0e' }}>
            ◆ 3월 ◆
          </span>
        </div>
        {/* 미니 격자 — dotted border */}
        <div className="flex-1 flex items-center justify-center">
          <MiniGrid
            size={size}
            cellBg="#fefce8"
            closedBg="#d97706"
            shortenedBg="#fde68a"
            borderStyle="0.5px dotted #d4c5a9"
          />
        </div>
        {/* 하단 골드 밴드 */}
        <div style={{ height: bandH, background: 'linear-gradient(90deg, #c9a96e, #e8d5a8, #c9a96e)', flexShrink: 0 }} />
      </div>
    );
  }

  /* ═══ 11. sch_premium_green ═══ */
  if (themeValue === 'sch_premium_green') {
    return (
      <div className={`w-full h-full flex flex-row overflow-hidden ${rd}`} style={{ background: '#f0f7f2' }}>
        {/* 에메랄드 좌측 세로선 */}
        <div style={{ width: 2, background: 'linear-gradient(180deg, #10b981, #059669)', flexShrink: 0 }} />
        <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
          {/* 다크그린 헤더 */}
          <div
            className="flex items-center"
            style={{ background: '#2d6a4f', padding: lg ? '5px 6px' : '3px 4px', flexShrink: 0 }}
          >
            <span className={`${lg ? 'text-[10px]' : 'text-[7px]'} font-bold text-white leading-tight`}>3월</span>
          </div>
          {/* 미니 격자 */}
          <div className="flex-1 flex items-center justify-center">
            <MiniGrid
              size={size}
              cellBg="#ecfdf5"
              closedBg="#fecaca"
              shortenedBg="#fde68a"
            />
          </div>
        </div>
      </div>
    );
  }

  /* ═══ 12. sch_navy_modern ═══ */
  if (themeValue === 'sch_navy_modern') {
    return (
      <div className={`w-full h-full flex flex-col overflow-hidden ${rd}`} style={{ background: '#ffffff', padding: lg ? '6px 6px' : '3px 4px' }}>
        {/* 상단 네이비 선 */}
        <div style={{ height: 2, background: '#1e3a5f', flexShrink: 0 }} />
        {/* 타이틀 */}
        <div style={{ padding: lg ? '3px 0 1px' : '2px 0 0', flexShrink: 0 }}>
          <span className={`${lg ? 'text-[10px]' : 'text-[7px]'} font-bold`} style={{ color: '#1e3a5f' }}>3월</span>
        </div>
        {/* 미니 격자 */}
        <div className="flex-1 flex items-center justify-center">
          <MiniGrid
            size={size}
            cellBg="#f8fafc"
            closedBg="#cbd5e1"
            shortenedBg="#fde68a"
          />
        </div>
        {/* 하단 네이비 선 */}
        <div style={{ height: 2, background: '#1e3a5f', flexShrink: 0 }} />
      </div>
    );
  }

  /* ═══ fallback ═══ */
  return (
    <div
      className={`w-full h-full flex items-center justify-center ${rd}`}
      style={{ background: groupColor || '#64748b' }}
    >
      <span className={`${lg ? 'text-[11px]' : 'text-[6px]'} font-bold text-white`}>미리보기</span>
    </div>
  );
}
