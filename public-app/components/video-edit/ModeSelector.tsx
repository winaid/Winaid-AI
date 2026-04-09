'use client';

interface Props {
  onSelectVideo: () => void;
  onSelectAi: () => void;
}

export default function ModeSelector({ onSelectVideo, onSelectAi }: Props) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-black text-slate-800">어떤 방식으로 쇼츠를 만드시겠어요?</h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 촬영 영상 */}
        <button type="button" onClick={onSelectVideo}
          className="p-6 rounded-2xl border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all text-left group">
          <div className="text-3xl mb-3">📱</div>
          <div className="text-sm font-black text-slate-800 group-hover:text-blue-700">촬영 영상으로 만들기</div>
          <div className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
            핸드폰으로 찍은 영상을 업로드하면<br />
            AI가 쇼츠로 편집해드려요
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {['세로 크롭', '자막', 'BGM'].map(t => (
              <span key={t} className="px-1.5 py-0.5 text-[9px] font-bold text-slate-400 bg-slate-100 rounded">{t}</span>
            ))}
          </div>
        </button>

        {/* AI 생성 */}
        <button type="button" onClick={onSelectAi}
          className="p-6 rounded-2xl border-2 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all text-left group relative overflow-hidden">
          <div className="absolute top-2 right-2 px-1.5 py-0.5 text-[8px] font-black text-white bg-indigo-500 rounded">NEW</div>
          <div className="text-3xl mb-3">🤖</div>
          <div className="text-sm font-black text-slate-800 group-hover:text-indigo-700">AI로 처음부터 만들기</div>
          <div className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
            키워드만 입력하면<br />
            AI가 대본+영상을 만들어요
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {['대본 생성', 'TTS', '이미지'].map(t => (
              <span key={t} className="px-1.5 py-0.5 text-[9px] font-bold text-indigo-400 bg-indigo-50 rounded">{t}</span>
            ))}
          </div>
        </button>
      </div>
    </div>
  );
}
