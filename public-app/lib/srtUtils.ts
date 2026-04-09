/**
 * SRT 자막 파일 생성/다운로드 유틸리티
 */

export interface SrtSegment {
  start_time: number; // 초 (소수점)
  end_time: number;
  text: string;
}

/** 초를 SRT 타임코드 형식(00:00:00,000)으로 변환 */
export function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return (
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0') + ',' +
    String(ms).padStart(3, '0')
  );
}

/** SRT 포맷 문자열 생성 */
export function generateSrt(subtitles: SrtSegment[]): string {
  return subtitles
    .map((seg, i) =>
      `${i + 1}\n${formatSrtTime(seg.start_time)} --> ${formatSrtTime(seg.end_time)}\n${seg.text}`
    )
    .join('\n\n');
}

/** SRT 파일 다운로드 트리거 */
export function downloadSrt(subtitles: SrtSegment[], filename?: string): void {
  const srtContent = generateSrt(subtitles);
  const blob = new Blob([srtContent], { type: 'text/srt;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (filename || 'subtitles') + '.srt';
  a.click();
  URL.revokeObjectURL(url);
}
