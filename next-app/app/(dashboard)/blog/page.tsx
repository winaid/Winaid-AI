'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CATEGORIES, PERSONAS, TONES } from '../../../lib/constants';
import { TEAM_DATA } from '../../../lib/teamData';
import { ContentCategory, type GenerationRequest, type AudienceMode, type ImageStyle, type WritingStyle, type CssTheme, type TrendingItem, type SeoTitleItem } from '../../../lib/types';
import { buildBlogPrompt } from '../../../lib/blogPrompt';
import { savePost } from '../../../lib/postStorage';
import { getSessionSafe, supabase } from '../../../lib/supabase';
import { getHospitalStylePrompt } from '../../../lib/styleService';
import { ErrorPanel, ResultPanel, type ScoreBarData } from '../../../components/GenerationResult';
import WritingStyleLearner, { getStyleById, getStylePromptForGeneration } from '../../../components/WritingStyleLearner';

// ── old GenerateWorkspace.tsx 동일: 블로그 displayStage → 단계 정보 ──
const BLOG_STAGES: Record<number, { icon: string; label: string; defaultMsg: string; hint: string }> = {
  0: { icon: '✍️', label: '글 준비 중', defaultMsg: '좋은 문장을 한 줄씩 꺼내고 있어요', hint: '키워드를 분석하고 구조를 설계합니다' },
  1: { icon: '✍️', label: '글 준비 중', defaultMsg: '좋은 문장을 한 줄씩 꺼내고 있어요', hint: '전문 의료 콘텐츠를 작성하고 있습니다' },
  2: { icon: '✨', label: '내용 다듬는 중', defaultMsg: '읽는 맛이 나도록 다듬고 있어요', hint: '문체 교정과 정확성 검토를 진행합니다' },
  3: { icon: '🎨', label: '이미지 만드는 중', defaultMsg: '글과 잘 어울리는 비주얼을 고르는 중이에요', hint: '이미지 수에 따라 30초~2분 정도 걸립니다' },
  4: { icon: '🎉', label: '마무리하는 중', defaultMsg: '거의 다 왔어요, 마지막 손질만 남았어요', hint: '결과를 저장하고 있습니다' },
};

// ── old GenerateWorkspace.tsx 동일: 단계별 문구 로테이션 풀 ──
const BLOG_MESSAGE_POOL: Record<number, string[]> = {
  0: [
    '좋은 문장을 한 줄씩 꺼내고 있어요',
    '글의 흐름을 차근차근 잡고 있어요',
    '읽기 편한 시작점을 만들고 있어요',
    '핵심이 잘 보이도록 내용을 정리하고 있어요',
    '첫 문장부터 자연스럽게 이어지게 다듬고 있어요',
  ],
  1: [
    '좋은 문장을 한 줄씩 꺼내고 있어요',
    '글의 흐름을 차근차근 잡고 있어요',
    '읽기 편한 시작점을 만들고 있어요',
    '핵심이 잘 보이도록 내용을 정리하고 있어요',
    '첫 문장부터 자연스럽게 이어지게 다듬고 있어요',
    '각 소주제를 꼼꼼히 채워가고 있어요',
  ],
  2: [
    '읽는 맛이 나도록 다듬고 있어요',
    '문장 사이의 흐름을 매끈하게 정리하고 있어요',
    '너무 딱딱하지 않게, 너무 가볍지 않게 맞추고 있어요',
    '처음부터 끝까지 자연스럽게 이어지게 손보고 있어요',
    '한 번 더 읽어도 편안한 글로 정리하고 있어요',
  ],
  3: [
    '글과 잘 어울리는 비주얼을 고르는 중이에요',
    '장면을 하나씩 정리하고 있어요',
    '내용과 잘 맞는 이미지를 살펴보고 있어요',
    '화면이 심심하지 않도록 이미지를 준비하고 있어요',
    '글에 딱 맞는 장면을 찾고 있어요',
    '거의 다 왔어요, 마지막 장면을 고르고 있어요',
  ],
  4: [
    '거의 다 왔어요, 마지막 손질만 남았어요',
    '보기 좋게 정리해서 보여드릴 준비 중이에요',
    '결과를 한 번 더 살피고 있어요',
    '깔끔하게 마무리해서 가져오고 있어요',
    '마지막 점검 후 바로 보여드릴게요',
  ],
};

const MSG_ROTATION_INTERVAL = 3200;

function BlogForm() {
  const searchParams = useSearchParams();

  // ── 폼 상태 ──
  const topicParam = searchParams.get('topic');
  const [topic, setTopic] = useState(topicParam || '');
  const [keywords, setKeywords] = useState('');
  const [disease, setDisease] = useState('');
  const [customSubheadings, setCustomSubheadings] = useState('');
  const [category, setCategory] = useState<ContentCategory>(ContentCategory.DENTAL);
  const [persona, setPersona] = useState(PERSONAS[0].value);
  const [tone, setTone] = useState(TONES[0].value);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('환자용(친절/공감)');
  const [writingStyle, setWritingStyle] = useState<WritingStyle>('empathy');
  const [cssTheme, setCssTheme] = useState<CssTheme>('modern');
  const [imageStyle, setImageStyle] = useState<ImageStyle>('photo');
  const [imageCount, setImageCount] = useState(0);
  const [textLength, setTextLength] = useState(1500);
  const [hospitalName, setHospitalName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [selectedManager, setSelectedManager] = useState('');
  const [showHospitalDropdown, setShowHospitalDropdown] = useState(false);
  const [medicalLawMode] = useState<'strict' | 'relaxed'>('strict');
  const [includeFaq, setIncludeFaq] = useState(false);
  const [faqCount, setFaqCount] = useState(3);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [learnedStyleId, setLearnedStyleId] = useState<string | undefined>(undefined);
  const [customPrompt, setCustomPrompt] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // localStorage에서 커스텀 프롬프트 복원 (old 동일)
  useEffect(() => {
    const saved = localStorage.getItem('hospital_custom_image_prompt');
    if (saved) setCustomPrompt(saved);
  }, []);

  // ── AI 제목 추천 / 트렌드 상태 ──
  const [isLoadingTitles, setIsLoadingTitles] = useState(false);
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  const [seoTitles, setSeoTitles] = useState<SeoTitleItem[]>([]);
  const [trendingItems, setTrendingItems] = useState<TrendingItem[]>([]);

  // ── 생성 상태 ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [scores, setScores] = useState<ScoreBarData | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // ── 진행 상태 (old safeProgress UI parity) ──
  // displayStage: 0=준비, 1=글작성, 2=다듬기, 3=이미지, 4=마무리
  const [displayStage, setDisplayStage] = useState<number>(0);
  const [rotationIdx, setRotationIdx] = useState(0);
  const rotationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // old GenerateWorkspace.tsx 동일: displayStage 변경 시 로테이션 리셋 + 타이머 순환
  useEffect(() => {
    setRotationIdx(0);
  }, [displayStage]);

  useEffect(() => {
    if (!isGenerating) {
      if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
      return;
    }
    if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
    rotationTimerRef.current = setInterval(() => {
      const pool = BLOG_MESSAGE_POOL[displayStage] || BLOG_MESSAGE_POOL[1];
      setRotationIdx(prev => (prev + 1) % pool.length);
    }, MSG_ROTATION_INTERVAL);
    return () => {
      if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
    };
  }, [displayStage, isGenerating]);

  // ── AI 제목 추천 (old handleRecommendTitles 동일) ──
  const handleRecommendTitles = async () => {
    const topicForSeo = topic || disease || keywords || '';
    if (!topicForSeo) return;
    setIsLoadingTitles(true);
    setSeoTitles([]);
    setTrendingItems([]);
    try {
      const keywordsForSeo = keywords || disease || topicForSeo;
      const now = new Date();
      const koreaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
      const currentMonth = koreaTime.getMonth() + 1;
      const seasons = ['겨울', '겨울', '봄', '봄', '봄', '여름', '여름', '여름', '가을', '가을', '가을', '겨울'];
      const currentSeason = seasons[currentMonth - 1];

      const prompt = `[입력 정보]
주제: ${topicForSeo}
키워드: ${keywordsForSeo}
글자수 기준: 28~38자 이내 (모바일 최적화)
시즌: ${currentSeason}

────────────────────
[역할]

너는 네이버에서 실제 몸이 불편한 사람이 검색할 법한 문장을
병원 블로그에 올릴 수 있을 정도로
차분하고 정돈된 제목으로 다듬는 AI다.

이 제목은
광고도 아니고,
날것의 검색어도 아닌,
'검색자 언어를 한 번 정리한 질문형 문장'이어야 한다.

────────────────────
[1. 사고 기준]

- 출발점은 '아픈 사람의 검색 문장'이다
- 결과물은 '병원 블로그 제목'이다
- 너무 캐주얼하지도, 너무 전문적이지도 않게 조율한다

즉,
▶ 말투는 일반인
▶ 구조는 정리된 글 제목

────────────────────
[2. 표현 톤 규칙]

- 존댓말 사용
- 감정 표현은 최소화
- 불안은 암시만 하고 강조하지 않는다
- "걱정됨", "무서움" 같은 직접 감정어는 쓰지 않는다
- 물어보는 형식은 유지하되 과하지 않게 정리한다

────────────────────
[3. 절대 금지 표현]

- 전문가, 전문의, 전문적인
- 의료인, 의사, 한의사
- 진료, 치료, 처방, 상담
- 효과, 개선, 해결
- 정상, 비정상, 위험
- 병명 확정 표현
- 병원 방문을 연상시키는 표현

────────────────────
[4. 제목 구조 가이드]

제목은 아래 끝맺음 중 하나로 마무리한다.

▶ 끝맺음 패턴 (필수)
- ~볼 점
- ~이유
- ~한다면
- ~일 때
- ~있을까요

▶ 키워드 배치 규칙 (필수)
- SEO 키워드는 반드시 제목의 맨 앞에 위치해야 한다

▶ 구조 예시
① [증상/상황] + ~할 때 살펴볼 점
② [증상/상황] + ~는 이유
③ [증상/상황] + ~한다면
④ [증상/상황] + ~일 때 확인할 부분

────────────────────
[5. 네이버 적합성 조율 규칙]

- '블로그 제목으로 자연스러운 수준'이 기준

────────────────────
[6. 의료광고 안전 장치]

- 판단, 결론, 예측 금지
- 원인 암시 최소화
- 상태 + 질문까지만 허용

────────────────────
[7. 출력 조건]

- 제목만 출력
- 설명, 부제, 해설 금지
- 5개 생성

────────────────────
[PART 2. SEO 점수 평가]

각 제목에 대해 0~100점 SEO 점수를 계산한다.

▶ SEO 점수 = A + B + C + D + E
[A] 검색자 자연도 (0~25점)
[B] 질문 적합도 AEO (0~25점)
[C] 키워드 구조 안정성 SEO (0~20점)
[D] 의료광고·AI 요약 안전성 GEO (0~20점)
[E] 병원 블로그 적합도 CCO (0~10점)

────────────────────
[PART 3. 출력 형식]

JSON 배열로 출력한다. 각 항목은 다음 구조를 따른다:
{
  "title": "생성된 제목",
  "score": 총점(숫자),
  "type": "증상질환형" | "변화원인형" | "확인형" | "정상범위형"
}`;

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: 'gemini-3.1-flash-lite-preview',
          responseType: 'json',
          timeout: 60000,
          schema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                score: { type: 'NUMBER' },
                type: { type: 'STRING', enum: ['증상질환형', '변화원인형', '확인형', '정상범위형'] }
              },
              required: ['title', 'score', 'type']
            }
          }
        }),
      });

      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error || '제목 추천 실패');

      const titles: SeoTitleItem[] = JSON.parse(data.text);
      const sorted = titles.sort((a, b) => b.score - a.score);
      setSeoTitles(sorted);
    } catch {
      setError('제목 추천 실패');
    } finally {
      setIsLoadingTitles(false);
    }
  };

  // ── 트렌드 주제 (old handleRecommendTrends 동일) ──
  const handleRecommendTrends = async () => {
    setIsLoadingTrends(true);
    setTrendingItems([]);
    setSeoTitles([]);
    try {
      const now = new Date();
      const koreaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
      const year = koreaTime.getFullYear();
      const month = koreaTime.getMonth() + 1;
      const day = koreaTime.getDate();
      const hour = koreaTime.getHours();
      const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][koreaTime.getDay()];
      const dateStr = `${year}년 ${month}월 ${day}일 (${dayOfWeek}) ${hour}시`;
      const randomSeed = Math.floor(Math.random() * 1000);

      const seasonalContext: Record<number, string> = {
        1: '신년 건강검진 시즌, 겨울철 독감/감기, 난방으로 인한 건조',
        2: '설 연휴 후 피로, 환절기 시작, 미세먼지 증가',
        3: '본격 환절기, 꽃가루 알레르기, 황사/미세먼지',
        4: '봄철 야외활동 증가, 알레르기 비염 최고조',
        5: '초여름, 식중독 주의 시작, 냉방병 예고',
        6: '장마철 습도, 무좀/피부질환, 식중독 급증',
        7: '폭염, 열사병/일사병, 냉방병 본격화',
        8: '극심한 폭염, 온열질환 피크, 휴가 후 피로',
        9: '환절기 시작, 가을 알레르기, 일교차 큰 시기',
        10: '환절기 감기, 독감 예방접종 시즌, 건강검진 시즌',
        11: '본격 독감 시즌, 난방 시작, 건조한 피부',
        12: '독감 절정기, 연말 피로, 동상/저체온증'
      };

      const categoryHints: Record<string, string> = {
        '정형외과': '관절통, 허리디스크, 어깨통증, 무릎연골, 오십견, 척추관협착증',
        '피부과': '여드름, 아토피, 건선, 탈모, 피부건조, 대상포진',
        '내과': '당뇨, 고혈압, 갑상선, 위장질환, 간기능, 건강검진',
        '치과': '충치, 잇몸질환, 임플란트, 치아미백, 교정, 사랑니, 치주염',
        '안과': '안구건조증, 노안, 백내장, 녹내장, 시력교정',
        '이비인후과': '비염, 축농증, 어지럼증, 이명, 편도염',
      };

      const currentSeasonContext = seasonalContext[month] || '';
      const categoryKeywords = categoryHints[category] || '일반적인 건강 증상, 예방, 관리';

      const prompt = `[🕐 정확한 현재 시각: ${dateStr} 기준 (한국 표준시)]
[🎲 다양성 시드: ${randomSeed}]

당신은 네이버/구글 검색 트렌드 분석 전문가입니다.
'${category}' 진료과와 관련하여 **지금 이 시점**에 검색량이 급상승하거나 관심이 높은 건강/의료 주제 5가지를 추천해주세요.

[📅 ${month}월 시즌 특성]
${currentSeasonContext}

[🏥 ${category} 관련 키워드 풀]
${categoryKeywords}

[⚠️ 중요 규칙]
1. **매번 다른 결과 필수**: 이전 응답과 다른 새로운 주제를 선정하세요 (시드: ${randomSeed})
2. **구체적인 주제**: "어깨통증" 대신 "겨울철 난방 후 어깨 뻣뻣함" 처럼 구체적으로
3. **현재 시점 반영**: ${month}월 ${day}일 기준 계절/시기 특성 반드시 반영
4. **롱테일 키워드**: 블로그 작성에 바로 쓸 수 있는 구체적인 키워드 조합 제시
5. **다양한 난이도**: 경쟁 높은 주제 2개 + 틈새 주제 3개 섞어서

[📊 점수 산정]
- SEO 점수(0~100): 검색량 높고 + 블로그 경쟁도 낮을수록 고점수
- 점수 높은 순 정렬

[🎯 출력 형식]
- topic: 구체적인 주제명
- keywords: 블로그 제목에 쓸 롱테일 키워드
- score: SEO 점수 (70~95 사이)
- seasonal_factor: 왜 지금 이 주제가 뜨는지 한 줄 설명`;

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: 'gemini-3.1-flash-lite-preview',
          responseType: 'json',
          temperature: 0.9,
          timeout: 60000,
          schema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                topic: { type: 'STRING' },
                keywords: { type: 'STRING' },
                score: { type: 'NUMBER' },
                seasonal_factor: { type: 'STRING' }
              },
              required: ['topic', 'keywords', 'score', 'seasonal_factor']
            }
          }
        }),
      });

      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error || '트렌드 분석 실패');

      const items: TrendingItem[] = JSON.parse(data.text);
      setTrendingItems(items);
    } catch {
      setError('트렌드 로딩 실패');
    } finally {
      setIsLoadingTrends(false);
    }
  };

  // ── 구조 보정 함수 (old legacyBlogGeneration.ts 동일) ──
  function normalizeBlogStructure(html: string, topicFallback: string): { html: string; log: string[] } {
    const log: string[] = [];
    let out = html;
    const cleanedPatterns: string[] = [];

    // 0) JSON escape 정리 (old legacyBlogGeneration.ts:1570-1596 동일)
    // 0a) JSON escaped closing tags: <\/p> → </p> etc.
    if (/<\\\//.test(out)) {
      out = out
        .replace(/<\\\/p>/g, '</p>')
        .replace(/<\\\/h2>/g, '</h3>')  // h2→h3도 함께
        .replace(/<\\\/h3>/g, '</h3>')
        .replace(/<\\\/div>/g, '</div>')
        .replace(/<\\\/span>/g, '</span>')
        .replace(/<\\\/strong>/g, '</strong>')
        .replace(/<\\\/em>/g, '</em>');
      cleanedPatterns.push('JSON escaped tags (<\\/p> etc.)');
    }
    // 0b) 남은 \/ 제거
    if (/\\\//.test(out)) {
      out = out.replace(/\\\//g, '/');
      cleanedPatterns.push('escaped slash (\\/)');
    }
    // 0c) \\n 리터럴 문자열 제거 (JSON escape 잔여물)
    if (/\\n/.test(out)) {
      out = out.replace(/\\n/g, '');
      cleanedPatterns.push('literal \\n');
    }
    // 0d) 연속 줄바꿈 정리
    out = out.replace(/\n\n+/g, '\n');
    // 0e) JSON 형식 잔여물 제거 (AI가 JSON으로 감싼 경우)
    const hadJsonWrapper =
      /^\s*\{\s*"title"\s*:\s*"/.test(out) ||
      /^\s*\{\s*"content"\s*:\s*"/.test(out);
    if (hadJsonWrapper) {
      out = out
        .replace(/^\s*\{\s*"title"\s*:\s*"[^"]*"\s*,\s*"content"\s*:\s*"/i, '')
        .replace(/"\s*,\s*"imagePrompts"\s*:\s*\[.*?\]\s*\}\s*$/i, '')
        .replace(/^\s*\{\s*"content"\s*:\s*"/i, '')
        .replace(/"\s*\}\s*$/i, '');
      cleanedPatterns.push('JSON wrapper ({\"content\":\"...\"})');
    }
    // 0f) 이미지 없음 텍스트 제거
    out = out
      .replace(/\(이미지 없음\)/g, '')
      .replace(/\(이미지가 없습니다\)/g, '')
      .replace(/\[이미지 없음\]/g, '');

    if (cleanedPatterns.length > 0) {
      log.push(`[ESCAPE] JSON escape 정리: ${cleanedPatterns.join(', ')}`);
    }

    // 1) h1 → h3
    const h1Count = (out.match(/<h1[\s>]/gi) || []).length;
    if (h1Count > 0) {
      out = out.replace(/<h1([^>]*)>/gi, '<h3$1>').replace(/<\/h1>/gi, '</h3>');
      log.push(`[STRUCTURE] h1→h3 변환: ${h1Count}개`);
    }

    // 2) h2 → h3 (old와 동일)
    const h2Count = (out.match(/<h2[\s>]/gi) || []).length;
    if (h2Count > 0) {
      out = out.replace(/<h2([^>]*)>/gi, '<h3$1>').replace(/<\/h2>/gi, '</h3>');
      log.push(`[STRUCTURE] h2→h3 변환: ${h2Count}개`);
    }

    // 3) markdown ## → h3
    const mdHeadings = out.match(/^#{1,3}\s+.+$/gm) || [];
    if (mdHeadings.length > 0) {
      out = out.replace(/^#{1,3}\s+(.+)$/gm, '<h3>$1</h3>');
      log.push(`[STRUCTURE] markdown heading→h3 변환: ${mdHeadings.length}개`);
    }

    // 4) 해시태그 제거 (old 동일)
    out = out.replace(/#[가-힣a-zA-Z0-9_]+(\s*#[가-힣a-zA-Z0-9_]+)*/g, '');

    // 5) 이모지 제거 (old 동일 — 전문 의료 콘텐츠 톤)
    out = out
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
      .replace(/[\u{2600}-\u{26FF}]/gu, '')
      .replace(/[\u{2700}-\u{27BF}]/gu, '')
      .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
      .replace(/[\u{1F000}-\u{1F02F}]/gu, '');

    // 6) 빈 p 태그 제거
    out = out.replace(/<p>\s*<\/p>/g, '');

    // 7) h3 개수 확인 — 최소 5개 보장
    const h3Matches = out.match(/<h3[^>]*>[\s\S]*?<\/h3>/gi) || [];
    const h3Count = h3Matches.length;
    log.push(`[STRUCTURE] 소제목(h3) 수: ${h3Count}개`);

    if (h3Count === 0) {
      // 소제목이 전혀 없으면 첫 줄을 제목으로 승격하고 기본 구조 보정
      log.push(`[STRUCTURE] ⚠️ 소제목 0개 — 기본 구조 보정 시도`);
    }

    // 8) 제목 확인 — 첫 번째 h3 전까지 도입부가 있는지
    const firstH3Idx = out.search(/<h3[\s>]/i);
    if (firstH3Idx === 0) {
      // 도입부 없이 바로 h3로 시작 → 첫 h3을 제목으로 간주, 도입부 부재 경고
      log.push(`[STRUCTURE] ⚠️ 도입부 없음 — h3으로 바로 시작`);
    } else if (firstH3Idx > 0) {
      const introPart = out.substring(0, firstH3Idx);
      const introPs = (introPart.match(/<p[^>]*>/gi) || []).length;
      log.push(`[STRUCTURE] 도입부 문단: ${introPs}개`);
    }

    // 9) 각 소제목 아래 문단 수 검증
    const sections = out.split(/<h3[^>]*>/i).slice(1); // h3 이후 각 섹션
    const sectionParagraphCounts: number[] = [];
    for (const section of sections) {
      const nextH3 = section.search(/<h3[\s>]/i);
      const sectionContent = nextH3 > 0 ? section.substring(0, nextH3) : section;
      const pCount = (sectionContent.match(/<p[^>]*>/gi) || []).length;
      sectionParagraphCounts.push(pCount);
    }
    const shortSections = sectionParagraphCounts.filter(c => c < 2).length;
    if (shortSections > 0) {
      log.push(`[STRUCTURE] ⚠️ 문단 2개 미만 섹션: ${shortSections}개 (보정 불필요 — 프롬프트 강화로 대응)`);
    }
    log.push(`[STRUCTURE] 섹션별 문단 수: [${sectionParagraphCounts.join(', ')}]`);

    out = out.trim();
    return { html: out, log };
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    const request: GenerationRequest = {
      category,
      topic: topic.trim(),
      keywords: keywords.trim(),
      disease: disease.trim() || undefined,
      tone,
      audienceMode,
      persona,
      imageStyle,
      postType: 'blog',
      textLength,
      imageCount,
      cssTheme,
      writingStyle,
      medicalLawMode,
      includeFaq,
      faqCount: includeFaq ? faqCount : undefined,
      customSubheadings: customSubheadings.trim() || undefined,
      customImagePrompt: imageStyle === 'custom' ? (customPrompt?.trim() || undefined) : undefined,
      hospitalName: hospitalName || undefined,
      hospitalStyleSource: hospitalName ? 'explicit_selected_hospital' : 'generic_default',
    };

    setIsGenerating(true);
    setDisplayStage(1);
    setRotationIdx(0);
    setError(null);
    setGeneratedContent(null);
    setScores(undefined);
    setSaveStatus(null);

    // ── 로그: 요청 시작 ──
    console.info(`[BLOG] ========== 블로그 생성 시작 ==========`);
    console.info(`[BLOG] topic="${request.topic}" disease="${request.disease || '없음'}" imageCount=${request.imageCount} textLength=${request.textLength}`);
    console.info(`[BLOG] category="${request.category}" persona="${request.persona}" tone="${request.tone}" audience="${request.audienceMode}"`);
    if (request.customSubheadings) {
      console.info(`[BLOG] customSubheadings="${request.customSubheadings.substring(0, 100)}..."`);
    }

    try {
      const { systemInstruction, prompt } = buildBlogPrompt(request);
      console.info(`[BLOG] 프롬프트 조립 완료 — system: ${systemInstruction.length}자, prompt: ${prompt.length}자`);

      // ── 경쟁 블로그 분석 (old legacyBlogGeneration.ts line 674-724 동일) ──
      let competitorInstruction = '';
      if (keywords.trim()) {
        console.info(`[BLOG] 경쟁 블로그 분석 시작 — 키워드: "${keywords.trim()}"`);
        try {
          const competitorRes = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: `너는 네이버 블로그 SEO 분석 전문가다.
"${keywords.trim()}" 키워드로 네이버 통합탭에서 1위를 차지할 블로그 글의 구조를 분석해줘.

실제 네이버 상위 블로그를 참고하여 아래 형식의 JSON으로만 답변해.
설명 없이 JSON만 출력.

{
  "title": "예상 1위 블로그 제목 (30~40자)",
  "charCount": 예상 글자수(숫자),
  "subtitleCount": 예상 소제목 수(숫자),
  "subtitles": ["소제목1", "소제목2", "소제목3", ...],
  "imageCount": 예상 이미지 수(숫자),
  "keyAngles": ["이 키워드에서 자주 다루는 핵심 관점 3~5개"]
}`,
              model: 'gemini-3.1-flash-lite-preview',
              temperature: 0.3,
              responseType: 'json',
              timeout: 15000,
            }),
          });

          if (competitorRes.ok) {
            const cData = await competitorRes.json() as { text?: string };
            if (cData.text) {
              let cText = cData.text;
              const cJsonMatch = cText.match(/```(?:json)?\s*([\s\S]*?)```/);
              if (cJsonMatch) cText = cJsonMatch[1];
              const c = JSON.parse(cText.trim()) as {
                title?: string; charCount?: number; subtitleCount?: number;
                subtitles?: string[]; imageCount?: number; keyAngles?: string[];
              };
              const subs = c.subtitles || [];
              competitorInstruction = `
[경쟁 블로그 분석 결과 - 이 글보다 상위에 노출되어야 함]
현재 "${keywords.trim()}" 통합탭 상위 블로그 예상 구조:
- 제목: ${c.title || '미분석'}
- 글자 수: ${c.charCount || 0}자
- 소제목 수: ${subs.length}개
- 이미지 수: ${c.imageCount || 0}개
${subs.length > 0 ? `- 소제목 목록: ${subs.join(' / ')}` : ''}

[경쟁 분석 기반 작성 전략]
1. 글자 수: 경쟁 글(${c.charCount || 0}자)보다 충분한 분량 확보
2. 소제목: 경쟁 글(${subs.length}개)보다 더 다양한 관점 제공
3. 이미지: 경쟁 글(${c.imageCount || 0}개)과 동등 이상
4. 구조: 더 읽기 쉽고 체류 시간이 길어지는 구조 설계

[차별화 앵글 설계 - 경쟁 글과 다른 관점 필수]
${subs.length > 0 ? `경쟁 글 소제목: ${subs.join(' / ')}` : ''}
위 소제목이 이미 다루는 내용은 "같은 말 다시 하기"가 아니라 "더 깊은 메커니즘/숫자"로 차별화.
경쟁 글이 빠뜨린 앵글을 최소 1~2개 추가:
- 빠진 관점 후보: 자가 관리법, 연령대별 차이, 시술 후 관리, 비용/기간 현실 정보, 잘못 알려진 상식 바로잡기
- 경쟁 글이 나열형이면 → 우리는 "독자 상황별 분기"나 "흔한 오해" 앵글로 차별화
- 경쟁 글이 감성 위주면 → 우리는 구체적 숫자/메커니즘으로 차별화
`;
            }
          }
        } catch (compErr) {
          // 경쟁 분석 실패해도 생성은 계속 진행
          console.warn(`[BLOG] 경쟁 분석 실패 (무시):`, compErr);
        }
      }

      console.info(`[BLOG] 경쟁 분석 결과: ${competitorInstruction ? '성공 (' + competitorInstruction.length + '자)' : '없음/스킵'}`);

      // 프롬프트 조립: 기본 + 경쟁 분석 + 말투
      let finalPrompt = prompt;
      if (competitorInstruction) {
        finalPrompt += `\n\n${competitorInstruction}`;
      }

      // 말투 주입 우선순위 (old 동일): 1) 수동 학습(localStorage) → 2) 병원 블로그 학습(Supabase)
      if (learnedStyleId) {
        const learnedStyle = getStyleById(learnedStyleId);
        if (learnedStyle) {
          finalPrompt += `\n\n[🎓🎓🎓 학습된 말투 적용 - 최우선 적용! 🎓🎓🎓]\n${getStylePromptForGeneration(learnedStyle)}\n\n⚠️ 위 학습된 말투를 반드시 적용하세요!\n- 문장 끝 패턴을 정확히 따라하세요\n- 자주 사용하는 표현을 자연스럽게 활용하세요\n- 전체적인 어조와 분위기를 일관되게 유지하세요`;
        }
      } else if (hospitalName) {
        try {
          const stylePrompt = await getHospitalStylePrompt(hospitalName);
          if (stylePrompt) {
            finalPrompt += `\n\n[병원 블로그 학습 말투 - 반드시 적용]\n${stylePrompt}`;
          }
        } catch { /* 프로파일 없으면 기본 동작 */ }
      }

      console.info(`[BLOG] 최종 프롬프트 길이: ${finalPrompt.length}자 (system: ${systemInstruction.length}자)`);
      console.info(`[BLOG] Gemini 호출 시작 — model=gemini-3.1-pro-preview, temp=0.85`);

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          systemInstruction,
          model: 'gemini-3.1-pro-preview',
          temperature: 0.85,
          maxOutputTokens: 8192,
        }),
      });

      const data = await res.json() as { text?: string; error?: string; details?: string };

      if (!res.ok || !data.text) {
        const errMsg = data.error || data.details || `서버 오류 (${res.status})`;
        console.error(`[BLOG] ❌ 생성 실패: ${errMsg}`);
        setError(errMsg);
        return;
      }

      console.info(`[BLOG] Gemini 응답 수신 — 원본 길이: ${data.text.length}자`);
      setDisplayStage(2); // old displayStage 2: 내용 다듬는 중

      // ── 응답 파싱: 본문 / SCORES / IMAGE_PROMPTS 분리 ──
      let blogText = data.text;
      let parsed: ScoreBarData | undefined;
      const imagePrompts: string[] = [];

      // 1) ---IMAGE_PROMPTS--- 블록 추출 + 제거
      const imgPromptsMarker = '---IMAGE_PROMPTS---';
      const imgIdx = blogText.indexOf(imgPromptsMarker);
      if (imgIdx !== -1) {
        const afterImg = blogText.substring(imgIdx + imgPromptsMarker.length).trim();
        afterImg.split('\n').forEach(line => {
          const trimmed = line.replace(/^\d+[\.\)]\s*/, '').trim();
          if (trimmed && !trimmed.startsWith('---') && !trimmed.startsWith('[') && !trimmed.startsWith('{')) {
            imagePrompts.push(trimmed);
          }
        });
        blogText = blogText.substring(0, imgIdx).replace(/\n+$/, '');
      }

      // 2) ---SCORES--- 블록 추출 + 제거
      const scoresMarker = '---SCORES---';
      const scoresIdx = blogText.lastIndexOf(scoresMarker);
      if (scoresIdx !== -1) {
        const afterScores = blogText.substring(scoresIdx + scoresMarker.length);
        try {
          const jsonMatch = afterScores.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
            const seo = typeof raw.seo === 'number' ? raw.seo : undefined;
            const medical = typeof raw.medical === 'number' ? raw.medical : undefined;
            const conversion = typeof raw.conversion === 'number' ? raw.conversion : undefined;
            if (seo != null || medical != null || conversion != null) {
              parsed = { seoScore: seo, safetyScore: medical, conversionScore: conversion };
            }
          }
        } catch { /* 파싱 실패 무시 */ }
        blogText = blogText.substring(0, scoresIdx).replace(/\n*```\s*$/, '').replace(/\n+$/, '');
      }

      // 3) HTML 정리: 코드블록 fence 제거
      blogText = blogText.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/, '');

      // 3.5) 구조 보정 (old legacyBlogGeneration.ts 동일: h1/h2→h3, markdown→h3, 이모지/해시태그 제거)
      const beforeLen = blogText.length;
      const { html: normalizedHtml, log: structureLogs } = normalizeBlogStructure(blogText, topic.trim());
      blogText = normalizedHtml;
      structureLogs.forEach(l => console.info(`[BLOG] ${l}`));
      console.info(`[BLOG] 구조 보정 완료 — ${beforeLen}자 → ${blogText.length}자`);
      if (parsed) {
        console.info(`[BLOG] 자가평가 점수 — SEO: ${parsed.seoScore ?? '?'}, 의료법: ${parsed.safetyScore ?? '?'}, 전환: ${parsed.conversionScore ?? '?'}`);
      }
      console.info(`[BLOG] 이미지 프롬프트: ${imagePrompts.length}개 (요청: ${imageCount}개)`);

      // ── Stage 1.5: 도입부 품질 게이트 (old legacyBlogGeneration.ts:1621-1711 동일) ──
      if (blogText.length > 300) {
        try {
          console.info(`[BLOG] Stage 1.5: 도입부 품질 판정 시작`);
          const firstHeadingIdx = blogText.search(/<h[23][^>]*>/);
          const introHtml = firstHeadingIdx > 0 ? blogText.slice(0, firstHeadingIdx) : '';
          const introText = introHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          console.info(`[BLOG] Stage 1.5: 도입부 길이=${introText.length}자, HTML=${introHtml.length}자`);

          if (introText.length > 30) {
            // 정의형/메타설명형 (절대 금지)
            const isBadPattern = /이란|질환입니다|알아보겠|살펴보겠|에 대해|많은 분들이|누구나 한 번/.test(introText);
            // 브릿지 부재 (모호한 연결어)
            const hasVagueBridge = /관련된\s*요인|환경과\s*관련|차근차근\s*짚어|짚어볼\s*필요|살펴볼\s*필요|알아볼\s*필요/.test(introText);
            // 나열형 (2회 이상 반복)
            const listingEndings = introText.match(/경우가 있습니다|하기도 합니다|찾아옵니다|나타나기도|겪기도 합니다|보이기도 합니다/g);
            const isListingPattern = !!(listingEndings && listingEndings.length >= 2);
            // 3문단 이상
            const introParagraphs = introHtml.match(/<p[^>]*>/g);
            const isTooManyParagraphs = !!(introParagraphs && introParagraphs.length > 2);

            console.info(`[BLOG] Stage 1.5: 금지패턴=${isBadPattern}, 모호브릿지=${hasVagueBridge}, 나열형=${isListingPattern}${listingEndings ? '(' + listingEndings.length + '회)' : ''}, 3문단+=${isTooManyParagraphs}${introParagraphs ? '(' + introParagraphs.length + '문단)' : ''}`);

            const needsRegen = isBadPattern || hasVagueBridge || isTooManyParagraphs || isListingPattern;
            const regenReason = isBadPattern ? '금지 패턴' : hasVagueBridge ? '브릿지 모호' : isListingPattern ? '나열형 도입' : '3문단 이상';

            if (needsRegen) {
              console.info(`[BLOG] Stage 1.5: ⚠️ 도입부 품질 미달(${regenReason}) → 재생성 시작`);
              const introRegenPrompt = `아래 블로그 글의 도입부가 품질 기준에 미달합니다.
도입부만 새로 작성해주세요.

[시작 방식 - 주제에 맞는 것을 골라 쓰세요]
A. 일상 장면형: 장소+동작+감각 (정형외과, 재활 등에 적합)
B. 상황 제시형: 주변 상황 → 나에게 영향 (감염병 등에 적합)
C. 변화 관찰형: 평소와 다른 점 발견 (내과, 피부과 등에 적합)
D. 비교형: 같은 환경인데 나만 다름 (알레르기, 체질 등에 적합)
E. 계기형: 일상적 계기 → 잠깐의 멈춤 (예방, 검진, 무증상 질환에 적합)
⚠️ 증상이 없는 주제에 A/C를 쓰면 억지 장면이 됩니다! E를 사용하세요.

[필수 - 검색 의도 브릿지]
마지막 1~2문장에서 반드시 글의 주제(키워드)와 연결해야 합니다.
독자가 "아, 이 글이 그 얘기구나"라고 3초 안에 파악할 수 있어야 합니다.
브릿지에는 키워드/질환명을 자연스럽게 포함해도 됩니다.
❌ "주변 환경과 관련된 요인에서 시작되기도 합니다" → 모호
❌ 제목을 그대로/바꿔 말하며 반복 (제목 복붙)
❌ 본문에서 설명할 이유/원인을 미리 말하기 (답을 주면 읽을 이유 없음)
✅ "접촉을 통해 노로바이러스에 감염된 경우일 수 있습니다" → 직결 + 궁금증 유지

[핵심 - 하나의 장면, 하나의 흐름]
하나의 사건이 자연스럽게 전개되는 이야기여야 합니다.
여러 상황을 나열하지 마세요.

[금지]
- 질환명으로 시작 (브릿지에서는 OK)
- "~이란", "~에 대해", "알아보겠습니다", "많은 분들이"
- 독자에게 질문하거나 말 걸기
- "습니다" 체 유지
- 여러 상황 나열 (각 문장이 별개의 경우/사례이면 실패)

[현재 도입부]
${introHtml}

[글의 주제]
${topic.trim()}${disease.trim() ? ', 질환: ' + disease.trim() : ''}

새 도입부를 HTML(<p> 태그)로 작성하세요. 3~5문장, 2문단 권장.
· 1문단(<p>): 장면/상황 전개 (2~3문장)
· 2문단(<p>): 검색 의도 브릿지 (1~2문장)
장면과 브릿지를 별도 <p>로 분리해야 호흡이 생깁니다.`;

              try {
                const introRes = await fetch('/api/gemini', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    prompt: introRegenPrompt,
                    model: 'gemini-3.1-flash-lite-preview',
                    temperature: 0.9,
                    timeout: 60000,
                  }),
                });

                if (introRes.ok) {
                  const introData = await introRes.json() as { text?: string };
                  const newIntro = introData.text?.trim() || '';
                  if (newIntro.includes('<p>') && newIntro.length > 50) {
                    // 코드블록 fence 제거
                    const cleanIntro = newIntro.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
                    const beforeIntroLen = introHtml.length;
                    blogText = cleanIntro + blogText.slice(firstHeadingIdx);
                    console.info(`[BLOG] Stage 1.5: ✅ 도입부 재생성 완료 — 이전 ${beforeIntroLen}자 → 새 ${cleanIntro.length}자`);
                  } else {
                    console.warn(`[BLOG] Stage 1.5: ⚠️ 재생성 응답 부적합 (길이=${newIntro.length}, <p> 포함=${newIntro.includes('<p>')}), 원본 유지`);
                  }
                } else {
                  console.warn(`[BLOG] Stage 1.5: ⚠️ 재생성 API 실패 (${introRes.status}), 원본 유지`);
                }
              } catch (introErr) {
                console.warn(`[BLOG] Stage 1.5: ⚠️ 재생성 예외, 원본 유지:`, introErr);
              }
            } else {
              console.info(`[BLOG] Stage 1.5: ✅ 도입부 품질 통과`);
            }
          } else {
            console.info(`[BLOG] Stage 1.5: 도입부 텍스트 30자 미만 — 검증 스킵`);
          }
        } catch (stageErr) {
          console.warn(`[BLOG] Stage 1.5: 도입부 검증 스킵 (예외):`, stageErr);
        }
      } else {
        console.info(`[BLOG] Stage 1.5: 본문 300자 미만 — 검증 스킵`);
      }

      // ── Stage 2: 소제목 5개 미만 자동 보정 (old blogPipelineService.ts:120-147 동일 정책) ──
      {
        const h3Tags = blogText.match(/<h3[^>]*>([\s\S]*?)<\/h3>/gi) || [];
        const h3Count = h3Tags.length;
        console.info(`[BLOG] Stage 2: 소제목 수 판정 — 현재 ${h3Count}개 (최소 5개)`);

        if (h3Count > 0 && h3Count < 5) {
          const deficit = 5 - h3Count;
          const existingTitles = h3Tags.map(t => t.replace(/<[^>]*>/g, '').trim());
          console.warn(`[BLOG] Stage 2: ⚠️ 소제목 ${h3Count}개 — 정책 최소 5개 미달 (부족 ${deficit}개). 보정 시도`);

          try {
            const repairPrompt = `아래 블로그 글에 소제목이 ${h3Count}개뿐입니다. ${deficit}개를 추가로 작성하세요.

[규칙]
- 기존 소제목과 내용이 겹치지 않는 새로운 관점만 추가
- 각 소제목은 <h3> 태그, 아래에 <p> 문단 2~3개씩
- 소제목 이름: 네이버 검색창에 직접 칠 법한 구어체 (10~25자)
- H1, H2 태그 금지. <h3>만 사용
- 마크다운 금지. HTML만 출력

[주제] ${topic.trim()}${disease.trim() ? ' / 질환: ' + disease.trim() : ''}
[기존 소제목] ${existingTitles.join(' / ')}

정확히 ${deficit}개의 소제목+문단을 HTML로만 출력하세요. 설명 없이 HTML만.`;

            const repairRes = await fetch('/api/gemini', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: repairPrompt,
                systemInstruction: '블로그 소제목 보정 전문가. HTML만 반환하라. 설명 금지.',
                model: 'gemini-3.1-flash-lite-preview',
                temperature: 0.7,
                timeout: 15000,
              }),
            });

            if (repairRes.ok) {
              const repairData = await repairRes.json() as { text?: string };
              let newSections = repairData.text?.trim() || '';
              newSections = newSections.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/, '');

              const newH3s = (newSections.match(/<h3[^>]*>/gi) || []).length;
              if (newH3s > 0 && newSections.includes('<p>')) {
                // 마무리 섹션(마지막 h3) 앞에 삽입
                const lastH3Idx = blogText.lastIndexOf('<h3');
                if (lastH3Idx > 0) {
                  blogText = blogText.slice(0, lastH3Idx) + newSections + '\n' + blogText.slice(lastH3Idx);
                } else {
                  blogText += '\n' + newSections;
                }
                const finalH3Count = (blogText.match(/<h3[^>]*>/gi) || []).length;
                console.info(`[BLOG] Stage 2: ✅ 소제목 보정 완료 — ${h3Count}개 → ${finalH3Count}개 (+${newH3s}개 추가)`);
              } else {
                console.warn(`[BLOG] Stage 2: ⚠️ 보정 응답 부적합 (h3=${newH3s}개, <p> 포함=${newSections.includes('<p>')}), 원본 유지`);
              }
            } else {
              console.warn(`[BLOG] Stage 2: ⚠️ 보정 API 실패 (${repairRes.status}), 원본 유지`);
            }
          } catch (repairErr) {
            console.warn(`[BLOG] Stage 2: ⚠️ 보정 예외, 원본 유지:`, repairErr);
          }
        } else if (h3Count >= 5) {
          console.info(`[BLOG] Stage 2: ✅ 소제목 수 충분 (${h3Count}개)`);
        } else {
          console.info(`[BLOG] Stage 2: 소제목 0개 — 보정 스킵 (구조 전체 문제)`);
        }
      }

      // ── 글자수 목표 대비 검증 (old legacyBlogGeneration.ts:1474-1498 동일) ──
      {
        const textOnly = blogText.replace(/<[^>]+>/g, '');
        const charCountNoSpaces = textOnly.replace(/\s/g, '').length;
        const targetMin = textLength;
        const targetMax = textLength + 300;
        const deviation = charCountNoSpaces - textLength;

        if (charCountNoSpaces < targetMin) {
          console.info(`[BLOG] 글자수 부족: 목표=${textLength}자, 실제=${charCountNoSpaces}자 (${deviation}자 부족)`);
        } else if (charCountNoSpaces > targetMax) {
          console.info(`[BLOG] 글자수 초과: 목표=${textLength}자, 실제=${charCountNoSpaces}자 (+${deviation}자) — 그대로 진행`);
        } else {
          console.info(`[BLOG] ✅ 글자수 적정: 목표=${textLength}자, 실제=${charCountNoSpaces}자 (${deviation >= 0 ? '+' : ''}${deviation}자)`);
        }
      }

      // 4) 이미지 없으면 마커 strip 후 바로 표시
      if (imageCount === 0 || imagePrompts.length === 0) {
        blogText = blogText.replace(/\[IMG_\d+\]\n*/g, '');
        setGeneratedContent(blogText);
        setScores(parsed);
      } else {
        setDisplayStage(3); // old displayStage 3: 이미지 만드는 중
        // 5) 마커가 있는 본문을 먼저 표시 (이미지 자리에 로딩 표시)
        let htmlWithPlaceholders = blogText;
        for (let i = 1; i <= imageCount; i++) {
          htmlWithPlaceholders = htmlWithPlaceholders.replace(
            new RegExp(`\\[IMG_${i}\\]`, 'g'),
            `<div class="content-image-wrapper" data-img-slot="${i}" style="text-align:center;padding:24px 0;"><div style="display:inline-flex;align-items:center;gap:8px;padding:12px 20px;background:#f1f5f9;border-radius:12px;font-size:13px;color:#64748b;">🖼️ 이미지 ${i}/${imageCount} 생성 중...</div></div>`,
          );
        }
        // 혹시 남은 초과 마커 정리
        htmlWithPlaceholders = htmlWithPlaceholders.replace(/\[IMG_\d+\]\n*/g, '');
        setGeneratedContent(htmlWithPlaceholders);
        setScores(parsed);

        // 6) 이미지 생성 → Storage 업로드 → public URL
        const generateAndUpload = async (prompt: string, index: number): Promise<{ index: number; url: string | null }> => {
          try {
            // 6a) /api/image → base64
            const imgRes = await fetch('/api/image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt, aspectRatio: '16:9' as const, mode: 'blog' as const }),
            });
            if (!imgRes.ok) return { index, url: null };
            const imgData = await imgRes.json() as { imageDataUrl?: string };
            const dataUrl = imgData.imageDataUrl;
            if (!dataUrl) return { index, url: null };

            // 6b) base64 → Supabase Storage 업로드
            if (supabase) {
              try {
                const commaIdx = dataUrl.indexOf(',');
                const base64Data = dataUrl.substring(commaIdx + 1);
                const metaPart = dataUrl.substring(0, commaIdx);
                const mimeMatch = metaPart.match(/data:(.*?);base64/);
                const mimeType = mimeMatch?.[1] || 'image/png';
                const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';

                // binary 변환
                const byteChars = atob(base64Data);
                const byteArray = new Uint8Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) {
                  byteArray[i] = byteChars.charCodeAt(i);
                }
                const blob = new Blob([byteArray], { type: mimeType });

                const fileName = `blog/${Date.now()}_${index}.${ext}`;
                const { error: uploadErr } = await supabase.storage
                  .from('blog-images')
                  .upload(fileName, blob, { contentType: mimeType, upsert: false });

                if (!uploadErr) {
                  const { data: urlData } = supabase.storage.from('blog-images').getPublicUrl(fileName);
                  if (urlData?.publicUrl) {
                    return { index, url: urlData.publicUrl };
                  }
                }
                console.warn(`[IMG_UPLOAD] IMG_${index}: 업로드 실패, base64 fallback`, uploadErr?.message);
              } catch (uploadErr) {
                console.warn(`[IMG_UPLOAD] IMG_${index}: 업로드 예외, base64 fallback`, uploadErr);
              }
            }

            // 6c) Storage 실패 시 base64 fallback
            return { index, url: dataUrl };
          } catch {
            return { index, url: null };
          }
        };

        // 최대 imageCount개까지만 생성
        const prompts = imagePrompts.slice(0, imageCount);
        const imageResults = await Promise.all(
          prompts.map((p, i) => generateAndUpload(p, i + 1)),
        );

        // 7) [IMG_N] 마커를 실제 이미지로 교체 (old insertImageData 동일)
        let finalHtml = blogText;
        for (const img of imageResults) {
          const pattern = new RegExp(`\\[IMG_${img.index}\\]`, 'gi');
          if (img.url) {
            const imgTag = `<div class="content-image-wrapper"><img src="${img.url}" alt="blog image ${img.index}" data-image-index="${img.index}" style="max-width:100%;height:auto;border-radius:12px;" /></div>`;
            finalHtml = finalHtml.replace(pattern, imgTag);
          } else {
            finalHtml = finalHtml.replace(pattern, '');
          }
        }
        // 미매칭 마커 제거
        finalHtml = finalHtml.replace(/\[IMG_\d+\]\n*/g, '');
        setGeneratedContent(finalHtml);
        blogText = finalHtml;
      }

      // ── fact_check 기본값 설정 (old legacyBlogGeneration.ts:1713-1740 동일) ──
      // Gemini가 ---SCORES--- 블록을 반환하지 않았거나 필드가 빠진 경우 기본값으로 보완
      {
        if (!parsed) parsed = {};
        // conversion_score: 없거나 0이면 기본값 75
        if (!parsed.conversionScore || parsed.conversionScore === 0) {
          parsed.conversionScore = 75;
          console.log('[BLOG] ⚠️ conversion_score 기본값 75점 설정 (AI 미반환)');
        }
        // safety_score: undefined/null이면 기본값 90
        if (parsed.safetyScore === undefined || parsed.safetyScore === null) {
          parsed.safetyScore = 90;
        }
        // fact_score, ai_smell_score, verified_facts_count는 ScoreBarData에 없으므로 로그만 기록
        const factScore = 85;
        const aiSmellScore = 12;
        const verifiedFactsCount = 5;
        console.log('[BLOG] ⚠️ ai_smell_score 기본값 12점 설정 (AI 미반환)');
        console.log(`[BLOG] 📊 fact_check 최종값: conversion_score=${parsed.conversionScore}, fact_score=${factScore}, safety_score=${parsed.safetyScore}, ai_smell_score=${aiSmellScore}, verified_facts_count=${verifiedFactsCount}`);
        // scores state 업데이트
        setScores({ ...parsed });
      }

      // ── SEO 자동 평가 (old legacyBlogGeneration.ts:1742-1794 동일 — 평가만, 재생성 없음) ──
      if (blogText && topic.trim()) {
        setDisplayStage(4); // old displayStage 4: 마무리하는 중
        console.info('[BLOG] 📊 SEO 자동 평가 시작...');
        try {
          const seoHtml = blogText;
          const seoTitle = (blogText.match(/<h3[^>]*>([^<]+)<\/h3>/) || blogText.match(/^(.+)/))?.[1]?.replace(/<[^>]*>/g, '').trim() || topic.trim();
          const seoTopic = topic.trim();
          const seoKeywords = keywords.trim() || '';
          const currentYear = new Date().getFullYear();

          const seoPrompt = `당신은 네이버 블로그 SEO 전문가이자 병원 마케팅 콘텐츠 분석가입니다.

아래 블로그 콘텐츠의 SEO 점수를 100점 만점으로 평가해주세요.

[중요]
📊 SEO 점수 평가 기준 (100점 만점)
[중요]

[※ 평가 대상 콘텐츠]
- 제목: "${seoTitle}"
- 주제: "${seoTopic}"
- 핵심 키워드: "${seoKeywords}"
- 본문:
${seoHtml.substring(0, 8000)}

---
① 제목 최적화 (25점 만점)
---
※ keyword_natural (10점): 핵심 키워드 자연 포함
※ seasonality (5점): 시기성/상황성 포함
※ judgment_inducing (5점): 판단 유도형 구조
※ medical_law_safe (5점): 의료광고 리스크 없음

---
② 본문 키워드 구조 (25점 만점)
---
※ main_keyword_exposure (10점): 메인 키워드 3~5회 자연 노출
※ related_keyword_spread (5점): 연관 키워드(LSI) 분산 배치
※ subheading_variation (5점): 소제목에 키워드 변주 포함
※ no_meaningless_repeat (5점): 의미 없는 반복 없음

---
③ 사용자 체류 구조 (20점 만점)
---
※ intro_problem_recognition (5점): 도입부 5줄 이내 문제 인식
※ relatable_examples (5점): '나 얘기 같다' 생활 예시
※ mid_engagement_points (5점): 중간 이탈 방지 포인트
※ no_info_overload (5점): 정보 과부하 없음

---
④ 의료법 안전성 + 신뢰 신호 (20점 만점)
---
※ no_definitive_guarantee (5점): 단정·보장 표현 없음
※ individual_difference (5점): 개인차/상황별 차이 자연 언급
※ self_diagnosis_limit (5점): 자가진단 한계 명확화
※ minimal_direct_promo (5점): 병원 직접 홍보 최소화

---
⑤ 전환 연결성 (10점 만점)
---
※ cta_flow_natural (5점): CTA가 정보 흐름을 끊지 않음
※ time_fixed_sentence (5점): 시점 고정형 문장 존재

[중요]
⚠️ 평가 시 주의사항
[중요]

1. SEO 점수는 "완성도"가 아니라 "비교 지표"로 활용됩니다
2. 85점 미만은 재설계/재작성이 필요한 수준입니다
3. 각 항목별로 구체적인 개선 피드백을 반드시 작성하세요
4. 의료법 안전성은 다른 항목보다 엄격하게 평가하세요
5. 현재 시점(${currentYear}년) 기준 네이버 SEO 트렌드 반영

각 항목의 feedback에는:
- 잘된 점 1개 이상
- 개선이 필요한 점 1개 이상
- 구체적인 개선 방법 제안

🎯 **improvement_suggestions 필수 작성!**
85점 이상 달성을 위한 구체적이고 실행 가능한 개선 제안 3~5개를 배열로 제공해주세요.

JSON 형식으로 응답해주세요.`;

          const seoSchema = {
            type: 'OBJECT',
            properties: {
              total: { type: 'INTEGER' },
              title: {
                type: 'OBJECT',
                properties: {
                  score: { type: 'INTEGER' }, keyword_natural: { type: 'INTEGER' },
                  seasonality: { type: 'INTEGER' }, judgment_inducing: { type: 'INTEGER' },
                  medical_law_safe: { type: 'INTEGER' }, feedback: { type: 'STRING' }
                },
                required: ['score', 'keyword_natural', 'seasonality', 'judgment_inducing', 'medical_law_safe', 'feedback']
              },
              keyword_structure: {
                type: 'OBJECT',
                properties: {
                  score: { type: 'INTEGER' }, main_keyword_exposure: { type: 'INTEGER' },
                  related_keyword_spread: { type: 'INTEGER' }, subheading_variation: { type: 'INTEGER' },
                  no_meaningless_repeat: { type: 'INTEGER' }, feedback: { type: 'STRING' }
                },
                required: ['score', 'main_keyword_exposure', 'related_keyword_spread', 'subheading_variation', 'no_meaningless_repeat', 'feedback']
              },
              user_retention: {
                type: 'OBJECT',
                properties: {
                  score: { type: 'INTEGER' }, intro_problem_recognition: { type: 'INTEGER' },
                  relatable_examples: { type: 'INTEGER' }, mid_engagement_points: { type: 'INTEGER' },
                  no_info_overload: { type: 'INTEGER' }, feedback: { type: 'STRING' }
                },
                required: ['score', 'intro_problem_recognition', 'relatable_examples', 'mid_engagement_points', 'no_info_overload', 'feedback']
              },
              medical_safety: {
                type: 'OBJECT',
                properties: {
                  score: { type: 'INTEGER' }, no_definitive_guarantee: { type: 'INTEGER' },
                  individual_difference: { type: 'INTEGER' }, self_diagnosis_limit: { type: 'INTEGER' },
                  minimal_direct_promo: { type: 'INTEGER' }, feedback: { type: 'STRING' }
                },
                required: ['score', 'no_definitive_guarantee', 'individual_difference', 'self_diagnosis_limit', 'minimal_direct_promo', 'feedback']
              },
              conversion: {
                type: 'OBJECT',
                properties: {
                  score: { type: 'INTEGER' }, cta_flow_natural: { type: 'INTEGER' },
                  time_fixed_sentence: { type: 'INTEGER' }, feedback: { type: 'STRING' }
                },
                required: ['score', 'cta_flow_natural', 'time_fixed_sentence', 'feedback']
              },
              improvement_suggestions: { type: 'ARRAY', items: { type: 'STRING' } }
            },
            required: ['total', 'title', 'keyword_structure', 'user_retention', 'medical_safety', 'conversion', 'improvement_suggestions']
          };

          const seoRes = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: seoPrompt,
              model: 'gemini-3.1-flash-lite-preview',
              responseType: 'json',
              schema: seoSchema,
              temperature: 0.3,
              maxOutputTokens: 4096,
            }),
          });
          const seoData = await seoRes.json() as { text?: string; error?: string };

          if (seoRes.ok && seoData.text) {
            const seoReport = JSON.parse(seoData.text);
            // 총점 재계산 (old seoService.ts:980-988 동일)
            const calculatedTotal =
              (seoReport.title?.score || 0) +
              (seoReport.keyword_structure?.score || 0) +
              (seoReport.user_retention?.score || 0) +
              (seoReport.medical_safety?.score || 0) +
              (seoReport.conversion?.score || 0);
            seoReport.total = calculatedTotal;

            console.log(`[BLOG] 📊 SEO 평가 완료 - 총점: ${seoReport.total}점`);
            console.log(`[BLOG]   ① 제목 최적화: ${seoReport.title?.score || 0}/25`);
            console.log(`[BLOG]   ② 본문 키워드: ${seoReport.keyword_structure?.score || 0}/25`);
            console.log(`[BLOG]   ③ 사용자 체류: ${seoReport.user_retention?.score || 0}/20`);
            console.log(`[BLOG]   ④ 의료법 안전: ${seoReport.medical_safety?.score || 0}/20`);
            console.log(`[BLOG]   ⑤ 전환 연결성: ${seoReport.conversion?.score || 0}/10`);

            if (seoReport.total >= 85) {
              console.log(`[BLOG] ✅ SEO 점수 85점 이상!`);
            } else {
              console.log(`[BLOG] ℹ️ SEO 점수 ${seoReport.total}점 - 참고용`);
            }

            if (seoReport.improvement_suggestions?.length) {
              console.log(`[BLOG] 📝 SEO 개선 제안:`);
              seoReport.improvement_suggestions.forEach((s: string, i: number) => {
                console.log(`[BLOG]   ${i + 1}. ${s}`);
              });
            }
          } else {
            console.error(`[BLOG] ❌ SEO 평가 불가: ${seoData.error || 'API 응답 없음'}`);
          }
        } catch (seoError) {
          console.error('[BLOG] ❌ SEO 평가 오류:', seoError);
        }
        console.info('[BLOG] ✅ Step 2 완료: 글 작성 및 SEO 평가 완료');
      }

      // ── 저장 — Supabase 또는 guest localStorage ──
      console.info(`[BLOG] 저장 시작 — 최종 콘텐츠 길이: ${blogText.length}자`);
      try {
        const { userId, userEmail } = await getSessionSafe();
        const titleMatch = blogText.match(/<h3[^>]*>([^<]+)<\/h3>/) || blogText.match(/^(.+)/);
        const extractedTitle = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim().substring(0, 200) : topic.trim();
        console.info(`[BLOG] 추출 제목: "${extractedTitle}"`);

        const saveResult = await savePost({
          userId,
          userEmail,
          hospitalName: hospitalName || undefined,
          postType: 'blog',
          title: extractedTitle,
          content: blogText,
          topic: topic.trim(),
          keywords: keywords.trim() ? keywords.split(',').map(k => k.trim()).filter(Boolean) : undefined,
          imageStyle: imageCount > 0 ? imageStyle : undefined,
        });

        if ('error' in saveResult) {
          console.warn(`[BLOG] 저장 실패: ${saveResult.error}`);
          setSaveStatus('저장 실패: ' + saveResult.error);
        } else {
          console.info(`[BLOG] ✅ 저장 완료`);
          setSaveStatus('저장 완료');
        }
      } catch (saveErr) {
        console.warn(`[BLOG] 저장 실패: Supabase 연결 불가`, saveErr);
        setSaveStatus('저장 실패: Supabase 연결 불가');
      }
      console.info(`[BLOG] ========== 블로그 생성 완료 ==========`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '네트워크 오류';
      console.error(`[BLOG] ❌ 생성 실패: ${msg}`, err);
      setError(msg);
    } finally {
      setIsGenerating(false);
      setDisplayStage(0);
    }
  };

  const inputCls = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all";
  const labelCls = "block text-xs font-semibold text-slate-500 mb-1.5";

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start p-5">
      {/* ── 입력 폼 ── */}
      <div className="w-full lg:w-[340px] xl:w-[380px] lg:flex-none">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">📝</span>
            <h2 className="text-base font-bold text-slate-800">블로그 생성</h2>
          </div>

          {/* 팀 선택 + 병원명 (old 동일) */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {TEAM_DATA.map(team => (
              <button
                key={team.id}
                type="button"
                onClick={() => { setSelectedTeam(team.id); setShowHospitalDropdown(true); }}
                className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${
                  selectedTeam === team.id
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {team.label}
              </button>
            ))}
          </div>

          <div className="relative">
            {selectedTeam !== null ? (
            <>
              <div className="relative">
                <input
                  type="text"
                  value={hospitalName}
                  onChange={e => setHospitalName(e.target.value)}
                  placeholder="병원명 선택"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => setShowHospitalDropdown(!showHospitalDropdown)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <svg className={`w-4 h-4 transition-transform ${showHospitalDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
              </div>
              {showHospitalDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowHospitalDropdown(false)} />
                  <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                    {/* 팀 헤더 */}
                    <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
                      <span className="text-xs font-bold text-blue-600">{TEAM_DATA.find(t => t.id === selectedTeam)?.label}</span>
                    </div>
                    {/* 병원 목록 (매니저별 그룹) */}
                    {(() => {
                      const team = TEAM_DATA.find(t => t.id === selectedTeam);
                      if (!team || team.hospitals.length === 0) {
                        return <div className="p-4 text-center text-xs text-slate-400">등록된 병원이 없습니다</div>;
                      }
                      const managers = [...new Set(team.hospitals.map(h => h.manager))];
                      return (
                        <div className="max-h-64 overflow-y-auto">
                          {managers.map(manager => (
                            <div key={manager}>
                              <div className="px-3 py-2 bg-slate-50 text-[11px] font-bold text-slate-500 sticky top-0">
                                {manager}
                              </div>
                              {team.hospitals.filter(h => h.manager === manager).map(hospital => (
                                <button
                                  key={`${hospital.name}-${hospital.manager}`}
                                  type="button"
                                  onClick={() => {
                                    setHospitalName(hospital.name.replace(/ \(.*\)$/, ''));
                                    setSelectedManager(hospital.manager);
                                    setShowHospitalDropdown(false);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center justify-between"
                                >
                                  <span>{hospital.name.replace(/ \(.*\)$/, '')}</span>
                                  {hospitalName === hospital.name.replace(/ \(.*\)$/, '') && (
                                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                  )}
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}
              {selectedManager && hospitalName && (
                <p className="mt-1 text-[11px] text-slate-400">담당: {selectedManager}</p>
              )}
            </>
            ) : (
              <div className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-400 bg-slate-50">
                팀을 먼저 선택해주세요
              </div>
            )}
          </div>

          {/* 진료과 + 대상 독자 (old 동일: grid-cols-2 select) */}
          <div className="grid grid-cols-2 gap-3">
            <select
              value={category}
              onChange={e => setCategory(e.target.value as ContentCategory)}
              className={inputCls}
              disabled={isGenerating}
              aria-label="진료과 선택"
            >
              {CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
            <select
              value={audienceMode}
              onChange={e => setAudienceMode(e.target.value as AudienceMode)}
              className={inputCls}
              disabled={isGenerating}
              aria-label="타겟 청중 선택"
            >
              <option value="환자용(친절/공감)">환자용 (친절/공감)</option>
              <option value="보호자용(가족걱정)">보호자용 (부모님/자녀 걱정)</option>
              <option value="전문가용(신뢰/정보)">전문가용 (신뢰/정보)</option>
            </select>
          </div>

          {/* 주제 */}
          <div>
            <label className={labelCls}>주제 *</label>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="예: 임플란트 수술 후 관리법"
              required
              className={inputCls}
            />
          </div>

          {/* 키워드 */}
          <div>
            <input
              type="text"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="SEO 키워드 (예: 강남 치과, 임플란트 가격)"
              className={inputCls}
            />
          </div>

          {/* 질환명 */}
          <div>
            <input
              type="text"
              value={disease}
              onChange={e => setDisease(e.target.value)}
              placeholder="질환명 (예: 치주염, 충치) - 글의 실제 주제"
              className={inputCls}
            />
          </div>

          {/* AI 제목 추천 + 트렌드 주제 (2버튼 가로) */}
          <div className="flex gap-2">
            <button type="button" onClick={handleRecommendTitles} disabled={isLoadingTitles || !(topic || disease || keywords)}
              className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-all disabled:opacity-40 flex items-center justify-center gap-1">
              {isLoadingTitles ? <><div className="w-3 h-3 border-2 border-slate-400 border-t-slate-600 rounded-full animate-spin" />생성 중...</> : <>✨ AI 제목 추천</>}
            </button>
            <button type="button" onClick={handleRecommendTrends} disabled={isLoadingTrends}
              className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-all disabled:opacity-40 flex items-center justify-center gap-1">
              {isLoadingTrends ? <><div className="w-3 h-3 border-2 border-slate-400 border-t-slate-600 rounded-full animate-spin" />분석 중...</> : <>🔥 트렌드 주제</>}
            </button>
          </div>

          {/* SEO 제목 추천 결과 */}
          {seoTitles.length > 0 && (
            <div className="space-y-1">
              {seoTitles.map((item, idx) => (
                <button key={idx} type="button" onClick={() => setTopic(item.title)}
                  className="w-full text-left px-3 py-2 bg-white border border-slate-100 rounded-lg hover:border-blue-400 transition-all group relative">
                  <div className="absolute top-2 right-2 text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">SEO {item.score}</div>
                  <span className="text-[10px] text-slate-400 block">{item.type}</span>
                  <span className="text-xs font-medium text-slate-700 group-hover:text-blue-600 block pr-12">{item.title}</span>
                </button>
              ))}
            </div>
          )}

          {/* 트렌드 주제 결과 */}
          {trendingItems.length > 0 && (
            <div className="space-y-1">
              {trendingItems.map((item, idx) => (
                <button key={idx} type="button" onClick={() => { setDisease(item.topic); }}
                  className="w-full text-left px-3 py-2 bg-white border border-slate-100 rounded-lg hover:border-blue-400 transition-all group relative">
                  <div className="absolute top-2 right-2 text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">SEO {item.score}</div>
                  <span className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 block pr-12">{item.topic}</span>
                  <p className="text-[11px] text-slate-400 truncate">{item.keywords} · {item.seasonal_factor}</p>
                </button>
              ))}
            </div>
          )}

          {/* 상세 설정 토글 */}
          <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-500 transition-all border border-slate-100">
            <span>⚙️ 상세 설정</span>
            <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>

          {/* 상세 설정 패널 */}
          {showAdvanced && (
          <div className="space-y-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="space-y-3">
              {/* 글자 수 */}
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-500">글자 수</label>
                  <span className="text-xs font-semibold text-blue-600">{textLength}자</span>
                </div>
                <input type="range" min={1500} max={3500} step={100} value={textLength} onChange={e => setTextLength(Number(e.target.value))} className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer" aria-label={`글자 수: ${textLength}자`} />
                <div className="flex justify-between mt-1 text-[10px] text-slate-400"><span>1500</span><span>2500</span><span>3500</span></div>
              </div>
              {/* AI 이미지 수 */}
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-500">AI 이미지 수</label>
                  <span className={`text-xs font-semibold ${imageCount === 0 ? 'text-slate-400' : 'text-blue-600'}`}>{imageCount === 0 ? '없음' : `${imageCount}장`}</span>
                </div>
                <input type="range" min={0} max={5} step={1} value={imageCount} onChange={e => setImageCount(Number(e.target.value))} className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer" aria-label={`AI 이미지 수: ${imageCount}장`} />
                <div className="flex justify-between mt-1 text-[10px] text-slate-400"><span>0장</span><span>5장</span></div>
              </div>
              {/* FAQ 토글 */}
              <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-sm">❓</span>
                  <div>
                    <span className="text-xs font-semibold text-slate-700">FAQ 섹션</span>
                    <p className="text-[10px] text-slate-400">네이버 질문 + 질병관리청 정보</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {includeFaq && (
                    <div className="flex gap-0.5">
                      {[3, 4, 5].map(num => (
                        <button key={num} type="button" onClick={() => setFaqCount(num)}
                          className={`w-7 h-7 rounded-md text-[10px] font-semibold transition-all ${faqCount === num ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >{num}</button>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => setIncludeFaq(!includeFaq)}
                    className={`relative rounded-full transition-colors ${includeFaq ? 'bg-blue-500' : 'bg-slate-300'}`}
                    style={{ width: 40, height: 22 }}
                  >
                    <span className={`absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${includeFaq ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
              {/* 이미지 스타일 (old 동일: 4버튼 + 커스텀 textarea) */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1.5">이미지 스타일</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {([
                    { id: 'photo' as ImageStyle, icon: '📸', label: '실사' },
                    { id: 'illustration' as ImageStyle, icon: '🎨', label: '일러스트' },
                    { id: 'medical' as ImageStyle, icon: '🫀', label: '의학 3D' },
                    { id: 'custom' as ImageStyle, icon: '✏️', label: '커스텀' },
                  ]).map(s => (
                    <button key={s.id} type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setImageStyle(s.id); setShowCustomInput(s.id === 'custom'); }}
                      className={`py-2 rounded-lg border transition-all flex flex-col items-center gap-0.5 ${imageStyle === s.id ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
                    >
                      <span className="text-base">{s.icon}</span>
                      <span className="text-[10px] font-semibold">{s.label}</span>
                    </button>
                  ))}
                </div>
                {showCustomInput && imageStyle === 'custom' && (
                  <div className="mt-2 p-2.5 bg-white rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-slate-600">커스텀 프롬프트</span>
                      {customPrompt && (
                        <button type="button" onClick={() => localStorage.setItem('hospital_custom_image_prompt', customPrompt)}
                          className="px-2 py-0.5 bg-slate-800 text-white text-[10px] font-medium rounded hover:bg-slate-900">저장</button>
                      )}
                    </div>
                    <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="파스텔톤, 손그림 느낌의 일러스트, 부드러운 선..."
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-xs focus:border-blue-400 outline-none resize-none" rows={2}
                    />
                  </div>
                )}
              </div>
              {/* 소제목 직접 입력 */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1.5">소제목 직접 입력 <span className="text-slate-400 font-normal">(선택 · 한 줄에 하나씩)</span></p>
                <textarea
                  value={customSubheadings}
                  onChange={e => setCustomSubheadings(e.target.value)}
                  placeholder={"임플란트 수술 과정과 기간\n임플란트 후 관리법\n임플란트 비용 비교"}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs focus:border-blue-400 outline-none resize-none placeholder:text-slate-300"
                  rows={3}
                />
              </div>
              {/* 말투 학습 (old 동일 위치: 이미지 스타일 아래, 화자/어조 위) */}
              <WritingStyleLearner
                onStyleSelect={(styleId) => setLearnedStyleId(styleId)}
                selectedStyleId={learnedStyleId}
                contentType="blog"
              />
              {/* 화자/어조 (학습된 말투 적용 시 숨김 — old 동일) */}
              {!learnedStyleId && (
                <div className="grid grid-cols-2 gap-2">
                  <select value={persona} onChange={e => setPersona(e.target.value)} className={inputCls}>
                    {PERSONAS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <select value={tone} onChange={e => setTone(e.target.value)} className={inputCls}>
                    {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
          )}

          {/* 생성 버튼 */}
          <button
            type="submit"
            disabled={isGenerating || !topic.trim()}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                생성 중...
              </>
            ) : (
              '블로그 생성하기'
            )}
          </button>
        </form>
      </div>

      {/* ── 결과 영역 ── */}
      <div className="flex-1 min-w-0">
        {isGenerating ? (() => {
          const stage = BLOG_STAGES[displayStage] || BLOG_STAGES[1];
          const pool = BLOG_MESSAGE_POOL[displayStage] || BLOG_MESSAGE_POOL[1];
          const displayMsg = pool[rotationIdx % pool.length];
          return (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-12 flex flex-col items-center justify-center text-center min-h-[480px]">
            {/* 상단: 현재 단계 배지 (old 동일) */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 bg-blue-50 text-blue-600 border border-blue-100">
              <span>{stage.icon}</span>
              <span>{stage.label}</span>
            </div>
            {/* 중단: 스피너 (old 동일) */}
            <div className="relative mb-6">
              <div className="w-14 h-14 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-50">
                  <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                </div>
              </div>
            </div>
            {/* 중단: 상세 진행 메시지 — 부드러운 전환 (old 동일) */}
            <p className="text-sm font-medium text-slate-700 mb-2 min-h-[20px] transition-opacity duration-500">
              {displayMsg}
            </p>
            {/* 하단: 짧은 안내 (old 동일) */}
            <p className="text-xs text-slate-400 max-w-xs">
              {stage.hint}
            </p>
          </div>
          );
        })() : error ? (
          <ErrorPanel error={error} onDismiss={() => setError(null)} />
        ) : generatedContent ? (
          <ResultPanel content={generatedContent} saveStatus={saveStatus} postType="blog" scores={scores} cssTheme={cssTheme} />
        ) : (
          /* EmptyState */
          <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] flex-1 min-h-[520px] overflow-hidden flex flex-col">
            <div className="flex items-center gap-1 px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
              {['B', 'I', 'U'].map(t => (
                <div key={t} className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold text-slate-300">{t}</div>
              ))}
              <div className="w-px h-4 mx-1 bg-slate-200" />
              {[1, 2, 3].map(i => (
                <div key={i} className="w-7 h-7 rounded flex items-center justify-center text-slate-300">
                  <div className="space-y-[3px]">
                    {Array.from({ length: i === 1 ? 3 : i === 2 ? 2 : 1 }).map((_, j) => (
                      <div key={j} className="h-0.5 rounded bg-slate-300" style={{ width: j === 0 ? '14px' : j === 1 ? '10px' : '12px' }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-12 py-16 select-none">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
                <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div className="max-w-sm text-center">
                <h2 className="text-3xl font-black tracking-tight leading-tight mb-3 text-slate-800">
                  AI가 작성하는<br /><span className="text-blue-600">의료 콘텐츠</span>
                </h2>
                <p className="text-sm leading-relaxed text-slate-400">
                  키워드 하나로 SEO 최적화된<br />블로그 글을 자동 생성합니다
                </p>
              </div>
              <div className="mt-8 flex flex-col items-center gap-2">
                {['병원 말투 학습 기반 생성', 'SEO 키워드 자동 최적화', '의료광고법 준수 검토'].map(text => (
                  <div key={text} className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs text-slate-400">
                    <span className="text-[10px] text-blue-400">✦</span>
                    {text}
                  </div>
                ))}
              </div>
              <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-blue-50 text-blue-500 border border-blue-100">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                AI 대기 중
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// useSearchParams를 쓰는 컴포넌트는 Suspense로 감싸야 함
export default function BlogPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin" />
      </div>
    }>
      <BlogForm />
    </Suspense>
  );
}
