/**
 * /card_news — C2b 본문 (placeholder 교체, 2026-05-08).
 *
 * 4-step state machine: topic → outline → text → image → done.
 * 각 step 컴포넌트는 components/card-news/ 에서 import.
 *
 * API 흐름 (C2a 백엔드와 정합):
 *   topic submit  → POST /api/card-news/generate-outline  → step='outline'
 *   outline OK    → POST /api/card-news/generate-text     → step='text'
 *   text OK       → POST /api/card-news/generate-images   → step='image'
 *   image OK      → step='done' (DownloadPanel)
 *
 * 정책 (C2a contract):
 *   - 게스트: outline + text 단계까지 OK. image 단계 진입 시 401 → 로그인 안내.
 *   - 인증: text 단계 1 크레딧, image 단계 slideCount 크레딧 (실패분 환불).
 *   - 의료광고법: applyContentFilters 자동 대체 (서버) + violations 표시 (UI).
 *   - 다운로드: cardDownloadUtils (PNG/JPG/ZIP/PDF) + html2canvas.
 *
 * v1 scope-out (BACKLOG): 학습 템플릿, referenceImage, 테마 선택 UI.
 */

'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SlideData } from '@winaid/blog-core';
import {
  DEFAULT_THEME,
  getTheme,
  type SlideOutline,
  type AllowedSlideCount,
  type ThemeId,
} from '../../../lib/cardNewsPrompt';
import type { SlideFieldViolation } from '../../../lib/medicalAdValidation';
import { authFetch } from '../../../lib/authFetch';
import { getSessionSafe } from '@winaid/blog-core';
import { useCreditContext } from '../layout';
import { consumeGuestCredit } from '../../../lib/guestCredits';
import { savePost } from '../../../lib/postStorage';
import TopicInput from '../../../components/card-news/TopicInput';
import OutlineReview from '../../../components/card-news/OutlineReview';
import SlideTextEditor from '../../../components/card-news/SlideTextEditor';
import ImageGenerationPanel from '../../../components/card-news/ImageGenerationPanel';
import DownloadPanel from '../../../components/card-news/DownloadPanel';

type Step = 'topic' | 'outline' | 'text' | 'image' | 'done';

export default function CardNewsPage() {
  const router = useRouter();
  const creditCtx = useCreditContext();

  // ── State ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('topic');
  const [topic, setTopic] = useState('');
  const [slideCount, setSlideCount] = useState<AllowedSlideCount>(5);
  // C2-fix-1: 디자인 테마 (텍스트 톤 + 이미지 스타일 + preview 배경 일관).
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [outline, setOutline] = useState<SlideOutline[]>([]);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [violations, setViolations] = useState<SlideFieldViolation[]>([]);
  const [replacedCount, setReplacedCount] = useState(0);
  const [failedSlides, setFailedSlides] = useState<number[]>([]);
  const [imageCreditsUsed, setImageCreditsUsed] = useState(0);
  const [imageCreditsRefunded, setImageCreditsRefunded] = useState(0);
  const [imageProgress, setImageProgress] = useState<{ done: number; total: number } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // hospitalName 은 v1 에서 사용자 프로필 자동 로드 (blog/page.tsx 패턴) — v1 단순화로 직접 입력 X.
  const [hospitalName, setHospitalName] = useState<string | undefined>(undefined);

  // ── Step 1 → 2: generate-outline ─────────────────────────────────────
  const handleTopicSubmit = useCallback(
    async (t: string, n: AllowedSlideCount, selectedTheme: ThemeId) => {
      setError(null);
      setIsLoading(true);
      setTopic(t);
      setSlideCount(n);
      setTheme(selectedTheme);

      // 병원명 프로필 자동 로드 (v1 단순화: 한 번만, fail-silent)
      try {
        const session = await getSessionSafe();
        if (session.userId) {
          const sessHospital = (session as { hospitalName?: string }).hospitalName;
          if (typeof sessHospital === 'string') setHospitalName(sessHospital);
        }
      } catch {
        /* ignore */
      }

      try {
        const res = await authFetch('/api/card-news/generate-outline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: t, slideCount: n }),
        });
        const data = (await res.json()) as { outline?: SlideOutline[]; error?: string; details?: string };
        if (!res.ok || !data.outline) {
          setError(data.details || data.error || `서버 오류 (${res.status})`);
          setIsLoading(false);
          return;
        }
        setOutline(data.outline);
        setStep('outline');
      } catch (e) {
        setError((e as Error).message || '네트워크 오류');
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // ── Step 2 → 3: generate-text ────────────────────────────────────────
  const handleOutlineSubmit = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await authFetch('/api/card-news/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, outline, hospitalName, theme }),
      });
      const data = (await res.json()) as {
        slides?: SlideData[];
        violations?: SlideFieldViolation[];
        creditsUsed?: number;
        replacedCount?: number;
        remaining?: number;
        error?: string;
        details?: string;
      };
      if (res.status === 402) {
        setError(`크레딧이 부족합니다. (남은 ${data.remaining ?? 0}건)`);
        setIsLoading(false);
        return;
      }
      if (!res.ok || !data.slides) {
        setError(data.details || data.error || `서버 오류 (${res.status})`);
        setIsLoading(false);
        return;
      }
      setSlides(data.slides);
      setViolations(data.violations || []);
      setReplacedCount(data.replacedCount || 0);
      // 인증 사용자 크레딧 표시 update (서버 차감 반영)
      if (creditCtx.creditInfo && creditCtx.userId && data.creditsUsed === 1) {
        creditCtx.setCreditInfo({
          credits: Math.max(0, (creditCtx.creditInfo.credits ?? 0) - 1),
          totalUsed: (creditCtx.creditInfo.totalUsed || 0) + 1,
        });
      } else if (creditCtx.creditInfo && !creditCtx.userId) {
        // 게스트는 클라이언트 카운터 차감
        const next = consumeGuestCredit();
        if (next) creditCtx.setCreditInfo({ credits: next.credits, totalUsed: next.totalUsed });
      }
      setStep('text');
    } catch (e) {
      setError((e as Error).message || '네트워크 오류');
    } finally {
      setIsLoading(false);
    }
  }, [topic, outline, hospitalName, theme, creditCtx]);

  // ── Step 3 → 4: generate-images ──────────────────────────────────────
  const handleTextSubmit = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    setImageProgress({ done: 0, total: slides.length });
    // 게스트 가드 (UI 측 사전 안내 — 서버도 401 반환하지만 명시적 메시지)
    if (!creditCtx.userId) {
      setError('이미지 생성은 로그인 후 가능합니다. 텍스트까지는 게스트로 진행 가능합니다.');
      setIsLoading(false);
      setImageProgress(null);
      return;
    }
    try {
      const res = await authFetch('/api/card-news/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides, imageStyle: 'illustration', theme }),
      });
      const data = (await res.json()) as {
        slides?: SlideData[];
        failedSlides?: number[];
        creditsUsed?: number;
        creditsRefunded?: number;
        netDeducted?: number;
        remaining?: number;
        required?: number;
        error?: string;
        details?: string;
      };
      if (res.status === 401) {
        setError('로그인이 필요합니다.');
        setIsLoading(false);
        setImageProgress(null);
        return;
      }
      if (res.status === 402) {
        setError(
          `크레딧이 부족합니다. ${data.required ?? slides.length}건 필요 (남은 ${data.remaining ?? 0}건)`,
        );
        setIsLoading(false);
        setImageProgress(null);
        return;
      }
      if (!res.ok || !data.slides) {
        setError(data.details || data.error || `서버 오류 (${res.status})`);
        setIsLoading(false);
        setImageProgress(null);
        return;
      }
      setSlides(data.slides);
      setFailedSlides(data.failedSlides || []);
      setImageCreditsUsed(data.creditsUsed || 0);
      setImageCreditsRefunded(data.creditsRefunded || 0);
      // 크레딧 표시 update (netDeducted 반영)
      if (creditCtx.creditInfo && data.netDeducted) {
        creditCtx.setCreditInfo({
          credits: Math.max(0, (creditCtx.creditInfo.credits ?? 0) - data.netDeducted),
          totalUsed: (creditCtx.creditInfo.totalUsed || 0) + data.netDeducted,
        });
      }
      setStep('image');
    } catch (e) {
      setError((e as Error).message || '네트워크 오류');
    } finally {
      setIsLoading(false);
      setImageProgress(null);
    }
  }, [slides, theme, creditCtx]);

  // ── Step 4 단일 슬라이드 재생성 ──────────────────────────────────────
  const handleRegenerateSlide = useCallback(
    async (slideIndex: number) => {
      const target = slides[slideIndex];
      if (!target) return;
      setError(null);
      try {
        // /api/image 직접 호출 (단일 슬라이드 재생성, 1 크레딧).
        // C2-fix-1: theme.imageStyleEn prefix 를 직접 prepend (서버 통하지 않고 client 합성).
        // 5장 batch 와 동일 패턴 — generate-images route 의 buildImagePromptWithTheme 와 등가.
        // C2-fix-1b §2: "Visual concept (no text in image)" 라벨 — 이미지 위 직접 텍스트 렌더 차단.
        const subject =
          target.visualKeyword?.trim() || target.title || `슬라이드 ${slideIndex + 1}`;
        const themePreset = getTheme(theme);
        const promptText = `${themePreset.imageStyleEn}. Visual concept (no text in image): ${subject}.`;
        const res = await authFetch('/api/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptText,
            mode: 'card_news',
            imageStyle: 'illustration',
            quality: 'fast',
          }),
        });
        const data = (await res.json()) as { imageDataUrl?: string; error?: string };
        if (!res.ok || !data.imageDataUrl) {
          setError(data.error || `재생성 실패 (${res.status})`);
          return;
        }
        // 슬라이드 imageUrl 업데이트 + failedSlides 에서 제외
        setSlides((prev) =>
          prev.map((s, i) => (i === slideIndex ? { ...s, imageUrl: data.imageDataUrl! } : s)),
        );
        setFailedSlides((prev) => prev.filter((i) => i !== slideIndex));
        // 크레딧 1 차감 표시
        if (creditCtx.creditInfo) {
          creditCtx.setCreditInfo({
            credits: Math.max(0, (creditCtx.creditInfo.credits ?? 0) - 1),
            totalUsed: (creditCtx.creditInfo.totalUsed || 0) + 1,
          });
        }
      } catch (e) {
        setError((e as Error).message || '네트워크 오류');
      }
    },
    [slides, theme, creditCtx],
  );

  // ── Step 4 → 5: done (savePost + 진입) ───────────────────────────────
  const handleImagesSubmit = useCallback(async () => {
    setStep('done');
    // 생성 기록 저장 (게스트도 localStorage)
    try {
      const session = await getSessionSafe();
      await savePost({
        userId: session.userId || undefined,
        postType: 'card_news',
        title: topic.slice(0, 100) || '카드뉴스',
        // C2-fix-1: v3 envelope 에 theme 추가 (backward-compat — theme 없는 v3 는 default 적용).
        content: JSON.stringify({ version: 3, slides, topic, slideCount, theme }),
        topic,
        hospitalName,
        keywords: [],
      });
    } catch {
      /* 저장 실패는 무시 — 다운로드는 진행 */
    }
  }, [topic, slides, slideCount, hospitalName, theme]);

  // ── Back handlers (간단 confirm, 이전 결과 폐기) ──────────────────────
  const handleBackToTopic = () => {
    if (slides.length > 0 && !confirm('이전 단계로 돌아가면 생성된 내용이 모두 사라집니다. 계속하시겠어요?'))
      return;
    setOutline([]);
    setSlides([]);
    setViolations([]);
    setReplacedCount(0);
    setFailedSlides([]);
    setError(null);
    setStep('topic');
  };
  const handleBackToOutline = () => {
    if (slides.length > 0 && !confirm('이전 단계로 돌아가면 생성된 텍스트가 사라집니다. 계속하시겠어요?'))
      return;
    setSlides([]);
    setViolations([]);
    setReplacedCount(0);
    setFailedSlides([]);
    setError(null);
    setStep('outline');
  };
  const handleBackToText = () => {
    if (failedSlides.length > 0 || slides.some((s) => s.imageUrl)) {
      if (!confirm('이전 단계로 돌아가면 생성된 이미지가 사라집니다. 계속하시겠어요?')) return;
    }
    setSlides((prev) => prev.map((s) => ({ ...s, imageUrl: undefined })));
    setFailedSlides([]);
    setImageCreditsUsed(0);
    setImageCreditsRefunded(0);
    setError(null);
    setStep('text');
  };

  const handleRestart = () => {
    if (!confirm('새 카드뉴스를 시작하시겠어요? 현재 결과는 사라집니다 (다운로드는 영구).')) return;
    setStep('topic');
    setTopic('');
    setSlideCount(5);
    setTheme(DEFAULT_THEME);
    setOutline([]);
    setSlides([]);
    setViolations([]);
    setReplacedCount(0);
    setFailedSlides([]);
    setImageCreditsUsed(0);
    setImageCreditsRefunded(0);
    setError(null);
    router.refresh();
  };

  // ── Render ────────────────────────────────────────────────────────────
  if (step === 'topic') {
    return (
      <TopicInput
        initialTopic={topic}
        initialSlideCount={slideCount}
        initialTheme={theme}
        isLoading={isLoading}
        error={error}
        onSubmit={handleTopicSubmit}
      />
    );
  }
  if (step === 'outline') {
    return (
      <OutlineReview
        outline={outline}
        onOutlineChange={setOutline}
        isLoading={isLoading}
        error={error}
        onBack={handleBackToTopic}
        onSubmit={handleOutlineSubmit}
      />
    );
  }
  if (step === 'text') {
    return (
      <SlideTextEditor
        slides={slides}
        violations={violations}
        replacedCount={replacedCount}
        hospitalName={hospitalName}
        theme={theme}
        isLoading={isLoading}
        error={error}
        onSlidesChange={setSlides}
        onBack={handleBackToOutline}
        onSubmit={handleTextSubmit}
      />
    );
  }
  if (step === 'image') {
    return (
      <ImageGenerationPanel
        slides={slides}
        failedSlides={failedSlides}
        creditsUsed={imageCreditsUsed}
        creditsRefunded={imageCreditsRefunded}
        isLoading={isLoading}
        loadingProgress={imageProgress ?? undefined}
        hospitalName={hospitalName}
        theme={theme}
        error={error}
        onSlidesChange={setSlides}
        onRegenerateSlide={handleRegenerateSlide}
        onBack={handleBackToText}
        onSubmit={handleImagesSubmit}
      />
    );
  }
  return (
    <DownloadPanel
      slides={slides}
      topic={topic}
      hospitalName={hospitalName}
      theme={theme}
      onRestart={handleRestart}
    />
  );
}
