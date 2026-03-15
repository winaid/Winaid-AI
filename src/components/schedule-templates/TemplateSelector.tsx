import React, { Suspense, useState } from 'react';
import type { ScheduleData, TemplateInfo, CalendarViewMode } from './types';
import T1SpringKindergarten from './templates/T1SpringKindergarten';
import T2CherryBlossom from './templates/T2CherryBlossom';
import T3Autumn from './templates/T3Autumn';
import T4KoreanTraditional from './templates/T4KoreanTraditional';
import T5Notebook from './templates/T5Notebook';
import T6Christmas from './templates/T6Christmas';
import T7AutumnSpringNote from './templates/T7AutumnSpringNote';
import T8AutumnHoliday from './templates/T8AutumnHoliday';
import T9HanokRoof from './templates/T9HanokRoof';
import T10DarkGreenClinic from './templates/T10DarkGreenClinic';
import T11DarkBlueModern from './templates/T11DarkBlueModern';
import T12LavenderSparkle from './templates/T12LavenderSparkle';

/**
 * 진료일정 템플릿 목록
 *
 * 용도 정의: 월간 진료안내 / 휴진안내 / 시즌 공지용 카드
 * (일상적 진료시간 안내와 다름 — 이건 요일별 테이블이 표준)
 *
 * 그룹 분류 기준: 실제 카드 무드
 * ① 프로페셔널 — 병원 공식 느낌, 절제된 톤
 * ② 시즌/이벤트 — 봄·가을·겨울 시즌 한정 안내
 * ③ 전통/문화 — 한의원·명절 안내
 * ④ 캐주얼/친근 — 소아과·동네의원 친근한 안내
 */
export const TEMPLATE_LIST: (TemplateInfo & {
  Component: React.ComponentType<{ data: ScheduleData; width?: number; mode?: CalendarViewMode }>;
  sample: ScheduleData;
})[] = [
  // ─── ① 프로페셔널: 병원 공식 휴진/진료안내 ───
  {
    id: 'dark-green',
    name: '클리닉 그린',
    description: '의료 그린 톤, 미니멀 진료안내 (치과·일반의원)',
    tags: ['프로페셔널', '그린', '클리닉', '휴진안내'],
    previewBg: '#2C4A4A',
    Component: T10DarkGreenClinic,
    sample: {
      clinicName: '윈에이드 치과',
      monthLabel: '10월', year: 2025, month: 10,
      title: '10월 진료안내',
      notices: ['참고하여 내원에 차질이 없으시기 바랍니다.'],
      events: [
        { date: 1, label: '정상진료', type: 'normal', color: '#2E7D32' },
        { date: 3, label: '휴진', type: 'closed' },
        { date: 9, label: '휴진', type: 'closed' },
      ],
    },
  },
  {
    id: 'dark-blue',
    name: '모던 네이비',
    description: '네이비 배경, 프리미엄 진료안내 (정형외과·전문의원)',
    tags: ['프로페셔널', '다크', '네이비', '휴진안내'],
    previewBg: '#0D1B3E',
    Component: T11DarkBlueModern,
    sample: {
      clinicName: '윈에이드 치과',
      monthLabel: '10월', year: 2025, month: 10,
      title: '10월 휴진 안내',
      notices: ['참고하여 내원에 차질 없으시기 바랍니다.'],
      events: [
        { date: 1, label: '임시공휴일', type: 'seminar' },
        { date: 3, label: '개천절', type: 'closed' },
        { date: 9, label: '한글날', type: 'closed' },
      ],
    },
  },
  {
    id: 'neutral-clean',
    name: '뉴트럴 클린',
    description: '베이지·그레이 모노크롬, 미니멀 진료안내 (피부과·여성의원)',
    tags: ['프로페셔널', '뉴트럴', '미니멀', '휴진안내'],
    previewBg: '#F5F0E8',
    Component: T12LavenderSparkle,
    sample: {
      clinicName: '윈에이드 피부과',
      monthLabel: '10월', year: 2025, month: 10,
      title: '10월 진료안내',
      notices: ['참고하여 내원에 차질이 없으시길 바랍니다.'],
      events: [
        { date: 1, label: '정상 진료', type: 'normal', color: '#8A7E72' },
        { date: 3, label: '개천절 휴진', type: 'closed' },
        { date: 9, label: '한글날 휴진', type: 'closed' },
      ],
    },
  },
  {
    id: 'autumn-note',
    name: '다크 브라운',
    description: '브라운 톤, 노트 프레임, 실무형 휴진안내 (정형외과·내과)',
    tags: ['프로페셔널', '다크', '브라운', '휴진안내'],
    previewBg: '#D4A574',
    Component: T7AutumnSpringNote,
    sample: {
      clinicName: '윈에이드 치과',
      monthLabel: '10월', year: 2025, month: 10,
      title: '10월 휴진 안내',
      subtitle: '진료 예약 및 내원에 참고 부탁 드립니다.',
      events: [
        { date: 5, label: '추석연휴', type: 'closed' },
        { date: 6, label: '추석연휴', type: 'closed' },
        { date: 7, label: '추석연휴', type: 'closed' },
      ],
    },
  },
  // ─── ② 시즌/이벤트: 봄·가을·겨울 시즌 한정 안내 ───
  {
    id: 'cherry',
    name: '벚꽃 봄',
    description: '핑크 벚꽃 톤, 봄 시즌 진료안내 (3~4월)',
    tags: ['시즌', '봄', '벚꽃', '핑크'],
    previewBg: '#FCE4EC',
    Component: T2CherryBlossom,
    sample: {
      clinicName: '윈에이드 치과',
      monthLabel: '4월', year: 2025, month: 4,
      title: '4월 진료안내',
      notices: ['내원 및 예약에 착오 없으시길 바랍니다.'],
      events: [
        { date: 3, label: '야간 진료', type: 'night' },
        { date: 12, label: '세미나 휴진', type: 'seminar' },
      ],
    },
  },
  {
    id: 'autumn',
    name: '가을 단풍',
    description: '단풍잎 장식, 가을 시즌 진료안내 (9~11월)',
    tags: ['시즌', '가을', '단풍', '따뜻한'],
    previewBg: '#FFE0B2',
    Component: T3Autumn,
    sample: {
      clinicName: '윈에이드 치과',
      monthLabel: '11월', year: 2025, month: 11,
      title: '11월 진료안내',
      subtitle: '진료일정을 확인하시어 내원 및 예약에 착오 없으시길 바랍니다.',
      events: [
        { date: 6, label: '정기휴진', type: 'closed' },
        { date: 13, label: '정기휴진', type: 'closed' },
      ],
    },
  },
  {
    id: 'autumn-holiday',
    name: '가을 휴진안내',
    description: '베이지 배경, 코너 단풍잎, 추석/연휴 안내용',
    tags: ['시즌', '가을', '추석', '휴진안내'],
    previewBg: '#FDF5EC',
    Component: T8AutumnHoliday,
    sample: {
      clinicName: '윈에이드 치과',
      monthLabel: '10월', year: 2025, month: 10,
      title: '10월 휴진안내',
      notices: ['방문 시 참고 부탁드립니다!'],
      events: [
        { date: 3, label: '개천절', type: 'closed' },
        { date: 9, label: '한글날', type: 'closed' },
        { date: 4, label: '정상 진료', type: 'normal', color: '#C62828' },
      ],
    },
  },
  {
    id: 'christmas',
    name: '크리스마스',
    description: '파스텔 블루, 눈꽃·루돌프, 연말 진료안내 (12월)',
    tags: ['시즌', '겨울', '크리스마스', '연말'],
    previewBg: '#E8EEF5',
    Component: T6Christmas,
    sample: {
      clinicName: '윈에이드 치과',
      monthLabel: '12월', year: 2025, month: 12,
      title: '12월 진료안내',
      subtitle: '한 해 동안 보내주신 믿음에 감사드립니다.',
      events: [
        { date: 4, label: '정기휴진', type: 'closed' },
        { date: 25, label: '성탄절휴진', type: 'closed', color: '#D32F2F' },
      ],
    },
  },
  // ─── ③ 전통/문화: 한의원·명절 안내 ───
  {
    id: 'traditional',
    name: '한국 전통',
    description: '산수화·학·오방색, 한의원/명절 안내 (설·추석)',
    tags: ['전통', '한의원', '명절', '오방색'],
    previewBg: '#F5EDD5',
    Component: T4KoreanTraditional,
    sample: {
      clinicName: '경희 한의원',
      monthLabel: '1월', year: 2025, month: 1,
      title: '1월 진료안내',
      subtitle: '내원시 착오 없으시길 바랍니다',
      events: [
        { date: 1, label: '정상진료', type: 'normal' },
        { date: 4, label: '정기휴진', type: 'closed' },
        { date: 5, label: '야간진료', type: 'night' },
      ],
    },
  },
  {
    id: 'hanok',
    name: '한옥 기와',
    description: '한옥 기와지붕·코랄 톤, 한의원/한방병원 안내',
    tags: ['전통', '한옥', '한의원', '기와'],
    previewBg: '#F0E6D3',
    Component: T9HanokRoof,
    sample: {
      clinicName: '범지기 한의원',
      monthLabel: '2월', year: 2025, month: 2,
      title: '2월 진료안내',
      events: [
        { date: 16, label: '휴진', type: 'closed' },
        { date: 17, label: '휴진', type: 'closed' },
        { date: 18, label: '휴진', type: 'closed' },
      ],
    },
  },
  // ─── ④ 캐주얼/친근: 소아과·동네의원 ───
  {
    id: 'notebook',
    name: '노트북',
    description: '블루 노트 프레임, 의사 캐릭터 (치과·소아치과)',
    tags: ['캐주얼', '의사캐릭터', '블루', '치과'],
    previewBg: '#E3F2FD',
    Component: T5Notebook,
    sample: {
      clinicName: '윈에이드 치과',
      monthLabel: '7월', year: 2025, month: 7,
      title: '7월 진료안내',
      events: [
        { date: 5, label: '정기 휴진', type: 'closed' },
        { date: 6, label: '정기 휴진', type: 'closed' },
        { date: 12, label: '정기 휴진', type: 'closed' },
      ],
    },
  },
  {
    id: 'spring',
    name: '봄 파스텔',
    description: '파스텔 자연 풍경, 소아과/소아치과 안내 (70-25-5 색비율)',
    tags: ['캐주얼', '소아과', '파스텔', '봄'],
    previewBg: '#F0F8FC',
    Component: T1SpringKindergarten,
    sample: {
      clinicName: '해맑은 소아과',
      monthLabel: '4월', year: 2025, month: 4,
      title: '4월 진료안내',
      notices: ['일정은 본원 사정에 의해 변경될 수 있습니다.'],
      events: [{ date: 3, label: '정기휴진', type: 'closed' }],
      ranges: [{ start: 21, end: 26, label: '상담 주간', type: 'range', color: '#FFCDD2' }],
    },
  },
];

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
  previewData: ScheduleData;
}

export default function TemplateSelector({ selectedId, onSelect, previewData }: Props) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewTpl = previewId ? TEMPLATE_LIST.find(t => t.id === previewId) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
        월간 진료안내·휴진안내용 템플릿을 선택하세요. 더블클릭하면 크게 볼 수 있습니다.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          maxHeight: 480,
          overflowY: 'auto',
          paddingRight: 4,
        }}
      >
        {TEMPLATE_LIST.map(tpl => {
          const isSelected = tpl.id === selectedId;
          return (
            <button
              key={tpl.id}
              onClick={() => onSelect(tpl.id)}
              onDoubleClick={(e) => { e.preventDefault(); setPreviewId(tpl.id); }}
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
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Thumbnail preview - fixed aspect ratio, SVG fills */}
              <div className="calendar-thumb-svg" style={{ borderRadius: '8px 8px 0 0' }}>
                <Suspense fallback={<div style={{ height: 120, background: tpl.previewBg }} />}>
                  <tpl.Component data={tpl.sample} width={600} />
                </Suspense>
              </div>

              {/* Label */}
              <div style={{
                padding: '6px 10px',
                textAlign: 'left',
                borderTop: '1px solid #F0F0F0',
              }}>
                <p style={{
                  margin: 0, fontSize: 13, fontWeight: 700,
                  color: isSelected ? '#1565C0' : '#222',
                }}>
                  {isSelected && '✓ '}{tpl.name}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* 더블클릭 미리보기 모달 */}
      {previewTpl && (
        <div
          onClick={() => setPreviewId(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: 16,
              padding: 20,
              maxWidth: '90vw',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              position: 'relative',
            }}
          >
            <button
              onClick={() => setPreviewId(null)}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                background: '#F5F5F5',
                border: 'none',
                borderRadius: '50%',
                width: 32,
                height: 32,
                fontSize: 18,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1,
              }}
            >
              ✕
            </button>
            <p style={{
              margin: '0 0 12px',
              fontSize: 16,
              fontWeight: 700,
              color: '#222',
            }}>
              {previewTpl.name}
            </p>
            <div style={{ lineHeight: 0 }}>
              <Suspense fallback={<div style={{ height: 400, background: '#f0f0f0' }} />}>
                <previewTpl.Component data={previewTpl.sample} width={480} />
              </Suspense>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { onSelect(previewTpl.id); setPreviewId(null); }}
                style={{
                  padding: '8px 20px',
                  background: '#1976D2',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                이 템플릿 선택
              </button>
              <button
                onClick={() => setPreviewId(null)}
                style={{
                  padding: '8px 20px',
                  background: '#F5F5F5',
                  color: '#666',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
