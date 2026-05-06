# 카드뉴스 위반 콘텐츠 다운로드 hard-block UX 의사결정

**상태**: Proposed
**작성일**: 2026-05-06
**관련 감사 ID**: BL-B-Critical-1 (= BL-B-009) + BL-B-FN-001 ~ BL-B-FN-011
**main HEAD 기준**: `fe9725e`
**작성 원칙**: read-only 감사 자료에 기반한 정책 옵션 비교. 코드 변경 0. 최종 결정은 사용자 + 사내 법무.

---

## 0. TL;DR

- 카드뉴스 다운로드 4 경로(PNG/JPG/PDF/ZIP/Shorts) **전부 의료광고법 검증 hard-block 부재**. 위반이 잡혀도 상단 빨간 배너만 뜨고 다운로드 그대로 진행 (`CardNewsProRenderer.tsx:946-963`).
- 감사 BL-B 결과 **검증기 룰셋 커버리지 등급 C**, false negative **11건(FN-001~011)** 확인. 즉 검증기 자체가 “위반을 빠뜨릴” 가능성과 “정상 콘텐츠를 위반으로 오인할” 가능성을 모두 포함.
- 따라서 단순한 hard-block 도입은 **false positive 시 정상 다운로드까지 차단**하는 마찰을 만들고, false negative 11건은 hard-block 이어도 **그대로 외부로 빠져나간다**(차단 자체가 우회 가능).
- 본 ADR 의 1순위 권고: **Option B (warn + override + 운영 로깅) 를 즉시 도입하고, 검증기 강화(2B-β2: zero-width 정규화 + 의역/희소성 사전 확장)와 동시 진행 후 등급 B+ 도달 시 Option A(hard-block) 로 단계 격상**. 순수 Option A 즉시 도입은 **검증기 C 등급 상태에서는 비권장**.
- 최종 결정은 사용자(법무 검토 포함) — A / B / C / D / 보류.

---

## 1. 배경

### 1.1 BL-B-Critical-1 (= BL-B-009) 요약
- 위치: `public-app/components/CardNewsProRenderer.tsx:725-755, 874-880, 946-963`
- 현상: `totalViolations.high > 0` 이어도 `downloadCard / downloadAll(ZIP) / downloadAllPdf / downloadShorts` 모두 진행. UI 는 상단 빨간 배너 + “각 카드 편집창에서 [교체] 버튼으로 수정할 수 있어요” 안내문만.
- 영향: 사용자가 의료법 §56 위반 의심 콘텐츠를 PNG/JPG/ZIP/PDF/MP4 로 export 한 뒤 SNS 외부 유포 가능. 검증기가 의도적으로 도입되었음에도 **다운로드 단계에서 “경고만, 차단은 없음”**.
- 베이스라인: 신규 발견(베이스라인은 검증 누락만 다룸).

### 1.2 검증기 등급 C / FN 11개 — 결정의 핵심 변수
BL-B `_findings_BL-B.md` §8 룰셋 커버리지 등급:

| 항목 | 등급 |
|---|---|
| 과장·허위 (a) | B |
| 효과 보장 (b) | B |
| 비교광고 (c) | C |
| 환자 후기 (d) | C |
| 가격 광고 (e) | **D** (시간/희소성 0건) |
| 자격 사칭 (f) | C |
| 의료기관 비교 (g) | C |
| 신의료기술 미통과 (h) | **D** (사전 부재) |
| 호출 경로 안전성 | **D** |
| 입력 정규화 | **F** (zero-width / 줄바꿈 / NBSP / homoglyph 미정규화) |
| **종합** | **C** |

False negative 11건(FN-001~011) 요약:

| ID | 우회 경로 | risk |
|---|---|---|
| FN-001 | zero-width 삽입 (`최​고`) | High |
| FN-002 | 줄바꿈/공백 (`최\n고`, `100 %`) | High |
| FN-003 | 한자/영문 (`最高`, `best`, `number one`) | Med~High |
| FN-004 | 의역 (`프리미엄`, `재발 0`, `이상반응 거의 없는`) | High |
| FN-005 | testimonial 의역 (`Before & After`, `이런 분들이`) | High |
| FN-006 | 가격 — 시간/희소성 (`오늘만`, `선착순`, `마감임박`) | High |
| FN-007 | 자격 사칭 의역 (`VVIP`, `마스터 닥터`, `상위 1%`) | High |
| FN-008 | 비교광고 의역 (`대학병원 수준`, `종합병원급`) | Med~High |
| FN-009 | nested 필드 미검증 (`priceItems[i].price`) | Medium |
| FN-010 | 검증 함수 미호출 경로 (`/api/gemini` server-side 적용 0) | High |
| FN-011 | HTML inline 태그 placeholder 우회 (`최<span>고</span>`) | Medium |

False positive 사례: 본 감사에선 별도 정량은 없으나 (주: 베이스라인의 `Day 5 오탐 축소` 코멘트가 `medicalLawFilter.ts` 에 존재하므로 과거에 FP 발생 이력 있음) — “예약하세요/특가/할인” 등 일반어 키워드 매칭 특성상 FP 가능성 정성적으로 인정.

→ **검증기가 C 등급 / FN 11 / FP 가능성 인정** 상태에서 hard-block 을 채택하면, FP 사용자는 **다운로드 자체를 못한다**. 반대로 warn-and-proceed 만 두면 BL-B-Critical-1 그대로.

### 1.3 4 다운로드 경로 + 외부 유포 risk
PNG/JPG: 단일 슬라이드 다운로드(인스타 포스트). PDF/ZIP: 전체 묶음(블로그/이메일 첨부). Shorts: 9:16 MP4 영상(릴스/유튜브 쇼츠/틱톡). 모두 SaaS 외부로 나가며 일단 다운로드되면 **회수 불가**.

### 1.4 의료법 §56 위반 콘텐츠가 SaaS 출력물로 전파될 때 책임
- 의료법 §56 ②항 8호(소비자 오인) / 14호(현혹) / §27 ③(환자 유인) / 시행령 §23 ② 항 — 주된 책임은 **광고 주체(의료기관·의료인)** 이지만, AI SaaS 가 “해당 표현을 자동 생성·다운로드 제공” 한 사실은 **방조·기여 책임 다툼 여지** 있음(법무 검토 필수).
- 약관/면책으로 사용자에게 책임 전가는 일반적이나, **위반을 시스템이 명시적으로 인지하고도 다운로드를 차단하지 않은 사실** 은 면책 약관의 효력을 약화시킬 수 있음(법무 검토).

---

## 2. 현재 상태 (사실 자료)

### 2.1 다운로드 경로별 검증 / 위반 처리 흐름

| 경로 | 트리거 함수 (UI) | 다운로드 구현 | 검증기 호출 위치 | 위반 발견 시 흐름 | 사용자에게 보이는 UI |
|---|---|---|---|---|---|
| **PNG (단일)** | `downloadCard` (`CardNewsProRenderer.tsx:725-733`), 카드 호버시 “💾 PNG” 버튼 (line 1362) | `downloadKonvaStageAsPng` (`cardDownloadUtils.ts:50-61`) | **다운로드 경로엔 0**. validation 은 별도 `useMemo` (line 888-901) 로 전체 totalViolations 만 집계 + `SlideEditor` 인라인 배지(line 181). | 상단 빨간 배너 “⛔ 위반 N건” + `[교체]` 버튼 안내만. 다운로드 함수 내부엔 가드 0. | 배너 + 다운로드 진행 → PNG 파일 생성. |
| **JPG (단일)** | 카드 호버시 “📷 JPG” 버튼 (line 1367), 인라인 호출 `downloadKonvaStageAsJpg(...)`. | `downloadKonvaStageAsJpg` (`cardDownloadUtils.ts:64-76`) | 동일. | 동일. | 동일. |
| **ZIP (전체 PNG)** | `downloadAll` (line 735-743), “📦 전체 PNG (ZIP)” 메뉴(line 1077). | `downloadKonvaStagesAsZip` (`cardDownloadUtils.ts:126-143`) | 동일. | 동일. | 동일. |
| **PDF (전체)** | `downloadAllPdf` (line 745-755), “📄 전체 PDF” 메뉴(line 1084). | `downloadKonvaStagesAsPdf` (`cardDownloadUtils.ts:146-165`) | 동일. | 동일. | 동일. |
| **Shorts (MP4)** | `handleConvertToShorts` (line 782-872) → `downloadShorts` (line 874-880), “🎬 변환 시작” 버튼(line 1245) → 변환 후 “📥 영상 다운로드”(line 1283). | 클라이언트: `captureAllKonvaStagesAsBlobs` (`cardDownloadUtils.ts:84-123`) → multipart POST → `app/api/video/card-to-shorts/route.ts` 프록시 → `video-processor` 외부 서비스. | **server route 에 검증 0** (`route.ts:23-84` — credit 차감만, validateSlideMedicalAd 미호출). 클라이언트 `useMemo` 에만 의존. | 동일 — 변환 시작 버튼은 `slides.length === 0` 만 disabled. 위반 high > 0 무관. | 배너 + 변환 진행 → MP4 다운로드. |

핵심 사실:
- **검증은 100% 클라이언트 useMemo + SlideEditor inline**. server-side 강제는 zero.
- **Shorts API route 도 server-side 검증 0** — `app/api/video/card-to-shorts/route.ts` 가 단순 multipart 프록시. credit/guest 게이트만.
- **다운로드 함수 4개(PNG/JPG/ZIP/PDF)는 모두 동일 파일** `public-app/lib/cardDownloadUtils.ts` — hard-block 도입 시 단일 지점 + 호출부 5곳(`downloadCard`, `downloadAll`, `downloadAllPdf`, `handleConvertToShorts`, JPG inline) 가드 추가.

### 2.2 검증기 정확도 (BL-B 자료 재인용)

- 룰셋 커버리지 등급: **C**
- false negative: **11건** (FN-001~011)
- false positive: 정량 자료 부재. `medicalLawFilter.ts` 의 `Day 5 오탐 축소` 코멘트로 과거 FP 발생 이력 인정. 일반어 키워드(`'예약'`, `'특가'`, `'프로모션'` 등) 직접 매칭 특성상 의료 일반 콘텐츠에서 우발 매칭 가능성 정성적 존재. (※ 정량화는 BL-B-Followup 으로 권고).

→ **결정의 핵심 변수**: hard-block 을 도입하면 FN-001~011 우회 콘텐츠는 **여전히 통과**(왜냐면 검증기가 인지 못함), 반면 FP 콘텐츠는 **정상 사용자 다운로드 차단**. 즉 hard-block 만으로는 “나쁜 콘텐츠를 잡고 좋은 콘텐츠를 통과시키는” 보호 효과 자체가 검증기 정확도에 100% 의존.

---

## 3. 옵션 비교

### Option A: hard-block (위반 시 다운로드 거부)

- **정의**: `totalViolations.high > 0` (또는 `> threshold`) 일 때 다운로드 버튼 disabled + 클릭 시 모달 “위반 항목을 모두 수정한 뒤 다시 시도하세요”. override 없음.
- **효과**:
  - 검증기가 잡은 high 위반은 외부 유포 100% 차단.
  - 강한 시그널: SaaS 가 의료법 컴플라이언스에 대해 “자체적으로 차단한다” 명시 → 약관 보충 + 책임 분담 논거 강화.
  - 운영자 입장에서 “위반 콘텐츠 외부 노출” 사고 risk 최소.
- **부작용 (검증기 C 등급 영향)**:
  - **FP 시 정상 사용자 다운로드 차단** → 사용자 마찰 + 환불 요구 + 이탈. 특히 BL-B 룰셋의 일반어 키워드(`예약`, `특가`, `1위`, `약속` 등) 가 의료 외 정상 맥락에서 매칭될 때 사용자가 “왜 막혔는지” 명확히 이해 못함.
  - **FN-001~011 우회는 차단 효과 0** — 사용자가 zero-width 삽입(FN-001)이나 의역(FN-004) 으로 위반 키워드를 회피하면 검증기가 통과시키므로 hard-block 도 통과. 즉 “정직한 사용자 차단, 회피 사용자 통과” 의 역설 가능.
  - 사용자가 “검증기를 우회하려고” 의도적 의역/zero-width 학습을 유발 → 룰셋 lag 가속.
- **구현 위치**: `cardDownloadUtils.ts` 4 함수 진입 시 `totalViolations.high > 0` 가드 + 호출부(`CardNewsProRenderer.tsx:725, 735, 745, 782, 1367`) 5곳에 사전 체크. server-side(`/api/video/card-to-shorts/route.ts`) 에도 동일 가드 추가 권고(아니면 클라 우회 가능).
- **작업 시간 추정**: 0.5~1일 (UI 모달 + 가드 + 메시지 카피).

### Option B: warn + override (사용자 명시 동의 시 다운로드 진행)

- **정의**: 위반 발견 시 다운로드 버튼은 활성, 클릭하면 “⛔ 위반 N건 발견. 의료광고법 §56 위반 risk 가 있습니다. 그래도 다운로드하시겠습니까? [수정하기] / [그래도 다운로드]” 모달. override 시 운영자 로그(`auditLog`) 기록 + 사용자에게 영구 면책 동의 명시.
- **효과**:
  - 사용자에게 “이건 위반일 수 있다” 적극 시그널.
  - FP 차단 부작용 회피 — 사용자가 직접 판단 후 진행.
  - 운영자 가시성 확보 — 위반 override 횟수/패턴 모니터링 가능.
  - 약관 + override-동의 로그 결합 시 **방조 책임 논거에 가장 강한 방어선** (법무 검토 필요).
- **부작용**:
  - 사용자가 “그래도 다운로드” 를 습관적으로 누르면 효과 약화 (override fatigue).
  - 위반 콘텐츠가 외부 유포되는 사실은 동일 (단 운영자 로깅으로 추적 가능).
  - FN-001~011 우회는 여전히 검출 자체가 안 되므로 모달도 안 뜸.
- **구현 위치**: 동일 4 함수 진입점 + override 모달 컴포넌트 신규 + `lib/auditLog` (있다면 재사용, 없다면 신규) 또는 Supabase `medical_violation_overrides` 테이블 권고.
- **작업 시간 추정**: 1~2일 (UI 모달 + 로깅 + DB 마이그레이션 또는 콘솔 로그).

### Option C: soft-block (위반 워터마크 + 다운로드 허용)

- **정의**: 위반 발견 시 다운로드는 진행하되, PNG/PDF 출력물에 **반투명 워터마크** “이 콘텐츠는 의료광고법 위반 risk 항목 N건 검출 — 게시 전 검토 필요” 강제 합성. Shorts 도 첫/끝 프레임에 동일 텍스트 오버레이.
- **효과**:
  - 외부 유포 시도 자체를 어렵게 함 (워터마크 제거 노력 필요).
  - 사용자가 다운로드는 가능 → 마찰 최소.
  - 의도치 않게 게시할 경우 외부 시청자/심의자가 워터마크로 인지 가능.
- **부작용**:
  - 사용자가 워터마크를 “디자인 오류” 로 인식 → 환불 요구 / 이탈.
  - FP 시 정상 콘텐츠에도 워터마크 → UX 손상 직접적.
  - **워터마크 제거(크롭, 마스킹)가 일반 사용자도 가능** → 외부 유포 차단 효과 의문.
  - Shorts(MP4) 워터마크는 video-processor 측 구현 추가 부담 (현재 라우트는 단순 프록시).
- **구현 위치**: `cardDownloadUtils.ts` PNG/JPG/PDF/ZIP 캡처 단계에 canvas 합성 + Shorts 는 video-processor 측 협업 필요.
- **작업 시간 추정**: 2~3일 + Shorts 워터마크는 video-processor 별도 작업.

### Option D: require-edit-then-allow (검증 통과 강제 — block + 자동 수정 제안)

- **정의**: hard-block 에 “LLM 자동 수정 제안” 결합. 위반 발견 시 다운로드 차단 + “자동 수정 제안 보기” 버튼 → `applyContentFilters` 또는 LLM(`Sonnet 4.5`) 으로 의역 자동 치환 → 사용자가 수락 → 검증 0건 → 다운로드 활성.
- **효과**:
  - hard-block 의 강한 차단 + 자동 수정으로 마찰 완화.
  - 사용자가 “수정” 한 콘텐츠가 검증 통과하므로 다운로드 시점엔 항상 검증 통과 보장.
  - 룰셋 정확도가 개선될수록 효과도 비례 향상.
- **부작용**:
  - 자동 수정 LLM 호출 비용 + 지연 (Anthropic/Gemini API 1~3초).
  - LLM 의 의역 수정이 의도치 않게 의미 손실 → 사용자 불만 (현재도 `medicalLawFilter` 자동 치환 단계 있으나 카드뉴스엔 미적용).
  - FP 시 “원래 멀쩡한 표현인데 LLM 이 어색한 의역으로 바꿈” 경험.
  - 구현 복잡도 최고 (LLM 호출 + 슬라이드 필드 매핑 + 사용자 diff UI).
  - FN-001~011 우회는 여전히 통과(자동 수정 자체가 검증 결과 기반).
- **구현 위치**: 4 함수 진입 가드 + 자동 수정 LLM 라우트 신규(`/api/medical/auto-fix-slides`) + diff UI 컴포넌트.
- **작업 시간 추정**: 5~7일.

---

## 4. 트레이드오프 (핵심)

1. **false positive 시 legitimate 다운로드 차단** — 검증기 C 등급 직접 영향. Option A 가 가장 큰 마찰, Option B/D 는 완화 가능, Option C 는 출력물 자체를 손상.
2. **false negative 우회 가능성 (FN-001~011)** — hard-block(A) 이어도 zero-width / 의역 / 한자 우회 시 통과. **즉 hard-block 자체가 의료법 컴플라이언스의 충분조건이 아님**. 검증기 강화(2B-β2) 가 선행되어야 효과 발휘.
3. **사용자 마찰 vs 법적 risk** — Option A(법적 risk 최소, 마찰 최대) ↔ Option B(균형) ↔ Option C(마찰 중간, 효과 의문) ↔ Option D(균형 + 비용).
4. **운영자 가시성 (위반 시도 로그)** — Option B 에서 override 로그 도입 시 “위반 시도 빈도 + 패턴 + 어떤 키워드가 자주 잡히는지” 데이터를 수집 → 룰셋 개선의 피드백 루프. 다른 옵션엔 부재.
5. **검증기 강화와의 의존 관계** — A/B/C/D 모두 검증기 정확도에 비례해 효과가 결정됨. 등급 C 에서 A 즉시 도입은 FP 마찰 risk 가 효과를 압도할 수 있음. 등급 B+ 도달 후 A 격상이 합리적.
6. **client-only 검증의 우회** — 현재 검증은 클라이언트 `useMemo`. DevTools 로 `totalViolations` 직접 조작 가능. **Shorts 경로만이라도 server-side 검증 추가** 가 필요(아니면 hard-block A 도 클라 우회 가능).

---

## 5. 비교 매트릭스

각 항목 5점 척도 (5=가장 우수, 1=가장 열등). “작업 추정 시간” 만 절대값.

| 기준 | A: hard-block | B: warn+override | C: soft-block (워터마크) | D: require-edit |
|---|---|---|---|---|
| 법적 risk 차단 | **5** | 4 | 3 | 5 |
| FP 영향 (사용자 차단 마찰) | 1 (최대 마찰) | 4 | 2 (워터마크가 출력 손상) | 3 |
| FN-001~011 우회 차단 효과 | 1 (검증기 의존) | 1 | 1 | 1 |
| 사용자 마찰 (UX) | 2 | **4** | 2 | 3 |
| 구현 복잡도 (낮을수록 우수) | **4** | **4** | 2 (Shorts 워터마크 별 작업) | 1 |
| 외부 유포 차단 효과 | **5** | 3 (override 시 통과) | 2 (워터마크 제거 가능) | **5** |
| 운영자 가시성 (로그) | 3 (시도 로그 가능) | **5** (override 로그 자연스러움) | 2 | 4 |
| 약관/책임 방어 강도 | 4 | **5** (명시 동의 로그) | 2 | 4 |
| 검증기 등급 C 적합성 | 1 (FP 마찰 큼) | **5** | 3 | 3 |
| 작업 추정 시간 | 0.5~1일 | 1~2일 | 2~3일+ | 5~7일 |

---

## 6. 권고

### 1순위: **Option B (warn + override + 운영 로깅)** — 즉시 도입

**근거**:
- 검증기가 C 등급 / FN 11 / FP 가능성 인정 상태에서 Option A 즉시 도입은 FP 사용자 차단 마찰이 BL-B-Critical-1 의 효과를 상쇄할 risk.
- Option B 는 **사용자 명시 동의 로그** 가 약관 + 방조 책임 방어선의 가장 강한 조합 (법무 검토 필요).
- override 빈도/패턴 데이터가 룰셋 강화의 직접 피드백 → 검증기 등급을 B+ 로 끌어올리는 동력.
- 구현 1~2일, BL-B-Critical-1 의 “경고만, 차단 0” 상태를 즉시 해소.

### 2순위: **Option A (hard-block) — 검증기 등급 B+ 도달 후 단계 격상**

**근거**:
- 룰셋 강화 PR(2B-β2: zero-width 정규화 + 의역/희소성 사전 + 자격 사칭 의역 + nested 필드 enumerate) 로 FN-001~009 다수 해소 + FP 정량 측정 후, FP 률이 충분히 낮으면 Option A 로 격상.
- 격상 시점엔 운영 로그(B 단계에서 축적)로 “정상 콘텐츠가 차단될 risk” 를 사전 검증 가능.

### 검증기 강화 (2B-β2) 와의 의존 관계

| 단계 | hard-block UX | 검증기 작업 |
|---|---|---|
| 즉시 (Phase 1) | **Option B 도입** | 작업 0 (병행) |
| 1~2주 (Phase 2) | Option B 유지 | 2B-β2 검증기 강화 PR (zero-width / 의역 / 희소성 / nested 필드 / server-side 적용) |
| 4~6주 (Phase 3) | FP 률 측정 + 로그 분석 | 등급 B+ 도달 검증 |
| 6~8주 (Phase 4) | **Option A 로 격상** | 후속 룰셋 운영 |

### "결정은 사용자"
- 본 ADR 은 정책 옵션 비교일 뿐. 최종 채택은 **사용자 + 사내 법무 + 의료광고 자율심의 자문** 합의로 결정.
- 특히 “위반 발견 시 다운로드 차단 자체가 의료광고법/표시광고법상 의무인지” 는 본 ADR 작성자 영역 밖. 법무 판단 필요.

---

## 7. 결정 후 후속 작업 (참고)

### 7.1 Option B 채택 시 작업 위치

| 항목 | 위치 |
|---|---|
| PNG 단일 가드 | `CardNewsProRenderer.tsx:725-733` `downloadCard` 진입부 + `:1362` JPG inline 호출 |
| ZIP 가드 | `CardNewsProRenderer.tsx:735-743` `downloadAll` 진입부 |
| PDF 가드 | `CardNewsProRenderer.tsx:745-755` `downloadAllPdf` 진입부 |
| Shorts 변환 가드 | `CardNewsProRenderer.tsx:782-872` `handleConvertToShorts` 진입부 |
| Shorts server-side 가드 (권고) | `app/api/video/card-to-shorts/route.ts:23` POST 진입 직후 (multipart 의 텍스트 메타데이터로 위반 여부 전달 또는 별도 검증 endpoint 호출) |
| override 모달 컴포넌트 | `public-app/components/MedicalAdOverrideModal.tsx` (신규) |
| override 로그 | Supabase `medical_violation_overrides` 테이블 신규 또는 `auditLog` 재사용 (PII_INVENTORY 와 정합 필요) |

### 7.2 검증기 강화 PR (2B-β2) 와의 의존 관계
- **선결 조건 아님** — Option B 는 검증기 현 상태(C 등급)에서도 도입 가능. 단 효과는 검증기 정확도에 비례.
- **병행 권고** — Option B + 2B-β2 동시 진행 시 4~6주 후 Option A 격상 데이터 확보.
- 2B-β2 범위(권고): FN-001 (zero-width 정규화), FN-004 (의역 사전), FN-005 (testimonial 의역), FN-006 (희소성), FN-007 (자격 사칭 의역), FN-009 (nested 필드 enumerate), FN-010 (`/api/gemini` server-side `applyContentFilters`).

### 7.3 운영자 위반 시도 로그 도입 권고
- 컬럼: `user_id`, `slide_id`, `violation_count_high`, `violation_count_medium`, `violation_keywords[]`, `download_format` (png/jpg/zip/pdf/shorts), `override_at`, `consent_text_version`.
- 보존 기간: PIPA §29 안전성 + 행정처분 시효(통상 2년)을 고려해 **최소 2년** 권고 (법무 검토 필요).
- 분석: 주간 “자주 잡히는 키워드 top10”, “반복 override 사용자 top10” → 룰셋 개선 + 사용자 교육.

---

## 8. 미확인 / 후속 조사 필요

1. **FP 률 정량** — 본 ADR 은 정성적 인정만. 실제 운영 데이터 분석 필요. (BL-B-Followup-1)
2. **사전심의 의무 매체 식별** (BL-B-017) — 인터넷 신문/SNS 도달자 수 기준 사전심의 대상 자동 판정. 본 ADR 범위 밖.
3. **Shorts video-processor 측 워터마크 가능성** (Option C 채택 시) — 외부 서비스 API 확인 필요.
4. **약관 면책 조항 ↔ override 동의 로그의 법적 효력** — 법무 단독 판단.
5. **client-only 검증의 server-side 강제 우회 risk** — 현재 카드뉴스 본문 생성 server route(`/api/gemini`) 와 Shorts route 모두 검증 0. Option B 도입 시 server-side 도 가드 권고하나 client 검증 결과의 신뢰성을 어디서 끊을지 정책 결정 필요.
6. **Option B 의 "그래도 다운로드" 중복 클릭 방지** — UX 디테일. override fatigue 측정 필요.

---

## 9. 사용자 결정 요청

본 ADR 은 정책 옵션 비교. **최종 채택은 사용자(+사내 법무) 결정**.

PR 코멘트에 다음 중 하나로 의사 표시 부탁드립니다:

- **A** — 즉시 hard-block 도입 (검증기 C 등급의 FP 마찰 감수)
- **B** — warn + override + 운영 로깅 (1순위 권고)
- **C** — soft-block (위반 워터마크)
- **D** — require-edit-then-allow (자동 수정 제안 결합)
- **보류** — 추가 자료(FP 률, 법무 검토 결과 등) 수집 후 재논의

---

## 10. 메타

- 본 산출은 read-only. 코드 수정 0.
- 작성일: 2026-05-06.
- main HEAD: `fe9725e`.
- 베이스라인 참조: `docs/audits/blog/_findings_BL-B.md` BL-B-009 (= BL-B-Critical-1) + BL-B-FN-001~011 + §8 룰셋 커버리지 등급 C.
- 관련 코드:
  - `public-app/lib/cardDownloadUtils.ts:50, 64, 84, 126, 146` (4 다운로드 함수)
  - `public-app/components/CardNewsProRenderer.tsx:725, 735, 745, 782, 874, 888, 946, 1077, 1084, 1284, 1362, 1367` (UI 트리거 + 검증 useMemo)
  - `public-app/app/api/video/card-to-shorts/route.ts:23` (Shorts server route — 검증 0)
  - `public-app/lib/medicalAdValidation.ts:225, 284, 332` (`validateMedicalAd`, `validateSlideMedicalAd`, nested 필드 처리)
  - `public-app/components/card-news/SlideEditor.tsx:7, 178, 181` (편집 화면 인라인 검증)
- 후속 ADR/Followup 권고:
  - **2B-β2 (검증기 강화 PR)** — FN-001~011 해소 + server-side `applyContentFilters` 적용.
  - **BL-B-Followup-1 (FP 정량 측정)** — 운영 로그 기반.
  - **BL-B-017 follow-up (사전심의 매체 식별)**.
