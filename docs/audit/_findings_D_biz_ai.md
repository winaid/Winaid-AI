# Agent D — Business logic + AI 특이사항

검토 약 50개 파일 (lib + api routes + components + packages/blog-core)

## CRITICAL

### [BIZ-001] 영상 9단계 파이프라인 — 크레딧 미차감
- 비즈니스 로직 / Critical / `public-app/app/api/video/*/route.ts` 10개 라우트 전부
- `useCredit`/`refundCredit` import 어디에도 없음, `gateGuestRequest`만
- 로그인 사용자가 video-processor(Railway CPU+ffmpeg) 비용을 무제한 소비 가능
- 자동 모드 1회 = 9 step CPU-heavy ffmpeg, 분당 수십 회 가능
- 수정: 자동 모드 진입 시 또는 첫 step 처리 전에 1 credit 차감 (실패 시 부분 환불)

### [BIZ-003] 카드뉴스 크레딧 차감이 클라이언트 사이드
- 비즈니스 로직 / Critical / `public-app/app/(dashboard)/card_news/page.tsx:907-916`
- 생성은 `/api/gemini` 서버, 차감은 브라우저에서 `cardNewsUseCredit(userId)` Supabase RPC 호출
- DevTools로 supabase RPC 호출만 차단해도 무한 사용
- 사용자가 fetch 후 페이지 닫거나 네트워크 끊으면 차감 안 됨
- 수정: `/api/generate/card_news` 서버 라우트 추가 + server-side useCredit/refundCredit

### [ARC-001 — Agent E와 중복] CardNewsProRenderer 두 앱 완전 다른 렌더 엔진 (Konva vs HTML/CSS)
→ Agent E의 ARC-001로 통합

## HIGH

### [BIZ-002] 로그인 사용자 burst rate-limit 부재
- 비즈니스 로직 / High / `public-app/lib/guestRateLimit.ts:86`
- `gateGuestRequest`가 cookie 보유 시 즉시 통과, 분당 제한 없음
- 로그인 사용자가 gpt-image-2 / Sonnet 4.6 / Gemini PRO+googleSearch를 크레딧 한도까지 burst 가능
- 수정: 인증 사용자도 사용자별 sliding window (분당 30회 hard cap)

### [BIZ-004] Cookie auth와 Bearer token 인증 비대칭
- 비즈니스 로직 / High / `lib/guestRateLimit.ts:72-75` vs `lib/serverAuth.ts:9-24`
- `gateGuestRequest`는 cookie / `resolveImageOwner`는 Bearer 헤더
- 클라이언트가 Bearer 빠뜨리면 = (rate limit 통과 + guest 처리) → 무료 이미지 생성
- 수정: 인증 판정 단일화

### [BIZ-005] 블로그 2-pass 부분 실패 시 크레딧 환불 부재
- 비즈니스 로직 / High / `app/api/generate/blog/route.ts:225-249`
- 5섹션 중 2개 실패해도 환불 없이 정상 응답 (line 239 코멘트가 의도라 명시)
- 수정: 부분 환불 또는 무료 재생성 토큰 (정책 결정 사항)

### [BIZ-006] runAutoMode stale state 캡처 (Day 4의 video 버전)
- 비즈니스 로직 / High / `app/(dashboard)/video_edit/page.tsx:711-726`
- `runAutoMode`가 진입 시점 state 클로저 캡처, `stateRef`(line 782)는 정의만 되고 활용 안 됨
- 자동 모드 도중 옵션 변경 시 옛 값으로 실행
- 수정: stateRef.current 활용

### [AI-001] SlideEditor 사용자 입력이 prompt에 무방어 삽입
- AI / High / `components/card-news/SlideEditor.tsx:658, 669, 680`
- `current` (slide.title/subtitle/body)가 sanitizePromptInput 미적용으로 prompt에 직접 보간
- 의료광고법 위반 콘텐츠 생성 가능
- 수정: sanitizePromptInput 적용

### [AI-002] INJECTION_KEYWORDS — zero-width / homoglyph 우회 누락
- AI / High / `packages/blog-core/src/promptSanitize.ts:18-35, 56`
- ZWSP/ZWNJ/ZWJ/BOM/NBSP 미제거 → `i​gnore previous` 우회
- video-processor의 writeDrawtextFile은 zero-width 제거하는데 LLM 경로는 안 함
- 수정: `​-‍﻿ ‪-‮⁠-⁤` 추가

### [AI-003] medicalAdValidation — zero-width / 줄바꿈 분리 우회 미차단
- AI/컴플라이언스 / High / `lib/medicalAdValidation.ts:225-261`
- text.indexOf 단순 매칭, "최​고" "최\n고" "최 고" 통과 (false negative)
- 수정: 매칭 전 zero-width 제거 + 공백 압축한 sanitized 버전과 매칭

## MEDIUM

### [BIZ-007] savePost userId 클라이언트 입력
- 비즈니스 로직 / Medium / `lib/postStorage.ts:71-100`
- RLS 정책 확인 필요 — RLS 우회 시 다른 사용자 글로 INSERT 가능
- 수정: 서버 라우트 일원화

### [AI-004] 모델 ID 30+ 위치 하드코딩 + fallback 부재
- AI / Medium / `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite-preview`, `gpt-image-2`, `gpt-5-search-api`, `claude-sonnet-4-6`, `claude-opus-4-7`
- ENV override는 image route만, 그 외는 component 내부 하드코딩 (cardAiActions 6곳, CardNewsProRenderer 2곳, SlideEditor 3곳)
- preview 접미사는 GA 시 ID 변경 가능성
- 수정: `lib/aiModels.ts` 단일 출처 + ENV-overridable 상수

### [AI-005] callClaude abort 후에도 재시도 루프 진입
- AI / Medium / `packages/blog-core/src/llm/claude.ts:125-178`
- 1회차 retryable 실패 후 backoff 사이에 abortSignal 미체크 (gemini.ts:61은 체크함)
- audit Q-3 회귀
- 수정: 루프 진입부 abortSignal 체크

### [AI-006] Help-chat / Landing-chat sanitize 미적용
- AI / Medium / `app/api/help-chat/route.ts`, `app/api/landing-chat/route.ts`
- 1500자 cap, 4턴 cap만 — sanitizePromptInput 미호출
- 수정: prompt sanitize + envelope tag

### [CMP-001] testimonial 카테고리 — 환자 후기 우회 표현 부족
- 컴플라이언스 / Medium / `lib/medicalAdValidation.ts:154-162`
- "이런 분들이 만족하셨어요", "내원 후 변화" 등 우회 표현 미감지
- 의료광고법 시행령 제23조 제2호 위반 노출

### [CMP-002] 가격 광고 — 시간/희소성 압박 표현 미감지
- 컴플라이언스 / Medium / `lib/medicalAdValidation.ts:140-152`
- "원래 → ○만원", "오늘만", "선착순", "한정수량" 등 미감지
- 의료법 제56조 환자 유인 광고 해석 가능

### [BUG-001] press route 자기 도메인 fetch — 추가 HTTP roundtrip
- 버그 / Low / `app/api/generate/press/route.ts:35-42, 121` (youtube도 동일)
- cold start 누적 + 이중 게이트
- 수정: callLLM 직접 import

### [BUG-002] press cookieHeader는 forward, Bearer는 안 함 → guest로 강등
- 버그 / Medium (사용자 영향 큼) / `app/api/generate/press/route.ts:88-90`
- 로그인 사용자가 press에서 PRO+googleSearch 의도가 깨짐 → FLASH로 강등 → 보도자료 품질 저하

## LOW

- [AI-007] googleSearch:true 시 PRO→FLASH fallback 무경고
- [BUG-003] pLimitedSettled 공유 변수 — 현재 안전, 향후 회귀 위험
- [CMP-003] '명의/베스트 닥터' 외 자격 미증명 표현 사전 부족
- [CMP-004] 본인인증/실명확인 코드 부재 (정보)

## 통계
| 심각도 | 비즈니스 | AI | 버그 | 컴플라이언스 |
|---|---|---|---|---|
| Critical | 2 | 0 | 0 | 0 |
| High | 4 | 3 | 0 | 0 |
| Medium | 1 | 3 | 1 | 2 |
| Low | 0 | 1 | 1 | 2 |

총 21건 (BIZ 7 / AI 7 / BUG 3 / CMP 4)

## 추가 확인 필요 (false positive 가능성)
1. BIZ-007: Supabase RLS 정책 실측 확인 필요 (Agent B가 RLS는 enabled 확인했음 → 영향 작음)
2. AI-004: 2026-05-05 시점 모델 ID 실재성 — 외부 검증 필요 (claude-opus-4-7은 시스템 reminder가 corroborate)
3. BUG-002 (press FLASH 강등): 실제 로그로 확인 필요
4. BIZ-005 (블로그 부분 환불): 비즈니스 정책 확정 필요
5. BIZ-006 (video 자동모드 stale): UI form disable 여부 확인 필요
6. BIZ-001 (video 크레딧): "video editing 무료 정책" 가능성 — 정책 확인 필요
