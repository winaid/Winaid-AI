/**
 * SSRF-safe fetch — 사설/메타데이터 IP 차단 + redirect 재검증 + 호스트 화이트리스트.
 *
 * 사용자 입력 URL 을 fetch 할 때 직접 호출 X — 본 wrapper 만 사용.
 *
 * 차단 항목:
 *   1) protocol: 'http:' / 'https:' 외 모두 거부 (file:, ftp:, data:, gopher: 등)
 *   2) DNS 해석 결과 IP 가 사설/loopback/link-local/reserved 면 차단
 *      - IPv4: 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16 (IMDS),
 *              172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/4 multicast
 *      - IPv6: ::1 loopback, fc00::/7 ULA, fe80::/10 link-local, ff00::/8 multicast
 *   3) redirect: 'manual' — 자동 추적 X. Location 헤더 URL 을 1 단계부터 재검증.
 *      최대 3 hop. 각 hop 마다 protocol + DNS + 화이트리스트 모두 재검사.
 *   4) allowedHosts (선택): hostname 정확/접미사 매칭. 미일치 거부.
 *
 * 한계 (의도적 trade-off):
 *   - DNS rebinding (TOCTOU): DNS 해석 후 fetch 까지의 race 는 본 함수 단독으로
 *     완전 차단 불가. happy-eyeballs / dual-stack 동작에 따라 두 번째 lookup 결과가
 *     달라질 수 있음. 완전한 방어는 fetch 의 host 옵션을 IP 로 고정 + Host 헤더 별도
 *     설정인데 fetch API 가 미지원. 차후 undici Agent + lookup hook 으로 개선 권장.
 *   - 응답 본문 크기 cap (maxBytes): Content-Length 미명시 시 stream 누적 카운트로
 *     byte 길이 검증. binary 도 byte 단위만 본다. caller 가 .text() / .arrayBuffer()
 *     로 받은 후 실제 사용 시 이미 cap 적용된 본문.
 *
 * 미지원:
 *   - undici Agent / dispatcher (Node 22+ 의존성 무거워서 제외)
 *   - HTTP/2 prior knowledge (fetch API 자체가 자동 처리)
 */

import { promises as dns } from 'dns';
import { isIPv4, isIPv6 } from 'net';

export interface SafeFetchOptions extends Omit<RequestInit, 'redirect'> {
  /** 타임아웃 ms — 기본 10_000 */
  timeout?: number;
  /** 응답 본문 최대 byte — 기본 5MB */
  maxBytes?: number;
  /** 호스트 화이트리스트 (예: ['youtube.com', 'googleusercontent.com']).
   *  hostname 정확 매칭 또는 '.<allowed>' 접미사 매칭. 미설정 시 사설 IP 만 차단. */
  allowedHosts?: string[];
  /** redirect 최대 추적 — 기본 3 */
  maxRedirects?: number;
}

export class SsrfBlockedError extends Error {
  constructor(reason: string, public readonly url: string) {
    super(`SSRF blocked: ${reason} (${url})`);
    this.name = 'SsrfBlockedError';
  }
}

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

/** IPv4 문자열 → 차단 대상이면 차단 사유, 아니면 null. */
function checkIPv4Blocked(ip: string): string | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return 'malformed_ipv4';
  }
  const [a, b] = parts;
  if (a === 0) return 'reserved_0/8';
  if (a === 10) return 'private_10/8';
  if (a === 127) return 'loopback_127/8';
  if (a === 169 && b === 254) return 'link_local_169.254/16'; // IMDS
  if (a === 172 && b >= 16 && b <= 31) return 'private_172.16/12';
  if (a === 192 && b === 168) return 'private_192.168/16';
  if (a >= 224 && a <= 239) return 'multicast_224/4';
  if (a >= 240) return 'reserved_240/4';
  return null;
}

/** IPv6 문자열 → 차단 대상이면 차단 사유, 아니면 null. */
function checkIPv6Blocked(ip: string): string | null {
  // 정규화: 대문자, 압축형(::) → 풀어쓰기. 단순 prefix 기반 체크라 압축도 처리.
  const lower = ip.toLowerCase().replace(/%.*$/, ''); // zone id 제거

  if (lower === '::' || lower === '::1') return 'loopback_or_unspecified';

  // IPv4-mapped IPv6 (::ffff:0:0/96) — 내부 IPv4 검증 위임
  const v4mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4mapped) return checkIPv4Blocked(v4mapped[1]);

  // fc00::/7 unique-local (fc00 ~ fdff)
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return 'unique_local_fc00/7';
  // fe80::/10 link-local
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return 'link_local_fe80/10';
  // ff00::/8 multicast
  if (/^ff[0-9a-f]{2}:/.test(lower)) return 'multicast_ff00/8';

  return null;
}

/** hostname 이 ALLOWED_HOSTS 화이트리스트에 매칭? */
function hostMatchesAllowed(hostname: string, allowedHosts: string[]): boolean {
  const lower = hostname.toLowerCase();
  return allowedHosts.some((allowed) => {
    const al = allowed.toLowerCase();
    return lower === al || lower.endsWith('.' + al);
  });
}

/**
 * URL 검증 + DNS 해석 결과 IP 검증.
 * 통과하면 void, 실패하면 SsrfBlockedError throw.
 */
async function validateUrl(rawUrl: string, opts: SafeFetchOptions): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError('malformed_url', rawUrl);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError(`protocol_not_allowed:${parsed.protocol}`, rawUrl);
  }

  // 화이트리스트 검사 (옵션)
  if (opts.allowedHosts && opts.allowedHosts.length > 0) {
    if (!hostMatchesAllowed(parsed.hostname, opts.allowedHosts)) {
      throw new SsrfBlockedError(`host_not_in_allowlist:${parsed.hostname}`, rawUrl);
    }
  }

  // hostname 이 IP literal 인 경우 즉시 검사 (DNS 우회)
  if (isIPv4(parsed.hostname)) {
    const reason = checkIPv4Blocked(parsed.hostname);
    if (reason) throw new SsrfBlockedError(`ipv4_${reason}`, rawUrl);
    return;
  }
  // IPv6 literal 은 URL hostname 에서 [::1] 같이 [] 빠진 형태로 노출
  // new URL('http://[::1]/').hostname === '[::1]' 이라 brackets 제거 후 검사
  const stripped = parsed.hostname.replace(/^\[/, '').replace(/\]$/, '');
  if (isIPv6(stripped)) {
    const reason = checkIPv6Blocked(stripped);
    if (reason) throw new SsrfBlockedError(`ipv6_${reason}`, rawUrl);
    return;
  }

  // DNS 해석 — A/AAAA 모두 검사
  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
  } catch (e) {
    throw new SsrfBlockedError(`dns_lookup_failed:${(e as Error).message?.slice(0, 60)}`, rawUrl);
  }

  if (addresses.length === 0) {
    throw new SsrfBlockedError('dns_no_addresses', rawUrl);
  }

  // 모든 해석 결과 중 하나라도 차단 대상이면 거부 (가장 보수적)
  for (const { address, family } of addresses) {
    if (family === 4) {
      const reason = checkIPv4Blocked(address);
      if (reason) throw new SsrfBlockedError(`dns_ipv4_${reason}:${address}`, rawUrl);
    } else if (family === 6) {
      const reason = checkIPv6Blocked(address);
      if (reason) throw new SsrfBlockedError(`dns_ipv6_${reason}:${address}`, rawUrl);
    }
  }
}

/**
 * 응답 본문을 maxBytes 까지만 읽어 새 Response 로 wrap.
 * Content-Length 헤더가 maxBytes 초과면 즉시 거부.
 */
async function capResponseBytes(res: Response, maxBytes: number): Promise<Response> {
  const cl = res.headers.get('content-length');
  if (cl) {
    const n = parseInt(cl, 10);
    if (!Number.isNaN(n) && n > maxBytes) {
      throw new SsrfBlockedError(`response_too_large:${n}>maxBytes:${maxBytes}`, res.url || 'unknown');
    }
  }

  if (!res.body) return res;

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch {}
        throw new SsrfBlockedError(`response_too_large_streamed:${total}>maxBytes:${maxBytes}`, res.url || 'unknown');
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new Response(merged, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

/**
 * SSRF-safe fetch.
 *
 * 사용 예:
 *   const res = await safeFetch('https://example.com/page', { timeout: 5000 });
 *   const html = await res.text();
 *
 *   // 화이트리스트
 *   await safeFetch(imageUrl, { allowedHosts: ['supabase.co', 'googleusercontent.com'] });
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let currentUrl = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await validateUrl(currentUrl, options);

    const { timeout: _t, maxBytes: _m, allowedHosts: _ah, maxRedirects: _mr, ...passthrough } = options;
    void _t; void _m; void _ah; void _mr;

    const res = await fetch(currentUrl, {
      ...passthrough,
      signal: AbortSignal.timeout(timeout),
      redirect: 'manual',
    });

    // 30x → Location 헤더 재검증
    if (res.status >= 300 && res.status < 400 && res.status !== 304) {
      const location = res.headers.get('location');
      if (!location) {
        // 30x 인데 Location 없음 — 그대로 응답 반환
        return capResponseBytes(res, maxBytes);
      }
      if (hop >= maxRedirects) {
        throw new SsrfBlockedError(`max_redirects_exceeded:${maxRedirects}`, currentUrl);
      }
      // 절대/상대 URL 모두 처리
      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        throw new SsrfBlockedError(`malformed_redirect_location:${location.slice(0, 120)}`, currentUrl);
      }
      continue;
    }

    return capResponseBytes(res, maxBytes);
  }
  throw new SsrfBlockedError(`max_redirects_exceeded:${maxRedirects}`, currentUrl);
}

/**
 * SSRF-safe fetch + 본문을 string 으로 디코드.
 * decodeWithCharset 같은 처리는 caller 가 직접 수행.
 */
export async function safeFetchText(
  url: string,
  options: SafeFetchOptions = {},
): Promise<{ status: number; ok: boolean; text: string; finalUrl: string; headers: Headers }> {
  const res = await safeFetch(url, options);
  const text = await res.text();
  return { status: res.status, ok: res.ok, text, finalUrl: res.url || url, headers: res.headers };
}

/** SSRF 차단 사유로 발생한 에러인지 확인 (caller 가 401 vs 500 분기용). */
export function isSsrfBlockedError(err: unknown): err is SsrfBlockedError {
  return err instanceof SsrfBlockedError;
}
