# WINAI Video Processor

FFmpeg + auto-editor 기반 영상 처리 서버. Railway에 배포되어 [public-app](../public-app/)에서 `/api/video/*` 프록시를 통해 호출된다.

## 역할

촬영 영상 편집 파이프라인(9단계) 중 **서버 처리가 필요한 단계**만 이 서버가 담당:

| 엔드포인트 | 역할 | 주요 도구 |
|---|---|---|
| `/api/video/crop-vertical` | 세로 크롭 (9:16, 얼굴 추적) | FFmpeg |
| `/api/video/silence-remove` | 무음 구간 자동 제거 | auto-editor (Python) |
| `/api/video/apply-style` | 스타일 필터 적용 | FFmpeg |
| `/api/video/add-sound-effects` | 효과음 자동 배치 | FFmpeg + SFX 라이브러리 |
| `/api/video/add-zoom` | 줌 효과 | FFmpeg |
| `/api/video/add-bgm` | BGM 합성 | FFmpeg |
| `/api/video/add-intro-outro` | 인트로/아웃로 (텍스트 오버레이) | FFmpeg `drawtext` (textfile 방식) |
| `/api/video/generate-thumbnail` | 썸네일 생성 | FFmpeg |
| `/api/video/card-to-shorts` | 카드뉴스 → 9:16 쇼츠 변환 | FFmpeg (xfade + concat) |

**STT(자막)과 BGM 검색(Jamendo)은 Next.js 라우트에서 직접 처리** — 이 서버 미사용.

> 2026-04 업데이트: AI 쇼츠 생성기 제거와 함께 `/api/video/ai-assemble` 엔드포인트가 제거되었습니다.

## 인증 (중요)

Day 1 보안 수정으로 `X-API-Secret` 헤더 검증이 추가됨. `/api/*` 경로는 모두 이 헤더가 필요.

```
# 환경변수
PROCESSOR_SHARED_SECRET=<랜덤 32자 이상>
```

- **이 값이 설정되어 있으면** `/api/*` 호출 시 `X-API-Secret: <값>` 헤더 필수. 불일치 → **401 unauthorized**
- **이 값이 비어있으면**(개발 모드) 경고 로그 한 번 찍고 통과. ⚠️ **프로덕션에서는 반드시 설정할 것**
- `/` 와 `/health` 엔드포인트는 인증 **불필요** (상태 체크용)

Next.js `public-app`의 `lib/videoProxy.ts`가 환경변수 `PROCESSOR_SHARED_SECRET`을 읽어 헤더에 자동 주입. 양쪽 값이 동일해야 함.

## 엔드포인트

### `GET /`
상태 확인 (인증 불필요).
```json
{ "status": "ok", "service": "winai-video-processor", "version": "1.0.0" }
```

### `GET /health`
도구 가용성 확인 (인증 불필요, 정보 최소 공개).
```json
{
  "status": "ok",
  "checks": {
    "ffmpeg": true,
    "ffprobe": true,
    "autoEditor": true
  }
}
```
> 이전에는 경로/버전/pipList까지 노출했지만 Day 1에 정보 최소화 (공격자 정보 수집 방지).

### `POST /api/video/:endpoint`
각 라우트마다 FormData 또는 JSON body.
**공통 요구**: `X-API-Secret` 헤더 (PROCESSOR_SHARED_SECRET 설정 시).

엔드포인트별 입출력은 Next.js `lib/videoClient.ts` 및 각 `app/api/video/*/route.ts` 참고.

## 환경변수

| 변수 | 필수 | 용도 |
|---|---|---|
| `PROCESSOR_SHARED_SECRET` | 프로덕션 필수 | 인증 시크릿. Next.js 앱과 동일 값 |
| `ALLOWED_ORIGINS` | 선택 | CORS 허용 오리진 (콤마 구분). 기본: `https://winai.kr,http://localhost:3000` |
| `PORT` | 자동 | Railway가 자동 주입 (기본 3002) |

자세한 내용: [.env.example](./.env.example)

## 로컬 실행

```bash
cd video-processor
npm install
cp .env.example .env
# .env 에 PROCESSOR_SHARED_SECRET 값 작성 (개발 중이면 생략 가능)

npm start
# 또는 파일 변경 시 자동 재시작:
npm run dev
```

사전 요구사항:
- **FFmpeg** (시스템 설치 또는 Dockerfile 기반)
- **auto-editor** (Python) — `pip install auto-editor`
- **Noto CJK 폰트** — 인트로/아웃로 텍스트 오버레이용 (Dockerfile에서 설치)

## Docker / Railway 배포

### Dockerfile
저장소의 `Dockerfile`이 FFmpeg + Python + auto-editor + Noto CJK 폰트를 모두 설치.

### Railway

1. [railway.app](https://railway.app) → New Project → GitHub repo 연결
2. **Root Directory**: `video-processor`
3. Dockerfile 자동 감지
4. **Variables** 탭:
   ```
   PROCESSOR_SHARED_SECRET=<openssl rand -hex 32 로 생성>
   ALLOWED_ORIGINS=https://winai.kr,http://localhost:3000
   ```
5. **Settings → Domains → Generate Domain** → URL 복사
6. 이 URL을 Next.js 앱(public-app)의 `NEXT_PUBLIC_VIDEO_PROCESSOR_URL`로 설정
7. 동일한 `PROCESSOR_SHARED_SECRET` 값을 Next.js 앱에도 설정

### 배포 후 확인

```bash
# 상태 확인 (인증 불필요)
curl https://<your-app>.railway.app/
curl https://<your-app>.railway.app/health

# 인증 실패 테스트 (인증 비활성화 상태가 아닐 때 — 401 나와야 정상)
curl -X POST https://<your-app>.railway.app/api/video/crop-vertical
# → {"error":"unauthorized"}

# 인증 성공 (파일 없이 400 나와야 정상 — 하지만 인증은 통과)
curl -X POST https://<your-app>.railway.app/api/video/crop-vertical \
  -H "X-API-Secret: your-secret-value"
# → {"error":"파일이 필요합니다."}
```

### 배포 순서 주의

**video-processor가 먼저 배포되어야 Next.js 앱이 정상 작동**합니다.
1. video-processor 배포 + `PROCESSOR_SHARED_SECRET` 설정
2. public-app(Next.js)에 동일 시크릿 + video-processor URL 설정
3. public-app 재배포

## 보안 가이드

- **FFmpeg `drawtext`는 `textfile` 방식 사용** — 사용자 텍스트를 workDir의 파일에 쓰고 참조. 필터 문법 인젝션 방어 (Day 1)
- **FFmpeg concat에 `-protocol_whitelist file,pipe`** — SSRF/LFI 방어 (Day 1)
- **텍스트 입력은 200자 캡 + 제어문자 strip** — `writeDrawtextFile` 헬퍼 참조
- **multer `limits.fileSize: 500MB`** — 너무 큰 파일 거부
- **CORS + 인증 이중 방어** — 브라우저는 CORS, 서버사이드 호출은 `X-API-Secret`

## 모니터링

Railway 대시보드:
- **Metrics**: CPU, 메모리, 네트워크
- **Logs**: 부팅 시 `✅ FFmpeg: ...`, `✅ auto-editor: ...` 확인. `Auth: ENABLED` 이면 인증 활성화 상태
- **Deployments**: 빌드 히스토리

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| 부팅 로그에 `❌ FFmpeg 없음` | Dockerfile 빌드 실패 | Railway Build Logs 확인 |
| 부팅 로그에 `Auth: DISABLED` | `PROCESSOR_SHARED_SECRET` 미설정 | 프로덕션이면 즉시 Variables에 추가 |
| 클라이언트가 `401 unauthorized` 받음 | 시크릿 불일치 | public-app과 video-processor의 값이 **정확히 동일**한지 확인 |
| Puppeteer 메모리 부족 | Chromium 사용 (해당 없음 — 이 서버엔 Puppeteer 미사용) | 해당 없음 |
| 변환 타임아웃 | 큰 파일 + 느린 인코더 | Railway 플랜 업그레이드 또는 파일 크기 제한 강화 |
| Korean drawtext 깨짐 | Noto CJK 폰트 미설치 | Dockerfile 확인 |

## 기술 스택

- **Node.js 18+** · Express 4
- **FFmpeg** (시스템 바이너리)
- **auto-editor** (Python, 무음 제거)
- **multer** (파일 업로드, 500MB 한계)
- **helmet** + **compression** + **cors**
- **dotenv**

## 라이선스

Private — All rights reserved.
