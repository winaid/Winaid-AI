'use client';

/**
 * AlertSubscriptionSection — AI 인용률 변동 실시간 알림 구독 (GEO-8 — 14 기능 8번)
 *
 * geo_citations 데이터가 며칠 쌓이면 우리 인용 비율 변동 추세가 보임.
 * 운영자가 매일 diagnostic 들어가서 확인할 필요 없도록 임계 변동 자동 감지 → Slack /
 * Email / 카카오톡 발송.
 *
 * 별도 페이지 신설 X — diagnostic 결과 화면 SchemaOrgSection 다음에 통합.
 * 양 앱 lockstep — public-app / next-app 같은 파일 (geoAlerts.test 가 diff=0 강제).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

export interface AlertSubscriptionSectionProps {
  /** 진단 결과 finalUrl — our_domains prefill. */
  diagnosticUrl: string;
  /** 진단 결과 siteName — hospital_name. */
  hospitalName: string;
}

interface SubscriptionRow {
  id?: string;
  hospital_name: string;
  our_domains: string[];
  threshold_pct: number;
  compare_window_days: number;
  channels: Record<string, string | undefined>;
  enabled?: boolean;
  created_at?: string;
}

interface HistoryRow {
  id?: string;
  alert_type: string;
  payload?: Record<string, unknown>;
  sent_to?: string[];
  sent_at?: string;
}

interface SendResult { channel: string; ok: boolean; error?: string }
interface EvaluatedResult {
  subscription_id?: string;
  alerts: Array<{ type: string; message: string }>;
  sent: SendResult[];
}

function hostnameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    return h.startsWith('www.') ? h.slice(4) : h;
  } catch {
    return '';
  }
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: '2-digit', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

const WINDOW_OPTIONS: Array<{ days: number; label: string }> = [
  { days: 3, label: '3일' },
  { days: 7, label: '7일' },
  { days: 14, label: '14일' },
  { days: 30, label: '30일' },
];

const ALERT_TYPE_LABEL: Record<string, string> = {
  cite_drop: '🚨 인용률 하락',
  cite_rise: '✅ 인용률 상승',
  new_competitor: '📌 신규 경쟁사',
  sentiment_drop: '⚠️ 평판 하락',
};

export default function AlertSubscriptionSection({
  diagnosticUrl,
  hospitalName,
}: AlertSubscriptionSectionProps) {
  const initialDomain = hostnameFromUrl(diagnosticUrl);

  const [open, setOpen] = useState(false);

  // 구독 폼 state
  const [thresholdPct, setThresholdPct] = useState(20);
  const [windowDays, setWindowDays] = useState(7);
  const [email, setEmail] = useState('');
  const [slackWebhook, setSlackWebhook] = useState('');
  const [kakaoToken, setKakaoToken] = useState('');
  const [enableEmail, setEnableEmail] = useState(false);
  const [enableSlack, setEnableSlack] = useState(true);
  const [enableKakao, setEnableKakao] = useState(false);

  // server state
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<EvaluatedResult[] | null>(null);
  const [topErr, setTopErr] = useState<string | undefined>();
  const [authErr, setAuthErr] = useState<string | undefined>();

  const fetchSubscriptions = useCallback(async () => {
    if (!hospitalName) return;
    setSubsLoading(true);
    try {
      const res = await fetch(`/api/geo/alerts/subscriptions?hospital_name=${encodeURIComponent(hospitalName)}`);
      if (res.status === 401) {
        setAuthErr('알림 구독은 로그인 후 사용 가능합니다.');
        setSubsLoading(false);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data?.subscriptions)) setSubscriptions(data.subscriptions);
      setAuthErr(undefined);
    } catch {
      // silent
    } finally {
      setSubsLoading(false);
    }
  }, [hospitalName]);

  const fetchHistory = useCallback(async () => {
    if (!hospitalName) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/geo/alerts/evaluate?hospital_name=${encodeURIComponent(hospitalName)}&limit=20`);
      if (res.status === 401) { setHistoryLoading(false); return; }
      const data = await res.json();
      if (Array.isArray(data?.history)) setHistory(data.history);
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, [hospitalName]);

  useEffect(() => {
    if (open) {
      fetchSubscriptions();
      fetchHistory();
    }
  }, [open, fetchSubscriptions, fetchHistory]);

  const canSave = useMemo(() => {
    if (saving) return false;
    if (!hospitalName) return false;
    if (enableEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return false;
    if (enableSlack && !/^https:\/\/hooks\.slack\.com\//i.test(slackWebhook)) return false;
    if (enableKakao && !kakaoToken.trim()) return false;
    return enableEmail || enableSlack || enableKakao;
  }, [saving, hospitalName, enableEmail, enableSlack, enableKakao, email, slackWebhook, kakaoToken]);

  const save = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setTopErr(undefined);
    try {
      const channels: Record<string, string> = {};
      if (enableEmail) channels.email = email.trim();
      if (enableSlack) channels.slack_webhook = slackWebhook.trim();
      if (enableKakao) channels.kakao_token = kakaoToken.trim();
      const res = await fetch('/api/geo/alerts/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospital_name: hospitalName,
          our_domains: initialDomain ? [initialDomain] : [],
          threshold_pct: thresholdPct,
          compare_window_days: windowDays,
          channels,
          enabled: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTopErr(data?.error || `HTTP ${res.status}`);
        return;
      }
      fetchSubscriptions();
    } catch (e) {
      setTopErr(e instanceof Error ? e.message : 'unknown');
    } finally {
      setSaving(false);
    }
  }, [canSave, enableEmail, enableSlack, enableKakao, email, slackWebhook, kakaoToken, hospitalName, initialDomain, thresholdPct, windowDays, fetchSubscriptions]);

  const deleteSubscription = useCallback(async (id: string) => {
    if (!id) return;
    if (!confirm('이 알림 구독을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/geo/alerts/subscriptions?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) fetchSubscriptions();
    } catch {
      // silent — UI 가 다음 fetch 에서 정합
    }
  }, [fetchSubscriptions]);

  const evaluate = useCallback(async () => {
    if (!hospitalName || evaluating) return;
    setEvaluating(true);
    setTopErr(undefined);
    setEvalResult(null);
    try {
      const res = await fetch('/api/geo/alerts/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospital_name: hospitalName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTopErr(data?.error || `HTTP ${res.status}`);
        return;
      }
      setEvalResult(data.evaluated || []);
      fetchHistory();
    } catch (e) {
      setTopErr(e instanceof Error ? e.message : 'unknown');
    } finally {
      setEvaluating(false);
    }
  }, [hospitalName, evaluating, fetchHistory]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between cursor-pointer bg-transparent border-0 p-0 text-left"
        aria-expanded={open}
      >
        <div>
          <h3 className="text-sm font-bold text-slate-700">
            🔔 인용률 변동 알림 — 매일 안 들여다봐도 됩니다
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            우리 사이트 인용률이 임계값 이상 변동하거나 새 경쟁사가 등장하면 Slack / Email / 카카오톡으로 자동 알림.
            <span className="text-slate-400 ml-1">{open ? '접기 ▲' : '펼치기 ▼'}</span>
          </p>
        </div>
      </button>

      {open && (
        <div className="mt-4 pt-3 border-t border-slate-100 space-y-4">
          {authErr && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              {authErr}
            </div>
          )}

          {/* 구독 폼 */}
          <div className="space-y-3">
            <h4 className="text-[12px] font-bold text-slate-700">새 알림 구독</h4>

            {/* 임계 % + 기간 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-600 block mb-1">
                  임계 변동 <span className="font-medium text-indigo-700">±{thresholdPct}%</span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={50}
                  step={5}
                  value={thresholdPct}
                  onChange={e => setThresholdPct(parseInt(e.target.value, 10))}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>10%</span><span>50%</span>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-slate-600 block mb-1">비교 기간</label>
                <div className="flex flex-wrap gap-1">
                  {WINDOW_OPTIONS.map(o => (
                    <button
                      key={o.days}
                      type="button"
                      onClick={() => setWindowDays(o.days)}
                      className={
                        'text-[11px] px-2.5 py-1 rounded-full border cursor-pointer ' +
                        (windowDays === o.days
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')
                      }
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 채널 */}
            <div className="space-y-2">
              <label className="text-[11px] text-slate-600 block">발송 채널 (한 개 이상 필수)</label>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={enableSlack} onChange={e => setEnableSlack(e.target.checked)} id="ch-slack" />
                <label htmlFor="ch-slack" className="text-[12px] text-slate-700 w-16">Slack</label>
                <input
                  type="text"
                  value={slackWebhook}
                  onChange={e => setSlackWebhook(e.target.value)}
                  disabled={!enableSlack}
                  placeholder="https://hooks.slack.com/services/..."
                  className="flex-1 text-[11px] px-2 py-1 border border-slate-200 rounded focus:outline-none focus:border-indigo-400 disabled:bg-slate-50"
                />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={enableEmail} onChange={e => setEnableEmail(e.target.checked)} id="ch-email" />
                <label htmlFor="ch-email" className="text-[12px] text-slate-700 w-16">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={!enableEmail}
                  placeholder="alerts@yourclinic.kr"
                  className="flex-1 text-[11px] px-2 py-1 border border-slate-200 rounded focus:outline-none focus:border-indigo-400 disabled:bg-slate-50"
                />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={enableKakao} onChange={e => setEnableKakao(e.target.checked)} id="ch-kakao" />
                <label htmlFor="ch-kakao" className="text-[12px] text-slate-700 w-16">카카오</label>
                <input
                  type="text"
                  value={kakaoToken}
                  onChange={e => setKakaoToken(e.target.value)}
                  disabled={!enableKakao}
                  placeholder="카카오 access token (talk_message 동의 후)"
                  className="flex-1 text-[11px] px-2 py-1 border border-slate-200 rounded focus:outline-none focus:border-indigo-400 disabled:bg-slate-50"
                />
              </div>
              <p className="text-[10px] text-slate-400">
                Slack: 채널 webhook URL 만 입력 (서버 환경 설정 불필요).
                Email: RESEND_API_KEY 운영자 설정 필요.
                카카오: 사용자 OAuth access token 필요 (talk_message 동의).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={!canSave}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-[12px] font-medium px-3 py-1.5 rounded-lg cursor-pointer"
              >
                {saving ? '저장 중…' : '🔔 구독 저장'}
              </button>
              <button
                type="button"
                onClick={evaluate}
                disabled={evaluating || subscriptions.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-[12px] font-medium px-3 py-1.5 rounded-lg cursor-pointer"
                title="현재 데이터로 변동 체크 + 모든 활성 구독에 발송"
              >
                {evaluating ? '평가 중…' : '⚡ 지금 평가 + 발송'}
              </button>
            </div>

            {topErr && (
              <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
                {topErr}
              </div>
            )}

            {evalResult && evalResult.length === 0 && (
              <div className="text-[11px] text-slate-500 bg-slate-50 rounded p-2 border border-slate-200">
                활성 구독에서 트리거된 알림이 없습니다. 임계값을 낮추거나 더 많은 데이터 축적 후 다시 시도.
              </div>
            )}

            {evalResult && evalResult.length > 0 && (
              <div className="text-[11px] bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1.5">
                <p className="font-medium text-emerald-800">발송 결과 ({evalResult.length}개 구독)</p>
                {evalResult.map((e, i) => (
                  <div key={i} className="border-t border-emerald-100 pt-1 mt-1 first:border-0 first:pt-0 first:mt-0">
                    {e.alerts.length === 0 && <span className="text-slate-500">트리거된 알림 없음.</span>}
                    {e.alerts.map((a, j) => (
                      <div key={j} className="text-slate-700">
                        <span className="font-medium">{ALERT_TYPE_LABEL[a.type] || a.type}</span>: {a.message}
                      </div>
                    ))}
                    {e.sent.length > 0 && (
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        발송: {e.sent.map(s => `${s.channel}(${s.ok ? '✓' : '×'})`).join(' ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 활성 구독 list */}
          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[12px] font-bold text-slate-700">활성 구독 ({subscriptions.length})</h4>
              {subsLoading && <span className="text-[10px] text-slate-400">로딩…</span>}
            </div>
            {subscriptions.length === 0 ? (
              <p className="text-[11px] text-slate-500">구독 없음. 위에서 새 구독을 저장하세요.</p>
            ) : (
              <ul className="space-y-1.5">
                {subscriptions.map(s => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 text-[11px] bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-slate-700">±{s.threshold_pct}% / {s.compare_window_days}일</span>
                      <span className="text-slate-500 ml-2">
                        {Object.entries(s.channels).filter(([, v]) => !!v).map(([k]) => k).join(' · ') || '(no channels)'}
                      </span>
                    </div>
                    {s.id && (
                      <button
                        type="button"
                        onClick={() => deleteSubscription(s.id!)}
                        className="text-[10px] text-rose-600 hover:text-rose-800 cursor-pointer bg-transparent border-0 p-0"
                      >
                        삭제
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 최근 알림 history */}
          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[12px] font-bold text-slate-700">최근 알림 ({history.length})</h4>
              {historyLoading && <span className="text-[10px] text-slate-400">로딩…</span>}
            </div>
            {history.length === 0 ? (
              <p className="text-[11px] text-slate-500">발송 이력 없음.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-1.5 pr-2">시간</th>
                      <th className="py-1.5 pr-2">종류</th>
                      <th className="py-1.5 pr-2">발송 채널</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.id} className="border-b border-slate-100">
                        <td className="py-1.5 pr-2 text-slate-600 whitespace-nowrap">{formatTime(h.sent_at)}</td>
                        <td className="py-1.5 pr-2 text-slate-800">{ALERT_TYPE_LABEL[h.alert_type] || h.alert_type}</td>
                        <td className="py-1.5 pr-2 text-slate-600">{(h.sent_to || []).join(', ') || '(없음)'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
