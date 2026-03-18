# 앱 셸 목표 아키텍처

## 현재 App 구조

```
App.tsx (1,180줄)
  ├─ 상태: currentPage, auth, darkMode, cardNews, generation...
  ├─ 라우팅: getPageFromPath() + window.location
  ├─ 인증: Supabase session + onAuthStateChange
  ├─ 사이드바 렌더링 (데스크톱 + 모바일 헤더)
  ├─ 콘텐츠 영역 조건부 렌더링
  │   ├─ Landing
  │   ├─ Auth
  │   ├─ Admin
  │   ├─ Home 대시보드
  │   ├─ 콘텐츠 탭 (blog/card_news/press) + InputForm + ResultPreview
  │   ├─ 도구 화면 (history/image/refine)
  │   └─ 에러 모달 + 플로팅 요소
  └─ 14개 lazy-loaded 컴포넌트
```

### 현재 문제
- App.tsx에 라우팅+레이아웃+상태+인증+사이드바가 전부
- 새 화면(billing, settings) 추가 시 App.tsx가 더 커짐
- 사이드바가 App.tsx 안에 인라인 (130줄+)
- 홈 대시보드가 App.tsx 안에 인라인 (160줄+)
- 인증 로직과 화면 렌더링이 같은 파일

## 목표 화면 구조

```
App.tsx (얇은 셸)
  ├─ AuthProvider (이미 존재: contexts/AuthContext.tsx)
  ├─ AppProvider (이미 존재: contexts/AppContext.tsx)
  └─ PageRouter
       ├─ Landing     → LandingPage
       ├─ Auth        → AuthPage
       ├─ Admin       → AdminPage
       └─ AppShell (인증 필요한 화면들의 공통 레이아웃)
            ├─ Sidebar (추출)
            ├─ MobileHeader (추출)
            └─ ContentArea
                 ├─ Home           → HomeDashboard (추출)
                 ├─ Generate       → GeneratePage (InputForm + ResultPreview)
                 ├─ History        → PostHistory
                 ├─ Image          → ImageGenerator
                 ├─ Refine         → ContentRefiner
                 ├─ Account/Auth   → (3/29 자리)
                 └─ Billing        → (3/29 자리)
```

## 페이지/영역 책임

| 영역 | 파일 | 책임 |
|------|------|------|
| App.tsx | src/App.tsx | 프로바이더 + 페이지 라우터만 |
| AppShell | src/components/layout/AppShell.tsx | 사이드바 + 콘텐츠영역 레이아웃 |
| Sidebar | src/components/layout/Sidebar.tsx | 네비게이션 + 다크모드 + 유저메뉴 |
| HomeDashboard | src/components/HomeDashboard.tsx | 홈 대시보드 (퀵서치 + 카드) |
| GeneratePage | 기존 InputForm + ResultPreview 조합 | 생성 입력 + 결과 표시 |
| Account | (3/29 추가) | 프로필 + 구독 + 크레딧 |
| Billing | (3/29 추가) | 결제 + 플랜 |

## Auth/Billing/History 자리

### Auth (이미 존재)
- `AuthPage.tsx` — 로그인/회원가입
- `contexts/AuthContext.tsx` — 인증 상태 관리
- 3/29: 인증 필수 화면에 가드 추가

### Billing (3/29 자리)
- AppShell 내부에 `billing` 라우트 추가
- 사이드바에 메뉴 항목 추가
- `creditService.ts`(이미 존재) 연결

### History (이미 존재)
- `PostHistory.tsx` — 기존 컴포넌트
- AppShell 내부 `history` 라우트 (이미 존재)

## 마이그레이션 단계

### Step 1: 사이드바 추출
- App.tsx lines 531-658 → `src/components/layout/Sidebar.tsx`
- 모바일 헤더도 함께 → `src/components/layout/MobileHeader.tsx`
- App.tsx에서 import로 교체
- 동작 변경 없음

### Step 2: 홈 대시보드 추출
- App.tsx lines 723-882 → `src/components/HomeDashboard.tsx`
- quickInput 상태와 함께 이동
- App.tsx에서 import로 교체

### Step 3: AppShell 레이아웃 추출
- 사이드바 + 콘텐츠영역 래퍼 → `src/components/layout/AppShell.tsx`
- App.tsx는 페이지 라우팅만 담당

### Step 4: 검증
- 빌드/타입체크
- 네비게이션 동작 확인
- 모바일 레이아웃 확인
- App.tsx 줄 수 감소 확인

## 추출하지 않는 것

- 인증 로직 (이미 AuthContext에 있음, App.tsx의 것은 세션 체크 + 리다이렉트)
- useContentGeneration / useCardNewsWorkflow 훅 사용 (App.tsx에서 유지)
- 에러 모달 (AppShell에 포함)
- 토스트/플로팅 요소 (AppShell에 포함)
