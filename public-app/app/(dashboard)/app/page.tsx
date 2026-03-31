'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import InternalFeedback from '../../../components/InternalFeedback';
import UserManual from '../../../components/UserManual';

type ContentTab = 'blog' | 'card_news' | 'press' | 'refine' | 'image' | 'history';

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, userName } = useAuthGuard();
  const [quickInput, setQuickInput] = useState('');
  const showGuide = searchParams.get('guide') === '1';

  useEffect(() => {
    if (window.location.hash === '#feedback') {
      setTimeout(() => {
        document.getElementById('feedback')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, []);

  const navigateTo = (tab: ContentTab) => router.push(`/${tab}`);

  const handleQuickSubmit = () => {
    if (quickInput.trim()) {
      router.push(`/blog?topic=${encodeURIComponent(quickInput.trim())}`);
    }
  };

  if (showGuide) return <UserManual onClose={() => router.push('/app')} />;

  return (
    <div className="min-h-full flex flex-col items-center px-6 pt-16 pb-20 bg-[#f7f7f8]">

      {/* 타이틀 */}
      <h1 className="text-4xl md:text-5xl font-bold mb-3 text-center tracking-tight text-slate-900">
        WINAID AI 워크스페이스
      </h1>
      <p className="text-base mb-10 text-center text-slate-500">
        병원 마케팅 콘텐츠를 AI로 빠르게 만들어보세요
      </p>

      {/* 입력 박스 */}
      <div className="w-full max-w-3xl rounded-2xl border shadow-md mb-4 overflow-hidden bg-white border-slate-200 shadow-slate-200/80">
        <div className="flex items-center px-5 py-4 gap-3">
          <svg className="w-5 h-5 flex-shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={quickInput}
            onChange={e => setQuickInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleQuickSubmit(); }}
            placeholder="무엇이든 물어보고 만들어보세요"
            className="flex-1 text-base outline-none bg-transparent placeholder:text-slate-400 text-slate-800"
          />
          <button
            onClick={handleQuickSubmit}
            className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${quickInput ? 'bg-slate-900 hover:bg-slate-700' : 'bg-slate-200 text-slate-400'}`}
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-3 px-5 py-3 border-t text-xs border-slate-100 text-slate-400">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse inline-block" />
            <span className="text-emerald-600">AI 엔진 가동 중</span>
          </span>
          <span className="text-slate-300">|</span>
          {['임플란트 블로그', '치과 카드뉴스', '성형외과 보도자료'].map(chip => (
            <button
              key={chip}
              onClick={() => router.push(`/blog?topic=${encodeURIComponent(chip)}`)}
              className="px-2.5 py-1 rounded-lg transition-colors bg-slate-100 hover:bg-slate-200 text-slate-600"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* 콘텐츠 생성 카드 4개: 블로그 → 언론보도 → 카드뉴스 → 이미지 생성 */}
      <div className="w-full max-w-3xl flex flex-col gap-3 mt-8 mb-4">
        {([
          {
            id: 'blog' as ContentTab,
            label: '블로그',
            desc: '네이버 스마트블록 최적화 의료 블로그 자동 생성',
            tags: ['SEO 최적화', '의료법 검증', 'AI 이미지'],
            accentBg: 'bg-blue-50',
            accentColor: 'text-blue-600',
            accentBorder: 'border-r border-blue-100',
            cardBg: 'bg-white border-slate-200 hover:border-blue-200 shadow-sm hover:shadow-md',
            tagBg: 'bg-blue-50 text-blue-600',
            btnBg: 'bg-blue-600 hover:bg-blue-700 text-white',
            icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>),
          },
          {
            id: 'press' as ContentTab,
            label: '언론보도',
            desc: '언론 배포용 전문 보도자료 작성',
            tags: ['보도자료 포맷', '전문 어조', '병원 정보 연동'],
            accentBg: 'bg-amber-50',
            accentColor: 'text-amber-600',
            accentBorder: 'border-r border-amber-100',
            cardBg: 'bg-white border-slate-200 hover:border-amber-200 shadow-sm hover:shadow-md',
            tagBg: 'bg-amber-50 text-amber-600',
            btnBg: 'bg-amber-600 hover:bg-amber-700 text-white',
            icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l6 6v8a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>),
          },
          {
            id: 'card_news' as ContentTab,
            label: '카드뉴스',
            desc: 'SNS 이미지 슬라이드 원고 + 이미지 자동 제작',
            tags: ['슬라이드 구성', '이미지 생성', '디자인 템플릿'],
            accentBg: 'bg-pink-50',
            accentColor: 'text-pink-600',
            accentBorder: 'border-r border-pink-100',
            cardBg: 'bg-white border-slate-200 hover:border-pink-200 shadow-sm hover:shadow-md',
            tagBg: 'bg-pink-50 text-pink-600',
            btnBg: 'bg-pink-600 hover:bg-pink-700 text-white',
            icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>),
          },
          {
            id: 'image' as ContentTab,
            label: '이미지 생성',
            desc: '진료일정·원내 안내물 이미지 자동 제작',
            tags: ['8종 카테고리', '캘린더 테마', '디자인 템플릿'],
            accentBg: 'bg-violet-50',
            accentColor: 'text-violet-600',
            accentBorder: 'border-r border-violet-100',
            cardBg: 'bg-white border-slate-200 hover:border-violet-200 shadow-sm hover:shadow-md',
            tagBg: 'bg-violet-50 text-violet-600',
            btnBg: 'bg-violet-600 hover:bg-violet-700 text-white',
            icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>),
          },
        ]).map(item => (
          <button
            key={item.id}
            onClick={() => navigateTo(item.id)}
            className={`group flex items-stretch rounded-2xl border transition-all duration-200 overflow-hidden ${item.cardBg}`}
          >
            <div className={`flex items-center justify-center w-20 flex-shrink-0 ${item.accentBg} ${item.accentBorder} ${item.accentColor}`}>
              {item.icon}
            </div>
            <div className="flex-1 flex flex-col justify-center px-5 py-4 text-left min-w-0">
              <h3 className="text-base font-bold mb-1 text-slate-900">{item.label}</h3>
              <p className="text-xs leading-relaxed mb-2.5 text-slate-500">{item.desc}</p>
              <div className="flex flex-wrap gap-1.5">
                {item.tags.map((t, i) => (
                  <span key={i} className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-lg ${item.tagBg}`}>{t}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center px-5 flex-shrink-0">
              <span className={`text-xs font-bold px-4 py-2 rounded-xl transition-colors ${item.btnBg}`}>시작하기</span>
            </div>
          </button>
        ))}
      </div>

      {/* 도구 2개 */}
      <div className="w-full max-w-3xl grid grid-cols-2 gap-3 mb-10">
        {([
          { id: 'refine' as ContentTab, label: 'AI 보정', desc: '기존 글을 AI로 다듬기', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/></svg>) },
          { id: 'history' as ContentTab, label: '히스토리', desc: '생성 콘텐츠 내역 조회', iconBg: 'bg-slate-100', iconColor: 'text-slate-500', icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>) },
        ]).map(item => (
          <button
            key={item.id}
            onClick={() => navigateTo(item.id)}
            className="flex items-center gap-3 p-4 rounded-xl border transition-all group bg-white border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.iconBg} ${item.iconColor}`}>{item.icon}</div>
            <div className="text-left min-w-0">
              <div className="text-sm font-semibold text-slate-800">{item.label}</div>
              <div className="text-[11px] mt-0.5 truncate text-slate-400">{item.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* 내부 피드백 — UI 숨김 (기능 유지, id="feedback" 앵커 유지) */}
      <div id="feedback" className="hidden" />

    </div>
  );
}
