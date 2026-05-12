# 🛑 INVARIANTS — 절대 회귀 금지 목록

이 문서의 항목은 **건드리면 즉시 prod 장애** 가 나거나 **회귀 비용이 막대**해서, 변경 전 반드시 시니어 승인 + 이유 명시가 필요합니다.

각 항목은 다음 형식으로 기록:
- **값/규칙**
- **회귀 시 증상**
- **과거 회귀 사례** (있으면)
- **변경하려면**: 검토 절차

---

## 1. `/api/image` OpenAI client per-key timeout = **120_000 ms**

**파일**:
- `next-app/app/api/image/route.ts` — `new OpenAI({ ..., timeout: 120_000 })`
- `public-app/app/api/image/route.ts` — `new OpenAI({ ..., timeout: 120_000 })`

**왜 120s 인가**:
- gpt-image-2 의 정상 추론 시간이 **60s 를 자주 초과**. quality='medium'/'auto' + 16:9/A4 size 조합에서 60~90s 흔함.
- 60s 로 줄이면 정상 요청도 timeout 으로 502 회귀.
- 120s 면 99% 정상 응답을 수용, MAX_KEY_ATTEMPTS=2 × 120s + waits ≤ 245s 로 Vercel `maxDuration=300` 안에 안전.

**회귀 시 증상**:
- Vercel External APIs 패널에 `POST api.openai.com/v1/image...` Timeout 연속 발생.
- 사용자 콘솔: `/api/image:1 Failed to load resource: the server responded with a status of 502`.
- 서버 로그: `[image] refunded 1 credit for <userId>` (환불은 동작) + details 에 `key0: ... timeout`.

**과거 회귀 사례**:
- **PR #47** (`e9505bdb` "fix(image/demo): /api/image timeout 차단", 2026년 데모 직전)
  - 당시 `maxDuration=60` 에 맞추려 120s → 60s 로 임시 캡.
  - 이후 `maxDuration=300` 으로 복구할 때 per-key timeout 은 같이 못 올림 → 회귀 잠복.
  - prod 에서 사용자 신고로 발견, **PR #163** (`a9105598`, 2026-05-12) 로 120s 복구.
  - public-app 은 당시 변경 누락되어 우연히 120s 유지된 상태였음 (next-app 만 회귀).

**변경하려면**:
- `maxDuration` 도 같이 검토. `MAX_KEY_ATTEMPTS × per-key timeout + waits` 가 `maxDuration` 보다 작은지 확인.
- 줄이려는 이유가 비용/속도라면, quality 다운그레이드 (`medium`→`low`) 가 더 안전한 레버. timeout 은 last resort.
- 양 앱 동시 변경 + 회귀 사례 추가 기록.

---

<!-- 새 invariant 추가 시 위 형식으로 append. -->
