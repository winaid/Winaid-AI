# BL-D — blog-core / 양 앱 공유 / 블로그 SQL 감사관

검토 대상: `packages/blog-core/**` (총 19 파일, 7,451 lines), `public-app/lib/**`·`next-app/lib/**` 공통 lib (29 파일), `sql/**`·`public-app-sql/**` 블로그 도메인 SQL 35+ 마이그레이션.

main HEAD: `3666d74`. read-only · 코드 변경 없음.

---

## 0. blog-core 책임 분리 평가

### 구조 (파일 / lines / 책임)

| 파일 | lines | 책임 | 평가 |
| --- | ---: | --- | --- |
| `src/blogPrompt.ts` | 2545 | 블로그 프롬프트 빌더 (V3 통합 + 레거시) | **거대 단일 파일** — Part A~E 코멘트로 분할 의도 있으나 미실현 |
| `src/styleService.ts` | 1557 | 병원 말투 학습 (Supabase CRUD + Gemini + 채점 + buildStylePrompt) | **혼합 책임** — DB 액세스 / 외부 API 호출 / 프롬프트 빌더 한 파일 |
| `src/cardNewsLayouts.ts` | 801 | 카드뉴스 슬라이드 타입·테마·폰트·파서 | 도메인 데이터 + 타입 — 적정 |
| `src/medicalLawFilter.ts` | 267 | 의료광고법 후처리 필터 | 순수 함수 — 적정 |
| `src/medicalLawRules.ts` | 96 | 금지어 룰 + 프롬프트 블록 | 순수 — 적정 |
| `src/promptSanitize.ts` | 132 | 프롬프트 인젝션 방어 sanitize | 순수 — 적정 |
| `src/brandPreset.ts` | 120 | 브랜드 프리셋 타입·기본값·변환 | 순수 — 적정 |
| `src/types.ts` | 167 | 도메인 타입 (GenerationRequest 외) | 적정 |
| `src/supabase.ts` | 45 | Supabase 클라이언트 (anon + admin) | **모듈 사이드이펙트** — import 시점 클라이언트 생성 |
| `src/llm/*.ts` | 1234 | LLM 어댑터 (Claude/Gemini/router/cost/log/batch) | 서버 전용 — 적정 |
| `src/utils/safeFetch.ts` | 288 | SSRF-safe fetch (Node `dns`/`net` 의존) | server-only — barrel 제외 처리됨 |

### 평가 요약

**긍정**:
- React/JSX/DOM API import 0건 — 클라이언트 코드 누수 없음.
- `'use client'` 디렉티브 0건.
- `safeFetch.ts` 의 server-only 처리 (`src/index.ts:12-15`) 명시적 barrel 제외 — turbopack 'dns' Module not found 회피 정확.
- 역방향 의존 없음 (`packages/blog-core` 가 `public-app/`·`next-app/` 를 import 하지 않음).
- LLM 라우터의 `exhaustiveCheck` (`router.ts:91-123`) — 새 task 추가 시 컴파일 에러 강제.

**문제**:
- **모듈 사이드이펙트**: `supabase.ts:1-20` 가 import 즉시 `createClient` 호출. 환경에 `NEXT_PUBLIC_SUPABASE_URL` 없으면 null 반환하는 패턴이라 throw 는 안 하지만, **`NEXT_PUBLIC_*`** 환경변수 prefix 의존 자체가 Next.js 결합. blog-core 가 다른 호스트(crawler-server, video-processor)에서 재사용될 때 prefix 불일치 위험.
- **거대 파일**: `blogPrompt.ts` 2545 lines, `styleService.ts` 1557 lines — Part 분리 코멘트는 있으나 단일 파일 유지. 차후 PR 시 git blame fragmentation 위험.
- **혼재 책임 (styleService)**: Supabase CRUD (line 83~199, 1184~1320) + 크롤러 호출 (line 600+) + Gemini 분석 + buildStylePrompt 가 한 모듈. 클라이언트가 buildStylePrompt 만 쓰려 해도 Supabase admin 키 의존 트리가 끌려 들어감.

---

## 1. 양 앱 drift 매핑 표

`public-app/lib/` ∩ `next-app/lib/` 공통 29 파일 중 **19 파일이 diff** 됨 (10 파일만 동일). 인용은 `path:line`.

| 파일 | public-app L | next-app L | diff 요약 | master 추정 / 비고 |
| --- | ---: | ---: | --- | --- |
| `auth.ts` | 109 | 148 | next-app: 팀 기반 내부 로그인 (`nameTeamToEmail`), public-app: 이메일/패스워드 가입 | **의도적 분기** (외부 vs 내부 사용자) |
| `authFetch.ts` | 21 | 25 | next-app: `credentials: 'include'` 추가 (admin HttpOnly cookie) | next-app 우월 |
| `blogExport.ts` | 207 | 247 | next-app: `stripReferencesFooter` (depth counter), iframe 기반 print | **next-app 우월** — public-app 의 단순 regex 는 nested div 미스매치 회귀 |
| `blogSectionParser.ts` | 동일 | 동일 | — | 동기화 OK |
| `cardAiActions.ts` | 866 | 406 | public-app: `analyzeInspirationImage`, `sanitizeAiText` 등 추가, AI 액션 풍부 | **public-app 우월** — `analyzeInspirationImage` 는 next-app 미존재 |
| `cardNewsDesignTemplates.ts` | 동일 | 동일 | — | OK |
| `cardNewsPrompt.ts` | 500 | 464 | public-app: `sourceContent` 입력 추가, sanitize 정책 다름 (300 vs 200) | **public-app 우월** (sourceContent 미스) |
| `cardTemplateService.ts` | 327 | 273 | public-app: `layoutMatch`/`slideStructure` v3 학습 필드 추가, 프롬프트 어휘 다름 | **public-app 우월** — next-app 에 v3 필드 미존재 |
| `categoryTemplateTypes.ts` | 동일 | 동일 | — | OK |
| `categoryTemplates.ts` | 동일 | 동일 | — | OK |
| `clinicContextService.ts` | 208 | 209 | next-app: `authFetch` 사용 (Bearer 토큰), public-app: raw fetch | **의도적** (게스트 허용 차이) |
| `clinicalPrompt.ts` | 276 | 273 | sanitize 길이 차 (500 vs 200, 300 vs 200, 10000 vs 5000) | drift — **PII 잘림 정책 불일치** |
| `constants.ts` | 동일 | 동일 | — | OK |
| `creditService.ts` | 78 | 89 | next-app: 환불 RPC 코멘트 풍부, refund 결과 활용 | next-app 우월 |
| `devLog.ts` | 동일 | 동일 | — | OK |
| `fetchWithRetry.ts` | 동일 | 동일 | — | OK |
| `hospitalImageService.ts` | 46 | 51 | next-app: 시술 카테고리 (턱관절·잇몸치료 등) + 장면 키워드 (`기사`) 추가 | next-app 우월 — 분류 디테일 |
| `htmlUtils.ts` | 동일 | 동일 | — | OK |
| `keywordAnalysisService.ts` | 639 | 695 | next-app: `SaturationLevel` + `SATURATION_THRESHOLDS` + `authFetch` | **next-app 우월** — saturation 라벨링 미존재 |
| `postStorage.ts` | 237 | 208 | **public-app 만 `deletePost` 함수 보유** | **public-app 우월** — next-app 미존재 (요청 시 동작 불가) |
| `pressPrompt.ts` | 303 | 296 | public-app: sanitize 100/100 vs next 50/30, sanitizeSourceContent import 명시적 | **public-app 우월** — next-app sanitize 누락분 (`hospitalInfo` 장문) |
| `referenceFetcher.ts` | 동일 | 동일 | — | OK |
| `refinePrompt.ts` | 465 | 456 | public-app: scope 주석 풍부 + sanitize raw vs sanitized 구분 강조 | **public-app 우월** — next-app 의 raw target 직접 삽입 (작은 표현 변경) |
| `sanitize.ts` | 36 | 36 | next-app: 코멘트에 'ARC-002 통일' 표시만 다름 (코드 동일) | OK |
| `serverAuth.ts` | 24 | 23 | public-app: 게스트 코멘트 1줄 추가 | OK |
| `trustedMedicalSources.ts` | 동일 | 동일 | — | OK |
| `youtubePrompt.ts` | 169 | 165 | public-app: sanitize 500/100/300 vs next 200/50/200, transcript sanitize 코멘트 풍부 | **public-app 우월** |

### Drift Summary

- **공통 19 파일 diff** (전체 29 중 65.5%). ARC-001 (CardNewsProRenderer) 패턴이 lib 레이어에서 광범위하게 재발.
- **deletePost 미존재**: `next-app/lib/postStorage.ts` 에 `deletePost` 없음 → next-app 에서 글 삭제 코드패스 호출 시 미구현.
- **sanitize 길이 정책 불일치**: `clinicalPrompt.ts` / `youtubePrompt.ts` / `pressPrompt.ts` 에서 사용자 입력 length cap 이 양쪽 다름 (500 vs 200, 100 vs 50). 같은 prompt injection 방어인데 한쪽은 더 엄격.
- **next-app 에 saturation 분석 / authFetch 강제 / iframe print 가 더 진보**, **public-app 에 deletePost / cardAiActions 의 inspiration 분석 / cardTemplate v3 필드가 더 진보**. 양방향 drift — 단순 fork 가 아니라 **양쪽 모두에서 독립적 진화**.

---

## 2. 블로그 RLS 매트릭스

대상 테이블 5개 — 정책 인용은 `sql/bootstrap_new_supabase.sql` (next-app), `public-app-sql/bootstrap_new_supabase.sql` (public-app), 그리고 후속 마이그레이션.

| 테이블 | SELECT | INSERT | UPDATE | DELETE | 비고 |
| --- | --- | --- | --- | --- | --- |
| `generated_posts` | `auth.uid() = user_id` (own); service_role 별도 | `auth.uid() = user_id OR user_id IS NULL` (own) | (정책 부재 — UPDATE 차단) | service_role 만 (`Service role can delete posts`) | **DB-001 회귀**: INSERT WITH CHECK 의 `OR user_id IS NULL` 분기 그대로 유지 (`bootstrap_new_supabase.sql:166`, `setup/supabase_FULL_SETUP.sql:46`) |
| `blog_history` | `auth.uid() = user_id` | `auth.uid() = user_id` | (없음) | `auth.uid() = user_id` | 본인만. `match_blog_posts` 함수 우회 risk → DB-027 |
| `hospital_style_profiles` | `auth.role() = 'authenticated'` (auth) + `Anon can view (USING true)` | authenticated 만 | authenticated 만 | (DELETE 정책 명시 부재) | **읽기 anon 허용** — 병원명 + naver_blog_url 노출 |
| `hospital_crawled_posts` | 모두 (`USING true`) | authenticated 만 | authenticated 만 | authenticated 만 | `2026-04-11_crawled_posts_rls.sql` 적용. read-anyone 정책 의도적 |
| `user_credits` (관련) | own + service_role bypass | own + service_role bypass | own + service_role bypass | (없음) | `2026-05-04_credit_rpc_unify_bypass.sql` `auth.role()` 통일 OK |

추가 RPC 검증:

| RPC | 검증 | 비고 |
| --- | --- | --- |
| `use_credit(p_user_id)` | `auth.role()='service_role'` OR `auth.uid()=p_user_id` | OK (`security_hardening.sql:208`, `unify_bypass.sql`) |
| `refund_credit(p_user_id, p_amount)` | 동일 + amount 1~100 enforce | OK (`unify_bypass.sql:73-79`) |
| `match_blog_posts(query_embedding, threshold, count, filter_user_id)` | **`filter_user_id IS NULL OR blog_history.user_id = filter_user_id`** | **DB-027 회귀** — `bootstrap_new_supabase.sql:446` 그대로 |
| `get_admin_stats` 등 4개 admin RPC | `app.admin_password` 검증 + search_path 고정 | OK (`security_hardening.sql:50-188`). 단 baseline B [DB-024] 에서 quick_recovery 회귀 가능성 별도 |

---

## High

### [BL-D-001] generated_posts INSERT WITH CHECK 의 NULL 분기 회귀 (DB-001 베이스라인)

- 카테고리: 보안 / High (회귀)
- 위치: `sql/bootstrap_new_supabase.sql:166-168`, `sql/setup/supabase_FULL_SETUP.sql:45-47`, `public-app-sql/bootstrap_new_supabase.sql` (동일 라인)
- 인용:
  ```
  CREATE POLICY "Users can insert own posts" ON public.generated_posts
    FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  ```
- 현상: PR #104 (`2026-05-04_rls_anon_lockdown.sql`) 가 `Anon can insert posts` 정책만 DROP. base "Users can insert own posts" 정책의 `OR user_id IS NULL` 분기는 그대로. authenticated 사용자가 user_id=NULL 로 INSERT 가능 → SELECT 정책 `auth.uid() = user_id` 가 NULL 비교 false → **본인도 못 보는 orphan row** 생성, 그러나 admin RPC `get_all_generated_posts` 는 노출 (`bootstrap_new_supabase.sql:299` / `security_hardening.sql:97-131`).
- 영향: PII (user_email, ip_hash, hospital_name, content) 가 admin 화면에는 보이지만 본인은 못 보는 데이터 무결성 + PIPA 우탈권 행사 곤란.
- 재현: authenticated user JWT 로 `INSERT INTO generated_posts (user_id, post_type, title, content) VALUES (NULL, 'blog', 'x', 'x')` → 통과. 본인 listPosts 결과에 미포함, admin 화면에는 노출.
- 수정 제안: `WITH CHECK (auth.uid() = user_id)` 로 단순화 (NULL 차단). 또는 `user_id NOT NULL DEFAULT auth.uid()` 컬럼 제약.
- 베이스라인 비교: B [DB-001] 와 동일. **회귀 미해소** (baseline 후 14 일 경과).

### [BL-D-002] match_blog_posts filter_user_id NULL 허용 회귀 (DB-027)

- 카테고리: 보안 / High (회귀)
- 위치: `sql/bootstrap_new_supabase.sql:413-452`, `public-app-sql/bootstrap_new_supabase.sql`
- 인용:
  ```
  CREATE OR REPLACE FUNCTION match_blog_posts(
    query_embedding VECTOR(768),
    match_threshold FLOAT DEFAULT 0.3,
    match_count INT DEFAULT 5,
    filter_user_id UUID DEFAULT NULL
  ) RETURNS TABLE (...) LANGUAGE plpgsql AS $$
  BEGIN
    RETURN QUERY SELECT ...
    FROM public.blog_history
    WHERE (filter_user_id IS NULL OR blog_history.user_id = filter_user_id) ...
  ```
- 현상: SECURITY DEFINER 미지정 (RLS 살아있음) 이지만, service_role 호출 또는 RLS 우회 환경에서는 임의 user 의 blog_history (PII 포함 본문 + 임베딩) 노출. 또한 LANGUAGE plpgsql + RLS interaction 에서 SECURITY INVOKER 가 디폴트라 caller RLS 적용되지만 `filter_user_id IS NULL` 분기 자체가 leak surface.
- 영향: pgvector 유사도 검색 → 다른 병원/사용자 임베딩 수신. 학습된 글 PII 누설 가능.
- 재현: `SELECT * FROM match_blog_posts('[...]'::vector, 0.3, 5, NULL)` — service_role 또는 정책 우회 시 전 사용자 결과.
- 수정 제안: 함수 본문 첫 줄에 `IF filter_user_id IS NULL OR auth.uid() <> filter_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;` (use_credit 패턴). SECURITY DEFINER + caller 검증.
- 베이스라인 비교: B [DB-027] 동일. **회귀 미해소**.

### [BL-D-003] PII 평문 저장 (pgcrypto 미사용) — DB-018 회귀

- 카테고리: 보안·컴플라이언스 / High (회귀)
- 위치: `sql/bootstrap_new_supabase.sql:140-150` (generated_posts), `:333-340` (api_usage_logs.user_id), `:380-392` (blog_history.content)
- 현상: `user_email` / `ip_hash` / `hospital_name` / `doctor_name` / `content` 모두 평문 TEXT. `CREATE EXTENSION pgcrypto` 자체가 어느 SQL 파일에도 없음 (`grep "pgcrypto"` 0 hits). `bootstrap` 의 Extensions 섹션은 `vector` 만.
- 영향: DB dump 유출 시 PII 즉시 노출. PIPA 24조 (안전성 확보 조치) 위반 surface. `ip_hash` 컬럼명은 hash 인 듯 보이나 실제 SQL/코드에서 hash 처리 흔적 없음 — 컬럼명 misleading.
- 재현: `\d+ generated_posts` → user_email TEXT NULL.
- 수정 제안:
  - 단기: `CREATE EXTENSION IF NOT EXISTS pgcrypto`. 신규 PII 컬럼은 `pgp_sym_encrypt(value, current_setting('app.pii_key'))::TEXT`. application 레이어에서 `pgp_sym_decrypt` 호출.
  - 중기: PII 컬럼 분리 테이블 + service_role 만 SELECT.
  - 장기: HSM/KMS 통합.
- 베이스라인 비교: B [DB-018] 동일. **회귀 미해소**.

### [BL-D-004] postStorage drift — public-app 만 deletePost

- 카테고리: 기능 누락 / High
- 위치: `public-app/lib/postStorage.ts:210-237` 만 존재. `next-app/lib/postStorage.ts` 209 line 에서 끝.
- 현상: next-app 에 동일 파일명·동일 시그니처지만 `deletePost` export 누락. next-app 의 어딘가에서 `import { deletePost } from '../../lib/postStorage'` 호출 시 build error / 런타임 undefined.
- 영향: next-app 사용자가 글 삭제 기능 호출 불가. 기능 회귀.
- 재현: `grep -rn "from '.*postStorage'" next-app/` 로 호출처 확인 후 호출자 검증.
- 수정 제안: blog-core 로 통합 이동 (`packages/blog-core/src/postStorage.ts`) 후 양쪽 lib 에서 re-export 만. ARC-005 의 직접 후보.
- 베이스라인 비교: ARC-005 진행 미완 — postStorage 가 blog-core 미이주 상태.

### [BL-D-005] cardAiActions / cardTemplateService / keywordAnalysisService 양방향 drift

- 카테고리: 아키텍처 / High
- 위치:
  - `public-app/lib/cardAiActions.ts` 866 lines vs `next-app/lib/cardAiActions.ts` 406 lines — `analyzeInspirationImage`, `sanitizeAiText` 가 public-app 전용
  - `public-app/lib/cardTemplateService.ts` 327 vs next 273 — `layoutMatch` / `slideStructure` v3 필드가 public-app 전용
  - `next-app/lib/keywordAnalysisService.ts` 695 vs public 639 — `SaturationLevel` / `SATURATION_THRESHOLDS` / `authFetch` 가 next-app 전용
- 현상: 같은 도메인 로직이 양쪽에서 **독립 진화**. master 가 어느 쪽인지 단정 불가 — 한쪽에 있는 기능이 다른 쪽엔 없음.
- 영향: 기능 평행성 깨짐. 한쪽에서 발견된 버그가 다른 쪽에서 미수정.
- 재현: 위 diff. 660 line 차 (cardAiActions), 56 line 차 (keywordAnalysisService).
- 수정 제안: ARC-005 후속 — blog-core 로 통합. union of features 후 양쪽에서 동일 import.
- 베이스라인 비교: ARC-005 (blog-core 통합 미완) 직접 진행도 지표.

### [BL-D-006] sanitize 길이 정책 양앱 불일치 (prompt injection 방어 비대칭)

- 카테고리: 보안 / High
- 위치:
  - `public-app/lib/clinicalPrompt.ts:112-117` `sanitizePromptInput(req.topic, 500)` / `sanitizeSourceContent(req.imageAnalysis, 10000)`
  - `next-app/lib/clinicalPrompt.ts:112-117` `sanitizePromptInput(req.topic, 200)` / `sanitizeSourceContent(req.imageAnalysis, 5000)`
  - `public-app/lib/youtubePrompt.ts:96-104` cap 500/100/300 vs `next-app/lib/youtubePrompt.ts` 200/50/200
  - `public-app/lib/pressPrompt.ts:108-117` 명시적 sanitize 6 변수 vs `next-app/lib/pressPrompt.ts:107-112` 일부만
- 현상: 동일 prompt injection 방어 의도. cap 길이가 양쪽에서 2~3배 차이. next-app 더 엄격하지만, public-app `pressPrompt` 는 추가 변수까지 sanitize (`safeHospitalInfo`).
- 영향: 같은 페이로드가 한쪽에서는 거부, 다른 쪽에서는 통과. 보안 일관성 부재.
- 재현: 위 line 직접 인용.
- 수정 제안: blog-core 로 통합 (단일 진실원). 길이는 보수적 쪽 (next-app 기준) 채택, 단 `pressPrompt` 의 hospitalInfo sanitize 는 public-app 우월 보존.
- 베이스라인 비교: 신규.

---

## Medium

### [BL-D-007] blog-core self-import 안티패턴

- 카테고리: 아키텍처 / Medium
- 위치: `packages/blog-core/src/styleService.ts:6,12-14`, `packages/blog-core/src/blogPrompt.ts:11-13`
- 인용:
  ```
  // styleService.ts
  import { supabase, supabaseAdmin } from '@winaid/blog-core';
  import type { CrawledPostScore, DBCrawledPost } from '@winaid/blog-core';
  ```
- 현상: 블로그-core 내부 파일이 자기 패키지 이름으로 import. tsconfig path mapping 이 `index.ts` 직접 가리켜 build 동작은 OK 이나, barrel `index.ts` 가 다시 styleService 를 re-export → 순환. moduleResolution 이 `bundler` 라 통과하지만, ESM 빌드 / tsup / 외부 publish 시 fragile.
- 영향: 향후 ESM 배포 시 순환 import 에러. 가독성 (deep relative import 가 정석).
- 재현: `grep -n "from '@winaid/blog-core'" packages/blog-core/src/*.ts` — 7건.
- 수정 제안: 내부 import 는 `'./types'`, `'./supabase'`, `'./medicalLawFilter'` 등 상대 경로로 통일.
- 베이스라인 비교: 신규.

### [BL-D-008] blog-core/supabase.ts 의 NEXT_PUBLIC_* env 결합

- 카테고리: 아키텍처 / Medium
- 위치: `packages/blog-core/src/supabase.ts:3-4`
- 인용:
  ```
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  ```
- 현상: blog-core 가 Next.js 의 `NEXT_PUBLIC_*` 명명규약에 직접 의존. Next.js 외 환경 (`crawler-server`, `video-processor`) 에서 재사용 시 변수명 다름.
- 영향: blog-core 의 hosting context 결합. shared package 원칙 위반.
- 재현: 위 인용.
- 수정 제안: `SUPABASE_URL` / `SUPABASE_ANON_KEY` 도 fallback 으로 인식. 또는 caller 가 client 객체를 주입하는 패턴 (Inversion of Control).
- 베이스라인 비교: 신규.

### [BL-D-009] blog-core/supabase.ts import 시점 사이드이펙트

- 카테고리: 아키텍처 / Medium
- 위치: `packages/blog-core/src/supabase.ts:11-20`
- 현상: top-level 에서 `createClient(...)` 호출. ESM tree-shake 시 미사용해도 클라이언트 생성. 테스트 환경 (Jest 등) 에서 환경변수 미주입 시 모듈 로드 즉시 null 객체 캐시 — 이후 env 동적 주입해도 client 미재초기화.
- 영향: 테스트 모킹 어려움. cold-start 미세 비용. side-effect-free 패키지 보장 X.
- 수정 제안: `getSupabase()` lazy factory 만 export. `supabase` / `supabaseAdmin` const export 폐기 (점진적 deprecation).
- 베이스라인 비교: 신규.

### [BL-D-010] blogPrompt.ts 2545 lines · styleService.ts 1557 lines 단일 파일

- 카테고리: 유지보수성 / Medium
- 위치: `packages/blog-core/src/blogPrompt.ts`, `packages/blog-core/src/styleService.ts`
- 현상: 두 파일이 blog-core 의 64% (4102 / 7451 lines). 헤더 코멘트로 Part A~E / 섹션 표시 있으나 파일 분할 안 됨.
- 영향: PR 리뷰 어려움 / git blame 단편화 / IDE 인덱싱 지연 / merge conflict 폭증.
- 재현: `wc -l`.
- 수정 제안: `blogPrompt/{persona.ts, audience.ts, examples.ts, builders.ts}` 등 분할. styleService 는 `style/{db.ts, crawler.ts, scorer.ts, builder.ts}` 분할.
- 베이스라인 비교: 신규.

### [BL-D-011] hospital_style_profiles RLS 정책에서 anon SELECT 허용

- 카테고리: 보안 / Medium
- 위치: `sql/bootstrap_new_supabase.sql:218-220`, `public-app-sql/bootstrap_new_supabase.sql` 동일
- 인용:
  ```
  CREATE POLICY "Anon can view style profiles" ON public.hospital_style_profiles
    FOR SELECT USING (true);
  ```
- 현상: 2026-04-11 crawled_posts RLS 강화는 적용됐으나 `hospital_style_profiles` 의 anon SELECT 정책은 그대로. anon key 로 모든 병원의 `hospital_name` / `naver_blog_url` / `style_profile` (JSONB 안의 sample 텍스트) 조회 가능.
- 영향: 경쟁 병원 어드밴티지 (어느 병원이 학습됐는지 / 어떤 톤인지 노출). PII 직접은 아니지만 영업비밀.
- 재현: `SET ROLE anon; SELECT hospital_name, naver_blog_url FROM hospital_style_profiles;` → 전수 조회.
- 수정 제안: anon SELECT 정책 DROP. authenticated 만 허용. server route 가 supabaseAdmin 으로 처리.
- 베이스라인 비교: 신규 (B [DB-001] 와 같은 anon-lockdown 패턴이지만 hospital_style_profiles 누락).

### [BL-D-012] hospital_style_profiles DELETE 정책 부재 (next-app 기준)

- 카테고리: 데이터 무결성 / Medium
- 위치: `sql/bootstrap_new_supabase.sql:209-226`
- 현상: `hospital_style_profiles` 에 SELECT/INSERT/UPDATE 정책은 anon + authenticated 둘 다 있으나, DELETE 는 anon 정책 (`Anon can delete style profiles`) 만 존재 (`USING true`). authenticated 별도 DELETE 정책 부재 → anon 이 모든 삭제 가능.
- 영향: anon key 노출 시 모든 병원 학습본 삭제 → 운영 회귀.
- 재현: `SET ROLE anon; DELETE FROM hospital_style_profiles WHERE hospital_name = 'X';` → 통과.
- 수정 제안: `Anon can delete style profiles` DROP. `authenticated` 만 + `auth.role()='service_role'` 우회.
- 베이스라인 비교: 신규.

### [BL-D-013] generated_posts.user_id ON DELETE SET NULL — 우탈권 처리 + admin 노출

- 카테고리: 컴플라이언스 / Medium
- 위치: `sql/bootstrap_new_supabase.sql:142`
- 인용: `user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL`
- 현상: 사용자 탈퇴 (auth.users DELETE) 시 generated_posts 의 user_id NULL. content / hospital_name / user_email / ip_hash 는 그대로 남음. PIPA 21조 우탈권 (개인정보 파기) 미충족.
- 영향: 탈퇴 후에도 admin RPC `get_all_generated_posts` 에서 평문 PII 조회.
- 재현: `DELETE FROM auth.users WHERE id = '<x>'` 후 `SELECT user_email, ip_hash, content FROM generated_posts WHERE user_id IS NULL`.
- 수정 제안: `ON DELETE CASCADE` 로 변경. 또는 BEFORE DELETE TRIGGER 로 PII 컬럼 NULL 처리. 단 generated_posts 는 분석/품질 학습 목적도 있으므로, content 만 archive 후 user_email/ip_hash 만 NULL 도 옵션.
- 베이스라인 비교: B [DB-018] 의 일부 (PII 처리 정책 부재).

### [BL-D-014] blog_history.user_id ON DELETE CASCADE + 임베딩에 PII 잔존

- 카테고리: 컴플라이언스 / Medium
- 위치: `sql/bootstrap_new_supabase.sql:382`
- 현상: `ON DELETE CASCADE` 라 우탈권 OK. 그러나 `match_blog_posts` 가 `filter_user_id IS NULL` 분기로 다른 user 의 결과 노출 시점에 (DB-027) PII 가 새는 경로 — 임베딩은 차원 압축이라 직접 복원은 어렵지만 `content` 컬럼이 본문 전체. BL-D-002 와 결합되어야 활성화.
- 수정 제안: BL-D-002 수정으로 자동 해소.
- 베이스라인 비교: 위와 결합.

### [BL-D-015] hospital_crawled_posts 자동 로테이션 트리거 동시성 risk

- 카테고리: 데이터 무결성 / Medium
- 위치: `sql/bootstrap_new_supabase.sql:301-326`
- 인용:
  ```
  CREATE OR REPLACE FUNCTION limit_crawled_posts_per_hospital()
  RETURNS TRIGGER AS $$
  BEGIN
    DELETE FROM public.hospital_crawled_posts
    WHERE hospital_name = NEW.hospital_name
      AND source_blog_id = NEW.source_blog_id
      AND id NOT IN (SELECT id FROM ... ORDER BY crawled_at DESC LIMIT 10);
    ...
  AFTER INSERT
  ```
- 현상: AFTER INSERT 트리거에서 hospital + source_blog 별 10개 초과 oldest 삭제. 동시 INSERT 2건이 거의 동시에 발생하면 서브쿼리 시점 race — 둘 다 11번째라 보고 양쪽이 oldest 삭제 → 9개만 남는 경우 가능. UNIQUE constraint (hospital_name, url) 은 있으나 LIMIT 보호는 transaction-level 락 부재.
- 영향: 멀티 cron 또는 동시 회수 시 학습 샘플 손실. 일반적 사용 빈도 낮으나 cron 동시 실행 시 빈번.
- 재현: 동시 INSERT 11건 — 각자 자기 view 에서 11번째라 판단.
- 수정 제안: `LOCK TABLE ... IN SHARE ROW EXCLUSIVE MODE` 또는 advisory lock (`pg_advisory_xact_lock(hashtext(hospital_name))`) 트리거 본문 첫 줄.
- 베이스라인 비교: 신규.

### [BL-D-016] generated_posts 드래프트 자동저장의 last-write-wins (postStorage.savePost)

- 카테고리: 데이터 무결성 / Medium
- 위치: `public-app/lib/postStorage.ts:71-127`, `next-app/lib/postStorage.ts:71-126`
- 현상: `savePost` 는 항상 `INSERT` (UPDATE 또는 UPSERT 없음). 드래프트 자동저장 시 매 호출마다 새 row → 중복. 또는 클라이언트가 같은 드래프트를 두 탭에서 동시 저장 시 둘 다 INSERT (ID 다름).
- 영향: generated_posts 가 드래프트 noise 로 폭증. 멱등성 부재 → 재시도 시 중복 row.
- 재현: `await savePost(...)` 두 번 → 두 row.
- 수정 제안: client-generated `draft_id` (UUID) + UNIQUE INDEX. UPSERT (`ON CONFLICT DO UPDATE`). 또는 별도 `post_drafts` 테이블 + 완료 시 generated_posts 로 promote.
- 베이스라인 비교: 신규.

---

## Low

### [BL-D-017] blog-core dependency 가 peerDependency 로 분리되지 않음

- 카테고리: 의존성 / Low
- 위치: `packages/blog-core/package.json`
- 인용:
  ```
  "dependencies": {
    "@anthropic-ai/sdk": "^0.93.0",
    "@supabase/supabase-js": "^2.89.0"
  }
  ```
- 현상: `@anthropic-ai/sdk`, `@supabase/supabase-js` 가 dependencies. 양쪽 앱이 동일 SDK 별도 설치 시 npm/yarn workspace 가 hoist 되긴 하나, 버전 충돌 시 두 인스턴스 가능 (`@supabase/supabase-js` 의 GoTrueClient `Multiple GoTrueClient instances` 경고).
- 영향: 인스턴스 중복 → auth state 동기화 실패.
- 재현: 양쪽 앱의 `package.json` 에서 `@supabase/supabase-js` 버전 확인.
- 수정 제안: blog-core 의 `@supabase/supabase-js` 를 peerDependencies 로 이동. 양쪽 앱이 진실원.
- 베이스라인 비교: 신규.

### [BL-D-018] blog-core export 다수가 외부 호출처 0건 (un-export 권장)

- 카테고리: 데드 코드 / Low — **삭제 후보, 사용자 결정 필요**
- 위치: `packages/blog-core/src/blogPrompt.ts`
- 현상: 다음 export 가 외부 (public-app + next-app) 호출처 0건 — 내부 사용만:
  - `DENTAL_PROSTHETIC_GUIDE`, `CATEGORY_DEPTH_GUIDES`, `TOPIC_TYPE_GUIDES`, `E_E_A_T_GUIDE`, `JOURNEY_STAGE_GUIDES`, `FAQ_SECTION_GUIDE`, `IMAGE_PROMPT_GUIDE`, `COMMON_WRITING_STYLE`, `BLOG_EXAMPLES`, `PRIORITY_ORDER_BLOCK`, `SELF_CHECK_GUIDE`, `BLOG_PERSONA`, `TERMINOLOGY_GUIDE`, `getSeasonalContext`, `classifyTopicType`, `isProstheticTopic`, `inferJourneyStage`
- 현상 (계속): `blogPrompt.ts` 의 18개 export 중 17개는 내부 사용만 — `export` 키워드 제거 권장. **`buildHtmlTemplate`** (line 175) 은 **내부 사용 0 + 외부 사용 0** → **완전 dead code 후보 — 삭제 후보, 사용자 결정 필요**.
- 위치 (cardNewsLayouts): `THEME_PRESETS` (line 364), `DESIGN_PRESETS` (line 502) — 외부 0 + 내부 self-decl 만. **삭제 후보, 사용자 결정 필요**.
- 위치 (medicalLawRules): `REPLACEMENT_MAP` 외부 0 + 내부 1회 (자기 사용) → un-export 권장 (내부 const).
- 위치 (llm/cost): `CLAUDE_RATES`, `GEMINI_RATES`, `computeClaudeCost`, `computeGeminiCost` 외부 0 → un-export 권장. 단 `index.ts:71` 에서 의도적 re-export — 향후 검증 endpoint 노출용.
- 영향: API surface 비대 / 자동 IDE 추천 noise / dead code 누적.
- 재현: `for sym in ...; do grep -rln "$sym" public-app/ next-app/ --include="*.ts*" | wc -l; done`.
- 수정 제안: 자동 삭제 금지. 단계 1: `export` → 내부 const 로 강등. 단계 2: 의도적 진정 dead (`buildHtmlTemplate` 등) 만 삭제 — 단 사용자 결정 필요.
- 베이스라인 비교: 신규.

### [BL-D-019] hospital_style_profiles.hospital_name 이 string 매칭 (FK 부재)

- 카테고리: 데이터 무결성 / Low
- 위치: `sql/bootstrap_new_supabase.sql:198`
- 현상: `hospital_name TEXT NOT NULL UNIQUE` 만 — `hospitals(name)` 와 FK 관계 없음. 오타 / 띄어쓰기 변경 시 별도 row 생성.
- 영향: 같은 병원의 학습본 중복 / 일관성 없는 매칭.
- 수정 제안: `hospitals` 테이블 PK 또는 별도 hospital_id 컬럼 + FK. 마이그레이션 시 `hospital_name` 정규화 후 매핑.
- 베이스라인 비교: 신규.

### [BL-D-020] blog-core 의 cardNewsLayouts.ts 가 도메인 + 데이터 혼재 (801 lines)

- 카테고리: 유지보수성 / Low
- 위치: `packages/blog-core/src/cardNewsLayouts.ts`
- 현상: SlideData 타입 + COVER_TEMPLATES + DESIGN_PRESETS + THEME_PRESETS + CARD_FONTS + parser (`parseProSlidesJson`) 가 한 파일. 타입과 데이터·파서가 분리 안 됨.
- 수정 제안: `cardNews/{types.ts, presets.ts, fonts.ts, parser.ts}` 분할.
- 베이스라인 비교: 신규.

---

## 요약 통계

### 발견 합계: **20 건** (High 6, Medium 10, Low 4)

### 카테고리별 발견 수

| 카테고리 | High | Medium | Low | 합계 |
| --- | ---: | ---: | ---: | ---: |
| 보안 (RLS / RPC) | 3 (BL-D-001, 002, 011) | — | — | 3 |
| 보안 (sanitize) | 1 (BL-D-006) | — | — | 1 |
| 보안·컴플라이언스 (PII) | 1 (BL-D-003) | 2 (BL-D-013, 014) | — | 3 |
| 데이터 무결성 | — | 3 (BL-D-012, 015, 016) | 1 (BL-D-019) | 4 |
| 아키텍처 (drift / 책임) | 1 (BL-D-005) | 3 (BL-D-007, 008, 009) | — | 4 |
| 기능 누락 / drift | 1 (BL-D-004) | — | — | 1 |
| 유지보수성 | — | 1 (BL-D-010) | 1 (BL-D-020) | 2 |
| 의존성 | — | — | 1 (BL-D-017) | 1 |
| 데드 코드 | — | — | 1 (BL-D-018) | 1 |
| **합계** | **6** | **10** | **4** | **20** |

### Drift 발견: **19 건** (양 앱 lib 공통 29 파일 중 19 파일이 diff)

상세는 §1 매핑 표.

### Dead code 후보: **3 건** (모두 "삭제 후보 — 사용자 결정 필요")

1. `packages/blog-core/src/blogPrompt.ts:175` `buildHtmlTemplate` — 외부 0 + 내부 0 호출 (BL-D-018)
2. `packages/blog-core/src/cardNewsLayouts.ts:364` `THEME_PRESETS` — 외부 0 + 내부 self-decl 만 (BL-D-018)
3. `packages/blog-core/src/cardNewsLayouts.ts:502` `DESIGN_PRESETS` — 외부 0 + 내부 self-decl 만 (BL-D-018)

(추가 17개 internal-only export 는 un-export 강등 권장 — 삭제 아님)

### 베이스라인 회귀 의심 항목

- **DB-001 (generated_posts INSERT NULL 분기)** — `bootstrap_new_supabase.sql:166`, `setup/supabase_FULL_SETUP.sql:46` 그대로. 회귀 미해소 (BL-D-001).
- **DB-027 (match_blog_posts filter_user_id NULL 허용)** — `bootstrap_new_supabase.sql:446` 그대로. 회귀 미해소 (BL-D-002).
- **DB-018 (PII 평문 저장)** — pgcrypto 미설치. 컬럼 평문. 회귀 미해소 (BL-D-003).
- **ARC-001 패턴 재발** — public-app/lib + next-app/lib 의 19 파일이 양방향 drift (BL-D-005). ARC-005 (blog-core 통합) 진행 미완.
- **ARC-005 (blog-core 통합 미완)** — postStorage / cardAiActions / cardTemplateService / keywordAnalysisService 등이 lib 레벨에 잔존. 본 감사 대상 19 파일 drift 가 직접 증거 (BL-D-004, BL-D-005, BL-D-006).
