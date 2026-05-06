# 블로그 도메인 전수 감사 보고서

**감사 일자**: 2026-05-06
**main HEAD**: `3666d74` (사이클 1+2A 머지 완료)
**감사 방법**: 4개 read-only 에이전트 병렬 (isolation worktree)
**코드 변경 여부**: **없음** (보고서·노트만 생성)

**베이스라인**:
- `docs/AUDIT_REPORT.md` (PR #115)
- `docs/audit/_findings_*.md` (PR #115)
- `docs/PII_INVENTORY.md` (PR #120)
- 사이클 1+2A 머지 PR: #109 #110 #111 #112 #113 #114 #115 #116 #117 #118 #119 #120

---

## 요약 (Executive Summary)

총 **83건 발견** (BL-A 15 + BL-B 17 + BL-C 31 + BL-D 20).

| 심각도 | 건수 | 비고 |
|---|---|---|
| 🔴 Critical | 2 | BL-B 의료광고법 hard-block 부재 + fail-open |
| 🟠 High | **34** | 베이스라인 회귀 + 약관 risk + drift |
| 🟡 Medium | ~28 | 베이스라인 회귀 잔존 + 신규 발견 |
| 🟢 Low | ~19 | 점진 정리 |

### ⚠️ 가장 큰 발견 — 베이스라인 회귀 17건+ 미해소 잔존

사이클 1+2A 에서 처리한 12개 PR이 **Critical만 처리**했고, 사이클 1 baseline의 High/Medium 다수가 **사이클 2B 진입 전 그대로 잔존**합니다. 특히:

- **AI-002 (zero-width/homoglyph 우회)** — BL-A·BL-B·BL-C 모두 회귀 확인 (3중 시그널)
- **AI-003 (의료법 검증 indexOf 단순 매칭)** — BL-B 회귀 확인 (BL-B-001로 재정의)
- **DB-001 (generated_posts NULL 분기)** — BL-D 회귀 (anon RPC + admin lookup 영향)
- **DB-027 (match_blog_posts filter NULL)** — BL-D 회귀
- **DB-018 (PII 평문 + pgcrypto 미설치)** — BL-D 회귀
- **SEC-006 (referenceFetcher topic/category sanitize 미적용)** — BL-C 회귀
- **ARC-005 (blog-core 통합 미완)** — BL-D, drift 19개 식별

**핵심 메시지**: 사이클 2B 우선순위는 **신규 Critical 처리** 보다 **베이스라인 회귀 cleanup** 이 더 시급합니다. 회귀를 그대로 둔 채 새 기능을 추가하면 같은 vector가 다른 코드 경로로 재발합니다.

### 즉시 조치 권고 Top 5

1. **[BL-B-001 / 베이스라인 AI-003 회귀]** 의료광고법 검증기 입력 정규화 부재 — zero-width / 줄바꿈 / 한자 / 다국어 우회. Hard-block 부재로 카드뉴스 PNG/PDF/ZIP/Shorts 다운로드 모두 통과 → **법적 리스크 직격탄**.
2. **[BL-B-Critical-2]** 외부 LLM (Anthropic / Gemini / OpenAI / Google STT) 전송 전 PII 마스킹 부재 — Privacy 인벤토리 14번 카테고리 미처리. PIPA + 의료법 §22(비밀유지) 동시 risk.
3. **[BL-C-T06 / 약관 risk]** `search.naver.com` 자동 수집 — 네이버 자동화 약관 위반 가능성, 서비스 운영 자체 영향.
4. **[BL-D-001/002/003]** SQL 베이스라인 회귀 3건 (DB-001 / DB-027 / DB-018) 잔존 — anon DB-024와 결합 시 PII 전수 SELECT + 임베딩 우회 가능.
5. **[BL-A-001 / audit Q-3 client-side 부분 회귀]** review/section/이미지 fetch에 abortSignal 미전파 → 페이지 이탈 시 Opus 4.7 백그라운드 완주 (비용 burst).

---

## Critical 이슈 (즉시 수정)

### [BL-B-Critical-1] 의료광고법 검증기 — 카드뉴스 다운로드 경로 hard-block 부재
- **카테고리**: ⚖️ 컴플라이언스 / 💼 비즈니스
- **심각도**: Critical
- **위치**: 카드뉴스 PNG/PDF/ZIP/Shorts 다운로드 함수 (`public-app/components/CardNewsProRenderer.tsx` + `lib/cardDownloadUtils.ts`)
- **현상**: 의료광고법 위반 항목 발견 시 위반 배너만 표시, 다운로드는 그대로 진행. 사용자가 배너 무시하고 다운로드 → 위반 콘텐츠 외부 유포.
- **영향**: 의료법 §56 위반 콘텐츠가 SaaS 출력물로 전파. 광고심의 미통과 콘텐츠 다운로드 → 사업자(병원) + 플랫폼(WINAID) 양측 책임.
- **수정 제안**: 다운로드 핸들러에 `validateSlideMedicalAd()` 결과 hard-block 분기 추가. 위반 발견 시 다운로드 차단 + "수정 후 다시 시도" UI.
- **베이스라인 비교**: 신규 발견 (사이클 1 미식별)

### [BL-B-Critical-2] 외부 LLM 전송 전 PII 마스킹 부재
- **카테고리**: ⚖️ 컴플라이언스 (PIPA + 의료법 §22)
- **심각도**: Critical
- **위치**: `packages/blog-core/src/llm/{anthropic,gemini,openai}.ts` + Google STT 호출 (`public-app/app/api/video/generate-subtitles/route.ts`)
- **현상**: 사용자 입력 (병원명·담당자명·환자명·연락처) 이 외부 LLM 으로 전송 전 마스킹 0. `docs/PII_INVENTORY.md` (PR #120) 14번 카테고리 미처리.
- **영향**: 병원 영업비밀 + 환자 정보가 미국 데이터센터 (Anthropic/Google/OpenAI) 로 전송. PIPA 국외 이전 동의 절차 미비. 의료법 §22 환자 비밀유지 의무 위반 risk.
- **수정 제안**: LLM 호출 전 envelope 단계에서 PII redaction (이메일/전화/주민번호 패턴 + 사전 등록된 환자명/병원담당자명 마스킹). 의료 콘텐츠 raw text는 contexts 미포함.
- **베이스라인 비교**: 신규 (Privacy 인벤토리에 식별됐으나 자동 처리 미구현)

---

## High 이슈 (사이클 2B 권장)

### 베이스라인 회귀 미해소 (사이클 1 식별 → 미패치)

| ID | 베이스라인 | 위치 | 상태 |
|---|---|---|---|
| BL-A-009 = BL-B-FN-001 | **AI-002** | `packages/blog-core/src/promptSanitize.ts` | zero-width/homoglyph 미차단 (BL-A·BL-B·BL-C 3중 회귀 시그널) |
| BL-B-001 | **AI-003** | `public-app/lib/medicalAdValidation.ts:225-261` | indexOf 단순 매칭 (정규화 부재) |
| BL-B-004 | CMP-D-001 | medicalAdValidation testimonial | 환자 후기 우회 표현 미감지 |
| BL-B-005 | CMP-D-002 | medicalAdValidation price | 시간/희소성 압박 표현 미감지 |
| BL-B-006 | CMP-003 | medicalAdValidation unproven | 자격 사칭 의역 부분 확장 미수정 |
| BL-D-001 | **DB-001** | `bootstrap_new_supabase.sql:166-168`, `setup/supabase_FULL_SETUP.sql:46` | generated_posts INSERT NULL 분기 (anon 우회 가능) |
| BL-D-002 | **DB-027** | `bootstrap_new_supabase.sql:446` | match_blog_posts filter_user_id NULL + SECURITY DEFINER caller 검증 부재 |
| BL-D-003 | **DB-018** | `grep "pgcrypto"` 0 hits | PII 평문 저장 (user_email/ip_hash/content) |
| BL-D-004/005 | **ARC-005** | postStorage / cardAiActions / cardTemplateService / keywordAnalysisService | blog-core 통합 미완 — drift 19개 |
| BL-A-001 | audit Q-3 부분 | client-side fetch | review/section/이미지에 signal 미전파 (서버는 통과) |
| BL-A-008 | ARC-004 | `public-app/app/api/gemini/route.ts:76` 등 | keyIndex 모듈 전역 race (레거시 라우트 잔존) |
| BL-A-014 | BIZ-002 | blog 5단계 4개 라우트 | 인증 사용자 burst rate-limit 부재 |
| BL-C-SEC-006 | **SEC-006** | `public-app/app/api/reference/route.ts:29-36` | referenceFetcher topic/category sanitize 미적용 (next-app 동일) |
| BL-C-SVR-002 | SVR-002 | `crawler-server/src/index.js:97` | bearerAuth skipPaths 미활용 |
| BL-C-SVR-003 | SVR-003 | crawler-server `/health` | execSync 매 hit (캐시 미반영) |
| BL-C-SVR-013 | SVR-013 | `services/crawler.js:7, 92-121` | Puppeteer launch promise 캐싱 미적용 race |
| BL-C-SVR-014 | SVR-014 | Dockerfile USER 지시문 | --no-sandbox + Docker root |
| BL-C-SVR-015 | SVR-015 | crawl-search query 길이 cap | 잔존 추정 |

**총 회귀 미해소: 17건+** (다수 베이스라인에 식별됐으나 사이클 1+2A 12개 PR에서 미처리)

### 약관 위반 risk (BL-C, 모두 법무 검토 필요)

| ID | 항목 | 위험도 |
|---|---|---|
| **BL-C-T06** | `search.naver.com` 검색 결과 자동 수집 | **HIGH 가장 시급** |
| BL-C-T01 | stealth + AutomationControlled 우회 | HIGH |
| BL-C-T02 | 네이버 ID/PW 자동 로그인 + 캡챠 우회 안내 | HIGH |
| BL-C-T04 | robots.txt 미준수 | MEDIUM~HIGH |
| BL-C-T03 | 위장 User-Agent | MEDIUM |
| BL-C-T05 | 자동 본문 입력 + 자동 보조 등록 | MEDIUM |
| BL-C-T07 | 자동 입력 감지 우회 (`evaluate(el.value=...)`) | MEDIUM |

→ **서비스 운영 자체에 영향**. 법무 검토 후 (a) 일부 기능 제거, (b) 사용자 고지 강화, (c) 네이버 공식 API 전환 중 결정 필요.

### blog-core 책임 분리 + drift (BL-D)

- **drift 19건** — 양 앱 lib 공통 29개 중 19개가 양방향 분기 (ARC-001 패턴이 lib 레이어에서 광범위 재발)
- **dead code 후보 3건** (모두 "사용자 결정 필요"):
  - `packages/blog-core/src/blogPrompt.ts:175` `buildHtmlTemplate` (외부+내부 0 호출)
  - `packages/blog-core/src/cardNewsLayouts.ts:364` `THEME_PRESETS`
  - `packages/blog-core/src/cardNewsLayouts.ts:502` `DESIGN_PRESETS`
- **신규**: `next-app/lib/postStorage.ts` 의 `deletePost` 함수 누락 (public-app 만 존재) — 기능 회귀
- **신규**: blog-core self-import 안티패턴 7건 (`@winaid/blog-core` 를 자기 패키지에서 import) — 향후 ESM 빌드 fragile
- **신규**: blog-core `supabase.ts` 가 `NEXT_PUBLIC_*` env prefix 직접 의존 — Next.js 외 호스트 (crawler-server 등) 재사용 시 결합

### 신규 발견 핵심 (BL-A)

- **BL-A-002**: `/api/generate/blog/review` 추가 차감 없는 Opus 4.7 검수 — 인증 사용자가 외부 HTML 60KB 입력으로 무료 컨설팅 도구화 가능
- `keywordDensity` 사용자 입력이 2-pass 섹션 생성에 silently 무시 (route.ts → builder 인자 누락)
- `medicalLawMode='relaxed'` 토글이 dead code (UI 거짓 약속)
- "글 잘림 → 크레딧 미차감" 클라 메시지가 v4 서버 차감 전환 후 거짓 (실제 환불 0)
- `/api/llm` userId 누락 + 인증 사용자 maxOutputTokens cap 부재 + sanitize 미적용
- outline JSON parse 가 review의 3단 fallback 보다 약함 (greedy regex)

### 신규 발견 핵심 (BL-B)

- **블로그 review parse_failed_passthrough = fail-open** (의료법 검증 통과 못 했는데 통과로 처리)
- **카드뉴스 본문 server-side `applyContentFilters` 미적용** (client-only — DevTools 우회 가능)
- 의료법 §57 사전심의 대상 식별 UI 부재
- 신의료기술 평가 미통과 시술 사전 동기화 부재

### 신규 발견 핵심 (BL-C)

- crawler-server 에 robots.txt 준수 코드 0건
- per-domain throttle / 동시성 한도 부재
- YouTube cookie 파일 default mode 0644 (보안)
- blogEditor DOMPurify 양호하나 `style` 속성 sanitize 부재
- puppeteer-core 21.6 / playwright 1.45 — 1년+ lag

### 신규 발견 핵심 (BL-D)

- **`hospital_style_profiles` anon SELECT/DELETE 정책** (`bootstrap_new_supabase.sql:218-226`) — anon-lockdown PR #104 누락 영역. 영업비밀 노출 + anon 무차별 삭제 가능
- `limit_crawled_posts_per_hospital` 트리거 동시성 race (advisory lock 부재)
- `savePost` 멱등성 부재 (UPSERT 없이 INSERT) — 드래프트 자동저장 시 row 폭증

---

## 도메인 특화 섹션

### 1. 의료광고법 false negative 시나리오 (BL-B, 11개)

`BL-B-FN-001 ~ FN-011` 의 입력 예시별 우회 가능성. **상세는 `docs/audits/blog/_findings_BL-B.md` §4 참조**.

| ID | 시나리오 | risk |
|---|---|---|
| FN-001 | zero-width 삽입 ("최​고") | High |
| FN-002 | 줄바꿈/공백 분리 ("최\n고", "최  고") | High |
| FN-003 | 한자/다국어 ("最高", "best", "1위") | High |
| FN-004 | 동의어 의역 ("보장" → "약속") | High |
| FN-005 | testimonial 우회 ("이런 분들이 추천") | High |
| FN-006 | 가격 시간/희소성 ("오늘만", "한정수량") | Medium |
| FN-007 | 자격 사칭 의역 ("권위자", "원조") | Medium |
| FN-008 | 비교 의역 (간접 비교) | Medium |
| FN-009 | SlideEditor nested 필드 우회 | Medium |
| FN-010 | 호출 경로 우회 (검증기 미호출) | High |
| FN-011 | HTML 태그 placeholder 우회 | Low |

**룰셋 커버리지 등급: C (보통)**
- 입력 정규화: F | 가격/신의료기술: D | 호출 경로 안전성: D | 비교/후기/자격: C | 과장/보장: B

### 2. AI 할루시네이션 가드 평가 (BL-A)

- **출력 검증 단계 부재** — Gemini/Claude 응답에서 의약품명·시술명·통계 수치 사실 검증 시도 0
- `trustedMedicalSources.ts` 활용은 입력 reference 단계에만, 출력 검증 미연계
- AI 가 출처 미상 의학 정보 생성해도 차단 메커니즘 없음
- **미검토 영역**: blogPrompt.ts BLOG_EXAMPLES, styleService.ts 1557줄 — jailbreak surface 추가 분석 필요

### 3. 네이버 자동발행 약관 risk (BL-C, 7건)

위 High 섹션 표 참조. **모두 법무 검토 필요**. 특히 BL-C-T06 (search.naver.com 자동 수집) 이 가장 시급.

### 4. 크롤러 SSRF · robots.txt 준수 (BL-C)

| 라우트 | 호스트 게이트 | 사설 IP 차단 | rebinding 방어 |
|---|---|---|---|
| crawler-server `/api/naver/crawl-search` | n/a (fixed search.naver.com) | 없음 | 없음 |
| crawler-server `/api/naver/crawl-content` | `validateNaverBlogUrl` strict | 없음 | 없음 |
| crawler-server `/api/naver/crawl-hospital-blog` | `validateNaverBlogUrl` strict | 없음 | 없음 |
| crawler-server `/api/youtube/gif` | `validateYouTubeUrl` Set | 없음 | 없음 |
| winai-blog-publisher `/publish`, `/account/*` | URL 입력 없음 (고정) | n/a | n/a |
| next-app `/api/internal/crawl-hospital-blog` | proxy (검증 위임) | n/a | n/a |
| public-app `lib/diagnostic/crawler.ts crawlSite` | `safeFetch.validateUrl` | **있음** | **부분** (TOCTOU) |

→ `includes` 회귀는 닫혀 있음. crawler-server 측은 권위 도메인 한정이라 실 risk 좁지만, **사설 IP / DNS rebinding 방어 부재 + robots.txt 준수 코드 0건**.

### 5. blog-core 책임 분리 · drift (BL-D)

- blog-core 자체는 React/DOM 누수 없이 깨끗 (✅)
- 양 앱 lib 레이어 drift **19건** — ARC-001 패턴 재발
- dead code 후보 3건 (사용자 결정 필요)
- self-import 안티패턴 7건
- `supabase.ts` env prefix 결합

---

## 베이스라인 비교

### 기처리 PR (사이클 1+2A) 회귀 점검 결과

| 베이스라인 ID | 사이클 1 PR | 회귀? |
|---|---|---|
| DB-024 | #109 | ✅ 처리 유효 (winaid fallback 제거 유지) |
| DB-020 | #109 | ✅ 처리 유효 (.gitignore + 파일 untrack) |
| ARC-002 | #109 | ✅ 처리 유효 (sanitize 통일) |
| BIZ-003 | #109 | ✅ 처리 유효 (server-side card_news 라우트) |
| ARC-001 | #110 + #111 | ✅ 처리 유효 (dead 렌더러 삭제) |
| BIZ-001 | #114 | ✅ 처리 유효 (10 routes server-side credit) |
| graceful skip | #117 | ✅ 처리 유효 (환불 분기 추가) |

### 베이스라인이 식별했으나 미처리 잔존 17건+

위 High 섹션 "베이스라인 회귀 미해소" 표 참조.

### 베이스라인이 놓친 영역 (이번 감사 신규 발견)

- **외부 LLM 전송 전 PII 마스킹 부재** (BL-B-Critical-2)
- **카드뉴스 다운로드 hard-block 부재** (BL-B-Critical-1)
- **블로그 review parse_failed_passthrough = fail-open** (BL-B 신규)
- **`hospital_style_profiles` anon SELECT/DELETE** (BL-D 신규 — anon-lockdown #104 누락)
- **네이버 자동발행 약관 risk 7건** (BL-C 신규)
- **blog-core self-import 안티패턴** (BL-D 신규)
- **blog-core supabase.ts NEXT_PUBLIC_ 결합** (BL-D 신규)

---

## 카테고리별 통계

| 카테고리 | Critical | High | Medium | Low | 합계 |
|---|---|---|---|---|---|
| 🔒 보안 | 0 | 11+ | ~10 | ~5 | ~26 |
| 💼 비즈니스 로직 | 1 | 4 | 2 | 0 | 7 |
| 🤖 AI 특이사항 | 0 | 3 | 2 | 1 | 6 |
| 💾 데이터 무결성 | 0 | 3 | 5 | 2 | 10 |
| 🏗️ 아키텍처 (drift) | 0 | 6 (drift 19) | 4 | 2 | ~12 |
| 🐛 버그 | 0 | 1 | 3 | 2 | 6 |
| ⚡ 성능 | 0 | 0 | 3 | 1 | 4 |
| 📊 운영성 | 0 | 1 | 4 | 3 | 8 |
| ⚖️ 컴플라이언스 (의료법+약관+PIPA) | 1 | 8 | 2 | 1 | 12 |
| 📦 의존성 | 0 | 0 | 5 | 2 | 7 |
| 🧹 품질 (dead code) | 0 | 0 | 3 (후보) | 2 | 5 |
| **합계** | **2** | **34** | **~28** | **~19** | **~83** |

---

## 검토 완료 / 미검토 영역

### 검토 완료
- ✅ public-app/app/(dashboard)/blog/** (UI/페이지)
- ✅ public-app/app/api/** 중 블로그/Gemini 라우트
- ✅ public-app/lib/{blog*, *Prompt*, gemini*, medicalAd*}
- ✅ packages/blog-core/** (책임 분리 + drift)
- ✅ winai-blog-publisher/** (Playwright)
- ✅ crawler-server/** (Express + Puppeteer)
- ✅ sql/ + public-app-sql/ 중 블로그 RLS
- ✅ next-app 측 blog-core import 처

### 미검토 / 부분 검토 (시간 제약)
- ⚠️ `packages/blog-core/src/blogPrompt.ts` 대형 prompt block (BLOG_EXAMPLES 등) jailbreak surface
- ⚠️ `packages/blog-core/src/styleService.ts` 1557줄 (학습 스타일 환각 surface)
- ⚠️ `packages/blog-core/src/llm/claudeBatch.ts` Batch 경로 (5단계 미사용)
- ⚠️ `public-app/lib/referenceFetcher.ts` 환각 차단 가드 deep-dive
- ⚠️ 의약품/비급여 가격 환각 시나리오 deep-dive
- ⚠️ next-app admin 영역 (블로그 도메인 외)

---

## 다음 사이클 권고

### 사이클 2B 권고 — 베이스라인 회귀 cleanup 우선

신규 Critical 처리 보다 **사이클 1 baseline의 미처리 회귀 17건+ 정리** 가 우선. 이유:
1. 같은 vector(zero-width 우회 등)가 BL-A·BL-B·BL-C에서 3중 재발 — 패치 효율 큼
2. 회귀를 둔 채 새 기능 추가하면 같은 우회 vector가 다른 경로로 재발
3. 신규 Critical도 베이스라인 회귀 패치를 활용 (예: AI-002 패치 = BL-B-001 + BL-A-009 동시 해결)

### Critical 즉시 hotfix PR 후보 (Cycle 2B-α)

**1 PR로 묶기 가능**:
1. **BL-B-Critical-1** 카드뉴스 다운로드 hard-block 추가
2. **BL-B-Critical-2** 외부 LLM PII 마스킹 도입
3. AI-002 zero-width / homoglyph 차단 (BL-A-009 + BL-B-FN-001 동시)

### High 묶음 PR 후보 (Cycle 2B-β)

**SQL 회귀 묶음 PR**:
- DB-001 generated_posts NULL 분기 제거
- DB-027 match_blog_posts caller 검증
- DB-018 pgcrypto 도입 + PII 암호화
- BL-D 신규: hospital_style_profiles anon SELECT/DELETE 잠금

**의료법 검증기 강화 묶음 PR (BL-B-001 ~ 011)** — 법무 검토 후
- 입력 정규화 (zero-width / 줄바꿈 / 한자 / 다국어)
- testimonial 우회 표현 사전
- 가격 시간/희소성 사전
- 자격 사칭 의역 사전

**크롤러/자동발행 보안 묶음 PR**:
- SEC-006 referenceFetcher sanitize
- SVR-002~015 회귀 정리
- robots.txt 준수 도입
- per-domain throttle

### 의사결정 필요 항목 (ADR 산출 권고)

1. **네이버 자동발행 약관 risk** — 법무 검토 후 (a) 기능 제거 / (b) 사용자 고지 강화 / (c) 네이버 공식 API 전환 중 결정. ADR 권고.
2. **blog-core 통합 마무리 (ARC-005 후속)** — drift 19개 일괄 정리 vs 점진 정리. 양 앱 deprecation 정책. ADR 권고.
3. **외부 LLM 전송 정책** — PII 마스킹 vs 사용자 동의 강화 vs 둘 다. PIPA 국외 이전 절차 포함. ADR + 법무 검토.
4. **dead code 후보 3건 처리** — 삭제 vs 보존 vs 활성화. 사용자 결정.

### 비기술 의사결정 (사용자 + 법무)

- 의료법 §57 사전심의 대상 자동 식별 + UI 안내 도입 여부
- 신의료기술 평가 미통과 시술 사전 자동 동기화
- PIPA 국외 이전 동의 절차 (현재 Privacy 페이지 §5 TODO 마커)
- 자동발행 약관 검토 후 운영 정책

---

## 부록 — 영역별 노트

상세 발견 사항(코드 인용, 줄 번호, 재현 시나리오)은 다음 파일 참고:

- `docs/audits/blog/_findings_BL-A.md` — 5단계 파이프라인 + AI 호출 + 프롬프트 (15건)
- `docs/audits/blog/_findings_BL-B.md` — 의료광고법 검증기 + 컴플라이언스 (17건, FN 11)
- `docs/audits/blog/_findings_BL-C.md` — 크롤러 + 네이버 자동발행 (31건, 약관 risk 7)
- `docs/audits/blog/_findings_BL-D.md` — blog-core + 양 앱 + SQL (20건, drift 19, dead 3)

---

**끝**. 코드 변경 없음. 본 보고서를 토대로 사이클 2B 우선순위 (베이스라인 회귀 cleanup → Critical hotfix → High 묶음) 결정 권고.
