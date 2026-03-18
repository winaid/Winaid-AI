/**
 * TemplatePreviews.tsx — 프리뷰 dispatcher + re-export bridge
 *
 * 기존 1646줄 giant file을 역할별로 분리한 뒤 남은 얇은 계층.
 * - CalendarPreviews.tsx  → CalendarThemePreview (달력 12테마)
 * - CategoryPreviews.tsx  → 7개 카테고리 프리뷰
 * - 이 파일             → TemplateSVGPreview (dispatcher) + re-export
 *
 * 소비자: TemplateGenerator.tsx
 */
import React from 'react';
import type { CategoryTemplate } from '../config/categoryTemplates';
import type { TemplateCategory } from '../config/templatePresets';
import { CalendarThemePreview } from './CalendarPreviews';
import {
  EventPreview,
  DoctorPreview,
  NoticePreview,
  GreetingPreview,
  HiringPreview,
  CautionPreview,
  PricingPreview,
} from './CategoryPreviews';

// ── re-export for backward compatibility ──
export { CalendarThemePreview } from './CalendarPreviews';

// ── dispatcher ──
export function TemplateSVGPreview({ template: t, category, hospitalName }: { template: CategoryTemplate; category: TemplateCategory; hospitalName: string }) {
  if (t.previewImage) {
    return <img src={t.previewImage} alt={t.name} className="w-full h-full object-cover" loading="lazy" />;
  }
  const name = hospitalName || 'OO병원';
  if (category === 'event') return <EventPreview t={t} name={name} />;
  if (category === 'doctor') return <DoctorPreview t={t} name={name} />;
  if (category === 'notice') return <NoticePreview t={t} name={name} />;
  if (category === 'greeting') return <GreetingPreview t={t} name={name} />;
  if (category === 'hiring') return <HiringPreview t={t} name={name} />;
  if (category === 'caution') return <CautionPreview t={t} name={name} />;
  if (category === 'pricing') return <PricingPreview t={t} name={name} />;
  // schedule fallback
  return <CalendarThemePreview themeValue={t.id} groupColor={t.color} size="lg" />;
}
