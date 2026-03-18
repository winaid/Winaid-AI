/**
 * ResultScoreBar — 결과 화면 상단 점수 표시 + 다운로드 버튼 바
 *
 * 책임:
 *   - SEO 점수, 의료법 준수 점수, 전환력 점수 표시
 *   - 이미지 최적화 버튼
 *   - Word/PDF/카드뉴스 다운로드 버튼
 */

import React from 'react';

interface SeoScore {
  total: number;
}

interface FactCheck {
  safety_score: number;
  conversion_score?: number;
}

interface ResultScoreBarProps {
  darkMode: boolean;
  postType: string;
  factCheck?: FactCheck | null;
  seoScore: SeoScore | null;
  isEvaluatingSeo: boolean;
  handleEvaluateSeo: () => void;
  setShowSeoDetail: (v: boolean) => void;
  // 이미지 최적화
  isOptimizingImages: boolean;
  optimizationStats: { imageCount: number; totalSaved: number } | null;
  handleOptimizeImages: () => void;
  // 다운로드
  isEditingAi: boolean;
  downloadingCard: boolean;
  setCardDownloadModalOpen: (v: boolean) => void;
  handleDownloadWord: () => void;
  handleDownloadPDF: () => void;
}

export const ResultScoreBar: React.FC<ResultScoreBarProps> = ({
  darkMode: _darkMode,
  postType,
  factCheck,
  seoScore,
  isEvaluatingSeo,
  handleEvaluateSeo,
  setShowSeoDetail,
  isOptimizingImages,
  optimizationStats,
  handleOptimizeImages,
  isEditingAi,
  downloadingCard,
  setCardDownloadModalOpen,
  handleDownloadWord,
  handleDownloadPDF,
}) => {
  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 flex items-center justify-between text-white flex-none relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=')] opacity-60" />
      <div className="flex items-center gap-4 relative">
        {factCheck ? (
          <>
            {/* SEO 점수 (블로그에만 표시) */}
            {postType !== 'card_news' && (
              <>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black opacity-50 uppercase tracking-[0.1em] mb-1">📊 SEO 점수</span>
                  <div className="flex items-center gap-2">
                    {seoScore ? (
                      <>
                        <span className={`text-3xl font-black ${seoScore.total >= 85 ? 'text-emerald-400' : seoScore.total >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                          {seoScore.total}점
                        </span>
                        <button
                          onClick={() => setShowSeoDetail(true)}
                          className="text-[10px] opacity-70 hover:opacity-100 underline"
                        >
                          {seoScore.total >= 85 ? '✅ 최적화' : seoScore.total >= 70 ? '⚠️ 개선필요' : '🚨 재설계'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleEvaluateSeo}
                        disabled={isEvaluatingSeo}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                      >
                        {isEvaluatingSeo ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            평가중...
                          </>
                        ) : (
                          '평가하기'
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div className="w-px h-12 bg-slate-700"></div>
              </>
            )}

            {/* 의료법 준수 */}
            <div className="flex flex-col">
              <span className="text-[10px] font-black opacity-50 uppercase tracking-[0.1em] mb-1">⚖️ 의료법</span>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-black ${factCheck.safety_score > 80 ? 'text-green-400' : 'text-amber-400'}`}>
                  {factCheck.safety_score}점
                </span>
                <span className="text-[10px] opacity-70">{factCheck.safety_score > 80 ? '✅' : '⚠️'}</span>
              </div>
            </div>

            <div className="w-px h-12 bg-slate-700"></div>

            {/* 전환력 점수 */}
            <div className="flex flex-col">
              <span className="text-[10px] font-black opacity-50 uppercase tracking-[0.1em] mb-1">🎯 전환력</span>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-black ${(factCheck.conversion_score || 0) >= 80 ? 'text-emerald-400' : (factCheck.conversion_score || 0) >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                  {factCheck.conversion_score || 0}점
                </span>
                <span className="text-[10px] opacity-70 leading-tight">
                  {(factCheck.conversion_score || 0) >= 80 ? '🔥' : (factCheck.conversion_score || 0) >= 60 ? '👍' : '💡'}
                </span>
              </div>
            </div>

            {postType === 'card_news' && (
              <div className="hidden lg:block ml-4">
                <span className="text-xs font-bold text-blue-400 border border-blue-400 px-2 py-1 rounded-lg">카드뉴스 모드</span>
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-slate-500">
            💡 콘텐츠를 생성하면 점수가 표시됩니다
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 relative">
        {/* 이미지 최적화 버튼 */}
        <button
          onClick={handleOptimizeImages}
          disabled={isOptimizingImages}
          className={`${
            optimizationStats
              ? 'bg-green-500 hover:bg-green-600'
              : 'bg-amber-500 hover:bg-amber-600'
          } text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 relative`}
          title={optimizationStats
            ? `✅ ${optimizationStats.imageCount}개 이미지 최적화됨`
            : 'WebP 변환 + Lazy Loading 적용'
          }
        >
          {isOptimizingImages ? (
            <>
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span className="hidden lg:inline">최적화 중...</span>
            </>
          ) : (
            <>
              🖼️ <span className="hidden lg:inline">{optimizationStats ? '최적화됨' : '이미지 최적화'}</span>
            </>
          )}
        </button>

        <span className="text-[10px] font-black uppercase text-slate-400 mr-2 hidden lg:inline">다운로드</span>
        {postType === 'card_news' ? (
          <button
            onClick={() => setCardDownloadModalOpen(true)}
            disabled={downloadingCard}
            className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2"
          >
            📥 다운로드
          </button>
        ) : (
          <>
            <button onClick={handleDownloadWord} disabled={isEditingAi} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2">
              📄 Word
            </button>
            <button onClick={handleDownloadPDF} disabled={isEditingAi} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2">
              📑 PDF
            </button>
          </>
        )}
      </div>
    </div>
  );
};
