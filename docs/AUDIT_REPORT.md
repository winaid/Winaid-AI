# Winaid-AI 전체 감사 보고서

**감사 시점**: 2026-05-05
**감사 범위**: 모노레포 전체 (`public-app`, `next-app`, `crawler-server`, `video-processor`, `winai-blog-publisher`, `packages/blog-core`, SQL 스키마, Dockerfile, package.json)
**검토 파일**: 약 518개 소스 파일 (ts 256 / tsx 135 / js 20 / sql 107) + 7개 package.json + 3개 Dockerfile + nixpacks.toml + 4개 .env.example + docs
**감사 방법**: 6개 read-only 에이전트 병렬 — API 보안 / SQL·RLS / 서버 서비스 / 비즈니스·AI / 아키텍처·버그·성능 / 의존성·컴플라이언스·운영성
**코드 변경 여부**: **없음** (보고서·임시 노트만 생성)

---

## 요약 (Executive Summary)

총 **182건 발견** (중복 제거 후 약 181건). 운영 중 SaaS 코드베이스 기준으로 다음 5개 영역이 가장 위험합니다.

| 심각도 | 건수 | 비고 |
|---|---|---|
| 🔴 **Critical** | **6** | 즉시 수정 필요 — 매출 누수 / 보안 회귀 / 서비스 다운 risk |
| 🟠 **High** | 28 | 이번 sprint 처리 권장 — 사용자 영향 큼 |
| 🟡 **Medium** | ~75 | 다음 sprint 처리 권장 |
| 🟢 **Low** | ~73 | 백로그 — 점진 정리 |

**가장 큰 구조적 발견**: `public-app`과 `next-app`은 단순 "쌍둥이"가 아니라 **본질적으로 분기된 두 별도 앱**입니다. 같은 파일명을 공유하지만 인증 모델·렌더 엔진·sanitizer 정책이 다릅니다. PR #88~108(21개 hotfix)이 한 달간 쏟아진 근본 원인 중 하나로 추정됩니다.

### 카테고리별 위험도 매트릭스

| 카테고리 | Critical | High | Medium | Low | 합계 |
|---|---|---|---|---|---|
| 🔒 보안 (API + RLS + 서버) | 1 | 13 | ~20 | ~16 | ~50 |
| 💼 비즈니스 로직 / 크레딧 | 2 | 4 | 1 | 0 | 7 |
| 🤖 AI 특이사항 | 0 | 3 | 4 | 1 | 8 |
| 💾 데이터 무결성 | 0 | 2 | 6 | 1 | 9 |
| 🏗️ 아키텍처 | 2 | 2 | 4 | 2 | 10 |
| 🐛 버그 (UI/lib + 영상) | 0 | 4 | 8 | 4 | 16 |
| ⚡ 성능 | 0 | 0 | ~7 | ~6 | ~13 |
| 📊 운영성 | 1 | 2 | ~12 | ~11 | ~26 |
| ⚖️ 컴플라이언스 | 0 | 2 | 5 | 4 | 11 |
| 📦 의존성 | 0 | 0 | 5 | 8 | 13 |
| 🧹 품질 | 0 | 0 | 0 | 6 | 6 |
| **합계** | **6** | **32** | **~72** | **~71** | **~181** |

(범주 간 일부 중복 — 한 이슈가 보안+컴플라이언스 양쪽에 들어가는 경우 합산.)

### 즉시 조치 권고 Top 10

1. **[CAT-DB-024]** 'winaid' admin 패스워드 fallback 회귀 — 같은 날(2026-05-04) 보안 hardening이 잡았는데 quick_recovery가 부활시킴. anon이 'winaid'로 admin 권한 획득 가능.
2. **[CAT-BIZ-001]** 영상 9단계 파이프라인 크레딧 미차감 — 로그인 사용자가 video-processor를 무제한 소비 가능.
3. **[CAT-BIZ-003]** 카드뉴스 크레딧 차감이 클라이언트 사이드 — DevTools로 RPC 차단만 해도 무한 사용.
4. **[CAT-DB-020]** `_migration/seoul/internal/00_wipe.sql` git tracked — 자동화가 실수로 운영 DB wipe 가능.
5. **[CAT-ARC-002]** `next-app/lib/sanitize.ts` XSS 회귀 — `<style>` 허용 + `data:` URI 허용. 5개 dashboard 페이지 노출.
6. **[CAT-ARC-001]** `CardNewsProRenderer`가 두 앱에서 완전 다른 렌더 엔진 (Konva vs HTML/CSS, 1772 vs 3293 lines).
7. **[CAT-DB-029]** `deduct_credits` RPC caller 검증 부재 — anon이 victim 크레딧 99999 차감 가능.
8. **[CAT-DB-002]** `subscriptions.plan_type/credits_total` 본인 변조 가능 — 콘솔 1줄로 premium 무료 승급.
9. **[CAT-DB-037]** anon에게 `profiles` 전체 SELECT 허용 — PIPA 위반, 전 사용자 email/full_name 노출.
10. **[CAT-SEC-008]** 게스트 모두 `user_id='guest'` 공유 — 게스트 A 업로드 이미지를 게스트 B가 자유롭게 DELETE/PATCH.

---

## Critical 이슈 (즉시 수정)

### [CAT-DB-024] admin RPC 'winaid' fallback 회귀
- **카테고리**: 🔒 보안 (회귀)
- **심각도**: Critical
- **위치**: `sql/migrations/2026-05-04_admin_rpc_quick_recovery.sql:106-110, 152-154, 187-189, 217-219`
- **현상**: 같은 날짜(`2026-05-04`)의 `_security_hardening.sql`이 'winaid' fallback을 `RAISE EXCEPTION`으로 제거했는데, 같은 날 `_admin_rpc_quick_recovery.sql`이 `CREATE OR REPLACE`로 부활시킴.
  ```sql
  EXCEPTION WHEN OTHERS THEN
    valid_password := 'winaid';
  ```
- **영향**: 마이그레이션 적용 순서에 따라 `app.admin_password` GUC 미설정 환경에서 'winaid' 패스워드로 admin 권한 획득. PII 전수 SELECT + `generated_posts` 전체 wipe 가능 (`adminService.delete_all_generated_posts`는 anon RPC).
- **재현**: `next-app/admin/page.tsx`에서 'winaid' 입력 → `get_admin_stats('winaid')` 통과 → 통계 + 모든 generated_posts 노출.
- **수정 제안**: `_admin_rpc_quick_recovery.sql`의 fallback도 `RAISE EXCEPTION`으로 통일. 또는 quick_recovery를 hardening 이전에만 적용하도록 README 명시.
- **CHANGELOG 처리**: 회귀 (hardening은 처리완료지만 같은 날 quick_recovery가 회귀)

### [CAT-DB-020] _migration/seoul/internal/00_wipe.sql이 git tracked
- **카테고리**: 📊 운영성 / 🔒 보안 (운영자 실수 시)
- **심각도**: Critical
- **위치**: `_migration/seoul/internal/00_wipe.sql`
- **현상**: 운영 DB에 그대로 실행하면 전체 DROP하는 wipe 스크립트가 코드베이스에 같이 있음. 파일명에 wipe 명시되어 있지만 자동화 도구가 모든 .sql을 순회하면 실수로 적용 가능.
- **영향**: 모든 데이터 영구 손실 risk.
- **수정 제안**: 별도 디렉토리(`_migration/.dangerous/`) 또는 파일명 prefix `_DANGER_` + safety header (`SELECT 'CONFIRM'; \\if ...`).
- **CHANGELOG 처리**: 미처리

### [CAT-BIZ-001] 영상 9단계 파이프라인 크레딧 미차감
- **카테고리**: 💼 비즈니스 로직 / 크레딧 정합성
- **심각도**: Critical
- **위치**: `public-app/app/api/video/*/route.ts` 10개 라우트 전부 (`crop-vertical`, `apply-style`, `silence-remove`, `generate-subtitles`, `add-sound-effects`, `add-zoom`, `add-bgm`, `add-intro-outro`, `generate-thumbnail`, `card-to-shorts`)
- **현상**: `useCredit`/`refundCredit` import가 video API 라우트 어디에도 없음. `gateGuestRequest(request, 3, ...)`만 호출.
- **영향**: 로그인 사용자는 video-processor(Railway 인스턴스 + ffmpeg CPU 시간) 비용을 무제한 소비 가능. blog/image/card_news는 1 action = 1 credit이지만 video는 0 credit. 자동 모드 1회 = 9 step CPU-heavy ffmpeg, 분당 수십 회 가능.
- **재현**: 로그인 후 `/video_edit` 진입 → 임의 영상 업로드 → "자동 모드" 반복 실행 → 크레딧 차감 안 됨.
- **수정 제안**: 자동 모드 진입 시 또는 첫 step 처리 전에 1 credit 차감 (실패 시 step 별 부분 환불). 또는 step 별 0.1 credit 부분차감 모델.
- **추가 확인 필요**: "video editing은 무료 정책" 가능성 (CHANGELOG에 영상 과금 언급 없음). 비즈니스 정책 확정 필요.

### [CAT-BIZ-003] 카드뉴스 크레딧 차감이 클라이언트 사이드
- **카테고리**: 💼 비즈니스 로직 / 크레딧 정합성
- **심각도**: Critical
- **위치**: `public-app/app/(dashboard)/card_news/page.tsx:907-916`
- **현상**:
  ```ts
  // 생성 성공 → 크레딧 차감
  if (creditCtx.creditInfo) {
    if (creditCtx.userId) {
      const creditResult = await cardNewsUseCredit(creditCtx.userId);
  ```
  생성은 `/api/gemini` 서버에서 수행되지만, 차감은 브라우저에서 사용자가 자발적으로 호출하는 supabase RPC. blog/image/clinical/youtube/press는 서버에서 차감하지만 카드뉴스만 누락.
- **영향**: (1) fetch 후 페이지 닫거나 네트워크 끊으면 차감 안 됨. (2) DevTools로 supabase RPC 호출만 차단해도 무한 사용. (3) 직접 매출 누수.
- **재현**: 카드뉴스 생성 → 응답 도착 직전 Network 탭에서 supabase RPC 차단 → 결과는 받고 크레딧 그대로.
- **수정 제안**: `/api/generate/card_news` 라우트 추가 + server-side `useCredit`/`refundCredit`. 또는 Gemini 라우트가 task=card_news 받으면 차감.

### [CAT-ARC-002] next-app/lib/sanitize.ts XSS 보안 회귀
- **카테고리**: 🏗️ 아키텍처 / 🔒 보안
- **심각도**: Critical
- **위치**: `next-app/lib/sanitize.ts:1-11`
- **현상**:
  ```ts
  if (typeof window === 'undefined') return html; // SSR 환경 — raw pass-through
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...,'style'],     // <style> 허용
    ADD_DATA_URI_TAGS: ['img'],      // data: URI 허용
  });
  ```
  반면 `public-app/lib/sanitize.ts:3-30`은 `<style>` 차단 + `data:` 차단 + SSR 폴백 regex 보유. 두 sanitizer가 같은 함수명 `sanitizeHtml`로 export.
- **영향**: next-app 5개 dashboard 페이지(clinical, press, refine, youtube, history)에서 `dangerouslySetInnerHTML`에 들어가는 콘텐츠가 CSS 키로거 + data URL 통한 정보 유출에 노출.
- **수정 제안**: next-app/lib/sanitize.ts를 public-app 버전과 동일 정책으로 통일. 또는 `packages/blog-core/src/sanitize`로 단일화.

### [CAT-ARC-001] CardNewsProRenderer 두 앱 완전 다른 렌더 엔진
- **카테고리**: 🏗️ 아키텍처
- **심각도**: Critical
- **위치**: `public-app/components/CardNewsProRenderer.tsx` (1772 lines, react-konva) vs `next-app/components/CardNewsProRenderer.tsx` (3293 lines, HTML/CSS, konva 의존성 0)
- **현상**: 같은 파일명·같은 props 시그니처지만 내부는 완전히 다른 기술. public-app만 `package.json:21 "konva": "^10.2.5"` + `"react-konva": "^19.2.3"`, next-app은 konva 의존성 자체 없음. README는 "fabric.js"라고 적힘 — **3중 진실**.
- **영향**: 한쪽 버그 픽스를 다른 쪽에 자동 적용 불가. 이게 21개 hotfix 누적의 한 원인.
- **수정 제안**: 큰 의사결정 필요 — (a) 별도 패키지로 분리 + 두 앱 서로 다른 컴포넌트 사용 명시, (b) 한쪽으로 통일, (c) 둘 중 하나의 페이지를 다른 앱에 위임. 절대 두 구현을 동시 유지하면 안 됨.

---

## High 이슈 (이번 sprint 권장)

### 🔒 보안 / RLS

#### [CAT-SEC-003] /api/youtube/key-moments 동작 불능 (cookie/Authorization 미포워드)
- High / `next-app/app/api/youtube/key-moments/route.ts:18-42`, `public-app/app/api/youtube/key-moments/route.ts:21-45`
- 내부 `/api/gemini` fetch에 cookie/authorization 헤더 미포워드 → 항상 401. 기능 자체 동작 불능.
- 수정: cookie + authorization 헤더 forward + signal 전달

#### [CAT-SEC-008] /api/hospital-images — 게스트 user_id='guest' 공유
- High / `public-app/app/api/hospital-images/upload/route.ts:22, 72`, `[id]/route.ts:18-32`
- 게스트 A 업로드 이미지를 게스트 B가 자유롭게 DELETE/PATCH. `serverAuth.ts` 주석에 "Phase 2"로 인지된 채 남음.
- 수정: 게스트 user_id를 `guest:<hash>`로 차별화 또는 게스트 DELETE/PATCH 차단

#### [CAT-DB-001] generated_posts INSERT 정책 OR user_id IS NULL 분기
- High / `sql/setup/supabase_FULL_SETUP.sql:46`
- PR #104가 anon 정책만 DROP, base 정책 NULL 분기 그대로 → anon이 user_id=NULL로 INSERT 가능

#### [CAT-DB-002] subscriptions plan_type/credits_total 본인 변조 가능
- High / `sql/setup:101-103`
- WITH CHECK 절 부재. 콘솔 1줄로 premium 무료 승급. `_rls_anon_lockdown.sql:58-61`에 "옵션 C" 후속으로 명시되었으나 미처리

#### [CAT-DB-003] subscriptions.plan_type CHECK가 'admin' 허용 안 함
- High / `public-app/lib/auth.ts:86-95`
- 코드는 admin 사용자에게 'admin' upsert 시도, CHECK는 ('free','basic','standard','premium')만 → silent failure

#### [CAT-DB-004] hospital_images RLS 두 코드베이스 비대칭
- High / public-app DB의 strict 정책 마이그레이션 부재 → authenticated가 다른 사용자 row 변조 가능

#### [CAT-DB-005] hospital-images storage RLS 임의 user 폴더 업로드 가능
- High / `sql/migrations/2026-04-29_image_library_team_share.sql:160-179`
- foldername 미검증 (주석에 "server에서" 인정)

#### [CAT-DB-008] handle_new_user 트리거 setup vs hardening 충돌
- High (운영성) / 3개 마이그레이션이 서로 다르게 정의 → 신규 환경에서 회귀 risk

#### [CAT-DB-018] PII 평문 저장 (pgcrypto 미사용) — PIPA 위반
- High / `sql/setup:21-26` (user_email, ip_hash, doctor_name)
- 보관기간/파기 트리거/우탈권 함수 부재

#### [CAT-DB-022] hospital_images.user_id TEXT 타입 — FK 강제 불가
- High / 'guest'/임의 문자열 INSERT 가능, orphaned row

#### [CAT-DB-025] admin RPC password 클라이언트 평문 전달
- High / `next-app/app/admin/adminTypes.ts:62-64, 90, 143`
- 클라 supabase(anon)로 admin_password 평문 전송. MITM/XSS 시 노출

#### [CAT-DB-029] deduct_credits RPC caller 검증 부재
- High / `sql/setup:400-430`
- use_credit/refund_credit는 hardening됐지만 deduct_credits 누락. anon이 victim의 credits_used +99999 가능

#### [CAT-DB-037] profiles 전체 SELECT를 anon에게 허용 (PIPA 위반)
- High / `_migration/seoul/internal/01_setup.sql:85-87`
- "Anon can view profiles ... USING (true)" — 전 사용자 email/full_name/team_id 노출

#### [CAT-DB-038] adminService.delete_all_generated_posts client-side anon 호출
- High / `next-app/lib/adminService.ts:14`
- DB-024 'winaid' fallback 활성 시 anon 1회 RPC로 전체 wipe

### 💼 비즈니스 로직 / 🤖 AI / ⚖️ 컴플라이언스

#### [CAT-BIZ-002] 로그인 사용자 burst rate-limit 부재
- High / `public-app/lib/guestRateLimit.ts:86`
- cookie 보유 시 즉시 통과 → 크레딧 한도까지 비용 burst

#### [CAT-BIZ-004] Cookie auth와 Bearer token 인증 비대칭
- High / `gateGuestRequest`(cookie) vs `resolveImageOwner`(Bearer) → 무료 이미지 생성 우회 경로

#### [CAT-BIZ-005] 블로그 2-pass 부분 실패 시 크레딧 환불 부재
- High / `app/api/generate/blog/route.ts:225-249` (line 239 코멘트가 "의도"라 명시 — 정책 결정 사항)

#### [CAT-BIZ-006 / CAT-BUG-006] runAutoMode stale state 캡처
- High / `app/(dashboard)/video_edit/page.tsx:692-771`
- `stateRef`(line 782) 정의만 되고 활용 안 됨. 자동 모드 step chain이 첫 입력만 반복 처리될 위험

#### [CAT-AI-001] SlideEditor 사용자 입력 prompt 무방어 삽입
- High / `components/card-news/SlideEditor.tsx:658, 669, 680`
- sanitizePromptInput 미적용. 의료광고법 위반 콘텐츠 생성 가능 페이로드 통과

#### [CAT-AI-002] INJECTION_KEYWORDS — zero-width / homoglyph 우회
- High / `packages/blog-core/src/promptSanitize.ts:18-35, 56`
- ZWSP/ZWNJ/ZWJ/BOM/NBSP 미제거 → `i​gnore previous` 우회

#### [CAT-AI-003] medicalAdValidation zero-width / 줄바꿈 분리 우회
- High / `lib/medicalAdValidation.ts:225-261`
- "최​고", "최\n고", "최 고" 통과 (false negative)

### 🏗️ 아키텍처 / 🐛 버그

#### [CAT-ARC-003] next-app에 sanitize.ts와 sanitizeHtml.ts 공존 (정책 불일치)
- High / 5개 페이지는 sanitize.ts(느슨), AdminContentsTab은 sanitizeHtml.ts(엄격)

#### [CAT-ARC-004] keyIndex 모듈 전역 mutable — 동시성 race (5곳)
- High / `public-app/app/api/{gemini,image}/route.ts`, `next-app/app/api/{gemini,image}/route.ts`, `next-app/lib/geminiDirect.ts`
- blog-core는 random-start로 수정됐으나 app routes 미이주

#### [CAT-BUG-001] CompletionScreen `getFinalResultUrl` Blob URL 매 렌더 누수 (Day 2 회귀)
- High / `public-app/components/video-edit/CompletionScreen.tsx:235`

#### [CAT-BUG-002] InternalFeedback JSX inline createObjectURL (next-app)
- High / `next-app/components/InternalFeedback.tsx:240`

### ⚖️ 컴플라이언스 / 📊 운영성

#### [CAT-CMP-001] 개인정보처리방침 / 이용약관 페이지 부재 (PIPA)
- High / privacy/terms/policy 디렉토리 없음, 회원가입에 약관 동의 없음
- 개인정보보호법 제15조/22조 위반 소지

#### [CAT-CMP-002] 회원탈퇴 / 데이터 삭제 흐름 부재
- High / 개인정보보호법 제36조(정정·삭제 요구권) 미준수

#### [CAT-OPS-001] 모니터링/관측성 도구 0건
- High / Sentry/PostHog/OTel/Datadog 어느 SDK도 import 안 됨

#### [CAT-OPS-010] CI / pre-commit / secret scanning 부재
- High / `.github/workflows/`, `.husky/`, gitleaks 모두 부재

---

## Medium 이슈 (다음 sprint 권장)

### 🔒 보안 / RLS (요약 — 상세는 audit 노트)

| ID | 위치 | 요약 |
|---|---|---|
| SEC-001 | `*/api/diagnostic/competitor-gap/route.ts` | crawlSite request.signal 미전파 |
| SEC-002 | `*/api/diagnostic/stream/route.ts` | streamChatGPT/Gemini/crawlSite signal 미전파 (300s SSE 비용 낭비) |
| SEC-004 | `next-app/api/diagnostic/history/route.ts` | 인증/Rate limit 누락, 임의 URL 점수 enumeration |
| SEC-005 | `*/api/diagnostic/share + refresh-narrative` | 클라 입력 진단 결과 신뢰 (위조 share 토큰) |
| SEC-006 | `lib/referenceFetcher.ts:144-157` | topic/category sanitizePromptInput 미적용 (가짜 출처 생성) |
| SEC-009 | `public-app/api/hospital-images/route.ts:50` | params.team_id 검증 없이 .or() 보간 (RLS 의존) |
| SEC-018 | `next-app/api/influencer/status` | hospital_id 소유권 검증 없음 |
| SEC-019 | `next-app/api/diagnostic` | customQuery sanitizePromptInput 미적용 |
| SEC-023 | `public-app/api/diagnostic/competitor-gap` | 인증/Rate limit 가드 전무 (LLM 비용 직격탄) |
| DB-006 | `_migration/seoul/internal/01_setup.sql:473-475` | api_usage_logs anon INSERT (회계 왜곡) |
| DB-007 | `medical_law_cache` | anon INSERT/UPDATE 무제한 (의료법 룰 변조) |
| DB-026 | blog-images 버킷 | anon upload 허용 — abuse vector |
| DB-027 | `match_blog_posts` | filter_user_id NULL 허용 (장래 SECURITY DEFINER 추가 시 위험) |
| DB-030 | usage_logs | service_role 정책 명시 부재 |

### 💾 데이터 무결성

| ID | 위치 | 요약 |
|---|---|---|
| DB-009 | hospital_style_profiles brand_preset | next-app DB에 컬럼 부재 (모노레포 비대칭) |
| DB-010 | generated_posts | (user_id, created_at) 복합 인덱스 부재 |
| DB-011 | hospital_crawled_posts limit 트리거 | 동시 INSERT race condition |
| DB-013 | refund_credit RPC | 산식 fragile (EXCLUDED 우회) |
| DB-023 | increment_image_usage RPC | public-app DB 부재 |
| DB-032 | payments | idempotency_key 컬럼 부재 (사용 코드 미발견 — 우선순위 낮음) |
| BIZ-007 | `lib/postStorage.ts:71-100` | savePost userId 클라이언트 입력 (RLS 의존) |

### ⚡ 성능

| ID | 위치 | 요약 |
|---|---|---|
| DB-014 | api_rate_limit | TTL/cleanup 메커니즘 부재 |
| SVR-004 | apply-style.js | 동시성 한계 부재 (Gemini 폭발 + 디스크 폭발) |
| SVR-013 | crawler.js | Puppeteer 브라우저 싱글톤 race condition (OOM) |
| PERF-001 | categoryTemplates.ts 250KB | 양쪽 앱에 복제 (diff 0, 즉시 blog-core 이주 가능) |
| PERF-002 | CardNewsProRenderer ResizeObserver | re-attach |
| PERF-003 | image/page.tsx handleGenerate | 30+ deps useCallback (React.memo 무력화) |

### 🤖 AI

| ID | 위치 | 요약 |
|---|---|---|
| AI-004 | 30+ 위치 모델 ID 하드코딩 | gemini-3.1-pro-preview, gpt-image-2, gpt-5-search-api, claude-sonnet-4-6 등 — fallback 부재 |
| AI-005 | `packages/blog-core/src/llm/claude.ts:125-178` | abort 후에도 재시도 루프 진입 (gemini.ts:61과 비대칭) |
| AI-006 | help-chat / landing-chat | sanitizePromptInput 미적용 |
| BUG-002-D | press route | cookie forward, Bearer 누락 → guest 강등 → PRO+googleSearch 깨짐 |

### 🏗️ 아키텍처 / 🐛 버그

| ID | 위치 | 요약 |
|---|---|---|
| ARC-005 | blog-core 통합 미완 | 30+ 파일 로컬 lib 의존, 9개 파일은 즉시 이주 가능 |
| ARC-006 | `next-app/lib/useTeamData.ts:22-30` | lib에 React 훅 (boundary 위반) |
| BUG-003 | KonvaSlideEditor + KonvaHelpers | 모듈 전역 mutate (슬라이드 N개 동시 렌더 race) |
| BUG-004 | CardNewsProRenderer keyboard handler | undo/redo/handleSave deps 누락 (eslint-disable) |
| BUG-005 | BlogPage debounce useEffect | category deps 누락 |
| BUG-008 | useAuthGuard timeout 경로 | 게스트 redirect 미처리 |
| SVR-008 | card-to-shorts.js | multer tmp 파일 cleanup 누락 (디스크 폭발) |

### ⚖️ 컴플라이언스 / 📊 운영성

| ID | 위치 | 요약 |
|---|---|---|
| CMP-003 | 모든 SQL 테이블 | 데이터 보관/파기 기간 명시 부재 (PIPA 제21조) |
| CMP-004 | clinical/page.tsx:50,322,439 | 임상 케이스 동의 UI는 있으나 DB 기록 없음 |
| CMP-007 | hospital_crawled_posts | 제3자 블로그 본문 평문 저장 + RLS public read (저작권 risk) |
| CMP-D-001 | medicalAdValidation testimonial | 환자 후기 우회 표현 사전 부족 |
| CMP-D-002 | medicalAdValidation price | 시간/희소성 압박 표현 미감지 |
| OPS-002 | Next 앱 헬스체크 | `/api/health` 부재, `/api/gemini` GET이 keys 카운트 노출 |
| OPS-003 | hospital-images/upload | 에러 stack 일부 응답 포함 여부 (확인 필요) |
| OPS-006 | video-processor | `app.set('trust proxy')` 부재 |
| OPS-007 | 12개 라우트 | userId 평문 로깅 (image, generate/blog/section/youtube/press/clinical × 양 앱) |
| OPS-008 | Supabase 미설정 | prod에서도 silent fallback to 게스트 모드 |
| OPS-009 | 배포 순서 | PROCESSOR_SHARED_SECRET 동기화 강제 메커니즘 없음 |
| OPS-011 | Dockerfile 3개 | USER 디렉티브 부재 → root 실행 |
| OPS-016 | multer dest=os.tmpdir() | 9개 라우트 /tmp 채움 위험 |
| OPS-017 | api_usage_logs.details JSONB | 입력 토큰/콘텐츠 단편 저장 가능 |
| SVR-003 | `/health` | 인증 없이 execSync(yt-dlp/ffmpeg/auto-editor) — DoS surface |

### 📦 의존성

| ID | 위치 | 요약 |
|---|---|---|
| DEP-001 | crawler-server | puppeteer-core ^21.6.1 (구버전, 23.x 보안 패치 누적) |
| DEP-002 | video-processor | multer ^1.4.5-lts.1 (메인터넌스 모드, 2.x 권장) |
| DEP-003 | video-processor | @google/generative-ai (deprecated) ↔ @google/genai 혼재 |
| DEP-004 | public/next-app | Next 16 / React 19 / Tailwind 4 / openai 6 / anthropic 0.93 (RC급 stack) |
| DEP-007 | crawler-server Dockerfile | yt-dlp `pip install --upgrade` 핀 부재 |

---

## Low 이슈 (백로그)

자세한 목록은 `docs/audit/_findings_*.md` 참고. 주요 항목:

- **보안 (보조)**: SEC-007/010/011/012/013/014/015/016/017/020/021/022/024/025 (Gemini 임의 URL 무검증, prompt 길이 cap, key redact 누락, KST hour 체크, X-Forwarded-For 신뢰 등)
- **운영성**: OPS-004/005/012/013/014/015/018, SVR-002/006/009/010/015/020/024/026/027/029
- **품질**: QLT-001 (README fabric.js 잘못 표기), QLT-002 (sfxLibrary 데드 export), QLT-003 (sfx 파일 미완), QLT-004 (devLog 미사용 console.log 잔존), QLT-006 (fontStorage 레거시 마이그 코드)
- **의존성**: DEP-005/006/008/009/010/011/012/013 (html2canvas, crypto-js, @types/node drift, Playwright 두 버전, helmet/uuid 메이저 drift, license 필드 부재)
- **컴플라이언스**: CMP-005 (robots.txt/sitemap), CMP-006 (본인인증/PG 코드 부재 — 정보), CMP-D-003 (자격 미증명 표현 사전), CMP-D-004 (본인인증 정보)

---

## 카테고리별 통계

| 카테고리 | Critical | High | Medium | Low | 합계 |
|---|---|---|---|---|---|
| 🔒 보안 / RLS / API | 1 (DB-024) | 14 | ~20 | ~16 | ~51 |
| 💼 비즈니스 로직 | 2 (BIZ-001,003) | 4 | 1 | 0 | 7 |
| 🤖 AI 특이사항 | 0 | 3 | 4 | 1 | 8 |
| 💾 데이터 무결성 | 0 | 2 | 7 | 1 | 10 |
| 🏗️ 아키텍처 | 2 (ARC-001,002) | 2 | 4 | 2 | 10 |
| 🐛 버그 (UI/lib + 영상) | 0 | 4 | 8 | 4 | 16 |
| ⚡ 성능 | 0 | 0 | ~7 | ~6 | ~13 |
| 📊 운영성 | 1 (DB-020) | 4 | ~13 | ~12 | ~30 |
| ⚖️ 컴플라이언스 | 0 | 2 | 5 | 4 | 11 |
| 📦 의존성 | 0 | 0 | 5 | 8 | 13 |
| 🧹 품질 | 0 | 0 | 0 | 6 | 6 |
| **합계** | **6** | **35** | **~74** | **~60** | **~175** |

(중복 제거 후 약 175건. 한 이슈가 여러 카테고리에 걸치는 경우(예: DB-018은 보안+컴플라이언스) 한 곳에만 카운트.)

---

## CHANGELOG 처리 여부 매트릭스

| 상태 | 건수 | 의미 |
|---|---|---|
| 미처리 (신규 사각지대) | ~150 | 이번 감사로 처음 식별 |
| 회귀 | 2 | DB-024 ('winaid' fallback), SEC-013 (key redact 일부) |
| 처리완료 (회귀 위험 있음) | 5 | DB-008(handle_new_user), DB-022(user_id TEXT) 등 |
| 부분 처리 | ~20 | DB-004 등 next-app만 적용, public-app 미적용 |
| Day 1~6 검증 통과 | 다수 | drawtext textfile, X-API-Secret, protocol_whitelist, /health 최소화 — 회귀 없음 |

Day 1~6 정비는 보안·메모리·API 방어·정확성·E2E에 집중되었고, **다음 영역은 이번 감사에서 처음 식별된 사각지대**:
- 의존성 drift (puppeteer 21, multer 1.x, @google/generative-ai deprecated 등)
- 컴플라이언스 (개인정보처리방침, 회원탈퇴, 보관기간)
- 모니터링/관측성 도입 부재
- CI / pre-commit / gitleaks 부재
- Dockerfile USER 디렉티브 부재
- 영상 파이프라인 크레딧 미차감
- public-app ↔ next-app drift (sanitize, CardNewsProRenderer, keyIndex)

---

## 검토 완료 / 미검토 영역

### 검토 완료
- ✅ `public-app/app/api/**` (41개 라우트 정독) — Agent A
- ✅ `next-app/app/api/**` (47개 라우트 정독) — Agent A
- ✅ `lib/auth*`, `lib/serverAuth.ts`, `lib/apiAuth.ts`, `lib/sanitize*.ts`, `lib/promptSanitize.ts`, `lib/guestRateLimit.ts`, `lib/rateLimit.ts` — Agent A, E
- ✅ `sql/setup` 2개, `sql/migrations` 47개, `public-app-sql/setup` 2개, `public-app-sql/migrations` 33개, `supabase/schema.sql`, `_migration/seoul/internal` 5개 — Agent B (98개 SQL 파일)
- ✅ `crawler-server/src/**` (6개 js), `video-processor/src/**` (12개 js), `winai-blog-publisher/src/**` (7개 ts) — Agent C
- ✅ `lib/medicalAdValidation.ts`, blog/video/cardnews/diagnostic 파이프라인, LLM 호출 (gemini/openai/anthropic) — Agent D
- ✅ `public-app/lib/**` + `next-app/lib/**` (drift 비교), `public-app/components/**` + `next-app/components/**`, `hooks/`, `packages/blog-core/src/**` — Agent E
- ✅ `package.json` × 7, `Dockerfile` × 3, `nixpacks.toml`, `.env.example` × 4, README/RUNBOOK 문서 — Agent F

### 미검토 / 부분 검토
- ⚠️ `lib/diagnostic/discovery.ts` (streamChatGPT/streamGemini) 내부 구현 — 호출부에서 abortSignal 미전파만 확인
- ⚠️ `next-app/lib/diagnostic/crawler.ts` 700줄 중 SSRF 부분만 grep 확인, 전수 정독 안 함
- ⚠️ `next-app/admin/**` 페이지 내부 (Agent E 미검토 대상)
- ⚠️ Supabase 운영 DB의 `pg_policies` 라이브 상태 (마이그레이션 누적이라 실측 필요)
- ⚠️ `_migration/seoul/internal/03_2026-03.sql, 04_2026-04.sql` 후반부 (1000+ 라인)
- ⚠️ `payments` 테이블 사용처 (코드 호출 미발견 — 우선순위 낮음)
- ⚠️ storage bucket 단위 listing 권한 (objects 외 buckets 정책)
- ⚠️ 테스트 커버리지 (Playwright 38 tests의 실제 검증 범위)
- ⚠️ 외부 검증 필요: 모델 ID 실재성 (`gemini-3.1-pro-preview`, `gpt-image-2`, `gpt-5-search-api` 등 2026-05-05 시점)

---

## 부록 — 에이전트별 임시 노트

상세 발견 사항(코드 인용, 줄 번호, 재현 시나리오)은 다음 파일 참고:

- `docs/audit/_findings_A_api_security.md` — 25건
- `docs/audit/_findings_B_sql_rls.md` — 37건
- `docs/audit/_findings_C_server_services.md` — 29건
- `docs/audit/_findings_D_biz_ai.md` — 21건
- `docs/audit/_findings_E_arch_bugs_perf.md` — 30건
- `docs/audit/_findings_F_deps_compliance_ops.md` — 40건

---

**끝**. 코드 변경 없음. 이 보고서를 토대로 우선순위별 패치 작업을 별도 PR로 진행 권장.
