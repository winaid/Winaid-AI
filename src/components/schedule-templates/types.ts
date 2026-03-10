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

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  tags: string[];
  previewBg: string;
}
