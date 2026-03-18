/**
 * Service Worker for Hospital AI
 * - 오프라인 지원
 * - 캐시 전략
 * - PWA 지원
 */

// 캐시 버전 - 빌드 시 vite.config.ts swVersionPlugin이 아래 값을 빌드 해시로 자동 교체합니다.
const CACHE_VERSION = '__SW_BUILD_HASH__';
const CACHE_NAME = 'hospitalai-' + CACHE_VERSION;
const RUNTIME_CACHE = 'hospitalai-runtime-' + CACHE_VERSION;

// 캐시할 정적 자원 (설치 시 프리캐시)
const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.svg',
];

// ─── 요청 분류 패턴 ───

// 확정적 정적 리소스 — 파일 확장자로 식별 가능한 것만
const STATIC_ASSET_PATTERNS = [
  /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i,  // 이미지
  /\.(woff|woff2|ttf|eot)$/i,              // 폰트
  /\.(json)$/i,                             // manifest 등 JSON
];

// 해시된 빌드 파일 — /assets/ 하위의 JS/CSS
const HASHED_ASSET_PATTERNS = [
  /\/assets\/.*\.js$/,
  /\/assets\/.*\.css$/,
];

// API 경로
const API_PREFIX = '/api/';

// ─── 문서 요청 판별 ───
// request.mode === 'navigate' 하나만 믿지 않는다.
// non-navigate 요청(prefetch, preload, clients.claim 후 reload, manifest start_url 등)으로
// `/`나 `/app` 등 SPA route가 올 수 있다.
// 이런 요청을 asset으로 잘못 분류하면 503 빈 본문을 보내게 된다.
function isDocumentRequest(request, url) {
  // 1. 확실한 navigate/document
  if (request.mode === 'navigate') return true;
  if (request.destination === 'document') return true;

  // 2. Accept 헤더에 text/html이 포함된 경우 (prefetch 등)
  const accept = request.headers.get('Accept') || '';
  if (accept.includes('text/html')) return true;

  // 3. pathname에 파일 확장자가 없는 same-origin GET → SPA route로 간주
  //    (예: /, /app, /auth, /admin, /blog/123 등)
  //    파일 확장자가 있으면 asset이다 (예: /favicon.svg, /manifest.json)
  if (!hasFileExtension(url.pathname)) return true;

  return false;
}

// pathname에 파일 확장자가 있는지 판별
// /assets/index-abc.js → true, /app → false, / → false
function hasFileExtension(pathname) {
  const lastSegment = pathname.split('/').pop() || '';
  return lastSegment.includes('.') && lastSegment.lastIndexOf('.') > 0;
}

// ─── Service Worker 설치 ───
self.addEventListener('install', (event) => {
  console.log('[SW] 서비스 워커 설치 중...');

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 정적 자산 캐싱 중...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.error('[SW] 캐시 추가 실패:', err);
      });
    })
  );

  // 새 서비스 워커를 즉시 활성화
  self.skipWaiting();
});

// ─── Service Worker 활성화 ───
self.addEventListener('activate', (event) => {
  console.log('[SW] 서비스 워커 활성화 중...');

  event.waitUntil(
    (async () => {
      // 모든 이전 캐시 삭제
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[SW] 이전 캐시 삭제:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );

      // 즉시 제어권 획득
      await self.clients.claim();

      // 모든 클라이언트(탭)에 새로고침 메시지 전송
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(client => {
        client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
      });

      console.log('[SW] 활성화 완료 및 클라이언트 알림 전송');
    })()
  );
});

// ─── Fetch 이벤트 처리 ───
//
// 분기 순서:
//   1. non-GET → 무시 (브라우저 기본 처리)
//   2. cross-origin → 무시
//   3. /cdn-cgi/ → 무시
//   4. API → networkFirst (JSON 503 fallback)
//   5. 해시 빌드 파일 (/assets/*.js, /assets/*.css) → network-only + 503 fallback
//   6. 확정적 정적 리소스 (이미지/폰트/json) → cacheFirst + 503 fallback
//   7. 문서 요청 (navigate, Accept: text/html, 확장자 없는 경로) → navigateHandler (HTML fallback)
//   8. 기타 → cacheFirst (식별 불가한 리소스)
//
// 핵심 원칙:
//   - 문서 요청(7번)은 절대 503 빈 본문으로 끝나지 않는다. 반드시 HTML 반환.
//   - API(4번), 해시 파일(5번), 정적 리소스(6번)는 파일 확장자 또는 경로 prefix로 먼저 식별한다.
//   - 나머지 중 문서일 가능성이 있는 것(확장자 없는 경로)은 문서로 처리한다.
//
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ── 1. non-GET 무시 ──
  if (request.method !== 'GET') return;

  // ── 2. cross-origin 무시 ──
  if (url.origin !== location.origin) return;

  // ── 3. Cloudflare 내부 경로 무시 ──
  if (url.pathname.startsWith('/cdn-cgi/')) return;

  // ── 4. API → networkFirst ──
  if (url.pathname.startsWith(API_PREFIX)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // ── 5. 해시 빌드 파일 → network-only ──
  const isHashedAsset = HASHED_ASSET_PATTERNS.some(p => p.test(url.pathname));
  if (isHashedAsset) {
    event.respondWith(
      fetch(request).catch((err) => {
        console.error('[SW] Hashed asset fetch failed:', url.pathname, err);
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      })
    );
    return;
  }

  // ── 6. 확정적 정적 리소스 → cacheFirst ──
  const isStaticAsset = STATIC_ASSET_PATTERNS.some(p => p.test(url.pathname));
  if (isStaticAsset) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ── 7. 문서 요청 → navigateHandler (HTML fallback 보장) ──
  // isDocumentRequest는 mode, destination, Accept, 파일 확장자 유무를 복합 판단.
  // /, /app, /auth, /admin, /blog/123 등 확장자 없는 경로는 여기서 잡힌다.
  if (isDocumentRequest(request, url)) {
    event.respondWith(navigateHandler(request));
    return;
  }

  // ── 8. 기타 (식별 불가 리소스) → cacheFirst ──
  event.respondWith(cacheFirst(request));
});

// ─── 핸들러 ───

/**
 * 문서/네비게이션 핸들러 (Network First + App Shell Fallback)
 * - 페이지(document/navigate/SPA route) 요청 전용
 * - 네트워크 성공 시 응답 반환 + /index.html 캐시 갱신
 * - 네트워크 실패 시 캐시된 /index.html 반환 (SPA app-shell)
 * - 캐시도 없으면 인라인 오프라인 HTML 반환
 * - 절대 503 빈 본문을 반환하지 않는다
 */
async function navigateHandler(request) {
  try {
    const response = await fetch(request);
    // 성공 시 app-shell 캐시 갱신
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(new Request('/index.html'), response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Document fetch failed, falling back to cached app shell');
    // 오프라인: 캐시된 /index.html (SPA app-shell) 반환
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match('/index.html');
    if (cached) {
      return cached;
    }
    // 캐시도 없으면 인라인 오프라인 HTML 반환 (절대 빈 503이 아님)
    return new Response(
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>오프라인 - HospitalAI</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#667eea;color:white"><div style="text-align:center;padding:2rem"><h1 style="font-size:2rem;margin-bottom:1rem">오프라인</h1><p style="font-size:1.1rem;opacity:0.9">인터넷 연결을 확인한 후 새로고침 해주세요.</p><button onclick="location.reload()" style="margin-top:1.5rem;padding:0.75rem 2rem;font-size:1rem;border:2px solid white;background:transparent;color:white;border-radius:8px;cursor:pointer">새로고침</button></div></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
    );
  }
}

/**
 * 캐시 우선 전략 (Cache First)
 * - 확정적 정적 리소스(이미지/폰트/manifest)에만 사용
 * - 문서 요청은 여기로 오지 않는다 (isDocumentRequest로 먼저 분기)
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[SW] Static asset fetch failed:', request.url, error);
    return new Response('', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * 네트워크 우선 전략 (Network First)
 * - API 요청에 적합
 * - 실패 시 JSON 503 반환 (문서 요청은 여기로 오지 않는다)
 */
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    return new Response(
      JSON.stringify({ error: 'Offline', message: '인터넷 연결을 확인해주세요.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ─── 기타 이벤트 ───

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(syncData());
  }
});

async function syncData() {
  console.log('[SW] Syncing data...');
}

self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  const data = event.data?.json() || {};
  const title = data.title || 'Hospital AI';
  const options = {
    body: data.body || '새로운 알림이 있습니다.',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
