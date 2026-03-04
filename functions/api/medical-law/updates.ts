// Cloudflare Pages Function
// Path: /api/medical-law/updates
// 의료광고법 관련 최신 뉴스 및 업데이트 확인

interface Env {
  // 환경 변수
}

interface UpdateInfo {
  hasUpdates: boolean;
  latestUpdate?: {
    date: string;
    title: string;
    url: string;
    summary: string;
  };
  recentNews: Array<{
    date: string;
    title: string;
    url: string;
  }>;
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    console.log('📰 의료광고법 업데이트 확인 중...');

    // 보건복지부 보도자료 페이지 크롤링
    const mohwNewsUrl = 'https://www.mohw.go.kr/board.es?mid=a10503000000&bid=0027';
    
    const response = await fetch(mohwNewsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MedicalLawBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      console.warn('⚠️ 보건복지부 사이트 접근 실패');
      return new Response(
        JSON.stringify(getMockUpdateInfo()),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const html = await response.text();
    
    // HTML에서 의료광고 관련 뉴스 추출
    const newsItems = extractMedicalAdNews(html);
    
    const updateInfo: UpdateInfo = {
      hasUpdates: newsItems.length > 0,
      latestUpdate: newsItems.length > 0 ? newsItems[0] : undefined,
      recentNews: newsItems.slice(0, 5)
    };

    console.log('✅ 업데이트 확인 완료:', newsItems.length, '개 뉴스');

    return new Response(
      JSON.stringify(updateInfo),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ 업데이트 확인 실패:', error);
    
    // 에러 시 기본 정보 반환
    return new Response(
      JSON.stringify(getMockUpdateInfo()),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * HTML에서 의료광고 관련 뉴스 추출 (보건복지부 보도자료 테이블 파싱)
 */
function extractMedicalAdNews(html: string): Array<{
  date: string;
  title: string;
  url: string;
  summary: string;
}> {
  const news: Array<{ date: string; title: string; url: string; summary: string }> = [];
  const medicalAdKeywords = ['의료광고', '의료법', '불법광고', '불법 광고', '의료기관 광고', '의료광고법'];

  // 보건복지부 보도자료 테이블 행 파싱
  // 각 행: <tr>...<td><a href="...">제목</a></td>...<td>YYYY-MM-DD</td>...</tr>
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // 링크와 제목 추출
    const linkMatch = rowHtml.match(/<a\s+href=["']([^"']*list_no=\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const href = linkMatch[1];
    // HTML 태그 제거하고 제목 텍스트만 추출
    const title = linkMatch[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!title) continue;

    // 날짜 추출 (YYYY-MM-DD 패턴)
    const dateMatch = rowHtml.match(/(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const date = dateMatch[1];

    // 의료광고 관련 키워드 필터링
    const isRelevant = medicalAdKeywords.some(kw => title.includes(kw));
    if (!isRelevant) continue;

    // 상대경로 → 절대경로 변환
    const url = href.startsWith('http')
      ? href
      : `https://www.mohw.go.kr${href.startsWith('/') ? '' : '/'}${href}`;

    news.push({
      date,
      title,
      url,
      summary: `${date} 보건복지부 보도자료: ${title}`
    });
  }

  // 날짜 최신순 정렬
  news.sort((a, b) => b.date.localeCompare(a.date));

  return news.slice(0, 10);
}

/**
 * 크롤링 실패 시 기본 응답 (하드코딩된 가짜 데이터 대신 솔직한 실패 표시)
 */
function getMockUpdateInfo(): UpdateInfo {
  return {
    hasUpdates: false,
    latestUpdate: undefined,
    recentNews: []
  };
}

// CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
