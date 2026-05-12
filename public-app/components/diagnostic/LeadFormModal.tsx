'use client';

import { useEffect, useState } from 'react';
import {
  isValidPhone,
  type LeadSource,
  type LeadSubmitBody,
  LEAD_SOURCE_LABEL,
} from '../../lib/diagnostic/leadTypes';

interface LeadFormModalProps {
  open: boolean;
  onClose: () => void;
  source: LeadSource;
  /** 자동 첨부될 진단 데이터 (있으면). */
  diagnosticUrl?: string;
  diagnosticScore?: number;
  diagnosticToken?: string;
  /** 로그인 사용자의 이름·이메일 (있으면 자동 채움). */
  defaultContactName?: string;
  /** 폼 제출 직후 호출. 호출 후 모달은 자동 닫힘 (성공 토스트는 부모에서). */
  onSubmitted?: () => void;
}

type Phase = 'editing' | 'submitting' | 'success' | 'error';

/**
 * 리드 폼 모달.
 * 필드: 병원명 / 담당자명 / 연락처 / 메시지(선택)
 * Honeypot: company_website (CSS hidden) — 봇 채우면 서버에서 silent 200 (드롭).
 * 모바일: max-w-md + max-h-screen, overflow-y-auto.
 */
export default function LeadFormModal({
  open,
  onClose,
  source,
  diagnosticUrl,
  diagnosticScore,
  diagnosticToken,
  defaultContactName,
  onSubmitted,
}: LeadFormModalProps) {
  const [phase, setPhase] = useState<Phase>('editing');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [hospitalName, setHospitalName] = useState('');
  const [contactName, setContactName] = useState(defaultContactName ?? '');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState(''); // 봇 트랩

  // open 변화 시 폼 초기화
  useEffect(() => {
    if (open) {
      setPhase('editing');
      setErrorMsg('');
      setHospitalName('');
      setContactName(defaultContactName ?? '');
      setPhone('');
      setMessage('');
      setHoneypot('');
    }
  }, [open, defaultContactName]);

  // ESC 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'submitting') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, phase, onClose]);

  if (!open) return null;

  const phoneValid = isValidPhone(phone);
  const canSubmit =
    phase === 'editing' &&
    hospitalName.trim().length > 0 &&
    contactName.trim().length > 0 &&
    phoneValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setPhase('submitting');
    setErrorMsg('');
    try {
      const body: LeadSubmitBody = {
        hospitalName: hospitalName.trim(),
        contactName: contactName.trim(),
        phone: phone.trim(),
        message: message.trim() || undefined,
        source,
        diagnosticUrl,
        diagnosticScore,
        diagnosticToken,
        company_website: honeypot || undefined,
      };
      const res = await fetch('/api/diagnostic/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMsg(data.error || `요청 실패 (HTTP ${res.status})`);
        setPhase('error');
        return;
      }
      setPhase('success');
      onSubmitted?.();
      setTimeout(() => onClose(), 1800);
    } catch (e) {
      setErrorMsg((e as Error)?.message || '요청 중 오류가 발생했습니다.');
      setPhase('error');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={() => phase !== 'submitting' && onClose()}
    >
      <div
        className="w-full max-w-md max-h-[95vh] overflow-y-auto rounded-2xl bg-white shadow-xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-modal-title"
      >
        {phase === 'success' ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">접수되었습니다</h2>
            <p className="text-sm text-slate-500">
              빠른 시일 내에 입력하신 연락처로 연락드리겠습니다.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="lead-modal-title" className="text-base font-black text-slate-800">
                  🏥 무료 상담 신청
                </h2>
                <p className="mt-1 text-[11px] text-slate-400">
                  진단 결과를 바탕으로 마케팅 전문가가 1:1 컨설팅을 드립니다.
                </p>
                <p className="mt-0.5 text-[10px] text-slate-300">
                  유입: {LEAD_SOURCE_LABEL[source]}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={phase === 'submitting'}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none disabled:opacity-40"
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  병원명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  placeholder="예: 강남 OO 치과"
                  maxLength={200}
                  required
                  disabled={phase === 'submitting'}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  담당자명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="예: 홍길동 원장"
                  maxLength={100}
                  required
                  disabled={phase === 'submitting'}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  연락처 <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010-1234-5678"
                  inputMode="tel"
                  maxLength={20}
                  required
                  disabled={phase === 'submitting'}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
                    phone && !phoneValid
                      ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400'
                      : 'border-slate-200 focus:ring-indigo-500/20 focus:border-indigo-400'
                  }`}
                />
                {phone && !phoneValid && (
                  <p className="mt-1 text-[10px] text-red-500">올바른 휴대폰 번호 형식이 아닙니다.</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  메시지 <span className="font-normal text-slate-400">(선택)</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="원하시는 상담 내용·궁금한 점을 자유롭게 적어주세요."
                  rows={3}
                  maxLength={2000}
                  disabled={phase === 'submitting'}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none"
                />
              </div>

              {/* honeypot — 봇만 채움 (CSS 로 시각적/탭 순서에서 숨김) */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden' }}>
                <label>회사 홈페이지 (this field should be left empty)</label>
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  name="company_website"
                />
              </div>
            </div>

            {phase === 'error' && errorMsg && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-700">
                {errorMsg}
              </div>
            )}

            <p className="text-[10px] text-slate-400 leading-relaxed">
              제출 시 입력하신 정보는 마케팅 상담 목적으로만 사용되며,
              진단 결과(URL · 점수) 가 함께 전송될 수 있습니다.
            </p>

            <button
              type="submit"
              disabled={!canSubmit}
              className={`w-full px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                canSubmit
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {phase === 'submitting' ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  접수 중...
                </span>
              ) : (
                '상담 신청하기'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
