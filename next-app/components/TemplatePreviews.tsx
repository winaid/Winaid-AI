/**
 * TemplatePreviews.tsx — 카테고리별 프리뷰 dispatcher
 *
 * OLD의 TemplateSVGPreview와 동등.
 * schedule은 inline 달력 프리뷰가 별도이므로 여기서는 나머지 7개 카테고리만.
 */
import React from 'react';
import type { CategoryTemplate } from '../lib/categoryTemplates';
import {
  EventPreview,
  DoctorPreview,
  NoticePreview,
  GreetingPreview,
  HiringPreview,
  CautionPreview,
  PricingPreview,
} from './CategoryPreviews';

export function TemplateSVGPreview({ template: t, category, hospitalName }: { template: CategoryTemplate; category: string; hospitalName: string }) {
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
  // schedule fallback — simple gradient
  return (
    <div className="w-full h-full" style={{ background: `linear-gradient(160deg, ${t.bg} 0%, white 80%)` }}>
      <div className="p-2 text-center">
        <div className="text-[8px] font-bold" style={{ color: t.color }}>{t.name}</div>
      </div>
    </div>
  );
}
