# WINAID Public Crawler Server — Railway 배포 가이드

## 개요

네이버 블로그 크롤링 전용 서버입니다. Puppeteer(Chromium)를 사용하므로 서버리스 환경이 아닌 컨테이너 기반 호스팅이 필요합니다.

## Railway 배포 방법

### 1. GitHub 저장소 연결

1. [Railway](https://railway.app) 로그인
2. **New Project** > **Deploy from GitHub repo**
3. `winaid-public-crawler` 저장소 선택 (아직 없으면 아래 "GitHub 저장소 생성" 참고)

### 2. 환경변수 설정

Railway Dashboard > 프로젝트 > **Variables** 탭에서:

| 변수 | 값 | 설명 |
|------|-----|------|
| `ALLOWED_ORIGINS` | `https://winai.kr,http://localhost:3000` | Vercel 배포 URL로 교체 |
| `NODE_ENV` | `production` | |

`PORT`는 Railway가 자동 설정하므로 넣지 않아도 됩니다.

### 3. 배포 확인

Railway가 자동으로 빌드 & 배포합니다. 완료 후:

1. Railway Dashboard에서 제공하는 URL 확인 (예: `https://winaid-public-crawler-production-xxxx.up.railway.app`)
2. 브라우저에서 `{URL}/health` 접속 → `{"status":"ok"}` 응답 확인

### 4. WINAID 앱에 연결

#### 로컬 개발
`public-app/.env.local`에 추가:
```
NEXT_PUBLIC_CRAWLER_URL=https://your-railway-url.up.railway.app
```

#### Vercel 배포
Vercel Dashboard > Settings > Environment Variables에 추가:
```
NEXT_PUBLIC_CRAWLER_URL=https://your-railway-url.up.railway.app
```

## GitHub 저장소 생성

```bash
cd public-crawler-server
# GitHub 웹에서 winaid-public-crawler 저장소를 private로 생성한 후:
git remote add origin https://github.com/YOUR_ORG/winaid-public-crawler.git
git push -u origin main
```

## Docker 로컬 테스트

```bash
docker build -t winaid-crawler .
docker run -p 3001:3001 -e ALLOWED_ORIGINS=http://localhost:3000 winaid-crawler
```

## 참고

- Chromium + 한글 폰트(fonts-noto-cjk)가 Docker 이미지에 포함됩니다
- Railway의 Nixpacks 또는 Dockerfile 자동 감지로 배포됩니다
- 무료 플랜에서도 동작하지만, 월 500시간 제한이 있습니다
