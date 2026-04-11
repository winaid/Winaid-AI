'use client';

import { useState, useRef, useCallback } from 'react';
import { analyzeDesignFromImages, saveTemplate, getSavedTemplates, deleteTemplate, type CardTemplate } from '../lib/cardTemplateService';
import { sanitizeHtml } from '../lib/sanitize';

/** 선택 가능한 built-in 디자인 템플릿 (card_news/page.tsx에서 주입) */
export interface BuiltInDesignOption {
  id: string;
  name: string;
  /** 아이콘 이모지 (대체 썸네일) */
  icon?: string;
  /** 작은 SVG 프리뷰 HTML 문자열 */
  previewSvg?: string;
  description?: string;
}

interface Props {
  onSelectTemplate: (template: CardTemplate | null) => void;
  selectedTemplateId?: string;
  /** 디자인 스타일 통합: 기본 제공 템플릿 8종을 같은 행에 노출 */
  builtInTemplates?: BuiltInDesignOption[];
  selectedBuiltInId?: string;
  onSelectBuiltIn?: (id: string | undefined) => void;
  /**
   * uploadOnly: true면 라벨/AI 자동 타일/학습 템플릿 행을 모두 숨기고
   * 업로드 폼만 렌더링. (프로 모드에서 상위가 자체 행을 가지고 있을 때 사용)
   */
  uploadOnly?: boolean;
}

export default function CardTemplateManager({
  onSelectTemplate,
  selectedTemplateId,
  builtInTemplates = [],
  selectedBuiltInId,
  onSelectBuiltIn,
  uploadOnly = false,
}: Props) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [templates, setTemplates] = useState<CardTemplate[]>(() => getSavedTemplates());
  const [showUpload, setShowUpload] = useState(uploadOnly); // uploadOnly면 업로드 UI 기본 열림
  const [templateName, setTemplateName] = useState('');
  const [progress, setProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList) => {
    const readers: Promise<string>[] = [];
    for (let i = 0; i < Math.min(files.length, 5); i++) {
      readers.push(new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(files[i]);
      }));
    }
    Promise.all(readers).then(results => {
      setUploadedImages(prev => [...prev, ...results].slice(0, 5));
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const [lastAnalyzed, setLastAnalyzed] = useState<{ template: CardTemplate; analysis: string } | null>(null);

  const handleAnalyze = async () => {
    if (uploadedImages.length === 0) return;
    setIsAnalyzing(true);
    setProgress('색상과 타이포그래피를 추출하고 있습니다...');

    // 2초 후 단계 업데이트
    const progressTimer = setTimeout(() => setProgress('레이아웃과 디자인 패턴을 분석하고 있습니다...'), 3000);
    const progressTimer2 = setTimeout(() => setProgress('템플릿을 생성하고 있습니다...'), 7000);

    const result = await analyzeDesignFromImages(uploadedImages);
    clearTimeout(progressTimer);
    clearTimeout(progressTimer2);

    if (result) {
      const newTemplate: CardTemplate = {
        id: `tmpl_${Date.now()}`,
        name: templateName.trim() || `내 디자인 ${templates.length + 1}`,
        createdAt: Date.now(),
        ...result.template,
        thumbnailDataUrl: uploadedImages[0],
      };
      saveTemplate(newTemplate);
      setTemplates(getSavedTemplates());
      onSelectTemplate(newTemplate);
      onSelectBuiltIn?.(undefined);
      setLastAnalyzed({ template: newTemplate, analysis: result.analysis });
      setUploadedImages([]);
      setTemplateName('');
      setProgress('');
    } else {
      setProgress('분석에 실패했습니다. 다시 시도해주세요.');
    }
    setIsAnalyzing(false);
  };

  const handleDelete = (id: string) => {
    deleteTemplate(id);
    setTemplates(getSavedTemplates());
    if (selectedTemplateId === id) onSelectTemplate(null);
  };

  const handleAiAuto = () => {
    onSelectTemplate(null);
    onSelectBuiltIn?.(undefined);
  };

  const handleBuiltIn = (id: string) => {
    // 이미 선택된 것을 다시 누르면 해제
    onSelectBuiltIn?.(selectedBuiltInId === id ? undefined : id);
    onSelectTemplate(null);
  };

  const handleLearned = (tmpl: CardTemplate) => {
    onSelectTemplate(tmpl);
    onSelectBuiltIn?.(undefined);
  };

  const nothingSelected = !selectedTemplateId && !selectedBuiltInId;

  return (
    <div className="space-y-3">
      {/* uploadOnly 모드에서는 라벨·타일 행·안내문 전부 숨김 (상위가 자체 행을 가지고 있을 때 사용) */}
      {!uploadOnly && (
        <>
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-500">디자인 스타일</label>
            <button type="button" onClick={() => setShowUpload(!showUpload)}
              className="text-[10px] font-semibold text-pink-600 hover:text-pink-700">
              {showUpload ? '닫기' : '+ 새 스타일 학습'}
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {/* AI 자동 */}
            <button type="button" onClick={handleAiAuto}
              className={`flex-shrink-0 w-16 h-16 rounded-xl border-2 transition-all flex items-center justify-center text-[10px] font-semibold ${
                nothingSelected ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
              }`}>
              AI 자동
            </button>

            {/* 기본 제공 디자인 템플릿 */}
            {builtInTemplates.map(tmpl => (
              <button key={tmpl.id} type="button" onClick={() => handleBuiltIn(tmpl.id)}
                className={`flex-shrink-0 w-16 h-16 rounded-xl border-2 transition-all overflow-hidden flex flex-col ${
                  selectedBuiltInId === tmpl.id ? 'border-pink-500 ring-2 ring-pink-200' : 'border-slate-200 hover:border-slate-300'
                }`}
                title={tmpl.description || tmpl.name}>
                {tmpl.previewSvg ? (
                  // XSS 방어: previewSvg는 외부(DB/admin 입력)에서 올 수 있으므로
                  // DOMPurify 기반 sanitize 필수. ⚠️ `lib/sanitize`의 ALLOWED_TAGS는
                  // HTML 전용이라 svg/rect/circle 등이 포함돼 있지 않음 — 실제로
                  // builtInTemplates에 SVG 문자열이 주입되면 태그가 전부 제거되어
                  // 빈 프리뷰가 렌더될 수 있음. 추후 SVG 지원이 필요하면 sanitize.ts를
                  // USE_PROFILES.svg 기반으로 확장하거나 전용 svg sanitizer를 추가할 것.
                  <div className="w-full flex-1 overflow-hidden" dangerouslySetInnerHTML={{ __html: sanitizeHtml(tmpl.previewSvg || '') }} />
                ) : (
                  <div className="w-full flex-1 flex items-center justify-center text-lg">{tmpl.icon || '🎨'}</div>
                )}
                <span className="text-[8px] font-semibold text-slate-600 leading-tight text-center py-0.5 bg-white">{tmpl.name}</span>
              </button>
            ))}

            {/* 학습한 템플릿 */}
            {templates.map(tmpl => (
              <div key={tmpl.id} className="relative flex-shrink-0">
                <button type="button" onClick={() => handleLearned(tmpl)}
                  className={`w-16 h-16 rounded-xl border-2 transition-all overflow-hidden ${
                    selectedTemplateId === tmpl.id ? 'border-pink-500 ring-2 ring-pink-200' : 'border-slate-200 hover:border-slate-300'
                  }`}>
                  {tmpl.thumbnailDataUrl ? (
                    <img src={tmpl.thumbnailDataUrl} alt={tmpl.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[9px] text-slate-400 p-1 text-center">{tmpl.name}</div>
                  )}
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(tmpl.id); }}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] flex items-center justify-center hover:bg-red-600">✕</button>
              </div>
            ))}
          </div>

          {/* 선택 설명 */}
          {selectedBuiltInId && (
            <p className="text-[10px] text-pink-700 font-medium">
              {builtInTemplates.find(t => t.id === selectedBuiltInId)?.icon}{' '}
              {builtInTemplates.find(t => t.id === selectedBuiltInId)?.description || builtInTemplates.find(t => t.id === selectedBuiltInId)?.name}
            </p>
          )}
          {nothingSelected && <p className="text-[10px] text-slate-400">선택하지 않으면 AI가 자동으로 디자인합니다.</p>}
        </>
      )}

      {showUpload && (
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)}
            placeholder="스타일 이름 (예: 피부과 핑크톤)"
            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/20" />

          <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-pink-400 hover:bg-pink-50/50 transition-all">
            {uploadedImages.length > 0 ? (
              <div className="flex gap-2 justify-center flex-wrap">
                {uploadedImages.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img} alt={`참고 ${i+1}`} className="w-16 h-16 rounded-lg object-cover border" />
                    <button type="button" onClick={(e) => { e.stopPropagation(); setUploadedImages(prev => prev.filter((_, j) => j !== i)); }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] flex items-center justify-center">✕</button>
                  </div>
                ))}
                {uploadedImages.length < 5 && (
                  <div className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-lg">+</div>
                )}
              </div>
            ) : (
              <>
                <div className="text-2xl mb-2">🎨</div>
                <p className="text-sm text-slate-500">마음에 드는 카드뉴스 이미지를<br />드래그하거나 클릭하여 업로드</p>
                <p className="text-[10px] text-slate-400 mt-1">최대 5개 · JPG, PNG</p>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }} />

          {/* 분석 진행 상태 */}
          {isAnalyzing && (
            <div className="space-y-2">
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-pink-500 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
              <p className="text-xs text-center text-pink-600">{progress || 'AI가 디자인 패턴을 분석하고 있습니다...'}</p>
              <div className="flex justify-center gap-4 text-[10px] text-slate-400">
                <span className="text-pink-600 font-bold">1. 색상 추출</span>
                <span className={progress?.includes('레이아웃') ? 'text-pink-600 font-bold' : ''}>2. 레이아웃 분석</span>
                <span className={progress?.includes('템플릿') ? 'text-pink-600 font-bold' : ''}>3. 템플릿 생성</span>
              </div>
            </div>
          )}

          {!isAnalyzing && (
            <button type="button" onClick={handleAnalyze}
              disabled={uploadedImages.length === 0}
              className="w-full py-2.5 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-sm">
              🎨 스타일 분석 ({uploadedImages.length}개 이미지)
            </button>
          )}

          {/* 학습 완료 후 미리보기 — MIRRA 스타일 */}
          {lastAnalyzed && (
            <div className="mt-3 p-4 rounded-xl border border-green-200 bg-green-50/30">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-green-700">✅ 스타일 학습 완료</p>
                <button type="button" onClick={() => setLastAnalyzed(null)}
                  className="text-[10px] text-slate-400 hover:text-slate-600">닫기</button>
              </div>

              {/* 3가지 페이지 타입 미리보기 (커버/콘텐츠/CTA) */}
              <div className="flex gap-2 mb-3">
                {['커버', '콘텐츠', '마무리'].map((type, idx) => (
                  <div key={type} className="flex-1">
                    <p className="text-[9px] text-slate-400 text-center mb-1">{type}</p>
                    <div
                      style={{
                        aspectRatio: '1/1',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        background: lastAnalyzed.template.backgroundStyle?.gradient
                          || lastAnalyzed.template.colors.backgroundGradient
                          || lastAnalyzed.template.colors.background,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: idx === 0 ? 'flex-end' : 'center',
                        alignItems: lastAnalyzed.template.layoutRules?.titleAlign === 'center' ? 'center' : 'flex-start',
                        padding: '12px',
                        textAlign: (lastAnalyzed.template.layoutRules?.titleAlign || 'left') as 'left' | 'center',
                        border: '1px solid rgba(0,0,0,0.08)',
                      }}
                    >
                      {idx === 0 && <div style={{ width: '24px', height: '2px', background: lastAnalyzed.template.colors.accentColor, borderRadius: '1px', marginBottom: '4px' }} />}
                      <div style={{ color: lastAnalyzed.template.colors.titleColor, fontSize: '11px', fontWeight: 800, lineHeight: 1.2 }}>
                        {idx === 0 ? '제목 텍스트' : idx === 1 ? '본문 제목' : '마무리 문구'}
                      </div>
                      <div style={{ color: lastAnalyzed.template.colors.subtitleColor, fontSize: '8px', fontWeight: 500, marginTop: '2px' }}>
                        {idx === 0 ? '부제목' : idx === 1 ? '설명 텍스트' : '행동 유도'}
                      </div>
                      {idx === 1 && (
                        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                          {[1,2,3].map(n => (
                            <div key={n} style={{
                              flex: 1, padding: '4px', borderRadius: '4px',
                              background: lastAnalyzed.template.innerCardStyle?.background || 'rgba(255,255,255,0.1)',
                              textAlign: 'center',
                            }}>
                              <div style={{ fontSize: '7px', fontWeight: 700, color: lastAnalyzed.template.colors.titleColor }}>항목{n}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 추출된 색상 표시 */}
              <div className="flex gap-1 mb-3">
                {[
                  { label: '배경', color: lastAnalyzed.template.colors.background },
                  { label: '제목', color: lastAnalyzed.template.colors.titleColor },
                  { label: '부제', color: lastAnalyzed.template.colors.subtitleColor },
                  { label: '강조', color: lastAnalyzed.template.colors.accentColor },
                ].map(c => (
                  <div key={c.label} className="flex-1 text-center">
                    <div style={{ width: '100%', height: '20px', borderRadius: '6px', background: c.color, border: '1px solid rgba(0,0,0,0.1)' }} />
                    <span className="text-[8px] text-slate-400">{c.label}</span>
                  </div>
                ))}
              </div>

              {/* 분석 설명 */}
              <p className="text-[10px] text-slate-500 mb-3">{lastAnalyzed.analysis}</p>

              {/* 이 스타일로 바로 만들기 버튼 */}
              <button type="button"
                onClick={() => { onSelectTemplate(lastAnalyzed.template); setShowUpload(false); setLastAnalyzed(null); }}
                className="w-full py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 text-xs flex items-center justify-center gap-1">
                ✨ 이 스타일로 카드뉴스 만들기
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
