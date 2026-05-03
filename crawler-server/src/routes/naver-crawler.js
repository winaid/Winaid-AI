const express = require('express');
const router = express.Router();
const { crawlNaverBlogs, crawlBlogContent, crawlHospitalBlogPosts } = require('../services/crawler');

// Rate limiting 간단 구현
//
// 과거: requestCounts Map 에 IP 별 timestamps 누적. 만료 timestamps 는 filter 로
// 제거되지만 빈 array 가 그대로 set → IP 키 영구 보존 → 장기 운영 시 메모리 누수.
// trust proxy 1 적용 후 req.ip 가 실 client IP 라 unique IP 다양성 ↑ → 누수 가속.
//
// 수정:
//  - lazy cleanup: checkRateLimit 호출 시 빈 array 면 key delete
//  - periodic cleanup: 5분마다 stale entry sweep (long-running container 안전)
//  - hard cap: MAX_TRACKED_IPS 초과 시 oldest 1개 evict (best-effort, FIFO)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1분
const MAX_REQUESTS = parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 30;
const MAX_TRACKED_IPS = 10000;

// 5분마다 만료된 entry sweep
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of requestCounts.entries()) {
    const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (recent.length === 0) requestCounts.delete(ip);
    else if (recent.length !== timestamps.length) requestCounts.set(ip, recent);
  }
}, 5 * 60 * 1000).unref();

/**
 * 네이버 블로그 URL을 hostname 기반으로 엄격하게 검증.
 *
 * 과거의 `url.includes('blog.naver.com')`은 SSRF 우회 가능:
 *   - http://evil.com/?blog.naver.com       (쿼리스트링에 포함)
 *   - http://blog.naver.com.attacker.com    (서브도메인 가장)
 *   - http://attacker.com/blog.naver.com    (경로에 포함)
 * 전부 includes 통과 → 크롤러가 공격자 서버로 요청.
 *
 * 수정: new URL(...)로 파싱 후 hostname 정확 매칭만 통과.
 * `extractBlogId` 등 기존 로직이 `blog.naver.com/{id}` 형태를 가정하므로
 * `m.blog.naver.com` 같은 서브도메인은 지원 대상이 아니라 금지함.
 */
function validateNaverBlogUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, status: 400, error: 'Invalid URL', message: '올바른 URL 형식이 아닙니다.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, status: 400, error: 'Invalid URL', message: 'http/https URL만 지원합니다.' };
  }
  if (parsed.hostname !== 'blog.naver.com') {
    return { ok: false, status: 400, error: 'Invalid URL', message: '네이버 블로그 URL만 지원합니다. (blog.naver.com/...)' };
  }
  return { ok: true };
}

function checkRateLimit(ip) {
  const now = Date.now();
  const userRequests = requestCounts.get(ip) || [];

  // 1분 이내의 요청만 필터링
  const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW);

  if (recentRequests.length >= MAX_REQUESTS) {
    // 누적 timestamps 만 갱신 (성공 횟수 추가 X)
    requestCounts.set(ip, recentRequests);
    return false;
  }

  recentRequests.push(now);

  // hard cap — 신규 IP 진입 시 추적 IP 수 초과면 oldest 1개 evict (FIFO)
  if (!requestCounts.has(ip) && requestCounts.size >= MAX_TRACKED_IPS) {
    const oldestKey = requestCounts.keys().next().value;
    if (oldestKey !== undefined) requestCounts.delete(oldestKey);
  }

  requestCounts.set(ip, recentRequests);
  return true;
}

/**
 * POST /api/naver/crawl-search
 * 네이버 블로그 검색 크롤링
 */
router.post('/crawl-search', async (req, res) => {
  try {
    const { query, maxResults = 30 } = req.body;

    // 입력 검증
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Query is required',
        message: '검색어를 입력해주세요.'
      });
    }

    // Rate limiting
    const ip = req.ip || req.connection.remoteAddress;
    if (!checkRateLimit(ip)) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
      });
    }

    // maxResults 제한
    const limitedMaxResults = Math.min(
      parseInt(maxResults) || 30,
      parseInt(process.env.MAX_RESULTS_PER_REQUEST) || 100
    );

    console.log(`🔍 검색 요청: "${query}" (최대 ${limitedMaxResults}개)`);

    // 크롤링 실행
    const results = await crawlNaverBlogs(query, limitedMaxResults);

    res.json({
      items: results,
      total: results.length,
      query,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('네이버 검색 크롤링 에러:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
});

/**
 * POST /api/naver/crawl-content
 * 블로그 콘텐츠 크롤링
 */
router.post('/crawl-content', async (req, res) => {
  try {
    const { url } = req.body;

    // 입력 검증
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        error: 'URL is required',
        message: 'URL을 입력해주세요.'
      });
    }

    // hostname 정확 매칭 (SSRF 방어 — includes 매칭 금지)
    const check = validateNaverBlogUrl(url);
    if (!check.ok) {
      return res.status(check.status).json({ error: check.error, message: check.message });
    }

    // Rate limiting
    const ip = req.ip || req.connection.remoteAddress;
    if (!checkRateLimit(ip)) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
      });
    }

    console.log(`🕷️ 콘텐츠 크롤링 요청: ${url}`);

    // 크롤링 실행
    const content = await crawlBlogContent(url);

    if (!content) {
      return res.status(404).json({
        error: 'Content Not Found',
        message: '콘텐츠를 찾을 수 없습니다.'
      });
    }

    res.json({
      content,
      url,
      length: content.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('블로그 콘텐츠 크롤링 에러:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
});

/**
 * POST /api/naver/crawl-hospital-blog
 * 병원 네이버 블로그 전체 글 수집 (말투 학습용)
 * body: { blogUrl: string, maxPosts?: number }
 */
router.post('/crawl-hospital-blog', async (req, res) => {
  try {
    const { blogUrl, maxPosts = 10 } = req.body;

    if (!blogUrl || typeof blogUrl !== 'string') {
      return res.status(400).json({ error: 'blogUrl is required', message: '블로그 URL을 입력해주세요.' });
    }

    // hostname 정확 매칭 (SSRF 방어 — includes 매칭 금지)
    const check = validateNaverBlogUrl(blogUrl);
    if (!check.ok) {
      return res.status(check.status).json({ error: check.error, message: check.message });
    }

    const ip = req.ip || req.connection.remoteAddress;
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Too Many Requests', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    }

    const limitedMaxPosts = Math.min(parseInt(maxPosts) || 10, 20);
    console.log(`🏥 병원 블로그 크롤링 시작: ${blogUrl} (최대 ${limitedMaxPosts}개)`);

    const result = await crawlHospitalBlogPosts(blogUrl, limitedMaxPosts);

    res.json({
      success: true,
      blogUrl,
      blogId: result.blogId,
      posts: result.posts,
      postsCount: result.posts.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('병원 블로그 크롤링 에러:', error);
    res.status(500).json({
      error: 'Crawling Failed',
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
});

module.exports = router;
