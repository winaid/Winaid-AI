# Post-merge 후속 작업

PR 머지 후 별도 PR 로 다룰 항목들. 메모용 — 각 항목은 개별 프롬프트로 진행 예정.

> 다른 파일: GEO/AEO 진단 lib drift 는 `PHASE_B_TODO.md` 참조.

---

## 블로그 누수/이미지 후속 (PR #154 / #155 / #156 후속)

### 1. fix(blog): IMG_N false-positive 패턴 수정
- **현 패턴**: `normalizeBlog.ts` 의 `\[IMG_[NX0-9]` — 정상 마커 `[IMG_1]` ~ `[IMG_9]` 도 매칭 가능성
- **개선안**: `\[IMG_[NXnx](?!\d)` (placeholder 표기 N/X 만 잡고 실제 숫자는 통과)
- **양 앱 영향**: `next-app/app/(dashboard)/blog/normalizeBlog.ts` + `public-app/...` (헤딩 + `<p>` 양쪽 필터)
- **검증**: 정상 `[IMG_1 alt="..."]` ~ `[IMG_9 alt="..."]` 모두 통과 + placeholder `[IMG_N` / `[IMG_X` 차단 sanity test

### 2. fix(prompts): clinical / press / cardNews 한국어 출력 지시 영문화
- 동일 leak 패턴 (한국어 출력 메타 → Gemini 본문화) 가 다른 콘텐츠 타입에도 잠재. blogPrompt 패치(PR #154/#156) 와 동일 처치.
- **수정 위치**:
  - `next-app/lib/clinicalPrompt.ts:186` (대략) — 출력 포맷 지시
  - `next-app/lib/pressPrompt.ts:176` (대략) — 출력 포맷 지시
  - `next-app/lib/cardNewsPrompt.ts:328, 461` (대략) — 출력 포맷 지시
- **패턴**: `[META: instructions for the model — do NOT copy any of this into the generated content.]` 라벨 + 영문 + "Do NOT echo" 명시
- 본문 가이드/예시 한국어 유지 (출력 언어는 한국어)
- public-app 에 동일 파일 있는지 확인 후 양 앱 동기화

### 3. chore(blog): normalizeBlog 죽은 패턴 제거 또는 재작성
- 패턴 3 — `(<h[1-6]>|<p>|<ul>|<li>|<strong>|<em>)(?=...)` 가 `inner.replace(/<[^>]*>/g, '')` 이후에 적용되어 매칭 불가능 (HTML 태그가 이미 strip 된 텍스트에서 `<h3>` 못 찾음)
- **선택지**:
  - (a) 패턴 제거 (실효 0)
  - (b) entity-decoded 텍스트 기준 재작성 — 예: `&lt;h3&gt;` 같이 escape 된 형태로 본문에 노출되는 경우 잡기
- **양 앱 영향**: 동일

### 4. test(blog): normalizeBlog leak filter 정식 회귀 테스트 추가
- 현재 sanity test 는 작업 중에만 ad-hoc 으로 돌림 (Bash + node -e)
- 정식 위치 후보:
  - `packages/blog-core/__tests__/leak-filter.test.ts` (양 앱 공유)
  - 또는 `next-app/__tests__/normalizeBlog.test.ts` + `public-app/__tests__/normalizeBlog.test.ts`
- **도구**: vitest 또는 간단 sanity script (CI 추가 비용 X)
- **케이스**:
  - 정상 의료 헤딩/본문 15+ 건 (출장/JSON/META/SECTION/Format-A 등 false-positive 후보 포함)
  - 누수 헤딩/본문 15+ 건 (사용자 보고 케이스, [META, [CRITICAL, h3 태그로 감싸 등)
- 회귀 발견 시 즉시 fail 되도록

---

## 운영 모니터링 권장사항

- 머지 후 며칠간 Vercel 로그에서 다음 키워드 검색:
  - `[normalizeBlog] heading leak detected` — PR #156 헤딩 누수 발견 횟수
  - `[LEAK] 프롬프트 지시문 누수` — PR #154 본문 누수 발견 횟수
- 발생 빈도가 0 으로 수렴하면 프롬프트 영문화가 효과적임을 확인. 잔존 시 위 후속 PR 우선 진행.
