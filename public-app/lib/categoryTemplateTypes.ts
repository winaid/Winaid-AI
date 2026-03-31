/**
 * CategoryTemplate 타입 정의
 *
 * categoryTemplates.ts(204KB)에서 타입만 분리하여
 * 데이터를 import하지 않는 컴포넌트에서 타입만 참조할 수 있도록 함.
 */

export interface CategoryTemplate {
  id: string;
  name: string;
  color: string;
  accent: string;
  bg: string;
  desc: string;
  aiPrompt: string;
  layoutHint: string;
  previewImage?: string;
}
