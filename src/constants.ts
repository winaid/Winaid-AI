import { ContentCategory } from './types';

export const CATEGORIES = [
  { value: ContentCategory.DENTAL, label: '🦷 치과' },
];

export const PERSONAS = [
  { value: 'hospital_info', label: '병원 공식 블로그 (정보성/객관적)' },
  { value: 'director_1st', label: '대표원장 1인칭 (진정성/전문성)' },
  { value: 'coordinator', label: '상담 실장님 (친근함/후기형)' },
];

export const TONES = [
  { value: 'warm', label: '따뜻하고 공감하는 (환자 위로)' },
  { value: 'logical', label: '논리적이고 명확한 (의학 정보)' },
  { value: 'premium', label: '고급스럽고 신뢰감 있는 (VIP 타겟)' },
  { value: 'reassuring', label: '안심시키는 (치과 공포 해소)' },
];
