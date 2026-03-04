import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { PromptMediaType, GeneratedPrompt, ChatMessage } from '../services/mediaGenerationService';

interface Props {
  mediaType: PromptMediaType;
  onApplyPrompt: (prompt: string) => void;
  disabled?: boolean;
}

export default function PromptGenerator({ mediaType, onApplyPrompt, disabled }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [refImage, setRefImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 채팅 영역 자동 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('10MB 이하의 이미지만 업로드할 수 있습니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setRefImage(reader.result as string);
      setError(null);
    };
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
      const { chatPromptGenerator } = await import('../services/mediaGenerationService');
      const assistantMsg = await chatPromptGenerator(
        messages,
        userMessage,
        mediaType,
        refImage || undefined,
      );
      setMessages([...updatedHistory, assistantMsg]);
      // 이미지는 첫 전송 시에만 사용
      if (refImage) {
        setRefImage(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (err: any) {
      setError(err?.message || '응답 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [input, mediaType, refImage, messages]);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const colorClasses = {
    bg: mediaType === 'image' ? 'bg-purple-50' : 'bg-rose-50',
    border: mediaType === 'image' ? 'border-purple-200' : 'border-rose-200',
    btnBg: mediaType === 'image' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-rose-600 hover:bg-rose-700',
    btnRing: mediaType === 'image' ? 'focus:ring-purple-500' : 'focus:ring-rose-500',
    headerBg: mediaType === 'image'
      ? 'from-purple-100 to-indigo-100 border-purple-200'
      : 'from-rose-100 to-amber-100 border-rose-200',
    userBubble: mediaType === 'image' ? 'bg-purple-600' : 'bg-rose-600',
    aiBubble: mediaType === 'image' ? 'bg-purple-50 border-purple-100' : 'bg-rose-50 border-rose-100',
  };

  const canSend = (input.trim() || refImage) && !disabled && !loading;

  return (
    <div className={`rounded-xl border ${colorClasses.border} overflow-hidden`}>
      {/* 토글 헤더 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r ${colorClasses.headerBg} transition-all`}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          AI 프롬프트 채팅
          <span className="text-xs font-normal text-gray-500">(Gemini 3.1 Pro)</span>
        </span>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <span className="text-xs text-gray-400">{messages.length}개 메시지</span>
          )}
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* 채팅 영역 */}
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
                <p className="text-sm text-gray-500 font-medium mb-1">
                  {mediaType === 'image' ? '이미지' : '동영상'} 프롬프트를 함께 만들어요
                </p>
                <p className="text-xs text-gray-400">
                  원하는 콘텐츠를 설명하면 최적의 프롬프트를 제안합니다
                </p>
                <div className="flex flex-wrap gap-2 mt-4 justify-center">
                  {(mediaType === 'image'
                    ? ['치과 할인 이벤트 포스터', '병원 내부 인테리어', '의료진 프로필 사진']
                    : ['병원 로비 투어 영상', '시술 과정 설명 영상', '의료진 소개 영상']
                  ).map((example) => (
                    <button
                      key={example}
                      onClick={() => setInput(example)}
                      className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-600 hover:bg-gray-50 transition-all"
                    >
                      {example}
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
                <div className={`max-w-[80%] ${msg.role === 'user' ? '' : ''}`}>
                  {/* 텍스트 말풍선 */}
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? `${colorClasses.userBubble} text-white rounded-tr-md`
                        : `${colorClasses.aiBubble} border text-gray-700 rounded-tl-md`
                    }`}
                  >
                    {msg.text}
                  </div>

                  {/* 프롬프트 카드 (AI 응답에 포함된 경우) */}
                  {msg.prompt && (
                    <PromptCard
                      prompt={msg.prompt}
                      colorClasses={colorClasses}
                      onApply={(text) => { onApplyPrompt(text); setIsOpen(false); }}
                      disabled={disabled}
                    />
                  )}
                </div>
              </div>
            ))}

            {/* 로딩 인디케이터 */}
            {loading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center flex-shrink-0 mr-2">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className={`${colorClasses.aiBubble} border rounded-2xl rounded-tl-md px-4 py-3`}>
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* 에러 */}
          {error && (
            <div className="mx-4 mb-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* 하단 입력 영역 */}
          <div className="border-t border-gray-100 p-3 space-y-2">
            {/* 참고 이미지 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            {refImage && (
              <div className="relative inline-block">
                <img
                  src={refImage}
                  alt="참고 이미지"
                  className="h-16 rounded-lg border border-gray-200 object-cover"
                />
                <button
                  onClick={() => { setRefImage(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600"
                >
                  x
                </button>
              </div>
            )}

            <div className="flex gap-2 items-end">
              {/* 이미지 첨부 버튼 */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || loading}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50"
                title="참고 이미지 첨부"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>

              {/* 텍스트 입력 */}
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  messages.length === 0
                    ? mediaType === 'image'
                      ? '만들고 싶은 이미지를 설명해주세요...'
                      : '만들고 싶은 영상을 설명해주세요...'
                    : '추가 요청이나 수정사항을 입력하세요...'
                }
                className={`flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 ${colorClasses.btnRing} focus:border-transparent`}
                disabled={disabled || loading}
                onKeyDown={(e) => e.key === 'Enter' && canSend && handleSend()}
              />

              {/* 전송 버튼 */}
              <button
                onClick={handleSend}
                disabled={!canSend}
                className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-white transition-all ${
                  !canSend
                    ? 'bg-gray-300 cursor-not-allowed'
                    : colorClasses.btnBg
                }`}
              >
                {loading ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>

              {/* 대화 초기화 */}
              {messages.length > 0 && (
                <button
                  onClick={handleClearChat}
                  disabled={loading}
                  className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all disabled:opacity-50"
                  title="대화 초기화"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 프롬프트 카드: AI가 제안한 한국어/영어 프롬프트 + 적용 버튼 */
function PromptCard({
  prompt,
  colorClasses,
  onApply,
  disabled,
}: {
  prompt: GeneratedPrompt;
  colorClasses: Record<string, string>;
  onApply: (text: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-2 space-y-1.5">
      {/* 한국어 */}
      <div className={`${colorClasses.bg} rounded-lg p-2.5`}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">한국어</span>
          <button
            onClick={() => onApply(prompt.korean)}
            disabled={disabled}
            className={`text-[10px] px-2 py-0.5 rounded text-white font-medium ${colorClasses.btnBg} transition-all`}
          >
            적용
          </button>
        </div>
        <p className="text-xs text-gray-700 leading-relaxed">{prompt.korean}</p>
      </div>

      {/* 영어 */}
      <div className="bg-gray-50 rounded-lg p-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">English</span>
          <button
            onClick={() => onApply(prompt.english)}
            disabled={disabled}
            className={`text-[10px] px-2 py-0.5 rounded text-white font-medium ${colorClasses.btnBg} transition-all`}
          >
            적용
          </button>
        </div>
        <p className="text-xs text-gray-700 leading-relaxed">{prompt.english}</p>
      </div>
    </div>
  );
}
