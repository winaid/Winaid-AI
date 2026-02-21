/**
 * contentSimilarityService.ts - AI 기반 콘텐츠 유사도 검사 시스템
 *
 * Gemini 임베딩 + 웹 검색을 통한 표절 검사, 블로그 이력 저장
 * geminiService.ts에서 분리된 모듈
 */
import { getAiClient } from "./geminiClient";

// ========================================
// 📊 블로그 유사도 검사 시스템
// ========================================

/**
 * Gemini Embedding API로 텍스트 벡터화
 */
async function getTextEmbedding(text: string): Promise<number[]> {
  try {
    const ai = getAiClient();

    // 텍스트 정리 (HTML 태그 제거)
    const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    // embedContent 메서드 사용 (60초 타임아웃)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Embedding API timeout (60초)')), 60000);
    });

    const embedPromise = ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: cleanText,
      config: {
        outputDimensionality: 768,  // DB 컬럼이 768차원
      },
    });
    const result = await Promise.race([embedPromise, timeoutPromise]);

    // embeddings[0].values 배열 반환
    return result.embeddings?.[0]?.values || [];
  } catch (error) {
    console.error('❌ 텍스트 임베딩 생성 실패:', error);
    return [];
  }
}

/**
 * 코사인 유사도 계산
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA.length || !vecB.length || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * 자체 블로그 DB와 유사도 검사
 * (Supabase에 저장된 이전 글들과 비교)
 */
async function checkSimilarityWithOwnBlogs(
  content: string,
  title: string
): Promise<{ maxSimilarity: number; matches: any[] }> {
  try {
    console.log('🔍 자체 블로그 DB 유사도 검사 시작...');

    // Supabase 클라이언트 가져오기
    const { supabase } = await import('../lib/supabase');

    // 모든 블로그 히스토리 조회 (로그인 없이 사용)
    const { data: blogHistory, error } = await supabase
      .from('blog_history')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('❌ Supabase 쿼리 실패:', error);
      return { maxSimilarity: 0, matches: [] };
    }

    if (!blogHistory || blogHistory.length === 0) {
      console.log('');
      console.log('═══════════════════════════════════════════');
      console.log('📝 첫 글 작성이시네요!');
      console.log('   이 글을 다운로드하면 다음부터 자체 유사도 검사가 가능합니다.');
      console.log('═══════════════════════════════════════════');
      console.log('');
      return { maxSimilarity: 0, matches: [] };
    }

    console.log(`📚 ${blogHistory.length}개의 블로그 이력 로드 완료`);

    // 새 글 벡터화
    const newEmbedding = await getTextEmbedding(content);

    if (newEmbedding.length === 0) {
      console.log('⚠️ 임베딩 생성 실패');
      return { maxSimilarity: 0, matches: [] };
    }

    console.log(`✅ 새 글 임베딩 생성 완료 (차원: ${newEmbedding.length})`);

    // 기존 글들과 유사도 비교
    const similarities = blogHistory
      .filter(blog => blog.embedding && Array.isArray(blog.embedding) && blog.embedding.length > 0)
      .map((blog) => {
        const similarity = cosineSimilarity(newEmbedding, blog.embedding as number[]);
        return { blog, similarity };
      });

    console.log(`📊 ${similarities.length}개 글과 유사도 비교 완료`);

    // 유사도 높은 순으로 정렬
    const sortedMatches = similarities
      .filter(s => s.similarity > 0.3) // 30% 이상만
      .sort((a, b) => b.similarity - a.similarity);

    const maxSimilarity = sortedMatches.length > 0 ? sortedMatches[0].similarity : 0;

    console.log(`✅ 자체 DB 검사 완료: 최대 유사도 ${(maxSimilarity * 100).toFixed(1)}%`);
    if (sortedMatches.length > 0) {
      console.log(`   - 상위 매칭: "${sortedMatches[0].blog.title}" (${(sortedMatches[0].similarity * 100).toFixed(1)}%)`);
    }

    return {
      maxSimilarity,
      matches: sortedMatches.slice(0, 5) // 상위 5개만
    };
  } catch (error) {
    // 에러를 콘솔에만 기록 (사용자에게는 보이지 않음)
    console.log('ℹ️ 자체 블로그 이력을 확인할 수 없습니다 (첫 글이거나 DB 연결 문제)');
    console.log('   에러 상세:', error);

    // 빈 결과 반환 (정상적으로 처리)
    return { maxSimilarity: 0, matches: [] };
  }
}

/**
 * 전체 콘텐츠에서 검색 쿼리 추출 (개선: 의미 있는 문장 선별)
 */
async function extractSearchQueries(content: string): Promise<string[]> {
  try {
    console.log('🔍 전체 콘텐츠에서 검색 문구 추출 중...');

    // HTML 태그 제거
    const cleanContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    // 너무 짧으면 전체를 하나의 쿼리로
    if (cleanContent.length < 100) {
      return [cleanContent.slice(0, 100)];
    }

    // 콘텐츠를 문장으로 분리 (마침표, 느낌표, 물음표, 줄바꿈 기준)
    const sentences = cleanContent
      .split(/[.!?\n]\s+/)
      .map(s => s.trim())
      .filter(s => {
        // 길이 필터링: 20~200자
        if (s.length < 20 || s.length > 200) return false;

        // 의미 없는 문장 제외
        if (s.match(/^[\d\s\-–—:,.·•]+$/)) return false; // 숫자/기호만
        if (s.match(/^(제목|부제|소제목|[0-9]+\.)/) ) return false; // 제목 형식
        if (s.split(/\s+/).length < 3) return false; // 단어 3개 미만

        return true;
      });

    console.log(`📝 총 ${sentences.length}개 의미있는 문장 추출`);

    // 검색 쿼리 생성 전략
    const queries: string[] = [];

    // 1. 개별 문장 (가장 정확한 매칭)
    // 특징적인 문장 우선: 40~120자 범위
    const distinctiveSentences = sentences
      .filter(s => s.length >= 40 && s.length <= 120)
      .filter(s => {
        // 일반적인 표현 제외
        const commonPhrases = [
          '알고 계신가요', '대해 알아보겠습니다', '주의가 필요합니다',
          '도움이 됩니다', '중요합니다', '필요합니다'
        ];
        return !commonPhrases.some(phrase => s.includes(phrase));
      });

    queries.push(...distinctiveSentences);

    // 2. 2문장 조합 (문맥 포함)
    for (let i = 0; i < sentences.length - 1; i += 2) {
      const chunk = sentences.slice(i, i + 2).join('. ');
      if (chunk.length >= 50 && chunk.length <= 180) {
        queries.push(chunk);
      }
    }

    // 3. 긴 문장 (상세 설명)
    const longSentences = sentences
      .filter(s => s.length >= 80 && s.length <= 150);
    queries.push(...longSentences.slice(0, 10)); // 상위 10개만

    // 중복 제거 및 우선순위 정렬
    const uniqueQueries = [...new Set(queries)]
      .sort((a, b) => {
        // 1순위: 길이 (70~120자가 최적)
        const lenDiffA = Math.abs(a.length - 95);
        const lenDiffB = Math.abs(b.length - 95);
        if (lenDiffA !== lenDiffB) return lenDiffA - lenDiffB;

        // 2순위: 긴 것부터
        return b.length - a.length;
      })
      .slice(0, 50); // 최대 50개 쿼리로 제한 (성능 고려)

    console.log(`✅ ${uniqueQueries.length}개 검색 쿼리 생성 (의미있는 문장 위주)`);
    console.log('📋 최우선 쿼리 샘플:');
    uniqueQueries.slice(0, 3).forEach((q, i) => {
      console.log(`   ${i + 1}. "${q.substring(0, 60)}..." (${q.length}자)`);
    });

    return uniqueQueries;
  } catch (error) {
    console.error('❌ 검색 문구 추출 실패:', error);
    return [];
  }
}

/**
 * 네이버 크롤링 + Google Custom Search로 정확한 문장 검색
 * 1순위: 네이버 크롤링 (무료, 한국어 최적화)
 * 2순위: Google Custom Search (환경변수 설정 시, 글로벌 검색)
 */
async function searchExactMatch(keyPhrases: string[]): Promise<any[]> {
  try {
    console.log('🔍 외부 글 검색 시작...');
    console.log(`📝 검색할 문구 개수: ${keyPhrases.length}개`);

    const results = [];
    let naverSuccessCount = 0;
    let googleFallbackCount = 0;

    for (const phrase of keyPhrases) {
      try {
        console.log(`  🔎 검색 중: "${phrase.substring(0, 50)}..."`);

        // 1단계: 네이버 크롤링 시도
        const naverResponse = await fetch('/api/naver/crawl-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: phrase,
            maxResults: 10
          })
        });

        if (naverResponse.ok) {
          const naverData = await naverResponse.json();

          if (naverData.items && naverData.items.length > 0) {
            // 네이버 블로그 정보 추출
            const naverBlogs = naverData.items.map((item: any) => ({
              title: item.title,
              link: item.link,
              snippet: item.description,
              displayLink: item.bloggername,
              source: '네이버 블로그'
            }));

            results.push({
              phrase,
              matches: naverBlogs,
              matchCount: naverData.items.length,
              source: 'naver'
            });

            naverSuccessCount++;
            console.log(`  ✅ 네이버: ${naverData.items.length}건 발견`);
            console.log(`     - "${naverBlogs[0].title}"`);

            // Rate Limit 고려
            await new Promise(resolve => setTimeout(resolve, 800));
            continue;
          }
        }

        // 2단계: Google Custom Search 폴백 (네이버 실패 시)
        console.log(`  🔄 네이버 결과 없음, Google 검색 시도...`);

        try {
          const googleResponse = await fetch('/api/google/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              q: `"${phrase}"`, // 따옴표로 정확한 문장 검색
              num: 10
            })
          });

          if (googleResponse.ok) {
            const googleData = await googleResponse.json();

            if (googleData.items && googleData.items.length > 0) {
              const googleResults = googleData.items.map((item: any) => ({
                title: item.title,
                link: item.link,
                snippet: item.snippet,
                displayLink: item.displayLink,
                source: 'Google'
              }));

              results.push({
                phrase,
                matches: googleResults,
                matchCount: googleData.items.length,
                source: 'google'
              });

              googleFallbackCount++;
              console.log(`  ✅ Google: ${googleData.items.length}건 발견`);
              console.log(`     - "${googleResults[0].title}"`);
            } else {
              console.log(`  ℹ️ Google 결과도 없음 - 독창적 문장`);
            }
          } else {
            console.log(`  ⚠️ Google API 미설정 또는 오류`);
          }
        } catch (googleError) {
          console.log(`  ⚠️ Google 검색 실패:`, googleError);
        }

        // Rate Limit 고려
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`  ❌ 검색 실패: "${phrase.substring(0, 50)}..."`, error);
      }
    }

    console.log('');
    console.log('========================================');
    console.log('📊 외부 글 검색 결과 요약');
    console.log(`   - 검색한 문구: ${keyPhrases.length}개`);
    console.log(`   - 네이버 매칭: ${naverSuccessCount}개`);
    console.log(`   - Google 매칭: ${googleFallbackCount}개`);
    console.log(`   - 중복 발견: ${results.length}개 문장`);
    console.log('========================================');
    console.log('');

    if (results.length === 0 && keyPhrases.length > 0) {
      console.log('✅ 모든 문장이 독창적입니다!');
    }

    return results;
  } catch (error) {
    console.error('❌ 외부 글 검색 실패:', error);
    return [];
  }
}

/**
 * 유사도 점수 계산 (개선: 단일 출처 중심 분석)
 *
 * 로직 개선:
 * - 기존: 전체 문장 매칭 개수 합산 (여러 블로그에 흩어진 매칭도 고득점)
 * - 개선: 단일 블로그와의 매칭 개수를 기준으로 표절 위험 판단
 */
function calculateSimilarityScore(
  ownBlogSimilarity: number,
  webSearchMatches: any[]
): { score: number; status: string; message: string; topSourceInfo?: any } {
  // 자체 블로그 유사도 (0~100)
  const ownBlogScore = ownBlogSimilarity * 100;

  // 웹 검색 매칭 점수 - 단일 출처 기준으로 재계산
  let webSearchScore = 0;
  let topSourceInfo: any = null;

  if (webSearchMatches.length === 0) {
    console.log('📊 웹 검색 매칭 없음');
  } else {
    // 각 문장 매칭에서 블로그별로 매칭 횟수 집계
    const blogMatchCounts = new Map<string, { count: number; blogInfo: any; matchedPhrases: string[] }>();

    for (const match of webSearchMatches) {
      const phrase = match.phrase;

      // 각 매칭된 블로그에 대해
      for (const blog of match.matches || []) {
        const blogKey = blog.link || blog.displayLink || blog.title;

        if (!blogMatchCounts.has(blogKey)) {
          blogMatchCounts.set(blogKey, {
            count: 0,
            blogInfo: blog,
            matchedPhrases: []
          });
        }

        const entry = blogMatchCounts.get(blogKey)!;
        entry.count += 1;
        entry.matchedPhrases.push(phrase);
      }
    }

    // 가장 많이 매칭된 블로그 찾기
    let maxMatchCount = 0;
    for (const [blogKey, info] of blogMatchCounts.entries()) {
      if (info.count > maxMatchCount) {
        maxMatchCount = info.count;
        topSourceInfo = {
          blogKey,
          matchCount: info.count,
          blogInfo: info.blogInfo,
          matchedPhrases: info.matchedPhrases
        };
      }
    }

    // 단일 블로그와의 매칭 개수 기준으로 점수 산정
    if (maxMatchCount >= 5) {
      webSearchScore = 100; // 한 블로그에서 5개 이상: 표절 위험 높음
    } else if (maxMatchCount >= 3) {
      webSearchScore = 70; // 한 블로그에서 3-4개: 중간 위험
    } else if (maxMatchCount >= 2) {
      webSearchScore = 40; // 한 블로그에서 2개: 낮은 위험
    } else if (maxMatchCount >= 1) {
      webSearchScore = 20; // 한 블로그에서 1개: 일반적인 표현
    }

    const totalPhrases = webSearchMatches.length;
    const totalMatches = webSearchMatches.reduce((sum, m) => sum + m.matchCount, 0);

    console.log(`📊 유사도 계산 (단일 출처 기준):`);
    console.log(`  - 자체 DB: ${ownBlogScore.toFixed(1)}점`);
    console.log(`  - 검색한 문장 수: ${totalPhrases}개`);
    console.log(`  - 전체 매칭 수: ${totalMatches}건 (여러 블로그에 분산)`);
    console.log(`  - 최다 매칭 블로그: ${maxMatchCount}건`);
    if (topSourceInfo) {
      console.log(`  - 최다 매칭 출처: ${topSourceInfo.blogInfo.title || topSourceInfo.blogKey}`);
    }
    console.log(`  → 웹 검색 점수: ${webSearchScore}점`);
  }

  // 최종 점수 (더 높은 점수 선택)
  const finalScore = Math.max(ownBlogScore, webSearchScore);

  // 상태 및 메시지
  let status = 'ORIGINAL';
  let message = '✅ 독창적인 콘텐츠입니다!';

  if (finalScore >= 80) {
    status = 'HIGH_RISK';
    if (topSourceInfo) {
      message = `🚨 특정 블로그와 ${topSourceInfo.matchCount}개 문장이 일치합니다! 재작성을 권장합니다.`;
    } else {
      message = '🚨 매우 유사한 콘텐츠가 발견되었습니다! 재작성을 권장합니다.';
    }
  } else if (finalScore >= 60) {
    status = 'MEDIUM_RISK';
    if (topSourceInfo) {
      message = `⚠️ 특정 블로그와 ${topSourceInfo.matchCount}개 문장이 유사합니다. 수정을 권장합니다.`;
    } else {
      message = '⚠️ 유사한 콘텐츠가 있습니다. 수정을 권장합니다.';
    }
  } else if (finalScore >= 40) {
    status = 'LOW_RISK';
    message = '💡 일부 유사한 표현이 있습니다. 확인해보세요.';
  } else if (finalScore > 0) {
    status = 'ORIGINAL';
    message = '✅ 일반적인 표현이 일부 있으나 독창적입니다.';
  }

  return { score: finalScore, status, message, topSourceInfo };
}

/**
 * 통합 유사도 검사 (자체 DB + 웹 검색)
 */
export const checkContentSimilarity = async (
  content: string,
  title: string,
  onProgress?: (msg: string) => void
): Promise<any> => {
  const startTime = Date.now();

  try {
    onProgress?.('🔍 유사도 검사 시작...');
    console.log('==================== 유사도 검사 시작 ====================');
    console.log('제목:', title);
    console.log('내용 길이:', content.length, '자');

    const result: any = {
      finalScore: 0,
      status: 'CHECKING',
      message: '',
      ownBlogMatches: [],
      webSearchMatches: [],
      keyPhrases: [],
      checkDuration: 0
    };

    // 1단계: 자체 블로그 DB 검사 (빠름)
    onProgress?.('📚 자체 블로그 DB 검사 중...');
    const ownBlogCheck = await checkSimilarityWithOwnBlogs(content, title);
    result.ownBlogMatches = ownBlogCheck.matches;

    // 2단계: 웹 검색 (필요시만)
    if (ownBlogCheck.maxSimilarity < 0.8) {
      onProgress?.('🌐 전체 콘텐츠 웹 검색 중...');

      // 전체 콘텐츠에서 검색 쿼리 추출
      const searchQueries = await extractSearchQueries(content);
      result.keyPhrases = searchQueries;

      if (searchQueries.length > 0) {
        console.log(`🔍 ${searchQueries.length}개 쿼리로 웹 검색 시작...`);
        // Google로 검색
        const webSearchResults = await searchExactMatch(searchQueries);
        result.webSearchMatches = webSearchResults;
      } else {
        console.log('⚠️ 검색 쿼리 추출 실패, 웹 검색 생략');
      }
    } else {
      console.log('ℹ️ 자체 DB에서 높은 유사도 발견, 웹 검색 생략');
    }

    // 3단계: 최종 점수 계산
    onProgress?.('📊 유사도 점수 계산 중...');
    const scoreResult = calculateSimilarityScore(
      ownBlogCheck.maxSimilarity,
      result.webSearchMatches
    );

    result.finalScore = scoreResult.score;
    result.status = scoreResult.status;
    result.message = scoreResult.message;
    result.topSourceInfo = scoreResult.topSourceInfo; // 최다 매칭 출처 정보 추가
    result.checkDuration = Date.now() - startTime;

    console.log('==================== 유사도 검사 완료 ====================');
    console.log('최종 점수:', result.finalScore);
    console.log('상태:', result.status);
    console.log('메시지:', result.message);
    if (result.topSourceInfo) {
      console.log('최다 매칭 출처:', result.topSourceInfo.blogInfo?.title || result.topSourceInfo.blogKey);
      console.log('매칭 횟수:', result.topSourceInfo.matchCount);
    }
    console.log('소요 시간:', result.checkDuration, 'ms');
    console.log('=======================================================');

    onProgress?.(`✅ 유사도 검사 완료: ${result.finalScore.toFixed(1)}점`);

    return result;
  } catch (error) {
    console.error('❌ 유사도 검사 실패:', error);

    return {
      finalScore: 0,
      status: 'ERROR',
      message: '⚠️ 유사도 검사 중 오류가 발생했습니다.',
      ownBlogMatches: [],
      webSearchMatches: [],
      keyPhrases: [],
      checkDuration: Date.now() - startTime
    };
  }
};

/**
 * 블로그 이력 저장 (Supabase)
 */
export const saveBlogHistory = async (
  title: string,
  content: string,
  htmlContent: string,
  keywords: string[],
  naverUrl?: string,
  category?: string
): Promise<void> => {
  try {
    console.log('💾 블로그 이력 저장 중...');

    // Supabase 클라이언트 import
    const { supabase } = await import('../lib/supabase');

    // 현재 로그인한 사용자 ID 가져오기
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;

    console.log(`👤 사용자 ID: ${userId || '익명'}`);

    // 임베딩 생성
    console.log('🔄 임베딩 벡터 생성 중...');
    const embedding = await getTextEmbedding(content);

    if (embedding.length === 0) {
      console.warn('⚠️ 임베딩 생성 실패, 임베딩 없이 저장합니다.');
    } else {
      console.log(`✅ 임베딩 생성 완료 (차원: ${embedding.length})`);
    }

    // Supabase에 저장
    const { error } = await supabase.from('blog_history').insert({
      user_id: userId,
      title,
      content,
      html_content: htmlContent,
      keywords,
      embedding: embedding.length > 0 ? embedding : null,
      naver_url: naverUrl,
      category,
      published_at: new Date().toISOString()
      // created_at은 DB DEFAULT NOW()로 자동 생성
    });

    if (error) {
      console.error('❌ Supabase 저장 오류:', error);
      throw error;
    }

    console.log('✅ 블로그 이력 저장 완료');
    console.log(`   - 제목: ${title}`);
    console.log(`   - 키워드: ${keywords.join(', ')}`);
    console.log(`   - 임베딩: ${embedding.length > 0 ? '✓' : '✗'}`);
  } catch (error) {
    console.error('❌ 블로그 이력 저장 실패:', error);
    // 저장 실패해도 메인 플로우는 계속 진행
  }
};
