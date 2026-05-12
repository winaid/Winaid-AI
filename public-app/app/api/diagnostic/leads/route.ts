/**
 * POST /api/diagnostic/leads — 진단 페이지 리드 폼 제출 (게스트 포함).
 *
 * body: LeadSubmitBody
 * response: 200 { id } / 400 { error } / 429 { error } / 500 { error }
 *
 * 흐름:
 *   1. honeypot(company_website) 값 있으면 silent 200 (스팸봇 차단, 노이즈 X)
 *   2. body 필드 검증 (길이/패턴/화이트리스트)
 *   3. IP rate limit — 분당 3건 / 시간당 10건
 *   4. sanitize 적용 (메시지 필드는 promptSanitize)
 *   5. supabaseAdmin 으로 INSERT (RLS 우회, anon 직접 insert 도 RLS 로 허용은 됐지만
 *      ip/user_agent/user_id 자동 첨부 위해 server-side 처리)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, sanitizePromptInput, getSessionSafe } from '@winaid/blog-core';
import { checkRateLimit, getClientIp } from '../../../../lib/rateLimit';
import {
  type LeadSubmitBody,
  type LeadSource,
  LEAD_SOURCES,
  isValidPhone,
} from '../../../../lib/diagnostic/leadTypes';

export const dynamic = 'force-dynamic';

const MINUTE_LIMIT = 3;
const HOUR_LIMIT = 10;

const MAX_HOSPITAL = 200;
const MAX_CONTACT = 100;
const MAX_PHONE = 20;
const MAX_MESSAGE = 2000;
const MAX_URL = 500;
const MAX_TOKEN = 32;

function err(message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json(
    { success: false, error: message },
    { status, ...(headers ? { headers } : {}) },
  );
}

export async function POST(request: NextRequest) {
  // 1) body 파싱
  let body: LeadSubmitBody;
  try {
    body = (await request.json()) as LeadSubmitBody;
  } catch {
    return err('잘못된 요청 형식입니다.', 400);
  }

  // 2) honeypot — 값이 차 있으면 silent 200 (봇)
  if (typeof body.company_website === 'string' && body.company_website.trim().length > 0) {
    return NextResponse.json({ success: true, id: null });
  }

  // 3) 필드 검증
  const hospital = (body.hospitalName || '').trim();
  const contact = (body.contactName || '').trim();
  const phoneRaw = (body.phone || '').trim();
  const message = body.message ? body.message.trim() : '';

  if (!hospital || hospital.length > MAX_HOSPITAL) {
    return err('병원명을 1~200자 이내로 입력해주세요.', 400);
  }
  if (!contact || contact.length > MAX_CONTACT) {
    return err('담당자명을 1~100자 이내로 입력해주세요.', 400);
  }
  if (!phoneRaw || phoneRaw.length > MAX_PHONE) {
    return err('연락처를 입력해주세요.', 400);
  }
  if (!isValidPhone(phoneRaw)) {
    return err('휴대폰 번호 형식이 올바르지 않습니다. (예: 010-1234-5678)', 400);
  }
  if (message.length > MAX_MESSAGE) {
    return err(`메시지는 ${MAX_MESSAGE}자 이내로 입력해주세요.`, 400);
  }

  // source 화이트리스트
  if (!body.source || !LEAD_SOURCES.includes(body.source as LeadSource)) {
    return err('잘못된 트리거 위치입니다.', 400);
  }

  // 4) IP rate limit
  const ip = getClientIp(request);
  try {
    const minute = await checkRateLimit(`leads:m:${ip}`, MINUTE_LIMIT, 60);
    if (!minute.allowed) {
      return err(
        `요청이 너무 많습니다. ${minute.retryAfterSec}초 후 다시 시도해 주세요.`,
        429,
        { 'Retry-After': String(minute.retryAfterSec) },
      );
    }
    const hour = await checkRateLimit(`leads:h:${ip}`, HOUR_LIMIT, 3600);
    if (!hour.allowed) {
      const mins = Math.ceil(hour.retryAfterSec / 60);
      return err(
        `시간당 요청 한도(${HOUR_LIMIT}건)를 초과했습니다. ${mins}분 후 다시 시도해 주세요.`,
        429,
        { 'Retry-After': String(hour.retryAfterSec) },
      );
    }
  } catch (e) {
    // rate limit 자체 실패는 fail-open. 로그만 남기고 진행.
    console.warn('[leads] rate limit check error', e);
  }

  // 5) sanitize
  const sanitizedMessage = message ? sanitizePromptInput(message, MAX_MESSAGE) : null;

  // 6) 자동 첨부 검증
  const diagnosticUrl = typeof body.diagnosticUrl === 'string'
    ? body.diagnosticUrl.slice(0, MAX_URL)
    : null;
  const diagnosticScore = typeof body.diagnosticScore === 'number'
    && body.diagnosticScore >= 0 && body.diagnosticScore <= 100
    ? Math.round(body.diagnosticScore)
    : null;
  const diagnosticToken = typeof body.diagnosticToken === 'string'
    && /^[A-Za-z0-9_-]{1,32}$/.test(body.diagnosticToken)
    ? body.diagnosticToken.slice(0, MAX_TOKEN)
    : null;

  // 7) user_id (로그인 사용자면 첨부)
  let userId: string | null = null;
  try {
    const session = await getSessionSafe();
    userId = session.userId;
  } catch {
    // 인증 미설정 환경 — 게스트로 처리
  }

  // 8) INSERT
  if (!supabaseAdmin) {
    console.error('[leads] supabaseAdmin 미구성 — SUPABASE_SERVICE_ROLE_KEY 확인');
    return err('서버 설정 오류. 잠시 후 다시 시도해 주세요.', 500);
  }

  const userAgent = (request.headers.get('user-agent') || '').slice(0, 500);

  const { data, error } = await supabaseAdmin
    .from('diagnostic_leads')
    .insert({
      hospital_name: hospital,
      contact_name: contact,
      phone: phoneRaw,
      message: sanitizedMessage,
      diagnostic_url: diagnosticUrl,
      diagnostic_score: diagnosticScore,
      diagnostic_token: diagnosticToken,
      source: body.source,
      ip,
      user_agent: userAgent,
      user_id: userId,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[leads] insert error', error);
    return err('저장에 실패했습니다. 잠시 후 다시 시도해 주세요.', 500);
  }

  return NextResponse.json({ success: true, id: data.id });
}
