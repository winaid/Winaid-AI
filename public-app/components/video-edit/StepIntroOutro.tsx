'use client';

import { useRef } from 'react';
import type { PipelineState, StepIntroState, IntroStyle, OutroStyle, HospitalInfo } from './types';
import VideoPlayer from './VideoPlayer';

const INTRO_OPTIONS: { id: IntroStyle; label: string; desc: string }[] = [
  { id: 'default', label: '기본 템플릿', desc: '병원 로고 + 이름 + 3초 페이드인' },
  { id: 'simple', label: '심플', desc: '병원 이름만 텍스트 + 1초' },
  { id: 'none', label: '없음', desc: '인트로 생략' },
];

const OUTRO_OPTIONS: { id: OutroStyle; label: string; desc: string }[] = [
  { id: 'default', label: '기본 템플릿', desc: '로고 + 전화번호 + 예약링크 + 3초' },
  { id: 'simple', label: '심플', desc: '전화번호 + "예약은 프로필 링크" + 2초' },
  { id: 'cta', label: 'CTA', desc: '"지금 전화주세요!" + 전화번호 + 3초' },
  { id: 'none', label: '없음', desc: '아웃로 생략' },
];

interface Props {
  state: PipelineState;
  onUpdate: (patch: Partial<StepIntroState>) => void;
  onUpdateHospital: (patch: Partial<HospitalInfo>) => void;
  onProcess: () => Promise<void>;
  onNext: () => void;
  onPrev: () => void;
  isProcessing: boolean;
  progress: string;
}

export default function StepIntroOutro({ state, onUpdate, onUpdateHospital, onProcess, onNext, onPrev, isProcessing, progress }: Props) {
  const { step8_intro: intro } = state;
  const hasResult = !!intro.resultBlobUrl || (intro.introStyle === 'none' && intro.outroStyle === 'none');
  const needsHospital = intro.introStyle !== 'none' || intro.outroStyle !== 'none';
  const logoInputRef = useRef<HTMLInputElement>(null);

  const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all';

  // 로고 업로드
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onUpdateHospital({ logoUrl: reader.result as string });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* 둘 다 없음 */}
      {intro.introStyle === 'none' && intro.outroStyle === 'none' && !intro.resultBlobUrl && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
          <div className="text-sm text-slate-500">인트로/아웃로 없이 진행합니다.</div>
        </div>
      )}

      {/* 결과 */}
      {intro.resultBlobUrl && (
        <div className="space-y-3">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
              <span>✅</span> 인트로/아웃로 삽입 완료
            </div>
          </div>
          <VideoPlayer src={intro.resultBlobUrl} compact />
        </div>
      )}

      {/* 옵션 */}
      {!hasResult && (
        <div className="space-y-5">
          {/* 인트로 */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-500">인트로</label>
            <div className="space-y-1.5">
              {INTRO_OPTIONS.map(opt => (
                <button key={opt.id} type="button" onClick={() => onUpdate({ introStyle: opt.id })}
                  className={`w-full p-3 rounded-xl border-2 text-left transition-all ${intro.introStyle === opt.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}>
                  <div className={`text-sm font-bold ${intro.introStyle === opt.id ? 'text-blue-700' : 'text-slate-700'}`}>{opt.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 아웃로 */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-500">아웃로</label>
            <div className="space-y-1.5">
              {OUTRO_OPTIONS.map(opt => (
                <button key={opt.id} type="button" onClick={() => onUpdate({ outroStyle: opt.id })}
                  className={`w-full p-3 rounded-xl border-2 text-left transition-all ${intro.outroStyle === opt.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}>
                  <div className={`text-sm font-bold ${intro.outroStyle === opt.id ? 'text-blue-700' : 'text-slate-700'}`}>{opt.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 병원 정보 입력 */}
          {needsHospital && (
            <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="block text-xs font-semibold text-slate-500">병원 정보</label>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">병원명 *</label>
                <input type="text" value={intro.hospital.name} placeholder="예: 강남연세치과"
                  onChange={e => onUpdateHospital({ name: e.target.value })} className={inputCls} />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">전화번호</label>
                <input type="text" value={intro.hospital.phone || ''} placeholder="02-XXX-XXXX"
                  onChange={e => onUpdateHospital({ phone: e.target.value })} className={inputCls} />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">한 줄 소개</label>
                <input type="text" value={intro.hospital.desc || ''} placeholder="강남역 3번출구 임플란트 전문"
                  onChange={e => onUpdateHospital({ desc: e.target.value })} className={inputCls} />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">예약 링크 / 안내 문구</label>
                <input type="text" value={intro.hospital.link || ''} placeholder="예약은 프로필 링크에서"
                  onChange={e => onUpdateHospital({ link: e.target.value })} className={inputCls} />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">로고 이미지</label>
                <div className="flex items-center gap-3">
                  {intro.hospital.logoUrl ? (
                    <div className="flex items-center gap-2">
                      <img src={intro.hospital.logoUrl} alt="logo" className="w-10 h-10 object-contain rounded-lg border border-slate-200" />
                      <button type="button" onClick={() => onUpdateHospital({ logoUrl: undefined })}
                        className="text-[10px] text-red-500 hover:text-red-700 font-bold">삭제</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => logoInputRef.current?.click()}
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-600 hover:border-blue-300">
                      📁 로고 업로드
                    </button>
                  )}
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </div>
              </div>

              {/* 정보 저장 체크박스 */}
              <label className="flex items-center gap-2 pt-2 cursor-pointer">
                <input type="checkbox" checked={intro.saveInfo}
                  onChange={e => onUpdate({ saveInfo: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-xs text-slate-600">이 정보를 저장해서 다음에도 사용</span>
              </label>
            </div>
          )}
        </div>
      )}

      {/* 액션 */}
      <div className="flex gap-3">
        <button type="button" onClick={onPrev}
          className="px-5 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm">
          ← 이전
        </button>
        {!hasResult ? (
          <button type="button" onClick={onProcess}
            disabled={isProcessing || (needsHospital && !intro.hospital.name.trim())}
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all text-sm flex items-center justify-center gap-2">
            {isProcessing ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{progress}</>) : '🎬 인트로/아웃로 삽입'}
          </button>
        ) : (
          <button type="button" onClick={onNext}
            className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all text-sm shadow-lg">
            🎬 완성 화면 보기
          </button>
        )}
      </div>
    </div>
  );
}
