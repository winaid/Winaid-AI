# Hospital-AI (WINAID) — 기술 현황 보고서

> 작성일: 2026-03-20
> 목적: 회사 이관 판단을 위한 기술 현황 정리
> 데이터 소스: 자동화 에이전트 4개 (구조탐색, 인프라감사, 환경변수감사, 경계매핑)
> 수집 상태: 구조탐색 ✅ | 인프라감사 ✅ | 환경변수감사 ⚠️ 일부누락 | 경계매핑 ⚠️ 일부누락
> 문서 성격: 내부 기술 공유용. 확인/미확인/추정을 구분하여 기술함.

---

## 현재 상태 개요

이 프로젝트는 **개인 프로젝트에서 회사 운영 구조로 넘어가는 과도기**에 있다.
서비스 자체는 동작하지만, 계정 소유권, 시크릿 관리, 플랫폼 분산, external/internal 미분리 등
회사 운영 체계로 전환하려면 사전 정리가 필요한 상태다.

**"전면 이전"보다 "사전 정리 + 점진 이전"이 현실적이다.**

---

## PART 1: 요약

### 1.1 프로젝트 개요

**Hospital-AI (WINAID)** — 한국 병원 마케팅 전용 AI 콘텐츠 생성 도구.
의료광고법 준수를 목표로 블로그, 카드뉴스, 보도자료를 자동 생성한다.

### 1.2 기술 스택

| 레이어 | 기술 | 비고 |
|--------|------|------|
| 프론트엔드 | React 19 + TypeScript + Tailwind 4 + Vite 6 | 확인됨 |
| 백엔드 API | Cloudflare Pages Functions | 확인됨. 주요 서버 역할 |
| 서버 구성 일부 | Hono | 확인됨. Vite dev server 통합 및 일부 라우팅에 사용. 프론트 전체가 Hono 기반은 아님 |
| AI 프록시 | Vercel Serverless (iad1 US East) | 확인됨. Gemini API 호출의 유일한 경로 |
| 크롤러 | Railway.app (Puppeteer + Express) | 확인됨. 네이버 블로그 크롤링 전용 |
| DB/인증 | Supabase (PostgreSQL + Auth) | 확인됨 |
| 캐시/KV | Cloudflare KV (API_KEYS, CONTENT_KV) | 확인됨 |
| AI 모델 | Google Gemini (3.1 Pro, Flash, Image) | 확인됨 |

### 1.3 배포 구조

다중 플랫폼 배포 구조: Cloudflare Pages + Vercel + Railway + Supabase, 그리고 Google Gemini API에 의존한다.

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

> **운영 리스크 주의**: 각 플랫폼의 계정 소유권, 시크릿, 빌링이 현재 개인 기반인지 회사 기반인지는 별도 확인 필요.

### 1.4 핵심 비즈니스 로직

- **5단계 생성 파이프라인**: 콘텐츠생성 → AI냄새제거 → SEO최적화 → 의료법준수 → 최종교정
- **3단계 코어 파이프라인** (contracts.ts): Stage A(아웃라인 30s) → B(섹션 병렬 25s) → C(교정 40s)
- **크레딧 시스템**: 코드에 blog=1, card_news=2, press_release=1로 정의됨. 실제 운영 플로우 동작 여부는 추가 확인 필요
- **접근 모드**: 현재 `anonymous_demo`. 코드 주석상 3/29 이후 `authenticated_metered` 전환 예정이나 실행 여부는 미확인

### 1.5 주요 리스크 & 확인 필요 사항

| 항목 | 수준 | 확인 상태 |
|------|------|-----------|
| Vercel 프록시가 Gemini 접근의 유일한 경로 (단일 장애점) | 높음 | 확인됨 |
| 개인 계정 기반 플랫폼 소유권 (Cloudflare, Vercel, Supabase, Railway) | 높음 | 추정 (확인 필요) |
| `.env.production`에 프록시 URL 직접 기재 | 중간 | 확인됨 |
| wrangler.jsonc에 KV namespace ID 포함 | 낮음 | 확인됨. ID만으로는 외부 접근 불가 |
| 소스코드 내 하드코딩 시크릿 존재 여부 | 높음 | ⚠️ 미확인 |
| Supabase URL/Key 코드 내 직접 참조 여부 | 중간 | ⚠️ 미확인 |
| 공개/비공개 API 경계 분리 여부 | 중간 | ⚠️ 미확인 |
| external(사용자향) / internal(관리자향) 분리 상태 | 중간 | ⚠️ 미확인 |

---

## PART 2: 상세 기술 현황

### 2.1 디렉토리 구조 (확인됨)

```
Hospital-AI/
├── src/                    # 메인 프론트엔드 (React + TS)
│   ├── components/         # UI 컴포넌트
│   ├── services/           # 비즈니스 로직 (35개 서비스 파일)
│   ├── core/generation/    # 생성 파이프라인 코어
│   ├── hooks/              # 커스텀 React 훅
│   ├── contexts/           # React Context (Auth 등)
│   ├── features/           # 기능별 모듈 (template 등)
│   ├── lib/                # 유틸리티, Supabase 클라이언트
│   ├── constants/          # 상수 정의
│   ├── types.ts            # 150+ 타입 정의
│   └── App.tsx             # 라우팅 셸
├── functions/              # Cloudflare Pages Functions (23개 파일)
│   └── api/                # /api/* 엔드포인트
├── vercel-proxy/           # Vercel Gemini 프록시 (3개 파일)
├── crawler-server/         # Railway Puppeteer 서버 (8개 파일)
├── server/                 # Express 서버 (추정: 레거시, 미사용)
├── sql/migrations/         # DB 마이그레이션 (13+개)
├── supabase/schema.sql     # DB 스키마
├── docs/                   # 아키텍처/연구/설정 문서
├── e2e/                    # E2E 테스트 (Playwright)
├── scripts/                # 빌드/배포 스크립트
├── public/                 # 정적 자산 (PWA, Service Worker)
└── archive/                # 레거시/보관 파일
```

### 2.2 설정 파일 (확인됨)

**package.json 핵심 의존성:**
- `@google/genai: ^1.44.0` — Gemini SDK
- `@supabase/supabase-js: ^2.89.0` — Supabase 클라이언트
- `hono: ^4.11.3` — 일부 서버 구성에 사용
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
- `@hono/vite-dev-server` 통합 (개발 환경)

### 2.3 라우팅 구조 (확인됨)

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

**서버 라우팅 (Cloudflare Pages Functions):**
```
/api/auth/verify                          — 인증
/api/content/{save,list,[id]}             — 콘텐츠 CRUD
/api/naver/{search,crawl-*,keyword-stats} — 네이버 통합
/api/google/search                        — 구글 검색
/api/medical-law/{fetch,updates}          — 의료법
/api/crawler                              — 범용 크롤러
/api/debug/env                            — 환경변수 디버그 (프로덕션 노출 여부 미확인)
```

**Vercel 프록시 엔드포인트:**
```
POST /api/gemini — 텍스트/이미지 생성, 크레딧 차감
GET  /api/gemini — 헬스체크
GET  /api/health — 상태 확인
```

### 2.4 Vercel Gemini 프록시 상세 (확인됨)

Gemini API는 Cloudflare 아시아 리전에서 직접 호출 불가(지역 제한). 이를 우회하기 위해 Vercel US East(iad1)에 프록시를 두고 있다.

**4가지 작동 모드:**

1. **텍스트 생성** — `{ prompt, model, temperature, maxOutputTokens }`
2. **이미지 생성 (Raw)** — `{ raw: true, model, apiBody }`
3. **크레딧 차감 + 토큰 발급** — `{ action: "check_and_deduct", postType }`
4. **헬스체크** — `GET /api/gemini`

**사용 모델:**
```
PRO:         gemini-3.1-pro-preview      (고품질 텍스트)
FLASH:       gemini-3.1-flash-lite-preview (빠른 작업)
IMAGE_PRO:   gemini-3-pro-image-preview   (히어로 이미지)
IMAGE_FLASH: gemini-3.1-flash-image-preview (속도 이미지)
```

**키 로테이션:**
- 최대 3개 키 (GEMINI_API_KEY, _2, _3)
- 라운드로빈 + 503/429 쿨다운 (10s→20s→30s 증가)
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

### 2.5 Supabase DB 스키마 (확인됨)

| 테이블 | 용도 | 비고 |
|--------|------|------|
| `profiles` | 사용자 메타 (plan, remaining_credits, ip_hash) | |
| `ip_usage` | 무료체험 IP 추적 (남용 방지) | |
| `usage_history` | 생성 감사 로그 | |
| `payments` | 결제 이력 (toss/kakaopay/naverpay) | 스키마만 확인됨. 실제 결제 플로우 동작 여부는 추가 확인 필요 |
| `subscriptions` | 구독 상태 (credits_total, credits_used) | 위와 동일 |

**RPC 함수:** `deduct_credits()`, `get_admin_stats()`
**RLS:** 테이블별 Row-Level Security 적용

### 2.6 핵심 서비스 파일 (확인됨, 35개)

**AI/콘텐츠 생성:**
- `geminiClient.ts` (25.5KB) — Gemini API 클라이언트
- `blogPipelineService.ts` (37KB) — 3단계 파이프라인
- `legacyBlogGeneration.ts` (91KB) — 레거시 단일샷 생성 (기술 부채)
- `contentQualityService.ts` (18KB) — 품질 스코어링
- `medicalLawService.ts` (27KB) — 의료법 준수 검증
- `cardNewsService.ts` (40KB) — 카드뉴스 생성

**검색/분석:**
- `naverSearchService.ts` (18KB) — 네이버 블로그 검색/크롤링
- `contentSimilarityService.ts` (22KB) — 표절 탐지
- `seoService.ts` (39KB) — SEO 최적화
- `keywordAnalysisService.ts` (17KB) — 키워드 리서치

**스타일/저장:**
- `writingStyleService.ts` (60KB) — 병원별 문체 학습 (단일 파일 과대, 기술 부채)
- `postStorageService.ts` (15KB) — 포스트 영속화
- `creditService.ts` (3KB) — 크레딧 관련 로직

### 2.7 코어 생성 아키텍처 (확인됨)

**위치:** `src/core/generation/`

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

### 2.8 성능 특성 (확인됨, 설정값 기반)

| 작업 | 일반 지연 | 최대 타임아웃 |
|------|-----------|---------------|
| 프론트엔드 로드 | 1-3s | 5s |
| Gemini 텍스트 생성 | 5-30s | 120s |
| Gemini 이미지 생성 | 15-60s | 180s |
| 네이버 검색 크롤링 | 2-5s | 10s |
| 블로그 콘텐츠 크롤링 | 2-10s | 10s |
| 크레딧 차감 RPC | 100-500ms | 5s |

### 2.9 단일 장애점 (확인된 구조 기반)

| 컴포넌트 | 장애시 영향 | 현재 완화책 |
|----------|------------|-------------|
| Vercel Proxy 다운 | Gemini 호출 전체 불가 | 키 로테이션은 있으나 프록시 자체 이중화는 없음 |
| Supabase 다운 | 인증/크레딧 불가 | Admin token 우회 가능 |
| Railway 다운 | 네이버 크롤링 불가 | Pages Functions 폴백 존재 |
| Cloudflare Pages 다운 | 사이트 전체 불가 | 대안 CDN 없음 |

---

## PART 3: 미확인 항목

아래 항목들은 조사 에이전트 결과가 일부 누락되어 **미확인** 상태다. 이관 전 반드시 확인이 필요하다.

### 3.1 ⚠️ 미확인: 환경변수/시크릿 감사

**부분 확인된 것** (인프라 에이전트에서 확보):
- `.env.example`에 `VITE_GEMINI_API_KEY`, `VITE_SUPABASE_URL` 등 템플릿 존재
- `.env.production`에 `VITE_GEMINI_PROXY_URL` 직접 기재
- `wrangler.jsonc`에 KV namespace ID 2개 포함

**미확인 (추가 조사 필요):**
- [ ] 소스코드 내 하드코딩된 API 키 존재 여부
- [ ] Supabase anon key가 소스코드에 직접 삽입되었는지
- [ ] `.gitignore`가 `.env` 파일을 정상 제외하는지
- [ ] 프로덕션 시크릿이 git 히스토리에 노출된 적 있는지
- [ ] 각 플랫폼(Cloudflare, Vercel, Supabase, Railway) 계정의 소유자가 누구인지

### 3.2 ⚠️ 미확인: external/internal 경계

**부분 확인** (인프라 에이전트 기반):
- `/api/debug/env` — 환경변수를 반환하는 엔드포인트가 존재함. 프로덕션에서의 활성화 여부는 미확인이며, 만약 활성화되어 있다면 보안 리스크 가능성이 있음
- `/api/auth/verify` — 인증 엔드포인트 존재
- CORS 허용 목록은 확인됨

**미확인 (추가 조사 필요):**
- [ ] 인증 없이 접근 가능한 API 엔드포인트 전체 목록
- [ ] Admin 전용 vs 일반 사용자 API 구분 여부
- [ ] Rate limiting이 전체 엔드포인트에 일관 적용되는지
- [ ] `/api/debug/env`의 프로덕션 활성화 여부 및 인증 보호 여부
- [ ] LandingPage(external) / AdminPage(internal)의 기능 범위와 접근 통제

---

## PART 4: 추정 사항

아래는 코드 구조와 설정에서 간접적으로 추론한 내용이다. 사실로 취급하지 말 것.

| 항목 | 근거 | 확신도 |
|------|------|--------|
| `server/` 디렉토리는 현재 사용되지 않음 | README에 언급 없음, 주요 플로우에서 참조 없음 | 높음 |
| 3/29에 anonymous_demo → authenticated_metered 전환 예정 | contracts.ts 주석 기반. 실제 실행 여부는 별도 | 높음 |
| `/api/debug/env`가 프로덕션에서 접근 가능할 수 있음 | functions/ 라우팅 구조상 활성, 별도 인증 로직 미확인 | 중간 |
| Supabase anon key가 클라이언트 번들에 포함됨 | `VITE_` 접두사 = Vite 빌드 시 클라이언트에 포함되는 구조 | 높음 |
| 결제 시스템(toss/kakaopay/naverpay)은 스키마/흔적만 존재 | payments 테이블 존재, 관련 서비스 파일 미발견. 실제 운영 플로우는 추가 확인 필요 | 중간 |
| 각 플랫폼 계정이 개인 소유일 가능성 | 개인 프로젝트 출발, 도메인명(story-darugi.com) 등으로 추정 | 중간 |

---

## PART 5: 판단 포인트

### 즉시 확인 필요 (이관 전 필수)

1. **플랫폼 계정 소유권 확인** — Cloudflare, Vercel, Supabase, Railway 각각의 계정 소유자, 빌링 주체
2. **시크릿 노출 감사** — 코드 내 하드코딩 API 키, git 히스토리 내 시크릿 노출 여부
3. **`/api/debug/env` 프로덕션 상태** — 환경변수 노출 가능성 확인
4. **external/internal 경계 확인** — 인증 없이 접근 가능한 엔드포인트 목록 파악
5. **Vercel 프록시 이중화 방안 검토** — 현재 단일 장애점

### 아키텍처 강점

- Cloudflare + Vercel + Supabase 조합은 비용 효율적이고 확장 가능한 구조
- 의료법 준수 자동 검증은 도메인 특화 기능으로 차별점
- Generation Token(HMAC-SHA256) 설계는 크레딧 남용 방지에 적합
- 테스트 커버리지 존재 (unit + integration + e2e, 9개 테스트 파일)

### 아키텍처 약점 / 기술 부채

- `legacyBlogGeneration.ts` (91KB) — 레거시 코드 대규모 잔존
- `writingStyleService.ts` (60KB) — 단일 파일 과대
- Gemini API 지역 제한 우회를 위한 Vercel 프록시 의존 구조
- 결제 통합은 스키마/흔적만 존재하며 실제 동작 여부 미확인
- `anonymous_demo` 모드가 현재 기본값

### 이관 관련 핵심 인식

- **external(사용자향)과 internal(관리자향)을 분리해서 접근해야 한다.** 현재는 같은 프론트엔드 안에 혼재되어 있을 가능성이 있다.
- **개인 계정 의존성, 시크릿/소유권, 프록시, 다중 플랫폼 구조가 핵심 운영 리스크다.**
- **동시 전면 이전은 리스크가 높다.** 소유권 정리 → external 우선 정리 → internal 후속 분리 순서가 현실적이다.
