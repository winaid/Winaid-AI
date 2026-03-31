# 🚀 Railway.app 배포 가이드

## 1단계: Railway 계정 생성

1. https://railway.app 접속
2. **"Start a New Project"** 클릭
3. GitHub 계정으로 로그인

## 2단계: 프로젝트 생성

### 옵션 A: GitHub 저장소 연결 (추천)

1. Railway 대시보드에서 **"Deploy from GitHub repo"** 선택
2. `Hospital-AI` 저장소 선택
3. **Root Directory** 설정: `crawler-server`
4. 자동 배포 시작!

### 옵션 B: CLI로 배포

```bash
# Railway CLI 설치
npm install -g @railway/cli

# 로그인
railway login

# 프로젝트 생성 및 배포
cd /home/user/webapp/crawler-server
railway init
railway up
```

## 3단계: 환경 변수 설정

Railway 대시보드에서:

1. 프로젝트 선택
2. **Variables** 탭 클릭
3. 다음 변수 추가:

```
PORT=3001
NODE_ENV=production
ALLOWED_ORIGINS=https://story-darugi.com,https://*.pages.dev
MAX_REQUESTS_PER_MINUTE=30
MAX_RESULTS_PER_REQUEST=100
HEADLESS=true
BROWSER_TIMEOUT=30000
```

## 4단계: 배포 URL 확인

1. **Settings** → **Domains** 탭
2. **Generate Domain** 클릭
3. 생성된 URL 복사 (예: `https://your-app.railway.app`)

## 5단계: Cloudflare Pages 연동

### 메인 프로젝트의 환경 변수에 크롤링 서버 URL 추가

Cloudflare Dashboard → Workers & Pages → `story-darugi` → Settings → Environment variables:

```
CRAWLER_SERVER_URL=https://your-app.railway.app
```

### 메인 프로젝트 코드 수정

`src/services/naverSearchService.ts` 파일에서:

```typescript
// 기존
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// 변경
const CRAWLER_SERVER_URL = import.meta.env.VITE_CRAWLER_SERVER_URL || 'https://your-app.railway.app';
```

크롤링 API 호출 부분:

```typescript
// 기존
const response = await fetch('/api/naver/crawl-search', {

// 변경
const response = await fetch(`${CRAWLER_SERVER_URL}/api/naver/crawl-search`, {
```

## 6단계: 테스트

### Health Check
```bash
curl https://your-app.railway.app/health
```

### 검색 테스트
```bash
curl -X POST https://your-app.railway.app/api/naver/crawl-search \
  -H "Content-Type: application/json" \
  -d '{"query": "감기", "maxResults": 10}'
```

## 비용

- **무료 티어**: $5 크레딧/월 (취미 프로젝트에 충분)
- **Pro 플랜**: $20/월 (더 많은 사용량)

## 모니터링

Railway 대시보드에서:
- 📊 **Metrics**: CPU, 메모리, 네트워크 사용량
- 📝 **Logs**: 실시간 로그 확인
- 🔄 **Deployments**: 배포 히스토리

## 문제 해결

### Puppeteer 메모리 부족
환경 변수 추가:
```
NODE_OPTIONS=--max-old-space-size=2048
```

### 타임아웃 에러
환경 변수 조정:
```
BROWSER_TIMEOUT=60000
```

### CORS 에러
`ALLOWED_ORIGINS`에 도메인 추가

## 자동 재배포

GitHub 저장소 푸시 시 자동으로 Railway에 배포됩니다!

```bash
git add .
git commit -m "Update crawler server"
git push origin main
```

## 완료! 🎉

이제 Railway에서 안정적으로 네이버 크롤링이 작동합니다!
