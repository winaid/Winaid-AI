// POST /api/crawler — 웹 페이지 크롤링 (네이버 블로그 특수 처리)
// Ported from functions/api/crawler.ts
// CF-Connecting-IP → x-forwarded-for

const requestCounts = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const limit = 60;
  const window = 60000;
  const record = requestCounts.get(ip);

  if (!record || now > record.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + window });
    return { allowed: true };
  }
  if (record.count >= limit) {
    return { allowed: false, resetTime: record.resetTime };
  }
  record.count++;
  return { allowed: true };
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    // Rate limiting — x-forwarded-for (Vercel), fallback x-real-ip
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.headers['x-real-ip']
      || 'unknown';
    const rateLimitResult = checkRateLimit(ip);

    if (!rateLimitResult.allowed) {
      const retryAfter = rateLimitResult.resetTime
        ? Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
        : 60;
      console.warn(`🚫 Rate limit exceeded for IP: ${ip}`);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter,
      });
    }

    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL is required' });

    console.log('🕷️ Crawling:', url);

    let fetchUrl = url;
    const naverBlogMatch = url.match(/https:\/\/blog\.naver\.com\/([^\/]+)\/(\d+)/);
    if (naverBlogMatch) {
      const [, blogId, logNo] = naverBlogMatch;
      fetchUrl = `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`;
      console.log('📝 네이버 블로그 PostView URL:', fetchUrl);
    }

    const response = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://blog.naver.com/',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch URL', status: response.status });
    }

    const html = await response.text();
    let textContent = '';

    if (naverBlogMatch) {
      const paragraphPattern = /<[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/g;
      const paragraphs = [];
      let match;
      while ((match = paragraphPattern.exec(html)) !== null) {
        let text = match[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ')
          .trim();
        if (text.length > 10) paragraphs.push(text);
      }
      textContent = paragraphs.join('\n\n');
      console.log(`✅ 네이버 블로그 본문 추출: ${paragraphs.length}개 문단, ${textContent.length}자`);
    } else {
      textContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      console.log(`✅ 일반 페이지 텍스트 추출: ${textContent.length}자`);
    }

    textContent = textContent.substring(0, 10000);
    console.log('✅ Crawling success:', textContent.substring(0, 100));

    return res.status(200).json({ content: textContent });
  } catch (error) {
    console.error('❌ Crawling error:', error);
    return res.status(500).json({ error: 'Crawling failed', message: error.message || 'Unknown error' });
  }
}
