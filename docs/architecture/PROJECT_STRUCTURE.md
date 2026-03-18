# PROJECT_STRUCTURE.md — Hospital-AI 도메인 구조 가이드

> 마지막 업데이트: 2026-03-18 (App 셸 수술 완료 후)

## 전체 도메인 맵

```
src/
├── App.tsx                    ← 앱 셸 (라우팅 + 인증 + 레이아웃 조립만 담당)
├── hooks/
│   ├── useAuth.ts             ← Supabase 인증/세션/OAuth/프로필 관리
│   ├── useRouting.ts          ← 수동 라우팅 캡슐화 (navigateTo, popstate)
│   ├── useContentGeneration.ts← 콘텐츠 생성 상태 머신
│   ├── useCardNewsWorkflow.ts ← 카드뉴스 3단계 워크플로우
│   ├── useResultActions.ts    ← 결과 저장/다운로드/재생성 액션
│   ├── useDocumentExport.ts   ← 문서 내보내기 (HTML/Word/PDF)
│   ├── useAiRefine.ts         ← AI 보정 워크플로우
│   └── useContentQuality.ts   ← 콘텐츠 품질 분석
├── core/
│   └── generation/            ← 생성 파이프라인 공통 계층
├── features/
│   └── template/              ← 템플릿 도메인 (캘린더/스케줄 템플릿)
├── services/                  ← 비즈니스 로직 서비스 계층
│   ├── geminiService.ts       ← Gemini API 중앙 게이트웨이 (레거시, 아직 큼)
│   ├── geminiClient.ts        ← 저수준 HTTP 클라이언트
│   ├── resultAssembler.ts     ← 결과 조립기 (Result 도메인 핵심)
│   ├── cardNewsService.ts     ← 카드뉴스 생성 로직
│   ├── pressReleaseService.ts ← 보도자료 생성
│   ├── calendarTemplateService.ts ← 캘린더 템플릿 엔진 (198KB, lazy)
│   ├── image/                 ← 이미지 생성 서브시스템
│   │   ├── index.ts           ← barrel export (bridge)
│   │   ├── imageOrchestrator.ts
│   │   ├── imageRouter.ts
│   │   └── ...
│   └── ...
├── components/
│   ├── workspace/
│   │   ├── GenerateWorkspace.tsx ← 생성 워크스페이스 (블로그/카드뉴스/보도자료)
│   │   └── ToolWorkspace.tsx    ← 도구 워크스페이스 (유사도/이미지/히스토리)
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── MobileHeader.tsx
│   ├── ResultPreview.tsx      ← 결과 미리보기 (Result 도메인)
│   ├── TemplateGenerator.tsx  ← 템플릿 생성기 (Template 도메인)
│   ├── InputForm.tsx          ← 입력 폼
│   └── ...
├── constants/
│   └── routes.ts              ← 경로 상수 (ROUTES) — single source of truth
└── lib/
    └── supabase.ts            ← Supabase 클라이언트 + signOut
```

## 도메인 구조

### 1. Result 도메인
- **Source of truth**: `services/resultAssembler.ts`
- **UI**: `components/ResultPreview.tsx`, `resultPreviewUtils.ts`
- **액션 훅**: `hooks/useResultActions.ts`
- **역할**: 생성 결과 → HTML 조립 → 미리보기/저장/내보내기

### 2. Template 도메인
- **Source of truth**: `features/template/`
- **엔진**: `services/calendarTemplateService.ts` → `features/template/templateAiEngine.ts`
- **UI**: `components/TemplateGenerator.tsx`, `components/schedule-templates/`
- **bridge**: `schedule-templates/index.ts` (barrel export)
- **역할**: 캘린더/스케줄 템플릿 생성 + AI 채움

### 3. Generation 도메인
- **공통 계층**: `core/generation/`
- **서비스**: `geminiService.ts` (중앙), 각 도메인별 서비스
- **상태 머신**: `hooks/useContentGeneration.ts`
- **역할**: 입력 → Gemini API → 결과 생성

### 4. App Shell
- **셸**: `App.tsx` (279줄) — 인증/라우팅/레이아웃 조립만
- **인증**: `hooks/useAuth.ts` — Supabase 전체 인증 로직
- **라우팅**: `hooks/useRouting.ts` — path 기반 수동 라우팅 캡슐화
- **경로 상수**: `constants/routes.ts`

## Bridge / Re-export 파일

| 파일 | 역할 |
|------|------|
| `services/image/index.ts` | 이미지 서브시스템 barrel export |
| `components/schedule-templates/index.ts` | 스케줄 템플릿 barrel export |

## 레거시 주의점

### `geminiService.ts` (88KB gzip 33KB)
- 아직 여러 생성 타입의 프롬프트 + API 호출이 모여 있음
- 향후 도메인별 서비스로 분리 가능하나, 현재 동작에 문제 없음
- 건드리면 블로그/카드뉴스/보도자료 생성 전체에 영향

### `calendarTemplateService.ts` (198KB gzip 60KB)
- 캘린더 데이터 + 템플릿 로직이 단일 파일
- lazy loading으로 초기 번들에 포함 안 됨
- 향후 데이터와 로직 분리 가능

### 수동 라우팅
- React Router 미도입, `useRouting.ts`에 캡슐화
- 향후 도입 시 이 훅만 교체하면 됨
