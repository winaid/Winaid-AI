import React from 'react';

interface BillingPageProps {
  darkMode: boolean;
}

export function BillingPage({ darkMode }: BillingPageProps) {
  return (
    <div className={`rounded-2xl border p-8 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white/80 border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.06)]'}`}>
      <h1 className={`text-2xl font-black mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>요금 / 크레딧</h1>
      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>준비 중입니다.</p>
    </div>
  );
}
