/**
 * WINAI Blog Publisher — 메인 진입점
 *
 * 로컬에서 실행하면:
 * 1. API 서버 시작 (포트 17580)
 * 2. winai.kr에서 발행 요청을 받으면
 * 3. Playwright로 네이버 블로그 자동 입력
 */

import dotenv from 'dotenv';
dotenv.config();

import { startServer } from './api/server';
import { log } from './utils/logger';

console.log('');
console.log('╔═══════════════════════════════════════════════════╗');
console.log('║                                                   ║');
console.log('║   🚀 WINAI Blog Publisher v1.0.0                  ║');
console.log('║                                                   ║');
console.log('║   네이버 블로그 자동 발행 로컬 앱                  ║');
console.log('║                                                   ║');
console.log('║   http://localhost:17580                           ║');
console.log('║                                                   ║');
console.log('╚═══════════════════════════════════════════════════╝');
console.log('');

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  log.info('종료 중...');
  const { closeBrowser } = await import('./naver/login');
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  const { closeBrowser } = await import('./naver/login');
  await closeBrowser();
  process.exit(0);
});
