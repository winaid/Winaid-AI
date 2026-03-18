# 네이버 API 설정 가이드

## 🔑 현재 설정된 네이버 API 키

```
클라이언트 ID: OWaRJ7Eu9DxITLQj3yxx
클라이언트 Secret: jprWSZyNyK
```

---

## 📝 설정 방법

### 1️⃣ 로컬 개발 환경 (완료됨 ✅)

`.dev.vars` 파일이 생성되어 로컬 개발 시 자동으로 사용됩니다.

```bash
# 로컬 개발 서버 실행 시 자동 적용
npm run dev
# 또는
npx wrangler pages dev dist
```

---

### 2️⃣ Cloudflare Pages 프로덕션 환경 설정

#### 방법 A: Cloudflare 대시보드 (권장)

1. **Cloudflare 대시보드 접속**
   - https://dash.cloudflare.com/

2. **Pages 프로젝트 선택**
   - `hospital-ai` 프로젝트 클릭

3. **Settings → Environment variables**로 이동

4. **환경 변수 추가**
   - Variable name: `NAVER_CLIENT_ID`
   - Value: `OWaRJ7Eu9DxITLQj3yxx`
   - Environment: `Production` 선택
   - **Add variable** 클릭

5. **두 번째 환경 변수 추가**
   - Variable name: `NAVER_CLIENT_SECRET`
   - Value: `jprWSZyNyK`
   - Environment: `Production` 선택
   - **Add variable** 클릭

6. **재배포 필요**
   - 환경 변수 추가 후 재배포해야 적용됨

---

#### 방법 B: Wrangler CLI (선택)

```bash
# Cloudflare 로그인
npx wrangler login

# 환경 변수 설정
npx wrangler pages secret put NAVER_CLIENT_ID
# 프롬프트에 값 입력: OWaRJ7Eu9DxITLQj3yxx

npx wrangler pages secret put NAVER_CLIENT_SECRET
# 프롬프트에 값 입력: jprWSZyNyK
```

---

## 🧪 테스트 방법

### API 엔드포인트 테스트

```bash
# 로컬 테스트
curl "http://localhost:8788/api/naver-news?query=병원&display=5"

# 프로덕션 테스트
curl "https://your-project.pages.dev/api/naver-news?query=병원&display=5"
```

### 정상 응답 예시

```json
{
  "lastBuildDate": "Fri, 17 Jan 2025 ...",
  "total": 1234,
  "start": 1,
  "display": 5,
  "items": [
    {
      "title": "...",
      "link": "...",
      "description": "...",
      "pubDate": "..."
    }
  ]
}
```

### 오류 응답 예시

```json
{
  "error": "Naver API credentials not configured",
  "message": "서버에 네이버 API 키가 설정되지 않았습니다."
}
```

---

## 🔒 보안 주의사항

1. **`.dev.vars` 파일은 절대 Git에 커밋하지 마세요**
   - 이미 `.gitignore`에 추가되어 있음 ✅

2. **API 키는 환경 변수로만 관리**
   - 코드에 직접 하드코딩 금지
   - `.env` 파일도 Git에 커밋 금지

3. **API 키 노출 시 즉시 재발급**
   - 네이버 개발자 센터에서 재발급 가능
   - https://developers.naver.com/apps/

---

## 📚 관련 문서

- [Cloudflare Pages Environment Variables](https://developers.cloudflare.com/pages/configuration/environment-variables/)
- [Wrangler Secret Management](https://developers.cloudflare.com/workers/wrangler/commands/#secret)
- [네이버 검색 API 가이드](https://developers.naver.com/docs/serviceapi/search/news/news.md)

---

## ⚙️ 코드 위치

네이버 API를 사용하는 파일:
- `functions/api/naver-news.js` - Cloudflare Functions 핸들러
- 환경 변수는 `context.env.NAVER_CLIENT_ID`, `context.env.NAVER_CLIENT_SECRET`로 접근

---

## 🔄 업데이트 이력

- 2025-01-17: 초기 설정 완료
  - Client ID: OWaRJ7Eu9DxITLQj3yxx
  - Client Secret: jprWSZyNyK
  - `.dev.vars` 파일 생성
