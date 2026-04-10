# WINAID Public App

외부 출시용 Next.js 앱. 병원/치과/피부과 등을 위한 AI 콘텐츠 자동 생성 SaaS.
[루트 README](../README.md)의 public-app 구성요소.

> 참고: `next-app/`는 내부 운영 도구(admin · influencer · strengths · youtube 등). 이 `public-app/`가 고객이 실제로 쓰는 앱입니다.

## 주요 기능

- **블로그 생성** — 5단계 AI 파이프라인 (초안 → AI냄새 제거 → SEO → 의료법 검증 → 최종)
- **카드뉴스 생성** — 16종 레이아웃 + fabric.js 캔버스 에디터 + 드래프트 자동저장 + 슬라이드쇼 + PNG/JPG/ZIP/PDF 다운로드 + 쇼츠 변환
- **보도자료 생성** — 병원 웹사이트 분석 + 3인칭 기사체
- **AI 이미지 생성** — 8개 카테고리 (캘린더, 포스터, 배너 등)
- **AI 보정 (Refine)** — 자동 보정 6종 + 채팅 모드
- **촬영 영상 편집** — 9단계 파이프라인 (크롭→스타일→무음→자막→효과음→줌→BGM→인트로→썸네일)
- **의료광고법 검증** — 전 필드 실시간 검증 + 원클릭 교체/제거

> "AI 쇼츠 생성기"(AI로 처음부터 영상 만들기)는 2026-04에 제거되었습니다. 촬영 영상 편집 파이프라인만 남았습니다.

## 기술 스택

- **프레임워크**: Next.js 16 + React 19 + TypeScript 5.8
- **스타일링**: Tailwind CSS 4
- **DB/인증**: Supabase (PostgreSQL + Auth + Storage)
- **AI**: Google Gemini API (멀티키 로테이션)
- **카드뉴스 에디터**: fabric.js 7 · jspdf · html2canvas · jszip
- **영상 처리**: video-processor (별도 Railway 서버, FFmpeg + auto-editor)
- **E2E 테스트**: Playwright 1.58
- **배포**: Vercel

## 빠른 시작

```bash
npm install
cp .env.example .env.local
# .env.local 의 값을 실제 값으로 교체

npm run dev
# http://localhost:3000
```

## 환경변수

**필수** — 이게 없으면 기본 기능이 안 돌아감:

| 변수 | 용도 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `GEMINI_API_KEY` | Google Gemini API 키 |

**선택** — 개별 기능이 이 변수 없으면 비활성:

| 변수 | 없으면 비활성되는 기능 |
|---|---|
| `GEMINI_API_KEY_2`, `_3` | Gemini 멀티키 로테이션 (기본 키만 사용) |
| `NEXT_PUBLIC_VIDEO_PROCESSOR_URL` | 촬영 영상 편집 전체 |
| `PROCESSOR_SHARED_SECRET` | video-processor 인증 (없으면 Railway 서버에서 거절됨) |
| `NEXT_PUBLIC_CRAWLER_URL` | 블로그 크롤링 (말투 학습) |
| `PEXELS_API_KEY` | Pexels 이미지 검색 |
| `PIXABAY_API_KEY` | Pixabay 이미지 검색 |
| `REMOVE_BG_API_KEY` | remove.bg 배경 제거 |
| `JAMENDO_CLIENT_ID` | Jamendo BGM 검색 |
| `HUGGINGFACE_API_KEY` | HuggingFace AI BGM 생성 |
| `GOOGLE_CLOUD_PROJECT_ID` | Google Cloud STT (자막 생성) |
| `GOOGLE_CLOUD_STT_REGION` | STT 리전 (기본 us-central1) |
| `GOOGLE_CLOUD_CREDENTIALS_JSON` | GCP 서비스 계정 JSON (원문 또는 파일 경로는 `GOOGLE_APPLICATION_CREDENTIALS`) |
| `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX` | Google Custom Search (이미지) |

⚠️ `PROCESSOR_SHARED_SECRET`은 **서버 전용**. 절대 `NEXT_PUBLIC_` prefix를 붙이지 말 것 (브라우저 번들에 노출됨).

전체 목록: [.env.example](./.env.example)

### 인증 동작 방식 (useAuthGuard)

- Supabase 미설정 → 게스트 모드로 즉시 진입 (테스트/개발 친화적)
- Supabase 설정 + 세션 있음 → 로그인 사용자
- Supabase 설정 + 세션 없음 → `/auth`로 리다이렉트. `?guest=1` 쿼리가 있으면 게스트 진입 허용 (E2E 테스트가 이 플래그 활용)

## 프로젝트 구조

```
public-app/
├── app/
│   ├── (dashboard)/            # 인증 가드 그룹
│   │   ├── app/                # 대시보드 홈
│   │   ├── blog/               # 블로그 생성 (5단계)
│   │   ├── card_news/          # 카드뉴스
│   │   ├── press/              # 보도자료
│   │   ├── refine/             # AI 보정
│   │   ├── image/              # 이미지 생성
│   │   ├── video_edit/         # 영상 편집 (9단계)
│   │   ├── mypage/             # 마이페이지 + 히스토리
│   │   └── history/            # → mypage 리다이렉트
│   ├── auth/                   # 로그인/회원가입
│   ├── api/
│   │   ├── gemini/             # Gemini 프록시 (멀티키 로테이션 + 키 redact)
│   │   ├── image/              # Gemini 이미지 생성
│   │   ├── landing-chat/       # 랜딩 페이지 전용 챗봇 (자체 rate limit)
│   │   ├── naver/              # 네이버 검색/키워드/뉴스
│   │   ├── pexels/, pixabay/   # 이미지 검색
│   │   ├── pexels-query/       # Gemini로 검색어 변환
│   │   ├── remove-bg/          # 배경 제거 (remove.bg)
│   │   ├── video/              # 영상 처리 API (video-processor 프록시)
│   │   │   ├── crop-vertical, silence-remove, generate-subtitles, ...
│   │   │   └── card-to-shorts  # 카드뉴스 → 쇼츠 변환
│   │   └── youtube/            # 유튜브 key-moments
│   └── page.tsx                # 랜딩
├── components/
│   ├── card-news/              # SlideEditor, SlideRenderers, InteractivePreview 등
│   ├── video-edit/             # 9개 step 컴포넌트 + VideoPlayer/WaveformBar/SubtitleTimeline
│   └── landing/                # LandingHero, LandingSections
├── lib/                        # 프롬프트·검증·저장·드래프트·비디오 클라이언트
│   ├── cardNewsPrompt.ts
│   ├── cardNewsLayouts.ts      # SlideData 타입 + parseProSlidesJson
│   ├── cardNewsDraft.ts        # 드래프트 (userId 바인딩 + idle timeout 48h)
│   ├── medicalAdValidation.ts  # 의료광고법 (wordBoundary + whitelist)
│   ├── promptSanitize.ts       # 프롬프트 인젝션 방어
│   ├── videoProxy.ts           # video-processor 프록시 (X-API-Secret 자동 주입)
│   ├── guestRateLimit.ts       # 게스트 IP rate limit (in-memory)
│   └── fontStorage.ts          # 커스텀 폰트 IndexedDB 저장소
├── hooks/
│   ├── useAuthGuard.ts
│   └── useBlobUrl.ts           # Blob URL 자동 revoke 훅
├── e2e/                        # Playwright 스모크 테스트 (11 파일, 38 tests)
│   ├── helpers/mocks.ts        # 공용 mock 유틸
│   ├── landing.spec.ts
│   ├── auth.spec.ts
│   ├── blog.spec.ts
│   ├── card-news.spec.ts
│   ├── card-news-dnd.spec.ts   # 캔버스 드래그앤드롭 통합
│   ├── video-edit.spec.ts
│   ├── history.spec.ts
│   ├── refine.spec.ts
│   ├── not-found.spec.ts
│   ├── api.spec.ts
│   └── smoke.spec.ts           # integration (RUN_INTEGRATION=1 에서만 실행)
└── sql/                        # Supabase 초기 SQL
```

## 개발 명령어

```bash
npm run dev       # 개발 서버
npm run build     # 프로덕션 빌드
npm run lint      # tsc --noEmit (타입 체크)
npm run test:e2e  # Playwright 스모크 (38 tests)
npm run test:e2e:ui  # Playwright UI 모드 (디버깅)
```

## E2E 테스트

```bash
# 최초 1회: Playwright 브라우저 설치
npx playwright install chromium

# 전체 실행 (dev 서버 자동 기동)
npm run test:e2e

# 특정 파일만
npx playwright test e2e/card-news.spec.ts

# 프로덕션 URL 대상
BASE_URL=https://winai.kr npx playwright test

# 실제 Supabase/Gemini 호출 (integration)
RUN_INTEGRATION=1 npm run test:e2e
```

- **모든 스모크 테스트는 mock 기반**. `helpers/mocks.ts`에서 Gemini/Supabase/Pexels/Pixabay/Naver 전부 차단.
- 게스트 모드 접근: `?guest=1` 쿼리 사용.
- 드래프트 주입 테스트: `injectCardNewsDraft()` helper로 localStorage 조작.

## 배포 (Vercel)

### 선행 조건 — video-processor 먼저 배포

`PROCESSOR_SHARED_SECRET` 인증 때문에 배포 순서가 중요합니다:
1. video-processor 먼저 Railway에 배포 ([video-processor/README.md](../video-processor/README.md))
2. `PROCESSOR_SHARED_SECRET` 값 복사
3. public-app 배포

### Vercel 설정

1. GitHub 리포지토리를 Vercel에 연결
2. **Root Directory**: `public-app`
3. Framework Preset: Next.js (자동 감지)
4. 환경변수 설정 (위 표 참고) — 반드시 **Preview + Production 둘 다**에 설정
5. Deploy 클릭

### 배포 후 확인

- `/` → 랜딩 로드
- `/api/gemini` (GET) → `{"status":"ok","keys":N}` (N ≥ 1)
- `/auth` → 로그인 폼 (Supabase 연결 OK)
- `/card_news` → 주제 입력창 표시
- `/video_edit` → 업로드 영역 + 자동/단계별 모드 토글 + **AI 쇼츠 모드 없음 확인**

### 주의사항

- **`NEXT_PUBLIC_` 접두사 변수는 빌드 시점에 번들에 포함됨** → env 변경 시 재배포 필요
- `PROCESSOR_SHARED_SECRET`에 `NEXT_PUBLIC_` 붙이면 브라우저 번들에 유출됨 — 절대 금지
- in-memory rate limit이라 Vercel 서버리스 인스턴스별로 분리됨 (완벽한 방어 아님, 장기적으로 Upstash Redis 이전 권장)

## 라이선스

Private — All rights reserved.
