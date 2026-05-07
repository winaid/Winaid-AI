# Public / Internal / Shared 분류표 및 이동 계획

> ⚠️ **이 문서는 2026-03-21 기준 계획서이며, 현재 구조와 다릅니다.**
> 실제로는 `packages/shared/` monorepo 구조로 가지 않고 **`public-app/`을 별도 포크**로 유지하는 방향으로 진행되었습니다.
> 현재 아키텍처: [루트 README](../README.md#저장소-구조) 참고.
> 이 문서는 역사적 의사결정 기록용으로 보존합니다.

> 작성 기준: next-app 현재 상태 (2026-03-21)
> 목적: 하나의 코드베이스에서 public(외부 배포) / internal(회사 내부) 두 사이트로 분리 가능한 구조 확정

---

## 1. 현재 구조 기준 분류표

### 페이지 (app/)

| 경로 | 현재 상태 | 분류 | 근거 |
|------|----------|------|------|
| `/` (landing) | stub | **public** | 외부 사용자 첫 진입점 |
| `/auth` | done | **shared** | 양쪽 모두 인증 필요, role 기반 분기 |
| `/app` (dashboard) | done | **public** | 고객 워크스페이스 메인 |
| `/blog` | done | **public** | 핵심 제품 기능 — 블로그 생성 |
| `/card_news` | stub | **public** | 핵심 제품 기능 — 카드뉴스 생성 |
| `/press` | stub | **public** | 핵심 제품 기능 — 보도자료 생성 |
| `/refine` | stub | **public** | 고객 도구 — AI 보정 |
| `/image` | stub | **public** | 고객 도구 — 이미지 생성 |
| `/history` | done | **public** | 고객 본인 이력 조회 |
| `/admin` | stub | **internal** | 관리자 전용 (전체 포스트 관리, 통계, 사용자 관리) |

### API (app/api/)

| 경로 | 현재 상태 | 분류 | 근거 |
|------|----------|------|------|
| `/api/gemini` | done | **shared** | 생성 핵심 — 양쪽에서 호출 가능 |
| `/api/auth/verify` | 미생성 | **shared** | 인증 검증 |
| `/api/naver/search` | 미생성 | **internal** | 내부 리서치 도구 |
| `/api/naver/keyword-stats` | 미생성 | **internal** | 내부 키워드 분석 |
| `/api/naver/crawl-*` (3개) | 미생성 | **internal** | 내부 크롤링 도구 |
| `/api/naver-news` | 미생성 | **internal** | 내부 뉴스 수집 |
| `/api/google/search` | 미생성 | **internal** | 내부 검색 도구 |
| `/api/medical-law/*` (2개) | 미생성 | **shared** | 의료법 참고 — 생성 시 참조 가능 |
| `/api/crawler` | 미생성 | **internal** | 내부 범용 크롤러 |
| `/api/web-search/search` | 미생성 | **internal** | 내부 웹 검색 |

### 라이브러리 (lib/)

| 파일 | 분류 | 근거 |
|------|------|------|
| `supabase.ts` | **shared** | DB 클라이언트 — 양쪽 공통 |
| `auth.ts` | **shared** | 인증 로직 — 양쪽 공통 |
| `types.ts` | **shared** | 타입 정의 — 양쪽 공통 |
| `constants.ts` | **shared** | 폼 상수 (페르소나, 톤 등) — 생성 기능 공통 |
| `blogPrompt.ts` | **shared** | 프롬프트 조립 — 생성 기능 공통 |
| `postStorage.ts` | **shared** | 저장/조회 — 양쪽에서 사용 |
| `teamData.ts` | **internal** | 팀/병원 매핑 데이터 — 내부 운영 정보 |

### 컴포넌트 (components/)

| 파일 | 분류 | 근거 |
|------|------|------|
| `Sidebar.tsx` | **public** | 고객 대시보드 네비게이션 (internal은 별도 nav 필요) |
| `MobileHeader.tsx` | **public** | 고객 모바일 UI |

### 훅 (hooks/)

| 파일 | 분류 | 근거 |
|------|------|------|
| `useAuthGuard.ts` | **shared** | 인증 가드 — 양쪽 공통 |

---

## 2. 최종 목표 폴더 구조

```
Hospital-AI/
├── apps/
│   ├── public/                    ← 외부 배포용 Next.js 앱
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx           ← 랜딩
│   │   │   ├── auth/page.tsx      ← shared/auth 사용
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx     ← Sidebar, MobileHeader
│   │   │   │   ├── app/page.tsx
│   │   │   │   ├── blog/page.tsx
│   │   │   │   ├── card_news/page.tsx
│   │   │   │   ├── press/page.tsx
│   │   │   │   ├── refine/page.tsx
│   │   │   │   ├── image/page.tsx
│   │   │   │   └── history/page.tsx
│   │   │   └── api/
│   │   │       └── gemini/route.ts  ← shared에서 import
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   └── MobileHeader.tsx
│   │   ├── next.config.ts
│   │   └── package.json
│   │
│   └── internal/                  ← 회사 내부용 Next.js 앱
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── auth/page.tsx      ← shared/auth 사용 (관리자 role 체크)
│       │   ├── admin/page.tsx
│       │   ├── analytics/         ← 향후: 사용량/통계
│       │   ├── team-management/   ← 향후: 팀/병원 관리
│       │   └── api/
│       │       ├── naver/
│       │       ├── google/
│       │       ├── crawler/
│       │       └── web-search/
│       ├── components/
│       │   └── AdminSidebar.tsx
│       ├── next.config.ts
│       └── package.json
│
├── packages/
│   └── shared/                    ← 공통 패키지
│       ├── lib/
│       │   ├── supabase.ts
│       │   ├── auth.ts
│       │   ├── types.ts
│       │   ├── constants.ts
│       │   ├── blogPrompt.ts
│       │   └── postStorage.ts
│       ├── hooks/
│       │   └── useAuthGuard.ts
│       └── package.json
│
├── sql/                           ← DB 마이그레이션 (변경 없음)
├── src/                           ← old Vite 앱 (parity 확인 전 유지)
└── next-app/                      ← 현재 작업 디렉토리 (전환 완료 후 제거)
```

---

## 3. 왜 이렇게 나누는가

| 결정 | 이유 |
|------|------|
| **monorepo (apps/ + packages/)** | 코드베이스 하나 유지 요구사항 충족. turborepo 또는 pnpm workspace로 관리 |
| **shared를 packages/로 분리** | lib/, hooks/는 양쪽에서 import. 복사하면 drift 발생. 패키지로 뽑아야 단일 소스 유지 |
| **teamData는 internal** | 팀 매핑, 병원 목록, 매니저 정보는 내부 운영 데이터. public에 노출하면 안 됨 |
| **크롤러/검색 API는 internal** | 네이버/구글 크롤링은 내부 리서치 도구. 외부 고객에게 직접 노출할 이유 없음 |
| **gemini API는 shared** | 생성 기능의 핵심. public에서 직접 호출하되, internal에서도 테스트/디버깅용으로 사용 |
| **auth는 shared + role 분기** | 인증 자체는 동일 Supabase. public은 일반 사용자, internal은 admin role 체크 추가 |

---

## 4. 1차 이동 순서

지금 `next-app`에서 바로 monorepo로 가면 범위가 너무 크다.
**단계적 전환 순서**:

### Phase 0: 현재 (지금)
- `next-app` 안에서 기능 이관 계속 (card_news, press 등)
- **이 문서를 기준으로 새 파일 작성 시 분류를 의식**
- shared 후보 파일에는 외부 의존(teamData 등) 섞지 않기

### Phase 1: shared 추출 준비
- `next-app/lib/` 안에서 shared 후보 파일의 import 경로 정리
- teamData.ts 의존을 blog/page.tsx 등에서 직접 import → prop/context로 전환
- 목표: shared 후보 파일이 `next-app` 내부 파일에 의존하지 않는 상태

### Phase 2: monorepo 전환
- pnpm workspace + turborepo 설정
- `packages/shared/` 생성, lib/ + hooks/ 이동
- `apps/public/` = 현재 next-app (rename)
- `apps/internal/` = 새 Next.js 앱 (admin + 크롤러 API만 이동)

### Phase 3: internal 분리
- `/admin` 페이지를 `apps/internal/`로 이동
- naver/google/crawler API를 `apps/internal/api/`로 이동
- internal 전용 Sidebar/Layout 작성

### Phase 4: old 제거
- public parity 확인 완료 후 `src/` (old Vite 앱) 삭제
- `next-app/` 디렉토리명 → `apps/public/`으로 최종 확정

---

## 5. /card_news 판단: public 직행 vs internal 선검증

**결론: public 직행**

| 판단 기준 | /card_news |
|----------|-----------|
| 핵심 제품 기능인가? | O — 블로그와 동급 |
| 외부 고객이 직접 쓰는가? | O — 고객이 카드뉴스 생성 |
| internal 전용 데이터 필요? | X — gemini API + 동일 폼 구조 |
| /blog와 구조적으로 동일? | O — GenerateWorkspace 패턴 동일 |

따라서 `/card_news`는:
1. `next-app/app/(dashboard)/card_news/page.tsx`에 바로 구현
2. `postStorage.savePost({ postType: 'card_news', ... })` 사용
3. `/history`에서 `post_type` 필터로 자동 표시
4. internal 선검증 불필요 — /blog와 동일한 검증 완료된 흐름 사용

**예외**: 만약 카드뉴스에 이미지 생성/슬라이드 레이아웃 등 복잡한 기능이 포함된다면,
텍스트 생성만 먼저 public에 올리고, 이미지/레이아웃은 별도 턴에서 추가.

---

## 6. 지금 당장 하지 말아야 할 것 3개

| 하지 말 것 | 이유 |
|-----------|------|
| **monorepo 전환 (turborepo/pnpm workspace 설정)** | 아직 이관할 페이지가 남아있음. 구조만 확정하고, 기능 이관이 80% 이상 끝난 후에 전환해야 작업량이 최소화됨 |
| **internal 앱 생성** | admin 페이지조차 stub. internal에 넣을 실동작 페이지가 0개인 상태에서 앱을 만들면 빈 껍데기만 관리 부담 |
| **teamData.ts를 DB로 이전** | 현재 하드코딩된 팀/병원 데이터를 Supabase로 옮기고 싶겠지만, 지금은 기능 이관이 우선. DB 이전은 모든 페이지 이관 완료 후 |

---

## 분류 기준 요약 (향후 새 기능 추가 시 참조)

```
public에 넣는 기준:
  - 외부 고객이 직접 사용하는 기능
  - 생성/조회/이력 등 제품 핵심 흐름

internal에 넣는 기준:
  - 회사 직원만 사용하는 기능
  - 관리/분석/크롤링/모니터링
  - 고객에게 노출하면 안 되는 데이터 접근

shared에 넣는 기준:
  - 양쪽에서 import하는 유틸리티
  - DB 클라이언트, 인증, 타입, 상수
  - 외부 의존 없이 독립 실행 가능한 모듈
```
