# Post-merge 후속 작업

PR 머지 후 별도 PR 로 다룰 항목들. 메모용 — 각 항목은 개별 프롬프트로 진행 예정.

> 다른 파일: GEO/AEO 진단 lib drift 는 `PHASE_B_TODO.md` 참조.

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
- **한계**: 영문화는 1차 방어. 후처리 필터는 없음 → #5 참고.

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

### 5. feat(blog-core): clinical / press / cardNews 출력 정규화 필터 도입 (PR #158 후속)
- 영문화(#2)는 1차 방어. blog 와 달리 normalizeBlog 후처리 필터가 없어 누수 발생 시 자동 strip 되지 않음.
- prod 모니터링에서 누수 발견 시 우선 처리 (현재 발생 빈도 0 예상 — `[META]` / `[CRITICAL]` 영문 라벨로 1차 차단).
- **위치 후보**:
  - `packages/blog-core/src/normalize/` 같은 공통 모듈로 추출 (양 앱 + 다중 콘텐츠 타입 공유)
  - 또는 각 generate route (`/api/generate/clinical`, `/api/generate/press`, `/api/card-news/*`) 에서 후처리 단계 추가
- **위험도**: 낮음 — `[META`/`[CRITICAL`/`마크다운/JSON` 같은 패턴은 정상 의료 콘텐츠에 거의 안 나옴

### 6. feat(blog): entity-encoded HTML leak 차단 (`&lt;h3&gt; 태그를 감싸` 류) — PR #159 진단 중 발견
- 현재 어떤 누수 패턴도 entity-encoded HTML 을 잡지 못함.
- **PR #159 edge case 실증**: `<p>설명: &lt;h3&gt; 태그를 감싸 사용합니다.</p>` 가 stripped text `"설명: &lt;h3&gt; 태그를 감싸 사용합니다."` 로 변환됨. 어떤 패턴도 매칭 안 됨.
- 발생 빈도 극히 낮으나 LLM 이 system prompt 의 HTML 지시문을 escape 형태로 본문화할 수 있음.
- **처리 옵션**:
  - (a) normalizeBlog 의 inner 처리 단계에서 entity decode 후 매칭
  - (b) entity-aware 패턴 별도 추가 (`&lt;h[1-6]&gt;` 류)
- prod 모니터링에서 발견 시 우선 처리.

### 7. test(infra): packages/blog-core 의 piiMask.test.ts CI 통합 — PR #160 후속
- `packages/blog-core/src/__tests__/piiMask.test.ts` 가 존재하지만 자동 실행 X (별도 워크스페이스, test runner 미설정).
- `next-app/__tests__/safeUtils.test.ts` 는 PR #160 부수 효과로 자동 실행 중 (next-app 의 `for f in __tests__/*.test.ts` 글로브가 잡음).
- **작업**:
  - `packages/blog-core/package.json` 에 `tsx` + `"test"` script 추가
  - 또는 monorepo root 차원의 통합 test runner 검토
  - `.github/workflows/ci.yml` 에 새 job `test — blog-core` 추가
- **위험도**: 매우 낮음 (테스트 파일 자체는 이미 작성됨, 실행 환경만 추가)

---

## 운영 모니터링 권장사항

- 머지 후 며칠간 Vercel 로그에서 다음 키워드 검색:
  - `[normalizeBlog] heading leak detected` — PR #156 헤딩 누수 발견 횟수
  - `[LEAK] 프롬프트 지시문 누수` — PR #154 본문 누수 발견 횟수
- 발생 빈도가 0 으로 수렴하면 프롬프트 영문화가 효과적임을 확인. 잔존 시 위 후속 PR 우선 진행.
- **PR #157 회고**: PR #154 (5/12) ~ PR #156 (5/12) 머지 후 본문/이미지 누락 사용자 신고가 있었는지 검토 권장. IMG 패턴 false-positive 로 정상 마커가 든 `<p>` / `<h3>` 가 통째로 strip 되어 본문 손실 발생 가능 (PR #157 머지로 차단됨).
- **PR #158 회고**: 임상글·보도자료 본문에 `[출력 형식]` / `반드시 ... 출력` 류 메타 텍스트 노출이 발생했는지 검토 권장. 영문화로 1차 차단됨 (#5 후처리 필터 없으면 LLM 이 일부 다시 한국어로 paraphrase 할 가능성 — 모니터링 필요).
- **PR #160 회고 X**: 회귀 테스트만 추가 — prod 영향 없음. 후속 PR 자동 검증 발판.
