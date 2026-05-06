# next-app 로그인 흐름 감사

**감사 일자**: 2026-05-06
**main HEAD**: `35ab594` (사이클 2B 클로징 + #129 머지본)
**감사 방법**: read-only (isolation worktree)
**코드 변경**: 없음
**스코프**: next-app 인증 흐름 + admin 가드, public-app 비교

> ⚠️ 본 문서는 사용자 요청 "내부용 admin 에서 로그인 후 내부용 아이디로 되어야 해"
> 를 코드 사실로 명확화하기 위한 것이다. 의도 추측 없이 file:line 만 인용.
> 어떤 해석이 맞는지는 사용자 결정 후 별도 PR 로 진행.

---

## 0. TL;DR

1. next-app 에는 **두 개의 독립된 로그인 경로** 가 존재한다:
   - `/auth` — 일반 사용자 Supabase 로그인 (`이름 + 팀 + 비밀번호` → 합성 이메일
     `t{teamId}_{shortHash}@winaid.kr` 로 `signInWithPassword`)
   - `/admin` — 별도 password 단일 입력 → `ADMIN_API_TOKEN` 검증 →
     HttpOnly `admin_session` HMAC cookie 발급. **Supabase 사용자와 무관**.
2. 두 인증 시스템은 **연결되어 있지 않다**. `/admin` 로그인은 admin cookie 만
   발급할 뿐 Supabase user / profiles row 와 매핑이 없다. 반대로 일반 Supabase
   세션은 admin 권한과 무관하다.
3. 사이드바 / 모바일 헤더에 표시되는 "현재 사용자" 는 **Supabase
   `auth.user.user_metadata.name`** 또는 이메일 prefix 다 (next-app/hooks/useAuthGuard.ts:103-107).
   `/admin` 페이지는 별도 페이지라 사이드바를 사용하지 않는다.
4. public-app 은 `이메일 + 비밀번호` 직접 로그인, admin 개념이 화이트리스트
   상수 1개 뿐 (`public-app/lib/auth.ts:11-13`). admin cookie / `/admin` 페이지
   자체가 없다.
5. `useAuthGuard` 의 `winaid_admin=true` localStorage 플래그
   (`next-app/hooks/useAuthGuard.ts:42-49`) 가 유일한 cross-flow 연결 지점이다 —
   admin cookie 발급 시 함께 set 되어 dashboard layout 의 `/auth` 자동 redirect
   를 우회한다. **자격 증명이 아니라 UX 플래그**.

→ **사용자 결정 필요**: 4 개 해석 후보 중 어느 것이 의도인지.
   가장 가능성이 높은 해석은 [해석 D — 사용자 표시/세션 일관성] 또는
   [해석 B — admin 로그인 후 별도 내부 계정 매핑].

---

## 1. 현재 동작 (사실)

### 1-1. 진입점

| 경로 | 파일 | 보호 |
| --- | --- | --- |
| `/` | `next-app/app/page.tsx` | 익명 (랜딩) |
| `/auth` | `next-app/app/auth/page.tsx:11` | 익명 (이미 세션 있으면 `/app` 으로 redirect, line 56-66) |
| `/admin` | `next-app/app/admin/page.tsx:51` | 익명 진입 가능 — page.tsx 내부 `authenticated` state 로 form 게이트 (line 777) |
| `/(dashboard)/*` | `next-app/app/(dashboard)/layout.tsx:24` | `useAuthGuard` 가 가드 — 세션 없고 `winaid_admin` 플래그도 없으면 `window.location.href = '/auth'` 강제 redirect (`hooks/useAuthGuard.ts:44-48`) |
| `/check/[token]` | `next-app/app/check/[token]/page.tsx` | 익명 (token URL 자체가 비밀) |
| `/api/admin/*` | `next-app/app/api/admin/{login,logout,whoami}/route.ts` | login=공개, whoami/logout=cookie 검증 |
| 기타 `/api/**` | `next-app/lib/apiAuth.ts:15-26` (`checkAuth`) 호출 라우트만 보호 — Supabase Bearer 또는 admin cookie 둘 중 하나 |

**Next.js `middleware.ts` 부재** — next-app 루트에 middleware 파일 없음
(`find next-app -maxdepth 2 -name "middleware.*"` → 0건). 모든 가드는 layout /
hook / API route 내부에 산재.

### 1-2. 로그인 흐름 (단계별 file:line)

#### A. 일반 사용자 Supabase 로그인 (`/auth`)

1. **Form submit** — `next-app/app/auth/page.tsx:115` `handleTeamLogin` →
   `signInWithTeam(name.trim(), teamId, password)`.
2. **Email 합성** — `next-app/lib/auth.ts:18-21`
   `nameTeamToEmail(name, teamId)` =
   `` `t${teamId}_${shortHash(lowercased trim name)}@winaid.kr` ``.
   `shortHash` 는 djb2-like 31bit (`auth.ts:9-16`) — 충돌 가능성 비-제로 (감사
   범위 외). 과거 hex 방식 (`nameTeamToOldEmail`, `auth.ts:23-26`) 도 지원되어
   1차 실패 시 fallback 재시도 (`auth.ts:42-51`).
3. **Supabase 호출** — `auth.ts:36-39` `supabase.auth.signInWithPassword({ email, password })`.
4. **세션 발급 위치** — Supabase JS SDK 가 `localStorage` 의 `sb-*` 키에
   access_token / refresh_token 저장 (default storage). `useAuthGuard.ts:88-93`
   에서 logout 시 `sb-*` 키 일괄 삭제.
5. **profiles 동기화** — `auth.ts:54-79` 로그인 성공 시 `profiles` 테이블에
   `email / full_name / name / team_id` UPDATE (없으면 INSERT). RLS 가
   `auth.uid()=id` 만 허용하므로 자기 자신 row 만.
6. **Redirect** — `auth/page.tsx:140` `router.push('/app')` →
   `(dashboard)` 라우트 그룹. `useAuthGuard` 가 세션 확인 후 통과.
7. **Remember-me** — 이름/팀 ID 만 `localStorage.winaid_remember`
   (`auth/page.tsx:136`). 비밀번호는 저장 X.

#### B. /admin 로그인 (별도 시스템)

1. **Form submit** — `next-app/app/admin/page.tsx:536` `handleLogin` →
   `POST /api/admin/login` body `{ password }` (line 543-548).
2. **서버 검증** — `next-app/app/api/admin/login/route.ts:27-58`:
   - `isAdminConfigured()` (env `ADMIN_API_TOKEN` 존재) — 미설정 시 503.
   - per-IP rate limit 5/min (line 33-43).
   - `verifyAdminPassword(password)` — `lib/adminCookie.ts:140-150` —
     `ADMIN_API_TOKEN` 와 timing-safe 비교 (`createHmac` 동일 길이 비교).
3. **Cookie 발급** — `route.ts:60-67`:
   - `issueAdminCookieValue()` → `<expHex>.<hmac>` (HMAC-SHA256 of exp,
     `adminCookie.ts:40-46`).
   - `Set-Cookie: admin_session=...; Path=/; Max-Age=3600; HttpOnly; SameSite=Strict; Secure`(prod).
4. **Client state** — `admin/page.tsx:568-572`:
   - `localStorage.setItem('winaid_admin', 'true')` — UX hint, **자격 증명 아님**.
   - `setAuthenticated(true)`, password state 메모리 유지 (RPC 인자용,
     `admin/page.tsx:298-300, 571`).
5. **Redirect 없음** — `/admin` 페이지가 form 자리에 자기 UI 를 그대로 렌더링
   (`admin/page.tsx:777` 분기).
6. **Supabase 세션과의 관계** — **없음**. `admin/page.tsx` 에서
   `supabase.auth.signIn*` 호출 0건 (grep 확인). admin login 성공 후에도
   Supabase 세션은 그대로 (있다면 있고, 없으면 없음). admin cookie 가 발급되어
   있어도 `auth.user` 는 변하지 않음.

#### C. /admin 의 세션 복원 (`useEffect`, `admin/page.tsx:235-256`)

- mount 시 `GET /api/admin/whoami` 호출 (`route.ts:13-19` — cookie 만 재검증).
- 응답 200 이어도 **password state 가 비어 있으면 form 그대로 표시** —
  RPC `admin_password` 인자에 password 가 필요하기 때문 (line 245-250 주석).
- 즉 admin cookie 가 살아있어도 reload 후 재로그인 강제. 세션 자체 복원은 안 됨.

### 1-3. 사용자 컨텍스트 출처

UI 에 표시되는 "현재 사용자" (사이드바 닉네임 / 모바일 헤더 닉네임) 의
데이터 흐름:

```
Supabase auth.getSession()
  → session.user (User from @supabase/supabase-js)
  → useAuthGuard.userName (next-app/hooks/useAuthGuard.ts:104-107):
       user.user_metadata.name
    || user.user_metadata.full_name
    || user.email.split('@')[0]    ← 합성 이메일이면 't1_abc123' 같은 prefix
    || 'Guest' / '사용자'
```

표시 위치:
- `next-app/app/(dashboard)/layout.tsx:56` `Sidebar userEmail={isGuest ? 'Guest' : (userName || userEmail)}`
- `next-app/app/(dashboard)/layout.tsx:63` `MobileHeader` 동일

**핵심**: profiles 테이블의 `full_name` / `name` / `team_id` 는 위
표시에 직접 사용되지 않는다. `useAuthGuard` 는 `auth.user.user_metadata` 만
읽는다. profiles 는 admin UI (사용자 목록, `app/admin/AdminUsersTab.tsx:91`) 와
회원가입/로그인 직후 업데이트 (`lib/auth.ts:54-79, 101-138`) 에서만 사용.

`/admin` 페이지 자체는 사이드바를 안 쓰고 자기 UI 를 직접 그린다 —
"현재 admin 사용자" 표시 자체가 없다. `whoami` 응답도 `{ admin: true }` 만
(`api/admin/whoami/route.ts:18`).

### 1-4. admin 판별 로직

| 위치 | 기준 | 비고 |
| --- | --- | --- |
| `lib/adminCookie.ts:52-84` `verifyAdminCookie` | HttpOnly cookie HMAC 검증 + exp | 서버 전용, env `ADMIN_API_TOKEN` 필요 |
| `lib/adminCookie.ts:140-150` `verifyAdminPassword` | password ↔ env timing-safe | login route 에서만 |
| `lib/apiAuth.ts:15-26` `checkAuth` | 1) admin cookie 우선 2) Supabase Bearer | 보호 API route 의 가드 — admin cookie 통과 시 user 식별 X (단순 권한만) |
| `hooks/useAuthGuard.ts:44-48` `winaid_admin === 'true'` | localStorage 플래그 | 자격 X — 단지 `/auth` redirect 우회 (대시보드 진입 가능). 실제 admin API 인증은 cookie 가 통과해야 함 |
| `app/admin/page.tsx:777` | client state `authenticated` | login form 게이트 — UI 만 |
| Supabase RPC `get_admin_stats(admin_password)` 등 | DB 측 `current_setting('app.admin_password')` 와 admin_password 인자 비교 | `sql/migrations/2026-05-05_admin_rpc_winaid_purge.sql:32-67` 등. 'winaid' 평문 fallback 은 DB-024 에서 제거됨 |
| `lib/adminService.ts:76, 90` | `supabaseAdmin ?? supabase` | service_role 클라이언트 우선 — RLS 우회용 |

**관찰**: admin 판별이 **3 개의 비밀** 에 분산되어 있다:
- env `ADMIN_API_TOKEN` (cookie HMAC + login password)
- DB GUC `app.admin_password` (RPC 검증)
- env `SUPABASE_SERVICE_ROLE_KEY` (`supabaseAdmin` 클라이언트)

`page.tsx:543-548` 의 login 은 `ADMIN_API_TOKEN` 만 검증하지만, 같은 페이지의
`getAdminStats(password)` 호출 (`page.tsx:571`) 은 DB 측 `app.admin_password`
를 검증한다. **둘이 다른 값일 수 있음** — 운영자 책임. 로그인은 통과하지만
RPC 가 막히는 비대칭 가능.

### 1-5. /api/admin/whoami 정보 부족

`whoami` 가 응답하는 정보는 `{ admin: true | false }` 뿐이다
(`api/admin/whoami/route.ts:18`). admin cookie 에는 expiry 와 HMAC 만
들어있고 user id / 이름 / 역할 정보가 **없다**. 따라서 next-app 어느
지점에서도 "현재 로그인한 admin 의 식별자" 를 알 수 없다.

---

## 2. public-app 대비 drift

| 항목 | next-app | public-app | drift |
| --- | --- | --- | --- |
| 로그인 페이지 위치 | `app/auth/page.tsx` | `app/auth/page.tsx` | 같음 |
| 로그인 입력 | 이름 + 팀 + 비밀번호 | 이메일 + 비밀번호 | **다름** — next-app 만 합성 이메일 |
| signIn 함수 | `signInWithTeam` (lib/auth.ts:29-82) | `signInWithEmail` (public-app/lib/auth.ts:16-23) | **다름** |
| profiles upsert | 로그인 시마다 update + fallback insert (lib/auth.ts:54-79) | 로그인은 update 없음, 회원가입만 (public-app/lib/auth.ts:45-99) | **다름** — next-app 매 로그인 sync |
| useAuthGuard | hooks/useAuthGuard.ts (winaid_admin localStorage 플래그) | hooks/useAuthGuard.ts (?guest=1 query param) | 동일 구조, **다른 우회 분기** |
| admin 시스템 | 별도 password + HttpOnly cookie + RPC | **없음** — `ADMIN_EMAILS` 화이트리스트 1건 (lib/auth.ts:11-13) | **next-app 전용** |
| `/admin` 페이지 | 있음 (43k LOC) | **없음** | next-app 전용 |
| middleware | 없음 | 없음 | 같음 |
| API 가드 | `lib/apiAuth.ts checkAuth` (cookie 또는 Bearer) | `lib/serverAuth.ts resolveImageOwner` 만 | next-app 만 admin cookie 인식 |

**구조적 의도** (`next-app/ARCHITECTURE_PLAN.md:8, 99-145`):
- next-app = "내부용" (internal), public-app = "외부 고객용" (public)
- ARCHITECTURE_PLAN line 145: "auth 는 shared + role 분기 — public 은 일반
  사용자, internal 은 admin role 체크 추가".
- 그러나 현재 코드는 **분기가 아니라 두 개의 별도 시스템** 이다 — admin role
  은 Supabase user role 이 아니라 별도 cookie + 별도 DB GUC 기반.

---

## 3. 사용자 요청 해석 후보

> 사용자 발화: "내부용 admin 에서 로그인 후 내부용 아이디로 되어야 해"
> ("내부용" = next-app, "admin" = `/admin` 페이지 또는 일반 로그인 모두 가능 — 모호)

### 해석 A — Admin role 자동 전환 (가능성: 2/5, 규모: M)

**해석**: `/admin` 에서 ADMIN_API_TOKEN 으로 로그인하면 동시에 Supabase
세션도 자동으로 "admin role" 을 가진 사용자 세션이 발급되어야 한다.

**현재 동작**: `app/api/admin/login/route.ts:60-67` 는 admin cookie 만
발급. Supabase 세션은 손대지 않음. `app/admin/page.tsx:568-572` 도 cookie
+ localStorage 플래그만.

**원하는 동작 (추정)**: admin login API 가 미리 정해진 internal Supabase
계정 (예: `admin@winaid.internal`) 으로 자동 로그인까지 수행 → 사이드바에
"내부 관리자" 표시.

**작업 권고**: `app/api/admin/login/route.ts` 가 cookie 발급 후
service_role 로 admin Supabase user 의 magic link / impersonation token
발급 → 클라이언트가 세션 set. 단, **Supabase admin signIn 은 password
필요 — 자동 로그인은 서비스롤 API (admin.generateLink) 사용**. 보안 검토 필수.

### 해석 B — 별도 내부 계정 매핑 (가능성: 4/5, 규모: M~L)

**해석**: 일반 사용자가 `/auth` 로 로그인한 뒤, 그 사용자가 "내부용
사용자" (예: profiles.team_id=0 본부장팀, 또는 별도 internal_users 테이블 row)
인지 매핑이 안 되고 있다 / 매핑이 깨져 있다.

**현재 동작**:
- `lib/auth.ts:54-79` 가 매 로그인마다 `profiles` 의 `team_id` 를 클라
  입력값으로 덮어쓴다 (사용자가 로그인 form 에서 선택한 팀 ID).
- 즉 사용자가 form 에서 다른 팀을 선택하면 매번 team_id 가 바뀐다 — 의도된
  동작인지 불명.
- `internal_users` / `admins` 같은 별도 테이블은 검색 결과 0건. profiles +
  team_id (`teamData.ts:42` "본부장님" id=0) 가 사실상 admin 표식 후보.
- `useAuthGuard` 는 `team_id` 를 안 읽는다 — UI 는 user_metadata.name 만.

**원하는 동작 (추정)**: 어떤 사용자는 "내부용" 으로 분류되어 로그인 후
사이드바에 그 internal id (예: 'admin' / '본부' / 팀명+이름) 가 표시되어야.
또는 internal user 만 `/admin` 에 진입 가능해야.

**작업 권고**: profiles 에 `is_internal` boolean 또는 `role enum` 컬럼 추가
+ `useAuthGuard` 가 profiles row 조회 후 표시 로직 보완. RLS / RPC 동기화
필요. 별도 PR 트랙.

### 해석 C — Cross-app 세션 전파 (가능성: 1/5, 규모: L)

**해석**: public-app (외부) 에서 로그인한 사용자가 next-app (내부) 에 와도
동일 세션을 유지하면서 내부용 식별자로 보여야 한다.

**현재 동작**:
- 두 앱은 각각 독립 도메인 / 빌드 (`vercel.json` 각자, env `NEXT_PUBLIC_SUPABASE_*`
  공유는 운영자 책임). Supabase JS SDK 가 사용하는 storage key (`sb-<project-ref>-auth-token`)
  는 도메인이 다르면 공유 X.
- 이메일 vs 합성 이메일 — 같은 사람이 두 앱에 동시 가입하려면 두 계정
  필요. cross-app 세션 전파는 코드적으로 불가능.

**원하는 동작 (추정)**: 같은 Supabase project 의 같은 user 가 next-app 에서
재로그인 없이 internal alias 로 인식되어야.

**작업 권고**: 동일 도메인 통합 (서브도메인 + 공유 cookie storage 변경)
또는 Supabase SSO / OAuth bridge — 큰 변경. 현재 우선순위 낮을 가능성.

### 해석 D — 로그인 후 사용자 표시 오류 (가능성: 4/5, 규모: S)

**해석**: 인증은 정상이지만 사이드바 / 헤더에 표시되는 닉네임이 "외부
계정처럼 보이는 값" (예: 합성 이메일 prefix `t1_abc123`) 이라 "내부용 아이디"
로 안 보인다.

**현재 동작**:
- `useAuthGuard.ts:104-107` `userName = user_metadata.name || user_metadata.full_name || email.split('@')[0] || 'Guest' / '사용자'`.
- 이름이 user_metadata 에 잘 들어갔으면 한글 이름 표시. 안 들어갔으면
  `t1_abc123` 같은 prefix 표시 (합성 이메일이라 의미 없음).
- `signInWithTeam` (`lib/auth.ts:29-82`) 는 `auth.signInWithPassword` 호출
  시 user_metadata 를 바꾸지 않는다 — 회원가입 (`auth.ts:93-99`) 때만
  `data: { name, team_id }` 가 metadata 에 들어간다. 따라서 가입 이전
  사용자나 metadata 가 빈 사용자는 이메일 prefix 가 보임.
- profiles 에는 `full_name / team_id` 가 매 로그인마다 갱신되지만 (`auth.ts:57-65`)
  `useAuthGuard` 가 profiles 를 안 읽는다.

**원하는 동작 (추정)**: 로그인 후 사이드바에 "이름 (팀명)" 또는 "내부 계정 식별자"
가 표시되어야.

**작업 권고**: 작업 규모 가장 작음.
- 옵션 D-1: `useAuthGuard` 가 profiles 조회 후 `full_name / team_id` 사용.
- 옵션 D-2: `signInWithTeam` 도 `auth.updateUser({ data: { name, team_id } })`
  로 metadata 갱신 → useAuthGuard 변경 없이 표시 정상화.
- 옵션 D-3: 표시 fallback 에서 합성 이메일 prefix 대신 form 입력 시점의
  `name + team` 을 sessionStorage 에 보관 후 사용 (브라우저 한정 hack — 비추).

### 기타 — admin cookie 와 Supabase 세션 분리 자체가 의도와 다름 (가능성: 3/5, 규모: M)

**해석**: 사용자 의도는 "/admin 진입 = 내부 사용자 신분으로 로그인된 상태"
이지만, 현재는 admin cookie 와 Supabase 세션이 완전 분리되어 있어 admin 진입
직후에도 사이드바 (다른 페이지) 는 여전히 일반 사용자 / 게스트 상태.

**현재 동작**: 1-2 절 B 단계 6 — admin login 은 Supabase 세션을 안 만든다.
`localStorage.winaid_admin='true'` 는 useAuthGuard 의 redirect 만 우회 — 즉
"세션 없는 채로 dashboard 진입 가능" 이지 "admin 으로 로그인된 척" 이 아님.

**원하는 동작 (추정)**: admin login 시 자동으로 사전 정의된 internal Supabase
계정 세션도 발급 → useAuthGuard.user 가 internal 사용자로 채워져야.

**작업 권고**: 해석 A 와 유사. 추가로 `useAuthGuard` 가 `winaid_admin` 플래그
일 때 `userName='내부 관리자'` 같은 fallback 도 즉시 가능 (S 작업).

---

## 4. 결정 필요 항목 (사용자에게)

다음 중 하나를 선택해주세요 (PR 코멘트):

- [ ] **A** — admin password 로그인 → Supabase 세션도 internal 계정으로 자동 발급
- [ ] **B** — 일반 로그인 후 profiles `is_internal` / `role` 컬럼으로 내부 사용자 분류 + UI 분기
- [ ] **C** — public-app ↔ next-app cross-domain 세션 통합
- [ ] **D** — 로그인 후 사이드바 / 헤더의 닉네임이 합성 이메일 prefix 로 보이는 표시 버그 수정 (가장 작은 변경)
- [ ] **기타 (#5 / 위 어디에도 해당 X)** — admin cookie 와 Supabase 세션 분리 자체를 통합
- [ ] **위 어느 것도 아님** — 의도 추가 설명

선택 후 후속 PR 트랙:
- A / 기타 → admin login route + supabase-js admin API + `useAuthGuard`
  변경. 보안 검토 필요.
- B → DB 마이그레이션 (profiles 컬럼 추가) + RLS + `useAuthGuard` profiles
  조회 추가.
- C → 도메인 / 빌드 / Supabase 설정 변경 — 가장 큼.
- D → `useAuthGuard.ts` + `lib/auth.ts` 의 metadata 갱신 1~2 hunk.

---

## 5. 참고

### DB-024 quick_recovery 와의 관계

- `sql/migrations/2026-05-04_admin_rpc_quick_recovery.sql` 가
  `2026-05-04_security_hardening.sql` 의 'winaid' 평문 fallback 제거를 회귀
  시켰고, `2026-05-05_admin_rpc_winaid_purge.sql` 이 재교정.
- 본 감사의 admin 판별 로직 (1-4 절) 은 위 RPC 를 호출하는 `getAdminStats`
  (`adminTypes.ts:62-79`) 등이 `current_setting('app.admin_password')` 를
  검증한다는 사실에 의존. quick_recovery 회귀가 production 에 적용된 환경이라면
  next-app `/admin` 의 RPC 호출이 'winaid' password 로도 통과 → 본 감사의
  admin 가드 신뢰도에 영향. **본 PR 범위 밖**.

### 베이스라인 감사 (#115) 에서 next-app auth 항목 회귀

- `docs/audit/_findings_A_api_security.md:57` — "next-app 은 checkAuth 통해
  보호됨, public-app 라우트만 사각지대".
- `docs/audit/_findings_E_arch_bugs_perf.md:10` — "authFetch.ts: next-app 만
  credentials:'include' + admin HttpOnly".
- 본 감사는 위 두 사실을 file:line 으로 재확인 (`lib/apiAuth.ts:15-26`,
  `lib/authFetch.ts:24`). 회귀 없음.

### admin cookie 의 한계

- cookie payload = `<expHex>.<HMAC>` 만. user id / role 정보 없음.
- 따라서 next-app 어디서도 "어떤 admin 이 로그인했나" 식별 불가. 단일
  password 시스템 — 동시 사용자 분리 X.
- audit log 측면에서 admin 행위 추적이 IP 단위 (rate limit 키) 를 넘어가지
  않는다. 사용자 요청이 "감사 추적" 의도라면 cookie payload 에 user id 추가
  필요.

---

## 6. 미검토 / 추가 확인 필요

1. **production env 상태** — `ADMIN_API_TOKEN` 와 DB `app.admin_password` 가
   동일 값인지 운영자 확인 필요. 다르면 admin login 통과 후 RPC 가 막힘.
2. **`hospitals` / `teams` RLS** — `lib/hospitalService.ts:7-11` 가 anon 의
   SELECT 를 가정. column-level RLS (manager 노출) 는 PII 감사 별 PR 영역 —
   본 감사 범위 밖.
3. **회원가입 후 첫 로그인 user_metadata** — Supabase 트리거
   `handle_new_user` (`lib/auth.ts:103` 주석 참조) 의 실제 정의는 본 감사
   대상 SQL 파일들에 없음. 별도 마이그레이션 / dashboard 설정 가능성.
4. **`/check/[token]`** — 진입점 1-1 에 익명으로 표기했으나 실제 가드 파일
   읽지 않음 (login flow 에 직결되지 않음).
5. **`api/internal/*` (`crawl-hospital-blog`, `poll-batches`)** — 인증 방식
   확인 안 함 — 본 감사는 사용자 로그인 흐름에 한정.
6. **소셜 로그인** — `auth/page.tsx:55` 가 OAuth hash 콜백 처리 코드를
   가지고 있으나 `signInWithOAuth` 호출 자체는 form 에 없음. provider 미설정
   가능성 — 본 감사는 코드만 보고 dashboard 설정 미확인.
7. **`winaid_admin` localStorage 플래그의 set 시점** — admin login 성공
   (`app/admin/page.tsx:568`) 시 set, logout (`page.tsx:595`) /
   `useAuthGuard.handleLogout` (`hooks/useAuthGuard.ts:95`) 시 unset. admin
   cookie 가 만료되어도 localStorage 는 남아있을 수 있음 — `useAuthGuard` 의
   redirect 우회는 plain dashboard 접근까지 허용 (단 API 호출은 cookie 가
   만료되면 401). 의도 / 이슈 여부는 본 감사 범위 밖.
