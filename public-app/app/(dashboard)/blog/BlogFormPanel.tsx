'use client';

import { CATEGORIES, PERSONAS, TONES } from '../../../lib/constants';
import type { ContentCategory, AudienceMode, ImageStyle, CssTheme } from '../../../lib/types';
import type { KeywordStat, KeywordRankResult } from '../../../lib/keywordAnalysisService';
import type { ClinicContext } from '../../../lib/clinicContextService';
import type { TrendingItem, SeoTitleItem } from '../../../lib/types';
import WritingStyleLearner from '../../../components/WritingStyleLearner';
import { MAX_KEYWORDS } from '../../../lib/keywordAnalysisService';

export interface BlogFormPanelProps {
  // ── 폼 상태 ──
  topic: string;
  keywords: string;
  keywordDensity: number | 'auto';
  disease: string;
  category: ContentCategory;
  persona: string;
  tone: string;
  audienceMode: AudienceMode;
  imageStyle: ImageStyle;
  imageCount: number;
  imageAspectRatio: '4:3' | '16:9' | '1:1';
  textLength: number;
  hospitalName: string;
  hospitalNameFromProfile?: string;
  selectedHospitalAddress: string;
  homepageUrl: string;
  clinicContext: ClinicContext | null;
  isCrawling: boolean;
  crawlProgress: string;
  includeFaq: boolean;
  faqCount: number;
  showCustomInput: boolean;
  customPrompt: string;
  customSubheadings: string;
  learnedStyleId: string | undefined;
  showAdvanced: boolean;
  includeHospitalIntro: boolean;
  // ── 키워드 분석 상태 ──
  keywordStats: KeywordStat[];
  keywordAiRec: string;
  keywordProgress: string;
  isAnalyzingKeywords: boolean;
  showKeywordPanel: boolean;
  keywordSortBy: 'volume' | 'blog' | 'saturation';
  keywordSearch: string;
  keywordMinVolume: number;
  isCheckingRanks: boolean;
  rankResults: Map<string, KeywordRankResult>;
  hideRanked: boolean;
  isLoadingMoreKeywords: boolean;
  // ── SEO/트렌드 상태 ──
  seoTitles: SeoTitleItem[];
  trendingItems: TrendingItem[];
  isLoadingTitles: boolean;
  isLoadingTrends: boolean;
  // ── 생성 상태 ──
  isGenerating: boolean;
  // ── 폼 setter ──
  setTopic: (v: string) => void;
  setKeywords: (v: string | ((prev: string) => string)) => void;
  setKeywordDensity: (v: number | 'auto') => void;
  setDisease: (v: string) => void;
  setCategory: (v: ContentCategory) => void;
  setPersona: (v: string) => void;
  setTone: (v: string) => void;
  setAudienceMode: (v: AudienceMode) => void;
  setImageStyle: (v: ImageStyle) => void;
  setImageCount: (v: number) => void;
  setImageAspectRatio: (v: '4:3' | '16:9' | '1:1') => void;
  setTextLength: (v: number) => void;
  setHospitalName: (v: string) => void;
  setSelectedHospitalAddress: (v: string) => void;
  setHomepageUrl: (v: string) => void;
  setClinicContext: (v: ClinicContext | null) => void;
  setCrawlProgress: (v: string) => void;
  setIncludeFaq: (v: boolean) => void;
  setFaqCount: (v: number) => void;
  setShowCustomInput: (v: boolean) => void;
  setCustomPrompt: (v: string) => void;
  setCustomSubheadings: (v: string) => void;
  setLearnedStyleId: (v: string | undefined) => void;
  setShowAdvanced: (v: boolean) => void;
  setIncludeHospitalIntro: (v: boolean) => void;
  setKeywordStats: (v: KeywordStat[]) => void;
  setShowKeywordPanel: (v: boolean) => void;
  setKeywordSortBy: (v: 'volume' | 'blog' | 'saturation') => void;
  setKeywordSearch: (v: string) => void;
  setKeywordMinVolume: (v: number) => void;
  setHideRanked: (v: boolean) => void;
  // ── 핸들러 ──
  onSubmit: (e: React.FormEvent) => void;
  onAnalyzeKeywords: () => void;
  onCrawlHomepage: () => void;
  onLoadMoreKeywords: () => void;
  onCheckRanks: () => void;
  onRecommendTitles: () => void;
  onRecommendTrends: () => void;
}

export default function BlogFormPanel(props: BlogFormPanelProps) {
  const {
    topic, keywords, keywordDensity, disease, category, persona, tone, audienceMode, imageStyle, imageCount, imageAspectRatio, textLength,
    hospitalName, hospitalNameFromProfile, selectedHospitalAddress,
    homepageUrl, clinicContext, isCrawling, crawlProgress,
    includeFaq, faqCount, showCustomInput, customPrompt, customSubheadings,
    learnedStyleId, showAdvanced, includeHospitalIntro,
    keywordStats, keywordAiRec, keywordProgress, isAnalyzingKeywords, showKeywordPanel,
    keywordSortBy, keywordSearch, keywordMinVolume, isCheckingRanks, rankResults, hideRanked, isLoadingMoreKeywords,
    seoTitles, trendingItems, isLoadingTitles, isLoadingTrends,
    isGenerating,
    setTopic, setKeywords, setKeywordDensity, setDisease, setCategory, setPersona, setTone, setAudienceMode,
    setImageStyle, setImageCount, setImageAspectRatio, setTextLength, setHospitalName,
    setSelectedHospitalAddress,
    setHomepageUrl, setClinicContext, setCrawlProgress,
    setIncludeFaq, setFaqCount, setShowCustomInput, setCustomPrompt, setCustomSubheadings,
    setLearnedStyleId, setShowAdvanced, setIncludeHospitalIntro,
    setKeywordStats, setShowKeywordPanel, setKeywordSortBy, setKeywordSearch, setKeywordMinVolume, setHideRanked,
    onSubmit: handleSubmit,
    onAnalyzeKeywords: handleAnalyzeKeywords,
    onCrawlHomepage: handleCrawlHomepage,
    onLoadMoreKeywords: handleLoadMoreKeywords,
    onCheckRanks: handleCheckRanks,
    onRecommendTitles: handleRecommendTitles,
    onRecommendTrends: handleRecommendTrends,
  } = props;

  const inputCls = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all";
  const labelCls = "block text-xs font-semibold text-slate-500 mb-1.5";

  return (
      <div className="w-full lg:w-[340px] xl:w-[380px] lg:flex-none">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">📝</span>
            <h2 className="text-base font-bold text-slate-800">블로그 생성</h2>
          </div>

          {/* 병원명 */}
          <div>
            <label className={labelCls}>병원명</label>
            <input
              type="text"
              value={hospitalName}
              onChange={e => setHospitalName(e.target.value)}
              placeholder="병원 이름을 입력하세요 (예: OO치과)"
              className={inputCls}
            />
            {hospitalNameFromProfile && hospitalName === hospitalNameFromProfile && (
              <p className="text-[10px] text-blue-400 mt-1">회원 정보에서 자동 입력됨</p>
            )}
          </div>

          {/* 진료과 */}
          <select value={category} onChange={e => setCategory(e.target.value as ContentCategory)} className={inputCls} disabled={isGenerating} aria-label="진료과 선택">
            {CATEGORIES.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
          </select>

          {/* 병원 주소 + 키워드 분석 */}
          {hospitalName && (
            <div>
              <label className={labelCls}>병원 주소 (키워드 분석용)</label>
              <div className="flex gap-1.5">
                <input type="text" value={selectedHospitalAddress} onChange={e => setSelectedHospitalAddress(e.target.value)}
                  placeholder="예: 서울 강남구 역삼동" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-blue-400 outline-none bg-white" />
                <button type="button" onClick={handleAnalyzeKeywords}
                  disabled={isAnalyzingKeywords || !selectedHospitalAddress.trim()}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap">
                  {isAnalyzingKeywords ? '분석 중...' : '🔍 키워드 분석'}
                </button>
              </div>
            </div>
          )}

          {/* 키워드 분석 결과 */}
          {selectedHospitalAddress && hospitalName && showKeywordPanel && (
            <button
              type="button"
              onClick={handleAnalyzeKeywords}
              disabled={isAnalyzingKeywords}
              className="w-full py-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-sm disabled:opacity-50"
            >
              <span>🔍</span>
              <span>{isAnalyzingKeywords ? '키워드 분석 중...' : '키워드 분석'}</span>
            </button>
          )}

          {/* 키워드 분석 결과 패널 (old InputForm 동일) */}
          {showKeywordPanel && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-700">키워드 분석 ({keywordStats.length}개)</span>
                <div className="flex items-center gap-1">
                  {(['volume', 'blog', 'saturation'] as const).map(sort => (
                    <button key={sort} type="button" onClick={() => setKeywordSortBy(sort)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${keywordSortBy === sort ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {sort === 'volume' ? '검색량' : sort === 'blog' ? '발행량' : '포화도'}
                    </button>
                  ))}
                  <button type="button" onClick={() => setShowKeywordPanel(false)} className="ml-1 text-slate-400 hover:text-slate-600">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
              {/* 검색 + 최소 검색량 필터 */}
              {!isAnalyzingKeywords && keywordStats.length > 0 && (
                <div className="flex gap-2 px-3 py-2 border-b border-slate-100 bg-white">
                  <input
                    type="text"
                    value={keywordSearch}
                    onChange={e => setKeywordSearch(e.target.value)}
                    placeholder="키워드 검색..."
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 placeholder:text-slate-300"
                  />
                  {/* 노출 중 숨기기 토글 (상위권 체크 완료 시만) */}
                  {rankResults.size > 0 && (
                    <>
                      <button type="button" onClick={() => setHideRanked(!hideRanked)}
                        className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg border transition-all whitespace-nowrap ${hideRanked ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                      >
                        {hideRanked ? '✅ 노출 중 숨김' : '노출 중 포함'}
                      </button>
                      <span className="text-[9px] text-slate-400 whitespace-nowrap">※ API 참고용 (실제 순위와 다를 수 있음)</span>
                    </>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">최소</span>
                    <select
                      value={keywordMinVolume}
                      onChange={e => setKeywordMinVolume(Number(e.target.value))}
                      className="px-1.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white text-slate-600"
                    >
                      <option value={0}>전체</option>
                      <option value={10}>10+</option>
                      <option value={50}>50+</option>
                      <option value={100}>100+</option>
                      <option value={500}>500+</option>
                      <option value={1000}>1,000+</option>
                      <option value={5000}>5,000+</option>
                    </select>
                  </div>
                </div>
              )}
              {isAnalyzingKeywords ? (
                <div className="p-6 text-center">
                  <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-slate-400">{keywordProgress || '검색량 분석 중...'}</p>
                </div>
              ) : keywordStats.length > 0 ? (
                <>
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr className="text-slate-500">
                          <th className="text-left px-3 py-2 font-semibold">키워드</th>
                          <th className="text-right px-3 py-2 font-semibold">월간 검색량</th>
                          <th className="text-right px-3 py-2 font-semibold">발행량</th>
                          <th className="text-right px-3 py-2 font-semibold">포화도</th>
                          {rankResults.size > 0 && <th className="text-center px-2 py-2 font-semibold" title="네이버 API 기준 참고 순위 (실제와 다를 수 있음)">순위<span className="text-[8px] text-slate-400 ml-0.5">참고</span></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {[...keywordStats]
                          .filter(s => {
                            if (keywordMinVolume > 0 && s.monthlySearchVolume < keywordMinVolume) return false;
                            if (keywordSearch && !s.keyword.includes(keywordSearch.trim())) return false;
                            if (hideRanked && rankResults.get(s.keyword)?.isRanked) return false;
                            return true;
                          })
                          .sort((a, b) => {
                            if (keywordSortBy === 'volume') return b.monthlySearchVolume - a.monthlySearchVolume;
                            if (keywordSortBy === 'blog') return b.blogPostCount - a.blogPostCount;
                            return (a.saturation || 0) - (b.saturation || 0);
                          })
                          .map((stat, idx) => (
                            <tr
                              key={stat.keyword}
                              className={`border-t border-slate-50 hover:bg-blue-50 cursor-pointer transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}
                              onClick={() => setKeywords(k => k ? `${k}, ${stat.keyword}` : stat.keyword)}
                            >
                              <td className="px-3 py-2 font-medium text-slate-700">{stat.keyword}</td>
                              <td className="px-3 py-2 text-right text-slate-600">{stat.monthlySearchVolume.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right text-slate-600">{stat.blogPostCount.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right">
                                <span className={`font-semibold ${(stat.saturation || 0) < 1 ? 'text-emerald-600' : (stat.saturation || 0) < 3 ? 'text-amber-600' : 'text-red-600'}`}>
                                  {stat.saturation?.toFixed(1) || '0.0'}
                                </span>
                              </td>
                              {rankResults.size > 0 && (
                                <td className="px-2 py-2 text-center">
                                  {(() => {
                                    const r = rankResults.get(stat.keyword);
                                    if (!r) return <span className="text-slate-300">-</span>;
                                    if (r.isRanked && r.rank) {
                                      const emoji = r.rank <= 5 ? '🟢' : r.rank <= 10 ? '🔵' : '🟡';
                                      return <span className={`text-[10px] font-bold ${r.rank <= 5 ? 'text-emerald-600' : r.rank <= 10 ? 'text-blue-600' : 'text-amber-600'}`} title={r.matchedTitle || ''}>{emoji} {r.rank}위</span>;
                                    }
                                    return <span className="text-[10px] text-slate-400">30위권 밖</span>;
                                  })()}
                                </td>
                              )}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {/* 더보기 + 상위권 체크 버튼 */}
                  <div className="px-3 py-2 border-t border-slate-100 flex gap-2">
                    {keywordStats.length < MAX_KEYWORDS && (
                      <button type="button" onClick={handleLoadMoreKeywords} disabled={isLoadingMoreKeywords}
                        className="flex-1 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded transition-all disabled:opacity-50 flex items-center justify-center gap-1">
                        {isLoadingMoreKeywords ? (
                          <><div className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />로딩 중...</>
                        ) : (
                          <>더보기 ({keywordStats.length}/{MAX_KEYWORDS})</>
                        )}
                      </button>
                    )}
                    <button type="button" onClick={handleCheckRanks} disabled={isCheckingRanks || keywordStats.length === 0}
                      className="flex-1 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 rounded border border-emerald-200 transition-all disabled:opacity-50 flex items-center justify-center gap-1">
                      {isCheckingRanks ? (
                        <><div className="w-3 h-3 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />체크 중...</>
                      ) : (
                        <>🔍 상위권 체크</>
                      )}
                    </button>
                  </div>
                  {keywordProgress && <p className="text-[10px] text-slate-400 text-center px-3 pb-2">{keywordProgress}</p>}
                  {/* AI 블루오션 분석 결과 */}
                  {keywordAiRec && (
                    <div className="px-3 py-3 border-t border-slate-100 bg-blue-50/50">
                      <p className="text-[11px] font-bold text-blue-700 mb-1">💡 AI 키워드 분석</p>
                      <div className="text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed">{keywordAiRec}</div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-4 text-center text-xs text-slate-400">분석 결과가 없습니다</div>
              )}
            </div>
          )}

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

          {/* 세부 옵션 토글 */}
          {(() => {
            const advancedCount = [
              audienceMode !== '환자용(친절/공감)',
              keywords.trim(),
              disease.trim(),
              homepageUrl.trim(),
              textLength !== 2500,
              imageCount !== 2,
              imageStyle !== 'photo',
              customSubheadings.trim(),
              includeFaq,
              includeHospitalIntro,
            ].filter(Boolean).length;
            return (
              <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-500 transition-all border border-slate-100">
                <span>⚙️ 세부 옵션{advancedCount > 0 ? ` (${advancedCount}개 설정됨)` : ''}</span>
                <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
            );
          })()}

          {/* 세부 옵션 패널 */}
          {showAdvanced && (
          <div className="space-y-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="space-y-3">
              {/* 대상 독자 */}
              <div>
                <label className={labelCls}>대상 독자</label>
                <select value={audienceMode} onChange={e => setAudienceMode(e.target.value as AudienceMode)} className={inputCls} disabled={isGenerating}>
                  <option value="환자용(친절/공감)">환자용 (친절/공감)</option>
                  <option value="보호자용(가족걱정)">보호자용 (부모님/자녀 걱정)</option>
                  <option value="전문가용(신뢰/정보)">전문가용 (신뢰/정보)</option>
                </select>
              </div>
              {/* 키워드 */}
              <div>
                <label className={labelCls}>SEO 키워드</label>
                <input type="text" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="예: 강남 치과, 임플란트 가격" className={inputCls} />
              </div>
              {keywords.trim() && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">반복</span>
                  {(['auto', 3, 5, 7] as const).map(opt => (
                    <button key={opt} type="button" onClick={() => setKeywordDensity(opt)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${keywordDensity === opt ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                      {opt === 'auto' ? '자동' : `${opt}회`}
                    </button>
                  ))}
                </div>
              )}
              {/* 질환명 */}
              <div>
                <label className={labelCls}>질환명</label>
                <input type="text" value={disease} onChange={e => setDisease(e.target.value)} placeholder="예: 치주염, 충치 — 글의 실제 주제" className={inputCls} />
              </div>
              {/* 블로그 URL */}
              {hospitalName && (
                <div>
                  <label className={labelCls}>병원 홈페이지/블로그 URL</label>
                  <div className="flex gap-1.5">
                    <input type="url" value={homepageUrl} onChange={e => { setHomepageUrl(e.target.value); setClinicContext(null); setCrawlProgress(''); }}
                      placeholder="https://blog.naver.com/..." className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-blue-400 outline-none bg-white" />
                    <button type="button" onClick={handleCrawlHomepage} disabled={isCrawling || !homepageUrl.trim()}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 whitespace-nowrap">
                      {isCrawling ? '분석 중...' : '분석'}
                    </button>
                  </div>
                  {crawlProgress && <p className="mt-1 text-[10px] text-slate-400">{crawlProgress}</p>}
                  {clinicContext && (
                    <div className="mt-1.5 p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                      <p className="text-[10px] font-semibold text-emerald-700 mb-1">분석 결과 (신뢰도 {Math.round(clinicContext.confidence * 100)}%)</p>
                      {clinicContext.actualServices.length > 0 && <p className="text-[10px] text-slate-600">서비스: {clinicContext.actualServices.join(', ')}</p>}
                      {clinicContext.specialties.length > 0 && <p className="text-[10px] text-slate-600">특화: {clinicContext.specialties.join(', ')}</p>}
                      {clinicContext.locationSignals.length > 0 && <p className="text-[10px] text-slate-600">지역: {clinicContext.locationSignals.join(', ')}</p>}
                    </div>
                  )}
                </div>
              )}
              {/* 글 길이 */}
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">글 길이</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { value: 1500, label: '짧은 글', desc: '1,000~2,000자' },
                    { value: 2500, label: '중간 글', desc: '2,000~3,000자' },
                    { value: 3500, label: '긴 글', desc: '3,000자~' },
                  ]).map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setTextLength(opt.value)}
                      className={`py-2 rounded-lg border transition-all text-center ${textLength === opt.value ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
                    >
                      <span className="text-[11px] font-semibold block">{opt.label}</span>
                      <span className={`text-[9px] ${textLength === opt.value ? 'text-blue-400' : 'text-slate-400'}`}>{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* AI 이미지 수 */}
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-500">AI 이미지 수</label>
                  <span className={`text-xs font-semibold ${imageCount === 0 ? 'text-slate-400' : 'text-blue-600'}`}>{imageCount === 0 ? '없음' : `${imageCount}장`}</span>
                </div>
                <input type="range" min={0} max={10} step={1} value={imageCount} onChange={e => setImageCount(Number(e.target.value))} className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer" aria-label={`AI 이미지 수: ${imageCount}장`} />
                <div className="flex justify-between mt-1 text-[10px] text-slate-400"><span>0장</span><span>10장</span></div>
                {imageCount >= 6 && <p className="text-[10px] text-amber-600 mt-1">이미지가 많을수록 생성 시간이 길어집니다 (6장 이상: 약 3~5분)</p>}
              </div>
              {/* 이미지 비율 */}
              {imageCount > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 mb-1.5">이미지 비율</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { id: '4:3' as const, label: '4:3', desc: '블로그 최적' },
                      { id: '16:9' as const, label: '16:9', desc: '와이드' },
                      { id: '1:1' as const, label: '1:1', desc: '정사각' },
                    ]).map(r => (
                      <button key={r.id} type="button" onClick={() => setImageAspectRatio(r.id)}
                        className={`py-2 rounded-lg border transition-all text-center ${imageAspectRatio === r.id ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                        <span className="text-[11px] font-semibold block">{r.label}</span>
                        <span className={`text-[9px] ${imageAspectRatio === r.id ? 'text-blue-400' : 'text-slate-400'}`}>{r.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* FAQ 토글 */}
              <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-sm">❓</span>
                  <div>
                    <span className="text-xs font-semibold text-slate-700">FAQ 섹션</span>
                    <p className="text-[10px] text-slate-400">네이버 질문 + 의료 학회/기관 정보</p>
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
              {/* 병원 소개 섹션 토글 */}
              <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🏥</span>
                  <div>
                    <span className="text-xs font-semibold text-slate-700">병원 소개 섹션</span>
                    <p className="text-[10px] text-slate-400">홈페이지 크롤링 후 자동 삽입</p>
                  </div>
                </div>
                <button type="button" onClick={() => setIncludeHospitalIntro(!includeHospitalIntro)}
                  className={`relative rounded-full transition-colors ${includeHospitalIntro ? 'bg-blue-500' : 'bg-slate-300'}`}
                  style={{ width: 40, height: 22 }}
                >
                  <span className={`absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${includeHospitalIntro ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                </button>
              </div>
              {/* 소제목 직접 입력 (OLD 기준: 이미지 스타일 위) */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1.5">소제목 직접 입력 <span className="text-slate-400 font-normal">(선택 · 한 줄에 하나씩)</span></p>
                <textarea
                  value={customSubheadings}
                  onChange={e => setCustomSubheadings(e.target.value)}
                  onPaste={e => { e.preventDefault(); const text = e.clipboardData.getData('text/plain'); document.execCommand('insertText', false, text); }}
                  placeholder={"임플란트 수술 과정과 기간\n임플란트 후 관리법\n임플란트 비용 비교"}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs focus:border-blue-400 outline-none resize-none placeholder:text-slate-300"
                  rows={3}
                />
              </div>
              {/* 이미지 스타일 */}
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
                      onPaste={e => { e.preventDefault(); const text = e.clipboardData.getData('text/plain'); document.execCommand('insertText', false, text); }}
                      placeholder="파스텔톤, 손그림 느낌의 일러스트, 부드러운 선..."
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-xs focus:border-blue-400 outline-none resize-none" rows={2}
                    />
                  </div>
                )}
              </div>
              {/* 말투 학습 */}
              <WritingStyleLearner
                onStyleSelect={(styleId) => setLearnedStyleId(styleId)}
                selectedStyleId={learnedStyleId}
                contentType="blog"
              />
              {/* 화자/어조 (학습된 말투 적용 시 숨김) */}
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
  );
}
