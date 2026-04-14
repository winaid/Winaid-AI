const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Stealth 플러그인 적용 — headless 브라우저 탐지 우회
puppeteer.use(StealthPlugin());

let browser = null;

// ────────────────────────────────────────────────
// 유틸리티
// ────────────────────────────────────────────────

/** request-scoped 타이머 (모듈 레벨 변수 대신) */
function createTimer() {
  const start = Date.now();
  return {
    elapsed() { return `${((Date.now() - start) / 1000).toFixed(1)}s`; },
    ms() { return Date.now() - start; },
  };
}

/** logNo 추출 — 여러 URL 형식 대응 */
function extractLogNo(href, blogId) {
  if (!href) return null;
  // logNo=223456789
  const qsMatch = href.match(/logNo=(\d+)/);
  if (qsMatch) return qsMatch[1];
  // blog.naver.com/blogId/223456789
  const pathMatch = href.match(new RegExp(`(?:blog\\.naver\\.com|m\\.blog\\.naver\\.com)/${blogId}/(\\d{8,})`));
  if (pathMatch) return pathMatch[1];
  // PostView.naver?blogId=xxx&logNo=123
  const pvMatch = href.match(/PostView\.naver[^"]*logNo=(\d+)/);
  if (pvMatch) return pvMatch[1];
  return null;
}

/** RSS에서 <item> 단위로 logNo + pubDate 추출 */
function extractRssItems(xml, blogId) {
  const items = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch;
  while ((itemMatch = itemPattern.exec(xml)) !== null) {
    const block = itemMatch[1];
    // <link> — 개행 뒤 URL 대응
    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    if (!linkMatch) continue;
    const logNo = extractLogNo(linkMatch[1].trim(), blogId);
    if (!logNo) continue;

    // <pubDate>
    let publishedAt = '';
    const dateMatch = block.match(/<pubDate>([^<]+)<\/pubDate>/i);
    if (dateMatch) {
      const d = new Date(dateMatch[1].trim());
      if (!isNaN(d.getTime())) publishedAt = d.toISOString();
    }

    items.push({ logNo, publishedAt });
  }
  return items;
}

/** 하위 호환 — logNo만 필요한 곳용 */
function extractRssLinks(xml, blogId) {
  return extractRssItems(xml, blogId).map(i => i.logNo);
}

/**
 * 시스템에 설치된 Chromium 경로 탐색
 */
function findChromiumPath() {
  const fs = require('fs');
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    'Chromium을 찾을 수 없습니다. PUPPETEER_EXECUTABLE_PATH 환경변수를 설정하세요.\n' +
    `탐색 경로: ${candidates.join(', ')}`
  );
}

/**
 * 브라우저 인스턴스 가져오기 (싱글톤)
 */
async function getBrowser() {
  if (browser && browser.isConnected()) {
    return browser;
  }

  const executablePath = findChromiumPath();
  console.log(`[Browser] Puppeteer+Stealth 시작 중... (${executablePath})`);

  browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080',
    ],
    timeout: parseInt(process.env.BROWSER_TIMEOUT) || 30000
  });

  console.log('[Browser] Puppeteer+Stealth 시작 완료');
  return browser;
}

// ────────────────────────────────────────────────
// 1. 네이버 블로그 검색 크롤링
// ────────────────────────────────────────────────

async function crawlNaverBlogs(query, maxResults = 30) {
  const timer = createTimer();
  const results = [];
  let page = null;

  try {
    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 날짜 필터 (최근 1년)
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);
    const fmt = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

    console.log(`[Search] "${query}" (최근 1년, 최대 ${maxResults}개) [${timer.elapsed()}]`);

    const pagesNeeded = Math.ceil(maxResults / 10);

    for (let pageNum = 1; pageNum <= Math.min(pagesNeeded, 10); pageNum++) {
      const start = (pageNum - 1) * 10 + 1;
      const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(query)}&start=${start}&sm=tab_opt&nso=so:sim,p:from${fmt(oneYearAgo)}to${fmt(today)}`;

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      const pageResults = await page.evaluate(() => {
        const items = [];
        const blogItems = document.querySelectorAll('.blog_content_area, .detail_box, .total_wrap');

        blogItems.forEach((item) => {
          try {
            const titleEl = item.querySelector('.title_link, .total_tit, a[href*="blog.naver.com"]');
            const title = titleEl ? titleEl.textContent.trim() : '';
            const link = titleEl ? titleEl.href : '';
            const descEl = item.querySelector('.dsc_link, .total_sub, .detail_txt');
            const description = descEl ? descEl.textContent.trim() : '';
            const bloggerEl = item.querySelector('.name, .sub_txt, .source_txt');
            const bloggername = bloggerEl ? bloggerEl.textContent.trim() : '';

            if (title && link && link.includes('blog.naver.com')) {
              items.push({ title, link, description, bloggername });
            }
          } catch (e) { /* skip */ }
        });

        return items;
      });

      console.log(`[Search] p${pageNum}: ${pageResults.length}개 [${timer.elapsed()}]`);
      results.push(...pageResults);

      if (results.length >= maxResults || pageResults.length === 0) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[Search] 완료: ${results.length}개 [${timer.elapsed()}]`);
    return results.slice(0, maxResults);

  } catch (error) {
    console.error(`[Search] 실패 [${timer.elapsed()}]:`, error.message);
    throw error;
  } finally {
    if (page) await page.close();
  }
}

// ────────────────────────────────────────────────
// 2. 단일 블로그 콘텐츠 크롤링
// ────────────────────────────────────────────────

async function crawlBlogContent(url) {
  const timer = createTimer();
  let page = null;

  try {
    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log(`[Content] 크롤링: ${url} [${timer.elapsed()}]`);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // iframe 처리 (네이버 블로그는 iframe 사용)
    const frames = page.frames();
    const mainFrame = frames.find(frame =>
      frame.url().includes('blog.naver.com') &&
      frame.url().includes('PostView')
    ) || page.mainFrame();

    const content = await mainFrame.evaluate(() => {
      const selectors = [
        '.se-main-container',
        '#postViewArea',
        '.post-view',
        '#post-area',
        '.post_ct'
      ];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) return el.textContent.trim();
      }
      return document.body.textContent.trim();
    });

    console.log(`[Content] 완료: ${content.length}자 [${timer.elapsed()}]`);
    return content;

  } catch (error) {
    console.error(`[Content] 실패 [${timer.elapsed()}]:`, error.message);
    return null;
  } finally {
    if (page) await page.close();
  }
}

// ────────────────────────────────────────────────
// 3. 병원 블로그 전체 글 목록 크롤링 (말투 학습용)
// ────────────────────────────────────────────────
//
// 속도 최적화:
//  - logNo 수집: fetch 기반 (RSS → PostTitleListAsync), Puppeteer는 최후 수단
//  - 글 본문 수집: fetch + HTML 파싱 (Puppeteer 대비 10배 빠름), 3개씩 병렬
//  - fetch 실패 시만 Puppeteer fallback

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://blog.naver.com/',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
};

/**
 * fetch로 네이버 블로그 글 하나의 본문 + 메타데이터 추출
 * Puppeteer 없이 HTTP fetch + HTML 파싱 — 0.5~1초면 끝남
 */
async function fetchPostData(blogId, logNo) {
  const postViewUrl = `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`;
  const urls = [
    postViewUrl,
    `https://m.blog.naver.com/${blogId}/${logNo}`,  // 모바일 fallback
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;

      const html = await res.text();

      // 제목: og:title
      const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]*?)"/i)
                       || html.match(/<meta\s+content="([^"]*?)"\s+property="og:title"/i);
      const title = titleMatch ? decodeHtml(titleMatch[1]) : '';

      // 날짜: 여러 패턴 시도
      let publishedAt = '';
      const datePatterns = [
        // og:createdate (네이버 표준)
        /<meta\s+property="og:createdate"\s+content="([^"]+)"/i,
        /<meta\s+content="([^"]+)"\s+property="og:createdate"/i,
        // article:published_time
        /<meta\s+property="article:published_time"\s+content="([^"]+)"/i,
        /<meta\s+content="([^"]+)"\s+property="article:published_time"/i,
        // se_publishDate (스마트에디터)
        /class="[^"]*se_publishDate[^"]*"[^>]*>([^<]+)/i,
        // blog2_series date
        /class="[^"]*blog_date[^"]*"[^>]*>([^<]+)/i,
        // 날짜 패턴 (2026. 3. 25. / 2026-03-25 / 2026.03.25)
        /class="[^"]*date[^"]*"[^>]*>\s*(\d{4}[\s./-]+\d{1,2}[\s./-]+\d{1,2})/i,
        // se-date (스마트에디터 ONE)
        /class="[^"]*se-date[^"]*"[^>]*>([^<]+)/i,
        // 본문 내 날짜 span
        /<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)<\/span>/i,
      ];
      for (const pat of datePatterns) {
        const dm = pat.exec(html);
        if (dm && dm[1]) {
          const raw = dm[1].trim();
          // ISO 형식이면 그대로
          if (raw.includes('T') && raw.includes('-')) {
            const d = new Date(raw);
            if (!isNaN(d.getTime())) { publishedAt = raw; break; }
          }
          // 2026. 3. 25. 또는 2026-03-25 형식
          const dotMatch = raw.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
          if (dotMatch) {
            publishedAt = new Date(Number(dotMatch[1]), Number(dotMatch[2]) - 1, Number(dotMatch[3])).toISOString();
            break;
          }
          const dashMatch = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
          if (dashMatch) {
            publishedAt = new Date(Number(dashMatch[1]), Number(dashMatch[2]) - 1, Number(dashMatch[3])).toISOString();
            break;
          }
          // 그 외 Date 파싱 시도
          const d = new Date(raw);
          if (!isNaN(d.getTime())) { publishedAt = d.toISOString(); break; }
        }
      }

      // 썸네일: og:image
      const imgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]*?)"/i)
                     || html.match(/<meta\s+content="([^"]*?)"\s+property="og:image"/i);
      const thumbnail = imgMatch ? imgMatch[1] : '';

      // 본문: se-text-paragraph 추출 (네이버 스마트에디터)
      // NOTE: 기존 regex 는 closing 을 `</[^>]+>` 로 잡아 nested <span> 의 첫 닫기에서 끝났음.
      //       `<(p|div) ... class="...se-text-paragraph...">...</\1>` 로 태그 일치 강제 + nested 허용.
      //       capture group: [1]=태그명, [2]=본문
      const paragraphPattern = /<(p|div)[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/\1>/g;
      const paragraphs = [];
      let match;
      while ((match = paragraphPattern.exec(html)) !== null) {
        const text = match[2]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/&lsquo;/g, '\u2018').replace(/&rsquo;/g, '\u2019')
          .replace(/&ldquo;/g, '\u201C').replace(/&rdquo;/g, '\u201D')
          .replace(/&hellip;/g, '\u2026').replace(/&mdash;/g, '\u2014').replace(/&ndash;/g, '\u2013')
          .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
          .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
          .replace(/\s+/g, ' ')
          .trim();
        if (text.length > 5) paragraphs.push(text);
      }

      // se-text-paragraph 없으면 postViewArea fallback
      let content = paragraphs.join('\n\n');
      if (content.length < 100) {
        const areaMatch = html.match(/id="postViewArea"[^>]*>([\s\S]*?)<\/div>/i);
        if (areaMatch) {
          content = areaMatch[1]
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim();
        }
      }

      if (content.length > 100) {
        return { title, publishedAt, thumbnail, content };
      }
    } catch { /* try next URL */ }
  }
  return null;  // fetch 전부 실패
}

/** HTML 엔티티 디코딩 */
function decodeHtml(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&lsquo;/g, '\u2018').replace(/&rsquo;/g, '\u2019')
    .replace(/&ldquo;/g, '\u201C').replace(/&rdquo;/g, '\u201D')
    .replace(/&hellip;/g, '\u2026').replace(/&mdash;/g, '\u2014').replace(/&ndash;/g, '\u2013')
    .replace(/&bull;/g, '\u2022').replace(/&middot;/g, '\u00B7')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * Puppeteer fallback — fetch로 본문을 못 가져온 글만 여기로
 */
async function fetchPostDataPuppeteer(browserInstance, blogId, logNo) {
  let postPage = null;
  try {
    postPage = await browserInstance.newPage();
    await postPage.setUserAgent(FETCH_HEADERS['User-Agent']);

    const urls = [
      `https://blog.naver.com/${blogId}/${logNo}`,
      `https://m.blog.naver.com/${blogId}/${logNo}`,
    ];

    let navigated = false;
    for (const url of urls) {
      const resp = await postPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
      if (resp && resp.status() < 400) { navigated = true; break; }
    }
    if (!navigated) return null;

    const postData = await postPage.evaluate(() => {
      let title = '';
      const titleEl = document.querySelector('.se-title-text, .pcol1, .itemSubjectBoldfont, ._titleArea, .tit_h3');
      if (titleEl) title = titleEl.textContent?.trim() || '';
      if (!title) title = document.title?.replace(/\s*:\s*네이버\s*블로그$/i, '').trim() || '';

      let publishedAt = '';
      const ogDate = document.querySelector('meta[property="og:createdate"]') || document.querySelector('meta[property="article:published_time"]');
      if (ogDate) publishedAt = ogDate.getAttribute('content') || '';

      let thumbnail = '';
      const ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg) thumbnail = ogImg.getAttribute('content') || '';

      let content = '';
      const selectors = ['.se-main-container', '#postViewArea', '.post-view', '#post-area', '.post_ct', '.post_ct_body', '.se_component_wrap'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent?.trim().length > 50) { content = el.textContent.trim(); break; }
      }
      return { title, publishedAt, thumbnail, content };
    });

    return (postData.content && postData.content.length > 100) ? postData : null;
  } catch { return null; }
  finally { if (postPage) await postPage.close().catch(() => {}); }
}

async function crawlHospitalBlogPosts(blogUrl, maxPosts = 10) {
  const timer = createTimer();
  let page = null;

  try {
    const blogIdMatch = blogUrl.match(/blog\.naver\.com\/([^/?#]+)/);
    if (!blogIdMatch) {
      throw new Error('올바른 네이버 블로그 URL이 아닙니다. (예: https://blog.naver.com/example)');
    }
    const blogId = blogIdMatch[1];
    const candidates = Math.min(maxPosts + 5, 20);

    console.log(`[HospBlog] blogId=${blogId}, 목표=${maxPosts}개 [${timer.elapsed()}]`);

    // ── 1단계: logNo 수집 (fetch 기반, 빠름) ──
    const seenLogNos = new Set();
    const allLogNos = [];
    const rssDateMap = new Map(); // logNo → publishedAt (RSS에서 얻은 날짜)

    const addLogNos = (logNos, source) => {
      let added = 0;
      for (const logNo of logNos) {
        if (!seenLogNos.has(logNo)) {
          seenLogNos.add(logNo);
          allLogNos.push(logNo);
          added++;
        }
      }
      if (added > 0) console.log(`[HospBlog] ${source}: +${added}개 (누적 ${allLogNos.length}개) [${timer.elapsed()}]`);
    };

    // 1-A: RSS + PostTitleListAsync 동시 시도
    const [rssResult, apiResult] = await Promise.allSettled([
      // RSS (logNo + pubDate)
      (async () => {
        const rssUrl = `https://rss.blog.naver.com/${blogId}.xml`;
        const res = await fetch(rssUrl, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(5000) });
        if (!res.ok) return [];
        const xml = await res.text();
        const items = extractRssItems(xml, blogId);
        // 날짜 저장
        for (const item of items) {
          if (item.publishedAt) rssDateMap.set(item.logNo, item.publishedAt);
        }
        return items.map(i => i.logNo);
      })(),
      // PostTitleListAsync
      (async () => {
        const logNos = [];
        for (let pg = 1; pg <= 2; pg++) {
          const apiUrl = `https://blog.naver.com/PostTitleListAsync.naver?blogId=${blogId}&viewdate=&currentPage=${pg}&categoryNo=0&parentCategoryNo=0&countPerPage=10`;
          const res = await fetch(apiUrl, {
            headers: { ...FETCH_HEADERS, 'Referer': `https://blog.naver.com/${blogId}`, 'X-Requested-With': 'XMLHttpRequest' },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) break;
          const text = await res.text();
          const matches = text.match(/"logNo"\s*:\s*"?(\d+)"?/g) || [];
          const pageLogNos = matches.map(m => { const n = m.match(/(\d+)/); return n ? n[1] : null; }).filter(Boolean);
          logNos.push(...pageLogNos);
          if (pageLogNos.length === 0) break;
        }
        return logNos;
      })(),
    ]);

    if (rssResult.status === 'fulfilled') addLogNos(rssResult.value, 'RSS');
    if (apiResult.status === 'fulfilled') addLogNos(apiResult.value, 'PostTitleListAsync');

    // 1-B: Puppeteer fallback (위에서 부족할 때만)
    if (allLogNos.length < candidates) {
      try {
        console.log(`[HospBlog] Puppeteer fallback for logNo [${timer.elapsed()}]`);
        const browserInstance = await getBrowser();
        page = await browserInstance.newPage();
        await page.setUserAgent(FETCH_HEADERS['User-Agent']);

        const blogListUrl = `https://blog.naver.com/PostList.naver?blogId=${blogId}&categoryNo=0&currentPage=1&postListType=&blogType=B`;
        const resp = await page.goto(blogListUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);

        if (resp && resp.status() < 400) {
          const pageLogNos = await page.evaluate((bid) => {
            const logNos = [];
            document.querySelectorAll('a[href]').forEach(a => {
              const href = a.href || '';
              const m = href.match(/logNo=(\d+)/) || href.match(new RegExp(`${bid}/(\\d{8,})`));
              if (m) logNos.push(m[1]);
            });
            return logNos;
          }, blogId);
          addLogNos(pageLogNos, 'PostList Puppeteer');
        }
        await page.close();
        page = null;
      } catch (e) {
        console.log(`[HospBlog] PostList Puppeteer 실패: ${e.message} [${timer.elapsed()}]`);
      }
    }

    if (allLogNos.length === 0) {
      throw new Error(`글 목록을 가져올 수 없습니다. blogId=${blogId} — RSS/API/HTML 모두 실패`);
    }

    // logNo 내림차순 → 최신순
    allLogNos.sort((a, b) => Number(b) - Number(a));
    const targetLogNos = allLogNos.slice(0, candidates);
    console.log(`[HospBlog] 후보 ${targetLogNos.length}개 [${timer.elapsed()}]`);

    // ── 2단계: 글 본문 수집 (fetch 병렬, 3개씩) ──
    const results = [];
    let skipped = 0;
    const CONCURRENCY = 3;

    for (let i = 0; i < targetLogNos.length && results.length < maxPosts; i += CONCURRENCY) {
      const batch = targetLogNos.slice(i, i + CONCURRENCY).filter(() => results.length + (i > 0 ? 0 : 0) < maxPosts + CONCURRENCY);

      const batchResults = await Promise.allSettled(
        batch.map(logNo => fetchPostData(blogId, logNo))
      );

      for (let j = 0; j < batchResults.length; j++) {
        if (results.length >= maxPosts) break;
        const logNo = batch[j];
        const r = batchResults[j];

        if (r.status === 'fulfilled' && r.value) {
          const postData = r.value;
          let publishedAtISO = '';
          // 본문에서 추출한 날짜 → RSS 날짜 fallback
          const rawDate = postData.publishedAt || rssDateMap.get(logNo) || '';
          if (rawDate) {
            try { const d = new Date(rawDate); if (!isNaN(d.getTime())) publishedAtISO = d.toISOString(); } catch {}
          }
          results.push({
            url: `https://blog.naver.com/${blogId}/${logNo}`,
            content: postData.content.slice(0, 30000),  // 말투 학습 재료 확보. 기존 3000 → 30000 (네이버 블로그 최대 본문 커버)
            title: postData.title || '',
            publishedAt: publishedAtISO,
            summary: postData.content.substring(0, 200).replace(/\n/g, ' ').trim(),
            thumbnail: postData.thumbnail || '',
          });
        } else {
          // fetch 실패 → Puppeteer fallback (한 번에 하나씩)
          console.log(`[HospBlog] fetch 실패 ${logNo}, Puppeteer 시도 [${timer.elapsed()}]`);
          const browserInstance = await getBrowser();
          const postData = await fetchPostDataPuppeteer(browserInstance, blogId, logNo);
          if (postData) {
            let publishedAtISO = '';
            const rawDate = postData.publishedAt || rssDateMap.get(logNo) || '';
            if (rawDate) {
              try { const d = new Date(rawDate); if (!isNaN(d.getTime())) publishedAtISO = d.toISOString(); } catch {}
            }
            results.push({
              url: `https://blog.naver.com/${blogId}/${logNo}`,
              content: postData.content.slice(0, 30000),  // 말투 학습 재료 확보. 기존 3000 → 30000
              title: postData.title || '',
              publishedAt: publishedAtISO,
              summary: postData.content.substring(0, 200).replace(/\n/g, ' ').trim(),
              thumbnail: postData.thumbnail || '',
            });
          } else {
            skipped++;
          }
        }
      }

      // 배치 간 짧은 딜레이 (차단 방지)
      if (i + CONCURRENCY < targetLogNos.length && results.length < maxPosts) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // ── 3단계: publishedAt 내림차순 정렬 ──
    const dateCount = results.filter(r => r.publishedAt).length;
    results.sort((a, b) => {
      if (a.publishedAt && b.publishedAt) return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      if (a.publishedAt && !b.publishedAt) return -1;
      if (!a.publishedAt && b.publishedAt) return 1;
      return 0;
    });

    console.log(`[HospBlog] 완료: ${results.length}/${maxPosts}개, 스킵 ${skipped}, 날짜 ${dateCount}/${results.length}개 [${timer.elapsed()}]`);
    results.forEach((p, i) => {
      console.log(`  ${i + 1}. [${p.publishedAt?.substring(0, 10) || 'N/A'}] ${p.title?.substring(0, 40) || p.url}`);
    });

    return { blogId, posts: results };

  } catch (error) {
    console.error(`[HospBlog] 에러 [${timer.elapsed()}]:`, error.message);
    throw error;
  } finally {
    if (page) await page.close();
  }
}

/**
 * 브라우저 종료
 */
async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    console.log('[Browser] 종료');
  }
}

module.exports = {
  crawlNaverBlogs,
  crawlBlogContent,
  crawlHospitalBlogPosts,
  closeBrowser
};
