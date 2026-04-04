'use client';

import { useState, useEffect } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '../../../lib/supabase';
import { getCredits, type CreditInfo } from '../../../lib/creditService';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  hospitalName: string;
  createdAt: string;
}

interface UsageStats {
  totalPosts: number;
  blogCount: number;
  cardNewsCount: number;
  imageCount: number;
  pressCount: number;
}

export default function MyPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [creditInfo, setCreditInfo] = useState<CreditInfo | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState('');
  const [editHospital, setEditHospital] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { setLoading(false); return; }

        setProfile({
          id: user.id,
          email: user.email || '',
          name: user.user_metadata?.name || '',
          hospitalName: user.user_metadata?.hospital_name || user.user_metadata?.name || '',
          createdAt: user.created_at || '',
        });
        setEditName(user.user_metadata?.name || '');
        setEditHospital(user.user_metadata?.hospital_name || user.user_metadata?.name || '');

        const credits = await getCredits(user.id);
        setCreditInfo(credits);

        try {
          const { data: posts, error } = await (sb.from('generated_posts') as ReturnType<typeof sb.from>)
            .select('post_type')
            .eq('user_id', user.id);
          if (!error && posts) {
            setUsage({
              totalPosts: posts.length,
              blogCount: posts.filter((p: { post_type: string }) => p.post_type === 'blog').length,
              cardNewsCount: posts.filter((p: { post_type: string }) => p.post_type === 'card_news').length,
              imageCount: posts.filter((p: { post_type: string }) => p.post_type === 'image').length,
              pressCount: posts.filter((p: { post_type: string }) => p.post_type === 'press_release').length,
            });
          }
        } catch { /* 통계 조회 실패 무시 */ }
      } catch { /* 로그인 안 된 상태 */ }
      setLoading(false);
    })();
  }, []);

  const handleSaveProfile = async () => {
    if (!isSupabaseConfigured || !profile) return;
    setIsSaving(true);
    setSaveMsg('');
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.auth.updateUser({
        data: { name: editName.trim(), hospital_name: editHospital.trim() },
      });
      if (error) setSaveMsg('저장 실패: ' + error.message);
      else {
        setSaveMsg('저장되었습니다');
        setProfile(prev => prev ? { ...prev, name: editName.trim(), hospitalName: editHospital.trim() } : prev);
      }
    } catch { setSaveMsg('저장 실패'); }
    setIsSaving(false);
    setTimeout(() => setSaveMsg(''), 3000);
  };

  const inputCls = 'w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all';
  const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>;

  if (!profile) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
      <div className="text-4xl mb-4">🔒</div>
      <h2 className="text-lg font-bold text-slate-800 mb-2">로그인이 필요합니다</h2>
      <p className="text-sm text-slate-500">회원 정보를 확인하려면 먼저 로그인해주세요.</p>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto p-5 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-blue-500/20">
          {(profile.name || profile.email)[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">{profile.name || '회원'}</h1>
          <p className="text-sm text-slate-500">{profile.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-2xl p-5 border border-violet-200">
          <p className="text-xs font-semibold text-violet-500 mb-1">잔여 크레딧</p>
          <p className="text-3xl font-black text-violet-700">{creditInfo ? creditInfo.credits : '∞'}</p>
          <p className="text-[10px] text-violet-400 mt-1">{creditInfo ? `총 ${creditInfo.totalUsed}회 사용` : '무제한 (개발 모드)'}</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-5 border border-blue-200">
          <p className="text-xs font-semibold text-blue-500 mb-1">생성한 콘텐츠</p>
          <p className="text-3xl font-black text-blue-700">{usage?.totalPosts || 0}</p>
          <p className="text-[10px] text-blue-400 mt-1">블로그 {usage?.blogCount || 0} · 카드뉴스 {usage?.cardNewsCount || 0} · 이미지 {usage?.imageCount || 0}</p>
        </div>
      </div>

      {usage && usage.totalPosts > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3">콘텐츠 유형별 사용량</h3>
          <div className="space-y-2">
            {[
              { label: '블로그', count: usage.blogCount, color: 'bg-blue-500', icon: '📝' },
              { label: '카드뉴스', count: usage.cardNewsCount, color: 'bg-pink-500', icon: '🌸' },
              { label: '이미지', count: usage.imageCount, color: 'bg-emerald-500', icon: '🖼️' },
              { label: '보도자료', count: usage.pressCount, color: 'bg-amber-500', icon: '📰' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-base">{item.icon}</span>
                <span className="text-xs font-medium text-slate-600 w-16">{item.label}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div className={`h-full rounded-full ${item.color} transition-all`} style={{ width: `${Math.min((item.count / usage.totalPosts) * 100, 100)}%` }} />
                </div>
                <span className="text-xs font-bold text-slate-700 w-8 text-right">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-700">프로필 정보</h3>
        <div>
          <label className={labelCls}>이메일</label>
          <input type="text" value={profile.email} disabled className={`${inputCls} bg-slate-50 text-slate-400 cursor-not-allowed`} />
        </div>
        <div>
          <label className={labelCls}>이름</label>
          <input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="이름을 입력하세요" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>병원명</label>
          <input type="text" value={editHospital} onChange={e => setEditHospital(e.target.value)} placeholder="병원 이름 (콘텐츠에 자동 반영)" className={inputCls} />
          <p className="text-[10px] text-slate-400 mt-1">블로그, 카드뉴스, 보도자료 생성 시 자동 적용됩니다.</p>
        </div>
        <div>
          <label className={labelCls}>가입일</label>
          <input type="text" value={profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'} disabled className={`${inputCls} bg-slate-50 text-slate-400 cursor-not-allowed`} />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSaveProfile} disabled={isSaving} className="px-6 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all">
            {isSaving ? '저장 중...' : '변경사항 저장'}
          </button>
          {saveMsg && <span className={`text-xs font-medium ${saveMsg.includes('실패') ? 'text-red-500' : 'text-green-600'}`}>{saveMsg}</span>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-700">계정 관리</h3>
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-slate-700">요금제</p>
            <p className="text-xs text-slate-400">현재 이용 중인 요금제</p>
          </div>
          <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-full">{creditInfo ? '구독 중' : '무료 체험'}</span>
        </div>
        <div className="border-t border-slate-100 pt-3">
          <p className="text-[11px] text-slate-400">요금제 변경, 결제 관리, 계정 삭제는 고객센터로 문의해주세요.</p>
        </div>
      </div>
    </div>
  );
}
