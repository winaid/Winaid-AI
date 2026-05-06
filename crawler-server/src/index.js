const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const fs = require('fs');
const pathModule = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

// ── Bearer 인증 미들웨어 (production: secret 미설정 시 fail-fast) ──
// require 시점에 module-scoped 으로 SHARED_SECRET 결정 — production 환경에서는
// 부팅 즉시 실패하므로 silent-allow 회귀 차단. dev 에서는 32-byte hex 자동 생성.
const { bearerAuth } = require('./utils/auth');

// 환경변수에서 YouTube 쿠키 파일 생성
if (process.env.YOUTUBE_COOKIES) {
  const paths = [
    pathModule.join(__dirname, '..', 'youtube-cookies.txt'),
    pathModule.join(__dirname, '..', 'cookies.txt'),
  ];
  for (const p of paths) {
    fs.writeFileSync(p, process.env.YOUTUBE_COOKIES);
  }
  console.log('✅ YouTube 쿠키 파일 생성 완료');
} else {
  const fallback = pathModule.join(__dirname, '..', 'cookies.txt');
  if (fs.existsSync(fallback)) {
    console.log('📎 기존 cookies.txt 사용');
  } else {
    console.log('⚠️ YouTube 쿠키 없음 — YOUTUBE_COOKIES 환경변수 설정 권장');
  }
}

const naverCrawlerRouter = require('./routes/naver-crawler');
const youtubeGifRouter = require('./routes/youtube-gif');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy: Railway/Cloudflare 1-hop 뒤에서 X-Forwarded-For 의 첫 항목을
// req.ip 로 신뢰. 미설정 시 모든 요청이 같은 ingress IP 로 보여 rate limit 무력.
// 1 = 가장 가까운 한 hop 만 신뢰 (그 이상은 spoof 위험).
app.set('trust proxy', 1);

// 보안 미들웨어
app.use(helmet());
app.use(compression());

// CORS 설정
//
// ALLOWED_ORIGINS 파싱:
//   - 미설정 시 `''.split(',')` → `['']` 이 되어 빈 문자열이 리스트에 남고,
//     이후 `origin === ''` 비교가 통과하는 엣지 케이스가 생김 → filter(Boolean)로 차단.
//
// 와일드카드 매칭:
//   - 과거: `allowed.replace(/\*/g, '.*')` 만 하고 `new RegExp(...).test(origin)`.
//     앵커(`^` / `$`)가 없고 `.` 이스케이프도 없어서 `*.example.com` 이
//     `evil-example.com.attacker.io` 같은 것도 통과시켰음.
//   - 수정: `.` 은 `\\.` 로 이스케이프, 양끝에 `^` / `$` 앵커 추가.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // origin이 없는 경우(같은 도메인) 또는 허용된 도메인인 경우
    if (!origin || allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        // 와일드카드 패턴 매칭 — 점 이스케이프 + 앵커 필수 (SSRF/서브도메인 우회 방어)
        const pattern = '^' + allowed.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
        return new RegExp(pattern).test(origin);
      }
      return origin === allowed;
    })) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check — 정보 최소화 (보안) + 부팅 시 1회 캐시 (DoS 방어)
// 버전 문자열, uptime, cachedVideos, hasCookies, hasProxy 등 운영 메타데이터는
// 노출하지 않는다. 버전이 유출되면 특정 취약 버전(yt-dlp CVE 등)을 공격자가
// 타겟팅할 수 있음. 각 의존성은 boolean `checks`로만 응답.
//
// 과거 (SVR-003 회귀): 매 hit 마다 execSync('yt-dlp --version'), execSync('ffmpeg -version').
// /health 는 인증 우회 + LB probe 라 외부 공격자가 초당 수십 hit 시 fork 폭발 +
// 이벤트 루프 블로킹. timeout 3000 ms 만 추가되어 있었음.
//
// 수정: 부팅 시 1회 동기 검사 + 모듈 스코프 캐시. TTL 60초로 주기적 refresh —
// 운영 중 yt-dlp / ffmpeg binary 가 사라지는 케이스도 1분 안에 감지.
const HEALTH_TTL_MS = 60_000;
let healthCache = { ts: 0, checks: { ytdlp: false, ffmpeg: false } };

function refreshHealthChecks() {
  const checks = { ytdlp: false, ffmpeg: false };
  try { execSync('yt-dlp --version', { stdio: 'pipe', timeout: 3000 }); checks.ytdlp = true; } catch { /* false */ }
  try { execSync('ffmpeg -version', { stdio: 'pipe', timeout: 3000 }); checks.ffmpeg = true; } catch { /* false */ }
  healthCache = { ts: Date.now(), checks };
}

// 부팅 시 1회 즉시 실행 — 첫 /health hit 가 cold 가 되지 않도록.
refreshHealthChecks();

app.get('/health', (req, res) => {
  if (Date.now() - healthCache.ts > HEALTH_TTL_MS) {
    refreshHealthChecks();
  }
  res.json({ status: 'ok', checks: healthCache.checks });
});

// API 라우트 — 모든 /api/* 는 Bearer 인증 통과 필수.
// /health 는 위에서 별도 마운트 — bearerAuth 명시적으로 skipPaths 에 포함시켜
// 마운트 순서 의존성 제거 (SVR-002 권고). 향후 누군가 app.use('/health', ...)
// 위치를 바꾸거나 /api/health 형태로 옮겨도 LB probe 동작 유지.
app.use('/api', bearerAuth(['/health']));
app.use('/api/naver', naverCrawlerRouter);
app.use('/api/youtube', youtubeGifRouter);

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.url}`
  });
});

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error('에러 발생:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`🚀 크롤링 서버 시작: http://localhost:${PORT}`);
  console.log(`📝 환경: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 CORS 허용 도메인: ${allowedOrigins.join(', ')}`);
  console.log('🔑 Auth: Bearer 토큰 필수 (/health 제외)');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM 신호 수신, 서버 종료 중...');
  process.exit(0);
});
