'use client';

import React, { useState, useMemo } from 'react';

interface ContentAnalysisPanelProps {
  html: string;
  keyword?: string;
  enableAiCheck?: boolean;
}

function analyzeContent(html: string, keyword?: string) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const len = text.length;

  // ── 의료광고법 검사 (의료법 제56조, 의료광고 심의 기준 기반) ──
  const lawIssues: string[] = [];
  const lawPatterns: Array<{ re: RegExp; label: string; severity: number }> = [
    // 1. 과장·허위 표현 (의료법 제56조 제2항 제1호)
    { re: /완치|100%|최고의|유일한|특효|보장|확실한 효과|반드시 낫|무조건/g, label: '과장·허위 표현', severity: 15 },
    { re: /기적|획기적[인]? 치료|놀라운 효과|압도적|독보적|세계 최초|국내 유일/g, label: '과장 수식어', severity: 12 },
    // 2. 치료 효과 보장/단정 (의료법 제56조 제2항 제3호)
    { re: /치료 효과를? 보장|완벽하게 치료|확실히 나[을을]? 수|100% 성공|실패 없/g, label: '치료 효과 보장', severity: 15 },
    { re: /반드시 효과|틀림없이|부작용 없[는이]|안전을? 보장|위험[이이] 없/g, label: '안전성 보장 표현', severity: 12 },
    // 3. 비교 광고 (의료법 제56조 제2항 제5호)
    { re: /타[병]?원보다|다른 병원[은과]? 달리|경쟁 병원|저희만|우리[만]? 가능/g, label: '타 의료기관 비교', severity: 12 },
    { re: /최저가|가장 저렴|가격 파괴|할인 이벤트|무료 시술|공짜/g, label: '가격 유인 표현', severity: 10 },
    // 4. 환자 유인 행위 (의료법 제27조 제3항)
    { re: /방문하세요|내원하세요|예약하세요|상담하세요|전화주세요|문의하세요/g, label: '행동유도 명령형', severity: 8 },
    { re: /지금 바로|서두르세요|한정 수량|선착순|마감 임박|놓치지 마/g, label: '긴급성 유도', severity: 10 },
    // 5. 환자 체험기/치료 전후 (의료광고 심의 기준)
    { re: /치료 전후|Before.*After|시술 전.*시술 후|비포.*애프터/gi, label: '치료 전후 비교 (심의 필요)', severity: 8 },
    { re: /실제 환자|환자 후기|치료 후기|시술 후기|리얼 후기/g, label: '환자 체험기 (심의 필요)', severity: 8 },
    // 6. 의료인 경력 과장
    { re: /수만[건명]|수천[건명]의? 경험|풍부한 임상|독보적 경력|최다 시술/g, label: '경력 과장 표현', severity: 8 },
    // 7. 공포심 유발 (의료법 제56조 제2항 제4호)
    { re: /방치하면|그냥 두면|치료 안 하면|큰 병|심각한 결과|후회[하할]|늦으면/g, label: '공포심 유발 표현', severity: 10 },
    // 8. 의학적으로 인정되지 않는 표현
    { re: /면역력 강화|독소 배출|디톡스|자연치유력|체질 개선|기 순환/g, label: '비과학적 의학 표현', severity: 10 },
    // 9. 명령형 어미
    { re: /받으세요|해보세요|시작하세요|관리하세요|선택하세요|결정하세요/g, label: '명령형 어미', severity: 5 },
  ];
  let lawScore = 100;
  for (const p of lawPatterns) {
    const m = text.match(p.re);
    if (m) { lawIssues.push(`${p.label} (${m.length}건)`); lawScore -= m.length * p.severity; }
  }

  // ── SEO 검사 ──
  const seoIssues: string[] = [];
  let seoScore = 100;
  if (len < 1500) { seoIssues.push('글자 수 부족 (1500자 미만)'); seoScore -= 15; }
  if (len < 1000) { seoScore -= 10; }
  if (len > 10000) { seoIssues.push('글자 수 과다 (10000자 초과)'); seoScore -= 5; }
  const h2Count = (html.match(/<h2/gi) || []).length;
  const h3Count = (html.match(/<h3/gi) || []).length;
  const headingCount = h2Count + h3Count;
  if (headingCount < 3) { seoIssues.push(`소제목 부족 (${headingCount}개, 3개 이상 권장)`); seoScore -= 10; }
  if (headingCount > 0 && len / headingCount > 2000) { seoIssues.push('소제목 간격 넓음 (2000자당 1개 미만)'); seoScore -= 5; }
  const imgCount = (html.match(/<img/gi) || []).length;
  if (imgCount === 0 && len > 1500) { seoIssues.push('이미지 없음 (SEO 가점 부족)'); seoScore -= 5; }
  if (keyword) {
    const kwCount = (text.match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
    const density = len > 0 ? (kwCount * keyword.length / len) * 100 : 0;
    if (kwCount < 3) { seoIssues.push(`키워드 "${keyword}" 반복 부족 (${kwCount}회)`); seoScore -= 10; }
    if (density > 4) { seoIssues.push(`키워드 밀도 과다 (${density.toFixed(1)}%, 4% 이하 권장)`); seoScore -= 8; }
    // 제목에 키워드 포함 여부
    const titleMatch = html.match(/<h[12][^>]*>(.*?)<\/h[12]>/i);
    if (titleMatch && !titleMatch[1].includes(keyword)) {
      seoIssues.push('제목에 키워드 미포함'); seoScore -= 5;
    }
  }

  // ── AI 냄새 검사 ──
  const aiIssues: string[] = [];
  let aiScore = 100;
  const aiPatterns: Array<{ re: RegExp; label: string; severity: number }> = [
    // 접속사/부사 과용
    { re: /또한|더불어|아울러|이러한|해당|상기|그러므로|따라서/g, label: 'AI식 접속 표현', severity: 3 },
    // AI 전형 패턴
    { re: /가 핵심입니다|기억하세요|중요한 것은|핵심은 바로|다음과 같습니다/g, label: 'AI 단정형 표현', severity: 5 },
    { re: /다양한 방법|여러 가지|종합적으로|체계적으로|전문적으로/g, label: 'AI 범용 수식어', severity: 3 },
    { re: /살펴보겠습니다|알아보겠습니다|소개해 드리겠습니다|설명드리겠습니다/g, label: '안내문 패턴', severity: 4 },
    { re: /~는 것이 좋습니다|~는 것이 중요합니다|~는 것이 필요합니다/g, label: '반복 권유 패턴', severity: 4 },
    { re: /첫째|둘째|셋째|마지막으로/g, label: '나열형 구조 (AI 전형)', severity: 2 },
    // 같은 어미 연속 반복
    { re: /입니다\.\s*[^.]*입니다\.\s*[^.]*입니다\./g, label: '"~입니다" 3회 연속', severity: 8 },
    { re: /합니다\.\s*[^.]*합니다\.\s*[^.]*합니다\./g, label: '"~합니다" 3회 연속', severity: 8 },
    { re: /있습니다\.\s*[^.]*있습니다\.\s*[^.]*있습니다\./g, label: '"~있습니다" 3회 연속', severity: 8 },
    // 교과서식 도입
    { re: /오늘은.*에 대해|이번에는.*알아보|많은 분들이.*궁금해/g, label: '교과서식 도입부', severity: 4 },
  ];
  for (const p of aiPatterns) {
    const m = text.match(p.re);
    if (m) { aiIssues.push(`${p.label} (${m.length}건)`); aiScore -= m.length * p.severity; }
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

export default function ContentAnalysisPanel({ html, keyword, enableAiCheck }: ContentAnalysisPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'overview' | 'law' | 'seo' | 'ai'>('overview');
  const analysis = useMemo(() => analyzeContent(html, keyword), [html, keyword]);

  // AI 기반 의료광고법 심층 검증
  const [aiLawCheck, setAiLawCheck] = useState<{ loading: boolean; result: string | null; issues: string[] }>({ loading: false, result: null, issues: [] });
  const runAiLawCheck = async () => {
    if (aiLawCheck.loading) return;
    setAiLawCheck({ loading: true, result: null, issues: [] });
    try {
      const textOnly = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 4000);
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `너는 의료광고법 전문 검수자다. 아래 병원 블로그 글에서 의료법 제56조(의료광고), 의료광고 심의 기준을 위반하거나 위반 위험이 있는 표현을 찾아라.

[검수 기준]
1. 과장·허위 광고 (의료법 §56②1): 치료 효과 보장, 과장 수식어
2. 비교 광고 (§56②5): 타 의료기관 비교, 최고·유일 등
3. 환자 유인 (§27③): 명령형 행동 유도, 긴급성 압박
4. 공포심 유발 (§56②4): 치료 안 하면 위험 등
5. 치료 전후 비교 (심의기준): 심의 없는 전후 사진/설명
6. 비과학적 표현: 의학적 근거 없는 주장

[글 내용]
${textOnly}

[출력 형식 — JSON만]
{
  "totalIssues": 이슈 총 개수,
  "riskLevel": "low/medium/high",
  "issues": [
    {"expression": "문제 표현 원문", "reason": "위반 사유", "law": "관련 법조항", "suggestion": "수정 제안"}
  ],
  "summary": "전체 평가 한 줄 요약"
}`,
          model: 'gemini-3.1-flash-lite-preview',
          temperature: 0.1,
          responseType: 'json',
        }),
      });
      const data = await res.json() as { text?: string };
      let text = data.text || '';
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) text = jsonMatch[1];
      const parsed = JSON.parse(text.trim()) as { issues?: Array<{ expression: string; reason: string; suggestion: string }>; summary?: string; riskLevel?: string };
      const issues = (parsed.issues || []).map(i => `"${i.expression}" → ${i.reason} → 수정안: ${i.suggestion}`);
      setAiLawCheck({ loading: false, result: parsed.summary || '검증 완료', issues });
    } catch {
      setAiLawCheck({ loading: false, result: 'AI 검증 실패', issues: [] });
    }
  };

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
        {tab === 'law' && <div>
          <p className="text-xs font-bold text-slate-500 mb-2">의료광고법 준수 점수: {analysis.law.score}점</p>
          {renderIssues(analysis.law.issues)}
          {enableAiCheck !== false && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <button
                onClick={runAiLawCheck}
                disabled={aiLawCheck.loading}
                className="px-3 py-1.5 bg-violet-50 text-violet-600 font-bold rounded-lg hover:bg-violet-100 transition-colors text-xs border border-violet-200 disabled:opacity-50"
              >
                {aiLawCheck.loading ? 'AI 검증 중...' : 'AI 심층 검증'}
              </button>
              {aiLawCheck.result && (
                <div className="mt-2 p-3 bg-slate-50 rounded-xl">
                  <p className="text-xs font-bold text-slate-600 mb-1">{aiLawCheck.result}</p>
                  {aiLawCheck.issues.length > 0 && (
                    <ul className="space-y-1.5 mt-2">{aiLawCheck.issues.map((issue, i) => (
                      <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                        <span className="text-red-500 mt-0.5 flex-none">●</span>
                        <span>{issue}</span>
                      </li>
                    ))}</ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>}
        {tab === 'seo' && <div><p className="text-xs font-bold text-slate-500 mb-2">SEO 점수: {analysis.seo.score}점</p>{renderIssues(analysis.seo.issues)}</div>}
        {tab === 'ai' && <div><p className="text-xs font-bold text-slate-500 mb-2">AI 냄새 점수: {analysis.ai.score}점 (낮을수록 자연스러움)</p>{renderIssues(analysis.ai.issues)}</div>}
      </div>
    </div>
  );
}
