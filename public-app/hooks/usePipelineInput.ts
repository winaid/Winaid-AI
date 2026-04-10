'use client';

/**
 * usePipelineInput — 특정 STEP의 입력 영상/오디오 URL을 안정적으로 반환
 *
 * - getInputForStep이 string(blob URL)이면 그대로
 * - File이면 URL.createObjectURL + cleanup
 * - 입력 없으면 null
 *
 * 두 곳에서 사용:
 *  - StepSubtitle: 자막 편집 시 영상 미리보기/동기화
 *  - StepSilence: 무음 제거 처리 전 원본 파형 표시
 */

import { useEffect, useMemo, useState } from 'react';
import { getInputForStep, type PipelineState } from '../components/video-edit/types';

export function useInputBlobUrl(state: PipelineState, stepNum: number): string | null {
  const input = useMemo(() => getInputForStep(state, stepNum), [state, stepNum]);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof input === 'string') {
      setUrl(input);
      return;
    }
    if (input instanceof File) {
      const u = URL.createObjectURL(input);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setUrl(null);
  }, [input]);

  return url;
}
