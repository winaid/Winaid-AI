# ADR — ARC-001 카드뉴스 렌더러 통합 의사결정

**상태**: Proposed (사용자 결정 대기)
**작성일**: 2026-05-05
**작성자**: 감사 후속 분석 (read-only)
**관련 감사 ID**: ARC-001 (`docs/AUDIT_REPORT.md`), 상세 노트 `docs/audit/_findings_E_arch_bugs_perf.md`
**기준 커밋**: `main` HEAD `642eddd` (PR #109 머지 전)

---

## 0. TL;DR (요약)

분석 결과 **감사 보고서의 ARC-001 framing이 부분적으로 부정확**했습니다.
"두 앱이 동일 카드뉴스를 다른 엔진으로 렌더 중"이 아니라:

- **public-app**: Konva 기반 활성 렌더러 (1772 lines) — 운영 중, `/card_news` 라우트가 사용
- **next-app**: HTML/CSS 기반 렌더러 (3293 lines) — **어디에서도 import 안 됨 (dead code)** + Day 2~5 정비 6건 미반영된 옛 스냅샷

따라서 의사결정 무게가 크게 달라집니다.

**권고**: **Option D (next-app 죽은 렌더러 삭제) → 추후 필요 시 Option C (blog-core 추출)**

근거 한 줄: next-app은 카드뉴스를 다른 컴포넌트(`CardNewsRenderer.tsx`, 249 lines)로 처리하고 있어 통합할 사용자 흐름 자체가 없음 → 가장 작은 변경으로 가장 큰 효과.

차순위: **Option C (blog-core 추출)** — 단, **Option D 후에** 진행하는 것이 자연스러움.

---

## 1. 배경

### 1.1 왜 ARC-001이 감사에 등재되었나
- 감사 Agent E가 `find -name "CardNewsProRenderer*"` 결과 두 파일을 발견 (public-app 1772 / next-app 3293).
- props 시그니처가 동일(`slides, theme, onSlidesChange, onThemeChange, learnedTemplate?, cardRatio?, presetStyle?`)하지만 내부 구현이 완전히 다른 기술(Konva vs HTML/CSS)을 사용.
- 두 구현이 함께 유지되면 "한쪽 버그 픽스를 다른 쪽에 자동 적용 불가" 문제가 발생할 것이라 판단해 Critical로 등재.

### 1.2 이 분석에서 새로 발견된 사실
**next-app/components/CardNewsProRenderer.tsx는 현재 dead code**입니다.

근거:
- `grep -rn "import.*CardNewsProRenderer" --include='*.tsx' --include='*.ts'` 결과 단 1건:
  - `/home/user/Winaid-AI/public-app/app/(dashboard)/card_news/page.tsx:15`
- next-app의 `card_news` 라우트(있다면)가 무엇을 쓰는지 별도 확인 필요. 단, **CardNewsProRenderer는 next-app 어디에서도 import되지 않음** (확인됨).

또한 next-app 버전은 다음 6개 기능이 누락됐습니다 (Day 2~5 정비 미반영):
- IndexedDB 폰트 마이그레이션 (Day 2 — public-app은 line 412-435 적용)
- `validateSlideMedicalAd` 배너 (Day 5 — public-app line 888-901)
- Undo/Redo 스택 (`undoStackRef`/`redoStackRef`, MAX=30)
- savePost / postStorage 연동
- 슬라이드쇼 풀스크린 미리보기
- 카드뉴스 → 쇼츠 변환 트리거

즉 next-app 버전은 정비 라운드 이전 스냅샷을 그대로 보존한 상태이며, 단순 비교 대상으로 부적합.

### 1.3 분기 시점 / 분기 사유
- 본 저장소 git history는 매우 얕음 (`git log --all | wc -l` = 60, 가장 오래된 커밋이 2026-05-03 추정). 외부 작업 후 import된 모노레포로 추정.
- `git log --follow`로 두 파일의 첫 추가(`--diff-filter=A`) 커밋 추적 불가 — **분기 시점/사유는 git history만으로는 확인 불가**.
- CHANGELOG.md 근거:
  - Day 2: "CardNewsProRenderer 쇼츠 변환 unmount cleanup", "fontStorage IndexedDB 마이그레이션" — public-app에만 적용
  - Day 5: "CardNewsProRenderer 상단 배너 validateSlideMedicalAd 기반 교체" — public-app에만 적용
  - 즉 정비 라운드는 public-app만 대상. next-app 버전은 그대로 두고 "건드리지 않음" 정책으로 보임.
- README.md에 "fabric.js 7 (캔버스 편집)" 표기 — 코드/의존성에 `fabric` 0건. README가 stale (별도 fix 필요).

---

## 2. 현재 상태 (사실 자료)

### 2.1 두 렌더러 비교

| 항목 | public-app (Konva) | next-app (HTML/CSS) |
|---|---|---|
| 파일 line | 1772 | 3293 |
| 활성 호출처 | `card_news/page.tsx:15, 1827` (운영 중) | **0건 (dead code)** |
| 캔버스 라이브러리 | `react-konva ^19.2.3`, `konva ^10.2.5` | `html2canvas ^1.4.1` (동적 import) |
| 폰트 저장소 | IndexedDB (`fontStorage.ts`, Day 2 마이그) | localStorage (Day 2 이전) |
| 의료광고법 배너 | `validateSlideMedicalAd` (Day 5) | 없음 |
| Undo/Redo | 있음 (MAX=30) | 없음 |
| 슬라이드쇼 | 있음 (`renderSlide` HTML/CSS, 4초 자동) | 없음 |
| 쇼츠 변환 트리거 | 있음 (`captureAllKonvaStagesAsBlobs`) | 없음 |
| 글로벌 AI 채팅 | 있음 (line 124-175) | 없음 |
| customElements / 로고 | 있음 | 없음 |
| AI 액션 | `lib/cardAiActions.ts`로 추출 | 컴포넌트 내 인라인 (5개 함수) |
| 1080×1080 캡처 방식 | `Stage.toDataURL({pixelRatio: 2})` 네이티브 | DOM cloneNode → 화면 밖 마운트 → `html2canvas(scale: 2, useCORS)` |

### 2.2 props 시그니처 동등성
```
slides: SlideData[]
theme: CardNewsTheme
onSlidesChange: (slides: SlideData[]) => void
onThemeChange: (theme: CardNewsTheme) => void
learnedTemplate?: ...
cardRatio?: '1:1' (기본)
presetStyle?: DesignPresetStyle
```
**byte-identical** (`@winaid/blog-core` 공유 타입 사용).

### 2.3 다운로드 / 공유 경로

| 경로 | public-app | next-app |
|---|---|---|
| PNG | `Stage.toDataURL({mimeType: 'image/png', pixelRatio: 2})` (cardDownloadUtils:50-76) | `html2canvas` → `canvas.toDataURL('image/png')` (line 707) |
| JPG | `downloadKonvaStageAsJpg` (cardDownloadUtils:50-76) | **없음** (UI 자체 부재) |
| PDF | `jsPDF + stage.toDataURL → pdf.addImage` (cardDownloadUtils:146-165) | **없음** (`jspdf` 의존성 자체가 next-app/package.json에 없음) |
| ZIP | `JSZip + Konva.toDataURL` (cardDownloadUtils:126-143) | `JSZip + html2canvas + canvas.toBlob` (line 737-760) |
| 카드뉴스 → 쇼츠 | `/api/video/card-to-shorts` 호출 (public-app만 존재) | **호출 코드 없음 + API 라우트도 없음** (`next-app/app/api/video/` 디렉토리 자체 부재) |
| 슬라이드쇼 | `renderSlide(current)` (HTML/CSS, line 1631-1706) | **없음** |

### 2.4 16종 레이아웃
- 정의 파일: `packages/blog-core/src/cardNewsLayouts.ts` (`SlideLayoutType` 유니온, `LAYOUT_LABELS`, `COVER_TEMPLATES`)
- 양쪽 앱이 모두 `@winaid/blog-core`에서 import → **이미 단일 진실원천**, 추가 동기화 비용 0
- 디자인 학습 템플릿: `lib/cardNewsDesignTemplates.ts` 양쪽 byte-identical (Agent E 매핑 표 확인)
- 렌더 switch 분기는 양쪽 모두 16종 동일 매핑(default → `renderInfo`)
- 같은 입력 → 같은 출력 보장 여부: **확인 어려움** (각 `renderXxx` 함수의 inline-style/구도/폰트 자동계산 로직이 두 파일에 별도로 존재)

### 2.5 의존성 차이

| 패키지 | public-app | next-app |
|---|---|---|
| `konva` | ^10.2.5 | 없음 |
| `react-konva` | ^19.2.3 | 없음 |
| `html2canvas` | 없음 | ^1.4.1 |
| `jspdf` | ^4.2.1 | 없음 |
| `jszip` | ^3.10.1 | ^3.10.1 |
| `dompurify` | ^3.3.3 | ^3.3.3 |

---

## 3. 옵션 비교

> **주의**: 감사 보고서의 원래 Option A/B/C는 "두 활성 렌더러가 있다"는 가정에 기반했습니다.
> next-app이 dead code라는 사실이 확인되어 Option D를 추가하고 평가를 갱신했습니다.

### Option A: Konva 통일 (next-app → public-app 패턴)

원래 감사 권고. next-app에 Konva 의존성을 추가하고 public-app 버전을 복제.

- **변경되는 파일**:
  - 제거: `next-app/components/CardNewsProRenderer.tsx` (-3293 lines)
  - 추가: 신규 `next-app/components/CardNewsProRenderer.tsx` (~1772 lines, public-app 동등)
  - 추가: `next-app/components/card-news/` 디렉토리 (`SlideRenderers.tsx` 1704, `KonvaSlideEditor.tsx` 419, `SlideEditor.tsx` 1770, `EditorWidgets.tsx`, `BrandPresetEditor.tsx`, `card-news/konva/{KonvaHelpers,KonvaLayoutBasic,KonvaLayoutGrid,KonvaLayoutList}.tsx`) — **합계 약 5,000+ lines 이전**
  - 추가: `next-app/lib/`에 `cardDownloadUtils.ts`(165), `cardAiActions.ts`, `cardStyleUtils.ts`, `fontStorage.ts`, `medicalAdValidation.ts`, `videoStorage.ts`, `postStorage.ts` 추가
  - `next-app/package.json`에 `konva ^10.2.5`, `react-konva ^19.2.3`, `jspdf ^4.2.1` 추가
  - next-app에 `/api/video/card-to-shorts` 라우트 신설 (쇼츠 변환 작동시키려면)
- **사용자 영향**: next-app에서 호출처 0건 → 즉시 영향 없음. 단 미래에 next-app이 카드뉴스 기능을 켤 때 사용 가능.
- **잃는 것**: html2canvas 의존성 제거(다른 곳 사용처 미확인 — 별도 grep 필요)
- **얻는 것**: 두 앱 동일한 렌더 + 다운로드 파이프 공유. 정비 6건 자동 반영.
- **리스크**: 2/5 (호출처가 없어 회귀 표면 작음. 단 import 경로 정정 + 의존 컴포넌트 5,000+ lines 이전 작업 필요)
- **작업 추정**: 확인 어려움 — LOC 기반으로는 큰 작업이지만 인-day 변환은 작업자 컨텍스트 의존

### Option B: HTML/CSS 통일 (public-app → next-app 패턴)

public-app에서 Konva를 제거하고 next-app 패턴(html2canvas)으로 교체.

- **변경되는 파일**:
  - 제거: `public-app/components/CardNewsProRenderer.tsx` (Konva 부분만, ~1772 → 단순화)
  - 제거: `public-app/components/card-news/KonvaSlideEditor.tsx` (419)
  - 제거: `public-app/components/card-news/konva/` 4 파일
  - 제거 + 재작성: `public-app/lib/cardDownloadUtils.ts` (165 lines, html2canvas 기반으로 다시 작성)
  - 추가: public-app에서 잃는 6개 기능을 next-app 패턴에 추가 ← 결국 next-app 파일을 1.x배로 부풀려야 함
  - `public-app/package.json`에 `html2canvas ^1.4.1` 추가, `konva/react-konva` 제거
- **사용자 영향**: **운영 중인 활성 라우트 직접 영향**. 회귀 위험 큼.
- **잃는 것**:
  - Konva 기반 인터랙티브 편집기 (텍스트 셀렉트/드래그/Transformer/배경 이미지 합성 등 — `KonvaSlideEditor` 419 LOC + `konva/` 4 파일 분량)
  - PDF 출력 품질 (Konva native `Stage.toDataURL` → html2canvas는 CSS filter / 폰트 / cross-origin / overflow에 알려진 한계)
- **얻는 것**: 의존성 1개 감소 (konva, react-konva 제거)
- **리스크**: 4/5 (활성 사용자 흐름 직접 영향 + html2canvas의 1080×1080 픽셀 동등성이 별도 검증 필요)
- **작업 추정**: 확인 어려움 — 회귀 검증 비용까지 포함하면 가장 큼

### Option C: packages/blog-core 추출 + 양쪽 공유

렌더 함수와 다운로드 유틸을 blog-core로 이전 후 양쪽에서 import.

- **추출 대상 (실제 LOC)**:
  - `card-news/SlideRenderers.tsx` (1704) → `@winaid/blog-core/cardNewsRenderers`
  - `cardDownloadUtils.ts` (165) → `@winaid/blog-core/cardDownload` (konva peerDependency)
  - `cardStyleUtils.ts`, `cardAiActions.ts`, `medicalAdValidation.ts` → 추출 후보
  - **이미 blog-core에 있는 것**: `LAYOUT_LABELS, SlideLayoutType, SlideData, CardNewsTheme, COVER_TEMPLATES, CARD_FONTS, getCardFont, FONT_CATEGORIES, SLIDE_IMAGE_STYLES, generateSlideId` — 추가 추출 0
- **선결조건**: 두 구현이 다른 상태에서는 추출이 부적절. **Option A 또는 D 후에 진행하는 것이 자연스러움**.
- **리스크**: 3/5 (피처 동일하지만 react-konva의 SSR 회피 처리(`dynamic`)가 패키지 경계에서 깨질 가능성 — 패키지에서 어떻게 노출할지 설계 필요)
- **작업 추정**: 확인 어려움 — 단 import 경로 치환 + workspace 의존성 등록은 작은 편

### Option D: next-app 죽은 렌더러 삭제 (이번 분석에서 추가)

next-app/components/CardNewsProRenderer.tsx가 dead code임을 확인했으므로 그냥 삭제.

- **변경되는 파일**:
  - 삭제: `next-app/components/CardNewsProRenderer.tsx` (-3293 lines)
  - 검증: next-app에서 다른 곳이 정말 import 안 하는지 한 번 더 grep (이미 0건 확인됨)
  - 검증: next-app/package.json에서 `html2canvas ^1.4.1`이 다른 사용처 있는지 (별도 grep 필요 — 만약 dead 의존성이라면 함께 제거)
- **사용자 영향**: 0 (호출처 없음)
- **잃는 것**: 미래에 next-app이 카드뉴스 기능을 켜야 할 때 참고할 옛 스냅샷 — 하지만 6개 정비가 누락된 stale 코드라 참고가치 낮음. git history에서 언제든 복원 가능.
- **얻는 것**: 코드베이스 -3293 lines 즉시 감소. ARC-001 위험("한쪽 버그 픽스를 다른 쪽에 자동 적용 불가")이 즉시 해소.
- **리스크**: 1/5 (호출처 0건, 회귀 표면 사실상 없음)
- **작업 추정**: 1~2시간 (검증 grep + 삭제 커밋 + Draft PR)

---

## 4. 비교표 종합

| 기준 | A. Konva 통일 | B. HTML/CSS 통일 | C. blog-core 추출 | D. dead 삭제 |
|---|---|---|---|---|
| 코드 변경량 (LOC) | +5000 / -3293 | -2000 / +3000 (재작성) | -1869 / +1869 (이전) | -3293 / +0 |
| PDF 출력 품질 | 유지 (Konva native) | **저하 위험** (html2canvas 한계) | 유지 (추출 후 재참조) | 영향 없음 |
| 폰트 임베딩 | 유지 (IndexedDB) | 재구현 필요 | 유지 | 영향 없음 |
| 한글 자간/줄간격 충실도 | 유지 (Konva text) | 재검증 필요 | 유지 | 영향 없음 |
| 쇼츠 변환 호환성 | next-app에 라우트 추가 필요 | public-app 활성 → 깨질 위험 | 유지 | 영향 없음 |
| 모바일 성능 | Konva 가속 (Canvas) | DOM 무거움 | 동일 (참조만 변경) | 영향 없음 |
| 16종 레이아웃 재구현 비용 | 기 추출됨 (blog-core) | 기 추출됨 | 기 추출됨 | 비용 0 |
| 픽셀 일치 (사용자 보던 것 그대로) | 유지 | **재검증 필요** | 유지 | 유지 |
| 회귀 위험 | 2/5 | 4/5 | 3/5 | **1/5** |
| 작업 추정 시간 | 큼 (확인 어려움) | 가장 큼 (확인 어려움) | 중간 (확인 어려움) | **1~2시간** |
| 사용자 흐름 영향 | 0 (next-app dead) | 활성 라우트 직격 | 0 (참조 치환만) | 0 |

---

## 5. 결정 후보 권고

### 1순위: Option D (next-app 죽은 렌더러 삭제)

**근거**:
1. next-app/components/CardNewsProRenderer.tsx는 어디서도 import되지 않는 dead code (`grep -rn "import.*CardNewsProRenderer"` 결과 1건, public-app에서만)
2. next-app 버전은 Day 2~5 정비 6건이 미반영된 stale 스냅샷 — 통합/추출 베이스로 부적합
3. 삭제로 인한 사용자 흐름 영향 0 (호출처 0건)
4. ARC-001 위험("한쪽 버그 픽스를 다른 쪽에 자동 적용 불가")이 가장 작은 비용으로 즉시 해소
5. 미래에 next-app이 카드뉴스 기능을 켜야 할 때는 (a) git history에서 복원하거나 (b) 그 시점에 public-app/blog-core에서 import 도입 — 어느 쪽이든 stale 옛 코드를 디스크에 보존할 가치보다 큼

### 2순위: Option C (blog-core 추출) — 단, Option D 후에

**근거**:
1. 이미 `@winaid/blog-core`에 카드뉴스 핵심 타입/상수가 들어가 있어 인프라 정착
2. `cardNewsDesignTemplates.ts`가 이미 byte-identical → 즉시 이전 가능
3. 미래에 next-app이 카드뉴스 기능을 도입할 때, public-app과 동일 동작이 보장됨
4. 단, **현재 두 구현이 분기된 상태에서 추출은 부적절** — 먼저 Option D로 dead 코드를 정리한 후, 추출 작업을 별도 PR로 진행하는 것이 자연스러움
5. SSR 회피(`dynamic(() => import('./KonvaSlideEditor'), { ssr: false })`)가 패키지 경계에서 깨질 가능성에 대한 설계 검토가 선행 필요

### Option A는 보류 권고
- next-app이 카드뉴스 기능을 활성화할 계획이 명시되어 있지 않은 한, 5,000+ LOC 이전 비용은 정당화 어려움
- 활성화 시점이 오면 그때 Option C(추출 + 양쪽 import)로 진행이 더 깔끔

### Option B는 비권장
- 활성 사용자 흐름을 위험에 노출하는 데 비해 얻는 것이 작음 (의존성 1개 감소 vs 회귀 위험 + 픽셀 동등성 재검증)
- html2canvas의 폰트/CSS filter/cross-origin 한계가 1080×1080 카드뉴스 품질을 직격할 수 있음

---

## 6. 결정 후 후속 작업 (참고)

### Option D 적용 시
- 제거되는 코드: 3293 lines (`next-app/components/CardNewsProRenderer.tsx`)
- 추가 검증 권장:
  - `grep -rn "html2canvas" next-app/` — 다른 사용처 없으면 `package.json`에서도 제거
  - next-app `card_news` 라우트(있다면)가 무엇을 쓰는지 별도 확인 + 정리
- 픽셀 회귀 검증: 불필요 (사용자가 보던 화면에 변화 없음)
- 이후 PR #2B에서 함께 다룰지, 단독 PR로 분리할지 결정 필요

### Option D + C 순차 적용 시 (권장 경로)
1. PR #2B-D (Option D): next-app 죽은 렌더러 삭제 — 작은 PR, 빠른 머지
2. PR #2C (Option C): public-app → blog-core 추출 — 별도 큰 작업, 회귀 검증 필요
3. 통일 후 남는 차이점: 없음 (단일 구현)

### 픽셀 회귀 검증 방법 권고 (Option C 진행 시)
- Playwright visual regression 테스트 추가 (16종 레이아웃 × 1~2개 샘플 슬라이드)
- public-app 빌드 결과 PNG와 추출 후 PNG를 pixelmatch로 비교 (threshold 0.1%)
- 폰트 캐시 워밍업 + 1080×1080 고정 픽셀 비율로 캡처

---

## 7. 미확인 / 후속 조사 필요

이 ADR 작성 중 확인 못 한 항목:

1. **분기 시점/사유 (git history)**: 본 저장소 git history가 60 commits로 매우 얕음 (2026-05-03 시작). 외부 작업 후 import된 모노레포로 추정. fabric→konva 전환 시점/PR 번호는 git만으로 확인 불가.
2. **README "fabric.js 7" 표기**: 실제 코드에 `fabric` 0건. README가 stale — 별도 fix 필요 (이번 ADR 범위 밖).
3. **next-app `html2canvas` 다른 사용처**: dead 의존성인지 별도 grep 필요. Option D 진행 시 함께 정리.
4. **next-app/lib/authFetch.ts vs public-app/lib/authFetch.ts diff**: 본 분석에서 비교 안 함 — 다른 ARC-XXX 이슈 범위.
5. **`/api/video/card-to-shorts` 라우트의 next-app 추가 필요성**: next-app 카드뉴스 기능 활성화 계획이 없으면 불필요.
6. **`next-app/lib/cardTemplateService.ts` ↔ `public-app/lib/cardTemplateService.ts` diff**: Option C 추출 시 추가 확인 필요.
7. **html2canvas의 1080×1080 픽셀 동등성**: Option B 진행 시 별도 검증 필요. Option D 단독 진행이라면 무관.
8. **작업 추정 시간 (인-day)**: LOC 기반은 가능하나 인-day 변환은 작업자 컨텍스트 의존이라 추측 회피.

---

## 8. 사용자 결정 요청

다음 중 하나를 PR 코멘트로 남겨주세요:

- **D**: next-app 죽은 렌더러 삭제 (권고)
- **D + C**: D 먼저, 후속 PR로 blog-core 추출 (권고 경로)
- **A**: Konva 통일 (next-app에 카드뉴스 활성화 계획이 있는 경우)
- **B**: HTML/CSS 통일 (Konva를 제거해야 하는 외부 사정이 있는 경우)
- **C 단독**: blog-core 추출만 (현재 두 구현 분기 상태에서 진행은 비권장)
- **보류**: 추가 정보 수집 후 재결정

결정 후 PR #2B 패치 프롬프트를 작성하겠습니다.
