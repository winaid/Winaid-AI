'use client';

/**
 * 최근 영상 — Supabase 영구 저장된 결과물 조회
 *
 * 표시 위치: video_edit 진입화면(ModeSelector 아래 또는 옆)
 * 조건: 로그인 사용자만 (게스트는 빈 배열 → 컴포넌트 자체가 렌더 안 됨)
 * 만료: 서버에서 expires_at > now() 필터 적용 (7일)
 */

import { useEffect, useState } from 'react';
import {
  listVideoHistory,
  deleteVideoFromHistory,
  type SavedVideo,
} from '../../lib/videoStorage';

export default function RecentVideos() {
  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listVideoHistory(10).then(v => {
      if (cancelled) return;
      setVideos(v);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleDelete = async (v: SavedVideo) => {
    if (deleting) return;
    if (typeof window !== 'undefined' && !window.confirm('이 영상을 삭제하시겠어요?')) return;
    setDeleting(v.id);
    const ok = await deleteVideoFromHistory(v.id, v.file_path);
    setDeleting(null);
    if (ok) {
      setVideos(prev => prev.filter(x => x.id !== v.id));
    }
  };

  // 로딩 중 또는 결과 없음 → 컴포넌트 자체 숨김 (게스트/Supabase 미설정 포함)
  if (loading) return null;
  if (videos.length === 0) return null;

  return (
    <div className="mt-6 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-600">📂 최근 영상</h3>
        <span className="text-[10px] text-slate-400">7일간 보관</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {videos.map(v => (
          <div key={v.id} className="bg-white rounded-lg border border-slate-200 p-2 hover:border-blue-300 hover:shadow-sm transition-all">
            {/* 9/16 미리보기 (썸네일은 추후, 지금은 video preload metadata) */}
            <div className="aspect-[9/16] bg-slate-100 rounded mb-1.5 overflow-hidden">
              <video
                src={v.file_url}
                preload="metadata"
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            </div>
            <p className="text-[10px] font-medium text-slate-700 truncate" title={v.file_name}>
              {v.file_name}
            </p>
            <p className="text-[9px] text-slate-400 tabular-nums">
              {fmtDate(v.created_at)} · {Math.round(v.duration)}초
            </p>
            <div className="flex gap-1 mt-1">
              <a
                href={v.file_url}
                download={v.file_name}
                className="flex-1 text-center text-[10px] py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-bold"
                title="다운로드"
              >
                📥
              </a>
              <button
                type="button"
                onClick={() => handleDelete(v)}
                disabled={deleting === v.id}
                className="text-[10px] py-1 px-2 bg-red-50 text-red-500 rounded hover:bg-red-100 font-bold disabled:opacity-40"
                title="삭제"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return '';
  }
}
