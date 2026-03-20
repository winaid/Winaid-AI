# Release Validation Report — 품질 개선 패치 검증

**검증일**: 2026-03-20
**브랜치**: `claude/technical-cofounder-product-FF7U8`
**검증 방법**: 정적 코드 분석 + 단위/통합 테스트 실행
**제약**: Gemini API 키 미설정 → 실제 생성 실행 불가, 코드 레벨 검증으로 대체

---

## A. 텍스트 안정화 검증

### A-1. Placeholder 노출 방지 — 3중 방어 확인

| 방어 레이어 | 위치 | 메커니즘 | 검증 |
|---|---|---|---|
| L1: 소스 제거 | `blogPipelineService.ts:299-308` | fallback이 `<h3>title</h3>`만 생성 (visible text 없음) | 코드 확인 완료 |
| L2: 빈 섹션 필터링 | `blogPipelineService.ts:465-472` | `stripped.length < 10` → `sectionHtmls[i] = ''` | 코드 확인 완료 |
| L3: 최종 regex strip | `generateContentJob.ts:695-712` | 3개 패턴 regex → 잔존 placeholder 제거 + 빈 `<p>` 정리 | 코드 확인 완료 |

**테스트 결과**: 4/4 통과 (qualityGates.test.ts — placeholder 제거)

**판정**: **PASS** — placeholder 노출 경로가 코드 레벨에서 차단됨

### A-2. 섹션 재시도 로직

| 항목 | 구현 |
|---|---|
| 재시도 함수 | `retrySection()` — 간결 프롬프트 + FLASH + 15s timeout |
| 호출 시점 | `Promise.allSettled` 후 `rejected` 섹션에 대해 1회 호출 |
| 실패 시 | `makeSectionFallback()` → title-only HTML |
| 과반수 실패 | `sectionFailCount > Math.floor(total / 2)` → throw → legacy fallback |

**판정**: **PASS** — 재시도 → fallback → legacy 단계별 방어 구조 확인

### A-3. 아웃라인 보정 (최소 5개 소제목)

| 항목 | 구현 |
|---|---|
| 감지 조건 | `outline.sections.length < 5` |
| 보정 방법 | FLASH + JSON 응답 + 10s timeout으로 부족분 보충 |
| 실패 시 | warn 로그 + 원본 유지 (생성 중단 없음) |

**테스트 결과**: 4/4 통과 (qualityGates.test.ts — 소제목 최소 개수 정책)

**판정**: **PASS**

---

## B. 텍스트 품질 (조건부 PRO) 검증

### Stage C 정책 상수 (contracts.ts)

| 상수 | 값 | 의미 |
|---|---|---|
| `STAGE_C_USE_PRO` | `true` | PRO polish 활성화 |
| `STAGE_C_PRO_MIN_CHARS` | `800` | 800자 미만 → FLASH only |
| `STAGE_C_PRO_TIMEOUT_MS` | `25_000` | PRO 타임아웃 |
| `STAGE_C_FLASH_TIMEOUT_MS` | `15_000` | FLASH 타임아웃 |

### Stage C 실행 경로 (blogPipelineService.ts:509-583)

```
rawTextLength >= 800?
  ├─ YES → PRO(25s) → 성공: flash_draft+pro_polish
  │                  → 실패: FLASH(15s) → 성공: flash_draft+flash_polish
  │                                     → 실패: rawHtml (pre-polish)
  └─ NO  → FLASH(15s) → 성공: flash_draft+flash_polish
                       → 실패: rawHtml (pre-polish)
```

**테스트 결과**: 3/3 통과 (qualityGates.test.ts — 조건부 PRO)

**판정**: **PASS** — 조건부 PRO가 단순 boolean이 아닌 텍스트 길이 기반 전략으로 구현됨

---

## C. 병원 스타일 적용 검증

### 변경 전/후

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| InputForm 초기값 | `useState(false)` | `useState(() => !!localStorage.getItem('hospitalName'))` |
| Pipeline 조건 | `hospitalName && explicit && !learnedStyleId` | `hospitalName && explicit` (learnedStyleId 독립) |

### 코드 경로 (blogPipelineService.ts:51-75)

```typescript
if (request.hospitalName && styleSource === 'explicit_selected_hospital') {
  // 병원 말투 적용 시도 — learnedStyleId와 독립
}
```

**테스트 결과**: 3/3 통과 (qualityGates.test.ts — 병원 스타일 적용 조건)

**판정**: **PASS** — localStorage 기반 복원 + learnedStyleId 독립 적용 확인

---

## D. 이미지 품질 (프롬프트 enrichment) 검증

### 변경 내용 (blogPipelineService.ts:617-636)

```typescript
const sectionSummary = sectionSummaries[i - 1] || '';
const semanticCue = sectionSummary
  .replace(/\(.*?\)/g, '').trim().substring(0, 80);
const enrichedTitle = semanticCue
  ? `${sectionTitle} — ${semanticCue}`
  : sectionTitle;
```

- sub 이미지 프롬프트에 섹션 요약 80자까지 semantic cue 추가
- 확장 이미지(섹션 범위 초과)도 contextCue 60자 활용
- hero는 기존 로직 유지 (topic 기반)

**테스트 결과**: 4/4 통과 (qualityGates.test.ts — 이미지 프롬프트 섹션 맥락 강화)

**판정**: **PASS**

---

## E. 품질 게이트 검증

### 최종 품질 게이트 (generateContentJob.ts:946-965)

| 검사 항목 | 기준 | 동작 |
|---|---|---|
| 소제목 수 | `h3Count < 3` | 경고 로그 |
| 본문 길이 | `textOnly.length < 300` | 경고 로그 |
| Placeholder 잔존 | regex 패턴 매칭 | 경고 로그 |

### 균형 검증 로그 (blogPipelineService.ts:476-502)

| 검사 항목 | 기준 | 동작 |
|---|---|---|
| balance ratio | `min/max < 60%` | `⛔ 심각` 로그 |
| balance ratio | `min/max < 75%` | `⚠️ 경고` 로그 |
| 어미 연속 | 같은 어미 3회+ 연속 | `⚠️ 경고` 로그 |

**전체 테스트**: 466/466 단위/통합 테스트 통과 (E2E 7건은 API 키 미설정으로 제외)
**TypeScript**: 0 errors

**판정**: **PASS** — 모든 게이트가 코드 레벨에서 검증됨

---

## F. 글 균형 분석 (마지막 소제목 비대화 문제)

### 구조적 근본 원인 발견

**핵심 발견: 결론(conclusion)이 마지막 h3 섹션에 구조적으로 흡수된다.**

#### 원인 분석

1. **결론에 h3 태그가 없다**
   - `getPipelineConclusionPrompt` (gpt52-prompts-staged.ts:622-654): "HTML <p> 태그로 출력" 지시
   - 결론은 `<p>` 태그만 생성 → h3 구분자 없음

2. **rawHtml 조립 시 결론이 마지막 섹션 바로 뒤에 붙는다**
   ```typescript
   // blogPipelineService.ts:504
   const rawHtml = `${introHtml}\n${sectionHtmls.join('\n')}\n${conclusionHtml}`;
   ```
   구조: `[intro<p>] [sec1<h3><p>] [sec2<h3><p>] ... [secN<h3><p>] [conclusion<p>]`

   → secN의 `<h3>` 이후에 conclusion `<p>` 태그가 직접 연결됨
   → HTML 구조상 conclusion이 secN의 일부로 보임

3. **parseBlogSections가 결론을 마지막 섹션으로 계산한다**
   ```typescript
   // generateContentJob.ts:1038-1039
   const end = i + 1 < h3Matches.length ? h3Matches[i + 1].index : content.length;
   ```
   마지막 h3의 `end = content.length` → conclusion 텍스트 포함

4. **Stage C polish가 이 구조를 강화할 수 있다**
   - Stage C는 rawHtml 전체를 받아 "구조 유지" 지시를 따름
   - 결론이 마지막 섹션의 일부로 인식되면, polish 시 마지막 섹션이 더 풍부해질 수 있음
   - 특히 "수정이 필요 없는 문장은 원문 그대로 둔다" 규칙으로 인해 결론 부분이 그대로 유지되어 마지막 섹션 글자 수가 부풀려짐

5. **균형 검증 로그는 Stage C 이전에만 작동한다**
   - `blogPipelineService.ts:477`: `sectionLens`는 `sectionHtmls[]` 기반 (결론 제외)
   - 하지만 사용자가 보는 최종 HTML은 Stage C 이후이며, 여기서는 결론이 마지막 섹션에 흡수된 상태

### 예상 불균형 패턴

```
섹션 구조 (rawHtml 기준, Stage C 전):
  sec1: ~250자   sec2: ~280자   sec3: ~260자   sec4: ~270자   sec5: ~250자
  conclusion: ~200자

사용자가 보는 구조 (최종 HTML):
  sec1: ~250자   sec2: ~280자   sec3: ~260자   sec4: ~270자   sec5: ~450자 (250+200)
                                                               ↑ conclusion 흡수
```

- **마지막 섹션 vs median 비율**: ~450 / ~260 ≈ **1.73배** (1.5배 기준 초과)
- **max/min 비율**: ~450 / ~250 = **1.80** (2배 기준 근접)
- **이 패턴은 구조적이므로 3회 중 3회 반복될 가능성이 높다**

### 불균형 판정

| 기준 | 예상 결과 | 판정 |
|---|---|---|
| 마지막 섹션 > median × 1.5 | YES (conclusion 흡수로 ~1.7배) | 불균형 의심 |
| 마지막 섹션 문단 수 +2개 이상 | YES (conclusion 2문단이 추가됨) | 불균형 의심 |
| 가장 긴 = 마지막 & > 가장 짧은 × 2 | 경계 (~1.8배) | 경미 |
| 3회 중 2회+ 반복 | 구조적 원인이므로 100% 반복 | 심각 |

**최종 판정**: **글 균형 문제 잔존 — 구조적 원인 확인됨**

### 가장 가능성 높은 원인 (우선순위)

1. **[확정] conclusion이 h3 없이 마지막 섹션에 흡수** — rawHtml 조립 구조의 근본 문제
2. **[가능] Stage C polish가 흡수된 구조를 강화** — "구조 유지" 지시가 역효과
3. **[미미] 후반 섹션의 prevSummaries 누적** — 더 많은 맥락 → 약간 더 긴 생성 가능

### 최소 수정 제안

**Option A (권장, 최소 변경)**: conclusion에 구분자 마크업 추가

```typescript
// blogPipelineService.ts:504 — rawHtml 조립 시 결론에 시각적 구분 추가
const rawHtml = `${introHtml}\n${sectionHtmls.join('\n')}\n<hr class="conclusion-separator" style="display:none"/>\n${conclusionHtml}`;
```

그리고 `parseBlogSections`에서 결론을 별도 타입으로 분리:
```typescript
// generateContentJob.ts — parseBlogSections 내부
// conclusion separator 이후 텍스트는 마지막 섹션에서 제외
```

**Option B (프롬프트 변경)**: conclusion에 `<h3 class="conclusion-title">마무리</h3>` 추가 지시
- 장점: 구조적으로 완전한 분리
- 단점: 기존 프롬프트 계약 변경, 소제목 수 카운트에 영향

**Option C (polish 프롬프트 강화)**: Stage C에 균형 지시 추가
```
11. 마지막 소제목 섹션이 다른 섹션 대비 1.5배 이상 길면, 초과분을 분리하거나 축약한다
```
- 장점: 코드 변경 최소
- 단점: LLM 의존적, 안정성 보장 어려움

**권장 조합**: Option A + Option C (구조 분리 + polish 가드레일)

---

## 종합 판정

| 영역 | 판정 | 근거 |
|---|---|---|
| A. 텍스트 안정화 | **PASS** | 3중 placeholder 방어, 재시도, 아웃라인 보정 |
| B. 텍스트 품질 (PRO) | **PASS** | 조건부 PRO 800자 기반 전략 |
| C. 병원 스타일 | **PASS** | localStorage 복원 + learnedStyleId 독립 |
| D. 이미지 품질 | **PASS** | 섹션 요약 기반 semantic cue enrichment |
| E. 품질 게이트 | **PASS** | 466/466 테스트 통과, 0 type errors |
| F. 글 균형 | **FAIL** | conclusion 흡수로 인한 구조적 마지막 섹션 비대화 |

### 실행 검증 한계

- Gemini API 키 미설정으로 실제 3회 생성 비교 불가
- 실제 Stage C 전/후 글자 수 변화 측정 불가
- 실제 이미지 생성 결과 확인 불가
- **실제 생성 검증은 API 키 설정 후 별도 수행 필요**

### 다음 단계

1. F번 글 균형 문제에 대해 최소 수정 적용 여부 결정
2. API 키 설정 후 실제 3회 생성 실행 → 런타임 로그 수집
3. 실제 생성 결과로 F번 가설 검증 (conclusion 흡수 비율 측정)
