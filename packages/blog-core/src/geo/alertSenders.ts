/**
 * GEO-8 — 알림 채널 발송 클라이언트 (Slack / Email / Kakao).
 *
 * 각 channel 발송은 fail-safe: 한 채널 실패해도 다른 채널 진행.
 * 환경 변수 옵션 (없으면 그 채널만 미발송):
 *   - RESEND_API_KEY (Email — Resend)
 *   - KAKAO_REST_API_KEY (카카오톡 — kapi.kakao.com)
 *
 * Slack 은 webhook URL 만 운영자가 입력 — 환경 변수 추가 불필요.
 *
 * 모든 발송 함수: throw X. 결과는 { ok: boolean; error?: string } 반환.
 */

export interface SendResult {
  channel: string;
  ok: boolean;
  error?: string;
}

const FETCH_TIMEOUT_MS = 10_000;

async function safeFetch(url: string, init: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// ── Slack ─────────────────────────────────────────────────────

/**
 * Slack incoming webhook 발송.
 * webhook URL 형식: https://hooks.slack.com/services/...
 */
export async function sendSlack(webhookUrl: string, message: string): Promise<SendResult> {
  if (!webhookUrl || !/^https:\/\/hooks\.slack\.com\//i.test(webhookUrl)) {
    return { channel: 'slack', ok: false, error: 'invalid Slack webhook URL' };
  }
  if (!message) return { channel: 'slack', ok: false, error: 'empty message' };
  try {
    const res = await safeFetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { channel: 'slack', ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { channel: 'slack', ok: true };
  } catch (e) {
    return { channel: 'slack', ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Email (Resend API) ────────────────────────────────────────

/**
 * Resend 통한 이메일 발송. RESEND_API_KEY 미설정 시 skip (channel='email' ok=false).
 */
export async function sendEmail(toAddress: string, subject: string, html: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { channel: 'email', ok: false, error: 'RESEND_API_KEY not set' };
  if (!toAddress || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toAddress)) {
    return { channel: 'email', ok: false, error: 'invalid email address' };
  }
  if (!subject || !html) return { channel: 'email', ok: false, error: 'empty subject or html' };
  try {
    const res = await safeFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_ADDRESS || 'WINAID Alerts <alerts@winai.kr>',
        to: [toAddress],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { channel: 'email', ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { channel: 'email', ok: true };
  } catch (e) {
    return { channel: 'email', ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Kakao (kapi.kakao.com — talk_message/send_to_me) ──────────

/**
 * 카카오톡 본인에게 메시지 보내기 API.
 * userAccessToken: 사용자 OAuth access token (카카오 로그인 + talk_message 동의 후 얻음).
 * KAKAO_REST_API_KEY 환경 변수는 카카오 dev 콘솔의 REST API key. 본 API 는 token 만 있으면 OK.
 *
 * production 사용 시 본인 인증 + 토큰 만료 갱신 흐름 추가 필요.
 */
export async function sendKakao(userAccessToken: string, message: string): Promise<SendResult> {
  if (!userAccessToken) return { channel: 'kakao', ok: false, error: 'empty Kakao access token' };
  if (!message) return { channel: 'kakao', ok: false, error: 'empty message' };
  try {
    const template = {
      object_type: 'text',
      text: message,
      link: { web_url: 'https://winai.kr', mobile_web_url: 'https://winai.kr' },
    };
    const form = new URLSearchParams();
    form.set('template_object', JSON.stringify(template));
    const res = await safeFetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${userAccessToken}`,
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { channel: 'kakao', ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { channel: 'kakao', ok: true };
  } catch (e) {
    return { channel: 'kakao', ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── 종합: alert 1건을 모든 채널로 발송 ────────────────────────

export interface ChannelsConfig {
  email?: string;
  slack_webhook?: string;
  kakao_token?: string;
}

/**
 * Promise.allSettled 로 모든 채널 병렬 발송 — 한 채널 실패해도 다른 진행.
 * 응답: 시도한 채널 + 성공 여부 list.
 */
export async function sendToAllChannels(
  channels: ChannelsConfig,
  subject: string,
  message: string,
): Promise<SendResult[]> {
  const tasks: Array<Promise<SendResult>> = [];
  if (channels.slack_webhook) tasks.push(sendSlack(channels.slack_webhook, message));
  if (channels.email) tasks.push(sendEmail(channels.email, subject, `<p>${escapeHtml(message)}</p>`));
  if (channels.kakao_token) tasks.push(sendKakao(channels.kakao_token, message));

  if (tasks.length === 0) return [];

  const settled = await Promise.allSettled(tasks);
  return settled.map(s => {
    if (s.status === 'fulfilled') return s.value;
    return { channel: 'unknown', ok: false, error: s.reason instanceof Error ? s.reason.message : String(s.reason) };
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
