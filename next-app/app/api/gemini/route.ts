/**
 * /api/gemini — Gemini 프록시 API Route Handler
 *
 * TODO: 기존 api/gemini.js의 로직을 Next.js Route Handler로 전환
 * 현재는 health check 뼈대만 존재
 *
 * 전환 시 주의:
 * - req/res 패턴 → NextRequest/NextResponse 패턴
 * - process.env 접근은 동일하게 동작
 * - streaming 응답은 ReadableStream 사용
 * - maxDuration은 route segment config로 설정
 */
import { NextRequest, NextResponse } from 'next/server';

// Vercel Serverless Function 설정
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Gemini API route — Next.js migration stub',
    timestamp: new Date().toISOString(),
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(_request: NextRequest) {
  // TODO: 기존 api/gemini.js 로직 포팅
  return NextResponse.json(
    { error: 'Not yet migrated — stub route' },
    { status: 501 }
  );
}
