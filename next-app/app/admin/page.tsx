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
import { sanitizeHtml } from '../../lib/sanitizeHtml';
import type { CrawledPostScore, DBCrawledPost } from '../../lib/types';
import {
  listFeedbacks,
  deleteFeedback,
  analyzeFeedbacks,
  type InternalFeedback as FeedbackItem,
  type FeedbackAnalysis,
} from '../../lib/feedbackService';

// ── 타입 ──

interface AdminStats {
  totalPosts: number;
  blogCount: number;
  cardNewsCount: number;
  pressReleaseCount: number;
  imageCount: number;
  uniqueHospitals: number;
  uniqueUsers: number;
  postsToday: number;
  postsThisWeek: number;
  postsThisMonth: number;
}

interface GeneratedPost {
  id: string;
  post_type: string;
  title: string;
  content: string;
  hospital_name: string | null;
  category: string | null;
  user_email: string | null;
  topic: string | null;
  char_count: number | null;
  created_at: string;
}

interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  team_id: number | null;
  created_at: string;
}

type Tab = 'contents' | 'users' | 'style' | 'feedback';
type PostTypeFilter = 'all' | 'blog' | 'card_news' | 'press_release' | 'image';

const POST_TYPE_LABELS: Record<string, string> = {
  blog: '블로그',
  card_news: '카드뉴스',
  press_release: '보도자료',
  image: '이미지',
};

const POST_TYPE_COLORS: Record<string, string> = {
  blog: 'bg-blue-100 text-blue-700',
  card_news: 'bg-pink-100 text-pink-700',
  press_release: 'bg-amber-100 text-amber-700',
  image: 'bg-emerald-100 text-emerald-700',
};

// ── RPC 호출 헬퍼 ──

async function getAdminStats(token: string): Promise<AdminStats | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_admin_stats', { admin_password: token });
  if (error || !data || (Array.isArray(data) && data.length === 0)) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    totalPosts: row.total_posts ?? 0,
    blogCount: row.blog_count ?? 0,
    cardNewsCount: row.card_news_count ?? 0,
    pressReleaseCount: row.press_release_count ?? 0,
    imageCount: row.image_count ?? 0,
    uniqueHospitals: row.unique_hospitals ?? 0,
    uniqueUsers: row.unique_users ?? 0,
    postsToday: row.posts_today ?? 0,
    postsThisWeek: row.posts_this_week ?? 0,
    postsThisMonth: row.posts_this_month ?? 0,
  };
}

async function getAllPosts(
  token: string,
  filterType?: string,
  filterHospital?: string,
  offset = 0,
): Promise<GeneratedPost[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_all_generated_posts', {
    admin_password: token,
    filter_post_type: filterType && filterType !== 'all' ? filterType : null,
    filter_hospital: filterHospital || null,
    limit_count: 100,
    offset_count: offset,
  });
  if (error || !data) return [];
  return data as GeneratedPost[];
}

async function deletePost(token: string, postId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('delete_generated_post', {
    admin_password: token,
    post_id: postId,
  });
  if (error) return false;
  return !!data;
}

async function getUsers(): Promise<UserProfile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, team_id, created_at')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as UserProfile[];
}

// ── 메인 컴포넌트 ──

export default function AdminPage() {
  // 인증
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

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
  const hospitalScrollRef = useRef<HTMLDivElement>(null);

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
        body: JSON.stringify({ query: keyword, display: 30 }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { items?: Array<{ link?: string }> };
      const blogIdSet = new Set(blogIds.map(id => id.toLowerCase()));
      for (let i = 0; i < (data.items || []).length; i++) {
        const match = (data.items![i].link || '').match(/blog\.naver\.com\/([^/?#]+)/);
        if (match && blogIdSet.has(match[1].toLowerCase())) return i + 1;
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

    // 수동 키워드도 있으면 추가
    const manual = rankCheckKeyword[hospitalName]?.trim();
    if (manual && !coreKeywords.includes(manual)) {
      const rank = await checkSingleRank(manual, blogIds);
      results.unshift({ keyword: manual, rank });
    }

    setRankResults(prev => ({ ...prev, [hospitalName]: { keywords: results, checking: false } }));
  }, [rankCheckKeyword]);

  // 세션 복원
  useEffect(() => {
    const saved = sessionStorage.getItem('ADMIN_AUTHENTICATED');
    const savedToken = sessionStorage.getItem('ADMIN_TOKEN');
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
    return sessionStorage.getItem('ADMIN_TOKEN') || password;
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
    const list = await listFeedbacks('dashboard', { limit: 50, offset });
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
      if (rememberMe) {
        sessionStorage.setItem('ADMIN_PERSIST', 'true');
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
      for (const team of TEAM_DATA) {
        for (const h of team.hospitals) {
          const baseName = h.name.replace(/ \(.*\)$/, '');
          const urls = h.naverBlogUrls?.filter(Boolean) || [];
          if (urls.length > 0) {
            await handleAutoRankCheck(baseName, urls, h.address);
            await new Promise(r => setTimeout(r, 300));
          }
        }
      }
      setCrawlAllStatus({ loading: false, progress: '전체 크롤링 + 순위 체크 완료!' });
    } catch (err: unknown) {
      setCrawlAllStatus({ loading: false, progress: `오류: ${(err as Error).message}` });
    }
  };

  // ── 시간 포맷 ──

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

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

      {/* ── 콘텐츠 관리 탭 ── */}
      {tab === 'contents' && (
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
                  onClick={() => { loadStats(); loadPosts(); }}
                  disabled={postsLoading}
                  className="px-3 py-1.5 bg-slate-100 text-slate-600 font-medium rounded-lg hover:bg-slate-200 transition-colors text-xs disabled:opacity-50"
                >
                  {postsLoading ? '로딩...' : '새로고침'}
                </button>
                {posts.length > 0 && (
                  <button
                    onClick={() => { setDeleteAllError(''); setShowDeleteAllModal(true); }}
                    className="px-3 py-1.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors text-xs"
                  >
                    전체 삭제
                  </button>
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
                            <button onClick={() => handleDelete(post.id)} className="px-3 py-1.5 bg-red-50 text-red-500 font-medium rounded-lg hover:bg-red-100 transition-colors text-xs">삭제</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {hasMorePosts && !q && (
                    <button
                      onClick={() => {
                        const nextOffset = postsOffset + 100;
                        setPostsOffset(nextOffset);
                        loadPosts(nextOffset);
                      }}
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
                      onClick={handleDeleteAll}
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
      )}

      {/* ── 사용자 관리 탭 ── */}
      {tab === 'users' && (() => {
        const uq = userSearch.trim().toLowerCase();
        const filteredUsers = uq
          ? users.filter(u =>
              (u.full_name?.toLowerCase().includes(uq)) ||
              (u.email?.toLowerCase().includes(uq))
            )
          : users;
        return (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-800">가입 사용자 목록</h2>
                  <p className="text-xs text-slate-400 mt-0.5">총 {users.length}명{uq && ` · 검색 ${filteredUsers.length}명`}</p>
                </div>
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="이름·이메일 검색"
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg w-44 focus:outline-none focus:border-emerald-400 transition-colors"
                />
              </div>
              <button
                onClick={loadUsers}
                disabled={usersLoading}
                className="px-3 py-1.5 bg-slate-100 text-slate-600 font-medium rounded-lg hover:bg-slate-200 transition-colors text-xs disabled:opacity-50"
              >
                {usersLoading ? '로딩...' : '새로고침'}
              </button>
            </div>
            {usersLoading ? (
              <div className="py-16 text-center text-slate-400 text-sm">불러오는 중...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-16 text-center">
                <div className="text-3xl mb-2 opacity-30">👤</div>
                <p className="text-slate-400 text-sm">{uq ? '검색 결과가 없습니다.' : '가입한 사용자가 없습니다.'}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredUsers.map(user => {
                  const team = TEAM_DATA.find(t => t.id === user.team_id);
                  return (
                    <div key={user.id} className="px-5 py-4 flex items-center gap-4 group">
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
                      <select
                        value={user.team_id ?? ''}
                        onChange={e => handleUserTeamChange(user.id, e.target.value ? Number(e.target.value) : null)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-blue-400 transition-colors flex-shrink-0"
                      >
                        <option value="">팀 없음</option>
                        {TEAM_DATA.map(t => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                      <div className="text-xs text-slate-400 flex-shrink-0">
                        {formatDate(user.created_at)}
                      </div>
                      <button
                        onClick={() => handleUserDelete(user.id, user.full_name || user.email || '')}
                        className="text-[10px] text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                      >
                        삭제
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* ── 말투 학습 탭 ── */}
      {tab === 'style' && (
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
                  onClick={handleCrawlAllHospitals}
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
                              onClick={() => handleSaveBlogUrl(baseName, team.id)}
                              disabled={status?.loading || !hasAnyUrl}
                              className="px-3 py-2 text-xs font-semibold bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40 whitespace-nowrap"
                            >URL 저장</button>
                            <button
                              onClick={() => handleCrawlAndLearn(baseName, team.id)}
                              disabled={status?.loading || !hasAnyUrl}
                              className="px-3 py-2 text-xs font-bold bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-40 whitespace-nowrap"
                            >
                              {status?.loading ? '학습 중...' : '전체 크롤링'}
                            </button>
                            {(profile || (dbPosts[baseName] && dbPosts[baseName].length > 0)) && (
                              <button
                                onClick={() => handleResetCrawlData(baseName)}
                                disabled={status?.loading}
                                className="px-3 py-2 text-xs font-semibold bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-40 whitespace-nowrap"
                              >
                                초기화
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                if (!confirm(`"${baseName}" 병원을 목록에서 제거하시겠습니까?`)) return;
                                const result = await deactivateHospital(baseName);
                                if (result.success) { loadTeamData(); toast.success(`${baseName} 제거됨`); }
                                else toast.error(result.error || '제거 실패');
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
                                    loadDbPosts(baseName);
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
                                                        onClick={() => handleScorePost(post)}
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
      )}

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
                  onClick={async () => {
                    const result = await addHospital(
                      newHospital.teamId,
                      newHospital.name,
                      newHospital.manager,
                      newHospital.address,
                      newHospital.blogUrls,
                    );
                    if (result.success) {
                      setShowAddHospitalModal(false);
                      loadTeamData();
                      toast.success(`${newHospital.name} 추가 완료`);
                    } else {
                      toast.error(result.error || '추가 실패');
                    }
                  }}
                  disabled={!newHospital.name.trim()}
                  className="flex-1 py-2.5 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >추가</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── 피드백 관리 탭 ── */}
      {tab === 'feedback' && (() => {
        const fq = feedbackSearch.trim().toLowerCase();
        const filteredFeedbacks = fq
          ? adminFeedbacks.filter(f =>
              f.content.toLowerCase().includes(fq) ||
              f.user_name.toLowerCase().includes(fq)
            )
          : adminFeedbacks;
        return (
        <div className="space-y-4">
          {/* 헤더 + 분석 버튼 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-800">피드백 목록</h2>
              {adminFeedbacks.length > 0 && (
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {adminFeedbacks.length}건{fq && ` · 검색 ${filteredFeedbacks.length}건`}
                </span>
              )}
              <input
                type="text"
                value={feedbackSearch}
                onChange={e => setFeedbackSearch(e.target.value)}
                placeholder="내용·작성자 검색"
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg w-44 focus:outline-none focus:border-blue-400 transition-colors"
              />
              <button
                onClick={() => loadAdminFeedbacks()}
                disabled={feedbacksLoading}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {feedbacksLoading ? '로딩...' : '새로고침'}
              </button>
            </div>
            <button
              onClick={handleAdminFeedbackAnalyze}
              disabled={feedbackAnalyzing || adminFeedbacks.length === 0}
              className="px-4 py-2 text-xs font-bold bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
            >
              {feedbackAnalyzing ? (
                <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />분석 중...</>
              ) : (
                <>AI 피드백 분석</>
              )}
            </button>
          </div>

          {/* AI 분석 결과 */}
          {feedbackAnalysisError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-xs text-red-600">{feedbackAnalysisError}</p>
            </div>
          )}
          {feedbackAnalysis && (
            <div className="space-y-3">
              <div className="p-4 bg-violet-50 border border-violet-200 rounded-2xl">
                <p className="text-xs font-bold text-violet-700 mb-1">전체 트렌드</p>
                <p className="text-sm text-violet-800 leading-relaxed">{feedbackAnalysis.overall}</p>
              </div>
              {feedbackAnalysis.clusters.map((cluster, idx) => (
                <div key={idx} className="p-4 bg-white border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      cluster.priority === 'high' ? 'bg-red-100 text-red-700'
                      : cluster.priority === 'medium' ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-600'
                    }`}>
                      {cluster.priority === 'high' ? '긴급' : cluster.priority === 'medium' ? '보통' : '낮음'}
                    </span>
                    <span className="text-xs font-bold text-slate-800">{cluster.theme}</span>
                    <span className="text-[10px] text-slate-400 ml-auto">{cluster.count}건</span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed mb-2">{cluster.summary}</p>
                  {cluster.examples.length > 0 && (
                    <div className="space-y-1">
                      {cluster.examples.map((ex, ei) => (
                        <div key={ei} className="text-[11px] text-slate-500 pl-2.5 border-l-2 border-slate-200 leading-relaxed">{ex}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 피드백 목록 */}
          {feedbacksLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-blue-100 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : filteredFeedbacks.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <p className="text-sm text-slate-400">{fq ? '검색 결과가 없습니다.' : '아직 피드백이 없습니다.'}</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="divide-y divide-slate-100">
                {filteredFeedbacks.map(fb => (
                  <div key={fb.id} className="px-5 py-3.5 flex gap-3 group hover:bg-slate-50/50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      {fb.user_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-slate-700">{fb.user_name}</span>
                        <span className="text-[10px] text-slate-400">{fb.user_id === 'anonymous' ? '(비로그인)' : fb.user_id.slice(0, 8)}</span>
                        <span className="text-[10px] text-slate-400">{new Date(fb.created_at).toLocaleString('ko-KR')}</span>
                      </div>
                      <p className="text-sm text-slate-600 whitespace-pre-wrap break-words leading-relaxed">{fb.content}</p>
                    </div>
                    <button
                      onClick={() => handleAdminFeedbackDelete(fb.id)}
                      className="text-[10px] text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 self-center"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
              {hasMoreFeedbacks && !fq && (
                <button
                  onClick={() => {
                    const nextOffset = feedbackOffset + 50;
                    setFeedbackOffset(nextOffset);
                    loadAdminFeedbacks(nextOffset);
                  }}
                  disabled={feedbacksLoading}
                  className="w-full py-2.5 text-xs font-semibold text-slate-500 bg-slate-50 border-t border-slate-100 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  {feedbacksLoading ? '불러오는 중...' : '더 불러오기'}
                </button>
              )}
            </div>
          )}
        </div>
        );
      })()}

      </div>
    </div>
  );
}
