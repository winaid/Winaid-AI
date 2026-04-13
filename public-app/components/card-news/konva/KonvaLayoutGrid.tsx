'use client';

import React from 'react';
import { Rect, Text, Circle } from 'react-konva';
import { EditableText, renderTitleBlock, layoutVerticalItems, layoutGrid, type LayoutRenderArgs } from './KonvaHelpers';
import type { SlideData } from '../../../lib/cardNewsLayouts';

/** elementShapes 기반 cornerRadius */
function shapeRadius(slide: SlideData, id: string, defaultCorner: number, w: number, h: number): number {
  const shape = slide.elementShapes?.[id];
  if (!shape) return defaultCorner;
  if (shape === 'pill' || shape === 'circle') return Math.min(w, h) / 2;
  if (shape === 'sharp' || shape === 'diamond' || shape === 'hexagon') return 0;
  return 18;
}

// ── Comparison ──

export function renderComparison(...args: LayoutRenderArgs): React.ReactNode {
  const [slide, theme, w, h, selectedId, setSelectedId, onChange] = args;
  const { element: titleBlock, bottomY } = renderTitleBlock(args, { alignCenter: true });
  const cols = slide.columns || [];
  const labels = slide.compareLabels || [];
  const rowCount = labels.length || (cols[0]?.items?.length || 0);
  const gridTop = bottomY + 20;
  const gridH = h - gridTop - 60;
  const hasLabels = labels.length > 0;
  const labelW = hasLabels ? 150 : 0;
  const colW = (w - 100 - labelW) / Math.max(1, cols.length);
  const rowH = gridH / (rowCount + 1);

  return (
    <>
      {titleBlock}
      {/* Header row */}
      {hasLabels && <Rect x={50} y={gridTop} width={labelW} height={rowH} fill="transparent" />}
      {cols.map((col, ci) => {
        const cx = 50 + labelW + ci * colW;
        return (
          <React.Fragment key={`h-${ci}`}>
            <Rect x={cx + 1} y={gridTop} width={colW - 2} height={rowH}
              fill={col.highlight ? theme.accentColor : (theme.cardBgColor || '#F7FAFC')} />
            <EditableText
              id={`text-col-header-${ci}`} text={col.header}
              x={cx + colW / 2} y={gridTop + rowH / 2 - 12} width={colW - 20} fontSize={20}
              fontStyle="bold" fill={col.highlight ? '#fff' : theme.titleColor}
              align="center" offsetX={(colW - 20) / 2}
              selectedId={selectedId} onSelect={setSelectedId}
              onDragEnd={() => {}}
              onTextChange={t => { const a = [...cols]; a[ci] = { ...a[ci], header: t }; onChange({ columns: a }); }}
            />
          </React.Fragment>
        );
      })}
      {/* Data rows */}
      {Array.from({ length: rowCount }).map((_, ri) => (
        <React.Fragment key={`r-${ri}`}>
          {hasLabels && (
            <>
              <Rect x={50} y={gridTop + (ri + 1) * rowH + 1} width={labelW - 2} height={rowH - 2}
                fill="rgba(0,0,0,0.04)" />
              <Text x={50 + labelW / 2} y={gridTop + (ri + 1) * rowH + rowH / 2 - 10}
                text={labels[ri] || ''} fontSize={16} fontStyle="bold" fill={theme.titleColor}
                width={labelW - 10} align="center" offsetX={(labelW - 10) / 2}
                fontFamily="Pretendard Variable, sans-serif" />
            </>
          )}
          {cols.map((col, ci) => {
            const cx = 50 + labelW + ci * colW;
            return (
              <React.Fragment key={`c-${ri}-${ci}`}>
                <Rect x={cx + 1} y={gridTop + (ri + 1) * rowH + 1} width={colW - 2} height={rowH - 2}
                  fill={col.highlight ? `${theme.accentColor}1F` : 'rgba(0,0,0,0.03)'} />
                <Text x={cx + colW / 2} y={gridTop + (ri + 1) * rowH + rowH / 2 - 10}
                  text={col.items[ri] || ''} fontSize={17} fill={col.highlight ? theme.accentColor : theme.titleColor}
                  fontStyle={col.highlight ? 'bold' : 'normal'}
                  width={colW - 10} align="center" offsetX={(colW - 10) / 2}
                  fontFamily="Pretendard Variable, sans-serif" />
              </React.Fragment>
            );
          })}
        </React.Fragment>
      ))}
    </>
  );
}

// ── Icon Grid ──

export function renderIconGrid(...args: LayoutRenderArgs): React.ReactNode {
  const [slide, theme, w, h, selectedId, setSelectedId, onChange] = args;
  const { element: titleBlock, bottomY } = renderTitleBlock(args, { alignCenter: true });
  const items = slide.icons || [];
  const cols = Math.min(Math.max(items.length, 1), 4) <= 2 ? 2 : items.length <= 4 ? 2 : 3;
  const rows = Math.ceil(items.length / cols);
  const grid = layoutGrid(cols, rows, 50, bottomY + 20, w - 100, h - bottomY - 80, 18);
  const tFs = slide.itemTitleFontSize ?? 20;
  const tColor = slide.itemTitleColor ?? theme.titleColor;
  const tWeight = slide.itemTitleFontWeight;
  const dFs = slide.itemDescFontSize ?? 14;
  const dColor = slide.itemDescColor ?? (theme.bodyColor || '#666');
  const dWeight = slide.itemDescFontWeight;

  return (
    <>
      {titleBlock}
      {items.map((item, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const cell = grid[r]?.[c];
        if (!cell) return null;
        return (
          <React.Fragment key={i}>
            <Rect id={`icon-card-${i}`} x={cell.x} y={cell.y} width={cell.w} height={cell.h}
              fill="#fff"
              cornerRadius={shapeRadius(slide, `icon-card-${i}`, 20, cell.w, cell.h)}
              shadowBlur={12} shadowOpacity={0.08}
              shadowColor="#000" shadowOffsetY={4} />
            <Text x={cell.x + cell.w / 2 - 28} y={cell.y + cell.h * 0.15}
              text={item.emoji} fontSize={48} width={56} align="center"
              fontFamily="Pretendard Variable, sans-serif" />
            <EditableText
              id={`text-icon-title-${i}`} text={item.title}
              x={cell.x + cell.w / 2} y={cell.y + cell.h * 0.5} width={cell.w - 30} fontSize={tFs}
              fontStyle={tWeight && Number(tWeight) < 700 ? 'normal' : 'bold'} fill={tColor}
              align="center" offsetX={(cell.w - 30) / 2}
              selectedId={selectedId} onSelect={setSelectedId}
              onDragEnd={() => {}}
              onTextChange={t => { const a = [...items]; a[i] = { ...a[i], title: t }; onChange({ icons: a }); }}
            />
            {item.desc && (
              <EditableText
                id={`text-icon-desc-${i}`} text={item.desc}
                x={cell.x + cell.w / 2} y={cell.y + cell.h * 0.7} width={cell.w - 30} fontSize={dFs}
                fontStyle={dWeight && Number(dWeight) >= 700 ? 'bold' : 'normal'}
                fill={dColor} align="center" offsetX={(cell.w - 30) / 2}
                selectedId={selectedId} onSelect={setSelectedId}
                onDragEnd={() => {}}
                onTextChange={t => { const a = [...items]; a[i] = { ...a[i], desc: t }; onChange({ icons: a }); }}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

// ── Data Highlight ──

export function renderDataHighlight(...args: LayoutRenderArgs): React.ReactNode {
  const [slide, theme, w, h, selectedId, setSelectedId, onChange] = args;
  const { element: titleBlock, bottomY } = renderTitleBlock(args, { alignCenter: true });
  const rawPoints = slide.dataPoints || [];
  // 유효한(값 or 라벨 있는) 항목만 — 없으면 원본 유지(편집 유도)
  const valid = rawPoints.filter(dp => dp.value?.trim() || dp.label?.trim());
  const points = valid.length > 0 ? valid : rawPoints;
  const cols = Math.min(Math.max(points.length, 1), 3);
  const grid = layoutGrid(cols, 1, 50, bottomY + 40, w - 100, h - bottomY - 120, 24);
  // 공통 스타일
  const vFs = slide.itemValueFontSize ?? 42;
  const vColor = slide.itemValueColor;
  const vWeight = slide.itemValueFontWeight;
  const dFs = slide.itemDescFontSize ?? 16;
  const dColor = slide.itemDescColor ?? theme.bodyColor;
  const dWeight = slide.itemDescFontWeight;

  return (
    <>
      {titleBlock}
      {points.map((dp, i) => {
        const cell = grid[0]?.[i];
        if (!cell) return null;
        const hasValue = !!(dp.value?.trim());
        const displayValue = hasValue ? dp.value : '00';
        const isPlaceholder = !hasValue;
        const valueFill = isPlaceholder
          ? 'rgba(150,150,150,0.6)'
          : (vColor ?? (dp.highlight ? theme.accentColor : theme.titleColor));
        const shapeId = `datapoint-${i}`;
        const shape = slide.elementShapes?.[shapeId] || 'rounded';
        // 도형별 cornerRadius 결정
        const corner = shape === 'pill' || shape === 'circle' ? Math.min(cell.w, cell.h) / 2
          : shape === 'sharp' || shape === 'diamond' || shape === 'hexagon' ? 0
          : 24;
        const isOutlined = shape === 'outlined';
        return (
          <React.Fragment key={i}>
            <Rect id={shapeId} x={cell.x} y={cell.y} width={cell.w} height={cell.h}
              fill={isOutlined ? 'transparent' : (dp.highlight ? `${theme.accentColor}15` : (theme.cardBgColor || 'rgba(0,0,0,0.04)'))}
              cornerRadius={corner}
              stroke={isOutlined ? theme.accentColor : (dp.highlight ? theme.accentColor : 'rgba(0,0,0,0.08)')}
              strokeWidth={isOutlined ? 3 : (dp.highlight ? 2 : 1)}
              opacity={isPlaceholder ? 0.4 : 1}
              dash={isPlaceholder ? [8, 6] : undefined} />
            <Text x={cell.x + cell.w / 2} y={cell.y + cell.h * 0.3}
              text={displayValue} fontSize={vFs}
              fontStyle={vWeight && Number(vWeight) < 700 ? 'normal' : 'bold'}
              fill={valueFill}
              width={cell.w - 20} align="center" offsetX={(cell.w - 20) / 2}
              fontFamily="Pretendard Variable, sans-serif" />
            <EditableText
              id={`text-dp-label-${i}`} text={dp.label || '설명을 입력하세요'}
              x={cell.x + cell.w / 2} y={cell.y + cell.h * 0.65} width={cell.w - 30} fontSize={dFs}
              fontStyle={dWeight && Number(dWeight) >= 700 ? 'bold' : 'normal'}
              fill={isPlaceholder ? 'rgba(150,150,150,0.5)' : dColor} align="center" offsetX={(cell.w - 30) / 2}
              selectedId={selectedId} onSelect={setSelectedId}
              onDragEnd={() => {}}
              onTextChange={t => { const a = [...(slide.dataPoints || [])]; a[i] = { ...a[i], label: t }; onChange({ dataPoints: a }); }}
            />
          </React.Fragment>
        );
      })}
    </>
  );
}

// ── Before-After ──

export function renderBeforeAfter(...args: LayoutRenderArgs): React.ReactNode {
  const [slide, theme, w, h, selectedId, setSelectedId, onChange] = args;
  const { element: titleBlock, bottomY } = renderTitleBlock(args, { alignCenter: true });
  const colW = (w - 120) / 2;
  const colTop = bottomY + 20;
  const colH = h - colTop - 60;
  const beforeItems = slide.beforeItems || [];
  const afterItems = slide.afterItems || [];

  return (
    <>
      {titleBlock}
      {/* Before column */}
      <Rect x={50} y={colTop} width={colW} height={colH}
        fill={theme.cardBgColor || 'rgba(0,0,0,0.04)'} cornerRadius={20} />
      <Text x={50 + colW / 2} y={colTop + 20} text={slide.beforeLabel || 'BEFORE'}
        fontSize={18} fontStyle="bold" fill={theme.bodyColor}
        width={colW} align="center" offsetX={colW / 2} letterSpacing={4}
        fontFamily="Pretendard Variable, sans-serif" />
      {beforeItems.map((item, i) => (
        <EditableText key={`b-${i}`}
          id={`text-before-${i}`} text={`• ${item}`}
          x={70} y={colTop + 70 + i * 40} width={colW - 40} fontSize={18}
          fill={theme.bodyColor} offsetX={0}
          selectedId={selectedId} onSelect={setSelectedId}
          onDragEnd={() => {}}
          onTextChange={t => { const a = [...beforeItems]; a[i] = t.replace(/^•\s*/, ''); onChange({ beforeItems: a }); }}
        />
      ))}

      {/* Arrow */}
      <Circle x={w / 2} y={colTop + colH / 2} radius={22} fill={theme.accentColor} />
      <Text x={w / 2 - 10} y={colTop + colH / 2 - 12} text="→" fontSize={20} fill="#fff" fontStyle="bold"
        fontFamily="Pretendard Variable, sans-serif" />

      {/* After column */}
      <Rect x={w / 2 + 10} y={colTop} width={colW} height={colH}
        fill={`${theme.accentColor}1F`} cornerRadius={20}
        stroke={theme.accentColor} strokeWidth={2} />
      <Text x={w / 2 + 10 + colW / 2} y={colTop + 20} text={slide.afterLabel || 'AFTER'}
        fontSize={18} fontStyle="bold" fill={theme.accentColor}
        width={colW} align="center" offsetX={colW / 2} letterSpacing={4}
        fontFamily="Pretendard Variable, sans-serif" />
      {afterItems.map((item, i) => (
        <EditableText key={`a-${i}`}
          id={`text-after-${i}`} text={`✓ ${item}`}
          x={w / 2 + 30} y={colTop + 70 + i * 40} width={colW - 40} fontSize={18}
          fontStyle="bold" fill={theme.titleColor} offsetX={0}
          selectedId={selectedId} onSelect={setSelectedId}
          onDragEnd={() => {}}
          onTextChange={t => { const a = [...afterItems]; a[i] = t.replace(/^✓\s*/, ''); onChange({ afterItems: a }); }}
        />
      ))}
    </>
  );
}

// ── QnA ──

export function renderQna(...args: LayoutRenderArgs): React.ReactNode {
  const [slide, theme, w, h, selectedId, setSelectedId, onChange] = args;
  const { element: titleBlock, bottomY } = renderTitleBlock(args);
  const items = slide.questions || [];
  const positions = layoutVerticalItems(items.length, bottomY + 20, h - bottomY - 80);

  return (
    <>
      {titleBlock}
      {items.map((qa, i) => {
        const p = positions[i];
        if (!p) return null;
        return (
          <React.Fragment key={i}>
            <Rect id={`qa-${i}`} x={50} y={p.y} width={w - 100} height={p.height}
              fill={theme.cardBgColor || 'rgba(0,0,0,0.04)'}
              cornerRadius={shapeRadius(slide, `qa-${i}`, 18, w - 100, p.height)} />
            {/* Q badge */}
            <Rect x={70} y={p.y + 14} width={40} height={40}
              fill={theme.accentColor} cornerRadius={12} />
            <Text x={70} y={p.y + 22} text="Q" fontSize={22} fill="#fff" fontStyle="bold"
              width={40} align="center" fontFamily="Pretendard Variable, sans-serif" />
            <EditableText
              id={`text-q-${i}`} text={qa.q}
              x={125} y={p.y + 18} width={w - 220} fontSize={20}
              fontStyle="bold" fill={theme.titleColor} offsetX={0}
              selectedId={selectedId} onSelect={setSelectedId}
              onDragEnd={() => {}}
              onTextChange={t => { const a = [...items]; a[i] = { ...a[i], q: t }; onChange({ questions: a }); }}
            />
            {/* A badge */}
            <Rect x={70} y={p.y + p.height / 2 + 4} width={40} height={40}
              fill="rgba(0,0,0,0.08)" cornerRadius={12} />
            <Text x={70} y={p.y + p.height / 2 + 12} text="A" fontSize={22}
              fill={theme.accentColor} fontStyle="bold"
              width={40} align="center" fontFamily="Pretendard Variable, sans-serif" />
            <EditableText
              id={`text-a-${i}`} text={qa.a}
              x={125} y={p.y + p.height / 2 + 8} width={w - 220} fontSize={17}
              fill={theme.bodyColor} offsetX={0}
              selectedId={selectedId} onSelect={setSelectedId}
              onDragEnd={() => {}}
              onTextChange={t => { const a = [...items]; a[i] = { ...a[i], a: t }; onChange({ questions: a }); }}
            />
          </React.Fragment>
        );
      })}
    </>
  );
}

// ── Pros-Cons ──

export function renderProsCons(...args: LayoutRenderArgs): React.ReactNode {
  const [slide, theme, w, h, selectedId, setSelectedId, onChange] = args;
  const { element: titleBlock, bottomY } = renderTitleBlock(args, { alignCenter: true });
  const colW = (w - 120) / 2;
  const colTop = bottomY + 20;
  const colH = h - colTop - 60;
  const pros = slide.pros || [];
  const cons = slide.cons || [];

  return (
    <>
      {titleBlock}
      {/* Pros */}
      <Rect x={50} y={colTop} width={colW} height={colH}
        fill="rgba(52,211,153,0.14)" cornerRadius={20} stroke="rgba(52,211,153,0.45)" strokeWidth={2} />
      <Circle x={50 + colW / 2} y={colTop + 40} radius={28} fill="#34D399" />
      <Text x={50 + colW / 2 - 14} y={colTop + 26} text={slide.prosIcon || 'O'}
        fontSize={28} fill="#fff" fontStyle="bold" fontFamily="Pretendard Variable, sans-serif" />
      <Text x={50 + colW / 2} y={colTop + 80} text={slide.prosLabel || '장점'}
        fontSize={18} fontStyle="bold" fill="#34D399" width={colW} align="center" offsetX={colW / 2}
        fontFamily="Pretendard Variable, sans-serif" />
      {pros.map((p, i) => (
        <EditableText key={`p-${i}`}
          id={`text-pro-${i}`} text={`○ ${p}`}
          x={70} y={colTop + 120 + i * 36} width={colW - 40} fontSize={18}
          fill={theme.titleColor} offsetX={0}
          selectedId={selectedId} onSelect={setSelectedId}
          onDragEnd={() => {}}
          onTextChange={t => { const a = [...pros]; a[i] = t.replace(/^○\s*/, ''); onChange({ pros: a }); }}
        />
      ))}

      {/* Cons */}
      <Rect x={w / 2 + 10} y={colTop} width={colW} height={colH}
        fill="rgba(239,68,68,0.14)" cornerRadius={20} stroke="rgba(239,68,68,0.45)" strokeWidth={2} />
      <Circle x={w / 2 + 10 + colW / 2} y={colTop + 40} radius={28} fill="#EF4444" />
      <Text x={w / 2 + 10 + colW / 2 - 14} y={colTop + 26} text={slide.consIcon || 'X'}
        fontSize={28} fill="#fff" fontStyle="bold" fontFamily="Pretendard Variable, sans-serif" />
      <Text x={w / 2 + 10 + colW / 2} y={colTop + 80} text={slide.consLabel || '주의점'}
        fontSize={18} fontStyle="bold" fill="#F87171" width={colW} align="center" offsetX={colW / 2}
        fontFamily="Pretendard Variable, sans-serif" />
      {cons.map((c, i) => (
        <EditableText key={`c-${i}`}
          id={`text-con-${i}`} text={`✕ ${c}`}
          x={w / 2 + 30} y={colTop + 120 + i * 36} width={colW - 40} fontSize={18}
          fill={theme.titleColor} offsetX={0}
          selectedId={selectedId} onSelect={setSelectedId}
          onDragEnd={() => {}}
          onTextChange={t => { const a = [...cons]; a[i] = t.replace(/^✕\s*/, ''); onChange({ cons: a }); }}
        />
      ))}
    </>
  );
}

// ── Price Table ──

export function renderPriceTable(...args: LayoutRenderArgs): React.ReactNode {
  const [slide, theme, w, h, selectedId, setSelectedId, onChange] = args;
  const { element: titleBlock, bottomY } = renderTitleBlock(args, { alignCenter: true });
  const items = slide.priceItems || [];
  const gridTop = bottomY + 20;
  const gridH = h - gridTop - 60;
  const rowH = gridH / (items.length + 1);
  const nameW = (w - 100) * 0.6;
  const priceW = (w - 100) * 0.4;

  return (
    <>
      {titleBlock}
      {/* Header */}
      <Rect x={50} y={gridTop} width={nameW} height={rowH} fill={theme.accentColor} />
      <Text x={50 + nameW / 2} y={gridTop + rowH / 2 - 12} text="💊 시술 항목"
        fontSize={20} fontStyle="bold" fill="#fff" width={nameW} align="center" offsetX={nameW / 2}
        fontFamily="Pretendard Variable, sans-serif" />
      <Rect x={50 + nameW + 2} y={gridTop} width={priceW} height={rowH} fill={theme.accentColor} />
      <Text x={50 + nameW + 2 + priceW / 2} y={gridTop + rowH / 2 - 12} text="💰 예상 비용"
        fontSize={20} fontStyle="bold" fill="#fff" width={priceW} align="center" offsetX={priceW / 2}
        fontFamily="Pretendard Variable, sans-serif" />
      {/* Rows */}
      {items.map((item, i) => {
        const ry = gridTop + (i + 1) * rowH + 1;
        const bg = i % 2 === 0 ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.02)';
        return (
          <React.Fragment key={i}>
            <Rect x={50} y={ry} width={nameW} height={rowH - 2} fill={bg} />
            <EditableText
              id={`text-price-name-${i}`} text={item.name}
              x={50 + nameW / 2} y={ry + rowH / 2 - 12} width={nameW - 20} fontSize={18}
              fontStyle="bold" fill={theme.titleColor} align="center" offsetX={(nameW - 20) / 2}
              selectedId={selectedId} onSelect={setSelectedId}
              onDragEnd={() => {}}
              onTextChange={t => { const a = [...items]; a[i] = { ...a[i], name: t }; onChange({ priceItems: a }); }}
            />
            <Rect x={50 + nameW + 2} y={ry} width={priceW} height={rowH - 2} fill={bg} />
            <Text x={50 + nameW + 2 + priceW / 2} y={ry + rowH / 2 - 14}
              text={item.price} fontSize={22} fontStyle="bold" fill={theme.accentColor}
              width={priceW - 20} align="center" offsetX={(priceW - 20) / 2}
              fontFamily="Pretendard Variable, sans-serif" />
            {item.note && (
              <Text x={50 + nameW + 2 + priceW / 2} y={ry + rowH / 2 + 10}
                text={item.note} fontSize={12} fill={theme.bodyColor}
                width={priceW - 20} align="center" offsetX={(priceW - 20) / 2}
                fontFamily="Pretendard Variable, sans-serif" />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}
