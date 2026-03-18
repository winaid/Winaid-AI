import React, { lazy, Suspense } from 'react';
import type { ContentTabType } from '../layout/Sidebar';

const PostHistory = lazy(() => import('../PostHistory'));
const ImageGenerator = lazy(() => import('../ImageGenerator'));
const ContentRefiner = lazy(() => import('../ContentRefiner'));

const PanelSkeleton = () => (
  <div className="rounded-2xl border border-slate-200/60 bg-white/80 p-6 animate-pulse">
    <div className="space-y-4">
      <div className="h-3 w-40 rounded-md bg-slate-200 animate-pulse" />
      <div className="h-32 w-full rounded-xl bg-slate-200" />
      <div className="h-3 w-2/3 rounded-md bg-slate-200 animate-pulse" />
      <div className="h-3 w-1/2 rounded-md bg-slate-200 animate-pulse" />
    </div>
  </div>
);

interface ToolWorkspaceProps {
  contentTab: ContentTabType;
  darkMode: boolean;
  onClose: () => void;
  onNavigate: (tab: ContentTabType) => void;
}

export function ToolWorkspace({ contentTab, darkMode, onClose, onNavigate }: ToolWorkspaceProps) {
  return (
    <div className="w-full">
      {contentTab === 'history' ? (
        <div className={`rounded-2xl border p-6 md:p-8 backdrop-blur-xl ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white/80 border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.06)]'}`}>
          <Suspense fallback={<PanelSkeleton />}>
            <PostHistory onClose={onClose} darkMode={darkMode} />
          </Suspense>
        </div>
      ) : contentTab === 'image' ? (
        <Suspense fallback={<PanelSkeleton />}>
          <ImageGenerator />
        </Suspense>
      ) : (
        <div className={`rounded-2xl border p-6 md:p-8 backdrop-blur-xl ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white/80 border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.06)]'}`}>
          <Suspense fallback={<PanelSkeleton />}>
            <ContentRefiner onClose={onClose} onNavigate={onNavigate} darkMode={darkMode} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
