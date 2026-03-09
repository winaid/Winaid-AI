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
 * 네이버 블로그의 전체 글 목록 크롤링 (말투 학습용)
 * blog.naver.com/{blogId} 형태의 URL을 받아 최근 글 목록과 본문을 수집
 */
async function crawlHospitalBlogPosts(blogUrl, maxPosts = 10) {
  let page = null;
  const results = [];

  try {
    // blog.naver.com/{blogId} 에서 blogId 추출
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

    // 블로그 메인 페이지에서 글 목록 수집
    const blogMainUrl = `https://blog.naver.com/PostList.naver?blogId=${blogId}&categoryNo=0&currentPage=1`;
    console.log(`📖 병원 블로그 글 목록 수집: ${blogMainUrl}`);

    await page.goto(blogMainUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // 글 URL 목록 추출
    const postUrls = await page.evaluate((blogId) => {
      const links = [];
      // 글 목록 링크 수집
      const anchors = document.querySelectorAll('a[href*="PostView"], a[href*="logNo="]');
      anchors.forEach(a => {
        const href = a.href || '';
        if (href.includes('blog.naver.com') && (href.includes('PostView') || href.includes('logNo='))) {
          // 중복 제거
          if (!links.includes(href)) links.push(href);
        }
      });
      return links;
    }, blogId);

    console.log(`🔗 글 URL ${postUrls.length}개 발견`);

    // 각 글의 본문 수집 (최대 maxPosts개)
    const targetUrls = postUrls.slice(0, maxPosts);
    for (let i = 0; i < targetUrls.length; i++) {
      const postUrl = targetUrls[i];
      try {
        console.log(`📄 글 ${i + 1}/${targetUrls.length} 수집 중: ${postUrl}`);
        const content = await crawlBlogContent(postUrl);
        if (content && content.length > 100) {
          results.push({ url: postUrl, content: content.slice(0, 3000) });
        }
        // 요청 간격 (블로킹 방지)
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (e) {
        console.error(`글 수집 실패 (${postUrl}):`, e.message);
      }
    }

    console.log(`✅ 총 ${results.length}개 글 본문 수집 완료`);
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
