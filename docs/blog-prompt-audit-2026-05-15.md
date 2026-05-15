# 블로그 프롬프트 종합 감사 — 2026-05-15

> 본 감사는 **read-only sweep** 입니다. 코드를 수정하지 않고 발견만 보고합니다.
> 모든 권고는 `docs/code-review-2026-05-15.md` 기준선 다음 단계의 **별도 PR 후보** 로
> 분리되어 본 doc 안에서만 권고됩니다 (룰 본문·코드 직접 변경 0).
> 기준 commit: main HEAD `51f7ad1` (2026-05-15).

---

## Scope

### 실제로 읽은 경로
- `CLAUDE.md`, `docs/code-review-2026-05-15.md`, `_migration/POST_MERGE_FOLLOWUPS.md`
- `packages/blog-core/src/blogPrompt.ts` 전수 — 5빌더 위치 grep + 핵심 영역 (Part A 1-450, E_E_A_T 영역 440-680, COMMON_WRITING_STYLE 949-1064, BLOG_EXAMPLES 1066-1140, PRIORITY_ORDER 1141-1156, SELF_CHECK 1157-1176, SEASONAL 1178-1210, MEDICAL_LAW_CONSTRAINTS 1216-1239, BLOG_PERSONA 1246-1622, OUTLINE/SECTION/REVIEWER/SECTION_REGEN_PERSONA 1625-1898, builders 2460-3078)
- `packages/blog-core/src/medicalLawFilter.ts` (291 lines)
- `packages/blog-core/src/medicalLawRules.ts` (96 lines)
- `packages/blog-core/src/medicalLawNormalize.ts` (68 lines)
- `packages/blog-core/src/normalizeMarkdownToHtml.ts` (102 lines)
- `packages/blog-core/src/koreanGrammarFilter.ts` (111 lines)
- `packages/blog-core/src/promptLeakageGuard.ts` (217 lines)
- `packages/blog-core/src/promptInjectionGuard.ts` (196 lines)
- `packages/blog-core/src/promptSanitize.ts` (160 lines)
- `packages/blog-core/src/pressCategoryTone.ts` (108 lines) — drift-zero 비교용
- `packages/blog-core/src/clinicalCategoryTone.ts` (117 lines) — drift-zero 비교용 (헤더만)
- `next-app/lib/pressPrompt.ts`, `public-app/lib/pressPrompt.ts` — 존재 확인 (drift-zero invariant 대상)
- `next-app/lib/clinicalPrompt.ts`, `public-app/lib/clinicalPrompt.ts` — 존재 확인
- `next-app/lib/sanitize.ts`, `next-app/lib/sanitizeHtml.ts`, `public-app/lib/sanitize.ts` — issuesPatch sanitize wrapper

### 미검토 / 가정으로 둔 영역
- `packages/blog-core/src/__tests__/` 의 invariant 테스트는 **존재 가정**. proseFlowRule / contentCategoryDriftZero / 5빌더 PRIORITY_ORDER+E_E_A_T 가드의 동작은 `docs/code-review-2026-05-15.md` 의 R-1~R-5 PASS 결과로 정합 추정.
- `pressPrompt.ts`·`clinicalPrompt.ts` 본문 (블로그와 register 다른 인접 빌더) — 본 감사 scope 는 블로그 한정. 카테고리 set 정합 (`PRESS_CATEGORY_TONE` 7개) 만 확인.
- `next-app`·`public-app` 의 `applyIssuesPatch` 호출부 — issues patch sanitize 체인은 PR #214 머지된 invariant 테스트 (handoff 인용) 로 정합 추정.
- 카드뉴스·보도자료 프롬프트의 의료광고법 룰 — 본 감사 범위 외.

### 검증 환경 제약
- `node_modules` 미설치 → 테스트 실행 불가. invariant 는 **파일 정적 분석**으로 PASS/FAIL 판정.
- 의료광고법 시행령 본문은 외부 fetch 불가 환경이라 룰 본문의 키워드를 근거로 추론. 법 조문 인용은 일반 통용 표현 사용 (예: "의료법 제56조"), 정확한 항·호 인용이 필요한 finding 은 "조문 확인 필요" 플래그.

---

## Executive Summary

| 영역 | Critical | High | Medium | Low |
|---|---|---|---|---|
| 축 1. 의료광고법 준수 | 0 | 2 | 4 | 2 |
| 축 2. 생성 품질 | 0 | 1 | 2 | 2 |
| 축 3. 할루시네이션 방지 | 0 | 1 | 3 | 1 |
| 축 4. 프롬프트 인젝션 저항 | 0 | 1 | 2 | 1 |
| 축 5. 빌더 간 일관성 | 0 | 1 | 2 | 1 |
| **합계** | **0** | **6** | **13** | **7** |

핵심 메시지: **회귀 가드 (R-1~R-5) 는 모두 건강** (`docs/code-review-2026-05-15.md` 확인). 본 감사는 그 다음 단계의 _보강 권고_ 만 식별. Critical 0건 = 즉시 운영 사고 risk 0. High 6건은 모두 의료광고법 잠재 위반·할루시네이션·인젝션의 **방어 깊이 보강** 차원이며, 현재 시점에서는 다중 layer (룰 + 후처리 + 감수) 의 다른 layer 가 대부분 커버. 따라서 본 감사는 _즉시 PR 강제_ 가 아닌, _다음 라운드 진입 시 우선순위 백로그_ 로 위치.

### Top 3 즉시 보강 권고
1. **할루시네이션 가상 시술명** (축 3.B) — "최신 OO 기법", "혁신적 OO 시술" 류 LLM 생성 가상 시술명 차단 룰 부재. natural_compliance 의 일반 단정 회피 만으로는 약함. E-E-A-T anti-pattern 에 패턴 추가 권고.
2. **금지 단일 토큰 누락** (축 1.A) — `MEDICAL_LAW_CONSTRAINTS` 본문에 "단번에", "즉시", "절대", "제일" 단일 토큰 명시 부재. `medicalLawFilter` regex 는 일부 다루나 (예: "단번에 해결" 은 CATEGORY_TONE.정형외과.avoid 에만), 본문 룰의 prohibited list 자체가 보강 필요. 본 항목은 보건복지부 심의 가이드라인 빈출 표현.
3. **본인부담금/할인 게이트** (축 1.B) — "본인부담금 0원", "비급여 진료비 할인·면제" 패턴이 룰·필터 모두 명시 부재. constraints 본문은 "가격/할인/이벤트" 일반 카테고리만 언급 (line 1226). 보건복지부 의료광고 심의기준에서 **가장 빈출되는 위반 유형 중 하나**.

---

## 축 1. 의료광고법 준수

### A. 명시적 금지 표현

#### [High] 1.A.1 단일 토큰 누락 — "단번에 / 즉시 / 절대 / 제일"
- 위치: `packages/blog-core/src/blogPrompt.ts:1216-1239` (`MEDICAL_LAW_CONSTRAINTS`); `packages/blog-core/src/medicalLawFilter.ts:13-127` (`MEDICAL_LAW_REPLACEMENTS`)
- 현재 룰: `<prohibited>` 블록 (line 1221) 에 "최고", "최초", "100%", "극대화", "완벽", "독보적", "혁신적" 등이 있으나, **"단번에" "즉시" "절대" "제일"** 단일 토큰은 없음. `CATEGORY_TONE.정형외과.avoid` (line 345) 에 "단번에 해결" 결합 표현만 존재. filter 는 "단번에" 자체를 매칭하는 regex 없음.
- 빠진 가드: 보건복지부 심의 가이드라인 빈출 표현. 단일 토큰이 prohibited 본문에서 빠지면 LLM 이 자체 생성·결합 변형 (예: "단번에 회복", "절대 안전") 을 자연스럽게 출력할 수 있음.
- 권고 룰 문구 (`MEDICAL_LAW_CONSTRAINTS.<prohibited>` 마지막 라인에 추가):
  > 단일 부사 단정도 금기. "단번에", "즉시", "절대", "제일", "곧바로" 같은 시간·정도 단정 부사는 의료 행위 효과 단정으로 해석됩니다. 자연 대체는 "비교적 빠르게", "보통의 경우", "대부분의 경우" 같은 범위 표현.

#### [Medium] 1.A.2 "안전한" / "고통 없는" 결합 패턴
- 위치: `blogPrompt.ts:1225` (`<prohibited>`); `medicalLawFilter.ts:54-56` (filter)
- 현재 룰: "부작용 없는", "무통", "부작용 제로" 명시. "통증 없는" 은 filter (line 55) 에는 있지만 constraints 룰 본문에는 직접 키워드 부재. **"안전한 (무조건적 단정)"** 표현·**"고통 없는"** 변형도 룰·필터 모두 미명시.
- 빠진 가드: "안전한 시술", "고통 없는 치료" 같은 단정형은 의료법 56조 해석상 효과·안전성 보장 광고에 해당. filter 가 빈 곳을 채우지 못함.
- 권고 룰 문구 (`<prohibited>` 마지막):
  > 안전·고통 단정도 금기. "안전한 시술" "고통 없는 치료" "위험 없는" 같은 단정형은 의료법상 효과 보장에 해당하니, "비교적 부담이 적은", "환자 부담을 줄인" 같은 범위 표현으로 풉니다.

### B. 환자 유인 금지

#### [High] 1.B.1 본인부담금·할인·면제 패턴 부재
- 위치: `blogPrompt.ts:1226` (`<prohibited>`); 필터 전체.
- 현재 룰: "가격/할인/이벤트" 일반 카테고리만 명시 (line 1226). 구체 표현 — **"본인부담금 0원"**, **"본인부담금 면제"**, **"비급여 할인"**, **"이벤트가"**, **"한정 특가"** 등 — 명시 부재. medicalLawFilter 의 inducement 섹션 (line 107-119) 은 "예약하세요" 류 동작 유도만 다루고 비용 면제 표현 미커버.
- 빠진 가드: 보건복지부 의료광고 심의기준 위반 빈도 1위 영역 중 하나 (의료법 제27조 제3항 환자 유인 행위 + 시행령 23조 비교 광고와 결합 빈출).
- 권고 룰 문구 (`<prohibited>` 에 추가):
  > 비용 면제·할인 유인 금기. "본인부담금 0원", "비급여 진료비 할인", "할인 이벤트", "한정 특가", "OO명 한정", "선착순" 같은 표현은 의료법 제27조 환자 유인 행위로 해석됩니다. 비용 범위가 필요하면 "건강보험 적용 범위 안에서 결정", "상담 후 안내" 같은 정중한 안내만.

#### [Medium] 1.B.2 후기·체험담은 잘 막혀 있음 — 회귀 가드 만족
- 위치: `blogPrompt.ts:510-511` (`E_E_A_T_anti_patterns`); `blogPrompt.ts:1450-1451` (`<patient_narrative>` bad examples); `blogPrompt.ts:1226` (`<prohibited>`); REVIEWER_PERSONA checklist 5 (line 1804).
- 현재 룰: "체험기/추천사", "환자 후기 직접 인용", "OO 환자는 ~ 통증이 사라졌다고 말씀하셨어요" 류 패턴이 **3개 layer 에서 중복 명시**. 강하게 가드됨.
- 발견 없음 — 본 sub-axis 는 가드 충분. 본 항목은 _gap 없음_ 으로 기록 (위 1.B.1 과의 대비를 위해 명시).

### C. 비교 광고 금지

#### [Low] 1.C.1 가드 충분 — 다중 layer
- 위치: `blogPrompt.ts:1223` (constraints); `medicalLawFilter.ts:121-126` (filter); `blogPrompt.ts:1376-1380` (`<natural_compliance>` "다른 시술과의 비교 절대 금지"); `blogPrompt.ts:512` (E_E_A_T anti-pattern); REVIEWER_PERSONA verdict_rules "대안 비교 평가 면제" (line 1853-1855).
- 현재 룰: 비교 광고 차단이 **5개 layer 에서 일관**: constraints → natural_compliance → E_E_A_T → REVIEWER 면제 → filter regex. 같은 시술 변형 비교만 허용 (의도된 정책).
- 발견 없음.

### D. 미평가 / 신의료기술 광고 제한

#### [High] 1.D.1 신의료기술·식약처 미허가 패턴 부재
- 위치: 룰 본문 전체.
- 현재 룰: "신의료기술", "식약처 미허가", "임상 효과 미평가" 키워드 명시적 부재. E_E_A_T_GUIDE expertise (line 459) 가 "해외 가이드라인 인용 금지. 국내 기준만" 으로 일부 커버하나, **국내 미허가 시술 광고** 영역은 빈 곳.
- 빠진 가드: 의료법 제56조 제2항 — "신의료기술평가에 관한 규칙" 에 따른 신의료기술 평가를 받지 않은 의료기술의 광고 금지. LLM 이 "최근 도입된 OO 기법" 같은 표현으로 미평가 신기술을 광고할 수 있음.
- 권고 룰 문구 (`<prohibited>` 에 추가):
  > 미평가 신의료기술 광고 금지. "최근 도입된 신기술", "국내 최초 도입", "식약처 평가 진행 중" 같은 표현은 신의료기술평가 통과 여부가 불명확한 시술을 광고하는 의료법 제56조 제2항 위반에 해당할 수 있습니다. 시술명은 일반적으로 통용되는 명칭만 사용하고, "최근" 같은 시점 표현은 평가 완료된 시술에 한정합니다. (조문 확인 필요)

### E. 시술 효과 오인 표현

#### [Medium] 1.E.1 시술 효과 직접 단정 — "젊어진다 / 예뻐진다" 패턴 부재
- 위치: 룰 본문 전체.
- 현재 룰: BLOG_PERSONA `<natural_compliance>` (line 1364-1380) 가 일반 단정 회피를 강조하나, "**젊어진다**", "**예뻐진다**", "**날씬해진다**" 같은 시술 효과 직접 단정 키워드는 명시 부재. CATEGORY_TONE.피부과·성형외과 의 avoid 도 "완벽한 피부", "완벽한 결과" 결합형만 다루고 단일 단정 동사 미명시.
- 빠진 가드: 의료법 시행령 제23조 — 시술 전후 사진의 효과 비교 광고 금지의 텍스트 변형. LLM 이 "이 시술을 받으면 5살 어려 보입니다" 같은 효과 단정 가능.
- 권고 룰 문구 (`<natural_compliance>` 의 단일 사례 list 마지막 또는 `MEDICAL_LAW_CONSTRAINTS.<prohibited>` 에 추가):
  > 시술 효과 직접 단정 금기. "젊어집니다", "예뻐집니다", "날씬해집니다", "탱탱해집니다", "리프팅됩니다" 같은 결과 단정 동사는 의료법 시행령 제23조의 효과 오인 광고로 해석됩니다. "변화를 경험하실 수 있어요", "개선을 기대해볼 수 있습니다" 같은 가능성·범위 표현으로 자연스럽게 풉니다.

#### [Low] 1.E.2 전후 사진 — 가드 충분
- 위치: `blogPrompt.ts:511` (E_E_A_T anti-pattern: "시술 전후 사진"); `blogPrompt.ts:1226` (constraints "체험담/전후 사진"); REVIEWER_PERSONA checklist 5.
- 발견 없음 — 마크업 차원의 차단은 본문에 잘 적혀 있음.

### F. 학력 / 경력 오인

#### [Medium] 1.F.1 학력 + 최상급 결합 금지 명시 부재
- 위치: `blogPrompt.ts:517-528` (`<korean_authority_signals>` 허용 패턴); 같은 블록 line 530-535 (금지 패턴).
- 현재 룰: 권위 신호의 허용·금지 패턴이 잘 분리돼 있음. 학력 인용 ("개원 N년 경험을 바탕으로", "해당 진료과 전문의 자격을 갖춘") 은 허용. 그러나 **학력 + 최상급 결합** (예: "서울대 출신 최고의 전문의", "하버드 의대 출신 단연 최고") 패턴 명시 부재.
- 빠진 가드: 의료법상 학력은 사실 적시 가능하나, 최상급 결합 시 광고로 변질. 본 결합은 보건소 민원 빈출.
- 권고 룰 문구 (`<korean_authority_signals>` 금지 패턴 마지막에 추가):
  > 학력·경력 + 최상급 결합 금기. "OO대학 출신 최고의 전문의", "박사 학위 보유 가장 신뢰받는" 같이 학력·경력 사실 위에 최상급 표현을 얹는 패턴은 의료법상 광고로 해석됩니다. 학력·경력은 사실만 명시 ("대표원장 OOO 정형외과 전문의") 하고, 최상급은 별도 표현으로도 쓰지 않습니다.

### G. 자체 학회 / 인증 광고

#### [Medium] 1.G.1 자체 수여 자격증 강조 패턴 부재
- 위치: `blogPrompt.ts:534` (`<korean_authority_signals>` 금지: "학회·협회명 조작").
- 현재 룰: "대한OO협회 공식 인증" 같은 조작 패턴은 차단. 그러나 **"자체 수여 자격증"**, **"본원 자체 인증"**, **"OO원장이 직접 개발한 OO 시술법"** 같은 자체 인증 강조 패턴 명시 부재.
- 빠진 가드: 공식 학회·기관 인증이 아닌 자체 수여 자격을 마치 공식 인증처럼 강조하면 의료법 광고 심의 위반.
- 권고 룰 문구 (`<korean_authority_signals>` 금지 패턴 마지막):
  > 자체 인증·자체 수여 자격증 강조 금기. "본원 자체 인증", "OO원장이 직접 개발한 시술법", "당원만의 특별 프로토콜" 같은 자체 수여 자격이나 자체 개발 시술법을 공식 인증처럼 강조하는 표현은 의료법 광고 심의 위반에 해당합니다. 공식 학회·정부 기관 인증만 사실 그대로 인용합니다.

### H. 의료기관 평가 결과 오인

#### [Low] 1.H.1 "1위 / No.1 / 넘버원" 가드 충분
- 위치: `medicalLawFilter.ts:88-92` (regex 치환); `blogPrompt.ts:508` (E_E_A_T anti-pattern: "1위").
- 현재 룰: "1위", "No.1", "넘버원", "넘버 1" 모두 자동 치환. lookahead/lookbehind 로 "11위" / "21위" 같은 false-positive 차단. 가드 충분.
- 발견 없음.

#### [Medium] 1.H.2 미평가 분야 인증 표현 패턴 부재
- 위치: 룰 본문 전체.
- 현재 룰: 의료기관 평가 미실시 분야의 인증 표현 (예: "보건복지부 인증 OO 우수 의료기관" 류 — 해당 분야 평가 자체가 없음에도 인증 인용) 명시 부재.
- 빠진 가드: 의료법 제58조 (의료기관 인증) 의 미평가 분야 인증 인용 금지.
- 권고 룰 문구 (`<prohibited>` 또는 `<korean_authority_signals>` 금지 패턴에 추가):
  > 의료기관 평가 미실시 분야의 인증 표현 금기. "보건복지부 인증 OO 우수 의료기관", "OO 분야 인증 받은" 같은 표현은 해당 분야 평가 자체가 시행되지 않은 경우 의료법 제58조 위반에 해당합니다. 의료기관 인증은 보건복지부·의료기관평가인증원 명의의 공식 인증서가 있는 분야에 한해 사실 그대로만 인용합니다. (조문 확인 필요)

---

## 축 2. 생성 품질

### A. PRIORITY_ORDER + E-E-A-T 적용

#### [Medium] 2.A.1 REVIEWER 빌더에 `PRIORITY_ORDER_BLOCK` 직접 주입 없음
- 위치: `blogPrompt.ts:2981-2987` (`buildBlogReviewPrompt` slot 1).
- 현재 슬롯 1 텍스트: `[REVIEWER_PERSONA, REVIEWER_E_E_A_T_GUIDE, COMMON_WRITING_STYLE].join(SEP)`. `PRIORITY_ORDER_BLOCK` 미포함.
- 다른 4빌더는 모두 `PRIORITY_ORDER_BLOCK` 직접 포함 (line 2475 / 2554 / 2735 / 2895).
- 빠진 가드: REVIEWER_PERSONA `<verdict_rules>` (1826-1861) 가 자체 우선순위 ("의료법 절대 우선 + 퀄리티 균형") 를 명시하므로 운영상 영향 없을 수 있으나, CLAUDE.md "5빌더 안전망 (PRIORITY_ORDER + E_E_A_T)" 표기와 **표면상 drift**. invariant 테스트 (`fivebuildersPriorityOrderEEAT.test.ts` 등) 가 REVIEWER 슬롯 1 의 `PRIORITY_ORDER` 문자열 substring 을 검사하는지 확인 필요 — REVIEWER_PERSONA `<verdict_rules>` 안에 "우선" 같은 문자열은 있지만 `priority_order` 라는 정확한 키는 없음.
- 권고: 5빌더 invariant 가 REVIEWER 에 대해 어떤 substring 을 검사하는지 테스트 파일 명시화. 만약 invariant 가 `priority_order` literal 을 요구하면, REVIEWER 슬롯 1 에도 `PRIORITY_ORDER_BLOCK` 추가가 정합. 만약 `REVIEWER_PERSONA.verdict_rules` 안의 "의료법 절대 우선" 문구만으로 충족하도록 설계됐다면, CLAUDE.md 의 "5빌더 안전망" 항목에 _REVIEWER 는 verdict_rules 가 PRIORITY 역할 대체_ 라는 단서 명시 권고.

### B. prose-flow 룰 적용

#### [Low] 2.B.1 가드 충분 — 4빌더 + REVIEWER review_criteria 양방향
- 위치: `blogPrompt.ts:992-1024` (`COMMON_WRITING_STYLE.<paragraph>`); `blogPrompt.ts:3020-3023` (REVIEWER review_criteria 항목 6 `prose_flow`).
- 현재 룰: 2026-05 회귀 케이스 4-5줄 라벨-대시 list 가 룰 본문에 그대로 인용 (line 1001-1006, CLAUDE.md 와 일치). 풀어쓰기 예시도 ✅. REVIEWER review_criteria 가 발견 시 issue 발급 + `applyIssuesPatch` 가 자동 치환 시도.
- 발견 없음.

### C. 카테고리 7종 tone 일관성

#### [Low] 2.C.1 외과적 vs 내과적 톤 차이 적절
- 위치: `blogPrompt.ts:319-383` (`CATEGORY_TONE`).
- 평가: 치과 ("담담·차분") · 피부과 ("깔끔·세련") · 성형외과 ("세련·절제") = 외과적/시술 중심 톤. 정형외과 ("신뢰·침착") · 한의원 ("편안·따뜻") · 안과 ("정확·안심") · 내과 ("신뢰·차분") = 진료·관리 중심 톤. 진료과 register 가 자연스럽게 분리됨.
- 발견 없음.

### D. 길이 / 구조 가이드

#### [Medium] 2.D.1 FAQ 시작 조건의 조건문 OR 결합 — 의도 불명확 위험
- 위치: `blogPrompt.ts:1527-1532` (`<faq_instructions>`); `blogPrompt.ts:643` (`FAQ_SECTION_GUIDE`); `blogPrompt.ts:2851-2860` (`buildBlogPromptV3` FAQ wiring); `blogPrompt.ts:2074` (`buildUserInputBlock` `<include_faq>`).
- 현재 룰: `<faq_instructions>` 가 "include_faq 가 true **또는** 글 길이 1500자 이상이면 FAQ 필수" 로 명시. 그러나 `buildBlogPromptV3` (line 2851) 는 `if (req.includeFaq)` 만 분기 — **textLength >= 1500 자동 FAQ 트리거 미반영**. 모델이 룰 본문은 받지만 user_input 의 `<include_faq>false</include_faq>` 와 모순될 때 어떻게 행동할지 모호. 실제로는 모델이 룰을 따라 textLength 기반 자동 FAQ 추가 가능 → 의도와 다른 분량 초과.
- 빠진 가드: 룰 본문과 빌더 분기의 OR 조건 정합.
- 권고: 룰 본문에서 `<faq_instructions>` 의 OR 조건을 "include_faq 가 true 일 때만 FAQ 포함, 길이 자동 트리거 없음" 으로 명확화하거나, 빌더 분기에서 `req.includeFaq || (req.textLength ?? 0) >= 1500` 으로 정합. 양 측 동기화 필요.

### E. 한국어 비문 방지

#### [High] 2.E.1 형용사 어간 list 와 룰 본문 사례 drift
- 위치: `koreanGrammarFilter.ts:29-32` (`ADJECTIVE_STEMS`); `blogPrompt.ts:1028-1029` (`<korean_grammar>` rule body).
- 현재 룰: `<korean_grammar>` 본문은 7개 사례 만 인용 — "필요하는 / 중요하는 / 안전하는 / 건강하는 / 가능하는 / 충분하는 / 정확하는". `ADJECTIVE_STEMS` 는 **15개** — 위 7개 + "확실, 깨끗, 복잡, 단순, 편안, 신선, 소중, 특별". 룰 본문 인용 사례가 filter 패턴의 **절반 미만**.
- 빠진 가드: LLM 은 룰 본문 사례를 더 강하게 학습. 룰에 "확실하는" 같은 사례가 없으면 생성 단계에서 "확실하는 진단" 같은 비문을 자연 생성 → filter 가 후처리에서만 잡음 → 의미 미세 손상 risk (특히 "확실한 → 체계적인" 같은 의미 시프트 치환).
- 권고 룰 문구 (`<korean_grammar>` 의 ❌ 사례 line 에 추가):
  > 형용사 동사 활용 오류 — 위 7개 외에도 자주 발견되는 사례: "확실하는 / 깨끗하는 / 복잡하는 / 단순하는 / 편안하는 / 신선하는 / 소중하는 / 특별하는" 도 동일하게 비문이며, 모두 관형형 "확실한 / 깨끗한 / 복잡한 / 단순한 / 편안한 / 신선한 / 소중한 / 특별한" 으로 씁니다.

---

## 축 3. 할루시네이션 방지

### A. 구체 수치 / 통계

#### [Low] 3.A.1 가드 다중 layer — 충분
- 위치: `blogPrompt.ts:1400-1401` (`<hook_patterns>` 통계형 주의); `blogPrompt.ts:506-512` (`<e_e_a_t_anti_patterns>`); `blogPrompt.ts:531-533` (`<korean_authority_signals>` 금지 패턴); REVIEWER checklist 9 (line 1805); `blogPrompt.ts:2186-2200` (`buildNoReferenceWarningBlock`); `blogPrompt.ts:2167-2182` (`buildReferenceBlock` usage_rules).
- 평가: 구체 수치 단정 차단이 **6개 layer 에서 중복 명시**. referenceFacts 유무에 따라 분기 (`buildReferenceBlock` vs `buildNoReferenceWarningBlock`) 까지 가드. 강함.
- 발견 없음.

### B. 약품 / 시술명 정확성

#### [High] 3.B.1 LLM 생성 가상 시술명 차단 부재
- 위치: 룰 본문 전체.
- 현재 룰: `TERMINOLOGY_GUIDE` (line 674-899) 가 카테고리별 시술명 사전 — 모두 실재 시술명. `<natural_compliance>` (line 1364-1380) 가 단정·과장 회피 강조. 그러나 **"최신 OO 기법", "혁신적 OO 시술", "신개발 OO 치료법", "특허받은 OO 프로토콜"** 같이 LLM 이 만들어내는 가상 시술명 명시적 차단 부재. `medicalLawFilter` 의 "혁신적" 치환은 단어 한정, 결합 시술명 표현은 미커버.
- 빠진 가드: E-E-A-T 의 expertise + authoritativeness 안티패턴은 _권위 조작_ 차단에 초점. _시술명 조작_ 은 별도 axis.
- 권고 룰 문구 (`<korean_authority_signals>` 의 금지 패턴 또는 `BLOG_PERSONA.<natural_compliance>` 마지막에 추가):
  > 가상 시술명 생성 금기. "최신 OO 기법", "혁신적 OO 시술", "신개발 OO 치료법", "OO 병원 특화 OO 프로토콜" 같이 일반적으로 통용되지 않는 시술명·기법명을 만들어내는 것은 환자에게 잘못된 정보를 제공하는 셈입니다. 시술명은 `terminology_guide` 블록에 명시된 통용 명칭만 사용하고, 새 기법으로 보이는 표현이 학습 데이터에 있어도 "일반적으로 알려진 OO 시술" 같이 검증 가능한 표현으로 풉니다.

### C. 의사명 / 병원명

#### [Medium] 3.C.1 다른 병원명 혼입 차단 명시 부재
- 위치: `blogPrompt.ts:953-957` (`COMMON_WRITING_STYLE` 병원 운영 정보 자동 생성 금지); `blogPrompt.ts:2212-2219` (`buildClinicContextBlock`).
- 현재 룰: 병원 운영 정보 (진료시간·전화·주소) 자동 생성 금지는 명확. `clinic_context` 블록이 "현재 주제와 관련 있는 정보만 참고", "없는 서비스/장비는 언급 X" 명시. 그러나 **"LLM 이 학습 데이터에 있던 다른 병원명을 본 글에 섞어 등장시키는 케이스"** 명시 부재. 예: hospital_name 이 "강남치과" 인데 본문 중간에 "OO치과의 사례에 따르면..." 같이 다른 병원 사례 가공.
- 빠진 가드: LLM 이 학습된 다른 병원·의료진 이름을 본 글에 혼입 risk. PII / 명예훼손 risk 도 일부 있음.
- 권고 룰 문구 (`COMMON_WRITING_STYLE` 의 "병원 운영 정보 자동 생성 금지" 다음에 추가):
  > 다른 병원명·의료진명 혼입 금지. 본문에 등장하는 병원·의료진은 `user_input.hospital_name` 또는 `clinic_context` 에 명시된 본원 정보만. 학습 데이터에서 본 다른 병원 사례·의료진 이름을 본 글에 섞지 마세요. 다른 병원 사례가 필요하면 "한 병원에서는", "어떤 의료진은" 같은 익명 일반화 표현만 사용합니다.

#### [Low] 3.C.2 hospital_strengths 보간 시 sanitize 적용 — 충분
- 위치: `blogPrompt.ts:2798` (`buildBlogPromptV3` `sanitizeSourceContent(req.hospitalStrengths, 3000)`).
- 평가: 모든 user-supplied hospital 데이터는 sanitizeSourceContent 통과. 적절.
- 발견 없음.

### D. 논문 / 인용

#### [Medium] 3.D.1 가짜 인용 — 가드 강하나 한국 학회 변형 risk
- 위치: `blogPrompt.ts:462-468` (`<authoritativeness>`); `blogPrompt.ts:1810` (REVIEWER checklist 14); `blogPrompt.ts:1101-1103` (BLOG_EXAMPLES bad 예시); `blogPrompt.ts:531-535` (korean_authority_signals 금지 패턴).
- 현재 룰: 가짜 외국 논문 인용 ("2024년 JCO", "JAMA 연구", "ADA 가이드라인 v3.2") 가 **5개 layer 명시**. 강함. 그러나 한국 학회 가짜 인용 — "**대한OO학회 2024년 발표**", "**OO학회지 N월호 게재**" 같은 한국 학회명 + 연도/호수 결합 가짜 인용 — 명시적 패턴 부재. korean_authority_signals 허용 패턴 (line 519-528) 이 "대한치과의사협회에서도 권장하는" 같은 _단체명만_ 허용이라는 정책은 있으나, _연도·호수 결합_ 의 명시적 ❌ 사례가 룰 본문에는 없음.
- 빠진 가드: LLM 이 한국 학회 + 연도 조합으로 더 그럴듯한 가짜 인용 생성 가능.
- 권고 룰 문구 (`<authoritativeness>` 의 ❌ 사례에 추가):
  > 한국 학회 가짜 인용도 금기. "대한치과의사협회 2024년 발표", "대한피부과학회지 5월호 게재", "OO학회 2024년 추계학술대회 발표" 같이 한국 학회명에 연도·호수·학술대회 회차를 결합한 표현은 모두 환각 위험이라, 한국 학회 인용도 단체명만 ("대한치과의사협회에서도 강조하는") 사용합니다.

#### [Medium] 3.D.2 referenceFacts 가공 후 인용 — 강제 조건 부재
- 위치: `blogPrompt.ts:2173-2179` (`buildReferenceBlock.<usage_rules>`).
- 현재 룰: "facts 문장을 그대로 복사하지 말고 자연스럽게 풀어쓰세요" 명시. 그러나 facts 안에 구체 출처가 있을 때 본문 인용 형식 강제 부재 — 예: facts 안 "보건복지부 가이드라인 (2023)" → 본문에서 어떻게 인용할지 (단체명만? 연도 포함?) 모호. usage_rules 5번 "구체 논문명·연도·가이드라인 버전은 절대 만들지 마세요 (facts에 있어도 단체명만 인용)" 는 잘 적혀 있으나, _facts 안의 연도가 정확함에도 단체명만 쓰라_ 는 정책은 환자 신뢰 가치와 충돌 가능.
- 발견: 정책 명료성 보강 필요.
- 권고 룰 문구 (`<usage_rules>` 5번 line 다음):
  > facts 안의 연도·문서명 정확성과 본문 인용 사이의 trade-off: 본 정책은 _LLM 환각 risk_ 가 _연도 명시 환자 신뢰 이득_ 보다 크다고 판단해 단체명만 인용으로 통일합니다. 환자가 출처를 더 알고 싶을 때 — 별도 footer 또는 references_footer 블록에서 다루세요.

### E. 가공 환자 사례 (회수 안 됨)

#### [Low] 3.E.1 — `<patient_narrative>` 가 일반화 강제
- 위치: `blogPrompt.ts:1432-1452` (`<patient_narrative>`).
- 현재 룰: "특정 환자 식별 가능 정보 금지 (이름·정확한 날짜·병원 위치). 일반화된 시점·연령대만." 강함. ✅
- 발견 없음.

---

## 축 4. 프롬프트 인젝션 저항

### A. user 입력 escape

#### [Medium] 4.A.1 `BlogOutlineSection.heading` 보간 시 sanitize 적용 — 정합
- 위치: `blogPrompt.ts:2614` (outline section all_headings); `blogPrompt.ts:2642-2647` (`<target_section>` heading); `blogPrompt.ts:2614,2642,2645,2646` (`sanitizePromptInput(s.heading, 100)`).
- 현재 룰: outline LLM 의 출력 (heading) 이 다음 빌더의 user 입력으로 흘러들 때 sanitizePromptInput 통과. 정합.
- 발견 없음 (긍정 확인).

#### [High] 4.A.2 `keyMessage` / `summary` sanitize 길이 cap drift
- 위치: `blogPrompt.ts:2623` (`<key_message>` `sanitizePromptInput(outline.keyMessage, 200)`); `blogPrompt.ts:2643` (`<summary>` `sanitizePromptInput(section.summary, 500)`).
- 현재 룰: outline 의 keyMessage 200자, section.summary 500자. 그러나 OUTLINE_PERSONA `<output_format>` schema (line 1654) 는 "keyMessage": "<one-line core message>" 만 명시 — 200자라는 cap 정보 부재. summary 도 "<one or two sentences>" 만. outline LLM 이 cap 을 모르고 긴 문자열 생성 → 다음 빌더에서 truncate → 의미 손실 risk.
- 빠진 가드: outline JSON schema 자체에 max length hint 부재 + 다음 빌더 sanitize cap 과 schema 명시 사이의 drift.
- 권고 룰 문구 (OUTLINE_PERSONA `<output_format>` schema 다음에 추가):
  > 각 필드 권장 길이: heading 25자 이내, summary 200자 이내, keyMessage 200자 이내. LLM 응답이 이를 초과하면 다음 빌더에서 자동 truncate 되어 의미가 잘릴 수 있습니다.

#### [Low] 4.A.3 `req.referenceSources` 미 sanitize
- 위치: `blogPrompt.ts:2170` (`buildReferenceBlock`).
- 현재 코드: `req.referenceSources?.length ? ... ${req.referenceSources.join(', ')} ...` — sanitizePromptInput 미경유.
- 빠진 가드: referenceSources 가 user 입력이면 인젝션 risk. 실제로는 시스템이 화이트리스트 의료 기관에서만 수집 (line 2189) 이라 risk 낮음.
- 권고: defense-in-depth 차원에서 `sanitizePromptInput(s, 100)` map 적용 권고. 회귀 risk 0.

### B. system/user 분리

#### [Low] 4.B.1 5빌더 모두 BlogPromptV3 분리 — 정합
- 위치: 모든 builder 함수 signature (line 2464 / 2542 / 2724 / 2883 / 2965) 가 `BlogPromptV3 = { systemBlocks, userPrompt }` 반환.
- 평가: 호출지 (next-app / public-app `/api/generate/blog/*`) 가 `systemBlocks` 를 system role, `userPrompt` 를 user role 로 매핑해야 본 분리의 의도 보존. 본 감사는 builder 자체만 확인 (handoff §11 의 호출지 wiring 확인 가정).
- 발견 없음.

### C. 응답 측 누수 가드

#### [High] 4.C.1 `promptLeakageGuard` 패턴 누수 — 신규 룰 블록명 미커버
- 위치: `promptLeakageGuard.ts:22-55` (`HIGH_CONFIDENCE_PATTERNS`); `blogPrompt.ts` 의 XML 블록명.
- 현재 가드 커버: `e_e_a_t_signals`, `reviewer_e_e_a_t_check`, `priority_order`, `common_writing_style`, `review_criteria` 의 XML 시맨틱 태그 (line 38-42). 빌더 변수명 (`PRIORITY_ORDER`, `E_E_A_T`, `COMMON_WRITING_STYLE`, `MEDICAL_LAW_CONSTRAINTS`, `*_PERSONA`).
- 누락된 XML 태그명:
  - `<examples>` (`BLOG_EXAMPLES`, line 1066) — 자연 출현 가능 (BLOG_EXAMPLES 안 의도된 예시), 그러나 LLM 이 시스템 블록 echo 시 누수 가능.
  - `<faq_section_guide>` (line 641) — 자연 출현 0 — 가드 대상으로 적절.
  - `<image_prompt_guide>` (line 901) — 자연 출현 0.
  - `<journey_stage>` 또는 `<journey_stage_guides>` (line 584) — 자연 출현 0.
  - `<topic_type_guide>` (line 401) — 자연 출현 0.
  - `<category_tone>` (line 394) — 자연 출현 0.
  - `<specialist_guide>` (line 241, 248-296) — 자연 출현 0.
  - `<medical_blog_voice>` (line 2233) — fallback 블록명, 자연 출현 0.
  - `<learned_style>` (line 2914-2916) — wrapper 태그, 자연 출현 0.
  - `<output_format>` (BLOG_PERSONA line 1278) — 자연 출현 0.
  - `<thinking_process>` (BLOG_PERSONA line 1258) — 자연 출현 0.
  - `<writing_style>`, `<seo_rules>`, `<volume_rules>`, `<self_check>` 등 BLOG_PERSONA 내부 XML — 모두 자연 출현 0, 누수 가드 대상으로 적절.
- 빠진 가드: 10+ 개 XML 태그가 누수 가능 — 모델이 system prompt body 를 echo 할 때 위 태그 중 어떤 것이 raw 그대로 출력 가능. 현재 가드는 그 중 3개 (e_e_a_t_signals / common_writing_style / priority_order / review_criteria) 만 커버.
- 권고: `HIGH_CONFIDENCE_PATTERNS` 에 다음 XML 태그 매칭 추가 (자연 출현 risk 0 만 선별):
  > `<\/?faq_section_guide>`, `<\/?image_prompt_guide>`, `<\/?journey_stage(?:_guides)?>`, `<\/?topic_type_guide>`, `<\/?category_tone>`, `<\/?specialist_guide>`, `<\/?medical_blog_voice>`, `<\/?learned_style>`, `<\/?writing_style>`, `<\/?seo_rules>`, `<\/?volume_rules>`, `<\/?self_check>`, `<\/?thinking_process>`, `<\/?greeting_rule>`, `<\/?korean_authority_signals>`, `<\/?korean_grammar>`, `<\/?no_markdown>`, `<\/?output_constraint>`.
- 자연 출현 risk 있는 `<examples>`, `<output_format>` 은 LOW_CONFIDENCE 로 분류 권고.

#### [Medium] 4.C.2 키워드 보강 — `<intro_table_of_contents>` 등 신규 user_prompt 라벨
- 위치: `blogPrompt.ts:2699-2714` (`buildSectionFromOutlinePrompt` `<intro_table_of_contents>` instruction).
- 현재 룰: 본 블록은 user_prompt 안 task instruction 으로 직접 보간. 모델이 echo 시 `intro_table_of_contents` literal 이 응답에 노출 가능. promptLeakageGuard 미커버.
- 빠진 가드: 자연 출현 risk 0 — guard 대상 적절.
- 권고: `HIGH_CONFIDENCE_PATTERNS` 에 `<\/?intro_table_of_contents>`, `<\/?table_of_contents>` 추가.

---

## 축 5. 빌더 간 일관성 (drift-zero)

### A. 룰 본문 drift

#### [Low] 5.A.1 — invariant 가드 작동 (기존 회귀 가드)
- 위치: CLAUDE.md "프로세-플로우 룰 적용 위치 (코드 enforcement)" 의 4빌더 invariant + REVIEWER 추가.
- 평가: `proseFlowRule.test.ts` 가 5빌더 (REVIEWER 포함) 출력의 substring 검사 명시. 본 감사 시점 R-1 PASS (`docs/code-review-2026-05-15.md`).
- 발견 없음.

### B. 카테고리 records drift

#### [Low] 5.B.1 — 7 records 정합 확인
- 위치: `blogPrompt.ts:119-155` (`CATEGORY_IMAGE_GUIDES`); `blogPrompt.ts:172-180` (`categoryHints`); `blogPrompt.ts:248-297` (`CATEGORY_DEPTH_GUIDES`); `blogPrompt.ts:319-383` (`CATEGORY_TONE`); `blogPrompt.ts:674-899` (`TERMINOLOGY_GUIDE`); `pressCategoryTone.ts:30-94` (`PRESS_CATEGORY_TONE`); `clinicalCategoryTone.ts` (`CLINICAL_CATEGORY_TONE`).
- 평가: 모두 7개 카테고리 — 치과·피부과·정형외과·한의원·성형외과·안과·내과. R-2 drift-zero invariant PASS.
- 발견 없음.

### C. tone / hint 충돌

#### [Low] 5.C.1 — 다른 차원 (text vs visual)
- 위치: `CATEGORY_TONE` (text register) vs `categoryHints` (visual cue, line 172-180) vs `CATEGORY_IMAGE_GUIDES` (visual setting/subject/style, line 119-155).
- 평가: 다른 차원이라 충돌 없음. 같은 카테고리 (예: 치과) 의 텍스트 톤 "담담하고 차분" 과 이미지 톤 "warm dental operatory" 가 register 다른 channel — 정합.
- 발견 없음.

### D. 입력→출력 형식 일관성

#### [High] 5.D.1 — outline JSON schema 와 BlogOutlineSection 타입 정합 확인 (간접)
- 위치: `OUTLINE_PERSONA.<output_format>` (line 1638-1663); `BlogOutlineSection` 타입 정의 (`packages/blog-core/src/types.ts` 가정 — 본 감사 미독); `buildSectionFromOutlinePrompt` 의 `section: BlogOutlineSection` 사용 (line 2531).
- 현재 schema: `{ type, heading, summary, imageIndex, charTarget }`.
- buildSectionFromOutlinePrompt 의 사용 필드: `section.type`, `section.heading`, `section.summary`, `section.imageIndex`, `section.charTarget` (line 2640-2647). 모두 schema 와 정합.
- 잠재 drift: outline JSON 의 `keyMessage` 가 `<outline_context>.<key_message>` 로만 사용 (line 2623). 그러나 schema 에 `totalCharTarget` 도 있는데 (line 1653) 다음 빌더 (`buildSectionFromOutlinePrompt`) 가 사용 안 함 — `req.textLength` 가 우선. **`totalCharTarget` 은 outline 응답에는 있지만 next builder 는 무시** — 작성자 의도면 OK, 아니면 drift.
- 발견: 정책 결정 필요.
- 권고: 작성자 의도 확인 후 OUTLINE_PERSONA schema 에서 `totalCharTarget` 제거 또는 buildSectionFromOutlinePrompt 가 이 값을 어떻게 활용하는지 명시.

#### [Medium] 5.D.2 — `imageIndex` schema vs validator drift
- 위치: `OUTLINE_PERSONA.<design_principles>` 5번 (line 1671-1677); `buildSectionFromOutlinePrompt` line 2564 (`if ((req.imageCount ?? 0) > 0 && section.imageIndex)`).
- 현재 룰: outline 단계에서 "imageIndex 정확히 image_count 개 섹션에만 부여" 강하게 명시. 그러나 builder 단계 validator 부재 — outline LLM 이 5개 imageIndex 줬는데 image_count=3 이면 builder 가 그대로 image marker 5개 생성 → 사용자가 받은 이미지는 3개 → mismatch.
- 빠진 가드: outline 응답 검증 layer 부재. 다음 빌더 진입 시 validate 권고.
- 권고: `buildSectionFromOutlinePrompt` 호출 전 `validateOutlineImageIndex(outline, req.imageCount)` 유틸 추가 — image_count 초과 imageIndex 는 null 화 또는 reject + 재생성 트리거. 본 감사 scope 외 (코드 변경) 라 _후속 PR 후보_.

#### [Medium] 5.D.3 — `buildBlogSectionPromptV3` 의 fallback style 우선순위 drift
- 위치: `blogPrompt.ts:2913-2917`.
- 현재 코드: learned_style 의 priority 가 `"override_greeting"` — 다른 builder 의 `"override_all_style"` (BLOG_PERSONA line 1601-1620 의 의도) 보다 **약함**.
- 코드 안 NOTE (line 2911-2912): _"의도된 차이인지 후속 PR 에서 정합성 검토."_
- 발견: 코드 작성 시점에 이미 _drift 후보_ 로 표시됨. 본 감사 시점에서도 미해결.
- 권고: 본 결정을 PO 와 정책 결정 — `override_all_style` 로 통일하거나, `override_greeting` 으로 의도하면 `<priority_order>` 본문에 명시. (코드 변경은 본 감사 scope 외 — _후속 PR 후보_.)

---

## Top 3 즉시 보강 권고 (우선순위 종합)

본 감사가 발견한 high 6건 중 **다음 라운드에서 가장 먼저 다뤄야 할 3건**:

### 1. 축 3.B.1 — 가상 시술명 차단 룰 추가
의료 콘텐츠 신뢰의 근본. LLM 이 "최신 OO 기법" 같은 가상 시술명을 생성하면 환자에게 잘못된 정보 제공. 영향 큰데 룰 본문에 명시 부재. `terminology_guide` 와 결합한 strict whitelist 정책 권고.

### 2. 축 1.B.1 — 본인부담금·할인·면제 패턴 보강
보건복지부 의료광고 심의기준 위반 빈출 1위 영역 중 하나. 현재 룰은 "가격/할인/이벤트" 일반 카테고리만 — 구체 패턴 ("본인부담금 0원", "한정 특가", "선착순") 명시화 필수.

### 3. 축 4.C.1 — promptLeakageGuard 패턴 누수 보강
HIGH_CONFIDENCE_PATTERNS 에 10+ 개 XML 태그명 추가. 자연 출현 risk 0 패턴만 선별 — false-positive 없이 system prompt body echo 차단 강화.

---

## 후속 권고 — 별도 PR 후보

본 감사가 식별했으나 _즉시 조치 아닌_ 항목 (Top 3 다음 라운드 또는 더 뒤로):

- **축 1.A.1** — 단일 토큰 "단번에 / 즉시 / 절대 / 제일" 룰 본문 보강.
- **축 1.A.2** — "안전한 / 고통 없는" 결합 패턴 룰 본문 보강.
- **축 1.D.1** — 신의료기술 광고 제한 룰 추가 (변호사 자문 권고 — 조문 확인 필요).
- **축 1.E.1** — 시술 효과 직접 단정 동사 ("젊어진다 / 예뻐진다") 룰 추가.
- **축 1.F.1** — 학력 + 최상급 결합 금지 명시.
- **축 1.G.1** — 자체 인증·자체 수여 자격증 강조 패턴 명시.
- **축 1.H.2** — 의료기관 평가 미실시 분야 인증 표현 차단.
- **축 2.A.1** — REVIEWER 빌더에 PRIORITY_ORDER_BLOCK 직접 주입 또는 CLAUDE.md 명시 단서 추가.
- **축 2.D.1** — FAQ 시작 조건 (룰 OR vs 빌더 분기) 정합화.
- **축 2.E.1** — `<korean_grammar>` 본문에 8개 추가 형용사 어간 사례 보강.
- **축 3.C.1** — 다른 병원명 혼입 차단 룰 명시.
- **축 3.D.1** — 한국 학회 + 연도 결합 가짜 인용 차단 패턴.
- **축 3.D.2** — referenceFacts 안 연도·문서명 인용 정책 명확화.
- **축 4.A.2** — outline JSON schema 에 길이 cap hint 명시.
- **축 4.A.3** — `req.referenceSources` sanitizePromptInput 적용 (defense-in-depth).
- **축 4.C.2** — `<intro_table_of_contents>` / `<table_of_contents>` 태그 promptLeakageGuard 추가.
- **축 5.D.1** — outline schema 의 `totalCharTarget` 활용 또는 schema 정리.
- **축 5.D.2** — outline 응답 imageIndex validator 추가 (코드 변경).
- **축 5.D.3** — `buildBlogSectionPromptV3` 의 learned_style priority 정책 결정 (코드 안 NOTE 가 명시).

---

## 결론

회귀 가드 (R-1~R-5) 가 건강하고 Critical 0건이라, 본 감사는 _즉시 PR 강제_ 가 아닌 _다음 라운드 백로그_ 위치. Top 3 권고 (가상 시술명 차단 / 본인부담금 패턴 / promptLeakageGuard 보강) 는 한 PR 에 묶을 수 있는 정도의 크기 (룰 본문 보강 + guard 패턴 추가 = 코드 < 50 lines). 보강 시점은 PR #214 이후의 보안 Round 4 또는 별도 의료법 Round 1 로 분리 권고.
