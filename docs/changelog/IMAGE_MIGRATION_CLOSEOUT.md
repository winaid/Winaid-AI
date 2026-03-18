# Image Migration Closeout

## 현재 상태: **완료** (2026-03-18)

## 완료 내역

### 삭제된 파일
- `src/services/imageGenerationService.ts` (2,034줄) — 전체 실질 구현 삭제
- `src/services/imageStorageService.ts` (12줄) — root wrapper 삭제

### 전환된 참조
- `pipelineStageC.test.ts` — mock 경로를 image/* 모듈별로 분리
- `geminiService.ts` — 동적 import를 `./image/imageStorageService`로 전환
- `postStorageService.ts` — 정적 import를 `./image/imageStorageService`로 전환

## Source of Truth 표

| 심볼 | 유일한 구현 파일 | SOT |
|------|-----------------|-----|
| `generateSingleImage` | `image/cardNewsImageService.ts` | 단일 |
| `recommendImagePrompt` | `image/cardNewsImageService.ts` | 단일 |
| `recommendCardNewsPrompt` | `image/cardNewsImageService.ts` | 단일 |
| `analyzeStyleReferenceImage` | `image/imageEditService.ts` | 단일 |
| `transformImageStyle` | `image/imageEditService.ts` | 단일 |
| `changeImageBackground` | `image/imageEditService.ts` | 단일 |
| `editImageRegion` | `image/imageEditService.ts` | 단일 |
| `generateBlogImage` | `image/imageOrchestrator.ts` | 단일 |
| `generateImageQueue` | `image/imageOrchestrator.ts` | 단일 |
| `buildStyleBlock` | `image/imagePromptBuilder.ts` | 단일 |
| `buildFrameBlock` | `image/imagePromptBuilder.ts` | 단일 |

## Image 서비스 구조 (최종)

```
src/services/image/ (2,380줄, 9파일)
  ├─ imageTypes.ts (78줄) — 공유 타입, 순환참조 방지
  ├─ index.ts (76줄) — barrel export
  ├─ imageRouter.ts (60줄) — 장면 분류
  ├─ imageFallbackService.ts (77줄) — 템플릿 SVG 폴백
  ├─ imagePromptBuilder.ts (174줄) — 스타일/프레임 블록
  ├─ imageStorageService.ts (201줄) — Supabase 업로드
  ├─ imageOrchestrator.ts (904줄) — 큐/세마포어/통계
  ├─ imageEditService.ts (271줄) — 이미지 편집
  └─ cardNewsImageService.ts (539줄) — 카드뉴스 이미지
```

## Legacy 참조 목록 (잔여)

| 파일 | 유형 | 내용 | 상태 |
|------|------|------|------|
| `image/imageEditService.ts:4` | 주석 | "imageGenerationService.ts에서 분리됨" | 역사 기록, 무해 |
| `image/imageOrchestrator.ts:7` | 주석 | "imageGenerationService.ts에서 추출" | 역사 기록, 무해 |
| `image/cardNewsImageService.ts:4` | 주석 | "imageGenerationService.ts에서 분리됨" | 역사 기록, 무해 |
| `image/imagePromptBuilder.ts:4` | 주석 | "imageGenerationService.ts에서 추출" | 역사 기록, 무해 |

**코드 참조: 0건. 주석만 4건 잔존 (의도적으로 유지 — 히스토리 추적용).**

## 완료 기준

- [x] image 계층 SOT 단일화
- [x] imageGenerationService.ts 삭제
- [x] root imageStorageService.ts wrapper 삭제
- [x] 테스트/mock 새 경로 전환
- [x] 빌드 통과
- [x] 타입체크 통과 (삭제 파일 관련 에러 0건)
- [x] 정적/동적/테스트 코드 참조 0건
