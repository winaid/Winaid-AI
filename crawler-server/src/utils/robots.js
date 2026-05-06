/**
 * robots.txt 준수 유틸 (BL-C-005).
 *
 * 과거: crawler.js 의 crawlNaverBlogs / crawlBlogContent / crawlHospitalBlogPosts
 * 모두 robots.txt fetch / 해석 / Disallow 체크 / Crawl-delay 존중 코드 0건.
 *
 * 본 유틸:
 *  - per-host 캐시 (TTL 1시간) — 매 요청 마다 robots.txt 재fetch 회피.
 *  - User-agent 매칭: '*' 와 본 크롤러 UA prefix 둘 다 평가.
 *  - 가장 긴 prefix 매치를 따르는 표준 robots.txt 정책.
 *  - Crawl-delay 헤더 파싱 (있으면 throttle 모듈 측 minimum delay 와 max).
 *  - Disallow: 가 빈 줄이면 모든 path 허용 (RFC 표준).
 *  - 4xx / fetch 실패 시 conservative 정책: "robots.txt 부재" 로 간주, 모두 허용.
 *    (RFC 9309 §2.3.1.3: "If status is 4xx, the crawler MAY access any resource".)
 *  - 5xx 는 일시 장애로 간주 — 단기간 deny (보수적).
 *  - 본 모듈은 약관 risk 환기용 보조선이지 약관 단정 X.
 *
 * 의존성을 추가하지 않기 위해 mini parser 직접 구현.
 * 외부 robots-parser 사용 시 의존성 PR 분리.
 */

const ROBOTS_TTL_MS = 60 * 60 * 1000; // 1시간
const ROBOTS_FETCH_TIMEOUT_MS = 5000;
const FALLBACK_DENY_TTL_MS = 5 * 60 * 1000; // 5xx 일시 deny

// host → { ts, rules: [{ ua, disallow: string[], allow: string[], crawlDelay: number|null }],
//          fetchOk: boolean, expiresAt }
const robotsCache = new Map();

/**
 * 한 robots.txt 본문을 파싱해 rules 배열 반환.
 * 한 group 은 user-agent 라인(들) + 그 뒤의 disallow/allow/crawl-delay 라인.
 */
function parseRobots(text) {
  const lines = text.split(/\r?\n/);
  const groups = [];
  let current = null;
  let lastWasUA = false;

  for (let raw of lines) {
    // 주석 제거 + trim
    const hashIdx = raw.indexOf('#');
    if (hashIdx !== -1) raw = raw.slice(0, hashIdx);
    const line = raw.trim();
    if (!line) continue;

    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (!lastWasUA || !current) {
        current = { uas: [], disallow: [], allow: [], crawlDelay: null };
        groups.push(current);
      }
      current.uas.push(value.toLowerCase());
      lastWasUA = true;
    } else {
      lastWasUA = false;
      if (!current) continue; // user-agent 없이 시작 — 무시
      if (field === 'disallow') {
        // RFC: empty Disallow → 모든 허용 (no-op rule)
        current.disallow.push(value);
      } else if (field === 'allow') {
        current.allow.push(value);
      } else if (field === 'crawl-delay') {
        const n = Number(value);
        if (!isNaN(n) && n >= 0) current.crawlDelay = n;
      }
    }
  }
  return groups;
}

/**
 * UA 매칭: 정확 일치(prefix) 우선, 없으면 '*'.
 * 표준 (RFC 9309 §2.2.1): 가장 구체적인 UA 토큰 매칭.
 */
function findBestGroup(groups, userAgent) {
  const ua = (userAgent || '').toLowerCase();
  let best = null;
  let bestSpec = -1; // '*' 보다 구체적인 매칭 우선
  for (const g of groups) {
    for (const groupUA of g.uas) {
      if (groupUA === '*') {
        if (bestSpec < 0) { best = g; bestSpec = 0; }
      } else if (ua.startsWith(groupUA) || ua.includes(groupUA)) {
        // 구체 토큰 매칭 — 길이가 길수록 우선
        if (groupUA.length > bestSpec) { best = g; bestSpec = groupUA.length; }
      }
    }
  }
  return best;
}

/**
 * RFC 9309 §2.2.2: 가장 긴 매칭 패턴 우선. allow 가 disallow 보다 길면 allow 우선.
 * `*` 는 임의 0+ 문자, `$` 는 끝 anchor.
 */
function patternToRegex(pattern) {
  if (!pattern) return null;
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') re += '.*';
    else if (ch === '$' && i === pattern.length - 1) re += '$';
    else re += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re);
}

function matches(pattern, path) {
  const re = patternToRegex(pattern);
  if (!re) return false;
  return re.test(path);
}

/**
 * 단일 group 안에서 path 가 허용되는지 판정.
 * - 매칭 안 되면 default 허용.
 * - 매칭 시 가장 긴 pattern 우선 (allow vs disallow 비교).
 */
function isAllowedByGroup(group, path) {
  let bestAllow = -1;
  let bestDisallow = -1;
  for (const a of group.allow) {
    if (a && matches(a, path)) bestAllow = Math.max(bestAllow, a.length);
  }
  for (const d of group.disallow) {
    if (d === '') continue; // 빈 Disallow → no-op
    if (matches(d, path)) bestDisallow = Math.max(bestDisallow, d.length);
  }
  if (bestDisallow < 0) return true; // disallow 매칭 없음 → 허용
  if (bestAllow >= bestDisallow) return true; // allow 가 더 구체적
  return false;
}

/**
 * host (origin) 별 robots.txt 페치 + 캐시.
 * @returns {Promise<{ rules: object[]|null, fetchOk: boolean }>}
 */
async function fetchRobots(origin) {
  const now = Date.now();
  const cached = robotsCache.get(origin);
  if (cached && cached.expiresAt > now) {
    return cached;
  }

  let entry;
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(ROBOTS_FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'WinaidCrawler/1.0 (+robots-check)' },
    });
    if (res.status >= 400 && res.status < 500) {
      // 4xx — robots.txt 없음으로 간주, 전부 허용 (RFC 9309 §2.3.1.3)
      entry = { rules: [], fetchOk: true, expiresAt: now + ROBOTS_TTL_MS };
    } else if (res.status >= 500) {
      // 5xx — 보수적으로 일시 deny. 짧은 TTL 후 재시도.
      entry = { rules: null, fetchOk: false, expiresAt: now + FALLBACK_DENY_TTL_MS };
    } else {
      const text = await res.text();
      const rules = parseRobots(text);
      entry = { rules, fetchOk: true, expiresAt: now + ROBOTS_TTL_MS };
    }
  } catch {
    // 네트워크 실패 — robots.txt 부재로 간주 (보수적이면 deny 가 맞으나 실 운영
    // 빈도가 높아 false positive 가 더 큰 비용). 짧은 TTL 후 재시도.
    entry = { rules: [], fetchOk: false, expiresAt: now + FALLBACK_DENY_TTL_MS };
  }

  robotsCache.set(origin, entry);
  return entry;
}

/**
 * 외부 API: 주어진 URL 이 본 크롤러 UA 기준 허용되는지 확인.
 * @param {string} url
 * @param {string} userAgent
 * @returns {Promise<{ allowed: boolean, crawlDelay: number|null, reason: string }>}
 */
async function isAllowed(url, userAgent) {
  let parsed;
  try { parsed = new URL(url); }
  catch { return { allowed: false, crawlDelay: null, reason: 'invalid_url' }; }

  const origin = `${parsed.protocol}//${parsed.host}`;
  const path = parsed.pathname + parsed.search;

  const entry = await fetchRobots(origin);
  if (!entry.fetchOk && entry.rules === null) {
    // 5xx 일시 장애 — 보수적 deny
    return { allowed: false, crawlDelay: null, reason: 'robots_unavailable' };
  }
  if (!entry.rules || entry.rules.length === 0) {
    return { allowed: true, crawlDelay: null, reason: 'no_robots' };
  }

  const group = findBestGroup(entry.rules, userAgent);
  if (!group) {
    return { allowed: true, crawlDelay: null, reason: 'no_matching_group' };
  }
  const allowed = isAllowedByGroup(group, path);
  return {
    allowed,
    crawlDelay: group.crawlDelay,
    reason: allowed ? 'allowed' : 'disallow_match',
  };
}

/**
 * 테스트/디버그용 — 캐시 클리어.
 */
function _clearCache() { robotsCache.clear(); }

module.exports = { isAllowed, _clearCache, parseRobots, findBestGroup, isAllowedByGroup };
