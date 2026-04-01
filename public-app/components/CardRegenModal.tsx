'use client';

import React from 'react';

export interface CardPromptHistoryItem {
  subtitle: string;
  mainTitle: string;
  description: string;
  imagePrompt: string;
  savedAt: string;
}

export const CARD_PROMPT_HISTORY_KEY = 'winaid_card_prompt_history';
export const CARD_REF_IMAGE_KEY = 'winaid_card_ref_image';

interface CardRegenModalProps {
  open: boolean;
  onClose: () => void;
  cardIndex: number;
  isRegenerating: boolean;
  regenProgress: string;
  currentCardImage: string;
  // 텍스트 편집
  editSubtitle: string;
  setEditSubtitle: (v: string) => void;
  editMainTitle: string;
  setEditMainTitle: (v: string) => void;
  editDescription: string;
  setEditDescription: (v: string) => void;
  editImagePrompt: string;
  setEditImagePrompt: (v: string) => void;
  // AI 추천
  isRecommending: boolean;
  onRecommendPrompt: () => void;
  // 참고 이미지
  refImage: string;
  setRefImage: (v: string) => void;
  refImageMode: 'recolor' | 'copy';
  setRefImageMode: (v: 'recolor' | 'copy') => void;
  isRefImageLocked: boolean;
  onLockRefImage: (image: string, mode: 'recolor' | 'copy') => void;
  onUnlockRefImage: () => void;
  // 프롬프트 히스토리
  promptHistory: CardPromptHistoryItem[];
  showHistoryDropdown: boolean;
  setShowHistoryDropdown: (v: boolean) => void;
  onSavePromptHistory: () => void;
  onLoadFromHistory: (item: CardPromptHistoryItem) => void;
  // 실행
  onRegenerate: () => void;
}

export const CardRegenModal: React.FC<CardRegenModalProps> = ({
  open, onClose, cardIndex, isRegenerating, regenProgress, currentCardImage,
  editSubtitle, setEditSubtitle, editMainTitle, setEditMainTitle,
  editDescription, setEditDescription, editImagePrompt, setEditImagePrompt,
  isRecommending, onRecommendPrompt,
  refImage, setRefImage, refImageMode, setRefImageMode,
  isRefImageLocked, onLockRefImage, onUnlockRefImage,
  promptHistory, showHistoryDropdown, setShowHistoryDropdown,
  onSavePromptHistory, onLoadFromHistory,
  onRegenerate,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-6" onClick={() => setShowHistoryDropdown(false)}>
      <div className="w-full max-w-lg rounded-[28px] shadow-2xl overflow-hidden bg-white" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-lg font-black text-slate-900">🔄 {cardIndex}번 카드 재생성</div>
            <div className="text-xs text-slate-500">{cardIndex === 1 ? '표지' : `${cardIndex}번째 슬라이드`}를 새롭게 만듭니다</div>
          </div>
          <button type="button" onClick={onClose} disabled={isRegenerating}
            className="px-3 py-1.5 rounded-lg text-xs font-black bg-slate-100 hover:bg-slate-200">✕</button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* 진행 상태 */}
          {regenProgress && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-bold text-blue-700">{regenProgress}</span>
            </div>
          )}

          {/* 실시간 미리보기 */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 overflow-hidden">
            <div className="px-4 py-2 text-xs font-black bg-blue-100 text-blue-700">👁️ 실시간 미리보기</div>
            <div className="p-4">
              <div className="relative aspect-square max-w-[220px] mx-auto rounded-xl overflow-hidden shadow-lg">
                {currentCardImage ? (
                  <img src={currentCardImage} alt="현재 카드" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-200" />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 bg-black/20">
                  {editSubtitle && <p className="text-[10px] text-white font-bold drop-shadow-lg bg-blue-500/80 px-2 py-0.5 rounded mb-1">{editSubtitle}</p>}
                  {editMainTitle && <p className="text-sm font-black text-white leading-tight drop-shadow-lg bg-black/40 px-3 py-1.5 rounded-lg max-w-[90%]">{editMainTitle}</p>}
                  {editDescription && <p className="text-[9px] text-white/90 leading-tight drop-shadow mt-2 max-w-[85%] bg-black/30 px-2 py-1 rounded">{editDescription}</p>}
                </div>
              </div>
              <p className="text-center text-[9px] mt-2 text-slate-500">※ 실제 카드와 다를 수 있습니다</p>
            </div>
          </div>

          {/* 카드 프롬프트 편집 */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
            <div className="px-4 py-2 text-xs font-black bg-slate-200 text-slate-600 flex items-center justify-between">
              <span>✏️ 카드 프롬프트 편집</span>
              <div className="flex items-center gap-2 relative">
                {/* 불러오기 */}
                <div className="relative">
                  <button type="button" onClick={() => setShowHistoryDropdown(!showHistoryDropdown)} disabled={promptHistory.length === 0}
                    className="px-2 py-1 rounded text-[10px] font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all disabled:opacity-40">📂 불러오기</button>
                  {showHistoryDropdown && promptHistory.length > 0 && (
                    <div className="absolute top-full right-0 mt-2 w-72 rounded-xl shadow-2xl z-[10000] overflow-hidden border-2 bg-white border-amber-300"
                      onClick={(e) => e.stopPropagation()}>
                      <div className="px-3 py-2 text-[10px] font-bold bg-amber-100 text-amber-800">📂 저장된 프롬프트 ({promptHistory.length}개)</div>
                      {promptHistory.map((item, idx) => (
                        <button key={idx} type="button" onClick={() => onLoadFromHistory(item)}
                          className="w-full px-4 py-3 text-left text-xs hover:bg-amber-50 text-slate-700 border-b last:border-b-0 border-slate-100 transition-all">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-black text-sm truncate flex-1">{item.mainTitle || '(제목 없음)'}</span>
                            <span className="text-[9px] ml-2 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{item.savedAt}</span>
                          </div>
                          {item.subtitle && <div className="text-[10px] truncate text-amber-600">📌 {item.subtitle}</div>}
                          {item.description && <div className="text-[9px] truncate mt-0.5 text-slate-500">{item.description.slice(0, 50)}...</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* 저장 */}
                <button type="button" onClick={onSavePromptHistory} disabled={!editSubtitle && !editMainTitle && !editDescription}
                  className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all disabled:opacity-40">💾 저장</button>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {/* 텍스트 프롬프트 */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-blue-600">📝 텍스트 내용</div>
                <div>
                  <label className="text-xs font-bold text-slate-500">부제</label>
                  <input type="text" value={editSubtitle} onChange={(e) => setEditSubtitle(e.target.value)} disabled={isRegenerating}
                    placeholder="예: 놓치기 쉬운 신호"
                    className="w-full mt-1 px-3 py-2 rounded-lg text-xs border border-slate-200 bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500">메인 제목</label>
                  <input type="text" value={editMainTitle} onChange={(e) => setEditMainTitle(e.target.value)} disabled={isRegenerating}
                    placeholder="예: 심장이 보내는 경고"
                    className="w-full mt-1 px-3 py-2 rounded-lg text-xs border border-slate-200 bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500">설명</label>
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} disabled={isRegenerating}
                    placeholder="예: 이런 증상이 나타나면 주의가 필요해요" rows={2}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-xs border border-slate-200 bg-white text-slate-900 placeholder-slate-400 outline-none resize-none focus:ring-2 focus:ring-blue-200" />
                </div>
              </div>

              {/* 이미지 프롬프트 */}
              <div>
                <div className="text-xs font-bold mb-1 flex items-center justify-between text-purple-600">
                  <span>🎨 이미지 프롬프트</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={onRecommendPrompt} disabled={isRecommending || isRegenerating}
                      className="px-2 py-1 rounded text-[10px] font-bold bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                      {isRecommending ? (
                        <span className="flex items-center gap-1"><span className="w-2 h-2 border border-white border-t-transparent rounded-full animate-spin" />AI 분석중...</span>
                      ) : '🤖 AI 추천'}
                    </button>
                    <span className="text-[9px] font-normal text-slate-400">텍스트 변경 시 자동 연동</span>
                  </div>
                </div>
                <textarea value={editImagePrompt} onChange={(e) => setEditImagePrompt(e.target.value)}
                  disabled={isRegenerating || isRecommending}
                  placeholder="예: 1:1 카드뉴스, 파란 배경, 심장 3D 일러스트..."
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg text-xs border border-slate-200 bg-white text-slate-900 placeholder-slate-400 outline-none resize-y min-h-[80px] focus:ring-2 focus:ring-purple-200" />
                <div className="text-[9px] mt-1 text-slate-400">💡 AI 추천: 부제/메인제목/설명 + 배경 스타일을 자동 생성합니다</div>
              </div>

              {/* 참고 이미지 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-bold text-orange-600">
                    🖼️ 참고 이미지 {isRefImageLocked && <span className="text-emerald-500">🔒 고정됨</span>}
                  </div>
                  {refImage && (
                    <button type="button" onClick={() => isRefImageLocked ? onUnlockRefImage() : onLockRefImage(refImage, refImageMode)}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${isRefImageLocked ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700' : 'bg-slate-100 text-slate-600 hover:bg-emerald-100 hover:text-emerald-700'}`}>
                      {isRefImageLocked ? '🔓 고정 해제' : '🔒 이 이미지 고정'}
                    </button>
                  )}
                </div>
                <div className="text-[10px] mb-2 text-slate-500">
                  {isRefImageLocked
                    ? '✅ 다음 재생성에도 이 참고 이미지가 자동 적용됩니다!'
                    : '💡 카드 프레임이 마음에 안 드시나요? 원하는 스타일의 카드를 참고 이미지로 첨부하면 동일한 레이아웃으로 생성됩니다!'}
                </div>
                <input type="file" accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        setRefImage(ev.target?.result as string);
                        if (isRefImageLocked) onUnlockRefImage();
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  disabled={isRegenerating}
                  className="w-full text-xs file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200" />
                {refImage && (
                  <>
                    <div className="mt-2 relative">
                      <img src={refImage} alt="참고 이미지" className="max-h-24 rounded-lg border border-slate-300" />
                      <button type="button" onClick={() => { setRefImage(''); if (isRefImageLocked) onUnlockRefImage(); }}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs font-bold">✕</button>
                      {isRefImageLocked && (
                        <div className="absolute -top-2 -left-2 w-5 h-5 bg-emerald-500 text-white rounded-full text-xs font-bold flex items-center justify-center">🔒</div>
                      )}
                    </div>
                    {/* 스타일 적용 방식 */}
                    <div className="mt-3 p-3 rounded-lg bg-orange-50">
                      <div className="text-[10px] font-bold mb-2 text-orange-700">🎨 스타일 적용 방식</div>
                      <div className="flex gap-2">
                        <button type="button"
                          onClick={() => { setRefImageMode('recolor'); if (isRefImageLocked) onLockRefImage(refImage, 'recolor'); }}
                          className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${refImageMode === 'recolor' ? 'bg-purple-500 text-white' : 'bg-white text-slate-600 hover:bg-purple-100'}`}>
                          🎨 복제+색상변경
                        </button>
                        <button type="button"
                          onClick={() => { setRefImageMode('copy'); if (isRefImageLocked) onLockRefImage(refImage, 'copy'); }}
                          className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${refImageMode === 'copy' ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 hover:bg-orange-100'}`}>
                          📋 레이아웃 복제
                        </button>
                      </div>
                      <div className="text-[9px] mt-2 text-slate-500">
                        {refImageMode === 'recolor' ? '레이아웃은 그대로, 색상만 다르게!' : '텍스트 위치, 구도, 색상까지 동일하게'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={isRegenerating}
            className="px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all">취소</button>
          <button type="button" onClick={onRegenerate}
            disabled={isRegenerating || (!editSubtitle && !editMainTitle && !editDescription && !editImagePrompt && !refImage)}
            className="px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-50 flex items-center gap-2">
            {isRegenerating ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />재생성 중...</>
            ) : refImage
              ? (refImageMode === 'copy' ? '📋 완전 복제' : '🎨 복제+색상변경')
              : '🎨 이 카드 재생성'}
          </button>
        </div>
      </div>
    </div>
  );
};
