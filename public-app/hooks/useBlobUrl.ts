/**
 * useBlobUrl — Blob/File을 object URL로 변환하고 자동 해제하는 훅.
 *
 * 사용 패턴:
 *   const [file, setFile] = useState<File | null>(null);
 *   const url = useBlobUrl(file);     // 새 file이 오면 이전 URL 자동 revoke
 *   <video src={url || ''} />
 *
 * 규칙:
 *  - source가 바뀌면 이전 URL을 URL.revokeObjectURL로 해제 후 새 URL 생성
 *  - 컴포넌트 unmount 시에도 자동 revoke
 *  - source가 null/undefined면 null 반환 (이전 URL은 revoke)
 *  - source가 동일 Blob/File이면 URL 재생성하지 않음 (reference equality)
 */
import { useEffect, useRef, useState } from 'react';

export function useBlobUrl(source: Blob | File | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  // revoke할 URL을 ref로 기억 — cleanup 시 최신값 기준
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // 이전 URL 정리
    if (prevUrlRef.current) {
      try { URL.revokeObjectURL(prevUrlRef.current); } catch { /* noop */ }
      prevUrlRef.current = null;
    }

    if (!source) {
      setUrl(null);
      return;
    }

    const next = URL.createObjectURL(source);
    prevUrlRef.current = next;
    setUrl(next);

    // unmount / source 변경 시 cleanup
    return () => {
      if (prevUrlRef.current) {
        try { URL.revokeObjectURL(prevUrlRef.current); } catch { /* noop */ }
        prevUrlRef.current = null;
      }
    };
  }, [source]);

  return url;
}

/**
 * 문자열 URL이 blob:로 시작하면 revokeObjectURL 호출.
 * 일반 http/https URL(Supabase public URL 등)은 그대로 둠.
 *
 * 용도: state에 blob URL을 직접 담아 쓰는 기존 코드에서, 이전 URL을
 *       safely 해제할 때 쓰는 원-샷 헬퍼.
 */
export function revokeIfBlob(url: string | null | undefined): void {
  if (!url) return;
  if (typeof url !== 'string') return;
  if (!url.startsWith('blob:')) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // 이미 해제됐거나 무효 — 무시
  }
}
