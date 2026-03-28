/**
 * CalendarPreviews.tsx — 달력 테마 프리뷰 컴포넌트 (전면 재작성)
 *
 * 12개 달력 테마 미리보기. 앞 7개 완성, 뒤 5개 placeholder.
 * 3월 샘플 데이터: 1일=토요일, 9·23일 휴진, 16일 단축
 */
import React from 'react';

/* ── 공통 데이터 ── */
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 3월 달력: 1일=토요일 → null 6개 + 1~31 = 35칸
const MARCH: (number | null)[] = [
  null, null, null, null, null, null, 1,
  2, 3, 4, 5, 6, 7, 8,
  9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22,
  23, 24, 25, 26, 27, 28, 29,
  30, 31, null, null, null, null, null,
];

const CLOSED = new Set([9, 23]);
const SHORTENED = new Set([16]);

/* ── placeholder 테마 색상 매핑 ── */
const PLACEHOLDER_THEMES: Record<string, { bg: string; name: string }> = {
  sch_korean_classic: { bg: '#92400e', name: '한방 전통' },
  sch_deep_frost: { bg: '#0f2444', name: '딥블루 프로스트' },
  sch_gold_classic: { bg: '#854d0e', name: '골드 클래식' },
  sch_premium_green: { bg: '#2d6a4f', name: '프리미엄 그린' },
  sch_navy_modern: { bg: '#1e3a5f', name: '네이비 모던' },
};

/* ── 메인 컴포넌트 ── */
export function CalendarThemePreview({
  themeValue,
  size = 'sm',
}: {
  themeValue: string;
  groupColor?: string;
  size?: 'sm' | 'lg';
}) {
  const lg = size === 'lg';

  // 사이즈별 공통 텍스트/간격
  const fs = lg ? 'text-[8px]' : 'text-[4px]';
  const fsNum = lg ? 'text-[9px]' : 'text-[4.5px]';
  const fsTiny = lg ? 'text-[6px]' : 'text-[3px]';
  const fsTitle = lg ? 'text-[13px]' : 'text-[6px]';
  const gap = lg ? 'gap-[2px]' : 'gap-[1px]';
  const pad = lg ? 'p-[3px]' : 'p-[1.5px]';
  const hdrPad = lg ? 'px-[8px] py-[4px]' : 'px-[4px] py-[2px]';

  /* ═══════════════════════════════════════════
     1. sch_spreadsheet — 실무 스프레드시트
     시그니처: 다크 슬레이트 헤더 + zebra stripe
     ═══════════════════════════════════════════ */
  if (themeValue === 'sch_spreadsheet') {
    return (
      <div className="w-full h-full flex flex-col overflow-hidden" style={{ background: '#fff' }}>
        {/* 다크 헤더 바 */}
        <div
          style={{ background: '#1e293b', padding: lg ? '5px 8px' : '2.5px 4px' }}
        >
          <div className={`${fsTitle} font-black text-white leading-tight`}>
            3월 진료일정
          </div>
          <div className={`${fsTiny} text-slate-400 leading-tight`}>OO치과</div>
        </div>

        {/* 요일 행 */}
        <div
          className={`grid grid-cols-7`}
          style={{ background: '#e2e8f0', padding: lg ? '0 3px' : '0 1.5px' }}
        >
          {DAYS.map((d, i) => (
            <div
              key={d}
              className={`${fsTiny} font-bold text-center`}
              style={{
                color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#475569',
                padding: lg ? '2px 0' : '1px 0',
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 바디 — zebra stripe */}
        <div
          className={`grid grid-cols-7 ${gap} flex-1`}
          style={{ padding: lg ? '2px 3px' : '1px 1.5px' }}
        >
          {MARCH.map((day, i) => {
            if (day === null) return <div key={i} />;
            const closed = CLOSED.has(day);
            const short = SHORTENED.has(day);
            const row = Math.floor(i / 7);
            const zebraBg = row % 2 === 0 ? '#ffffff' : '#f8fafc';
            return (
              <div
                key={i}
                className={`${fsNum} text-center font-medium relative flex items-center justify-center`}
                style={{
                  background: closed
                    ? '#e2e8f0'
                    : short
                      ? '#fef9c3'
                      : zebraBg,
                  padding: lg ? '2px 0' : '1px 0',
                  borderBottom: '0.5px solid #e2e8f0',
                }}
              >
                <span
                  style={{
                    textDecoration: closed ? 'line-through' : 'none',
                    color: closed ? '#94a3b8' : '#334155',
                  }}
                >
                  {day}
                </span>
                {closed && (
                  <span
                    className={`${fsTiny} font-bold`}
                    style={{ color: '#ef4444', marginLeft: 1 }}
                  >
                    휴
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* 다크 풋터 — 범례 */}
        <div
          style={{
            background: '#1e293b',
            padding: lg ? '3px 8px' : '1.5px 4px',
          }}
        >
          <div className={`${fsTiny} text-slate-400 flex`} style={{ gap: lg ? 8 : 4 }}>
            <span>
              <span style={{ color: '#94a3b8' }}>■</span> 휴진
            </span>
            <span>
              <span style={{ color: '#fde047' }}>■</span> 단축
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     2. sch_charcoal_frame — 차콜 프레임
     시그니처: 두꺼운 차콜 프레임 + 흰 내부 + 빨간 휴진셀
     ═══════════════════════════════════════════ */
  if (themeValue === 'sch_charcoal_frame') {
    const framePx = lg ? 10 : 6;
    return (
      <div
        className="w-full h-full flex flex-col overflow-hidden"
        style={{ background: '#292524', padding: framePx }}
      >
        {/* 프레임 상단 타이틀 */}
        <div
          className={`${fsTitle} font-black text-white text-center`}
          style={{ paddingBottom: lg ? 4 : 2 }}
        >
          3월 진료일정
        </div>

        {/* 흰 내부 영역 */}
        <div
          className="flex-1 flex flex-col overflow-hidden"
          style={{
            background: '#ffffff',
            borderRadius: lg ? 4 : 2,
          }}
        >
          {/* 요일 행 */}
          <div
            className="grid grid-cols-7"
            style={{
              borderBottom: `1px solid #a8a29e`,
              padding: lg ? '2px 2px 1px' : '1px 1px 0.5px',
            }}
          >
            {DAYS.map((d, i) => (
              <div
                key={d}
                className={`${fsTiny} font-bold text-center`}
                style={{
                  color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#57534e',
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className={`grid grid-cols-7 flex-1`} style={{ padding: lg ? 2 : 1 }}>
            {MARCH.map((day, i) => {
              if (day === null) return <div key={i} />;
              const closed = CLOSED.has(day);
              const short = SHORTENED.has(day);
              return (
                <div
                  key={i}
                  className={`${fsNum} text-center font-medium flex items-center justify-center`}
                  style={{
                    background: closed ? '#ef4444' : short ? '#fef3c7' : '#fff',
                    color: closed ? '#ffffff' : '#292524',
                    border: `0.5px solid #a8a29e`,
                    fontWeight: closed ? 700 : 500,
                  }}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     3. sch_modern_note — 모던 미니멀
     시그니처: 거대한 "3" + 이중선 + 점 마커
     ═══════════════════════════════════════════ */
  if (themeValue === 'sch_modern_note') {
    return (
      <div
        className="w-full h-full flex flex-col overflow-hidden bg-white"
        style={{ padding: lg ? 10 : 5 }}
      >
        {/* 거대한 "3" */}
        <div
          className="leading-none font-black"
          style={{
            fontSize: lg ? 48 : 28,
            color: '#111827',
            letterSpacing: '-0.03em',
          }}
        >
          3
        </div>

        {/* 이중선 */}
        <div style={{ marginTop: lg ? 3 : 2 }}>
          <div style={{ height: 2, background: '#111827' }} />
          <div style={{ height: lg ? 2 : 1.5 }} />
          <div style={{ height: 1, background: '#e5e7eb' }} />
        </div>

        {/* 요일 행 */}
        <div
          className="grid grid-cols-7"
          style={{ marginTop: lg ? 6 : 3, marginBottom: lg ? 2 : 1 }}
        >
          {DAYS.map((d, i) => (
            <div
              key={d}
              className={`${fsTiny} font-medium text-center`}
              style={{
                color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#9ca3af',
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 — 선 없이, 도트 마커 */}
        <div className={`grid grid-cols-7 ${gap} flex-1`}>
          {MARCH.map((day, i) => {
            if (day === null) return <div key={i} />;
            const closed = CLOSED.has(day);
            const short = SHORTENED.has(day);
            return (
              <div
                key={i}
                className={`${fsNum} text-center relative flex flex-col items-center justify-center`}
                style={{ color: closed ? '#d1d5db' : '#374151' }}
              >
                <span>{day}</span>
                {closed && (
                  <div
                    style={{
                      width: lg ? 4 : 2,
                      height: lg ? 4 : 2,
                      background: '#ef4444',
                      borderRadius: '50%',
                      marginTop: lg ? 1 : 0.5,
                    }}
                  />
                )}
                {short && (
                  <div
                    style={{
                      width: '60%',
                      height: lg ? 1.5 : 0.75,
                      background: '#f59e0b',
                      borderRadius: 1,
                      marginTop: lg ? 1 : 0.5,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     4. sch_night_clinic — 야간진료
     시그니처: 다크 배경 + 앰버 스트라이프 + 화목 하이라이트
     ═══════════════════════════════════════════ */
  if (themeValue === 'sch_night_clinic') {
    const bandH = lg ? 22 : 14;
    return (
      <div
        className="w-full h-full flex flex-col overflow-hidden"
        style={{ background: '#1c1917' }}
      >
        {/* 앰버 밴드 */}
        <div
          className="flex items-center justify-center"
          style={{
            background: '#d97706',
            height: bandH,
            flexShrink: 0,
          }}
        >
          <span
            className={`${lg ? 'text-[10px]' : 'text-[5px]'} font-black text-white tracking-wide`}
          >
            야간진료 화·목
          </span>
        </div>

        {/* 요일 행 */}
        <div
          className="grid grid-cols-7"
          style={{ padding: lg ? '4px 3px 0' : '2px 1.5px 0' }}
        >
          {DAYS.map((d, i) => (
            <div
              key={d}
              className={`${fsTiny} font-bold text-center`}
              style={{
                color: i === 0 ? '#fca5a5' : '#d97706',
                paddingBottom: lg ? 2 : 1,
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div className={`grid grid-cols-7 ${gap} flex-1 ${pad}`}>
          {MARCH.map((day, i) => {
            if (day === null) return <div key={i} />;
            const closed = CLOSED.has(day);
            const col = i % 7;
            // 화=2, 목=4 하이라이트
            const isTuThu = col === 2 || col === 4;
            return (
              <div
                key={i}
                className={`${fsNum} text-center font-medium flex items-center justify-center`}
                style={{
                  background: closed
                    ? '#ef4444'
                    : isTuThu
                      ? 'rgba(217,119,6,0.15)'
                      : 'transparent',
                  color: closed ? '#fff' : '#e5e7eb',
                  borderRadius: closed ? 99 : lg ? 3 : 1.5,
                }}
              >
                {day}
              </div>
            );
          })}
        </div>

        {/* 하단 앰버 라인 */}
        <div
          style={{
            height: lg ? 3 : 1.5,
            background: 'linear-gradient(90deg, transparent, #d97706, transparent)',
            flexShrink: 0,
          }}
        />
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     5. sch_blushy_rose — 블러시 로즈
     시그니처: 파스텔 핑크 + 코랄 그라데이션 + 원형 셀
     ═══════════════════════════════════════════ */
  if (themeValue === 'sch_blushy_rose') {
    return (
      <div
        className="w-full h-full flex flex-col overflow-hidden"
        style={{ background: '#fff1f2' }}
      >
        {/* 코랄→로즈 그라데이션 헤더 */}
        <div
          style={{
            background: 'linear-gradient(135deg, #fb7185, #e11d48)',
            padding: lg ? '6px 8px' : '3px 4px',
          }}
        >
          <div className={`${fsTitle} font-black text-white leading-tight`}>
            3월 진료일정
          </div>
          <div className={`${fsTiny} leading-tight`} style={{ color: '#fecdd3' }}>
            OO치과
          </div>
        </div>

        {/* 요일 행 */}
        <div
          className="grid grid-cols-7"
          style={{ padding: lg ? '3px 3px 0' : '1.5px 1.5px 0' }}
        >
          {DAYS.map((d, i) => (
            <div
              key={d}
              className={`${fsTiny} font-bold text-center`}
              style={{
                color: i === 0 ? '#e11d48' : i === 6 ? '#f472b6' : '#9f1239',
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 원형 셀 그리드 */}
        <div
          className={`grid grid-cols-7 flex-1`}
          style={{
            padding: lg ? '2px 3px' : '1px 1.5px',
            gap: lg ? 2 : 1,
            alignContent: 'start',
          }}
        >
          {MARCH.map((day, i) => {
            if (day === null) return <div key={i} />;
            const closed = CLOSED.has(day);
            const short = SHORTENED.has(day);
            return (
              <div
                key={i}
                className={`${fsNum} font-medium flex items-center justify-center`}
                style={{
                  background: closed
                    ? '#fda4af'
                    : short
                      ? '#fef3c7'
                      : 'rgba(255,255,255,0.7)',
                  color: closed ? '#9f1239' : '#881337',
                  borderRadius: '50%',
                  aspectRatio: '1',
                  fontWeight: closed ? 700 : 500,
                }}
              >
                {day}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     6. sch_sns_bold — SNS 볼드
     시그니처: 좌측 코랄 세로 바 + 볼드 + 뱃지형 셀
     ═══════════════════════════════════════════ */
  if (themeValue === 'sch_sns_bold') {
    const barW = lg ? 8 : 5;
    return (
      <div
        className="w-full h-full flex flex-row overflow-hidden"
        style={{ background: '#fff' }}
      >
        {/* 좌측 코랄 세로 바 */}
        <div
          style={{
            width: barW,
            background: 'linear-gradient(180deg, #f97316, #ea580c)',
            flexShrink: 0,
          }}
        />

        {/* 우측 콘텐츠 */}
        <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
          {/* 타이틀 */}
          <div style={{ padding: lg ? '5px 8px 2px' : '2.5px 4px 1px' }}>
            <div
              className={`${fsTitle} font-black leading-tight`}
              style={{ color: '#1f2937' }}
            >
              3월 진료일정
            </div>
            <div className={`${fsTiny}`} style={{ color: '#f97316' }}>
              OO치과
            </div>
          </div>

          {/* 요일 행 */}
          <div
            className="grid grid-cols-7"
            style={{
              padding: lg ? '0 4px' : '0 2px',
              borderBottom: lg ? '1.5px solid #f97316' : '1px solid #f97316',
            }}
          >
            {DAYS.map((d, i) => (
              <div
                key={d}
                className={`${fsTiny} font-bold text-center`}
                style={{
                  color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#374151',
                  paddingBottom: lg ? 2 : 1,
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 뱃지형 셀 */}
          <div
            className={`grid grid-cols-7 ${gap} flex-1`}
            style={{ padding: lg ? '3px 4px' : '1.5px 2px' }}
          >
            {MARCH.map((day, i) => {
              if (day === null) return <div key={i} />;
              const closed = CLOSED.has(day);
              const short = SHORTENED.has(day);
              return (
                <div
                  key={i}
                  className={`${fsNum} text-center font-bold flex items-center justify-center`}
                  style={{
                    color: closed ? '#fff' : short ? '#ea580c' : '#374151',
                    background: closed ? '#f97316' : 'transparent',
                    border: short
                      ? '1px solid #fdba74'
                      : closed
                        ? 'none'
                        : 'none',
                    borderRadius: closed ? 99 : short ? 99 : 4,
                  }}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     7. sch_lavender_soft — 라벤더 소프트
     시그니처: 라벤더 그라데이션 + 별(✦) 장식 + pill 셀
     ═══════════════════════════════════════════ */
  if (themeValue === 'sch_lavender_soft') {
    return (
      <div
        className="w-full h-full flex flex-col overflow-hidden relative"
        style={{
          background: 'linear-gradient(180deg, #f3eff8, #fefcff)',
        }}
      >
        {/* ✦ 장식 — absolute */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: lg ? 8 : 4,
            right: lg ? 10 : 5,
            color: '#c4b5fd',
            fontSize: lg ? 12 : 6,
            opacity: 0.45,
          }}
        >
          ✦
        </div>
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: lg ? 18 : 9,
            left: lg ? 6 : 3,
            color: '#ddd6fe',
            fontSize: lg ? 8 : 4,
            opacity: 0.35,
          }}
        >
          ✦
        </div>
        <div
          className="absolute pointer-events-none"
          style={{
            top: lg ? 28 : 14,
            left: lg ? 30 : 15,
            color: '#c4b5fd',
            fontSize: lg ? 6 : 3,
            opacity: 0.3,
          }}
        >
          ✦
        </div>

        {/* 라벤더 헤더 밴드 */}
        <div
          style={{
            background: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
            padding: lg ? '5px 8px' : '2.5px 4px',
          }}
        >
          <div className={`${fsTitle} font-black text-white leading-tight`}>
            3월 진료일정
          </div>
          <div className={`${fsTiny} leading-tight`} style={{ color: '#ddd6fe' }}>
            OO치과
          </div>
        </div>

        {/* 요일 행 */}
        <div
          className="grid grid-cols-7"
          style={{ padding: lg ? '3px 3px 0' : '1.5px 1.5px 0' }}
        >
          {DAYS.map((d, i) => (
            <div
              key={d}
              className={`${fsTiny} font-bold text-center`}
              style={{
                color: i === 0 ? '#c084fc' : i === 6 ? '#a78bfa' : '#7c3aed',
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* pill 셀 */}
        <div
          className={`grid grid-cols-7 flex-1`}
          style={{
            padding: lg ? '2px 3px' : '1px 1.5px',
            gap: lg ? 2 : 1,
          }}
        >
          {MARCH.map((day, i) => {
            if (day === null) return <div key={i} />;
            const closed = CLOSED.has(day);
            const short = SHORTENED.has(day);
            return (
              <div
                key={i}
                className={`${fsNum} text-center font-medium flex items-center justify-center`}
                style={{
                  background: closed
                    ? '#7c3aed'
                    : short
                      ? '#ede9fe'
                      : 'rgba(255,255,255,0.55)',
                  color: closed ? '#ffffff' : short ? '#6d28d9' : '#5b21b6',
                  borderRadius: 99,
                  fontWeight: closed ? 700 : 500,
                }}
              >
                {day}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     나머지 5개 — placeholder
     ═══════════════════════════════════════════ */
  const placeholder = PLACEHOLDER_THEMES[themeValue];
  if (placeholder) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center"
        style={{ background: placeholder.bg }}
      >
        <div
          className={`${lg ? 'text-[14px]' : 'text-[7px]'} font-black text-white text-center leading-tight`}
        >
          {placeholder.name}
        </div>
        <div
          className={`${lg ? 'text-[9px]' : 'text-[4.5px]'} text-center mt-[2px]`}
          style={{ color: 'rgba(255,255,255,0.6)' }}
        >
          프리뷰 준비 중
        </div>
      </div>
    );
  }

  /* ── Fallback ── */
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-50">
      <span className="text-[10px] text-slate-400">미리보기 없음</span>
    </div>
  );
}
