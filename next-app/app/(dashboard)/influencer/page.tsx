'use client';

import { useState, useCallback } from 'react';
import { INFLUENCER_CATEGORIES, generateInfluencerHashtags, hashtagsToString, stringToHashtags } from '../../../lib/influencerHashtags';

// ── 타입 ──

interface InfluencerProfile {
  username: string;
  full_name: string;
  profile_pic_url: string;
  follower_count: number;
  following_count: number;
  post_count: number;
  engagement_rate: number;
  estimated_location: string;
  location_confidence: 'high' | 'medium' | 'low';
  primary_category: string;
  recent_posts: {
    text: string;
    likes: number;
    comments: number;
    location?: string;
    hashtags: string[];
    timestamp: string;
  }[];
}

interface DmDraft {
  tone: string;
  message: string;
  warnings: string[];
}

type OutreachStatus = 'pending' | 'sent' | 'replied' | 'rejected' | 'collaborating';

const STATUS_LABELS: Record<OutreachStatus, { label: string; icon: string; color: string }> = {
  pending: { label: '미발송', icon: '⬜', color: 'text-slate-400' },
  sent: { label: '발송완료', icon: '📤', color: 'text-blue-500' },
  replied: { label: '답장받음', icon: '💬', color: 'text-green-500' },
  rejected: { label: '거절/무응답', icon: '❌', color: 'text-red-400' },
  collaborating: { label: '협업 진행중', icon: '🤝', color: 'text-violet-500' },
};

const CATEGORIES = INFLUENCER_CATEGORIES;

const DM_TONES = [
  { id: 'casual', label: '캐주얼', desc: '"안녕하세요~ 콘텐츠 잘 보고 있어요 :)"', icon: '😊' },
  { id: 'business', label: '비즈니스', desc: '"안녕하세요, 마케팅 담당자입니다."', icon: '💼' },
  { id: 'friendly', label: '친근한 제안', desc: '"혹시 관심 있으실까 해서요~"', icon: '🤗' },
];

const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10 transition-all placeholder:text-slate-300';
const btnPrimary = 'px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed';
const btnSecondary = 'px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-all text-sm';

// 해시태그 생성은 influencerHashtags.ts에서 import

export default function InfluencerPage() {
  // ── STEP 1: 검색 조건 ──
  const [step, setStep] = useState<1 | 2>(1);
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalLocation, setHospitalLocation] = useState('');
  const [hospitalFeatures, setHospitalFeatures] = useState('');
  const [hospitalInstagram, setHospitalInstagram] = useState('');
  const [followerMin, setFollowerMin] = useState(3000);
  const [followerMax, setFollowerMax] = useState(10000);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [minEngagement, setMinEngagement] = useState(2);
  const [hashtagList, setHashtagList] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [showAllTags, setShowAllTags] = useState(false);

  // ── STEP 2: 결과 ──
  const [results, setResults] = useState<InfluencerProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [sortBy, setSortBy] = useState<'followers' | 'engagement' | 'location'>('engagement');

  // ── DM 생성 ──
  const [selectedInfluencer, setSelectedInfluencer] = useState<InfluencerProfile | null>(null);
  const [dmTone, setDmTone] = useState<'casual' | 'business' | 'friendly'>('casual');
  const [dmDrafts, setDmDrafts] = useState<DmDraft[]>([]);
  const [isGeneratingDm, setIsGeneratingDm] = useState(false);
  const [dmModalOpen, setDmModalOpen] = useState(false);

  // ── 상태 추적 ──
  const [outreachStatuses, setOutreachStatuses] = useState<Record<string, OutreachStatus>>({});

  // 위치/카테고리 변경 시 해시태그 자동 재생성
  const regenerateHashtags = (loc: string, cats: string[]) => {
    setHashtagList(generateInfluencerHashtags(loc, cats));
    setShowAllTags(false);
  };

  const handleLocationChange = (loc: string) => {
    setHospitalLocation(loc);
    regenerateHashtags(loc, selectedCategories);
  };

  const handleCategoryToggle = (catId: string) => {
    setSelectedCategories(prev => {
      const next = prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId];
      regenerateHashtags(hospitalLocation, next);
      return next;
    });
  };

  const removeTag = (tag: string) => setHashtagList(prev => prev.filter(t => t !== tag));
  const addTag = () => {
    const tag = newTagInput.replace(/^#/, '').trim();
    if (tag && !hashtagList.includes(tag)) {
      setHashtagList(prev => [...prev, tag]);
      setNewTagInput('');
    }
  };

  // ── 검색 실행 ──
  const handleSearch = useCallback(async () => {
    if (!hospitalLocation.trim()) { setSearchError('병원 위치를 입력해주세요.'); return; }
    setIsSearching(true);
    setSearchError('');
    try {
      const res = await fetch('/api/influencer/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: hospitalLocation.trim(),
          hashtags: hashtagList,
          follower_min: followerMin,
          follower_max: followerMax,
          categories: selectedCategories,
          min_engagement_rate: minEngagement,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.details || '검색 실패');
      console.info('[INFLUENCER] 검색 결과:', { total: data.total_found, source: data.source, hashtags: data.search_hashtags_used });
      setResults(data.results || []);
      if (data.total_found === 0) {
        setSearchError(`결과 0명 (소스: ${data.source || '?'}, 해시태그: ${(data.search_hashtags_used || []).slice(0, 3).join(', ')}). 팔로워 범위를 넓히거나 해시태그를 변경해보세요.`);
      }
      setStep(2);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : '검색 중 오류');
    } finally {
      setIsSearching(false);
    }
  }, [hospitalLocation, hashtagList, followerMin, followerMax, selectedCategories, minEngagement]);

  // ── DM 생성 ──
  const handleGenerateDm = useCallback(async (influencer: InfluencerProfile) => {
    setSelectedInfluencer(influencer);
    setDmModalOpen(true);
    setIsGeneratingDm(true);
    setDmDrafts([]);
    try {
      const res = await fetch('/api/influencer/generate-dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          influencer,
          hospital: {
            name: hospitalName,
            location: hospitalLocation,
            features: hospitalFeatures,
            instagram: hospitalInstagram,
          },
          tone: dmTone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'DM 생성 실패');
      setDmDrafts(data.drafts || []);
    } catch {
      setDmDrafts([{ tone: 'error', message: 'DM 생성에 실패했습니다. 다시 시도해주세요.', warnings: [] }]);
    } finally {
      setIsGeneratingDm(false);
    }
  }, [hospitalName, hospitalLocation, hospitalFeatures, hospitalInstagram, dmTone]);

  // ── 상태 업데이트 ──
  const updateStatus = useCallback(async (username: string, status: OutreachStatus) => {
    setOutreachStatuses(prev => ({ ...prev, [username]: status }));
    try {
      await fetch('/api/influencer/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          hospital_id: hospitalName,
          status,
          sent_date: status === 'sent' ? new Date().toISOString() : undefined,
        }),
      });
    } catch { /* 저장 실패 무시 — 로컬 상태는 유지 */ }
  }, [hospitalName]);

  // ── 정렬 ──
  const sortedResults = [...results].sort((a, b) => {
    if (sortBy === 'followers') return b.follower_count - a.follower_count;
    if (sortBy === 'engagement') return b.engagement_rate - a.engagement_rate;
    const confOrder = { high: 0, medium: 1, low: 2 };
    return confOrder[a.location_confidence] - confOrder[b.location_confidence];
  });

  // ── 클립보드 복사 ──
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-900">🔍 인플루언서 탐색</h1>
        <p className="text-sm text-slate-500 mt-1">병원 근처 로컬 마이크로 인플루언서를 찾고, 협업 제안 DM을 자동 생성합니다.</p>
      </div>

      {/* STEP 1: 검색 조건 */}
      {step === 1 && (
        <div className="space-y-6">
          {/* 병원 정보 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-sm font-black text-slate-800 mb-4">🏥 병원 정보</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">병원명</label>
                <input value={hospitalName} onChange={e => setHospitalName(e.target.value)} className={inputCls} placeholder="예: 서울미소치과" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">병원 위치 *</label>
                <input value={hospitalLocation} onChange={e => handleLocationChange(e.target.value)} className={inputCls} placeholder="예: 강남역, 해운대, 분당 서현역" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">병원 특징/강점</label>
                <input value={hospitalFeatures} onChange={e => setHospitalFeatures(e.target.value)} className={inputCls} placeholder="예: 임플란트 전문, 당일 식사 가능" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">병원 인스타 계정</label>
                <input value={hospitalInstagram} onChange={e => setHospitalInstagram(e.target.value)} className={inputCls} placeholder="@seoulsmile_dental" />
              </div>
            </div>
          </div>

          {/* 인플루언서 조건 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-sm font-black text-slate-800 mb-4">🎯 인플루언서 조건</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">팔로워 범위</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={followerMin} onChange={e => setFollowerMin(Number(e.target.value))} className={`${inputCls} w-28`} />
                  <span className="text-xs text-slate-400">~</span>
                  <input type="number" value={followerMax} onChange={e => setFollowerMax(Number(e.target.value))} className={`${inputCls} w-28`} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">최소 참여율: {minEngagement}%</label>
                <input type="range" min={0.5} max={10} step={0.5} value={minEngagement} onChange={e => setMinEngagement(Number(e.target.value))} className="w-full accent-blue-500" />
              </div>
            </div>

            {/* 카테고리 */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-600 mb-2">카테고리 (다중 선택)</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategoryToggle(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      selectedCategories.includes(cat.id)
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 해시태그 — 태그 칩 UI */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-600">검색 해시태그 ({hashtagList.length}개)</label>
                {hashtagList.length > 10 && (
                  <button type="button" onClick={() => setShowAllTags(!showAllTags)} className="text-[10px] text-blue-500 font-semibold">
                    {showAllTags ? '접기' : `+${hashtagList.length - 10}개 더 보기`}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(showAllTags ? hashtagList : hashtagList.slice(0, 10)).map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200">
                    #{tag}
                    <button type="button" onClick={() => removeTag(tag)} className="text-blue-400 hover:text-red-500 text-[10px] font-bold">✕</button>
                  </span>
                ))}
                {hashtagList.length === 0 && <span className="text-xs text-slate-400">위에서 위치와 카테고리를 선택하면 자동 생성됩니다</span>}
              </div>
              <div className="flex gap-2">
                <input
                  value={newTagInput}
                  onChange={e => setNewTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  className={`${inputCls} flex-1`}
                  placeholder="해시태그 직접 추가 (Enter)"
                />
                <button type="button" onClick={addTag} className={btnSecondary}>추가</button>
              </div>
            </div>
          </div>

          {/* 검색 버튼 */}
          {searchError && <p className="text-sm text-red-500 font-semibold">{searchError}</p>}
          <button onClick={handleSearch} disabled={isSearching} className={`${btnPrimary} w-full flex items-center justify-center gap-2`}>
            {isSearching ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />검색 중...</>
            ) : '🔍 인플루언서 검색'}
          </button>
        </div>
      )}

      {/* STEP 2: 결과 */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <button onClick={() => setStep(1)} className={btnSecondary}>← 조건 수정</button>
              <span className="ml-3 text-sm text-slate-500">{results.length}명 발견</span>
            </div>
            <div className="flex gap-2">
              {(['engagement', 'followers', 'location'] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${sortBy === s ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                  {s === 'engagement' ? '참여율순' : s === 'followers' ? '팔로워순' : '지역 정확도순'}
                </button>
              ))}
            </div>
          </div>

          {/* 결과 카드 */}
          {sortedResults.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <div className="text-5xl mb-4">🔍</div>
              <p className="font-semibold">조건에 맞는 인플루언서를 찾지 못했습니다</p>
              <p className="text-xs mt-1">해시태그를 변경하거나 팔로워 범위를 넓혀보세요</p>
            </div>
          ) : sortedResults.map((inf, i) => {
            const status = outreachStatuses[inf.username] || 'pending';
            const statusInfo = STATUS_LABELS[status];
            return (
              <div key={inf.username} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4">
                {/* 순위 */}
                <div className="text-lg font-black text-slate-300 w-6 text-center">{i + 1}</div>

                {/* 프로필 */}
                <div className="w-12 h-12 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                  {inf.profile_pic_url && <img src={inf.profile_pic_url} alt={inf.username} className="w-full h-full object-cover" />}
                </div>

                {/* 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {inf.username.startsWith('user_') ? (
                      <span className="font-bold text-sm text-slate-400">👤 프로필 미확인</span>
                    ) : (
                      <a href={`https://instagram.com/${inf.username}`} target="_blank" rel="noopener noreferrer"
                        className="font-bold text-sm text-blue-600 hover:underline">@{inf.username} ↗</a>
                    )}
                    {inf.full_name && <span className="text-xs text-slate-400">{inf.full_name}</span>}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-500 mb-2">
                    {inf.follower_count > 0 ? (
                      <span>팔로워 <strong className="text-slate-700">{inf.follower_count.toLocaleString()}</strong></span>
                    ) : (
                      <span className="text-slate-400">팔로워 미확인</span>
                    )}
                    {inf.follower_count > 0 ? (
                      <span>참여율 <strong className="text-blue-600">{inf.engagement_rate.toFixed(1)}%</strong></span>
                    ) : inf.engagement_rate > 0 ? (
                      <span>참여도 <strong className="text-blue-600">{inf.engagement_rate.toFixed(0)}</strong> (좋아요+댓글 평균)</span>
                    ) : null}
                    <span className={inf.location_confidence === 'high' ? 'text-green-600' : inf.location_confidence === 'medium' ? 'text-amber-600' : 'text-slate-400'}>
                      📍 {inf.estimated_location} ({inf.location_confidence === 'high' ? '정확' : inf.location_confidence === 'medium' ? '추정' : '불확실'})
                    </span>
                    <span className="bg-slate-100 px-2 py-0.5 rounded-full">{inf.primary_category}</span>
                  </div>
                  {inf.recent_posts[0] && (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-slate-400 truncate flex-1">&ldquo;{inf.recent_posts[0].text.substring(0, 80)}...&rdquo;</p>
                      {inf.recent_posts[0].likes > 0 && (
                        <span className="text-[10px] text-slate-400 flex-shrink-0">❤️ {inf.recent_posts[0].likes} 💬 {inf.recent_posts[0].comments}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* 액션 */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleGenerateDm(inf)}
                    className="px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-xl hover:bg-violet-700 transition-all"
                  >
                    💬 DM 생성
                  </button>
                  <select
                    value={status}
                    onChange={e => updateStatus(inf.username, e.target.value as OutreachStatus)}
                    className="text-[10px] px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-600"
                  >
                    {Object.entries(STATUS_LABELS).map(([key, val]) => (
                      <option key={key} value={key}>{val.icon} {val.label}</option>
                    ))}
                  </select>
                  <span className={`text-[10px] font-semibold ${statusInfo.color}`}>{statusInfo.icon} {statusInfo.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DM 생성 모달 */}
      {dmModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-6">
          <div className="w-full max-w-2xl bg-white rounded-[28px] shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-sm font-black text-slate-900">💬 DM 자동 생성</div>
                {selectedInfluencer && (
                  <div className="text-xs text-slate-500">
                    {selectedInfluencer.username.startsWith('user_') ? '게시물 작성자' : `@${selectedInfluencer.username}`}님에게 보낼 메시지
                    {hospitalInstagram && <span className="text-slate-400"> · 병원 계정: {hospitalInstagram}</span>}
                  </div>
                )}
              </div>
              <button onClick={() => setDmModalOpen(false)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200">닫기</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {/* 톤 선택 */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-2">DM 톤 선택</label>
                <div className="flex gap-2">
                  {DM_TONES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setDmTone(t.id as typeof dmTone); if (selectedInfluencer) handleGenerateDm(selectedInfluencer); }}
                      className={`flex-1 p-3 rounded-xl border text-left transition-all ${
                        dmTone === t.id ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-lg mb-1">{t.icon}</div>
                      <div className="text-xs font-bold text-slate-800">{t.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 생성 결과 */}
              {isGeneratingDm ? (
                <div className="text-center py-10">
                  <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-slate-500">인플루언서 프로필 분석 + DM 생성 중...</p>
                </div>
              ) : dmDrafts.map((draft, idx) => (
                <div key={idx} className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-slate-700">💬 DM 초안 {idx + 1} ({draft.tone})</span>
                    <button onClick={() => copyToClipboard(draft.message)} className="px-3 py-1 bg-blue-500 text-white text-[10px] font-bold rounded-lg hover:bg-blue-600">📋 복사</button>
                  </div>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-white rounded-xl p-4 border border-slate-100">{draft.message}</div>
                  {draft.warnings.length > 0 && (
                    <div className="mt-2 p-2 bg-red-50 rounded-lg">
                      <p className="text-[10px] font-bold text-red-600">⚠️ 의료광고법 경고</p>
                      {draft.warnings.map((w, wi) => <p key={wi} className="text-[10px] text-red-500 mt-0.5">- {w}</p>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
