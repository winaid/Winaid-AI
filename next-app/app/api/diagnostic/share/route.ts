/**
 * POST /api/diagnostic/share
 *
 * 현재 진단 결과를 공유 가능한 토큰으로 발급.
 * body: { result: DiagnosticResponse }
 * 응답: { token: string; publicUrl: string }
 *
 * - 인증 불필요(게스트 포함 발급 가능). user_id 는 세션 있을 때만 저장.
 * - 만료: 90일 (expires_at = now + 90d)
 * - 중복 방지: token 은 PRIMARY KEY, 충돌 시 재생성 (최대 3회)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateShareToken, buildPublicView } from '../../../../lib/diagnostic/publicShare';
import { getSessionSafe } from '../../../../lib/supabase';
import { getSupabaseClient } from '../../../../lib/supabase';
import type { DiagnosticResponse } from '../../../../lib/diagnostic/types';

export const dynamic = 'force-dynamic';

const EXPIRES_DAYS = 90;

function err(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  let body: { result?: DiagnosticResponse };
  try {
    body = (await request.json()) as { result?: DiagnosticResponse };
  } catch {
    return err('요청 본문을 읽을 수 없습니다.', 400);
  }

  const result = body.result;
  if (!result || typeof result !== 'object' || !result.url || !result.overallScore) {
    return err('result 필드가 올바르지 않습니다.', 400);
  }

  const db = getSupabaseClient();

  const session = await getSessionSafe();
  const userId = session?.userId ?? null;

  const expiresAt = new Date(Date.now() + EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // 토큰 충돌 시 최대 3회 재시도
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = generateShareToken();
    const snapshot = buildPublicView(result, token);

    const { error } = await db.from('diagnostic_public_shares').insert({
      token,
      user_id: userId,
      history_url: result.url,
      history_analyzed_at: result.analyzedAt,
      snapshot,
      expires_at: expiresAt,
      is_revoked: false,
    });

    if (!error) {
      const host = request.headers.get('host') ?? 'localhost:3000';
      const proto = request.headers.get('x-forwarded-proto') ?? 'https';
      const publicUrl = `${proto}://${host}/check/${token}`;
      return NextResponse.json({ success: true, token, publicUrl });
    }

    // 23505 = unique_violation (토큰 충돌)
    if (error.code !== '23505') {
      console.warn('[share] DB insert error:', error.message);
      return err('공유 링크 생성 중 오류가 발생했습니다.', 500);
    }
  }

  return err('공유 토큰 생성에 실패했습니다. 다시 시도해 주세요.', 500);
}
