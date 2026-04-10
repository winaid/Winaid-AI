# WINAID — 병원 마케팅 AI 콘텐츠 플랫폼

의료광고법을 준수하면서 병원 블로그·보도자료·카드뉴스·이미지·영상을 AI로 자동 생성하는 SaaS.

> 최근 대규모 정비: [CHANGELOG.md](./CHANGELOG.md) 참고
> 주요 변경: 보안 긴급 수정(Day 1), Blob 누수 박멸(Day 2), API 방어·드래프트 안정화(Day 3), cardRefs·AbortController(Day 4), 의료법 검증 개선(Day 5), E2E 스모크(Day 6), **AI 쇼츠 생성기 제거**.

## 기술 스택

| 구성 | 기술 |
|---|---|
| 프론트엔드 | Next.js 16 + React 19 + TypeScript 5.8 + Tailwind 4 |
| 인증·DB·Storage | Supabase (PostgreSQL) |
| AI 텍스트·이미지 | Google Gemini API (멀티키 로테이션) |
| 카드뉴스 에디터 | fabric.js 7 (캔버스 편집) · jspdf (PDF 내보내기) · html2canvas · jszip |
| 영상 처리 | FFmpeg + auto-editor (Python) — Railway에 별도 서버 |
| 자막 (STT) | Google Cloud Speech-to-Text v2 |
| 크롤러 | Node.js + Express + Puppeteer — Railway |
| E2E 테스트 | Playwright |
| 배포 | Vercel (Next 앱) · Railway (video-processor / crawler-server) |

## 저장소 구조

모노레포. 독립 배포 가능한 5개 하위 프로젝트.

```
Winaid-AI/
├── public-app/              # 외부 출시용 Next.js 앱 (현재 활성 개발)
│   ├── app/
│   │   ├── page.tsx         # 랜딩
│   │   ├── auth/            # 로그인/회원가입
│   │   ├── (dashboard)/     # 인증 가드 (게스트 ?guest=1 지원)
│   │   │   ├── app/         # 대시보드 홈
│   │   │   ├── blog/        # 블로그 생성 (5단계 AI 파이프라인)
│   │   │   ├── card_news/   # 카드뉴스 (캔버스 에디터 + 드래프트 + 슬라이드쇼 + PDF)
│   │   │   ├── press/       # 보도자료
│   │   │   ├── refine/      # AI 보정
│   │   │   ├── image/       # 이미지 생성 (8 카테고리)
│   │   │   ├── video_edit/  # 촬영 영상 편집 (9 단계 파이프라인)
│   │   │   ├── mypage/      # 마이페이지 + 히스토리
│   │   │   └── history/     # → /mypage 로 리다이렉트
│   │   └── api/             # Gemini/Pexels/Pixabay/Naver/Video 프록시
│   ├── components/
│   │   ├── card-news/       # 카드뉴스 전용 UI
│   │   └── video-edit/      # 영상편집 9개 step 컴포넌트
│   ├── lib/                 # 프롬프트·검증·저장·드래프트·비디오 클라이언트
│   ├── hooks/               # useAuthGuard, useBlobUrl
│   ├── e2e/                 # Playwright 스모크 테스트 (11 파일, 38 tests)
│   └── sql/                 # public-app 전용 Supabase 스키마
├── next-app/                # 내부 운영 도구 (admin · influencer · strengths · youtube 등)
├── crawler-server/          # 네이버 블로그 크롤러 (Express + Puppeteer, Railway)
├── video-processor/         # 영상 처리 서버 (Express + FFmpeg + auto-editor, Railway)
├── winai-blog-publisher/    # 네이버 블로그 자동 발행 로컬앱 (Playwright, localhost:17580)
├── sql/                     # 공통 Supabase 마이그레이션
│   ├── setup/               # 초기 스키마
│   └── migrations/          # 증분 마이그레이션
└── public-app-sql/          # public-app DB 전용 마이그레이션
```

## 주요 기능

### 🧠 콘텐츠 생성
- **블로그 생성** — 5단계 AI 파이프라인 (초안 → AI냄새 제거 → SEO → 의료법 검증 → 최종)
- **보도자료 생성** — 병원 웹사이트 분석 + 3인칭 기사체
- **카드뉴스 생성** — 멀티슬라이드 원고 + 16종 레이아웃 + 캔버스 에디터 (fabric.js)
  - 드래프트 자동저장 (48h idle timeout + userId 바인딩)
  - 슬라이드쇼 · PNG/JPG/ZIP/PDF 다운로드 · 카드뉴스 → 쇼츠 변환
  - 의료광고법 실시간 검증 (전 필드 스캔 + 원클릭 교체)
  - 전역 AI 채팅 (전체 슬라이드 맥락 공유)
- **AI 이미지 생성** — 캘린더·포스터·배너 등 8개 카테고리
- **AI 보정 (Refine)** — 자동 보정 6종 + 채팅 모드
- **글쓰기 스타일 학습** — 병원 블로그 크롤링 → Gemini 분석 → 문체 프로파일

### 🎬 촬영 영상 편집 (9단계 파이프라인)
1. 세로 크롭 (얼굴 추적)
2. 스타일 필터 적용
3. 무음 구간 제거 (auto-editor)
4. AI 자막 생성 (Google STT + 의료법 검증)
5. 효과음 자동 배치 (AI 또는 키워드 기반)
6. 줌 효과 (자막 기반 강조)
7. BGM 삽입 (Jamendo 검색 + 업로드)
8. 인트로/아웃로 (병원명·전화번호 텍스트 오버레이)
9. 썸네일 생성

자동 모드(전체 순차 실행) / 단계별 모드(수동 확인) 2가지.
**AI 쇼츠 생성기("AI로 처음부터 만들기") 모드는 제거되었습니다** (2026-04).

### 🛡 검증 및 방어
- **의료광고법 검증** — 100+ 키워드 패턴 (wordBoundary + 화이트리스트로 오탐 축소)
- **네이버 키워드 분석** — 검색량/블로그수/포화도
- **게스트 IP rate limit** — 모든 API 라우트에 분당 한계
- **video-processor 인증** — `X-API-Secret` 헤더 검증
- **프롬프트 인젝션 방어** — 사용자 입력 sanitize (대괄호·따옴표·인젝션 키워드 제거)

### 📊 관리
- **히스토리** — Supabase(로그인) + localStorage(게스트) 이중 저장
- **관리자 대시보드** (next-app) — 통계·콘텐츠·사용자·피드백 관리 + CSV 내보내기

---

## 빠른 시작 (public-app)

```bash
cd public-app
npm install
cp .env.example .env.local
# .env.local 의 값을 실제 값으로 교체

npm run dev
# http://localhost:3000
```

- **필수 환경변수**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`
- Supabase 미설정 상태에서도 앱은 시작됨(게스트 모드, 로그인 불가)

상세: [public-app/README.md](./public-app/README.md)

---

## 환경변수 (public-app)

| 변수 | 필수 | 용도 | 주의 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 프로젝트 URL | 브라우저 노출 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key | 브라우저 노출 |
| `GEMINI_API_KEY` | ✅ | Google Gemini | 서버 전용 |
| `GEMINI_API_KEY_2` / `_3` | 선택 | 백업 키 (멀티키 로테이션) | 서버 전용 |
| `NEXT_PUBLIC_VIDEO_PROCESSOR_URL` | 선택 | video-processor Railway URL | 브라우저 노출 |
| `PROCESSOR_SHARED_SECRET` | 선택 | video-processor 인증 시크릿 | **서버 전용** (⚠️ `NEXT_PUBLIC_` 금지) |
| `NEXT_PUBLIC_CRAWLER_URL` | 선택 | 크롤러 서버 (말투 학습) | 브라우저 노출 |
| `PEXELS_API_KEY` | 선택 | Pexels 이미지 검색 | 서버 전용 |
| `PIXABAY_API_KEY` | 선택 | Pixabay 이미지 검색 | 서버 전용 |
| `REMOVE_BG_API_KEY` | 선택 | remove.bg 배경 제거 | 서버 전용 |
| `JAMENDO_CLIENT_ID` | 선택 | Jamendo BGM 검색 | 서버 전용 |
| `HUGGINGFACE_API_KEY` | 선택 | HuggingFace MusicGen | 서버 전용 |
| `GOOGLE_CLOUD_PROJECT_ID` | 선택 | STT (자막 생성) | 서버 전용 |
| `GOOGLE_CLOUD_STT_REGION` | 선택 | STT 리전 (기본 us-central1) | 서버 전용 |
| `GOOGLE_CLOUD_CREDENTIALS_JSON` | 선택 | GCP 서비스 계정 (JSON 원문) | 서버 전용 |

`next-app`(내부 도구)도 거의 동일한 환경변수 사용. 자세한 내용은 각 프로젝트의 `.env.example` 참고.

---

## 배포

### ⚠️ 배포 순서가 중요합니다

video-processor 인증이 도입된 이후로 **반드시 아래 순서**를 지켜야 합니다:

```
1. video-processor (Railway) 먼저 배포 + PROCESSOR_SHARED_SECRET 설정
2. public-app (Vercel) 나중 배포 + 동일한 PROCESSOR_SHARED_SECRET 설정
3. (선택) crawler-server (Railway)
4. (선택) next-app (Vercel) — 내부 운영용
```

### 1. video-processor (Railway)
- Root Directory: `video-processor`
- 환경변수: `PROCESSOR_SHARED_SECRET`(필수, 랜덤 32자+), `ALLOWED_ORIGINS`
- Dockerfile 기반 자동 빌드 (FFmpeg + auto-editor 포함)
- 상세: [video-processor/README.md](./video-processor/README.md)

### 2. public-app (Vercel)
- Root Directory: `public-app`
- 환경변수: 위 "환경변수" 표 + **`PROCESSOR_SHARED_SECRET`** (video-processor와 동일값)
- 상세: [public-app/README.md](./public-app/README.md)

### 3. crawler-server (Railway, 선택)
- Root Directory: `crawler-server`
- 환경변수: `ALLOWED_ORIGINS`, `PORT`
- 상세: [crawler-server/README.md](./crawler-server/README.md) · [crawler-server/DEPLOY_GUIDE.md](./crawler-server/DEPLOY_GUIDE.md)

### 4. next-app (Vercel, 선택 — 내부 운영용)
- Root Directory: `next-app`
- 환경변수: public-app과 동일 (Supabase / Gemini)
- 상세: [next-app/VERCEL_DEPLOY_RUNBOOK.md](./next-app/VERCEL_DEPLOY_RUNBOOK.md) (일부 항목은 stale)

---

## DB 초기 설정

Supabase SQL Editor에서 순서대로 실행:

**public-app용**:
```
public-app-sql/setup/*.sql
public-app-sql/migrations/*.sql (날짜 순서)
```

**next-app용**(별도 DB):
```
sql/setup/supabase_FULL_SETUP.sql
sql/migrations/*.sql (날짜 순서)
```

> Day 3 이후의 마이그레이션: `2026-04-10_rebalance_team_hospitals.sql` (팀/병원 재배치)

---

## 개발 명령어

### public-app
```bash
cd public-app
npm run dev           # 개발 서버 (http://localhost:3000)
npm run build         # 프로덕션 빌드
npm run lint          # tsc --noEmit (타입 체크)
npm run test:e2e      # Playwright 스모크 테스트 (38 tests)
npm run test:e2e:ui   # Playwright UI 모드 (디버깅용)
```

### E2E 테스트

Playwright 스모크 테스트가 11개 파일에 걸쳐 38개 존재.

```bash
cd public-app

# 사전 설치 (최초 1회)
npx playwright install chromium

# 전체 실행 (dev 서버 자동 실행됨)
npm run test:e2e

# 특정 파일만
npx playwright test e2e/card-news.spec.ts

# 배포된 prod에 대해 실행
BASE_URL=https://winai.kr npx playwright test

# 실제 Supabase/Gemini를 호출하는 integration 테스트까지 실행
RUN_INTEGRATION=1 npm run test:e2e
```

테스트는 전부 **mock 기반**이라 외부 네트워크 없이 빠르게 돈다. `helpers/mocks.ts`에서 Gemini·Supabase·Pexels·Pixabay·Naver 등을 일괄 차단.

---

## 라이선스

Private — 비공개 프로젝트

---

마지막 업데이트: 2026-04-10 · [CHANGELOG.md](./CHANGELOG.md)
