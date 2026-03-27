'use client';

import { useRef } from 'react';
import {
  type GeneratedPost, type PostTypeFilter,
  POST_TYPE_LABELS, POST_TYPE_COLORS, formatDate,
} from './adminTypes';
import { sanitizeHtml } from '../../lib/sanitizeHtml';
import type { TeamData } from '../../lib/teamData';

export interface AdminContentsTabProps {
  posts: GeneratedPost[];
  postsLoading: boolean;
  contentSearch: string;
  setContentSearch: (v: string) => void;
  typeFilter: PostTypeFilter;
  setTypeFilter: (v: PostTypeFilter) => void;
  selectedPost: GeneratedPost | null;
  setSelectedPost: (v: GeneratedPost | null) => void;
  TEAM_DATA: TeamData[];
  selectedContentTeam: number | null;
  setSelectedContentTeam: (v: number | null) => void;
  selectedContentHospital: string;
  setSelectedContentHospital: (v: string) => void;
  hasMorePosts: boolean;
  stats: { totalPosts: number } | null;
  onLoadMore: () => void;
  onRefresh: () => void;
  onDelete: (postId: string) => void;
  showDeleteAllModal: boolean;
  setShowDeleteAllModal: (v: boolean) => void;
  deleteAllConfirmText: string;
  setDeleteAllConfirmText: (v: string) => void;
  deleteAllLoading: boolean;
  deleteAllError: string;
  setDeleteAllError: (v: string) => void;
  onDeleteAll: () => void;
}

export default function AdminContentsTab(props: AdminContentsTabProps) {
  const {
    posts, postsLoading, contentSearch, setContentSearch,
    typeFilter, setTypeFilter, selectedPost, setSelectedPost,
    TEAM_DATA, selectedContentTeam, setSelectedContentTeam,
    selectedContentHospital, setSelectedContentHospital,
    hasMorePosts, stats, onLoadMore, onRefresh, onDelete,
    showDeleteAllModal, setShowDeleteAllModal,
    deleteAllConfirmText, setDeleteAllConfirmText,
    deleteAllLoading, deleteAllError, setDeleteAllError, onDeleteAll,
  } = props;

  const hospitalScrollRef = useRef<HTMLDivElement>(null);

  return (
    <>
          {/* 팀 & 병원 필터 패널 */}
          <div className="bg-white rounded-xl border border-slate-100 p-4 mb-4 space-y-3">
            <div className="flex bg-slate-100 rounded-xl p-1">
              <button
                onClick={() => { setSelectedContentTeam(null); setSelectedContentHospital(''); }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  selectedContentTeam === null ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >전체</button>
              {TEAM_DATA.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setSelectedContentTeam(t.id); setSelectedContentHospital(''); }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                    selectedContentTeam === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >{t.label}</button>
              ))}
            </div>

            {/* 병원 가로 스크롤 chip */}
            {selectedContentTeam !== null && (() => {
              const team = TEAM_DATA.find(t => t.id === selectedContentTeam);
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
                    onClick={() => hospitalScrollRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}
                    className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-base font-bold flex-none transition-colors"
                  >‹</button>
                  <div
                    ref={hospitalScrollRef}
                    className="flex gap-2 overflow-x-auto flex-1"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    <button
                      onClick={() => setSelectedContentHospital('')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border flex-none ${
                        !selectedContentHospital ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >전체 ({uniqueHospitals.length})</button>
                    {uniqueHospitals.map(([name]) => {
                      const hospitalEntries = team.hospitals.filter(h => h.name.replace(/ \(.*\)$/, '') === name);
                      const uniqueManagers = Array.from(new Map(hospitalEntries.map(h => [h.manager, h])).values());
                      return (
                        <button
                          key={name}
                          onClick={() => setSelectedContentHospital(name)}
                          className={`px-3 py-2 rounded-xl text-left transition-all border flex-none flex flex-col gap-0.5 min-w-[120px] ${
                            selectedContentHospital === name ? 'bg-blue-50 border-blue-300 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                          }`}
                        >
                          <span className={`text-xs font-bold block leading-tight ${selectedContentHospital === name ? 'text-blue-700' : 'text-slate-700'}`}>{name}</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {uniqueManagers.map(h => {
                              const parts = h.manager.replace('님', '').split(' ');
                              const managerName = parts[0] || '';
                              const rank = parts[1] || '';
                              return (
                                <span key={h.manager} className={`text-[10px] font-medium leading-none ${selectedContentHospital === name ? 'text-blue-500' : 'text-slate-400'}`}>
                                  {managerName} <span className={selectedContentHospital === name ? 'text-blue-400' : 'text-slate-300'}>{rank}</span>
                                </span>
                              );
                            })}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => hospitalScrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}
                    className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-base font-bold flex-none transition-colors"
                  >›</button>
                </div>
              );
            })()}
          </div>

          {/* 콘텐츠 목록 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            {/* 헤더: 제목 + 타입 필터 + 새로고침 + 전체 삭제 */}
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold text-slate-800">콘텐츠 관리</h2>
                <input
                  type="text"
                  value={contentSearch}
                  onChange={e => setContentSearch(e.target.value)}
                  placeholder="제목·병원·주제 검색"
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg w-48 focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex bg-slate-100 p-0.5 rounded-lg">
                  {([
                    { key: 'all' as PostTypeFilter, label: '전체' },
                    { key: 'blog' as PostTypeFilter, label: '블로그' },
                    { key: 'card_news' as PostTypeFilter, label: '카드뉴스' },
                    { key: 'press_release' as PostTypeFilter, label: '보도자료' },
                    { key: 'image' as PostTypeFilter, label: '이미지' },
                  ]).map(f => (
                    <button
                      key={f.key}
                      onClick={() => setTypeFilter(f.key)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                        typeFilter === f.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={onRefresh}
                  disabled={postsLoading}
                  className="px-3 py-1.5 bg-slate-100 text-slate-600 font-medium rounded-lg hover:bg-slate-200 transition-colors text-xs disabled:opacity-50"
                >
                  {postsLoading ? '로딩...' : '새로고침'}
                </button>
                {posts.length > 0 && (
                  <>
                    <button
                      onClick={() => {
                        const q = contentSearch.trim().toLowerCase();
                        const rows = (q
                          ? posts.filter(p =>
                              (p.title || '').toLowerCase().includes(q) ||
                              (p.hospital_name || '').toLowerCase().includes(q) ||
                              (p.topic || '').toLowerCase().includes(q))
                          : posts
                        );
                        const header = '유형,병원,제목,주제,글자수,생성일';
                        const csv = [header, ...rows.map(p =>
                          [POST_TYPE_LABELS[p.post_type] || p.post_type, p.hospital_name || '', `"${(p.title || '').replace(/"/g, '""')}"`, `"${(p.topic || '').replace(/"/g, '""')}"`, p.char_count ?? '', formatDate(p.created_at)].join(',')
                        )].join('\n');
                        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `winaid_contents_${new Date().toISOString().slice(0, 10)}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-600 font-medium rounded-lg hover:bg-emerald-100 transition-colors text-xs border border-emerald-200"
                    >
                      CSV 내보내기
                    </button>
                    <button
                      onClick={() => { setDeleteAllError(''); setShowDeleteAllModal(true); }}
                      className="px-3 py-1.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors text-xs"
                    >
                      전체 삭제
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 콘텐츠 본문 */}
            <div className="p-5">
              {postsLoading ? (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3 opacity-30">📄</div>
                  <p className="text-slate-400 font-medium">콘텐츠를 불러오는 중...</p>
                </div>
              ) : posts.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3 opacity-30">📄</div>
                  <p className="text-slate-400 font-medium">저장된 콘텐츠가 없습니다.</p>
                  <p className="text-slate-300 text-sm mt-1">블로그 글을 생성하면 여기에 자동 저장됩니다.</p>
                </div>
              ) : (() => {
                const q = contentSearch.trim().toLowerCase();
                const filtered = q
                  ? posts.filter(p =>
                      (p.title?.toLowerCase().includes(q)) ||
                      (p.hospital_name?.toLowerCase().includes(q)) ||
                      (p.topic?.toLowerCase().includes(q)) ||
                      (p.user_email?.toLowerCase().includes(q))
                    )
                  : posts;
                return (
                <>
                  <p className="text-xs text-slate-400 mb-4">
                    {typeFilter === 'all' ? `총 ${posts.length}개` : `${POST_TYPE_LABELS[typeFilter] || typeFilter} ${posts.length}개`}
                    {q && ` · 검색 결과 ${filtered.length}개`}
                  </p>
                  <div className="space-y-2">
                    {filtered.map(post => (
                      <div key={post.id} className="rounded-xl p-4 border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-all">
                        <div className="flex items-start justify-between gap-3">
                          {/* 이미지 타입이면 썸네일 표시 */}
                          {post.post_type === 'image' && post.content?.startsWith('data:image') && (
                            <div className="flex-shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={post.content}
                                alt={post.title}
                                className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${POST_TYPE_COLORS[post.post_type] || 'bg-slate-100 text-slate-600'}`}>
                                {POST_TYPE_LABELS[post.post_type] || post.post_type}
                              </span>
                              <h3 className="text-sm font-bold text-slate-800 truncate">{post.title}</h3>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-2">
                              <span>{formatDate(post.created_at)}</span>
                              {post.hospital_name && <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[11px] font-medium">{post.hospital_name}</span>}
                              {post.category && <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[11px]">{post.category}</span>}
                              {post.user_email && <span className="text-blue-400">{post.user_email}</span>}
                              {post.char_count && post.post_type !== 'image' && <span className="text-slate-300">{post.char_count.toLocaleString()}자</span>}
                            </div>
                            <p className="text-xs text-slate-400 line-clamp-1">
                              {post.post_type === 'image'
                                ? (post.topic || '이미지 생성')
                                : (post.topic || post.content?.replace(/<[^>]*>/g, '').substring(0, 120))}
                            </p>
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <button onClick={() => setSelectedPost(post)} className="px-3 py-1.5 bg-blue-50 text-blue-600 font-medium rounded-lg hover:bg-blue-100 transition-colors text-xs">보기</button>
                            <button onClick={() => onDelete(post.id)} className="px-3 py-1.5 bg-red-50 text-red-500 font-medium rounded-lg hover:bg-red-100 transition-colors text-xs">삭제</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {hasMorePosts && !q && (
                    <button
                      onClick={onLoadMore}
                      disabled={postsLoading}
                      className="w-full mt-4 py-2.5 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
                    >
                      {postsLoading ? '불러오는 중...' : '더 불러오기'}
                    </button>
                  )}
                </>
                );
              })()}
            </div>
          </div>

          {/* 상세 보기 모달 */}
          {selectedPost && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setSelectedPost(null)}>
              <div
                className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl my-8"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 border-b border-slate-100 flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${POST_TYPE_COLORS[selectedPost.post_type] || 'bg-slate-100 text-slate-600'}`}>
                        {POST_TYPE_LABELS[selectedPost.post_type] || selectedPost.post_type}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-1">{selectedPost.title}</h2>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>{formatDate(selectedPost.created_at)}</span>
                      {selectedPost.hospital_name && <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[11px] font-medium">{selectedPost.hospital_name}</span>}
                      {selectedPost.topic && <span>주제: {selectedPost.topic}</span>}
                      {selectedPost.user_email && <span className="text-blue-400">{selectedPost.user_email}</span>}
                      {selectedPost.char_count && <span>{selectedPost.char_count.toLocaleString()}자</span>}
                    </div>
                  </div>
                  <button onClick={() => setSelectedPost(null)} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 transition-colors flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                  {selectedPost.post_type === 'image' && selectedPost.content.startsWith('data:image') ? (
                    <div className="flex flex-col items-center gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedPost.content}
                        alt={selectedPost.title || '생성된 이미지'}
                        className="max-w-full rounded-xl shadow-md border border-slate-200"
                      />
                      <div className="flex gap-2">
                        <a
                          href={selectedPost.content}
                          download={`image-${selectedPost.id.slice(0, 8)}.png`}
                          className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                        >
                          다운로드
                        </a>
                      </div>
                      {selectedPost.topic && (
                        <p className="text-sm text-slate-500 text-center">프롬프트: {selectedPost.topic}</p>
                      )}
                    </div>
                  ) : (
                    <div
                      className="prose prose-slate prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedPost.content) }}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 전체 삭제 확인 모달 */}
          {showDeleteAllModal && (
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => { if (!deleteAllLoading) { setShowDeleteAllModal(false); setDeleteAllConfirmText(''); setDeleteAllError(''); } }}
            >
              <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-red-100">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-lg font-bold flex-shrink-0">!</div>
                    <h3 className="text-lg font-bold text-red-700">콘텐츠 전체 삭제</h3>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    <strong className="text-red-600">generated_posts</strong> 테이블의 모든 콘텐츠({stats ? <strong className="text-red-700">{stats.totalPosts}건</strong> : '전체'})가 영구 삭제됩니다.
                  </p>
                  <p className="text-xs text-slate-400 mt-2">
                    사용자 계정, 결제, 설정, 말투 학습 데이터는 영향 없습니다.
                  </p>
                </div>
                <div className="p-6">
                  {deleteAllError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-sm font-semibold text-red-700 mb-1">삭제 실패</p>
                      <p className="text-xs text-red-600">{deleteAllError}</p>
                    </div>
                  )}
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    확인하려면 <strong className="text-red-600 font-bold">전체삭제</strong>를 입력하세요
                  </label>
                  <input
                    type="text"
                    value={deleteAllConfirmText}
                    onChange={e => setDeleteAllConfirmText(e.target.value)}
                    placeholder="전체삭제"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400 transition-all"
                    disabled={deleteAllLoading}
                    autoFocus
                  />
                  <div className="flex gap-3 mt-5">
                    <button
                      onClick={() => { setShowDeleteAllModal(false); setDeleteAllConfirmText(''); setDeleteAllError(''); }}
                      disabled={deleteAllLoading}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                    >
                      취소
                    </button>
                    <button
                      onClick={onDeleteAll}
                      disabled={deleteAllConfirmText !== '전체삭제' || deleteAllLoading}
                      className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {deleteAllLoading ? (
                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />삭제 중...</>
                      ) : (
                        stats ? `${stats.totalPosts}건 영구 삭제` : '전체 삭제 실행'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
  );
}
