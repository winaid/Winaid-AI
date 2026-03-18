# WINAID SaaS 구조 재편 마스터 플랜

## 전체 목표

WINAID를 "돌아가는 AI 도구"에서 **SaaS형 제품 뼈대**로 전환한다.
3/29 로그인+크레딧 부착, 3/30 발표를 앞두고
이후 추가 개발 시간이 거의 없을 수 있으므로
**지금이 사실상 마지막 큰 구조 개편 기회**다.

## 왜 지금 이 수술이 필요한가

1. **생성 코어**: geminiService.ts(4,170줄)에 검색/파이프라인/HTML조립/후처리가 뒤섞여 있다.
   크레딧 차감 경계를 붙이려면 생성 요청/응답 계약이 명확해야 한다.

2. **앱 셸**: App.tsx(1,180줄)가 라우팅+상태+사이드바+콘텐츠+인증을 모두 담당한다.
   로그인/결제/히스토리 화면을 추가하려면 화면 경계가 필요하다.

3. **image legacy**: imageGenerationService.ts(2,034줄) 중복 구현이 존재했다.
   → **완료**: 이전 턴에서 삭제, SOT 단일화됨.

## 3대 수술 개요

### 수술 1. 생성 코어 재편
- geminiService.ts에서 검색/HTML조립/후처리를 분리
- 생성 요청/응답 계약 타입 명확화
- Stage A/B/C + fallback/timeout 로직은 보존
- 크레딧 차감 삽입점 명확화

### 수술 2. SaaS 앱 셸 재구성
- App.tsx에서 레이아웃/사이드바/라우팅 분리
- generate / result / history / account 화면 경계 확립
- 이후 로그인/크레딧/결제 화면 추가 가능한 구조

### 수술 3. image legacy 정리
- **완료** (2026-03-18)
- imageGenerationService.ts 삭제 (2,034줄)
- imageStorageService.ts root wrapper 삭제 (12줄)
- 테스트/mock/import 새 경로 전환

## 2주 일정표

| 날짜 | Phase | 작업 |
|------|-------|------|
| 3/18 | Phase 1 | 분석 + 문서화 4종 |
| 3/18 | Phase 4 | image legacy 삭제 **완료** |
| 3/19-21 | Phase 2 | 생성 코어 재편 |
| 3/22-24 | Phase 3 | 앱 셸 재구성 |
| 3/25-28 | Phase 5 | 통합 검증 + 안정화 |
| 3/29 | - | 로그인 + 크레딧 부착 |
| 3/30 | - | 내부 발표 |

## 완료 기준

- [ ] geminiService.ts의 생성 계약이 타입으로 명시됨
- [ ] 검색/HTML조립/후처리가 별도 모듈
- [ ] App.tsx가 레이아웃 셸 + 라우터 역할만 담당
- [ ] generate/result/history/account 화면 경계 존재
- [ ] image/* 가 유일한 이미지 SOT
- [ ] 3/29 크레딧 차감 삽입점이 명확
- [ ] 빌드/타입체크 통과
- [ ] 대표 블로그 생성 플로우 동작
