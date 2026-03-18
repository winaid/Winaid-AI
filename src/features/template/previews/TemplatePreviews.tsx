/**
 * TemplatePreviews.tsx — 프리뷰 dispatcher
 *
 * TemplateSVGPreview: 카테고리별 프리뷰 컴포넌트를 선택하는 dispatcher.
 * CalendarPreviews.tsx, CategoryPreviews.tsx에서 실제 렌더링 수행.
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
