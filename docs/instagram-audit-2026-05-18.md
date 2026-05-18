# Instagram 관련 코드 — 양 앱 sweep 보고서

생성: 2026-05-18
탐색자: Claude (코드 변경 0, 보고서 1개만)
스코프: next-app · public-app · packages/blog-core · sql · public-app-sql · supabase · docs

---

## 1. Executive summary

- **인스타그램·인플루언서 관련 production 코드 파일 12개** (라우트 3 + UI 1 + lib 1 + diagnostic 7).
- **양 앱 lockstep 깨진 영역 = 5개**. 가장 큰 것은 인플루언서 탐색 전체 — next-app 12 파일 vs public-app 0 파일.
- **죽은 코드 = 0개**. 단, AEO/GEO 진단이 "Instagram +8점" 가중치 + actionPlan 으로 사용자에게 계정 개설을 권유하지만 정작 _연동·게시·관리_ 기능은 0건 — 사용자 입장에서 "권유 → 막힘" 단절.
- **정책 회귀 risk 영역 = 3개**: (1) public-app 신설 시 P-1 어드민 bypass 처리 누락 risk, (2) prose-flow / 의료법 normalize 가 `generate-dm` 빌더에 미적용 (다른 5 빌더는 invariant 적용됨), (3) drift-zero 카테고리 7종 ↔ 인플루언서 카테고리 12종 매핑 부재.
- **외부 OAuth (Meta/FB/Instagram Login) = 0건**. 현재는 RapidAPI Instagram Scraper + Gemini Google Search 하이브리드만.
- **DB**: `influencer_outreach` 테이블 1개 (next-app DB 전용, RLS service_role만 허용). public-app DB 미적용. 검색 이력 테이블 0.
- **직전 라운드(PR2) 계획 8 항목 진행도 = 0%** (탐색만 보고했고 머지 0).

---

## 2. 6축 sweep 결과

### 축 1 — 인스타그램 관련 코드 인벤토리

| 경로 | 한 줄 설명 | 앱 | lockstep |
|---|---|---|---|
| `next-app/app/api/influencer/search/route.ts:1-348` | RapidAPI hashtag → Gemini fallback 하이브리드 검색. `maxDuration=120`. | next-app | ❌ public-app 없음 |
| `next-app/app/api/influencer/generate-dm/route.ts:1-172` | 인플루언서 프로필 + 병원 정보 → DM 3개 초안. `maxDuration=300`. `tone: casual|business|friendly`. | next-app | ❌ public-app 없음 |
| `next-app/app/api/influencer/status/route.ts:1-89` | outreach 상태 upsert (`supabaseAdmin` service_role). | next-app | ❌ public-app 없음 |
| `next-app/app/(dashboard)/influencer/page.tsx:1-498` | STEP1 검색 조건 + STEP2 결과 카드 + DM 모달 + 상태 select UI. | next-app | ❌ public-app 없음 |
| `next-app/lib/influencerHashtags.ts:1-300+` | 12 카테고리 + 지역별 해시태그 매핑 + `generateInfluencerHashtags`. | next-app | ❌ public-app 없음 |
| `next-app/components/Sidebar.tsx:7,32` | `ContentTab` 에 `'influencer'` + 메뉴 항목. | next-app | ❌ public-app sidebar 에 없음 |
| `next-app/lib/diagnostic/scoring.ts:49,140,666,680` | Instagram URL → +8점 / SNS 단절 메시지. | next-app | ✅ public-app 도 동일 (라인만 다름) |
| `next-app/lib/diagnostic/discovery.ts:260` | sameAs 후보 도메인 리스트에 `instagram.com`. | next-app | ✅ public-app 도 동일 |
| `next-app/lib/diagnostic/actionPlan.ts:489-496` | Instagram 미연결 → "비즈니스 계정 가입 → 푸터 링크" 액션 카드. | next-app | ✅ public-app 도 동일 |
| `next-app/lib/diagnostic/snippets.ts:285` | sameAs placeholder 에 `instagram.com` 예시. | next-app | ✅ public-app 도 동일 |
| `public-app/lib/diagnostic/actionGroups.ts:67,131` | `[LABELS.instagram]: 'instant'` / `'time_only'`. | public-app | ✅ next-app 도 동일 |
| `next-app/.env.example:28-29,63-64` | `RAPIDAPI_KEY` + `RAPIDAPI_PARALLEL` 안내. | next-app | ❌ public-app .env.example 에 없음 |

**의존성**: `package.json` 에 인스타그램 SDK / Graph API wrapper 0건. RapidAPI 호출은 fetch native. ✅ 안전.

**한 줄 평가**: 인플루언서 탐색은 next-app 단독 — 양 앱 lockstep 정책 완전 위반. AEO 진단은 양 앱 정합.

---

### 축 2 — 인플루언서 탐색·DM 기능 현황

직전 라운드 보고서의 PR2 계획 (8 항목) vs 현재:

| 계획 항목 | 현재 상태 | 위치 |
|---|---|---|
| 상태 영속 GET (페이지 로드 시 outreach 복원) | ❌ 없음 — `POST /api/influencer/status` 만 존재 | — |
| 검색 이력 + 재실행 | ❌ 없음 — 매번 처음부터 | — |
| 즐겨찾기/북마크 (★) | ❌ 컬럼 없음 | `influencer_outreach` 스키마 |
| CSV 내보내기 | ❌ 없음 | — |
| DM 응답률 통계 대시보드 | ❌ admin 페이지에 통계 카드 없음 | `next-app/app/admin/page.tsx` |
| 페이지네이션 | ❌ `results.slice(0, 20)` 하드캡 | `search/route.ts:345` |
| RAPIDAPI_KEY 미설정 가드 UI | ❌ 서버에서 fallback 만, UI 안내 0 | — |
| 의료법 위반 자동 수정 (DM) | ❌ 경고만 표시 — 사용자가 직접 수정 | `generate-dm/route.ts:42-49` |

**한 줄 평가**: 직전 라운드 후 코드 0줄 변경. PR2 = 전부 미착수.

---

### 축 3 — 인스타용 콘텐츠 생성 빌더

- `packages/blog-core/src/` 인스타그램 키워드 발견 **0건**.
- 5 빌더 (`buildOutlinePrompt` / `buildBlogPromptV3` / `buildBlogSectionPromptV3` / `buildBlogReviewPrompt` / `buildSectionFromOutlinePrompt`) 모두 블로그 전용. 인스타그램 톤·길이·해시태그 분기 0.
- `LLMTaskKind` (`packages/blog-core/src/llm/types.ts`) 에 `'instagram'` / `'ig_caption'` / `'reel_script'` 류 task 0.
- `instagramPrompt.ts` 류 파일 0.
- `generate-dm` 가 유일한 "인스타용 텍스트 생성기" 인데 5빌더 안전망 외부.

**한 줄 평가**: 인스타 캡션·릴스·스토리 빌더 자체가 부재. 만들려면 6번째 빌더 신설 필요.

---

### 축 4 — 인스타 외부 API 연동

| 항목 | 상태 |
|---|---|
| Instagram Graph API 토큰 | ❌ 환경변수 0, 코드 0 |
| Facebook/Instagram OAuth Login | ❌ 0 |
| 자동 게시 (`/me/media`) | ❌ 0 |
| Insights fetch (`/me/insights`) | ❌ 0 |
| cron / webhook 게시 큐 | ❌ 0 |
| RapidAPI Instagram Scraper Stable | ✅ next-app 만 (`RAPIDAPI_KEY` + `RAPIDAPI_PARALLEL`) |
| Gemini Google Search fallback | ✅ next-app 만 (`gemini-3.1-pro-preview` + `googleSearch:true`) |

**한 줄 평가**: 읽기 전용 (검색) 만. 쓰기·인사이트·자동게시 자체 부재. OAuth 미도입 = 게시 기능 추가 시 큰 작업.

---

### 축 5 — DB 스키마

| 파일 | 내용 | 적용 DB |
|---|---|---|
| `sql/migrations/2026-04-08_influencer_outreach.sql` | `influencer_outreach` 테이블 (hospital_name + username UNIQUE, status enum 5종, dm_message, sent_date, notes, RLS `all_access`). | next-app DB only |
| `sql/migrations/2026-05-04_influencer_rls.sql` | `all_access` 정책 → `service_role` 만 허용 (anon/authenticated 차단). | next-app DB only |
| `public-app-sql/migrations/` | 인플루언서 마이그레이션 **0건**. | public-app DB |

**RLS 양 앱 일치 여부**: ❌ public-app DB 에는 테이블 자체 없음. 향후 public-app 신설 시 별도 마이그레이션 + RLS 조정 필요 (게스트 차단 + user_id 본인 row만).

**한 줄 평가**: 검색 이력 테이블 부재 = 검색마다 처음부터. `starred` 컬럼 부재 = 즐겨찾기 불가.

---

### 축 6 — UI 진입점

| 위치 | next-app | public-app |
|---|---|---|
| Sidebar 메뉴 | ✅ `'인플루언서 탐색'` (🔍, `/influencer`) | ❌ 없음 |
| landing-chat 안내 | ❌ 인플루언서/인스타 단어 0건 | ❌ 동일 |
| `/app` (대시보드 홈) | ❌ 콘텐츠 카드 3개에 인플루언서 없음 (블로그/언론보도/이미지만) | ❌ 동일 |
| `/mypage` 또는 `/history` | ❌ 콘텐츠 유형 통계에 인플루언서 0 | ❌ 동일 |
| admin 통계 카드 | ❌ outreach 응답률 통계 0 | n/a |
| README 언급 | ✅ "internal admin: admin · influencer · strengths · youtube 등" | n/a |
| CHANGELOG 언급 | ❌ 0 | n/a |

**죽은 진입점 (PR #219 카드뉴스 placeholder 같은 패턴)**: 없음. 인플루언서는 진입점이 next-app sidebar 1개뿐이고 살아있음.

**한 줄 평가**: 발견 가능성 매우 낮음 — next-app 으로 로그인해서 sidebar 보기 전까지 존재 자체 모름. 외부 사용자 0%.

---

## 3. 작업 후보 (PR 단위 로드맵)

8개 PR 로 쪼갠다. PR-A → PR-E 는 의존성 사슬, PR-F~H 는 병렬 가능.

### PR-A. next-app 인플루언서 — 상태 영속 + 검색 이력 + 즐겨찾기

- **의도**: 현재 가장 큰 사용자 불편 — 페이지 새로고침마다 outreach 상태·검색 결과 사라짐. 작은 작업으로 즉각적 가시 효과.
- **범위**:
  - `GET /api/influencer/status?hospital_id=` 추가
  - `sql/migrations/2026-05-18_influencer_searches.sql` 신설 — 검색 이력 + `starred` 컬럼 추가
  - `POST /api/influencer/search` 응답 시 자동 저장
  - 사이드 패널 "최근 검색 5건" 빠른 재실행
- **의존성**: 없음 (단독)
- **effort**: S (1일)
- **정책 영향**: next-app only — P-1 admin 자동 통과 / drift-zero 무관 / lockstep 영향 없음 (PR-E 에서 함께 lockstep 화)
- **회귀 risk**: 낮음. 신규 추가만, 기존 라우트 시그너처 불변.

### PR-B. next-app 인플루언서 — CSV 내보내기 + 응답률 대시보드

- **의도**: 운영자가 outreach 결과를 spreadsheet 로 분석 + admin 에서 한눈에 응답률 보기.
- **범위**:
  - 결과 화면 우상단 "CSV 내보내기" 버튼
  - `next-app/app/admin/page.tsx` 통계 카드에 응답률 행 추가
  - `adminTypes.ts` `AdminStats` 에 outreach 5종 카운트
- **의존성**: PR-A (검색 이력 저장된 후라야 통계 의미 있음)
- **effort**: S (0.5일)
- **정책 영향**: next-app only / lockstep 무관
- **회귀 risk**: admin RPC 시그너처 변경 가능성 → SQL function `admin_stats` 도 수정 필요 (운영 DB 적용 절차 포함).

### PR-C. next-app 인플루언서 — 페이지네이션 + RAPIDAPI 가드 UI

- **의도**: 20명 cap 해제 + RAPIDAPI_KEY 미설정 시 사용자에게 "정확도 떨어짐" 명시.
- **범위**:
  - `search/route.ts` cursor 기반 paging (`offset` query param)
  - 헬스체크 endpoint `GET /api/influencer/health` (RAPIDAPI_KEY 유무 + 마지막 응답 status)
  - UI 상단 배너: 가드 fail 시 노란색 안내
- **의존성**: 없음
- **effort**: S (0.5일)
- **정책 영향**: 없음
- **회귀 risk**: paging 도입으로 기존 무 paging 호출 컨트랙트 변경 — 기본 `offset=0` 처리로 호환.

### PR-D. generate-dm — sanitize chain 보강 + prose-flow + 의료법 자동수정

- **의도**: generate-dm 이 5빌더 안전망 외부에 있어 PR #217 / PR #214 의 sanitize chain 미적용. 인플루언서 입력 (`recent_posts.text` IG 외부 텍스트) 이 prompt 에 결합되므로 prompt injection / leak guard 누락 위험.
- **범위**:
  - `stripInjectionForUse` + `stripPromptLeakage` + `applyContentFilters` + `sanitizeHtml` 4중 fail-closed
  - `COMMON_WRITING_STYLE` (prose-flow 룰) slot 1 주입
  - 의료법 violations 발견 시 "AI 자동 수정" 버튼 — `medicalLawFilter.autoReplace` 호출
- **의존성**: 없음
- **effort**: M (1~2일)
- **정책 영향**: 의료법 normalize 인스타 입력 경로 신규 적용 (이전엔 sanitizePromptInput 만)
- **회귀 risk**: DM 메시지 길이 변동 — 기존 200자 cap UI 와 충돌 점검 필요.

### PR-E. public-app 인플루언서 신설 (외부용)

- **의도**: 양 앱 lockstep 회복. 외부 병원 고객이 인플루언서 탐색·DM 생성을 사용 가능.
- **범위**:
  - `public-app/app/(dashboard)/influencer/page.tsx` — next-app 기반 lockstep
  - `public-app/app/api/influencer/{search,generate-dm,status}/route.ts` — 3개 라우트
  - `useCredit` 차감 (검색 1 / DM 1, 사용자 결정값)
  - `gateGuestRequest` 게스트 5/분 / 로그인 30/분
  - `public-app-sql/migrations/2026-05-XX_influencer.sql` — 외부용 테이블 + user_id 본인 row RLS
  - 사이드바 메뉴 항목 추가
  - landing-chat SYSTEM_INSTRUCTION 에 "인플루언서 탐색" 서비스 추가
- **의존성**: PR-A / PR-D 머지 후 (lockstep 가치 + sanitize chain 동시 적용)
- **effort**: L (3~4일)
- **정책 영향**: **P-1 핵심** — public-app 라우트에 admin_session bypass 분기 명시 필요. drift-zero 무관 (인플루언서 카테고리는 별도 12종)
- **회귀 risk**: 높음. 새 라우트 3개 + DB + 크레딧 hooking + 사이드바. 회귀 가드 `양 앱 컴포넌트 diff=0` invariant 신규 (PR #217 패턴 답습).

### PR-F. 카테고리 매핑 — 콘텐츠 7종 ↔ 인플루언서 12종

- **의도**: 사용자가 "피부과 + 뷰티/미용 인플루언서" 처럼 두 분류 체계 동시 사용 시 자동 추천. 현재는 별개로 운영.
- **범위**:
  - `packages/blog-core/src/influencerCategoryBridge.ts` 신설
  - 매핑 표 (예: 치과 → 맛집 X / 뷰티 X / 셀프케어 ○ / 육아 ○)
  - 인플루언서 page 에서 "선택한 콘텐츠 카테고리" prop 받으면 12종 중 호환 카테고리 prefill
- **의존성**: PR-E 머지 후 (양 앱 동시 적용)
- **effort**: S (0.5일)
- **정책 영향**: drift-zero 카테고리 7종 record drift 가드 영향 — `contentCategoryDriftZero.test.ts` 에 매핑 invariant 추가
- **회귀 risk**: 낮음. 신규 추가만.

### PR-G. AEO/GEO 진단 ↔ 인플루언서 deeplink

- **의도**: 진단 actionPlan 에 "Instagram 미연결" 카드 클릭 시 인플루언서 탐색으로 deeplink. 진단→실행 단절 해소.
- **범위**:
  - `lib/diagnostic/actionPlan.ts:489-496` 카드에 `cta: { href: '/influencer?from=diagnostic' }` 추가 (양 앱)
  - 인플루언서 page 에서 `?from=diagnostic` 감지 시 "병원 정보 자동 prefill" + 안내 토스트
- **의존성**: PR-E 머지 후
- **effort**: S (0.5일)
- **정책 영향**: 양 앱 lockstep
- **회귀 risk**: 낮음. 기존 카드에 cta 추가만.

### PR-H. 인스타 콘텐츠 빌더 신설 (피드 캡션 + 릴스 자막)

- **의도**: 사용자가 블로그·보도자료처럼 "병원 인스타 캡션" 생성. 6번째 빌더 신설.
- **범위**:
  - `packages/blog-core/src/instagramPrompt.ts` — `buildInstagramFeedCaptionPrompt` + `buildReelScriptPrompt`
  - `LLMTaskKind` 에 `'instagram_caption'` + `'reel_script'` 추가 (router.ts / types.ts / index.ts 정리)
  - 5빌더 안전망 (PRIORITY_ORDER + E_E_A_T + COMMON_WRITING_STYLE) → 7빌더 안전망 확장
  - 양 앱에 `/api/generate/instagram/{caption,reel}` 라우트
  - 양 앱 사이드바 "글 작성" 그룹에 "Instagram 캡션" 메뉴
- **의존성**: PR-E + PR-F 머지 후 (인프라 + 카테고리 매핑 선결)
- **effort**: L (3일)
- **정책 영향**: drift-zero 7 카테고리 × 인스타 톤 분기 신규 (`CATEGORY_INSTAGRAM_TONE` record). 5빌더 invariant → 7빌더 invariant. 의료법 normalize / prose-flow 신규 빌더 적용.
- **회귀 risk**: 중간. 빌더 추가 = 회귀 가드 테스트 다수 갱신.

---

## 4. 정책·invariant 충돌 사전 경고

### P-1 (어드민 풀 액세스)

- **현재 next-app**: `checkAuth` 가 `admin_session` cookie 통과 시 OK 반환 → 자동 bypass ✅
- **public-app 신설 시 risk**: 새 인플루언서 라우트에 `useCredit` 차감 + `gateGuestRequest` 적용할 때, **admin_session 보유 시 차감·rate limit 둘 다 skip 분기 명시 필요**. 패턴은 `public-app/app/api/image/route.ts:511-540` (`resolveImageOwner` → `'guest'` 면 차감 skip).
- **회귀 risk**: PR-E 에서 분기 누락 시 admin 도 검색 1 크레딧 차감 = 운영자 시연 막힘.

### P-2 (이미지 라우트 300s)

- 인스타 텍스트 LLM 위주 — P-2 무관.
- 단, PR-H 의 `/api/generate/instagram/caption` 은 `maxDuration=60~120` 정도. 회귀 가드 `fixedPolicyInvariant.test.ts` 에 추가 권장.

### 양 앱 lockstep drift-zero

- **현재 깨진 곳**: 인플루언서 전체 영역. PR-E 가 회복 PR.
- **diagnostic 모듈**: scoring·discovery·actionPlan·snippets·actionGroups 5개 파일 모두 instagram 가중치 동일 ✅ — 회귀 가드 신규 추가 권장 (`양 앱 instagram URL 점수 8점 동일` invariant).

### drift-zero 카테고리 7종 vs 인플루언서 12종

- 콘텐츠 카테고리 (치과/피부과/성형외과/내과/정형외과/한의원/안과) ≠ 인플루언서 카테고리 (맛집/뷰티/일상/육아/건강/패션/지역/직장인/셀프케어/브이로그/인테리어/반려동물)
- **의도된 분리** — 다른 분류 체계라 drift-zero 가드 직접 충돌 없음.
- **단**: PR-F (브리지) 신설 시 매핑 invariant 추가 필요 — 7 카테고리 모두 12 중 1+ 호환 카테고리 보유.

### 의료법 normalize 인스타 입력 경로 적용 여부

- **`generate-dm`**: `sanitizePromptInput` 만 ✅. `medicalLawNormalize` ❌. PR-D 에서 보강.
- **`generate-search`**: `sanitizePromptInput` ✅. 검색 hashtag 입력은 의료법 무관.
- **PR-H 신규 인스타 빌더**: 의료법 normalize + prose-flow + 5빌더 안전망 → 7빌더 안전망 모두 적용 필수.

---

## 5. 결정 대기 항목 (사용자 결정 필요)

다음 5가지가 결정되어야 PR-E·PR-H 본격 시작 가능.

1. **인스타 OAuth 방식**
   - (a) Meta Business Login 직접 구현 (FB App 등록 + Graph API token storage + refresh) — 가장 정통, 학습곡선 큼
   - (b) 3rd-party wrapper (Ayrshare, Buffer API 등) — 빠르지만 월 $50~ 비용
   - (c) **OAuth 도입 미루기** — 게시는 "복사 후 직접 발송" 형태 유지 (현재 generate-dm 패턴)
   - 추천: (c) → MVP 확장 후 (a) 검토

2. **자동 게시 vs 초안 생성만**
   - 자동 게시 = OAuth + 게시 큐 + 실패 retry + Insights polling 모두 필요 — 추가 effort ~10일
   - 초안 생성만 = 현재 패턴 유지 (사용자가 인스타 앱에서 복사·붙여넣기)
   - 추천: 초안 생성만 (PR-H 범위)

3. **어떤 인스타 카테고리부터?**
   - 피드 캡션 / 릴스 자막 / 스토리 텍스트 중 우선순위
   - 추천: 피드 캡션 1순위 (사용량 ↑, 의료법 검증 호환성 ↑) → 릴스 2순위

4. **크레딧 정책**
   - 인플 검색 1 / DM 1 = 직전 라운드 결정 ✅
   - 인스타 캡션 생성 = 미정 (블로그 5? 캡션 1?)
   - 릴스 스크립트 = 미정
   - 추천: 캡션 1 / 릴스 2 (텍스트 LLM 비용 비례)

5. **PR-E (public-app 인플루언서) 머지 후 시연 대상**
   - 병원 고객 / 투자자 / 지인 — 우선순위에 따라 UX 마감 깊이 달라짐
   - 직전 답변에서 결정 보류 — PR-E 시작 전 재확인 필요

---

## 6. 추천 — 지금 가장 먼저 손대야 할 1개 PR

### **PR-A. next-app 인플루언서 — 상태 영속 + 검색 이력 + 즐겨찾기**

선정 이유:
- 사용자가 가장 자주 마주치는 불편 (페이지 새로고침 = 상태 증발) 즉시 해소
- 단독 작업 (의존성 0). 실패 risk 낮음.
- DB 마이그레이션 1개 + GET 라우트 1개 + UI 패널 1개 — 1일 안에 완결
- PR-E (public-app 신설) 의 데이터 모델 기반 — 여기서 검증한 GET 패턴이 public-app 에 그대로 lockstep
- 정책 영향 0 (next-app only, P-1 자동 통과)

### 세부 작업 항목 (다음 라운드 작업 지시용)

1. `sql/migrations/2026-05-18_influencer_searches.sql` 신설
   - `influencer_searches` 테이블 (id / hospital_name / search_params jsonb / result_count / created_at)
   - `influencer_outreach` 에 `starred BOOLEAN DEFAULT false` 컬럼 추가
   - RLS: service_role 만 (`influencer_rls.sql` 패턴 답습)
   - 멱등성: `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`

2. `next-app/app/api/influencer/status/route.ts` 에 `GET` 핸들러 추가
   - query `?hospital_id=&include_searches=1` → `{ outreach: [], searches: [] }` 반환
   - service_role 우회 + `checkAuth` 가드

3. `next-app/app/api/influencer/search/route.ts` 응답 후 자동 저장
   - 결과 반환 직전 `influencer_searches.insert({...})` (실패는 silent — 검색 자체는 성공)

4. `next-app/app/(dashboard)/influencer/page.tsx`
   - mount 시 `GET /api/influencer/status?hospital_id=&include_searches=1` 호출
   - `outreachStatuses` + 최근 5건 prefill
   - 사이드 패널 신규: "최근 검색 5건" — 클릭 시 search params 복원 + 자동 재실행

5. 결과 카드에 ★ 토글 버튼
   - 클릭 시 `POST /api/influencer/status` 에 `starred: true` 전달
   - upsert 로 `influencer_outreach` row 갱신

6. 회귀 가드: `next-app/__tests__/influencerPersistence.test.ts`
   - GET 응답 shape 검증
   - 검색 자동 저장 호출 검증
   - starred 컬럼 컨트랙트

7. README 의 next-app 섹션에 "인플루언서 탐색 — 상태·이력 영속" 한 줄 추가

**사용자 GO 사인 받으면 위 7개 항목 순서대로 코드 작업 시작.**
