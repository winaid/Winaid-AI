# 블로그 이미지 mix UX 의사결정

**상태**: Proposed
**작성일**: 2026-05-06
**관련 PR**: #136 (orphan fix, `public-app/app/(dashboard)/blog/page.tsx`), #137 (UX 권장 2 정적 안내, `public-app/app/(dashboard)/blog/BlogFormPanel.tsx`)
**main HEAD**: `273223e` (`fix(blog/server): BL-C server hardening (non-Naver) (#130)`)
**작성자**: Claude (read-only ADR — 코드 0줄 변경)

---

## 0. TL;DR

- **권고 1순위 — Option A (현 단일 토글 유지 + #137 안내 텍스트)**.
  근거: 사용자 제안의 "라이브러리 + AI 보완" mix 는 현 코드 (`page.tsx:1224-1269`) 가 명시적으로 "library 모드일 땐 AI 0장" 으로 설계되어 있어, mix 도입은 동작 변경 + UX 학습 곡선 + 카드뉴스/영상과의 패턴 분리를 동시에 발생시킨다. 현재 미스매치 (textLength cap → 3~6 vs 슬라이더 max 15) 는 **안내** 만으로 해결 가능하며, mix 슬라이더는 그 미스매치를 해결하지 않는다 (cap 은 이미지 마커 부착 단계의 outline 규칙이므로 슬라이더 분할과 무관).
- **차순위 — Option C (자동 default + 고급 mix 토글)**.
  근거: 라이브러리 자산이 풍부한 병원에서 "라이브러리 우선 + AI 보완" 을 원하면 의미 있다. 단, 작업 규모 + 카드뉴스/영상 도메인 일관성 결론 (§2-5) 이 선결돼야 함.
- **결정은 사용자**. 본 문서는 권고만 제공.

---

## 1. 배경

### 1-1. 현재 흐름 (단일 토글)
`public-app/app/(dashboard)/blog/BlogFormPanel.tsx:537-549` 의 토글은 사용자가 추측한 "라이브러리 매칭 + AI 보완" 이 아니라 **이진 선택**:
- 🎨 AI 생성 (`useImageLibrary=false`) — 모든 이미지 슬롯을 OpenAI gpt-image-2 (`/api/image`) 로 생성.
- 📸 내 이미지 사용 (`useImageLibrary=true`) — `hospital_images` 테이블에서 alt 기반 매칭. **매칭 안 되면 빈 슬롯**.

`page.tsx:1269` 가 이 동작의 **단일 진실원**:
```ts
const aiImageCount = useImageLibrary ? 0 : remainingMarkers.length;
```
즉, library 모드에선 매칭 실패한 마커는 AI 가 채우지 않는다.

`BlogFormPanel.tsx:594` 의 "AI 자동 배치 (매칭 안 되는 자리는 비워둠)" 카피는 정확.
하지만 `page.tsx:1259` 의 콘솔 로그 `"라이브러리 자동 매칭: ${matched}/${imgMarkers.length}장 배치 (나머지는 AI 생성)"` 는 **부정확** (실제론 빈 슬롯). UX 외 로그 메시지 정정 필요 — 본 ADR 의 후속 작업.

### 1-2. 미스매치 issue (이전 turn 진단 결과 요약)
- 슬라이더 UI: `min=0, max=15` (BlogFormPanel.tsx:596, 608).
- 그러나 outline 규칙 (`packages/blog-core/src/blogPrompt.ts:1240-1246, 1483-1486`) 은 body section 수를 textLength 로 결정 (`<1200→3, 1200~2000→4, 2000~2800→5, 2800+→6`), `imageIndex` 는 body section 수까지만 부여 가능.
- 결과: 사용자가 textLength=1500 + imageCount=15 슬라이더 → outline 은 body=4 → 마커 4장 → 사용자가 본 "15장" 과 어긋남.

### 1-3. 사용자 제안
"내 사진 N + AI 사진 N" mix 슬라이더 (예: 라이브러리 3장 + AI 5장 = 총 8장).

---

## 2. 현재 상태 (사실)

### 2-1. UI / 슬라이더
- 토글: `BlogFormPanel.tsx:537-549` — 이진 (`AI 생성` / `내 이미지 사용`).
- 라이브러리 모드 슬라이더: `BlogFormPanel.tsx:589-598` — `min=0, max=15`, 안내 "AI 자동 배치 (매칭 안 되는 자리는 비워둠)".
- AI 모드 슬라이더: `BlogFormPanel.tsx:599-622` — 동일 `0~15`, 권장값 안내 + 6장 이상 시간 경고 + 이미지 유형 가이드.
- `useImageLibrary` 상태: `page.tsx:61` (`useState(false)`), 하위 prop drilling: `page.tsx:1885`.

### 2-2. 이미지 생성 루프
- 마커 추출: `page.tsx:1015-1039` — `[IMG_N alt="..."]` 정규식, alt 부족 시 직전 `<h3>` 추출 fallback.
- AI 생성 진입: `page.tsx:1066-1083` — `useImageLibrary=false && imagePrompts.length>0 && imageCount>0` 일 때만 `/api/image` 호출 (review 와 병렬).
- 라이브러리 매칭: `page.tsx:1224-1265` — `useImageLibrary=true` 일 때 `/api/hospital-images?limit=100` 조회, alt 단어 ↔ `tags + altText + aiDescription` 토큰 매칭 점수 (`page.tsx:1241-1248`), `usedIds` 로 중복 방지.
- AI 보완 분기: `page.tsx:1267-1273` — **library 모드에선 강제 0**. 매칭 실패 마커는 strip (`page.tsx:1273` 정규식이 모든 잔여 `[IMG_*]` 제거).
- Pexels fallback: `page.tsx:1335-1342` — AI 생성 2회 재시도 실패 시에만 (library 모드에선 호출 안 됨).

### 2-3. 라이브러리 매칭 함수
- 점수 계산: `page.tsx:1241-1248`.
  ```ts
  const altWords = altText.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const scored = libraryImages
    .filter(img => !usedIds.has(img.id))
    .map(img => {
      const imgText = [...(img.tags || []), img.altText || '', img.aiDescription || ''].join(' ').toLowerCase();
      const score = altWords.filter(w => imgText.includes(w)).length;
      return { img, score };
    })
    .sort((a, b) => b.score - a.score);
  if (scored.length > 0 && scored[0].score > 0) { /* 매칭 */ }
  ```
- `score=0` 이면 매칭 실패 → 빈 슬롯.
- 라이브러리 사이즈: 매칭 시점에 GET `/api/hospital-images?limit=100` 으로 즉시 조회 (`page.tsx:1232`). 폼 진입 시 사전 조회 없음 — UI 가 라이브러리 N 을 모름.
- API: `public-app/app/api/hospital-images/route.ts:39-62` — Supabase `hospital_images` 테이블, owner 또는 같은 team_id 필터.

### 2-4. AI 보완 함수 + 이미지 모델
- `/api/image` 활성 모델: **OpenAI gpt-image-2** (`public-app/app/api/image/route.ts:1-11`). Imagen 코드는 `route.gemini.ts.bak` 으로 보존 (5분 롤백 컷).
- 호출부: `page.tsx:1073-1082` (병렬 fan-out), `page.tsx:1292-1343` (재시도 + Storage 업로드).
- 실패 fallback: Pexels (`page.tsx:1335-1342`).
- AI cap (textLength → body section 수): `packages/blog-core/src/blogPrompt.ts:1240-1246` (outline 규칙) + `1483-1486` (char_budget body_count).

### 2-5. 카드뉴스 / 영상 도메인 비교
- **카드뉴스** (`public-app/app/(dashboard)/card_news/page.tsx`):
  - 배경 이미지: Pexels/Pixabay (`page.tsx:165-189`), 영감 이미지 업로드 (Gemini Vision 분석, `page.tsx:206-237, 255-259`).
  - **`hospital_images` / `useImageLibrary` 사용 0건** (grep 결과).
  - 패턴: 카드 1장 = `imagePrompt + imageUrl + imageHistory` (`page.tsx:62-65`) 구조. 블로그의 마커-매칭과 완전히 다름.
- **영상 편집** (`public-app/app/(dashboard)/video_edit/page.tsx`):
  - 이미지 흐름 = step9 썸네일 추출 (`page.tsx:580-592`) — 영상 frame_time 으로 잘라낸 1장 + 텍스트 오버레이.
  - 라이브러리 매칭 없음. 단방향 영상→썸네일.
- **결론 — 도메인 일관성 부재**: `useImageLibrary` 토글 + alt 기반 매칭은 블로그 단독 기능. mix 슬라이더 도입 시 카드뉴스/영상으로 확장하려면 각 도메인의 이미지 모델 자체를 재설계해야 함 (대규모 작업). 현 시점 mix 도입의 일관성 명분은 약함.

---

## 3. 옵션 비교

### Option A — 현 단일 토글 유지 + 안내 텍스트 (PR #137)
- 변경: `BlogFormPanel.tsx` 의 슬라이더 옆에 정적 안내 ("textLength=N자 → 실제 본문 이미지 K장까지").
- 동작 변경 0. 코드 risk 최소.
- 미스매치는 **명시** 만으로 해결 — 슬라이더 max 15 + cap 4 의 어긋남이 사용자에게 가시화됨.

### Option B — 라이브러리 + AI 분리 슬라이더 (사용자 제안)
- UI: 슬라이더 2개 또는 듀얼 핸들 (`라이브러리 N` + `AI M`).
- 동작: outline 단계 마커 수 = N+M, 매칭 단계에서 N장은 라이브러리, 잔여 M장은 AI.
- 라이브러리 사진 보장 (라이브러리 N장 fallback 정책 별도 결정 — §4-2).
- AI cap (`body_count`) 은 여전히 적용 — N+M 가 cap 초과 시 마커 부착 자체가 안 됨 (§4-3).
- 카드뉴스/영상 일관성 부재는 그대로 (§2-5).

### Option C — B + 자동/직접 토글
- 기본: 자동 모드 = 현 단일 토글 (Option A 동작).
- 고급 펼침: 사용자 제안 mix 슬라이더 (Option B).
- 학습 곡선 보호 + 기존 사용자 회귀 risk 0.
- 구현 복잡도 = B + 토글 + 고급 패널.

### Option D — 사용자 슬롯 직접 지정
- UI: H2 섹션 미리보기 + 각 슬롯에 "라이브러리 사진 선택 / AI 생성 / 비움" 드롭다운.
- 가장 큰 통제권. 라이브러리 매칭 알고리즘 우회 가능.
- UI 복잡도 최대 — 마커 부착 후 사용자가 슬롯별 결정. 2-pass 흐름 (outline → 사용자 선택 → 본문 생성) 필요할 수 있음.
- 작업 규모 가장 큼 + 세션 상태 관리 + 카드뉴스/영상과 패턴 더 멀어짐.

---

## 4. 결정 매트릭스 (4 항목 필수)

### 4-1. 기존 "라이브러리 vs AI" 토글 처리

| 옵션 | A | B | C | D |
|---|---|---|---|---|
| 기존 토글 처리 | 그대로 유지 | 폐기 (단일 mix 슬라이더로 대체) | 자동 모드로 보존 + 고급 펼침 | 폐기 (슬롯별 지정으로 대체) |
| 기존 사용자 영향 | 0 (UX 변화 없음) | 학습 필요 — 토글 익숙 사용자 재교육 | 0 (자동 = 기존 동작) | 큼 — 흐름 자체 변경 |
| 카피 정정 필요 (`page.tsx:1259` 콘솔 로그) | 권장 (mix 와 무관하게 별건) | 자동으로 무의미해짐 | A 와 동일 | A 와 동일 |

권고: **A**. 기존 토글의 인지 비용은 낮고, 폐기/재설계할 만큼의 사용자 가치 가설이 본 ADR 작성 시점에 검증되지 않음. C 는 실험적 도입에 적합.

### 4-2. 라이브러리 부족 폴백

선택지:
- **(a)** 부족분 AI 자동 보완 — 사용자 의도와 다를 수 있음 (라이브러리 강조 → 일반 AI 사진 섞임).
- **(b)** 알림 + 사용자 재선택 — 흐름 끊김.
- **(c)** 슬라이더 max 를 라이브러리 사이즈로 동적 cap — 폼 진입 시 사전 조회 필요 (현재 `page.tsx:1232` 는 매칭 시점 조회).

| 옵션 | A | B | C | D |
|---|---|---|---|---|
| 권고 폴백 | (현행 유지) 빈 슬롯 + 안내 | (a) AI 보완 — mix 의도와 일치 | 자동: 빈 슬롯 / 고급: (a) | (b) 슬롯 단위 재선택 |
| 라이브러리 사전 조회 필요 | 불필요 | 권장 (cap 결정에 사용) | 고급 모드만 권장 | 필수 |
| 구현 위치 | (해당 없음) | `page.tsx:1267-1269` 분기 변경 | A + B 의 합 | 새 흐름 |

권고:
- B 채택 시 **(a) AI 보완** + UI 에 라이브러리 사이즈 표시 (사전 조회).
- D 채택 시 **(b)** 가 자연스러움.

### 4-3. AI cap 처리 (textLength → body section 수 → 마커 부착 가능 수)

핵심 사실: cap 은 outline 규칙 (`blogPrompt.ts:1240-1246`) 에 의해 **마커 부착 단계** 에서 결정. 슬라이더 분할은 cap 자체를 우회 못 함.

선택지:
- **(a)** AI 슬라이더에 안내 텍스트 — "textLength=N → AI 마커 최대 K장".
- **(b)** AI 마커 강제 삽입 (cap 우회) — 본문 흐름 깨짐 + 의료광고법 risk 가중 (콘텐츠 품질 risk, **비권장**).
- **(c)** cap 그대로 + 결과 줄어들면 사용자에게 알림.

| 옵션 | A | B | C | D |
|---|---|---|---|---|
| 권고 처리 | (a) — PR #137 의 안내 그대로 | (a) 라이브러리 + AI 합산에 적용 | 자동: (a) / 고급: (a) | (a) + 슬롯 prefill |
| 추가 cap 설명 위치 | 슬라이더 캡션 | 슬라이더 2개 모두 캡션 | 동일 | 슬롯별 비활성 표시 |

권고: 모든 옵션에서 **(a)**. (b) 는 outline → body section → image 위치 결합 규칙을 깨므로 권고 안 함.

### 4-4. 라이브러리 사진 삽입 위치

선택지:
- **(a)** 현행 — alt 단어 매칭 점수 기반 자동 배치 (`page.tsx:1241-1248`).
- **(b)** 사용자 슬롯 지정.
- **(c)** AI (LLM) 가 결정 — 새 prompt 단계 추가.

| 옵션 | A | B | C | D |
|---|---|---|---|---|
| 권고 위치 결정 | (a) 현행 유지 | (a) 우선, fallback AI 채움 | 자동: (a) / 고급: (a) | (b) — 슬롯 직접 지정이 D 의 핵심 |
| 매칭 알고리즘 | 그대로 | 그대로 | 그대로 | 비활성 (사용자 결정) |

권고: A/B/C 는 **(a)**. (c) 는 LLM 토큰 비용 + 라운드트립 추가 — 현 매칭 정확도 (alt 단어 토큰 교집합) 가 부족하다는 데이터가 없음.

---

## 5. 비교 매트릭스

| 기준 | A | B | C | D |
|---|---|---|---|---|
| 사용자 통제 | 낮음 (이진) | 중간 (분할) | 중간~높음 (자동/고급) | 가장 높음 (슬롯별) |
| 라이브러리 사진 보장 | 토글 ON 시 보장 (현행) | N 장 보장 | 동일 | 슬롯별 명시 |
| AI cap 미스매치 해결 | 안내로 명시 | 안내로 명시 (cap 자체는 동일) | 동일 | 동일 (슬롯 prefill 이 cap 표현) |
| 구현 복잡도 (LOC 추정) | 매우 작음 (≈ +30 LOC, 안내 텍스트) | 중간 (≈ +150~250 LOC, 슬라이더 분할 + AI 보완 분기 + 사전 조회) | 큼 (≈ +250~400 LOC, A+B+토글) | 매우 큼 (≈ +500 LOC+, 2-pass 흐름 + 슬롯 UI) |
| 학습 곡선 | 0 | 중간 | 낮음 (자동 default) | 높음 |
| 카드뉴스/영상 확장성 | 무관 (블로그 전용) | 낮음 (도메인별 모델 차이) | 동일 | 매우 낮음 (블로그 한정 흐름 심화) |
| 회귀 risk | 매우 낮음 | 중간 (`page.tsx:1224-1273` 분기 변경) | 중간 (자동 모드는 회귀 0, 고급은 신규) | 큼 (마커 흐름 자체 변경) |
| 작업 추정 시간 | 0.5 일 (PR #137 그대로) | 2~3 일 (사전 조회 + 슬라이더 + 보완 분기 + 테스트) | 3~4 일 | 5~7 일 (UI + 2-pass + 회귀 테스트) |

---

## 6. 권고

### 1순위 — Option A
사용자 제안의 가설은 "라이브러리 사진을 N장 보장하고 싶다" 인데, 현 토글 (`useImageLibrary=true`) 이 이미 그 의도를 지원한다. 진짜 문제는 슬라이더 max(15) 와 outline cap (`body_count` 4~6) 의 **표현 불일치**, 그리고 매칭 실패 시 빈 슬롯이라는 사실이 안내되지 않는다는 점이다. 이 두 가지는 PR #137 의 정적 안내로 해결 가능하며, mix 슬라이더 도입은 같은 문제를 해결하지 않는다 (cap 은 동일하게 적용됨). 카드뉴스/영상 도메인 (§2-5) 은 image-library 패턴 자체가 없으므로, 블로그 한정 mix UX 도입은 도메인 일관성 약화를 수반한다.

### 2순위 — Option C
라이브러리 자산이 많은 병원에서 "라이브러리 우선 + 부족분 AI" 가 실제로 유의미한 가치를 만든다는 신호 (예: 일정 비율의 사용자가 토글을 ON 한 후 빈 슬롯을 호소) 가 확인되면, 자동 모드로 현행을 유지한 채 고급 펼침으로 mix 슬라이더를 점진 도입할 수 있다. Option B 단독은 기존 사용자 회귀 risk 가 있고 D 는 작업 규모 대비 검증 안 된 가치 가설이라 권고 우선순위에서 밀린다.

### 결정은 사용자
PR 코멘트로 옵션 (A/B/C/D) + §4 의 4 결정 매트릭스 (4-1, 4-2, 4-3, 4-4) 답변 부탁.

---

## 7. 후속 작업 (참고)

### Option A 선택 시
- PR #137 머지 + `page.tsx:1259` 콘솔 로그 카피 정정 (별건 작업, 약 30 분).

### Option B 선택 시
- `BlogFormPanel.tsx` 슬라이더 분할 (`imageCountLibrary` + `imageCountAi` 신규 prop).
- 폼 진입 시 라이브러리 사이즈 사전 조회 (신규 `useEffect` + `/api/hospital-images?limit=1` count).
- `page.tsx:1224-1273` 분기 변경 — `aiImageCount = remainingMarkers.length` 로 통합 (마커 부착 단계는 그대로, 매칭 단계만 N 장 우선).
- `request.imageCount` (`packages/blog-core/src/types.ts:67` 와 인접) → `imageCountLibrary + imageCountAi` 합산값으로 전달.
- 회귀 테스트: textLength × imageCount cross 매트릭스, 라이브러리 0/소량/충분 3 분기.

### Option C 선택 시
- B + `useAdvancedImageMix` 토글 + 자동 모드는 현 코드 그대로.

### Option D 선택 시
- 새 outline 단계 추가 — outline JSON 응답 후 사용자 슬롯 결정 → 본문 생성 호출.
- `packages/blog-core/src/blogPrompt.ts` 의 마커 부착 규칙 (`1240-1246`) 을 사용자 입력 기반으로 변경.

### 카드뉴스/영상 도메인 적용
- 현 시점 패턴이 다름 (§2-5) — Option B/C/D 어느 것도 직접 이식 불가. 도메인별 별도 ADR 권장.

### A/B 테스트
- Option C 가 가장 적합 (자동 default 유지 + 고급 토글 사용률 측정).

---

## 8. 미확인 / 후속 조사 필요

- **PR #136 / #137 의 정확한 변경 내용**: 본 환경에서 `gh` CLI 미설치 + 원격 PR API 미접근. 파일 경로 (`page.tsx`, `BlogFormPanel.tsx`) 만 사용자 안내 기반으로 받아 영역 미접근 보장. 실제 PR diff 확인은 사용자 / 머지 후 main 갱신 시 재확인 필요.
- **사용자 제안의 정확한 의도**: "내 사진 N + AI 사진 N" 의 N 이 동일 슬라이더 (50:50 가까운 분할) 인지, 두 슬라이더 독립 (`N_lib`, `N_ai`) 인지 — 본 ADR 은 양쪽 모두 Option B 로 묶음. 제안자 확인 필요.
- **라이브러리 매칭 실패율 데이터**: 실제로 사용자들이 매칭 실패 빈 슬롯에 얼마나 영향받는지 (Sentry / 사용자 피드백) 미확인. Option B/C 도입의 가치 가설 검증에 필수.
- **`page.tsx:1259` 콘솔 로그 정정의 별건성**: "(나머지는 AI 생성)" 카피는 사실과 어긋나지만, 내부 로그라 사용자 영향 0. mix UX 결정과 무관하게 정정 가능.
- **outline 단계 cap (`blogPrompt.ts:1240-1246`) 의 상세 동작**: body section 수가 image_count 보다 적을 때 outline 이 자동 확장한다고 명시 (`1245-1246`) 되어 있으나, 실제 LLM 이 이 지시를 일관되게 따르는지의 측정 부재. cap 우회 가능성을 보고만 — 권고 변경 X.
