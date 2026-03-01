import React from 'react';
import { CardPromptHistoryItem } from './resultPreviewUtils';

interface CardRegenModalProps {
  darkMode: boolean;
  cardRegenModalOpen: boolean;
  setCardRegenModalOpen: (v: boolean) => void;
  cardRegenIndex: number;
  isRegeneratingCard: boolean;
  cardRegenProgress: string;
  currentCardImage: string;
  editSubtitle: string;
  setEditSubtitle: (v: string) => void;
  editMainTitle: string;
  setEditMainTitle: (v: string) => void;
  editDescription: string;
  setEditDescription: (v: string) => void;
  editImagePrompt: string;
  setEditImagePrompt: (v: string) => void;
  isRecommendingCardPrompt: boolean;
  handleRecommendCardPrompt: () => void;
  isAIPromptApplied: boolean;
  setIsAIPromptApplied: (v: boolean) => void;
  cardRegenRefImage: string;
  setCardRegenRefImage: (v: string) => void;
  refImageMode: 'recolor' | 'copy';
  setRefImageMode: (v: 'recolor' | 'copy') => void;
  isRefImageLocked: boolean;
  saveRefImageToStorage: (image: string, mode: 'recolor' | 'copy') => void;
  clearRefImageFromStorage: () => void;
  promptHistory: CardPromptHistoryItem[];
  showHistoryDropdown: boolean;
  setShowHistoryDropdown: (v: boolean) => void;
  savePromptToHistory: () => void;
  loadFromHistory: (item: CardPromptHistoryItem) => void;
  handleCardRegenerate: () => void;
}

export const CardRegenModal: React.FC<CardRegenModalProps> = ({
  darkMode,
  cardRegenModalOpen,
  setCardRegenModalOpen,
  cardRegenIndex,
  isRegeneratingCard,
  cardRegenProgress,
  currentCardImage,
  editSubtitle,
  setEditSubtitle,
  editMainTitle,
  setEditMainTitle,
  editDescription,
  setEditDescription,
  editImagePrompt,
  setEditImagePrompt,
  isRecommendingCardPrompt,
  handleRecommendCardPrompt,
  isAIPromptApplied,
  setIsAIPromptApplied,
  cardRegenRefImage,
  setCardRegenRefImage,
  refImageMode,
  setRefImageMode,
  isRefImageLocked,
  saveRefImageToStorage,
  clearRefImageFromStorage,
  promptHistory,
  showHistoryDropdown,
  setShowHistoryDropdown,
  savePromptToHistory,
  loadFromHistory,
  handleCardRegenerate,
}) => {
  if (!cardRegenModalOpen) return null;

  return (
      <>
      {/* 카드 재생성 모달 */}
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-6" onClick={() => setShowHistoryDropdown(false)}>
          <div className={`w-full max-w-lg rounded-[28px] shadow-2xl overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            <div className={`px-6 py-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <div>
                <div className={`text-lg font-black ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>🔄 {cardRegenIndex + 1}번 카드 재생성</div>
                <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {cardRegenIndex === 0 ? '표지' : `${cardRegenIndex + 1}번째 슬라이드`}를 새롭게 만듭니다
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCardRegenModalOpen(false)}
                disabled={isRegeneratingCard}
                className={`px-3 py-1.5 rounded-lg text-xs font-black ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {cardRegenProgress && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-bold text-blue-700">{cardRegenProgress}</span>
                </div>
              )}

              {/* 실시간 미리보기 - 실제 이미지 위에 텍스트 오버레이 */}
              <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-blue-600 bg-blue-900/30' : 'border-blue-200 bg-blue-50'}`}>
                <div className={`px-4 py-2 text-xs font-black ${darkMode ? 'bg-blue-800 text-blue-200' : 'bg-blue-100 text-blue-700'}`}>
                  👁️ 실시간 미리보기
                </div>
                <div className="p-4">
                  <div className="relative aspect-square max-w-[220px] mx-auto rounded-xl overflow-hidden shadow-lg">
                    {/* 배경 이미지 */}
                    {currentCardImage ? (
                      <img
                        src={currentCardImage}
                        alt="현재 카드"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-200" />
                    )}

                    {/* 텍스트 오버레이 */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 bg-black/20">
                      {editSubtitle && (
                        <p className="text-[10px] text-white font-bold drop-shadow-lg bg-blue-500/80 px-2 py-0.5 rounded mb-1">
                          {editSubtitle}
                        </p>
                      )}
                      {editMainTitle && (
                        <p className="text-sm font-black text-white leading-tight drop-shadow-lg bg-black/40 px-3 py-1.5 rounded-lg max-w-[90%]">
                          {editMainTitle}
                        </p>
                      )}
                      {editDescription && (
                        <p className="text-[9px] text-white/90 leading-tight drop-shadow mt-2 max-w-[85%] bg-black/30 px-2 py-1 rounded">
                          {editDescription}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className={`text-center text-[9px] mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    ※ 실제 카드와 다를 수 있습니다
                  </p>
                </div>
              </div>

              {/* 📝 카드 프롬프트 편집 */}
              <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-slate-600 bg-slate-700/50' : 'border-slate-200 bg-slate-50'}`}>
                <div className={`px-4 py-2 text-xs font-black flex items-center justify-between ${darkMode ? 'bg-slate-600 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                  <span>✏️ 카드 프롬프트 편집</span>
                  <div className="flex items-center gap-2 relative">
                    {/* 불러오기 버튼 */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
                        disabled={promptHistory.length === 0}
                        className={`px-2 py-1 rounded text-[10px] font-bold transition-all disabled:opacity-40 ${
                          darkMode
                            ? 'bg-amber-600 text-white hover:bg-amber-500'
                            : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        }`}
                      >
                        📂 불러오기
                      </button>

                      {/* 히스토리 드롭다운 */}
                      {showHistoryDropdown && promptHistory.length > 0 && (
                        <div
                          className={`absolute top-full right-0 mt-2 w-72 rounded-xl shadow-2xl z-[10000] overflow-hidden border-2 ${
                            darkMode ? 'bg-slate-800 border-amber-500' : 'bg-white border-amber-300'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className={`px-3 py-2 text-[10px] font-bold ${darkMode ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'}`}>
                            📂 저장된 프롬프트 ({promptHistory.length}개)
                          </div>
                          {promptHistory.map((item, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => loadFromHistory(item)}
                              className={`w-full px-4 py-3 text-left text-xs transition-all border-b last:border-b-0 ${
                                darkMode
                                  ? 'hover:bg-amber-900/50 text-slate-200 border-slate-700'
                                  : 'hover:bg-amber-50 text-slate-700 border-slate-100'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-black text-sm truncate flex-1">{item.mainTitle || '(제목 없음)'}</span>
                                <span className={`text-[9px] ml-2 px-2 py-0.5 rounded-full ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                                  {item.savedAt}
                                </span>
                              </div>
                              {item.subtitle && (
                                <div className={`text-[10px] truncate ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                                  📌 {item.subtitle}
                                </div>
                              )}
                              {item.description && (
                                <div className={`text-[9px] truncate mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                  {item.description.slice(0, 50)}...
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 저장 버튼 */}
                    <button
                      type="button"
                      onClick={savePromptToHistory}
                      disabled={!editSubtitle && !editMainTitle && !editDescription}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-all disabled:opacity-40 ${
                        darkMode
                          ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      }`}
                    >
                      💾 저장
                    </button>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {/* 텍스트 프롬프트 편집 */}
                  <div className="space-y-2">
                    <div className={`text-xs font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>📝 텍스트 내용</div>

                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>부제</label>
                      <input
                        type="text"
                        value={editSubtitle}
                        onChange={(e) => { setEditSubtitle(e.target.value); setIsAIPromptApplied(false); }}
                        disabled={isRegeneratingCard}
                        placeholder="예: 놓치기 쉬운 신호"
                        className={`w-full mt-1 px-3 py-2 rounded-lg text-xs border outline-none ${
                          darkMode
                            ? 'bg-slate-600 border-slate-500 text-slate-100 placeholder-slate-400'
                            : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>메인 제목</label>
                      <input
                        type="text"
                        value={editMainTitle}
                        onChange={(e) => { setEditMainTitle(e.target.value); setIsAIPromptApplied(false); }}
                        disabled={isRegeneratingCard}
                        placeholder="예: 심장이 보내는 경고"
                        className={`w-full mt-1 px-3 py-2 rounded-lg text-xs border outline-none ${
                          darkMode
                            ? 'bg-slate-600 border-slate-500 text-slate-100 placeholder-slate-400'
                            : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`text-xs font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>설명</label>
                      <textarea
                        value={editDescription}
                        onChange={(e) => { setEditDescription(e.target.value); setIsAIPromptApplied(false); }}
                        disabled={isRegeneratingCard}
                        placeholder="예: 이런 증상이 나타나면 주의가 필요해요"
                        rows={2}
                        className={`w-full mt-1 px-3 py-2 rounded-lg text-xs border outline-none resize-none ${
                          darkMode
                            ? 'bg-slate-600 border-slate-500 text-slate-100 placeholder-slate-400'
                            : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>

                  </div>

                  {/* 이미지 프롬프트 편집 */}
                  <div>
                    <div className={`text-xs font-bold mb-1 flex items-center justify-between ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                      <span>🎨 이미지 프롬프트</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleRecommendCardPrompt}
                          disabled={isRecommendingCardPrompt || isRegeneratingCard}
                          className={`px-2 py-1 rounded text-[10px] font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                            darkMode
                              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500'
                              : 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600'
                          }`}
                        >
                          {isRecommendingCardPrompt ? (
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 border border-white border-t-transparent rounded-full animate-spin"></span>
                              AI 분석중...
                            </span>
                          ) : (
                            '🤖 AI 추천'
                          )}
                        </button>
                        <span className={`text-[9px] font-normal ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          텍스트 변경 시 자동 연동
                        </span>
                      </div>
                    </div>
                    <textarea
                      value={editImagePrompt}
                      onChange={(e) => setEditImagePrompt(e.target.value)}
                      disabled={isRegeneratingCard || isRecommendingCardPrompt}
                      placeholder="예: 1:1 카드뉴스, 파란 배경, 심장 3D 일러스트..."
                      rows={5}
                      className={`w-full px-3 py-2 rounded-lg text-xs border outline-none resize-y min-h-[80px] ${
                        darkMode
                          ? 'bg-slate-600 border-slate-500 text-slate-100 placeholder-slate-400'
                          : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                      }`}
                    />
                    <div className={`text-[9px] mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      💡 AI 추천: 부제/메인제목/설명 + 배경 스타일을 자동 생성합니다
                    </div>
                  </div>

                  {/* 🖼️ 참고 이미지 업로드 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className={`text-xs font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                        🖼️ 참고 이미지 {isRefImageLocked && <span className="text-emerald-500">🔒 고정됨</span>}
                      </div>
                      {cardRegenRefImage && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isRefImageLocked) {
                              clearRefImageFromStorage();
                            } else {
                              saveRefImageToStorage(cardRegenRefImage, refImageMode);
                            }
                          }}
                          className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                            isRefImageLocked
                              ? (darkMode ? 'bg-emerald-600 text-white hover:bg-red-500' : 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700')
                              : (darkMode ? 'bg-slate-600 text-slate-300 hover:bg-emerald-600' : 'bg-slate-100 text-slate-600 hover:bg-emerald-100 hover:text-emerald-700')
                          }`}
                        >
                          {isRefImageLocked ? '🔓 고정 해제' : '🔒 이 이미지 고정'}
                        </button>
                      )}
                    </div>
                    <div className={`text-[10px] mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {isRefImageLocked
                        ? '✅ 다음 재생성에도 이 참고 이미지가 자동 적용됩니다!'
                        : '💡 카드 프레임이 마음에 안 드시나요? 원하는 스타일의 카드를 참고 이미지로 첨부하면 동일한 레이아웃으로 생성됩니다!'}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const newImage = ev.target?.result as string;
                            setCardRegenRefImage(newImage);
                            // 새 이미지 업로드 시 고정 해제
                            if (isRefImageLocked) {
                              clearRefImageFromStorage();
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      disabled={isRegeneratingCard}
                      className={`w-full text-xs file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold transition-all ${
                        darkMode
                          ? 'file:bg-slate-600 file:text-slate-200 hover:file:bg-slate-500'
                          : 'file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200'
                      }`}
                    />
                    {cardRegenRefImage && (
                      <>
                        <div className="mt-2 relative">
                          <img src={cardRegenRefImage} alt="참고 이미지" className="max-h-24 rounded-lg border border-slate-300" />
                          <button
                            type="button"
                            onClick={() => {
                              setCardRegenRefImage('');
                              if (isRefImageLocked) {
                                clearRefImageFromStorage();
                              }
                            }}
                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs font-bold"
                          >
                            ✕
                          </button>
                          {isRefImageLocked && (
                            <div className="absolute -top-2 -left-2 w-5 h-5 bg-emerald-500 text-white rounded-full text-xs font-bold flex items-center justify-center">
                              🔒
                            </div>
                          )}
                        </div>

                        {/* 적용 방식 선택 */}
                        <div className={`mt-3 p-3 rounded-lg ${darkMode ? 'bg-slate-600' : 'bg-orange-50'}`}>
                          <div className={`text-[10px] font-bold mb-2 ${darkMode ? 'text-orange-300' : 'text-orange-700'}`}>
                            🎨 스타일 적용 방식
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setRefImageMode('recolor');
                                if (isRefImageLocked) {
                                  saveRefImageToStorage(cardRegenRefImage, 'recolor');
                                }
                              }}
                              className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${
                                refImageMode === 'recolor'
                                  ? 'bg-purple-500 text-white'
                                  : darkMode
                                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-500'
                                    : 'bg-white text-slate-600 hover:bg-purple-100'
                              }`}
                            >
                              🎨 복제+색상변경
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRefImageMode('copy');
                                if (isRefImageLocked) {
                                  saveRefImageToStorage(cardRegenRefImage, 'copy');
                                }
                              }}
                              className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${
                                refImageMode === 'copy'
                                  ? 'bg-orange-500 text-white'
                                  : darkMode
                                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-500'
                                    : 'bg-white text-slate-600 hover:bg-orange-100'
                              }`}
                            >
                              📋 레이아웃 복제
                            </button>
                          </div>
                          <div className={`text-[9px] mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {refImageMode === 'recolor'
                              ? '레이아웃은 그대로, 색상만 다르게!'
                              : '텍스트 위치, 구도, 색상까지 동일하게'}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

            </div>

            <div className={`px-6 py-4 border-t flex justify-end gap-3 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <button
                type="button"
                onClick={() => setCardRegenModalOpen(false)}
                disabled={isRegeneratingCard}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  darkMode
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCardRegenerate}
                disabled={isRegeneratingCard || (!editSubtitle && !editMainTitle && !editDescription && !editImagePrompt && !cardRegenRefImage)}
                className="px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isRegeneratingCard ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    재생성 중...
                  </>
                ) : (
                  cardRegenRefImage
                    ? (refImageMode === 'copy' ? '📋 완전 복제' : '🎨 복제+색상변경')
                    : '🎨 이 카드 재생성'
                )}
              </button>
            </div>
          </div>
        </div>
      </>
  );
};
