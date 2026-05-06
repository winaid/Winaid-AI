# Agent A — API Security (Next.js 두 앱)

검토 라우트: 88개 (next-app 47 + public-app 41)

## High

### [SEC-003] /api/youtube/key-moments — 내부 /api/gemini 호출에 cookie/Authorization 미포워드 → 항상 401
- 카테고리: 버그 / High / `next-app/app/api/youtube/key-moments/route.ts:18-42`, `public-app/app/api/youtube/key-moments/route.ts:21-45`
- 기능 자체 동작 불능 (양쪽 앱)
- 수정: cookie/authorization 헤더 forward + signal 전달

### [SEC-008] /api/hospital-images/upload — 게스트 모두 user_id='guest' 공유, owner DELETE/PATCH 우회 가능
- 카테고리: 보안 / High / `public-app/app/api/hospital-images/upload/route.ts:22, 72`, `[id]/route.ts:18-32`
- 게스트 A 업로드 → 게스트 B가 id만 알면 DELETE 통과
- 수정: 게스트 user_id를 `guest:<hash>`로 차별화 또는 게스트 DELETE/PATCH 차단
- serverAuth.ts 주석에 "Phase 2"로 인지된 채 남음

## Medium

### [SEC-001] /api/diagnostic/competitor-gap — crawlSite request.signal 미전파
- 카테고리: 버그 / Medium / `next-app:67`, `public-app:69`
- 클라 disconnect 후 30s까지 fetch 살아있음

### [SEC-002] /api/diagnostic/stream — streamChatGPT/streamGemini/crawlSite signal 미전파
- 카테고리: 버그 / Medium / `next-app:185,263`, `public-app:177,245`
- maxDuration 300s SSE — 클라 disconnect 후에도 LLM 호출 계속 → 비용 낭비

### [SEC-004] /api/diagnostic/history — 인증/Rate limit 누락 (next-app만)
- 카테고리: 보안 / Medium / `next-app/app/api/diagnostic/history/route.ts:11-41`
- 임의 URL ?url=…로 다른 진단 결과 score/날짜 조회 가능 → 마케팅 정보 누설

### [SEC-005] /api/diagnostic/share & refresh-narrative — 클라 입력 결과 신뢰
- 카테고리: 보안 / Medium / `next-app/share/route.ts:60-85`, `*/refresh-narrative/route.ts:34-87`
- score=100 위조 결과로 share 토큰 발급 가능
- 수정: traceId → DB 조회 → 검증된 스냅샷만 저장

### [SEC-006] /api/reference — topic/category sanitizePromptInput 미적용
- 카테고리: 보안 (프롬프트 인젝션) / Medium / `lib/referenceFetcher.ts:144-157`, 라우트 호출자
- 가짜 출처 fabrication 가능 — 의료 콘텐츠 신뢰 무너짐
- public-app은 게스트 노출이라 더 시급

### [SEC-009] /api/hospital-images route — params.team_id 검증 없이 .or() 보간
- 카테고리: 보안 / Medium / `public-app/app/api/hospital-images/route.ts:50`
- 현재는 RLS+정수컬럼으로 안전하나 schema 변경 시 즉시 PostgREST 인젝션

### [SEC-018] /api/influencer/status — hospital_id 소유권 검증 없음
- 카테고리: 보안 / Medium / `next-app/app/api/influencer/status/route.ts:65-76`
- 사용자 A가 다른 병원 B의 outreach 상태 위변조 가능

### [SEC-019] /api/diagnostic — customQuery sanitizePromptInput 미적용
- 카테고리: 보안 (프롬프트 인젝션) / Medium / `next-app:142, 212`
- 100자 캡만 — 짧은 페이로드로 인젝션 가능

### [SEC-023] public-app /api/diagnostic/competitor-gap — 인증/Rate limit 가드 전무
- 카테고리: 보안 / Medium / `public-app/app/api/diagnostic/competitor-gap/route.ts:40-50`
- 게스트 무제한 호출 가능 — LLM 비용 폭탄
- next-app은 checkAuth 통해 보호됨, public-app 라우트만 사각지대

## Low

### [SEC-007] /api/google-images, /api/pinterest-images — Gemini 임의 URL 무검증 반환
- next-app / Low — 트래커/멀웨어 도메인이 image src에 들어갈 수 있음

### [SEC-010] /api/llm — prompt 길이 cap 없음 + maxOutputTokens 클라 자유 지정
- next-app / Low — 인증 사용자 비용 burst

### [SEC-011] landing-chat & help-chat — Math.random() 단일 키 선택, 멀티키 retry 부재
- 양쪽 앱 / Low — 키1 quota 소진 시 502, /api/gemini는 로테이션 구현됨 (불일치)

### [SEC-012] /api/naver/suggest — fetch timeout 부재
- public-app / Low — 다른 naver 라우트는 10s 타임아웃 적용 (불일치)

### [SEC-013] /api/llm-smoke, /api/landing-chat — 에러 메시지 key redact 누락
- 양쪽 앱 / Low — Day 1 redact의 부분 회귀

### [SEC-014] /api/zdebug/* — keyMask가 prefix 6자 + suffix 4자 노출
- next-app / Low — Vercel Preview에서 노출, 인증 게이트 없음
- 자체 주석에 "진단 끝나면 삭제" 표시인데 미삭제

### [SEC-015] verifyAdminPassword — Buffer.from char vs byte 길이 비교
- next-app/lib/adminCookie.ts:144-149 / Low — 한글 secret만 영향 (현실적으로 무해)

### [SEC-016] /api/diagnostic/history — url 길이/형식 미검증
- next-app / Low — 100KB+ URL DoS 채널

### [SEC-017] public-app /api/help-chat — gateGuestRequest 누락, 자체 inline rate limit만
- public-app / Low — Day 3 보강 표에서 누락

### [SEC-022] X-Forwarded-For 첫 토큰 신뢰 (rate limit 우회)
- 양쪽 앱 / Low — Vercel은 OK, self-hosted에서 spoof 가능

### [SEC-024] /api/help-chat 게스트 호출 가능 (cap 부재)
- public-app / Low — landing-chat(10/분)보다 높은 cap(20/분), 일관성 없음

### [SEC-025] /api/cron/crawl-all — KST hour만 체크, 주말/공휴일 무시
- next-app / Low — 정책 vs 의도 불명확

### [SEC-020] /api/llm-batch-smoke — dev에서 prompts 길이 검증 없음
- next-app / Low (성능) — dev 환경 비용 burst

### [SEC-021] /api/diagnostic/refresh-narrative — narrative 1회당 LLM 3회 호출
- public-app / Low (성능/비용) — 전용 더 타이트한 cap 필요

## 통계
| 심각도 | 보안 | 버그 | 성능 |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 1 | 1 | 0 |
| Medium | 7 | 2 | 0 |
| Low | 9 | 3 | 2 |

총 25건. CHANGELOG 회귀 0건 — 전부 신규 사각지대 또는 Day 3 보강 표 누락.

## 시급 처리 Top 5
1. SEC-003 — youtube/key-moments 동작 불능 (즉시 수정)
2. SEC-008 — 게스트 user_id 공유로 자원 위변조
3. SEC-023 — public-app competitor-gap 가드 부재 → LLM 비용 직격탄
4. SEC-005 — 진단 결과 위조 share 토큰
5. SEC-001/002 — abortSignal 서버 측 미전파

## 미검토 영역
- `lib/diagnostic/discovery.ts`(streamChatGPT/streamGemini) 내부 구현
- `next-app/lib/diagnostic/crawler.ts` 700줄 중 SSRF 부분만 grep 확인
- @winaid/blog-core 내부 (라우트 표면만)
- influencer RLS SQL 마이그레이션 (추론만)
