/**
 * Per-domain throttle (BL-C-006).
 *
 * 과거: rate limit 은 요청자 IP 단위(분당 30회)만 있었고, 대상 도메인 단위
 * throttle / 동시성 한도 없음. 같은 도메인 (blog.naver.com) 으로 여러 endpoint
 * (`/crawl-content`, `/crawl-hospital-blog`) 가 동시에 fetch 하면 중첩 → 네이버
 * 측 IP 차단 risk + 약관 위반 risk 가중.
 *
 * 본 유틸:
 *  - per-host serial-with-min-interval queue. 동일 host 로의 작업은 직렬 + 최소
 *    간격 (default 500ms, robots.txt Crawl-delay 가 있으면 max 적용).
 *  - 동시성 한도는 "직렬"로 강제 (concurrency=1) — 가장 보수적. 추후 host 별
 *    설정 가능.
 *  - 메모리 누수 방지: queue 비면 host 엔트리 삭제.
 *  - 외부 의존성 없음 (bottleneck/p-limit 의존성 PR 분리).
 */

const DEFAULT_MIN_INTERVAL_MS = 500;
const MAX_QUEUE_PER_HOST = 100; // queue 폭주 방지

// host → { queue: [{ resolve, reject, fn }], running: boolean, lastRunAt: number }
const hostQueues = new Map();

function getHostKey(url) {
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return null;
  }
}

async function runQueue(host, minIntervalMs) {
  const entry = hostQueues.get(host);
  if (!entry || entry.running) return;
  entry.running = true;
  try {
    while (entry.queue.length > 0) {
      const now = Date.now();
      const wait = Math.max(0, entry.lastRunAt + minIntervalMs - now);
      if (wait > 0) {
        await new Promise(r => setTimeout(r, wait));
      }
      const job = entry.queue.shift();
      entry.lastRunAt = Date.now();
      try {
        const result = await job.fn();
        job.resolve(result);
      } catch (e) {
        job.reject(e);
      }
    }
  } finally {
    entry.running = false;
    if (entry.queue.length === 0) {
      hostQueues.delete(host);
    }
  }
}

/**
 * @param {string} url 대상 URL (host 키 추출용)
 * @param {() => Promise<T>} fn 실행 콜백
 * @param {object} [opts]
 * @param {number} [opts.minIntervalMs] 최소 간격 (ms). robots.txt Crawl-delay 보다
 *   짧지 않은 값으로 호출 측에서 min/max 결정.
 * @returns {Promise<T>}
 */
function schedule(url, fn, opts = {}) {
  const host = getHostKey(url);
  if (!host) {
    // host 추출 실패 — 그냥 직접 실행 (호출 측에서 URL 검증 필요)
    return fn();
  }
  const minIntervalMs = Math.max(0, opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS);

  let entry = hostQueues.get(host);
  if (!entry) {
    entry = { queue: [], running: false, lastRunAt: 0 };
    hostQueues.set(host, entry);
  }
  if (entry.queue.length >= MAX_QUEUE_PER_HOST) {
    return Promise.reject(new Error(`throttle queue full for host ${host}`));
  }

  return new Promise((resolve, reject) => {
    entry.queue.push({ resolve, reject, fn });
    // fire-and-forget runner — 첫 호출이 직렬 처리.
    runQueue(host, minIntervalMs).catch(() => { /* 개별 job 에서 reject 됨 */ });
  });
}

/**
 * 테스트/디버그용 — queue 클리어.
 */
function _clearAll() { hostQueues.clear(); }

module.exports = { schedule, _clearAll };
