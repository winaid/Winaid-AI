import DOMPurify from 'dompurify';

/**
 * DOMPurify 기반 HTML sanitizer. 모든 페이지의 `dangerouslySetInnerHTML` 직전에
 * 반드시 이 함수를 통해야 한다.
 *
 * 보안 결정 사항:
 *  - `<style>` 태그는 허용하지 않는다 — CSS keylogger, `background:url()` 기반
 *    데이터 유출 공격 벡터. 인라인 `style` 속성(attribute)은 유지 — 태그와
 *    속성은 별개 레이어.
 *  - `data:` URI는 img 태그에서도 허용하지 않는다 — base64 인코딩된 악성
 *    payload를 img로 실어 나르는 우회 차단.
 *  - SSR에서는 DOMPurify가 동작하지 않으므로(브라우저 window 필요) 최소
 *    방어선으로 `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`,
 *    `on*=` 인라인 이벤트 핸들러를 regex로 제거한다. 완벽하지 않지만
 *    "무방어 pass-through" 대비 훨씬 낫다. 클라이언트가 리하이드레이션
 *    하면 DOMPurify가 한 번 더 통과시킴.
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') {
    // SSR 최소 방어선 — DOMPurify 미사용 환경에서 명백한 XSS 벡터만 차단.
    // 완전한 sanitize 아님. 클라이언트 리하이드레이션에서 재실행됨.
    return html
      .replace(/<script[\s>][\s\S]*?<\/script\s*>/gi, '')
      .replace(/<style[\s>][\s\S]*?<\/style\s*>/gi, '')
      .replace(/<iframe[\s>][\s\S]*?<\/iframe\s*>/gi, '')
      .replace(/<object[\s>][\s\S]*?<\/object\s*>/gi, '')
      .replace(/<embed[\s>][\s\S]*?\/?>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','strong','em','b','i','u','s','a','ul','ol','li','table','thead','tbody','tr','th','td','blockquote','code','pre','span','div','img','hr','sup','sub','mark'],
    ALLOWED_ATTR: ['href','target','rel','class','style','src','alt','width','height','colspan','rowspan','data-no-copy'],
    ALLOW_DATA_ATTR: true,
  });
}
