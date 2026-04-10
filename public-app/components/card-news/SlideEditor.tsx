'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { SlideData, SlideDecoration, SlideImagePosition, SlideImageStyle } from '../../lib/cardNewsLayouts';
import { CARD_FONTS, FONT_CATEGORIES, SLIDE_IMAGE_STYLES, COVER_TEMPLATES } from '../../lib/cardNewsLayouts';
import { IconChangerPopover, ElementAccordion, TextElementEditor } from './EditorWidgets';
import { validateSlideMedicalAd, type ViolationResult, type SlideFieldViolation } from '../../lib/medicalAdValidation';

/**
 * suggestion 문자열에서 첫 번째 따옴표 안의 구체 대체어 추출.
 * ex) "'개선된', '업데이트된'" → "개선된"
 *      '삭제 권장' → null (치환 불가 → '제거' 버튼으로 처리)
 */
function extractReplacement(suggestion: string): string | null {
  const match = suggestion.match(/['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

/** 정규식 리터럴 이스케이프 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ═══════════════════════════════════════════════════════════════
// SlideEditor: 현재 슬라이드 레이아웃에 맞는 폼을 렌더링
// ═══════════════════════════════════════════════════════════════

interface SlideEditorProps {
  slide: SlideData;
  slideIdx: number;
  onChange: (patch: Partial<SlideData>) => void;
  onGenerateImage: () => void;
  onUploadImage: (file: File) => void;
  onAiSuggestText: (field: 'title' | 'subtitle' | 'body') => void;
  onAiSuggestComparison: () => void;
  onAiEnrich: () => void;
  onSuggestImagePrompt: () => void;
  onFontChange: (fontId: string | undefined) => void;
  accentColor: string;
  generatingImage: boolean;
  aiSuggestingKey: string | null;
  customFontName: string | null;
  customFontDisplayName: string | null;
}

export default function SlideEditor({
  slide,
  slideIdx,
  onChange,
  onGenerateImage,
  onUploadImage,
  onAiSuggestText,
  onAiSuggestComparison,
  onAiEnrich,
  onSuggestImagePrompt,
  onFontChange,
  accentColor,
  generatingImage,
  aiSuggestingKey,
  customFontName,
  customFontDisplayName,
}: SlideEditorProps) {
  const inputCls = 'w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200';
  const labelCls = 'block text-[10px] font-semibold text-slate-500 mb-0.5';
  const textareaCls = `${inputCls} resize-none`;

  const isSuggesting = (field: string) => aiSuggestingKey === `${slideIdx}:${field}`;

  // 카드별 AI 채팅 (SlideEditor 인스턴스마다 독립 state)
  type CardChatMessage = { role: 'user' | 'assistant'; text: string };
  const [cardChatOpen, setCardChatOpen] = useState(false);
  const [cardChatMessages, setCardChatMessages] = useState<CardChatMessage[]>([]);
  const [cardChatInput, setCardChatInput] = useState('');
  const [cardChatLoading, setCardChatLoading] = useState(false);

  // 이미지 소스 3탭
  const [imageTab, setImageTab] = useState<'pexels' | 'pixabay' | 'ai'>('pexels');
  const [pixabayType, setPixabayType] = useState<'all' | 'photo' | 'illustration' | 'vector'>('illustration');
  const [imageSearchQuery, setImageSearchQuery] = useState('');
  const [imageSearchResults, setImageSearchResults] = useState<{ id: string; url: string; thumb: string; alt: string; source: string; photographer?: string }[]>([]);
  const [imageSearchLoading, setImageSearchLoading] = useState(false);

  // 배경 제거
  const [removingBg, setRemovingBg] = useState(false);

  // 편집/AI 2탭
  const [editMode, setEditMode] = useState<'edit' | 'ai'>('edit');

  // ── 의료광고법 실시간 검증 ──
  // Day 5: validateSlideMedicalAd로 전체 슬라이드 텍스트 필드 스캔.
  // (이전엔 title/subtitle/body만 봤음 — imagePrompt/columns/questions 등은 사각지대였음)
  const slideViolations = useMemo<SlideFieldViolation[]>(
    () => validateSlideMedicalAd(slide),
    [slide],
  );

  const getFieldViolations = (field: string): ViolationResult[] =>
    slideViolations.find(fv => fv.field === field)?.violations ?? [];

  const titleViolations = getFieldViolations('title');
  const subtitleViolations = getFieldViolations('subtitle');
  const bodyViolations = getFieldViolations('body');
  const visualKeywordViolations = getFieldViolations('visualKeyword');

  // title/subtitle/body/visualKeyword 외 필드의 위반 — 별도 요약 표시
  const nestedFieldViolations = slideViolations.filter(fv =>
    !['title', 'subtitle', 'body', 'visualKeyword'].includes(fv.field)
  );

  /** 평탄한 단일 문자열 필드만 원클릭 치환 지원. 나머지는 수동 편집 안내. */
  type FlatTextField =
    | 'title' | 'subtitle' | 'body' | 'visualKeyword'
    | 'quoteText' | 'quoteAuthor' | 'quoteRole'
    | 'warningTitle' | 'beforeLabel' | 'afterLabel'
    | 'prosLabel' | 'consLabel' | 'badge';

  const replaceViolation = (field: FlatTextField, v: ViolationResult) => {
    const current = String((slide as unknown as Record<string, unknown>)[field] || '');
    const replacement = extractReplacement(v.suggestion);
    const pattern = new RegExp(escapeRegex(v.keyword), 'g');
    const next = current
      .replace(pattern, replacement ?? '')
      .replace(/ {2,}/g, ' ')
      .trim();
    onChange({ [field]: next } as Partial<SlideData>);
  };

  /** 필드 글자수 + 과다 입력 경고 렌더러 (title/subtitle/body 공통) */
  const renderCharCount = (
    field: 'title' | 'subtitle' | 'body',
    value: string,
  ) => {
    const len = value.length;
    const limit = field === 'title' ? 30 : field === 'subtitle' ? 20 : 100;
    const warning =
      field === 'body' ? '읽기 어려울 수 있음 — 줄이기 추천'
      : '카드에서 잘릴 수 있음';
    const over = len > limit;
    return (
      <div className="mt-0.5 px-0.5 flex items-center justify-end gap-1 text-[9px] leading-tight">
        <span className={over ? 'text-orange-500 font-bold' : 'text-slate-400'}>
          {len}자{over && ` / 권장 ${limit}자 이내`}
        </span>
        {over && (
          <span className="text-orange-500">· {warning}</span>
        )}
      </div>
    );
  };

  /** 인라인 위반 배지 렌더러. 배지는 ElementAccordion 바깥에 두어 접혀 있어도 보이게 함. */
  const renderViolations = (
    field: FlatTextField,
    violations: ViolationResult[],
  ) => {
    if (violations.length === 0) return null;
    return (
      <div className="mt-1 space-y-0.5" role="alert" aria-label={`${field} 의료광고법 위반`}>
        {violations.map((v, i) => {
          const replacement = extractReplacement(v.suggestion);
          const tone = v.severity === 'high'
            ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-amber-50 text-amber-700 border-amber-200';
          return (
            <div
              key={`${field}-${v.keyword}-${i}`}
              className={`text-[10px] leading-tight px-2 py-1 rounded-lg border flex items-center gap-1.5 ${tone}`}
              title={v.suggestion}
            >
              <span className="shrink-0">{v.severity === 'high' ? '⛔' : '⚠️'}</span>
              <span className="font-bold shrink-0">&lsquo;{v.keyword}&rsquo;</span>
              <span className="truncate opacity-80">{v.suggestion}</span>
              <button
                type="button"
                onClick={() => replaceViolation(field, v)}
                className="ml-auto shrink-0 px-1.5 py-0.5 rounded bg-white/80 border border-current text-[10px] font-bold hover:bg-white"
              >
                {replacement ? '교체' : '제거'}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  /**
   * 중첩 필드(배열/객체) 위반 요약 — 원클릭 치환 불가, 수동 편집 필요.
   * 어느 필드에 어떤 키워드가 있는지만 알려주고 사용자가 직접 해당 레이아웃 데이터 에디터에서 수정.
   */
  const renderNestedFieldSummary = () => {
    if (nestedFieldViolations.length === 0) return null;
    const totalCount = nestedFieldViolations.reduce((sum, fv) => sum + fv.violations.length, 0);
    const hasHigh = nestedFieldViolations.some(fv => fv.violations.some(v => v.severity === 'high'));
    const tone = hasHigh
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';
    return (
      <details className={`mb-3 rounded-lg border ${tone}`}>
        <summary className="cursor-pointer px-3 py-2 text-[11px] font-bold flex items-center gap-1.5">
          <span>{hasHigh ? '⛔' : '⚠️'}</span>
          <span>다른 필드에서 {totalCount}건의 의료광고법 위반</span>
          <span className="text-[10px] font-normal opacity-70 ml-auto">(클릭해서 펼치기 · 수동 수정 필요)</span>
        </summary>
        <div className="px-3 pb-3 pt-1 space-y-1">
          {nestedFieldViolations.map((fv, fi) => (
            <div key={`nfv-${fi}-${fv.field}`} className="text-[10px] space-y-0.5">
              <div className="font-bold opacity-80">{fv.fieldLabel}</div>
              {fv.violations.map((v, vi) => (
                <div
                  key={`nfv-${fi}-${v.keyword}-${vi}`}
                  className="ml-2 flex items-center gap-1.5"
                >
                  <span>{v.severity === 'high' ? '⛔' : '⚠️'}</span>
                  <span className="font-bold">&lsquo;{v.keyword}&rsquo;</span>
                  <span className="opacity-70 truncate">{v.suggestion}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </details>
    );
  };

  // 탭 전환 시 자동 키워드 채우기
  useEffect(() => {
    if (imageTab !== 'ai' && slide?.title && !imageSearchQuery) {
      const keywords: Record<string, string> = {
        '임플란트': 'dental implant', '치아': 'teeth dental', '교정': 'orthodontics',
        '스케일링': 'dental cleaning', '충치': 'cavity', '잇몸': 'gum disease',
        '피부': 'skin care', '보톡스': 'botox', '레이저': 'laser treatment',
        '정형외과': 'orthopedic', '관절': 'joint', '척추': 'spine',
        '병원': 'hospital clinic', '의사': 'doctor physician',
      };
      if (imageTab === 'pixabay') {
        // Pixabay는 한국어 검색 가능
        let autoQuery = '치과';
        for (const kr of Object.keys(keywords)) {
          if (slide.title.includes(kr)) { autoQuery = kr; break; }
        }
        setImageSearchQuery(autoQuery);
      } else {
        // Pexels는 영문
        let autoQuery = 'dental clinic';
        for (const [kr, en] of Object.entries(keywords)) {
          if (slide.title.includes(kr)) { autoQuery = en; break; }
        }
        setImageSearchQuery(autoQuery);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageTab]);

  const handleImageSearch = async () => {
    if (!imageSearchQuery.trim()) return;
    setImageSearchLoading(true);
    try {
      let endpoint: string;
      if (imageTab === 'pixabay') {
        endpoint = `/api/pixabay?query=${encodeURIComponent(imageSearchQuery)}&image_type=${pixabayType}&orientation=horizontal&per_page=12`;
      } else {
        endpoint = `/api/pexels?query=${encodeURIComponent(imageSearchQuery)}&orientation=landscape&per_page=12`;
      }
      const res = await fetch(endpoint);
      const data = await res.json();
      setImageSearchResults(data.photos || []);
    } catch { /* ignore */ }
    setImageSearchLoading(false);
  };

  const handleSelectSearchImage = (photo: { url: string }) => {
    onChange({ imageUrl: photo.url });
    setImageSearchResults([]);
  };

  const handleCardChatSend = async () => {
    const userMsg = cardChatInput.trim();
    if (!userMsg || cardChatLoading) return;
    setCardChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setCardChatInput('');
    setCardChatLoading(true);
    try {
      // 이미지 dataUrl은 제외 (토큰 절약)
      const slideForContext = {
        index: slide.index,
        layout: slide.layout,
        title: slide.title,
        subtitle: slide.subtitle,
        body: slide.body,
        columns: slide.columns,
        compareLabels: slide.compareLabels,
        icons: slide.icons,
        steps: slide.steps,
        checkItems: slide.checkItems,
        dataPoints: slide.dataPoints,
        questions: slide.questions,
        timelineItems: slide.timelineItems,
        quoteText: slide.quoteText,
        quoteAuthor: slide.quoteAuthor,
        quoteRole: slide.quoteRole,
        numberedItems: slide.numberedItems,
        pros: slide.pros,
        cons: slide.cons,
        prosLabel: slide.prosLabel,
        consLabel: slide.consLabel,
        priceItems: slide.priceItems,
        warningTitle: slide.warningTitle,
        warningItems: slide.warningItems,
        beforeLabel: slide.beforeLabel,
        afterLabel: slide.afterLabel,
        beforeItems: slide.beforeItems,
        afterItems: slide.afterItems,
      };

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `현재 슬라이드 (${slide.index}장, 레이아웃: ${slide.layout}):
${JSON.stringify(slideForContext, null, 2)}

사용자 요청: "${userMsg}"

이 슬라이드만 수정해서 응답해줘.

출력 형식:
1. 뭘 수정했는지 한국어 1~2문장
2. ---SLIDE_JSON--- 구분자
3. 수정된 슬라이드 1개의 JSON (이 슬라이드만, 배열 아님)

⚠️ 레이아웃 변경이 필요하면 layout 필드도 바꾸고 해당 레이아웃의 필드들(예: qna면 questions, timeline이면 timelineItems)을 채워줘.
⚠️ JSON 객체 하나만. 배열 금지. 설명 안에 JSON 금지.
⚠️ 의료광고법 준수: "완치/100%/최첨단/완벽/획기적/유일/국내 최초/1위" 금지.
⚠️ 구체적 수치는 범위로("80~120만원", "3~6개월").`,
          systemInstruction: '병원 마케팅 카드뉴스 전문가. 의료광고법 준수. 구체적 수치 사용. JSON 정확하게 출력.',
          model: 'gemini-3.1-flash-lite-preview',
          temperature: 0.7,
          maxOutputTokens: 4096,
          googleSearch: true,
        }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        setCardChatMessages(prev => [...prev, { role: 'assistant', text: `⚠️ 오류: ${data.error || '다시 시도해주세요.'}` }]);
        return;
      }
      const sep = '---SLIDE_JSON---';
      const sepIdx = data.text.indexOf(sep);
      if (sepIdx >= 0) {
        const explanation = data.text.substring(0, sepIdx).trim();
        const jsonPart = data.text.substring(sepIdx + sep.length).trim();
        setCardChatMessages(prev => [...prev, { role: 'assistant', text: explanation || '수정했어요.' }]);
        try {
          const cleaned = jsonPart.replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
          let parsed: Partial<SlideData>;
          try {
            parsed = JSON.parse(cleaned) as Partial<SlideData>;
          } catch {
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error('no braces');
            parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<SlideData>;
          }
          // layout 포함 모든 필드 머지 (이미지 필드는 보존)
          onChange({
            ...parsed,
            index: slide.index,
            imageUrl: parsed.imageUrl ?? slide.imageUrl,
            imagePosition: parsed.imagePosition ?? slide.imagePosition,
            imageStyle: parsed.imageStyle ?? slide.imageStyle,
            visualKeyword: parsed.visualKeyword ?? slide.visualKeyword,
          });
        } catch (parseErr) {
          console.warn('[CARD_CHAT] JSON 파싱 실패', parseErr);
          setCardChatMessages(prev => [...prev, { role: 'assistant', text: '(⚠️ 수정 적용 실패. 더 구체적으로 다시 요청해주세요.)' }]);
        }
      } else {
        setCardChatMessages(prev => [...prev, { role: 'assistant', text: data.text as string }]);
      }
    } catch (err) {
      console.warn('[CARD_CHAT] 오류', err);
      setCardChatMessages(prev => [...prev, { role: 'assistant', text: '⚠️ 네트워크 오류가 발생했어요.' }]);
    } finally {
      setCardChatLoading(false);
    }
  };

  const cardChatSection = (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <button
        type="button"
        onClick={() => setCardChatOpen(v => !v)}
        className="w-full py-2 bg-gradient-to-r from-blue-50 to-purple-50 text-blue-600 font-bold text-[11px] rounded-lg border border-blue-200 hover:from-blue-100 hover:to-purple-100"
      >
        {cardChatOpen ? '✕ 채팅 닫기' : '💬 AI 채팅으로 이 카드 수정'}
      </button>

      {cardChatOpen && (
        <div className="mt-2 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
          <div className="h-40 overflow-y-auto p-3 space-y-2">
            {cardChatMessages.length === 0 && (
              <div className="text-center py-4">
                <p className="text-[11px] text-slate-500 mb-2">이 슬라이드에 대해 물어보세요</p>
                <div className="flex flex-wrap gap-1 justify-center">
                  {['내용 보강해줘', '더 구체적으로', '톤 바꿔줘', '수치 넣어줘'].map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setCardChatInput(q)}
                      className="px-2 py-0.5 bg-white text-slate-500 text-[9px] rounded-full border border-slate-200 hover:bg-slate-100"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {cardChatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-2.5 py-1.5 rounded-lg text-[11px] whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {cardChatLoading && (
              <div className="flex justify-start">
                <div className="bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="p-2 border-t border-slate-200 flex gap-1.5">
            <input
              type="text"
              value={cardChatInput}
              onChange={(e) => setCardChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCardChatSend();
                }
              }}
              placeholder="수정 요청... (Shift+Enter로 줄바꿈)"
              disabled={cardChatLoading}
              className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleCardChatSend}
              disabled={cardChatLoading || !cardChatInput.trim()}
              className="px-3 py-1.5 bg-blue-500 text-white text-[10px] font-bold rounded-lg disabled:opacity-50"
            >
              전송
            </button>
          </div>
        </div>
      )}
    </div>
  );

  /** AI 추천 버튼이 붙은 라벨 */
  const [aiMenuField, setAiMenuField] = useState<string | null>(null);

  const fieldLabel = (label: string, field: 'title' | 'subtitle' | 'body') => (
    <div className="flex items-center justify-between mb-0.5">
      <label className="text-[10px] font-semibold text-slate-500">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setAiMenuField(aiMenuField === field ? null : field)}
          disabled={isSuggesting(field)}
          className="text-[9px] font-bold text-purple-600 hover:text-purple-700 disabled:opacity-50"
        >
          {isSuggesting(field) ? '✨ AI 작업 중...' : '✨ AI'}
        </button>
        {aiMenuField === field && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-[200] py-1 min-w-[140px]">
            <button type="button" onClick={() => { setAiMenuField(null); onAiSuggestText(field); }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-slate-700 hover:bg-blue-50 font-semibold">✨ 새로 추천</button>
            <button type="button" onClick={async () => {
              setAiMenuField(null);
              const current = field === 'title' ? slide.title : field === 'subtitle' ? slide.subtitle : slide.body;
              if (!current) return;
              try {
                const res = await fetch('/api/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prompt: `"${current}"\n\n위 텍스트를 더 매력적이고 클릭하고 싶게 다시 써줘. 같은 의미, 더 끌리는 표현. 결과만 출력.\n⚠️ 의료광고법 준수: 최상급/단정/행동유도 금지.`, model: 'gemini-3.1-flash-lite-preview', temperature: 0.8, maxOutputTokens: 200 }) });
                const data = await res.json() as { text?: string };
                if (data.text) onChange({ [field]: data.text.replace(/^["'`]+|["'`]+$/g, '').trim() });
              } catch { alert('AI 처리 중 오류가 발생했습니다.'); }
            }} className="w-full text-left px-3 py-1.5 text-[11px] text-slate-700 hover:bg-blue-50">💡 더 끌리게</button>
            <button type="button" onClick={async () => {
              setAiMenuField(null);
              const current = field === 'title' ? slide.title : field === 'subtitle' ? slide.subtitle : slide.body;
              if (!current) return;
              try {
                const res = await fetch('/api/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prompt: `"${current}"\n\n위 텍스트를 절반 길이로 줄여줘. 핵심만 남기고. 결과만 출력.\n⚠️ 의료광고법 준수: 최상급/단정/행동유도 금지.`, model: 'gemini-3.1-flash-lite-preview', temperature: 0.5, maxOutputTokens: 100 }) });
                const data = await res.json() as { text?: string };
                if (data.text) onChange({ [field]: data.text.replace(/^["'`]+|["'`]+$/g, '').trim() });
              } catch { alert('AI 처리 중 오류가 발생했습니다.'); }
            }} className="w-full text-left px-3 py-1.5 text-[11px] text-slate-700 hover:bg-blue-50">✂️ 줄여줘</button>
            <button type="button" onClick={async () => {
              setAiMenuField(null);
              const current = field === 'title' ? slide.title : field === 'subtitle' ? slide.subtitle : slide.body;
              if (!current) return;
              try {
                const res = await fetch('/api/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prompt: `"${current}"\n\n위 텍스트를 더 따뜻하고 공감가는 톤으로 바꿔줘. 결과만 출력.\n⚠️ 의료광고법 준수: 최상급/단정/행동유도 금지.`, model: 'gemini-3.1-flash-lite-preview', temperature: 0.8, maxOutputTokens: 200 }) });
                const data = await res.json() as { text?: string };
                if (data.text) onChange({ [field]: data.text.replace(/^["'`]+|["'`]+$/g, '').trim() });
              } catch { alert('AI 처리 중 오류가 발생했습니다.'); }
            }} className="w-full text-left px-3 py-1.5 text-[11px] text-slate-700 hover:bg-blue-50">🤗 따뜻하게</button>
          </div>
        )}
      </div>
    </div>
  );

  const isEnriching = aiSuggestingKey === `${slideIdx}:enrich`;

  // 공통 필드: title, subtitle + 🔍 웹 검색 보강 버튼
  const common = (
    <>
      <button
        type="button"
        onClick={onAiEnrich}
        disabled={isEnriching}
        className="w-full py-2 bg-green-50 text-green-700 text-[11px] font-bold rounded-lg border border-green-200 hover:bg-green-100 disabled:opacity-50"
      >
        {isEnriching ? '🔍 웹 검색 중...' : '🔍 웹 검색으로 내용 보강'}
      </button>
      <div>
        {fieldLabel('제목', 'title')}
        <textarea value={slide.title} onChange={(e) => onChange({ title: e.target.value })} className={textareaCls} rows={2} />
      </div>
      <div>
        {fieldLabel('부제', 'subtitle')}
        <textarea value={slide.subtitle || ''} onChange={(e) => onChange({ subtitle: e.target.value })} className={textareaCls} rows={2} placeholder="(선택)" />
      </div>
      {/* 카드별 글씨체 — 비워두면 상단 전체 폰트 사용 */}
      <div>
        <label className={labelCls}>이 카드 글씨체 (선택)</label>
        <select
          value={slide.fontId || ''}
          onChange={(e) => {
            const newFontId = e.target.value || undefined;
            onChange({ fontId: newFontId });
            onFontChange(newFontId);
          }}
          className={inputCls}
        >
          <option value="">전체 설정 따름</option>
          {FONT_CATEGORIES.map((cat) => (
            <optgroup key={cat} label={cat}>
              {CARD_FONTS.filter((f) => f.category === cat).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          ))}
          {customFontName && (
            <optgroup label="내 폰트">
              <option value="custom">📁 {customFontDisplayName || customFontName}</option>
            </optgroup>
          )}
        </select>
      </div>
    </>
  );

  // ── 슬라이드 이미지 섹션 (4탭: Pexels / Google / Pinterest / AI 생성) ──
  const hasImage = !!slide.imageUrl;
  const imageSection = (
    <div className="pt-2 mt-2 border-t border-slate-200 space-y-2">
      <label className="text-[10px] font-semibold text-slate-500">슬라이드 이미지</label>

      {/* 이미지 프리뷰 + 삭제 */}
      {hasImage && (
        <div className="relative">
          <img src={slide.imageUrl} alt="" className="w-full h-32 object-contain bg-slate-100 rounded-lg border border-slate-200" />
          <div className="absolute top-1 right-1 flex gap-1">
            <button type="button" onClick={() => { setImageSearchResults([]); handleImageSearch(); }}
              className="px-2 py-0.5 bg-blue-500 text-white text-[9px] font-bold rounded-md shadow hover:bg-blue-600">
              🔄 교체
            </button>
            <button type="button" onClick={() => onChange({ imageUrl: undefined })}
              className="px-2 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-md shadow hover:bg-red-600">
              삭제
            </button>
          </div>
        </div>
      )}

      {/* 배경 제거 + 초점 위치 (이미지 있을 때만) */}
      {hasImage && (
        <div className="space-y-2">
          <button type="button" onClick={async () => {
            if (!slide.imageUrl || removingBg) return;
            setRemovingBg(true);
            try {
              const imgRes = await fetch(slide.imageUrl);
              const blob = await imgRes.blob();
              const fd = new FormData();
              fd.append('image', blob, 'image.png');
              const res = await fetch('/api/remove-bg', { method: 'POST', body: fd });
              const data = await res.json();
              if (data.image) onChange({ imageUrl: data.image });
            } catch { /* ignore */ }
            setRemovingBg(false);
          }} disabled={removingBg}
            className="w-full py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 disabled:opacity-50">
            {removingBg ? '처리 중...' : '✂️ 배경 제거'}
          </button>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 mb-1 block">초점 위치</label>
            <div className="grid grid-cols-3 gap-1" style={{ maxWidth: '140px' }}>
              {[
                { label: '↖', x: 20, y: 20 }, { label: '↑', x: 50, y: 20 }, { label: '↗', x: 80, y: 20 },
                { label: '←', x: 20, y: 50 }, { label: '●', x: 50, y: 50 }, { label: '→', x: 80, y: 50 },
                { label: '↙', x: 20, y: 80 }, { label: '↓', x: 50, y: 80 }, { label: '↘', x: 80, y: 80 },
              ].map(pos => (
                <button key={pos.label} type="button"
                  onClick={() => onChange({ imageFocalPoint: { x: pos.x, y: pos.y } })}
                  className={`py-1.5 text-xs font-bold rounded ${
                    (slide.imageFocalPoint?.x ?? 50) === pos.x && (slide.imageFocalPoint?.y ?? 50) === pos.y
                      ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}>
                  {pos.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 이미지 위치 */}
      <div>
        <label className="text-[10px] font-semibold text-slate-500 mb-1 block">이미지 위치</label>
        <div className="grid grid-cols-4 gap-1">
          {(['top', 'bottom', 'background', 'center'] as const).map((pos) => (
            <button key={pos} type="button"
              onClick={() => onChange({ imagePosition: pos as SlideImagePosition })}
              className={`py-1.5 text-[10px] font-bold rounded-lg transition-colors ${
                (slide.imagePosition || 'top') === pos ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}>
              {pos === 'top' ? '상단' : pos === 'bottom' ? '하단' : pos === 'background' ? '배경' : '중앙'}
            </button>
          ))}
        </div>
      </div>

      {/* ── 3탭 소스 선택 ── */}
      <div className="flex gap-1">
        {([
          { id: 'pexels' as const, label: '실사 사진', icon: '📷' },
          { id: 'pixabay' as const, label: '일러스트/벡터', icon: '🎨' },
          { id: 'ai' as const, label: 'AI 생성', icon: '✨' },
        ]).map(tab => (
          <button key={tab.id} type="button" onClick={() => { setImageTab(tab.id); setImageSearchResults([]); }}
            className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
              imageTab === tab.id ? 'bg-blue-500 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── 검색 탭 (Pexels / Pixabay) ── */}
      {imageTab !== 'ai' && (
        <div className="space-y-2">
          {imageTab === 'pixabay' && (
            <div className="flex gap-1">
              {([
                { type: 'illustration' as const, label: '일러스트' },
                { type: 'vector' as const, label: '벡터' },
                { type: 'photo' as const, label: '사진' },
                { type: 'all' as const, label: '전체' },
              ]).map(t => (
                <button key={t.type} type="button"
                  onClick={() => setPixabayType(t.type)}
                  className={`px-2 py-1 text-[9px] font-semibold rounded-md transition-all ${
                    pixabayType === t.type ? 'bg-blue-100 text-blue-700' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <input type="text" value={imageSearchQuery}
              onChange={e => setImageSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleImageSearch()}
              placeholder={imageTab === 'pexels' ? '영문 예: dental clinic, teeth' : '예: 치아, 임플란트, dental'}
              className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            <button type="button" onClick={async () => {
              try {
                const res = await fetch('/api/pexels-query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: slide.title + ' ' + (slide.subtitle || '') }) });
                const { query } = await res.json();
                setImageSearchQuery(query);
              } catch { /* ignore */ }
            }} className="px-2.5 py-2 bg-purple-50 text-purple-600 text-[10px] font-bold rounded-lg border border-purple-200 hover:bg-purple-100 shrink-0">✨ AI</button>
            <button type="button" onClick={handleImageSearch} disabled={imageSearchLoading}
              className="px-3 py-2 bg-blue-500 text-white text-xs font-bold rounded-lg disabled:opacity-50 hover:bg-blue-600 shrink-0">
              {imageSearchLoading ? '...' : '검색'}
            </button>
          </div>

          {imageSearchResults.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2 max-h-[280px] overflow-y-auto">
                {imageSearchResults.map((photo) => (
                  <button key={photo.id} type="button" onClick={() => handleSelectSearchImage(photo)}
                    className="relative group rounded-lg overflow-hidden border border-slate-200 hover:border-blue-400 transition-all aspect-square">
                    <img src={photo.thumb || photo.url} alt={photo.alt || ''}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold opacity-0 group-hover:opacity-100">선택</span>
                    </div>
                    <span className="absolute bottom-1 right-1 text-[8px] bg-black/50 text-white px-1.5 py-0.5 rounded">
                      {photo.source === 'pixabay' ? 'Pixabay' : 'Pexels'}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-slate-400 text-center">
                {imageTab === 'pixabay'
                  ? <>🎨 Images by <a href="https://pixabay.com" target="_blank" rel="noreferrer" className="underline">Pixabay</a> · 저작권 무료</>
                  : <>📷 Photos by <a href="https://www.pexels.com" target="_blank" rel="noreferrer" className="underline">Pexels</a> · 저작권 무료</>
                }
              </p>
            </>
          )}
        </div>
      )}

      {/* ── AI 생성 탭 ── */}
      {imageTab === 'ai' && (
        <div className="space-y-2">
          {/* 프롬프트 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-slate-500">이미지 프롬프트 (영문)</span>
              <button type="button" onClick={onSuggestImagePrompt}
                disabled={aiSuggestingKey === `${slideIdx}:imgprompt`}
                className="text-[9px] font-bold text-purple-600 hover:text-purple-700 disabled:opacity-50">
                {aiSuggestingKey === `${slideIdx}:imgprompt` ? '추천 중...' : '✨ AI 추천'}
              </button>
            </div>
            <textarea value={slide.visualKeyword || ''} onChange={(e) => onChange({ visualKeyword: e.target.value })}
              placeholder="예: dental implant titanium screws, 3D render, clean white background"
              rows={2} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700 resize-none focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200" />
          </div>
          {/* 스타일 */}
          <div className="flex gap-1 flex-wrap">
            {SLIDE_IMAGE_STYLES.map((style) => (
              <button key={style.id} type="button"
                onClick={() => onChange({ imageStyle: style.id as SlideImageStyle })}
                className={`px-2 py-1 text-[9px] rounded-lg border transition-all ${
                  (slide.imageStyle || 'illustration') === style.id
                    ? 'border-blue-400 bg-blue-50 text-blue-700 font-bold'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}>
                {style.name}
              </button>
            ))}
          </div>
          {/* 이미지 비율 선택 */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 mb-1 block">이미지 비율</label>
            <div className="flex gap-1">
              {(['1:1', '4:5', '9:16', '16:9', '3:4'] as const).map(ratio => (
                <button key={ratio} type="button"
                  onClick={() => onChange({ imageRatio: ratio })}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                    (slide.imageRatio || '1:1') === ratio
                      ? 'bg-purple-500 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}>
                  {ratio}
                </button>
              ))}
            </div>
          </div>
          {/* AI 생성 버튼 */}
          <button type="button" onClick={onGenerateImage} disabled={generatingImage}
            className="w-full py-2 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg border border-blue-200 hover:bg-blue-100 disabled:opacity-50">
            {generatingImage ? (
              <span className="flex items-center justify-center gap-1">
                <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />생성 중...
              </span>
            ) : hasImage ? '🔄 AI 이미지 재생성' : '🎨 AI 이미지 생성'}
          </button>
        </div>
      )}

      {/* ── 직접 업로드 (항상 표시) ── */}
      <div className="pt-2 border-t border-slate-100">
        <label className="w-full py-2 bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg border border-slate-200 hover:bg-slate-100 cursor-pointer text-center flex items-center justify-center">
          {hasImage ? '📁 이미지 교체' : '📁 직접 업로드'}
          <input type="file" accept="image/*" className="hidden"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) onUploadImage(file); e.target.value = ''; }} />
        </label>
      </div>
    </div>
  );

  // ── 레이아웃별 데이터 편집 (아코디언 안에 들어갈 내용) ──
  const renderLayoutDataEditor = () => {
    if (slide.layout === 'info' || slide.layout === 'closing') {
      return (
        <>
          <ElementAccordion icon="T" label="본문" defaultOpen={false}>
            <TextElementEditor value={slide.body || ''} onChange={v => onChange({ body: v })} multiline
              fontSize={slide.bodyFontSize} fontColor={slide.bodyColor} lineHeight={slide.bodyLineHeight}
              onStyleChange={(key, val) => onChange({ [key]: val })} prefix="body" />
          </ElementAccordion>
          {renderCharCount('body', slide.body || '')}
          {renderViolations('body', bodyViolations)}
        </>
      );
    }
    if (slide.layout === 'comparison') {
      const cols = slide.columns || [];
      const labels = slide.compareLabels || [];
      const updateCol = (ci: number, patch: Partial<typeof cols[number]>) => {
        onChange({ columns: cols.map((c, i) => (i === ci ? { ...c, ...patch } : c)) });
      };
      const updateColItem = (ci: number, ri: number, value: string) => {
        onChange({ columns: cols.map((c, i) => {
          if (i !== ci) return c;
          const items = [...c.items]; items[ri] = value; return { ...c, items };
        }) });
      };
      const updateLabel = (ri: number, value: string) => {
        const next = [...labels]; next[ri] = value; onChange({ compareLabels: next });
      };
      return (
        <ElementAccordion icon="T" label={`비교표 (${cols.length}열 × ${labels.length}행)`} defaultOpen={false}>
          <div className="space-y-2">
            <label className={labelCls}>컬럼 헤더</label>
            <div className="grid grid-cols-2 gap-1.5">
              {cols.map((c, ci) => (
                <input key={ci} type="text" value={c.header} onChange={(e) => updateCol(ci, { header: e.target.value })} className={inputCls} />
              ))}
            </div>
            <label className={labelCls}>행 데이터</label>
            <div className="space-y-1.5">
              {labels.map((lbl, ri) => (
                <div key={ri} className="grid grid-cols-[110px_1fr_1fr] gap-1.5 items-center">
                  <input type="text" value={lbl} onChange={(e) => updateLabel(ri, e.target.value)} className={inputCls} placeholder={`라벨 ${ri + 1}`} />
                  {cols.map((c, ci) => (
                    <input key={ci} type="text" value={c.items[ri] || ''} onChange={(e) => updateColItem(ci, ri, e.target.value)} className={inputCls} placeholder={c.header} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </ElementAccordion>
      );
    }
    if (slide.layout === 'icon-grid') {
      const items = slide.icons || [];
      const updateIcon = (i: number, patch: Partial<typeof items[number]>) => {
        onChange({ icons: items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
      };
      return (
        <ElementAccordion icon="T" label={`아이콘 (${items.length}개)`} defaultOpen={false}>
          <div className="space-y-1.5">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[44px_1fr_1.6fr] gap-1.5">
                <input type="text" value={it.emoji} onChange={(e) => updateIcon(i, { emoji: e.target.value })} className={`${inputCls} text-center`} />
                <input type="text" value={it.title} onChange={(e) => updateIcon(i, { title: e.target.value })} className={inputCls} placeholder="제목" />
                <input type="text" value={it.desc || ''} onChange={(e) => updateIcon(i, { desc: e.target.value })} className={inputCls} placeholder="설명" />
              </div>
            ))}
          </div>
        </ElementAccordion>
      );
    }
    if (slide.layout === 'steps') {
      const steps = slide.steps || [];
      const updateStep = (i: number, patch: Partial<typeof steps[number]>) => {
        onChange({ steps: steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
      };
      return (
        <ElementAccordion icon="T" label={`단계 (${steps.length}개)`} defaultOpen={false}>
          <div className="space-y-1.5">
            {steps.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.6fr] gap-1.5">
                <input type="text" value={s.label} onChange={(e) => updateStep(i, { label: e.target.value })} className={inputCls} placeholder={`단계 ${i + 1}`} />
                <input type="text" value={s.desc || ''} onChange={(e) => updateStep(i, { desc: e.target.value })} className={inputCls} placeholder="설명" />
              </div>
            ))}
          </div>
        </ElementAccordion>
      );
    }
    if (slide.layout === 'checklist') {
      const checks = slide.checkItems || [];
      const updateCheck = (i: number, value: string) => { const next = [...checks]; next[i] = value; onChange({ checkItems: next }); };
      return (
        <ElementAccordion icon="T" label={`체크리스트 (${checks.length}개)`} defaultOpen={false}>
          <div className="space-y-1.5">
            {checks.map((c, i) => (
              <input key={i} type="text" value={c} onChange={(e) => updateCheck(i, e.target.value)} className={inputCls} />
            ))}
          </div>
        </ElementAccordion>
      );
    }
    if (slide.layout === 'data-highlight') {
      const points = slide.dataPoints || [];
      const updateDp = (i: number, patch: Partial<typeof points[number]>) => {
        onChange({ dataPoints: points.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
      };
      return (
        <ElementAccordion icon="T" label={`수치 데이터 (${points.length}개)`} defaultOpen={false}>
          <div className="space-y-1.5">
            {points.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_2fr] gap-1.5">
                <input type="text" value={p.value} onChange={(e) => updateDp(i, { value: e.target.value })} className={`${inputCls} font-bold text-center`} placeholder="90%" />
                <input type="text" value={p.label} onChange={(e) => updateDp(i, { label: e.target.value })} className={inputCls} placeholder="라벨" />
              </div>
            ))}
          </div>
        </ElementAccordion>
      );
    }
    return null;
  };

  // ═══════════════════════════════════════
  // 최종 렌더: 편집 / AI 2탭
  // ═══════════════════════════════════════
  return (
    <div className="space-y-3">
      {/* 2탭 헤더 */}
      <div className="flex border-b border-slate-200">
        <button type="button" onClick={() => setEditMode('edit')}
          className={`flex-1 py-2.5 text-sm font-bold border-b-2 transition-all ${
            editMode === 'edit' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400'
          }`}>
          ⚙️ 편집
        </button>
        <button type="button" onClick={() => setEditMode('ai')}
          className={`flex-1 py-2.5 text-sm font-bold border-b-2 transition-all ${
            editMode === 'ai' ? 'border-purple-500 text-purple-600' : 'border-transparent text-slate-400'
          }`}>
          ✨ AI 디자이너
        </button>
      </div>

      {/* ── 편집 탭 ── */}
      {editMode === 'edit' && (
        <div className="space-y-2">
          {/* 중첩 필드 위반 요약 — title/subtitle/body/visualKeyword 외 필드에 위반이 있으면 상단에 경고 */}
          {renderNestedFieldSummary()}

          {/* 이미지 */}
          <ElementAccordion icon="🖼" label={slide.imageUrl ? '이미지' : '이미지 추가'} defaultOpen={false}>
            {imageSection}
          </ElementAccordion>
          {/* visualKeyword (이미지 프롬프트) 위반 — 이미지에 그 텍스트가 들어갈 수 있어서 특히 중요 */}
          {visualKeywordViolations.length > 0 && (
            <div className="-mt-1 mb-1">
              <div className="text-[10px] font-bold text-red-700 mb-0.5 px-0.5">
                ⛔ 이미지 프롬프트 위반 — 이 텍스트가 이미지에 그려질 수 있어요
              </div>
              {renderViolations('visualKeyword', visualKeywordViolations)}
            </div>
          )}

          {/* 제목 */}
          <ElementAccordion icon="T" label={slide.title || '제목'} defaultOpen={true}>
            <TextElementEditor value={slide.title} onChange={v => onChange({ title: v })}
              fontId={slide.titleFontId} fontSize={slide.titleFontSize} fontWeight={slide.titleFontWeight}
              fontColor={slide.titleColor} letterSpacing={slide.titleLetterSpacing}
              lineHeight={slide.titleLineHeight}
              onStyleChange={(key, val) => onChange({ [key]: val })} prefix="title" />
          </ElementAccordion>
          {renderCharCount('title', slide.title || '')}
          {renderViolations('title', titleViolations)}

          {/* 텍스트 정렬 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <p className="text-[10px] text-slate-400 mb-1">가로 정렬</p>
              <div className="flex gap-1">
                {([['left', '좌'], ['center', '중앙'], ['right', '우']] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => onChange({ titleAlign: v })}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${
                      (slide.titleAlign || 'left') === v ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                    }`}>{l}</button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-slate-400 mb-1">세로 정렬</p>
              <div className="flex gap-1">
                {([['top', '상'], ['center', '중앙'], ['bottom', '하']] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => onChange({ contentAlignV: v })}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${
                      (slide.contentAlignV || 'center') === v ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                    }`}>{l}</button>
                ))}
              </div>
            </div>
          </div>

          {/* 슬라이드 배경색 */}
          <div>
            <p className="text-[10px] text-slate-400 mb-1">배경색</p>
            <div className="flex flex-wrap gap-1.5">
              {['', '#FFFFFF', '#F7FAFC', '#FDF6EC', '#FFF0F5', '#E0F5EC', '#F3EEFF', '#1B2A4A', '#2D3436', '#000000'].map(c => (
                <button key={c || 'default'} type="button"
                  onClick={() => onChange({ bgColor: c || undefined, bgGradient: undefined })}
                  className={`w-7 h-7 rounded-lg border-2 transition-transform ${
                    (slide.bgColor || '') === c ? 'border-blue-500 scale-110' : 'border-slate-200 hover:scale-105'
                  }`}
                  style={{ background: c || 'linear-gradient(135deg, #eee 25%, transparent 25%, transparent 75%, #eee 75%)', backgroundSize: c ? undefined : '8px 8px' }}
                  title={c || '테마 기본값'}
                />
              ))}
              <label className="w-7 h-7 rounded-lg border-2 border-slate-200 overflow-hidden cursor-pointer hover:scale-105 bg-gradient-to-br from-red-400 via-green-400 to-blue-400" title="직접 선택">
                <input type="color" value={slide.bgColor || '#FFFFFF'} onChange={e => onChange({ bgColor: e.target.value, bgGradient: undefined })} className="opacity-0 w-0 h-0" />
              </label>
            </div>
          </div>

          {/* 텍스트 그림자 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!slide.textShadow} onChange={e => onChange({ textShadow: e.target.checked })}
              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600" />
            <span className="text-[10px] font-semibold text-slate-500">텍스트 그림자 (배경 이미지 위 가독성)</span>
          </label>

          {/* 부제 */}
          <ElementAccordion icon="T" label={slide.subtitle || '부제'} defaultOpen={false}>
            <TextElementEditor value={slide.subtitle || ''} onChange={v => onChange({ subtitle: v })}
              fontId={slide.subtitleFontId} fontSize={slide.subtitleFontSize} fontWeight={slide.subtitleFontWeight}
              fontColor={slide.subtitleColor} letterSpacing={slide.subtitleLetterSpacing}
              lineHeight={slide.subtitleLineHeight}
              onStyleChange={(key, val) => onChange({ [key]: val })} prefix="subtitle" />
          </ElementAccordion>
          {renderCharCount('subtitle', slide.subtitle || '')}
          {renderViolations('subtitle', subtitleViolations)}

          {/* 레이아웃별 데이터 */}
          {renderLayoutDataEditor()}

          {/* 병원명 스타일 */}
          {true && (
            <ElementAccordion icon="🏥" label="병원명 스타일" defaultOpen={false}>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-slate-400 mb-1">병원명 글씨체</p>
                  <select value={slide.hospitalFontId || ''} onChange={e => onChange({ hospitalFontId: e.target.value || undefined })}
                    className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400">
                    <option value="">전체 폰트와 동일</option>
                    {CARD_FONTS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 mb-1">병원명 크기</p>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => onChange({ hospitalFontSize: (slide.hospitalFontSize || 14) - 1 })} className="w-7 h-7 bg-slate-100 rounded text-xs font-bold hover:bg-slate-200">−</button>
                    <input type="number" value={slide.hospitalFontSize || 14} onChange={e => onChange({ hospitalFontSize: Number(e.target.value) })} className="w-14 h-7 text-center text-xs bg-white border border-slate-200 rounded" />
                    <button type="button" onClick={() => onChange({ hospitalFontSize: (slide.hospitalFontSize || 14) + 1 })} className="w-7 h-7 bg-slate-100 rounded text-xs font-bold hover:bg-slate-200">+</button>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 mb-1">로고 크기</p>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => onChange({ hospitalLogoSize: (slide.hospitalLogoSize || 40) - 4 })} className="w-7 h-7 bg-slate-100 rounded text-xs font-bold hover:bg-slate-200">−</button>
                    <input type="number" value={slide.hospitalLogoSize || 40} onChange={e => onChange({ hospitalLogoSize: Number(e.target.value) })} className="w-14 h-7 text-center text-xs bg-white border border-slate-200 rounded" />
                    <button type="button" onClick={() => onChange({ hospitalLogoSize: (slide.hospitalLogoSize || 40) + 4 })} className="w-7 h-7 bg-slate-100 rounded text-xs font-bold hover:bg-slate-200">+</button>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 mb-1">색상</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['#FFFFFF', '#000000', '#333333', '#999999', 'rgba(255,255,255,0.5)', 'rgba(0,0,0,0.3)'].map(c => (
                      <button key={c} type="button" onClick={() => onChange({ hospitalColor: c })}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${slide.hospitalColor === c ? 'border-blue-500 scale-110' : 'border-slate-200 hover:scale-105'}`} style={{ background: c }} />
                    ))}
                    <label className="w-6 h-6 rounded-full border-2 border-slate-200 overflow-hidden cursor-pointer hover:scale-105 bg-gradient-to-br from-red-400 via-green-400 to-blue-400" title="스포이드">
                      <input type="color" value={slide.hospitalColor || '#000000'} onChange={e => onChange({ hospitalColor: e.target.value })} className="opacity-0 w-0 h-0" />
                    </label>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 mb-1">굵기</p>
                  <div className="flex gap-1">
                    {[{ l: 'L', v: '400' }, { l: 'N', v: '500' }, { l: 'M', v: '600' }, { l: 'B', v: '700' }, { l: 'XB', v: '800' }].map(w => (
                      <button key={w.l} type="button" onClick={() => onChange({ hospitalFontWeight: w.v })}
                        className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg border ${(slide.hospitalFontWeight || '600') === w.v ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}>{w.l}</button>
                    ))}
                  </div>
                </div>
              </div>
            </ElementAccordion>
          )}

          {/* 아이콘 커스텀 (레이아웃별) */}
          {slide.layout === 'checklist' && (
            <ElementAccordion icon="✓" label="체크 아이콘" defaultOpen={false}>
              <IconChangerPopover currentIcon={slide.checkIcon || '✓'} onSelect={ic => onChange({ checkIcon: ic })} />
            </ElementAccordion>
          )}
          {slide.layout === 'data-highlight' && (
            <ElementAccordion icon="⬡" label="도형 모양" defaultOpen={false}>
              <div className="flex gap-1.5 flex-wrap">
                {([
                  { id: 'circle' as const, label: '⭕ 원형' },
                  { id: 'rounded' as const, label: '⬜ 라운드' },
                  { id: 'pill' as const, label: '💊 필' },
                  { id: 'diamond' as const, label: '◆ 다이아몬드' },
                  { id: 'hexagon' as const, label: '⬡ 육각형' },
                ]).map(shape => (
                  <button key={shape.id} type="button" onClick={() => onChange({ dataShape: shape.id })}
                    className={`px-3 py-1.5 text-[10px] font-semibold rounded-lg border transition-all ${
                      (slide.dataShape || 'circle') === shape.id ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                    }`}>{shape.label}</button>
                ))}
              </div>
            </ElementAccordion>
          )}
          {slide.layout === 'comparison' && (
            <ElementAccordion icon="⚡" label="VS 아이콘" defaultOpen={false}>
              <IconChangerPopover currentIcon={slide.vsIcon || 'VS'} onSelect={ic => onChange({ vsIcon: ic })} />
            </ElementAccordion>
          )}
          {slide.layout === 'before-after' && (
            <ElementAccordion icon="→" label="화살표 아이콘" defaultOpen={false}>
              <IconChangerPopover currentIcon={slide.baArrowIcon || '→'} onSelect={ic => onChange({ baArrowIcon: ic })} />
            </ElementAccordion>
          )}
          {slide.layout === 'pros-cons' && (
            <ElementAccordion icon="⚖" label="장단점 아이콘" defaultOpen={false}>
              <div className="flex gap-4">
                <div><p className="text-[10px] text-slate-400 mb-1">장점</p><IconChangerPopover currentIcon={slide.prosIcon || 'O'} onSelect={ic => onChange({ prosIcon: ic })} /></div>
                <div><p className="text-[10px] text-slate-400 mb-1">단점</p><IconChangerPopover currentIcon={slide.consIcon || 'X'} onSelect={ic => onChange({ consIcon: ic })} /></div>
              </div>
            </ElementAccordion>
          )}

          {/* 커버/마무리 전용 요소 */}
          {(slide.layout === 'cover' || slide.layout === 'closing') && (
            <>
              <ElementAccordion icon="🎨" label="커버 스타일" defaultOpen={false}>
                <div className="grid grid-cols-5 gap-1.5">
                  <button type="button" onClick={() => onChange({ coverTemplateId: undefined })}
                    className={`rounded-lg overflow-hidden aspect-[4/5] border-2 flex items-center justify-center text-[10px] text-slate-400 ${!slide.coverTemplateId ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>기본</button>
                  {COVER_TEMPLATES.map(tmpl => (
                    <button key={tmpl.id} type="button" onClick={() => onChange({ coverTemplateId: tmpl.id })}
                      className={`rounded-lg overflow-hidden aspect-[4/5] border-2 ${slide.coverTemplateId === tmpl.id ? 'border-blue-500' : 'border-slate-200'}`}>
                      <div style={{ background: tmpl.thumbnail, width: '100%', height: '100%' }} />
                    </button>
                  ))}
                </div>
              </ElementAccordion>
            </>
          )}

          {/* 카드별 글씨체 */}
          <ElementAccordion icon="🎨" label="카드 글씨체" defaultOpen={false}>
            <select value={slide.fontId || ''} onChange={(e) => { onChange({ fontId: e.target.value || undefined }); onFontChange(e.target.value || undefined); }} className={inputCls}>
              <option value="">전체 설정 따름</option>
              {FONT_CATEGORIES.map((cat) => (
                <optgroup key={cat} label={cat}>
                  {CARD_FONTS.filter((f) => f.category === cat).map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </optgroup>
              ))}
              {customFontName && <optgroup label="내 폰트"><option value="custom">📁 {customFontDisplayName || customFontName}</option></optgroup>}
            </select>
          </ElementAccordion>

          {/* 장식 요소 */}
          <ElementAccordion icon="🎨" label={`장식 요소${(slide.decorations?.length || 0) > 0 ? ` (${slide.decorations!.length})` : ''}`} defaultOpen={false}>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {([
                  { type: 'star' as const, icon: '⭐', label: '별' },
                  { type: 'circle' as const, icon: '⭕', label: '원' },
                  { type: 'line' as const, icon: '➖', label: '선' },
                  { type: 'arrow' as const, icon: '›', label: '화살표' },
                  { type: 'badge' as const, icon: '🏷️', label: '뱃지' },
                  { type: 'corner' as const, icon: '┏', label: '코너' },
                  { type: 'dots' as const, icon: '•••', label: '점' },
                  { type: 'wave' as const, icon: '〰️', label: '물결' },
                ]).map(item => (
                  <button key={item.type} type="button"
                    onClick={() => {
                      const newDeco: SlideDecoration = {
                        id: `deco-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
                        type: item.type,
                        position: { top: `${20 + Math.random() * 60}%`, left: `${10 + Math.random() * 70}%` },
                        size: item.type === 'line' ? 30 : item.type === 'badge' ? 40 : 50,
                        color: accentColor,
                        opacity: 0.3,
                        rotation: item.type === 'star' ? Math.floor(Math.random() * 30) - 15 : 0,
                      };
                      onChange({ decorations: [...(slide.decorations || []), newDeco] });
                    }}
                    className="px-3 py-1.5 text-[10px] font-semibold bg-slate-100 text-slate-600 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-all">
                    {item.icon} {item.label}
                  </button>
                ))}
              </div>
              {(slide.decorations || []).map((deco) => (
                <div key={deco.id} className="p-2.5 bg-slate-50 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 w-8 shrink-0">
                      {deco.type === 'star' ? '⭐' : deco.type === 'circle' ? '⭕' : deco.type === 'line' ? '➖' : deco.type === 'arrow' ? '›' : deco.type === 'badge' ? '🏷️' : deco.type === 'corner' ? '┏' : deco.type === 'dots' ? '•••' : '〰️'}
                    </span>
                    <div className="flex-1 flex items-center gap-1">
                      <span className="text-[8px] text-slate-400">크기</span>
                      <input type="range" min="20" max="120" value={deco.size}
                        onChange={e => onChange({ decorations: (slide.decorations || []).map(d => d.id === deco.id ? { ...d, size: Number(e.target.value) } : d) })}
                        className="w-12 h-1 accent-blue-500" />
                      <span className="text-[8px] text-slate-400">투명</span>
                      <input type="range" min="10" max="100" value={Math.round(deco.opacity * 100)}
                        onChange={e => onChange({ decorations: (slide.decorations || []).map(d => d.id === deco.id ? { ...d, opacity: Number(e.target.value) / 100 } : d) })}
                        className="w-12 h-1 accent-blue-500" />
                    </div>
                    <button type="button" onClick={() => onChange({ decorations: (slide.decorations || []).filter(d => d.id !== deco.id) })}
                      className="text-red-400 hover:text-red-600 text-xs font-bold shrink-0">✕</button>
                  </div>
                  {/* 색상 + 위치 */}
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] text-slate-400">색상</span>
                    <div className="flex gap-1">
                      {['#FFFFFF', '#000000', '#F5A623', '#3B82F6', '#EF4444', '#22C55E'].map(c => (
                        <button key={c} type="button" onClick={() => onChange({ decorations: (slide.decorations || []).map(d => d.id === deco.id ? { ...d, color: c } : d) })}
                          className={`w-4 h-4 rounded-full border ${deco.color === c ? 'border-blue-500 scale-110' : 'border-slate-200'}`} style={{ background: c }} />
                      ))}
                      <label className="w-4 h-4 rounded-full border border-slate-200 overflow-hidden cursor-pointer bg-gradient-to-br from-red-400 via-green-400 to-blue-400">
                        <input type="color" value={deco.color} onChange={e => onChange({ decorations: (slide.decorations || []).map(d => d.id === deco.id ? { ...d, color: e.target.value } : d) })} className="opacity-0 w-0 h-0" />
                      </label>
                    </div>
                    <span className="text-[8px] text-slate-400 ml-1">위치</span>
                    <input type="text" value={deco.position.top} onChange={e => onChange({ decorations: (slide.decorations || []).map(d => d.id === deco.id ? { ...d, position: { ...d.position, top: e.target.value } } : d) })}
                      className="w-12 px-1 py-0.5 text-[9px] bg-white border border-slate-200 rounded" placeholder="top" />
                    <input type="text" value={deco.position.left} onChange={e => onChange({ decorations: (slide.decorations || []).map(d => d.id === deco.id ? { ...d, position: { ...d.position, left: e.target.value } } : d) })}
                      className="w-12 px-1 py-0.5 text-[9px] bg-white border border-slate-200 rounded" placeholder="left" />
                  </div>
                </div>
              ))}
            </div>
          </ElementAccordion>

          {/* 요소 추가 */}
          <div className="pt-3 border-t border-slate-100 mt-2">
            <p className="text-[10px] text-slate-400 mb-2">요소 추가</p>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => onChange({ body: (slide.body || '') + '\n추가 텍스트' })}
                className="py-2.5 text-[11px] font-semibold bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all">T 텍스트</button>
              <button type="button" onClick={() => {
                // 이미지 탭 열기
                setImageTab('pexels');
              }}
                className="py-2.5 text-[11px] font-semibold bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all">🖼 이미지</button>
              <button type="button" onClick={() => onChange({ showBadge: true, badge: slide.badge || '병원명' })}
                className="py-2.5 text-[11px] font-semibold bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all">🏥 로고</button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI 디자이너 탭 ── */}
      {editMode === 'ai' && (
        <div className="space-y-4">
          {/* 헤더 */}
          <div className="text-center py-4">
            <div className="text-3xl mb-2">💬</div>
            <h3 className="text-base font-bold text-slate-800">무엇을 수정할까요?</h3>
            <p className="text-xs text-slate-400 mt-1">배경색, 폰트, 레이아웃 등 원하는 수정을 자연어로 말해주세요.</p>
          </div>

          {/* 예시 */}
          <div>
            <p className="text-[10px] text-slate-400 mb-2">💡 이렇게 말해보세요:</p>
            <div className="space-y-1.5">
              {['"배경색을 더 밝은 베이지로 바꿔줘"', '"제목 폰트를 더 크고 굵게 해줘"', '"텍스트에 은은한 그림자 효과 추가해줘"'].map((ex, i) => (
                <button key={i} type="button" onClick={() => setCardChatInput(ex.replace(/"/g, ''))}
                  className="w-full text-left px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-600 hover:border-purple-300 hover:bg-purple-50 transition-all">
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* 빠른 수정 버튼 */}
          <div>
            <p className="text-[10px] text-slate-400 mb-2">빠른 수정:</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: '더 밝게', action: () => onAiSuggestText('title') },
                { label: '더 어둡게', action: () => onAiSuggestText('subtitle') },
                { label: '따뜻한 톤', action: () => onAiEnrich() },
                { label: '차가운 톤', action: () => onAiEnrich() },
                { label: '폰트 크게', action: () => onChange({ titleFontSize: (slide.titleFontSize || 48) + 8 }) },
                { label: '폰트 작게', action: () => onChange({ titleFontSize: Math.max(24, (slide.titleFontSize || 48) - 8) }) },
              ].map(btn => (
                <button key={btn.label} type="button" onClick={btn.action}
                  className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 text-slate-600 transition-all">
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* 기능 버튼 */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onAiEnrich} disabled={aiSuggestingKey === `${slideIdx}:enrich`}
              className="w-full py-2 bg-green-50 text-green-600 text-xs font-bold rounded-xl border border-green-200 hover:bg-green-100 disabled:opacity-50">
              {aiSuggestingKey === `${slideIdx}:enrich` ? '🔍 웹 검색 중...' : '🔍 웹 검색으로 내용 보강'}
            </button>
            {/* AI 이미지 프롬프트 추천은 편집 탭 이미지 섹션에 있음 */}
          </div>

          {/* AI 채팅 */}
          {cardChatSection}
        </div>
      )}
    </div>
  );
}
