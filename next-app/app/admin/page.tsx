/**
 * Admin Page — "/admin" 경로
 *
 * 핵심 플로우: 비밀번호 로그인 → 통계 → 콘텐츠 관리 → 사용자 관리 → 말투 학습
 * Supabase RPC: get_admin_stats, get_all_generated_posts, delete_generated_post, delete_all_generated_posts
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { TEAM_DATA as TEAM_DATA_FALLBACK } from '../../lib/teamData';
import type { TeamData } from '../../lib/teamData';
import { getTeamDataFromDB, addHospital, deactivateHospital } from '../../lib/hospitalService';
import {
  getAllStyleProfiles,
  saveHospitalBlogUrl,
  crawlAndLearnHospitalStyle,
  resetHospitalCrawlData,
  getCrawledPosts,
  scoreCrawledPost,
  saveCrawledPost,
  updateCrawledPostScore,
  updateCrawledPostContent,
  crawlAndScoreAllHospitals,
  HospitalStyleProfile,
  LearnedWritingStyle,
} from '../../lib/styleService';
import { deleteAllGeneratedPosts, updateUserTeam, deleteUserProfile } from '../../lib/adminService';
import { ToastContainer, toast } from '../../components/Toast';
import type { CrawledPostScore, DBCrawledPost } from '../../lib/types';
import {
  type AdminStats, type GeneratedPost, type UserProfile,
  type Tab, type PostTypeFilter,
  POST_TYPE_LABELS, POST_TYPE_COLORS,
  getAdminStats, getAllPosts, deletePost, getUsers, formatDate,
} from './adminTypes';
import AdminContentsTab from './AdminContentsTab';
import AdminUsersTab from './AdminUsersTab';
import AdminStyleTab from './AdminStyleTab';
import AdminFeedbackTab from './AdminFeedbackTab';
import {
  listFeedbacks,
  deleteFeedback,
  analyzeFeedbacks,
  type InternalFeedback as FeedbackItem,
  type FeedbackAnalysis,
} from '../../lib/feedbackService';

// ── 메인 컴포넌트 ──

export default function AdminPage() {
  // 인증
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // 팀/병원 데이터 (DB 우선, fallback: teamData.ts)
  const [TEAM_DATA, setTeamData] = useState<TeamData[]>(TEAM_DATA_FALLBACK);
  const [showAddHospitalModal, setShowAddHospitalModal] = useState(false);
  const [newHospital, setNewHospital] = useState({ teamId: 1, name: '', manager: '', address: '', blogUrls: [''] });

  // 탭
  const [tab, setTab] = useState<Tab>('contents');

  // 통계
  const [stats, setStats] = useState<AdminStats | null>(null);

  // 콘텐츠
  const [posts, setPosts] = useState<GeneratedPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<PostTypeFilter>('all');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [selectedPost, setSelectedPost] = useState<GeneratedPost | null>(null);

  // 사용자
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // 콘텐츠 관리 — 팀/병원 필터 + 전체 삭제
  const [selectedContentTeam, setSelectedContentTeam] = useState<number | null>(null);
  const [selectedContentHospital, setSelectedContentHospital] = useState('');
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState('');
  // hospitalScrollRef — AdminContentsTab 내부에서 관리

  // 피드백 관리
  const [adminFeedbacks, setAdminFeedbacks] = useState<FeedbackItem[]>([]);
  const [feedbacksLoading, setFeedbacksLoading] = useState(false);
  const [feedbackAnalysis, setFeedbackAnalysis] = useState<FeedbackAnalysis | null>(null);
  const [feedbackAnalyzing, setFeedbackAnalyzing] = useState(false);
  const [feedbackAnalysisError, setFeedbackAnalysisError] = useState('');

  // 검색
  const [contentSearch, setContentSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [feedbackSearch, setFeedbackSearch] = useState('');

  // 콘텐츠 페이지네이션
  const [postsOffset, setPostsOffset] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(true);

  // 피드백 페이지네이션
  const [feedbackOffset, setFeedbackOffset] = useState(0);
  const [hasMoreFeedbacks, setHasMoreFeedbacks] = useState(true);

  // 말투 학습
  const [styleProfiles, setStyleProfiles] = useState<HospitalStyleProfile[]>([]);
  const [blogUrlInputs, setBlogUrlInputs] = useState<Record<string, string[]>>({});
  const [crawlingStatus, setCrawlingStatus] = useState<Record<string, { loading: boolean; progress: string; error?: string }>>({});
  const [selectedTeam, setSelectedTeam] = useState(TEAM_DATA.find(t => t.id === 1)?.id ?? TEAM_DATA[0].id);

  // 말투 탭 — 채점/글 관리
  const [dbPosts, setDbPosts] = useState<Record<string, DBCrawledPost[]>>({});
  const [expandedPosts, setExpandedPosts] = useState<Record<string, boolean>>({});
  const [scoringPost, setScoringPost] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<Record<string, string>>({});
  const [crawlAllStatus, setCrawlAllStatus] = useState<{ loading: boolean; progress: string }>({ loading: false, progress: '' });
  const [crawlAllIncludeStyle, setCrawlAllIncludeStyle] = useState(false);

  // 노출 순위 체크 (다중 키워드)
  const [rankCheckKeyword, setRankCheckKeyword] = useState<Record<string, string>>({});
  const [rankResults, setRankResults] = useState<Record<string, { keywords: Array<{ keyword: string; rank: number | null }>; checking: boolean }>>({});

  /** 단일 키워드 네이버 순위 체크 */
  const checkSingleRank = async (keyword: string, blogIds: string[]): Promise<number | null> => {
    try {
      const res = await fetch('/api/naver/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: keyword, display: 30, type: 'blog' }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { items?: Array<{ link?: string; title?: string; description?: string }> };
      const blogIdSet = new Set(blogIds.map(id => id.toLowerCase()));
      const kwNoSpace = keyword.replace(/\s+/g, '').toLowerCase();
      for (let i = 0; i < (data.items || []).length; i++) {
        const item = data.items![i];
        const match = (item.link || '').match(/blog\.naver\.com\/([^/?#]+)/);
        if (match && blogIdSet.has(match[1].toLowerCase())) {
          const clean = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, '').toLowerCase();
          const titleClean = clean(item.title || '');
          const descClean = clean(item.description || '');
          // 키워드가 제목에 연속 포함되면 매칭
          if (titleClean.includes(kwNoSpace)) return i + 1;
        }
      }
      return null;
    } catch { return null; }
  };

  /** 병원 주소에서 핵심 키워드 자동 생성 */
  const generateCoreKeywords = (hospitalName: string, address?: string): string[] => {
    const keywords: string[] = [];
    const locations: string[] = [];
    if (address) {
      const guMatch = address.match(/([가-힣]+[구군])\b/g);
      if (guMatch) locations.push(...guMatch.filter(g => !/^(서울|부산|대구|인천|광주|대전|울산|세종)$/.test(g)));
      const dongMatch = address.match(/([가-힣]+[동읍면])\b/g);
      if (dongMatch) locations.push(...dongMatch.filter(d => d.length >= 2 && d.length <= 6));
    }
    if (locations.length === 0) locations.push(hospitalName.replace(/치과.*|의원.*|병원.*/g, '').trim());
    const terms = ['치과', '임플란트', '치아교정', '스케일링', '신경치료'];
    const uniqueLocs = [...new Set(locations)].slice(0, 2);
    for (const loc of uniqueLocs) {
      for (const term of terms) keywords.push(`${loc} ${term}`);
    }
    return keywords.slice(0, 8);
  };

  /** 병원 순위 자동 체크 (크롤링 후 자동 호출) */
  const handleAutoRankCheck = useCallback(async (hospitalName: string, blogUrls: string[], address?: string) => {
    const blogIds = blogUrls
      .map(url => url.match(/blog\.naver\.com\/([^/?#]+)/)?.[1])
      .filter((id): id is string => !!id);
    if (blogIds.length === 0) return;

    setRankResults(prev => ({ ...prev, [hospitalName]: { keywords: [], checking: true } }));
    const coreKeywords = generateCoreKeywords(hospitalName, address);
    const results: Array<{ keyword: string; rank: number | null }> = [];

    for (let i = 0; i < coreKeywords.length; i++) {
      const rank = await checkSingleRank(coreKeywords[i], blogIds);
      results.push({ keyword: coreKeywords[i], rank });
      // rate limit
      if (i < coreKeywords.length - 1) await new Promise(r => setTimeout(r, 200));
    }

    // 수동 키워드: 쉼표로 분리, "치과/의원/병원"으로 끝나는 부분까지가 키워드
    const manualRaw = rankCheckKeyword[hospitalName]?.trim();
    if (manualRaw) {
      const manualKeywords = manualRaw.split(/[,，]/).map(k => k.trim()).filter(Boolean);
      for (const mk of manualKeywords) {
        // "을지로입구치과 턱관절" → "을지로입구치과"가 키워드
        const clinicMatch = mk.match(/^(.+?(?:치과|의원|병원|한의원|피부과|내과|외과|안과|이비인후과|정형외과|소아과))/);
        const keyword = clinicMatch ? clinicMatch[1] : mk;
        if (!coreKeywords.includes(keyword) && !results.some(r => r.keyword === keyword)) {
          const rank = await checkSingleRank(keyword, blogIds);
          results.unshift({ keyword, rank });
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }

    setRankResults(prev => ({ ...prev, [hospitalName]: { keywords: results, checking: false } }));
  }, [rankCheckKeyword]);

  // 세션 복원
  useEffect(() => {
    const saved = localStorage.getItem('ADMIN_AUTHENTICATED') || sessionStorage.getItem('ADMIN_AUTHENTICATED');
    const savedToken = localStorage.getItem('ADMIN_TOKEN') || sessionStorage.getItem('ADMIN_TOKEN');
    if (saved === 'true' && savedToken) {
      setAuthenticated(true);
      setPassword(savedToken);
    }
  }, []);

  // 팀/병원 데이터 DB 로드
  const loadTeamData = useCallback(async () => {
    const data = await getTeamDataFromDB();
    setTeamData(data);
  }, []);

  // 인증 후 데이터 로드
  useEffect(() => {
    if (!authenticated) return;
    loadStats();
    loadPosts();
    loadTeamData();
    loadUsers();
  }, [authenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // 필터 변경 시 재로드
  useEffect(() => {
    if (!authenticated) return;
    loadPosts();
  }, [typeFilter, hospitalFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // 팀/병원 chip 선택 → hospitalFilter 연동
  useEffect(() => {
    setHospitalFilter(selectedContentHospital);
  }, [selectedContentHospital]);

  // 사용자 탭 진입 시 로드
  useEffect(() => {
    if (tab === 'users' && authenticated && users.length === 0) {
      loadUsers();
    }
  }, [tab, authenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // 피드백 탭 진입 시 로드
  useEffect(() => {
    if (tab === 'feedback' && authenticated && adminFeedbacks.length === 0) {
      loadAdminFeedbacks();
    }
  }, [tab, authenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const getToken = useCallback(() => {
    return localStorage.getItem('ADMIN_TOKEN') || sessionStorage.getItem('ADMIN_TOKEN') || password;
  }, [password]);

  const loadStats = useCallback(async () => {
    const s = await getAdminStats(getToken());
    if (s) setStats(s);
  }, [getToken]);

  const loadPosts = useCallback(async (appendOffset?: number) => {
    setPostsLoading(true);
    const offset = appendOffset ?? 0;
    const p = await getAllPosts(getToken(), typeFilter, hospitalFilter, offset);
    if (appendOffset !== undefined && appendOffset > 0) {
      setPosts(prev => [...prev, ...p]);
    } else {
      setPosts(p);
      setPostsOffset(0);
    }
    setHasMorePosts(p.length >= 100);
    setPostsLoading(false);
  }, [getToken, typeFilter, hospitalFilter]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    const u = await getUsers();
    setUsers(u);
    setUsersLoading(false);
  }, []);

  // 피드백 로드
  const loadAdminFeedbacks = useCallback(async (appendOffset?: number) => {
    setFeedbacksLoading(true);
    const offset = appendOffset ?? 0;
    const list = await listFeedbacks(undefined, { limit: 50, offset });
    if (appendOffset !== undefined && appendOffset > 0) {
      setAdminFeedbacks(prev => [...prev, ...list]);
    } else {
      setAdminFeedbacks(list);
      setFeedbackOffset(0);
    }
    setHasMoreFeedbacks(list.length >= 50);
    setFeedbacksLoading(false);
  }, []);

  // 사용자 팀 변경
  const handleUserTeamChange = async (userId: string, teamId: number | null) => {
    const result = await updateUserTeam(userId, teamId);
    if (result.success) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, team_id: teamId } : u));
      toast.success('팀 변경 완료');
    } else {
      toast.error(result.error || '팀 변경 실패');
    }
  };

  // 사용자 삭제
  const handleUserDelete = async (userId: string, userName: string) => {
    if (!confirm(`"${userName || '이름 없음'}" 사용자의 프로필을 삭제하시겠습니까?`)) return;
    const result = await deleteUserProfile(userId);
    if (result.success) {
      setUsers(prev => prev.filter(u => u.id !== userId));
      toast.success('사용자 프로필 삭제 완료');
    } else {
      toast.error(result.error || '삭제 실패');
    }
  };

  const handleAdminFeedbackDelete = async (id: string) => {
    if (!confirm('이 피드백을 삭제하시겠습니까?')) return;
    const ok = await deleteFeedback(id);
    if (ok) {
      setAdminFeedbacks(prev => prev.filter(f => f.id !== id));
      toast.success('피드백 삭제 완료');
    } else {
      toast.error('삭제 실패');
    }
  };

  const handleAdminFeedbackAnalyze = async () => {
    if (feedbackAnalyzing) return;
    setFeedbackAnalyzing(true);
    setFeedbackAnalysisError('');
    const result = await analyzeFeedbacks(adminFeedbacks);
    if (result.success && result.analysis) {
      setFeedbackAnalysis(result.analysis);
    } else {
      setFeedbackAnalysisError(result.error || '분석 실패');
    }
    setFeedbackAnalyzing(false);
  };

  // 말투 프로파일 로드
  const loadStyleProfiles = useCallback(async () => {
    const profiles = await getAllStyleProfiles();
    setStyleProfiles(profiles);

    // 1. teamData에서 기본 URL 채우기
    const urlMap: Record<string, string[]> = {};
    for (const team of TEAM_DATA) {
      for (const h of team.hospitals) {
        const baseName = h.name.replace(/ \(.*\)$/, '');
        if (h.naverBlogUrls && h.naverBlogUrls.length > 0 && !urlMap[baseName]) {
          urlMap[baseName] = [...h.naverBlogUrls];
        }
      }
    }

    // 2. DB 프로필의 URL로 덮어쓰기 (DB가 우선)
    profiles.forEach(p => {
      if (p.naver_blog_url) {
        urlMap[p.hospital_name] = p.naver_blog_url.split(',').map(u => u.trim()).filter(Boolean);
      }
    });

    // 3. 사용자가 수정 중인 항목은 유지
    setBlogUrlInputs(prev => {
      const merged: Record<string, string[]> = { ...urlMap };
      for (const [key, val] of Object.entries(prev)) {
        if (val.length > 0 && val.some(u => u.trim())) {
          merged[key] = val;
        }
      }
      return merged;
    });
  }, [TEAM_DATA]); // eslint-disable-line react-hooks/exhaustive-deps

  // 말투 탭 진입 시 로드
  useEffect(() => {
    if (tab === 'style' && authenticated) {
      loadStyleProfiles();
    }
  }, [tab, authenticated, loadStyleProfiles]);

  // URL 저장 (크롤링 없이)
  const handleSaveBlogUrl = useCallback(async (hospitalName: string, teamId: number) => {
    const urls = blogUrlInputs[hospitalName] || [];
    const validUrls = urls.filter(u => u.trim() && u.includes('blog.naver.com'));
    if (validUrls.length === 0) {
      toast.warning('네이버 블로그 URL을 입력해주세요. (blog.naver.com/...)');
      return;
    }
    try {
      await saveHospitalBlogUrl(hospitalName, teamId, validUrls.join(','));
      toast.success(`URL ${validUrls.length}개 저장 완료!`);
      loadStyleProfiles();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'URL 저장 실패');
    }
  }, [blogUrlInputs, loadStyleProfiles]);

  // 크롤링 + 학습
  const handleCrawlAndLearn = useCallback(async (hospitalName: string, teamId: number) => {
    const urls = blogUrlInputs[hospitalName] || [];
    const validUrls = urls.filter(u => u.trim() && u.includes('blog.naver.com'));
    if (validUrls.length === 0) {
      toast.warning('먼저 네이버 블로그 URL을 입력해주세요.');
      return;
    }

    setCrawlingStatus(prev => ({
      ...prev,
      [hospitalName]: { loading: true, progress: `준비 중... (${validUrls.length}개 URL)` },
    }));

    try {
      await crawlAndLearnHospitalStyle(hospitalName, teamId, validUrls, (msg) => {
        setCrawlingStatus(prev => ({
          ...prev,
          [hospitalName]: { loading: true, progress: msg },
        }));
      });
      setCrawlingStatus(prev => ({
        ...prev,
        [hospitalName]: { loading: false, progress: '학습 완료! 노출 순위 체크 중...' },
      }));
      loadStyleProfiles();
      // 자동 노출 순위 체크
      const team = TEAM_DATA.find(t => t.hospitals.some(h => h.name.replace(/ \(.*\)$/, '') === hospitalName));
      const hospital = team?.hospitals.find(h => h.name.replace(/ \(.*\)$/, '') === hospitalName);
      handleAutoRankCheck(hospitalName, validUrls, hospital?.address).then(() => {
        setCrawlingStatus(prev => ({
          ...prev,
          [hospitalName]: { loading: false, progress: '학습 + 순위 체크 완료!' },
        }));
      });
    } catch (err: unknown) {
      const errMsg = (err as Error).message || '알 수 없는 오류';
      setCrawlingStatus(prev => ({
        ...prev,
        [hospitalName]: { loading: false, progress: '', error: errMsg },
      }));
    }
  }, [blogUrlInputs, loadStyleProfiles]);

  // 초기화
  const handleResetCrawlData = useCallback(async (hospitalName: string) => {
    if (!confirm(`"${hospitalName}"의 크롤링 데이터(수집 글 + 말투 프로파일)를 전부 삭제하시겠습니까?`)) return;
    try {
      const result = await resetHospitalCrawlData(hospitalName);
      setCrawlingStatus(prev => {
        const next = { ...prev };
        delete next[hospitalName];
        return next;
      });
      loadStyleProfiles();
      if (result.errors.length > 0) {
        toast.warning(`초기화 일부 실패: ${result.errors.join(', ')}`);
      } else {
        toast.success(`${hospitalName}: 글 ${result.deletedPosts}개 삭제${result.profileDeleted ? ', 프로파일 삭제' : ''} 완료`);
      }
    } catch (err: unknown) {
      toast.error(`초기화 실패: ${(err as Error).message}`);
    }
  }, [loadStyleProfiles]);

  // ── 로그인 ──

  const handleLogin = async () => {
    if (!password.trim()) return;
    setLoginLoading(true);
    setLoginError('');

    const s = await getAdminStats(password.trim());
    if (s) {
      sessionStorage.setItem('ADMIN_AUTHENTICATED', 'true');
      sessionStorage.setItem('ADMIN_TOKEN', password.trim());
      try { localStorage.setItem('winaid_admin', 'true'); } catch { /* ignore */ }
      if (rememberMe) {
        localStorage.setItem('ADMIN_AUTHENTICATED', 'true');
        localStorage.setItem('ADMIN_TOKEN', password.trim());
      }
      setAuthenticated(true);
      setStats(s);
    } else {
      setLoginError('비밀번호가 올바르지 않습니다.');
    }
    setLoginLoading(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('ADMIN_AUTHENTICATED');
    sessionStorage.removeItem('ADMIN_TOKEN');
    sessionStorage.removeItem('ADMIN_PERSIST');
    localStorage.removeItem('ADMIN_AUTHENTICATED');
    localStorage.removeItem('ADMIN_TOKEN');
    localStorage.removeItem('winaid_admin');
    // legacy cleanup
    localStorage.removeItem('ADMIN_PERSIST');
    localStorage.removeItem('ADMIN_TOKEN');
    setAuthenticated(false);
    setPassword('');
    setStats(null);
    setPosts([]);
    setUsers([]);
  };

  // ── 삭제 ──

  const handleDelete = async (postId: string) => {
    if (!confirm('이 콘텐츠를 삭제하시겠습니까?')) return;
    const ok = await deletePost(getToken(), postId);
    if (ok) {
      setPosts(prev => prev.filter(p => p.id !== postId));
      if (selectedPost?.id === postId) setSelectedPost(null);
      loadStats();
    } else {
      toast.error('삭제에 실패했습니다.');
    }
  };

  // ── 전체 삭제 (root deleteAllGeneratedPosts 동일) ──
  const handleDeleteAll = async () => {
    if (deleteAllConfirmText !== '전체삭제') return;
    if (deleteAllLoading) return;
    setDeleteAllLoading(true);
    setDeleteAllError('');
    try {
      const result = await deleteAllGeneratedPosts(getToken());
      if (result.success) {
        setPosts([]);
        setShowDeleteAllModal(false);
        setDeleteAllConfirmText('');
        setDeleteAllError('');
        loadStats();
      } else {
        setDeleteAllError(result.error || '삭제에 실패했습니다. 잠시 후 다시 시도하세요.');
      }
    } catch (err: unknown) {
      setDeleteAllError(`삭제 중 오류가 발생했습니다: ${(err as Error).message || '네트워크 오류'}`);
    } finally {
      setDeleteAllLoading(false);
    }
  };

  // ── 크롤링 글 로드 (DB) ──
  const loadDbPosts = useCallback(async (hospitalName: string) => {
    const posts = await getCrawledPosts(hospitalName);
    setDbPosts(prev => ({ ...prev, [hospitalName]: posts }));
  }, []);

  // ── 글 채점 (root handleScorePost 동일) ──
  const handleScorePost = async (post: DBCrawledPost) => {
    if (scoringPost) return;
    setScoringPost(post.id);
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
      const score = await scoreCrawledPost(dbPost.content);
      await updateCrawledPostScore(dbPost.id, score);
      // DB 갱신 반영
      setDbPosts(prev => {
        const list = prev[dbPost.hospital_name] || [];
        return {
          ...prev,
          [dbPost.hospital_name]: list.map(p =>
            p.id === dbPost.id
              ? { ...p, ...score, scored_at: new Date().toISOString() }
              : p,
          ),
        };
      });
    } catch (err: unknown) {
      toast.error(`채점 실패: ${(err as Error).message}`);
    } finally {
      setScoringPost(null);
    }
  };

  // ── 수정본 저장 ──
  const handleSaveContent = async (post: DBCrawledPost) => {
    const content = editingContent[post.id];
    if (!content) return;
    try {
      await updateCrawledPostContent(post.id, content);
      setDbPosts(prev => {
        const list = prev[post.hospital_name] || [];
        return {
          ...prev,
          [post.hospital_name]: list.map(p =>
            p.id === post.id ? { ...p, corrected_content: content } : p,
          ),
        };
      });
      setEditingContent(prev => {
        const next = { ...prev };
        delete next[post.id];
        return next;
      });
      toast.success('수정본 저장 완료');
    } catch (err: unknown) {
      toast.error(`저장 실패: ${(err as Error).message}`);
    }
  };

  // ── 오타 수정 적용 ──
  const applyCorrection = (postId: string, original: string, correction: string) => {
    setEditingContent(prev => {
      const current = prev[postId] || '';
      if (!current) return prev;
      return { ...prev, [postId]: current.replace(new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), correction) };
    });
  };

  // ── 전체 병원 크롤링 + 채점 ──
  const handleCrawlAllHospitals = async () => {
    if (crawlAllStatus.loading) return;
    const modeLabel = crawlAllIncludeStyle ? '크롤링 + 채점 + 말투 분석' : '크롤링 + 채점';
    setCrawlAllStatus({ loading: true, progress: `${modeLabel} 시작 중...` });
    try {
      await crawlAndScoreAllHospitals(
        (msg, done, total) => {
          setCrawlAllStatus({ loading: true, progress: `[${done + 1}/${total}] ${msg}` });
        },
        { includeStyleAnalysis: crawlAllIncludeStyle },
      );
      setCrawlAllStatus({ loading: true, progress: '채점 완료! 전체 노출 순위 체크 중...' });
      loadStyleProfiles();
      // 전체 병원 자동 순위 체크
      let rankDone = 0;
      const rankTotal = TEAM_DATA.reduce((sum, t) => sum + t.hospitals.filter(h => h.naverBlogUrls?.some(Boolean)).length, 0);
      for (const team of TEAM_DATA) {
        for (const h of team.hospitals) {
          const baseName = h.name.replace(/ \(.*\)$/, '');
          const urls = h.naverBlogUrls?.filter(Boolean) || [];
          if (urls.length > 0) {
            try {
              rankDone++;
              setCrawlAllStatus({ loading: true, progress: `순위 체크 [${rankDone}/${rankTotal}] ${baseName}` });
              await handleAutoRankCheck(baseName, urls, h.address);
            } catch {
              // 개별 순위 체크 실패 → 스킵
            }
            await new Promise(r => setTimeout(r, 300));
          }
        }
      }
      setCrawlAllStatus({ loading: false, progress: '전체 크롤링 + 순위 체크 완료!' });
    } catch (err: unknown) {
      setCrawlAllStatus({ loading: false, progress: `오류: ${(err as Error).message}` });
    }
  };

  // formatDate — adminTypes.ts에서 import

  // ── Supabase 미설정 ──

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center p-8 bg-amber-50 rounded-xl border border-amber-200 max-w-md">
          <p className="text-amber-700 font-semibold mb-2">Supabase 미설정</p>
          <p className="text-sm text-amber-600">.env.local에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 추가하세요.</p>
        </div>
      </div>
    );
  }

  // ── 로그인 화면 ──

  if (!authenticated) {
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

          <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 p-8">
            {loginError && <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{loginError}</div>}
            <div className="mb-4">
              <label className="text-sm font-medium text-slate-600 mb-1.5 block">비밀번호</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="관리자 비밀번호"
                  className="w-full px-4 py-3 pr-12 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                >
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
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
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

  // ── 병원 목록 (필터용) ──

  const allHospitals = TEAM_DATA.flatMap(t => t.hospitals.map(h => h.name));

  // ── 대시보드 ──

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8">
      <ToastContainer />
      <div className="max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Admin Dashboard</h1>
          <p className="text-slate-400 text-sm">WINAID 관리자</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/blog" className="px-4 py-2 bg-white border border-slate-200 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm">앱으로 이동</a>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-white border border-red-200 text-red-500 font-medium rounded-lg hover:bg-red-50 transition-colors text-sm"
          >
            로그아웃
          </button>
        </div>
      </div>

      {/* 통계 카드 — 상단 4열 */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          {[
            { label: '블로그', value: stats.blogCount, color: 'bg-sky-50 text-sky-600' },
            { label: '카드뉴스', value: stats.cardNewsCount, color: 'bg-violet-50 text-violet-600' },
            { label: '보도자료', value: stats.pressReleaseCount, color: 'bg-emerald-50 text-emerald-600' },
            { label: '이미지', value: stats.imageCount, color: 'bg-amber-50 text-amber-600' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-xl p-4 border border-slate-100">
              <div className="text-2xl font-bold text-slate-800">{s.value.toLocaleString()}</div>
              <div className={`text-xs font-medium mt-1 inline-block px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 통계 카드 — 하단 5열 */}
      {stats && (
        <div className="grid grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {[
            { label: '병원 수', value: stats.uniqueHospitals },
            { label: '사용자 수', value: stats.uniqueUsers },
            { label: '오늘', value: stats.postsToday },
            { label: '이번 주', value: stats.postsThisWeek },
            { label: '이번 달', value: stats.postsThisMonth },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-xl p-3 border border-slate-100 text-center">
              <div className="text-lg font-bold text-slate-700">{s.value}</div>
              <div className="text-[11px] text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 메인 탭 */}
      <div className="flex bg-white border border-slate-200 rounded-xl p-1 mb-5 w-fit shadow-sm">
        {([
          { key: 'contents' as Tab, label: '콘텐츠 관리', activeClass: 'bg-slate-800 text-white shadow-sm' },
          { key: 'style' as Tab, label: '말투 학습', activeClass: 'bg-violet-600 text-white shadow-sm' },
          { key: 'users' as Tab, label: '사용자 관리', activeClass: 'bg-emerald-600 text-white shadow-sm' },
          { key: 'feedback' as Tab, label: '피드백 관리', activeClass: 'bg-blue-600 text-white shadow-sm' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
              tab === t.key ? t.activeClass : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>


      {/* ── 콘텐츠 관리 탭 — AdminContentsTab으로 분리 ── */}
      {tab === 'contents' && (
        <AdminContentsTab
          posts={posts}
          postsLoading={postsLoading}
          contentSearch={contentSearch}
          setContentSearch={setContentSearch}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          selectedPost={selectedPost}
          userNameMap={Object.fromEntries(users.filter(u => u.email).map(u => [u.email!, u.full_name || u.email!]))}
          setSelectedPost={setSelectedPost}
          TEAM_DATA={TEAM_DATA}
          selectedContentTeam={selectedContentTeam}
          setSelectedContentTeam={setSelectedContentTeam}
          selectedContentHospital={selectedContentHospital}
          setSelectedContentHospital={setSelectedContentHospital}
          hasMorePosts={hasMorePosts}
          stats={stats}
          onLoadMore={() => { const next = postsOffset + 100; setPostsOffset(next); loadPosts(next); }}
          onRefresh={() => { loadStats(); loadPosts(); }}
          onDelete={handleDelete}
          showDeleteAllModal={showDeleteAllModal}
          setShowDeleteAllModal={setShowDeleteAllModal}
          deleteAllConfirmText={deleteAllConfirmText}
          setDeleteAllConfirmText={setDeleteAllConfirmText}
          deleteAllLoading={deleteAllLoading}
          deleteAllError={deleteAllError}
          setDeleteAllError={setDeleteAllError}
          onDeleteAll={handleDeleteAll}
        />
      )}

      {/* ── 사용자 관리 탭 — AdminUsersTab으로 분리 ── */}
      {tab === 'users' && (
        <AdminUsersTab
          users={users}
          usersLoading={usersLoading}
          userSearch={userSearch}
          setUserSearch={setUserSearch}
          TEAM_DATA={TEAM_DATA}
          onTeamChange={handleUserTeamChange}
          onDelete={handleUserDelete}
          onRefresh={loadUsers}
        />
      )}

      {/* ── 말투 학습 탭 — AdminStyleTab으로 분리 ── */}
      {tab === 'style' && (
        <AdminStyleTab
          TEAM_DATA={TEAM_DATA}
          selectedTeam={selectedTeam}
          setSelectedTeam={setSelectedTeam}
          styleProfiles={styleProfiles}
          blogUrlInputs={blogUrlInputs}
          setBlogUrlInputs={setBlogUrlInputs}
          crawlingStatus={crawlingStatus}
          dbPosts={dbPosts}
          expandedPosts={expandedPosts}
          setExpandedPosts={setExpandedPosts}
          scoringPost={scoringPost}
          editingContent={editingContent}
          setEditingContent={setEditingContent}
          crawlAllStatus={crawlAllStatus}
          crawlAllIncludeStyle={crawlAllIncludeStyle}
          setCrawlAllIncludeStyle={setCrawlAllIncludeStyle}
          showAddHospitalModal={showAddHospitalModal}
          setShowAddHospitalModal={setShowAddHospitalModal}
          onSaveBlogUrl={handleSaveBlogUrl}
          onCrawlAndLearn={handleCrawlAndLearn}
          onResetCrawlData={handleResetCrawlData}
          onLoadDbPosts={loadDbPosts}
          onScorePost={handleScorePost}
          onSaveContent={handleSaveContent}
          applyCorrection={applyCorrection}
          onCrawlAllHospitals={handleCrawlAllHospitals}
          onDeactivateHospital={async (name) => {
            const result = await deactivateHospital(name);
            if (result.success) { loadTeamData(); toast.success(`${name} 제거됨`); }
            else toast.error(result.error || '제거 실패');
          }}
          newHospital={newHospital}
          setNewHospital={setNewHospital}
          onAddHospital={async () => {
            const result = await addHospital(newHospital.teamId, newHospital.name, newHospital.manager, newHospital.address, newHospital.blogUrls);
            if (result.success) { setShowAddHospitalModal(false); loadTeamData(); toast.success(`${newHospital.name} 추가 완료`); }
            else toast.error(result.error || '추가 실패');
          }}
        />
      )}
      {/* ── 피드백 관리 탭 — AdminFeedbackTab으로 분리 ── */}
      {tab === 'feedback' && (
        <AdminFeedbackTab
          feedbacks={adminFeedbacks}
          feedbacksLoading={feedbacksLoading}
          feedbackSearch={feedbackSearch}
          setFeedbackSearch={setFeedbackSearch}
          feedbackAnalysis={feedbackAnalysis}
          feedbackAnalyzing={feedbackAnalyzing}
          feedbackAnalysisError={feedbackAnalysisError}
          hasMoreFeedbacks={hasMoreFeedbacks}
          onDelete={handleAdminFeedbackDelete}
          onAnalyze={handleAdminFeedbackAnalyze}
          onLoadMore={() => {
            const nextOffset = feedbackOffset + 50;
            setFeedbackOffset(nextOffset);
            loadAdminFeedbacks(nextOffset);
          }}
          onRefresh={() => loadAdminFeedbacks()}
        />
      )}

      </div>
    </div>
  );
}
