# REBUILD_SUMMARY.md — 구조 수술 요약

> 기간: 2026-03-15 ~ 2026-03-18
> 범위: Result / Template / Generation / App Shell 전면 리팩토링

## 수술 전 상태

| 항목 | Before |
|------|--------|
| `geminiService.ts` | 2,800줄, 모든 도메인 로직이 단일 파일에 집중 |
| `App.tsx` | 674줄, 인증/라우팅/상태/레이아웃 전부 내장 |
| `ResultPreview.tsx` | 1,200줄+, 결과 조립/렌더/저장 혼재 |
| `TemplateGenerator.tsx` | 1,000줄+, 캘린더 엔진+UI 결합 |
| 테스트 | 없음 |
| 도메인 경계 | 없음 (모든 것이 services/와 components/에 flat) |

## 수술 후 상태

| 항목 | After |
|------|-------|
| `geminiService.ts` | 88KB (줄임 + 도메인별 서비스로 일부 분리) |
| `App.tsx` | **279줄** (-59%), 셸 역할만 담당 |
| Result 도메인 | `resultAssembler.ts` + `useResultActions.ts` + 유틸 분리 |
| Template 도메인 | `features/template/` + `templateAiEngine.ts` 분리 |
| Generation 계층 | `core/generation/` 공통 계층 신설 |
| App Shell | `useAuth.ts` + `useRouting.ts` 추출 |
| 테스트 | **9파일 110개 통과** |
| 도메인 경계 | Result / Template / Generation / App Shell 4개 도메인 확립 |

## Giant File 변화

| 파일 | Before | After | 변화 |
|------|--------|-------|------|
| App.tsx | 674줄 | 279줄 | -59% |
| geminiService.ts | ~2800줄 | 유지 (캡슐화) | 향후 분리 대상 |
| ResultPreview.tsx | ~1200줄 | 축소 + 유틸 분리 | 핵심 로직 분리 |
| TemplateGenerator.tsx | ~1000줄 | 축소 + 엔진 분리 | AI 엔진 독립 |
| calendarTemplateService.ts | ~1000줄 | 유지 (lazy) | 데이터/로직 분리 가능 |

## 도메인 분리 내역

### Result 도메인 (Step 1)
- `resultAssembler.ts` — 결과 HTML 조립 로직
- `resultPreviewUtils.ts` — 프리뷰 유틸
- `useResultActions.ts` — 저장/다운로드/재생성 액션
- `useDocumentExport.ts` — 문서 내보내기

### Template 도메인 (Step 2)
- `features/template/templateAiEngine.ts` — AI 채움 엔진
- `components/schedule-templates/` — 12개 템플릿 컴포넌트
- `services/calendarTemplateService.ts` — 캘린더 데이터/로직 (lazy)

### Generation 공통 계층 (Step 3)
- `core/generation/` — 생성 파이프라인 공통 인터페이스
- `hooks/useContentGeneration.ts` — 상태 머신
- `hooks/useCardNewsWorkflow.ts` — 카드뉴스 3단계

### App Shell (Step 4)
- `hooks/useAuth.ts` (149줄) — Supabase 인증 전체
- `hooks/useRouting.ts` (73줄) — 수동 라우팅 캡슐화
- `constants/routes.ts` — 경로 상수 single source of truth
- `App.tsx` — 훅 조립 + 레이아웃만 담당

## 아직 남은 구조 리스크

| 항목 | 리스크 수준 | 설명 |
|------|------------|------|
| `geminiService.ts` | 중 | 여전히 큰 파일. 동작 안정적이므로 급하지 않음 |
| `calendarTemplateService.ts` | 낮음 | 198KB이나 lazy 로딩. 사용 시에만 로드 |
| `index.js` 메인 번들 | 중 | 303KB gzip 96KB. 추가 코드 스플릿 가능 |
| React Router 미도입 | 낮음 | `useRouting.ts`로 캡슐화됨. 필요 시 교체 용이 |
| 에러 모달 인라인 | 낮음 | App.tsx 내 인라인. 컴포넌트 분리 가능 |

## 검증

- **빌드**: 전체 성공
- **테스트**: 9파일 110개 전체 통과
- **번들**: index 303KB, 전체 lazy boundary 정상
- **UX**: 기존 페이지 이동/인증/생성 동작 유지
