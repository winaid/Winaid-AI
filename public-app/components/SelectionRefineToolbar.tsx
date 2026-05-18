'use client';

/**
 * SelectionRefineToolbar — 블로그 에디터의 _선택 구간 다듬기_ UI.
 *
 * 사용:
 *   <SelectionRefineToolbar
 *     editorRef={editorRef}
 *     category="치과"
 *     fetchFn={authFetch}
 *   />
 *
 * 동작:
 *   1. contenteditable 안에서 텍스트 드래그 선택 → 한 단락 안 + 5~2000자 검증 통과 시
 *      선택 영역 위에 floating ✨ 버튼 표시 (Portal).
 *   2. ✨ 클릭 → 옵션 메뉴 (짧게/길게/친근/전문/자유 지시).
 *   3. 옵션 선택 → /api/refine-selection POST → Preview modal (좌·우 비교).
 *   4. [수락] → Range.deleteContents() + insertHTML — DOM 직접 패치.
 *      [거절] → modal 닫기.
 *
 * credit: client-side counter (localStorage `refine-selection-counter`).
 *   10회당 1 credit 차감 안내 표시 — 실제 차감은 follow-up PR (서버 endpoint 필요).
 *   어드민 (window.location.host === next-app 의 어드민 콘솔) 은 카운터 미표시.
 *
 * 양 앱 lockstep: public-app/components/SelectionRefineToolbar.tsx 와 본 파일이 동일.
 * fetchFn prop 으로 authFetch (next-app) vs fetch (public-app) 분기.
 */

import { useEffect, useRef, useState, useCallback, type RefObject, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

export type RefineOption = 'shorter' | 'longer' | 'friendly' | 'professional' | 'custom';

interface Props {
  /** contenteditable article 의 ref. selection 이벤트의 scope. */
  editorRef: RefObject<HTMLElement | null>;
  /** 7 카테고리 — refine prompt 의 category_tone 가이드 활성화. */
  category?: string;
  /** API endpoint. 기본 '/api/refine-selection'. */
  apiPath?: string;
  /** authFetch (next-app) 또는 fetch (public-app). 기본 globalThis.fetch. */
  fetchFn?: typeof fetch;
  /**
   * 수락 시 부모에게 알림 — refined HTML 이 DOM 에 삽입된 직후 호출.
   * onContentChange 같은 동기화 핸들러로 wiring 권장.
   */
  onRefined?: (originalText: string, refinedHtml: string) => void;
  /** counter 표시 숨김 (어드민 경로). 기본 false. */
  hideCounter?: boolean;
}

const OPTION_LABELS: Record<Exclude<RefineOption, 'custom'>, string> = {
  shorter: '짧게',
  longer: '길게',
  friendly: '친근하게',
  professional: '전문적으로',
};

const COUNTER_KEY = 'winaid.refine-selection-counter';
const COUNTER_THRESHOLD = 10;

function readCounter(): number {
  if (typeof localStorage === 'undefined') return 0;
  const v = parseInt(localStorage.getItem(COUNTER_KEY) || '0', 10);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function bumpCounter(): number {
  if (typeof localStorage === 'undefined') return 0;
  const next = readCounter() + 1;
  localStorage.setItem(COUNTER_KEY, String(next % COUNTER_THRESHOLD));
  return next;
}

/**
 * 한 단락 안 선택 + 5~2000자 조건 검증. 통과 시 단락 텍스트·range 반환.
 */
function validateSelection(editor: HTMLElement): {
  range: Range;
  selectedText: string;
  paragraph: HTMLElement;
} | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return null;

  // 양 끝이 같은 <p> 안인지
  const anchorEl = (sel.anchorNode?.nodeType === Node.TEXT_NODE
    ? sel.anchorNode.parentElement
    : (sel.anchorNode as HTMLElement | null));
  const focusEl = (sel.focusNode?.nodeType === Node.TEXT_NODE
    ? sel.focusNode.parentElement
    : (sel.focusNode as HTMLElement | null));
  const anchorP = anchorEl?.closest('p') as HTMLElement | null;
  const focusP = focusEl?.closest('p') as HTMLElement | null;
  if (!anchorP || !focusP || anchorP !== focusP) return null;

  const text = sel.toString().trim();
  if (text.length < 5 || text.length > 2000) return null;

  return { range: range.cloneRange(), selectedText: text, paragraph: anchorP };
}

/** 같은 단락 + 직전·직후 단락 텍스트 + [[SELECTION_START/END]] 마커 보간. */
function buildSurroundingContext(paragraph: HTMLElement, selectedText: string): string {
  const prev = paragraph.previousElementSibling;
  const next = paragraph.nextElementSibling;
  const prevText = prev?.tagName.toLowerCase() === 'p' ? (prev.textContent || '').trim() : '';
  const nextText = next?.tagName.toLowerCase() === 'p' ? (next.textContent || '').trim() : '';

  const fullParaText = (paragraph.textContent || '').trim();
  const idx = fullParaText.indexOf(selectedText);
  const markedPara = idx >= 0
    ? `${fullParaText.slice(0, idx)}[[SELECTION_START]]${selectedText}[[SELECTION_END]]${fullParaText.slice(idx + selectedText.length)}`
    : `[[SELECTION_START]]${selectedText}[[SELECTION_END]]`;

  const parts: string[] = [];
  if (prevText) parts.push(`(직전 단락) ${prevText}`);
  parts.push(`(현재 단락) ${markedPara}`);
  if (nextText) parts.push(`(직후 단락) ${nextText}`);
  return parts.join('\n\n');
}

export default function SelectionRefineToolbar({
  editorRef,
  category,
  apiPath = '/api/refine-selection',
  fetchFn,
  onRefined,
  hideCounter = false,
}: Props): ReactElement | null {
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const [savedRange, setSavedRange] = useState<Range | null>(null);
  const [savedText, setSavedText] = useState<string>('');
  const [savedParagraph, setSavedParagraph] = useState<HTMLElement | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [previewState, setPreviewState] = useState<{ original: string; refined: string; option: RefineOption } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counterDisplay, setCounterDisplay] = useState(0);
  const [mounted, setMounted] = useState(false);

  const optionsRef = useRef<HTMLDivElement>(null);

  // SSR: portal 은 mount 후에만
  useEffect(() => {
    setMounted(true);
    setCounterDisplay(readCounter());
  }, []);

  // selectionchange 핸들러 — debounce 100ms
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const handle = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const result = validateSelection(editor);
        if (!result) {
          // 메뉴·미리보기 열려 있으면 닫지 않음 (사용자가 메뉴 클릭 중)
          if (!showOptions && !previewState) {
            setToolbarPos(null);
            setSavedRange(null);
          }
          return;
        }
        const rect = result.range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        setToolbarPos({
          top: rect.top + window.scrollY - 40,
          left: rect.left + window.scrollX + rect.width / 2,
        });
        setSavedRange(result.range);
        setSavedText(result.selectedText);
        setSavedParagraph(result.paragraph);
      }, 100);
    };

    document.addEventListener('selectionchange', handle);
    return () => {
      document.removeEventListener('selectionchange', handle);
      if (timer) clearTimeout(timer);
    };
  }, [editorRef, showOptions, previewState]);

  // ESC 키 — 모달·메뉴 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setShowOptions(false);
        setShowCustomInput(false);
        setPreviewState(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const callRefine = useCallback(async (option: RefineOption, customInstr?: string): Promise<void> => {
    if (!savedText || !savedParagraph) return;
    setLoading(true);
    setError(null);
    try {
      const surroundingContext = buildSurroundingContext(savedParagraph, savedText);
      const body: Record<string, unknown> = {
        selectedText: savedText,
        surroundingContext,
        option,
      };
      if (option === 'custom' && customInstr) body.customInstruction = customInstr;
      if (category) body.category = category;

      const f = fetchFn || fetch;
      const res = await f(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { refined?: string; original?: string; error?: string; details?: string };
      if (!res.ok || !data.refined) {
        setError(data.details || data.error || `요청 실패 (${res.status})`);
        return;
      }
      setPreviewState({
        original: savedText,
        refined: data.refined,
        option,
      });
      // counter bump — 차감 안내는 임계 도달시
      const next = bumpCounter();
      setCounterDisplay(next % COUNTER_THRESHOLD);
    } catch (e) {
      setError((e as Error).message || '네트워크 오류');
    } finally {
      setLoading(false);
      setShowOptions(false);
      setShowCustomInput(false);
    }
  }, [savedText, savedParagraph, category, fetchFn, apiPath]);

  const handleAccept = useCallback((): void => {
    if (!previewState || !savedRange || !savedParagraph) return;
    try {
      // savedRange.deleteContents() + insertNode 로 in-place 치환.
      // refined 가 HTML 일 수 있으므로 (<strong>·<em> 인라인 태그) DocumentFragment 로 파싱.
      const tpl = document.createElement('template');
      tpl.innerHTML = previewState.refined;
      const frag = tpl.content;
      // 이미 sanitizeHtml 통과한 안전 HTML — XSS 가드는 서버에서 완료.
      savedRange.deleteContents();
      savedRange.insertNode(frag);
      onRefined?.(previewState.original, previewState.refined);
    } catch (e) {
      setError((e as Error).message || '적용 실패');
      return;
    }
    setPreviewState(null);
    setToolbarPos(null);
    setSavedRange(null);
  }, [previewState, savedRange, savedParagraph, onRefined]);

  const handleReject = useCallback((): void => {
    setPreviewState(null);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Floating ✨ 버튼 */}
      {toolbarPos && !showOptions && !previewState && !loading && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowOptions(true)}
          style={{
            position: 'absolute',
            top: toolbarPos.top,
            left: toolbarPos.left,
            transform: 'translateX(-50%)',
            zIndex: 9999,
          }}
          className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg w-8 h-8 flex items-center justify-center text-sm hover:scale-110 transition-transform"
          aria-label="선택 구간 다듬기"
        >
          ✨
        </button>
      )}

      {/* 옵션 메뉴 */}
      {toolbarPos && showOptions && !previewState && !loading && (
        <div
          ref={optionsRef}
          style={{
            position: 'absolute',
            top: toolbarPos.top + 36,
            left: toolbarPos.left,
            transform: 'translateX(-50%)',
            zIndex: 9999,
          }}
          className="bg-white rounded-xl shadow-2xl border border-slate-200 p-2 min-w-[180px]"
          role="menu"
          aria-label="다듬기 옵션"
        >
          {!showCustomInput && (
            <>
              {(['shorter', 'longer', 'friendly', 'professional'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => callRefine(opt)}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors"
                  role="menuitem"
                >
                  {OPTION_LABELS[opt]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCustomInput(true)}
                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-100 transition-colors text-purple-600 font-semibold"
                role="menuitem"
              >
                ✎ 자유 지시
              </button>
              <button
                type="button"
                onClick={() => setShowOptions(false)}
                className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-slate-100 transition-colors text-slate-500 border-t border-slate-100 mt-1 pt-2"
                role="menuitem"
              >
                ✕ 닫기
              </button>
            </>
          )}
          {showCustomInput && (
            <div className="p-2">
              <textarea
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value.slice(0, 200))}
                placeholder="어떻게 다듬을지 적어주세요 (최대 200자)"
                rows={3}
                className="w-full text-sm border border-slate-300 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
                autoFocus
                aria-label="자유 지시 입력"
              />
              <div className="text-xs text-slate-400 text-right">{customInput.length}/200</div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => callRefine('custom', customInput)}
                  disabled={customInput.trim().length < 2}
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-purple-500 text-white font-semibold hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  다듬기
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCustomInput(false); setCustomInput(''); }}
                  className="px-3 py-1.5 text-sm rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 로딩 표시 */}
      {loading && (
        <div className="fixed inset-0 z-[9999] bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-2xl px-6 py-4 shadow-2xl text-sm font-semibold text-slate-700 flex items-center gap-3">
            <span className="inline-block w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            다듬는 중...
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewState && (
        <div
          className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4"
          onClick={handleReject}
          role="dialog"
          aria-label="다듬은 결과 미리보기"
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="text-base font-black text-slate-900">
                ✨ 다듬은 결과 ({previewState.option === 'custom' ? '자유 지시' : OPTION_LABELS[previewState.option as Exclude<RefineOption, 'custom'>]})
              </div>
              <button
                type="button"
                onClick={handleReject}
                className="px-3 py-1.5 rounded-lg text-xs font-black bg-slate-100 hover:bg-slate-200"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-black text-slate-500 mb-2">원본</div>
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap border border-slate-200 rounded-xl p-4 bg-slate-50">
                  {previewState.original}
                </div>
              </div>
              <div>
                <div className="text-xs font-black text-purple-600 mb-2">다듬은 결과</div>
                <div
                  className="text-sm text-slate-700 leading-relaxed border border-purple-200 rounded-xl p-4 bg-purple-50"
                  dangerouslySetInnerHTML={{ __html: previewState.refined }}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleReject}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                거절
              </button>
              <button
                type="button"
                onClick={handleAccept}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90"
              >
                수락
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 에러 토스트 */}
      {error && (
        <div
          className="fixed bottom-6 right-6 z-[9999] bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold max-w-sm"
          role="alert"
        >
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-3 text-red-400 hover:text-red-600"
            aria-label="에러 닫기"
          >
            ✕
          </button>
        </div>
      )}

      {/* counter 안내 (비어드민 + 임계 임박 시) */}
      {!hideCounter && counterDisplay >= COUNTER_THRESHOLD - 1 && (
        <div className="fixed bottom-6 left-6 z-[9998] bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-lg text-xs font-semibold shadow-md">
          다듬기 {counterDisplay}/{COUNTER_THRESHOLD} — 다음 호출부터 1 credit 차감 안내
        </div>
      )}
    </>,
    document.body,
  );
}
