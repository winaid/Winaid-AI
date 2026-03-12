# Cloudflare Pages Functions - 백엔드 API

Express 서버를 Cloudflare Pages Functions로 마이그레이션했습니다.

## 📁 구조

```
functions/
├── auth/
│   └── verify.ts          # POST /auth/verify
├── api-keys/
│   ├── get.ts             # GET /api-keys/get
│   ├── save.ts            # POST /api-keys/save
│   └── delete.ts          # DELETE /api-keys/delete
├── content/
│   ├── save.ts            # POST /content/save
│   ├── list.ts            # GET /content/list
│   └── [id].ts            # GET/DELETE /content/:id
├── health.ts              # GET /health
└── stats.ts               # GET /stats
```

## 🔧 Cloudflare KV 설정 (필수!)

배포 전에 Cloudflare Dashboard에서 KV Namespace를 생성해야 합니다.

### 1. KV Namespace 생성

https://dash.cloudflare.com/ → Workers & Pages → KV

**2개의 KV Namespace 생성:**
1. `hospital-ai-api-keys` (API 키 저장용)
2. `hospital-ai-content` (콘텐츠 저장용)

### 2. wrangler.jsonc 업데이트

생성한 KV Namespace ID를 `wrangler.jsonc`에 입력:

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "API_KEYS",
      "id": "여기에_api_keys_KV_ID_입력"
    },
    {
      "binding": "CONTENT_KV",
      "id": "여기에_content_KV_ID_입력"
    }
  ]
}
```

### 3. Cloudflare Pages 환경변수 설정

Dashboard → Pages → hospital-ai → Settings → Environment variables

**Production 환경에 추가:**
- (비밀번호 인증은 제거됨)

## 🚀 배포

```bash
# 프론트엔드 + Functions 함께 배포
npm run deploy
```

또는 GitHub에 푸시하면 자동 배포됩니다.

## 📡 API 엔드포인트

프로덕션: `https://story-darugi.com`

### 인증
- `POST /auth/verify` - 비밀번호 인증

### API 키 관리
- `GET /api-keys/get` - API 키 조회
- `POST /api-keys/save` - API 키 저장
- `DELETE /api-keys/delete` - API 키 삭제

### 콘텐츠 관리
- `POST /content/save` - 콘텐츠 저장
- `GET /content/list` - 콘텐츠 목록
- `GET /content/:id` - 콘텐츠 상세
- `DELETE /content/:id` - 콘텐츠 삭제

### 기타
- `GET /health` - 헬스체크
- `GET /stats` - 통계

## 🔄 이전 Express 서버와의 차이점

### ✅ 장점
- **CORS 문제 해결**: 프론트엔드와 같은 도메인 사용
- **무료 호스팅**: Cloudflare Workers 무료 플랜
- **자동 확장**: 트래픽에 따라 자동 스케일링
- **글로벌 CDN**: 전 세계에서 빠른 응답 속도
- **영구 저장**: KV를 통한 데이터 영속성

### ⚠️ 주의사항
- **In-memory 저장소 제거**: KV 사용으로 변경
- **ID 생성 방식 변경**: 타임스탬프 기반 ID 사용
- **비동기 KV 작업**: 모든 KV 작업은 async/await

## 🧪 로컬 테스트

```bash
# Wrangler로 로컬 개발 서버 실행
npm run dev:sandbox

# 또는
wrangler pages dev dist --kv=API_KEYS --kv=CONTENT_KV
```

## 📝 환경변수

### wrangler.jsonc (로컬 개발용)
```jsonc
{
  "vars": {}
}
```

### Cloudflare Dashboard (프로덕션용)
Settings → Environment variables에서 설정

## 🐛 트러블슈팅

### KV 바인딩 에러
```
Error: binding "API_KEYS" is not defined
```
→ wrangler.jsonc에 KV namespace ID를 올바르게 설정했는지 확인

### CORS 에러
```
Access-Control-Allow-Origin header is missing
```
→ 각 Functions 파일에 `onRequestOptions` 핸들러가 있는지 확인

### API 404 에러
```
GET /api-keys/get → 404
```
→ Functions 파일 경로가 올바른지 확인 (`functions/api-keys/get.ts`)
