# Weekend Migration Scope Audit Report

> 작성일: 2026-03-20 (금)
> 목적: 이번 주말 external/public Vercel 이전 범위 확정
> 상태: 감사 보고서 (코드 수정 없음, 배포 없음)

---

## 현재 아키텍처 요약 (코드에서 확인됨)

| 구성요소 | 현재 위치 | 역할 |
|----------|----------|------|
| React SPA (프론트) | Cloudflare Pages (`dist/`) | 전체 UI (landing ~ admin) |
| Hono SSR Server | `src/index.tsx` → Cloudflare Pages Worker | HTML shell 서빙, SEO, robots/sitemap |
| Pages Functions | `functions/api/*` → Cloudflare Pages | 크롤링, 검색, 콘텐츠 CRUD API |
| Gemini Proxy | `vercel-proxy/` → Vercel iad1 | AI 생성 호출 프록시 (이미 Vercel) |
| Crawler Server | `crawler-server/` → Railway | Naver 블로그 크롤링 (Puppeteer) |
| DB / Auth / Storage | Supabase | 사용자, 포스트, 이미지 저장 |

**핵심 사실**: 이 앱은 **단일 SPA**다. external/public과 internal/admin이 같은 번들, 같은 빌드, 같은 배포 단위에 들어 있다. 라우팅은 `App.tsx`의 `currentPage` 조건 분기로 처리된다. React Router도 없다.

---

## Q1. external/public으로 간주할 기능

| 기능 | 라우트 | 근거 | 포함 여부 |
|------|--------|------|-----------|
| 랜딩/마케팅 페이지 | `/` | `LandingPage.tsx` — 퍼블릭, 인증 불요 | **YES** |
| 로그인/회원가입 | `/auth` | `AuthPage.tsx` — 퍼블릭, Supabase OAuth + 팀 로그인 | **YES** |
| 홈 대시보드 | `/app` | `HomeDashboard.tsx` — 로그인 후 진입점 | **YES** |
| 블로그 생성 | `/blog` | `GenerateWorkspace` → `blogPipelineService` → Gemini | **YES** |
| 카드뉴스 생성 | `/card_news` | `GenerateWorkspace` → `cardNewsService` → Gemini | **YES** |
| 보도자료 생성 | `/press` | `GenerateWorkspace` → `pressReleaseService` → Gemini | **YES** |
| 콘텐츠 다듬기 | `/refine` | `ToolWorkspace` → `ContentRefiner` | **YES** |
| AI 이미지 생성 | `/image` | `ToolWorkspace` → `ImageGenerator` → Gemini Raw | **YES** |
| 히스토리/저장 | `/history` | `ToolWorkspace` → `PostHistory` → Supabase | **YES** |

**결론**: `/` ~ `/history`까지 총 9개 라우트가 external/public이다.

## Q2. 이번 주말 절대 같이 옮기면 안 되는 internal/admin 기능

| 기능 | 라우트 | 이유 |
|------|--------|------|
| 어드민 대시보드 | `/admin` | `AdminPage.tsx` — 3탭(콘텐츠 관리, 말투 학습, 유저 관리) |
| 전체 포스트 조회/삭제 | `/admin` Tab 1 | `rpc('get_all_generated_posts')`, `rpc('delete_all_generated_posts')` |
| 병원 말투 크롤링/학습 | `/admin` Tab 2 | `WritingStyleLearner` — 다수 외부 URL 크롤링, 점수화 |
| 유저 관리 | `/admin` Tab 3 | 전체 유저 목록 조회 |
| 의료광고법 강제 업데이트 | admin 내부 | `forceUpdateMedicalLaw()` |

**제외 이유**: admin은 sessionStorage 기반 비밀번호 인증만 있고, 별도 route guard가 없다. 이전 시 인증 체계를 먼저 분리해야 한다. 지금은 같이 가져가면 위험하다.

## Q3. external/public과 internal/admin이 섞여 있는 곳

| 위치 | 상태 | 상세 |
|------|------|------|
| `App.tsx` :98-120 | **섞여 있음** | 같은 조건 분기에서 `LandingPage`, `AuthPage`, `AdminPage` 모두 렌더링 |
| `src/constants/routes.ts` | **섞여 있음** | `admin: '/admin'`이 같은 ROUTES 객체에 포함 |
| `src/hooks/useRouting.ts` | **섞여 있음** | admin 라우트 파싱이 public과 같은 함수에 있음 |
| `src/services/postStorageService.ts` | **섞여 있음** | `saveGeneratedPost()` (public)과 `deleteAllGeneratedPosts()` (admin)이 같은 파일 |
| `src/services/apiService.ts` | **섞여 있음** | `saveContentToServer()` (public)과 `deleteAllContent()` (admin)이 같은 파일 |
| `src/index.tsx` (Hono) | **섞여 있음** | robots.txt에서 `/admin` disallow, sitemap에는 public만 — 하지만 같은 서버 |
| Cloudflare Functions | **섞여 있음** | `functions/api/content/delete-all.js`는 admin 전용이지만 같은 디렉토리 |

**핵심 문제: 코드 레벨에서 admin과 public이 완전히 분리되어 있지 않다. 하지만 이번 주말에 코드를 분리할 필요는 없다 — 단일 SPA를 그대로 Vercel에 올리되, admin 기능은 "이전은 하되 사용하지 않는" 상태로 두면 된다.**

## Q4. shared/common으로 남겨야 하는 것

| 모듈 | 위치 | public 사용 | admin 사용 | 분리 필요성 |
|------|------|-------------|------------|-------------|
| Supabase client | `src/lib/supabase.ts` | YES | YES | 분리 불필요 (공용 클라이언트) |
| 타입 정의 | `src/lib/database.types.ts` | YES | YES | 분리 불필요 |
| Generation core | `src/core/generation/*` | YES | NO | admin이 안 씀, 이미 public 전용 |
| Prompt 로직 | `src/services/blogPipelineService.ts` 등 | YES | NO | public 전용 |
| Gemini client | `src/services/geminiClient.ts` | YES | YES (LandingPage 챗봇) | 분리 불필요 |
| Toast / ErrorBoundary | `src/components/Toast.tsx`, `ErrorBoundary.tsx` | YES | YES | 분리 불필요 (UI 유틸) |
| postStorageService | `src/services/postStorageService.ts` | `saveGeneratedPost` | `deleteAll`, `getAdminStats` | 혼재, 하지만 지금 분리 안 해도 됨 |

**판정: shared/common은 지금 그대로 둬도 된다. 이번 주말에 분리할 이유 없음.**

## Q5. 이번 주말 cutover blocker 5개 (우선순위 순)

### Blocker 1: SPA가 Hono SSR에 의존 (CRITICAL)

- **왜 blocker인가**: 현재 HTML shell이 `src/index.tsx` Hono 서버에서 동적으로 생성된다. OG 메타태그, PortOne SDK 주입, SEO 구조화 데이터가 모두 이 서버에서 렌더링된다. Vercel에서는 이 Hono 서버가 그대로 동작하지 않는다.
- **지금 해결 가능한가**: YES — `index.html`을 정적 파일로 추출하면 된다. 또는 Vercel에서 Hono를 serverless function으로 실행하는 방법도 있다.
- **이번 주말 전에 꼭 해결해야 하는가**: **YES** — 이것 없이는 Vercel 배포 자체가 불가능.

### Blocker 2: Cloudflare Pages Functions → Vercel 이전 결정 (HIGH)

- **왜 blocker인가**: `functions/api/*` (17개 엔드포인트)가 현재 Cloudflare Pages Functions에서 동작한다. 이들은 Naver 크롤링, Google 검색, 콘텐츠 CRUD, 의료법 크롤링 등 핵심 기능이다. Vercel로 프론트만 옮기면 이 API들은 어디서 서빙하나?
- **지금 해결 가능한가**: PARTIAL — 3가지 옵션이 있다:
  - (A) Functions를 Cloudflare에 그대로 두고, Vercel 프론트에서 cross-origin 호출 → CORS 설정 필요
  - (B) Functions를 Vercel Serverless로 포팅 → 작업량 큼
  - (C) 프론트가 Functions를 직접 호출하지 않고 Gemini proxy만 쓰는 구조면 → 확인 필요
- **이번 주말 전에 꼭 해결해야 하는가**: **YES** — 방향 결정은 필수. 포팅은 필수 아님.

### Blocker 3: Cloudflare KV 의존성 (MEDIUM)

- **왜 blocker인가**: `wrangler.jsonc`에 KV namespace 2개(`API_KEYS`, `CONTENT_KV`)가 바인딩되어 있다. Cloudflare Pages Functions가 이를 사용한다. Vercel에는 KV가 없다 (Vercel KV는 별도 서비스).
- **지금 해결 가능한가**: YES (옵션 A 선택 시 해결 불필요 — Functions가 Cloudflare에 남으므로)
- **이번 주말 전에 꼭 해결해야 하는가**: Blocker 2의 결정에 의존.

### Blocker 4: 도메인/DNS 전환 계획 부재 (MEDIUM)

- **왜 blocker인가**: `story-darugi.com`이 현재 Cloudflare DNS에 있다. Vercel로 프론트를 옮기면 DNS 레코드를 Vercel로 변경해야 한다. 잘못하면 다운타임 발생.
- **지금 해결 가능한가**: YES — 임시 Vercel URL (`.vercel.app`)에서 먼저 검증 가능.
- **이번 주말 전에 꼭 해결해야 하는가**: **NO** — 임시 URL로 검증 후 나중에 DNS 전환해도 됨.

### Blocker 5: 환경변수/시크릿 정리 미완 (LOW-MEDIUM)

- **왜 blocker인가**:
  - Supabase anon key가 `src/lib/supabase.ts`에 하드코딩 (코드에서 확인됨, line 6)
  - `.env.production`에 Vercel proxy URL이 git에 커밋됨 (코드에서 확인됨)
  - Vercel 배포 시 필요한 env vars: `VITE_GEMINI_PROXY_URL` (필수), `VITE_SUPABASE_URL` (선택, 하드코딩 fallback 있음)
- **지금 해결 가능한가**: YES — Vercel 대시보드에서 env var 설정하면 됨.
- **이번 주말 전에 꼭 해결해야 하는가**: **PARTIAL** — 동작은 하지만, 보안상 하드코딩 제거는 필요.

---

## A. 이번 주말 이전 범위 제안

| 기능 | 분류 | 이번 주말 포함 | 이유 | 의존성 | 위험도 |
|------|------|:-:|------|--------|--------|
| 랜딩 페이지 (`/`) | external | **YES** | public 최우선, 마케팅 유입점 | Gemini (챗봇), 정적 | LOW |
| 로그인/가입 (`/auth`) | external | **YES** | 사용자 진입 필수 | Supabase Auth | LOW |
| 홈 대시보드 (`/app`) | external | **YES** | 로그인 후 진입점 | 없음 (UI only) | LOW |
| 블로그 생성 (`/blog`) | external | **YES** | 핵심 기능 | Gemini Proxy (이미 Vercel), Supabase, Naver 검색 API | **MEDIUM** |
| 카드뉴스 생성 (`/card_news`) | external | **YES** | 핵심 기능 | Gemini Proxy, Supabase Storage | **MEDIUM** |
| 보도자료 생성 (`/press`) | external | **YES** | 핵심 기능 | Gemini Proxy | MEDIUM |
| 콘텐츠 다듬기 (`/refine`) | external | **YES** | 생성 후 필수 도구 | Gemini Proxy | LOW |
| AI 이미지 (`/image`) | external | **YES** | 생성 후 보조 도구 | Gemini Proxy (Raw mode) | MEDIUM |
| 히스토리 (`/history`) | external | **YES** | 저장된 포스트 조회 | Supabase | LOW |
| 어드민 (`/admin`) | **internal** | **NO** | 인증 체계 미분리, 크롤링 복잡도 | Supabase RPC, 크롤러 | HIGH |
| Pages Functions API | **shared** | **결정 필요** | Blocker 2 참조 — 옵션 A면 Cloudflare 잔류 | Cloudflare KV, CORS | HIGH |
| Vercel Gemini Proxy | shared | 이미 Vercel | 변경 불필요 | Gemini API keys | 없음 |
| Railway Crawler | shared | 변경 불필요 | 독립 서비스 | Railway | 없음 |
| Supabase | shared | 변경 불필요 | 독립 서비스 | 없음 | 없음 |
| robots.txt / sitemap | external | **YES** | SEO 필수 | 정적 생성 필요 | LOW |
| OG 메타/SEO | external | **YES** | 마케팅 필수 | Blocker 1 해결 필요 | MEDIUM |

## B. 이번 주말에 해야 할 것 (우선순위 순)

1. **Blocker 1 해결: Hono SSR → 정적 `index.html` 추출 또는 Vercel 호환 방식 결정**
   - `src/index.tsx`의 HTML shell을 `public/index.html`로 추출
   - PortOne SDK, OG 메타, 구조화 데이터 포함
   - Vite의 기본 `index.html` 방식으로 전환

2. **Blocker 2 결정: Pages Functions 전략 확정**
   - 권장: 옵션 (A) — Functions를 Cloudflare에 그대로 두고, 프론트에서 `VITE_API_URL`을 Cloudflare 도메인으로 설정
   - 이유: 최소 변경, KV 의존성 유지, 이번 주말 범위 축소

3. **Vercel 프로젝트 셋업 & 임시 URL 배포**
   - `vercel.json` 생성 (SPA fallback rewrites)
   - 환경변수 설정: `VITE_GEMINI_PROXY_URL`, `VITE_API_URL`
   - `.vercel.app` 임시 URL로 빌드 검증

4. **CORS 설정 업데이트**
   - Cloudflare Functions에 Vercel 임시 URL origin 추가
   - `vercel-proxy/api/gemini.js` CORS whitelist에 새 도메인 추가

5. **스모크 테스트**
   - 임시 URL에서: 랜딩 → 로그인 → 블로그 생성 → 저장 → 히스토리 확인
   - admin 페이지는 테스트하지 않음

## C. 이번 주말에 하면 안 되는 것

1. **DNS/도메인 전환하지 마라** — `story-darugi.com`을 Vercel로 옮기지 마라. 임시 URL에서 검증만 하라.
2. **admin 분리 코드 작성하지 마라** — `AdminPage`를 별도 앱으로 나누는 작업은 이번 주말 범위 밖이다.
3. **Pages Functions를 Vercel로 포팅하지 마라** — 17개 API를 이번 주말에 옮기는 것은 위험하다.
4. **Supabase 하드코딩 키 제거하지 마라** — 동작에 문제 없고, 이번 주말에 건드리면 regression 위험.
5. **Cloudflare Pages 배포를 중단하지 마라** — Vercel이 검증될 때까지 기존 Cloudflare 배포는 유지해야 한다.
6. **환경변수 구조를 바꾸지 마라** — `.env.production` 포맷 변경, 새 env var 추가 등은 이번 주말에 하지 마라.
7. **Service Worker/PWA 설정을 건드리지 마라** — 캐시 무효화 로직이 빌드 해시에 의존하므로 Vercel에서 동작 확인 후에만 수정.

## D. Blocker 5개 요약

| # | Blocker | 심각도 | 해결 가능? | 이번 주말 필수? |
|---|---------|--------|-----------|----------------|
| 1 | Hono SSR → 정적 HTML 전환 | **CRITICAL** | YES | **YES** |
| 2 | Pages Functions 전략 미결정 | **HIGH** | YES (결정만) | **YES** |
| 3 | Cloudflare KV 의존성 | MEDIUM | Blocker 2에 의존 | 조건부 |
| 4 | 도메인/DNS 전환 계획 | MEDIUM | YES | **NO** (임시 URL 사용) |
| 5 | 환경변수/시크릿 하드코딩 | LOW-MEDIUM | YES | **NO** (동작에 영향 없음) |

## E. 최종 Readiness 판정

| 항목 | 판정 | 근거 |
|------|------|------|
| **external/public 1차 이전** | **PARTIAL** | Blocker 1(Hono→정적HTML), Blocker 2(Functions 전략)를 해결하면 READY. 둘 다 이번 주말 내 해결 가능하지만, 아직 작업 전이다. |
| **internal/admin 동시 이전** | **NOT READY** | admin이 코드 레벨에서 분리되지 않음. 인증 체계가 sessionStorage 기반으로 불안정. 이번 주말에 같이 옮기면 안 된다. |
| **이번 주말 권장 범위** | SPA 전체를 Vercel에 빌드/배포하되, **임시 URL로 검증만**. DNS 전환 없음. admin은 번들에 포함되지만 테스트/사용 대상이 아님. |
| **이번 주말 제외 범위** | DNS 전환, admin 기능 테스트, Pages Functions 포팅, Cloudflare 배포 중단 |

### 가장 중요한 한 줄 결론

> **Hono SSR을 정적 HTML로 전환하고, Pages Functions를 Cloudflare에 남기는 결정을 내리면, 이번 주말에 external/public을 Vercel 임시 URL에서 검증하는 것은 충분히 가능하다. 단, DNS 전환과 admin 분리는 절대 이번 주말에 하지 마라.**

---

## 부록: 확인 출처 분류

| 정보 | 출처 |
|------|------|
| 라우트 구조 (9 public + 1 admin) | `src/constants/routes.ts`, `src/App.tsx` 코드에서 확인 |
| Hono SSR 의존성 | `src/index.tsx` 코드에서 확인 |
| Cloudflare KV 바인딩 | `wrangler.jsonc` 코드에서 확인 |
| Supabase 하드코딩 키 | `src/lib/supabase.ts:5-6` 코드에서 확인 |
| Vercel proxy 구성 | `vercel-proxy/vercel.json`, `vercel-proxy/api/gemini.js` 코드에서 확인 |
| Pages Functions 목록 (17개) | `functions/api/` 디렉토리 구조에서 확인 |
| `.env.production` 내용 | 파일에서 직접 확인 |
| admin 인증 방식 (sessionStorage) | `AdminPage.tsx` 코드에서 확인 (에이전트 분석) |
| Railway crawler 존재 | `crawler-server/` 디렉토리 + `railway.json`에서 확인 |
| 도메인 `story-darugi.com` | `src/index.tsx` sitemap, robots.txt, OG 메타에서 확인 |
| admin/public 코드 혼재 | `App.tsx`, `postStorageService.ts`, `apiService.ts`에서 확인 |
| PortOne 결제 SDK | `src/index.tsx:297` 코드에서 확인 |
