/**
 * Service Worker for Hospital AI
 * - 오프라인 지원
 * - 캐시 전략
 * - PWA 지원
 */

// 캐시 버전 - 배포 시 자동 업데이트를 위해 타임스탬프 사용
const CACHE_VERSION = 'v9-' + '20260313';
const CACHE_NAME = 'hospitalai-' + CACHE_VERSION;
const RUNTIME_CACHE = 'hospitalai-runtime-' + CACHE_VERSION;

// 캐시할 정적 자원 (해시가 바뀌는 JS/CSS와 index.html 제외!)
const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.svg',
];

// 캐시하지 않을 패턴 (해시가 포함된 빌드 파일 + index.html)
const NO_CACHE_PATTERNS = [
  /\/assets\/.*\.js$/,      // JavaScript 번들
  /\/assets\/.*\.css$/,     // CSS 번들
  /^\/$/, // index.html (루트)
  /\/index\.html$/,
  /^\/(app|auth|admin|blog|card_news|press|image|refine|history|pricing|login|register)/, // SPA routes
];

// 항상 캐시할 패턴 (정적 자산)
const ALWAYS_CACHE_PATTERNS = [
  /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i,  // 이미지
  /\.(woff|woff2|ttf|eot)$/i,              // 폰트
];

// Service Worker 설치
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

// Service Worker 활성화
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

// Fetch 이벤트 처리 (캐시 전략)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // GET 요청만 처리 (POST, PUT 등은 캐시 불가)
  if (request.method !== 'GET') {
    return;
  }
  
  // 같은 origin만 처리
  if (url.origin !== location.origin) {
    return;
  }
  
  // Cloudflare 내부 경로 무시
  if (url.pathname.startsWith('/cdn-cgi/')) {
    return;
  }
  
  // 네비게이션 요청 (HTML 페이지)은 항상 네트워크 우선
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // API 요청은 네트워크 우선
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 정적 자원은 캐시 우선
  event.respondWith(cacheFirst(request));
});

/**
 * 캐시 우선 전략 (Cache First)
 * - 정적 자원에 적합
 * - 해시가 포함된 빌드 파일은 캐시하지 않음
 */
async function cacheFirst(request) {
  // 안전장치: GET 요청만 캐시 가능
  if (request.method !== 'GET') {
    return fetch(request);
  }
  
  const url = new URL(request.url);
  
  // 정적 자산(이미지, 폰트)은 항상 캐시
  const shouldAlwaysCache = ALWAYS_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));
  if (shouldAlwaysCache) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    
    if (cached) {
      console.log('[SW] 🎨 Static asset cache hit:', url.pathname);
      return cached;
    }
    
    try {
      const response = await fetch(request);
      if (response.ok) {
        cache.put(request, response.clone());
        console.log('[SW] 🎨 Static asset cached:', url.pathname);
      }
      return response;
    } catch (error) {
      console.error('[SW] Static asset fetch failed:', error);
      throw error;
    }
  }
  
  // 해시가 포함된 빌드 파일은 항상 네트워크에서 가져옴 (캐시 X)
  const shouldSkipCache = NO_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));
  if (shouldSkipCache) {
    // 개발 환경에서만 로그 출력
    if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
      console.log('[SW] Skip cache for hashed asset:', url.pathname);
    }
    try {
      return await fetch(request);
    } catch (error) {
      console.error('[SW] Network fetch failed for asset:', error);
      throw error;
    }
  }
  
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  if (cached) {
    console.log('[SW] Cache hit:', request.url);
    return cached;
  }
  
  try {
    console.log('[SW] Cache miss, fetching:', request.url);
    const response = await fetch(request);
    
    // 성공 응답만 캐시
    if (response.ok) {
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.error('[SW] Fetch failed:', error);
    
    // 오프라인 폴백 페이지
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>오프라인 - Hospital AI</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              text-align: center;
              padding: 40px;
            }
            h1 { font-size: 48px; margin: 0 0 20px; }
            p { font-size: 18px; opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>📴 오프라인 모드</h1>
            <p>인터넷 연결을 확인해주세요.</p>
            <p>연결되면 자동으로 복구됩니다.</p>
          </div>
        </body>
      </html>
      `,
      {
        headers: { 'Content-Type': 'text/html' },
      }
    );
  }
}

/**
 * 네트워크 우선 전략 (Network First)
 * - API 요청에 적합
 */
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  
  try {
    const response = await fetch(request);
    
    // 성공 응답만 캐시
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
    
    // 캐시도 없으면 에러 응답
    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: '인터넷 연결을 확인해주세요.',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// 백그라운드 동기화 (추후 구현 가능)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(syncData());
  }
});

async function syncData() {
  // TODO: 오프라인 중에 저장된 데이터를 서버와 동기화
  console.log('[SW] Syncing data...');
}

// 푸시 알림 (추후 구현 가능)
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
