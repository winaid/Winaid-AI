'use client';

/**
 * 의료광고법 위반 override 모달 — 4 다운로드 경로 (PNG/JPG/ZIP/PDF) + Shorts 공통.
 *
 * ADR-2 (docs/decisions/CARDNEWS_HARDBLOCK_UX.md) Option B 채택:
 *   - 위반 N건 발견 → 모달 노출
 *   - "수정하기" 클릭 → 닫고 편집 모드 (사용자 직접 수정)
 *   - "동의하고 다운로드" 클릭 → server에 토큰 요청 → 토큰 동봉 후 다운로드
 *
 * 절대 규칙:
 *   - 위반 없으면 모달 자체를 띄우지 않음 (호출부에서 위반 0 시 직접 다운로드)
 *   - violation_text 길이 200자 절단 (PII 누설 방지) — server 도 재절단
 *   - Esc / 배경 클릭 닫기 = "수정하기" 와 동일 (다운로드 안 함)
 *
 * 호출부는 단일 `useMedicalAdOverride` hook 으로 4 경로 재사용 (DRY).
 */

import React, { useEffect } from 'react';
import type { SlideFieldViolation } from '../lib/medicalAdValidation';
import { CATEGORY_LABELS } from '../lib/medicalAdValidation';

export type DownloadPath = 'png' | 'jpg' | 'zip' | 'pdf' | 'shorts';

const PATH_LABELS: Record<DownloadPath, string> = {
  png: 'PNG 이미지',
  jpg: 'JPG 이미지',
  zip: 'ZIP (전체 PNG)',
  pdf: 'PDF 문서',
  shorts: '쇼츠 영상 (MP4)',
};

interface Props {
  open: boolean;
  /** 검증 결과 — 빈 배열이면 호출하지 말 것 (호출부 책임) */
  fieldViolations: SlideFieldViolation[];
  /** 어떤 경로 다운로드인지 — 모달 카피 + 운영 로그 분류 */
  downloadPath: DownloadPath;
  /** "수정하기" 또는 닫기 — 다운로드 진행 안 함 */
  onCancel: () => void;
  /** "동의하고 다운로드" — 호출부가 토큰 요청 + 실제 다운로드 수행 */
  onConfirm: () => void;
  /** 동의 처리 진행 중 (토큰 발급 대기) — 버튼 disabled */
  busy?: boolean;
  /** 토큰 발급/다운로드 실패 시 메시지 */
  error?: string | null;
}

const VIOLATION_TEXT_PREVIEW_MAX = 80; // UI 미리보기 — 200자 절단보다 짧게

export const MedicalAdOverrideModal: React.FC<Props> = ({
  open,
  fieldViolations,
  downloadPath,
  onCancel,
  onConfirm,
  busy,
  error,
}) => {
  // Esc 키 = 취소
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, busy, onCancel]);

  if (!open) return null;

  // 통계 — high/medium 카운트 + 카테고리별 요약
  let highCount = 0;
  let mediumCount = 0;
  const categoryCount: Record<string, number> = {};
  for (const fv of fieldViolations) {
    for (const v of fv.violations) {
      if (v.severity === 'high') highCount++;
      else mediumCount++;
      categoryCount[v.category] = (categoryCount[v.category] || 0) + 1;
    }
  }
  const totalCount = highCount + mediumCount;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="medical-ad-override-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-slate-200 bg-red-50">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">⚠️</span>
            <div>
              <h2
                id="medical-ad-override-title"
                className="text-lg font-bold text-red-700"
              >
                의료광고법 위반 가능성 발견
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                {PATH_LABELS[downloadPath]} 다운로드 — {totalCount}건 검출
                {highCount > 0 && (
                  <>
                    {' '}
                    (<span className="font-bold text-red-600">중대 {highCount}</span>
                    {mediumCount > 0 && `, 주의 ${mediumCount}`})
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* 본문 — 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* 면책 안내 — 약관/책임 명시 */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-sm text-slate-700 leading-relaxed">
              <strong className="text-amber-700">의료법 §56 위반 가능성</strong>이 검출된
              표현이 포함되어 있습니다. 다운로드를 강행할 경우 게시·유포의 책임은
              <strong className="text-amber-700"> 사용자 본인에게 있으며</strong>,
              본 서비스는 검증 결과를 명시적으로 안내드린 사실을 운영 로그에 기록합니다.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              ※ 의료광고는 사전 자율심의 대상일 수 있습니다 (인터넷신문/SNS 도달자 수 기준).
              게시 전 의료광고 자율심의 또는 변호사 검토를 권장합니다.
            </p>
          </div>

          {/* 위반 카테고리 요약 */}
          {Object.keys(categoryCount).length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                검출 항목 요약
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(categoryCount).map(([cat, n]) => (
                  <span
                    key={cat}
                    className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[11px] font-bold"
                  >
                    {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] || cat} · {n}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 위반 항목 상세 + 수정 권고 */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
              상세 (수정 권고 포함)
            </h3>
            <ul className="space-y-2">
              {fieldViolations.slice(0, 12).map((fv, i) => (
                <li
                  key={i}
                  className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50"
                >
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-500">
                      {fv.fieldLabel}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {fv.text.length > VIOLATION_TEXT_PREVIEW_MAX
                        ? `${fv.text.slice(0, VIOLATION_TEXT_PREVIEW_MAX)}…`
                        : fv.text}
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {fv.violations.map((v, j) => (
                      <li key={j} className="flex items-start gap-2 text-xs">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                            v.severity === 'high'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {v.severity === 'high' ? '중대' : '주의'}
                        </span>
                        <span className="text-slate-700">
                          <span className="font-bold">‘{v.keyword}’</span>
                          {' → '}
                          <span className="text-emerald-700">{v.suggestion}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {fieldViolations.length > 12 && (
                <li className="text-[11px] text-slate-400 italic px-3">
                  …외 {fieldViolations.length - 12}개 필드 — 편집 화면에서 전체 확인
                </li>
              )}
            </ul>
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* 푸터 — 양자택일 */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-[10px] text-slate-500">
            동의 시 사용자 ID · 다운로드 경로 · 위반 카테고리가 운영 로그에 기록됩니다.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50"
            >
              수정하기
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? '확인 중…' : '동의하고 다운로드'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
