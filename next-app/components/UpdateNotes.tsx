'use client';

import { useState, useEffect } from 'react';

const CURRENT_VERSION = '2026.04.09';
const STORAGE_KEY = 'winaid_changelog_seen';

const CHANGELOG = [
  {
    category: '🎬 쇼츠 메이커 (NEW)',
    items: [
      '10단계 파이프라인 — 세로크롭 → 스타일 → 무음제거 → 자막 → 효과음 → 줌 → BGM → 인트로 → 썸네일',
      'AI 쇼츠 생성기 — 키워드만 입력하면 대본+TTS+이미지+영상 자동 생성',
      '15가지 스타일 변환 — 웹툰/애니/수채화/네온 등 Gemini AI로 변환',
      'AI 자막 생성 — Google Cloud STT + 의료광고법 자동 검증',
      'BGM — Jamendo 50만곡 무료 검색 + AI 음악 생성 (MusicGen)',
      'TTS 나레이션 — Google Cloud TTS 한국어 목소리',
    ],
  },
  {
    category: '▶️ 유튜브',
    items: [
      '영상 분석 — 시간순 전체 분석',
      '2단계 API 분리 — 요약(텍스트) + 주제(JSON)',
      '3가지 문체 선택 (환자용/원장님/핵심정리)',
      '🗑️ GIF 기능 삭제 — 사용률 낮아 제거, 핵심 글 생성에 집중',
    ],
  },
  {
    category: '🔒 보안',
    items: [
      'API 인증 추가 — 로그인한 사용자만 API 호출 가능',
      'XSS 방어 — DOMPurify로 모든 HTML 렌더링 sanitize',
      '보안 헤더 5종 추가 (X-Frame-Options, CSP 등)',
      '커스텀 에러 페이지 (404/500)',
    ],
  },
  {
    category: '📝 블로그',
    items: [
      '🚀 스트리밍 생성 — 글이 실시간으로 써지는 걸 볼 수 있음 (GPT처럼)',
      '이미지 병렬 생성 — 글 쓰는 동안 이미지 동시 생성 (체감 속도 40% 단축)',
      '주제 유형 자동 분류 (6종) — 유형별 흐름 가이드 자동 적용',
      '도입부 5가지 패턴 / 마무리 3가지 패턴 추가',
      '[문체 — 사람처럼 쓰기] 가이드 강화',
    ],
  },
  {
    category: '🔬 임상글',
    items: [
      '임상글 전용 시스템 신규 (clinicalPrompt + 3단계 파이프라인)',
      '이미지 업로드 시 canvas 압축 (50배 감소)',
      '진료과별 임상 가이드 (치과/피부과/정형외과)',
      '❌/✅ 실제 의사 문체 변환 예시',
    ],
  },
  {
    category: '🎨 카드뉴스',
    items: [
      '2단계 이미지 생성 — Flash(밑그림) → Pro(한글 텍스트)',
      '주제별 슬라이드 흐름 자동 분류 (5종)',
      '스타일 체인 생성 — 1장 스타일 분석 후 2~N장 순차 적용',
      '프롬프트 파싱 3단계 강화 (텍스트 반복 버그 수정)',
      '진료과별 카드뉴스 가이드 추가',
      '3단계→2단계 플로우 — 원고+비주얼 통합 생성 → 바로 이미지',
      '간단/상세 모드 — 콘텐츠 분량 선택 (⚡짧고 임팩트 / 📋정보 충실)',
    ],
  },
  {
    category: '🗞️ 보도자료',
    items: [
      '6가지 보도 유형별 기사 구조 가이드',
      '도입부 5패턴 / 전문의 인용 다양화',
      '진료과별 전문 용어 자동 포함',
    ],
  },
  {
    category: '✨ AI 보정',
    items: [
      'shorter/seo/longer 모드 전면 교체 (❌/✅ 예시 포함)',
      '채팅 의도 패턴 16→22개 확대',
      '진료과별 전문 용어 힌트 (피부과/정형외과)',
    ],
  },
  /* 유튜브 — 위에 통합 */
  {
    category: '🖼️ 이미지 생성',
    items: [
      '한국어 텍스트 렌더링 규칙 강화',
      '8개 탭별 디자인 힌트 (진료일정/이벤트/의사소개 등)',
      'DESIGNER_PERSONA 슬림화',
    ],
  },
  {
    category: '⚡ 성능',
    items: [
      'flash-lite 호출 전체에 thinkingLevel:none 적용',
      '이미지 분석 모델 최적화 + timeout 30초',
    ],
  },
  {
    category: '🔧 기타',
    items: [
      '사이드바 3그룹 분류 (글 작성/이미지/도구)',
      '피부과 장비/시술 데이터 전체 동기화',
      '프롬프트 중복 삭제 + 상충 해결 (전 파일)',
    ],
  },
];

export function UpdateNotes() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (seen !== CURRENT_VERSION) {
      setShow(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-800">🚀 업데이트 노트</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{CURRENT_VERSION} — 오늘 적용된 변경사항</p>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {CHANGELOG.map((section) => (
            <div key={section.category}>
              <h3 className="text-sm font-bold text-slate-700 mb-1.5">{section.category}</h3>
              <ul className="space-y-1">
                {section.items.map((item, i) => (
                  <li key={i} className="text-xs text-slate-600 leading-relaxed flex gap-2">
                    <span className="text-blue-400 flex-shrink-0 mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 푸터 */}
        <div className="px-6 py-3 border-t border-slate-100 flex-shrink-0">
          <button onClick={handleClose}
            className="w-full py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-all">
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
