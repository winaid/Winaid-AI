/**
 * CalendarPreviews.tsx — 달력 테마 무드 카드 프리뷰
 *
 * 각 템플릿의 색상·장식·분위기를 보여주는 무드 카드.
 * 달력 격자 없이 시그니처 장식 + 3색 팔레트 바.
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
  const rd = lg ? 'rounded-xl' : 'rounded-lg';

  /* ── 팔레트 바 ── */
  function Pal({ c }: { c: [string, string, string] }) {
    return (
      <div className="flex w-full overflow-hidden" style={{ height: lg ? 6 : 4, borderRadius: 99 }}>
        {c.map((color, i) => <div key={i} className="flex-1" style={{ background: color }} />)}
      </div>
    );
  }

  /* ── 공통 래퍼 ── */
  function C({ children, pal, bg }: { children: React.ReactNode; pal: [string, string, string]; bg?: string }) {
    return (
      <div className={`w-full h-full flex flex-col overflow-hidden ${rd}`} style={{ background: bg }}>
        <div className="flex-1 relative overflow-hidden flex flex-col">{children}</div>
        <div style={{ padding: lg ? '3px 5px 4px' : '2px 4px 3px' }}><Pal c={pal} /></div>
      </div>
    );
  }

  /* ═══ 1. 벚꽃 봄 ═══ */
  if (themeValue === 'sch_cherry_blossom') {
    return (
      <C pal={['#ec4899', '#be185d', '#fdf2f8']} bg="linear-gradient(180deg, #fce7f3, #fdf2f8)">
        {/* 상단 로즈 바 */}
        <div style={{ background: '#be185d', padding: lg ? '7px 6px' : '4px 4px', flexShrink: 0 }}>
          <span className={`${lg ? 'text-[10px]' : 'text-[7px]'} font-bold text-white`}>진료일정</span>
        </div>
        {/* 꽃잎 scatter — 배경 전체에 분산 */}
        <div className="flex-1 relative">
          <div className="absolute rounded-full" style={{ top: lg ? 4 : 2, right: lg ? 10 : 6, width: lg ? 10 : 6, height: lg ? 10 : 6, background: '#f9a8d4', opacity: 0.45 }} />
          <div className="absolute rounded-full" style={{ top: lg ? 14 : 8, left: lg ? 8 : 5, width: lg ? 6 : 4, height: lg ? 6 : 4, background: '#fbcfe8', opacity: 0.35 }} />
          <div className="absolute rounded-full" style={{ top: lg ? 8 : 5, left: lg ? 28 : 16, width: lg ? 12 : 7, height: lg ? 12 : 7, background: '#f9a8d4', opacity: 0.25 }} />
          <div className="absolute rounded-full" style={{ bottom: lg ? 12 : 7, right: lg ? 14 : 8, width: lg ? 8 : 5, height: lg ? 8 : 5, background: '#fbcfe8', opacity: 0.5 }} />
          <div className="absolute rounded-full" style={{ bottom: lg ? 4 : 2, left: lg ? 16 : 10, width: lg ? 5 : 3, height: lg ? 5 : 3, background: '#f9a8d4', opacity: 0.3 }} />
          <div className="absolute rounded-full" style={{ top: lg ? 22 : 13, right: lg ? 6 : 3, width: lg ? 7 : 4, height: lg ? 7 : 4, background: '#fda4af', opacity: 0.2 }} />
        </div>
      </C>
    );
  }

  /* ═══ 2. 해바라기 여름 ═══ */
  if (themeValue === 'sch_sunflower_summer') {
    return (
      <C pal={['#eab308', '#ca8a04', '#fefce8']} bg="linear-gradient(135deg, #fef9c3, #fefce8)">
        {/* 골드 바 */}
        <div style={{ background: 'linear-gradient(135deg, #ca8a04, #eab308)', padding: lg ? '7px 6px' : '4px 4px', flexShrink: 0 }}>
          <span className={`${lg ? 'text-[10px]' : 'text-[7px]'} font-bold text-white`}>진료일정</span>
        </div>
        {/* 햇살 rays + 해바라기 원 분산 */}
        <div className="flex-1 relative overflow-hidden">
          {/* 대각선 햇살 줄무늬 */}
          <div className="absolute" style={{ top: 0, left: lg ? -10 : -6, width: '140%', height: lg ? 4 : 3, background: 'rgba(255,255,255,0.3)', transform: 'rotate(25deg)', transformOrigin: 'top left' }} />
          <div className="absolute" style={{ top: lg ? 12 : 7, left: lg ? -10 : -6, width: '140%', height: lg ? 3 : 2, background: 'rgba(255,255,255,0.2)', transform: 'rotate(25deg)', transformOrigin: 'top left' }} />
          {/* 해바라기 원 — 우상단, 좌하단 */}
          <div className="absolute rounded-full" style={{ top: lg ? 4 : 2, right: lg ? 6 : 3, width: lg ? 16 : 10, height: lg ? 16 : 10, background: '#fbbf24', border: `${lg ? 2 : 1.5}px solid #ca8a04` }} />
          <div className="absolute rounded-full" style={{ bottom: lg ? 6 : 3, left: lg ? 8 : 4, width: lg ? 12 : 8, height: lg ? 12 : 8, background: '#fde047', border: `${lg ? 2 : 1.5}px solid #ca8a04`, opacity: 0.7 }} />
          <div className="absolute rounded-full" style={{ bottom: lg ? 2 : 1, right: lg ? 16 : 10, width: lg ? 7 : 4, height: lg ? 7 : 4, background: '#fbbf24', opacity: 0.4 }} />
        </div>
      </C>
    );
  }

  /* ═══ 3. 단풍 가을 ═══ */
  if (themeValue === 'sch_maple_autumn') {
    return (
      <C pal={['#ea580c', '#c2410c', '#fff7ed']} bg="linear-gradient(180deg, #ea580c 0%, #fed7aa 40%, #fff7ed 100%)">
        {/* 오렌지 영역에 제목 */}
        <div style={{ padding: lg ? '7px 6px' : '4px 4px', flexShrink: 0 }}>
          <span className={`${lg ? 'text-[10px]' : 'text-[7px]'} font-bold text-white`}>진료일정</span>
        </div>
        {/* 낙엽 scatter — 배경 전체에 분산 */}
        <div className="flex-1 relative">
          {/* 마름모(잎) — 다양한 색/크기/opacity */}
          <div className="absolute" style={{ top: lg ? 2 : 1, right: lg ? 10 : 6, width: lg ? 8 : 5, height: lg ? 8 : 5, background: '#ea580c', opacity: 0.35, transform: 'rotate(45deg)', borderRadius: 1 }} />
          <div className="absolute" style={{ top: lg ? 10 : 6, left: lg ? 8 : 5, width: lg ? 6 : 4, height: lg ? 6 : 4, background: '#eab308', opacity: 0.3, transform: 'rotate(45deg)', borderRadius: 1 }} />
          <div className="absolute" style={{ top: lg ? 6 : 3, left: lg ? 24 : 14, width: lg ? 10 : 6, height: lg ? 10 : 6, background: '#92400e', opacity: 0.2, transform: 'rotate(45deg)', borderRadius: 1 }} />
          <div className="absolute rounded-full" style={{ bottom: lg ? 8 : 5, right: lg ? 8 : 5, width: lg ? 7 : 4, height: lg ? 7 : 4, background: '#f97316', opacity: 0.25 }} />
          <div className="absolute" style={{ bottom: lg ? 3 : 2, left: lg ? 14 : 8, width: lg ? 5 : 3, height: lg ? 5 : 3, background: '#dc2626', opacity: 0.15, transform: 'rotate(45deg)', borderRadius: 1 }} />
        </div>
      </C>
    );
  }

  /* ═══ 4. 눈꽃 겨울 ═══ */
  if (themeValue === 'sch_snowflake_winter') {
    return (
      <C pal={['#0ea5e9', '#0284c7', '#f0f9ff']} bg="linear-gradient(180deg, #e0f2fe, #ffffff)">
        <div style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', padding: lg ? '8px 6px' : '5px 4px', flexShrink: 0 }}>
          <span className={`${lg ? 'text-[10px]' : 'text-[7px]'} font-bold text-white`}>진료일정</span>
        </div>
        <div className="flex-1 relative">
          {/* 눈꽃 ✦ */}
          <div className="absolute pointer-events-none" style={{ top: lg ? 6 : 3, right: lg ? 8 : 5, color: '#7dd3fc', fontSize: lg ? 12 : 7, opacity: 0.4 }}>✦</div>
          <div className="absolute pointer-events-none" style={{ top: lg ? 18 : 10, left: lg ? 10 : 6, color: '#bae6fd', fontSize: lg ? 8 : 5, opacity: 0.3 }}>✦</div>
          <div className="absolute pointer-events-none" style={{ bottom: lg ? 8 : 5, right: lg ? 16 : 10, color: '#7dd3fc', fontSize: lg ? 6 : 4, opacity: 0.25 }}>✦</div>
        </div>
      </C>
    );
  }

  /* ═══ 5. 한방 전통 ═══ */
  if (themeValue === 'sch_korean_classic') {
    const hw = lg ? 14 : 10;
    return (
      <C pal={['#92400e', '#78350f', '#fef3c7']} bg="#f5e6d0">
        <div className="flex flex-col items-center" style={{ background: '#44403c', flexShrink: 0, paddingTop: lg ? 6 : 4 }}>
          <div className="flex items-center justify-center" style={{ width: hw * 2, height: hw, background: '#e8795a', borderRadius: `${hw * 2}px ${hw * 2}px 0 0`, marginBottom: -1 }}>
            <span className={`${lg ? 'text-[7px]' : 'text-[5px]'} font-black text-white`}>진료</span>
          </div>
        </div>
        <div className="flex-1 relative">
          <div className="absolute pointer-events-none" style={{ bottom: lg ? 4 : 2, right: lg ? 5 : 3, color: '#92400e', fontSize: lg ? 8 : 5, opacity: 0.25 }}>✿</div>
        </div>
      </C>
    );
  }

  /* ═══ 6. 보자기 명절 ═══ */
  if (themeValue === 'sch_bojagi_holiday') {
    return (
      <C pal={['#b91c1c', '#991b1b', '#fef2f2']} bg="#fef2f2">
        <div className="flex-1 flex flex-col overflow-hidden" style={{ border: `${lg ? 3 : 2}px solid #c9a96e`, borderRadius: lg ? 6 : 4, margin: lg ? 4 : 2 }}>
          {/* 색동 줄무늬 2개 */}
          <div className="flex" style={{ height: lg ? 4 : 3, flexShrink: 0 }}>
            <div className="flex-1" style={{ background: '#dc2626' }} />
            <div className="flex-1" style={{ background: '#2563eb' }} />
            <div className="flex-1" style={{ background: '#eab308' }} />
            <div className="flex-1" style={{ background: '#16a34a' }} />
          </div>
          <div className="flex-1 flex items-center justify-center">
            <span className={`${lg ? 'text-[10px]' : 'text-[7px]'} font-bold`} style={{ color: '#991b1b' }}>명절</span>
          </div>
          <div className="flex" style={{ height: lg ? 4 : 3, flexShrink: 0 }}>
            <div className="flex-1" style={{ background: '#dc2626' }} />
            <div className="flex-1" style={{ background: '#2563eb' }} />
            <div className="flex-1" style={{ background: '#eab308' }} />
            <div className="flex-1" style={{ background: '#16a34a' }} />
          </div>
        </div>
      </C>
    );
  }

  /* ═══ 7. 수묵화 ═══ */
  if (themeValue === 'sch_ink_wash') {
    return (
      <C pal={['#374151', '#1f2937', '#f9fafb']} bg="#ffffff">
        <div className="flex-1 flex flex-row overflow-hidden">
          {/* 먹 번짐 */}
          <div style={{ width: '30%', background: 'linear-gradient(180deg, #374151, #9ca3af, transparent)', opacity: 0.15 }} />
          <div className="flex-1 flex flex-col items-center justify-center">
            <span className={`${lg ? 'text-[11px]' : 'text-[8px]'} font-serif font-bold`} style={{ color: '#1f2937' }}>진료일정</span>
          </div>
        </div>
        {/* 빨간 낙관 */}
        <div className="absolute" style={{ bottom: lg ? 10 : 6, right: lg ? 8 : 5, width: lg ? 8 : 5, height: lg ? 8 : 5, background: '#dc2626', borderRadius: 1 }} />
      </C>
    );
  }

  /* ═══ 8. 네이비 프로 ═══ */
  if (themeValue === 'sch_navy_professional') {
    return (
      <C pal={['#1e3a5f', '#0f2444', '#ffffff']} bg="#0f2444">
        <div className="flex-1 flex flex-col">
          <div className="flex items-center" style={{ padding: lg ? '6px 6px' : '4px 4px', flexShrink: 0 }}>
            <span className={`${lg ? 'text-[10px]' : 'text-[7px]'} font-bold text-white`}>진료일정</span>
          </div>
          <div style={{ height: 1, background: '#c9a96e', margin: lg ? '0 6px' : '0 4px', flexShrink: 0 }} />
          <div className="flex-1 flex items-center justify-center" style={{ padding: lg ? '4px 8px 6px' : '3px 5px 4px' }}>
            <div className="w-full h-full" style={{ background: '#fff', borderRadius: lg ? 6 : 3, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }} />
          </div>
        </div>
      </C>
    );
  }

  /* ═══ 9. 민트 웰니스 ═══ */
  if (themeValue === 'sch_mint_wellness') {
    return (
      <C pal={['#14b8a6', '#0f766e', '#f0fdfa']} bg="#f0fdfa">
        <div style={{ background: '#0f766e', padding: lg ? '8px 6px' : '5px 4px', flexShrink: 0 }}>
          <span className={`${lg ? 'text-[10px]' : 'text-[7px]'} font-bold text-white`}>진료일정</span>
        </div>
        <div className="flex-1 relative">
          <div className="absolute pointer-events-none" style={{ bottom: lg ? 6 : 3, right: lg ? 6 : 4, color: '#10b981', fontSize: lg ? 14 : 9, opacity: 0.3 }}>🌿</div>
        </div>
      </C>
    );
  }

  /* ═══ 10. 코랄 SNS ═══ */
  if (themeValue === 'sch_coral_sns') {
    return (
      <C pal={['#f97316', '#ea580c', '#fff7ed']} bg="#fff7ed">
        <div style={{ background: 'linear-gradient(135deg, #f97316, #fed7aa)', height: '45%', flexShrink: 0, display: 'flex', alignItems: 'center', padding: lg ? '0 6px' : '0 4px' }}>
          <span className={`${lg ? 'text-[10px]' : 'text-[7px]'} font-bold text-white`}>진료일정</span>
        </div>
        <div className="flex-1 flex items-center justify-center" style={{ padding: lg ? '4px 8px' : '2px 5px' }}>
          <div className="w-full h-full" style={{ background: '#fff', borderRadius: lg ? 10 : 6, border: '1px solid #fed7aa' }} />
        </div>
      </C>
    );
  }

  /* ═══ 11. 키즈 파스텔 ═══ */
  if (themeValue === 'sch_kids_pastel') {
    const colors = ['#f9a8d4', '#fdba74', '#fde68a', '#86efac', '#7dd3fc', '#c4b5fd'];
    return (
      <C pal={['#a855f7', '#7c3aed', '#faf5ff']} bg="#faf5ff">
        {/* 무지개 줄무늬 */}
        <div className="flex flex-col" style={{ flexShrink: 0 }}>
          {colors.map((c, i) => <div key={i} style={{ height: lg ? 3 : 2, background: c }} />)}
        </div>
        <div className="flex-1 flex items-center justify-center relative">
          <span className={`${lg ? 'text-[10px]' : 'text-[7px]'} font-bold`} style={{ color: '#7c3aed' }}>진료일정</span>
          <div className="absolute pointer-events-none" style={{ top: lg ? 4 : 2, right: lg ? 8 : 5, color: '#c4b5fd', fontSize: lg ? 8 : 5, opacity: 0.4 }}>☁</div>
          <div className="absolute pointer-events-none" style={{ bottom: lg ? 6 : 3, left: lg ? 8 : 5, color: '#fbbf24', fontSize: lg ? 7 : 4, opacity: 0.35 }}>★</div>
        </div>
      </C>
    );
  }

  /* ═══ 12. 베이지 골드 ═══ */
  if (themeValue === 'sch_beige_gold') {
    const bh = lg ? 8 : 5;
    return (
      <C pal={['#a3836a', '#78583d', '#faf7f4']} bg="#faf7f4">
        <div style={{ height: bh, background: 'linear-gradient(90deg, #c9a96e, #e8d5a8, #c9a96e)', flexShrink: 0 }} />
        <div className="flex-1 flex flex-col items-center justify-center">
          <span className={`${lg ? 'text-[11px]' : 'text-[7px]'} font-bold font-serif`} style={{ color: '#78583d' }}>진료일정</span>
          <div className="w-3/5 mt-1" style={{ borderTop: '1px solid #c9a96e' }} />
        </div>
        <div style={{ height: bh, background: 'linear-gradient(90deg, #c9a96e, #e8d5a8, #c9a96e)', flexShrink: 0 }} />
      </C>
    );
  }

  /* ═══ fallback ═══ */
  return (
    <div className={`w-full h-full flex items-center justify-center ${rd}`} style={{ background: groupColor || '#64748b' }}>
      <span className={`${lg ? 'text-[11px]' : 'text-[6px]'} font-bold text-white`}>미리보기</span>
    </div>
  );
}
