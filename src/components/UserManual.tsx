import React, { useState } from 'react';

interface UserManualProps {
  onClose: () => void;
  darkMode?: boolean;
}

type SectionKey = 'overview' | 'blog' | 'cardnews' | 'press' | 'refine' | 'image' | 'tips';

interface ManualSection {
  id: SectionKey;
  title: string;
  icon: string;
  content: { heading: string; body: string }[];
}

const MANUAL_SECTIONS: ManualSection[] = [
  {
    id: 'overview',
    title: '서비스 소개',
    icon: '🏥',
    content: [
      {
        heading: 'WINAID란?',
        body: 'WINAID는 병원 마케팅 전문 AI 콘텐츠 생성 플랫폼입니다. 블로그, 카드뉴스, 언론 보도자료를 AI가 자동으로 생성하며, 의료광고법 준수 여부까지 자동 검증합니다.',
      },
      {
        heading: '주요 기능',
        body: '• 블로그 글 생성 (네이버 스마트블록 SEO 최적화)\n• 카드뉴스 생성 (원고 → 이미지 프롬프트 → AI 이미지 자동 생성)\n• 언론 보도자료 작성\n• AI 글 보정 (기존 글 다듬기)\n• AI 이미지 생성 (블로그/카드뉴스용)\n• 의료광고법 자동 검증\n• 콘텐츠 유사도 검사',
      },
      {
        heading: '사용 권장 브라우저',
        body: 'Chrome, Edge 최신 버전을 권장합니다. Safari에서는 일부 기능이 제한될 수 있습니다.',
      },
    ],
  },
  {
    id: 'blog',
    title: '블로그 작성',
    icon: '📝',
    content: [
      {
        heading: '블로그 글 생성 방법',
        body: '1. 좌측 사이드바에서 "블로그"를 클릭합니다.\n2. 입력 폼에서 주제(키워드)를 입력합니다.\n3. 카테고리를 선택합니다 (예: 피부과, 성형외과, 치과 등).\n4. "AI 콘텐츠 생성" 버튼을 클릭합니다.\n5. AI가 SEO 최적화된 블로그 글과 이미지를 자동 생성합니다.',
      },
      {
        heading: '결과 활용',
        body: '• "블로그로 복사" 버튼: 네이버 블로그에 바로 붙여넣기 가능 (서식 유지)\n• "Word 다운로드": .doc 파일로 저장\n• "PDF 다운로드": 인쇄/공유용 PDF 저장\n• AI 에디터: 하단 입력창에 수정 요청 입력 시 AI가 글을 수정',
      },
      {
        heading: 'SEO 점수 확인',
        body: '생성된 글 상단에 SEO 점수가 표시됩니다. 85점 이상이면 최적화 완료, 70점 미만이면 재설계를 권장합니다. "상세보기"를 클릭하면 항목별 점수를 확인할 수 있습니다.',
      },
      {
        heading: '소제목별 재생성',
        body: '"소제목별 수정" 버튼을 클릭하면 왼쪽에 섹션 목록이 나타납니다. 특정 소제목 부분만 선택적으로 재생성할 수 있어, 전체를 다시 생성할 필요 없이 부분 수정이 가능합니다.',
      },
    ],
  },
  {
    id: 'cardnews',
    title: '카드뉴스',
    icon: '🎨',
    content: [
      {
        heading: '카드뉴스 생성 3단계',
        body: '카드뉴스는 3단계 워크플로우로 진행됩니다:\n\n[1단계] 원고 생성: AI가 카드뉴스 원고(슬라이드별 텍스트)를 생성합니다.\n[2단계] 프롬프트 확인: 각 카드의 이미지 생성 프롬프트를 확인/수정합니다.\n[3단계] 이미지 생성: 확인된 프롬프트로 AI 이미지를 생성합니다.',
      },
      {
        heading: '1단계: 원고 확인/수정',
        body: '• AI가 생성한 원고를 검토합니다.\n• 각 슬라이드의 제목, 부제목, 설명을 직접 수정할 수 있습니다.\n• 마음에 들지 않으면 "재생성" 버튼으로 새 원고를 받을 수 있습니다.\n• 확인되면 "승인 → 다음 단계" 버튼을 클릭합니다.',
      },
      {
        heading: '2단계: 이미지 프롬프트 확인',
        body: '• 각 카드별 이미지 생성 프롬프트를 확인합니다.\n• 프롬프트를 직접 수정하여 원하는 이미지 스타일을 지정할 수 있습니다.\n• 확인 후 "이미지 생성 시작" 버튼을 클릭합니다.',
      },
      {
        heading: '3단계: 완성된 카드뉴스',
        body: '• 생성된 카드뉴스 이미지를 확인합니다.\n• 각 카드를 클릭하면 개별 이미지를 다운로드하거나 재생성할 수 있습니다.\n• "전체 다운로드" 버튼으로 모든 카드를 한번에 저장할 수 있습니다.',
      },
    ],
  },
  {
    id: 'press',
    title: '언론 보도자료',
    icon: '🗞️',
    content: [
      {
        heading: '보도자료 작성 방법',
        body: '1. 좌측 사이드바에서 "언론보도"를 클릭합니다.\n2. 주제(키워드)를 입력합니다.\n3. 병원명, 의료진 정보 등 상세 정보를 입력합니다.\n4. "AI 콘텐츠 생성" 버튼을 클릭합니다.\n5. AI가 언론 배포용 보도자료 형식으로 글을 생성합니다.',
      },
      {
        heading: '보도자료 특징',
        body: '• 역피라미드 구조 (핵심 → 세부사항 순서)\n• 전문적이고 객관적인 어조\n• 인용문 자동 생성\n• 연락처 및 부가 정보 포함\n• Word/PDF 다운로드 지원',
      },
    ],
  },
  {
    id: 'refine',
    title: 'AI 글 보정',
    icon: '✨',
    content: [
      {
        heading: 'AI 보정 사용법',
        body: '1. 좌측 사이드바에서 "AI 보정"을 클릭합니다.\n2. 수정하고 싶은 기존 글을 입력합니다.\n3. 보정 방향을 선택합니다 (전문성 강화, 가독성 개선, 톤 변경 등).\n4. AI가 글을 전문적으로 다듬어 줍니다.',
      },
      {
        heading: '활용 팁',
        body: '• 네이버 블로그에서 복사한 글을 붙여넣어 개선할 수 있습니다.\n• 경쟁사 블로그 스타일로 톤을 맞출 수 있습니다.\n• AI가 생성한 글의 "AI 냄새"를 줄이는 데 효과적입니다.',
      },
    ],
  },
  {
    id: 'image',
    title: '이미지 생성',
    icon: '🖼️',
    content: [
      {
        heading: 'AI 이미지 생성',
        body: '1. 좌측 사이드바에서 "이미지 생성"을 클릭합니다.\n2. 원하는 이미지를 설명합니다 (예: "깨끗한 치과 진료실 일러스트").\n3. 이미지 스타일을 선택합니다 (일러스트, 실사, 3D 등).\n4. 생성된 이미지를 다운로드하여 사용합니다.',
      },
      {
        heading: '이미지 스타일',
        body: '• 일러스트: 부드럽고 친근한 스타일 (블로그 추천)\n• 실사: 사실적인 사진 스타일\n• 3D 일러스트: 입체감 있는 3D 렌더링\n• 의학 3D: 해부학적 정확성이 필요한 의료 이미지',
      },
      {
        heading: '참고 이미지 활용',
        body: '기존 이미지를 참고 이미지로 업로드하면 해당 스타일을 반영하여 새 이미지를 생성합니다. "스타일 복제" 모드와 "색상 변경" 모드를 선택할 수 있습니다.',
      },
    ],
  },
  {
    id: 'tips',
    title: '활용 팁',
    icon: '💡',
    content: [
      {
        heading: '더 좋은 결과물을 얻으려면',
        body: '• 키워드는 구체적으로 입력하세요 (예: "임플란트" → "임플란트 비용 저렴한 곳 추천")\n• 카테고리를 정확히 선택하면 해당 분야 전문 용어가 반영됩니다.\n• 생성 후 AI 에디터로 세부 수정을 진행하면 품질이 크게 향상됩니다.',
      },
      {
        heading: '저장 & 관리',
        body: '• "저장" 버튼: 현재 작업 내용을 로컬에 저장합니다 (최대 3개).\n• "불러오기": 이전에 저장한 글을 불러옵니다.\n• "되돌리기": AI 수정 전 상태로 돌아갑니다.\n• "히스토리": 생성한 모든 콘텐츠를 조회할 수 있습니다.',
      },
      {
        heading: '의료광고법 주의사항',
        body: '• AI가 생성한 콘텐츠는 의료광고법 가이드를 참고하여 작성되지만, 최종 검수는 반드시 직접 확인하세요.\n• 화면 우측 하단의 "의료광고법 검색" 버튼으로 관련 법규를 확인할 수 있습니다.\n• "전/후 사진", "최초/유일" 등의 표현은 의료광고법 위반 소지가 있으니 주의하세요.',
      },
      {
        heading: '키보드 단축키',
        body: '• 블로그로 복사 후 네이버 블로그 에디터에서 Ctrl+V로 붙여넣기하세요.\n• 서식이 깨지는 경우 "Ctrl+Shift+V" (서식 없이 붙여넣기) 후 직접 서식을 적용하세요.',
      },
    ],
  },
];

const UserManual: React.FC<UserManualProps> = ({ onClose, darkMode = false }) => {
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');

  const currentSection = MANUAL_SECTIONS.find(s => s.id === activeSection) || MANUAL_SECTIONS[0];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`w-full max-w-4xl max-h-[85vh] rounded-2xl shadow-2xl border overflow-hidden flex flex-col ${
          darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className={`px-6 py-4 border-b flex items-center justify-between flex-shrink-0 ${
          darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${
              darkMode ? 'bg-blue-500/15' : 'bg-blue-50'
            }`}>
              📖
            </div>
            <div>
              <h2 className={`text-lg font-black ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                WINAID 사용 설명서
              </h2>
              <p className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                병원 마케팅 AI 콘텐츠 생성 가이드
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* 좌측 네비게이션 */}
          <nav className={`w-48 flex-shrink-0 border-r overflow-y-auto py-3 px-2 hidden sm:block ${
            darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-100 bg-slate-50/50'
          }`}>
            {MANUAL_SECTIONS.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all mb-0.5 flex items-center gap-2 ${
                  activeSection === section.id
                    ? darkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600 shadow-sm'
                    : darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <span className="text-base">{section.icon}</span>
                <span>{section.title}</span>
              </button>
            ))}
          </nav>

          {/* 모바일 탭 */}
          <div className={`sm:hidden flex-shrink-0 border-b overflow-x-auto ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
            <div className="flex px-2 py-2 gap-1">
              {MANUAL_SECTIONS.map(section => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeSection === section.id
                      ? darkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600'
                      : darkMode ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  {section.icon} {section.title}
                </button>
              ))}
            </div>
          </div>

          {/* 콘텐츠 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">{currentSection.icon}</span>
              <h3 className={`text-xl font-black ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                {currentSection.title}
              </h3>
            </div>

            {currentSection.content.map((item, i) => (
              <div key={i} className={`rounded-xl p-5 ${
                darkMode ? 'bg-slate-700/50' : 'bg-slate-50'
              }`}>
                <h4 className={`text-sm font-black mb-3 flex items-center gap-2 ${
                  darkMode ? 'text-slate-200' : 'text-slate-700'
                }`}>
                  <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black ${
                    darkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'
                  }`}>
                    {i + 1}
                  </span>
                  {item.heading}
                </h4>
                <div className={`text-sm leading-relaxed whitespace-pre-line ${
                  darkMode ? 'text-slate-300' : 'text-slate-600'
                }`}>
                  {item.body}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 푸터 */}
        <div className={`px-6 py-3 border-t flex items-center justify-between flex-shrink-0 ${
          darkMode ? 'border-slate-700' : 'border-slate-100'
        }`}>
          <p className={`text-[11px] font-medium ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            WINAID v2.0 - 병원 마케팅 AI 콘텐츠 플랫폼
          </p>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserManual;
