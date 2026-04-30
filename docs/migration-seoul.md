# Supabase 리전 이전 런북 — 서울(ap-northeast-2)

> 이 문서는 라이브 마이그레이션 중 체크리스트로 사용한다. 항목을 끝낼 때마다 `[ ]` → `[x]` 로 체크. 단계별 시작/완료 시각을 기록한다.

---

## 0. 개요

| 항목 | 현재 (AS-IS) | 목표 (TO-BE) |
|---|---|---|
| `next-app` (내부용) | Supabase **도쿄** (ap-northeast-1) | Supabase **서울** (ap-northeast-2) |
| `public-app` (외부용) | Supabase **뭄바이** (ap-south-1) | Supabase **서울** (ap-northeast-2) |
| 마이그레이션 SQL | `sql/` (next-app) / `public-app-sql/` (public-app) | 동일 (재실행) |

**원칙**
- **Supabase 프로젝트는 in-place 리전 변경 불가** → 신규 프로젝트 생성 후 데이터 이전.
- 두 앱은 **별개 프로젝트**다. 같은 PR에 섞지 않는다.
- 도쿄/뭄바이 프로젝트는 cutover 후 **최소 7일** 유지 (롤백 윈도).

---

## 1. 사전 결정 (작업 전 확정)

- [ ] **이전 대상**: `next-app` 단독 / `public-app` 단독 / 둘 다 — _____________________
- [ ] **다운타임 윈도**: 시작 ____년 __월 __일 __:__ KST, 예상 ____분
- [ ] **컷오버 방식**: (A) read-only freeze + dump/restore [기본] / (B) logical replication
- [ ] **DNS / 커스텀 도메인 사용 여부**: 예 / 아니오 — 도메인: ____________
- [ ] **롤백 트리거 조건**: smoke test 실패 항목 ___개 이상 / 인증 실패율 ___% 초과 / 기타 _____
- [ ] **공지 대상**: 내부 직원 / 외부 사용자 / 양쪽 — 공지 시점: 작업 ___시간 전
- [ ] **인도 사용자 영향 (public-app만)**: 뭄바이 → 서울 시 latency 증가 수용 — 예 / CDN 우선 검토 필요

---

## 2. 신규 서울 프로젝트 생성

### 2.1. Supabase 대시보드 작업
- [ ] 신규 프로젝트 생성 — 이름: `winaid-next-seoul` (내부) / `winaid-public-seoul` (외부)
- [ ] 리전: **Northeast Asia (Seoul)** — `ap-northeast-2`
- [ ] DB 비밀번호 안전한 저장소(1Password 등)에 보관
- [ ] 프로젝트 ref·anon key·service_role key 기록

### 2.2. 확장 활성화
- [ ] `pgvector` 확장 활성화 (Database → Extensions)
  - SQL: `CREATE EXTENSION IF NOT EXISTS vector;`
- [ ] (필요 시) RLS·트리거 함수에 사용된 추가 확장 확인 후 활성화

### 2.3. 버킷 생성 (대시보드 Storage)
- [ ] `blog-images` (public)
- [ ] `feedback-images` (public 또는 기존 정책 동일)
- [ ] `hospital-images` (private — `sql/migrations/2026-04-17_hospital_images.sql` 주석 참조)
- [ ] 각 버킷의 RLS 정책 복사 (Supabase Dashboard → Storage → Policies)

---

## 3. 스키마 적용

### 3.1. SQL 마이그레이션 재실행 (시간순)
- [ ] **next-app**: `sql/setup/` 의 FULL_SETUP 스크립트 실행 (있다면) 또는 `sql/migrations/` 파일을 **파일명 알파벳 순** 으로 모두 적용.
  ```bash
  # 예시 — 직접 적용 시
  for f in $(ls sql/migrations/*.sql | sort); do
    echo "Applying $f"
    psql "$NEW_SUPABASE_DB_URL" -f "$f"
  done
  ```
- [ ] **public-app**: `public-app-sql/setup/supabase_FULL_SETUP.sql` 실행 후 `public-app-sql/migrations/` 적용.

### 3.2. RLS / 트리거 / 함수 검증
- [ ] `select tablename, rowsecurity from pg_tables where schemaname='public';` — 모든 대상 테이블 RLS 활성 확인
- [ ] `select * from pg_proc where pronamespace='public'::regnamespace;` — 함수 누락 없음 확인
- [ ] `select * from pg_policies where schemaname='public';` — 정책 개수 도쿄/뭄바이와 동일

---

## 4. 데이터 이전

### 4.1. 컷오버 전 사전 dump (warm-up, 본 컷오버 직전 다시 수행)
- [ ] 도쿄/뭄바이에서 `pg_dump` (스키마 제외, 데이터만):
  ```bash
  pg_dump --data-only --no-owner --no-acl \
    --exclude-schema=auth --exclude-schema=storage --exclude-schema=extensions \
    --exclude-table=schema_migrations \
    "$OLD_DB_URL" > data-pre.sql
  ```
- [ ] 신규 서울에 `psql "$NEW_DB_URL" -f data-pre.sql` 시범 적용 → 오류 없는지 확인 → 신규 DB **TRUNCATE** 후 본 컷오버 대기.

### 4.2. Auth 사용자 이전
- [ ] `auth.users` + `auth.identities` dump:
  ```bash
  pg_dump --data-only --no-owner -t auth.users -t auth.identities "$OLD_DB_URL" > auth.sql
  ```
- [ ] 서울 프로젝트에 `psql -f auth.sql`
- [ ] **JWT secret이 다르면** 기존 세션은 무효화된다. 사용자는 재로그인 필요. (공지 항목)
  - 동일 JWT secret 유지하려면 Supabase 지원팀에 요청해야 할 수 있음.

### 4.3. Storage 객체 이전
- [ ] 객체 수 사전 측정:
  ```sql
  select bucket_id, count(*) from storage.objects group by 1;
  ```
- [ ] 옵션 1 — Supabase Storage S3 호환 엔드포인트 + `rclone`:
  ```bash
  rclone sync supabase-old:blog-images supabase-new:blog-images --progress
  rclone sync supabase-old:feedback-images supabase-new:feedback-images --progress
  rclone sync supabase-old:hospital-images supabase-new:hospital-images --progress
  ```
- [ ] 옵션 2 — `storage.objects` 테이블 dump + 객체 별도 복사 (Supabase Migration Tool).
- [ ] 신규 프로젝트에서 객체 수 == 원본 수 확인.

### 4.4. ⚠️ 블로그 본문 내 baked-in URL 점검
`generated_posts.content` 등 HTML 컬럼에 옛 도쿄/뭄바이 publicUrl이 박혀 있을 수 있다.
- [ ] 점검:
  ```sql
  select id, length(content) from generated_posts
  where content like '%supabase.co/storage%' limit 5;
  ```
- [ ] 발견 시 일괄 치환:
  ```sql
  update generated_posts
  set content = replace(content,
    'OLD_PROJECT_REF.supabase.co',
    'NEW_PROJECT_REF.supabase.co')
  where content like '%OLD_PROJECT_REF.supabase.co%';
  ```
- [ ] 동일 점검을 `hospital_crawled_posts.content`, `hospital_style_profiles` 등에도 실행.
  - **중요**: `hospital_images`는 `storage_path`만 저장하므로 영향 없음 (코드에서 `getPublicUrl()`로 동적 생성 — 검증 완료).

---

## 5. 코드 / 환경변수 업데이트

### 5.1. Vercel 환경변수 (Production · Preview 모두)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` → 서울 프로젝트 URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` → 서울 anon key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` → 서울 service role key
- [ ] (해당 시) `next-app` / `public-app` 두 Vercel 프로젝트에 각각 다른 값 적용. **섞이지 않게 주의**.

### 5.2. `.env.example` 업데이트 (선택)
- [ ] `next-app/.env.example`, `public-app/.env.example` 의 주석에 "서울 리전 (ap-northeast-2)" 명시.

### 5.3. CLAUDE.md 메모 (선택)
- [ ] "next-app=Supabase Seoul, public-app=Supabase Seoul (양쪽 분리 프로젝트)" 한 줄 추가.

### 5.4. 외부 webhook / 3rd-party 등록
- [ ] 네이버 OAuth callback URL (있다면) 신규 도메인으로 갱신 — `next-app` / `public-app` 별도
- [ ] Stripe / 토스 / 결제 webhook 엔드포인트
- [ ] Sentry / 모니터링 DSN
- [ ] Slack / 디스코드 알림 webhook (DB에 저장돼 있다면 SQL 업데이트)

---

## 6. 컷오버 (Cutover)

### 6.1. T-30분
- [ ] 사용자 공지 발송
- [ ] 모든 cron / 스케줄러 일시 중지
- [ ] CI/CD 배포 동결

### 6.2. T-0 (다운타임 시작)
- [ ] 도쿄/뭄바이 프로젝트를 **read-only** 로 전환:
  - 옵션 A: `alter database "<dbname>" set default_transaction_read_only = on;` (운영 사용자 영향 큼 — 권장: Vercel에서 `MAINTENANCE_MODE=true` 환경변수로 503 응답)
  - 옵션 B: Vercel 앱을 점검 페이지로 전환
- [ ] 최종 `pg_dump` (4.1 명령 재실행) — `data-final.sql` 생성
- [ ] Storage 최종 `rclone sync --update` (변경분만 복사)
- [ ] 서울에 데이터 적용 — `psql -f data-final.sql`
- [ ] 4.4 의 baked-in URL 치환 SQL 실행
- [ ] 시퀀스 재설정:
  ```sql
  select setval(pg_get_serial_sequence(table_name, column_name),
    (select max(id) from <table>)) from ...;
  ```
  (UUID PK라면 불필요)

### 6.3. 환경변수 스왑 + 배포
- [ ] Vercel 환경변수를 **서울 값** 으로 변경 (5.1)
- [ ] `MAINTENANCE_MODE=false` 또는 점검 모드 해제
- [ ] Vercel 재배포 트리거 — Production
- [ ] 헬스체크 엔드포인트 200 확인

### 6.4. T+0 (서비스 재개)
- [ ] 7번 smoke test 즉시 시작
- [ ] cron / 스케줄러 재가동
- [ ] 사용자 재로그인 안내 (JWT secret 변경 시)

---

## 7. Smoke Test (cutover 직후 30분 내)

### 7.1. next-app (내부용)
- [ ] 로그인 / 세션 유지
- [ ] 블로그 생성 (`/blog`) — 1편 끝까지 (텍스트 + 이미지 + SEO + 저장)
- [ ] 라이브러리 이미지 업로드 (`hospital-images` 버킷 쓰기 검증)
- [ ] 라이브러리 이미지 자동 매칭 (블로그 생성 시 hospital_images 조회)
- [ ] 네이버 크롤 (`/api/naver/crawl-hospital-blog`)
- [ ] 진단 (diagnostic) 1회 실행
- [ ] 크레딧 차감 정상 (`subscriptions` 테이블 갱신)
- [ ] 팀/프로필 조회 (`teams`, `profiles`, RLS 동작)

### 7.2. public-app (외부용)
- [ ] 외부 사용자 회원가입 / 로그인
- [ ] 핵심 기능 1건 끝까지 (앱별 정의)
- [ ] 결제 webhook (Stripe/토스) 1건 수신 확인 (가능하면 테스트 모드로 사전 확인)

### 7.3. 데이터 무결성
- [ ] 도쿄/뭄바이 vs 서울의 주요 테이블 row count 비교:
  ```sql
  select 'generated_posts' as t, count(*) from generated_posts
  union all select 'hospital_images', count(*) from hospital_images
  union all select 'profiles', count(*) from profiles
  union all select 'hospital_crawled_posts', count(*) from hospital_crawled_posts;
  ```
- [ ] 최근 7일 데이터의 max(created_at)이 누락되지 않았는지 확인

---

## 8. 롤백 시나리오

> Smoke test 실패 또는 critical 장애 발생 시 즉시 실행. 30분 내 결정.

- [ ] Vercel 환경변수를 **도쿄/뭄바이 값**으로 되돌림
- [ ] 도쿄/뭄바이 DB의 read-only 해제 (`set default_transaction_read_only = off;`)
- [ ] Vercel 재배포
- [ ] cutover 동안 서울에 입력된 데이터는 **수동으로 도쿄/뭄바이에 역적용** (소량이라 가정)
- [ ] 원인 분석 후 일정 재계획

---

## 9. 사후 정리 (cutover 성공 후 7일 이상)

- [ ] D+1: 운영 모니터링, 에러율·latency 비교 (도쿄/뭄바이 평균 대비 서울)
- [ ] D+3: 사용자 피드백 수집
- [ ] D+7: 도쿄/뭄바이 프로젝트를 **paused** 상태로 전환 (즉시 삭제 X)
- [ ] D+30: 도쿄/뭄바이 프로젝트 최종 삭제 + 백업 따로 보관 (S3 cold storage)
- [ ] CHANGELOG.md / README.md 업데이트
- [ ] `CLAUDE.md` 또는 `docs/` 의 리전 메모 갱신

---

## 10. 참고 — 인벤토리 (작업 시작 시점 자동 추출)

### 환경변수 (`grep` 결과)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### 테이블 (next-app `.from()` 호출 기준)
api_rate_limit, diagnostic_history, diagnostic_public_shares, diagnostic_stream_cache, generated_posts, hospital_crawled_posts, hospital_images, hospital_style_profiles, hospitals, influencer_outreach, internal_feedbacks, profiles, subscriptions, teams

### Storage 버킷
blog-images, feedback-images, hospital-images

### 확장
pgvector

### 코드 내 하드코딩 URL
없음 (Storage publicUrl 은 SDK `getPublicUrl()` 동적 생성) ✓

### baked-in URL 위험
`generated_posts.content`, `hospital_crawled_posts.content` HTML 컬럼 — cutover 시 치환 필요 (4.4 참조)
