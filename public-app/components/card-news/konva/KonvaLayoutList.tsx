'use client';

import React from 'react';
import { Rect, Text, Circle } from 'react-konva';
import { EditableText, renderTitleBlock, layoutVerticalItems, type LayoutRenderArgs } from './KonvaHelpers';
import type { SlideData } from '../../../lib/cardNewsLayouts';

/** elementShapes 기반으로 cornerRadius 계산 — 각 레이아웃의 default 모양 유지 */
function shapeRadius(slide: SlideData, id: string, defaultCorner: number, w: number, h: number): number {
  const shape = slide.elementShapes?.[id];
  if (!shape) return defaultCorner;
  if (shape === 'pill' || shape === 'circle') return Math.min(w, h) / 2;
  if (shape === 'sharp' || shape === 'diamond' || shape === 'hexagon') return 0;
  return 18;
}

// ── Checklist ──

export function renderChecklist(...args: LayoutRenderArgs): React.ReactNode {
  const [slide, theme, w, h, selectedId, setSelectedId, onChange] = args;
  const { element: titleBlock, bottomY } = renderTitleBlock(args);
  const items = slide.checkItems || [];
  const positions = layoutVerticalItems(items.length, bottomY + 20, h - bottomY - 80);
  // 공통 항목 스타일
  const itemFs = slide.itemTitleFontSize ?? 20;
  const itemWeight = slide.itemTitleFontWeight;
  const itemColor = slide.itemTitleColor ?? theme.titleColor;

  return (
    <>
      {titleBlock}
      {items.map((item, i) => {
        const p = positions[i];
        if (!p) return null;
        return (
          <React.Fragment key={i}>
            <Rect id={`check-${i}`} x={50} y={p.y} width={w - 100} height={p.height}
              fill={theme.cardBgColor || 'rgba(0,0,0,0.04)'}
              cornerRadius={shapeRadius(slide, `check-${i}`, 999, w - 100, p.height)} />
            <Text x={75} y={p.y + p.height / 2 - 14} text={slide.checkIcon || '✓'}
              fontSize={24} fill={theme.accentColor} fontStyle="bold"
              fontFamily="Pretendard Variable, sans-serif" />
            <EditableText
              id={`text-check-${i}`} text={item}
              x={115} y={p.y + p.height / 2 - 12} width={w - 220} fontSize={itemFs}
              fontStyle={itemWeight && Number(itemWeight) >= 700 ? 'bold' : 'normal'}
              fill={itemColor} offsetX={0}
              selectedId={selectedId} onSelect={setSelectedId}
              onDragEnd={() => {}}
              onTextChange={t => { const a = [...items]; a[i] = t; onChange({ checkItems: a }); }}
            />
          </React.Fragment>
        );
      })}
    </>
  );
}

// ── Steps ──

export function renderSteps(...args: LayoutRenderArgs): React.ReactNode {
  const [slide, theme, w, h, selectedId, setSelectedId, onChange] = args;
  const { element: titleBlock, bottomY } = renderTitleBlock(args, { alignCenter: true });
  const items = slide.steps || [];
  const positions = layoutVerticalItems(items.length, bottomY + 20, h - bottomY - 80);
  const tFs = slide.itemTitleFontSize ?? 22;
  const tColor = slide.itemTitleColor ?? theme.titleColor;
  const tWeight = slide.itemTitleFontWeight;
  const dFs = slide.itemDescFontSize ?? 16;
  const dColor = slide.itemDescColor ?? theme.bodyColor;
  const dWeight = slide.itemDescFontWeight;

  return (
    <>
      {titleBlock}
      {items.map((step, i) => {
        const p = positions[i];
        if (!p) return null;
        return (
          <React.Fragment key={i}>
            <Rect id={`step-${i}`} x={50} y={p.y} width={w - 100} height={p.height}
              fill={theme.cardBgColor || 'rgba(0,0,0,0.04)'}
              cornerRadius={shapeRadius(slide, `step-${i}`, 20, w - 100, p.height)} />
            <Circle x={100} y={p.y + p.height / 2} radius={28}
              fill={theme.accentColor} />
            <Text x={100} y={p.y + p.height / 2 - 14} text={String(i + 1)}
              fontSize={24} fill="#fff" fontStyle="bold" width={56} align="center" offsetX={28}
              fontFamily="Pretendard Variable, sans-serif" />
            <EditableText
              id={`text-step-label-${i}`} text={step.label}
              x={150} y={p.y + (step.desc ? p.height * 0.25 : p.height / 2 - 12)} width={w - 250} fontSize={tFs}
              fontStyle={tWeight && Number(tWeight) < 700 ? 'normal' : 'bold'} fill={tColor} offsetX={0}
              selectedId={selectedId} onSelect={setSelectedId}
              onDragEnd={() => {}}
              onTextChange={t => { const a = [...items]; a[i] = { ...a[i], label: t }; onChange({ steps: a }); }}
            />
            {step.desc && (
              <EditableText
                id={`text-step-desc-${i}`} text={step.desc}
                x={150} y={p.y + p.height * 0.55} width={w - 250} fontSize={dFs}
                fontStyle={dWeight && Number(dWeight) >= 700 ? 'bold' : 'normal'}
                fill={dColor} offsetX={0}
                selectedId={selectedId} onSelect={setSelectedId}
                onDragEnd={() => {}}
                onTextChange={t => { const a = [...items]; a[i] = { ...a[i], desc: t }; onChange({ steps: a }); }}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

// ── Warning ──

export function renderWarning(...args: LayoutRenderArgs): React.ReactNode {
  const [slide, theme, w, h, selectedId, setSelectedId, onChange] = args;
  // Red top bar
  const items = slide.warningItems || [];
  const warnTitle = slide.warningTitle || slide.title || '주의사항';
  const titleY = 100;
  const positions = layoutVerticalItems(items.length, titleY + 80, h - titleY - 140);

  return (
    <>
      <Rect x={0} y={0} width={w} height={8} fill="#EF4444" />
      <Text x={w / 2} y={40} text="⚠️" fontSize={60} width={80} align="center" offsetX={40}
        fontFamily="Pretendard Variable, sans-serif" />
      <EditableText
        id="text-title" text={warnTitle}
        x={w / 2} y={titleY} width={w * 0.8} fontSize={48}
        fontStyle="bold" fill={theme.accentColor} align="center" offsetX={w * 0.8 / 2}
        selectedId={selectedId} onSelect={setSelectedId}
        onDragEnd={(x, y) => onChange({ titlePosition: { x: Math.round(x / w * 100), y: Math.round(y / h * 100) } })}
        onTextChange={t => onChange({ warningTitle: t })}
      />
      {items.map((item, i) => {
        const p = positions[i];
        if (!p) return null;
        return (
          <React.Fragment key={i}>
            <Rect x={50} y={p.y} width={w - 100} height={p.height}
              fill="rgba(239,68,68,0.14)"
              id={`warning-${i}`}
              cornerRadius={shapeRadius(slide, `warning-${i}`, 16, w - 100, p.height)} />
            <Rect x={50} y={p.y} width={6} height={p.height} fill="#F87171"
              cornerRadius={[16, 0, 0, 16]} />
            <Text x={80} y={p.y + p.height / 2 - 12} text="❗" fontSize={24} fill="#F87171"
              fontFamily="Pretendard Variable, sans-serif" />
            <EditableText
              id={`text-warning-${i}`} text={item}
              x={115} y={p.y + p.height / 2 - 12} width={w - 220} fontSize={20}
              fill={theme.titleColor} offsetX={0}
              selectedId={selectedId} onSelect={setSelectedId}
              onDragEnd={() => {}}
              onTextChange={t => { const a = [...items]; a[i] = t; onChange({ warningItems: a }); }}
            />
          </React.Fragment>
        );
      })}
    </>
  );
}

// ── Numbered List ──

export function renderNumberedList(...args: LayoutRenderArgs): React.ReactNode {
  const [slide, theme, w, h, selectedId, setSelectedId, onChange] = args;
  const { element: titleBlock, bottomY } = renderTitleBlock(args);
  const items = slide.numberedItems || [];
  const positions = layoutVerticalItems(items.length, bottomY + 20, h - bottomY - 80);

  return (
    <>
      {titleBlock}
      {items.map((item, i) => {
        const p = positions[i];
        if (!p) return null;
        const num = item.num || String(i + 1).padStart(2, '0');
        return (
          <React.Fragment key={i}>
            <Rect id={`numbered-${i}`} x={50} y={p.y} width={w - 100} height={p.height}
              fill={theme.cardBgColor || 'rgba(0,0,0,0.04)'}
              cornerRadius={shapeRadius(slide, `numbered-${i}`, 18, w - 100, p.height)} />
            <Rect x={70} y={p.y + p.height / 2 - 28} width={56} height={56}
              fill={theme.accentColor} cornerRadius={16} />
            <Text x={70} y={p.y + p.height / 2 - 14} text={num}
              fontSize={24} fill="#fff" fontStyle="bold" width={56} align="center"
              fontFamily="Pretendard Variable, sans-serif" />
            <EditableText
              id={`text-numbered-title-${i}`} text={item.title}
              x={145} y={p.y + (item.desc ? p.height * 0.25 : p.height / 2 - 12)} width={w - 250} fontSize={22}
              fontStyle="bold" fill={theme.titleColor} offsetX={0}
              selectedId={selectedId} onSelect={setSelectedId}
              onDragEnd={() => {}}
              onTextChange={t => { const a = [...items]; a[i] = { ...a[i], title: t }; onChange({ numberedItems: a }); }}
            />
            {item.desc && (
              <EditableText
                id={`text-numbered-desc-${i}`} text={item.desc}
                x={145} y={p.y + p.height * 0.55} width={w - 250} fontSize={16}
                fill={theme.bodyColor} offsetX={0}
                selectedId={selectedId} onSelect={setSelectedId}
                onDragEnd={() => {}}
                onTextChange={t => { const a = [...items]; a[i] = { ...a[i], desc: t }; onChange({ numberedItems: a }); }}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

// ── Timeline ──

export function renderTimeline(...args: LayoutRenderArgs): React.ReactNode {
  const [slide, theme, w, h, selectedId, setSelectedId, onChange] = args;
  const { element: titleBlock, bottomY } = renderTitleBlock(args);
  const items = slide.timelineItems || [];
  const positions = layoutVerticalItems(items.length, bottomY + 20, h - bottomY - 80, 16);

  return (
    <>
      {titleBlock}
      {/* Vertical line */}
      <Rect x={84} y={bottomY + 20} width={4} height={h - bottomY - 100}
        fill={`${theme.accentColor}55`} cornerRadius={2} />
      {items.map((item, i) => {
        const p = positions[i];
        if (!p) return null;
        return (
          <React.Fragment key={i}>
            <Circle x={86} y={p.y + 14} radius={14} fill={theme.accentColor} />
            <Text x={86} y={p.y + 2} text={String(i + 1)} fontSize={13} fill="#fff"
              fontStyle="bold" width={28} align="center" offsetX={14}
              fontFamily="Pretendard Variable, sans-serif" />
            <Text x={110} y={p.y} text={item.time} fontSize={14} fill={theme.accentColor}
              fontStyle="bold" fontFamily="Pretendard Variable, sans-serif" />
            <EditableText
              id={`text-tl-title-${i}`} text={item.title}
              x={110} y={p.y + 22} width={w - 180} fontSize={20}
              fontStyle="bold" fill={theme.titleColor} offsetX={0}
              selectedId={selectedId} onSelect={setSelectedId}
              onDragEnd={() => {}}
              onTextChange={t => { const a = [...items]; a[i] = { ...a[i], title: t }; onChange({ timelineItems: a }); }}
            />
            {item.desc && (
              <EditableText
                id={`text-tl-desc-${i}`} text={item.desc}
                x={110} y={p.y + 48} width={w - 180} fontSize={16}
                fill={theme.bodyColor} offsetX={0}
                selectedId={selectedId} onSelect={setSelectedId}
                onDragEnd={() => {}}
                onTextChange={t => { const a = [...items]; a[i] = { ...a[i], desc: t }; onChange({ timelineItems: a }); }}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}
