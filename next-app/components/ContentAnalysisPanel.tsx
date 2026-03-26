'use client';

import React, { useState, useMemo } from 'react';

interface ContentAnalysisPanelProps {
  html: string;
  keyword?: string;
}

function analyzeContent(html: string, keyword?: string) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const len = text.length;

  // 의료법 검사
  const lawIssues: string[] = [];
  const lawPatterns = [
    { re: /완치|100%|최고의|유일한|특효|보장/g, label: '과장 표현' },
    { re: /방문하세요|내원하세요|예약하세요|상담하세요/g, label: '행동유도 명령형' },
    { re: /~하세요|받으세요|해보세요/g, label: '명령형 어미' },
  ];
  let lawScore = 100;
  for (const p of lawPatterns) {
    const m = text.match(p.re);
    if (m) { lawIssues.push(`${p.label} (${m.length}건)`); lawScore -= m.length * 10; }
  }

  // SEO 검사
  const seoIssues: string[] = [];
  let seoScore = 100;
  if (len < 1500) { seoIssues.push('글자 수 부족 (1500자 미만)'); seoScore -= 15; }
  if (len < 1000) { seoScore -= 10; }
  const h2Count = (html.match(/<h2|<h3/gi) || []).length;
  if (h2Count < 3) { seoIssues.push('소제목 부족 (3개 미만)'); seoScore -= 10; }
  if (keyword) {
    const kwCount = (text.match(new RegExp(keyword, 'gi')) || []).length;
    if (kwCount < 3) { seoIssues.push(`키워드 "${keyword}" 반복 부족 (${kwCount}회)`); seoScore -= 10; }
  }

  // AI 냄새 검사
  const aiIssues: string[] = [];
  let aiScore = 100;
  const aiPatterns = [
    { re: /또한|더불어|아울러|이러한|해당|상기/g, label: 'AI 문체 표현' },
    { re: /~가 핵심입니다|기억하세요|중요한 것은/g, label: '단정형 표현' },
  ];
  for (const p of aiPatterns) {
    const m = text.match(p.re);
    if (m) { aiIssues.push(`${p.label} (${m.length}건)`); aiScore -= m.length * 5; }
  }

  const overall = Math.round((Math.max(0, lawScore) + Math.max(0, seoScore) + Math.max(0, aiScore)) / 3);
  const grade = overall >= 90 ? 'A' : overall >= 80 ? 'B' : overall >= 70 ? 'C' : overall >= 60 ? 'D' : 'F';
  return {
    overall, grade,
    law: { score: Math.max(0, lawScore), issues: lawIssues },
    seo: { score: Math.max(0, seoScore), issues: seoIssues },
    ai: { score: Math.max(0, aiScore), issues: aiIssues },
    charCount: len,
  };
}

const gradeColors: Record<string, string> = { A: 'bg-emerald-500', B: 'bg-blue-500', C: 'bg-yellow-500', D: 'bg-orange-500', F: 'bg-red-500' };

export default function ContentAnalysisPanel({ html, keyword }: ContentAnalysisPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'overview' | 'law' | 'seo' | 'ai'>('overview');
  const analysis = useMemo(() => analyzeContent(html, keyword), [html, keyword]);

  const Gauge = ({ score, label }: { score: number; label: string }) => (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-12 h-12">
        <svg className="w-full h-full -rotate-90"><circle cx="24" cy="24" r="20" fill="none" stroke="#e5e7eb" strokeWidth="4" />
          <circle cx="24" cy="24" r="20" fill="none" stroke={score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'} strokeWidth="4" strokeDasharray={`${score * 1.256} 125.6`} strokeLinecap="round" /></svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-slate-700">{score}</span>
      </div>
      <span className="text-[10px] font-bold text-slate-500">{label}</span>
    </div>
  );

  if (!expanded) {
    return (
      <div onClick={() => setExpanded(true)} className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-3 hover:shadow-lg transition-all">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black text-white ${gradeColors[analysis.grade]}`}>{analysis.grade}</div>
            <div><div className="text-sm font-black text-slate-800">콘텐츠 점수 {analysis.overall}점</div>
              <div className="text-xs text-slate-500">{analysis.charCount.toLocaleString()}자 · {[...analysis.law.issues, ...analysis.seo.issues, ...analysis.ai.issues].length}건 이슈</div></div>
          </div>
          <div className="flex items-center gap-3">
            <Gauge score={analysis.seo.score} label="SEO" />
            <Gauge score={analysis.ai.score} label="자연스러움" />
            <span className="text-xs text-slate-400">▼</span>
          </div>
        </div>
      </div>
    );
  }

  const renderIssues = (issues: string[]) => issues.length === 0
    ? <p className="text-sm text-green-600">이슈 없음 ✅</p>
    : <ul className="space-y-1.5">{issues.map((issue, i) => <li key={i} className="flex items-start gap-2 text-sm text-slate-600"><span className="text-orange-500 mt-0.5">⚠</span>{issue}</li>)}</ul>;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white ${gradeColors[analysis.grade]}`}>{analysis.grade}</div>
          <div><div className="text-lg font-black text-slate-800">콘텐츠 분석 리포트</div><div className="text-sm text-slate-500">종합 {analysis.overall}점 · {analysis.charCount.toLocaleString()}자</div></div>
        </div>
        <button onClick={() => setExpanded(false)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200">접기 ▲</button>
      </div>
      <div className="flex border-b border-slate-100">
        {[{ id: 'overview' as const, label: '종합' }, { id: 'law' as const, label: '의료법' }, { id: 'seo' as const, label: 'SEO' }, { id: 'ai' as const, label: 'AI 냄새' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 py-2.5 text-xs font-bold transition-all ${tab === t.id ? 'text-violet-700 border-b-2 border-violet-500' : 'text-slate-400'}`}>{t.label}</button>
        ))}
      </div>
      <div className="p-4">
        {tab === 'overview' && (
          <div className="flex justify-around"><Gauge score={analysis.law.score} label="의료법" /><Gauge score={analysis.seo.score} label="SEO" /><Gauge score={analysis.ai.score} label="자연스러움" /></div>
        )}
        {tab === 'law' && <div><p className="text-xs font-bold text-slate-500 mb-2">의료광고법 준수 점수: {analysis.law.score}점</p>{renderIssues(analysis.law.issues)}</div>}
        {tab === 'seo' && <div><p className="text-xs font-bold text-slate-500 mb-2">SEO 점수: {analysis.seo.score}점</p>{renderIssues(analysis.seo.issues)}</div>}
        {tab === 'ai' && <div><p className="text-xs font-bold text-slate-500 mb-2">AI 냄새 점수: {analysis.ai.score}점 (낮을수록 자연스러움)</p>{renderIssues(analysis.ai.issues)}</div>}
      </div>
    </div>
  );
}
