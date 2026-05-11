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

// ── C2-fix-1b: theme 별 미니 cover-slide 미리보기 spec ─────────────────────
// 사용자가 "이 theme 선택 시 어떤 카드뉴스가 나올지" 한눈에 인지하도록
// palette 색상 + sample 텍스트 + 액센트 도형 으로 stylized mini cover 렌더.
// 이미지 자산 0, 코드만으로 구성. cover layout 의 축소판 (SlidePreview.CoverLayout
// 미러).

interface ThemeSample {
  title: string;
  subtitle: string;
  textColor: string;        // sample text 색상 — palette gradient 대비 보장
  accentShape: 'blob' | 'bar' | 'curve' | 'triangle';
  accentColor: string;      // 액센트 도형 색상 (palette 중 contrast 좋은 1개)
}

const THEME_SAMPLES: Record<ThemeId, ThemeSample> = {
  // pastel pink → cream gradient. 어두운 텍스트가 가독성.
  friendly_illust: {
    title: '임플란트 후 주의사항',
    subtitle: '5분 안에 알아보는 핵심',
    textColor: '#1F2937',                   // slate-800
    accentShape: 'blob',
    accentColor: '#C8E6C9',                 // palette[2] sage
  },
  // deep blue → slate gradient. 흰 텍스트 가독성.
  professional_medical: {
    title: '치과 정밀 진단 시스템',
    subtitle: '환자 맞춤 진료 안내',
    textColor: '#FFFFFF',
    accentShape: 'bar',
    accentColor: '#E2E8F0',                 // palette[2] light gray
  },
  // beige → coral gradient. 어두운 텍스트.
  warm_care: {
    title: '임산부 영양제 가이드',
    subtitle: '엄마와 아기 모두를 위한',
    textColor: '#3F2C1F',                   // 따뜻한 dark brown
    accentShape: 'curve',
    accentColor: '#B5C99A',                 // palette[2] sage
  },
  // navy → coral gradient. 흰 텍스트.
  modern_minimal: {
    title: '치아 미백 비용 비교',
    subtitle: '한눈에 보는 5가지 옵션',
    textColor: '#FFFFFF',
    accentShape: 'triangle',
    accentColor: '#FFFFFF',                 // palette[2] white
  },
};

/** preset 카드 안에 들어가는 미니 cover-slide 미리보기. */
function ThemePreviewMini({ theme }: { theme: ThemePreset }) {
  const sample = THEME_SAMPLES[theme.id];
  // SlidePreview.CoverLayout 와 동일 그라데이션 방향 (135deg, palette[0]→[1]).
  const gradientStyle = {
    background: `linear-gradient(135deg, ${theme.palette[0]}, ${theme.palette[1]})`,
  };
  return (
    <div
      className="w-full aspect-[16/10] rounded-lg overflow-hidden relative flex flex-col justify-center items-center px-3"
      style={gradientStyle}
      aria-hidden="true"
    >
      {/* 액센트 도형 — theme 정체성 표시. text 아래 z-index. */}
      <AccentShape shape={sample.accentShape} color={sample.accentColor} />

      {/* sample 텍스트 (cover 의 title + subtitle 미러) */}
      <div className="relative z-10 text-center px-1">
        <p
          className="text-[10px] font-bold leading-tight tracking-tight"
          style={{ color: sample.textColor }}
        >
          {sample.title}
        </p>
        <p
          className="text-[8px] mt-0.5 leading-tight opacity-90"
          style={{ color: sample.textColor }}
        >
          {sample.subtitle}
        </p>
      </div>
    </div>
  );
}

/** theme 별 액센트 도형 — SVG 또는 CSS shape. position absolute 로 우상단 corner. */
function AccentShape({ shape, color }: { shape: ThemeSample['accentShape']; color: string }) {
  switch (shape) {
    case 'blob':
      // 둥근 큰 원 (top-right corner 부드럽게 잘림) — friendly_illust 의 따뜻함.
      return (
        <span
          className="absolute -top-3 -right-3 w-10 h-10 rounded-full opacity-50"
          style={{ backgroundColor: color }}
        />
      );
    case 'bar':
      // 좌측 vertical bar — professional_medical 의 격식.
      return (
        <span
          className="absolute left-0 top-0 bottom-0 w-1"
          style={{ backgroundColor: color }}
        />
      );
    case 'curve':
      // 부드러운 큰 곡선 (왼쪽 아래 corner, 둥글게) — warm_care 의 다정함.
      return (
        <span
          className="absolute -bottom-4 -left-4 w-12 h-12 rounded-full opacity-40"
          style={{ backgroundColor: color }}
        />
      );
    case 'triangle':
      // sharp 삼각형 (top-right) — modern_minimal 의 정확함.
      return (
        <span
          className="absolute top-0 right-0 w-0 h-0"
          style={{
            borderTop: `12px solid ${color}`,
            borderLeft: '12px solid transparent',
            opacity: 0.7,
          }}
        />
      );
  }
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
