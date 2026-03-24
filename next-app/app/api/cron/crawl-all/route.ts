/**
 * /api/cron/crawl-all — 스케줄 기반 전체 병원 자동 크롤링 + 채점
 *
 * Vercel Cron Jobs가 매일 10~18시, 1시간 간격으로 GET 호출.
 * CRON_SECRET 환경변수로 보호 (Vercel이 Authorization 헤더에 Bearer 토큰 전달).
 *
 * 기본: 크롤링 + 채점 (말투 분석 OFF)
 * 쿼리 파라미터 ?includeStyle=true 로 말투 분석까지 실행 가능.
 */
import { NextRequest, NextResponse } from 'next/server';
import { crawlAndScoreAllHospitals } from '../../../../lib/styleService';

export const maxDuration = 300; // 5분 (Vercel Pro/Enterprise)
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 1) 인증 확인 — Vercel Cron은 CRON_SECRET을 Authorization 헤더로 전달
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // 2) 운영 시간 체크 (KST 10:00 ~ 18:00)
  const now = new Date();
  const kstHour = (now.getUTCHours() + 9) % 24;
  if (kstHour < 10 || kstHour >= 18) {
    return NextResponse.json({
      skipped: true,
      reason: `운영 시간 외 (KST ${kstHour}시, 허용: 10~18시)`,
      kstHour,
    });
  }

  // 3) 옵션 파싱
  const includeStyle = request.nextUrl.searchParams.get('includeStyle') === 'true';

  // 4) 실행
  const startedAt = new Date().toISOString();
  const logs: string[] = [];

  try {
    await crawlAndScoreAllHospitals(
      (msg, done, total) => {
        logs.push(`[${done + 1}/${total}] ${msg}`);
      },
      { includeStyleAnalysis: includeStyle },
    );

    return NextResponse.json({
      success: true,
      startedAt,
      completedAt: new Date().toISOString(),
      includeStyle,
      logCount: logs.length,
      lastLogs: logs.slice(-10), // 마지막 10개 로그
    });
  } catch (err: unknown) {
    return NextResponse.json({
      success: false,
      startedAt,
      failedAt: new Date().toISOString(),
      error: (err as Error).message,
      includeStyle,
      logCount: logs.length,
      lastLogs: logs.slice(-10),
    }, { status: 500 });
  }
}
