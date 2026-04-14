'use client';

import type { TeamData } from '../../lib/teamData';
import type { HospitalStyleProfile, LearnedWritingStyle } from '../../lib/styleService';
import type { CrawledPostScore, DBCrawledPost } from '../../lib/types';
import { formatDate } from './adminTypes';

interface NewHospitalForm {
  teamId: number;
  name: string;
  manager: string;
  address: string;
  blogUrls: string[];
}

export interface AdminStyleTabProps {
  TEAM_DATA: TeamData[];
  selectedTeam: number;
  setSelectedTeam: (v: number) => void;
  styleProfiles: HospitalStyleProfile[];
  blogUrlInputs: Record<string, string[]>;
  setBlogUrlInputs: (fn: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  crawlingStatus: Record<string, { loading: boolean; progress: string; error?: string }>;
  dbPosts: Record<string, DBCrawledPost[]>;
  expandedPosts: Record<string, boolean>;
  setExpandedPosts: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  scoringPost: string | null;
  editingContent: Record<string, string>;
  setEditingContent: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  crawlAllStatus: { loading: boolean; progress: string };
  crawlAllIncludeStyle: boolean;
  setCrawlAllIncludeStyle: (v: boolean) => void;
  showAddHospitalModal: boolean;
  setShowAddHospitalModal: (v: boolean) => void;
  onSaveBlogUrl: (hospitalName: string, teamId: number) => void;
  onCrawlAndLearn: (hospitalName: string, teamId: number) => void;
  onResetCrawlData: (hospitalName: string) => void;
  onLoadDbPosts: (hospitalName: string) => void;
  onScorePost: (post: DBCrawledPost) => void;
  onSaveContent: (post: DBCrawledPost) => void;
  applyCorrection: (postId: string, original: string, correction: string) => void;
  onCrawlAllHospitals: () => void;
  onDeactivateHospital: (hospitalName: string) => Promise<void>;
  newHospital: NewHospitalForm;
  setNewHospital: React.Dispatch<React.SetStateAction<NewHospitalForm>>;
  onAddHospital: () => Promise<void>;
}

export default function AdminStyleTab(props: AdminStyleTabProps) {
  const {
    TEAM_DATA, selectedTeam, setSelectedTeam,
    styleProfiles, blogUrlInputs, setBlogUrlInputs,
    crawlingStatus, dbPosts, expandedPosts, setExpandedPosts,
    scoringPost, editingContent, setEditingContent,
    crawlAllStatus, crawlAllIncludeStyle, setCrawlAllIncludeStyle,
    showAddHospitalModal, setShowAddHospitalModal,
    onSaveBlogUrl, onCrawlAndLearn, onResetCrawlData,
    onLoadDbPosts, onScorePost, onSaveContent, applyCorrection,
    onCrawlAllHospitals,
    onDeactivateHospital, newHospital, setNewHospital, onAddHospital,
  } = props;

  return (
    <>
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
              <div className="shrink-0 flex flex-col items-end gap-2">
                <button
                  onClick={onCrawlAllHospitals}
                  disabled={crawlAllStatus.loading}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2 shadow-sm"
                >
                  {crawlAllStatus.loading ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />{crawlAllStatus.progress || '크롤링 중...'}</>
                  ) : (
                    <>🔄 전체 병원 자동 {crawlAllIncludeStyle ? '크롤링 + 채점 + 말투 분석' : '크롤링 + 채점'}</>
                  )}
                </button>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={crawlAllIncludeStyle}
                    onChange={e => setCrawlAllIncludeStyle(e.target.checked)}
                    disabled={crawlAllStatus.loading}
                    className="w-3.5 h-3.5 rounded border-violet-300 text-violet-600 focus:ring-violet-500/30"
                  />
                  <span className="text-[11px] text-violet-600 font-medium">말투 분석까지 실행</span>
                </label>
              </div>
            </div>
            {crawlAllStatus.loading && (
              <div className="mt-2 text-xs text-indigo-600 font-medium">{crawlAllStatus.progress}</div>
            )}
            <div className="mt-3 pt-3 border-t border-violet-200 flex items-center gap-2 text-[11px] text-violet-500">
              <span>⏰</span>
              <span>자동 스케줄: 매일 10:00~18:00 (1시간 간격) — 크롤링 + 채점 자동 실행</span>
              <div className="flex-1" />
              <button
                onClick={() => {
                  setNewHospital({ teamId: TEAM_DATA[0]?.id ?? 1, name: '', manager: '', address: '', blogUrls: [''] });
                  setShowAddHospitalModal(true);
                }}
                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold rounded-lg transition-colors"
              >
                + 병원 추가
              </button>
            </div>
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
          {(() => {
            const team = TEAM_DATA.find(t => t.id === selectedTeam);
            if (!team) return null;
            const roleOrder = (manager: string) =>
              manager.includes('팀장') ? 0 : manager.includes('선임') ? 1 : 2;
            const uniqueHospitals = Array.from(
              new Map(team.hospitals.map(h => [h.name.replace(/ \(.*\)$/, ''), h])).entries()
            ).sort(([nameA, hA], [nameB, hB]) => {
              const diff = roleOrder(hA.manager) - roleOrder(hB.manager);
              return diff !== 0 ? diff : nameA.localeCompare(nameB, 'ko');
            });

            return (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
                  <span className="text-sm font-bold text-slate-700">{team.label} 병원 목록</span>
                  <span className="ml-2 text-xs text-slate-400">({uniqueHospitals.length}개)</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {uniqueHospitals.map(([baseName, h]) => {
                    const profile = styleProfiles.find(p => p.hospital_name === baseName);
                    const status = crawlingStatus[baseName];
                    const urls = blogUrlInputs[baseName]
                      || (profile?.naver_blog_url ? profile.naver_blog_url.split(',').map(u => u.trim()).filter(Boolean) : null)
                      || (h.naverBlogUrls && h.naverBlogUrls.length > 0 ? h.naverBlogUrls : ['']);
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
                              {(profile.style_profile as LearnedWritingStyle).description?.slice(0, 60) || '학습 완료'}
                            </span>
                          )}
                        </div>

                        {/* 다중 URL 입력 */}
                        <div className="space-y-2">
                          {urls.map((urlVal, urlIdx) => (
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
                                  disabled={status?.loading}
                                />
                                {urls.length > 1 && (
                                  <button
                                    onClick={() => {
                                      const newUrls = urls.filter((_, i) => i !== urlIdx);
                                      setBlogUrlInputs(prev => ({ ...prev, [baseName]: newUrls }));
                                    }}
                                    disabled={status?.loading}
                                    className="w-7 h-7 flex items-center justify-center text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                                    title="URL 삭제"
                                  >✕</button>
                                )}
                              </div>
                            </div>
                          ))}

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
                              onClick={() => onSaveBlogUrl(baseName, team.id)}
                              disabled={status?.loading || !hasAnyUrl}
                              className="px-3 py-2 text-xs font-semibold bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40 whitespace-nowrap"
                            >URL 저장</button>
                            <button
                              onClick={() => onCrawlAndLearn(baseName, team.id)}
                              disabled={status?.loading || !hasAnyUrl}
                              className="px-3 py-2 text-xs font-bold bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-40 whitespace-nowrap"
                            >
                              {status?.loading ? '학습 중...' : '전체 크롤링'}
                            </button>
                            {(profile || (dbPosts[baseName] && dbPosts[baseName].length > 0)) && (
                              <button
                                onClick={() => onResetCrawlData(baseName)}
                                disabled={status?.loading}
                                className="px-3 py-2 text-xs font-semibold bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-40 whitespace-nowrap"
                              >
                                초기화
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                if (!confirm(`"${baseName}" 병원을 목록에서 제거하시겠습니까?`)) return;
                                await onDeactivateHospital(baseName);
                              }}
                              disabled={status?.loading}
                              className="px-2 py-2 text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap"
                              title="병원 제거"
                            >✕</button>
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

                        {/* 노출 순위: 수집된 글 각각에 순위 표시로 대체 (수동 체크 제거) */}

                        {/* 학습된 스타일 프로필 요약 */}
                        {profile?.style_profile && (() => {
                          const sp = profile.style_profile as LearnedWritingStyle;
                          const as_ = sp.analyzedStyle;
                          if (!as_) return null;
                          return (
                            <div className="mt-3 bg-violet-50 border border-violet-100 rounded-xl p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-violet-700">스타일 프로필</span>
                                {as_.oneLineSummary && (
                                  <span className="text-[11px] text-violet-500">{as_.oneLineSummary}</span>
                                )}
                              </div>
                              <div className="space-y-1.5 text-[11px]">
                                <div>
                                  <span className="font-semibold text-slate-600">어조:</span>{' '}
                                  <span className="text-slate-500">{as_.tone}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-600">격식:</span>{' '}
                                  <span className="text-slate-500">
                                    {as_.formalityLevel === 'formal' ? '격식체' : as_.formalityLevel === 'casual' ? '편한 말투' : '중립적'}
                                  </span>
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-600">화자:</span>{' '}
                                  <span className="text-slate-500">{as_.speakerIdentity}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-600">설득:</span>{' '}
                                  <span className="text-slate-500">{as_.persuasionStyle}</span>
                                </div>
                              </div>
                              {as_.sentenceEndings && as_.sentenceEndings.length > 0 && (
                                <div className="text-[11px]">
                                  <span className="font-semibold text-slate-600">문장 끝:</span>{' '}
                                  <span className="text-slate-500">{as_.sentenceEndings.slice(0, 6).join(', ')}</span>
                                </div>
                              )}
                              {as_.vocabulary && as_.vocabulary.length > 0 && (
                                <div className="text-[11px]">
                                  <span className="font-semibold text-slate-600">고유 표현:</span>{' '}
                                  <span className="text-slate-500">{as_.vocabulary.slice(0, 6).join(', ')}</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* ── 수집된 글 아코디언 ── */}
                        {(() => {
                          const hospitalPosts = dbPosts[baseName] || [];
                          const blogIds = [...new Set(hospitalPosts.map(p => p.source_blog_id).filter(Boolean))];
                          const isExpanded = expandedPosts[`${baseName}_accordion`];
                          const profileCount = profile?.crawled_posts_count || 0;
                          const displayCount = hospitalPosts.length || profileCount;
                          if (displayCount === 0 && !isExpanded) return null;

                          return (
                            <div className="mt-3">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!isExpanded && hospitalPosts.length === 0) {
                                    onLoadDbPosts(baseName);
                                  }
                                  setExpandedPosts(prev => ({ ...prev, [`${baseName}_accordion`]: !isExpanded }));
                                }}
                                className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors"
                              >
                                <span>{isExpanded ? '▼' : '▶'}</span>
                                수집된 글 {displayCount}개 보기
                                {blogIds.length > 1 && <span className="text-[10px] text-slate-400 ml-1">({blogIds.length}개 블로그)</span>}
                              </button>

                              {isExpanded && hospitalPosts.length > 0 && (
                                <div className="mt-2 space-y-3 max-h-[700px] overflow-y-auto pr-1">
                                  {blogIds.map(blogId => {
                                    const groupPosts = hospitalPosts.filter(p => p.source_blog_id === blogId);
                                    return (
                                      <div key={blogId || 'unknown'} className="border border-violet-100 rounded-lg overflow-hidden bg-white">
                                        {/* URL 그룹 헤더 */}
                                        <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-violet-50 to-slate-50 border-b border-violet-100">
                                          <span className="text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded font-mono font-bold">{blogId || '?'}</span>
                                          <span className="text-[10px] text-slate-500">{groupPosts.length}개 글</span>
                                          {blogId && (
                                            <a
                                              href={`https://blog.naver.com/${blogId}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="ml-auto text-[10px] text-violet-400 hover:text-violet-600"
                                            >블로그 →</a>
                                          )}
                                        </div>
                                        {/* 해당 블로그의 글 목록 */}
                                        <div className="divide-y divide-slate-100">
                                          {groupPosts.slice(0, 10).map((post, i) => {
                                            const isPostExpanded = expandedPosts[post.id];
                                            const isScoring = scoringPost === post.id;
                                            const hasScore = post.scored_at != null;
                                            const scoreBadge = (score?: number) => {
                                              if (score == null) return 'bg-slate-100 text-slate-400';
                                              if (score >= 90) return 'bg-green-100 text-green-700';
                                              if (score >= 70) return 'bg-orange-100 text-orange-700';
                                              return 'bg-red-100 text-red-600';
                                            };
                                            // 이슈 기반 점수 보정 (이슈 0건인데 점수가 100 미만이면 100으로)
                                            const typoIssues = (post.typo_issues as CrawledPostScore['typo_issues']) || [];
                                            const typoOnly = typoIssues.filter(i => i.type === 'typo' || !i.type);
                                            const spellingOnly = typoIssues.filter(i => i.type === 'spelling');
                                            const lawIssues = (post.law_issues as CrawledPostScore['law_issues']) || [];
                                            const displayTypo = typoOnly.length === 0 ? 100 : (post.score_typo ?? 100);
                                            const displaySpelling = spellingOnly.length === 0 ? 100 : (post.score_spelling ?? 100);
                                            const displayLaw = lawIssues.length === 0 ? 100 : (post.score_medical_law ?? 100);
                                            const displaySeo = post.score_naver_seo ?? null;
                                            const displayTotal = hasScore
                                              ? Math.round(displaySeo != null
                                                ? (displayTypo + displaySpelling + displayLaw + displaySeo) / 4
                                                : (displayTypo + displaySpelling + displayLaw) / 3)
                                              : post.score_total;
                                            const currentContent = editingContent[post.id] ?? post.corrected_content ?? post.content;
                                            return (
                                              <div key={post.id} className="border-b border-slate-100 last:border-b-0">
                                                {/* 글 헤더 */}
                                                <button
                                                  type="button"
                                                  onClick={() => setExpandedPosts(prev => ({ ...prev, [post.id]: !isPostExpanded }))}
                                                  className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                                                >
                                                  <span className="text-[11px] font-bold text-slate-400 mt-0.5 shrink-0">#{i + 1}</span>
                                                  {/* 네이버 블로그탭 순위 */}
                                                  {post.naver_rank != null ? (
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${post.naver_rank <= 3 ? 'bg-green-100 text-green-700' : post.naver_rank <= 10 ? 'bg-blue-100 text-blue-700' : post.naver_rank <= 20 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
                                                      {post.naver_rank}위
                                                    </span>
                                                  ) : post.naver_rank_keyword ? (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 bg-slate-100 text-slate-400">순위외</span>
                                                  ) : null}
                                                  <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                                      {hasScore ? (
                                                        <>
                                                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${scoreBadge(displayTypo)}`}>오타 {displayTypo}</span>
                                                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${scoreBadge(displaySpelling)}`}>맞춤법 {displaySpelling}</span>
                                                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${scoreBadge(displayLaw)}`}>의료법 {displayLaw}</span>
                                                          {displaySeo != null && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${scoreBadge(displaySeo)}`}>SEO {displaySeo}</span>}
                                                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${scoreBadge(displayTotal)}`}>종합 {displayTotal}</span>
                                                        </>
                                                      ) : (
                                                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded">미채점</span>
                                                      )}
                                                    </div>
                                                    <p className="text-[11px] text-violet-600 truncate font-medium">
                                                      {post.source_blog_id && <span className="text-[9px] px-1 py-0.5 bg-violet-50 text-violet-500 rounded mr-1.5 font-mono">{post.source_blog_id}</span>}
                                                      {post.title ? post.title.replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') : post.url}
                                                    </p>
                                                  </div>
                                                  <span className="text-[10px] text-slate-400 shrink-0">{isPostExpanded ? '접기' : '펼치기'}</span>
                                                </button>

                                                {/* 펼침: 본문 + 채점 + 수정 */}
                                                {isPostExpanded && (
                                                  <div className="px-3 pb-3 bg-slate-50 border-t border-slate-100 space-y-3">
                                                    {/* 채점 / 재채점 버튼 */}
                                                    <div className="mt-2 flex items-center gap-2">
                                                      <button
                                                        onClick={() => onScorePost(post)}
                                                        disabled={isScoring}
                                                        className="px-3 py-1.5 text-[11px] font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                                                      >
                                                        {isScoring
                                                          ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />채점 중...</>
                                                          : hasScore ? '🔄 재채점' : '📊 채점하기'}
                                                      </button>
                                                    </div>

                                                    {/* 점수 이유 요약 */}
                                                    {hasScore && (
                                                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1">
                                                        <p className="text-[11px] font-bold text-slate-700 mb-1">📋 채점 근거</p>
                                                        <div className="flex flex-wrap gap-2 text-[11px]">
                                                          <span className={`px-2 py-0.5 rounded font-bold ${scoreBadge(displayTypo)}`}>
                                                            오타 {displayTypo}점{typoOnly.length > 0 ? ` — ${typoOnly.length}건 × -10점` : ' — 없음'}
                                                          </span>
                                                          <span className={`px-2 py-0.5 rounded font-bold ${scoreBadge(displaySpelling)}`}>
                                                            맞춤법 {displaySpelling}점{spellingOnly.length > 0 ? ` — ${spellingOnly.length}건 × -5점` : ' — 없음'}
                                                          </span>
                                                          <span className={`px-2 py-0.5 rounded font-bold ${scoreBadge(displayLaw)}`}>
                                                            의료법 {displayLaw}점{lawIssues.length > 0 ? ` — 위반 ${lawIssues.length}건` : ' — 위반 없음'}
                                                          </span>
                                                          {displaySeo != null && (
                                                            <span className={`px-2 py-0.5 rounded font-bold ${scoreBadge(displaySeo)}`}>
                                                              SEO {displaySeo}점
                                                              {((post.seo_issues as CrawledPostScore['seo_issues'])?.length ?? 0) > 0
                                                                ? ` — 감점 ${(post.seo_issues as CrawledPostScore['seo_issues'])!.length}건`
                                                                : ' — 양호'}
                                                            </span>
                                                          )}
                                                        </div>
                                                      </div>
                                                    )}

                                                    {/* 오타/맞춤법 이슈 */}
                                                    {post.typo_issues && (post.typo_issues as CrawledPostScore['typo_issues']).length > 0 && (
                                                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5">
                                                        <p className="text-[11px] font-bold text-orange-700 mb-1.5">⚠️ 오타 · 맞춤법 이슈 ({(post.typo_issues as CrawledPostScore['typo_issues']).length}건)</p>
                                                        <div className="space-y-2">
                                                          {(post.typo_issues as CrawledPostScore['typo_issues']).map((issue, idx) => (
                                                            <div key={idx} className="text-[11px]">
                                                              <div className="flex items-center gap-2 flex-wrap">
                                                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${issue.type === 'spelling' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                                                  {issue.type === 'spelling' ? '맞춤법' : '오타'}
                                                                </span>
                                                                <span className="text-red-600 line-through">&quot;{issue.original}&quot;</span>
                                                                <span className="text-slate-400">→</span>
                                                                <span className="text-green-700 font-medium">&quot;{issue.correction}&quot;</span>
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
                                                    {post.law_issues && (post.law_issues as CrawledPostScore['law_issues']).length > 0 && (
                                                      <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
                                                        <p className="text-[11px] font-bold text-red-700 mb-1.5">🚫 의료광고법 이슈 ({(post.law_issues as CrawledPostScore['law_issues']).length}건)</p>
                                                        <div className="space-y-2.5">
                                                          {(post.law_issues as CrawledPostScore['law_issues']).map((issue, idx) => (
                                                            <div key={idx} className="text-[11px] bg-white border border-red-100 rounded-lg p-2">
                                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${issue.severity === 'critical' ? 'bg-red-200 text-red-800' : issue.severity === 'high' ? 'bg-orange-200 text-orange-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                                  {issue.severity}
                                                                </span>
                                                                <span className="text-red-600 font-bold">&quot;{issue.word}&quot;</span>
                                                                {issue.replacement?.length > 0 && (
                                                                  <span className="text-emerald-700 font-medium">→ &quot;{issue.replacement[0]}&quot;</span>
                                                                )}
                                                              </div>
                                                              {issue.law_article && (() => {
                                                                const lawDesc: Record<string, string> = {
                                                                  '제56조1항': '치료 효과를 보장·단정하는 내용의 광고 금지',
                                                                  '제56조2항': '거짓·과장 의료광고 금지',
                                                                  '제56조2항1호': '환자를 유인·속이는 행위, 최고·유일 등 과대 표현 금지',
                                                                  '제56조2항2호': '다른 의료기관을 비방하거나 비교하는 광고 금지',
                                                                  '제56조2항3호': '신문·방송 등에 의한 기사 형태의 광고 금지, 환자 체험기 활용 금지',
                                                                  '제56조2항4호': '뉴스·방송 등을 이용한 광고 금지',
                                                                  '제56조2항5호': '의학적으로 인정되지 않는 치료 효과의 광고 금지, 안전성 미입증 주장 금지',
                                                                  '제56조2항6호': '객관적으로 인정되지 않거나 과장된 내용의 광고 금지',
                                                                };
                                                                const desc = lawDesc[issue.law_article] || lawDesc[issue.law_article.replace(/(\d)항(\d)/, '$1항$2호')] || '';
                                                                return (
                                                                  <div className="mt-1.5 px-2 py-1.5 bg-red-50 border border-red-200 rounded text-[10px]">
                                                                    <span className="font-bold text-red-700">📋 의료법 {issue.law_article}</span>
                                                                    {desc && <span className="text-red-600 ml-1">— {desc}</span>}
                                                                  </div>
                                                                );
                                                              })()}
                                                              {issue.context && (
                                                                <p className="mt-1 text-[10px] text-slate-400 italic pl-1 border-l-2 border-red-200">{issue.context}</p>
                                                              )}
                                                            </div>
                                                          ))}
                                                        </div>
                                                      </div>
                                                    )}

                                                    {/* SEO 이슈 */}
                                                    {post.seo_issues && (post.seo_issues as CrawledPostScore['seo_issues'])!.length > 0 && (
                                                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                                                        <p className="text-[11px] font-bold text-blue-700 mb-1.5">SEO 감점 항목 ({(post.seo_issues as CrawledPostScore['seo_issues'])!.length}건)</p>
                                                        <div className="space-y-1">
                                                          {(post.seo_issues as CrawledPostScore['seo_issues'])!.map((issue, idx) => (
                                                            <div key={idx} className="flex items-center gap-2 text-[11px]">
                                                              <span className="text-red-500 font-bold">{issue.score}점</span>
                                                              <span className="font-semibold text-slate-700">{issue.item}</span>
                                                              <span className="text-slate-400">{issue.reason}</span>
                                                            </div>
                                                          ))}
                                                        </div>
                                                      </div>
                                                    )}

                                                    {/* 본문 (편집 가능) */}
                                                    <div>
                                                      <p className="text-[10px] text-slate-500 mb-1 font-medium">
                                                        본문 {post.corrected_content ? '(수정본)' : ''} · {(post.corrected_content ?? post.content ?? '').length.toLocaleString()}자
                                                      </p>
                                                      <textarea
                                                        className="w-full text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg p-2 min-h-48 max-h-[600px] resize-y focus:outline-none focus:border-violet-400"
                                                        style={{ minHeight: '12rem' }}
                                                        value={currentContent}
                                                        onChange={e => setEditingContent(prev => ({ ...prev, [post.id]: e.target.value }))}
                                                        rows={6}
                                                      />
                                                    </div>

                                                    {/* 저장 + 링크 */}
                                                    <div className="flex items-center gap-2">
                                                      {editingContent[post.id] !== undefined && (
                                                        <button
                                                          onClick={() => onSaveContent(post)}
                                                          className="px-3 py-1.5 text-[11px] font-bold bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
                                                        >
                                                          ✅ 수정본 저장
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
                                    );
                                  })}
                                </div>
                              )}

                              {isExpanded && hospitalPosts.length === 0 && (
                                <p className="mt-2 text-[11px] text-slate-400">수집된 글이 없습니다. 크롤링을 먼저 실행하세요.</p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

      {/* 병원 추가 모달 */}
      {showAddHospitalModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddHospitalModal(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">병원 추가</h3>
              <p className="text-xs text-slate-400 mt-1">새 병원을 등록하면 말투 학습 목록에 추가됩니다.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-600 mb-1 block">팀</label>
                <select
                  value={newHospital.teamId}
                  onChange={e => setNewHospital(prev => ({ ...prev, teamId: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-violet-400"
                >
                  {TEAM_DATA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 mb-1 block">병원명 *</label>
                <input
                  value={newHospital.name}
                  onChange={e => setNewHospital(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="예: 서울바른치과"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-violet-400"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 mb-1 block">담당자</label>
                <input
                  value={newHospital.manager}
                  onChange={e => setNewHospital(prev => ({ ...prev, manager: e.target.value }))}
                  placeholder="예: 김주열 팀장님"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 mb-1 block">주소</label>
                <input
                  value={newHospital.address}
                  onChange={e => setNewHospital(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="예: 서울 강남구 역삼동"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 mb-1 block">블로그 URL</label>
                {newHospital.blogUrls.map((url, idx) => (
                  <div key={idx} className="flex gap-2 items-center mb-1.5">
                    <input
                      value={url}
                      onChange={e => {
                        const urls = [...newHospital.blogUrls];
                        urls[idx] = e.target.value;
                        setNewHospital(prev => ({ ...prev, blogUrls: urls }));
                      }}
                      placeholder="https://blog.naver.com/병원아이디"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-violet-400"
                    />
                    {newHospital.blogUrls.length > 1 && (
                      <button onClick={() => setNewHospital(prev => ({ ...prev, blogUrls: prev.blogUrls.filter((_, i) => i !== idx) }))} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setNewHospital(prev => ({ ...prev, blogUrls: [...prev.blogUrls, ''] }))}
                  className="text-xs text-violet-600 font-medium hover:text-violet-700"
                >+ URL 추가</button>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAddHospitalModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
                >취소</button>
                <button
                  onClick={() => onAddHospital()}
                  disabled={!newHospital.name.trim()}
                  className="flex-1 py-2.5 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >추가</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
