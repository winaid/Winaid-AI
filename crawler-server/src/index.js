const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const fs = require('fs');
const pathModule = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

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

// Health check — 정보 최소화 (보안)
// 버전 문자열, uptime, cachedVideos, hasCookies, hasProxy 등 운영 메타데이터는
// 노출하지 않는다. 버전이 유출되면 특정 취약 버전(yt-dlp CVE 등)을 공격자가
// 타겟팅할 수 있음. 각 의존성은 boolean `checks`로만 응답.
app.get('/health', (req, res) => {
  const checks = {};
  try { execSync('yt-dlp --version', { stdio: 'pipe', timeout: 3000 }); checks.ytdlp = true; } catch { checks.ytdlp = false; }
  try { execSync('ffmpeg -version', { stdio: 'pipe', timeout: 3000 }); checks.ffmpeg = true; } catch { checks.ffmpeg = false; }
  res.json({ status: 'ok', checks });
});

// API 라우트
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
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM 신호 수신, 서버 종료 중...');
  process.exit(0);
});
