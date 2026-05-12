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

## 2. **next-app (내부용) admin 은 모든 기능을 크레딧·rate limit 무관**하게 사용 가능

**범위**: 내부용 (`next-app`) 만. 외부용 (`public-app`) admin 은 본 항목 적용 외 (별도 항목 신설 가능).

**룰**:
- next-app `/admin` 페이지에서 password 로그인 후 발급된 `admin_session` HttpOnly cookie 를 가진 요청은 `useCredit` / per-route quota / "크레딧 소진" UI 메시지 등 **모든 사용 제한을 우회**해야 한다.
- 차감 시도 자체를 skip — admin_session 이 valid 한 동안 항상 success.

**왜**:
- 내부 운영자가 콘텐츠 품질 점검·디버깅·고객 시연 시 막힘이 발생하면 운영 자체가 정지.
- 사용자 보고: "관리자로 들어가면 글쓰기 등 모든 기능이 안 된다."

**어디서 enforce 해야 하는가**:
- **server-side 가 최종 신뢰점**. client-side 만으로는 회귀 잠복 risk 큼.
- 표준 패턴 (`/api/image` `route.ts:511-540` 와 같은 흐름):
  1. `checkAuth(req)` 가 `admin_session` cookie 검증 → 통과 (admin 로그인 상태 확인)
  2. `resolveImageOwner(req)` 가 Bearer 검증 → `'guest'` 반환 (admin 은 Bearer 없음)
  3. `userId = owner === 'guest' ? null : owner` → null
  4. `if (userId) { await useCredit(userId); ... }` → admin 은 userId=null 이라 useCredit skip
  5. 생성 진행, 차감 없음 ✅
- 즉 "admin cookie 있고 Bearer 없음" → 자동 무제한. 추가 명시적 admin 분기는 보조용.
- client-side: 모든 dashboard 페이지의 `creditCtx.userId && creditCtx.creditInfo && credits<=0` 형태의 "크레딧 소진" 가드는 반드시 `userId` 가 truthy 일 때만 발동 — admin (`userId=null`) 은 그대로 통과.

**현재 상태 (2026-05-12)**:
- ✅ next-app `/api/generate/blog`, `/api/image` 등 주요 라우트는 위 표준 패턴 따라 admin 자동 통과 (확인됨).
- ✅ dashboard `useAuthGuard` 가 admin localStorage 힌트 인식 → /auth 리다이렉트 우회.
- ⚠️ 신규 라우트 추가 시 `resolveImageOwner` 결과를 `userId` 로 mapping 할 때 `'guest' → null` 처리 누락 시 admin 차단 위험.
- ⚠️ 신규 dashboard 페이지의 client-side 크레딧 가드가 `creditCtx.userId` 미체크하고 `creditInfo.credits <= 0` 만 보면 admin (`creditInfo = null`) UI 상태 처리에 오작동 가능.

**회귀 시 증상**:
- 내부 운영자가 글쓰기/이미지/카드뉴스 등에서 "insufficient_credits", "unauthorized", "크레딧이 모두 소진" 응답.
- `[blog/image/clinical/...] refunded credit for <userId>` 로그가 admin 에 대해 발생 (admin 은 userId 없으니 본래 발생 X — 발생 시 회귀).
- 새로 추가된 라우트가 `checkAuth` 또는 Bearer 만 요구하고 admin cookie 미수용 시 401.

**신규 라우트 추가 시 체크리스트**:
1. `checkAuth(req)` 호출 — Bearer **또는** admin_session cookie 허용
2. `resolveImageOwner(req)` 로 owner 추출
3. `userId = owner === 'guest' ? null : owner`
4. `if (userId)` 가드 안에서만 useCredit/refund — admin 은 자동 skip
5. client dashboard 의 "크레딧 소진" UI 는 `creditCtx.userId && creditCtx.creditInfo` 둘 다 truthy 일 때만 발동

**변경하려면 (admin 룰 완화 시)**:
- 어떤 기능에 대해 admin 도 quota 받아야 하는지 명시 + 사유.
- 일반 user 와 동일 quota 받는 admin 은 운영 효율 저하 — 반드시 시니어 승인.

**보안 주의**:
- `admin_session` cookie 는 HMAC 서명 + 7일 expiry + HttpOnly + Secure + SameSite=Strict (lib/adminCookie.ts).
- `ADMIN_API_TOKEN` 환경변수가 유출되면 위조 가능 — rotation 절차 + secret manager 필수.
- localStorage `winaid_admin` 는 단순 UI 힌트 (auto-redirect 우회용). 권한 자체는 cookie 만이 결정.

---

<!-- 새 invariant 추가 시 위 형식으로 append. -->
