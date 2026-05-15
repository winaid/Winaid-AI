/**
 * POST /api/admin/rpc
 *
 * 관리자 RPC 단일 dispatcher. 4개 op 를 받아 service_role 클라이언트로
 * 해당 RPC 를 호출하고 결과를 JSON 으로 반환한다.
 *
 * 인증 모델 (다층):
 *   1) PostgREST 레이어 — admin RPC 들은 anon/authenticated 권한 REVOKE 됨 (DB 측에서 차단)
 *   2) DB 레이어 — RPC 본문이 auth.role() = 'service_role' 검증 (PR-2 마이그레이션 후 활성)
 *   3) 본 라우트 — admin_session HttpOnly cookie HMAC 검증
 *
 * 본 라우트는 #3 을 책임지며, 통과 시 service_role 키로 RPC 를 부른다.
 * service_role 키는 절대 브라우저로 노출되지 않는다.
 *
 * 이전: client component 가 anon supabase 로 직접 .rpc('get_admin_stats',
 * { admin_password }) 호출 → REVOKE 적용 환경에선 실패. 본 라우트가 그 흐름을
 * 대체한다.
 *
 * 요청 바디:
 *   { op: 'stats' | 'posts' | 'delete-post' | 'delete-all', args?: object }
 *
 * 응답:
 *   200 + { data: <RPC 결과> }                   — 성공
 *   400 { error: 'bad_request', detail }         — op 미지정/미상/args 형식 오류
 *   401 { error: 'unauthorized', reason }        — cookie 누락/만료/위조
 *   500 { error: 'rpc_failed', detail, op }      — RPC 자체 에러 (메시지 그대로 반환 — admin 만 봄)
 *   503 { error: 'service_unavailable', reason } — service_role 키 미설정
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@winaid/blog-core';
import { verifyAdminCookie } from '../../../../lib/adminCookie';

export const runtime = 'nodejs';

type Op = 'stats' | 'posts' | 'delete-post' | 'delete-all';
const OPS: ReadonlySet<string> = new Set(['stats', 'posts', 'delete-post', 'delete-all']);

const DELETE_ALL_TIMEOUT_MS = 30_000;

function badRequest(detail: string) {
  return NextResponse.json({ error: 'bad_request', detail }, { status: 400 });
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export async function POST(req: NextRequest) {
  // 1) 인증 가드
  const auth = verifyAdminCookie(req);
  if (!auth.valid) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 },
    );
  }

  // 2) service_role 클라이언트 가용성 (env 미설정 시 503)
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'service_unavailable', reason: 'service_role_not_configured' },
      { status: 503 },
    );
  }

  // 3) 바디 파싱
  let body: { op?: unknown; args?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest('invalid_json');
  }
  const op = asString(body.op);
  if (!op || !OPS.has(op)) {
    return badRequest('invalid_op');
  }
  const args = (body.args && typeof body.args === 'object') ? (body.args as Record<string, unknown>) : {};

  // 4) op 디스패치 — admin_password 인자는 더 이상 의미 없지만, 현 RPC 시그니처
  //    호환을 위해 빈 문자열을 전달. PR-2 마이그레이션이 본문에서 무시 처리.
  try {
    if (op === 'stats') {
      const { data, error } = await supabaseAdmin.rpc('get_admin_stats', {
        admin_password: '',
      });
      if (error) return NextResponse.json({ error: 'rpc_failed', detail: error.message, op }, { status: 500 });
      return NextResponse.json({ data });
    }

    if (op === 'posts') {
      const filterPostType = asString(args.filter_post_type) ?? null;
      const filterHospital = asString(args.filter_hospital) ?? null;
      const limitCount = asNumber(args.limit_count, 100);
      const offsetCount = asNumber(args.offset_count, 0);
      const { data, error } = await supabaseAdmin.rpc('get_all_generated_posts', {
        admin_password: '',
        filter_post_type: filterPostType,
        filter_hospital: filterHospital,
        limit_count: limitCount,
        offset_count: offsetCount,
      });
      if (error) return NextResponse.json({ error: 'rpc_failed', detail: error.message, op }, { status: 500 });
      return NextResponse.json({ data });
    }

    if (op === 'delete-post') {
      const postId = asString(args.post_id);
      if (!postId) return badRequest('post_id_required');
      const { data, error } = await supabaseAdmin.rpc('delete_generated_post', {
        admin_password: '',
        post_id: postId,
      });
      if (error) return NextResponse.json({ error: 'rpc_failed', detail: error.message, op }, { status: 500 });
      return NextResponse.json({ data });
    }

    if (op === 'delete-all') {
      // RPC 의존 제거 — 운영자가 SQL 수동 배포 안 해도 동작 (내부 admin UX).
      // 인증/권한은 이미 (1) admin_session cookie 검증 + (2) service_role 키로 충족.
      // RLS 는 service_role 가 bypass. supabase-js DELETE 는 filter 필수 →
      // `not('id', 'is', null)` 로 전 row 매치 (id NOT NULL PRIMARY KEY).
      const deletePromise = supabaseAdmin
        .from('generated_posts')
        .delete({ count: 'exact' })
        .not('id', 'is', null);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('rpc_timeout_30s')), DELETE_ALL_TIMEOUT_MS),
      );
      try {
        const { error, count } = (await Promise.race([deletePromise, timeoutPromise])) as {
          error: { message: string } | null;
          count: number | null;
        };
        if (error) return NextResponse.json({ error: 'rpc_failed', detail: error.message, op }, { status: 500 });
        return NextResponse.json({ data: count ?? 0 });
      } catch (err) {
        const msg = (err as Error).message || 'unknown';
        return NextResponse.json({ error: 'rpc_failed', detail: msg, op }, { status: 500 });
      }
    }

    // 도달 불가 (OPS guard)
    return badRequest('unhandled_op');
  } catch (err) {
    const msg = (err as Error).message || 'unknown';
    return NextResponse.json({ error: 'rpc_failed', detail: msg, op }, { status: 500 });
  }
}

// op 종류 export — 호출부 typecheck 동기화 용
export type AdminRpcOp = Op;
