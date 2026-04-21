'use client';

import { useCallback, useRef, useState } from 'react';

interface ImageLibraryProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  userId?: string;
}

export default function ImageLibrary({ enabled, userId }: ImageLibraryProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (files: FileList | File[]) => {
    setUploading(true);
    const allFiles = Array.from(files).slice(0, 100);
    const total = allFiles.length;
    let done = 0;
    for (let batch = 0; batch < allFiles.length; batch += 5) {
      const chunk = allFiles.slice(batch, batch + 5);
      setUploadProgress(`업로드 중... (${done + 1}/${total})`);
      await Promise.all(chunk.map(async (file) => {
        try {
          const fd = new FormData();
          fd.append('file', file);
          if (userId) fd.append('userId', userId);
          const res = await fetch('/api/hospital-images/upload', { method: 'POST', body: fd });
          if (!res.ok) { done++; return; }
          const img = await res.json();
          done++;
          if (img.id && img.publicUrl) {
            // AI 자동 태깅 (백그라운드)
            fetch('/api/hospital-images/auto-tag', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageId: img.id, imageUrl: img.publicUrl }),
            }).catch(() => {});
          }
        } catch {
          done++;
        }
      }));
      if (batch + 5 < allFiles.length) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    setUploading(false);
    setUploadProgress('');
  }, [userId]);

  if (!enabled) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="p-3 bg-blue-50 rounded-lg text-[12px] text-blue-700 leading-relaxed">
        📸 글 내용에 맞는 이미지가 라이브러리에서 자동 배치됩니다.<br />
        매칭되지 않는 자리는 비워둡니다.
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {uploading ? uploadProgress : '+ 이미지 업로드'}
        </button>
        <a
          href="/image-library"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-blue-500 hover:underline"
        >
          📚 라이브러리 관리하기 →
        </a>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files || [])}
        />
      </div>
    </div>
  );
}
