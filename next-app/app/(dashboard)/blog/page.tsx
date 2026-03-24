'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CATEGORIES, PERSONAS, TONES } from '../../../lib/constants';
import { TEAM_DATA } from '../../../lib/teamData';
import { ContentCategory, type GenerationRequest, type AudienceMode, type ImageStyle, type WritingStyle, type CssTheme, type TrendingItem, type SeoTitleItem } from '../../../lib/types';
import { buildBlogPrompt } from '../../../lib/blogPrompt';
import { savePost } from '../../../lib/postStorage';
import { getSessionSafe } from '../../../lib/supabase';
import { getHospitalStylePrompt } from '../../../lib/styleService';
import { ErrorPanel, ResultPanel, type ScoreBarData } from '../../../components/GenerationResult';

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
  const [showAdvanced, setShowAdvanced] = useState(false);

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
          model: 'gemini-2.0-flash-lite',
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
          model: 'gemini-2.0-flash-lite',
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
      hospitalName: hospitalName || undefined,
      hospitalStyleSource: hospitalName ? 'explicit_selected_hospital' : 'generic_default',
    };

    setIsGenerating(true);
    setError(null);
    setGeneratedContent(null);
    setScores(undefined);
    setSaveStatus(null);

    try {
      const { systemInstruction, prompt } = buildBlogPrompt(request);

      // 병원 말투 프로파일 자동 주입
      let finalPrompt = prompt;
      if (hospitalName) {
        try {
          const stylePrompt = await getHospitalStylePrompt(hospitalName);
          if (stylePrompt) {
            finalPrompt = `${prompt}\n\n[병원 블로그 학습 말투 - 반드시 적용]\n${stylePrompt}`;
          }
        } catch { /* 프로파일 없으면 기본 동작 */ }
      }

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          systemInstruction,
          model: 'gemini-2.5-flash-preview-05-20',
          temperature: 0.85,
          maxOutputTokens: 8192,
        }),
      });

      const data = await res.json() as { text?: string; error?: string; details?: string };

      if (!res.ok || !data.text) {
        setError(data.error || data.details || `서버 오류 (${res.status})`);
        return;
      }

      // 점수 블록 파싱: ---SCORES--- 이후 JSON 추출
      let blogText = data.text;
      let parsed: ScoreBarData | undefined;
      const marker = '---SCORES---';
      const idx = blogText.lastIndexOf(marker);
      if (idx !== -1) {
        const afterMarker = blogText.substring(idx + marker.length);
        try {
          const jsonMatch = afterMarker.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
            const seo = typeof raw.seo === 'number' ? raw.seo : undefined;
            const medical = typeof raw.medical === 'number' ? raw.medical : undefined;
            const conversion = typeof raw.conversion === 'number' ? raw.conversion : undefined;
            if (seo != null || medical != null || conversion != null) {
              parsed = { seoScore: seo, safetyScore: medical, conversionScore: conversion };
            }
          }
        } catch {
          // JSON 파싱 실패 — parsed는 undefined로 유지
        }
        // 마커가 있으면 항상 마커 이후를 제거 (파싱 성공 여부와 무관)
        // 마커 바로 앞의 코드블록 fence(```)도 함께 제거
        blogText = blogText.substring(0, idx).replace(/\n*```\s*$/, '').replace(/\n+$/, '');
        // 본문에 혹시 남은 마커 잔여물도 제거
        blogText = blogText.replace(/---SCORES---[\s\S]*$/, '').replace(/\n+$/, '');
      }

      setGeneratedContent(blogText);
      setScores(parsed);

      // 저장 — Supabase 또는 guest localStorage
      try {
        const { userId, userEmail } = await getSessionSafe();
        const titleMatch = blogText.match(/^#\s+(.+)/m) || blogText.match(/^(.+)/);
        const extractedTitle = titleMatch ? titleMatch[1].replace(/^#+\s*/, '').trim().substring(0, 200) : topic.trim();

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
          setSaveStatus('저장 실패: ' + saveResult.error);
        } else {
          setSaveStatus('저장 완료');
        }
      } catch {
        setSaveStatus('저장 실패: Supabase 연결 불가');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '네트워크 오류';
      setError(msg);
    } finally {
      setIsGenerating(false);
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
              {/* 이미지 스타일 */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1.5">이미지 스타일</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {([
                    { id: 'photo' as ImageStyle, icon: '📸', label: '실사' },
                    { id: 'illustration' as ImageStyle, icon: '🎨', label: '일러스트' },
                    { id: 'medical' as ImageStyle, icon: '🫀', label: '의학 3D' },
                  ]).map(s => (
                    <button key={s.id} type="button"
                      onClick={() => setImageStyle(s.id)}
                      className={`py-2 rounded-lg border transition-all flex flex-col items-center gap-0.5 ${imageStyle === s.id ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
                    >
                      <span className="text-base">{s.icon}</span>
                      <span className="text-[10px] font-semibold">{s.label}</span>
                    </button>
                  ))}
                </div>
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
              {/* 화자/어조 */}
              <div className="grid grid-cols-2 gap-2">
                <select value={persona} onChange={e => setPersona(e.target.value)} className={inputCls}>
                  {PERSONAS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <select value={tone} onChange={e => setTone(e.target.value)} className={inputCls}>
                  {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
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
        {isGenerating ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-12 flex flex-col items-center justify-center text-center min-h-[480px]">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 bg-blue-50 text-blue-600 border border-blue-100">
              <span>✍️</span>
              <span>글 준비 중</span>
            </div>
            <div className="relative mb-6">
              <div className="w-14 h-14 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin" />
            </div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              좋은 문장을 한 줄씩 꺼내고 있어요
            </p>
            <p className="text-xs text-slate-400">
              전문 의료 콘텐츠를 작성하고 있습니다
            </p>
          </div>
        ) : error ? (
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
