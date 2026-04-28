'use client';

/**
 * BrandPresetEditor — 병원별 시각 브랜드 프리셋 편집 UI
 *
 * 저장소: Supabase `hospital_style_profiles.brand_preset` JSONB 컬럼
 * 데이터 계약: `lib/brandPreset.ts` 의 `BrandPreset` 인터페이스
 *
 * 동작:
 *  1. 마운트 시 `getBrandPreset(hospitalName)` 호출해 서버 프리셋 로드
 *     - 없으면 `DEFAULT_BRAND_PRESET` 으로 초기화
 *     - 로드 성공 시 `onPresetLoaded(preset)` 콜백으로 상위에 알림
 *  2. 색상/폰트/톤/로고 편집
 *  3. 저장 버튼 → `saveBrandPreset(hospitalName, preset)` 호출
 *     - 성공/실패 인라인 피드백
 *
 * 로고 처리:
 *  - 클라이언트 사이드 리사이즈 (max 256×256, JPEG 80%)
 *  - 목표: JSONB row 크기 과대화 방지 (대략 100KB 이하)
 *  - ObjectURL 은 즉시 revoke — blob 누수 방지
 *
 * 호출부가 지켜야 할 것:
 *  - `hospitalName` 이 비어 있으면 본 컴포넌트는 렌더되지만 조회/저장
 *    버튼이 비활성화된다. (상위 UI 에서 병원명 입력을 유도할 것.)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_BRAND_PRESET,
  type BrandPreset,
  type BrandColors,
  type BrandTone,
} from '@winaid/blog-core';
import { getBrandPreset, saveBrandPreset } from '../../lib/styleService';

interface BrandPresetEditorProps {
  hospitalName: string;
  /** 서버에서 프리셋이 로드되거나 저장된 직후 호출. 상위의 proTheme 동기화용. */
  onPresetLoaded?: (preset: BrandPreset) => void;
}

// ── 상수 ──

const COLOR_FIELDS: Array<{ key: keyof BrandColors; label: string }> = [
  { key: 'primary', label: '메인 컬러' },
  { key: 'secondary', label: '보조 컬러' },
  { key: 'background', label: '배경색' },
  { key: 'accent', label: '강조색' },
  { key: 'text', label: '텍스트 색상' },
];

/**
 * 한국어 웹폰트 드롭다운 옵션.
 * value 는 CSS font-family 에 실릴 이름으로, Pretendard Variable / 기본 fallback 포함.
 */
const FONT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'Pretendard', label: 'Pretendard (기본)' },
  { value: 'Noto Sans KR', label: 'Noto Sans KR' },
  { value: 'Nanum Gothic', label: '나눔 고딕' },
  { value: 'Nanum Myeongjo', label: '나눔 명조' },
  { value: 'IBM Plex Sans KR', label: 'IBM Plex Sans KR' },
  { value: 'Gowun Dodum', label: '고운 도담' },
  { value: 'Gowun Batang', label: '고운 바탕' },
  { value: 'Do Hyeon', label: '도현체 (임팩트)' },
  { value: 'Black Han Sans', label: '블랙 한 산스 (임팩트)' },
];

const TONE_OPTIONS: Array<{ value: BrandTone; label: string; desc: string }> = [
  { value: 'empathy', label: '공감형', desc: '환자 감정에 공감하는 부드러운 톤' },
  { value: 'expert', label: '전문가형', desc: '신뢰감 있는 정보 중심 톤' },
  { value: 'friendly', label: '친근형', desc: '편안하고 다가가기 쉬운 톤' },
  { value: 'premium', label: '프리미엄형', desc: '고급스럽고 간결한 톤' },
];

// ── 유틸: 로고 리사이즈 (외부 의존 없이 canvas API 로만) ──

async function resizeLogo(file: File, maxSize = 256): Promise<string> {
  // 이미지 타입만 허용
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 업로드할 수 있습니다.');
  }
  // 파일 자체 크기도 1차 컷 (지나치게 큰 원본 거절)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('이미지가 너무 큽니다. 5MB 이하 파일만 업로드해주세요.');
  }
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('브라우저가 canvas 를 지원하지 않습니다.'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('이미지 처리 중 오류가 발생했습니다.'));
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('이미지를 불러올 수 없습니다.'));
    };
    img.src = objectUrl;
  });
}

// ── 컴포넌트 ──

export default function BrandPresetEditor({ hospitalName, onPresetLoaded }: BrandPresetEditorProps) {
  const [preset, setPreset] = useState<BrandPreset>(DEFAULT_BRAND_PRESET);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trimmedName = hospitalName.trim();
  const hasHospital = trimmedName.length > 0;

  // 마운트 / 병원명 변경 시 서버에서 로드. loadedKey 로 중복 호출 차단.
  const loadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasHospital) {
      loadedKeyRef.current = null;
      return;
    }
    if (loadedKeyRef.current === trimmedName) return;
    let cancelled = false;
    setLoading(true);
    loadedKeyRef.current = trimmedName;
    getBrandPreset(trimmedName)
      .then((saved) => {
        if (cancelled) return;
        if (saved) {
          setPreset(saved);
          onPresetLoaded?.(saved);
        } else {
          setPreset(DEFAULT_BRAND_PRESET);
        }
      })
      .catch(() => { /* 조용히 무시 — 기본값 유지 */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // onPresetLoaded 는 참조 변경만으로 재로딩이 일어나지 않도록 의존성에서 제외.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedName, hasHospital]);

  // ── 색상 개별 변경 ──
  const updateColor = (key: keyof BrandColors, value: string) => {
    setPreset(prev => ({ ...prev, colors: { ...prev.colors, [key]: value } }));
    setFeedback(null);
  };

  // ── 폰트 변경 ──
  const updateFont = (value: string) => {
    setPreset(prev => ({ ...prev, typography: { fontFamily: value } }));
    setFeedback(null);
  };

  // ── 톤 변경 ──
  const updateTone = (value: BrandTone) => {
    setPreset(prev => ({ ...prev, tone: value }));
    setFeedback(null);
  };

  // ── 로고 업로드 ──
  const handleLogoFile = useCallback(async (file: File) => {
    setLogoProcessing(true);
    setFeedback(null);
    try {
      const dataUrl = await resizeLogo(file, 256);
      setPreset(prev => ({ ...prev, logo: { dataUrl } }));
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : '로고 처리 실패' });
    } finally {
      setLogoProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const removeLogo = () => {
    setPreset(prev => ({ ...prev, logo: null }));
    setFeedback(null);
  };

  const resetToDefault = () => {
    setPreset(DEFAULT_BRAND_PRESET);
    setFeedback({ type: 'ok', msg: '기본값으로 되돌렸습니다. 저장해야 적용됩니다.' });
  };

  // ── 저장 ──
  const handleSave = async () => {
    if (!hasHospital || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const ok = await saveBrandPreset(trimmedName, preset);
      if (ok) {
        setFeedback({ type: 'ok', msg: '브랜드 프리셋이 저장되었습니다.' });
        onPresetLoaded?.(preset);
      } else {
        setFeedback({ type: 'err', msg: '저장에 실패했습니다. 로그인 상태와 네트워크를 확인해주세요.' });
      }
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : '저장 중 오류' });
    } finally {
      setSaving(false);
    }
  };

  // ── 렌더 ──
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5" data-testid="brand-preset-editor">
      {/* 병원명 미입력 안내 */}
      {!hasHospital && (
        <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
          ⚠ 병원명을 먼저 입력해주세요. 프리셋은 병원명 단위로 저장됩니다.
        </div>
      )}

      {/* 색상 5개 */}
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-2">색상 팔레트</label>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {COLOR_FIELDS.map(({ key, label }) => (
            <div key={key} className="flex flex-col items-start gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500">{label}</span>
              <div className="flex items-center gap-2 w-full">
                <input
                  type="color"
                  value={preset.colors[key]}
                  onChange={e => updateColor(key, e.target.value)}
                  disabled={!hasHospital || loading}
                  aria-label={label}
                  className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer disabled:opacity-50"
                />
                <input
                  type="text"
                  value={preset.colors[key]}
                  onChange={e => updateColor(key, e.target.value)}
                  disabled={!hasHospital || loading}
                  className="flex-1 min-w-0 px-2 py-1 text-[11px] font-mono rounded border border-slate-200 focus:outline-none focus:border-blue-400 disabled:opacity-50"
                  maxLength={7}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 폰트 선택 */}
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-2">기본 폰트</label>
        <select
          value={preset.typography.fontFamily}
          onChange={e => updateFont(e.target.value)}
          disabled={!hasHospital || loading}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white disabled:opacity-50"
        >
          {FONT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* 톤 선택 */}
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-2">브랜드 톤</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TONE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateTone(opt.value)}
              disabled={!hasHospital || loading}
              className={`text-left px-3 py-2 rounded-lg border-2 transition-all disabled:opacity-50 ${
                preset.tone === opt.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
              aria-pressed={preset.tone === opt.value}
            >
              <div className="text-xs font-bold text-slate-800">{opt.label}</div>
              <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 로고 */}
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-2">로고 이미지</label>
        <div className="flex items-center gap-3">
          {preset.logo?.dataUrl ? (
            <img
              src={preset.logo.dataUrl}
              alt="브랜드 로고"
              className="w-16 h-16 rounded-lg border border-slate-200 object-contain bg-white"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-400">
              로고 없음
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!hasHospital || loading || logoProcessing}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
            >
              {logoProcessing ? '처리 중...' : preset.logo ? '변경' : '업로드'}
            </button>
            {preset.logo && (
              <button
                type="button"
                onClick={removeLogo}
                disabled={!hasHospital || loading}
                className="px-3 py-1.5 text-xs text-red-500 font-semibold rounded-lg border border-red-100 hover:bg-red-50 disabled:opacity-50"
              >
                삭제
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleLogoFile(f); }}
          />
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5">
          자동으로 256×256 크기에 JPEG 80% 품질로 압축됩니다.
        </p>
      </div>

      {/* 피드백 */}
      {feedback && (
        <div className={`text-xs px-3 py-2 rounded-lg ${
          feedback.type === 'ok'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          {feedback.msg}
        </div>
      )}

      {/* 저장/초기화 */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasHospital || loading || saving}
          className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-sm shadow-blue-200 transition-all"
        >
          {saving ? '저장 중...' : '브랜드 프리셋 저장'}
        </button>
        <button
          type="button"
          onClick={resetToDefault}
          disabled={!hasHospital || loading || saving}
          className="px-4 py-2.5 text-sm font-semibold text-slate-500 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
        >
          기본값
        </button>
      </div>
      {loading && <p className="text-[11px] text-slate-400 text-center">로드 중...</p>}
    </div>
  );
}
