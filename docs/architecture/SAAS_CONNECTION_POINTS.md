# SAAS_CONNECTION_POINTS.md — SaaS 전환 시 연결 포인트

> 마지막 업데이트: 2026-03-18

## 개요

Hospital-AI는 현재 무료 도구로 동작하지만, SaaS로 전환할 때 아래 포인트에서
기존 코드에 과금/권한/저장 로직을 연결할 수 있다.

---

## 1. 로그인 / 권한

### 현재 상태
- `hooks/useAuth.ts` — Supabase Auth 기반 인증 완비
- 회원가입 시 `profiles` + `subscriptions` 자동 생성
- `plan_type: 'free'`, `credits_total: 3` 기본값

### 연결 포인트
| 위치 | 파일 | 작업 |
|------|------|------|
| 로그인 가드 | `App.tsx:92-96` | `isLoggedIn` 체크로 앱 접근 제한 |
| 권한 레벨 | `useAuth.ts` → `isAdmin` | role 기반 확장 가능 |
| 프로필 | `useAuth.ts:100-115` | 팀/조직 정보 추가 가능 |

### 할 일
- `subscriptions.plan_type`으로 기능 제한 분기 추가
- 관리자/팀 역할 분리 (현재는 admin 하드코딩)

---

## 2. 크레딧 / 과금

### 현재 상태
- `services/creditService.ts` — 크레딧 차감 로직 존재
- `subscriptions` 테이블에 `credits_total`, `credits_used` 필드 존재
- **현재는 실제 차감이 강제되지 않음**

### 연결 포인트
| 위치 | 파일 | 작업 |
|------|------|------|
| 생성 전 크레딧 확인 | `hooks/useContentGeneration.ts` → `handleGenerate` | 크레딧 부족 시 차단 |
| 생성 후 크레딧 차감 | `services/geminiService.ts` → API 호출 성공 후 | 차감 호출 |
| 크레딧 표시 UI | `components/layout/Sidebar.tsx` | 잔여 크레딧 표시 |
| 결제 페이지 | 신규 필요 | Stripe/Toss 연동 |

### 할 일
- `handleGenerate` 앞에 크레딧 확인 가드 추가
- API 호출 성공 시 `creditService.deductCredit()` 호출
- 크레딧 소진 시 업그레이드 안내 UI

---

## 3. 히스토리 / 저장

### 현재 상태
- `services/postStorageService.ts` — Supabase에 생성 결과 저장
- `components/PostHistory.tsx` — 히스토리 목록 표시
- `hooks/useResultActions.ts` — 저장 액션 처리

### 연결 포인트
| 위치 | 파일 | 작업 |
|------|------|------|
| 자동 저장 | `useResultActions.ts` | 생성 완료 시 자동 저장 활성화 |
| 히스토리 필터 | `PostHistory.tsx` | user_id 기반 필터 (이미 구현) |
| 저장 한도 | `postStorageService.ts` | plan별 저장 갯수 제한 |

### 할 일
- 무료 플랜 저장 한도 설정 (예: 10개)
- 유료 플랜 무제한 저장

---

## 4. 결과 재열기 / 재생성

### 현재 상태
- `PostHistory.tsx`에서 저장된 결과 열기 가능
- 재생성은 `useContentGeneration.ts` → `handleGenerate` 재호출

### 연결 포인트
| 위치 | 파일 | 작업 |
|------|------|------|
| 결과 재열기 | `PostHistory.tsx` → 결과 클릭 | 저장된 HTML 렌더링 |
| 재생성 | `useContentGeneration.ts` | 이전 입력값으로 재생성 |
| 버전 관리 | 신규 필요 | 같은 주제의 여러 버전 비교 |

### 할 일
- 결과 버전 히스토리 (같은 입력 → 다른 결과 비교)
- 재생성 시 크레딧 차감 연동

---

## 5. 남은 확장 포인트

| 기능 | 연결 위치 | 난이도 |
|------|-----------|--------|
| 팀 워크스페이스 | `useAuth.ts` + 새 `Team` 모델 | 중 |
| 커스텀 프롬프트 저장 | `InputForm.tsx` + DB 테이블 | 하 |
| API 키 자체 입력 | `geminiClient.ts` | 하 |
| 브랜드 가이드 저장 | `writingStyleService.ts` + DB | 중 |
| 다국어 생성 | `geminiService.ts` 프롬프트 분기 | 중 |
| 예약 발행 | `postStorageService.ts` + cron | 상 |
| 워드프레스/블로그 연동 | 신규 서비스 | 상 |
