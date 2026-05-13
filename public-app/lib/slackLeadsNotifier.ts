/**
 * 진단 문의(diagnostic_leads) 신규 접수 → Slack Incoming Webhook 알림.
 *
 * - SLACK_LEADS_WEBHOOK_URL 미설정 시 즉시 return (회귀 0, 운영 옵션).
 * - fire-and-forget: 슬랙 응답을 기다리지 않고 사용자 200 응답 즉시 반환.
 * - 3초 timeout: 슬랙 장애가 폼 라우트 지연으로 전파되지 않도록.
 * - 운영 가시성을 위해 실패는 console.warn 으로만 남김 (사용자 응답엔 영향 없음).
 *
 * 본 파일은 서버 전용. 클라이언트 번들로 가지 않게 import 경로 주의
 * (`'use client'` 컴포넌트에서 직접 import 금지).
 */
import { LEAD_SOURCE_LABEL, type LeadSource } from './diagnostic/leadTypes';

export interface SlackLeadPayload {
  leadId: string;
  hospitalName: string;
  contactName: string;
  phone: string;
  message: string | null;
  source: LeadSource;
  diagnosticUrl: string | null;
  diagnosticScore: number | null;
}

const SLACK_TIMEOUT_MS = 3000;

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: Array<{ type: string; text: string }>;
  elements?: Array<{ type: string; text: string }>;
}

interface SlackBlockKitMessage {
  text: string;
  blocks: SlackBlock[];
}

/**
 * Build the Block Kit payload. Exported for tests.
 * Pure function — no env access, no fetch.
 */
export function buildSlackBlocks(
  payload: SlackLeadPayload,
  adminBaseUrl: string | null = null,
): SlackBlockKitMessage {
  const sourceLabel = LEAD_SOURCE_LABEL[payload.source] ?? payload.source;
  const scoreText =
    typeof payload.diagnosticScore === 'number' ? `${payload.diagnosticScore}점` : '점수 없음';

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🏥 새 진단 문의가 접수되었습니다', emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*병원명*\n${payload.hospitalName}` },
        { type: 'mrkdwn', text: `*담당자*\n${payload.contactName}` },
        { type: 'mrkdwn', text: `*연락처*\n${payload.phone}` },
        { type: 'mrkdwn', text: `*유입*\n${sourceLabel}` },
      ],
    },
  ];

  if (payload.diagnosticUrl) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*진단 사이트:* ${payload.diagnosticUrl}  (${scoreText})`,
      },
    });
  }

  if (payload.message) {
    const quoted = payload.message.replace(/\n/g, '\n>');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*메시지*\n>${quoted}` },
    });
  }

  const trimmedBase = adminBaseUrl ? adminBaseUrl.replace(/\/$/, '') : '';
  if (trimmedBase) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `<${trimmedBase}/admin|🔗 어드민에서 보기>` }],
    });
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `_lead_id: \`${payload.leadId}\`_` }],
  });

  return {
    text: `🏥 새 진단 문의 — ${payload.hospitalName} / ${payload.contactName} / ${payload.phone}`,
    blocks,
  };
}

/**
 * Fire-and-forget notification. Safe to call from request handlers.
 * - SLACK_LEADS_WEBHOOK_URL 미설정 시 no-op.
 * - 호출 후 즉시 return (Promise 반환 안 함).
 */
export function notifyLeadToSlack(payload: SlackLeadPayload): void {
  const url = process.env.SLACK_LEADS_WEBHOOK_URL;
  if (!url) return;

  const adminBaseUrl = process.env.NEXT_APP_ADMIN_URL || null;
  const body = buildSlackBlocks(payload, adminBaseUrl);

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn('[leads/slack] webhook non-200', res.status, text.slice(0, 200));
      }
    })
    .catch((e) => {
      const name = (e as { name?: string } | null)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        console.warn('[leads/slack] webhook timeout');
      } else {
        console.warn('[leads/slack] webhook error', (e as Error)?.message);
      }
    });
}
