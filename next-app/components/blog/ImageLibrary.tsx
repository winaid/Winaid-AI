'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HospitalImage } from '../../lib/hospitalImageService';
import { IMAGE_TAG_PRESETS } from '../../lib/hospitalImageService';

interface ImageLibraryProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  selectedImages: HospitalImage[];
  onSelectionChange: (images: HospitalImage[]) => void;
  maxImages: number;
  userId?: string;
}

export default function ImageLibrary({
  enabled, onToggle, selectedImages, onSelectionChange, maxImages, userId,
}: ImageLibraryProps) {
  const [images, setImages] = useState<HospitalImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const qs = tagFilter ? `?tags=${encodeURIComponent(tagFilter)}&limit=50` : '?limit=50';
      const res = await fetch(`/api/hospital-images${qs}`);
      if (res.ok) {
        const data = await res.json();
        setImages(data.images ?? []);
      }
    } catch { /* skip */ }
    finally { setLoading(false); }
  }, [tagFilter]);

  useEffect(() => {
    if (enabled) fetchImages();
  }, [enabled, fetchImages]);

  const handleUpload = useCallback(async (files: FileList | File[]) => {
    setUploading(true);
    for (const file of Array.from(files).slice(0, 5)) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        if (userId) fd.append('userId', userId);
        const res = await fetch('/api/hospital-images/upload', { method: 'POST', body: fd });
        if (!res.ok) continue;
        const img: HospitalImage = await res.json();
        // AI 자동 태깅
        if (img.publicUrl) {
          fetch('/api/hospital-images/auto-tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: img.publicUrl }),
          }).then(async (r) => {
            if (!r.ok) return;
            const tags = await r.json();
            if (tags.tags?.length || tags.altText) {
              await fetch(`/api/hospital-images/${img.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tags: tags.tags, altText: tags.altText }),
              });
              setImages((prev) => prev.map((i) =>
                i.id === img.id ? { ...i, tags: tags.tags || i.tags, altText: tags.altText || i.altText } : i,
              ));
            }
          }).catch(() => {});
        }
        setImages((prev) => [img, ...prev]);
      } catch { /* skip */ }
    }
    setUploading(false);
  }, []);

  const toggleSelect = useCallback((img: HospitalImage) => {
    const exists = selectedImages.find((s) => s.id === img.id);
    if (exists) {
      onSelectionChange(selectedImages.filter((s) => s.id !== img.id));
    } else if (selectedImages.length < maxImages) {
      onSelectionChange([...selectedImages, img]);
    }
  }, [selectedImages, maxImages, onSelectionChange]);

  const handleDelete = useCallback(async (id: string) => {
    await fetch(`/api/hospital-images/${id}`, { method: 'DELETE' });
    setImages((prev) => prev.filter((i) => i.id !== id));
    onSelectionChange(selectedImages.filter((s) => s.id !== id));
  }, [selectedImages, onSelectionChange]);

  const selectedIds = new Set(selectedImages.map((s) => s.id));
  const selectedOrder = new Map(selectedImages.map((s, i) => [s.id, i + 1]));
  const shortage = Math.max(0, maxImages - selectedImages.length);

  if (!enabled) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[13px] font-bold text-slate-700">📸 내 이미지 라이브러리</h4>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="text-[11px] border border-slate-200 rounded px-2 py-1"
        >
          <option value="">전체</option>
          {IMAGE_TAG_PRESETS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* 업로드 */}
      <div
        className="border-2 border-dashed border-slate-200 rounded-lg p-3 text-center hover:border-blue-300 transition-colors cursor-pointer"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
      >
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => e.target.files && handleUpload(e.target.files)} />
        {uploading
          ? <span className="text-[12px] text-blue-500 flex items-center justify-center gap-1">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" /> 업로드 중…
            </span>
          : <span className="text-[12px] text-slate-500">+ 이미지 업로드 (드래그 또는 클릭, 최대 5장)</span>
        }
      </div>

      {/* 그리드 */}
      {loading ? (
        <p className="text-[11px] text-slate-400 text-center py-4">불러오는 중…</p>
      ) : images.length === 0 ? (
        <p className="text-[11px] text-slate-400 text-center py-4">아직 업로드한 이미지가 없어요.</p>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
          {images.map((img) => {
            const isSelected = selectedIds.has(img.id);
            const order = selectedOrder.get(img.id);
            return (
              <div key={img.id} className="relative group">
                <button type="button" onClick={() => toggleSelect(img)}
                  className={`w-full aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                    isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300'
                  }`}>
                  <img src={img.publicUrl} alt={img.altText || ''} className="w-full h-full object-cover" loading="lazy" />
                  {isSelected && (
                    <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {order}
                    </div>
                  )}
                </button>
                <button type="button" onClick={() => handleDelete(img.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  aria-label="삭제">×</button>
                {img.tags.length > 0 && (
                  <p className="text-[9px] text-slate-400 truncate mt-0.5">{img.tags[0]}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 선택 상태 */}
      <div className="text-[11px] text-slate-500 flex items-center justify-between">
        <span>선택: <strong>{selectedImages.length}/{maxImages}</strong>장</span>
        {shortage > 0 && selectedImages.length > 0 && (
          <span className="text-blue-500">부족한 {shortage}장은 AI가 자동 생성합니다</span>
        )}
      </div>
    </div>
  );
}
