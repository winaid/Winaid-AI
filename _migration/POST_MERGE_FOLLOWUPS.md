# Post-merge 후속 작업

PR 머지 후 별도 PR 로 다룰 항목들. 메모용 — 각 항목은 개별 프롬프트로 진행 예정.

> 다른 파일: GEO/AEO 진단 lib drift 는 `PHASE_B_TODO.md` 참조.

---

## 2026-05-15 — Blog image prompt audit doc 머지 (PR #216)

main HEAD: `0a0f47f4`. squash 머지. docs-only.

### 산출물
- `docs/blog-image-prompt-audit-2026-05-15.md` (29 findings)
- 코드 0줄 변경 (audit-only)
- Critical 0 / High 8 / Medium 13 / Low 8
- 인프라 audit (`ai-image-pipeline-audit.md`) + 텍스트 audit (`blog-prompt-audit-2026-05-15.md`) cross-reference

### 다음 라운드 후보 (이미지 룰 보강 PR)
- Top 3 즉시 보강:
  - 축 7.A.1+7.A.2 — buildImagePrompt 호출지 sanitize drift (blog/page.tsx 자동 흐름 → ImageInsertModal 패턴 복제 + promptInjectionGuard. 코드 < 20 lines)
  - 축 2.C.1 — 효과 단정 시각화 차단 (BLOG_IMAGE_RULE FORBIDDEN 에 "guaranteed treatment outcome" 명시. 텍스트 audit 1.E.1 의 이미지 layer 대응)
  - 축 1.B.1 — AI 생성 prompt negative/exclude layer 부재 도입 (라이브러리 매칭 excludeKeywords 와 등가)
- High 잔여 5건 + Medium 13 + Low 8 — audit doc 참조

### 정책 결정 대기 (3건)
- 축 6.D.1 — quality='medium' 고정 vs 'premium' 분기 (비용 4배)
- 축 3.D.1 — hospitalStyleBlock imageHints 필드 도입 (인프라 작업)
- 축 1.D.1 — AI생성↔라이브러리 매칭 의미 공간 브릿지 (PoC 필요)

### 다음 세션 컨텍스트 복원
- audit doc 1독 → Top 3 권고 정확도 검증
- 이미지 룰 보강 PR 은 텍스트 audit Round 4 (의료법 보강) 와 동시 또는 직후 진행 권장 — root cause 가 일부 공유됨 (가상 시술명·효과 단정·인증마크 등)

---

## 2026-05-15 — Blog prompt audit doc 머지 (PR #215)

main HEAD: `ff20fb73`. squash 머지. docs-only.

### 산출물
- `docs/blog-prompt-audit-2026-05-15.md` (26 findings)
- 코드 0줄 변경 (audit-only)
- Critical 0 / High 6 / Medium 13 / Low 7
- 회귀 가드 R-1~R-5 PASS 상태에서의 보강 권고

### 다음 라운드 후보 (룰 보강 PR)
- Top 3 즉시 보강:
  - 가상 시술명 차단 (축 3.B.1) — "최신 OO 기법" 류 LLM 생성 차단 룰 부재
  - 본인부담금·할인·면제 패턴 (축 1.B.1) — 의료법 위반 빈출 1위 영역
  - promptLeakageGuard XML 태그 보강 (축 4.C.1) — 10+ 개 태그 누락 (`<faq_section_guide>`, `<image_prompt_guide>`, `<journey_stage>`, `<topic_type_guide>`, `<category_tone>`, `<specialist_guide>`, `<medical_blog_voice>`, `<learned_style>` 등)
- High 잔여 3건 + Medium 13 + Low 7 — audit doc 참조

### 정책 결정 대기
- learned_style priority 정합성 (`packages/blog-core/src/blogPrompt.ts:2911-2912` 의 NOTE) — `buildBlogSectionPromptV3` 가 `override_greeting` 사용 (다른 빌더 `override_all_style` 보다 약함). 작성 시점부터 "후속 PR 정합성 검토" 표시. PO 결정 필요.

### 다음 세션 컨텍스트 복원
- audit doc 1독 → Top 3 권고 정확도 검증 → 룰 보강 PR 설계
- 룰 보강 PR 은 한 PR 에 묶을 수 있는 크기 (룰 본문 보강 + guard 패턴 = 코드 < 50 lines)
- 보강 시점은 PR #214 (Round 3 보안) 이후의 보안 Round 4 또는 별도 의료법 Round 1 로 분리 권고

---

## 2026-05-15 — PR #214 머지 (Round 3 — 보안)

main HEAD: `c7560b17`. squash 머지 (PR #212/#213 와 동일 컨벤션).

### 머지된 변경 (2 commits)
- **#2** `b6fbd9b` — issues 패치 후 HTML sanitize 통합. 양 앱 `blog/page.tsx` 의 `applyIssuesPatch` 출력을 `sanitizeHtml` (DOMPurify wrapper, `lib/sanitize.ts`) 통과 후 `applyContentFilters` 적용. **기존 라이브러리 활용 — 신규 dep 0**.
- **#3** `88b5db6` — hospitalStyleBlock 저장형 prompt injection 가드. 신규 `packages/blog-core/src/promptInjectionGuard.ts` (HIGH 12 패턴 + LOW 4 + length anomaly) + `styleService.sanitizeAnalyzedStylePii` 에 사용 시점 strip wiring. 마이그레이션 audit 스크립트 (`scripts/audit-existing-style-blocks.ts`, read-only) 동봉.

### 정찰에서 드러난 사실
- **#3 공격 벡터는 어드민 입력이 아니라 외부 사이트 크롤 → `analyzedStyle` 보존 → DB** 흐름. 어드민이 직접 입력하는 것이 아니라 시스템이 자동으로 추출·저장한 데이터에 외부 조작 가능성이 있음.
- 본 가드는 P-1 (어드민 풀 액세스) 와 **무관한 content-level 검증 layer** 라는 점 명확. "권한 게이트" 아닌 "콘텐츠 무결성 검증" — 어드민이라도 LLM system instruction override 페이로드는 차단해야 출력 무결성 유지.

### 검증
- 로컬 21 test files / ~270 케이스 green (exit 0). CI 7 jobs 그린 (`88b5db6` 1회만).
- WS-A 회귀 6/6 (양 앱 page.tsx import + 순서 패턴 + lib/sanitize SSR fallback + ALLOWED_TAGS 의료 마크업 6종).
- WS-B 회귀 29/29 — **FP guard 6/6 통과 (false-positive 0)**.
- 양 앱 lockstep 유지. 기존 invariant (prose-flow / drift-zero / 5빌더 / 의료법 normalize) 위반 0.

### 감사 Top 5 진척 (`docs/code-review-2026-05-15.md`)
| # | 항목 | 상태 |
|---|---|---|
| 1 | CAPTCHA (게스트/public 한정) | P-1 재해석 (Round 2 머지 시 명시) |
| 2 | issues 패치 후 HTML sanitize | ✅ **Round 3 resolved** (PR #214) |
| 3 | hospitalStyleBlock injection | ✅ **Round 3 resolved** (PR #214) |
| 4 | review JSON.parse fail-open 정책 | 정책 결정 대기 |
| 5 | medical-ad override audit log | 정책 결정 대기 (PIPA vs 의료법) |

### 잔여 백로그 (9건)

**외부 (감사 Top 5 — 2건, 정책 결정 선행)**
- #4 review fail-open 정책 — 텔레메트리 카운터부터 시작 가능 (정책 결정 없이도)
- #5 medical-ad audit log — 변호사 자문 후 정책 문서 작성

**WS-3 audit 후속 (`docs/ai-image-pipeline-audit.md` — 5건)**
- #1 hospital-images CRUD 4 라우트 maxDuration 명시화
- #4 buildImagePrompt categoryHints 옵션 C (양 앱 prompt chain 재설계, Effort 5/Risk 4)
- #6 Vision 후처리 시각 검수 (의료법 위반 risk 최대)
- #7 per-user daily 이미지 cap — **P-1 어드민 분기 면제 설계 필수**
- #8 환불 텔레메트리 강화 (observability only)

**이미지 매칭 인프라 (2건)**
- F-2 시뮬레이션 케이스 카테고리별 분리 (비치과 hospital 시드 후)
- F-3 hospitals.category 매핑 인프라 + matcher category alignment 게이트

### existing data audit (실행 대기)

`scripts/audit-existing-style-blocks.ts` (read-only) — 기존 DB `style_profile.analyzedStyle` 행 중 #3 guard 가 detect 하는 행 list 출력. 양 Supabase 인스턴스 (winaid-internal-seoul / winaid-public-seoul) 각각 실행. user 승인 후. 실제 정리 (재학습 / row 삭제) 는 user 결정.

```bash
SUPABASE_URL=https://<project>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service-role> \
  SUPABASE_PROJECT_LABEL=next-app \
  npx tsx scripts/audit-existing-style-blocks.ts
# → docs/style-blocks-injection-audit-2026-05-15-next-app.md
```

### 추가 안내 (다음 라운드 진입 시)
- **#4 fail-open 정책** — 정책 결정 없이도 텔레메트리 카운터부터 추가 가능. 실측 데이터 수집 후 fail-closed vs fail-open 결정 뒷받침.
- **#5 PIPA vs 의료법** — 변호사 자문 선행 권장. 본 작업은 정책 문서 작성 + 코드 변경 2단계.
- **#7 per-user daily cap** — 어드민 분기 면제 설계 필수 (P-1 충돌 회피 — `userId === null` 또는 `admin_session cookie` 검증 분기).

---

## 2026-05-15 — PR #213 머지 (Round 2)

main HEAD: `fded8ff8`. squash 머지 (레포 컨벤션 + PR #212 동일 패턴).

### 머지된 변경 (3 commits)
- **#2** `ab0a63c` — `public-app/app/api/card-news/generate-images/route.ts` 의 `maxDuration` (이미 300) + 양 앱 `hospital-images/upload` 라우트에 대한 P-2 invariant 가드 `fixedPolicyInvariant.test.ts` 확장. 향후 단축 시도 시 fail-fast.
- **#3** `b8eda01` — `OPENAI_IMAGE_MODEL` snapshot pin 권장 `README.md` 환경변수 표 행 신규 추가 (`OPENAI_API_KEY` / `_2/_3` / `OPENAI_IMAGE_MODEL`). `.env.example` 양 앱 안내 + `gpt-image-2-YYYY-MM-DD` 패턴 + README 의 "snapshot pin" 안내가 모두 존재함을 invariant 로 강제 — silent 삭제 시 즉시 검출.
- **#5** `140457a` — gemini 모델 deprecation 추적 alias 인프라. 신규 `packages/blog-core/src/llm/models.ts` (`resolveModel` / `DEPRECATED_MODELS` / `MODEL_ALIASES`). callee 4곳 wiring (claude.ts / gemini.ts / `next-app/lib/geminiDirect.ts` / `/api/gemini` route.ts). **호출지 30+ 위치 변경 0** — callee 안에서 자동 처리. 운영자가 GA 발표 시 set + map 한 곳 업데이트 → 일제 502 회피.

### 영향
- 향후 gemini GA 전환 시 `DEPRECATED_MODELS` set + `MODEL_ALIASES` map 한 곳 업데이트 → 일제 502 회피. 호출지 30+ 위치 hardcode 무변경 유지.
- card-news 라우트 maxDuration 가 향후 단축되면 invariant 테스트 fail-fast. P-2 "이미지 생성 + 라이브러리 후처리" 정의 범위 명시화.
- `OPENAI_IMAGE_MODEL` 운영자 가시화 — silent 업그레이드로 인한 품질·비용·실패 패턴 변경 회피.

### 검증
- 19 test files / 240+ 케이스 green (로컬). CI 7 jobs 그린 (`140457a` 기준).
- 양 앱 lockstep 유지. 기존 invariant (prose-flow / drift-zero / 5빌더 / 의료법 normalize) 위반 0.
- P-1 / P-2 자체 위반 0. P-2 는 **강화** 방향 (fail-fast 가드 확장).

### WS-3 audit 후속 백로그 잔여 (Round 3+ 대상)
- **#1** hospital-images CRUD 4 라우트 maxDuration 명시화 — 메타데이터 CRUD, 우선순위 낮음
- **#4** `blog-core/buildImagePrompt` categoryHints 정리 (옵션 C) — handoff §10.7. Effort 5 / Risk 4, 양 앱 prompt chain 재설계
- **#6** Vision 후처리 시각 검수 — 의료법 위반 risk 최대 (Sev/UI 5/5). 비용·정책 결정 + FP guard 인프라 큼
- **#7** per-user daily 이미지 cap — 비용 leakage 차단. **P-1 의해 어드민 분기 면제 필수** (다음 라운드 진입 시 반드시 명시)
- **#8** AI 이미지 환불 텔레메트리 강화 — observability only. Sentry tag / metric

### 외부 백로그 (감사 Top 5)
- `docs/code-review-2026-05-15.md` 의 Top 5 중 #2-#5 — issues 패치 XSS / hospitalStyleBlock injection / review fail-open / medical-ad audit log 정책
- #1 CAPTCHA 는 P-1 에 의해 게스트 / public-app 한정으로 재해석됨 (반복 명시)

---

## 2026-05-15 — PR #212 머지

main HEAD: `f6d65175`. squash 머지 (레포 컨벤션).

### 머지된 변경
- **WS-0** P-1 / P-2 invariants (`CLAUDE.md` "고정 정책" / `docs/INVARIANTS.md` §4 / `fixedPolicyInvariant.test.ts`)
- **WS-1** `promptLeakageGuard` + `applyContentFilters` 체인 통합 (HIGH 14 / LOW 6 패턴)
- **WS-2** `imageMatcher` (excludeKeywords + specificity exact>edge>substring + title 3x). 양 앱 lockstep wiring + HospitalImage 타입 forward-compat
- **WS-3** AI image pipeline audit (`docs/ai-image-pipeline-audit.md`) + `hospital-images/upload/route.ts` 양 앱 `maxDuration` 30→300 (P-2 위반 fix)
- **F-1** `minScore: 0 → 8` 양 앱 lockstep. weak match defense-in-depth.
- 검증 마이그레이션 SQL (`sql/migrations/` + `public-app-sql/migrations/` 2026-05-15 파일) + 검증 스크립트 3종 (`scripts/{audit,simulate,build}-image-*.ts`) + 양 앱 검증 결과 6 docs + 통합 summary

### 검증 결과
- WS-2 SQL 마이그레이션 양 Supabase 인스턴스 적용 완료 + 사후 검증 PASS (C1 임플란트 양 앱, C2 사랑니 next-app). excludeKeywords 채움 0% 상태에서도 (b) specificity + (c) title-first 만으로 confusable 분리.
- 자기 모순 0건 양 앱 / prod 회귀 risk 0 (`scope=hospital` 필터 + 라이브러리 카테고리 단일).
- 기존 invariant (prose-flow / drift-zero / 5빌더 / 의료법 normalize) 위반 0. P-1 / P-2 자체 위반 0.
- CI 그린 — 18 test files / 224 케이스 통과. 1회 `aaeebab` 로 fixture/HTML 파싱 fix 적용.

### 잔여 백로그 (별도 PR 처리)
- **F-2**: 시뮬레이션 케이스 라이브러리 카테고리별 분리 (비치과 hospital 시드 추가 후 의미).
- **F-3**: `hospitals.category` 매핑 인프라 → matcher category alignment 게이트 가능성.
- **WS-3 후속 8건**: `docs/ai-image-pipeline-audit.md` 참조 — hospital-images CRUD 4건 maxDuration / card-news/generate-images / `OPENAI_IMAGE_MODEL` snapshot pin / blog-core `buildImagePrompt` 옵션 C / gemini deprecation 추적 / 시각 검수 (Vision 후처리) / per-user daily 이미지 cap / 환불 텔레메트리 강화.
- **감사 Top 5 중 #2-#5** (`docs/code-review-2026-05-15.md`):
  - #2 issues 패치 후 HTML sanitize 미경유 → XSS 표면 (48h)
  - #3 hospitalStyleBlock 저장형 prompt injection (1주)
  - #4 review JSON.parse fail-open 정책 (1주)
  - #5 medical-ad override audit log 정책 (2-4주)
  - **#1 CAPTCHA 는 P-1 에 의해 게스트 / public-app 한정으로 재해석됨** — 어드민 경로엔 추가 안 함.

### 알려진 한계
- F-1 `minScore=8` 은 PASS-FAIL score range overlap (PASS 최저 14.5 vs FAIL 최대 22) 영역에 대한 **absolute floor** 차원의 defense-in-depth. completest 해결은 F-3 후 category alignment 게이트.
- WS-1 promptLeakageGuard 의 HIGH 패턴 `<persona>` / `<role>` 등은 커스텀 HTML tag 매칭 — 표준 HTML 에 자연 출현 0 이지만, 향후 web components 도입 시 재검토 필요.

### 운영자 즉시 권고 (선택, optional safety net)
임플란트 ↔ 사랑니 confusable 보강 SQL. 양 Supabase 인스턴스 각각 실행:
```sql
UPDATE hospital_images SET exclude_keywords = exclude_keywords || ARRAY['임플란트']::text[]
 WHERE '사랑니' = ANY(tags) AND NOT ('임플란트' = ANY(exclude_keywords));
UPDATE hospital_images SET exclude_keywords = exclude_keywords || ARRAY['사랑니']::text[]
 WHERE '임플란트' = ANY(tags) AND NOT ('사랑니' = ANY(exclude_keywords));
```
적용 후 `npx tsx scripts/build-image-fix-todo.ts` 재실행 → HIGH 항목 변화 확인.

---

## 블로그 누수/이미지 후속 (PR #154 / #155 / #156 후속)

### 1. fix(blog): IMG_N false-positive 패턴 수정 — ✅ 완료 (PR #157)
- **현 패턴**: `normalizeBlog.ts` 의 `\[IMG_[NX0-9]` — 정상 마커 `[IMG_1]` ~ `[IMG_9]` 도 매칭 가능성
- **적용된 수정**: `\[IMG_[NXnx]\b` — letter placeholder (대소문자) + word boundary
- **양 앱 영향**: `next-app/app/(dashboard)/blog/normalizeBlog.ts` + `public-app/...` (헤딩 + `<p>` 양쪽 필터, 총 4 곳)
- **검증**: 25-case sanity test 25/25 (정상 [IMG_1]~[IMG_15] 보존 + [IMG_N/X/n/x] placeholder 차단)
- **머지 SHA**: `af4d0353`

### 2. fix(prompts): clinical / press / cardNews 한국어 출력 지시 영문화 — ✅ 완료 (PR #158)
- 동일 leak 패턴 (한국어 출력 메타 → Gemini 본문화) 가 다른 콘텐츠 타입에도 잠재. blogPrompt 패치(PR #154/#156) 와 동일 처치.
- **적용 위치 (13 핫스팟 / 6 파일)**:
  - `next-app/lib/clinicalPrompt.ts` (2 hotspots) + `public-app/lib/clinicalPrompt.ts` (2)
  - `next-app/lib/pressPrompt.ts` (2, ⛔ → `[CRITICAL]`) + `public-app/lib/pressPrompt.ts` (2)
  - `next-app/lib/cardNewsPrompt.ts` (4, dead code 지만 future-proof) + `public-app/lib/cardNewsPrompt.ts` (3)
- **패턴**: `[META: instructions for the model — do NOT copy any of this into the generated content.]` 라벨 + 영문 + "Do NOT echo" 명시
- **보존**: JSON 스키마 키, press HTML 클래스명, 한국어 본문 가이드/예시/금지어, 진료과 시술 용어
- **머지 SHA**: `ebed568b`
- **한계**: 영문화는 1차 방어. 후처리 필터는 PR #161 (#5) 에서 추가됨.

### 3. chore(blog): normalizeBlog 죽은 패턴 제거 — ✅ 완료 (PR #159) — 47/47 sanity 통과로 dead 직접 증명
- 패턴 3 — `(<h[1-6]>|<p>|<ul>|<li>|<strong>|<em>)(?=...)` 가 `inner.replace(/<[^>]*>/g, '')` 이후에 적용되어 매칭 불가능 (HTML 태그가 이미 strip 된 텍스트에서 `<h3>` 못 찾음).
- **PR #159 47-case 결과**: 패턴 3 제거 전후 결과 100% 동일 → dead 직접 증명.
- **적용 위치**: 양 앱 × 양 필터 = 4곳 동일 한 줄 삭제. 헤딩 필터 13→12, `<p>` 필터 7→6 패턴.
- **다른 패턴 커버리지**: 의도된 leak 케이스(사용 가능 태그/h3 태그로 감싸/마크다운 JSON 등) 는 패턴 2, 6, 7 또는 헤딩 전용 8-13 이 이미 커버.
- **머지 SHA**: `566cfc01`

### 4. test(blog): normalizeBlog leak filter 정식 회귀 테스트 추가 — ✅ 완료 (PR #160)
- ad-hoc sanity test 들을 정식 회귀 테스트로 승격.
- **아키텍처**: 옵션 B (cases 공유 모듈 + 각 앱 test 파일) + CI-2 (신규 test job 2개) + tsx devDep.
- **케이스**: 47 → 45 unique (PR #154 1건 + PR #156 22건 + PR #157 25건 − dedup 2건).
- **신규 파일**: `packages/blog-core/src/__tests__/normalizeBlogCases.ts` (공유) + `next-app/__tests__/normalizeBlog.test.ts` + `public-app/__tests__/normalizeBlog.test.ts`.
- **invariants**: strip 여부 + console.warn 카운트 이중 검증. fail 메시지에 case ID + source PR + input/expected/actual + output.
- **CI**: 신규 job 2개 (`test-public`, `test-next`) 병렬, 5분 timeout.
- **부수 효과**: tsx 추가로 기존 `next-app/__tests__/safeUtils.test.ts` 도 자동 실행됨 (12/12 통과).
- **머지 SHA**: `0111df07`

### 5. feat(blog-core): clinical / press / cardNews 출력 정규화 필터 도입 — ✅ 완료 (PR #161)
- PR #158 영문화의 한계 보완. blog 와 달리 후처리 필터가 없어 누수 발생 시 무방비였음 → 2차 방어선 추가.
- **신규 모듈**:
  - `packages/blog-core/src/normalize/leakFilter.ts` — `sanitizeLeakInHtml`, `sanitizeLeakInString`
  - `packages/blog-core/src/normalize/leakFilterJson.ts` — `sanitizeLeakInSlideOutline`, `sanitizeLeakInSlideData`, `sanitizeLeakInSlides`
- **5 라우트 와이어링**: clinical(next-app) + press(양 앱) + cardNews outline/text(public-app)
- **카드뉴스 정책**: PR #151 의 "기능은 두고 UI 에서 없애줘" 그대로 유지. backend API 만 강화.
- **신규 테스트**: 52 cases (`packages/blog-core/src/__tests__/leakFilter.test.ts`)
- **모니터링 키워드**: `[clinical] leak stripped`, `[press] leak stripped`, `[card-news/outline] leak stripped`, `[card-news/text] leak stripped`
- **머지 SHA**: `fadee3fb`

### 6. feat(blog): entity-encoded HTML leak 차단 (`&lt;h3&gt; 태그를 감싸` 류) — PR #159 진단 중 발견
- 현재 어떤 누수 패턴도 entity-encoded HTML 을 잡지 못함.
- **PR #159 edge case 실증**: `<p>설명: &lt;h3&gt; 태그를 감싸 사용합니다.</p>` 가 stripped text `"설명: &lt;h3&gt; 태그를 감싸 사용합니다."` 로 변환됨. 어떤 패턴도 매칭 안 됨.
- 발생 빈도 극히 낮으나 LLM 이 system prompt 의 HTML 지시문을 escape 형태로 본문화할 수 있음.
- **처리 옵션**:
  - (a) normalizeBlog 의 inner 처리 단계에서 entity decode 후 매칭
  - (b) entity-aware 패턴 별도 추가 (`&lt;h[1-6]&gt;` 류)
- prod 모니터링에서 발견 시 우선 처리.

### 7. test(infra): packages/blog-core 의 piiMask.test.ts CI 통합 — 🟡 부분 완료 (PR #161 부수 효과)
- **PR #161 부수 효과로 핵심 부분 해결됨**: next-app `"test"` script glob 에 `../packages/blog-core/src/__tests__/*.test.ts` 추가 → `piiMask.test.ts` (50건) + `leakFilter.test.ts` (52건) 자동 실행 (next-app test job 안).
- **잔여 (선택)**: 별도 `test — blog-core` CI job 신설. 현재는 next-app test job 안에서 함께 돌므로 회귀 감지에는 충분. 워크플로우 분리 가독성만 차이.
- **위험도**: 매우 낮음 (이미 자동 실행 중).

### 8. refactor(blog-core): normalizeBlog 와 leakFilter 패턴 통합 — PR #161 후속
- `normalizeBlog.ts` (양 앱) 의 `LEAK_PATTERNS` 와 `packages/blog-core/src/normalize/leakFilter.ts` 의 `LEAK_PATTERNS` 가 **중복**.
- 패턴 한 곳 관리 → normalizeBlog 가 leakFilter 의 `LEAK_PATTERNS` / `HEADING_LEAK_PATTERNS` 를 import.
- 또는 더 큰 리팩토링: normalizeBlog 의 6a/6b 누수 검사 블록을 `sanitizeLeakInHtml` 호출로 교체.
- **회귀 risk**: 중간 — 양 앱 normalizeBlog 동작 변경. PR #160 의 45-case 회귀 테스트가 즉시 fail-fast 해줌.
- **선결조건**: PR #160 회귀 테스트 인프라가 보장 (확보됨).

---

## 운영 모니터링 권장사항

- 머지 후 며칠간 Vercel 로그에서 다음 키워드 검색:
  - `[normalizeBlog] heading leak detected` — PR #156 헤딩 누수 발견 횟수
  - `[LEAK] 프롬프트 지시문 누수` — PR #154 본문 누수 발견 횟수
  - `[clinical] leak stripped`, `[press] leak stripped`, `[card-news/outline] leak stripped`, `[card-news/text] leak stripped` — PR #161 후처리 발견 횟수
- 발생 빈도가 0 으로 수렴하면 프롬프트 영문화가 효과적임을 확인. 잔존 시 위 후속 PR 우선 진행.
- **PR #157 회고**: PR #154 (5/12) ~ PR #156 (5/12) 머지 후 본문/이미지 누락 사용자 신고가 있었는지 검토 권장. IMG 패턴 false-positive 로 정상 마커가 든 `<p>` / `<h3>` 가 통째로 strip 되어 본문 손실 발생 가능 (PR #157 머지로 차단됨).
- **PR #158/#161 회고**: 임상글·보도자료·카드뉴스 본문에 `[출력 형식]` / `[META]` / `[CRITICAL]` 류 메타 텍스트 노출이 있었는지 검토 권장. PR #158 영문화 + PR #161 후처리 필터로 2단계 방어 완비.
- **PR #160 회고 X**: 회귀 테스트만 추가 — prod 영향 없음. 후속 PR 자동 검증 발판.
