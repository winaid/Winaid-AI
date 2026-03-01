import React from 'react';

interface ImageDownloadModalProps {
  darkMode: boolean;
  downloadModalOpen: boolean;
  setDownloadModalOpen: (v: boolean) => void;
  downloadImgSrc: string;
  downloadImgIndex: number;
  downloadImage: (src: string, index: number) => void;
  setRegenOpen: (v: boolean) => void;
}

export const ImageDownloadModal: React.FC<ImageDownloadModalProps> = ({
  darkMode,
  downloadModalOpen,
  setDownloadModalOpen,
  downloadImgSrc,
  downloadImgIndex,
  downloadImage,
  setRegenOpen,
}) => {
  if (!downloadModalOpen) return null;

  return (
    <>
      {/* 이미지 클릭 시 선택 모달 (다운로드 or 재생성) */}
      <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-6">
        <div className={`w-full max-w-md rounded-[28px] shadow-2xl overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
          <div className={`px-6 py-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
            <div className={`text-sm font-black ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>🖼️ {downloadImgIndex}번 이미지</div>
            <button
              type="button"
              onClick={() => setDownloadModalOpen(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200'}`}
            >
              ✕
            </button>
          </div>

          {/* 이미지 미리보기 */}
          <div className="p-4">
            <img
              src={downloadImgSrc}
              alt={`이미지 ${downloadImgIndex}`}
              className="w-full h-48 object-cover rounded-xl"
            />
          </div>

          {/* 버튼들 */}
          <div className="px-6 pb-6 flex gap-3">
            <button
              type="button"
              onClick={() => {
                downloadImage(downloadImgSrc, downloadImgIndex);
                setDownloadModalOpen(false);
              }}
              className="flex-1 py-3 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
            >
              📥 다운로드
            </button>
            <button
              type="button"
              onClick={() => {
                setDownloadModalOpen(false);
                setRegenOpen(true);
              }}
              className="flex-1 py-3 bg-purple-500 text-white font-bold rounded-xl hover:bg-purple-600 transition-all flex items-center justify-center gap-2"
            >
              ✨ 재생성
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

interface ImageRegenModalProps {
  darkMode: boolean;
  regenOpen: boolean;
  setRegenOpen: (v: boolean) => void;
  regenIndex: number;
  regenPrompt: string;
  setRegenPrompt: (v: string) => void;
  isRecommendingPrompt: boolean;
  handleRecommendPrompt: () => void;
  regenRefDataUrl?: string;
  regenRefName: string;
  handleRegenFileChange: (file: File | null) => void;
  isEditingAi: boolean;
  submitRegenerateImage: () => void;
}

export const ImageRegenModal: React.FC<ImageRegenModalProps> = ({
  darkMode,
  regenOpen,
  setRegenOpen,
  regenIndex,
  regenPrompt,
  setRegenPrompt,
  isRecommendingPrompt,
  handleRecommendPrompt,
  regenRefDataUrl,
  regenRefName,
  handleRegenFileChange,
  isEditingAi,
  submitRegenerateImage,
}) => {
  if (!regenOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white rounded-[36px] shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-sm font-black text-slate-900">✨ {regenIndex}번 이미지 재생성</div>
            <div className="text-xs text-slate-500">프롬프트를 수정하여 새 이미지를 생성합니다.</div>
          </div>
          <button
            type="button"
            onClick={() => setRegenOpen(false)}
            className="px-4 py-2 rounded-xl text-xs font-black bg-slate-100 hover:bg-slate-200"
          >
            닫기
          </button>
        </div>

        <div className="p-8 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-black text-slate-700">프롬프트</div>
              <button
                type="button"
                onClick={handleRecommendPrompt}
                disabled={isRecommendingPrompt}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRecommendingPrompt ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    AI 분석중...
                  </>
                ) : (
                  <>
                    🤖 AI 프롬프트 추천
                  </>
                )}
              </button>
            </div>
            {/* 영어 프롬프트인 경우 안내 메시지 */}
            {regenPrompt && /^[a-zA-Z\s,.\-:;'"!?()]+$/.test(regenPrompt.trim()) && (
              <div className="mb-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-xs text-amber-700 font-bold">
                  ⚠️ 현재 영어 프롬프트입니다. 한글로 수정하거나 "AI 프롬프트 추천" 버튼을 눌러 새 프롬프트를 받아보세요!
                </div>
              </div>
            )}
            <textarea
              value={regenPrompt}
              onChange={(e) => setRegenPrompt(e.target.value)}
              className="w-full h-32 p-4 rounded-2xl border border-slate-200 bg-slate-50 outline-none font-mono text-sm"
              placeholder="예: 병원에서 의사가 환자와 상담하는 따뜻한 장면, 밝은 조명..."
              disabled={isRecommendingPrompt}
            />
            <div className="text-[11px] text-slate-500 mt-2">
              💡 팁: 한글로 원하는 이미지를 설명하세요! "AI 프롬프트 추천" 버튼을 누르면 글 내용에 맞는 최적의 프롬프트를 자동 생성합니다.
            </div>
          </div>

          <div>
            <div className="text-xs font-black text-slate-700 mb-2">참고 이미지 (선택)</div>
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleRegenFileChange(e.target.files?.[0] || null)}
                className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
              />
              {regenRefName && (
                <div className="text-xs font-bold text-slate-600 truncate max-w-[180px]">📎 {regenRefName}</div>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-2">
              참고 이미지는 "무드/실루엣/배색" 참고용으로만 사용됩니다.
            </div>
            {regenRefDataUrl && (
              <div className="mt-3">
                <img src={regenRefDataUrl} alt="참고 이미지" className="max-h-32 rounded-xl border border-slate-200" />
              </div>
            )}
          </div>
        </div>

        <div className="px-8 py-6 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setRegenOpen(false)}
            className="px-6 py-3 rounded-2xl font-black text-sm bg-slate-100 hover:bg-slate-200"
            disabled={isEditingAi}
          >
            취소
          </button>
          <button
            type="button"
            onClick={submitRegenerateImage}
            className="px-8 py-3 rounded-2xl font-black text-sm bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
            disabled={isEditingAi}
          >
            이 프롬프트로 재생성
          </button>
        </div>
      </div>
    </div>
  );
};

interface CardDownloadModalProps {
  darkMode: boolean;
  cardDownloadModalOpen: boolean;
  setCardDownloadModalOpen: (v: boolean) => void;
  downloadingCard: boolean;
  cardDownloadProgress: string;
  cardCount: number;
  downloadCardAsImage: (index: number) => void;
  openCardRegenModal: (index: number) => void;
  downloadAllCards: () => void;
}

export const CardDownloadModal: React.FC<CardDownloadModalProps> = ({
  darkMode,
  cardDownloadModalOpen,
  setCardDownloadModalOpen,
  downloadingCard,
  cardDownloadProgress,
  cardCount,
  downloadCardAsImage,
  openCardRegenModal,
  downloadAllCards,
}) => {
  if (!cardDownloadModalOpen) return null;

  return (
    <>
      {/* 카드뉴스 다운로드 모달 */}
      <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-6">
        <div className={`w-full max-w-lg rounded-[28px] shadow-2xl overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
          <div className={`px-6 py-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
            <div className={`text-lg font-black ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>🖼️ 카드뉴스 다운로드</div>
            <button
              type="button"
              onClick={() => setCardDownloadModalOpen(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200'}`}
            >
              ✕
            </button>
          </div>

          <div className="p-6 space-y-4">
            {cardDownloadProgress && (
              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm font-bold text-blue-700">{cardDownloadProgress}</span>
              </div>
            )}

            <div className={`p-4 rounded-xl ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}>
              <p className={`text-sm mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                📌 카드뉴스 전체를 이미지로 다운로드합니다.<br/>
                각 카드가 PNG 이미지로 저장됩니다.
              </p>

              {/* 개별 카드 다운로드 & 재생성 */}
              <div className="space-y-2 mb-4">
                <div className={`text-xs font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>개별 카드 다운로드</div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {Array.from({ length: cardCount || 6 }, (_, i) => (
                    <div key={i} className="flex">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadCardAsImage(i);
                        }}
                        disabled={downloadingCard}
                        className={`flex-1 px-3 py-2.5 rounded-l-lg text-xs font-bold transition-all disabled:opacity-50 ${darkMode ? 'bg-slate-600 hover:bg-slate-500 text-white' : 'bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-700'}`}
                      >
                        📥 {i + 1}장
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCardDownloadModalOpen(false);
                          setTimeout(() => openCardRegenModal(i), 100);
                        }}
                        disabled={downloadingCard}
                        className={`px-3 py-2.5 rounded-r-lg text-xs font-bold transition-all disabled:opacity-50 ${darkMode ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-purple-100 border border-purple-200 hover:border-purple-400 hover:bg-purple-200 text-purple-700'}`}
                        title="이 카드 재생성"
                      >
                        🔄
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 전체 다운로드 버튼 */}
            <button
              type="button"
              onClick={downloadAllCards}
              disabled={downloadingCard}
              className="w-full py-4 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold rounded-xl hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              📥 모든 카드 일괄 다운로드
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
