/**
 * 병원별 이미지 라이브러리 — 타입 + 태그 프리셋.
 * Supabase Storage + hospital_images 테이블 기반.
 */

export interface HospitalImage {
  id: string;
  userId: string;
  hospitalName?: string;
  storagePath: string;
  originalFilename?: string;
  fileSize?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  tags: string[];
  altText: string;
  aiDescription?: string;
  usageCount: number;
  createdAt: string;
  publicUrl?: string;
}

export const IMAGE_TAG_PRESETS = [
  // 시술/질환 (20개)
  '임플란트', '치아교정', '스케일링', '충치치료', '신경치료',
  '사랑니', '소아치과', '치아미백', '라미네이트', '틀니',
  '턱관절', '잇몸치료', '보철', '구강검진', '치아외상',
  '예방치료', '발치', '악교정', '구강질환', '마우스가드', '마취', '부작용',
  '레이저치료', '치아본', '교합치료',
  // 장면/공간 (11개)
  '의료진', '병원내부', '상담', '수술', '장비',
  '진료실', '대기실', '외관', '로고', '기사', '일반',
] as const;

export type ImageTag = (typeof IMAGE_TAG_PRESETS)[number] | string;

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const STORAGE_BUCKET = 'hospital-images';

export function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/gif': return 'gif';
    default: return 'bin';
  }
}
