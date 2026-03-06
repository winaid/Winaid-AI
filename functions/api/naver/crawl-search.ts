/**
 * 네이버 검색 결과 페이지를 크롤링해서 블로그 URL 추출
 * (API 키 불필요, 직접 검색 결과 페이지 크롤링)
 */

interface Env {}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as {
      query: string;
      maxResults?: number;
      includeCafe?: boolean;
    };
    const { query, maxResults = 100, includeCafe = true } = body;

    if (!query) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 동적 날짜 계산: 6개월 전 ~ 오늘
    const today = new Date();
    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(today.getMonth() - 6);

    // 네이버 검색 날짜 포맷: YYYYMMDD (점 없음!)
    const formatNaverDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}${month}${day}`; // YYYYMMDD 형식
    };

    const startDate = formatNaverDate(sixMonthsAgo);
    const endDate = formatNaverDate(today);

    console.log('🔍 네이버 검색 크롤링:', query, '(최대', maxResults, '개, 카페 포함:', includeCafe, ')');
    console.log('🎯 정렬 방식: 정확도순 (관련성 높은 순서)');
    console.log('📅 날짜 필터:', startDate, '~', endDate, '(최근 6개월)');

    const blogUrls: Array<{
      title: string;
      link: string;
      description: string;
      bloggername: string;
      source?: string; // 'blog' | 'cafe'
    }> = [];

    // 검색 소스 설정 (블로그 + 카페)
    const searchSources: Array<{ where: string; label: string }> = [
      { where: 'blog', label: '블로그' },
    ];
    if (includeCafe) {
      searchSources.push({ where: 'cafearticle', label: '카페' });
    }

    const perSourceMax = includeCafe ? Math.ceil(maxResults / 2) : maxResults;

    for (const source of searchSources) {
    // 네이버 검색 결과는 페이지당 약 10개씩
    const pagesNeeded = Math.ceil(perSourceMax / 10);
    const sourceResults: typeof blogUrls = [];

    for (let page = 1; page <= Math.min(pagesNeeded, 10); page++) {
      const start = (page - 1) * 10 + 1;

      const exactQuery = `"${query}"`;
      const searchUrl = `https://search.naver.com/search.naver?where=${source.where}&query=${encodeURIComponent(
        exactQuery
      )}&start=${start}&sm=tab_opt&nso=so:sim,p:from${startDate}to${endDate}`;

      console.log(`📄 페이지 ${page}/${pagesNeeded} 크롤링 중...`);

      try {
        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          },
        });

        if (!response.ok) {
          console.error('❌ 네이버 검색 페이지 요청 실패:', response.status);
          break;
        }

        const html = await response.text();

        // 블로그 검색 결과 추출 (2026년 최신 네이버 구조에 맞게)
        const pageResults: typeof blogUrls = [];

        // 1. 먼저 모든 블로그/카페 URL 추출 (더 관대한 패턴)
        const urlPattern = /https:\/\/(?:blog\.naver\.com|cafe\.naver\.com|[a-zA-Z0-9-]+\.tistory\.com|brunch\.co\.kr)\/[^\s"<>]*/g;
        const foundUrls: string[] = [];
        let match;
        
        while ((match = urlPattern.exec(html)) !== null) {
          const url = match[0];
          if (!foundUrls.includes(url) && url.length > 30) { // 중복 제거 및 최소 길이 체크
            foundUrls.push(url);
          }
        }
        
        console.log(`🔗 페이지 ${page}에서 ${foundUrls.length}개 URL 발견`);

        // 2. 블로그 URL과 제목을 함께 추출 (여러 패턴 시도)
        const titleLinkPatterns = [
          // 패턴 1: data-heatmap-target
          /<a[^>]*href="(https:\/\/(?:blog\.naver\.com|cafe\.naver\.com|.*?\.tistory\.com|brunch\.co\.kr)\/[^"]*)"[^>]*data-heatmap-target="\.link"[^>]*>[\s\S]*?<span[^>]*headline1[^>]*>([\s\S]*?)<\/span>/g,
          // 패턴 2: title_link 클래스
          /<a[^>]*class="[^"]*title_link[^"]*"[^>]*href="(https:\/\/(?:blog\.naver\.com|cafe\.naver\.com|.*?\.tistory\.com|brunch\.co\.kr)\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
          // 패턴 3: 단순 URL과 제목
          /<a[^>]*href="(https:\/\/(?:blog\.naver\.com|cafe\.naver\.com|.*?\.tistory\.com|brunch\.co\.kr)\/[^"]*)"[^>]*>([^<]+)</g,
        ];

        for (const pattern of titleLinkPatterns) {
          pattern.lastIndex = 0; // 정규식 초기화
          while ((match = pattern.exec(html)) !== null) {
            const link = match[1];
            let title = match[2];
            
            // HTML 태그 제거 (<mark>, <b> 등)
            title = title
              .replace(/<mark>/g, '')
              .replace(/<\/mark>/g, '')
              .replace(/<b>/g, '')
              .replace(/<\/b>/g, '')
              .replace(/<[^>]*>/g, '')
              .trim();

            if (title && link && !pageResults.find(r => r.link === link)) {
              pageResults.push({
                title: title,
                link: link,
                description: '',
                bloggername: '',
              });
            }
          }
        }
        
        // 3. URL만 발견되고 제목이 없는 경우, 기본 제목 할당
        const defaultTitle = source.where === 'cafearticle' ? '네이버 카페' : '네이버 블로그';
        for (const url of foundUrls) {
          if (!pageResults.find(r => r.link === url)) {
            pageResults.push({
              title: defaultTitle,
              link: url,
              description: '',
              bloggername: '',
              source: source.where === 'cafearticle' ? 'cafe' : 'blog',
            });
          }
        }

        // 4. 설명 추출 (더 관대한 패턴)
        const descPatterns = [
          // 패턴 1: body1 클래스
          /<span[^>]*class="[^"]*sds-comps-text[^"]*body1[^"]*"[^>]*>([\s\S]*?)<\/span>/g,
          // 패턴 2: dsc_link 클래스
          /<a[^>]*class="[^"]*dsc_link[^"]*"[^>]*>([\s\S]*?)<\/a>/g,
          // 패턴 3: 단순 설명
          /<div[^>]*class="[^"]*api_txt_lines[^"]*"[^>]*>([\s\S]*?)<\/div>/g,
        ];
        
        const descriptions: string[] = [];
        
        for (const pattern of descPatterns) {
          pattern.lastIndex = 0;
          while ((match = pattern.exec(html)) !== null) {
            let desc = match[1];
            // HTML 태그 제거
            desc = desc
              .replace(/<mark>/g, '')
              .replace(/<\/mark>/g, '')
              .replace(/<[^>]*>/g, '')
              .trim();
            
            if (desc.length > 20) { // 최소 길이 체크
              descriptions.push(desc);
            }
          }
        }

        // 설명 할당
        for (let i = 0; i < pageResults.length && i < descriptions.length; i++) {
          if (!pageResults[i].description) {
            pageResults[i].description = descriptions[i];
          }
        }

        // 5. 블로거 이름 추출 (더 관대한 패턴)
        const bloggerPatterns = [
          // 패턴 1: profile-info-title-text
          /<span[^>]*profile-info-title-text[^>]*>[\s\S]*?<span[^>]*>(.*?)<\/span>[\s\S]*?<\/span>/g,
          // 패턴 2: name 클래스
          /<span[^>]*class="[^"]*name[^"]*"[^>]*>(.*?)<\/span>/g,
          // 패턴 3: sub_txt 클래스
          /<span[^>]*class="[^"]*sub_txt[^"]*"[^>]*>(.*?)<\/span>/g,
        ];
        
        const bloggers: string[] = [];
        
        for (const pattern of bloggerPatterns) {
          pattern.lastIndex = 0;
          while ((match = pattern.exec(html)) !== null) {
            const blogger = match[1]
              .replace(/<[^>]*>/g, '')
              .trim();
            if (blogger && blogger.length > 0) {
              bloggers.push(blogger);
            }
          }
        }

        // 블로거 이름 할당
        for (let i = 0; i < pageResults.length && i < bloggers.length; i++) {
          if (!pageResults[i].bloggername) {
            pageResults[i].bloggername = bloggers[i];
          }
        }
        
        // 기본값 설정 + source 태깅
        for (const result of pageResults) {
          if (!result.bloggername) result.bloggername = source.where === 'cafearticle' ? '카페 작성자' : '블로거';
          if (!result.description) result.description = result.title;
          if (!result.source) result.source = source.where === 'cafearticle' ? 'cafe' : 'blog';
        }

        console.log(`✅ [${source.label}] 페이지 ${page}: ${pageResults.length}개 발견`);
        sourceResults.push(...pageResults);

        if (sourceResults.length >= perSourceMax || pageResults.length === 0) {
          break;
        }

        // 다음 페이지 요청 전 딜레이
        if (page < pagesNeeded) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`❌ [${source.label}] 페이지 ${page} 크롤링 에러:`, error);
        break;
      }
    }

    console.log(`📊 [${source.label}] ${sourceResults.length}개 URL 추출`);
    blogUrls.push(...sourceResults);
    } // end of searchSources loop

    // 중복 URL 제거
    const uniqueUrls = new Map<string, typeof blogUrls[0]>();
    for (const item of blogUrls) {
      if (!uniqueUrls.has(item.link)) {
        uniqueUrls.set(item.link, item);
      }
    }
    const dedupedResults = Array.from(uniqueUrls.values());

    console.log(`📊 총 ${dedupedResults.length}개 URL 추출 (블로그+카페, 중복 제거 후)`);

    return new Response(
      JSON.stringify({
        items: dedupedResults.slice(0, maxResults),
        total: dedupedResults.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('네이버 검색 크롤링 에러:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
