'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { authFetch } from '../lib/authFetch';
import { getSessionSafe } from '@winaid/blog-core';
import { IMAGE_TAG_PRESETS, type HospitalImage } from '../lib/hospitalImageService';
import { buildImagePrompt } from '@winaid/blog-core';
import { sanitizePromptInput } from '@winaid/blog-core';

/**
 * 이미지 삽입 모달 — 2개 탭 (라이브러리 / AI 생성).
 * 단락 hover [+] 버튼 클릭 시 오픈. 선택/생성된 이미지는 onInsert 로 부모에 전달.
 */

interface ImageInsertModalProps {
  open: boolean;
  onClose: () => void;
  onInsert: (imageUrl: string, alt: string, prompt?: string) => void;
  category: string;
  topic: string;
  hospitalName?: string;
  defaultPromptHint?: string;
  /** AI 탭 프롬프트 추천 (LLM 호출) — 없으면 버튼 숨김 */
  onRecommendPrompt?: (paragraphHint: string) => Promise<string>;
}

type Tab = 'library' | 'ai';
type ImageStyle = 'photo' | 'illustration' | 'medical';

export default function ImageInsertModal({
  open, onClose, onInsert, category, topic, hospitalName, defaultPromptHint, onRecommendPrompt,
}: ImageInsertModalProps) {
  const [tab, setTab] = useState<Tab>('library');
  // 라이브러리 state
  const [images, setImages] = useState<HospitalImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [tagFilter, setTagFilter] = useState<string>('전체');
  // AI 생성 state
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<ImageStyle>('photo');
  const [generating, setGenerating] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // 모달 열릴 때 기본 프롬프트 세팅 + 이미지 로드
  useEffect(() => {
    if (!open) return;
    const hint = (defaultPromptHint?.trim() || topic.trim()).slice(0, 60);
    setPrompt(hint);
    setAiError(null);
  }, [open, defaultPromptHint, topic]);

  useEffect(() => {
    if (!open || tab !== 'library') return;
    (async () => {
      setLoading(true);
      try {
        const { userId } = await getSessionSafe();
        const qs = new URLSearchParams({ limit: '200' });
        if (userId) qs.set('userId', userId);
        if (hospitalName) qs.set('hospitalName', hospitalName);
        const res = await authFetch(`/api/hospital-images?${qs.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setImages(Array.isArray(data) ? data : (data.images || []));
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [open, tab, hospitalName]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleSelectLibrary = useCallback((img: HospitalImage) => {
    if (!img.publicUrl) return;
    onInsert(img.publicUrl, img.altText || topic, undefined);
    onClose();
  }, [onInsert, onClose, topic]);

  const handleGenerate = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) { setAiError('프롬프트를 입력해주세요.'); return; }
    setGenerating(true);
    setAiError(null);
    try {
      const safeAlt = sanitizePromptInput(trimmed, 200);
      const safeTopic = sanitizePromptInput(topic || trimmed, 100);
      const safeHospital = hospitalName ? sanitizePromptInput(hospitalName, 100) : undefined;

      // buildImagePrompt 재활용 — 카테고리별 subject hint 자동 적용 (2-C 와 일관성)
      const body = {
        prompt: buildImagePrompt({
          altText: safeAlt,
          imageStyle: style,
          category: category || '치과',
          topic: safeTopic,
          hospitalName: safeHospital,
          customImagePrompt: undefined,
        }),
        aspectRatio: '4:3' as const,
        mode: 'blog' as const,
        imageStyle: style,
      };
      const res = await authFetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`생성 실패 (${res.status})`);
      const data = await res.json() as { imageDataUrl?: string };
      if (!data.imageDataUrl) throw new Error('이미지 데이터 없음');
      onInsert(data.imageDataUrl, trimmed, trimmed);
      onClose();
    } catch (err) {
      setAiError((err as Error).message || '생성 실패');
    } finally {
      setGenerating(false);
    }
  }, [prompt, style, category, hospitalName, onInsert, onClose]);

  const handleRecommend = useCallback(async () => {
    if (!onRecommendPrompt || recommending) return;
    setRecommending(true);
    setAiError(null);
    try {
      const hint = prompt.trim() || defaultPromptHint?.trim() || topic.trim();
      const recommended = await onRecommendPrompt(hint);
      if (recommended) setPrompt(recommended);
    } catch (err) {
      setAiError('추천 실패: ' + ((err as Error).message || 'unknown'));
    } finally {
      setRecommending(false);
    }
  }, [onRecommendPrompt, prompt, defaultPromptHint, topic, recommending]);

  if (!open) return null;

  const filteredImages = tagFilter === '전체'
    ? images
    : images.filter(img => (img.tags || []).includes(tagFilter));

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="text-base font-black text-slate-900">📎 이미지 삽입</div>
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-black bg-slate-100 hover:bg-slate-200">✕</button>
        </div>
        {/* 탭 */}
        <div className="flex border-b border-slate-200">
          <button type="button" onClick={() => setTab('library')}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${tab === 'library' ? 'text-blue-600 border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-700'}`}>
            📚 라이브러리
          </button>
          <button type="button" onClick={() => setTab('ai')}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${tab === 'ai' ? 'text-purple-600 border-b-2 border-purple-500' : 'text-slate-500 hover:text-slate-700'}`}>
            🤖 AI 생성
          </button>
        </div>
        {/* 컨텐츠 */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'library' ? (
            <div className="p-4">
              {/* 태그 필터 */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                <button type="button" onClick={() => setTagFilter('전체')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${tagFilter === '전체' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  전체
                </button>
                {IMAGE_TAG_PRESETS.map(t => (
                  <button key={t} type="button" onClick={() => setTagFilter(t)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${tagFilter === t ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {t}
                  </button>
                ))}
              </div>
              {/* 이미지 그리드 */}
              {loading ? (
                <div className="text-center py-12 text-sm text-slate-500">이미지 불러오는 중...</div>
              ) : filteredImages.length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-500">
                  {tagFilter === '전체'
                    ? (hospitalName ? `${hospitalName} 이미지가 없습니다. 이미지 라이브러리에서 업로드하세요.` : '등록된 이미지가 없습니다. 먼저 이미지 라이브러리에 업로드하세요.')
                    : `"${tagFilter}" 태그 이미지가 없습니다.`}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {filteredImages.map(img => (
                    <button key={img.id} type="button" onClick={() => handleSelectLibrary(img)}
                      className="group relative aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 hover:border-blue-500 hover:shadow-lg transition-all">
                      <img src={img.publicUrl} alt={img.altText} className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="flex flex-wrap gap-0.5">
                          {(img.tags || []).slice(0, 2).map(t => (
                            <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/90 text-slate-700">{t}</span>
                          ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">프롬프트</label>
                  {onRecommendPrompt && (
                    <button type="button" onClick={handleRecommend} disabled={recommending}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-violet-100 text-violet-600 hover:bg-violet-200 disabled:opacity-50 transition-colors flex items-center gap-1">
                      {recommending ? (
                        <><span className="inline-block w-3 h-3 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" /> 추천 중...</>
                      ) : <>✨ 추천받기</>}
                    </button>
                  )}
                </div>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                  rows={3} maxLength={500}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="이미지 설명 (예: 치과 의료진이 환자에게 설명하는 장면)" />
                <div className="text-[11px] text-slate-400 mt-1">{prompt.length}/500자 · 한국어/영문 OK</div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">스타일</label>
                <div className="flex gap-2">
                  {(['photo', 'illustration', 'medical'] as ImageStyle[]).map(s => (
                    <button key={s} type="button" onClick={() => setStyle(s)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${style === s ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {s === 'photo' ? '실사' : s === 'illustration' ? '일러스트' : '의학'}
                    </button>
                  ))}
                </div>
              </div>
              {aiError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg">{aiError}</div>
              )}
              <button type="button" onClick={handleGenerate} disabled={generating || !prompt.trim()}
                className="w-full py-3 bg-purple-500 text-white font-bold rounded-xl hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                {generating ? '생성 중...' : '✨ 생성하기'}
              </button>
              <div className="text-[11px] text-slate-400">
                AI 생성은 약 10~30초 소요됩니다. 완료되면 자동 삽입.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
