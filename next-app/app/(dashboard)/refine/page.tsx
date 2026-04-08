'use client';

import { useState, useRef, useEffect } from 'react';
import { buildRefinePrompt, buildChatRefinePrompt, REFINE_OPTIONS, type RefineMode } from '../../../lib/refinePrompt';
import { savePost } from '../../../lib/postStorage';
import { getSessionSafe } from '../../../lib/supabase';
import { ErrorPanel } from '../../../components/GenerationResult';
import { sanitizeHtml } from '../../../lib/sanitize';
import { stripDoctype } from '../../../lib/htmlUtils';
import { applyContentFilters } from '../../../lib/medicalLawFilter';

interface ChatMsg { role: 'user' | 'assistant'; content: string; ts: Date; }

export default function RefinePage() {
  const [topMode, setTopMode] = useState<'auto' | 'chat'>('auto');
  const [originalText, setOriginalText] = useState('');
  const [selectedMode, setSelectedMode] = useState<RefineMode>('natural');
  const [refinedHtml, setRefinedHtml] = useState<string | null>(null);
  const [showChanges, setShowChanges] = useState(true);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [factCheck, setFactCheck] = useState<{ fact: number; safety: number; aiSmell: number; conversion: number; issues: string[] } | null>(null);

  // 채팅 모드
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const getWorkingContent = () => refinedHtml || originalText;
  const charCount = originalText.replace(/<[^>]+>/g, '').replace(/\s/g, '').length;

  // ── CSS 테마 적용 (OLD applyThemeToHtml 동등) ──
  const applyTheme = (html: string): string => {
    let r = html;
    if (!r.includes('class="naver-post-container"'))
      r = `<div class="naver-post-container" style="max-width:800px;margin:0 auto;padding:40px;background:#fff;font-family:'맑은 고딕',sans-serif;line-height:1.9;">${r}</div>`;
    r = r.replace(/<h2(\s[^>]*)?>|<h2>/g, '<h2 style="font-size:28px;font-weight:900;color:#1a1a1a;margin:0 0 24px;line-height:1.4;">');
    r = r.replace(/<h3(\s[^>]*)?>|<h3>/g, '<h3 style="margin:30px 0 15px;padding:12px 0 12px 16px;font-size:19px;font-weight:bold;color:#1e40af;line-height:1.5;border-left:4px solid #787fff;">');
    r = r.replace(/<p(\s[^>]*)?>|<p>/g, '<p style="font-size:17px;color:#333;margin:0 0 25px;line-height:1.85;">');
    r = r.replace(/<ul(\s[^>]*)?>|<ul>/g, '<ul style="margin:15px 0 25px;padding-left:24px;line-height:1.85;">');
    r = r.replace(/<li(\s[^>]*)?>|<li>/g, '<li style="font-size:17px;color:#333;margin:8px 0;">');
    return r;
  };

  // ── factCheck 계산 (OLD evaluateContentQuality 동등 — 규칙 기반) ──
  const computeFactCheck = (html: string) => {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const issues: string[] = [];
    let safety = 100, aiSmell = 0, conversion = 70;
    // 의료광고법 위반 패턴
    const lawPatterns = [
      { re: /완치|100%|최고의|유일한|특효|보장/g, msg: '의료광고법 위반 가능', p: 15 },
      { re: /방문하세요|내원하세요|예약하세요|상담하세요/g, msg: '행동유도 명령형', p: 10 },
    ];
    for (const pat of lawPatterns) {
      const m = text.match(pat.re);
      if (m) { issues.push(`${pat.msg} (${m.length}건)`); safety -= pat.p * m.length; }
    }
    // AI 냄새 패턴
    const aiPatterns = [
      { re: /또한|더불어|아울러|이러한|해당|상기/g, msg: 'AI 문체 표현', p: 3 },
      { re: /~(입니다|합니다|됩니다)[\s.]*~?(입니다|합니다|됩니다)/g, msg: '어미 반복', p: 5 },
    ];
    for (const pat of aiPatterns) {
      const m = text.match(pat.re);
      if (m) { issues.push(`${pat.msg} (${m.length}건)`); aiSmell += pat.p * m.length; }
    }
    // 전환력
    if (/상담|예약|연락|문의/.test(text)) conversion += 10;
    if (text.length > 1500) conversion += 5;
    return {
      fact: 85, // 팩트 정확성은 규칙으로 정확 측정 불가 → 고정값
      safety: Math.max(0, Math.min(100, safety)),
      aiSmell: Math.min(100, aiSmell),
      conversion: Math.min(100, conversion),
      issues,
    };
  };

  // ── 자동 보정 ──
  const handleAutoRefine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!originalText.trim()) return;
    setIsRefining(true); setError(null); setRefinedHtml(null); setSaveStatus(null);
    try {
      const { systemInstruction, prompt } = buildRefinePrompt({ originalText: originalText.trim(), mode: selectedMode });
      const res = await fetch('/api/gemini', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, systemInstruction, model: 'gemini-3.1-pro-preview', temperature: 0.6, maxOutputTokens: 32768, googleSearch: selectedMode === 'seo' || selectedMode === 'professional' || selectedMode === 'longer' }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) { setError(data.error || `서버 오류 (${res.status})`); return; }
      let html = stripDoctype(data.text.replace(/```html?\n?/gi, '').replace(/```\n?/gi, '').trim());
      if (!html.startsWith('<')) html = `<p>${html.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
      // 의료광고법 금지어 자동 대체
      { const { filtered, replacedCount, foundTerms } = applyContentFilters(html);
        html = filtered;
        if (replacedCount > 0) console.info(`[REFINE] 의료법 자동 대체: ${replacedCount}건 — ${foundTerms.join(', ')}`);
      }
      const themed = applyTheme(html);
      setRefinedHtml(themed);
      try { setFactCheck(computeFactCheck(html)); } catch { setFactCheck(null); }
      try {
        const { userId, userEmail } = await getSessionSafe();
        const label = REFINE_OPTIONS.find(o => o.value === selectedMode)?.label || selectedMode;
        await savePost({ userId, userEmail, postType: 'blog', workflowType: 'refine', title: `${label} · ${originalText.trim().substring(0, 50)}`, content: html, topic: label });
        setSaveStatus('저장 완료');
      } catch { setSaveStatus('저장 실패'); }
    } catch (err: unknown) { setError(err instanceof Error ? err.message : '네트워크 오류'); }
    finally { setIsRefining(false); }
  };

  // ── 채팅 수정 ──
  const handleChatSubmit = async () => {
    if (!chatInput.trim() || !getWorkingContent().trim()) return;
    const userMsg: ChatMsg = { role: 'user', content: chatInput, ts: new Date() };
    setChatMessages(prev => [...prev, userMsg]);
    const msg = chatInput;
    setChatInput(''); setIsChatting(true);
    try {
      // URL 감지 + 크롤링
      const urls = msg.match(/(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi);
      let crawledContent = '';
      if (urls) {
        for (const url of urls) {
          const fullUrl = url.startsWith('www.') ? `https://${url}` : url;
          try {
            const r = await fetch('/api/naver/crawl-hospital-blog', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ blogUrl: fullUrl, maxPosts: 1 }),
            });
            if (r.ok) {
              const d = await r.json() as { posts?: Array<{ content?: string }> };
              if (d.posts?.[0]?.content) crawledContent += `\n[${fullUrl}]\n${d.posts[0].content.slice(0, 2000)}\n`;
              else crawledContent += `\n[${fullUrl} — 내용 없음]\n`;
            } else crawledContent += `\n[${fullUrl} — 크롤링 실패]\n`;
          } catch { crawledContent += `\n[${fullUrl} — 접근 불가]\n`; }
        }
      }
      const { systemInstruction, prompt } = buildChatRefinePrompt({
        workingContent: getWorkingContent(), userMessage: msg, crawledContent: crawledContent || undefined,
      });
      const res = await fetch('/api/gemini', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, systemInstruction, model: 'gemini-3.1-pro-preview', temperature: 0.6, maxOutputTokens: 32768, googleSearch: true }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error || '생성 실패');
      let html = stripDoctype(data.text.replace(/```html?\n?/gi, '').replace(/```\n?/gi, '').trim());
      if (!html.startsWith('<')) html = `<p>${html.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
      { const { filtered, replacedCount, foundTerms } = applyContentFilters(html);
        html = filtered;
        if (replacedCount > 0) console.info(`[REFINE_CHAT] 의료법 자동 대체: ${replacedCount}건 — ${foundTerms.join(', ')}`);
      }
      setRefinedHtml(applyTheme(html));
      try { setFactCheck(computeFactCheck(html)); } catch { /* factCheck 실패 무시 */ }
      let reply = '수정 완료! 오른쪽 결과를 확인해주세요.';
      if (urls) {
        const ok = (crawledContent.match(/\[https?/g) || []).length - (crawledContent.match(/실패|불가|없음/g) || []).length;
        if (ok > 0) reply = `✅ ${ok}개 사이트 참고하여 수정 완료!`;
      }
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply, ts: new Date() }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `❌ 수정 실패: ${(err as Error).message}`, ts: new Date() }]);
    } finally { setIsChatting(false); }
  };

  // ── HTML 복사 (맑은 고딕 12pt) ──
  const handleCopy = async () => {
    if (!refinedHtml) return;
    // 복사 시 mark 태그 제거 (변경점 표시는 UI용)
    const cleanHtml = refinedHtml.replace(/<mark[^>]*>([\s\S]*?)<\/mark>/gi, '$1');
    try {
      const styled = cleanHtml
        .replace(/<p>/g, '<p style="font-family:\'맑은 고딕\',sans-serif;font-size:12pt;margin:0 0 1em;line-height:1.6;">')
        .replace(/<h2>/g, '<h2 style="font-family:\'맑은 고딕\',sans-serif;font-size:14pt;font-weight:bold;margin:1.5em 0 0.5em;">')
        .replace(/<h3>/g, '<h3 style="font-family:\'맑은 고딕\',sans-serif;font-size:13pt;font-weight:bold;margin:1.2em 0 0.4em;">');
      const htmlBlob = new Blob([styled], { type: 'text/html' });
      const textBlob = new Blob([cleanHtml.replace(/<[^>]+>/g, '')], { type: 'text/plain' });
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })]);
    } catch {
      const div = document.createElement('div'); div.innerHTML = cleanHtml;
      await navigator.clipboard.writeText(div.textContent || '');
    }
  };

  const inputCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all';

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start p-5">
      {/* ── 좌측 ── */}
      <div className="w-full lg:w-[420px] xl:w-[460px] lg:flex-none space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3"><span className="text-lg">✨</span><h2 className="text-base font-bold text-slate-800">AI 정밀보정</h2></div>
          <div className="flex gap-1 p-1 rounded-xl bg-slate-50 border border-slate-100">
            <button onClick={() => setTopMode('auto')} className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-xs transition-all ${topMode === 'auto' ? 'bg-gradient-to-r from-violet-600 to-violet-700 text-white shadow-lg shadow-violet-500/25' : 'text-slate-500 hover:text-slate-700'}`}>자동 보정</button>
            <button onClick={() => setTopMode('chat')} className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-xs transition-all ${topMode === 'chat' ? 'bg-gradient-to-r from-violet-600 to-violet-700 text-white shadow-lg shadow-violet-500/25' : 'text-slate-500 hover:text-slate-700'}`}>채팅 수정</button>
          </div>
        </div>

        {topMode === 'auto' ? (
          <form onSubmit={handleAutoRefine} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5"><label className="text-xs font-semibold text-slate-500">원문 입력 *</label><span className="text-[10px] text-slate-400">{charCount.toLocaleString()}자</span></div>
              <textarea value={originalText} onChange={e => setOriginalText(e.target.value)} placeholder="다듬고 싶은 텍스트를 여기에 붙여넣으세요..." required rows={10} className={`${inputCls} resize-y min-h-[180px]`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2">보정 방향</label>
              <div className="grid grid-cols-2 gap-1.5">
                {REFINE_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setSelectedMode(opt.value)}
                    className={`text-left px-3 py-2.5 rounded-xl transition-all border ${selectedMode === opt.value ? 'bg-violet-50 border-violet-200 ring-1 ring-violet-300' : 'bg-white border-slate-150 hover:bg-slate-50'}`}>
                    <div className="flex items-center gap-1.5"><span className="text-sm">{opt.icon}</span><span className={`text-xs font-bold ${selectedMode === opt.value ? 'text-violet-700' : 'text-slate-700'}`}>{opt.label}</span></div>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" disabled={isRefining || !originalText.trim()} className="w-full py-3 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {isRefining ? (<><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>보정 중...</>) : 'AI 보정 시작'}
            </button>
          </form>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>
            {!getWorkingContent().trim() && (
              <div className="p-4 border-b border-slate-100">
                <label className="text-xs font-bold text-slate-500 mb-1.5 block">보정할 콘텐츠 붙여넣기</label>
                <textarea value={originalText} onChange={e => setOriginalText(e.target.value)} placeholder="보정할 블로그 글을 붙여넣으세요..." className={`${inputCls} h-28 resize-none`} />
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center"><div className="text-center">
                  <p className="text-sm text-slate-400">{originalText.trim() ? '수정 요청을 입력해보세요' : '위에 콘텐츠를 먼저 붙여넣으세요'}</p>
                  <p className="text-xs mt-2 text-slate-500">예: "더 부드러운 톤으로 바꿔줘"<br/>"첫 문단을 더 짧게 만들어줘"<br/>"URL 붙여넣으면 참고해서 수정"</p>
                </div></div>
              ) : chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-4 py-2 rounded-lg ${msg.role === 'user' ? 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white' : 'bg-slate-100 text-slate-900'}`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p className="text-xs mt-1 opacity-60">{msg.ts.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 border-t border-slate-200">
              <div className="flex gap-2">
                <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isChatting) { e.preventDefault(); handleChatSubmit(); } }}
                  placeholder="수정 요청 입력... (Shift+Enter: 줄바꿈)" disabled={isChatting} rows={1}
                  className="flex-1 px-3 py-2 rounded-lg text-sm bg-slate-50 border border-slate-300 outline-none focus:ring-2 focus:ring-violet-500 resize-none" style={{ minHeight: 38, maxHeight: 120 }} />
                <button onClick={handleChatSubmit} disabled={isChatting || !chatInput.trim()}
                  className={`px-4 py-2 rounded-lg font-bold text-sm self-end transition-all ${isChatting || !chatInput.trim() ? 'bg-slate-300 text-slate-500' : 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:shadow-lg'}`}>
                  {isChatting ? '⏳' : '전송'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 우측: 결과 ── */}
      <div className="flex-1 min-w-0">
        {(isRefining || isChatting) ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-12 flex flex-col items-center justify-center text-center min-h-[480px]">
            <div className="relative mb-6"><div className="w-14 h-14 border-[3px] border-violet-100 border-t-violet-500 rounded-full animate-spin" /></div>
            <p className="text-sm font-medium text-slate-700 mb-2">원문을 분석하고 다듬고 있어요</p>
          </div>
        ) : error ? (
          <ErrorPanel error={error} onDismiss={() => setError(null)} />
        ) : refinedHtml ? (
          <div className="space-y-4">
            <details className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <summary className="px-5 py-3 cursor-pointer select-none flex items-center gap-2 bg-slate-50/80 hover:bg-slate-100">
                <span className="text-xs font-bold text-slate-500">▶ 원문 비교</span>
                <span className="text-[10px] text-slate-400 ml-1">{charCount.toLocaleString()}자</span>
              </summary>
              <div className="px-5 py-4 border-t border-slate-100 max-h-[300px] overflow-y-auto">
                <p className="text-sm leading-relaxed text-slate-500 whitespace-pre-wrap">{originalText}</p>
              </div>
            </details>
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-violet-600">✨ 보정 완료</span>
                  {saveStatus && <span className={`text-[10px] px-2 py-0.5 rounded-full ${saveStatus.includes('완료') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>{saveStatus}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowChanges(!showChanges)}
                    className={`px-2.5 py-1.5 text-[10px] font-semibold rounded-lg border transition-all ${showChanges ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-400'}`}>
                    {showChanges ? '변경점 표시 중' : '변경점 숨김'}
                  </button>
                  <button onClick={handleCopy} className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">복사 (맑은 고딕)</button>
                </div>
              </div>
              {/* factCheck 결과 */}
              {factCheck && (
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/40">
                  <div className="flex items-center gap-3 flex-wrap text-[11px]">
                    <span className="font-bold text-slate-500">📊 검사</span>
                    <span className={`px-2 py-0.5 rounded-full font-bold ${factCheck.safety >= 80 ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>의료법 {factCheck.safety}점</span>
                    <span className={`px-2 py-0.5 rounded-full font-bold ${factCheck.aiSmell <= 15 ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>AI냄새 {factCheck.aiSmell}점</span>
                    <span className={`px-2 py-0.5 rounded-full font-bold ${factCheck.conversion >= 70 ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>전환력 {factCheck.conversion}점</span>
                    {factCheck.issues.map((issue, i) => (
                      <span key={i} className="text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">{issue}</span>
                    ))}
                    {factCheck.issues.length === 0 && <span className="text-[10px] text-green-600">이슈 없음</span>}
                  </div>
                </div>
              )}
              <style>{`mark.added { background: #dcfce7; padding: 0 2px; border-radius: 2px; } mark.changed { background: #fef3c7; padding: 0 2px; border-radius: 2px; }`}</style>
              <div className="p-6" dangerouslySetInnerHTML={{ __html: sanitizeHtml(showChanges ? refinedHtml : refinedHtml.replace(/<mark[^>]*>([\s\S]*?)<\/mark>/gi, '$1')) }} />
            </div>
            <button type="button" onClick={() => { setOriginalText(refinedHtml); setRefinedHtml(null); setSaveStatus(null); }}
              className="w-full py-2.5 text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 rounded-xl hover:bg-violet-100 transition-all flex items-center justify-center gap-2">
              결과를 원문에 적용하고 다시 보정하기
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm flex-1 min-h-[520px] flex flex-col items-center justify-center px-12 py-16 select-none">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100">
              <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
            </div>
            <div className="max-w-sm text-center">
              <h2 className="text-3xl font-black tracking-tight leading-tight mb-3 text-slate-800">
                AI로 글을<br /><span className="text-violet-600">다듬어보세요</span>
              </h2>
              <p className="text-sm leading-relaxed text-slate-400">
                기존 글을 붙여넣으면<br />AI가 전문적으로 보정합니다
              </p>
            </div>
            <div className="mt-8 flex flex-col items-center gap-2">
              {['자연스러운 문체 교정', 'AI 냄새 제거', '의료광고법 검증', 'SEO 최적화 보정', '채팅으로 세밀하게 수정'].map(text => (
                <div key={text} className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs text-slate-400">
                  <span className="text-[10px] text-violet-400">✦</span>
                  {text}
                </div>
              ))}
            </div>
            <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-violet-50 text-violet-500 border border-violet-100">
              <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse" />
              AI 대기 중
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
