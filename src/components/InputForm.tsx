import React, { useState, useEffect, useRef } from 'react';
import { CATEGORIES, TONES, PERSONAS } from '../constants';
import { TEAM_DATA, HospitalEntry } from '../constants/teamHospitals';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { analyzeHospitalKeywords, loadMoreKeywords, KeywordStat, MAX_KEYWORDS } from '../services/keywordAnalysisService';
import { GenerationRequest, ContentCategory, TrendingItem, SeoTitleItem, AudienceMode, ImageStyle, PostType, CssTheme, WritingStyle, CardNewsDesignTemplateId } from '../types';
import { CARD_NEWS_DESIGN_TEMPLATES } from '../services/cardNewsDesignTemplates';
import { getTrendingTopics, recommendSeoTitles } from '../services/seoService';
import WritingStyleLearner from './WritingStyleLearner';
import { toast } from './Toast';

// localStorage 키
const CUSTOM_PROMPT_KEY = 'hospital_custom_image_prompt';

interface InputFormProps {
  onSubmit: (data: GenerationRequest) => void;
  isLoading: boolean;
  onTabChange?: (tab: 'blog' | 'similarity' | 'refine' | 'card_news' | 'press' | 'image') => void;
  activePostType?: PostType;
}

const InputForm: React.FC<InputFormProps> = ({ onSubmit, isLoading, onTabChange, activePostType }) => {
  const [postType, setPostTypeRaw] = useState<PostType>(activePostType || 'blog');

  // URL hash(activePostType)와 내부 postType 동기화
  useEffect(() => {
    if (activePostType && activePostType !== postType) {
      setPostTypeRaw(activePostType);
    }
  }, [activePostType]);

  // postType 변경 시 App의 contentTab도 함께 업데이트
  const setPostType = (type: PostType) => {
    setPostTypeRaw(type);
    if (onTabChange) {
      const tabMap: Record<PostType, 'blog' | 'card_news' | 'press'> = {
        blog: 'blog',
        card_news: 'card_news',
        press_release: 'press',
      };
      onTabChange(tabMap[type]);
    }
  };

  const [category, setCategory] = useState<ContentCategory>(CATEGORIES[0].value);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('환자용(친절/공감)');
  const [persona, setPersona] = useState(PERSONAS[0].value);
  const [tone, setTone] = useState(TONES[0].value);
  const [imageStyle, setImageStyle] = useState<ImageStyle>('photo');
  const [cssTheme, setCssTheme] = useState<CssTheme>('modern');
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [disease, setDisease] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  
  // 커스텀 이미지 프롬프트
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  
  // localStorage에서 저장된 커스텀 프롬프트 불러오기
  useEffect(() => {
    const saved = localStorage.getItem(CUSTOM_PROMPT_KEY);
    if (saved) {
      setCustomPrompt(saved);
      // UI는 imageStyle === 'custom'일 때만 보여주므로 여기서 setShowCustomInput 안 함
    }
  }, []);
  
  const [textLength, setTextLength] = useState<number>(1500);
  const [slideCount, setSlideCount] = useState<number>(6);
  const [imageCount, setImageCount] = useState<number>(0); // 기본값 0장
  const [writingStyle, setWritingStyle] = useState<WritingStyle>('empathy'); // 기본값: 공감형
  const [designTemplateId, setDesignTemplateId] = useState<CardNewsDesignTemplateId | undefined>(undefined);
  const [medicalLawMode, setMedicalLawMode] = useState<'strict' | 'relaxed'>(() => {
    return (localStorage.getItem('medicalLawMode') as 'strict' | 'relaxed') || 'strict';
  });
  
  // 말투 학습 스타일
  const [learnedStyleId, setLearnedStyleId] = useState<string | undefined>(undefined);
  
  // 🏥 병원 선택 state
  // localStorage에서 병원명은 UI 표시용으로만 복원 — 말투 적용은 명시 선택 시에만
  const [hospitalName, setHospitalName] = useState<string>(() => localStorage.getItem('hospitalName') || '');
  const [hospitalExplicitlySelected, setHospitalExplicitlySelected] = useState(false);
  const [showHospitalDropdown, setShowHospitalDropdown] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [selectedManager, setSelectedManager] = useState<string>('');
  const [selectedHospitalEntry, setSelectedHospitalEntry] = useState<HospitalEntry | null>(null);
  const [keywordStats, setKeywordStats] = useState<KeywordStat[]>([]);
  const [keywordAiRec, setKeywordAiRec] = useState<string>('');
  const [keywordProgress, setKeywordProgress] = useState<string>('');
  const [isAnalyzingKeywords, setIsAnalyzingKeywords] = useState(false);
  const [isLoadingMoreKeywords, setIsLoadingMoreKeywords] = useState(false);
  const [showKeywordPanel, setShowKeywordPanel] = useState(false);
  const [keywordSortBy, setKeywordSortBy] = useState<'volume' | 'blog' | 'saturation'>('volume');
  const hospitalDropdownRef = useRef<HTMLDivElement>(null);
  const topicInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (hospitalDropdownRef.current && !hospitalDropdownRef.current.contains(e.target as Node)) {
        setShowHospitalDropdown(false);
      }
    };
    if (showHospitalDropdown) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showHospitalDropdown]);
  const [hospitalWebsite, setHospitalWebsite] = useState<string>('');
  const [doctorName, setDoctorName] = useState<string>('');
  const [doctorTitle, setDoctorTitle] = useState<string>('원장');
  const [pressType, setPressType] = useState<'achievement' | 'new_service' | 'research' | 'event' | 'award' | 'health_tips'>('achievement');
  
  // 커스텀 소제목
  const [customSubheadings, setCustomSubheadings] = useState<string>('');

  // FAQ 옵션
  const [includeFaq, setIncludeFaq] = useState<boolean>(false);
  const [faqCount, setFaqCount] = useState<number>(3);
  // 병원 소개 섹션
  const [includeHospitalIntro, setIncludeHospitalIntro] = useState<boolean>(false);
  
  const [trendingItems, setTrendingItems] = useState<TrendingItem[]>([]);
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  const [seoTitles, setSeoTitles] = useState<SeoTitleItem[]>([]);
  const [isLoadingTitles, setIsLoadingTitles] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(true);
  
  const handleSubmit = (e: React.MouseEvent<HTMLButtonElement> | React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    console.info('[GEN_STEP] handleSubmit click — topic:', topic?.substring(0, 30), ', postType:', postType, ', isLoading:', isLoading);

    if (!topic.trim()) {
      console.warn('[GEN_STEP] handleSubmit early return — topic 비어있음');
      return;
    }
    
    const requestData = {
      category,
      topic,
      keywords,
      disease: disease.trim() || undefined,
      tone,
      audienceMode, 
      persona, 
      imageStyle, 
      cssTheme,
      referenceUrl, 
      postType,
      textLength,
      slideCount,
      imageCount,
      writingStyle,
      medicalLawMode,
      // 🎨 커스텀 스타일 선택 시에만 커스텀 프롬프트 전달!
      customImagePrompt: (() => {
        const result = imageStyle === 'custom' ? (customPrompt?.trim() || undefined) : undefined;
        console.info('📤 InputForm 전송 - imageStyle:', imageStyle, ', customPrompt:', customPrompt?.substring(0, 30), ', 전달값:', result?.substring(0, 30));
        return result;
      })(),
      // 📝 학습된 말투 스타일 ID
      learnedStyleId,
      // 🎨 카드뉴스 디자인 템플릿
      designTemplateId: postType === 'card_news' ? designTemplateId : undefined,
      // 📋 커스텀 소제목
      customSubheadings: customSubheadings.trim() || undefined,
      // ❓ FAQ 옵션
      includeFaq: postType === 'blog' ? includeFaq : undefined,
      faqCount: postType === 'blog' && includeFaq ? faqCount : undefined,
      // 🏥 병원 소개 섹션
      includeHospitalIntro: postType === 'blog' ? includeHospitalIntro : undefined,
      // 🏥 병원명 (공통) — 말투 적용은 명시 선택 시에만
      hospitalName: hospitalName || undefined,
      hospitalStyleSource: hospitalExplicitlySelected && hospitalName ? 'explicit_selected_hospital' : 'generic_default',
      hospitalWebsite: postType === 'press_release' ? hospitalWebsite : undefined,
      doctorName: postType === 'press_release' ? doctorName : undefined,
      doctorTitle: postType === 'press_release' ? doctorTitle : undefined,
      pressType: postType === 'press_release' ? pressType : undefined,
    };
    
    console.info('[GEN_STEP] handleSubmit → onSubmit 호출');
    onSubmit(requestData);
  };

  const handleAnalyzeKeywords = async () => {
    if (!selectedHospitalEntry?.address) return;
    setIsAnalyzingKeywords(true);
    setShowKeywordPanel(true);
    setKeywordAiRec('');
    setKeywordProgress('');
    try {
      const result = await analyzeHospitalKeywords(
        hospitalName,
        selectedHospitalEntry.address,
        category,
        (msg) => setKeywordProgress(msg)
      );
      setKeywordStats(result.stats);
      if (result.apiErrors?.length) {
        const blogErr = result.apiErrors.find(e => e.includes('블로그') || e.includes('Blog') || e.includes('CLIENT'));
        if (blogErr) {
          setKeywordAiRec((result.aiRecommendation || '') + `\n\n⚠️ **발행량 조회 오류:** ${blogErr}`);
        } else {
          setKeywordAiRec(result.aiRecommendation || '');
        }
      } else {
        setKeywordAiRec(result.aiRecommendation || '');
      }
    } catch (e: any) {
      console.error('키워드 분석 실패:', e);
      setKeywordStats([]);
    } finally {
      setIsAnalyzingKeywords(false);
      setKeywordProgress('');
    }
  };

  const handleLoadMoreKeywords = async () => {
    if (!selectedHospitalEntry?.address) return;
    if (keywordStats.length >= MAX_KEYWORDS) return;
    setIsLoadingMoreKeywords(true);
    setKeywordProgress('');
    try {
      const { stats: moreStats, apiErrors, reachedLimit } = await loadMoreKeywords(
        hospitalName,
        selectedHospitalEntry.address,
        keywordStats,
        category,
        (msg) => setKeywordProgress(msg)
      );
      if (moreStats.length > 0) {
        // 중복 제거 후 추가
        setKeywordStats(prev => {
          const existingSet = new Set(prev.map(s => s.keyword.toLowerCase()));
          const uniqueNew = moreStats.filter(s => !existingSet.has(s.keyword.toLowerCase()));
          const combined = [...prev, ...uniqueNew];
          return combined.slice(0, MAX_KEYWORDS);
        });
      }
      if (apiErrors?.length) {
        console.warn('[키워드분석] 더보기 API 에러:', apiErrors);
      }
      if (reachedLimit) {
        setKeywordProgress(`최대 ${MAX_KEYWORDS}개 키워드에 도달했습니다.`);
      }
    } catch (e: any) {
      console.error('추가 키워드 로드 실패:', e);
    } finally {
      setIsLoadingMoreKeywords(false);
      setTimeout(() => setKeywordProgress(''), 2000);
    }
  };

  const handleRecommendTrends = async () => {
    console.info('[ANALYZE] 트렌드 주제 click — category:', category);
    setIsLoadingTrends(true);
    setTrendingItems([]);
    setSeoTitles([]);
    try {
      console.info('[ANALYZE] 트렌드 before await — getTrendingTopics');
      const items = await getTrendingTopics(category);
      console.info('[ANALYZE] 트렌드 success — items:', items?.length);
      setTrendingItems(items);
    } catch (e: any) {
      console.error('[ANALYZE] 트렌드 error:', e?.message || e);
      toast.error('트렌드 로딩 실패');
    } finally {
      console.info('[ANALYZE] 트렌드 finally — reset loading');
      setIsLoadingTrends(false);
    }
  };

  const handleRecommendTitles = async () => {
    const topicForSeo = topic || disease || keywords || '';
    console.info('[ANALYZE] AI 제목 추천 click — topic:', topicForSeo?.substring(0, 30), ', postType:', postType);
    if (!topicForSeo) {
      console.warn('[ANALYZE] AI 제목 추천 — early return: topicForSeo 비어있음');
      return;
    }
    setIsLoadingTitles(true);
    setSeoTitles([]);
    setTrendingItems([]);
    try {
        const keywordsForSeo = keywords || disease || topicForSeo;
        console.info('[ANALYZE] AI 제목 추천 before await — recommendSeoTitles');
        const titles = await recommendSeoTitles(topicForSeo, keywordsForSeo, postType === 'press_release' ? 'blog' : postType);
        console.info('[ANALYZE] AI 제목 추천 success — titles:', titles?.length);
        const sortedTitles = titles.sort((a, b) => b.score - a.score);
        setSeoTitles(sortedTitles);
    } catch (e: any) {
        console.error('[ANALYZE] AI 제목 추천 error:', e?.message || e);
        toast.error('제목 추천 실패');
    } finally {
        console.info('[ANALYZE] AI 제목 추천 finally — reset loading');
        setIsLoadingTitles(false);
    }
  };

  const inputCls = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-700 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all placeholder:text-slate-300";
  const selectCls = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-700 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">

      {/* 현재 콘텐츠 타입 헤더 */}
      {(() => {
        const typeInfo = postType === 'card_news'
          ? { label: '카드뉴스', icon: '🎨', bg: 'bg-pink-50', border: 'border-pink-100', text: 'text-pink-700' }
          : postType === 'press_release'
          ? { label: '보도자료', icon: '🗞️', bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700' }
          : { label: '블로그', icon: '📝', bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700' };
        return (
          <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${typeInfo.bg} ${typeInfo.border}`}>
            <span>{typeInfo.icon}</span>
            <span className={`text-xs font-bold ${typeInfo.text}`}>{typeInfo.label}</span>
          </div>
        );
      })()}

      {/* 메인 입력 폼 */}
      <div className="p-4">
      <form onSubmit={handleSubmit} className="space-y-3">

        {postType === 'blog' && (<>
        {/* 팀 선택 + 병원명 */}
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

        <div className="relative" ref={hospitalDropdownRef}>
          {selectedTeam !== null ? (
          <>
          <div className="relative">
            <input
              type="text"
              value={hospitalName}
              onChange={(e) => { setHospitalName(e.target.value); setHospitalExplicitlySelected(!!e.target.value.trim()); localStorage.setItem('hospitalName', e.target.value); }}
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
            <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              {/* 팀 헤더 */}
              <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
                <span className="text-xs font-bold text-blue-600">{TEAM_DATA.find(t => t.id === selectedTeam)?.label}</span>
              </div>
              {/* 병원 목록 */}
              {selectedTeam !== null && (() => {
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
                              setHospitalExplicitlySelected(true);
                              setSelectedManager(hospital.manager);
                              setSelectedHospitalEntry(hospital);
                              setKeywordStats([]);
                              setShowKeywordPanel(false);
                              localStorage.setItem('hospitalName', hospital.name.replace(/ \(.*\)$/, ''));
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
          )}
          {selectedManager && hospitalName && (
            <p className="mt-1 text-[11px] text-slate-400">담당: {selectedManager}</p>
          )}
          </>
          ) : (
            <div className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-400 bg-slate-50">
              팀을 먼저 선택하세요
            </div>
          )}
        </div>

        {/* 병원 홈페이지 주소 (키워드 분석 + 병원 소개 공유) */}
        {selectedHospitalEntry?.address && hospitalName && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">병원 홈페이지 주소 <span className="text-slate-400 font-normal">(선택)</span></label>
            <input type="url" value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://www.hospital.com" className={inputCls} />
          </div>
        )}

        {/* 키워드 분석 버튼 */}
        {selectedHospitalEntry?.address && hospitalName && (
          <button
            type="button"
            onClick={handleAnalyzeKeywords}
            disabled={isAnalyzingKeywords}
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-sm disabled:opacity-50"
          >
            <span>🔍</span>
            <span>{isAnalyzingKeywords ? '키워드 분석 중...' : '키워드 분석'}</span>
          </button>
        )}

        {/* 키워드 분석 결과 패널 */}
        {showKeywordPanel && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-700">키워드 분석</span>
                <div className="flex items-center gap-1">
                  {(['volume', 'blog', 'saturation'] as const).map(sort => (
                    <button
                      key={sort}
                      type="button"
                      onClick={() => setKeywordSortBy(sort)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                        keywordSortBy === sort
                          ? 'bg-blue-500 text-white'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {sort === 'volume' ? '검색량' : sort === 'blog' ? '발행량' : '포화도'}
                    </button>
                  ))}
                  <button type="button" onClick={() => setShowKeywordPanel(false)} className="ml-1 text-slate-400 hover:text-slate-600">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
              {isAnalyzingKeywords ? (
                <div className="p-6 text-center">
                  <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-slate-400">{keywordProgress || '검색량 분석 중...'}</p>
                </div>
              ) : keywordStats.length > 0 ? (
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="text-slate-500">
                        <th className="text-left px-3 py-2 font-semibold">키워드</th>
                        <th className="text-right px-3 py-2 font-semibold">월간 검색량</th>
                        <th className="text-right px-3 py-2 font-semibold">발행량</th>
                        <th className="text-right px-3 py-2 font-semibold">포화도</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...keywordStats]
                        .sort((a, b) => {
                          if (keywordSortBy === 'volume') return b.monthlySearchVolume - a.monthlySearchVolume;
                          if (keywordSortBy === 'blog') return b.blogPostCount - a.blogPostCount;
                          return (a.saturation || 0) - (b.saturation || 0);
                        })
                        .map((stat, idx) => (
                          <tr
                            key={stat.keyword}
                            className={`border-t border-slate-50 hover:bg-blue-50 cursor-pointer transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}
                            onClick={() => {
                              setKeywords(k => k ? `${k}, ${stat.keyword}` : stat.keyword);
                            }}
                          >
                            <td className="px-3 py-2 font-medium text-blue-600">{stat.keyword}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-700">
                              {stat.monthlySearchVolume.toLocaleString()}
                            </td>
                            <td className={`px-3 py-2 text-right font-semibold ${
                              stat.blogPostCount > 50000 ? 'text-red-500' :
                              stat.blogPostCount > 10000 ? 'text-amber-500' : 'text-green-500'
                            }`}>
                              {stat.blogPostCount.toLocaleString()}
                            </td>
                            <td className={`px-3 py-2 text-right font-semibold ${
                              (stat.saturation || 0) > 10 ? 'text-red-500' :
                              (stat.saturation || 0) > 5 ? 'text-amber-500' : 'text-green-500'
                            }`}>
                              {stat.saturation?.toFixed(1) || '-'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <p className="text-[10px] text-slate-400">
                      클릭하면 키워드에 추가 | 포화도 = 발행량/검색량 (낮을수록 블루오션) | {keywordStats.length}/{MAX_KEYWORDS}개
                    </p>
                    {keywordStats.length < MAX_KEYWORDS && (
                      <button
                        type="button"
                        onClick={handleLoadMoreKeywords}
                        disabled={isLoadingMoreKeywords}
                        className="px-3 py-1 rounded-lg text-[10px] font-bold transition-all bg-blue-100 text-blue-600 hover:bg-blue-200 disabled:opacity-50"
                      >
                        {isLoadingMoreKeywords ? '로딩...' : `더보기 (+15)`}
                      </button>
                    )}
                    {keywordStats.length >= MAX_KEYWORDS && (
                      <span className="px-3 py-1 rounded-lg text-[10px] font-bold text-green-600 bg-green-50">
                        최대 {MAX_KEYWORDS}개 완료
                      </span>
                    )}
                  </div>
                  {/* AI 블루오션 분석 */}
                  {keywordAiRec && (
                    <div className="border-t border-slate-200 p-3 bg-gradient-to-b from-blue-50 to-white">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-sm">🎯</span>
                        <span className="text-xs font-bold text-blue-700">AI 블루오션 분석</span>
                      </div>
                      <div
                        className="text-xs text-slate-600 leading-relaxed prose prose-xs max-w-none [&_strong]:text-blue-700 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1 [&_ul]:my-1 [&_li]:my-0.5"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeHtml(keywordAiRec
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/^### (.*$)/gm, '<h2>$1</h2>')
                            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
                            .replace(/^- (.*$)/gm, '<li>$1</li>')
                            .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
                            .replace(/\n{2,}/g, '<br/>')
                            .replace(/\n/g, '<br/>'))
                        }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-slate-400">분석 결과가 없습니다</div>
              )}
            </div>
          )}

        </>)}

        {postType !== 'press_release' && (
        <div className="grid grid-cols-2 gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value as ContentCategory)} className={selectCls} disabled={isLoading} aria-label="진료과 선택">
            {CATEGORIES.map((cat) => (<option key={cat.value} value={cat.value}>{cat.label}</option>))}
          </select>
          <select value={audienceMode} onChange={(e) => setAudienceMode(e.target.value as AudienceMode)} className={selectCls} disabled={isLoading} aria-label="타겟 청중 선택">
            <option value="환자용(친절/공감)">환자용 (친절/공감)</option>
            <option value="보호자용(가족걱정)">보호자용 (부모님/자녀 걱정)</option>
            <option value="전문가용(신뢰/정보)">전문가용 (신뢰/정보)</option>
          </select>
        </div>
        )}

        {/* 주제 입력 - 가장 중요한 필드 */}
        <div className="space-y-2">
          <input ref={topicInputRef} type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
            placeholder={postType === 'press_release' ? '기사 주제 (예: 디지털 임플란트 도입 성과)' : postType === 'card_news' ? '카드뉴스 주제 (예: 임플란트 시술 과정 안내)' : '블로그 제목 (예: 치아미백 종류와 비용 총정리)'}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm font-semibold outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10 transition-all placeholder:text-slate-300 placeholder:font-normal"
            required
          />
          {postType !== 'card_news' && (
            <input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)}
              placeholder="SEO 키워드 (예: 강남 치과, 임플란트 가격)" className={inputCls} />
          )}
          {postType === 'blog' && (
            <input type="text" value={disease} onChange={(e) => setDisease(e.target.value)}
              placeholder="질환명 (예: 치주염, 충치) - 글의 실제 주제" className={inputCls} />
          )}
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
              <button key={idx} type="button" onClick={() => { postType === 'card_news' ? setTopic(item.topic) : setDisease(item.topic); topicInputRef.current?.focus(); }}
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
        {/* 유형별 설정 */}
        <div className="space-y-3">
           {postType === 'blog' ? (
               <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-500">글자 수</label>
                      <span className="text-xs font-semibold text-blue-600">{textLength}자</span>
                    </div>
                    <input type="range" min="1500" max="3500" step="100" value={textLength} onChange={(e) => setTextLength(parseInt(e.target.value))} className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer" aria-label={`글자 수: ${textLength}자`} />
                    <div className="flex justify-between mt-1 text-[10px] text-slate-400"><span>1500</span><span>2500</span><span>3500</span></div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-500">AI 이미지 수</label>
                      <span className={`text-xs font-semibold ${imageCount === 0 ? 'text-slate-400' : 'text-blue-600'}`}>{imageCount === 0 ? '없음' : `${imageCount}장`}</span>
                    </div>
                    <input type="range" min="0" max="5" step="1" value={imageCount} onChange={(e) => setImageCount(parseInt(e.target.value))} className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer" aria-label={`AI 이미지 수: ${imageCount}장`} />
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
                          {[3, 4, 5].map((num) => (
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
                  {/* 병원 소개 토글 */}
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
               </div>
           ) : postType === 'card_news' ? (
               <div className="space-y-4">
                  {/* 디자인 템플릿 선택 */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-2 block">디자인 템플릿</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {CARD_NEWS_DESIGN_TEMPLATES.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => setDesignTemplateId(designTemplateId === tmpl.id ? undefined : tmpl.id)}
                          className={`relative flex flex-col items-center gap-1 p-1.5 rounded-xl border-2 transition-all ${
                            designTemplateId === tmpl.id
                              ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-500/20'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          {designTemplateId === tmpl.id && (
                            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            </span>
                          )}
                          <div
                            className="w-full aspect-square rounded-lg overflow-hidden"
                            dangerouslySetInnerHTML={{ __html: tmpl.previewSvg }}
                          />
                          <span className="text-[9px] font-semibold text-slate-600 leading-tight text-center">{tmpl.name}</span>
                        </button>
                      ))}
                    </div>
                    {designTemplateId && (
                      <div className="mt-2 px-2.5 py-1.5 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-[10px] text-blue-700 font-medium">
                          {CARD_NEWS_DESIGN_TEMPLATES.find(t => t.id === designTemplateId)?.icon}{' '}
                          {CARD_NEWS_DESIGN_TEMPLATES.find(t => t.id === designTemplateId)?.description}
                        </p>
                      </div>
                    )}
                    {!designTemplateId && (
                      <p className="mt-1 text-[10px] text-slate-400">선택하지 않으면 AI가 자동으로 디자인합니다.</p>
                    )}
                  </div>

                  {/* 카드뉴스 장수 */}
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-500">카드뉴스 장수</label>
                      <span className="text-xs font-semibold text-blue-600">{slideCount}장</span>
                    </div>
                    <input type="range" min="4" max="10" step="1" value={slideCount} onChange={(e) => setSlideCount(parseInt(e.target.value))} className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                    <div className="flex justify-between mt-1 text-[10px] text-slate-400"><span>4장</span><span>10장</span></div>
                  </div>
               </div>
           ) : postType === 'press_release' ? (
               <div className="space-y-3">
                  <p className="text-[11px] text-slate-500 bg-white rounded-lg p-2.5 border border-slate-200">
                    본 보도자료는 홍보 목적의 자료이며, 의학적 조언이나 언론 보도로 사용될 경우 법적 책임은 사용자에게 있습니다.
                  </p>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">의료진</label>
                    <input type="text" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="홍길동" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">병원 웹사이트 <span className="text-slate-400 font-normal">(선택)</span></label>
                    <input type="url" value={hospitalWebsite} onChange={(e) => setHospitalWebsite(e.target.value)} placeholder="https://www.hospital.com" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">직함</label>
                    <select value={doctorTitle} onChange={(e) => setDoctorTitle(e.target.value)} className={selectCls}>
                      <option value="원장">원장</option>
                      <option value="부원장">부원장</option>
                      <option value="과장">과장</option>
                      <option value="교수">교수</option>
                      <option value="부교수">부교수</option>
                      <option value="전문의">전문의</option>
                      <option value="센터장">센터장</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">보도 유형</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { value: 'achievement', label: '실적/달성', icon: '🏆' },
                        { value: 'new_service', label: '신규 도입', icon: '🆕' },
                        { value: 'research', label: '연구/학술', icon: '📚' },
                        { value: 'event', label: '행사', icon: '🎉' },
                        { value: 'award', label: '수상/인증', icon: '🎖️' },
                        { value: 'health_tips', label: '건강 조언', icon: '💡' },
                      ].map((item) => (
                        <button key={item.value} type="button" onClick={() => setPressType(item.value as typeof pressType)}
                          className={`p-2 rounded-lg text-center transition-all text-xs font-medium ${
                            pressType === item.value ? 'bg-blue-50 border-2 border-blue-400 text-blue-700' : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'
                          }`}
                        >
                          <span className="text-sm">{item.icon}</span>
                          <span className="block mt-0.5">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-500">글자 수</label>
                      <span className="text-xs font-semibold text-blue-600">{textLength}자</span>
                    </div>
                    <input type="range" min="800" max="2000" step="200" value={textLength} onChange={(e) => setTextLength(parseInt(e.target.value))} className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                    <div className="flex justify-between mt-1 text-[10px] text-slate-400"><span>800 (짧게)</span><span>1400</span><span>2000 (상세)</span></div>
                  </div>
               </div>
           ) : null}

          {/* 소제목 직접 입력 */}
          {postType !== 'card_news' && postType !== 'press_release' && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 mb-1.5">소제목 직접 입력 <span className="text-slate-400 font-normal">(선택 · 한 줄에 하나씩)</span></p>
              <textarea value={customSubheadings} onChange={(e) => setCustomSubheadings(e.target.value)}
                onPaste={(e) => { e.preventDefault(); const text = e.clipboardData.getData('text/plain'); document.execCommand('insertText', false, text); }}
                placeholder={"임플란트 수술 과정과 기간\n임플란트 후 관리법\n임플란트 비용 비교"}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs focus:border-blue-400 outline-none resize-none placeholder:text-slate-300"
                rows={3}
              />
            </div>
          )}

          {/* 이미지 스타일 */}
          {postType !== 'press_release' && (
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
                      <button type="button" onClick={() => { localStorage.setItem(CUSTOM_PROMPT_KEY, customPrompt); toast.success('저장되었습니다.'); }}
                        className="px-2 py-0.5 bg-slate-800 text-white text-[10px] font-medium rounded hover:bg-slate-900">저장</button>
                    )}
                  </div>
                  <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
                    onPaste={(e) => { e.preventDefault(); const text = e.clipboardData.getData('text/plain'); document.execCommand('insertText', false, text); }}
                    placeholder="파스텔톤, 손그림 느낌의 일러스트, 부드러운 선..."
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-xs focus:border-blue-400 outline-none resize-none" rows={2}
                  />
                </div>
              )}
            </div>
          )}

          {/* 블로그 스타일 설정 */}
          {postType === 'blog' && (
            <div className="space-y-3">
              <WritingStyleLearner onStyleSelect={(styleId) => setLearnedStyleId(styleId)} selectedStyleId={learnedStyleId} contentType="blog" />
              {!learnedStyleId && (
                <div className="grid grid-cols-2 gap-2">
                  <select value={persona} onChange={(e) => setPersona(e.target.value)} className={selectCls}>
                    {PERSONAS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <select value={tone} onChange={(e) => setTone(e.target.value)} className={selectCls}>
                    {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
        )} {/* end showAdvanced */}

        {/* 생성 버튼 */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || !topic.trim()}
          className={`w-full py-3.5 rounded-xl text-white font-black text-sm shadow-md transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-2 group ${isLoading ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/25 hover:-translate-y-0.5'}`}
        >
          {isLoading ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />생성 중...</>
          ) : (
            <>{postType === 'blog' ? '블로그 원고 생성' : postType === 'press_release' ? '보도자료 작성' : '카드뉴스 제작'}
            <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg></>
          )}
        </button>
      </form>
      </div>
    </div>
  );
};

// 🚀 성능 개선: React.memo로 불필요한 리렌더 방지
export default React.memo(InputForm);
