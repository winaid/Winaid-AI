import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getAllGeneratedPosts, getAdminStats, deleteGeneratedPost, PostType } from '../services/postStorageService';
import { TEAM_DATA } from '../constants/teamHospitals';
import { toast } from './Toast';
import {
  getAllStyleProfiles,
  saveHospitalBlogUrl,
  crawlAndLearnHospitalStyle,
  HospitalStyleProfile,
  scoreCrawledPost,
  saveCrawledPost,
  updateCrawledPostScore,
  updateCrawledPostContent,
  getCrawledPosts,
  getAllCrawledPostsSummary,
  crawlAndScoreAllHospitals,
  resetHospitalCrawlData,
} from '../services/writingStyleService';
import { CrawledPost } from '../types';
import { sanitizeHtml } from '../utils/sanitizeHtml';

// 점수 뱃지 색상
const scoreBadgeClass = (score?: number) => {
  if (score === undefined || score === null) return 'bg-slate-100 text-slate-400';
  if (score >= 90) return 'bg-green-100 text-green-700';
  if (score >= 70) return 'bg-orange-100 text-orange-700';
  return 'bg-red-100 text-red-600';
};

// ============================================================
// StyleTab 컴포넌트 (말투 학습 탭 - 팀 필터 포함)
// ============================================================
interface StyleTabProps {
  styleProfiles: HospitalStyleProfile[];
  blogUrlInputs: Record<string, string[]>;
  setBlogUrlInputs: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  crawlingStatus: Record<string, { loading: boolean; progress: string; error?: string }>;
  crawledPosts: Record<string, { url: string; content: string }[]>;
  dbPosts: Record<string, CrawledPost[]>;
  setDbPosts: React.Dispatch<React.SetStateAction<Record<string, CrawledPost[]>>>;
  onSaveUrl: (hospitalName: string, teamId: number) => void;
  onCrawl: (hospitalName: string, teamId: number) => void;
  onCrawlSingleUrl: (hospitalName: string, teamId: number, singleUrl: string) => void;
  onReset: (hospitalName: string) => void;
  crawlAllStatus: { loading: boolean; progress: string };
  onCrawlAll: () => void;
}

const StyleTab: React.FC<StyleTabProps> = ({
  styleProfiles, blogUrlInputs, setBlogUrlInputs, crawlingStatus, crawledPosts,
  dbPosts, setDbPosts, onSaveUrl, onCrawl, onCrawlSingleUrl, onReset, crawlAllStatus, onCrawlAll,
}) => {
  const [selectedTeam, setSelectedTeam] = useState<number>(TEAM_DATA[0].id);
  const [expandedPosts, setExpandedPosts] = useState<Record<string, boolean>>({});
  const [expandedPost, setExpandedPost] = useState<string | null>(null); // "병원명::url"
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [scoringError, setScoringError] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<Record<string, string>>({}); // id → 수정 중인 본문
  const [savingId, setSavingId] = useState<string | null>(null);

  // 글 채점
  const handleScorePost = async (post: CrawledPost) => {
    console.log('[채점] 핸들러 시작:', post.id, post.hospital_name, 'content길이:', post.content?.length);
    setScoringId(post.id);
    try {
      // 메모리 글(id가 URL)은 먼저 DB에 저장
      let dbPost = post;
      if (post.id.startsWith('http')) {
        const saved = await saveCrawledPost(post.hospital_name, post.url, post.content);
        if (saved) {
          dbPost = saved;
          setDbPosts(prev => ({
            ...prev,
            [post.hospital_name]: [saved, ...(prev[post.hospital_name] || [])],
          }));
        }
      }
      console.log('[채점] scoreCrawledPost 호출 직전, dbPost.id:', dbPost.id, 'content길이:', dbPost.content?.length);
      const score = await scoreCrawledPost(dbPost.content);
      console.log('[채점] scoreCrawledPost 결과:', JSON.stringify(score));
      await updateCrawledPostScore(dbPost.id, score);
      setDbPosts(prev => ({
        ...prev,
        [dbPost.hospital_name]: (prev[dbPost.hospital_name] || []).map(p =>
          p.id === dbPost.id ? { ...p, ...score, scored_at: new Date().toISOString() } : p
        ),
      }));
    } catch (e) {
      console.error('채점 실패:', e);
      setScoringError(String(e instanceof Error ? e.message : e));
    } finally {
      setScoringId(null);
    }
  };

  // 오타 수정 적용
  const applyCorrection = (postId: string, original: string, correction: string) => {
    setEditingContent(prev => {
      const current = prev[postId] ?? '';
      return { ...prev, [postId]: current.replace(new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), correction) };
    });
  };

  // 수정본 저장
  const handleSaveContent = async (post: CrawledPost) => {
    const corrected = editingContent[post.id];
    if (!corrected) return;
    setSavingId(post.id);
    try {
      await updateCrawledPostContent(post.id, corrected);
      setDbPosts(prev => ({
        ...prev,
        [post.hospital_name]: (prev[post.hospital_name] || []).map(p =>
          p.id === post.id ? { ...p, corrected_content: corrected } : p
        ),
      }));
    } finally {
      setSavingId(null);
    }
  };

  const team = TEAM_DATA.find(t => t.id === selectedTeam)!;
  // 고유 병원명만 추출 후 팀장님 → 선임님 → 매니저님 순, 같은 직급 내 가나다 순 정렬
  const roleOrder = (manager: string) =>
    manager.includes('팀장') ? 0 : manager.includes('선임') ? 1 : 2;
  const uniqueHospitals = Array.from(
    new Map(team.hospitals.map(h => [h.name.replace(/ \(.*\)$/, ''), h])).entries()
  ).sort(([nameA, hA], [nameB, hB]) => {
    const diff = roleOrder(hA.manager) - roleOrder(hB.manager);
    return diff !== 0 ? diff : nameA.localeCompare(nameB, 'ko');
  });

  return (
    <div className="space-y-4">
      {/* 설명 + 전체 자동 크롤링 버튼 */}
      <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-violet-800 mb-1">병원별 네이버 블로그 말투 학습</h2>
            <p className="text-sm text-violet-600">
              각 병원의 네이버 블로그 URL을 입력 후 <strong>크롤링 + 학습</strong>을 누르면 AI가 글을 읽고 말투를 자동 학습합니다.
              수집된 글은 오타/맞춤법·의료광고법 점수와 함께 블로그 URL별 최대 10개씩 보관됩니다. 다중 URL 입력 시 각 블로그의 글이 출처별로 구분 표시됩니다.
            </p>
          </div>
          <button
            onClick={onCrawlAll}
            disabled={crawlAllStatus.loading}
            className="shrink-0 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2 shadow-sm"
          >
            {crawlAllStatus.loading ? (
              <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />{crawlAllStatus.progress || '크롤링 중...'}</>
            ) : (
              <><span>🔄</span>전체 병원 자동 크롤링 + 채점</>
            )}
          </button>
        </div>
        {crawlAllStatus.loading && (
          <div className="mt-2 text-xs text-indigo-600 font-medium">{crawlAllStatus.progress}</div>
        )}
      </div>

      {/* 팀 탭 */}
      <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
        {TEAM_DATA.map(t => {
          const learnedCount = new Set(
            t.hospitals
              .map(h => h.name.replace(/ \(.*\)$/, ''))
              .filter(base => styleProfiles.some(p => p.hospital_name === base && p.last_crawled_at))
          ).size;
          const totalCount = new Set(t.hospitals.map(h => h.name.replace(/ \(.*\)$/, ''))).size;
          return (
            <button
              key={t.id}
              onClick={() => setSelectedTeam(t.id)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex flex-col items-center gap-0.5 ${
                selectedTeam === t.id ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>{t.label}</span>
              <span className={`text-[10px] font-medium ${selectedTeam === t.id ? 'text-violet-200' : 'text-slate-400'}`}>
                {learnedCount}/{totalCount} 학습됨
              </span>
            </button>
          );
        })}
      </div>

      {/* 선택된 팀의 병원 목록 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
          <span className="text-sm font-bold text-slate-700">{team.label} 병원 목록</span>
          <span className="ml-2 text-xs text-slate-400">({uniqueHospitals.length}개)</span>
        </div>
        <div className="divide-y divide-slate-50">
          {uniqueHospitals.map(([baseName, h]) => {
            const profile = styleProfiles.find(p => p.hospital_name === baseName);
            const status = crawlingStatus[baseName];
            const urls = blogUrlInputs[baseName] || (profile?.naver_blog_url ? [profile.naver_blog_url] : ['']);
            const hasAnyUrl = urls.some(u => u.includes('blog.naver.com'));
            return (
              <div key={baseName} className="p-4">
                {/* 병원명 + 학습 상태 */}
                <div className="flex items-center flex-wrap gap-2 mb-3">
                  <span className="font-semibold text-slate-800 text-sm">{baseName}</span>
                  <span className="text-xs text-slate-400">{h.manager}</span>
                  {h.address && <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{h.address}</span>}
                  {profile?.last_crawled_at ? (
                    <span className="text-[11px] px-2 py-0.5 bg-green-50 text-green-600 rounded-full font-medium">
                      학습완료 · {new Date(profile.last_crawled_at).toLocaleDateString('ko-KR')} · {profile.crawled_posts_count}개 글
                    </span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full">미학습</span>
                  )}
                  {profile?.style_profile && (
                    <span className="text-[11px] text-violet-600 bg-violet-50 border border-violet-200 rounded-lg px-2 py-0.5 max-w-xs truncate">
                      {(profile.style_profile as any).description || '학습 완료'}
                    </span>
                  )}
                </div>
                {/* 다중 URL 입력 */}
                <div className="space-y-2">
                  {urls.map((urlVal, urlIdx) => {
                    const urlStatusKey = `${baseName}::${urlVal}`;
                    const urlStatus = crawlingStatus[urlStatusKey];
                    const isUrlValid = urlVal.trim() && urlVal.includes('blog.naver.com');
                    const anyLoading = status?.loading || urlStatus?.loading;
                    return (
                      <div key={urlIdx}>
                        <div className="flex gap-2 items-center">
                          <span className="text-[10px] text-slate-400 font-mono w-4 shrink-0 text-center">{urlIdx + 1}</span>
                          <input
                            type="url"
                            value={urlVal}
                            onChange={e => {
                              const newUrls = [...urls];
                              newUrls[urlIdx] = e.target.value;
                              setBlogUrlInputs(prev => ({ ...prev, [baseName]: newUrls }));
                            }}
                            placeholder="https://blog.naver.com/병원아이디"
                            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400 transition-colors"
                            disabled={anyLoading}
                          />
                          <button
                            onClick={() => onCrawlSingleUrl(baseName, team.id, urlVal)}
                            disabled={anyLoading || !isUrlValid}
                            className="px-2.5 py-2 text-[11px] font-bold bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors disabled:opacity-40 whitespace-nowrap"
                            title="이 URL만 크롤링 + 학습"
                          >
                            {urlStatus?.loading ? '학습중...' : '크롤링'}
                          </button>
                          {urls.length > 1 && (
                            <button
                              onClick={() => {
                                const newUrls = urls.filter((_, i) => i !== urlIdx);
                                setBlogUrlInputs(prev => ({ ...prev, [baseName]: newUrls }));
                              }}
                              disabled={anyLoading}
                              className="w-7 h-7 flex items-center justify-center text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                              title="URL 삭제"
                            >✕</button>
                          )}
                        </div>
                        {urlStatus?.loading && (
                          <div className="ml-6 mt-1 flex items-center gap-1.5 text-[11px] text-violet-500">
                            <div className="w-2.5 h-2.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                            {urlStatus.progress}
                          </div>
                        )}
                        {urlStatus?.error && <p className="ml-6 mt-1 text-[11px] text-red-500">{urlStatus.error}</p>}
                        {urlStatus && !urlStatus.loading && !urlStatus.error && urlStatus.progress === '학습 완료!' && (
                          <p className="ml-6 mt-1 text-[11px] text-green-600 font-medium">학습 완료!</p>
                        )}
                      </div>
                    );
                  })}
                  {/* URL 추가 + 액션 버튼 */}
                  <div className="flex gap-2 items-center">
                    <span className="w-4 shrink-0" />
                    <button
                      onClick={() => setBlogUrlInputs(prev => ({ ...prev, [baseName]: [...urls, ''] }))}
                      disabled={status?.loading}
                      className="px-2.5 py-1.5 text-xs font-medium text-violet-600 border border-violet-200 bg-violet-50 rounded-lg hover:bg-violet-100 transition-colors disabled:opacity-40"
                    >+ URL 추가</button>
                    <div className="flex-1" />
                    <button
                      onClick={() => onSaveUrl(baseName, team.id)}
                      disabled={status?.loading || !hasAnyUrl}
                      className="px-3 py-2 text-xs font-semibold bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40 whitespace-nowrap"
                    >URL 저장</button>
                    <button
                      onClick={() => onCrawl(baseName, team.id)}
                      disabled={status?.loading || !hasAnyUrl}
                      className="px-3 py-2 text-xs font-bold bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-40 whitespace-nowrap"
                    >
                      {status?.loading ? '학습 중...' : '전체 크롤링'}
                    </button>
                    {(profile || (dbPosts[baseName] && dbPosts[baseName].length > 0)) && (
                      <button
                        onClick={() => onReset(baseName)}
                        disabled={status?.loading}
                        className="px-3 py-2 text-xs font-semibold bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-40 whitespace-nowrap"
                      >
                        초기화
                      </button>
                    )}
                  </div>
                </div>
                {/* 진행 상태 */}
                {status?.loading && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-violet-600">
                    <div className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    {status.progress}
                  </div>
                )}
                {status?.error && <p className="mt-2 text-xs text-red-500">{status.error}</p>}
                {status && !status.loading && !status.error && status.progress === '학습 완료!' && (
                  <p className="mt-2 text-xs text-green-600 font-medium">학습 완료!</p>
                )}
                {/* DB 보관 글 목록 — URL별 그룹 아코디언 */}
                {(() => {
                  const posts = dbPosts[baseName] || [];
                  const memPosts = crawledPosts[baseName] || [];
                  const allDisplayPosts: CrawledPost[] = posts.length > 0
                    ? posts
                    : memPosts.map(p => ({ id: p.url, hospital_name: baseName, url: p.url, content: p.content, crawled_at: '' } as CrawledPost));
                  const profileCount = profile?.crawled_posts_count || 0;
                  if (allDisplayPosts.length === 0 && profileCount === 0) return null;

                  // URL에서 블로그 ID 추출 (blog.naver.com/{blogId}/... → blogId)
                  const getBlogId = (url: string) => url.match(/blog\.naver\.com\/([^/?#]+)/)?.[1] || 'unknown';

                  // 블로그별 그룹핑 + 각 그룹 최신 10개
                  const blogGroups: Record<string, CrawledPost[]> = {};
                  for (const post of allDisplayPosts) {
                    const bid = getBlogId(post.url);
                    if (!blogGroups[bid]) blogGroups[bid] = [];
                    blogGroups[bid].push(post);
                  }
                  // 각 그룹 최신 10개만
                  const groupEntries = Object.entries(blogGroups).map(([bid, gPosts]) => [bid, gPosts.slice(0, 10)] as [string, CrawledPost[]]);
                  const totalDisplayCount = groupEntries.reduce((sum, [, gp]) => sum + gp.length, 0);

                  return (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedPosts(prev => ({ ...prev, [baseName]: !prev[baseName] }));
                          if (!expandedPosts[baseName] && allDisplayPosts.length === 0 && profileCount > 0) {
                            getCrawledPosts(baseName).then(loaded => {
                              if (loaded.length > 0) setDbPosts(prev => ({ ...prev, [baseName]: loaded }));
                            }).catch(console.warn);
                          }
                        }}
                        className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors"
                      >
                        <span>{expandedPosts[baseName] ? '▼' : '▶'}</span>
                        수집된 글 {totalDisplayCount || profileCount}개 보기
                        {groupEntries.length > 1 && <span className="text-[10px] text-slate-400 ml-1">({groupEntries.length}개 블로그)</span>}
                      </button>
                      {expandedPosts[baseName] && (
                        <div className="mt-2 space-y-3 max-h-[700px] overflow-y-auto pr-1">
                          {groupEntries.map(([blogId, groupPosts]) => (
                            <div key={blogId} className="border border-violet-100 rounded-lg overflow-hidden bg-white">
                              {/* URL 그룹 헤더 */}
                              <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-violet-50 to-slate-50 border-b border-violet-100">
                                <span className="text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded font-mono font-bold">{blogId}</span>
                                <span className="text-[10px] text-slate-500">{groupPosts.length}개 글</span>
                                <a
                                  href={`https://blog.naver.com/${blogId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-auto text-[10px] text-violet-400 hover:text-violet-600"
                                >블로그 →</a>
                              </div>
                              {/* 해당 블로그의 글 목록 */}
                              <div className="divide-y divide-slate-100">
                          {groupPosts.map((post, i) => {
                            const key = `${baseName}::${post.url}`;
                            const isOpen = expandedPost === key;
                            const isScoring = scoringId === post.id;
                            const hasScore = post.score_total !== undefined && post.score_total !== null;
                            const currentContent = editingContent[post.id] ?? post.corrected_content ?? post.content;
                            return (
                              <div key={post.url} className="border border-slate-200 rounded-lg overflow-hidden">
                                {/* 글 헤더 */}
                                <button
                                  type="button"
                                  onClick={() => setExpandedPost(isOpen ? null : key)}
                                  className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                                >
                                  <span className="text-[11px] font-bold text-slate-400 mt-0.5 shrink-0">#{i + 1}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                      {hasScore ? (
                                        <>
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${scoreBadgeClass(post.score_typo)}`}>
                                            오타 {post.score_typo}점
                                          </span>
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${scoreBadgeClass(post.score_spelling ?? post.score_typo)}`}>
                                            맞춤법 {post.score_spelling ?? '-'}점
                                          </span>
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${scoreBadgeClass(post.score_medical_law)}`}>
                                            의료법 {post.score_medical_law}점
                                          </span>
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${scoreBadgeClass(post.score_total)}`}>
                                            종합 {post.score_total}점
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded">미채점</span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-violet-600 truncate font-medium">
                                      {(() => {
                                        // 출처 블로그 ID 표시 (예: blog.naver.com/x577wqy3 → x577wqy3)
                                        const blogId = post.url.match(/blog\.naver\.com\/([^/]+)/)?.[1];
                                        return blogId ? <span className="text-[9px] px-1 py-0.5 bg-violet-50 text-violet-500 rounded mr-1.5 font-mono">{blogId}</span> : null;
                                      })()}
                                      {post.title ? post.title.replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') : post.url}
                                    </p>
                                  </div>
                                  <span className="text-[10px] text-slate-400 shrink-0">{isOpen ? '접기' : '펼치기'}</span>
                                </button>

                                {/* 펼침: 본문 + 채점 + 수정 */}
                                {isOpen && (
                                  <div className="px-3 pb-3 bg-slate-50 border-t border-slate-100 space-y-3">
                                    {/* 채점 / 재채점 버튼 */}
                                    <div className="mt-2 flex items-center gap-2">
                                      <button
                                        onClick={() => { setScoringError(null); handleScorePost(post); }}
                                        disabled={isScoring}
                                        className="px-3 py-1.5 text-[11px] font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                                      >
                                        {isScoring
                                          ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />채점 중...</>
                                          : hasScore ? '🔄 재채점' : '📊 채점하기'}
                                      </button>
                                      {scoringError && scoringId === null && (
                                        <p className="text-[10px] text-red-500">채점 실패: {scoringError}</p>
                                      )}
                                    </div>

                                    {/* 점수 이유 요약 */}
                                    {hasScore && (
                                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1">
                                        <p className="text-[11px] font-bold text-slate-700 mb-1">📋 채점 근거</p>
                                        <div className="flex flex-wrap gap-2 text-[11px]">
                                          <span className={`px-2 py-0.5 rounded font-bold ${scoreBadgeClass(post.score_typo)}`}>
                                            오타 {post.score_typo}점
                                            {(() => { const n = (post.typo_issues || []).filter((i: any) => i.type === 'typo' || !i.type).length; return n > 0 ? ` — ${n}건 × -10점` : ' — 없음'; })()}
                                          </span>
                                          <span className={`px-2 py-0.5 rounded font-bold ${scoreBadgeClass(post.score_spelling ?? post.score_typo)}`}>
                                            맞춤법 {post.score_spelling ?? '-'}점
                                            {(() => { const n = (post.typo_issues || []).filter((i: any) => i.type === 'spelling').length; return n > 0 ? ` — ${n}건 × -5점` : ' — 없음'; })()}
                                          </span>
                                          <span className={`px-2 py-0.5 rounded font-bold ${scoreBadgeClass(post.score_medical_law)}`}>
                                            의료법 {post.score_medical_law}점
                                            {(post.law_issues?.length ?? 0) > 0
                                              ? ` — 위반 ${post.law_issues!.length}건`
                                              : ' — 위반 없음'}
                                          </span>
                                        </div>
                                      </div>
                                    )}

                                    {/* 오타/맞춤법 이슈 */}
                                    {(post.typo_issues?.length ?? 0) > 0 && (
                                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5">
                                        <p className="text-[11px] font-bold text-orange-700 mb-1.5">⚠️ 오타 · 맞춤법 이슈 ({post.typo_issues!.length}건)</p>
                                        <div className="space-y-2">
                                          {post.typo_issues!.map((issue, idx) => (
                                            <div key={idx} className="text-[11px]">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${(issue as any).type === 'spelling' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                                  {(issue as any).type === 'spelling' ? '맞춤법' : '오타'}
                                                </span>
                                                <span className="text-red-600 line-through">"{issue.original}"</span>
                                                <span className="text-slate-400">→</span>
                                                <span className="text-green-700 font-medium">"{issue.correction}"</span>
                                                <button
                                                  onClick={() => applyCorrection(post.id, issue.original, issue.correction)}
                                                  className="ml-auto px-2 py-0.5 bg-green-600 text-white text-[10px] rounded font-bold hover:bg-green-700"
                                                >수정</button>
                                              </div>
                                              {issue.context && (
                                                <p className="text-[10px] text-slate-400 italic mt-0.5 pl-1 border-l-2 border-orange-200">{issue.context}</p>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* 의료광고법 이슈 */}
                                    {(post.law_issues?.length ?? 0) > 0 && (
                                      <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
                                        <p className="text-[11px] font-bold text-red-700 mb-1.5">🚫 의료광고법 이슈 ({post.law_issues!.length}건)</p>
                                        <div className="space-y-2.5">
                                          {post.law_issues!.map((issue, idx) => (
                                            <div key={idx} className="text-[11px] bg-white border border-red-100 rounded-lg p-2">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${issue.severity === 'critical' ? 'bg-red-200 text-red-800' : issue.severity === 'high' ? 'bg-orange-200 text-orange-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                  {issue.severity}
                                                </span>
                                                <span className="text-red-600 font-bold">"{issue.word}"</span>
                                                {issue.replacement?.length > 0 && (
                                                  <span className="text-emerald-700 font-medium">→ "{issue.replacement[0]}"</span>
                                                )}
                                              </div>
                                              {(issue as any).law_article && (
                                                <div className="mt-1.5 px-2 py-1 bg-red-50 border border-red-200 rounded text-[10px] font-bold text-red-700">
                                                  📋 {(issue as any).law_article}
                                                </div>
                                              )}
                                              {(issue as any).reason && (
                                                <p className="mt-1 text-[10px] text-slate-600 leading-relaxed">{(issue as any).reason}</p>
                                              )}
                                              {issue.context && (
                                                <p className="mt-1 text-[10px] text-slate-400 italic pl-1 border-l-2 border-red-200">{issue.context}</p>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* 본문 (편집 가능) */}
                                    <div>
                                      <p className="text-[10px] text-slate-500 mb-1 font-medium">본문 {post.corrected_content ? '(수정본)' : ''}</p>
                                      <textarea
                                        className="w-full text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg p-2 max-h-48 resize-y focus:outline-none focus:border-violet-400"
                                        value={currentContent}
                                        onChange={e => setEditingContent(prev => ({ ...prev, [post.id]: e.target.value }))}
                                        rows={6}
                                      />
                                    </div>

                                    {/* 저장 + 링크 */}
                                    <div className="flex items-center gap-2">
                                      {editingContent[post.id] !== undefined && (
                                        <button
                                          onClick={() => handleSaveContent(post)}
                                          disabled={savingId === post.id}
                                          className="px-3 py-1.5 text-[11px] font-bold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
                                        >
                                          {savingId === post.id ? '저장 중...' : '✅ 수정본 저장'}
                                        </button>
                                      )}
                                      <a
                                        href={post.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[11px] text-violet-500 hover:underline"
                                      >
                                        블로그에서 보기 →
                                      </a>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================================

// Admin 비밀번호는 Supabase RPC에서 서버사이드로 검증됨 (클라이언트에 노출하지 않음)

// 콘텐츠 타입 정의 (database와 호환)
type ContentType = 'blog' | 'card_news' | 'press_release';

// 화면 표시용 타입 매핑
const displayTypeMap: Record<ContentType, string> = {
  'blog': 'blog',
  'card_news': 'cardnews',
  'press_release': 'press'
};

// DB 타입 -> 화면 타입 변환
const toDisplayType = (dbType: ContentType | string): string => {
  return displayTypeMap[dbType as ContentType] || 'blog';
};

interface ContentData {
  id: string;
  title: string;
  content: string;
  category?: string;
  content_type?: ContentType;
  keywords?: string[];
  created_at: string;
  hospital_name?: string;
  doctor_name?: string;
  doctor_title?: string;
  topic?: string;
  user_email?: string;
  char_count?: number;
}

interface AdminPageProps {
  onAdminVerified?: () => void;
}

const AdminPage: React.FC<AdminPageProps> = ({ onAdminVerified }) => {
  // 초기값을 localStorage에서 직접 읽어서 설정 (useEffect 내 setState 방지)
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window !== 'undefined') {
      // sessionStorage 우선, 없으면 localStorage (로그인 유지)
      if (sessionStorage.getItem('ADMIN_AUTHENTICATED') === 'true') return true;
      if (localStorage.getItem('ADMIN_PERSIST') === 'true') {
        const savedToken = localStorage.getItem('ADMIN_TOKEN');
        if (savedToken) {
          sessionStorage.setItem('ADMIN_AUTHENTICATED', 'true');
          sessionStorage.setItem('ADMIN_TOKEN', savedToken);
          return true;
        }
      }
    }
    return false;
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'contents' | 'style' | 'users'>('contents');

  // 사용자 관리 탭 state
  const [users, setUsers] = useState<{ id: string; email: string; full_name: string; team_id: number | null; created_at: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, team_id, created_at')
        .order('created_at', { ascending: false });
      if (!error && data) {
        setUsers(data as any[]);
      }
    } catch (e) {
      console.error('사용자 목록 로드 실패:', e);
    }
    setLoadingUsers(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'users' && isAuthenticated) {
      loadUsers();
    }
  }, [activeTab, isAuthenticated, loadUsers]);

  // 말투 학습 탭 state
  const [styleProfiles, setStyleProfiles] = useState<HospitalStyleProfile[]>([]);
  const [blogUrlInputs, setBlogUrlInputs] = useState<Record<string, string[]>>(() => {
    // teamHospitals.ts의 naverBlogUrls로 초기값 세팅
    const initial: Record<string, string[]> = {};
    TEAM_DATA.forEach(team => {
      team.hospitals.forEach(h => {
        const baseName = h.name.replace(/ \(.*\)$/, '');
        if (h.naverBlogUrls && h.naverBlogUrls.length > 0) {
          // 같은 baseName이 이미 있으면 합치기 (중복 제거)
          const existing = initial[baseName] || [];
          const merged = [...new Set([...existing, ...h.naverBlogUrls])];
          initial[baseName] = merged;
        }
      });
    });
    return initial;
  });
  const [crawlingStatus, setCrawlingStatus] = useState<Record<string, { loading: boolean; progress: string; error?: string }>>({});
  const [crawledPosts, setCrawledPosts] = useState<Record<string, { url: string; content: string }[]>>({});
  const [dbPosts, setDbPosts] = useState<Record<string, CrawledPost[]>>({});
  const [crawlAllStatus, setCrawlAllStatus] = useState<{ loading: boolean; progress: string }>({ loading: false, progress: '' });
  
  // API 설정은 서버 환경변수로 관리 (UI 제거)
  
  // 콘텐츠 데이터 (블로그, 카드뉴스, 언론보도)
  const [contents, setContents] = useState<ContentData[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [contentFilter, setContentFilter] = useState<'all' | ContentType>('all');
  const [stats, setStats] = useState({
    totalContents: 0,
    blogCount: 0,
    cardnewsCount: 0,
    pressCount: 0,
    uniqueHospitals: 0,
    uniqueUsers: 0,
    postsToday: 0,
    postsThisWeek: 0,
    postsThisMonth: 0
  });
  
  // 콘텐츠 미리보기 모달
  const [previewContent, setPreviewContent] = useState<ContentData | null>(null);

  const [dataError, setDataError] = useState<string>('');
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [selectedHospitalName, setSelectedHospitalName] = useState<string>('');
  const hospitalScrollRef = useRef<HTMLDivElement>(null);
  const scrollHospitals = (delta: number) => {
    hospitalScrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };
  
  // 콘텐츠 타입 라벨 가져오기
  const getContentTypeLabel = (type?: ContentType | string): string => {
    const labels: Record<string, string> = {
      'blog': '블로그',
      'card_news': '카드뉴스',
      'press_release': '언론보도',
      // 화면 표시용 타입도 지원
      'cardnews': '카드뉴스',
      'press': '언론보도'
    };
    return labels[type || 'blog'] || '블로그';
  };

  // 콘텐츠 타입 배지 색상
  const getContentTypeBadge = (type?: ContentType | string) => {
    const badges: Record<string, { bg: string; text: string; icon: string }> = {
      'blog': { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: '📝' },
      'card_news': { bg: 'bg-purple-500/20', text: 'text-purple-400', icon: '🎨' },
      'press_release': { bg: 'bg-green-500/20', text: 'text-green-400', icon: '📰' },
      // 화면 표시용 타입도 지원
      'cardnews': { bg: 'bg-purple-500/20', text: 'text-purple-400', icon: '🎨' },
      'press': { bg: 'bg-green-500/20', text: 'text-green-400', icon: '📰' }
    };
    const badge = badges[type || 'blog'] || badges['blog'];
    return (
      <span className={`px-2 py-1 ${badge.bg} ${badge.text} text-xs font-bold rounded-full inline-flex items-center gap-1`}>
        {badge.icon} {getContentTypeLabel(type)}
      </span>
    );
  };

  // 콘텐츠 이력 로드 함수 (generated_posts 테이블 사용)
  const loadContentsInternal = async (retryCount = 0): Promise<void> => {
    const MAX_RETRIES = 3;
    
    setLoadingData(true);
    setDataError('');
    
    try {
      console.log('[Admin] 콘텐츠 이력 로드 시작...', retryCount > 0 ? `(재시도 ${retryCount}/${MAX_RETRIES})` : '');
      
      // 통계 + 콘텐츠 목록 병렬 로드
      const token = sessionStorage.getItem('ADMIN_TOKEN') || '';
      const [statsResult, contentsResult] = await Promise.all([
        getAdminStats(token),
        getAllGeneratedPosts(token, { limit: 100 })
      ]);

      if (statsResult.success && statsResult.stats) {
        setStats({
          totalContents: statsResult.stats.totalPosts,
          blogCount: statsResult.stats.blogCount,
          cardnewsCount: statsResult.stats.cardNewsCount,
          pressCount: statsResult.stats.pressReleaseCount,
          uniqueHospitals: statsResult.stats.uniqueHospitals,
          uniqueUsers: statsResult.stats.uniqueUsers,
          postsToday: statsResult.stats.postsToday,
          postsThisWeek: statsResult.stats.postsThisWeek,
          postsThisMonth: statsResult.stats.postsThisMonth
        });
      }
      
      if (!contentsResult.success) {
        console.error('콘텐츠 이력 로드 에러:', contentsResult.error);
        
        // 테이블이 없는 경우 안내
        if (contentsResult.error?.includes('does not exist') || contentsResult.error?.includes('42P01')) {
          setDataError('⚠️ generated_posts 테이블이 없습니다. Supabase에서 마이그레이션을 실행해주세요.');
        } else if (contentsResult.error?.includes('Unauthorized')) {
          setDataError('🔒 Admin 인증 실패. 비밀번호를 확인해주세요.');
        } else {
          setDataError(`콘텐츠 이력 로드 실패: ${contentsResult.error || '알 수 없는 오류'}`);
        }
        
        // 네트워크 오류 시 재시도
        if ((contentsResult.error?.includes('fetch') || contentsResult.error?.includes('network')) && retryCount < MAX_RETRIES) {
          console.log(`⏳ 네트워크 오류 감지, ${retryCount + 1}초 후 재시도...`);
          setDataError(`네트워크 연결 재시도 중... (${retryCount + 1}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
          return loadContentsInternal(retryCount + 1);
        }
      } else {
        console.log(`[Admin] ✅ 콘텐츠 ${contentsResult.data?.length || 0}개 로드 완료`);
        const mappedContents: ContentData[] = (contentsResult.data || []).map((item: any) => ({
          id: item.id,
          title: item.title || '제목 없음',
          content: item.content || '',
          category: item.category,
          content_type: item.post_type as ContentType,
          keywords: item.keywords,
          created_at: item.created_at,
          hospital_name: item.hospital_name,
          doctor_name: item.doctor_name,
          doctor_title: item.doctor_title,
          topic: item.topic,
          user_email: item.user_email,
          char_count: item.char_count
        }));
        setContents(mappedContents);
      }
    } catch (err) {
      console.error('콘텐츠 이력 로드 오류:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      
      // 네트워크 오류 시 재시도
      if (errorMsg.includes('fetch') && retryCount < MAX_RETRIES) {
        console.log(`⏳ 네트워크 오류 감지, ${retryCount + 1}초 후 재시도...`);
        setDataError(`네트워크 연결 재시도 중... (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
        return loadContentsInternal(retryCount + 1);
      }
      
      setDataError(`콘텐츠 이력 로드 실패: ${errorMsg}`);
    }
    setLoadingData(false);
  };

  const loadContents = useCallback(() => {
    return loadContentsInternal(0);
  }, []);

  // 콘텐츠 삭제 함수
  const deleteContent = async (contentId: string) => {
    if (!confirm('정말로 이 콘텐츠를 삭제하시겠습니까?')) return;
    
    try {
      const result = await deleteGeneratedPost(sessionStorage.getItem('ADMIN_TOKEN') || '', contentId);
      
      if (!result.success) {
        toast.error(`삭제 실패: ${result.error}`);
      } else {
        toast.success('삭제 완료!');
        loadContents(); // 목록 새로고침
      }
    } catch (err) {
      toast.error(`삭제 오류: ${String(err)}`);
    }
  };
  
  // 필터링된 콘텐츠 목록
  const filteredContents = contents.filter(c => {
    const typeMatch = contentFilter === 'all' || (c.content_type || 'blog') === contentFilter;
    const hospitalMatch = !selectedHospitalName || c.hospital_name === selectedHospitalName;
    return typeMatch && hospitalMatch;
  });

  // 관리자 인증 확인 - 이미 인증된 경우 콜백만 호출
  useEffect(() => {
    if (isAuthenticated) {
      onAdminVerified?.();
    }
  }, [isAuthenticated, onAdminVerified]);

  // 인증 후 콘텐츠 이력 로드
  useEffect(() => {
    if (!isAuthenticated) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadContents();
  }, [isAuthenticated, loadContents]);

  // 말투 프로파일 로드
  const loadStyleProfiles = useCallback(async () => {
    const profiles = await getAllStyleProfiles();
    setStyleProfiles(profiles);
    // DB에서 로드한 URL을 배열로 변환 (쉼표 구분 다중 URL 대응)
    const urlMap: Record<string, string[]> = {};
    profiles.forEach(p => {
      if (p.naver_blog_url) {
        urlMap[p.hospital_name] = p.naver_blog_url.split(',').map(u => u.trim()).filter(Boolean);
      }
    });
    setBlogUrlInputs(prev => ({ ...urlMap, ...prev }));
  }, []);

  // 말투 탭 활성화 시 프로파일 + DB 글 로드
  useEffect(() => {
    if (activeTab === 'style' && isAuthenticated) {
      loadStyleProfiles();
      getAllCrawledPostsSummary().then(setDbPosts).catch(console.warn);
    }
  }, [activeTab, isAuthenticated, loadStyleProfiles]);

  // 병원 블로그 URL 저장 (크롤링 없이) — 첫 번째 유효 URL 사용
  const handleSaveBlogUrl = async (hospitalName: string, teamId: number) => {
    const urls = blogUrlInputs[hospitalName] || [];
    const validUrls = urls.filter(u => u.trim() && u.includes('blog.naver.com'));
    if (validUrls.length === 0) {
      toast.error('네이버 블로그 URL을 입력해주세요. (blog.naver.com/...)');
      return;
    }
    try {
      // 다중 URL은 쉼표로 결합하여 DB TEXT 필드에 저장
      await saveHospitalBlogUrl(hospitalName, teamId, validUrls.join(','));
      toast.success(`URL ${validUrls.length}개 저장 완료!`);
      loadStyleProfiles();
    } catch (err: any) {
      toast.error(err.message || 'URL 저장 실패');
    }
  };

  // 크롤링 + 말투 학습 실행 — 모든 유효 URL에서 크롤링
  // 개별 URL 크롤링 + 학습
  const handleCrawlSingleUrl = async (hospitalName: string, teamId: number, singleUrl: string) => {
    if (!singleUrl.trim() || !singleUrl.includes('blog.naver.com')) {
      toast.error('유효한 네이버 블로그 URL을 입력해주세요.');
      return;
    }

    const statusKey = `${hospitalName}::${singleUrl}`;
    setCrawlingStatus(prev => ({
      ...prev,
      [statusKey]: { loading: true, progress: '크롤링 시작...' },
    }));

    try {
      const result = await crawlAndLearnHospitalStyle(hospitalName, teamId, singleUrl, (msg) => {
        setCrawlingStatus(prev => ({
          ...prev,
          [statusKey]: { loading: true, progress: msg },
        }));
      });
      if (result.posts && result.posts.length > 0) {
        setCrawledPosts(prev => ({
          ...prev,
          [hospitalName]: [...(prev[hospitalName] || []), ...result.posts!],
        }));
      }
      const blogId = singleUrl.match(/blog\.naver\.com\/([^/?#]+)/)?.[1] || singleUrl;
      toast.success(`${blogId} 크롤링 + 학습 완료!`);
      setCrawlingStatus(prev => ({
        ...prev,
        [statusKey]: { loading: false, progress: '학습 완료!' },
      }));
      loadStyleProfiles();
      getAllCrawledPostsSummary().then(setDbPosts).catch(console.warn);
    } catch (err: any) {
      const errMsg = err.message || '알 수 없는 오류';
      toast.error(`크롤링 실패: ${errMsg}`);
      setCrawlingStatus(prev => ({
        ...prev,
        [statusKey]: { loading: false, progress: '', error: errMsg },
      }));
    }
  };

  // 전체 URL 크롤링 + 학습
  const handleCrawlAndLearn = async (hospitalName: string, teamId: number) => {
    const urls = blogUrlInputs[hospitalName] || [];
    const validUrls = urls.filter(u => u.trim() && u.includes('blog.naver.com'));
    if (validUrls.length === 0) {
      toast.error('먼저 네이버 블로그 URL을 입력해주세요.');
      return;
    }

    setCrawlingStatus(prev => ({
      ...prev,
      [hospitalName]: { loading: true, progress: `준비 중... (${validUrls.length}개 URL)` },
    }));

    try {
      const result = await crawlAndLearnHospitalStyle(hospitalName, teamId, validUrls, (msg) => {
        setCrawlingStatus(prev => ({
          ...prev,
          [hospitalName]: { loading: true, progress: msg },
        }));
      });
      if (result.posts && result.posts.length > 0) {
        setCrawledPosts(prev => ({ ...prev, [hospitalName]: result.posts! }));
      }
      toast.success(`${hospitalName} 말투 학습 완료!`);
      setCrawlingStatus(prev => ({
        ...prev,
        [hospitalName]: { loading: false, progress: '학습 완료!' },
      }));
      loadStyleProfiles();
      // 저장된 글 목록 갱신
      getAllCrawledPostsSummary().then(setDbPosts).catch(console.warn);
    } catch (err: any) {
      const errMsg = err.message || '알 수 없는 오류';
      toast.error(`크롤링 실패: ${errMsg}`);
      setCrawlingStatus(prev => ({
        ...prev,
        [hospitalName]: { loading: false, progress: '', error: errMsg },
      }));
    }
  };

  // 크롤링 데이터 전체 초기화 (크롤링 글 + 말투 프로파일)
  const handleResetCrawlData = async (hospitalName: string) => {
    if (!confirm(`"${hospitalName}"의 크롤링 데이터(수집 글 + 말투 프로파일)를 전부 삭제하시겠습니까?\n\n삭제 후 다시 크롤링할 수 있습니다.`)) return;

    try {
      const result = await resetHospitalCrawlData(hospitalName);
      // UI 상태 갱신
      setDbPosts(prev => {
        const next = { ...prev };
        delete next[hospitalName];
        return next;
      });
      setCrawlingStatus(prev => {
        const next = { ...prev };
        delete next[hospitalName];
        return next;
      });
      loadStyleProfiles();

      if (result.errors.length > 0) {
        console.warn('초기화 부분 오류:', result.errors);
        toast.error(`초기화 일부 실패: ${result.errors.join(', ')}`);
      } else {
        const msg = `${hospitalName}: 글 ${result.deletedPosts}개 삭제${result.profileDeleted ? ', 프로파일 삭제' : ''} 완료`;
        toast.success(msg);
      }
    } catch (err: any) {
      toast.error(`초기화 실패: ${err.message}`);
    }
  };

  // 전체 병원 자동 크롤링 + 채점
  const handleCrawlAllHospitals = async () => {
    if (crawlAllStatus.loading) return;
    setCrawlAllStatus({ loading: true, progress: '준비 중...' });
    try {
      await crawlAndScoreAllHospitals((msg, done, total) => {
        setCrawlAllStatus({ loading: true, progress: `${msg} (${done}/${total})` });
      });
      const updated = await getAllCrawledPostsSummary();
      setDbPosts(updated);
      toast.success('전체 병원 크롤링 + 채점 완료!');
    } catch (e: any) {
      toast.error(`전체 크롤링 실패: ${e.message}`);
    } finally {
      setCrawlAllStatus({ loading: false, progress: '' });
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setLoginError('비밀번호를 입력하세요.');
      return;
    }
    setLoginError('');
    setLoginLoading(true);
    try {
      // 비밀번호 검증 (getAdminStats)
      const result = await getAdminStats(password);

      if (!result.success) {
        console.error('[Admin] 로그인 실패:', result.error);
        const errMsg = result.error || '';
        if (errMsg.includes('시간 초과') || errMsg.includes('timeout')) {
          setLoginError('서버 응답 시간 초과. 네트워크 상태를 확인하고 다시 시도하세요.');
        } else if (errMsg.includes('does not exist') || errMsg.includes('function') || errMsg.includes('42883')) {
          setLoginError('DB 함수 미설정. Supabase SQL Editor에서 supabase_FULL_SETUP.sql을 실행하세요.');
        } else if (errMsg.includes('비밀번호')) {
          setLoginError(errMsg);
        } else {
          setLoginError(errMsg || '비밀번호가 올바르지 않습니다.');
        }
        return;
      }

      // 2단계: 인증 성공 — 즉시 로그인 처리
      setIsAuthenticated(true);
      sessionStorage.setItem('ADMIN_AUTHENTICATED', 'true');
      sessionStorage.setItem('ADMIN_TOKEN', password);
      if (rememberMe) {
        localStorage.setItem('ADMIN_PERSIST', 'true');
        localStorage.setItem('ADMIN_TOKEN', password);
      }
      onAdminVerified?.();

      // 통계 즉시 반영
      if (result.stats) {
        setStats({
          totalContents: result.stats.totalPosts,
          blogCount: result.stats.blogCount,
          cardnewsCount: result.stats.cardNewsCount,
          pressCount: result.stats.pressReleaseCount,
          uniqueHospitals: result.stats.uniqueHospitals,
          uniqueUsers: result.stats.uniqueUsers,
          postsToday: result.stats.postsToday,
          postsThisWeek: result.stats.postsThisWeek,
          postsThisMonth: result.stats.postsThisMonth
        });
      }

      // 3단계: 콘텐츠 백그라운드 로드 (로그인 완료 후 비동기)
      getAllGeneratedPosts(password, { limit: 100 }).then(contentsResult => {
        if (contentsResult.success && contentsResult.data) {
          setContents(contentsResult.data.map((item: any) => ({
            id: item.id,
            title: item.title || '제목 없음',
            content: item.content || '',
            category: item.category,
            content_type: item.post_type as ContentType,
            keywords: item.keywords,
            created_at: item.created_at,
            hospital_name: item.hospital_name,
            doctor_name: item.doctor_name,
            doctor_title: item.doctor_title,
            topic: item.topic,
            user_email: item.user_email,
            char_count: item.char_count
          })));
        }
      });
    } catch (err) {
      console.error('[Admin] 로그인 예외:', err);
      setLoginError('인증 중 오류가 발생했습니다. 네트워크 연결을 확인하세요.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAdminLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('ADMIN_AUTHENTICATED');
    sessionStorage.removeItem('ADMIN_TOKEN');
    localStorage.removeItem('ADMIN_PERSIST');
    localStorage.removeItem('ADMIN_TOKEN');
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 로그인 화면
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-800 rounded-2xl mb-4">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <h1 className="text-xl font-bold text-slate-800">Admin</h1>
            <p className="text-slate-400 text-sm mt-1">관리자 비밀번호를 입력하세요</p>
          </div>

          <form onSubmit={handleAdminLogin} className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 p-8">
            {loginError && <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{loginError}</div>}
            <div className="mb-4">
              <label className="text-sm font-medium text-slate-600 mb-1.5 block">비밀번호</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="관리자 비밀번호" className="w-full px-4 py-3 pr-12 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" autoFocus />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors" tabIndex={-1} aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}>
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 mb-5 cursor-pointer select-none">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500/30" />
              <span className="text-sm text-slate-500">이 기기에서 로그인 유지</span>
            </label>
            <button type="submit" disabled={loginLoading} className="w-full py-3.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {loginLoading ? '인증 중...' : '로그인'}
            </button>
            <div className="mt-4 text-center">
              <a href="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">홈으로 돌아가기</a>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // 관리자 대시보드
  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Admin Dashboard</h1>
            <p className="text-slate-400 text-sm">WINAID 관리자</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/blog" className="px-4 py-2 bg-white border border-slate-200 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm">앱으로 이동</a>
            <button onClick={handleAdminLogout} className="px-4 py-2 bg-white border border-red-200 text-red-500 font-medium rounded-lg hover:bg-red-50 transition-colors text-sm">로그아웃</button>
          </div>
        </div>

        {/* ===== 메인 탭 (항상 최상단) ===== */}
        <div className="flex bg-white border border-slate-200 rounded-xl p-1 mb-5 w-fit shadow-sm">
          <button
            onClick={() => setActiveTab('contents')}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'contents' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >콘텐츠 관리</button>
          <button
            onClick={() => setActiveTab('style')}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'style' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >말투 학습</button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'users' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >사용자 관리</button>
        </div>

        {/* ===== 콘텐츠 관리 탭 ===== */}
        {activeTab === 'contents' && (
          <>
            {/* 팀 & 병원 필터 */}
            <div className="bg-white rounded-xl border border-slate-100 p-4 mb-4 space-y-3">
              <div className="flex bg-slate-100 rounded-xl p-1">
                <button
                  onClick={() => { setSelectedTeam(null); setSelectedHospitalName(''); }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                    selectedTeam === null ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >전체</button>
                {TEAM_DATA.map(team => (
                  <button
                    key={team.id}
                    onClick={() => { setSelectedTeam(team.id); setSelectedHospitalName(''); }}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                      selectedTeam === team.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >{team.label}</button>
                ))}
              </div>
              {selectedTeam !== null && (() => {
                const team = TEAM_DATA.find(t => t.id === selectedTeam);
                if (!team) return null;
                const hospitalMap = new Map<string, string[]>();
                for (const h of team.hospitals) {
                  const baseName = h.name.replace(/ \(.*\)$/, '');
                  const managers = hospitalMap.get(baseName) || [];
                  if (!managers.includes(h.manager)) managers.push(h.manager);
                  hospitalMap.set(baseName, managers);
                }
                const uniqueHospitals = Array.from(hospitalMap.entries());
                return (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => scrollHospitals(-200)}
                      className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-base font-bold flex-none transition-colors"
                    >‹</button>
                    <div
                      ref={hospitalScrollRef}
                      className="flex gap-2 overflow-x-auto flex-1"
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                      <button
                        onClick={() => setSelectedHospitalName('')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border flex-none ${
                          !selectedHospitalName ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >전체 ({uniqueHospitals.length})</button>
                      {uniqueHospitals.map(([name, managers]) => {
                        // 담당자 데이터 (이름 + 직급) 추출
                        const hospitalEntries = team.hospitals.filter(h => h.name.replace(/ \(.*\)$/, '') === name);
                        const uniqueManagers = Array.from(new Map(hospitalEntries.map(h => [h.manager, h])).values());
                        return (
                          <button
                            key={name}
                            onClick={() => setSelectedHospitalName(name)}
                            className={`px-3 py-2 rounded-xl text-left transition-all border flex-none flex flex-col gap-0.5 min-w-[120px] ${
                              selectedHospitalName === name ? 'bg-blue-50 border-blue-300 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                            }`}
                          >
                            <span className={`text-xs font-bold block leading-tight ${selectedHospitalName === name ? 'text-blue-700' : 'text-slate-700'}`}>{name}</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {uniqueManagers.map(h => {
                                const parts = h.manager.replace('님', '').split(' ');
                                const managerName = parts[0] || '';
                                const rank = parts[1] || '';
                                return (
                                  <span key={h.manager} className={`text-[10px] font-medium leading-none ${selectedHospitalName === name ? 'text-blue-500' : 'text-slate-400'}`}>
                                    {managerName} <span className={`${selectedHospitalName === name ? 'text-blue-400' : 'text-slate-300'}`}>{rank}</span>
                                  </span>
                                );
                              })}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => scrollHospitals(200)}
                      className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-base font-bold flex-none transition-colors"
                    >›</button>
                  </div>
                );
              })()}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              {[
                { label: '전체 콘텐츠', value: stats.totalContents, color: 'bg-blue-50 text-blue-600' },
                { label: '블로그', value: stats.blogCount, color: 'bg-sky-50 text-sky-600' },
                { label: '카드뉴스', value: stats.cardnewsCount, color: 'bg-violet-50 text-violet-600' },
                { label: '언론보도', value: stats.pressCount, color: 'bg-emerald-50 text-emerald-600' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl p-4 border border-slate-100">
                  <div className="text-2xl font-bold text-slate-800">{s.value}</div>
                  <div className={`text-xs font-medium mt-1 inline-block px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
              {[
                { label: '병원 수', value: stats.uniqueHospitals },
                { label: '사용자 수', value: stats.uniqueUsers },
                { label: '오늘', value: stats.postsToday },
                { label: '이번 주', value: stats.postsThisWeek },
                { label: '이번 달', value: stats.postsThisMonth },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl p-3 border border-slate-100 text-center">
                  <div className="text-lg font-bold text-slate-700">{s.value}</div>
                  <div className="text-[11px] text-slate-400">{s.label}</div>
                </div>
              ))}
            </div>

            {/* 콘텐츠 목록 */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <h2 className="text-base font-bold text-slate-800">콘텐츠 관리</h2>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex bg-slate-100 p-0.5 rounded-lg">
                    {([['all', '전체'], ['blog', '블로그'], ['card_news', '카드뉴스'], ['press_release', '언론보도']] as [typeof contentFilter, string][]).map(([key, label]) => (
                      <button key={key} onClick={() => setContentFilter(key)} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${contentFilter === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{label}</button>
                    ))}
                  </div>
                  <button onClick={loadContents} disabled={loadingData} className="px-3 py-1.5 bg-slate-100 text-slate-600 font-medium rounded-lg hover:bg-slate-200 transition-colors text-xs disabled:opacity-50">{loadingData ? '로딩...' : '새로고침'}</button>
                </div>
              </div>
              <div className="p-5">
                {dataError && <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{dataError}</div>}
                {filteredContents.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="text-4xl mb-3 opacity-30">📄</div>
                    <p className="text-slate-400 font-medium">{loadingData ? '콘텐츠를 불러오는 중...' : '저장된 콘텐츠가 없습니다.'}</p>
                    <p className="text-slate-300 text-sm mt-1">블로그 글을 생성하면 여기에 자동 저장됩니다.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-400 mb-4">
                      {contentFilter === 'all' ? `총 ${filteredContents.length}개` : `${getContentTypeLabel(contentFilter)} ${filteredContents.length}개`}
                    </p>
                    <div className="space-y-2">
                      {filteredContents.map((content) => (
                        <div key={content.id} className="rounded-xl p-4 border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-all">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5">
                                {getContentTypeBadge(content.content_type)}
                                <h3 className="text-sm font-bold text-slate-800 truncate">{content.title}</h3>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-2">
                                <span>{formatDate(content.created_at)}</span>
                                {content.hospital_name && <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[11px] font-medium">{content.hospital_name}</span>}
                                {content.category && <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[11px]">{content.category}</span>}
                                {content.user_email && <span className="text-blue-400">{content.user_email}</span>}
                              </div>
                              <p className="text-xs text-slate-400 line-clamp-1">{content.topic || content.content?.replace(/<[^>]*>/g, '').substring(0, 120)}</p>
                            </div>
                            <div className="flex gap-1.5 flex-shrink-0">
                              <button onClick={() => setPreviewContent(content)} className="px-3 py-1.5 bg-blue-50 text-blue-600 font-medium rounded-lg hover:bg-blue-100 transition-colors text-xs">보기</button>
                              <button onClick={() => deleteContent(content.id)} className="px-3 py-1.5 bg-red-50 text-red-500 font-medium rounded-lg hover:bg-red-100 transition-colors text-xs">삭제</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* ===== 사용자 관리 탭 ===== */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-800">가입 사용자 목록</h2>
                  <p className="text-xs text-slate-400 mt-0.5">총 {users.length}명</p>
                </div>
                <button
                  onClick={loadUsers}
                  disabled={loadingUsers}
                  className="px-3 py-1.5 bg-slate-100 text-slate-600 font-medium rounded-lg hover:bg-slate-200 transition-colors text-xs disabled:opacity-50"
                >
                  {loadingUsers ? '로딩...' : '새로고침'}
                </button>
              </div>
              {loadingUsers ? (
                <div className="py-16 text-center text-slate-400 text-sm">불러오는 중...</div>
              ) : users.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="text-3xl mb-2 opacity-30">👤</div>
                  <p className="text-slate-400 text-sm">가입한 사용자가 없습니다.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {users.map((user) => {
                    const team = TEAM_DATA.find(t => t.id === user.team_id);
                    return (
                      <div key={user.id} className="px-5 py-4 flex items-center gap-4">
                        <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {user.full_name?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800 text-sm">{user.full_name || '-'}</span>
                            {team && (
                              <span className="text-[11px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">{team.label}</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 truncate mt-0.5">{user.email}</p>
                        </div>
                        <div className="text-xs text-slate-400 flex-shrink-0">
                          {formatDate(user.created_at)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== 말투 학습 탭 ===== */}
        {activeTab === 'style' && (
          <>
            <StyleTab
              styleProfiles={styleProfiles}
              blogUrlInputs={blogUrlInputs}
              setBlogUrlInputs={setBlogUrlInputs}
              crawlingStatus={crawlingStatus}
              crawledPosts={crawledPosts}
              dbPosts={dbPosts}
              setDbPosts={setDbPosts}
              onSaveUrl={handleSaveBlogUrl}
              onCrawl={handleCrawlAndLearn}
              onCrawlSingleUrl={handleCrawlSingleUrl}
              onReset={handleResetCrawlData}
              crawlAllStatus={crawlAllStatus}
              onCrawlAll={handleCrawlAllHospitals}
            />
          </>
        )}
      </div>

            {/* 콘텐츠 미리보기 모달 */}
      {previewContent && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setPreviewContent(null)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl my-8" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">{getContentTypeBadge(previewContent.content_type)}</div>
                <h2 className="text-xl font-bold text-slate-800 mb-1">{previewContent.title}</h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>{formatDate(previewContent.created_at)}</span>
                  {previewContent.category && <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">{previewContent.category}</span>}
                </div>
              </div>
              <button onClick={() => setPreviewContent(null)} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              <div className="prose prose-slate prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewContent.content || '<p class="text-slate-400">내용이 없습니다.</p>') }} />
            </div>
            {previewContent.keywords && previewContent.keywords.length > 0 && (
              <div className="px-6 py-3 border-t border-slate-100 flex gap-1.5 flex-wrap">
                {previewContent.keywords.map((keyword: string, idx: number) => (
                  <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs">#{keyword}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;
