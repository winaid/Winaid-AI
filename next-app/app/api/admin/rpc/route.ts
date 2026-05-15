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
export const maxDuration = 60;

type Op = 'stats' | 'posts' | 'delete-post' | 'delete-all';
const OPS: ReadonlySet<string> = new Set(['stats', 'posts', 'delete-post', 'delete-all']);

// 배치 DELETE 파라미터 — Postgres statement_timeout 회피
const DELETE_BATCH_SIZE = 500;
const DELETE_BUDGET_MS = 50_000; // maxDuration 60s - 10s 응답 여유

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
      // RPC 의존 제거 + content 컬럼 제외. generated_posts.content 에 base64 이미지가
      // 박혀 row 하나가 수 MB → 100 row SELECT * 면 Postgres statement_timeout 초과
      // (운영 보고: "canceling statement due to statement timeout"). 상세 본문은
      // 클라이언트가 selectedPost 클릭 시 getPostContent(id) 로 lazy fetch.
      let query = supabaseAdmin
        .from('generated_posts')
        .select('id, post_type, title, hospital_name, category, user_email, topic, char_count, created_at')
        .order('created_at', { ascending: false })
        .range(offsetCount, offsetCount + limitCount - 1);
      if (filterPostType) query = query.eq('post_type', filterPostType);
      if (filterHospital) query = query.eq('hospital_name', filterHospital);
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: 'rpc_failed', detail: error.message, op }, { status: 500 });
      // 클라이언트 GeneratedPost 인터페이스 호환 — content placeholder 주입 (이미지/기타).
      const slim = (data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        content: row.post_type === 'image' ? '[이미지]' : '',
      }));
      return NextResponse.json({ data: slim });
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
      // 배치 DELETE — 한 번에 모두 지우면 Postgres statement_timeout 초과
      // ("canceling statement due to statement timeout"). 500 row 씩 잘라
      // 50s 안에 처리한 만큼만 반환. 더 남으면 클라이언트가 같은 op 재호출 (idempotent).
      const startTime = Date.now();
      let totalDeleted = 0;
      try {
        while (Date.now() - startTime < DELETE_BUDGET_MS) {
          // 1) 다음 배치의 id 만 조회 (content 컬럼 제외 — SELECT 도 가벼움)
          const { data: idRows, error: selectErr } = await supabaseAdmin
            .from('generated_posts')
            .select('id')
            .limit(DELETE_BATCH_SIZE);
          if (selectErr) {
            return NextResponse.json(
              { error: 'rpc_failed', detail: selectErr.message, op, partialCount: totalDeleted },
              { status: 500 },
            );
          }
          if (!idRows || idRows.length === 0) break; // 남은 row 0 — 완료

          // 2) 추출한 id 만 IN 절로 DELETE — row 수 cap → statement_timeout 안 닿음
          const ids = (idRows as { id: string }[]).map((r) => r.id);
          const { error: deleteErr, count } = await supabaseAdmin
            .from('generated_posts')
            .delete({ count: 'exact' })
            .in('id', ids);
          if (deleteErr) {
            return NextResponse.json(
              { error: 'rpc_failed', detail: deleteErr.message, op, partialCount: totalDeleted },
              { status: 500 },
            );
          }
          totalDeleted += count ?? ids.length;

          // 배치보다 적게 잡혔다 = 전부 처리 끝
          if (idRows.length < DELETE_BATCH_SIZE) break;
        }
        return NextResponse.json({ data: totalDeleted });
      } catch (err) {
        const msg = (err as Error).message || 'unknown';
        return NextResponse.json(
          { error: 'rpc_failed', detail: msg, op, partialCount: totalDeleted },
          { status: 500 },
        );
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
