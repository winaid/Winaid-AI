'use client';

import { useState, useRef, useCallback } from 'react';
import { analyzeDesignFromImages, saveTemplate, getSavedTemplates, deleteTemplate, type CardTemplate } from '../lib/cardTemplateService';

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
}

export default function CardTemplateManager({
  onSelectTemplate,
  selectedTemplateId,
  builtInTemplates = [],
  selectedBuiltInId,
  onSelectBuiltIn,
}: Props) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [templates, setTemplates] = useState<CardTemplate[]>(() => getSavedTemplates());
  const [showUpload, setShowUpload] = useState(false);
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

  const handleAnalyze = async () => {
    if (uploadedImages.length === 0) return;
    setIsAnalyzing(true);
    setProgress('AI가 디자인 패턴을 분석하고 있습니다...');

    const result = await analyzeDesignFromImages(uploadedImages);

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
      setUploadedImages([]);
      setTemplateName('');
      setShowUpload(false);
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
              <div className="w-full flex-1 overflow-hidden" dangerouslySetInnerHTML={{ __html: tmpl.previewSvg }} />
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

          {progress && <p className="text-xs text-center text-pink-600">{progress}</p>}

          <button type="button" onClick={handleAnalyze}
            disabled={isAnalyzing || uploadedImages.length === 0}
            className="w-full py-2.5 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-sm">
            {isAnalyzing ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />AI 분석 중...</>
            ) : (
              <>🎨 스타일 분석 ({uploadedImages.length}개 이미지)</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
