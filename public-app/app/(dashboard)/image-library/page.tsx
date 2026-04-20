'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { isSupabaseConfigured } from '../../../lib/supabase';
import { IMAGE_TAG_PRESETS, type HospitalImage } from '../../../lib/hospitalImageService';

type SortBy = 'newest' | 'most_used' | 'name';

export default function ImageLibraryPage() {
  const [images, setImages] = useState<HospitalImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [filterTag, setFilterTag] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [editImage, setEditImage] = useState<HospitalImage | null>(null);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editAlt, setEditAlt] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImages = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterTag) params.set('tags', filterTag);
      const res = await fetch(`/api/hospital-images?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as HospitalImage[];
      setImages(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filterTag]);

  useEffect(() => { loadImages(); }, [loadImages]);

  const sorted = [...images].sort((a, b) => {
    if (sortBy === 'most_used') return (b.usageCount || 0) - (a.usageCount || 0);
    if (sortBy === 'name') return (a.originalFilename || '').localeCompare(b.originalFilename || '');
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const total = files.length;
    let done = 0;

    for (const file of Array.from(files).slice(0, 10)) {
      setUploadProgress(`업로드 중... (${done + 1}/${total})`);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/hospital-images/upload', { method: 'POST', body: formData });
        if (!res.ok) continue;
        const uploaded = (await res.json()) as HospitalImage;

        setUploadProgress(`AI 태깅 중... (${done + 1}/${total})`);
        try {
          const tagRes = await fetch('/api/hospital-images/auto-tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageId: uploaded.id, imageUrl: uploaded.publicUrl }),
          });
          if (tagRes.ok) {
            const tagged = (await tagRes.json()) as HospitalImage;
            setImages(prev => [tagged, ...prev]);
          } else {
            setImages(prev => [uploaded, ...prev]);
          }
        } catch {
          setImages(prev => [uploaded, ...prev]);
        }
      } catch { /* skip failed */ }
      done++;
    }
    setUploading(false);
    setUploadProgress('');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 이미지를 삭제하시겠습니까?')) return;
    try {
      await fetch(`/api/hospital-images/${id}`, { method: 'DELETE' });
      setImages(prev => prev.filter(img => img.id !== id));
      if (editImage?.id === id) setEditImage(null);
    } catch { /* ignore */ }
  };

  const handleSaveEdit = async () => {
    if (!editImage) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/hospital-images/${editImage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: editTags, altText: editAlt }),
      });
      if (res.ok) {
        const updated = (await res.json()) as HospitalImage;
        setImages(prev => prev.map(img => img.id === updated.id ? updated : img));
        setEditImage(null);
      }
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleRetag = async () => {
    if (!editImage) return;
    setSaving(true);
    try {
      const res = await fetch('/api/hospital-images/auto-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: editImage.id, imageUrl: editImage.publicUrl }),
      });
      if (res.ok) {
        const updated = (await res.json()) as HospitalImage;
        setEditTags(updated.tags);
        setEditAlt(updated.altText);
        setImages(prev => prev.map(img => img.id === updated.id ? updated : img));
      }
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const openEdit = (img: HospitalImage) => {
    setEditImage(img);
    setEditTags([...img.tags]);
    setEditAlt(img.altText || '');
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
          <p className="text-lg font-bold text-slate-600 mb-2">📸 이미지 라이브러리</p>
          <p className="text-sm text-slate-400">Supabase 연결이 필요합니다.</p>
          <p className="text-xs text-slate-400 mt-1">.env.local에 NEXT_PUBLIC_SUPABASE_URL과 ANON_KEY를 설정하세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">📸 이미지 관리</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">총 {images.length}장</span>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all">
            {uploading ? uploadProgress : '+ 이미지 업로드'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => handleUpload(e.target.files)} />
        </div>
      </div>

      {/* 필터 + 정렬 */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFilterTag('')}
          className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${!filterTag ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
          전체
        </button>
        {IMAGE_TAG_PRESETS.map(tag => (
          <button key={tag} onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${filterTag === tag ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            {tag}
          </button>
        ))}
        <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}
          className="ml-auto text-[11px] px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-600">
          <option value="newest">최신순</option>
          <option value="most_used">사용 많은 순</option>
          <option value="name">이름순</option>
        </select>
      </div>

      {/* 드래그앤드롭 + 그리드 */}
      {loading ? (
        <div className="text-center py-20 text-slate-400 text-sm">로딩 중...</div>
      ) : sorted.length === 0 ? (
        <div
          className="border-2 border-dashed border-slate-300 rounded-2xl py-20 text-center cursor-pointer hover:border-blue-400 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-blue-400', 'bg-blue-50'); }}
          onDragLeave={e => { e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50'); }}
          onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50'); handleUpload(e.dataTransfer.files); }}
        >
          <p className="text-lg font-bold text-slate-500 mb-2">📸 이미지를 드래그하거나 클릭하여 업로드</p>
          <p className="text-sm text-slate-400">블로그에 활용할 이미지를 추가하세요</p>
          <p className="text-xs text-slate-400 mt-1">JPG, PNG, WebP (최대 10MB)</p>
        </div>
      ) : (
        <div
          className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
        >
          {sorted.map(img => (
            <div key={img.id} className="group relative rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-all">
              <div className="aspect-square relative">
                {img.publicUrl ? (
                  <img src={img.publicUrl} alt={img.altText || ''} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400 text-2xl">📷</div>
                )}
                {/* hover 오버레이 */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button onClick={() => openEdit(img)} className="w-9 h-9 bg-white rounded-full flex items-center justify-center text-sm hover:bg-blue-50 transition-colors" title="편집">✏️</button>
                  <button onClick={() => handleDelete(img.id)} className="w-9 h-9 bg-white rounded-full flex items-center justify-center text-sm hover:bg-red-50 transition-colors" title="삭제">🗑</button>
                </div>
              </div>
              <div className="p-2">
                <div className="flex flex-wrap gap-1 mb-1">
                  {img.tags.slice(0, 2).map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-semibold">{tag}</span>
                  ))}
                  {img.tags.length > 2 && (
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px]">+{img.tags.length - 2}</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">{img.usageCount || 0}회 사용</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 편집 모달 */}
      {editImage && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setEditImage(null)} />
          <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[600px] md:max-h-[80vh] bg-white rounded-2xl shadow-2xl z-50 overflow-y-auto">
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800">이미지 편집</h2>
                <button onClick={() => setEditImage(null)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
              </div>

              {/* 미리보기 */}
              {editImage.publicUrl && (
                <img src={editImage.publicUrl} alt={editAlt} className="w-full max-h-64 object-contain rounded-xl bg-slate-50" />
              )}

              {/* 태그 편집 */}
              <div>
                <label className="text-xs font-bold text-slate-600 mb-2 block">태그</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {editTags.map(tag => (
                    <button key={tag} onClick={() => setEditTags(prev => prev.filter(t => t !== tag))}
                      className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-[11px] font-semibold hover:bg-red-100 hover:text-red-600 transition-colors">
                      {tag} ✕
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {IMAGE_TAG_PRESETS.filter(t => !editTags.includes(t)).map(tag => (
                    <button key={tag} onClick={() => setEditTags(prev => [...prev, tag])}
                      className="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] hover:bg-blue-50 hover:text-blue-600 transition-colors">
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alt 텍스트 */}
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">Alt 텍스트</label>
                <input type="text" value={editAlt} onChange={e => setEditAlt(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" />
              </div>

              {/* AI 설명 */}
              {editImage.aiDescription && (
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">AI 설명</label>
                  <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl">{editImage.aiDescription}</p>
                </div>
              )}

              {/* 파일 정보 */}
              <div className="text-[10px] text-slate-400 space-y-0.5">
                {editImage.originalFilename && <p>파일: {editImage.originalFilename}</p>}
                {editImage.fileSize && <p>크기: {(editImage.fileSize / 1024).toFixed(0)} KB</p>}
                {editImage.width && editImage.height && <p>해상도: {editImage.width} × {editImage.height}</p>}
                <p>업로드: {new Date(editImage.createdAt).toLocaleDateString('ko-KR')}</p>
                <p>사용: {editImage.usageCount || 0}회</p>
              </div>

              {/* 버튼 */}
              <div className="flex gap-2 pt-2">
                <button onClick={handleRetag} disabled={saving}
                  className="px-3 py-2 text-xs font-semibold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 disabled:opacity-50 transition-all">
                  🔄 AI 태그 재분석
                </button>
                <div className="flex-1" />
                <button onClick={() => handleDelete(editImage.id)}
                  className="px-3 py-2 text-xs font-semibold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-all">
                  삭제
                </button>
                <button onClick={handleSaveEdit} disabled={saving}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all">
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
