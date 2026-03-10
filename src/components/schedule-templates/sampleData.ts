import type { ScheduleData } from './types';

export const sampleSpring: ScheduleData = {
  clinicName: '윈에이드 치과',
  monthLabel: '4월',
  year: 2025,
  month: 4,
  title: '4월 진료일정',
  notices: [
    '일정은 본원 사정에 의해 변경될 수 있습니다.',
    '궁금하신 사항은 각반 선생님께 문의바랍니다.',
  ],
  events: [
    { date: 1, label: '4월 생일파티', type: 'normal' },
    { date: 3, label: '화분 심는날', type: 'normal', color: '#388E3C' },
    { date: 10, label: '소방교육', type: 'normal', color: '#BF360C' },
    { date: 15, label: '요리체험', type: 'normal' },
    { date: 28, label: '물감놀이', type: 'normal', color: '#1565C0' },
  ],
  ranges: [
    { start: 21, end: 26, label: '학부모 상담 주간', type: 'range', color: '#FFCDD2' },
  ],
};

export const sampleCherry: ScheduleData = {
  clinicName: '윈에이드 치과',
  monthLabel: '4월',
  year: 2025,
  month: 4,
  title: '4월 진료일정',
  notices: [
    '4월 12일 세미나로 인한 휴진이므로,',
    '확인하시어 내원 및 예약에 착오 없으시길 바랍니다.',
  ],
  events: [
    { date: 3, label: '야간 진료', type: 'night' },
    { date: 10, label: '야간 진료', type: 'night' },
    { date: 12, label: '세미나 휴진', type: 'seminar' },
    { date: 17, label: '야간 진료', type: 'night' },
    { date: 24, label: '야간 진료', type: 'night' },
  ],
};

export const sampleAutumn: ScheduleData = {
  clinicName: '윈에이드 치과',
  monthLabel: '11월',
  year: 2025,
  month: 11,
  title: '11월 진료일정',
  subtitle: '진료일정을 확인하시어 내원 및 예약에 착오 없으시길 바랍니다.',
  events: [
    { date: 6, label: '정기휴진', type: 'closed' },
    { date: 13, label: '정기휴진', type: 'closed' },
    { date: 20, label: '정기휴진', type: 'closed' },
    { date: 27, label: '정기휴진', type: 'closed' },
  ],
};

export const sampleTraditional: ScheduleData = {
  clinicName: '윈에이드 치과',
  monthLabel: '1월',
  year: 2025,
  month: 1,
  title: '1월 진료일정',
  subtitle: '윈에이드 치과는 1월 1일 정상진료입니다.\n내원시 착오 없으시길 바랍니다',
  events: [
    { date: 1, label: '정상진료', type: 'normal', color: '#1565C0' },
    { date: 3, label: '정상진료', type: 'normal', color: '#1565C0' },
    { date: 4, label: '정기휴진', type: 'closed', color: '#8B1A2A' },
    { date: 5, label: '야간진료', type: 'night', color: '#6A1B9A' },
    { date: 8, label: '야간진료', type: 'night', color: '#6A1B9A' },
    { date: 10, label: '정상진료', type: 'normal', color: '#1565C0' },
    { date: 11, label: '정기휴진', type: 'closed', color: '#8B1A2A' },
    { date: 12, label: '야간진료', type: 'night', color: '#6A1B9A' },
    { date: 15, label: '야간진료', type: 'night', color: '#6A1B9A' },
    { date: 17, label: '정상진료', type: 'normal', color: '#1565C0' },
    { date: 18, label: '정기휴진', type: 'closed', color: '#8B1A2A' },
    { date: 19, label: '야간진료', type: 'night', color: '#6A1B9A' },
    { date: 22, label: '야간진료', type: 'night', color: '#6A1B9A' },
    { date: 24, label: '정상진료', type: 'normal', color: '#1565C0' },
    { date: 25, label: '정기휴진', type: 'closed', color: '#8B1A2A' },
    { date: 26, label: '야간진료', type: 'night', color: '#6A1B9A' },
    { date: 29, label: '야간진료', type: 'night', color: '#6A1B9A' },
    { date: 31, label: '정상진료', type: 'normal', color: '#1565C0' },
  ],
};

export const sampleNotebook: ScheduleData = {
  clinicName: '윈에이드 치과',
  monthLabel: '7월',
  year: 2025,
  month: 7,
  title: '7월 진료일정',
  events: [
    { date: 5, label: '정기 휴진', type: 'closed' },
    { date: 6, label: '정기 휴진', type: 'closed' },
    { date: 12, label: '정기 휴진', type: 'closed' },
    { date: 13, label: '정기 휴진', type: 'closed' },
    { date: 19, label: '정기 휴진', type: 'closed' },
    { date: 20, label: '정기 휴진', type: 'closed' },
    { date: 26, label: '정기 휴진', type: 'closed' },
    { date: 27, label: '정기 휴진', type: 'closed' },
  ],
};

export const sampleChristmas: ScheduleData = {
  clinicName: '윈에이드 치과',
  monthLabel: '12월',
  year: 2025,
  month: 12,
  title: '12월 진료일정',
  subtitle:
    '진료일정을 확인하시어 내원 및 예약에 착오 없으시길 바랍니다.\n한 해 동안 윈에이드 치과에 보내주신 믿음에 감사드립니다.',
  events: [
    { date: 4, label: '정기휴진', type: 'closed' },
    { date: 11, label: '정기휴진', type: 'closed' },
    { date: 18, label: '정기휴진', type: 'closed' },
    { date: 25, label: '성탄절휴진', type: 'closed', color: '#D32F2F' },
  ],
};
