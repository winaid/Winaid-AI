# Sentry Setup Guide (public-app)

OPS-001 / phase 1 — Winaid public-app 의 Sentry SDK 운영 가이드.

## 현재 상태 (phase 1)

- `public-app` 에 `@sentry/nextjs` SDK 도입 완료.
- DSN 미설정 시 SDK 는 **no-op** (Sentry.init 미호출). 머지 즉시 운영 영향 0.
- source map 업로드는 **본 PR 범위 밖** — `SENTRY_AUTH_TOKEN` 미설정 시 build-time 업로드 skip (silent).
- `next-app` 도입은 **별도 follow-up PR**.

## 1. Sentry 계정 / 프로젝트 생성

1. https://sentry.io 가입 또는 기존 organization 진입.
2. **New Project** → Platform: **Next.js** → 프로젝트명 `winaid-public` (또는 팀 합의 이름).
3. 생성 후 **Settings → Client Keys (DSN)** 화면에서 DSN 복사.
   - 형식: `https://<key>@<org>.ingest.sentry.io/<project-id>`

## 2. Vercel 환경변수 등록

Vercel → 프로젝트 (public-app) → **Settings → Environment Variables**:

| Key | Value | Environments |
|-----|-------|--------------|
| `NEXT_PUBLIC_SENTRY_DSN` | (Sentry DSN) | Production, Preview |
| `SENTRY_DSN` | (동일 DSN — 서버/edge) | Production, Preview |
| `SENTRY_ORG` | (Sentry org slug) | Production, Preview |
| `SENTRY_PROJECT` | `winaid-public` | Production, Preview |
| `SENTRY_AUTH_TOKEN` | (Sentry **auth token**, source map 업로드용) | Production only — follow-up PR 에서 활용 |

> `NEXT_PUBLIC_SENTRY_DSN` 은 클라이언트 번들에 포함됨 — Sentry DSN 은 공개 식별자이므로 의도된 노출.

## 3. 첫 에러 확인 방법

배포 후 1회 검증:

1. 임시 페이지에 의도적 throw 삽입 (또는 Sentry 가 제공하는 `/sentry-example-page` 라우트).
2. 페이지 접속 → 에러 발생.
3. Sentry dashboard → **Issues** 에 1~2분 내 수집 확인.
4. 검증 후 throw 제거.

## 4. 비용 / 샘플링 정책

- `tracesSampleRate: 0.1` — performance trace 10% 샘플 (free tier 5k tx/month 안전).
- `replaysSessionSampleRate: 0` + `replaysOnErrorSampleRate: 0` — Session Replay **완전 비활성** (의료 컨텍스트 PIPA).
- 에러 이벤트는 100% 수집 (free tier 5k errors/month).

월간 트래픽 ~1k DAU 가정 시 free plan 내 운영 가능. 초과 시 Team plan ($26/mo) 검토.

## 5. PII 정책 (PIPA / 의료 컨텍스트)

본 SDK 는 다음 세 단계 redaction:

1. **`sendDefaultPii: false`** — Sentry 의 자동 PII 수집 (IP, 쿠키 등) off.
2. **`beforeSend` redaction** — 모든 이벤트에 대해:
   - `event.request.data` 삭제 (POST body)
   - `event.request.cookies` 삭제
   - `event.request.headers.authorization` / `cookie` 삭제
   - `event.extra` 삭제
3. **Session Replay 비활성** — DOM/입력 캡처 0%.

manual `Sentry.captureException` 호출은 본 PR 범위에 없음 — Next.js 자동 캡처 (server error / client error boundary) 만 동작.

## 6. Follow-up PR

본 PR 머지 후 다음 두 PR 분리 진행:

- **next-app Sentry 도입** — 동일 패턴 (sentry config 4 파일 + next.config.ts wrap).
- **source map 업로드** — CI 에 `SENTRY_AUTH_TOKEN` 추가 + Vercel build 에서 자동 업로드. release tracking 연동.

## 사용자 액션 요약

본 PR 머지 후:

1. Sentry 계정에서 DSN 발급.
2. Vercel 환경변수 등록 (위 표).
3. 다음 배포에서 자동으로 SDK 활성.
4. 첫 에러 1건 수집 검증.
