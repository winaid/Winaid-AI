/**
 * POST /api/medical/override-token
 *
 * 의료광고법 위반 콘텐츠 다운로드 override 토큰 발급.
 *
 * ADR-2 (docs/decisions/CARDNEWS_HARDBLOCK_UX.md) Option B 채택에 따라
 * 사용자가 클라이언트 모달에서 "동의하고 다운로드" 클릭 시 호출.
 *
 * 동작:
 *   1. 인증 확인 — 로그인 사용자만 (게스트는 차감 정책상 override 로그 미수집)
 *   2. 본문에서 content_hash + violations_count 수신 (이전 클라 검증과 일치)
 *   3. medical_law_override_logs 에 INSERT (RLS = 본인) — service_role 사용
 *   4. issueOverrideToken 으로 5분 단명 HMAC 토큰 발급 → JSON 반환
 *
 * 응답:
 *   200 { token: string, expires_in: number }
 *   401 { error: 'authentication_required' } — 게스트
 *   400 { error: 'invalid_request' } — payload 불량
 *   500 { error: 'token_unavailable' } — 시크릿 미설정
 *
 * 비고:
 *   - 게스트도 다운로드는 가능하지만 운영 로그 / 토큰 미발급. Shorts API 는
 *     게스트 호출 시 토큰 검증 skip (creditService 동일 분기). 즉 본 토큰은
 *     "로그인 사용자가 자기 위반 동의를 명시적으로 남기는" 용도.
 *   - violation_text 길이 200자 제한 — PII 누설 방지 (server-side 재절단)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { resolveImageOwner } from '../../../../lib/serverAuth';
import { issueOverrideToken, OVERRIDE_TOKEN_TTL_SECONDS } from '../../../../lib/medicalAdOverrideToken';
import { supabaseAdmin } from '@winaid/blog-core';

export const dynamic = 'force-dynamic';

interface RequestBody {
  /** 다운로드 경로 — png/jpg/zip/pdf/shorts */
  download_path: 'png' | 'jpg' | 'zip' | 'pdf' | 'shorts';
  /** 클라이언트 검증 시점 위반 건수 */
  violations_count: number;
  /** 콘텐츠 해시 (클라가 슬라이드 직렬화 SHA-256 32자 prefix = 128-bit) */
  content_hash: string;
  /** 위반 카테고리 (대표 1개). superlative/guarantee/.../testimonial */
  violation_type: string;
  /** 위반 컨텍스트 텍스트 — 200자 초과 시 server-side 절단 (PII 누설 방지) */
  violation_text?: string;
  /** 카드뉴스 post id — 있으면 추적 (저장 전 게스트는 NULL) */
  content_id?: string;
}

const VALID_PATHS = new Set(['png', 'jpg', 'zip', 'pdf', 'shorts']);
const VIOLATION_TEXT_MAX = 200;

function ipHash(request: NextRequest): string | null {
  // X-Forwarded-For / X-Real-IP — Vercel/프록시 환경 대응
  const fwd = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const real = request.headers.get('x-real-ip')?.trim();
  const ip = fwd || real;
  if (!ip) return null;
  // PIPA: 원본 IP 저장 금지 — SHA-256 + 일자 솔트 (운영 분석용 그루핑)
  const salt = new Date().toISOString().slice(0, 10);
  return createHash('sha256').update(`${ip}::${salt}`).digest('hex').slice(0, 32);
}

export async function POST(request: NextRequest) {
  // 1. 인증 확인 — 로그인 사용자만
  const owner = await resolveImageOwner(request);
  if (owner === 'guest') {
    return NextResponse.json(
      { error: 'authentication_required' },
      { status: 401 },
    );
  }
  const userId = owner;

  // 2. payload 파싱
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  if (
    !body ||
    typeof body.download_path !== 'string' ||
    !VALID_PATHS.has(body.download_path) ||
    typeof body.content_hash !== 'string' ||
    body.content_hash.length === 0 ||
    body.content_hash.length > 64 ||
    typeof body.violations_count !== 'number' ||
    body.violations_count < 0 ||
    typeof body.violation_type !== 'string' ||
    body.violation_type.length === 0 ||
    body.violation_type.length > 32
  ) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  // 3. 운영 로그 INSERT — service_role 사용 (RLS authenticated 정책과 별개로 admin 채널 일원화)
  //    실패해도 토큰 발급은 진행 — 사용자 다운로드 흐름 차단 회피
  const truncatedText = body.violation_text
    ? body.violation_text.slice(0, VIOLATION_TEXT_MAX)
    : null;

  if (supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin
        .from('medical_law_override_logs')
        .insert({
          user_id: userId,
          content_id: body.content_id || null,
          download_path: body.download_path,
          violation_type: body.violation_type,
          violation_text: truncatedText,
          violations_count: body.violations_count,
          ip_hash: ipHash(request),
        });
      if (error) {
        // 로그만 — 토큰 발급은 진행 (사용자 흐름 우선, 운영 로그 손실은 모니터링)
        console.warn('[medical/override-token] log insert failed', error.message);
      }
    } catch (err) {
      console.warn('[medical/override-token] log insert exception', err);
    }
  }

  // 4. 토큰 발급
  const token = issueOverrideToken({
    userId,
    contentHash: body.content_hash,
    violationsCount: body.violations_count,
  });
  if (!token) {
    return NextResponse.json(
      { error: 'token_unavailable' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    token,
    expires_in: OVERRIDE_TOKEN_TTL_SECONDS,
  });
}
