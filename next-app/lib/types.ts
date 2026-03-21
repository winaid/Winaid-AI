/**
 * 콘텐츠 생성 관련 타입 — 기존 src/types.ts에서 블로그 생성에 필요한 핵심만 추출
 * 마이그레이션 완료 후 통합 예정
 */

export enum ContentCategory {
  DENTAL = '치과',
}

export type AudienceMode =
  | '환자용(친절/공감)'
  | '보호자용(가족걱정)'
  | '전문가용(신뢰/정보)';

export type ImageStyle = 'photo' | 'illustration' | 'medical' | 'custom';
export type PostType = 'blog' | 'card_news' | 'press_release';
export type CssTheme = 'modern' | 'premium' | 'minimal' | 'warm' | 'professional';
export type WritingStyle = 'expert' | 'empathy' | 'conversion';

export interface GenerationRequest {
  category: ContentCategory;
  topic: string;
  keywords: string;
  disease?: string;
  tone: string;
  audienceMode: AudienceMode;
  persona: string;
  imageStyle: ImageStyle;
  referenceUrl?: string;
  postType: PostType;
  textLength?: number;
  imageCount?: number;
  cssTheme?: CssTheme;
  writingStyle?: WritingStyle;
  customImagePrompt?: string;
  learnedStyleId?: string;
  customSubheadings?: string;
  medicalLawMode?: 'strict' | 'relaxed';
  includeFaq?: boolean;
  faqCount?: number;
  hospitalName?: string;
  hospitalStyleSource?: 'explicit_selected_hospital' | 'generic_default';
}
