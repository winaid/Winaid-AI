'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type LeadRow,
  type LeadStatus,
  LEAD_STATUS_LABEL,
  LEAD_SOURCE_LABEL,
  LEAD_STATUSES,
} from '../../lib/diagnostic/leadTypes';

/** 진단 페이지 리드(상담 신청) 목록 탭. AdminFeedbackTab 패턴 따라.
 *
 *  데이터: public-app DB (diagnostic_leads). next-app /api/admin/leads → public-app
 *  /api/internal/admin/leads (X-Internal-Secret) 프록시로 읽음.
 */

const STATUS_OPTIONS: { value: '' | LeadStatus; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'new', label: '신규' },
  { value: 'contacted', label: '연락함' },
  { value: 'closed', label: '종료' },
];

const STATUS_BADGE: Record<LeadStatus, string> = {
  new: 'bg-red-50 text-red-700 border-red-200',
  contacted: 'bg-amber-50 text-amber-700 border-amber-200',
  closed: 'bg-slate-100 text-slate-500 border-slate-200',
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yy}-${mm}-${dd} ${hh}:${mi}`;
  } catch { return iso; }
}

/** CSV 셀 이스케이프 — 따옴표·콤마·줄바꿈 포함 시 큰따옴표 wrap. */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function AdminLeadsTab() {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'' | LeadStatus>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchRows = useCallback(async (overrides?: { status?: '' | LeadStatus; q?: string }) => {
    const status = overrides?.status ?? statusFilter;
    const q = overrides?.q ?? search;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (q) params.set('q', q);
      params.set('limit', '200');
      const res = await fetch(`/api/admin/leads?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { rows: LeadRow[]; total: number };
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError((e as Error)?.message || '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  // 첫 진입 + 필터 변화 시 재조회
  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const handleStatusChange = useCallback(async (id: string, next: LeadStatus) => {
    setUpdatingId(id);
    try {
      const res = await fetch('/api/admin/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)));
    } catch (e) {
      alert(`상태 변경 실패: ${(e as Error).message}`);
    } finally {
      setUpdatingId(null);
    }
  }, []);

  const handleSearch = () => {
    setSearch(searchInput.trim());
  };

  const handleCsvExport = useCallback(() => {
    const headers = [
      '생성일', '병원명', '담당자', '연락처', '진단URL', '점수', '유입', '상태', '메시지',
    ];
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([
        csvCell(formatDate(r.created_at)),
        csvCell(r.hospital_name),
        csvCell(r.contact_name),
        csvCell(r.phone),
        csvCell(r.diagnostic_url),
        csvCell(r.diagnostic_score),
        csvCell(LEAD_SOURCE_LABEL[r.source]),
        csvCell(LEAD_STATUS_LABEL[r.status]),
        csvCell(r.message),
      ].join(','));
    }
    const csv = '﻿' + lines.join('\n'); // UTF-8 BOM
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostic_leads_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [rows]);

  const stats = useMemo(() => {
    const c: Record<LeadStatus, number> = { new: 0, contacted: 0, closed: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-slate-800">상담 신청 (리드)</h2>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            현재 {rows.length}건 / 전체 {total}건
          </span>
          <span className="text-xs text-red-600">신규 {stats.new}</span>
          <span className="text-xs text-amber-600">연락 {stats.contacted}</span>
          <span className="text-xs text-slate-500">종료 {stats.closed}</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | LeadStatus)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="병원·담당자 검색"
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg w-44 focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={handleSearch}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            검색
          </button>
          <button
            onClick={() => void fetchRows()}
            disabled={loading}
            className="text-xs text-slate-500 hover:text-slate-700 font-medium"
          >
            {loading ? '로딩...' : '새로고침'}
          </button>
          <button
            onClick={handleCsvExport}
            disabled={rows.length === 0}
            className="px-3 py-1.5 text-xs font-bold bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* 표 */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">생성일</th>
                <th className="px-3 py-2 text-left">병원명</th>
                <th className="px-3 py-2 text-left">담당자</th>
                <th className="px-3 py-2 text-left">연락처</th>
                <th className="px-3 py-2 text-left">진단</th>
                <th className="px-3 py-2 text-left">유입</th>
                <th className="px-3 py-2 text-left">상태</th>
                <th className="px-3 py-2 text-left">메시지</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && !loading && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400 text-xs">접수된 상담 신청이 없습니다.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-[11px] text-slate-500 whitespace-nowrap">
                    {formatDate(r.created_at)}
                  </td>
                  <td className="px-3 py-2 font-semibold text-slate-800">
                    {r.hospital_name}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{r.contact_name}</td>
                  <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                    <a href={`tel:${r.phone}`} className="hover:text-blue-600">{r.phone}</a>
                  </td>
                  <td className="px-3 py-2 text-[11px]">
                    {r.diagnostic_url ? (
                      <a
                        href={r.diagnostic_token ? `/check/${r.diagnostic_token}` : r.diagnostic_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline truncate inline-block max-w-[180px] align-bottom"
                      >
                        {r.diagnostic_url}
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                    {typeof r.diagnostic_score === 'number' && (
                      <span className="ml-1 text-slate-500">({r.diagnostic_score}점)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-500">
                    {LEAD_SOURCE_LABEL[r.source]}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.status}
                      onChange={(e) => void handleStatusChange(r.id, e.target.value as LeadStatus)}
                      disabled={updatingId === r.id}
                      className={`text-[11px] font-bold px-2 py-1 rounded-full border ${STATUS_BADGE[r.status]} cursor-pointer focus:outline-none disabled:opacity-50`}
                    >
                      {LEAD_STATUSES.map((s) => (
                        <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-500 max-w-[260px]">
                    <div className="truncate" title={r.message || ''}>{r.message || '—'}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
