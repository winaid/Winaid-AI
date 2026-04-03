'use client';

import { useState, useRef, useEffect } from 'react';
import type { CardTemplate } from '../lib/cardTemplateService';

interface SlideData {
  index: number;
  role: string;
  subtitle: string;
  title: string;
  description: string;
  visual: string;
}

interface Props {
  slides: SlideData[];
  template: CardTemplate | null;
  onSlidesChange: (slides: SlideData[]) => void;
  hospitalName?: string;
}

const DEFAULT_COLORS = {
  background: '#F8E8EE',
  backgroundGradient: 'linear-gradient(180deg, #F8E8EE 0%, #FCF0F4 100%)',
  titleColor: '#1A1A2E',
  subtitleColor: '#E84393',
  bodyColor: '#4A4A5A',
  accentColor: '#E84393',
};

const DEFAULT_TYPOGRAPHY = {
  titleSize: '32px',
  titleWeight: '800',
  subtitleSize: '15px',
  bodySize: '14px',
  fontFamily: "'Pretendard Variable', 'Pretendard', sans-serif",
};

export default function CardNewsRenderer({ slides, template, onSlidesChange, hospitalName }: Props) {
  const [editingField, setEditingField] = useState<{ slideIdx: number; field: 'subtitle' | 'title' | 'description' } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [customColors, setCustomColors] = useState(template?.colors || DEFAULT_COLORS);
  const [customTypo, setCustomTypo] = useState(template?.typography || DEFAULT_TYPOGRAPHY);
  const [showCustomize, setShowCustomize] = useState(false);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (template) {
      setCustomColors(template.colors);
      setCustomTypo(template.typography);
    }
  }, [template]);

  const startEdit = (slideIdx: number, field: 'subtitle' | 'title' | 'description') => {
    setEditingField({ slideIdx, field });
    setEditValue(slides[slideIdx][field]);
  };

  const finishEdit = () => {
    if (!editingField) return;
    const updated = slides.map((s, i) =>
      i === editingField.slideIdx ? { ...s, [editingField.field]: editValue } : s
    );
    onSlidesChange(updated);
    setEditingField(null);
  };

  const downloadCard = async (index: number) => {
    const el = cardRefs.current[index];
    if (!el) return;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: null });
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `card_${index + 1}.png`;
    a.click();
  };

  const downloadAll = async () => {
    const html2canvas = (await import('html2canvas')).default;
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    for (let i = 0; i < slides.length; i++) {
      const el = cardRefs.current[i];
      if (!el) continue;
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: null });
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/png'));
      zip.file(`card_${i + 1}.png`, blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zipBlob);
    a.download = `cardnews_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cardStyle = (): React.CSSProperties => ({
    width: '100%',
    aspectRatio: '1 / 1',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: template?.layout?.borderRadius || '0px',
    background: customColors.backgroundGradient || customColors.background,
    fontFamily: customTypo.fontFamily,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: template?.layout?.padding || '40px',
  });

  const renderEditableField = (slideIdx: number, field: 'subtitle' | 'title' | 'description', value: string, style: React.CSSProperties, multiline = false) => {
    const isEditing = editingField?.slideIdx === slideIdx && editingField.field === field;

    if (isEditing) {
      const InputEl = multiline ? 'textarea' : 'input';
      return (
        <InputEl
          autoFocus
          value={editValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEditValue(e.target.value)}
          onBlur={finishEdit}
          onKeyDown={e => { if (e.key === 'Enter' && !multiline) finishEdit(); }}
          className="bg-transparent text-center w-full outline-none resize-none"
          style={style}
          {...(multiline ? { rows: 3 } : {})}
        />
      );
    }

    return (
      <div onClick={() => startEdit(slideIdx, field)}
        className="cursor-text hover:outline hover:outline-2 hover:outline-pink-400/50 hover:outline-offset-2 rounded transition-all w-full text-center"
        style={style}>
        {value}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">카드뉴스 · {slides.length}장</span>
          <button onClick={() => setShowCustomize(!showCustomize)}
            className="text-[10px] font-semibold text-pink-600 hover:text-pink-700">
            🎨 커스터마이즈
          </button>
        </div>
        <button onClick={downloadAll}
          className="px-3 py-1.5 bg-pink-600 text-white text-xs font-bold rounded-lg hover:bg-pink-700 transition-all">
          📦 전체 다운로드 (ZIP)
        </button>
      </div>

      {showCustomize && (
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '배경색', key: 'background' as const },
              { label: '제목색', key: 'titleColor' as const },
              { label: '강조색', key: 'accentColor' as const },
            ].map(c => (
              <div key={c.key}>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">{c.label}</label>
                <input type="color" value={customColors[c.key]}
                  onChange={e => setCustomColors(prev => ({
                    ...prev,
                    [c.key]: e.target.value,
                    ...(c.key === 'background' ? { backgroundGradient: '' } : {}),
                    ...(c.key === 'accentColor' ? { subtitleColor: e.target.value } : {}),
                  }))}
                  className="w-full h-8 rounded cursor-pointer" />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 mb-1">제목 크기: {customTypo.titleSize}</label>
            <input type="range" min="24" max="42" value={parseInt(customTypo.titleSize)}
              onChange={e => setCustomTypo(prev => ({ ...prev, titleSize: e.target.value + 'px' }))}
              className="w-full accent-pink-600" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {slides.map((slide, idx) => (
          <div key={idx} className="group relative">
            <div className="absolute top-2 left-2 z-20 w-6 h-6 rounded-full bg-black/60 text-white text-[10px] font-bold flex items-center justify-center">
              {idx + 1}
            </div>
            <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => downloadCard(idx)}
                className="px-2 py-1 bg-white/90 rounded-lg text-[10px] font-bold text-slate-700 shadow-sm hover:bg-white">
                💾
              </button>
            </div>

            <div ref={el => { cardRefs.current[idx] = el; }} style={cardStyle()} className="select-none">
              {renderEditableField(idx, 'subtitle', slide.subtitle || slide.role, {
                color: customColors.subtitleColor,
                fontSize: customTypo.subtitleSize,
                fontWeight: '600',
                letterSpacing: '0.05em',
                marginBottom: '12px',
              })}

              {renderEditableField(idx, 'title', slide.title, {
                color: customColors.titleColor,
                fontSize: customTypo.titleSize,
                fontWeight: customTypo.titleWeight,
                lineHeight: '1.3',
                marginBottom: '16px',
                wordBreak: 'keep-all',
              })}

              {slide.description && renderEditableField(idx, 'description', slide.description, {
                color: customColors.bodyColor,
                fontSize: customTypo.bodySize,
                lineHeight: '1.6',
                maxWidth: '80%',
              }, true)}

              {hospitalName && (idx === 0 || idx === slides.length - 1) && (
                <div style={{
                  position: 'absolute',
                  bottom: template?.layout?.padding || '40px',
                  color: customColors.subtitleColor,
                  fontSize: '12px',
                  fontWeight: '600',
                  opacity: 0.7,
                }}>
                  {hospitalName}
                </div>
              )}

              <div className="absolute bottom-2 right-2 text-[9px] text-slate-400 opacity-0 group-hover:opacity-60 transition-opacity">
                클릭하여 편집
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
