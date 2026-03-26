'use client';

import { useState } from 'react';
import { TEAM_DATA } from '../../../lib/teamData';
import { buildPressPrompt, PRESS_TYPES, DOCTOR_TITLES, CATEGORIES, PRESS_CSS, type PressType } from '../../../lib/pressPrompt';
import { savePost } from '../../../lib/postStorage';
import { getSessionSafe } from '../../../lib/supabase';
import { getHospitalStylePrompt } from '../../../lib/styleService';
import { ErrorPanel } from '../../../components/GenerationResult';

export default function PressPage() {
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [showHospitalPicker, setShowHospitalPicker] = useState(false);
  const [doctorName, setDoctorName] = useState('');
  const [doctorTitle, setDoctorTitle] = useState('원장');
  const [pressType, setPressType] = useState<PressType>('achievement');
  const [textLength, setTextLength] = useState(1200);
  const TEXT_LENGTH_OPTIONS = [
    { value: 800, label: '짧은 기사', desc: '단신/속보형' },
    { value: 1200, label: '중간 기사', desc: '일반 보도' },
    { value: 1800, label: '긴 기사', desc: '심층 보도' },
  ];
  const [category, setCategory] = useState('치과');
  const [hospitalWebsite, setHospitalWebsite] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editHtml, setEditHtml] = useState('');
  const [qualityScore, setQualityScore] = useState<{ aiSmell: number; issues: string[] } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || !doctorName.trim()) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedHtml(null);
    setSaveStatus(null);

    try {
      // 1) 병원 웹사이트 크롤링
      let hospitalInfo = '';
      if (hospitalWebsite.trim()) {
        setProgress('🏥 병원 웹사이트 분석 중...');
        try {
          const crawlRes = await fetch('/api/naver/crawl-hospital-blog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blogUrl: hospitalWebsite.trim(), maxPosts: 1 }),
          });
          if (crawlRes.ok) {
            const crawlData = await crawlRes.json() as { posts?: Array<{ content?: string }> };
            const siteContent = crawlData.posts?.[0]?.content || '';
            if (siteContent) {
              setProgress('🏥 병원 강점 분석 중...');
              const analysisRes = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  prompt: `다음은 ${hospitalName || 'OO병원'}의 웹사이트 내용입니다.\n\n${siteContent.slice(0, 3000)}\n\n위 병원 웹사이트에서 다음 정보를 추출해주세요:\n1. 병원의 핵심 강점 (3~5개)\n2. 특화 진료과목이나 특별한 의료 서비스\n3. 차별화된 특징 (장비, 시스템, 의료진 등)\n4. 수상 경력이나 인증 사항\n\n간결하게 핵심만 추출해주세요.`,
                  model: 'gemini-3.1-flash-lite-preview',
                  temperature: 0.3,
                  maxOutputTokens: 1000,
                }),
              });
              if (analysisRes.ok) {
                const analysis = await analysisRes.json() as { text?: string };
                if (analysis.text) hospitalInfo = `[🏥 ${hospitalName || 'OO병원'} 병원 정보 - 웹사이트 분석 결과]\n${analysis.text}`;
              }
            }
          }
        } catch {
          setProgress('⚠️ 웹사이트 분석 실패, 기본 정보로 진행...');
        }
      }

      // 2) 프롬프트 조립
      setProgress('🗞️ 보도자료 작성 중...');
      const { systemInstruction, prompt } = buildPressPrompt({
        topic: topic.trim(), keywords: keywords.trim() || undefined, hospitalName: hospitalName || undefined,
        doctorName: doctorName.trim(), doctorTitle, pressType, textLength, category,
        hospitalInfo: hospitalInfo || undefined,
      });

      // 3) 병원 말투 자동 주입
      let finalPrompt = prompt;
      if (hospitalName) {
        try {
          const stylePrompt = await getHospitalStylePrompt(hospitalName);
          if (stylePrompt) finalPrompt = `${prompt}\n\n[병원 블로그 학습 말투 - 보도자료 스타일 유지하며 적용]\n${stylePrompt}`;
        } catch { /* 프로파일 없으면 기본 동작 */ }
      }

      // 4) Google Search 연동으로 생성
      setProgress('🔍 최신 의료 정보 검색 + 기사 작성 중...');
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt, systemInstruction, model: 'gemini-3.1-pro-preview',
          temperature: 0.7, maxOutputTokens: 8192, googleSearch: true,
        }),
      });
      const data = await res.json() as { text?: string; error?: string; details?: string };
      if (!res.ok || !data.text) { setError(data.error || data.details || `서버 오류 (${res.status})`); return; }

      // 5) HTML 후처리
      let html = data.text.replace(/```html?\n?/gi, '').replace(/```\n?/gi, '').trim();
      if (!html.includes('class="press-release-container"')) html = `<div class="press-release-container">${html}</div>`;
      const finalHtml = PRESS_CSS + html;
      setGeneratedHtml(finalHtml);

      // 5.5) 품질 평가 (규칙 기반, OLD evaluateContentQuality 동등)
      try {
        const textOnly = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const issues: string[] = [];
        let aiSmellScore = 100;
        // AI 냄새 패턴 검사
        const patterns = [
          { re: /~(입니다|합니다|됩니다|습니다)[.!]?\s*~?(입니다|합니다|됩니다|습니다)/g, msg: '같은 어미 연속 반복', penalty: 10 },
          { re: /중요합니다|핵심입니다|기억하세요|잊지 마세요/g, msg: '단정형/명령형 표현', penalty: 5 },
          { re: /방문하세요|내원하세요|예약하세요|상담하세요/g, msg: '행동 유도 명령형 (의료광고법 주의)', penalty: 15 },
          { re: /완치|100%|최고의|유일한|특효|보장/g, msg: '의료광고법 위반 가능 표현', penalty: 20 },
        ];
        for (const p of patterns) {
          const matches = textOnly.match(p.re);
          if (matches && matches.length > 0) {
            issues.push(`${p.msg} (${matches.length}건)`);
            aiSmellScore -= p.penalty * matches.length;
          }
        }
        if (textOnly.length < 500) { issues.push('본문이 너무 짧음 (500자 미만)'); aiSmellScore -= 10; }
        setQualityScore({ aiSmell: Math.max(0, Math.min(100, aiSmellScore)), issues });
      } catch { setQualityScore(null); }

      // 6) DB 저장
      try {
        const { userId, userEmail } = await getSessionSafe();
        const titleMatch = html.match(/<h1[^>]*>([^<]+)/);
        const extractedTitle = titleMatch ? titleMatch[1].trim().substring(0, 200) : topic.trim();
        const saveResult = await savePost({
          userId, userEmail, hospitalName: hospitalName || undefined, postType: 'press_release',
          title: extractedTitle, content: finalHtml, topic: topic.trim(),
          keywords: keywords.trim() ? keywords.split(',').map(k => k.trim()).filter(Boolean) : undefined,
        });
        setSaveStatus('error' in saveResult ? '저장 실패: ' + saveResult.error : '저장 완료');
      } catch { setSaveStatus('저장 실패'); }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '네트워크 오류');
    } finally { setIsGenerating(false); setProgress(''); }
  };

  const handleDownload = () => {
    if (!generatedHtml) return;
    const blob = new Blob([generatedHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `보도자료_${topic.trim().slice(0, 20)}_${Date.now()}.html`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    if (!generatedHtml) return;
    try { const d = document.createElement('div'); d.innerHTML = generatedHtml; await navigator.clipboard.writeText(d.textContent || ''); } catch {}
  };

  const inputCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all';
  const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start p-5">
      <div className="w-full lg:w-[400px] xl:w-[440px] lg:flex-none">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1"><span className="text-lg">🗞️</span><h2 className="text-base font-bold text-slate-800">보도자료 생성</h2></div>
          <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">본 보도자료는 홍보 목적의 자료이며, 의학적 조언이나 언론 보도로 사용될 경우 법적 책임은 사용자에게 있습니다.</p>

          {/* 병원 선택 */}
          <div>
            <label className={labelCls}>병원 선택 (선택)</label>
            <div className="relative">
              <input type="text" value={hospitalName} onChange={e => setHospitalName(e.target.value)} onFocus={() => setShowHospitalPicker(true)} placeholder="병원명 입력 또는 선택" className={inputCls} />
              {showHospitalPicker && (<>
                <div className="fixed inset-0 z-10" onClick={() => setShowHospitalPicker(false)} />
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-64 overflow-y-auto">
                  {TEAM_DATA.map(team => (<div key={team.id}>
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase bg-slate-50 sticky top-0">{team.label}</div>
                    {team.hospitals.map(h => (
                      <button key={`${team.id}-${h.name}`} type="button" onClick={() => { setHospitalName(h.name); setShowHospitalPicker(false); }}
                        className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-amber-50 hover:text-amber-700 transition-colors">{h.name}<span className="text-[11px] text-slate-400 ml-2">{h.manager}</span></button>
                    ))}
                  </div>))}
                </div>
              </>)}
            </div>
          </div>

          {/* 병원 웹사이트 */}
          <div>
            <label className={labelCls}>병원 웹사이트 (선택)</label>
            <input type="url" value={hospitalWebsite} onChange={e => setHospitalWebsite(e.target.value)} placeholder="https://www.hospital.com" className={inputCls} />
            <p className="text-[10px] text-slate-400 mt-0.5">입력하면 병원 강점을 분석해 기사에 반영합니다</p>
          </div>

          {/* 의료진 + 직함 + 진료과 */}
          <div className="grid grid-cols-3 gap-3">
            <div><label className={labelCls}>의료진 *</label><input type="text" value={doctorName} onChange={e => setDoctorName(e.target.value)} placeholder="홍길동" required className={inputCls} /></div>
            <div><label className={labelCls}>직함</label><select value={doctorTitle} onChange={e => setDoctorTitle(e.target.value)} className={inputCls}>{DOCTOR_TITLES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label className={labelCls}>진료과</label><select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>{['치과', '피부과', '정형외과'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          </div>

          {/* 주제 */}
          <div><label className={labelCls}>주제 *</label><input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="예: 최소침습 임플란트 수술법 도입" required className={inputCls} /></div>

          {/* 키워드 */}
          <div><label className={labelCls}>SEO 키워드 (쉼표 구분)</label><input type="text" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="예: 임플란트, 최소침습, 디지털" className={inputCls} /></div>

          {/* 보도 유형 */}
          <div>
            <label className={labelCls}>보도 유형</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESS_TYPES.map(pt => (
                <button key={pt.value} type="button" onClick={() => setPressType(pt.value)}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all ${pressType === pt.value ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{pt.icon} {pt.label}</button>
              ))}
            </div>
          </div>

          {/* 글자 수 */}
          <div>
            <label className={labelCls}>기사 길이</label>
            <div className="grid grid-cols-3 gap-1.5">
              {TEXT_LENGTH_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setTextLength(opt.value)}
                  className={`py-2.5 px-2 rounded-xl text-center transition-all border ${textLength === opt.value ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                  <div className={`text-xs font-bold ${textLength === opt.value ? 'text-amber-700' : 'text-slate-700'}`}>{opt.label}</div>
                  <div className="text-[10px] text-slate-400">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 생성 버튼 */}
          <button type="submit" disabled={isGenerating || !topic.trim() || !doctorName.trim()}
            className="w-full py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {isGenerating ? (<><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>{progress || '생성 중...'}</>) : '보도자료 생성하기'}
          </button>
        </form>
      </div>

      {/* 결과 */}
      <div className="flex-1 min-w-0">
        {isGenerating ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-12 flex flex-col items-center justify-center text-center min-h-[480px]">
            <div className="relative mb-6"><div className="w-14 h-14 border-[3px] border-amber-100 border-t-amber-500 rounded-full animate-spin" /></div>
            <p className="text-sm font-medium text-slate-700 mb-2">{progress || '보도자료를 작성하고 있어요'}</p>
            <p className="text-xs text-slate-400">전문의 인용과 의료광고법 준수를 확인하고 있습니다</p>
          </div>
        ) : error ? (
          <ErrorPanel error={error} onDismiss={() => setError(null)} />
        ) : generatedHtml ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* 상단 바 */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-600">🗞️ 보도자료</span>
                {saveStatus && <span className={`text-[10px] px-2 py-0.5 rounded-full ${saveStatus.includes('완료') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>{saveStatus}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { if (isEditing) { setGeneratedHtml(PRESS_CSS + editHtml); setIsEditing(false); } else { const raw = generatedHtml.replace(PRESS_CSS, ''); setEditHtml(raw); setIsEditing(true); } }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${isEditing ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-700 bg-white border border-slate-200 hover:bg-slate-50'}`}>
                  {isEditing ? '수정 완료' : '편집'}
                </button>
                <button onClick={handleCopy} className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">복사</button>
                <button onClick={handleDownload} className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-all">HTML 다운로드</button>
              </div>
            </div>

            {/* 품질 평가 */}
            {qualityScore && (
              <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/40">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${qualityScore.aiSmell >= 80 ? 'bg-green-50 text-green-700' : qualityScore.aiSmell >= 60 ? 'bg-orange-50 text-orange-700' : 'bg-red-50 text-red-700'}`}>
                    품질 {qualityScore.aiSmell}점
                  </span>
                  {qualityScore.issues.length === 0 && <span className="text-[10px] text-green-600">이슈 없음</span>}
                  {qualityScore.issues.map((issue, i) => (
                    <span key={i} className="text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">{issue}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 본문 — 편집/보기 */}
            {isEditing ? (
              <textarea value={editHtml} onChange={e => setEditHtml(e.target.value)}
                className="w-full min-h-[600px] p-6 text-sm font-mono text-slate-700 border-none outline-none resize-none" />
            ) : (
              <div className="p-6" dangerouslySetInnerHTML={{ __html: generatedHtml }} />
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm flex-1 min-h-[520px] flex flex-col items-center justify-center px-12 py-16">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100">
              <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" /></svg>
            </div>
            <h2 className="text-2xl font-black text-slate-800 mb-2">AI 보도자료</h2>
            <p className="text-sm text-slate-400 text-center mb-6">주제와 의료진 정보로<br/>기자 문체의 보도자료를 생성합니다</p>
            <div className="space-y-2">
              {['3인칭 기자 문체', '전문의 인용 2회 이상', '의료광고법 준수', 'Google Search 연동'].map(t => (
                <div key={t} className="flex items-center gap-2 text-xs text-slate-400"><span className="text-amber-400">✦</span>{t}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
