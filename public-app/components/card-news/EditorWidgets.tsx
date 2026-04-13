'use client';

import { useState, useRef, useEffect } from 'react';
import { CARD_FONTS, FONT_CATEGORIES, getCardFont } from '../../lib/cardNewsLayouts';
import { FONT_LIST, getFontById, loadGoogleFont } from '../../lib/cardFonts';

// ═══════════════════════════════════════════════════════════════
// 편집 위젯 컴포넌트 — CardNewsProRenderer에서 추출
// ═══════════════════════════════════════════════════════════════

export function DraggableText({ children, position, onPositionChange, containerRef }: {
  children: React.ReactNode;
  position?: { x: number; y: number };
  onPositionChange: (pos: { x: number; y: number }) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  if (!position) return <>{children}</>;
  return (
    <div
      style={{
        position: 'absolute', left: `${position.x}%`, top: `${position.y}%`,
        transform: 'translate(-50%, -50%)', cursor: 'move', zIndex: dragging ? 100 : 10,
        border: dragging ? '2px solid #3B82F6' : '2px dashed transparent',
        padding: '4px', borderRadius: '4px', transition: dragging ? 'none' : 'border-color 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#93C5FD'; }}
      onMouseLeave={e => { if (!dragging) e.currentTarget.style.borderColor = 'transparent'; }}
      onMouseDown={e => {
        e.preventDefault(); e.stopPropagation();
        setDragging(true);
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        startRef.current = { x: position.x, y: position.y, sx: e.clientX, sy: e.clientY };
        const onMove = (ev: MouseEvent) => {
          const dx = ((ev.clientX - startRef.current.sx) / rect.width) * 100;
          const dy = ((ev.clientY - startRef.current.sy) / rect.height) * 100;
          onPositionChange({ x: Math.round(Math.max(5, Math.min(95, startRef.current.x + dx))), y: Math.round(Math.max(5, Math.min(95, startRef.current.y + dy))) });
        };
        const onUp = () => { setDragging(false); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      }}
    >
      {children}
    </div>
  );
}

export function FontPicker({ value, onChange }: { value: string; onChange: (fontId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState<'all' | 'ko' | 'en'>('all');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [showAll, setShowAll] = useState(false);

  const filtered = FONT_LIST.filter(f => {
    if (!showAll && !f.isRecommended) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase()) && !f.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (langFilter !== 'all' && f.language !== langFilter && f.language !== 'both') return false;
    if (catFilter !== 'all' && f.category !== catFilter) return false;
    return true;
  });

  const current = getFontById(value);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full px-3 py-2 text-left text-sm bg-white border border-slate-200 rounded-lg hover:border-blue-400 flex items-center justify-between"
        style={{ fontFamily: current?.family }}>
        <span className="font-semibold text-slate-700">{current?.name || 'Pretendard'}</span>
        <span className="text-[9px] text-slate-400">▾</span>
      </button>
    );
  }

  return (
    <div className="border border-blue-300 rounded-xl bg-white shadow-lg">
      <div className="p-2">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 폰트 검색..."
          className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" autoFocus />
      </div>
      <div className="px-2 pb-1 flex gap-1 flex-wrap">
        {[{ id: 'all', l: '전체' }, { id: 'ko', l: '한국어' }, { id: 'en', l: '영어' }].map(x => (
          <button key={x.id} type="button" onClick={() => setLangFilter(x.id as 'all' | 'ko' | 'en')}
            className={`px-2 py-0.5 text-[9px] rounded-full font-bold ${langFilter === x.id ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{x.l}</button>
        ))}
        <span className="w-px h-4 bg-slate-200 mx-0.5" />
        {[{ id: 'all', l: '전체' }, { id: 'gothic', l: '고딕' }, { id: 'serif', l: '명조' }, { id: 'display', l: '디스플레이' }, { id: 'handwriting', l: '손글씨' }].map(x => (
          <button key={x.id} type="button" onClick={() => setCatFilter(x.id)}
            className={`px-2 py-0.5 text-[9px] rounded-full font-bold ${catFilter === x.id ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{x.l}</button>
        ))}
      </div>
      <div className="max-h-[180px] overflow-y-auto border-t border-slate-100">
        {filtered.map(font => (
          <button key={font.id} type="button" onClick={() => { onChange(font.id); loadGoogleFont(font); setOpen(false); }}
            className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-blue-50 transition-colors ${value === font.id ? 'bg-blue-50' : ''}`}>
            <div>
              <div className="text-sm font-semibold text-slate-800" style={{ fontFamily: font.family }}>{font.name}</div>
              <div className="text-[9px] text-slate-400">{font.description}</div>
            </div>
            <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold shrink-0 ${font.language === 'ko' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
              {font.language === 'ko' ? 'KR' : 'EN'}
            </span>
          </button>
        ))}
      </div>
      <div className="p-2 border-t border-slate-100 flex items-center justify-between">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="w-3 h-3 rounded" />
          <span className="text-[10px] text-slate-500">전체 {FONT_LIST.length}종 보기</span>
        </label>
        <button type="button" onClick={() => setOpen(false)} className="text-[10px] text-slate-400 hover:text-slate-600">닫기</button>
      </div>
    </div>
  );
}

export function IconChangerPopover({ currentIcon, onSelect }: { currentIcon: string; onSelect: (icon: string) => void }) {
  const [open, setOpen] = useState(false);
  const icons = ['→', '›', '»', '⇒', '▶', '●', '◆', '★', '✓', '✕', '•', '⊕', '↔', '⇄', 'O', 'X'];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 rounded text-xs" title="아이콘 변경">🔄</button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white shadow-xl rounded-lg p-2 border border-slate-200 grid grid-cols-4 gap-1 z-[200]">
          {icons.map(ic => (
            <button key={ic} type="button" onClick={() => { onSelect(ic); setOpen(false); }}
              className={`w-8 h-8 flex items-center justify-center rounded hover:bg-blue-50 text-lg ${currentIcon === ic ? 'bg-blue-100 ring-2 ring-blue-400' : ''}`}>{ic}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ColorMiniPicker({ onSelect }: { onSelect: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const colors = ['#FFFFFF', '#000000', '#F5A623', '#3B82F6', '#EF4444', '#22C55E', '#8B5CF6', '#EC4899'];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 rounded text-xs" title="색상">🎨</button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white shadow-xl rounded-lg p-2 border border-slate-200 flex gap-1 z-[200]">
          {colors.map(c => (
            <button key={c} type="button" onClick={() => { onSelect(c); setOpen(false); }}
              className="w-6 h-6 rounded-full border-2 border-slate-200 hover:scale-110 transition-transform" style={{ background: c }} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ElementAccordion({ icon, label, defaultOpen = false, children }: {
  icon: string; label: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`border rounded-xl transition-all ${open ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200'}`}>
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
          icon === 'T' ? 'bg-green-100 text-green-700' :
          icon === '🖼' ? 'bg-blue-100 text-blue-700' :
          'bg-orange-100 text-orange-700'
        }`}>{icon}</span>
        <span className="flex-1 text-sm font-semibold text-slate-700 truncate">{label}</span>
        <span className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

export function TextElementEditor({ value, onChange, multiline, fontId, fontSize, fontWeight, fontColor,
  letterSpacing, lineHeight, onStyleChange, prefix = 'title', valueOnly = false,
}: {
  value: string; onChange: (v: string) => void; multiline?: boolean;
  fontId?: string; fontSize?: number; fontWeight?: string; fontColor?: string;
  letterSpacing?: number; lineHeight?: number;
  onStyleChange: (key: string, val: string | number | undefined) => void; prefix?: string;
  valueOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* 폰트 */}
      <div>
        <p className="text-[10px] text-slate-400 mb-1">폰트</p>
        <FontPicker value={fontId || 'pretendard'} onChange={id => onStyleChange(`${prefix}FontId`, id)} />
      </div>
      {/* 텍스트 입력 — valueOnly면 숨김 (스타일만 편집) */}
      {!valueOnly && (multiline ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg resize-none focus:outline-none focus:border-blue-400" rows={3} />
      ) : (
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
      ))}

      {/* 크기 + 빠른 선택 */}
      <div>
        <p className="text-[10px] text-slate-400 mb-1">크기</p>
        <div className="flex items-center gap-1 mb-2">
          <button type="button" onClick={() => onStyleChange(`${prefix}FontSize`, (fontSize || 48) - 2)}
            className="w-7 h-7 bg-slate-100 rounded text-xs font-bold hover:bg-slate-200">−</button>
          <input type="number" value={fontSize || 48}
            onChange={e => onStyleChange(`${prefix}FontSize`, Number(e.target.value))}
            className="w-14 h-7 text-center text-xs bg-white border border-slate-200 rounded" />
          <button type="button" onClick={() => onStyleChange(`${prefix}FontSize`, (fontSize || 48) + 2)}
            className="w-7 h-7 bg-slate-100 rounded text-xs font-bold hover:bg-slate-200">+</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {[16, 20, 24, 32, 40, 48, 56, 64, 80].map(s => (
            <button key={s} type="button" onClick={() => onStyleChange(`${prefix}FontSize`, s)}
              className={`px-2 py-0.5 text-[10px] rounded border ${
                fontSize === s ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
              }`}>{s}</button>
          ))}
        </div>
      </div>

      {/* 색상 팔레트 */}
      <div>
        <p className="text-[10px] text-slate-400 mb-1">색상</p>
        <div className="flex flex-wrap gap-1.5">
          {['#FFFFFF', '#000000', '#333333', '#EF4444', '#3B82F6', '#22C55E', '#8B5CF6', '#EC4899'].map(c => (
            <button key={c} type="button" onClick={() => onStyleChange(`${prefix}Color`, c)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${
                fontColor === c ? 'border-blue-500 scale-110' : 'border-slate-200 hover:scale-105'
              }`} style={{ background: c }} />
          ))}
          <label className="w-6 h-6 rounded-full border-2 border-slate-200 overflow-hidden cursor-pointer hover:scale-105 transition-transform flex items-center justify-center bg-gradient-to-br from-red-400 via-green-400 to-blue-400" title="스포이드">
            <input type="color" value={fontColor || '#000000'} onChange={e => onStyleChange(`${prefix}Color`, e.target.value)} className="opacity-0 w-0 h-0" />
          </label>
        </div>
      </div>

      {/* 굵기 */}
      <div>
        <p className="text-[10px] text-slate-400 mb-1">굵기</p>
        <div className="flex gap-1">
          {[{ label: 'L', value: '400' }, { label: 'N', value: '500' }, { label: 'M', value: '600' },
            { label: 'SB', value: '700' }, { label: 'B', value: '800' }, { label: 'XB', value: '900' }].map(w => (
            <button key={w.label} type="button" onClick={() => onStyleChange(`${prefix}FontWeight`, w.value)}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg border ${
                (fontWeight || '800') === w.value ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}>{w.label}</button>
          ))}
        </div>
      </div>

      {/* 자간 + 행간 */}
      <div className="flex gap-3">
        <div className="flex-1">
          <p className="text-[10px] text-slate-400 mb-1">자간</p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onStyleChange(`${prefix}LetterSpacing`, (letterSpacing || 0) - 0.5)}
              className="w-7 h-7 bg-slate-100 rounded text-xs font-bold hover:bg-slate-200">−</button>
            <input type="number" step="0.5" value={letterSpacing || 0}
              onChange={e => onStyleChange(`${prefix}LetterSpacing`, Number(e.target.value))}
              className="w-12 h-7 text-center text-xs bg-white border border-slate-200 rounded" />
            <button type="button" onClick={() => onStyleChange(`${prefix}LetterSpacing`, (letterSpacing || 0) + 0.5)}
              className="w-7 h-7 bg-slate-100 rounded text-xs font-bold hover:bg-slate-200">+</button>
          </div>
        </div>
        <div className="flex-1">
          <p className="text-[10px] text-slate-400 mb-1">행간</p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onStyleChange(`${prefix}LineHeight`, Math.round(((lineHeight || 1.3) - 0.1) * 10) / 10)}
              className="w-7 h-7 bg-slate-100 rounded text-xs font-bold hover:bg-slate-200">−</button>
            <input type="number" step="0.1" value={lineHeight || 1.3}
              onChange={e => onStyleChange(`${prefix}LineHeight`, Number(e.target.value))}
              className="w-12 h-7 text-center text-xs bg-white border border-slate-200 rounded" />
            <button type="button" onClick={() => onStyleChange(`${prefix}LineHeight`, Math.round(((lineHeight || 1.3) + 0.1) * 10) / 10)}
              className="w-7 h-7 bg-slate-100 rounded text-xs font-bold hover:bg-slate-200">+</button>
          </div>
        </div>
      </div>
    </div>
  );
}
