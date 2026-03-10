import React, { Suspense } from 'react';
import type { ScheduleData, TemplateInfo } from './types';
import T1SpringKindergarten from './templates/T1SpringKindergarten';
import T2CherryBlossom from './templates/T2CherryBlossom';
import T3Autumn from './templates/T3Autumn';
import T4KoreanTraditional from './templates/T4KoreanTraditional';
import T5Notebook from './templates/T5Notebook';
import T6Christmas from './templates/T6Christmas';

export const TEMPLATE_LIST: (TemplateInfo & {
  Component: React.ComponentType<{ data: ScheduleData; width?: number }>;
  sample: ScheduleData;
})[] = [
  {
    id: 'spring',
    name: '봄 유치원',
    description: '하늘색 배경, 초록 리본, 꽃 장식',
    tags: ['봄', '유치원', '밝은', '귀여운'],
    previewBg: '#B3E5FC',
    Component: T1SpringKindergarten,
    sample: {
      clinicName: '윈에이드 치과',
      monthLabel: '4월', year: 2025, month: 4,
      title: '4월 진료일정',
      notices: ['일정은 본원 사정에 의해 변경될 수 있습니다.'],
      events: [{ date: 3, label: '정기휴진', type: 'closed' }],
      ranges: [{ start: 21, end: 26, label: '상담 주간', type: 'range', color: '#FFCDD2' }],
    },
  },
  {
    id: 'cherry',
    name: '벚꽃 치과',
    description: '핑크 벚꽃, 원형 이벤트 뱃지',
    tags: ['봄', '벚꽃', '핑크', '치과'],
    previewBg: '#FCE4EC',
    Component: T2CherryBlossom,
    sample: {
      clinicName: '윈에이드 치과',
      monthLabel: '4월', year: 2025, month: 4,
      title: '4월 진료일정',
      notices: ['내원 및 예약에 착오 없으시길 바랍니다.'],
      events: [
        { date: 3, label: '야간 진료', type: 'night' },
        { date: 12, label: '세미나 휴진', type: 'seminar' },
      ],
    },
  },
  {
    id: 'autumn',
    name: '단풍 치과',
    description: '주황 단풍, 노란 pill 뱃지',
    tags: ['가을', '단풍', '따뜻한', '치과'],
    previewBg: '#FFE0B2',
    Component: T3Autumn,
    sample: {
      clinicName: '윈에이드 치과',
      monthLabel: '11월', year: 2025, month: 11,
      title: '11월 진료일정',
      subtitle: '진료일정을 확인하시어 내원 및 예약에 착오 없으시길 바랍니다.',
      events: [
        { date: 6, label: '정기휴진', type: 'closed' },
        { date: 13, label: '정기휴진', type: 'closed' },
      ],
    },
  },
  {
    id: 'traditional',
    name: '한국 전통',
    description: '베이지 산수화, 학, 전통 장식',
    tags: ['전통', '한국', '격조', '치과'],
    previewBg: '#F5EDD5',
    Component: T4KoreanTraditional,
    sample: {
      clinicName: '윈에이드 치과',
      monthLabel: '1월', year: 2025, month: 1,
      title: '1월 진료일정',
      subtitle: '내원시 착오 없으시길 바랍니다',
      events: [
        { date: 1, label: '정상진료', type: 'normal', color: '#1565C0' },
        { date: 4, label: '정기휴진', type: 'closed', color: '#8B1A2A' },
        { date: 5, label: '야간진료', type: 'night', color: '#6A1B9A' },
      ],
    },
  },
  {
    id: 'notebook',
    name: '노트 치과',
    description: '파란 노트 프레임, 의사 캐릭터',
    tags: ['캐주얼', '노트', '파란', '치과'],
    previewBg: '#E3F2FD',
    Component: T5Notebook,
    sample: {
      clinicName: '윈에이드 치과',
      monthLabel: '7월', year: 2025, month: 7,
      title: '7월 진료일정',
      events: [
        { date: 5, label: '정기 휴진', type: 'closed' },
        { date: 6, label: '정기 휴진', type: 'closed' },
        { date: 12, label: '정기 휴진', type: 'closed' },
      ],
    },
  },
  {
    id: 'christmas',
    name: '크리스마스',
    description: '연청 눈꽃, 루돌프 실루엣',
    tags: ['겨울', '크리스마스', '연말', '치과'],
    previewBg: '#E8EEF5',
    Component: T6Christmas,
    sample: {
      clinicName: '윈에이드 치과',
      monthLabel: '12월', year: 2025, month: 12,
      title: '12월 진료일정',
      subtitle: '한 해 동안 보내주신 믿음에 감사드립니다.',
      events: [
        { date: 4, label: '정기휴진', type: 'closed' },
        { date: 25, label: '성탄절휴진', type: 'closed', color: '#D32F2F' },
      ],
    },
  },
];

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
  previewData: ScheduleData;
}

export default function TemplateSelector({ selectedId, onSelect, previewData }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
        템플릿을 선택하면 오른쪽 미리보기에 반영됩니다.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
        }}
      >
        {TEMPLATE_LIST.map(tpl => {
          const isSelected = tpl.id === selectedId;
          return (
            <button
              key={tpl.id}
              onClick={() => onSelect(tpl.id)}
              style={{
                border: isSelected ? '2.5px solid #1976D2' : '2px solid #E0E0E0',
                borderRadius: 10,
                padding: 0,
                cursor: 'pointer',
                background: 'white',
                overflow: 'hidden',
                boxShadow: isSelected
                  ? '0 0 0 3px rgba(25,118,210,0.18)'
                  : '0 2px 6px rgba(0,0,0,0.08)',
                transition: 'all 0.15s',
              }}
            >
              {/* Thumbnail preview */}
              <div style={{ background: tpl.previewBg, overflow: 'hidden', height: 140 }}>
                <Suspense fallback={<div style={{ height: 140, background: tpl.previewBg }} />}>
                  <tpl.Component data={tpl.sample} width={190} />
                </Suspense>
              </div>

              {/* Label */}
              <div style={{ padding: '8px 10px', textAlign: 'left' }}>
                <p style={{
                  margin: 0, fontSize: 13, fontWeight: 700,
                  color: isSelected ? '#1565C0' : '#222',
                }}>
                  {tpl.name}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#888' }}>
                  {tpl.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
