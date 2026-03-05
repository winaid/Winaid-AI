import { Hono } from 'hono'

type Bindings = {
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  PORTONE_STORE_ID?: string;
  PORTONE_CHANNEL_KEY?: string;
}

const app = new Hono<{ Bindings: Bindings }>()

// API routes
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// OpenAI API 프록시 (CORS 해결용)
app.post('/api/openai-chat', async (c) => {
  // CORS 헤더 설정
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-OpenAI-Key',
    'Access-Control-Max-Age': '86400',
  };

  try {
    // 요청 본문 파싱
    const body = await c.req.json();
    
    // API 키 가져오기 (환경변수 우선, 없으면 요청 헤더에서)
    const apiKey = c.env.OPENAI_API_KEY || c.req.header('X-OpenAI-Key');
    
    if (!apiKey) {
      return c.json(
        { error: 'OpenAI API key is required' },
        { status: 401, headers: corsHeaders }
      );
    }

    console.log('🔵 Proxying request to OpenAI API...');
    console.log('📦 Model:', body.model);
    console.log('📦 Messages count:', body.messages?.length);

    // OpenAI API 호출
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const responseData = await openaiResponse.json();

    if (!openaiResponse.ok) {
      console.error('❌ OpenAI API Error:', responseData);
      return c.json(responseData, { status: openaiResponse.status, headers: corsHeaders });
    }

    console.log('✅ OpenAI API Success');
    
    return c.json(responseData, { status: 200, headers: corsHeaders });

  } catch (error) {
    console.error('❌ Proxy Error:', error);
    
    return c.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500, headers: corsHeaders }
    );
  }
})

// OpenAI 프록시 OPTIONS (CORS preflight)
app.options('/api/openai-chat', (c) => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-OpenAI-Key',
      'Access-Control-Max-Age': '86400',
    },
  });
})

// 🕷️ 웹 크롤링 API (병원 웹사이트 분석용)
app.post('/api/crawler', async (c) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { url } = await c.req.json();
    
    if (!url) {
      return c.json({ error: 'URL is required' }, { status: 400, headers: corsHeaders });
    }

    console.log('🕷️ Crawling:', url);

    // URL 가져오기
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WINAID/1.0; +https://hospital-ai.com)',
      },
    });

    if (!response.ok) {
      return c.json(
        { error: 'Failed to fetch URL', status: response.status },
        { status: response.status, headers: corsHeaders }
      );
    }

    const html = await response.text();
    
    // HTML에서 텍스트 추출 (간단한 방식)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // script 태그 제거
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // style 태그 제거
      .replace(/<[^>]+>/g, ' ') // HTML 태그 제거
      .replace(/\s+/g, ' ') // 연속된 공백 제거
      .trim()
      .substring(0, 5000); // 첫 5000자만 (너무 길면 API 부담)

    console.log('✅ Crawling success:', textContent.substring(0, 100));

    return c.json({ content: textContent }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ Crawling error:', error);
    return c.json(
      { error: 'Crawling failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    );
  }
})

// 크롤링 API OPTIONS (CORS preflight)
app.options('/api/crawler', (c) => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
})

// 환경변수에서 API 키 가져오기 (서버 → 클라이언트)
app.get('/api/config', (c) => {
  const config = {
    geminiKey: c.env.GEMINI_API_KEY || '',
  }
  return c.json(config)
})

// robots.txt
app.get('/robots.txt', (c) => {
  return c.text(`# WINAID Robots.txt
User-agent: *
Allow: /

# Sitemap
Sitemap: https://story-darugi.com/sitemap.xml

# Disallow admin and api routes
Disallow: /api/
Disallow: /#admin
`);
});

// sitemap.xml - 동적으로 현재 날짜 생성
app.get('/sitemap.xml', (c) => {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://story-darugi.com/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://story-darugi.com/#app</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://story-darugi.com/#pricing</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://story-darugi.com/#auth</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`, 200, { 'Content-Type': 'application/xml' });
});

// Main HTML page (정적 파일 경로 제외)
app.get('*', (c) => {
  const path = new URL(c.req.url).pathname;
  
  // 정적 파일 경로는 Cloudflare Pages가 직접 서빙하도록 완전히 우회
  // Worker를 건너뛰고 asset 서빙으로 fallback
  if (path.startsWith('/assets/') || path.startsWith('/static/') || 
      path.endsWith('.js') || path.endsWith('.css') || 
      path.endsWith('.png') || path.endsWith('.jpg') || 
      path.endsWith('.svg') || path.endsWith('.ico')) {
    return new Response(null, { status: 404 });
  }
  
  // 환경변수를 HTML에 직접 주입
  const geminiKey = c.env.GEMINI_API_KEY || '';
  const portoneStoreId = c.env.PORTONE_STORE_ID || '';
  const portoneChannelKey = c.env.PORTONE_CHANNEL_KEY || '';
  
  return c.html(`
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Primary Meta Tags -->
    <title>WINAID - 병원 블로그 AI 자동 생성 | 의료광고법 100% 준수</title>
    <meta name="title" content="WINAID - 병원 블로그 AI 자동 생성 | 의료광고법 100% 준수">
    <meta name="description" content="30초 만에 의료광고법을 준수하는 병원 블로그 원고와 AI 이미지를 자동 생성하세요. 네이버 스마트블록 상위노출에 최적화된 병원 전용 AI 콘텐츠 생성기. 지금 무료로 시작하세요!">
    <meta name="keywords" content="병원블로그, 의료마케팅, 병원마케팅, AI글쓰기, 블로그자동화, 의료광고법, 네이버블로그, 병원홍보, 의료콘텐츠, 스마트블록">
    <meta name="author" content="WINAID">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://story-darugi.com">
    
    <!-- Open Graph / Facebook (PNG 이미지 우선 - 호환성 향상) -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://story-darugi.com">
    <meta property="og:title" content="WINAID - 병원 블로그 AI 자동 생성">
    <meta property="og:description" content="30초 만에 의료광고법을 준수하는 병원 블로그 원고와 AI 이미지를 자동 생성하세요.">
    <meta property="og:image" content="https://story-darugi.com/static/og-image.png">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:locale" content="ko_KR">
    <meta property="og:site_name" content="WINAID">
    
    <!-- Twitter (PNG 이미지 우선) -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="https://story-darugi.com">
    <meta name="twitter:title" content="WINAID - 병원 블로그 AI 자동 생성">
    <meta name="twitter:description" content="30초 만에 의료광고법을 준수하는 병원 블로그 원고와 AI 이미지를 자동 생성하세요.">
    <meta name="twitter:image" content="https://story-darugi.com/static/og-image.png">
    
    <!-- Naver Search Advisor 인증 (환경변수 NAVER_SITE_VERIFICATION 설정 필요) -->
    <!-- 설정 방법: Cloudflare Pages > Settings > Environment Variables에 추가 -->
    
    <!-- Google Search Console 인증 (환경변수 GOOGLE_SITE_VERIFICATION 설정 필요) -->
    <!-- 설정 방법: Cloudflare Pages > Settings > Environment Variables에 추가 -->
    
    <!-- Structured Data - JSON-LD -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "WINAID",
      "description": "30초 만에 의료광고법을 준수하는 병원 블로그 원고와 AI 이미지를 자동 생성하는 AI 서비스",
      "url": "https://story-darugi.com",
      "applicationCategory": "HealthcareApplication",
      "operatingSystem": "Web",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "KRW",
        "description": "무료 체험 3회 제공"
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.8",
        "ratingCount": "127"
      },
      "publisher": {
        "@type": "Organization",
        "name": "미쁘다",
        "url": "https://story-darugi.com"
      }
    }
    </script>
    
    <!-- Favicon (병원 십자가 아이콘) -->
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=3">
    <link rel="apple-touch-icon" href="/favicon.svg?v=3">
    <link rel="shortcut icon" href="/favicon.svg?v=3">
    
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- PortOne V2 SDK -->
    <script src="https://cdn.portone.io/v2/browser-sdk.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet">
    <style>
        * {
            font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .custom-scrollbar::-webkit-scrollbar {
            width: 8px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 100px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-fadeIn {
            animation: fadeIn 0.3s ease-out;
        }
    </style>
</head>
<body class="bg-slate-50">
    <div id="root"></div>
    <script>
      // 서버에서 주입된 API 키를 localStorage에 저장
      (function() {
        const gk = "${geminiKey}";
        const psi = "${portoneStoreId}";
        const pck = "${portoneChannelKey}";
        if (gk) { localStorage.setItem('GEMINI_API_KEY', gk); localStorage.setItem('GLOBAL_GEMINI_API_KEY', gk); }
        if (psi) { localStorage.setItem('PORTONE_STORE_ID', psi); }
        if (pck) { localStorage.setItem('PORTONE_CHANNEL_KEY', pck); }
      })();
    </script>
    <script type="module" src="/static/client.js"></script>
</body>
</html>
  `)
})

// Cloudflare Pages 환경에서 정적 asset 서빙을 위한 래퍼
export default {
  async fetch(request: Request, env: any, ctx: any) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // 정적 파일 경로는 Cloudflare Pages asset 서빙으로 넘김
    if (path.startsWith('/assets/') || path.startsWith('/static/')) {
      // env.ASSETS가 있으면 (Cloudflare Pages 환경)
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      // 없으면 404 (로컬 개발 환경)
      return new Response('Not Found', { status: 404 });
    }
    
    // 나머지는 Hono 앱이 처리
    return app.fetch(request, env, ctx);
  }
}
