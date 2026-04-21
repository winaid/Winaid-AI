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
  hospitalName?: string;
  topic?: string;
  disease?: string;
  category?: string;
}

function extractRelatedTags(topic: string, disease?: string, category?: string): string[] {
  const text = `${topic} ${disease || ''} ${category || ''}`.toLowerCase();
  const tagMap: Record<string, string[]> = {
    '임플란트': ['임플란트', '수술', '의료진', '장비'],
    '교정': ['치아교정', '의료진', '상담'],
    '스케일링': ['스케일링', '진료실', '장비'],
    '충치': ['충치치료', '진료실'],
    '신경치료': ['신경치료', '진료실', '장비'],
    '미백': ['치아미백', '상담'],
    '사랑니': ['사랑니', '수술', '의료진'],
    '틀니': ['틀니', '의료진', '상담'],
    '라미네이트': ['라미네이트', '상담', '의료진'],
    '소아': ['소아치과', '상담'],
    '피부': ['의료진', '장비', '상담'],
    '정형': ['의료진', '장비', '진료실'],
  };
  for (const [keyword, tags] of Object.entries(tagMap)) {
    if (text.includes(keyword)) return [...tags, '병원내부'];
  }
  return ['일반', '병원내부', '의료진'];
}

export default function ImageLibrary({
  enabled, onToggle, selectedImages, onSelectionChange, maxImages, userId, hospitalName, topic, disease, category,
}: ImageLibraryProps) {
  const [images, setImages] = useState<HospitalImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (tagFilter) params.set('tags', tagFilter);
      if (hospitalName) params.set('hospitalName', hospitalName);
      const res = await fetch(`/api/hospital-images?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setImages(Array.isArray(data) ? data : (data.images ?? []));
      }
    } catch { /* skip */ }
    finally { setLoading(false); }
  }, [tagFilter, hospitalName]);

  useEffect(() => {
    if (enabled) fetchImages();
  }, [enabled, fetchImages]);

  // 주제 기반 자동 추천 선택
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (!enabled || images.length === 0 || maxImages === 0) return;
    if (autoSelectedRef.current && selectedImages.length > 0) return;
    const topicTags = extractRelatedTags(topic || '', disease, category);
    const scored = images.map(img => ({
      ...img,
      matchScore: img.tags.filter(t => topicTags.includes(t)).length,
    }));
    scored.sort((a, b) => b.matchScore - a.matchScore || (b.usageCount || 0) - (a.usageCount || 0));
    const auto = scored.slice(0, maxImages);
    if (auto.length > 0) {
      onSelectionChange(auto);
      autoSelectedRef.current = true;
    }
  }, [enabled, images, maxImages, topic, disease, category]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = useCallback(async (files: FileList | File[]) => {
    setUploading(true);
    const allFiles = Array.from(files).slice(0, 100);
    for (let batch = 0; batch < allFiles.length; batch += 5) {
      const chunk = allFiles.slice(batch, batch + 5);
      await Promise.all(chunk.map(async (file) => {
        try {
          const fd = new FormData();
          fd.append('file', file);
          if (userId) fd.append('userId', userId);
          if (hospitalName) fd.append('hospitalName', hospitalName);
          const res = await fetch('/api/hospital-images/upload', { method: 'POST', body: fd });
          if (!res.ok) return;
          const img: HospitalImage = await res.json();
          setImages((prev) => [img, ...prev]);
          if (img.publicUrl) {
            fetch('/api/hospital-images/auto-tag', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageId: img.id, imageUrl: img.publicUrl }),
            }).then(async (r) => {
              if (!r.ok) return;
              const tags = await r.json();
              if (tags.tags?.length || tags.altText) {
                setImages((prev) => prev.map((i) =>
                  i.id === img.id ? { ...i, tags: tags.tags || i.tags, altText: tags.altText || i.altText } : i,
                ));
              }
            }).catch(() => {});
          }
        } catch { /* skip */ }
      }));
    }
    setUploading(false);
  }, [userId, hospitalName]);

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
          : <span className="text-[12px] text-slate-500">+ 이미지 업로드 (드래그 또는 클릭, 최대 100장)</span>
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
