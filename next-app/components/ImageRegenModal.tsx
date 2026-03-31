'use client';

import React, { useState } from 'react';

/* ── 블로그 이미지 클릭 시: 다운로드 / 재생성 선택 모달 ── */

interface ImageActionModalProps {
  open: boolean;
  onClose: () => void;
  imageSrc: string;
  imageIndex: number;
  onDownload: (src: string, index: number) => void;
  onRegenerate: () => void;
}

export const ImageActionModal: React.FC<ImageActionModalProps> = ({
  open, onClose, imageSrc, imageIndex, onDownload, onRegenerate,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-[28px] shadow-2xl overflow-hidden bg-white">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="text-sm font-black text-slate-900">🖼️ {imageIndex}번 이미지</div>
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-black bg-slate-100 hover:bg-slate-200">✕</button>
        </div>
        <div className="p-4">
          <img src={imageSrc} alt={`이미지 ${imageIndex}`} className="w-full h-48 object-cover rounded-xl" />
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button type="button" onClick={() => { onDownload(imageSrc, imageIndex); onClose(); }}
            className="flex-1 py-3 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-2">
            📥 다운로드
          </button>
          <button type="button" onClick={() => { onClose(); onRegenerate(); }}
            className="flex-1 py-3 bg-purple-500 text-white font-bold rounded-xl hover:bg-purple-600 transition-all flex items-center justify-center gap-2">
            ✨ 재생성
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── 블로그 이미지 재생성 모달 (프롬프트 편집 + AI 추천 + 참고이미지) ── */

interface ImageRegenModalProps {
  open: boolean;
  onClose: () => void;
  imageIndex: number;
  prompt: string;
  setPrompt: (v: string) => void;
  isRegenerating: boolean;
  onSubmit: () => void;
  /** AI 프롬프트 추천 */
  isRecommending?: boolean;
  onRecommend?: () => void;
  /** 이미지 히스토리 (이전 버전들) */
  imageHistory?: string[];
  onSelectHistoryImage?: (url: string) => void;
}

export const ImageRegenModal: React.FC<ImageRegenModalProps> = ({
  open, onClose, imageIndex, prompt, setPrompt,
  isRegenerating, onSubmit, isRecommending, onRecommend,
  imageHistory, onSelectHistoryImage,
}) => {
  const [refImage, setRefImage] = useState<string | null>(null);
  const [refName, setRefName] = useState('');

  const handleFileChange = (file: File | null) => {
    if (!file) { setRefImage(null); setRefName(''); return; }
    setRefName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setRefImage(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  if (!open) return null;

  const isEnglish = prompt && /^[a-zA-Z\s,.\-:;'"!?()]+$/.test(prompt.trim());

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white rounded-[36px] shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-sm font-black text-slate-900">✨ {imageIndex}번 이미지 재생성</div>
            <div className="text-xs text-slate-500">프롬프트를 수정하여 새 이미지를 생성합니다.</div>
          </div>
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-black bg-slate-100 hover:bg-slate-200">닫기</button>
        </div>

        <div className="p-8 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* 프롬프트 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-black text-slate-700">프롬프트</div>
              {onRecommend && (
                <button type="button" onClick={onRecommend} disabled={isRecommending || isRegenerating}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  {isRecommending ? (
                    <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />AI 분석중...</>
                  ) : '🤖 AI 프롬프트 추천'}
                </button>
              )}
            </div>
            {isEnglish && (
              <div className="mb-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-xs text-amber-700 font-bold">⚠️ 현재 영어 프롬프트입니다. 한글로 수정하거나 &quot;AI 프롬프트 추천&quot; 버튼을 눌러 새 프롬프트를 받아보세요!</div>
              </div>
            )}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full h-32 p-4 rounded-2xl border border-slate-200 bg-slate-50 outline-none font-mono text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
              placeholder="예: 병원에서 의사가 환자와 상담하는 따뜻한 장면, 밝은 조명..."
              disabled={isRecommending || isRegenerating}
            />
            <div className="text-[11px] text-slate-500 mt-2">
              💡 팁: 한글로 원하는 이미지를 설명하세요! &quot;AI 프롬프트 추천&quot; 버튼을 누르면 글 내용에 맞는 최적의 프롬프트를 자동 생성합니다.
            </div>
          </div>

          {/* 이전 버전 */}
          {imageHistory && imageHistory.length >= 2 && onSelectHistoryImage && (
            <div>
              <div className="text-xs font-black text-slate-700 mb-2">이전 버전 ({imageHistory.length - 1}개)</div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {imageHistory.slice(0, -1).reverse().map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelectHistoryImage(url)}
                    className="flex-shrink-0 w-20 h-20 rounded-xl border-2 border-slate-200 hover:border-purple-400 overflow-hidden transition-all hover:shadow-md"
                    title={`이전 버전 ${imageHistory.length - 1 - idx}`}
                  >
                    <img src={url} alt={`이전 버전 ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">클릭하면 해당 이미지로 교체됩니다</div>
            </div>
          )}

          {/* 참고 이미지 */}
          <div>
            <div className="text-xs font-black text-slate-700 mb-2">참고 이미지 (선택)</div>
            <div className="flex items-center gap-4">
              <input type="file" accept="image/*" onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200" />
              {refName && <div className="text-xs font-bold text-slate-600 truncate max-w-[180px]">📎 {refName}</div>}
            </div>
            <div className="text-[11px] text-slate-500 mt-2">참고 이미지는 &quot;무드/실루엣/배색&quot; 참고용으로만 사용됩니다.</div>
            {refImage && (
              <div className="mt-3"><img src={refImage} alt="참고 이미지" className="max-h-32 rounded-xl border border-slate-200" /></div>
            )}
          </div>
        </div>

        <div className="px-8 py-6 border-t border-slate-200 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose}
            className="px-6 py-3 rounded-2xl font-black text-sm bg-slate-100 hover:bg-slate-200">취소</button>
          <button type="button" onClick={onSubmit} disabled={isRegenerating || !prompt.trim()}
            className="px-8 py-3 rounded-2xl font-black text-sm bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2">
            {isRegenerating ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />재생성 중...</>
            ) : '이 프롬프트로 재생성'}
          </button>
        </div>
      </div>
    </div>
  );
};
