const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const naverCrawlerRouter = require('./routes/naver-crawler');
const youtubeGifRouter = require('./routes/youtube-gif');

const app = express();
const PORT = process.env.PORT || 3001;

// 보안 미들웨어
app.use(helmet());
app.use(compression());

// CORS 설정
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');
app.use(cors({
  origin: (origin, callback) => {
    // origin이 없는 경우(같은 도메인) 또는 허용된 도메인인 경우
    if (!origin || allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        // 와일드카드 패턴 매칭
        const pattern = allowed.replace(/\*/g, '.*');
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

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
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
