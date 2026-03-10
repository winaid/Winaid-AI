/**
 * ScheduleTemplatePage - 진료일정 템플릿 생성 페이지 사용 예시
 *
 * 사용법:
 *   import ScheduleTemplatePage from './components/ScheduleTemplatePage';
 *   <ScheduleTemplatePage />
 */

import React, { useState, useRef, Suspense } from 'react';
import type { ScheduleData, ScheduleEvent, ScheduleRange, EventType } from './schedule-templates';
import { TEMPLATE_LIST, TemplateSelector } from './schedule-templates';

const EVENT_TYPE_OPTIONS: { value: EventType; label: string; color: string }[] = [
  { value: 'closed',  label: '정기휴진',   color: '#E53935' },
  { value: 'night',   label: '야간진료',   color: '#8E24AA' },
  { value: 'seminar', label: '세미나 휴진', color: '#283593' },
  { value: 'normal',  label: '정상진료',   color: '#388E3C' },
  { value: 'custom',  label: '직접입력',   color: '#FF6F00' },
];

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}월`,
}));

const currentYear = new Date().getFullYear();

function defaultData(): ScheduleData {
  const now = new Date();
  return {
    clinicName: '윈에이드 치과',
    monthLabel: `${now.getMonth() + 1}월`,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    title: `${now.getMonth() + 1}월 진료일정`,
    subtitle: '진료일정을 확인하시어 내원 및 예약에 착오 없으시길 바랍니다.',
    notices: ['일정은 본원 사정에 의해 변경될 수 있습니다.'],
    events: [
      { date: 1, label: '정기휴진', type: 'closed' },
    ],
    ranges: [],
  };
}

export default function ScheduleTemplatePage() {
  const [selectedTemplateId, setSelectedTemplateId] = useState('cherry');
  const [data, setData] = useState<ScheduleData>(defaultData);

  // Event editor state
  const [newEvent, setNewEvent] = useState<{ date: string; label: string; type: EventType }>({
    date: '', label: '정기휴진', type: 'closed',
  });

  // Range editor state
  const [newRange, setNewRange] = useState<{ start: string; end: string; label: string }>({
    start: '', end: '', label: '상담 주간',
  });

  const previewRef = useRef<HTMLDivElement>(null);

  const selectedTemplate = TEMPLATE_LIST.find(t => t.id === selectedTemplateId)!;
  const Component = selectedTemplate.Component;

  // ── Data handlers ──
  function updateField(field: keyof ScheduleData, value: unknown) {
    setData(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'month' || field === 'year') {
        const m = field === 'month' ? (value as number) : prev.month;
        const y = field === 'year' ? (value as number) : prev.year;
        next.monthLabel = `${m}월`;
        next.title = `${m}월 진료일정`;
        next.month = m;
        next.year = y;
      }
      return next;
    });
  }

  function addEvent() {
    const d = parseInt(newEvent.date);
    if (!d || d < 1 || d > 31 || !newEvent.label.trim()) return;
    const ev: ScheduleEvent = { date: d, label: newEvent.label, type: newEvent.type };
    setData(prev => ({ ...prev, events: [...prev.events.filter(e => e.date !== d), ev] }));
    setNewEvent(p => ({ ...p, date: '' }));
  }

  function removeEvent(date: number) {
    setData(prev => ({ ...prev, events: prev.events.filter(e => e.date !== date) }));
  }

  function addRange() {
    const s = parseInt(newRange.start);
    const e = parseInt(newRange.end);
    if (!s || !e || s > e || !newRange.label.trim()) return;
    const r: ScheduleRange = { start: s, end: e, label: newRange.label, type: 'range', color: '#FFCDD2' };
    setData(prev => ({ ...prev, ranges: [...(prev.ranges ?? []), r] }));
    setNewRange({ start: '', end: '', label: '상담 주간' });
  }

  function removeRange(i: number) {
    setData(prev => ({ ...prev, ranges: prev.ranges?.filter((_, idx) => idx !== i) }));
  }

  // ── SVG Download ──
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

  const inputStyle: React.CSSProperties = {
    border: '1.5px solid #E0E0E0', borderRadius: 6, padding: '6px 10px',
    fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block',
  };
  const sectionStyle: React.CSSProperties = {
    background: '#FAFAFA', border: '1px solid #EFEFEF',
    borderRadius: 10, padding: 16, marginBottom: 16,
  };

  return (
    <div style={{
      display: 'flex', gap: 24, padding: 24, minHeight: '100vh',
      background: '#F5F7FA', fontFamily: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
    }}>
      {/* ── LEFT PANEL ── */}
      <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1A2A4A' }}>
          진료일정 템플릿 만들기
        </h2>

        {/* Template selector */}
        <div style={sectionStyle}>
          <p style={{ ...labelStyle, fontSize: 13, marginBottom: 10 }}>템플릿 선택</p>
          <TemplateSelector
            selectedId={selectedTemplateId}
            onSelect={setSelectedTemplateId}
            previewData={data}
          />
        </div>

        {/* Basic info */}
        <div style={sectionStyle}>
          <p style={{ ...labelStyle, fontSize: 13, marginBottom: 10 }}>기본 정보</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>연도</label>
              <select
                style={inputStyle}
                value={data.year}
                onChange={e => updateField('year', parseInt(e.target.value))}
              >
                {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>월</label>
              <select
                style={inputStyle}
                value={data.month}
                onChange={e => updateField('month', parseInt(e.target.value))}
              >
                {MONTH_OPTIONS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>병원명</label>
            <input
              style={inputStyle}
              value={data.clinicName}
              onChange={e => updateField('clinicName', e.target.value)}
              placeholder="예: 윈에이드 치과"
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>부제목 (선택)</label>
            <input
              style={inputStyle}
              value={data.subtitle ?? ''}
              onChange={e => updateField('subtitle', e.target.value)}
              placeholder="예: 진료일정을 확인해 주세요."
            />
          </div>
          <div>
            <label style={labelStyle}>하단 안내 (선택, 줄바꿈으로 구분)</label>
            <textarea
              style={{ ...inputStyle, height: 62, resize: 'vertical' }}
              value={(data.notices ?? []).join('\n')}
              onChange={e => updateField('notices', e.target.value.split('\n'))}
              placeholder="일정은 변경될 수 있습니다."
            />
          </div>
        </div>

        {/* Events */}
        <div style={sectionStyle}>
          <p style={{ ...labelStyle, fontSize: 13, marginBottom: 10 }}>이벤트 추가</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              style={{ ...inputStyle, width: 56 }}
              type="number" min={1} max={31}
              placeholder="일"
              value={newEvent.date}
              onChange={e => setNewEvent(p => ({ ...p, date: e.target.value }))}
            />
            <input
              style={inputStyle}
              placeholder="이벤트명"
              value={newEvent.label}
              onChange={e => setNewEvent(p => ({ ...p, label: e.target.value }))}
            />
            <select
              style={{ ...inputStyle, width: 110 }}
              value={newEvent.type}
              onChange={e => setNewEvent(p => ({ ...p, type: e.target.value as EventType }))}
            >
              {EVENT_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={addEvent}
              style={{
                padding: '6px 14px', background: '#1976D2', color: 'white',
                border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              추가
            </button>
          </div>

          {/* Event list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
            {data.events.sort((a, b) => a.date - b.date).map(ev => {
              const typeInfo = EVENT_TYPE_OPTIONS.find(o => o.value === ev.type);
              return (
                <div key={ev.date} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'white', borderRadius: 6, padding: '5px 10px',
                  border: '1px solid #EEE',
                }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: typeInfo?.color ?? '#999',
                    color: 'white', fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {ev.date}
                  </span>
                  <span style={{ fontSize: 13, flex: 1 }}>{ev.label}</span>
                  <span style={{ fontSize: 11, color: typeInfo?.color ?? '#999' }}>
                    {typeInfo?.label}
                  </span>
                  <button
                    onClick={() => removeEvent(ev.date)}
                    style={{
                      background: 'none', border: 'none', color: '#BDBDBD',
                      cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ranges */}
        <div style={sectionStyle}>
          <p style={{ ...labelStyle, fontSize: 13, marginBottom: 10 }}>기간 표시 (range 바)</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              style={{ ...inputStyle, width: 50 }}
              type="number" min={1} max={31}
              placeholder="시작"
              value={newRange.start}
              onChange={e => setNewRange(p => ({ ...p, start: e.target.value }))}
            />
            <span style={{ lineHeight: '34px', color: '#888' }}>~</span>
            <input
              style={{ ...inputStyle, width: 50 }}
              type="number" min={1} max={31}
              placeholder="종료"
              value={newRange.end}
              onChange={e => setNewRange(p => ({ ...p, end: e.target.value }))}
            />
            <input
              style={inputStyle}
              placeholder="라벨"
              value={newRange.label}
              onChange={e => setNewRange(p => ({ ...p, label: e.target.value }))}
            />
            <button
              onClick={addRange}
              style={{
                padding: '6px 14px', background: '#388E3C', color: 'white',
                border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              }}
            >
              추가
            </button>
          </div>
          {(data.ranges ?? []).map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'white', borderRadius: 6, padding: '5px 10px',
              border: '1px solid #EEE', marginBottom: 4,
            }}>
              <span style={{ fontSize: 12, flex: 1, color: '#444' }}>
                {r.start}일 ~ {r.end}일 : {r.label}
              </span>
              <button
                onClick={() => removeRange(i)}
                style={{ background: 'none', border: 'none', color: '#BDBDBD', cursor: 'pointer', fontSize: 16 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Download */}
        <button
          onClick={downloadSVG}
          style={{
            padding: '12px 0', background: '#1A2A4A', color: 'white',
            border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700,
            cursor: 'pointer', letterSpacing: '0.5px',
          }}
        >
          SVG 다운로드
        </button>
      </div>

      {/* ── RIGHT PANEL: Preview ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
          alignSelf: 'flex-start',
        }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#333' }}>
            미리보기 — {selectedTemplate.name}
          </h3>
          <span style={{
            background: selectedTemplate.previewBg, borderRadius: 20,
            padding: '2px 12px', fontSize: 12, color: '#555',
          }}>
            {data.monthLabel}
          </span>
        </div>

        <div
          ref={previewRef}
          style={{
            width: '100%', maxWidth: 520,
            boxShadow: '0 8px 40px rgba(0,0,0,0.14)',
            borderRadius: 12, overflow: 'hidden',
            background: 'white',
          }}
        >
          <Suspense fallback={
            <div style={{ height: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              로딩 중...
            </div>
          }>
            <Component data={data} width={520} />
          </Suspense>
        </div>

        <p style={{ marginTop: 12, fontSize: 12, color: '#AAA' }}>
          왼쪽에서 데이터를 수정하면 실시간으로 반영됩니다.
        </p>
      </div>
    </div>
  );
}
