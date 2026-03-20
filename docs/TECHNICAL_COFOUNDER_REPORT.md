# Hospital-AI (WINAID) — Technical Co-Founder Product Report

> 작성일: 2026-03-20
> 데이터 소스: 자동화 에이전트 4개 (구조탐색, 인프라감사, 환경변수감사, 경계매핑)
> 상태: 구조탐색 ✅ | 인프라감사 ✅ | 환경변수감사 ⚠️ 일부누락 | 경계매핑 ⚠️ 일부누락

---

## PART 1: EXECUTIVE SUMMARY (요약본)

### 1.1 프로젝트 정체

**Hospital-AI (WINAID)** — 한국 병원 마케팅 전용 AI 콘텐츠 생성 SaaS.
의료광고법 100% 준수를 목표로 블로그, 카드뉴스, 보도자료를 자동 생성.

### 1.2 기술 스택 요약

| 레이어 | 기술 | 상태 |
|--------|------|------|
| 프론트엔드 | React 19 + TypeScript + Tailwind 4 + Vite 6 | 사실 |
| 서버 프레임워크 | Hono (Vite 통합) | 사실 |
| 백엔드 API | Cloudflare Pages Functions | 사실 |
| AI 프록시 | Vercel Serverless (iad1 US East) | 사실 |
| 크롤러 | Railway.app (Puppeteer + Express) | 사실 |
| DB/인증 | Supabase (PostgreSQL + Auth) | 사실 |
| 캐시/KV | Cloudflare KV (API_KEYS, CONTENT_KV) | 사실 |
| AI 모델 | Google Gemini (3.1 Pro, Flash, Image) | 사실 |

### 1.3 배포 아키텍처 (5개 플랫폼)

```
[브라우저] → Cloudflare Pages (story-darugi.com)
              ├─ React SPA (정적 자산)
              ├─ /api/* → Pages Functions (크롤링, 검색, 의료법)
              │
              ├─ Gemini 호출 → Vercel Proxy (iad1, US East)
              │                  └─ 3-key 로테이션 + 503 쿨다운
              │
              └─ 네이버 크롤링 → Railway (Puppeteer)
                                   └─ 30 req/min 제한

[Supabase] ← 인증/크레딧/프로필/이력
[Cloudflare KV] ← API 키 저장, 콘텐츠 캐시
```

### 1.4 핵심 비즈니스 로직

- **5단계 생성 파이프라인**: 콘텐츠생성 → AI냄새제거 → SEO최적화 → 의료법준수 → 최종교정
- **3단계 코어 파이프라인** (contracts.ts): Stage A(아웃라인 30s) → B(섹션 병렬 25s) → C(교정 40s)
- **크레딧 시스템**: blog=1, card_news=2, press_release=1
- **접근 모드**: 현재 `anonymous_demo` (3/29 이후 `authenticated_metered` 전환 예정)

### 1.5 주요 리스크 & 확인 필요 사항

| 항목 | 수준 | 상태 |
|------|------|------|
| Vercel 프록시 단일 장애점 (Gemini 접근 유일 경로) | 높음 | 사실 |
| `.env.production`에 프록시 URL 하드코딩 | 중간 | 사실 |
| wrangler.jsonc에 KV namespace ID 노출 | 낮음 | 사실 (ID만으로 접근 불가) |
| Supabase URL/Key 코드 내 참조 여부 | 중간 | ⚠️ 미확인 (환경변수 에이전트 결과 누락) |
| 하드코딩된 시크릿 존재 여부 | 높음 | ⚠️ 미확인 |
| 공개/비공개 API 경계 명확성 | 중간 | ⚠️ 미확인 (경계매핑 에이전트 결과 누락) |

---

## PART 2: DETAILED REPORT (상세본)

### 2.1 디렉토리 구조 (사실)

```
Hospital-AI/
├── src/                    # 메인 프론트엔드 (React + TS)
│   ├── components/         # UI 컴포넌트
│   ├── services/           # 비즈니스 로직 (35개 서비스)
│   ├── core/generation/    # 생성 파이프라인 코어
│   ├── hooks/              # 커스텀 React 훅
│   ├── contexts/           # React Context (Auth 등)
│   ├── features/           # 기능별 모듈 (template 등)
│   ├── lib/                # 유틸리티, Supabase 클라이언트
│   ├── constants/          # 상수 정의
│   ├── types.ts            # 150+ 타입 정의
│   └── App.tsx             # 라우팅 셸
├── functions/              # Cloudflare Pages Functions (23개)
│   └── api/                # /api/* 엔드포인트
├── vercel-proxy/           # Vercel Gemini 프록시 (3개 파일)
├── crawler-server/         # Railway Puppeteer 서버 (8개 파일)
├── server/                 # 레거시 Express 서버 (미사용 추정)
├── sql/migrations/         # DB 마이그레이션 (13+개)
├── supabase/schema.sql     # DB 스키마
├── docs/                   # 아키텍처/연구/설정 문서
├── e2e/                    # E2E 테스트 (Playwright)
├── scripts/                # 빌드/배포 스크립트
├── public/                 # 정적 자산 (PWA, SW)
└── archive/                # 레거시 파일
```

### 2.2 설정 파일 상세 (사실)

**package.json 핵심 의존성:**
- `@google/genai: ^1.44.0` — Gemini SDK
- `@supabase/supabase-js: ^2.89.0` — Supabase 클라이언트
- `hono: ^4.11.3` — 서버 프레임워크
- `react: ^19.0.0` — UI
- `vite: ^6.3.5` — 빌더
- `wrangler: ^4.4.0` — Cloudflare 배포
- `playwright: ^1.48.2` — E2E 테스트
- `vitest: ^4.0.16` — 유닛 테스트

**빌드 스크립트:**
```
dev       → vite (개발서버 :5173)
build     → vite build (→ dist/)
deploy    → vite build && wrangler pages deploy dist
test      → vitest
lint      → eslint src (max-warnings 50)
```

**Vite 빌드 특징:**
- 수동 청크 분리: vendor-react, vendor-google, vendor-utils, supabase
- 프로덕션 console.log/debug 제거 (error/warn 유지)
- 소스맵 비활성화
- 타겟: ES2020
- Hono dev server 통합

### 2.3 라우팅 구조 (사실)

**클라이언트 라우팅 (App.tsx):**
```
/ → LandingPage (lazy)
/auth → AuthPage (lazy)
/admin → AdminPage (Supabase 보호)
/medical-law → 의료법 검색 (lazy)
/manual → 사용자 매뉴얼 (lazy)
Main App Tabs:
  home, blog, card_news, press_release,
  writing_style, templates, history
```

**서버 라우팅 (Pages Functions):**
```
/api/auth/verify         — 인증
/api/content/{save,list,[id]} — CRUD
/api/naver/{search,crawl-*,keyword-stats} — 네이버 통합
/api/google/search       — 구글 검색
/api/medical-law/{fetch,updates} — 의료법
/api/crawler             — 범용 크롤러
/api/debug/env           — 환경 디버그
```

**Vercel 프록시:**
```
POST /api/gemini — 텍스트/이미지 생성, 크레딧 차감
GET  /api/gemini — 헬스체크
GET  /api/health — 상태 확인
```

### 2.4 Vercel Gemini 프록시 상세 (사실)

**4가지 작동 모드:**

1. **텍스트 생성** — `{ prompt, model, temperature, maxOutputTokens }`
2. **이미지 생성 (Raw)** — `{ raw: true, model, apiBody }`
3. **크레딧 차감 + 토큰 발급** — `{ action: "check_and_deduct", postType }`
4. **헬스체크** — `GET /api/gemini`

**모델 사용:**
```
PRO:         gemini-3.1-pro-preview (고품질 텍스트)
FLASH:       gemini-3.1-flash-lite-preview (빠른 작업)
IMAGE_PRO:   gemini-3-pro-image-preview (히어로 이미지)
IMAGE_FLASH: gemini-3.1-flash-image-preview (속도 이미지)
```

**키 로테이션:**
- 최대 3개 키 (GEMINI_API_KEY, _2, _3)
- 라운드로빈 + 503/429 쿨다운 (10s→20s→30s)
- 3회 재시도 + 2-3초 백오프

**Generation Token (HMAC-SHA256):**
- 크레딧 차감 후 발급, AI 호출 전 검증
- TTL: 15분
- 페이로드: `{ uid, pt, iat, exp, nonce }`

**CORS 허용 Origin:**
- `story-darugi.com`, `www.story-darugi.com`, `preview.story-darugi.com`
- `ai-hospital.pages.dev`, `*.pages.dev`
- `localhost:5173`, `localhost:3000`
- `*.sandbox.novita.ai`

### 2.5 Supabase DB 스키마 (사실)

| 테이블 | 용도 |
|--------|------|
| `profiles` | 사용자 메타 (plan, remaining_credits, ip_hash) |
| `ip_usage` | 무료체험 IP 추적 (남용 방지) |
| `usage_history` | 생성 감사 로그 |
| `payments` | 결제 이력 (toss/kakaopay/naverpay) |
| `subscriptions` | 구독 상태 (credits_total, credits_used) |

**RPC 함수:** `deduct_credits()`, `get_admin_stats()`
**RLS**: 테이블별 Row-Level Security 적용

### 2.6 핵심 서비스 파일 (사실, 35개)

**AI/콘텐츠 생성:**
- `geminiClient.ts` (25.5KB) — Gemini API 클라이언트
- `blogPipelineService.ts` (37KB) — 3단계 파이프라인
- `legacyBlogGeneration.ts` (91KB) — 레거시 단일샷 생성
- `contentQualityService.ts` (18KB) — 품질 스코어링
- `medicalLawService.ts` (27KB) — 의료법 준수 검증
- `cardNewsService.ts` (40KB) — 카드뉴스 생성

**검색/분석:**
- `naverSearchService.ts` (18KB) — 네이버 블로그 검색/크롤링
- `contentSimilarityService.ts` (22KB) — 표절 탐지
- `seoService.ts` (39KB) — SEO 최적화
- `keywordAnalysisService.ts` (17KB) — 키워드 리서치

**스타일/저장:**
- `writingStyleService.ts` (60KB) — 병원별 문체 학습
- `postStorageService.ts` (15KB) — 포스트 영속화
- `creditService.ts` (3KB) — 크레딧 시스템

### 2.7 코어 생성 아키텍처 (사실)

**파일:** `src/core/generation/`

- `generateContentJob.ts` — 공식 진입점 (크레딧 게이트 → 타입별 분기 → 이미지 → 후처리)
- `contracts.ts` — 정책 정의
  - `DEFAULT_ACCESS_MODE: 'anonymous_demo'`
  - Stage A: 30s 타임아웃 (아웃라인)
  - Stage B: 25s/섹션, 배치 2 (본문 병렬 생성)
  - Stage C: 40s PRO / 15s FLASH (교정, 조건부)
- `cardNewsOrchestrator.ts` — 카드뉴스 오케스트레이션
- `contentStorage.ts` — 콘텐츠 영속 레이어
- `policies.ts` — 크레딧 게이트 & 접근 제어

**테스트:** 9개 테스트 파일 (unit + integration + e2e)

### 2.8 성능 특성 (사실)

| 작업 | 일반 지연 | 최대 |
|------|-----------|------|
| 프론트엔드 로드 | 1-3s | 5s |
| Gemini 텍스트 생성 | 5-30s | 120s |
| Gemini 이미지 생성 | 15-60s | 180s |
| 네이버 검색 크롤링 | 2-5s | 10s |
| 블로그 콘텐츠 크롤링 | 2-10s | 10s |
| 크레딧 차감 RPC | 100-500ms | 5s |

### 2.9 단일 장애점 (사실 기반 분석)

| 컴포넌트 | 장애시 영향 | 현재 완화책 |
|----------|------------|-------------|
| Vercel Proxy 다운 | Gemini 호출 전체 불가 | 3키 로테이션 (프록시 자체 장애는 미완화) |
| Supabase 다운 | 인증/크레딧 불가 | Admin token 우회 가능 |
| Railway 다운 | 네이버 크롤링 불가 | Pages Functions 폴백 |
| Cloudflare Pages 다운 | 사이트 전체 불가 | 대안 CDN 없음 |

---

## PART 3: 미확인 항목 (환경변수/시크릿 에이전트 & 경계매핑 에이전트)

아래 항목들은 해당 에이전트 결과가 컨텍스트에 표시되지 않아 **미확인** 상태입니다.

### 3.1 ⚠️ 미확인: 환경변수/시크릿 감사

확인된 것 (인프라 에이전트에서 부분 확보):
- `.env.example`에 `VITE_GEMINI_API_KEY`, `VITE_SUPABASE_URL` 등 존재
- `.env.production`에 `VITE_GEMINI_PROXY_URL` 하드코딩
- `wrangler.jsonc`에 KV namespace ID 2개 노출

**미확인:**
- [ ] 소스코드 내 하드코딩된 API 키 존재 여부
- [ ] Supabase anon key가 코드에 직접 삽입되었는지
- [ ] `.gitignore`가 `.env` 파일을 제대로 제외하는지
- [ ] 프로덕션 시크릿이 git 히스토리에 노출된 적 있는지

### 3.2 ⚠️ 미확인: 외부/내부 경계 매핑

부분 확인 (인프라 에이전트 기반):
- `/api/debug/env` — 환경변수 노출 엔드포인트 존재 (보안 리스크 추정)
- `/api/auth/verify` — 인증 엔드포인트 존재
- CORS 허용 목록은 확인됨

**미확인:**
- [ ] 인증 없이 접근 가능한 API 엔드포인트 전체 목록
- [ ] Admin 전용 vs 공개 API 구분
- [ ] Rate limiting이 모든 엔드포인트에 적용되는지
- [ ] `/api/debug/env`가 프로덕션에서 비활성화되는지

---

## PART 4: 추정 사항

| 항목 | 근거 | 확신도 |
|------|------|--------|
| `server/` 디렉토리는 더 이상 사용되지 않음 | README에 언급 없고 "legacy" 표기, 주요 플로우에서 참조 없음 | 높음 |
| 3/29에 anonymous_demo → authenticated_metered 전환 예정 | contracts.ts 주석 기반 | 높음 |
| `/api/debug/env`는 프로덕션에서도 접근 가능 | 별도 인증 미확인, functions 구조상 라우팅 활성 | 중간 |
| Supabase anon key는 클라이언트 코드에 포함됨 | VITE_ 접두사 사용 = 클라이언트 번들 포함 (Vite 동작 방식) | 높음 |
| 결제 시스템 (toss/kakaopay/naverpay)은 미구현 상태 | 스키마만 존재, 관련 서비스 파일 미발견 | 중간 |

---

## PART 5: 기술 공동창업자를 위한 핵심 판단 포인트

### 즉시 확인 필요
1. **시크릿 노출 감사** — 코드 내 하드코딩 API 키 존재 여부 (환경변수 에이전트 재실행 필요)
2. **`/api/debug/env` 보안** — 프로덕션 환경변수 노출 가능성
3. **Vercel 프록시 이중화** — 단일 장애점 해소 방안

### 아키텍처 강점
- Cloudflare + Vercel + Supabase 조합은 비용 효율적이고 글로벌 확장 가능
- 의료법 준수 자동화는 강력한 차별점
- 크레딧 시스템 + Generation Token은 잘 설계됨
- 테스트 커버리지 존재 (unit + integration + e2e)

### 아키텍처 약점/부채
- `legacyBlogGeneration.ts` (91KB) — 레거시 코드 대규모 잔존
- `writingStyleService.ts` (60KB) — 단일 파일 과대
- Gemini API 지역 제한 우회를 위한 Vercel 프록시 의존
- 결제 통합 미완성 (스키마만 존재)
- `anonymous_demo` 모드가 아직 기본값 (3/29 전환 예정이나 확인 필요)
