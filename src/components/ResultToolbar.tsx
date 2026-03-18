/**
 * ResultToolbar — 미리보기/HTML 탭 + 글자 수 + 되돌리기 + 유사도 + 저장/불러오기 + 복사
 */

import React from 'react';
import type { AutoSaveHistoryItem } from './resultPreviewUtils';
import type { BlogSection } from '../types';

interface ResultToolbarProps {
  darkMode: boolean;
  activeTab: 'preview' | 'html';
  setActiveTab: (v: 'preview' | 'html') => void;
  postType: string;
  blogSections: BlogSection[];
  showSectionPanel: boolean;
  setShowSectionPanel: (v: boolean) => void;
  charCount: number;
  canUndo: boolean;
  handleUndo: () => void;
  // 유사도
  isCheckingSimilarity: boolean;
  handleCheckSimilarity: () => void;
  // 저장/불러오기
  saveManually: () => void;
  hasAutoSave: () => boolean;
  showAutoSaveDropdown: boolean;
  setShowAutoSaveDropdown: (v: boolean) => void;
  autoSaveHistory: AutoSaveHistoryItem[];
  loadFromAutoSaveHistory: (item: AutoSaveHistoryItem) => void;
  deleteHistoryItem: (idx: number) => void;
  lastSaved: Date | null;
  // 복사
  copied: boolean;
  handleCopy: () => void;
}

export const ResultToolbar: React.FC<ResultToolbarProps> = ({
  darkMode,
  activeTab,
  setActiveTab,
  postType,
  blogSections,
  showSectionPanel,
  setShowSectionPanel,
  charCount,
  canUndo,
  handleUndo,
  isCheckingSimilarity,
  handleCheckSimilarity,
  saveManually,
  hasAutoSave,
  showAutoSaveDropdown,
  setShowAutoSaveDropdown,
  autoSaveHistory,
  loadFromAutoSaveHistory,
  deleteHistoryItem,
  lastSaved,
  copied,
  handleCopy,
}) => {
  return (
    <div className={`p-6 border-b flex-none transition-colors duration-300 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <div className={`flex p-1.5 rounded-xl ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
            <button onClick={() => setActiveTab('preview')} className={`px-8 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'preview' ? (darkMode ? 'bg-slate-600 text-emerald-400 shadow-sm' : 'bg-white text-green-600 shadow-sm') : 'text-slate-400'}`}>미리보기</button>
            <button onClick={() => setActiveTab('html')} className={`px-8 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'html' ? (darkMode ? 'bg-slate-600 text-emerald-400 shadow-sm' : 'bg-white text-green-600 shadow-sm') : 'text-slate-400'}`}>HTML</button>
          </div>

          {/* 소제목별 수정 버튼 (블로그 전용) */}
          {postType === 'blog' && blogSections.length > 0 && (
            <button
              onClick={() => setShowSectionPanel(!showSectionPanel)}
              className={`px-4 py-2.5 text-sm font-bold rounded-xl transition-all flex items-center gap-2 ${
                showSectionPanel
                  ? darkMode ? 'bg-violet-900/50 text-violet-300 border border-violet-700' : 'bg-violet-100 text-violet-700 border border-violet-300'
                  : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              소제목별 수정
            </button>
          )}

          {/* 글자 수 표시 */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
            <span className={`text-xs font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>📊 글자 수:</span>
            <span className={`text-sm font-black ${charCount < 1500 ? 'text-amber-500' : charCount > 4000 ? 'text-blue-500' : 'text-emerald-500'}`}>
              {charCount.toLocaleString()}자
            </span>
            <span className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {charCount < 1500 ? '(짧음)' : charCount < 2500 ? '(적당)' : charCount < 4000 ? '(길음)' : '(매우 길음)'}
            </span>
          </div>

          {/* Undo 버튼 */}
          {canUndo && (
            <button
              type="button"
              onClick={handleUndo}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${darkMode ? 'bg-orange-900/50 text-orange-400 hover:bg-orange-900' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
              title="이전 상태로 되돌리기"
            >
              ↩️ 되돌리기
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 유사도 검사 버튼 */}
          <button
            onClick={handleCheckSimilarity}
            disabled={isCheckingSimilarity}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              isCheckingSimilarity
                ? (darkMode ? 'bg-purple-900/30 text-purple-500 cursor-wait' : 'bg-purple-100/50 text-purple-400 cursor-wait')
                : (darkMode ? 'bg-purple-900/50 text-purple-400 hover:bg-purple-900' : 'bg-purple-100 text-purple-700 hover:bg-purple-200')
            }`}
            title="블로그 유사도 검사 (중복 체크)"
          >
            {isCheckingSimilarity ? (
              <>
                <span className="animate-spin inline-block mr-1">🔄</span>
                검사 중...
              </>
            ) : (
              <>🔍 유사도</>
            )}
          </button>

          {/* 저장 버튼 */}
          <div className="flex items-center gap-1 relative">
            <button
              onClick={saveManually}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${darkMode ? 'bg-blue-900/50 text-blue-400 hover:bg-blue-900' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
              title="현재 내용 저장"
            >
              💾 저장
            </button>

            {hasAutoSave() && (
              <div className="relative">
                <button
                  onClick={() => setShowAutoSaveDropdown(!showAutoSaveDropdown)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${darkMode ? 'bg-amber-900/50 text-amber-400 hover:bg-amber-900' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                  title="저장된 글 불러오기"
                >
                  📂 불러오기
                </button>

                {/* 자동저장 히스토리 드롭다운 */}
                {showAutoSaveDropdown && autoSaveHistory.length > 0 && (
                  <div
                    className={`absolute bottom-full right-0 mb-2 w-80 rounded-xl shadow-2xl z-[10000] overflow-hidden border-2 ${
                      darkMode ? 'bg-slate-800 border-amber-500' : 'bg-white border-amber-300'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className={`px-3 py-2 text-[10px] font-bold flex items-center justify-between ${darkMode ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'}`}>
                      <span>📂 저장된 글 ({autoSaveHistory.length}/3)</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowAutoSaveDropdown(false); }}
                        className="text-xs hover:opacity-70"
                      >✕</button>
                    </div>
                    {autoSaveHistory.map((item, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 px-3 py-2.5 border-b last:border-b-0 ${
                          darkMode ? 'border-slate-700' : 'border-slate-100'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => loadFromAutoSaveHistory(item)}
                          className={`flex-1 text-left text-xs transition-all rounded-lg p-2 ${
                            darkMode
                              ? 'hover:bg-amber-900/50 text-slate-200'
                              : 'hover:bg-amber-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-black text-sm truncate flex-1">{item.title}</span>
                            <span className={`text-[9px] ml-2 px-2 py-0.5 rounded-full ${
                              item.postType === 'card_news'
                                ? 'bg-purple-100 text-purple-600'
                                : item.postType === 'press_release'
                                ? 'bg-amber-100 text-amber-600'
                                : 'bg-blue-100 text-blue-600'
                            }`}>
                              {item.postType === 'card_news' ? '카드뉴스' : item.postType === 'press_release' ? '보도자료' : '블로그'}
                            </span>
                          </div>
                          <div className={`text-[9px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            🕐 {new Date(item.savedAt).toLocaleString('ko-KR', {
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`"${item.title}"을(를) 삭제하시겠습니까?`)) {
                              deleteHistoryItem(idx);
                            }
                          }}
                          className={`p-2 rounded-lg text-xs font-bold transition-all ${
                            darkMode
                              ? 'bg-red-900/50 text-red-400 hover:bg-red-900'
                              : 'bg-red-50 text-red-500 hover:bg-red-100'
                          }`}
                          title="삭제"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {lastSaved && (
              <span className={`text-[10px] hidden lg:inline ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                💾 {lastSaved.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 저장됨
              </span>
            )}
          </div>

          <button onClick={handleCopy} className={`px-10 py-3 rounded-xl text-md font-bold text-white shadow-xl transition-all active:scale-95 ${copied ? 'bg-emerald-500' : 'bg-green-500 hover:bg-green-600'}`}>
            {copied ? '✅ 복사 완료' : '블로그로 복사'}
          </button>
        </div>
      </div>
    </div>
  );
};
