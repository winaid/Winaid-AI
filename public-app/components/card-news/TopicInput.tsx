/**
 * components/card-news/TopicInput.tsx — C2b Step 1: 주제 입력.
 *
 * 입력: topic (textarea, 5~100자) + slideCount (3/5/7/10 select).
 * "다음 (구성 안 생성)" 버튼 → onSubmit(topic, slideCount).
 *
 * UI 톤: 다른 dashboard 페이지(blog/image) 슬레이트 + 인디고 accent 일관.
 */

'use client';

import { useState } from 'react';
import { ALLOWED_SLIDE_COUNTS, type AllowedSlideCount } from '../../lib/cardNewsPrompt';

interface TopicInputProps {
  initialTopic?: string;
  initialSlideCount?: AllowedSlideCount;
  isLoading?: boolean;
  error?: string | null;
  onSubmit: (topic: string, slideCount: AllowedSlideCount) => void;
}

export default function TopicInput({
  initialTopic = '',
  initialSlideCount = 5,
  isLoading,
  error,
  onSubmit,
}: TopicInputProps) {
  const [topic, setTopic] = useState(initialTopic);
  const [slideCount, setSlideCount] = useState<AllowedSlideCount>(initialSlideCount);
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

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={!isValid || isLoading}
          onClick={() => onSubmit(trimmed, slideCount)}
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
