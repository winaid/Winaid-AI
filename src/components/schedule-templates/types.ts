export type EventType = 'closed' | 'night' | 'seminar' | 'normal' | 'custom';

export interface ScheduleEvent {
  date: number;
  label: string;
  type: EventType;
  color?: string;
}

export interface ScheduleRange {
  start: number;
  end: number;
  label: string;
  type: 'range';
  color?: string;
}

export interface ScheduleData {
  clinicName: string;
  monthLabel: string;   // "4월", "12월"
  year: number;
  month: number;        // 1-12
  title: string;        // "4월 진료일정"
  subtitle?: string;
  notices?: string[];
  events: ScheduleEvent[];
  ranges?: ScheduleRange[];
}

/** 템플릿 색상 커스터마이즈 옵션 */
export interface TemplateColors {
  /** 주요 강조색 (헤더 배경, 타이틀, 리본 등) */
  primary?: string;
  /** 보조 강조색 */
  secondary?: string;
  /** 배경색 */
  bg?: string;
  /** 이벤트 타입별 색상 */
  closed?: string;
  night?: string;
  seminar?: string;
  normal?: string;
}

export const DEFAULT_COLORS: Required<TemplateColors> = {
  primary:   '#1976D2',
  secondary: '#64B5F6',
  bg:        '#FFFFFF',
  closed:    '#E53935',
  night:     '#8E24AA',
  seminar:   '#283593',
  normal:    '#388E3C',
};

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  tags: string[];
  previewBg: string;
}
