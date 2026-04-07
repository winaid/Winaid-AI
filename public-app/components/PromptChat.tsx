'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  prompt?: { korean: string; english: string };
}

interface Props {
  onApplyPrompt: (prompt: string) => void;
  disabled?: boolean;
}

/**
 * AI 프롬프트 채팅 — OLD PromptGenerator.tsx 동일 기능
 *
 * 사용자가 만들고 싶은 이미지를 설명하면,
 * AI가 최적의 이미지 프롬프트(한국어+영어)를 생성.
 * /api/gemini 엔드포인트 사용.
 */
export function PromptChat({ onApplyPrompt, disabled }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [refImage, setRefImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('이미지 파일만 업로드할 수 있습니다.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('10MB 이하의 이미지만 업로드할 수 있습니다.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setRefImage(reader.result as string); setError(null); };
    reader.readAsDataURL(file);
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() && !refImage) return;
    setLoading(true);
    setError(null);

    const userMessage = input.trim() || '이 이미지를 분석해서 프롬프트를 만들어주세요.';
    const userChat: ChatMessage = { role: 'user', text: userMessage };
    const updatedHistory = [...messages, userChat];
    setMessages(updatedHistory);
    setInput('');

    try {
      // 대화 히스토리를 컨텍스트로 구성
      const historyContext = updatedHistory.slice(-6).map(m =>
        `${m.role === 'user' ? '사용자' : 'AI'}: ${m.text}`
      ).join('\n');

      const systemInstruction = `당신은 한국 병원 마케팅 이미지 프롬프트 전문가입니다.
사용자가 원하는 이미지를 설명하면, Gemini 이미지 생성에 최적화된 프롬프트를 한국어와 영어 두 가지로 제안합니다.

반드시 아래 형식으로 응답하세요:
1. 간단한 코멘트 (1-2문장)
2. ---PROMPT_START---
3. [한국어] (한국어 프롬프트)
4. [English] (영어 프롬프트)
5. ---PROMPT_END---

프롬프트 작성 규칙:
- 구체적이고 상세한 묘사 (배경, 색감, 스타일, 구도 포함)
- 병원 마케팅에 적합한 전문적이면서 따뜻한 톤
- 텍스트가 필요한 경우 한국어 텍스트 명시
- 의료광고법 준수`;

      const prompt = refImage
        ? `[참고 이미지가 첨부됨]\n\n${historyContext}\n\n사용자의 최신 요청: ${userMessage}\n\n참고 이미지를 분석하고, 사용자의 요청에 맞는 최적의 이미지 프롬프트를 한국어/영어로 제안해주세요.`
        : `${historyContext}\n\n사용자의 최신 요청: ${userMessage}\n\n사용자의 요청에 맞는 최적의 이미지 프롬프트를 한국어/영어로 제안해주세요.`;

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemInstruction,
          model: 'gemini-3.1-flash-lite-preview',
          temperature: 0.7,
          maxOutputTokens: 1500,
        }),
      });

      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error || '응답 생성 실패');

      const responseText = data.text;

      // 프롬프트 파싱
      let parsedPrompt: { korean: string; english: string } | undefined;
      const promptMatch = responseText.match(/---PROMPT_START---([\s\S]*?)---PROMPT_END---/);
      if (promptMatch) {
        const block = promptMatch[1];
        const korMatch = block.match(/\[한국어\]\s*([\s\S]*?)(?=\[English\]|$)/i);
        const engMatch = block.match(/\[English\]\s*([\s\S]*?)$/i);
        if (korMatch || engMatch) {
          parsedPrompt = {
            korean: korMatch?.[1]?.trim() || '',
            english: engMatch?.[1]?.trim() || '',
          };
        }
      }

      // 코멘트 추출 (프롬프트 블록 제거)
      const commentText = responseText.replace(/---PROMPT_START---[\s\S]*?---PROMPT_END---/, '').trim() || '프롬프트를 생성했습니다.';

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        text: commentText,
        prompt: parsedPrompt,
      };
      setMessages([...updatedHistory, assistantMsg]);

      if (refImage) {
        setRefImage(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || '응답 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [input, refImage, messages]);

  const handleClearChat = useCallback(() => { setMessages([]); setError(null); }, []);

  const canSend = (input.trim() || refImage) && !disabled && !loading;

  return (
    <div className="rounded-xl border border-purple-200 overflow-hidden">
      {/* 토글 헤더 */}
      <button onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-100 to-indigo-100 border-purple-200 transition-all">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          AI 프롬프트 채팅
        </span>
        <div className="flex items-center gap-2">
          {messages.length > 0 && <span className="text-xs text-gray-400">{messages.length}개 메시지</span>}
          <svg className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="flex flex-col bg-white" style={{ height: '420px' }}>
          {/* 메시지 영역 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500 font-medium mb-1">이미지 프롬프트를 함께 만들어요</p>
                <p className="text-xs text-gray-400">원하는 콘텐츠를 설명하면 최적의 프롬프트를 제안합니다</p>
                <div className="flex flex-wrap gap-2 mt-4 justify-center">
                  {['치과 할인 이벤트 포스터', '병원 내부 인테리어', '의료진 프로필 사진'].map(ex => (
                    <button key={ex} onClick={() => setInput(ex)}
                      className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-600 hover:bg-gray-50 transition-all">
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                )}
                <div className="max-w-[80%]">
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white rounded-tr-md'
                      : 'bg-purple-50 border border-purple-100 text-gray-700 rounded-tl-md'
                  }`}>
                    {msg.text}
                  </div>
                  {/* 프롬프트 카드 */}
                  {msg.prompt && (
                    <div className="mt-2 space-y-1.5">
                      <div className="bg-purple-50 rounded-lg p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">한국어</span>
                          <button onClick={() => { onApplyPrompt(msg.prompt!.korean); setIsOpen(false); }} disabled={disabled}
                            className="text-[10px] px-2 py-0.5 rounded text-white font-medium bg-purple-600 hover:bg-purple-700 transition-all">적용</button>
                        </div>
                        <p className="text-xs text-gray-700 leading-relaxed">{msg.prompt.korean}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">English</span>
                          <button onClick={() => { onApplyPrompt(msg.prompt!.english); setIsOpen(false); }} disabled={disabled}
                            className="text-[10px] px-2 py-0.5 rounded text-white font-medium bg-purple-600 hover:bg-purple-700 transition-all">적용</button>
                        </div>
                        <p className="text-xs text-gray-700 leading-relaxed">{msg.prompt.english}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center flex-shrink-0 mr-2">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="bg-purple-50 border border-purple-100 rounded-2xl rounded-tl-md px-4 py-3">
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {error && <div className="mx-4 mb-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

          {/* 하단 입력 영역 */}
          <div className="border-t border-gray-100 p-3 space-y-2">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            {refImage && (
              <div className="relative inline-block">
                <img src={refImage} alt="참고 이미지" className="h-16 rounded-lg border border-gray-200 object-cover" />
                <button onClick={() => { setRefImage(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600">x</button>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <button onClick={() => fileInputRef.current?.click()} disabled={disabled || loading}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50"
                title="참고 이미지 첨부">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
                placeholder={messages.length === 0 ? '만들고 싶은 이미지를 설명해주세요...' : '추가 요청이나 수정사항을 입력하세요...'}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={disabled || loading}
                onKeyDown={(e) => e.key === 'Enter' && canSend && handleSend()} />
              <button onClick={handleSend} disabled={!canSend}
                className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-white transition-all ${!canSend ? 'bg-gray-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}>
                {loading ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                )}
              </button>
              {messages.length > 0 && (
                <button onClick={handleClearChat} disabled={loading}
                  className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all disabled:opacity-50"
                  title="대화 초기화">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
