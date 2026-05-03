/**
 * 단순 LRU + TTL 캐시 (외부 의존성 없이 native Map 기반).
 *
 * 특징:
 *  - max entries 초과 시 oldest evict (Map 의 insertion order 활용)
 *  - TTL 강제: ttlMs 경과 entry 는 access 시 또는 cleanup() 호출 시 evict
 *    (refCount 기반 보존 X — pinning 하지 않음, 누수 차단)
 *  - onEvict(key, value) 콜백: 파일 unlink 등 cleanup 가능
 *
 * 동시성:
 *  - get() 시 last-access 갱신을 위해 delete+set (Map insertion order 갱신)
 *  - 여러 요청이 같은 key 를 동시에 fetch 하면 각자 set 호출 — 마지막 set 이 살아남음
 *  - 호출자가 동일 key 다운로드를 한 번만 하도록 in-flight dedupe 하려면 별도 처리
 */

class LruCache {
  /**
   * @param {object} options
   * @param {number} options.max 최대 entry 수 (예: 50)
   * @param {number} options.ttlMs entry TTL milliseconds (예: 600_000)
   * @param {(key:string, value:any)=>void} [options.onEvict] evict 시 호출 (파일 삭제 등)
   */
  constructor({ max, ttlMs, onEvict } = {}) {
    if (typeof max !== 'number' || max < 1) throw new Error('LruCache: max required');
    if (typeof ttlMs !== 'number' || ttlMs < 1) throw new Error('LruCache: ttlMs required');
    this.max = max;
    this.ttlMs = ttlMs;
    this.onEvict = typeof onEvict === 'function' ? onEvict : null;
    this.store = new Map(); // key → { value, expiresAt }
  }

  /**
   * key 조회. 만료된 entry 는 자동 evict 후 undefined.
   * 살아있으면 last-access 시간 갱신 (insertion order 뒤로).
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      this._fireEvict(key, entry.value);
      return undefined;
    }
    // last-access 갱신 — Map 의 insertion order 를 뒤로
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  /**
   * key 저장. max 초과 시 oldest 1개 evict.
   * 기존 key 면 갱신 (TTL 새로 시작).
   */
  set(key, value) {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.max) {
      // oldest = Map iteration 순서의 첫 항목
      const oldestKey = this.store.keys().next().value;
      const oldestEntry = this.store.get(oldestKey);
      this.store.delete(oldestKey);
      if (oldestEntry) this._fireEvict(oldestKey, oldestEntry.value);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    const entry = this.store.get(key);
    if (entry) {
      this.store.delete(key);
      this._fireEvict(key, entry.value);
      return true;
    }
    return false;
  }

  /** 만료된 entry 일괄 정리 (선택 — setInterval 호출용). */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
        this._fireEvict(key, entry.value);
      }
    }
  }

  size() {
    return this.store.size;
  }

  _fireEvict(key, value) {
    if (!this.onEvict) return;
    try {
      this.onEvict(key, value);
    } catch (err) {
      console.error('[LruCache] onEvict 에러:', err && err.message ? err.message : err);
    }
  }
}

module.exports = { LruCache };
