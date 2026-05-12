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

### 3. chore(blog): normalizeBlog 죽은 패턴 제거 또는 재작성 — dead 확정 (PR #157 실증)
- 패턴 3 — `(<h[1-6]>|<p>|<ul>|<li>|<strong>|<em>)(?=...)` 가 `inner.replace(/<[^>]*>/g, '')` 이후에 적용되어 매칭 불가능 (HTML 태그가 이미 strip 된 텍스트에서 `<h3>` 못 찾음).
- **PR #157 sanity test 중 실증됨**: 초기 raw HTML 매칭 테스트에서는 패턴 3 이 잡아 false positive 가 났지만, 실제 normalizeBlog 동작은 `inner.replace(/<[^>]*>/g, '')` 로 HTML 태그 strip 한 후 text 에 대해 매칭하므로 패턴 3 의 `<h[1-6]>|<p>|...` 부분이 절대 매칭 안 됨이 확인됨. **#3 작업 시 안전하게 (a) 제거 가능 — 회귀 risk 0**.
- **선택지**:
  - (a) 패턴 제거 (실효 0 — 권장)
  - (b) entity-decoded 텍스트 기준 재작성 — 예: `&lt;h3&gt;` 같이 escape 된 형태로 본문에 노출되는 경우 잡기
- **양 앱 영향**: 동일

### 4. test(blog): normalizeBlog leak filter 정식 회귀 테스트 추가
- 현재 sanity test 는 작업 중에만 ad-hoc 으로 돌림 (Bash + node -e)
- 정식 위치 후보:
  - `packages/blog-core/__tests__/leak-filter.test.ts` (양 앱 공유)
  - 또는 `next-app/__tests__/normalizeBlog.test.ts` + `public-app/__tests__/normalizeBlog.test.ts`
- **도구**: vitest 또는 간단 sanity script (CI 추가 비용 X)
- **케이스**:
  - 정상 의료 헤딩/본문 15+ 건 (출장/JSON/META/SECTION/Format-A 등 false-positive 후보 포함 + IMG_1~15 마커)
  - 누수 헤딩/본문 15+ 건 (사용자 보고 케이스, [META, [CRITICAL, h3 태그로 감싸, [IMG_N/X/n/x 등)
- 회귀 발견 시 즉시 fail 되도록
- 실제 normalizeBlog 흐름(HTML strip → 텍스트 매칭) 시뮬레이션 필수

### 5. feat(blog-core): clinical / press / cardNews 출력 정규화 필터 도입 (PR #158 후속)
- 영문화(#2)는 1차 방어. blog 와 달리 normalizeBlog 후처리 필터가 없어 누수 발생 시 자동 strip 되지 않음.
- prod 모니터링에서 누수 발견 시 우선 처리 (현재 발생 빈도 0 예상 — `[META]` / `[CRITICAL]` 영문 라벨로 1차 차단).
- **위치 후보**:
  - `packages/blog-core/src/normalize/` 같은 공통 모듈로 추출 (양 앱 + 다중 콘텐츠 타입 공유)
  - 또는 각 generate route (`/api/generate/clinical`, `/api/generate/press`, `/api/card-news/*`) 에서 후처리 단계 추가
- **위험도**: 낮음 — `[META`/`[CRITICAL`/`마크다운/JSON` 같은 패턴은 정상 의료 콘텐츠에 거의 안 나옴

---

## 운영 모니터링 권장사항

- 머지 후 며칠간 Vercel 로그에서 다음 키워드 검색:
  - `[normalizeBlog] heading leak detected` — PR #156 헤딩 누수 발견 횟수
  - `[LEAK] 프롬프트 지시문 누수` — PR #154 본문 누수 발견 횟수
- 발생 빈도가 0 으로 수렴하면 프롬프트 영문화가 효과적임을 확인. 잔존 시 위 후속 PR 우선 진행.
- **PR #157 회고**: PR #154 (5/12) ~ PR #156 (5/12) 머지 후 본문/이미지 누락 사용자 신고가 있었는지 검토 권장. IMG 패턴 false-positive 로 정상 마커가 든 `<p>` / `<h3>` 가 통째로 strip 되어 본문 손실 발생 가능 (PR #157 머지로 차단됨).
- **PR #158 회고**: 임상글·보도자료 본문에 `[출력 형식]` / `반드시 ... 출력` 류 메타 텍스트 노출이 발생했는지 검토 권장. 영문화로 1차 차단됨 (#5 후처리 필터 없으면 LLM 이 일부 다시 한국어로 paraphrase 할 가능성 — 모니터링 필요).
