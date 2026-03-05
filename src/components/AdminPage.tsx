import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getAllGeneratedPosts, getAdminStats, deleteGeneratedPost, PostType } from '../services/postStorageService';

// Admin 비밀번호 - 실제로는 환경변수나 Supabase로 관리해야 함
const ADMIN_PASSWORD = 'rosmrtl718';

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
      return localStorage.getItem('ADMIN_AUTHENTICATED') === 'true';
    }
    return false;
  });
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activeTab] = useState<'contents'>('contents');
  
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
      
      // 1. 통계 먼저 로드
      const statsResult = await getAdminStats(ADMIN_PASSWORD);
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
        console.log('[Admin] ✅ 통계 로드 완료:', statsResult.stats);
      }
      
      // 2. 콘텐츠 목록 로드
      const contentsResult = await getAllGeneratedPosts(ADMIN_PASSWORD, { limit: 100 });
      
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
      const result = await deleteGeneratedPost(ADMIN_PASSWORD, contentId);
      
      if (!result.success) {
        alert(`삭제 실패: ${result.error}`);
      } else {
        alert('✅ 삭제 완료!');
        loadContents(); // 목록 새로고침
      }
    } catch (err) {
      alert(`삭제 오류: ${String(err)}`);
    }
  };
  
  // 필터링된 콘텐츠 목록
  const filteredContents = contentFilter === 'all' 
    ? contents 
    : contents.filter(c => (c.content_type || 'blog') === contentFilter);

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

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      localStorage.setItem('ADMIN_AUTHENTICATED', 'true');
      setLoginError('');
      // 관리자 인증 완료 콜백
      onAdminVerified?.();
    } else {
      setLoginError('비밀번호가 올바르지 않습니다.');
    }
  };

  const handleAdminLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('ADMIN_AUTHENTICATED');
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-red-500 to-orange-600 rounded-3xl shadow-2xl shadow-red-500/30 mb-6">
              <span className="text-4xl">🔐</span>
            </div>
            <h1 className="text-3xl font-black text-white mb-2">Admin Access</h1>
            <p className="text-slate-400 font-medium">관리자 비밀번호를 입력하세요</p>
          </div>

          <form onSubmit={handleAdminLogin} className="bg-white/10 backdrop-blur-xl rounded-[32px] p-8 shadow-2xl border border-white/10">
            {loginError && (
              <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm font-medium">
                {loginError}
              </div>
            )}
            
            <div className="mb-6">
              <label className="text-xs font-black text-slate-300 uppercase tracking-widest mb-3 block">
                비밀번호
              </label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="관리자 비밀번호"
                className="w-full p-4 bg-slate-900/50 border border-slate-700 rounded-xl font-mono text-sm text-white placeholder-slate-500 focus:border-emerald-500 outline-none transition-colors"
                autoFocus
              />
            </div>

            <button 
              type="submit"
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-emerald-500/30 transition-all"
            >
              로그인
            </button>

            <div className="mt-6 text-center">
              <a 
                href="#" 
                className="text-sm text-slate-400 hover:text-white transition-colors"
              >
                ← 홈으로 돌아가기
              </a>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // 관리자 대시보드
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-2xl">⚙️</span>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Admin Dashboard</h1>
              <p className="text-slate-400 text-sm">WINAID 관리자 페이지</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a 
              href="#app" 
              className="px-4 py-2 bg-emerald-500/20 text-emerald-400 font-bold rounded-xl hover:bg-emerald-500/30 transition-colors text-sm"
            >
              앱으로 이동 →
            </a>
            <button
              onClick={handleAdminLogout}
              className="px-4 py-2 bg-red-500/20 text-red-400 font-bold rounded-xl hover:bg-red-500/30 transition-colors text-sm"
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* Stats Cards - 콘텐츠 및 사용 통계 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-5 border border-white/10">
            <div className="text-3xl mb-2">📚</div>
            <div className="text-2xl font-black text-white">{stats.totalContents}</div>
            <div className="text-sm text-slate-400">전체 콘텐츠</div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-5 border border-white/10">
            <div className="text-3xl mb-2">📝</div>
            <div className="text-2xl font-black text-white">{stats.blogCount}</div>
            <div className="text-sm text-slate-400">블로그 글</div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-5 border border-white/10">
            <div className="text-3xl mb-2">🎨</div>
            <div className="text-2xl font-black text-white">{stats.cardnewsCount}</div>
            <div className="text-sm text-slate-400">카드뉴스</div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-5 border border-white/10">
            <div className="text-3xl mb-2">📰</div>
            <div className="text-2xl font-black text-white">{stats.pressCount}</div>
            <div className="text-sm text-slate-400">언론보도</div>
          </div>
        </div>
        
        {/* 사용 통계 카드 */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/20 backdrop-blur-xl rounded-2xl p-4 border border-emerald-500/30">
            <div className="text-xl mb-1">🏥</div>
            <div className="text-xl font-black text-emerald-400">{stats.uniqueHospitals}</div>
            <div className="text-xs text-slate-400">병원 수</div>
          </div>
          <div className="bg-gradient-to-br from-blue-500/20 to-indigo-600/20 backdrop-blur-xl rounded-2xl p-4 border border-blue-500/30">
            <div className="text-xl mb-1">👤</div>
            <div className="text-xl font-black text-blue-400">{stats.uniqueUsers}</div>
            <div className="text-xs text-slate-400">사용자 수</div>
          </div>
          <div className="bg-gradient-to-br from-yellow-500/20 to-orange-600/20 backdrop-blur-xl rounded-2xl p-4 border border-yellow-500/30">
            <div className="text-xl mb-1">📅</div>
            <div className="text-xl font-black text-yellow-400">{stats.postsToday}</div>
            <div className="text-xs text-slate-400">오늘</div>
          </div>
          <div className="bg-gradient-to-br from-purple-500/20 to-pink-600/20 backdrop-blur-xl rounded-2xl p-4 border border-purple-500/30">
            <div className="text-xl mb-1">📊</div>
            <div className="text-xl font-black text-purple-400">{stats.postsThisWeek}</div>
            <div className="text-xs text-slate-400">이번 주</div>
          </div>
          <div className="bg-gradient-to-br from-cyan-500/20 to-teal-600/20 backdrop-blur-xl rounded-2xl p-4 border border-cyan-500/30">
            <div className="text-xl mb-1">📈</div>
            <div className="text-xl font-black text-cyan-400">{stats.postsThisMonth}</div>
            <div className="text-xs text-slate-400">이번 달</div>
          </div>
        </div>

        {/* 콘텐츠 관리 */}
        <div className="bg-white/10 backdrop-blur-xl rounded-[32px] p-6 lg:p-8 shadow-2xl border border-white/10">
          
          {/* Contents Tab - 블로그, 카드뉴스, 언론보도 통합 관리 */}
          <div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <h2 className="text-xl font-black text-white">콘텐츠 관리</h2>
                <div className="flex flex-wrap gap-2">
                  {/* 필터 버튼 */}
                  <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg">
                    <button
                      onClick={() => setContentFilter('all')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                        contentFilter === 'all' 
                          ? 'bg-emerald-500 text-white' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      전체
                    </button>
                    <button
                      onClick={() => setContentFilter('blog')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                        contentFilter === 'blog' 
                          ? 'bg-blue-500 text-white' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      📝 블로그
                    </button>
                    <button
                      onClick={() => setContentFilter('card_news')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                        contentFilter === 'card_news' 
                          ? 'bg-purple-500 text-white' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      🎨 카드뉴스
                    </button>
                    <button
                      onClick={() => setContentFilter('press_release')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                        contentFilter === 'press_release' 
                          ? 'bg-green-500 text-white' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      📰 언론보도
                    </button>
                  </div>
                  <button 
                    onClick={loadContents}
                    disabled={loadingData}
                    className="px-4 py-2 bg-slate-700 text-white font-bold rounded-xl hover:bg-slate-600 transition-colors text-sm disabled:opacity-50"
                  >
                    {loadingData ? '로딩...' : '🔄 새로고침'}
                  </button>
                </div>
              </div>
              
              {dataError && (
                <div className="mb-4 p-4 bg-red-500/20 border border-red-500/30 rounded-xl">
                  <p className="text-red-300 text-sm font-medium">{dataError}</p>
                </div>
              )}
              
              {filteredContents.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">📝</div>
                  <p className="text-slate-400 font-medium">
                    {loadingData ? '콘텐츠를 불러오는 중...' : '아직 저장된 콘텐츠가 없습니다.'}
                  </p>
                  <p className="text-slate-500 text-sm mt-2">
                    블로그 글을 생성하면 여기에 자동으로 저장됩니다.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm text-slate-400 mb-4">
                    {contentFilter === 'all' 
                      ? `총 ${filteredContents.length}개의 콘텐츠가 저장되어 있습니다.`
                      : `${getContentTypeLabel(contentFilter)} ${filteredContents.length}개가 저장되어 있습니다.`
                    }
                  </div>
                  {filteredContents.map((content) => (
                    <div 
                      key={content.id} 
                      className="bg-white/5 rounded-xl p-5 border border-slate-700 hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            {getContentTypeBadge(content.content_type)}
                            <h3 className="text-lg font-bold text-white truncate">
                              {content.title}
                            </h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400 mb-3">
                            <span>📅 {formatDate(content.created_at)}</span>
                            {content.hospital_name && (
                              <span className="px-2 py-1 bg-emerald-600/50 text-emerald-300 rounded-full text-xs font-bold">
                                🏥 {content.hospital_name}
                              </span>
                            )}
                            {content.category && (
                              <span className="px-2 py-1 bg-slate-600/50 text-slate-300 rounded-full text-xs font-bold">
                                {content.category}
                              </span>
                            )}
                            {content.doctor_name && (
                              <span className="text-xs text-slate-400">
                                👨‍⚕️ {content.doctor_name} {content.doctor_title || ''}
                              </span>
                            )}
                            {content.char_count && (
                              <span className="text-xs text-slate-500">
                                📝 {content.char_count.toLocaleString()}자
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            {content.keywords && content.keywords.length > 0 && (
                              <span className="text-xs text-slate-500">
                                🏷️ {content.keywords.slice(0, 3).join(', ')}
                                {content.keywords.length > 3 && ` +${content.keywords.length - 3}`}
                              </span>
                            )}
                            {content.user_email && (
                              <span className="text-xs text-blue-400">
                                ✉️ {content.user_email}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-300 line-clamp-2">
                            {content.topic || content.content?.replace(/<[^>]*>/g, '').substring(0, 150)}...
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPreviewContent(content)}
                            className="px-3 py-2 bg-blue-500/20 text-blue-400 font-bold rounded-lg hover:bg-blue-500/30 transition-colors text-sm whitespace-nowrap"
                          >
                            👁️ 보기
                          </button>
                          <button
                            onClick={() => deleteContent(content.id)}
                            className="px-3 py-2 bg-red-500/20 text-red-400 font-bold rounded-lg hover:bg-red-500/30 transition-colors text-sm whitespace-nowrap"
                          >
                            🗑️ 삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-slate-500 text-sm font-medium">
            WINAID 어드민 페이지
          </p>
        </div>
      </div>
      
      {/* 콘텐츠 미리보기 모달 */}
      {previewContent && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl my-8">
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 p-6 border-b border-slate-600 flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  {getContentTypeBadge(previewContent.content_type)}
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">{previewContent.title}</h2>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <span>📅 {formatDate(previewContent.created_at)}</span>
                  {previewContent.category && (
                    <span className="px-2 py-1 bg-slate-600/50 text-slate-300 rounded-full text-xs font-bold">
                      {previewContent.category}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setPreviewContent(null)}
                className="text-white hover:text-slate-300 text-3xl font-bold leading-none flex-shrink-0"
              >
                ×
              </button>
            </div>
            
            {/* 콘텐츠 */}
            <div className="p-8 overflow-y-auto max-h-[calc(90vh-200px)] bg-slate-50">
              <div 
                className="prose prose-slate max-w-none"
                dangerouslySetInnerHTML={{ __html: previewContent.content || '<p class="text-slate-400">내용이 없습니다.</p>' }}
              />
            </div>
            
            {/* 푸터 */}
            <div className="bg-slate-100 p-4 border-t border-slate-300 flex justify-between items-center gap-4">
              <div className="flex gap-2 flex-wrap">
                {previewContent.keywords && previewContent.keywords.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {previewContent.keywords.map((keyword: string, idx: number) => (
                      <span key={idx} className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-xs font-medium">
                        #{keyword}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setPreviewContent(null)}
                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors whitespace-nowrap"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;
