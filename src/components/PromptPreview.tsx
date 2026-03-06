import React, { useState } from 'react';
import { CardPromptData } from '../types';

interface PromptPreviewProps {
  prompts: CardPromptData[];
  onApprove: () => void;
  onBack: () => void;
  onEditPrompts: (updatedPrompts: CardPromptData[]) => void;
  isLoading: boolean;
  progress: string;
  darkMode?: boolean;
}

const PromptPreview: React.FC<PromptPreviewProps> = ({
  prompts,
  onApprove,
  onBack,
  onEditPrompts,
  isLoading,
  progress,
  darkMode = false,
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [tempPrompt, setTempPrompt] = useState<string>('');

  // 편집 시작
  const startEditing = (index: number) => {
    setEditingIndex(index);
    setTempPrompt(prompts[index].imagePrompt);
  };

  // 편집 저장
  const saveEdit = () => {
    if (editingIndex === null) return;
    
    const updatedPrompts = [...prompts];
    updatedPrompts[editingIndex] = {
      ...updatedPrompts[editingIndex],
      imagePrompt: tempPrompt,
    };
    onEditPrompts(updatedPrompts);
    setEditingIndex(null);
    setTempPrompt('');
  };

  // 편집 취소
  const cancelEdit = () => {
    setEditingIndex(null);
    setTempPrompt('');
  };

  // 프롬프트에서 핵심 텍스트 추출해서 보여주기 (""안의 텍스트만!)
  const extractDisplayText = (prompt: string): { subtitle: string; mainTitle: string; description: string; visual: string; style: string } => {
    // "" 안의 텍스트만 추출
    const subtitleMatch = prompt.match(/subtitle:\s*"([^"]+)"/i);
    const mainTitleMatch = prompt.match(/mainTitle:\s*"([^"]+)"/i);
    const descMatch = prompt.match(/description:\s*"([^"]+)"/i);
    const visualMatch = prompt.match(/비주얼:\s*(.+?)(?:\n|$)/i) || prompt.match(/\[VISUAL\]\s*(.+?)(?:\n|$)/i);
    const styleMatch = prompt.match(/스타일:\s*(.+?)(?:\n|$)/i) || prompt.match(/style:\s*(.+?)(?:\n|$)/i);
    
    return {
      subtitle: subtitleMatch?.[1]?.trim() || '',
      mainTitle: mainTitleMatch?.[1]?.trim() || '',
      description: descMatch?.[1]?.trim() || '',
      visual: visualMatch?.[1]?.trim().replace(/,?\s*Background:.*$/i, '') || '',
      style: styleMatch?.[1]?.trim() || '',
    };
  };

  return (
    <div className={`h-full flex flex-col rounded-2xl border overflow-hidden transition-colors duration-300 backdrop-blur-xl ${
      darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white/80 border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.06)]'
    }`}>
      {/* 헤더 */}
      <div className={`px-6 py-5 border-b flex-none ${
        darkMode ? 'bg-slate-900 border-slate-700' : 'bg-gradient-to-r from-violet-600 to-purple-600'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
              </div>
              <h2 className="text-lg font-black text-white">이미지 프롬프트 확인</h2>
            </div>
            <p className="text-white/70 text-xs mt-1.5 ml-12">
              {prompts.length}장의 카드 이미지 프롬프트
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 bg-white/15 backdrop-blur-sm rounded-lg text-white/90 text-xs font-bold">
              2단계
            </span>
          </div>
        </div>
      </div>

      {/* 로딩 상태 */}
      {isLoading && (
        <div className={`px-6 py-3 flex items-center gap-3 border-b ${
          darkMode ? 'bg-purple-900/30 border-slate-700' : 'bg-violet-50/80 border-violet-100/60'
        }`}>
          <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
          <span className={`text-xs font-bold ${darkMode ? 'text-purple-400' : 'text-violet-600'}`}>
            {progress}
          </span>
        </div>
      )}

      {/* 안내 메시지 */}
      <div className={`px-6 py-3 border-b ${darkMode ? 'border-slate-700' : 'border-slate-100/60'}`}>
        <div className={`p-3 rounded-xl ${darkMode ? 'bg-amber-900/20 border border-amber-700/30' : 'bg-amber-50/80 border border-amber-100/60'}`}>
          <p className={`text-xs ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
            <strong>이 프롬프트로 이미지가 생성됩니다.</strong> 수정이 필요하면 '수정' 버튼을 클릭하세요.
          </p>
        </div>
      </div>

      {/* 프롬프트 목록 */}
      <div className={`flex-1 overflow-y-auto px-6 py-5 space-y-3 custom-scrollbar ${
        darkMode ? 'bg-slate-900' : 'bg-slate-50/50'
      }`}>
        {prompts.map((promptData, index) => {
          const displayText = extractDisplayText(promptData.imagePrompt);
          const isEditing = editingIndex === index;

          return (
            <div
              key={index}
              className={`rounded-2xl border overflow-hidden transition-all ${
                isEditing 
                  ? (darkMode ? 'border-purple-500 ring-2 ring-purple-500/30' : 'border-purple-400 ring-2 ring-purple-100')
                  : (darkMode ? 'border-slate-700 hover:border-slate-600' : 'border-slate-200 hover:border-slate-300')
              } ${darkMode ? 'bg-slate-800' : 'bg-white'}`}
            >
              {/* 카드 헤더 */}
              <div className={`px-5 py-3 flex items-center justify-between ${
                darkMode ? 'bg-slate-700' : 'bg-slate-50'
              }`}>
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 flex items-center justify-center rounded-full font-black text-sm ${
                    index === 0 
                      ? 'bg-purple-500 text-white' 
                      : index === prompts.length - 1 
                        ? 'bg-amber-500 text-white'
                        : darkMode ? 'bg-slate-600 text-slate-300' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {index + 1}
                  </span>
                  <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                    index === 0 
                      ? 'bg-purple-100 text-purple-700' 
                      : index === prompts.length - 1 
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {index === 0 ? '📕 표지' : index === prompts.length - 1 ? '🎯 CTA' : '📝 본문'}
                  </span>
                </div>
                
                {!isEditing && (
                  <button
                    onClick={() => startEditing(index)}
                    disabled={isLoading}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
                      darkMode 
                        ? 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    ✏️ 수정
                  </button>
                )}
              </div>

              {/* 카드 내용 */}
              <div className="p-5 space-y-4">
                {isEditing ? (
                  // 편집 모드
                  <>
                    <div>
                      <label className={`text-xs font-bold mb-2 block ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                        🎨 이미지 프롬프트 (전체)
                      </label>
                      <textarea
                        value={tempPrompt}
                        onChange={(e) => setTempPrompt(e.target.value)}
                        rows={8}
                        className={`w-full px-4 py-3 rounded-xl text-sm border outline-none resize-none font-mono transition-all ${
                          darkMode 
                            ? 'bg-slate-700 border-slate-600 text-slate-100 focus:border-purple-500'
                            : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-purple-400'
                        }`}
                      />
                      <p className={`text-xs mt-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        💡 subtitle, mainTitle, description 부분을 수정하면 이미지에 해당 텍스트가 렌더링됩니다.
                      </p>
                    </div>
                    
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={cancelEdit}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          darkMode 
                            ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        취소
                      </button>
                      <button
                        onClick={saveEdit}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-500 text-white hover:bg-purple-600 transition-all"
                      >
                        ✅ 저장
                      </button>
                    </div>
                  </>
                ) : (
                  // 보기 모드 - 핵심 정보만 깔끔하게!
                  <>
                    {/* 📝 렌더링될 텍스트 */}
                    <div className={`p-4 rounded-xl border ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100'}`}>
                      <div className={`text-[10px] font-bold mb-2 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                        📝 이미지에 렌더링될 텍스트
                      </div>
                      {displayText.subtitle && (
                        <div className={`text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          "{displayText.subtitle}"
                        </div>
                      )}
                      <div className={`text-lg font-black ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                        "{displayText.mainTitle || '(메인 제목 없음)'}"
                      </div>
                      {displayText.description && (
                        <div className={`text-sm mt-1 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                          "{displayText.description}"
                        </div>
                      )}
                    </div>
                    
                    {/* 🎨 비주얼 키워드 */}
                    {displayText.visual && (
                      <div className={`p-3 rounded-xl border ${darkMode ? 'bg-emerald-900/30 border-emerald-700/50' : 'bg-emerald-50 border-emerald-100'}`}>
                        <div className={`text-[10px] font-bold mb-1 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                          🎨 비주얼 키워드
                        </div>
                        <div className={`text-sm ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                          {displayText.visual}
                        </div>
                      </div>
                    )}
                    
                    {/* 🖼️ 이미지 스타일 */}
                    {displayText.style && (
                      <div className={`p-3 rounded-xl border ${darkMode ? 'bg-purple-900/30 border-purple-700/50' : 'bg-purple-50 border-purple-100'}`}>
                        <div className={`text-[10px] font-bold mb-1 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                          🖼️ 이미지 스타일
                        </div>
                        <div className={`text-sm ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                          {displayText.style}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 액션 버튼 */}
      <div className={`px-6 py-5 border-t flex-none ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-white/60 bg-white/60 backdrop-blur-sm'}`}>
        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            onClick={onBack}
            disabled={isLoading}
            className={`flex-1 py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
              darkMode
                ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600'
                : 'bg-white/80 text-slate-600 hover:bg-white border border-slate-200/60'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
            원고 수정하기
          </button>

          <button
            onClick={onApprove}
            disabled={isLoading}
            className="flex-1 sm:flex-[2] py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20"
          >
            이 프롬프트로 이미지 생성
          </button>
        </div>

        <p className={`text-center text-[10px] mt-2.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
          승인하면 {prompts.length}장의 이미지 생성이 시작됩니다
        </p>
      </div>
    </div>
  );
};

export default PromptPreview;
