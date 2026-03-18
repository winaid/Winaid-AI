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
  
  // 네비게이션 요청 (HTML 페이지) → network-first + app-shell fallback
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(navigateHandler(request));
    return;
  }

  // API 요청은 네트워크 우선
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 정적 자원(이미지/폰트)만 캐시 우선
  const isStaticAsset = ALWAYS_CACHE_PATTERNS.some(p => p.test(url.pathname));
  if (isStaticAsset) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 해시된 빌드 파일(JS/CSS)은 항상 네트워크에서 가져옴
  const isHashedAsset = NO_CACHE_PATTERNS.some(p => p.test(url.pathname));
  if (isHashedAsset) {
    event.respondWith(fetch(request));
    return;
  }

  // 기타 same-origin GET → cache-first
  event.respondWith(cacheFirst(request));
});

/**
 * 네비게이션 핸들러 (Network First + App Shell Fallback)
 * - 페이지(document/navigate) 요청 전용
 * - 네트워크 성공 시 응답 반환 + /index.html 캐시 갱신
 * - 네트워크 실패 시 캐시된 /index.html 반환 (SPA app-shell)
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
    console.log('[SW] Navigation fetch failed, falling back to cached app shell');
    // 오프라인: 캐시된 /index.html (SPA app-shell) 반환
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match('/index.html');
    if (cached) {
      return cached;
    }
    // 캐시도 없으면 오프라인 페이지
    return new Response(
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>오프라인</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#667eea;color:white"><div style="text-align:center"><h1>📴 오프라인</h1><p>인터넷 연결을 확인해주세요.</p></div></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

/**
 * 캐시 우선 전략 (Cache First)
 * - 정적 자원(이미지/폰트/manifest 등)에만 사용
 */
async function cacheFirst(request) {
  if (request.method !== 'GET') {
    return fetch(request);
  }

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
    throw error;
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
