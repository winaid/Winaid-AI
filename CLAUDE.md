# CLAUDE.md — 글로벌 작업 룰

이 파일은 Claude Code 가 모든 작업 시 자동 인식하는 프로젝트 글로벌 룰입니다.

---

## 블로그 생성 글쓰기 형식 룰 (회귀 방지)

### ❌ 절대 금지 — 줄바꿈 list 패턴

블로그 본문 출력은 줄글(flowing prose)이어야 합니다. 다음 패턴은 절대 사용 금지:

1. **글머리표·번호·하이픈으로 시작하는 줄바꿈 list**
2. **"조건 — 설명" 대시 list** — 짧은 구문 + em-dash/hyphen/콜론 + 설명 4-5줄 반복
3. **이모지/아이콘으로 항목 시작** — ✅ ❌ 🔥 등
4. **번호 매김 단락** — "1) ... 2) ... 3) ..." 항목 list
5. **HTML `<ul>`/`<ol>` 리스트** — FAQ·비교표·의도적 옵션 나열 외 모두 금지
6. **마크다운 syntax** — 출력은 HTML 만. 다음 패턴 모두 금지:
   - `**bold**` / `__bold__` (강조 — `<strong>` 사용)
   - `*italic*` / `_italic_` (이탤릭 — `<em>` 사용)
   - `# 헤더` / `## 헤더` / `### 헤더` (헤더 — `<h2>` / `<h3>` 사용)
   - `- list` / `* list` / `1. list` (list — prose 권장, 의도 시 `<ul>` / `<ol>`)
   - `[text](url)` (링크 — `<a href>` 사용)
   - `` `code` `` / ` ```block``` ` (코드 — `<code>` / `<pre>` 또는 prose)
   - `> blockquote` (인용 — `<blockquote>` 사용)

   회귀 사례 (2026-05): Sonnet/Opus 응답에 `**볼드**` / `### 소제목` 그대로 노출.
   후처리(`packages/blog-core/src/normalizeMarkdownToHtml.ts`) 가 deterministic 차단하나
   1차 책임은 본 룰 준수.

### 실제 회귀 케이스 (2026-05 프로덕션)

```
1시간 이상 지혈이 안 될 때 — 거즈를 교체해도 선홍색 출혈이 계속된다면 ...
발치 후 3일이 지났는데 통증이 심해질 때 — 드라이소켓(치조골 노출)은 ...
뺨이 점점 더 부어오를 때 — 48시간 이후에도 부기가 줄지 않고 ...
38도 이상 열이 날 때 — 발치 부위 염증이 번진 신호일 수 있으니 ...
```

위는 **`<p>` 한 줄짜리 라벨—설명 fragment 의 연속 나열** = 위장된 리스트. 절대 금지.

### ✅ 권장 패턴 — 줄글 prose

```
대부분의 출혈은 시간이 지나면 자연스럽게 멈추지만 몇 가지 신호는 주의가 필요합니다.
1시간 이상 지혈이 안 되거나 거즈를 바꿔도 선홍색 출혈이 계속되면 혈전이 제대로 형성되지
않은 것이고, 발치 후 3일이 지났는데 오히려 통증이 심해진다면 2~4일차에 자주 나타나는
드라이소켓을 의심해볼 수 있습니다. 또한 뺨 부기가 48시간이 지나도 줄지 않거나 38도
이상의 열이 동반된다면 감염 가능성을 확인해야 하므로, 이런 증상이 겹쳐 나타나면 참지
말고 연락 주세요.
```

핵심:
- 한 단락은 여러 문장의 자연스러운 흐름
- 항목 나열 시 **"또한 / 한편 / 특히 / 다만 / 더불어"** 같은 접속·부사로 연결
- HTML 은 `<p>` 단락만 사용 (FAQ·비교표 외 `<ul>`/`<ol>` 금지)

### 적용 위치 (코드 enforcement)

- **`packages/blog-core/src/blogPrompt.ts:COMMON_WRITING_STYLE`** — 룰 본문
- **4 빌더가 받음** (회귀 방지):
  - `buildSectionFromOutlinePrompt`
  - `buildBlogPromptV3`
  - `buildBlogSectionPromptV3` (섹션 재생성, PR #199)
  - `buildBlogReviewPrompt` (Opus 감수, **PR 본 작업에서 추가**)
- `buildOutlinePrompt` 는 JSON 출력이라 prose 룰 무관 (제외 적절)

### Review 단계 검출

`buildBlogReviewPrompt` 의 `review_criteria` 가 `prose_flow` 위반을 issue 로 발급:
- 위반 시 `applyIssuesPatch` (PR #185) 가 자동 치환 시도
- severity=high — 의료법 위반과 동급 우선순위

### 회귀 가드

- `packages/blog-core/src/__tests__/proseFlowRule.test.ts` — 4 빌더 모두 룰 본문 포함 invariant
- review_criteria 에 `prose_flow` 키 존재 invariant

---

## 작업 컨벤션

### 카테고리 set (drift 0)

콘텐츠 카테고리는 7개로 통일 — `pressPrompt.ts:CATEGORIES`, PR #194-197 record 들 모두 일치:

```
치과 / 피부과 / 성형외과 / 내과 / 정형외과 / 한의원 / 안과
```

신규 카테고리 추가 시 다음 record 모두 갱신 (drift-zero invariant 테스트가 fail-fast):
- `CATEGORY_TONE` (블로그 텍스트)
- `CATEGORY_IMAGE_GUIDES` (블로그 이미지)
- `PRESS_CATEGORY_TONE` (보도자료)
- `CLINICAL_CATEGORY_TONE` (임상글)
- `CATEGORY_DEPTH_GUIDES` / `TERMINOLOGY_GUIDE` / `categoryHints`

### 5빌더 안전망 (PRIORITY_ORDER + E_E_A_T)

블로그 빌더 5개 모두 slot 1 에 PRIORITY_ORDER + E_E_A_T 가이드 포함 (PR #199, PR #200):
- `buildOutlinePrompt`
- `buildSectionFromOutlinePrompt`
- `buildBlogPromptV3`
- `buildBlogSectionPromptV3` (PR #199)
- `buildBlogReviewPrompt` (PR #200, REVIEWER 변형)

### 의료법 normalize (PR #189)

모든 한국어 입력은 `medicalLawNormalize.ts` 통과 후 매칭:
- NFC + zero-width strip + 호모글리프 매핑 + 전각 변환 + 공백 정규화
- validator + filter 양쪽 적용 (양 앱)

---

## 참고 문서

- `docs/handoff-2026-05-07.md` — 인수인계 + 후속 작업 백로그
- `docs/INVARIANTS.md` — 절대 회귀 금지 룰
- `_migration/POST_MERGE_FOLLOWUPS.md` — PR 후속 작업
