# 3/30 발표용 핵심 데모 플로우

> 마지막 업데이트: 2026-03-17
> 목적: 3/30 내부 발표에서 시연할 대표 플로우 정의 및 안정성 기준

---

## 1. 대표 시연 시나리오

### 시나리오: "치과 임플란트 블로그 글 + 이미지 5장 생성"

| 단계 | 사용자 행동 | 예상 소요 시간 |
|------|------------|--------------|
| 1 | `/app` 또는 `/blog` 접속 | 즉시 |
| 2 | 병원 선택 (드롭다운) | 2초 |
| 3 | 주제 입력: "임플란트 시술 후 관리법" | 5초 |
| 4 | 이미지 수량: 5장, 스타일: illustration | 3초 |
| 5 | "생성" 버튼 클릭 | - |
| 6 | 로딩 화면 (텍스트+이미지 병렬 생성) | 30~90초 |
| 7 | 결과 미리보기 (preview 탭) | 즉시 |
| 8 | HTML 탭 전환으로 편집 가능 확인 | 즉시 |

### 입력 예시

```
병원: (드롭다운 중 아무거나)
주제: "임플란트 시술 후 관리법"
카테고리: 치과
이미지 수량: 5
이미지 스타일: illustration
텍스트 길이: 기본값
```

### 예상 출력

- **텍스트**: 1,500~3,000자 HTML 블로그 본문 (H2/H3 구조, 인트로/본문/결론)
- **이미지**: 5장 (hero 1장 + sub 4장)
  - AI 생성 이미지 또는 템플릿 폴백 혼합 가능
- **탭**: preview / html 전환 가능
- **복사/저장**: HTML 복사 가능

---

## 2. 내부 코드 경로 (호출 체인)

```
[사용자 클릭]
  → InputForm.tsx:128 handleSubmit()
    → useContentGeneration.ts:57 handleGenerate()
      → (크레딧 체크: 현재 SKIP — anonymous 모드)
      → geminiService.ts:3090 generateFullPost()
        → geminiService.ts:642 generateBlogWithPipeline()

[텍스트 생성 — 순차]
  Stage A: Outline (FLASH, 120s timeout)
  Stage B: Intro + Sections + Conclusion (FLASH, 각 30s 내외)
  Stage C: Polish (FLASH, 12s timeout, 재시도 없음)
    → 실패 시 rawHtml 사용 (pre-polish fallback)

[이미지 생성 — Stage C와 병렬]
  imageOrchestrator.ts:generateImageQueue()
    → hero: resolveStartTier() → PRO 또는 NB2
    → sub 4장: 항상 NB2
    → 각 이미지: 30s(hero) / 25s(sub) timeout
    → 실패 시: 템플릿 SVG fallback

[결과 조립]
  → useContentGeneration.ts:177 완전성 검증
  → ResultPreview.tsx 렌더링
```

---

## 3. 타임라인 목표

| 구간 | 목표 | 최악 허용 |
|------|------|----------|
| Stage A (Outline) | 5~15초 | 30초 |
| Stage B (Draft) | 15~30초 | 60초 |
| Stage C (Polish) | 3~8초 | 12초 (초과 시 rawHtml) |
| 이미지 5장 (병렬) | 20~40초 | 60초 |
| **전체 E2E** | **40~60초** | **90초** |

> 90초 초과 시 사용자 체감이 "느리다"에서 "멈췄다"로 전환됨.
> 발표 시연에서는 60초 내 완료가 이상적.

---

## 4. 허용 가능한 실패

| 상황 | 허용 여부 | 사용자 체감 |
|------|----------|-----------|
| Stage C polish 실패 → rawHtml 사용 | ✅ 허용 | 품질 약간 하락, 동작함 |
| 이미지 1~2장 템플릿 폴백 | ✅ 허용 | "일부 이미지 생성 실패" 경고 표시 |
| 이미지 전체 5장 템플릿 폴백 | ⚠️ 주의 | 동작하지만 "AI 이미지 없음" 느낌 |
| hero 이미지만 AI, sub 4장 폴백 | ✅ 허용 | hero가 있으면 충분히 시각적 |
| NB2로 다운그레이드된 hero | ✅ 허용 | 품질 차이 데모에서 눈에 안 띔 |

---

## 5. 허용 불가능한 실패 (발표 중 절대 금지)

| 상황 | 왜 금지인가 | 현재 방어 상태 |
|------|-----------|-------------|
| 전체 생성 실패 (텍스트 없음) | 제품이 동작하지 않는 것처럼 보임 | ⚠️ Stage B 섹션 1개 실패 시 전체 실패 가능 |
| 무한 로딩 (끝나지 않는 스피너) | 가장 나쁜 인상 | ✅ timeout 설정됨, 하지만 UI 레벨 hard-cap 없음 |
| 텍스트 OK인데 UI 멈춤 | race condition | ✅ Promise.allSettled 사용 |
| 이미지 1장 실패로 전체 멈춤 | 과도한 coupling | ✅ 개별 이미지 독립 처리 |
| 로그인/크레딧 에러 메시지 노출 | 미완성 기능 노출 | ✅ anonymous 모드 활성 |
| 콘솔 에러 overflow | 발표자가 DevTools 열면 불안 | ⚠️ 현재 console.warn/error 많음 |

---

## 6. Fallback 규칙 요약

### 텍스트 Fallback
```
Stage C polish 실패
  → rawHtml (Stage B 결과) 그대로 사용
  → finalQualityPath = 'flash_draft_only'
  → 사용자에게 별도 알림 없음 (품질 차이 미미)
```

### 이미지 Fallback
```
AI 이미지 생성 실패 (timeout/503/safety)
  → 같은 tier 재시도 (500~3000ms wait)
  → cross-tier downgrade (PRO→NB2, 즉시)
  → 최종 실패 → SVG 템플릿 fallback
  → wall-time cap: hero 35s, sub 45s
```

### 전체 파이프라인 Fallback
```
generateBlogWithPipeline() 실패
  → 레거시 단일 API 호출 시도 (60s timeout)
  → 그것도 실패 → 에러 모달 표시
```

---

## 7. 인증/크레딧 경계 (3/30 데모 기준)

**현재 상태: anonymous 모드 (안전)**

| 위치 | 상태 | 3/30 데모 영향 |
|------|------|-------------|
| `geminiClient.ts:137-140` | 주석 처리 (anonymous 허용) | ✅ 안전 |
| `useContentGeneration.ts:114-145` | 주석 처리 (크레딧 스킵) | ✅ 안전 |
| `gemini.js:607-610` | anonymous userId 할당 | ✅ 안전 |
| `App.tsx:192` | `isAuthenticated = true` 고정 | ✅ 안전 |

> **경고**: 3/29 작업에서 위 주석을 해제할 때, 반드시 테스트 유저 + 크레딧이 준비된 상태에서 진행해야 함.
> 3/29 전까지 이 파일들의 인증 관련 코드를 건드리지 말 것.

---

## 8. 발표 전 리허설 체크리스트

- [ ] `/app` 접속 → 로딩 없이 폼 표시 확인
- [ ] 주제 입력 후 "생성" → 로딩 스피너 즉시 표시 확인
- [ ] 60초 이내 결과 표시 확인 (최소 텍스트)
- [ ] 이미지 5장 중 최소 3장 AI 이미지 확인
- [ ] preview 탭 ↔ html 탭 전환 확인
- [ ] 에러 발생 시 에러 모달 → "다시 시도" 버튼 작동 확인
- [ ] 두 번째 생성도 정상 동작 확인 (상태 초기화)
- [ ] 콘솔에 `authentication_required` 에러 없음 확인
- [ ] 네트워크 탭에서 Gemini API 503이 fallback 처리되는지 확인
