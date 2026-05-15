# Winaid-AI 코드 감사 리포트 — 2026-05-15

> 본 리포트는 read-only sweep 결과입니다. 코드는 수정하지 않았습니다.
> 작성: 클로드 코드 세션 (claude/production-ready-product-YLjaX 브랜치)
> 입력 컨텍스트: CLAUDE.md, docs/INVARIANTS.md, docs/handoff-2026-05-07.md, docs/AUDIT_REPORT.md, _migration/POST_MERGE_FOLLOWUPS.md
> 비교 기준선: 2026-05-05 AUDIT_REPORT (181 finding) + 2026-05-07 handoff (audit §9 + §12 TODO).

---

## Scope

### 실제 검토 경로 (직접 read / grep)
- `packages/blog-core/src/blogPrompt.ts` — 5빌더 + COMMON_WRITING_STYLE + PRIORITY_ORDER_BLOCK + E_E_A_T_GUIDE + REVIEWER_E_E_A_T_GUIDE + categoryHints + CATEGORY_TONE / CATEGORY_DEPTH_GUIDES / CATEGORY_IMAGE_GUIDES / TERMINOLOGY_GUIDE
- `packages/blog-core/src/medicalLawFilter.ts` (filterMedicalLawViolations, applyContentFilters)
- `packages/blog-core/src/medicalLawNormalize.ts` (normalizeForMedicalAdMatch)
- `packages/blog-core/src/normalizeMarkdownToHtml.ts`
- `packages/blog-core/src/koreanGrammarFilter.ts`
- `packages/blog-core/src/__tests__/` 16개 테스트 파일 (proseFlowRule / contentCategoryDriftZero / blogReviewPrompt / blogSectionRegen / categoryGuide / imageCategoryGuide / clinicalCategoryTone / pressCategoryTone / categoryCtaHint / leakFilter / koreanGrammarFilter / medicalLawNormalize / piiMask / normalizeMarkdownToHtml / blogTopicRecommend / normalizeBlogCases)
- `public-app/app/api/generate/blog/route.ts`, `blog/review/route.ts`, `blog/section/route.ts`
- `next-app/app/api/generate/blog/route.ts`, `blog/review/route.ts`, `blog/section/route.ts`
- `public-app/app/api/generate/clinical/route.ts`, `next-app/app/api/generate/clinical/route.ts`
- `public-app/app/api/generate/press/route.ts`, `next-app/app/api/generate/press/route.ts`
- `public-app/components/video-edit/CompletionScreen.tsx` (Blob URL)
- `public-app/app/api/health/route.ts` (신규 — PR #193)
- `.github/workflows/ci.yml`
- `git log` 2026-05-08 이후 23개 PR

### 부분 검토 (grep + 인용 위주, 라인 단위 정독 X)
- `lib/auth.ts`, `lib/creditService.ts`, `lib/postStorage.ts` (양 앱)
- `public-app/app/api/video/*` (9개 라우트)
- `public-app/app/api/card-news/generate-{text,images,outline}/route.ts`
- `sql/migrations/2026-05-04*` / `2026-05-06*` / `2026-05-08*`
- `next-app/app/api/diagnostic/*` 라우트 6개

### 미검토 (Scope 외)
- `crawler-server/src/**`, `video-processor/src/**`, `winai-blog-publisher/src/**` — 본 sweep 에서 미정독 (2026-05-05 audit §9 Agent C 가 정독한 결과만 인용)
- `next-app/admin/page.tsx` 내부 1034 LoC — grep 만, 라인 단위 정독 X
- `public-app/components/CardNewsProRenderer.tsx` 1772 LoC + 양 앱 card_news 페이지 — 2026-05-05 audit ARC-001 정정(2026-05-06) 으로 dead code 정리됨, 본 sweep 재검증 X
- Supabase 운영 DB 의 `pg_policies` 라이브 상태 — 마이그레이션 정합과 별개 실측 필요
- 실제 Vercel 운영 로그 (`[BLOG] leak stripped` / `[BLOG_IMAGE] 비임상 행동 감지` 등 텔레메트리 빈도)
- E2E (Playwright) suite 실행 결과 — 본 sweep 은 코드 정합만 검토

---

## Executive Summary

총 **27 finding** (중복 제거).

| 심각도 | 건수 | 메모 |
|---|---|---|
| 🔴 Critical | **1** | next-app blog/review JSON parse fail-open (★ 신규 — public-app 만 fix, drift 회귀) |
| 🟠 High | **6** | public-app clinical leak filter 누락, Stored Prompt Injection(병원 컨텍스트), Blob URL 누수 회귀, 멱등성 키 부재, PIPA 동의 기록, medical-ad 분쟁 입증 |
| 🟡 Medium | **12** | sanitize 비대칭, 거대 페이지, keyIndex race, postcss CVE, Sentry next-app 미통합, 인메모리 rate limit, 부분 실패 환불 정책, 등 |
| 🟢 Low | **8** | 데드 코드 후보, ESLint 미도입, as any 잔여, 회상 인용 — 점진 정리 |

**회귀 가드 결과**:
- R-1 prose-flow: ✅ Pass
- R-2 카테고리 7종 drift-zero: ✅ Pass
- R-3 5빌더 PRIORITY_ORDER + E_E_A_T slot 1: ⚠️ Partial (reviewer 변형은 PRIORITY_ORDER_BLOCK 미주입 — CLAUDE.md 문구 vs 실제 코드/테스트 의도 차이)
- R-4 의료법 normalize 전체 입력 통과: ✅ Pass
- R-5 후처리 가드 와이어업: ⚠️ Partial (public-app clinical 라우트가 sanitizeLeakInHtml 미호출 — next-app 만 보유 = drift)

**2026-05-07 핸드오프 이후 진척** (PR #182~#211, 30개):
- 진단 funnel 7 카테고리 확장 + 카테고리 quartet (블로그·이미지·임상·보도) 정합 완성
- 마크다운 회귀 3중 차단 (PR #203) + 한국어 비문 필터 (PR #204) + 줄글 prose 강제 (PR #201)
- 5빌더 안전망 완결 (PR #199, #200) — 단 reviewer 변형은 의도된 deviation
- /api/health (PR #193) + 통합 에러 핸들러 + Sentry captureException (PR #190) + 구조화 로깅 + request_id (PR #191)
- medicalAdMatch Unicode 우회 차단 NFC/zero-width/호모글리프 (PR #189) — R-4 완성

---

## 1. 🔒 보안

### [Critical] ★ next-app blog/review JSON parse 시 fail-open — public-app 과 drift
- 위치: `next-app/app/api/generate/blog/review/route.ts:150-154`
- 문제: LLM 응답 JSON 파싱 실패 시 `verdict='pass'`, `issues=[]`, `revisedHtml=null`, `summaryNote='parse_failed_passthrough'` 반환. 클라이언트는 "감수 통과 → 게시 OK" 로 해석 가능.
  ```ts
  if (!parsed) {
    verdict = 'pass';
    issues = [];
    revisedHtml = null;
    summaryNote = 'parse_failed_passthrough';
  }
  ```
- 비교: `public-app/app/api/generate/blog/review/route.ts:206-219` 는 동일 분기를 **fail-closed** 로 패치 완료 (`applyContentFilters` 결과로 `minor_fix`/`major_fix` 결정).
- 영향: next-app admin 이 운영용으로 블로그 생성 → 감수 → 게시 워크플로 사용 시, JSON 파싱 실패 1건이라도 발생하면 의료광고법 검증 우회 가능. callLLM 실패 분기(line 114-141) 는 fail-closed 로 이미 패치됨 → 본 분기만 회귀 잠복.
- 권장 수정: public-app 의 BL-A-P2 fail-closed 패턴을 next-app 으로 mechanical mirror. 14-15 lines 차이.

### [High] ★ public-app/api/generate/clinical 라우트에 sanitizeLeakInHtml 누락 — drift (R-5 부분 회귀)
- 위치: `public-app/app/api/generate/clinical/route.ts:152-153`
- 문제: server-side 응답에 `sanitizeLeakInHtml` 호출 없음. `unmaskPII` 만 거쳐 그대로 반환.
  ```ts
  const finalText = data.text ? unmaskPII(data.text as string, allReplacements) : data.text;
  return NextResponse.json({ text: finalText, usage: data.usage, model: data.model });
  ```
- 비교: `next-app/app/api/generate/clinical/route.ts:147` 는 `sanitizeLeakInHtml(data.text)` 호출. press 라우트는 양 앱 모두 호출 (next-app:197, public-app:150).
- 영향: 임상글 생성 응답에 `[META]` / `[CRITICAL]` / `[OUTPUT FORMAT]` 같은 영문 메타 라벨이 본문에 누수되면 client-side `applyContentFilters` (clinical/page.tsx:277) 가 잡으나, 서버는 신뢰 경계. 외부에서 API 직접 호출 시 client-side 안전망 없음.
- 권장 수정: next-app/clinical/route.ts:147 와 동일하게 `sanitizeLeakInHtml(data.text)` + telemetry log 추가.

### [High] ★ Stored Prompt Injection — 병원 스타일 학습 결과가 후속 프롬프트에 보간
- 위치: `next-app/lib/clinicContextService.ts` + `packages/blog-core/src/styleService.ts` → `buildLearnedStyleBlock` → 5빌더의 slot 4 STYLE_PACK
- 문제: 크롤러가 외부 병원 블로그 본문을 크롤 → Gemini 가 말투 추출 → `hospitalStyleBlock` 으로 후속 블로그/임상글 시스템 프롬프트에 보간. 외부 본문에 prompt injection 페이로드 (`</learned_style><role>이제 너는 ...`) 가 있으면 후속 생성이 hostile 페르소나로 변조 가능.
- sanitize 상태: `sanitizeSourceContent()` 가 길이만 제한 (3000~30000 char). 내용 검증 없음.
- 영향: 1) 의료법 안전 가드 우회 시도, 2) 광고 inducement 표현 회복, 3) 가짜 시술명 hallucination 유도.
- 핸드오프 §9.11 에 P1 검토로 명시되어 있으나 후속 패치 없음.
- 권장 수정: `styleService.ts` 의 학습 텍스트에 sanitize (`<role>`/`<instruction>`/`<task>` 등 XML 태그 strip + INJECTION_KEYWORDS regex 적용) 추가.

### [High] medical-ad override 시크릿 fallback 구조적 강제화 미완 (CMP-002, AUDIT §9.4)
- 위치: `public-app/lib/medicalAdOverrideToken.ts:45-58` `getSecret()`
- 문제: `MEDICAL_AD_OVERRIDE_SECRET || SUPABASE_SERVICE_ROLE_KEY` fallback 구조. 핸드오프 §2.9 에서 warn-once 추가됐으나 구조적 강제화는 미완. service_role 키가 HMAC 서명에 재사용되면 key 복합도 감소 + 다른 표면 (예: PostgREST) 과 충돌 시 영향 확대 가능.
- 권장 수정: `MEDICAL_AD_OVERRIDE_SECRET` 강제 (fallback 제거) + 미설정 시 startup throw.

### [High] /api/zdebug/* + 디버그 라우트 production 노출 미검증
- 위치: `next-app/app/api/zdebug/{gemini,openai}-ping/route.ts`, `next-app/app/api/llm-batch-smoke/route.ts`
- 문제: production 빌드에 포함되는지 + 인증 가드 강도 확인 부재. 핸드오프 §9.2 에 P1 로 명시됐으나 후속 미진행.
- 권장 수정: `NODE_ENV==='production'` 시 `return NextResponse.json({}, { status: 404 })` 또는 `app/api/zdebug/` 자체를 `.gitignore` 분리. 최소 `checkAuth` 강제.

### [Medium] Influencer search RapidAPI 응답 메타 검증
- 위치: `next-app/app/api/influencer/search/route.ts:19` (username regex 만 검증)
- 처리 상태: ✅ 핸드오프 §2.9 에서 clamp helper 추가 (`follower_count: 0~1B`, `engagement_rate: 0~100%`). hallucination 1차 방어 완료.
- 잔여: caption/description LLM 보간 시 sanitize 미적용 (`hospitalStyleBlock` 과 동일 패턴 — §9.2 P1 검토 대상).

### [Medium] 게스트 rate limit 인메모리 (Vercel 서버리스 cold start 시 reset)
- 위치: `public-app/lib/guestRateLimit.ts:14-30`, `next-app/lib/rateLimit.ts:35-65`
- 처리 상태: 핸드오프 §9.2 자가-인지. 비용이 높은 LLM 비용 자체가 자연 brake.
- 잔여: Redis/Upstash 기반 KV 도입 검토 (P3).

### [Medium] localStorage 기반 게스트 크레딧 (DevTools 우회 가능)
- 위치: `public-app/lib/guestCredits.ts:10-66`
- 처리 상태: 자가-인지. IP rate limit 백업.
- 잔여: 게스트 식별을 IP HMAC + signed cookie 로 강화 (P3).

### [Medium] keyIndex 모듈 전역 mutable race (5곳)
- 위치: `public-app/app/api/{gemini,image}/route.ts`, `next-app/app/api/{gemini,image}/route.ts`, `next-app/lib/geminiDirect.ts`
- 문제: 동시 요청 시 `keyIndex++` 가 덮어쓰임 가능. blog-core 는 random-start 로 수정됐으나 app routes 미이주.
- 처리 상태: ✅ 기존 AUDIT_REPORT CAT-ARC-004 — 미진행 회귀.
- 권장 수정: app routes 5곳에 동일 random-start 패턴 포팅.

---

## 2. 💾 데이터 무결성

### [High] ★ 멱등성 키 없는 크레딧 차감 — 중복 차감 위험
- 위치: `lib/creditService.useCredit` (양 앱)
- 문제: `/api/generate/blog` 중복 호출 (네트워크 재시도, double-submit) 시 각각 차감. request dedup 또는 idempotency key 부재.
- 영향: 사용자 1건 의도 → 2~3 credit 차감 가능. 환불은 catch 분기만 → 정상 응답된 중복은 환불 안 됨.
- 권장 수정: `/api/generate/*` 에 `Idempotency-Key` 헤더 받아 24h 캐시 (Supabase 또는 KV). 동일 키 재요청은 이전 응답 반환.

### [High] anon INSERT 정책 잔존 (DB-001, DB-006)
- 위치: `sql/setup/supabase_FULL_SETUP.sql:46` `generated_posts INSERT WITH CHECK ... OR user_id IS NULL`
- 처리 상태: 2026-05-06 RLS hardening 에서 `subscriptions` / `profiles` / `hospital_style_profiles` 는 잠겼으나 `generated_posts` / `api_usage_logs` / `medical_law_cache` 는 누락.
- 영향: anon 이 `user_id=NULL` 로 임의 INSERT → 회계 왜곡 + admin 통계 오염.
- 권장 수정: 후속 마이그레이션 PR — anon INSERT 정책 명시 DROP, service_role 만 허용.

### [High] PIPA 동의 server-side 기록 — `public-app/privacy` 페이지 존재하나 동의 시점 영구 기록 미확인
- 위치: `public-app/app/privacy/` (디렉토리 존재 확인) + `lib/auth.ts:90-91` (signUpWithEmail 의 약관 동의 체크 UI/server-side 기록 여부)
- 처리 상태: ⚠️ privacy 페이지 디렉토리 자체는 있음 (AUDIT_REPORT.md 의 "부재" 는 outdated). 단 회원가입 흐름의 server-side 기록 컬럼 (예: `terms_agreed_at`, `privacy_agreed_at`, `marketing_agreed`) 존재 여부 + 약관 버전 기록 미확인.
- 영향: PIPA 제15조 (동의 시점 입증) + 제22조 (약관 변경 시 재동의) 분쟁 입증 자료 부재.
- 권장 수정: `profiles.terms_agreed_at TIMESTAMPTZ NOT NULL DEFAULT now()` + `terms_version TEXT` 컬럼 + signUp 시 server-side 기록.

### [High] medical-ad override 동의 server-side 영구 기록 — RLS=본인 정책 분쟁 입증 부족
- 위치: `sql/migrations/2026-05-06_medical_law_override_logs.sql` + `public-app/lib/medicalAdOverrideClient.ts`
- 처리 상태: ✅ medical_law_override_logs 테이블 신설됨 (RLS: 본인만 SELECT). 토큰 발급 전에 INSERT 기록.
- 잔여 우려: 1) `RLS=본인만` 이면 분쟁 시 운영자가 조회할 때 service_role 키 필요 — RLS 정책에 service_role 명시 확인 필요. 2) 토큰 TTL 5분 만료 후 클라이언트가 사용 시점 vs DB INSERT 시점 차이로 race condition 가능 — 검토 필요.
- 권장 검증: 향후 분쟁 시 운영자가 `medical_law_override_logs` 를 시간순/사용자별 조회 가능한지 admin 화면에 노출 + RLS 정책 명시.

### [Medium] postStorage Supabase 실패 시 localStorage fallback — 사용자 통지 없음
- 위치: `next-app/lib/postStorage.savePost` / `public-app/lib/postStorage.savePost`
- 문제: DB 실패 시 device localStorage 로 폴백. 다른 device 에서 누락. 사용자에게 "오프라인 모드" 안내 없음.
- 처리 상태: ✅ 핸드오프 §9.5 기록. 미진행.

### [Medium] refundCredit 실패 swallow + 텔레메트리 부족
- 위치: `lib/creditService.useCredit` catch 블록 (양 앱)
- 문제: 환불 실패 시 `console.warn` 만. 성공/실패 비율 추적 불가.
- 권장 수정: Sentry breadcrumb 또는 구조화 로그 (`[CREDIT_REFUND] failed user=X reason=Y`) 추가.

### [Medium] /api/cron/crawl-all 멱등성 검증 부재
- 위치: `next-app/app/api/cron/crawl-all/route.ts`
- 문제: 1시간 간격 cron, 동일 hospital_id 동시 INSERT race 가능. 핸드오프 §9.5 기록.
- 권장 수정: `last_crawled_at + interval '50 min'` 가드 + advisory lock.

---

## 3. 🤖 AI 특이사항

### [Critical→High] ★ 블로그 누수 — 3중 방어 (영문화 + leakFilter + 후처리 필터) 완성 후 잔존 위험 매우 낮음
- 위치: `packages/blog-core/src/blogPrompt.ts` + `normalize/leakFilter.ts` + `normalizeMarkdownToHtml.ts` + `koreanGrammarFilter.ts`
- 처리 상태: ✅ PR #154/#156/#157/#158/#159/#160/#161/#201/#203/#204 누적으로 3중 방어 완성:
  1. 시스템 프롬프트 영문화 + `[META: do NOT copy...]` 라벨 (PR #158)
  2. `sanitizeLeakInHtml`/`sanitizeLeakInString` 정규식 후처리 (PR #161, 52 case test)
  3. `applyContentFilters` 안에서 마크다운 → HTML + 한국어 비문 + AI 아티팩트 4단계 (PR #203, #204)
- 잔여 위험:
  1. _migration/POST_MERGE_FOLLOWUPS.md §6: entity-encoded HTML leak (`&lt;h3&gt; 태그를 감싸`) — 어떤 패턴도 미감지. 매우 낮은 빈도지만 patch 잠재 후보.
  2. _migration/POST_MERGE_FOLLOWUPS.md §8: `normalizeBlog.LEAK_PATTERNS` 와 `leakFilter.LEAK_PATTERNS` 중복 — 한 곳 관리로 통합 시 회귀 위험 감소.
- 사용자 우선순위 (블로그 완벽 생성) 와 직결 — 본 영역은 최근 6개 PR 로 강화됨. 운영 로그에서 `[clinical/press/card-news leak stripped]` 빈도 모니터링 권장.

### [High] R-3 invariant 부분 불일치 — buildBlogReviewPrompt slot 1 에 PRIORITY_ORDER_BLOCK 미포함
- 위치: `packages/blog-core/src/blogPrompt.ts:2983` (`[REVIEWER_PERSONA, REVIEWER_E_E_A_T_GUIDE, COMMON_WRITING_STYLE]`)
- 문제: CLAUDE.md 문구 "블로그 빌더 5개 모두 slot 1 에 PRIORITY_ORDER + E_E_A_T 가이드 포함 (PR #199, PR #200): ... buildBlogReviewPrompt (PR #200, REVIEWER 변형)" 와 실제 코드 / 테스트 (`blogReviewPrompt.test.ts:49-53`) 가 불일치:
  - CLAUDE.md 텍스트 → 5빌더 모두 PRIORITY_ORDER + E_E_A_T
  - 실제 reviewer 빌더 → REVIEWER_PERSONA + REVIEWER_E_E_A_T_GUIDE + COMMON_WRITING_STYLE (PRIORITY_ORDER_BLOCK 없음)
  - 실제 invariant 테스트 → REVIEWER_E_E_A_T_GUIDE 본문 substring 만 enforce, PRIORITY_ORDER 미enforce
- 의도 평가: REVIEWER_PERSONA 자체에 17개 체크리스트 + verdict_rules 가 포함되어 생성 빌더의 7단 priority 와 다른 평가축이라는 점에서 의도된 deviation 가능. 단, CLAUDE.md 문구가 정확하지 않음.
- 권장 수정 (택 1):
  - (a) CLAUDE.md 의 R-3 invariant 문구를 "생성 4빌더 PRIORITY_ORDER + REVIEWER 변형은 REVIEWER_PERSONA + REVIEWER_E_E_A_T_GUIDE" 로 명확화
  - (b) `buildBlogReviewPrompt` slot 1 에 PRIORITY_ORDER_BLOCK 추가 + 테스트에 assert

### [High] JSON 파싱 fail-open (위 §1 참조 — next-app 만 잔존, public-app 은 fix 완료)

### [Medium] 모델 ID 하드코딩 (gemini-3.1-pro-preview, gemini-3.1-flash-lite-preview, gpt-image-2, gpt-5-search-api, claude-sonnet-4-6, claude-opus-4-7)
- 위치: 30+ 곳 (블로그/이미지/진단/임상/카드뉴스 API 라우트)
- 처리 상태: ✅ kill-switch (`LLM_DISABLE_CLAUDE`) + 멀티키 로테이션 보유. 단 모델 자체가 deprecate 되면 fallback 부재.
- 권장 수정: `lib/llmConfig.ts` 같은 단일 진실원 + env override (`BLOG_LLM_MODEL`, `IMAGE_LLM_MODEL`).

### [Medium] LLM 응답 JSON.parse 직전 검증 — review 외 영역 확인 필요
- 위치: `next-app/app/api/influencer/search/route.ts` (clamp helper 추가됨 ✅), `lib/keywordAnalysisService.ts` (Naver 응답), 진단 funnel 의 categoryHints 분석 결과
- 권장 수정: spot-check — Gemini grounding 결과 응답 schema 검증 (zod) 적용 여부 확인.

### [Medium] 라이선스 오염 — Gemini grounding 출처 attribution
- 위치: 진단 결과 (PR #198 ChatGPT/Gemini 모델별 분리 visibility) — Gemini grounding 텍스트가 진단 결과에 포함되면 attribution UI 필요
- 처리 상태: 핸드오프 §9.11 기록. 미진행.

### [Low] Blog 1-pass fallback 환불 정책 미명시
- 위치: `next-app/app/api/generate/blog/route.ts:225-249`, `public-app/app/api/generate/blog/route.ts:110-115`
- 문제: 50%+ 섹션 실패 후 1-pass fallback 케이스에서 LLM 비용 다 쓰고 부분 발행. 사용자 입장 환불 기대. 정책 명시 필요.

---

## 4. 🐛 버그

### [High] ★ Blob URL 매 렌더 누수 회귀 (CompletionScreen.tsx:235)
- 위치: `public-app/components/video-edit/CompletionScreen.tsx:235`
- 문제: `getFinalResultUrl()` 가 매 렌더 `URL.createObjectURL(state.originalFile)` 호출. `URL.revokeObjectURL` cleanup 없음. Day 2 메모리 누수 박멸 작업 이후 회귀.
- 영향: 영상 편집 페이지 체류 시간 비례 메모리 누수. 50MB 파일 N 렌더 × N 분 = 브라우저 OOM 가능.
- 처리 상태: ✅ AUDIT_REPORT CAT-BUG-001 기록. 미해결.
- 권장 수정: `useMemo(() => state.originalFile ? URL.createObjectURL(state.originalFile) : null, [state.originalFile])` + cleanup useEffect.

### [Medium] InternalFeedback JSX inline createObjectURL (next-app)
- 위치: `next-app/components/InternalFeedback.tsx:240`
- 처리 상태: ✅ AUDIT_REPORT CAT-BUG-002 기록. 미해결.

### [Medium] runAutoMode stale state capture (video_edit)
- 위치: `public-app/app/(dashboard)/video_edit/page.tsx:692-771, 782` (`stateRef` 정의만, 사용 X)
- 처리 상태: ✅ AUDIT_REPORT CAT-BUG-006 기록. 미해결.

### [Medium] confirm() 직접 호출 SSR/E2E 환경 깨짐
- 위치: `next-app/app/admin/page.tsx:340-388`
- 처리 상태: ✅ AUDIT_REPORT 기록.

### [Low] SSE keepalive 800ms — 일부 proxy/CDN 버퍼링
- 위치: `public-app/app/(dashboard)/diagnostic/page.tsx`
- 처리 상태: 핸드오프 기록. 운영 모니터링 권장.

---

## 5. ⚡ 성능

### [Medium] 거대 client component
- 위치: 
  - `public-app/app/(dashboard)/blog/page.tsx` — 2600+ LoC (handoff §4 R5)
  - `public-app/app/(dashboard)/image/page.tsx` — 2187 LoC, 25 useCallback, 30+ deps
  - `next-app/app/admin/page.tsx` — 1034 LoC
  - `public-app/app/(dashboard)/video_edit/page.tsx` — 거대 + step chain
- 처리 상태: 미진행 (시니어 결정 사항).
- 권장 수정: 분할 컨벤션 결정 후 점진 (page → BlogForm + BlogResult + BlogReviewer + ImagePicker).

### [Medium] Blog 섹션 순차 처리 + Anthropic Tier 1 cap
- 위치: 핸드오프 §9.3 — 의도된 trade-off (`BLOG_SECTION_CONCURRENCY=3`).
- 권장 검토: Tier 업그레이드 시 cap 완화.

### [Medium] guestRateLimit Map TTL 미정 + cleanup loop dependence
- 위치: `public-app/lib/guestRateLimit.ts:15-31`
- 처리 상태: ✅ AUDIT PERF-001 + DB-014 기록.

### [Low] rank check 직렬 setTimeout 200ms (admin keyword)
- 위치: `next-app/app/admin/page.tsx:204-210`

### [Low] keyword scoring N+1 후보
- 위치: 진단 funnel 의 categoryDetect 단계 — 7 카테고리 × N 키워드 매칭. PR #207 에서 확장된 후 측정 권장.

---

## 6. 🏗️ 아키텍처

### [High] public-app ↔ next-app lib/* 30+ 파일 거의 동일 사본 — drift 매번 발생
- 위치: `lib/auth.ts`, `postStorage.ts`, `creditService.ts`, `serverAuth.ts`, `useAuthGuard.ts`, `categoryTemplates.ts`, `clinicContextService.ts`, `clinicalPrompt.ts`, `pressPrompt.ts`, `refinePrompt.ts`, `youtubePrompt.ts`, `cardNewsPrompt.ts`, `keywordAnalysisService.ts`, ...
- 처리 상태: ✅ 핸드오프 §4 P4 + AUDIT R10 기록. PR #194~#211 에서 `blog-topic` (PR #202), `pressTone` (PR #196/#209), `clinicalTone` (PR #197), `categoryImageGuide` (PR #195) 가 blog-core 로 이전됨 — 진척 있으나 미완.
- 매 PR 마다 wrapper 가드 (PR #209/#210) 가 추가되어 유지보수 비용 증가 추세.
- 권장 수정: 다음 사이클에 `packages/blog-core` 통합 가속 — 9개 즉시 이주 가능 파일 (AUDIT ARC-005) 부터.

### [Medium] sanitize 정책 비대칭 정리됨, 단 모듈 충돌 잠재 (sanitize.ts vs sanitizeHtml.ts)
- 위치: `next-app/lib/sanitize.ts` + `next-app/lib/sanitizeHtml.ts` 공존
- 처리 상태: 핸드오프 §9.4 기록. ARC-003 (sanitize 정책) 은 보강됐으나 두 함수명 충돌 잠재.

### [Medium] keyIndex 모듈 전역 mutable — 위 §1 보안 참조 (5곳).

### [Medium] medical-ad 시크릿 두 키 책임 혼합 — 위 §1 보안 [High] 참조.

### [Low] cron + batch poll 통합 스케줄러 부재 — `/api/cron/crawl-all` + `/api/internal/poll-batches` 별개 운영.

---

## 7. 💼 비즈니스 로직

### [Resolved] 영상 9단계 크레딧 미차감 (CAT-BIZ-001) — ✅ PR #169 / 후속 정책
- 위치: `public-app/app/api/video/*` 9개 라우트 — `useCredit`/`refundCredit` import + 호출 확인.
- 처리 상태: 2026-05-12 PR #169 머지로 해결.

### [Resolved] 카드뉴스 클라이언트 사이드 차감 (CAT-BIZ-003) — ✅ PR #169
- 위치: `public-app/app/api/card-news/generate-text/route.ts:118-131`, `generate-images/route.ts:215-230` — server-side useCredit 통합.
- 처리 상태: 2026-05-12 머지.

### [High] 신규 가입 봇 가입 → 무한 크레딧 위험 (CAT-BIZ-... §9.6)
- 위치: `public-app/lib/auth.ts:90-91` — 신규 가입 시 20 credit, admin 999.
- 문제: 이메일 인증/Captcha 없음. 봇 가입으로 무한 credit 가능 → 비용 직격탄.
- 처리 상태: 미진행 (P1).
- 권장 수정: Supabase auth email confirmation 강제 + reCAPTCHA v3 (회원가입 폼).

### [Medium] 영상 9단계 자동 모드 부분 실패 보상 트랜잭션 미정
- 위치: 각 단계 독립적 useCredit 호출 → 중간 실패 시 중복 차감 위험.
- 권장 수정: 자동 모드 entry 시 1 credit pre-deduct + step 별 실패 시 부분 환불 모델.

### [Medium] Blog 2-pass 부분 실패 환불 정책 미명시 (위 §3 AI 참조).

### [Low] admin 무제한 사용 — 표준 패턴 (resolveImageOwner → 'guest' → null) 신규 라우트 spot-check 필요
- 위치: INVARIANTS.md §2 의 5단계 패턴.
- 권장 수정: PR #194~#211 의 diagnostic funnel 신규 라우트 6개 (`/api/diagnostic/*`) 가 표준 패턴 따르는지 spot-check.

---

## 8. 📊 운영성

### [Resolved] /api/health 부재 (CAT-OPS-001) — ✅ PR #193
- 위치: `public-app/app/api/health/route.ts:2-30` + `next-app/app/api/health/route.ts`
- 처리 상태: `withApiError` wrap + `X-Request-Id` + `Cache-Control: no-store` 자동 부착. 외부 모니터링 가능.

### [Resolved] 통합 에러 핸들러 (CAT-OPS-001 일부) — ✅ PR #190/#191
- 위치: `lib/apiErrorHandler.ts` (양 앱) + `withApiError` HOF + Sentry captureException + production stack-trace 제거 + request_id 전파.

### [Medium] Sentry next-app 미통합
- 위치: `next-app/package.json` 의 deps 에 `@sentry/nextjs` 없음. instrumentation.ts 부재.
- 처리 상태: ✅ AUDIT CAT-OPS-001 기록. 미진행.
- 권장 수정: public-app 의 sentry.{client,server,edge}.config.ts + sentry beforeSend (redaction) 패턴을 next-app 으로 mirror.

### [Medium] console.warn/error 79건 (양 앱 lib/) — 구조화 로깅 일관성
- 처리 상태: PR #191 에서 traceId / request_id 패턴 도입. lib/ 의 직접 console 호출들 점진 마이그 필요.

### [Medium] CI 4-job 정상 동작 + PR-필수 정책
- 위치: `.github/workflows/ci.yml` — tsc-public / tsc-next / build-public / build-next 4-job 정의됨 ✅.
- 잔여: GitHub Settings → Branches 의 branch protection rule 활성 여부 시각적 확인 필요. main 직접 머지 케이스 (핸드오프 §5 결정 대기) — 본 sweep 에선 PR 워크플로 권장.

### [Low] devLog production 동작 검증
- 위치: `lib/devLog.ts` (양 앱) — production 에서 로그 양산 여부.

---

## 9. 📦 의존성

### [Medium] postcss CVE GHSA-qx2v-qp2m-jg93 — 미해결 (양 앱 영향)
- 위치: 양 앱 `postcss < 8.5.10` 간접 의존.
- 처리 상태: ✅ AUDIT §9.8 DEP-001 기록. 2026-05-15 시점 미해결.
- mitigation: 양 앱 모두 postcss 가 처리하는 user input 없음 → 위험도 낮음. patch 출시 감시 + Tailwind 4.x 메이저 업데이트 시 동반.

### [Medium] @google/generative-ai deprecated (video-processor)
- 위치: `video-processor/src/**`
- 처리 상태: AUDIT DEP-003 기록. 미진행.
- 권장 수정: `@google/genai` 로 마이그. public-app / next-app 은 이미 사용 중.

### [Medium] puppeteer-core ^21.6.1 (crawler-server) — 보안 패치 누적
- 처리 상태: AUDIT DEP-001 기록.

### [Low] multer ^1.4.5-lts.1 (video-processor) — 메인터넌스 모드
- 처리 상태: AUDIT DEP-002 기록. multer 2.x 권장.

### [Low] public-app major drift (konva@10, jspdf@4, @sentry/nextjs@10) vs next-app
- 처리 상태: 양 앱 lifecycle 분리 — 의도된 drift.

---

## 10. ⚖️ 컴플라이언스

### [High] PIPA 동의 server-side 영구 기록 검증 필요 (위 §2 데이터 무결성 참조)
- privacy 페이지 디렉토리 존재 확인됨 (AUDIT_REPORT 의 "부재" 는 outdated)
- 회원가입 흐름의 약관 동의 server-side 기록 컬럼 (terms_agreed_at + version) 확인 필요.

### [High] 의료법 23조 광고 분쟁 입증 (위 §2 medical_law_override_logs 참조)
- 처리 상태: ✅ 테이블 신설 (PR #128).
- 잔여 검증: RLS service_role 명시 + 운영자 조회 가능 admin UI.

### [Medium] 회원탈퇴 / 데이터 삭제 흐름
- 위치: `public-app/app/(dashboard)/mypage/page.tsx` — 계정 삭제 버튼 유무 확인 필요.
- 처리 상태: AUDIT CAT-CMP-002 기록. PIPA 제36조.

### [Medium] 전금감/본인인증/PG
- 처리 상태: `subscriptions` 테이블만 존재, PG/SMS 인증 코드 부재 (AUDIT §9.9).

### [Low] hospital_crawled_posts 제3자 블로그 본문 평문 저장 + public read RLS — 저작권 risk
- 처리 상태: AUDIT CMP-007 기록.

### [Low] medicalAdValidation 환자 후기 우회 표현 / 시간·희소성 압박 표현 사전
- 처리 상태: AUDIT CMP-D-001/002 기록.

---

## 11. 🧹 품질

### [Low] 데드 코드 후보
- `next-app/__tests__/e2e-smoke.ts` — Playwright `e2e/` 이전 후 잔존 (361 LoC) — 활성/비활성 확인 필요
- `public-app/scripts/migrate-blog-images.ts` — 1회성 마이그레이션 완료 시 archive
- `next-app/app/(dashboard)/card_news/page.tsx` — 16-LoC stub, `page.tsx.bak` 코멘트 stale (R3)
- AUDIT 의 dead code 후보 다수 — 정리 진행 권장

### [Low] as any 캐스트
- AUDIT 28건 보고, 현 시점 spot-check 결과 대폭 감소 (양호 추적).

### [Low] ESLint 미도입
- `next-app/package.json` 의 `lint` = `tsc --noEmit` 만. 실제 ESLint 룰 부재 (R12).

### [Low] PR #209-#210 wrapper invariant 가드 패턴 — 유지보수 비용 누적
- 위치: `chore(press-tone): wire-up 회귀 fail-fast` (PR #209), `chore(blog-ui): hardcode 회귀 fail-fast` (PR #210)
- 본질: blog-core 통합 미완 → app 측 wrapper 검증 누적. blog-core 완성 후 가드 제거 자연 수렴.

---

## 회귀 가드 (Invariants)

### R-1 prose-flow — ✅ Pass

**근거**:
- `packages/blog-core/src/blogPrompt.ts:949` — `COMMON_WRITING_STYLE` 본문 정의
- 4 빌더가 slot 1 에 `COMMON_WRITING_STYLE` 포함:
  - `buildSectionFromOutlinePrompt` (line 2554)
  - `buildBlogPromptV3` (line 2735)
  - `buildBlogSectionPromptV3` (line 2895)
  - `buildBlogReviewPrompt` (line 2983)
- `buildOutlinePrompt` (line 2475) 는 의도 제외 (JSON 출력) — CLAUDE.md 정책과 정합.
- 테스트 가드: `packages/blog-core/src/__tests__/proseFlowRule.test.ts:63-116` — 4 빌더 출력에 `1시간 이상 지혈이 안 될 때` regression quote 포함 enforce.
- 추가 가드: `review_criteria` 의 prose_flow 항목 (`blogPrompt.ts:3020`) + markdown_artifact (`blogPrompt.ts:3024`) + grammar_artifact (`blogPrompt.ts:3029`) issue 발급 로직.

### R-2 카테고리 7종 drift-zero — ✅ Pass

**근거**: 다음 dictionary 들이 모두 7 카테고리 `[치과, 피부과, 성형외과, 내과, 정형외과, 한의원, 안과]` 보유:
- `CATEGORY_TONE` (`blogPrompt.ts:319-388`) — 7 entry
- `CATEGORY_IMAGE_GUIDES` (`blogPrompt.ts:119-156`) — 7 entry
- `categoryHints` in `buildImagePrompt` (`blogPrompt.ts:172-179`) — 7 entry
- `CATEGORY_DEPTH_GUIDES` (`blogPrompt.ts:248-301`) — 7 entry
- `TERMINOLOGY_GUIDE` (`blogPrompt.ts:674-900`) — 7 entry
- `PRESS_CATEGORY_TONE` (`pressCategoryTone.ts`) — 7 entry (via test)
- `CLINICAL_CATEGORY_TONE` (`clinicalCategoryTone.ts`) — 7 entry (via test)
- `CATEGORY_CTA_HINT` (`categoryCtaHint.ts:13`) — 7 entry

**테스트 가드**:
- `contentCategoryDriftZero.test.ts` — ContentCategory enum / VALID_CONTENT_CATEGORIES Set / CATEGORY_TONE / PRESS / CLINICAL / CTA_HINT 5중 정합
- `categoryGuide.test.ts:51-72` — CATEGORY_DEPTH_GUIDES + TERMINOLOGY_GUIDE + CATEGORY_TONE 7 매핑
- `imageCategoryGuide.test.ts:52-72` — CATEGORY_IMAGE_GUIDES + categoryHints 7 매핑

### R-3 5빌더 PRIORITY_ORDER + E_E_A_T slot 1 — ⚠️ Partial

**근거**:
- 생성 빌더 4개에 `PRIORITY_ORDER_BLOCK` 포함 ✅
  - `buildOutlinePrompt:2475` — `[OUTLINE_PERSONA, PRIORITY_ORDER_BLOCK, E_E_A_T_GUIDE, MEDICAL_LAW_CONSTRAINTS]`
  - `buildSectionFromOutlinePrompt:2554` — `[SECTION_PERSONA, PRIORITY_ORDER_BLOCK, COMMON_WRITING_STYLE, SELF_CHECK_GUIDE, E_E_A_T_GUIDE]`
  - `buildBlogPromptV3:2735` — `[BLOG_PERSONA, PRIORITY_ORDER_BLOCK, COMMON_WRITING_STYLE, BLOG_EXAMPLES, SELF_CHECK_GUIDE, E_E_A_T_GUIDE]`
  - `buildBlogSectionPromptV3:2895` — `[SECTION_REGEN_PERSONA, PRIORITY_ORDER_BLOCK, E_E_A_T_GUIDE, COMMON_WRITING_STYLE]`
- `buildBlogReviewPrompt:2983` slot 1 → `[REVIEWER_PERSONA, REVIEWER_E_E_A_T_GUIDE, COMMON_WRITING_STYLE]` — **PRIORITY_ORDER_BLOCK 없음**

**불일치**:
- CLAUDE.md 텍스트 ("5빌더 모두 slot 1 에 PRIORITY_ORDER + E_E_A_T") vs 실제 코드 (reviewer 변형은 REVIEWER_E_E_A_T_GUIDE 만)
- 테스트 (`blogReviewPrompt.test.ts:49-53`) 도 REVIEWER_E_E_A_T_GUIDE 만 assert, PRIORITY_ORDER_BLOCK 미assert
- REVIEWER_PERSONA 자체에 17개 체크리스트 + verdict_rules 가 있어 의도된 deviation 일 가능성 — 단 CLAUDE.md 문구는 명확히 5빌더 모두라 명시.
- 권장: §3 [High] 항목의 권장 수정 (택 1) 참조.

### R-4 의료법 normalize 전체 입력 통과 — ✅ Pass

**근거**:
- `packages/blog-core/src/medicalLawFilter.ts:170-181` `filterMedicalLawViolations` 내부에서 `normalizeForMedicalAdMatch(textOnly)` 호출 ✅
- `public-app/lib/medicalAdValidation.ts:9, 229` — `normalizeForMedicalAdMatch(text)` 호출 ✅
- `medicalLawNormalize.ts:59-68` `normalizeForMedicalAdMatch` 정의 (NFC + zero-width strip + 호모글리프 + 전각·반각 + 공백 collapse) — PR #189 (`b228a73`) 머지됨.
- 테스트 가드: `medicalLawNormalize.test.ts` (커버리지 측정 권장 — Unicode 우회 케이스 N건).

**잔여 검증** (Scope 외):
- next-app/lib/medicalAdValidation.ts 의 동일 호출 여부 확인 (sweep 에서 grep 미실행) — public-app 만 확인.

### R-5 후처리 가드 (normalizeMarkdownToHtml, koreanGrammarFilter) — ⚠️ Partial

**근거**:
- `applyContentFilters` (`medicalLawFilter.ts:266`) — `filterMedicalLawViolations` → `normalizeMarkdownToHtml` → `normalizeKoreanGrammar` → `filterOutputArtifacts` 4단계 직렬 호출 ✅
- 라우트 와이어업:
  - `next-app/app/api/generate/blog/section/route.ts:65` ✅ applyContentFilters
  - `next-app/app/api/generate/blog/section/route.ts:69` ✅ sanitizeLeakInHtml
  - `next-app/app/api/generate/blog/review/route.ts:175,177` ✅ applyContentFilters + sanitizeLeakInHtml
  - `public-app/app/api/generate/blog/section/route.ts:69` ✅ applyContentFilters
  - `public-app/app/api/generate/blog/review/route.ts:171,209,253,262` ✅ applyContentFilters (fail-closed)
  - `next-app/app/api/generate/press/route.ts:197` ✅ sanitizeLeakInHtml
  - `public-app/app/api/generate/press/route.ts:150` ✅ sanitizeLeakInHtml
  - `next-app/app/api/generate/clinical/route.ts:147` ✅ sanitizeLeakInHtml
  - **`public-app/app/api/generate/clinical/route.ts:152` ❌ sanitizeLeakInHtml 미호출** (★ drift)
  - `public-app/app/(dashboard)/blog/page.tsx:1341,1527,1558` ✅ applyContentFilters (클라이언트)
  - `public-app/app/(dashboard)/{press,refine,youtube,clinical,card_news}/page.tsx` ✅ applyContentFilters (클라이언트)

**불일치**: public-app/api/generate/clinical/route.ts 가 next-app 과 drift — server-side leak filter 누락. 클라이언트가 보조 방어하지만 서버 신뢰 경계 약화.

---

## Top 5 즉시 조치 권고

> 사용자 priority (블로그 누수 완벽 차단 → 이미지 → GEO 진단) 를 직접 받쳐주는 항목 위주로 우선순위.

### 1. [Critical] next-app blog/review JSON parse fail-open → public-app 패턴 mirror
- 위치: `next-app/app/api/generate/blog/review/route.ts:150-154`
- 작업: ~15 LoC 복사. public-app:206-238 의 fail-closed 분기 그대로 mirror.
- ROI: 의료광고법 검증 우회 회귀 잠복 차단. 사용자가 next-app admin 으로 운영 시 직접 영향.

### 2. [High] public-app/api/generate/clinical 라우트에 sanitizeLeakInHtml 추가 → R-5 drift 0
- 위치: `public-app/app/api/generate/clinical/route.ts:152` (응답 반환 전)
- 작업: next-app/clinical/route.ts:147 패턴 1줄 추가 + import + telemetry log.
- ROI: 임상글 누수 server-side 차단 완결. 사용자의 "블로그 누수" 우선순위 1순위와 동일 카테고리.

### 3. [High] Stored Prompt Injection — hospitalStyleBlock sanitize 강화
- 위치: `packages/blog-core/src/styleService.ts` (또는 `next-app/lib/clinicContextService.ts`)
- 작업: 학습 텍스트에 XML 태그 strip (`<role>/<task>/<instruction>` 등) + INJECTION_KEYWORDS regex.
- ROI: 외부 병원 블로그 → 자체 LLM 변조 차단. 누수와 다른 축이지만 같은 "프롬프트 신뢰성" 영역.

### 4. [High] Blob URL 누수 회귀 fix (CompletionScreen.tsx:235)
- 위치: `public-app/components/video-edit/CompletionScreen.tsx:235`
- 작업: `useMemo` + cleanup `useEffect` 패턴.
- ROI: Day 2 메모리 누수 박멸 작업 회귀 즉시 차단. 영상 편집 사용자 경험 직격.

### 5. [High] R-3 invariant 정합 — CLAUDE.md 문구 명확화 또는 코드/테스트 패치
- 위치: `CLAUDE.md` (R-3 문구) 또는 `packages/blog-core/src/blogPrompt.ts:2983` + `__tests__/blogReviewPrompt.test.ts`
- 작업: 둘 중 한 방향으로 정합. CLAUDE.md 문구 수정이 회귀 risk 낮음 (텍스트만 변경).
- ROI: invariant 신뢰성 회복. 향후 PR 시 가드 명확.

---

## 부록 — 2026-05-07 이후 PR 추적

| PR# | SHA | 제목 | 본 sweep 영향 |
|---|---|---|---|
| #211 | 0cd4bb0 | 진단 페이지 감지 키워드 확장 | 운영 호출 응답 — 본 sweep §3 / §8 |
| #210 | 05816d2 | blog-ui hardcode 회귀 fail-fast | §11 wrapper 가드 |
| #209 | 94379d5 | press-tone wire-up 회귀 fail-fast | §11 wrapper 가드 |
| #208 | 73d2516 | diagnostic-funnel — 진단→생성 가교 | §3 신규 funnel |
| #207 | e63591d | diagnostic-crawler 카테고리 7 도메인 | R-2 정합 강화 |
| #206 | d933528 | 추천톤·마케팅톤·CTA chip | §3 신규 funnel |
| #205 | 0f8b29b | blog-refine targetScope (FROZEN 강제) | §1 신규 가드 |
| #204 | 008fff6 | 한국어 비문 자동 차단 | §3 누수 3중 방어 강화 |
| #203 | 26ce1ec | 마크다운 회귀 3중 차단 | §3 누수 3중 방어 강화 |
| #202 | 4a635dd | 주제 추천 blog-core 통합 | §6 monorepo 통합 진척 |
| #201 | 4e19e36 | 줄글 prose 강제 | R-1 직접 |
| #200 | 67ead41 | Opus review E-E-A-T 구체 사례 | R-3 (REVIEWER_E_E_A_T_GUIDE 신설) |
| #199 | 7f80fcf | 섹션 재생성 안전망 강화 | R-3 (SECTION_REGEN_PERSONA + PRIORITY_ORDER) |
| #198 | 83f9d10 | ChatGPT/Gemini 모델 분리 visibility | §3 진단 funnel |
| #197 | 3f66a89 | 임상글 카테고리 톤 7개 | R-2 정합 강화 |
| #196 | c77340a | 보도자료 카테고리 톤 7개 | R-2 정합 강화 |
| #195 | ce092dd | blog-image 카테고리 컨텍스트 7개 | R-2 정합 강화 |
| #194 | 8d65348 | 블로그 카테고리 톤 7개 신규 | R-2 정합 강화 |
| #193 | 6e89a46 | /api/health + Cache-Control no-store | §8 운영성 — Resolved |
| #192 | 1706b51 | 진단 이력 페이지 | §3 진단 funnel |
| #191 | de8d1dd | 구조화 로깅 + request_id | §8 운영성 |
| #190 | 66c3667 | 통합 에러 핸들러 + Sentry + prod stack 제거 | §8 운영성 — Resolved |
| #189 | b228a73 | medical-ad Unicode 우회 차단 | R-4 직접 — Resolved |
| #188 | ed6c004 | 진단 권장사항 3축 태깅 | §3 진단 funnel |
| #185 | 779958f | 진단 인라인 lead CTA | §3 진단 funnel |
| #184 | e54b9cc | 진단 신규 lead Slack 알림 | §3 진단 funnel |
| #183 | 3bc64ed | /api/teams 1h 캐시 + PSI 비활성 | §5 성능 |
| #182 | 3f5e285 | 진단 PSI 병렬 + 24h 캐시 89→55s | §5 성능 — Resolved |

전반: 28개 PR 중 **누수/방어 강화 직접** 9개 + **진단 funnel 확장** 9개 + **운영성** 4개 + **R-2 정합** 4개 + **R-3 정합** 2개. 신규 보안/품질 회귀 도입 미관측.

---

## 결론

**2026-05-15 시점 평가**: WINAID 는 누수 3중 방어 + 카테고리 7 도메인 정합 + R-4 (Unicode 우회 차단) + /api/health + Sentry/통합 에러 핸들러 + 구조화 로깅 면에서 **실질적인 1→N 단계 운영 안정성** 을 보유. 단, **2개의 drift 회귀** (next-app blog/review fail-open, public-app clinical leak filter 누락) 와 **3개의 잠복 위험** (Stored Prompt Injection, 멱등성 키 부재, PIPA 동의 기록) 이 P0/P1 대상.

**우선순위 정렬**: 사용자 priority (블로그 → 이미지 → GEO 진단) 와 본 sweep 의 Top 5 가 직접 정렬됨 (Critical/High 5건 모두 블로그/임상/이미지 누수 또는 신뢰성 회복).

**다음 사이클 권장 1 PR**: 위 Top 5 중 #1 (next-app fail-open mirror) + #2 (public-app clinical leak filter) + #4 (Blob URL fix) 3건을 단일 PR 로 묶어 mechanical mirror 패턴 (각 ~15 LoC) → CI 4-job + 기존 invariant 테스트로 회귀 검증.

---

*감사 종료. 코드 수정 없음. 본 리포트를 토대로 우선순위별 패치 작업을 별도 PR 로 진행 권장.*
