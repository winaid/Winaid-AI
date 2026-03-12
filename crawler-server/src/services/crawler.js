const puppeteer = require('puppeteer');

let browser = null;

/**
 * 브라우저 인스턴스 가져오기 (싱글톤)
 */
async function getBrowser() {
  if (browser && browser.isConnected()) {
    return browser;
  }

  console.log('🌐 Puppeteer 브라우저 시작 중...');
  
  browser = await puppeteer.launch({
    headless: process.env.HEADLESS !== 'false',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ],
    timeout: parseInt(process.env.BROWSER_TIMEOUT) || 30000
  });

  console.log('✅ Puppeteer 브라우저 시작 완료');
  return browser;
}

/**
 * 네이버 블로그 검색 페이지 크롤링
 */
async function crawlNaverBlogs(query, maxResults = 30) {
  const results = [];
  let page = null;

  try {
    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();

    // User-Agent 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 날짜 필터 계산 (1년 전 ~ 오늘)
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);

    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}${month}${day}`;
    };

    const startDate = formatDate(oneYearAgo);
    const endDate = formatDate(today);

    console.log(`🔍 네이버 검색: "${query}" (최근 1년)`);

    // 페이지 수 계산
    const pagesNeeded = Math.ceil(maxResults / 10);
    
    for (let pageNum = 1; pageNum <= Math.min(pagesNeeded, 10); pageNum++) {
      const start = (pageNum - 1) * 10 + 1;
      
      // 정확도순 + 날짜 필터
      const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(
        query
      )}&start=${start}&sm=tab_opt&nso=so:sim,p:from${startDate}to${endDate}`;

      console.log(`📄 페이지 ${pageNum} 크롤링 중...`);

      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // 검색 결과 추출
      const pageResults = await page.evaluate(() => {
        const items = [];
        
        // 블로그 검색 결과 요소 찾기
        const blogItems = document.querySelectorAll('.blog_content_area, .detail_box, .total_wrap');
        
        blogItems.forEach((item) => {
          try {
            // 제목 추출
            const titleEl = item.querySelector('.title_link, .total_tit, a[href*="blog.naver.com"]');
            const title = titleEl ? titleEl.textContent.trim() : '';
            
            // URL 추출
            const link = titleEl ? titleEl.href : '';
            
            // 설명 추출
            const descEl = item.querySelector('.dsc_link, .total_sub, .detail_txt');
            const description = descEl ? descEl.textContent.trim() : '';
            
            // 블로거명 추출
            const bloggerEl = item.querySelector('.name, .sub_txt, .source_txt');
            const bloggername = bloggerEl ? bloggerEl.textContent.trim() : '';
            
            if (title && link && link.includes('blog.naver.com')) {
              items.push({
                title,
                link,
                description,
                bloggername
              });
            }
          } catch (e) {
            console.error('항목 파싱 에러:', e);
          }
        });
        
        return items;
      });

      console.log(`✅ 페이지 ${pageNum}: ${pageResults.length}개 발견`);
      results.push(...pageResults);

      if (results.length >= maxResults || pageResults.length === 0) {
        break;
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`📊 총 ${results.length}개 블로그 URL 추출`);
    return results.slice(0, maxResults);

  } catch (error) {
    console.error('❌ 네이버 크롤링 에러:', error);
    throw error;
  } finally {
    if (page) {
      await page.close();
    }
  }
}

/**
 * 블로그 콘텐츠 크롤링
 */
async function crawlBlogContent(url) {
  let page = null;

  try {
    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log(`🕷️ 블로그 콘텐츠 크롤링: ${url}`);

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // iframe 처리 (네이버 블로그는 iframe 사용)
    const frames = page.frames();
    const mainFrame = frames.find(frame => 
      frame.url().includes('blog.naver.com') && 
      frame.url().includes('PostView')
    ) || page.mainFrame();

    // 본문 추출
    const content = await mainFrame.evaluate(() => {
      const selectors = [
        '.se-main-container',
        '#postViewArea',
        '.post-view',
        '#post-area',
        '.post_ct'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          return element.textContent.trim();
        }
      }

      return document.body.textContent.trim();
    });

    console.log(`✅ 콘텐츠 추출 완료: ${content.length}자`);
    return content;

  } catch (error) {
    console.error('❌ 블로그 콘텐츠 크롤링 에러:', error);
    return null;
  } finally {
    if (page) {
      await page.close();
    }
  }
}

/**
 * 네이버 날짜 문자열을 Date로 변환
 * "2025. 3. 12." / "3시간 전" / "어제" 등 지원
 */
function parseNaverDate(raw) {
  if (!raw) return null;
  const s = raw.trim();

  const dotMatch = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?/);
  if (dotMatch) return new Date(Number(dotMatch[1]), Number(dotMatch[2]) - 1, Number(dotMatch[3]));

  const dashMatch = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (dashMatch) return new Date(Number(dashMatch[1]), Number(dashMatch[2]) - 1, Number(dashMatch[3]));

  const now = new Date();
  const hourAgo = s.match(/(\d+)\s*시간\s*전/);
  if (hourAgo) return new Date(now.getTime() - Number(hourAgo[1]) * 3600000);
  const minAgo = s.match(/(\d+)\s*분\s*전/);
  if (minAgo) return new Date(now.getTime() - Number(minAgo[1]) * 60000);
  const dayAgo = s.match(/(\d+)\s*일\s*전/);
  if (dayAgo) return new Date(now.getTime() - Number(dayAgo[1]) * 86400000);
  if (s.includes('어제')) return new Date(now.getTime() - 86400000);
  if (s.includes('그저께') || s.includes('그제')) return new Date(now.getTime() - 172800000);
  return null;
}

/**
 * 네이버 블로그의 전체 글 목록 크롤링 (말투 학습용)
 * blog.naver.com/{blogId} 형태의 URL을 받아 최신 글 10개를 publishedAt 내림차순으로 수집
 *
 * - 공지글/상단 고정글 제외
 * - 중복 제거 (URL 기준)
 * - 날짜 기준 정렬 (없으면 logNo 내림차순)
 * - 페이지네이션 지원 (최대 5페이지)
 */
async function crawlHospitalBlogPosts(blogUrl, maxPosts = 10) {
  let page = null;

  try {
    const blogIdMatch = blogUrl.match(/blog\.naver\.com\/([^/?#]+)/);
    if (!blogIdMatch) {
      throw new Error('올바른 네이버 블로그 URL이 아닙니다. (예: https://blog.naver.com/example)');
    }
    const blogId = blogIdMatch[1];

    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // ── 1단계: 글 목록 수집 (페이지네이션) ──
    const allEntries = [];
    const seenUrls = new Set();
    let pageNum = 1;

    while (allEntries.length < maxPosts * 2 && pageNum <= 5) {
      const blogListUrl = `https://blog.naver.com/PostList.naver?blogId=${blogId}&categoryNo=0&currentPage=${pageNum}&postListType=&blogType=B`;
      console.log(`📖 병원 블로그 글 목록 수집 페이지 ${pageNum}: ${blogListUrl}`);

      await page.goto(blogListUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      const pageEntries = await page.evaluate((blogId) => {
        const entries = [];
        const anchors = document.querySelectorAll('a[href*="PostView"], a[href*="logNo="]');
        anchors.forEach((a, idx) => {
          const href = a.href || '';
          if (!href.includes('blog.naver.com') || (!href.includes('PostView') && !href.includes('logNo='))) return;

          // logNo 추출
          const logNoMatch = href.match(/logNo=(\d+)/) || href.match(new RegExp(`${blogId}/(\\d{10,})`));
          const logNo = logNoMatch ? logNoMatch[1] : '';
          if (!logNo) return;

          const title = a.textContent?.trim() || '';

          // 공지 판별: 부모 요소에 "공지" 텍스트/클래스가 있는지
          let isNotice = false;
          let parent = a.parentElement;
          for (let depth = 0; depth < 5 && parent; depth++) {
            const cls = parent.className || '';
            const txt = parent.textContent || '';
            if (cls.includes('notice') || cls.includes('공지') ||
                (txt.includes('공지') && txt.length < 200)) {
              isNotice = true;
              break;
            }
            parent = parent.parentElement;
          }

          // 날짜 추출: 근처 형제/부모에서 날짜 패턴 찾기
          let dateText = '';
          let container = a.closest('.blog2_post, .item, tr, li, .post-item') || a.parentElement;
          if (container) {
            const dateEls = container.querySelectorAll('.date, .se_publishDate, time, span');
            for (const el of dateEls) {
              const t = el.textContent?.trim() || '';
              if (t.match(/\d{4}\.\s*\d{1,2}\.\s*\d{1,2}/) ||
                  t.match(/\d+\s*(시간|분|일)\s*전/) ||
                  t.includes('어제') || t.includes('그저께')) {
                dateText = t;
                break;
              }
            }
          }

          entries.push({
            logNo,
            title: title.substring(0, 100),
            url: `https://blog.naver.com/${blogId}/${logNo}`,
            dateText,
            isNotice,
            listOrder: idx,
          });
        });
        return entries;
      }, blogId);

      let newCount = 0;
      for (const entry of pageEntries) {
        if (!seenUrls.has(entry.url)) {
          seenUrls.add(entry.url);
          entry.listOrder = allEntries.length; // 전체 기준 순서
          allEntries.push(entry);
          newCount++;
        }
      }

      console.log(`  → 페이지 ${pageNum}: ${pageEntries.length}개 발견, 신규 ${newCount}개`);
      if (newCount === 0) break;
      pageNum++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[Crawl] 총 수집: ${allEntries.length}개`);

    // ── 2단계: 공지글 제외 ──
    const regularPosts = allEntries.filter(e => !e.isNotice);
    const noticeCount = allEntries.length - regularPosts.length;
    console.log(`[Crawl] 공지: ${noticeCount}개 제외, 일반: ${regularPosts.length}개`);

    // ── 3단계: 날짜 파싱 ──
    let dateParseCount = 0;
    for (const entry of regularPosts) {
      const parsed = parseNaverDate(entry.dateText);
      if (parsed) {
        entry.publishedAt = parsed.toISOString();
        dateParseCount++;
      } else {
        entry.publishedAt = '';
      }
    }
    console.log(`[Crawl] 날짜 파싱 성공: ${dateParseCount}/${regularPosts.length}개`);

    // ── 4단계: 정렬 (publishedAt 내림차순 → logNo 내림차순) ──
    regularPosts.sort((a, b) => {
      if (a.publishedAt && b.publishedAt) {
        const diff = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        if (diff !== 0) return diff;
        return a.listOrder - b.listOrder;
      }
      if (a.publishedAt && !b.publishedAt) return -1;
      if (!a.publishedAt && b.publishedAt) return 1;
      return Number(b.logNo) - Number(a.logNo);
    });

    // ── 5단계: 상위 10개 선택 ──
    const targetPosts = regularPosts.slice(0, maxPosts);
    console.log(`[Crawl] 중복 제거 후: ${regularPosts.length}개`);
    console.log(`[Crawl] 최종 ${targetPosts.length}개 (최신순):`);
    targetPosts.forEach((e, i) => {
      console.log(`  ${i + 1}. [${e.dateText || e.publishedAt || 'N/A'}] ${e.title || e.logNo}`);
    });
    if (targetPosts.length > 0) {
      console.log(`[Crawl] ✅ 1번 글이 가장 최신: ${targetPosts[0].dateText || targetPosts[0].logNo}`);
    }

    // ── 6단계: 각 글 본문 수집 ──
    const results = [];
    for (let i = 0; i < targetPosts.length; i++) {
      const entry = targetPosts[i];
      try {
        console.log(`📄 글 ${i + 1}/${targetPosts.length} 수집 중: ${entry.url}`);
        const content = await crawlBlogContent(entry.url);
        if (content && content.length > 100) {
          results.push({
            url: entry.url,
            content: content.slice(0, 3000),
            title: entry.title || '',
            publishedAt: entry.publishedAt || '',
            summary: content.substring(0, 200).replace(/\n/g, ' ').trim(),
            thumbnail: '',
          });
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (e) {
        console.error(`글 수집 실패 (${entry.url}):`, e.message);
      }
    }

    console.log(`✅ 총 ${results.length}개 글 본문 수집 완료`);
    results.forEach((p, i) => {
      console.log(`  ${i + 1}. [${p.publishedAt?.substring(0, 10) || 'N/A'}] ${p.title?.substring(0, 40) || p.url}`);
    });

    return { blogId, posts: results };

  } catch (error) {
    console.error('❌ 병원 블로그 크롤링 에러:', error);
    throw error;
  } finally {
    if (page) {
      await page.close();
    }
  }
}

/**
 * 브라우저 종료
 */
async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    console.log('🔒 Puppeteer 브라우저 종료');
  }
}

module.exports = {
  crawlNaverBlogs,
  crawlBlogContent,
  crawlHospitalBlogPosts,
  closeBrowser
};
