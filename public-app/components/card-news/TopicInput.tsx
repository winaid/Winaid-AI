/**
 * components/card-news/TopicInput.tsx — C2b Step 1: 주제 입력.
 *
 * 입력:
 *   - topic (textarea, 5~100자)
 *   - slideCount (3/5/7/10 select)
 *   - theme preset (4 카드, default 'friendly_illust') — C2-fix-1
 *
 * "다음 (구성 안 생성)" 버튼 → onSubmit(topic, slideCount, theme).
 *
 * UI 톤: 다른 dashboard 페이지(blog/image) 슬레이트 + 인디고 accent 일관.
 * preset 카드: theme 미니 cover-slide 미리보기 (C2-fix-1b) + label + 1줄 설명.
 */

'use client';

import { useState } from 'react';
import {
  ALLOWED_SLIDE_COUNTS,
  THEME_PRESETS,
  DEFAULT_THEME,
  type AllowedSlideCount,
  type ThemeId,
  type ThemePreset,
} from '../../lib/cardNewsPrompt';

interface TopicInputProps {
  initialTopic?: string;
  initialSlideCount?: AllowedSlideCount;
  initialTheme?: ThemeId;
  isLoading?: boolean;
  error?: string | null;
  onSubmit: (topic: string, slideCount: AllowedSlideCount, theme: ThemeId) => void;
}

// ── C2-fix-1d: theme 별 미니 카드뉴스 템플릿 미리보기 spec ──────────────────
// C2-fix-1b 의 단순 gradient + 작은 텍스트 + 액센트 도형 → 진짜 카드뉴스 템플릿
// mockup 으로 재설계.
//
// 구조 (모든 theme 공통):
//   - 단색 단단한 배경 (theme 정체성 색상)
//   - SVG pattern overlay (subtle, theme 별 다름: dots/triangles/leaves/diagonals)
//   - 상단 ~88%: bold title + divider line + subtitle + info card placeholder 2개
//   - 하단 ~12%: footer logo strip (실제 사용 시 로고가 들어갈 자리 시각화)
//
// 더착한치과의원 류 hospital card-news 톤을 4가지 theme 색·패턴 으로 분기.

interface ThemeSample {
  title: string;
  subtitle: string;
  /** 단색 배경 hex. gradient 폐기 (C2-fix-1d 패러다임 전환). */
  bg: string;
  titleColor: string;
  subtitleColor: string;
  /** title 아래 짧은 divider bar 색. */
  dividerColor: string;
  /** SVG pattern 종류 — theme 정체성 시그널. */
  pattern: 'dots' | 'triangles' | 'leaves' | 'diagonals';
  patternColor: string;
  patternOpacity: number;
  /** 본문 하단의 info card placeholder 박스 spec. */
  iconBox: {
    bg: string;             // 'transparent' 또는 hex
    borderColor: string;
    glyph: string;          // 안에 들어갈 sample (emoji 또는 단순 ●/+ 등)
    glyphColor: string;
    rounded: 'full' | 'lg' | 'sm' | 'none';
  };
  /** 하단 logo strip spec. */
  footer: {
    bg: string;
    text: string;
    textColor: string;
  };
}

const THEME_SAMPLES: Record<ThemeId, ThemeSample> = {
  // pastel pink 단색 + cream dots overlay + soft footer.
  friendly_illust: {
    title: '임플란트 후 주의사항',
    subtitle: '5분 안에 알아보는 핵심',
    bg: '#FFD6E1',
    titleColor: '#1F2937',
    subtitleColor: '#374151',
    dividerColor: '#C8E6C9',
    pattern: 'dots',
    patternColor: '#FFE8C9',
    patternOpacity: 0.55,
    iconBox: {
      bg: '#FFFFFF',
      borderColor: '#FFE8C9',
      glyph: '💡',
      glyphColor: '#1F2937',
      rounded: 'full',
    },
    footer: {
      bg: '#FFE8C9',
      text: '─ LOGO ─',
      textColor: '#1F2937',
    },
  },
  // deep navy 단색 + white triangles overlay + darker navy footer.
  professional_medical: {
    title: '치과 정밀 진단 시스템',
    subtitle: '환자 맞춤 진료 안내',
    bg: '#2C5282',
    titleColor: '#FFFFFF',
    subtitleColor: '#CBD5E0',
    dividerColor: '#E2E8F0',
    pattern: 'triangles',
    patternColor: '#FFFFFF',
    patternOpacity: 0.1,
    iconBox: {
      bg: 'transparent',
      borderColor: '#FFFFFF',
      glyph: '+',
      glyphColor: '#FFFFFF',
      rounded: 'sm',
    },
    footer: {
      bg: '#1A365D',
      text: '─ LOGO ─',
      textColor: '#FFFFFF',
    },
  },
  // warm beige 단색 + sage leaves overlay + lighter beige footer.
  warm_care: {
    title: '임산부 영양제 가이드',
    subtitle: '엄마와 아기 모두를 위한',
    bg: '#F4E4D6',
    titleColor: '#3F2C1F',
    subtitleColor: '#5C4533',
    dividerColor: '#FFB4A2',
    pattern: 'leaves',
    patternColor: '#B5C99A',
    patternOpacity: 0.3,
    iconBox: {
      bg: '#FFFFFF',
      borderColor: '#FFB4A2',
      glyph: '●',
      glyphColor: '#FFB4A2',
      rounded: 'lg',
    },
    footer: {
      bg: '#EDD9C7',
      text: '─ LOGO ─',
      textColor: '#3F2C1F',
    },
  },
  // monotone navy 단색 + sharp diagonals overlay + darker footer + coral dot.
  modern_minimal: {
    title: '치아 미백 비용 비교',
    subtitle: '한눈에 보는 5가지 옵션',
    bg: '#1A1A2E',
    titleColor: '#FFFFFF',
    subtitleColor: '#B0B0C0',
    dividerColor: '#E94560',
    pattern: 'diagonals',
    patternColor: '#FFFFFF',
    patternOpacity: 0.08,
    iconBox: {
      bg: 'transparent',
      borderColor: '#FFFFFF',
      glyph: '●',
      glyphColor: '#E94560',
      rounded: 'none',
    },
    footer: {
      bg: '#0F0F1F',
      text: '─ LOGO ─',
      textColor: '#FFFFFF',
    },
  },
};

/**
 * SVG pattern overlay — theme 정체성 시그널.
 * theme.id 를 pattern <defs> id 에 suffix 로 박아 multi-instance unique 보장
 * (4 preset 카드가 동시 렌더되면 SVG ID 충돌 방지).
 */
function PatternOverlay({
  kind,
  color,
  opacity,
  themeId,
}: {
  kind: ThemeSample['pattern'];
  color: string;
  opacity: number;
  themeId: string;
}) {
  const patternId = `pat-${kind}-${themeId}`;
  const def = (() => {
    switch (kind) {
      case 'dots':
        return (
          <pattern id={patternId} width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="6" cy="6" r="1.3" fill={color} />
          </pattern>
        );
      case 'triangles':
        return (
          <pattern id={patternId} width="22" height="22" patternUnits="userSpaceOnUse">
            <polygon points="11,4 18,16 4,16" fill="none" stroke={color} strokeWidth="0.6" />
          </pattern>
        );
      case 'leaves':
        return (
          <pattern id={patternId} width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 12 6 Q 18 12, 12 18 Q 6 12, 12 6 Z" fill={color} />
          </pattern>
        );
      case 'diagonals':
        return (
          <pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse">
            <line x1="0" y1="8" x2="8" y2="0" stroke={color} strokeWidth="0.7" />
          </pattern>
        );
    }
  })();
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity }}
      aria-hidden="true"
    >
      <defs>{def}</defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

/** 본문 하단 info card placeholder 박스 — theme 별 디자인. 2개 row. */
function InfoBoxRow({ spec }: { spec: ThemeSample['iconBox'] }) {
  const roundedCls =
    spec.rounded === 'full'
      ? 'rounded-full'
      : spec.rounded === 'lg'
        ? 'rounded-md'
        : spec.rounded === 'sm'
          ? 'rounded-sm'
          : 'rounded-none';
  return (
    <div className="flex gap-1.5">
      {[0, 1].map((i) => (
        <div
          key={i}
          className={`w-6 h-6 flex items-center justify-center text-[10px] font-bold ${roundedCls}`}
          style={{
            backgroundColor: spec.bg,
            border: `1px solid ${spec.borderColor}`,
            color: spec.glyphColor,
          }}
        >
          {spec.glyph}
        </div>
      ))}
    </div>
  );
}

/** preset 카드 안에 들어가는 미니 카드뉴스 템플릿 미리보기. */
function ThemePreviewMini({ theme }: { theme: ThemePreset }) {
  const s = THEME_SAMPLES[theme.id];
  return (
    <div
      className="w-full aspect-[16/10] rounded-lg overflow-hidden relative"
      style={{ backgroundColor: s.bg }}
      aria-hidden="true"
    >
      {/* SVG pattern overlay */}
      <PatternOverlay
        kind={s.pattern}
        color={s.patternColor}
        opacity={s.patternOpacity}
        themeId={theme.id}
      />

      {/* 본문 영역 (상단 ~88%) — title + divider + subtitle + info boxes */}
      <div className="relative h-[88%] flex flex-col px-2.5 pt-2 pb-1.5">
        <p
          className="text-[12px] font-extrabold tracking-tight leading-tight"
          style={{ color: s.titleColor }}
        >
          {s.title}
        </p>
        <div
          className="mt-1 h-[1.5px] w-6 rounded-full"
          style={{ backgroundColor: s.dividerColor }}
        />
        <p
          className="text-[9px] font-medium mt-1 leading-tight"
          style={{ color: s.subtitleColor }}
        >
          {s.subtitle}
        </p>
        <div className="mt-auto">
          <InfoBoxRow spec={s.iconBox} />
        </div>
      </div>

      {/* footer logo strip (하단 ~12%) — 실제 사용 시 로고가 들어갈 자리 시각화 */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[12%] flex items-center justify-center"
        style={{ backgroundColor: s.footer.bg }}
      >
        <span
          className="text-[8px] font-semibold tracking-wider opacity-70"
          style={{ color: s.footer.textColor }}
        >
          {s.footer.text}
        </span>
      </div>
    </div>
  );
}

export default function TopicInput({
  initialTopic = '',
  initialSlideCount = 5,
  initialTheme = DEFAULT_THEME,
  isLoading,
  error,
  onSubmit,
}: TopicInputProps) {
  const [topic, setTopic] = useState(initialTopic);
  const [slideCount, setSlideCount] = useState<AllowedSlideCount>(initialSlideCount);
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>(initialTheme);
  const trimmed = topic.trim();
  const isValid = trimmed.length >= 5 && trimmed.length <= 100;

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 py-12">
      <header className="text-center space-y-2">
        <div className="text-4xl" aria-hidden="true">🎨</div>
        <h1 className="text-2xl font-bold text-slate-900">AI 카드뉴스 자동 생성</h1>
        <p className="text-sm text-slate-500">
          주제 한 줄을 입력하면 슬라이드 구성·텍스트·이미지가 단계별로 생성됩니다.
        </p>
      </header>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            주제 <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예) 임플란트 식립 후 주의사항"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 transition-all resize-none"
            rows={2}
            maxLength={120}
            disabled={isLoading}
          />
          <div className="flex justify-between mt-1.5 text-xs text-slate-400">
            <span>5~100자 권장</span>
            <span>{trimmed.length}자</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">슬라이드 수</label>
          <div className="grid grid-cols-4 gap-2">
            {ALLOWED_SLIDE_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSlideCount(n)}
                disabled={isLoading}
                className={[
                  'py-2.5 rounded-xl text-sm font-semibold border transition-all',
                  slideCount === n
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600',
                  isLoading ? 'opacity-50 cursor-not-allowed' : '',
                ].join(' ')}
              >
                {n}장
              </button>
            ))}
          </div>
        </div>

        {/* C2-fix-1: 디자인 테마 4 preset */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            디자인 테마
            <span className="ml-2 text-[11px] font-normal text-slate-400">
              · 텍스트 톤 + 이미지 색상이 한 세트로 일관
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {THEME_PRESETS.map((t) => {
              const isSelected = selectedTheme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTheme(t.id)}
                  disabled={isLoading}
                  className={[
                    'text-left rounded-xl p-2 border-2 transition-all space-y-2',
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/30 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-indigo-200',
                    isLoading ? 'opacity-50 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  {/* C2-fix-1b: 미니 cover-slide 미리보기 */}
                  <ThemePreviewMini theme={t} />
                  <div className="px-1 pb-0.5">
                    <span className={`block text-sm font-bold ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
                      {t.label}
                    </span>
                    <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{t.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={!isValid || isLoading}
          onClick={() => onSubmit(trimmed, slideCount, selectedTheme)}
          className={[
            'w-full py-3 rounded-xl text-sm font-bold transition-all',
            !isValid || isLoading
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700',
          ].join(' ')}
        >
          {isLoading ? '구성 안 생성 중...' : '다음 — 구성 안 생성'}
        </button>
      </div>
    </div>
  );
}
