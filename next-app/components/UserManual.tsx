'use client';

import React, { useState } from 'react';

type SectionKey = 'overview' | 'blog' | 'cardnews' | 'press' | 'refine' | 'image' | 'tips';

const SECTIONS: { id: SectionKey; title: string; icon: string; items: { heading: string; body: string }[] }[] = [
  { id: 'overview', title: '서비스 소개', icon: '🏥', items: [
    { heading: 'WINAI란?', body: 'WINAI는 병원 마케팅 전문 AI 콘텐츠 생성 플랫폼입니다. 블로그, 카드뉴스, 언론 보도자료를 AI가 자동으로 생성하며, 의료광고법 준수 여부까지 자동 검증합니다.' },
    { heading: '주요 기능', body: '• 블로그 글 생성 (네이버 SEO 최적화)\n• 카드뉴스 생성\n• 언론 보도자료 작성\n• AI 글 보정\n• AI 이미지 생성\n• 의료광고법 자동 검증' },
    { heading: '권장 브라우저', body: 'Chrome, Edge 최신 버전을 권장합니다.' },
  ]},
  { id: 'blog', title: '블로그 작성', icon: '📝', items: [
    { heading: '블로그 글 생성 방법', body: '1. 사이드바에서 "블로그"를 클릭\n2. 주제(키워드) 입력\n3. 카테고리 선택\n4. "AI 콘텐츠 생성" 클릭\n5. AI가 SEO 최적화된 글과 이미지를 생성합니다' },
    { heading: '결과 활용', body: '• "블로그로 복사": 네이버 블로그에 바로 붙여넣기 (서식 유지)\n• "Word 다운로드": .doc 파일 저장\n• "PDF 다운로드": 인쇄/공유용 PDF\n• AI 에디터: 수정 요청 입력 시 AI가 글을 수정' },
    { heading: '소제목별 재생성', body: '"소제목별 수정" 버튼 클릭 시 특정 소제목 부분만 선택적으로 재생성할 수 있습니다.' },
  ]},
  { id: 'cardnews', title: '카드뉴스', icon: '🎨', items: [
    { heading: '카드뉴스 생성', body: '1. "카드뉴스" 메뉴 클릭\n2. 주제 입력 + 디자인 템플릿 선택\n3. AI가 원고 → 이미지 프롬프트 → 이미지를 자동 생성\n4. 카드별 수정/재생성 가능' },
    { heading: '디자인 템플릿', body: '5가지 디자인 스타일 중 선택할 수 있으며, 각 카드의 이미지를 개별적으로 재생성할 수 있습니다.' },
  ]},
  { id: 'press', title: '언론보도', icon: '🗞️', items: [
    { heading: '보도자료 작성', body: '1. "언론보도" 메뉴 클릭\n2. 병원명, 의료진, 주제, 보도 유형 입력\n3. AI가 3인칭 기자 문체로 보도자료 생성\n4. 전문의 인용 2회 이상 자동 포함' },
    { heading: '의료광고법 준수', body: 'AI가 자동으로 의료광고법 위반 표현을 감지하고 중립적 표현으로 대체합니다.' },
  ]},
  { id: 'refine', title: 'AI 보정', icon: '✨', items: [
    { heading: '자동 보정', body: '기존 글을 붙여넣고 6가지 방향 중 선택하여 자동으로 다듬을 수 있습니다:\n• 더 자연스럽게\n• 더 전문적으로\n• 더 짧게/길게\n• 의료광고법 자동 수정\n• SEO 최적화' },
    { heading: '채팅 수정', body: '"채팅 수정" 모드에서 대화하듯이 세밀한 수정 요청이 가능합니다.\nURL을 붙여넣으면 참고자료로 활용합니다.' },
  ]},
  { id: 'image', title: '이미지 생성', icon: '🖼️', items: [
    { heading: '이미지 생성 방법', body: '1. "이미지 생성" 메뉴 클릭\n2. 카테고리 선택 (진료일정, 이벤트 등 8종)\n3. 전용 입력 폼 작성\n4. 디자인 템플릿 선택\n5. "AI 디자인 생성" 클릭' },
    { heading: '디자인 템플릿', body: '카테고리별 전문 디자인 템플릿이 준비되어 있으며, "그대로" / "참고" 모드로 템플릿 적용 강도를 조절할 수 있습니다.' },
  ]},
  { id: 'tips', title: '활용 팁', icon: '💡', items: [
    { heading: '말투 학습', body: '병원 블로그 URL을 등록하면 AI가 해당 병원의 글쓰기 스타일을 학습합니다. 이후 생성되는 모든 글에 학습된 말투가 자동 적용됩니다.' },
    { heading: 'SEO 최적화', body: '네이버 C-Rank + D.I.A 알고리즘 기준으로 키워드 배치, 소제목 구조, 글자수를 자동 최적화합니다.' },
    { heading: '의료광고법', body: '의료법 제56조 기준으로 과장/단정/효과보장 표현을 자동 감지하고 대체어를 제안합니다.' },
  ]},
];

export default function UserManual({ onClose }: { onClose?: () => void }) {
  const [active, setActive] = useState<SectionKey>('overview');
  const section = SECTIONS.find(s => s.id === active)!;

  return (
    <div className="flex flex-col lg:flex-row gap-5 p-5">
      {/* 좌측: 메뉴 */}
      <div className="w-full lg:w-56 lg:flex-none">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-1">
          <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-100 mb-2">
            <span className="text-sm font-bold text-slate-800">📖 사용 가이드</span>
            {onClose && <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">✕</button>}
          </div>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActive(s.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${active === s.id ? 'bg-violet-50 text-violet-700 border border-violet-200' : 'text-slate-600 hover:bg-slate-50'}`}>
              <span className="mr-2">{s.icon}</span>{s.title}
            </button>
          ))}
        </div>
      </div>

      {/* 우측: 내용 */}
      <div className="flex-1 min-w-0">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-xl font-black text-slate-800 mb-6">{section.icon} {section.title}</h2>
          <div className="space-y-6">
            {section.items.map((item, i) => (
              <div key={i}>
                <h3 className="text-base font-bold text-slate-700 mb-2">{item.heading}</h3>
                <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{item.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
