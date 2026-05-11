/**
 * /check/[token] — 외부 공유 진단 결과 페이지 (Server Component)
 *
 * 로그인 없이 접근 가능. 스냅샷은 DB 에서 직접 조회 (API 우회).
 * revalidate = 300 (5분 캐시).
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSupabaseClient } from '@winaid/blog-core';
import PublicDiagnosticResult from '../../../components/diagnostic/PublicDiagnosticResult';
import type { PublicDiagnosticView } from '../../../lib/diagnostic/publicShare';

export const revalidate = 300;

interface Props {
  params: Promise<{ token: string }>;
}

async function fetchShareSnapshot(token: string): Promise<PublicDiagnosticView | null> {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(token)) return null;
  let db;
  try {
    db = getSupabaseClient();
  } catch {
    return null;
  }
  const { data, error } = await db
    .from('diagnostic_public_shares')
    .select('snapshot, expires_at, is_revoked')
    .eq('token', token)
    .single();
  if (error || !data || data.is_revoked) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
  return data.snapshot as PublicDiagnosticView;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const view = await fetchShareSnapshot(token);
  if (!view) {
    return { title: '진단 결과를 찾을 수 없습니다 | Winaid' };
  }
  const desc = view.heroSummary
    ? view.heroSummary.slice(0, 155)
    : `${view.siteName}의 AI 검색 노출 종합 점수: ${view.overallScore}점`;
  return {
    title: `${view.siteName} AI 노출 진단 결과 | Winaid`,
    description: desc,
    openGraph: {
      title: `${view.siteName} — AI 노출 진단 점수 ${view.overallScore}점`,
      description: desc,
      type: 'website',
    },
  };
}

export default async function CheckTokenPage({ params }: Props) {
  const { token } = await params;
  const view = await fetchShareSnapshot(token);
  if (!view) notFound();
  return <PublicDiagnosticResult view={view} />;
}
