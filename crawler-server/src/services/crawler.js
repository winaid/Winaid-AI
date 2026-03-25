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

/** RSS <link> 태그에서 URL 추출 — 개행 뒤에 URL이 오는 경우 대응 */
function extractRssLinks(xml, blogId) {
  const logNos = [];
  // RSS의 <item> 안에 <link> 태그가 있고, \n 뒤에 실제 URL이 오는 경우가 있음
  // 예: <link>\nhttps://blog.naver.com/blogId/223456789\n</link>
  const linkPattern = /<link[^>]*>([\s\S]*?)<\/link>/gi;
  let match;
  while ((match = linkPattern.exec(xml)) !== null) {
    const linkText = match[1].trim();
    const logNo = extractLogNo(linkText, blogId);
    if (logNo) logNos.push(logNo);
  }
  return logNos;
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
// 전략 (3단계 fallback으로 logNo 수집):
//  1순위: RSS 피드 (blog.naver.com/PostList.naver?...&feedType=atom)
//  2순위: PostTitleListAsync JSON API (차단이 덜함)
//  3순위: PostList HTML Puppeteer (기존 방식, 403 위험)
//
// 그 후 각 글 본문 수집 시:
//  1순위: PC URL (blog.naver.com/blogId/logNo)
//  2순위: 모바일 URL (m.blog.naver.com/blogId/logNo) — 차단이 덜함

async function crawlHospitalBlogPosts(blogUrl, maxPosts = 10) {
  const timer = createTimer();
  let page = null;

  try {
    const blogIdMatch = blogUrl.match(/blog\.naver\.com\/([^/?#]+)/);
    if (!blogIdMatch) {
      throw new Error('올바른 네이버 블로그 URL이 아닙니다. (예: https://blog.naver.com/example)');
    }
    const blogId = blogIdMatch[1];
    const candidates = Math.min(maxPosts + 10, 30);

    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log(`[HospBlog] blogId=${blogId}, 목표=${maxPosts}개 [${timer.elapsed()}]`);

    // ── 1단계: logNo 수집 (3단계 fallback) ──
    const seenLogNos = new Set();
    const allLogNos = [];

    const addLogNos = (logNos, source) => {
      let added = 0;
      for (const logNo of logNos) {
        if (!seenLogNos.has(logNo)) {
          seenLogNos.add(logNo);
          allLogNos.push(logNo);
          added++;
        }
      }
      console.log(`[HospBlog] ${source}: +${added}개 (누적 ${allLogNos.length}개) [${timer.elapsed()}]`);
    };

    // ─── 1-A: RSS 피드 시도 ───
    try {
      console.log(`[HospBlog] 1-A: RSS 피드 시도 [${timer.elapsed()}]`);
      const rssUrl = `https://rss.blog.naver.com/${blogId}.xml`;
      const rssResponse = await fetch(rssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (rssResponse.ok) {
        const rssXml = await rssResponse.text();
        const rssLogNos = extractRssLinks(rssXml, blogId);
        addLogNos(rssLogNos, 'RSS');
      } else {
        console.log(`[HospBlog] RSS 응답: ${rssResponse.status} [${timer.elapsed()}]`);
      }
    } catch (e) {
      console.log(`[HospBlog] RSS 실패: ${e.message} [${timer.elapsed()}]`);
    }

    // ─── 1-B: PostTitleListAsync JSON API 시도 ───
    if (allLogNos.length < candidates) {
      try {
        console.log(`[HospBlog] 1-B: PostTitleListAsync API 시도 [${timer.elapsed()}]`);
        for (let pg = 1; pg <= 3 && allLogNos.length < candidates; pg++) {
          const apiUrl = `https://blog.naver.com/PostTitleListAsync.naver?blogId=${blogId}&viewdate=&currentPage=${pg}&categoryNo=0&parentCategoryNo=0&countPerPage=10`;
          const apiResponse = await fetch(apiUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': `https://blog.naver.com/${blogId}`,
              'X-Requested-With': 'XMLHttpRequest',
            },
            signal: AbortSignal.timeout(10000),
          });

          if (!apiResponse.ok) {
            console.log(`[HospBlog] PostTitleListAsync p${pg}: ${apiResponse.status} [${timer.elapsed()}]`);
            break;
          }

          const apiText = await apiResponse.text();
          // logNo를 텍스트에서 추출 (JSON이 깨질 수 있으므로 regex)
          const logNoMatches = apiText.match(/"logNo"\s*:\s*"?(\d+)"?/g) || [];
          const pageLogNos = logNoMatches.map(m => {
            const n = m.match(/(\d+)/);
            return n ? n[1] : null;
          }).filter(Boolean);

          addLogNos(pageLogNos, `PostTitleListAsync p${pg}`);
          if (pageLogNos.length === 0) break;
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (e) {
        console.log(`[HospBlog] PostTitleListAsync 실패: ${e.message} [${timer.elapsed()}]`);
      }
    }

    // ─── 1-C: PostList HTML Puppeteer (최후 수단) ───
    if (allLogNos.length < candidates) {
      try {
        console.log(`[HospBlog] 1-C: PostList Puppeteer 시도 [${timer.elapsed()}]`);
        let pgNum = 1;
        while (allLogNos.length < candidates && pgNum <= 3) {
          const blogListUrl = `https://blog.naver.com/PostList.naver?blogId=${blogId}&categoryNo=0&currentPage=${pgNum}&postListType=&blogType=B`;

          const response = await page.goto(blogListUrl, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null);

          if (!response || response.status() === 403) {
            console.log(`[HospBlog] PostList p${pgNum}: 차단(403) 또는 네트워크 실패 [${timer.elapsed()}]`);
            // 모바일 URL fallback
            const mobileListUrl = `https://m.blog.naver.com/${blogId}?tab=1&currentPage=${pgNum}`;
            console.log(`[HospBlog] 모바일 fallback: ${mobileListUrl} [${timer.elapsed()}]`);
            const mResp = await page.goto(mobileListUrl, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null);
            if (!mResp || mResp.status() >= 400) {
              console.log(`[HospBlog] 모바일도 실패 [${timer.elapsed()}]`);
              break;
            }
          }

          const pageLogNos = await page.evaluate((bid) => {
            const logNos = [];
            const anchors = document.querySelectorAll('a[href]');
            anchors.forEach(a => {
              const href = a.href || '';
              // logNo= 쿼리 파라미터
              const qsMatch = href.match(/logNo=(\d+)/);
              if (qsMatch) { logNos.push(qsMatch[1]); return; }
              // /blogId/223456789 경로
              const pathMatch = href.match(new RegExp(`(?:blog\\.naver\\.com|m\\.blog\\.naver\\.com)/${bid}/(\\d{8,})`));
              if (pathMatch) logNos.push(pathMatch[1]);
            });
            return logNos;
          }, blogId);

          addLogNos(pageLogNos, `PostList p${pgNum}`);
          if (pageLogNos.length === 0) break;
          pgNum++;
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (e) {
        console.log(`[HospBlog] PostList Puppeteer 실패: ${e.message} [${timer.elapsed()}]`);
      }
    }

    // logNo가 하나도 없으면 에러
    if (allLogNos.length === 0) {
      throw new Error(`글 목록을 가져올 수 없습니다. blogId=${blogId} — RSS/API/HTML 모두 실패`);
    }

    // logNo 내림차순 (큰 번호 = 최신)
    allLogNos.sort((a, b) => Number(b) - Number(a));
    const targetLogNos = allLogNos.slice(0, candidates);
    console.log(`[HospBlog] 후보 ${targetLogNos.length}개, 목표 ${maxPosts}개 [${timer.elapsed()}]`);

    // ── 2단계: 각 글 본문 + 날짜 수집 ──
    const results = [];
    let skipped = 0;

    for (const logNo of targetLogNos) {
      if (results.length >= maxPosts) break;

      const postUrl = `https://blog.naver.com/${blogId}/${logNo}`;
      let postPage = null;
      try {
        console.log(`[HospBlog] 글 ${results.length + 1}/${maxPosts}: ${logNo} [${timer.elapsed()}]`);

        postPage = await browserInstance.newPage();
        await postPage.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // PC URL 시도, 실패 시 모바일 fallback
        let navigated = false;
        const pcResponse = await postPage.goto(postUrl, { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => null);

        if (pcResponse && pcResponse.status() < 400) {
          navigated = true;
        } else {
          const mobileUrl = `https://m.blog.naver.com/${blogId}/${logNo}`;
          console.log(`[HospBlog] PC 차단, 모바일 시도: ${mobileUrl} [${timer.elapsed()}]`);
          const mResp = await postPage.goto(mobileUrl, { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => null);
          if (mResp && mResp.status() < 400) navigated = true;
        }

        if (!navigated) {
          console.log(`[HospBlog] 글 접근 실패: ${logNo} [${timer.elapsed()}]`);
          skipped++;
          await postPage.close();
          continue;
        }

        const postData = await postPage.evaluate(() => {
          // 제목
          let title = '';
          const titleEl = document.querySelector('.se-title-text, .pcol1, .itemSubjectBoldfont, ._titleArea, .tit_h3');
          if (titleEl) title = titleEl.textContent?.trim() || '';
          if (!title) title = document.title?.replace(/\s*:\s*네이버\s*블로그$/i, '').trim() || '';

          // 날짜: og:createdate 메타태그
          let publishedAt = '';
          const ogDate = document.querySelector('meta[property="og:createdate"]');
          if (ogDate) publishedAt = ogDate.getAttribute('content') || '';
          // fallback: article:published_time
          if (!publishedAt) {
            const artDate = document.querySelector('meta[property="article:published_time"]');
            if (artDate) publishedAt = artDate.getAttribute('content') || '';
          }

          // 썸네일: og:image
          let thumbnail = '';
          const ogImg = document.querySelector('meta[property="og:image"]');
          if (ogImg) thumbnail = ogImg.getAttribute('content') || '';

          // 본문 (여러 셀렉터 시도)
          let content = '';
          const selectors = [
            '.se-main-container',
            '#postViewArea',
            '.post-view',
            '#post-area',
            '.post_ct',
            // 모바일 셀렉터
            '.post_ct_body',
            '.se_component_wrap',
            '#viewTypeSelector',
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent?.trim().length > 50) {
              content = el.textContent.trim();
              break;
            }
          }

          return { title, publishedAt, thumbnail, content };
        });

        await postPage.close();
        postPage = null;

        if (postData.content && postData.content.length > 100) {
          // 날짜 정규화
          let publishedAtISO = '';
          if (postData.publishedAt) {
            try {
              const d = new Date(postData.publishedAt);
              if (!isNaN(d.getTime())) publishedAtISO = d.toISOString();
            } catch { /* ignore */ }
          }

          results.push({
            url: postUrl,
            content: postData.content.slice(0, 3000),
            title: postData.title || '',
            publishedAt: publishedAtISO,
            summary: postData.content.substring(0, 200).replace(/\n/g, ' ').trim(),
            thumbnail: postData.thumbnail || '',
          });
        } else {
          console.log(`[HospBlog] 본문 부족 스킵: ${logNo} (${postData.content?.length || 0}자) [${timer.elapsed()}]`);
          skipped++;
        }

        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        console.error(`[HospBlog] 글 수집 실패 (${logNo}): ${e.message} [${timer.elapsed()}]`);
        skipped++;
        if (postPage) await postPage.close().catch(() => {});
      }
    }

    // ── 3단계: publishedAt 내림차순 최종 정렬 ──
    const dateCount = results.filter(r => r.publishedAt).length;
    results.sort((a, b) => {
      if (a.publishedAt && b.publishedAt) {
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      }
      if (a.publishedAt && !b.publishedAt) return -1;
      if (!a.publishedAt && b.publishedAt) return 1;
      return 0;
    });

    console.log(`[HospBlog] 완료: ${results.length}/${maxPosts}개 수집, 스킵 ${skipped}개, 날짜 ${dateCount}/${results.length}개 [${timer.elapsed()}]`);
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
