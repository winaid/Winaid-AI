/**
 * ScheduleTemplatePage — 진료일정 템플릿 생성 페이지
 *
 * V2 기능:
 * - PNG/JPG 내보내기 (Canvas API)
 * - 이전달/다음달 네비게이션
 * - 색상 커스터마이즈
 */

import React, { useState, useRef, useCallback, Suspense } from 'react';
import type { ScheduleData, ScheduleEvent, ScheduleRange, EventType, TemplateColors, CalendarViewMode } from './schedule-templates';
import { DEFAULT_COLORS, TEMPLATE_LIST, TemplateSelector } from './schedule-templates';

// ── 타입 & 상수 ──────────────────────────────────────────────────
const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'closed',  label: '정기휴진' },
  { value: 'night',   label: '야간진료' },
  { value: 'seminar', label: '세미나 휴진' },
  { value: 'normal',  label: '정상진료' },
  { value: 'custom',  label: '직접입력' },
];

const COLOR_FIELDS: { key: keyof TemplateColors; label: string }[] = [
  { key: 'primary',   label: '주요 색상' },
  { key: 'secondary', label: '보조 색상' },
  { key: 'closed',    label: '휴진 색상' },
  { key: 'night',     label: '야간진료 색상' },
  { key: 'seminar',   label: '세미나 색상' },
  { key: 'normal',    label: '정상진료 색상' },
];

const curYear = new Date().getFullYear();

function makeDefaultData(): ScheduleData {
  const now = new Date();
  const m = now.getMonth() + 1;
  return {
    clinicName: '윈에이드 치과',
    monthLabel: `${m}월`,
    year: now.getFullYear(),
    month: m,
    title: `${m}월 진료일정`,
    subtitle: '진료일정을 확인하시어 내원 및 예약에 착오 없으시길 바랍니다.',
    notices: ['일정은 본원 사정에 의해 변경될 수 있습니다.'],
    events: [{ date: 1, label: '정기휴진', type: 'closed' }],
    ranges: [],
  };
}

// ── 공통 스타일 ────────────────────────────────────────────────
const S = {
  input: {
    border: '1.5px solid #E0E0E0', borderRadius: 6,
    padding: '6px 10px', fontSize: 13, outline: 'none',
    width: '100%', boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
  },
  label: {
    fontSize: 11, fontWeight: 700, color: '#777',
    marginBottom: 4, display: 'block', textTransform: 'uppercase' as const,
    letterSpacing: '0.6px',
  },
  section: {
    background: '#FAFAFA', border: '1px solid #EEEEEE',
    borderRadius: 10, padding: 16, marginBottom: 14,
  },
  btn: (color: string, textColor = 'white'): React.CSSProperties => ({
    padding: '8px 16px', background: color, color: textColor,
    border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700,
    cursor: 'pointer', letterSpacing: '0.3px',
  }),
};

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export default function ScheduleTemplatePage() {
  const [templateId, setTemplateId] = useState('cherry');
  const [data, setData] = useState<ScheduleData>(makeDefaultData);
  const [colors, setColors] = useState<TemplateColors>({ ...DEFAULT_COLORS });
  const [showColorPanel, setShowColorPanel] = useState(false);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('full');

  const [newEvent, setNewEvent] = useState({ date: '', label: '정기휴진', type: 'closed' as EventType });
  const [newRange, setNewRange] = useState({ start: '', end: '', label: '상담 주간' });

  const previewRef = useRef<HTMLDivElement>(null);

  const selectedTemplate = TEMPLATE_LIST.find(t => t.id === templateId)!;
  const Component = selectedTemplate.Component;

  // ── 월 이동 ─────────────────────────────────────────────────
  const changeMonth = useCallback((delta: number) => {
    setData(prev => {
      let m = prev.month + delta;
      let y = prev.year;
      if (m > 12) { m = 1; y += 1; }
      if (m < 1)  { m = 12; y -= 1; }
      return {
        ...prev,
        month: m, year: y,
        monthLabel: `${m}월`,
        title: `${m}월 진료일정`,
      };
    });
  }, []);

  // ── 데이터 업데이트 ────────────────────────────────────────
  function updateField(field: keyof ScheduleData, value: unknown) {
    setData(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'month') {
        const m = value as number;
        next.monthLabel = `${m}월`;
        next.title = `${m}월 진료일정`;
      }
      return next;
    });
  }

  function addEvent() {
    const d = parseInt(newEvent.date);
    if (!d || d < 1 || d > 31 || !newEvent.label.trim()) return;
    const ev: ScheduleEvent = { date: d, label: newEvent.label, type: newEvent.type };
    setData(prev => ({
      ...prev,
      events: [...prev.events.filter(e => e.date !== d), ev],
    }));
    setNewEvent(p => ({ ...p, date: '' }));
  }

  function addRange() {
    const s = parseInt(newRange.start);
    const e = parseInt(newRange.end);
    if (!s || !e || s > e || !newRange.label.trim()) return;
    const r: ScheduleRange = { start: s, end: e, label: newRange.label, type: 'range', color: '#FFCDD2' };
    setData(prev => ({ ...prev, ranges: [...(prev.ranges ?? []), r] }));
    setNewRange({ start: '', end: '', label: '상담 주간' });
  }

  // ── SVG 다운로드 ────────────────────────────────────────────
  function downloadSVG() {
    const svg = previewRef.current?.querySelector('svg');
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.clinicName}_${data.monthLabel}_진료일정.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── PNG / JPG 다운로드 (Canvas API) ─────────────────────────
  async function downloadImage(format: 'png' | 'jpg') {
    const svgEl = previewRef.current?.querySelector('svg');
    if (!svgEl) return;

    // SVG → blob URL
    const serialized = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const SCALE = 2; // 2x 해상도 (고화질)
      const W = img.naturalWidth  || svgEl.clientWidth;
      const H = img.naturalHeight || svgEl.clientHeight;

      const canvas = document.createElement('canvas');
      canvas.width  = W * SCALE;
      canvas.height = H * SCALE;

      const ctx = canvas.getContext('2d')!;
      // JPG는 배경이 필요 (투명 → 흰색)
      if (format === 'jpg') {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.scale(SCALE, SCALE);
      ctx.drawImage(img, 0, 0, W, H);

      canvas.toBlob(
        blob => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${data.clinicName}_${data.monthLabel}_진료일정.${format}`;
          a.click();
          URL.revokeObjectURL(url);
        },
        format === 'jpg' ? 'image/jpeg' : 'image/png',
        0.95,
      );
      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  }

  // ── 색상 리셋 ───────────────────────────────────────────────
  function resetColors() {
    setColors({ ...DEFAULT_COLORS });
  }

  // ── 렌더 ────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', gap: 20, padding: 20, minHeight: '100vh',
      background: '#F4F6F9',
      fontFamily: "'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif",
    }}>

      {/* ════ LEFT PANEL ════ */}
      <div style={{ width: 480, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0, maxHeight: '100vh', overflowY: 'auto' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 19, fontWeight: 800, color: '#1A2A4A' }}>
          진료일정 템플릿
        </h2>

        {/* 템플릿 선택 */}
        <div style={S.section}>
          <p style={{ ...S.label, marginBottom: 10 }}>템플릿 선택</p>
          <TemplateSelector
            selectedId={templateId}
            onSelect={setTemplateId}
            previewData={data}
          />
        </div>

        {/* 기본 정보 */}
        <div style={S.section}>
          <p style={{ ...S.label, marginBottom: 10 }}>기본 정보</p>

          {/* 월 네비게이션 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <button
              style={{
                ...S.btn('#E3E8F0', '#333'),
                padding: '8px 14px', fontSize: 18, lineHeight: 1,
              }}
              onClick={() => changeMonth(-1)}
            >
              ‹
            </button>
            <div style={{
              flex: 1, textAlign: 'center',
              fontSize: 20, fontWeight: 800, color: '#1A2A4A',
            }}>
              {data.year}년 {data.monthLabel}
            </div>
            <button
              style={{
                ...S.btn('#E3E8F0', '#333'),
                padding: '8px 14px', fontSize: 18, lineHeight: 1,
              }}
              onClick={() => changeMonth(1)}
            >
              ›
            </button>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={S.label}>병원명</label>
            <input
              style={S.input}
              value={data.clinicName}
              onChange={e => updateField('clinicName', e.target.value)}
              placeholder="예: 윈에이드 치과"
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={S.label}>부제목 (선택)</label>
            <input
              style={S.input}
              value={data.subtitle ?? ''}
              onChange={e => updateField('subtitle', e.target.value)}
              placeholder="예: 진료일정을 확인해 주세요."
            />
          </div>
          <div>
            <label style={S.label}>하단 안내 (줄바꿈으로 구분)</label>
            <textarea
              style={{ ...S.input, height: 56, resize: 'vertical' }}
              value={(data.notices ?? []).join('\n')}
              onChange={e => updateField('notices', e.target.value ? e.target.value.split('\n') : [])}
            />
          </div>
        </div>

        {/* 색상 커스터마이즈 */}
        <div style={S.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ ...S.label, margin: 0 }}>색상 커스터마이즈</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{ ...S.btn('#F5F5F5', '#666'), padding: '4px 10px', fontSize: 11 }}
                onClick={resetColors}
              >
                초기화
              </button>
              <button
                style={{ ...S.btn(showColorPanel ? '#1976D2' : '#E3E8F0', showColorPanel ? 'white' : '#333'), padding: '4px 10px', fontSize: 11 }}
                onClick={() => setShowColorPanel(p => !p)}
              >
                {showColorPanel ? '닫기' : '열기'}
              </button>
            </div>
          </div>

          {showColorPanel && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              {COLOR_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label style={S.label}>{label}</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={colors[key] ?? DEFAULT_COLORS[key]}
                      onChange={e => setColors(prev => ({ ...prev, [key]: e.target.value }))}
                      style={{
                        width: 36, height: 32, border: '1.5px solid #E0E0E0',
                        borderRadius: 6, cursor: 'pointer', padding: 2,
                      }}
                    />
                    <input
                      style={{ ...S.input, fontFamily: 'monospace', fontSize: 12 }}
                      value={colors[key] ?? DEFAULT_COLORS[key]}
                      onChange={e => setColors(prev => ({ ...prev, [key]: e.target.value }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 색상 미리보기 스트립 */}
          <div style={{ display: 'flex', gap: 4, marginTop: showColorPanel ? 12 : 0, height: 20 }}>
            {COLOR_FIELDS.map(({ key }) => (
              <div key={key} style={{
                flex: 1, borderRadius: 4,
                background: colors[key] ?? DEFAULT_COLORS[key],
              }} title={key} />
            ))}
          </div>
        </div>

        {/* 이벤트 추가 */}
        <div style={S.section}>
          <p style={{ ...S.label, marginBottom: 10 }}>이벤트 추가</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              style={{ ...S.input, width: 54, flexShrink: 0 }}
              type="number" min={1} max={31} placeholder="일"
              value={newEvent.date}
              onChange={e => setNewEvent(p => ({ ...p, date: e.target.value }))}
            />
            <input
              style={S.input}
              placeholder="이벤트명"
              value={newEvent.label}
              onChange={e => setNewEvent(p => ({ ...p, label: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addEvent()}
            />
            <select
              style={{ ...S.input, width: 100, flexShrink: 0 }}
              value={newEvent.type}
              onChange={e => setNewEvent(p => ({ ...p, type: e.target.value as EventType }))}
            >
              {EVENT_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button style={{ ...S.btn('#1976D2'), whiteSpace: 'nowrap' }} onClick={addEvent}>
              추가
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
            {[...data.events].sort((a, b) => a.date - b.date).map(ev => {
              const typeLabel = EVENT_TYPE_OPTIONS.find(o => o.value === ev.type)?.label ?? ev.type;
              const typeColor = colors[ev.type] ?? DEFAULT_COLORS[ev.type as keyof typeof DEFAULT_COLORS] ?? '#999';
              return (
                <div key={ev.date} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'white', borderRadius: 6,
                  padding: '5px 10px', border: '1px solid #EEE',
                }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: typeColor, color: 'white',
                    fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {ev.date}
                  </span>
                  <span style={{ fontSize: 13, flex: 1 }}>{ev.label}</span>
                  <span style={{ fontSize: 11, color: typeColor }}>{typeLabel}</span>
                  <button
                    onClick={() => setData(p => ({ ...p, events: p.events.filter(e => e.date !== ev.date) }))}
                    style={{ background: 'none', border: 'none', color: '#CCC', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}
                  >×</button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Range 추가 */}
        <div style={S.section}>
          <p style={{ ...S.label, marginBottom: 10 }}>기간 바 (range)</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
            <input style={{ ...S.input, width: 50, flexShrink: 0 }} type="number" min={1} max={31}
              placeholder="시작" value={newRange.start}
              onChange={e => setNewRange(p => ({ ...p, start: e.target.value }))} />
            <span style={{ color: '#AAA', fontSize: 14 }}>~</span>
            <input style={{ ...S.input, width: 50, flexShrink: 0 }} type="number" min={1} max={31}
              placeholder="종료" value={newRange.end}
              onChange={e => setNewRange(p => ({ ...p, end: e.target.value }))} />
            <input style={S.input} placeholder="라벨" value={newRange.label}
              onChange={e => setNewRange(p => ({ ...p, label: e.target.value }))} />
            <button style={{ ...S.btn('#388E3C'), whiteSpace: 'nowrap' }} onClick={addRange}>추가</button>
          </div>
          {(data.ranges ?? []).map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
              background: 'white', borderRadius: 6, padding: '5px 10px', border: '1px solid #EEE',
            }}>
              <span style={{ fontSize: 12, flex: 1, color: '#555' }}>
                {r.start}일 ~ {r.end}일 : {r.label}
              </span>
              <button
                onClick={() => setData(p => ({ ...p, ranges: p.ranges?.filter((_, idx) => idx !== i) }))}
                style={{ background: 'none', border: 'none', color: '#CCC', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}
              >×</button>
            </div>
          ))}
        </div>

        {/* 다운로드 버튼 */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...S.btn('#1A2A4A'), flex: 1, padding: '12px 0', fontSize: 14 }} onClick={downloadSVG}>
            SVG 다운로드
          </button>
          <button style={{ ...S.btn('#2E7D32'), flex: 1, padding: '12px 0', fontSize: 14 }} onClick={() => downloadImage('png')}>
            PNG 저장
          </button>
          <button style={{ ...S.btn('#E65100'), flex: 1, padding: '12px 0', fontSize: 14 }} onClick={() => downloadImage('jpg')}>
            JPG 저장
          </button>
        </div>
      </div>

      {/* ════ RIGHT PANEL: 미리보기 ════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, alignSelf: 'flex-start', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#333' }}>
            미리보기 — {selectedTemplate.name}
          </h3>
          <span style={{
            background: selectedTemplate.previewBg, borderRadius: 20,
            padding: '2px 12px', fontSize: 12, color: '#555',
          }}>
            {data.year}년 {data.monthLabel}
          </span>
          {/* 뷰 모드 토글 */}
          <div style={{
            display: 'flex', background: '#E3E8F0', borderRadius: 8, padding: 2,
          }}>
            {([
              { mode: 'full' as const, label: '전체 달력' },
              { mode: 'weekly' as const, label: '한 주' },
              { mode: 'highlight' as const, label: '강조형' },
            ]).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '5px 14px', fontSize: 12, fontWeight: 700,
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  background: viewMode === mode ? '#1976D2' : 'transparent',
                  color: viewMode === mode ? 'white' : '#555',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {/* 월 빠른 이동 버튼 (미리보기 위) */}
          <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
            <button
              style={{ ...S.btn('#E3E8F0', '#555'), padding: '4px 12px', fontSize: 13 }}
              onClick={() => changeMonth(-1)}
            >← 이전달</button>
            <button
              style={{ ...S.btn('#E3E8F0', '#555'), padding: '4px 12px', fontSize: 13 }}
              onClick={() => changeMonth(1)}
            >다음달 →</button>
          </div>
        </div>

        {/* 템플릿 미리보기 */}
        <div
          ref={previewRef}
          style={{
            width: '100%', maxWidth: 500,
            boxShadow: '0 8px 40px rgba(0,0,0,0.14)',
            borderRadius: 12, overflow: 'hidden',
          }}
        >
          <Suspense fallback={
            <div style={{
              height: 600, background: selectedTemplate.previewBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 14,
            }}>
              로딩 중...
            </div>
          }>
            <Component data={data} width={500} colors={colors} mode={viewMode} />
          </Suspense>
        </div>

        <p style={{ marginTop: 10, fontSize: 11, color: '#AAA' }}>
          왼쪽에서 수정하면 실시간 반영 · PNG/JPG는 2배 해상도로 저장됩니다
        </p>
      </div>
    </div>
  );
}
