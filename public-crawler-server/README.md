# Hospital AI - 크롤링 서버

네이버 블로그 검색 및 콘텐츠 크롤링 전용 서버 (Puppeteer 기반)

## 기능

- ✅ 네이버 블로그 검색 크롤링 (Puppeteer)
- ✅ 블로그 콘텐츠 전체 추출
- ✅ Rate Limiting
- ✅ CORS 설정
- ✅ 에러 핸들링

## 설치

```bash
npm install
```

## 환경 변수 설정

`.env` 파일 생성:

```bash
cp .env.example .env
```

필수 환경 변수:
- `PORT`: 서버 포트 (기본값: 3001)
- `ALLOWED_ORIGINS`: CORS 허용 도메인 (쉼표로 구분)

## 실행

### 개발 모드
```bash
npm run dev
```

### 프로덕션 모드
```bash
npm start
```

## API 엔드포인트

### 1. 네이버 블로그 검색

**POST** `/api/naver/crawl-search`

요청:
```json
{
  "query": "감기",
  "maxResults": 30
}
```

응답:
```json
{
  "items": [
    {
      "title": "블로그 제목",
      "link": "https://blog.naver.com/...",
      "description": "블로그 설명",
      "bloggername": "블로거명"
    }
  ],
  "total": 30,
  "query": "감기",
  "timestamp": "2026-01-22T..."
}
```

### 2. 블로그 콘텐츠 크롤링

**POST** `/api/naver/crawl-content`

요청:
```json
{
  "url": "https://blog.naver.com/..."
}
```

응답:
```json
{
  "content": "블로그 전체 텍스트...",
  "url": "https://blog.naver.com/...",
  "length": 1234,
  "timestamp": "2026-01-22T..."
}
```

### 3. Health Check

**GET** `/health`

응답:
```json
{
  "status": "ok",
  "timestamp": "2026-01-22T...",
  "uptime": 123.45
}
```

## Railway.app 배포

1. Railway 계정 생성: https://railway.app
2. GitHub 저장소 연결
3. 환경 변수 설정:
   - `PORT`: 3001
   - `ALLOWED_ORIGINS`: https://story-darugi.com
   - `NODE_ENV`: production
4. 자동 배포 완료!

## 기술 스택

- **Node.js** 18+
- **Express** - 웹 프레임워크
- **Puppeteer** - 브라우저 자동화
- **CORS** - Cross-Origin 설정
- **Helmet** - 보안
- **Compression** - Gzip 압축

## 라이선스

MIT
