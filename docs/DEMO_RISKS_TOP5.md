# 3/30 발표 리스크 Top 5

> 마지막 업데이트: 2026-03-17
> 기준: 현재 코드 기준, 발표 시 사용자 체감 영향 순

---

## 리스크 #1: Stage B 섹션 실패 시 전체 파이프라인 크래시

### 발생 위치
- `geminiService.ts` Stage B (lines 817~937)
- 개별 섹션(인트로/본문/결론) 생성 중 하나라도 실패하면 전체 throw

### 사용자 체감 영향
- **치명적**: 텍스트 전체가 생성되지 않음. 에러 모달만 표시.
- 발표 중 "다시 시도" 누르면 처음부터 재생성 (60초+ 재대기)

### 발생 확률
- 중간. Gemini API가 간헐적 503을 반환하거나 특정 주제에서 safety filter 트리거 시 발생.

### 최소 수정안
**Stage B에서 섹션 레벨 try-catch 추가**

```typescript
// 현재: 섹션 하나 실패 → throw → 전체 실패
// 수정: 실패한 섹션은 "[내용 생성 중 오류]" placeholder로 대체
//       최소 인트로 + 결론이 있으면 결과 반환
```

수정 범위: `geminiService.ts` Stage B 루프 내 try-catch 1개 추가 (~10줄)

### 판정: 🔴 발표 전 반드시 수정

---

## 리스크 #2: UI 레벨 하드 타임아웃 없음 (무한 로딩 가능성)

### 발생 위치
- `useContentGeneration.ts:57` handleGenerate()
- 개별 API 호출에는 timeout이 있지만, 전체 생성 프로세스에는 상위 타임아웃 없음

### 사용자 체감 영향
- **치명적**: 네트워크 행(hang)이나 예상치 못한 지연 시 스피너가 끝없이 돌아감
- 사용자는 "멈췄다"고 판단하고 브라우저를 닫음

### 발생 확률
- 낮음 (개별 timeout이 있어서). 하지만 Stage A→B→C 순차 + 이미지 병렬이 모두 최악 시간을 치면 3분+ 가능.

### 최소 수정안
**handleGenerate()에 전체 타임아웃 래퍼 추가**

```typescript
const TOTAL_TIMEOUT = 150_000; // 2.5분 hard cap
const timeoutId = setTimeout(() => {
  if (isGeneratingRef.current) {
    setState(prev => ({ ...prev, isLoading: false, error: '생성 시간이 초과되었습니다. 다시 시도해주세요.' }));
    isGeneratingRef.current = false;
  }
}, TOTAL_TIMEOUT);

try {
  // ... 기존 로직
} finally {
  clearTimeout(timeoutId);
}
```

수정 범위: `useContentGeneration.ts` 상단에 setTimeout/clearTimeout 추가 (~8줄)

### 판정: 🔴 발표 전 반드시 수정

---

## 리스크 #3: Hero 이미지 PRO 시도로 인한 불필요한 지연

### 발생 위치
- `imageOrchestrator.ts:148-179` resolveStartTier()
- hero 이미지: PRO 사용 가능 시 PRO부터 시도 (30s timeout)
- PRO 실패 → NB2 fallback (추가 25s)

### 사용자 체감 영향
- **중간~높음**: PRO가 503/cooldown이면 hero 이미지만 55초+ 소요
- 나머지 4장은 빠르게 끝났는데 hero만 기다리는 상황

### 발생 확률
- 높음. PRO 모델은 rate limit이 빡빡하고, 동시 사용자가 있으면 cooldown 빈번.

### 최소 수정안
**발표 당일 demoSafe 모드 활성화**

`imageOrchestrator.ts:152`에 이미 `demoSafe` 분기가 있음:
```typescript
if (demoSafe) return 'nb2'; // 항상 NB2 (빠른 경로)
```

`isDemoSafeMode()` 함수가 어떤 조건으로 동작하는지 확인 후:
- 발표 당일 localStorage에 `DEMO_SAFE=true` 설정
- 또는 env variable로 제어

수정 범위: 0줄 (기존 기능 활용). 발표 전 localStorage 설정만 하면 됨.

### 판정: 🟡 발표 전 확인 필요 (코드 수정 불필요, 운영 설정)

---

## 리스크 #4: 거대 파일 수정 시 회귀 버그

### 발생 위치
- `geminiService.ts` (~3,300줄) — 텍스트 생성 전체 로직
- `ResultPreview.tsx` (~2,243줄) — 결과 표시 전체 로직
- `App.tsx` (~1,180줄) — 라우팅/상태 관리

### 사용자 체감 영향
- **치명적**: 한 줄 수정이 다른 경로를 깨뜨림. 발표 전날 hotfix가 새 버그를 만듦.

### 발생 확률
- 높음. 이 파일들은 수백 개의 상호 의존 분기를 갖고 있음.

### 최소 수정안
**3/29 전까지 이 3개 파일의 대규모 수정 금지**

- `geminiService.ts`: Stage B try-catch 추가만 허용 (리스크 #1 수정)
- `ResultPreview.tsx`: 수정 금지
- `App.tsx`: 수정 금지
- 수정 시 반드시 해당 경로 수동 테스트

수정 범위: 0줄 (프로세스 규칙)

### 판정: 🟡 작업 규칙으로 관리

---

## 리스크 #5: 두 번째 생성 시 상태 초기화 불완전

### 발생 위치
- `useContentGeneration.ts:57-110` — handleGenerate() 진입부
- `isGeneratingRef.current` 가드 (line 59)
- 이전 생성 결과가 state에 남아있는 상태에서 새 생성 시작

### 사용자 체감 영향
- **중간**: 발표에서 "두 번째 예시도 보여드리겠습니다" → 생성 안 됨 또는 이전 결과 깜빡임
- 더블클릭 방지 로직이 정상 해제 안 되면 버튼이 영구 비활성

### 발생 확률
- 낮음~중간. 정상 흐름에서는 finally 블록이 `isGeneratingRef.current = false`로 해제.
  하지만 예외 경로(Stage B 크래시 등)에서 finally가 도달하지 않을 가능성 있음.

### 최소 수정안
**handleGenerate() 진입 시 강제 초기화 타이머 추가** (리스크 #2의 hard timeout이 이 문제도 해결)

```typescript
// 리스크 #2의 setTimeout이 isGeneratingRef.current = false를 포함하므로
// 별도 수정 불필요 — 리스크 #2 수정으로 커버됨
```

수정 범위: 리스크 #2 수정에 포함

### 판정: 🟢 리스크 #2 수정으로 자동 해결

---

## 우선순위 요약

| 순위 | 리스크 | 영향 | 수정 난이도 | 판정 |
|------|--------|------|-----------|------|
| 1 | Stage B 섹션 실패 → 전체 크래시 | 치명 | 쉬움 (10줄) | 🔴 반드시 수정 |
| 2 | UI 하드 타임아웃 없음 | 치명 | 쉬움 (8줄) | 🔴 반드시 수정 |
| 3 | Hero PRO 지연 | 중간 | 없음 (설정) | 🟡 발표일 설정 |
| 4 | 거대 파일 회귀 | 치명 | 없음 (규칙) | 🟡 규칙 준수 |
| 5 | 상태 초기화 불완전 | 중간 | 없음 (#2로 해결) | 🟢 자동 해결 |

---

## 코드 수정 총량

발표 안정화를 위해 필요한 코드 수정: **약 18줄**

- 리스크 #1: geminiService.ts에 try-catch 추가 (~10줄)
- 리스크 #2: useContentGeneration.ts에 hard timeout 추가 (~8줄)
- 리스크 #3: 발표일 demoSafe 설정 (코드 수정 0줄)

> 이 이상의 수정은 리스크 #4(회귀)를 초래할 수 있으므로 금지.
