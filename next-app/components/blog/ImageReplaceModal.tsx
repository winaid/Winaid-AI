'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '../../lib/authFetch';
import type { HospitalImage } from '../../lib/hospitalImageService';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (image: HospitalImage) => void;
  currentImageUrl?: string;
}

export default function ImageReplaceModal({ open, onClose, onSelect, currentImageUrl }: Props) {
  const [images, setImages] = useState<HospitalImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const res = await authFetch('/api/hospital-images?limit=200');
        if (res.ok) {
          const data = await res.json();
          setImages(Array.isArray(data) ? data : (data.images || []));
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const filtered = filter
    ? images.filter(img =>
        (img.tags || []).some(t => t.includes(filter)) ||
        (img.altText || '').includes(filter) ||
        (img.aiDescription || '').includes(filter)
      )
    : images;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">📸 이미지 선택</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none" aria-label="닫기">×</button>
        </div>
        <div className="px-6 py-3 border-b border-slate-100">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="태그 또는 설명으로 검색..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-400 outline-none"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-center text-sm text-slate-400 py-12">불러오는 중...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-12">이미지가 없습니다.</p>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => { onSelect(img); onClose(); }}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${
                    currentImageUrl === img.publicUrl
                      ? 'border-blue-500 ring-2 ring-blue-200'
                      : 'border-slate-200 hover:border-blue-300'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.publicUrl} alt={img.altText || ''} className="w-full h-full object-cover" loading="lazy" />
                  {img.tags && img.tags.length > 0 && (
                    <span className="absolute top-1 left-1 text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                      {img.tags[0]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
