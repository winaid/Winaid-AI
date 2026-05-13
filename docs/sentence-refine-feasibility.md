# 문장 단위 AI 보정 — 타당성 조사 보고서

> 본 문서는 **사전 조사 산출물**. 구현은 별도 PR (UX 결정 후).
> 작성: 2026-05 (PR #203 마크다운 차단과 함께 docs 추가).

## 1. 진단 — 현재 갭

### 1.1 도입부 chip 이상 동작 원인

- 사용자 보고: "도입부 자연스럽게" chip 클릭 → **전체 글이 흔들림**
- 원인: `handleChatRefine` (`public-app/app/(dashboard)/blog/page.tsx:L1718`) 가 `buildChatRefinePrompt` 호출 시 **전체 HTML 입력**
- `buildChatRefinePrompt` (`lib/refinePrompt.ts:L309`) 내부 instruction: `"톤 변경: 전체 글의 어투/분위기를 요청대로 조정"` (L374)
- chip 의도 ("도입부만") vs 실제 동작 (전체) 불일치

### 1.2 정밀도 단계 매트릭스

| 단계 | 범위 | 현재 상태 |
|---|---|---|
| 전체 | 글 전체 HTML | ✅ `handleChatRefine` |
| 섹션 | 한 섹션 (`<h2>~다음 <h2>` 직전) | ✅ `handleSectionRegenerate` |
| **문장** | **한 문장** (인사 한 줄 등) | **❌ 부재** |

→ **인사 한 줄만 정밀 수정하는 기능 부재**가 핵심 갭.

## 2. 왼쪽 + 버튼 (이미지 삽입) 정확 위치

### 2.1 grep 결과

- `이미지 삽입` → `blog/page.tsx:L1520` ("이미지 삽입 후 의료법 재적용") — **별도 문맥, 좌측 + 버튼 아님**
- `contentEditable` → `GenerationResult.tsx:L614` — 결과 영역이 직접 편집 가능 (생각보다 inline 편집 UI 있음)
- `ImageInsertButton` / `InsertImageButton` / `onImageInsert` 같은 명시적 컴포넌트 → **0건**

### 2.2 추정 — 추가 조사 필요

가능성:
- (a) **`GenerationResult.tsx` 안의 dynamic DOM injection** — 단락 hover 시 + 버튼 동적 생성. CSS pseudo-element 또는 React effect 로 mouse over 시 좌측 픽셀 위치에 button 그리기.
- (b) **별도 toolbar 컴포넌트** — 화면 캡처에서만 보이고 코드상 아직 안 잡힘.
- (c) **CSS only** — `:hover` 시 단락 옆에 가상 요소(`::before`).

**본 조사로 미결**. 후속 작업 시 다음 grep 추가 필요:
```bash
grep -rn "Plus\|ButtonAdd\|hover:.*opacity\|onMouseEnter\|::before" public-app/components/GenerationResult.tsx
```

## 3. 한국어 문장 boundary 감지

### 3.1 방법

- **종결어미 + 구두점**: `요\.`, `다\.`, `\?`, `!`
- 종결어미 다양 (CLAUDE.md prose_flow 룰): `합니다 / 이에요 / 인데요 / 거든요 / 입니다`
- regex 예: `/[가-힣\w][다요까]\.\s|[\.\?!]\s/g` (대략)

### 3.2 정확도 추정

- 표준 평서/의문/감탄 문장: **~90%**
- 실패 케이스:
  1. 이모지 끝 ("정말 좋아요 😊")
  2. 따옴표 안 마침표 (`"안녕." 이라고 말했다`)
  3. 약어 (`OO치과.kr` vs `OO치과. 진료`)
  4. 시간/숫자 (`9:00. 정각에`)
  5. 줄임표 (`...`)
  6. URL 안 `.`
  7. HTML 태그 경계 (`<p>...</p>` 사이)
  8. `Dr. Kim` 같은 영문 약어

### 3.3 권장

- **DOM 기반** 우선: `<p>` 또는 `<li>` 노드 = 문장 단위로 처리. regex 보조.
- 또는 **사용자가 클릭한 위치** 기반: range API 로 클릭한 위치 포함 문장만 추출.

## 4. LLM 비용 모델

### 4.1 호출당 토큰 추정 (Gemini Flash Lite)

| 입력 | 토큰 |
|---|---|
| systemInstruction (CLAUDE.md prose + medical_law + category_tone 일부) | ~800 |
| 원본 문장 (50-200자) | ~100 |
| 사용자 요청 ("자연스럽게") | ~30 |
| 컨텍스트 (앞뒤 1-2 문장) | ~200 |
| **입력 합계** | **~1,130** |
| **출력 (수정 문장 50-200자)** | **~150** |

### 4.2 1글당 예상 비용 (Gemini Flash Lite 가정)

| 시나리오 | 호출 수 | 토큰 합계 | 비용 (USD) |
|---|---|---|---|
| 5문장 수정 | 5 | 6,400 | ~$0.001 |
| 10문장 수정 | 10 | 12,800 | ~$0.002 |
| 20문장 수정 | 20 | 25,600 | ~$0.004 |

→ **글당 추가 비용 무시 가능 수준**. 비용은 결정 요인이 아님.

## 5. 도입부 chip 정밀화 옵션 (대안)

신규 기능 없이 기존 `handleChatRefine` + `buildChatRefinePrompt` 만 강화하는 안:

### 5.1 작은 개선

- `buildChatRefinePrompt` 에 **`targetScope: 'all' | 'intro' | 'outro' | 'h2'` 파라미터 추가**
- chip 가 "도입부 자연스럽게" 면 `targetScope='intro'` 전달
- prompt instruction: `"도입부 (<p> 첫 단락) 만 수정. 나머지 본문 무변경 후 그대로 반환"`
- 출력 후 client 가 `<h2>` 이후 부분을 원본으로 대체 (defense-in-depth)

### 5.2 효과

- 신규 UI 0
- chip 의도와 동작 일치
- 문장 단위는 아니지만 **도입부 정밀도는 해결**

→ **작은 개선만으로 사용자가 보고한 문제는 해결 가능**. 신규 기능은 별도 가치 판단.

## 6. UX 옵션 — 트레이드오프

신규 기능 도입 시:

### A. 오른쪽 + 버튼

- 단락 우측에 hover 시 + 버튼 (왼쪽 + 이미지 삽입과 대칭)
- 클릭 → toolbar (자연스럽게 / 짧게 / 길게 / 의료법 강화)
- **장점**: 발견 쉬움, 좌우 시각 균형
- **단점**: 단락 단위라 문장 단위는 아님

### B. Selection toolbar

- 텍스트 선택 시 floating toolbar (browser native style)
- **장점**: 진짜 문장 단위 가능, intuitive
- **단점**: 모바일 어려움, contentEditable 호환성

### C. 우클릭 메뉴

- 우클릭 → context menu (정밀 수정 / 짧게 줄이기 등)
- **장점**: 깔끔
- **단점**: 모바일 미지원, 발견 어려움

### 권장

- **A + selection 보조**: 단락 단위 빠른 보정 + 텍스트 드래그 선택 시에만 selection toolbar 추가. 모바일은 단락 우측 + 만.

## 7. CLAUDE.md / 의료법 / prose / 마크다운 가드 정합

- PR #203 (본 PR) 의 `applyContentFilters` = 의료법 + Unicode normalize + **마크다운 → HTML**
- 신규 문장 단위 LLM 응답도 같은 `applyContentFilters` 통과 시 자동 가드
- CLAUDE.md 의 prose_flow / no_markdown / 카테고리 톤 모두 신규 빌더에 push 하면 정합 유지
- **신규 빌더**는 PR #199-201 5빌더 패턴 따름 (slot 1: persona + PRIORITY + E_E_A_T + COMMON_WRITING_STYLE)

## 8. 권장

### 8.1 단기 (작은 개선 PR)

`buildChatRefinePrompt` 에 `targetScope` 파라미터 추가 → 도입부 chip 의도-동작 일치 (1-2일 작업).

### 8.2 중기 (신규 기능)

UX **옵션 A (오른쪽 + 버튼)** + selection 보조. 작업 분할:

1. `buildSentenceRefinePrompt` 신규 (blog-core, CLAUDE.md 모든 가드 push)
2. `/api/refine/sentence` 신규 라우트 (withApiError 통합)
3. `GenerationResult.tsx` 우측 + 버튼 UI (이미지 삽입 패턴 mirror)
4. selection toolbar 보조 (옵션)
5. 회귀 테스트 + e2e

### 8.3 작업 순서 제안

- **PR 우선**: §8.1 작은 개선 (단기 가치 큼, risk 0)
- **이후 PR**: §8.2 신규 기능 (UX 확정 후)

## 9. 결론

문제는 **handleChatRefine 의 targetScope 부재** 단일 원인.

비용·기술 모두 진입 장벽 낮음. **§5 작은 개선만으로 사용자 보고 문제는 해결되며**, 신규 기능은 추가 가치 영역. 사용자 결정 받고 진행.
