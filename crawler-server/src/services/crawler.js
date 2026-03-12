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
 * blog.naver.com/{blogId} 형태의 URL을 받아 최신 글 10개를 publishedAt 내림차순으로 수집
 *
 * 전략:
 *  1단계: PostList에서 logNo만 추출 (Puppeteer, 페이지네이션)
 *  2단계: logNo 내림차순 정렬 (큰 번호 = 최신)
 *  3단계: 각 글 페이지에서 Puppeteer로 본문 + 날짜 추출
 *  4단계: 본문 있는 글만 모은 뒤, publishedAt 내림차순으로 최종 재정렬
 *  5단계: 상위 N개 반환
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

    // ── 1단계: logNo만 수집 (단순·확실) ──
    const seenLogNos = new Set();
    const allLogNos = [];
    const candidates = Math.min(maxPosts + 10, 30);
    let pageNum = 1;

    while (allLogNos.length < candidates && pageNum <= 5) {
      const blogListUrl = `https://blog.naver.com/PostList.naver?blogId=${blogId}&categoryNo=0&currentPage=${pageNum}&postListType=&blogType=B`;
      console.log(`📖 글 목록 페이지 ${pageNum} 수집: ${blogListUrl}`);

      await page.goto(blogListUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      const pageLogNos = await page.evaluate((blogId) => {
        const logNos = [];
        const anchors = document.querySelectorAll('a[href*="PostView"], a[href*="logNo="]');
        anchors.forEach(a => {
          const href = a.href || '';
          const match = href.match(/logNo=(\d+)/) || href.match(new RegExp(`${blogId}/(\\d{10,})`));
          if (match && match[1]) logNos.push(match[1]);
        });
        return logNos;
      }, blogId);

      let newCount = 0;
      for (const logNo of pageLogNos) {
        if (!seenLogNos.has(logNo)) {
          seenLogNos.add(logNo);
          allLogNos.push(logNo);
          newCount++;
        }
      }

      console.log(`  → 페이지 ${pageNum}: 신규 ${newCount}개 (누적: ${allLogNos.length}개)`);
      if (newCount === 0) break;
      pageNum++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // logNo 내림차순 (큰 번호 = 최신)
    allLogNos.sort((a, b) => Number(b) - Number(a));
    const targetLogNos = allLogNos.slice(0, candidates);
    console.log(`[Crawl] ${targetLogNos.length}개 후보 logNo 수집 (목표: ${maxPosts}개)`);

    // ── 2단계: 각 글 본문 + 날짜 수집 ──
    const results = [];
    let skipped = 0;

    for (const logNo of targetLogNos) {
      if (results.length >= maxPosts) break;

      const postUrl = `https://blog.naver.com/${blogId}/${logNo}`;
      try {
        console.log(`📄 글 ${results.length + 1}/${maxPosts} 수집: ${postUrl}`);

        // Puppeteer로 본문 + 메타데이터 추출
        const postPage = await browserInstance.newPage();
        await postPage.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
        await postPage.goto(postUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        const postData = await postPage.evaluate(() => {
          // 제목
          let title = '';
          const titleEl = document.querySelector('.se-title-text, .pcol1, .itemSubjectBoldfont');
          if (titleEl) title = titleEl.textContent?.trim() || '';
          if (!title) title = document.title?.replace(/\s*:\s*네이버\s*블로그$/i, '').trim() || '';

          // 날짜: og:createdate 메타태그
          let publishedAt = '';
          const ogDate = document.querySelector('meta[property="og:createdate"]');
          if (ogDate) publishedAt = ogDate.getAttribute('content') || '';

          // 썸네일: og:image
          let thumbnail = '';
          const ogImg = document.querySelector('meta[property="og:image"]');
          if (ogImg) thumbnail = ogImg.getAttribute('content') || '';

          // 본문
          let content = '';
          const mainContainer = document.querySelector('.se-main-container');
          if (mainContainer) {
            content = mainContainer.textContent?.trim() || '';
          } else {
            const selectors = ['#postViewArea', '.post-view', '#post-area', '.post_ct'];
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el) { content = el.textContent?.trim() || ''; break; }
            }
          }

          return { title, publishedAt, thumbnail, content };
        });

        await postPage.close();

        if (postData.content && postData.content.length > 100) {
          // 날짜 정규화
          let publishedAtISO = '';
          if (postData.publishedAt) {
            try {
              const d = new Date(postData.publishedAt);
              if (!isNaN(d.getTime())) publishedAtISO = d.toISOString();
            } catch {}
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
          console.log(`  ⚠️ 본문 부족 스킵: ${logNo} (${postData.content?.length || 0}자)`);
          skipped++;
        }

        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (e) {
        console.error(`글 수집 실패 (${postUrl}):`, e.message);
        skipped++;
      }
    }

    // ── 3단계: 실제 날짜 기준 최종 재정렬 ──
    const dateCount = results.filter(r => r.publishedAt).length;
    results.sort((a, b) => {
      if (a.publishedAt && b.publishedAt) {
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      }
      if (a.publishedAt && !b.publishedAt) return -1;
      if (!a.publishedAt && b.publishedAt) return 1;
      return 0; // 둘 다 없으면 기존 순서 유지
    });

    console.log(`[Crawl] 날짜 파싱: ${dateCount}/${results.length}개 성공, 스킵: ${skipped}개`);
    console.log(`✅ 총 ${results.length}/${maxPosts}개 글 본문 수집 완료 (최신순):`);
    results.forEach((p, i) => {
      console.log(`  ${i + 1}. [${p.publishedAt?.substring(0, 10) || 'N/A'}] ${p.title?.substring(0, 40) || p.url}`);
    });
    if (results.length > 0) {
      console.log(`[Crawl] ✅ 1번이 가장 최신: ${results[0].publishedAt?.substring(0, 10) || 'N/A'}`);
    }

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
