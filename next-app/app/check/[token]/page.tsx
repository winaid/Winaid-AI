/**
 * /check/[token] — Backward-compatibility redirect.
 *
 * A1a (2026-05-08): 외부 공유 진단 결과 페이지는 public-app 으로 이전됐다
 * ("외부용 먼저" 정책). 본 라우트는 옛 next-app 도메인의 토큰 URL 을 받아
 * public-app 도메인으로 영구 redirect 한다.
 *
 * 도메인은 환경변수 `NEXT_PUBLIC_PUBLIC_APP_URL` 로 주입 (Vercel 의 next-app
 * preview / production 양쪽에 설정 필요). 미설정 시 `https://winai.kr` fallback.
 *
 * 본 redirect 는 3개월 후(2026-08) 제거 예정 — 그 시점에 옛 토큰 URL 이
 * 외부에 거의 남지 않을 것으로 가정. 발급된 토큰이 많은 환경에서는 redirect
 * 보존 기간을 연장하는 별도 결정.
 */

import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ token: string }>;
}

const FALLBACK_PUBLIC_APP_URL = 'https://winai.kr';

export default async function CheckRedirectPage({ params }: Props) {
  const { token } = await params;
  const base = process.env.NEXT_PUBLIC_PUBLIC_APP_URL || FALLBACK_PUBLIC_APP_URL;
  redirect(`${base}/check/${token}`);
}
