# Agent B — SQL / RLS / Data integrity

검토 SQL 파일: 98개 / 핵심 테이블: 21개

## Critical

### [DB-024] admin RPC 'winaid' fallback 회귀
- 카테고리: 보안 / Critical (회귀) / `sql/migrations/2026-05-04_admin_rpc_quick_recovery.sql:106-110, 152-154, 187-189, 217-219`
- 같은 날짜 `2026-05-04_security_hardening.sql`이 'winaid' fallback을 RAISE EXCEPTION으로 제거했는데, _admin_rpc_quick_recovery가 같은 날 CREATE OR REPLACE로 부활시킴
- 적용 순서에 따라 anon이 'winaid' 패스워드로 admin 권한 획득 → PII 전수 SELECT + generated_posts wipe
- 수정: quick_recovery에서도 fallback을 RAISE로 통일

### [DB-020] _migration/seoul/internal/00_wipe.sql이 git tracked
- 카테고리: 운영성 / Critical (운영 실수) / `_migration/seoul/internal/00_wipe.sql`
- 자동화 도구가 모든 .sql 순회 시 실수로 운영 DB wipe 가능
- 수정: 별도 디렉토리(_migration/.dangerous/) + 파일명 prefix _DANGER_ + safety header

## High

### [DB-001] generated_posts INSERT 정책 OR user_id IS NULL 분기
- 보안 / High / `sql/setup/supabase_FULL_SETUP.sql:46`, `public-app-sql/setup:46`, `_migration/seoul/internal/01_setup.sql:228`
- PR #104가 anon 정책만 DROP, base 정책의 NULL 분기는 그대로
- anon이 user_id=NULL로 INSERT 가능 → admin RPC가 노출

### [DB-002] subscriptions plan_type/credits_total 본인 변조 가능 (매출 누수)
- 보안 / High / `sql/setup:101-103`
- WITH CHECK 절 부재 → 콘솔 1줄로 premium 무료 승급
- _rls_anon_lockdown.sql:58-61에 "옵션 C"로 후속 명시되었으나 미처리

### [DB-003] signUpWithEmail의 plan_type='admin'은 CHECK 위반
- 데이터 무결성 / High / `public-app/lib/auth.ts:86-95`
- subscriptions.plan_type CHECK는 ('free','basic','standard','premium')만 허용
- admin 계정의 deduct_credits 흐름 파손
- 수정: CHECK에 'admin' 추가 또는 코드를 'premium'으로

### [DB-004] hospital_images RLS 두 코드베이스 비대칭
- 보안 / High / next-app은 owner 검증 추가됨 / public-app은 strict 정책 마이그레이션 부재
- public-app authenticated가 다른 사용자 row 변조 가능
- 수정: 2026-04-24/05-04 마이그레이션 public-app-sql/migrations/에 복제

### [DB-005] hospital-images storage RLS — 임의 user 폴더 업로드 가능
- 보안 / High / `sql/migrations/2026-04-29_image_library_team_share.sql:160-179`
- WITH CHECK이 bucket+role만 검사, foldername 미검증 (주석에 "server에서" 인정)
- 수정: `(storage.foldername(name))[1] = auth.uid()::text`

### [DB-008] handle_new_user 트리거 setup vs hardening 충돌
- 보안 / High (운영성) / 3개 마이그레이션이 서로 다르게 정의
- 신규 환경에서 fullname fix만 적용 후 hardening 누락 시 team_id 신뢰 회귀
- 수정: setup base를 hardening 버전으로 통일 + idempotent overlay

### [DB-018] PII 컬럼 평문 저장 (pgcrypto 미사용) — PIPA 위반
- 컴플라이언스 / High / `sql/setup:21-26` (user_email, ip_hash, doctor_name)
- 보관기간/파기 트리거/우탈권 함수 부재
- 수정: pgcrypto AES + 만료 트리거 + 익명화 함수

### [DB-019] supabase/schema.sql과 sql/setup 스키마 drift 공식화
- 운영성 / High / schema.sql은 profiles.plan/remaining_credits, setup은 subscriptions 분리
- 신규 환경에서 잘못 적용 시 dead column + 두 차감 함수 충돌
- 수정: schema.sql 폐기 명시 또는 동기화

### [DB-022] hospital_images.user_id TEXT 타입 — FK 강제 불가
- 데이터 무결성 / High / 'guest'/임의 문자열 INSERT 가능, orphaned row 발생
- 수정: 별도 is_guest BOOLEAN + nullable uuid + 부분 인덱스

### [DB-025] admin RPC password 클라이언트 평문 전달
- 보안 / High / `next-app/app/admin/adminTypes.ts:62-64, 90, 143`
- 클라이언트 supabase(anon)로 admin_password 평문 전송 → MITM/XSS 시 노출
- 수정: server-only API route + service_role + RPC 시그니처에서 password 인자 제거

### [DB-029] deduct_credits RPC caller 검증 부재
- 보안 / High / `sql/setup:400-430`
- use_credit/refund_credit는 hardening됐지만 deduct_credits는 누락
- anon이 victim의 credits_used를 +99999 → 크레딧 고갈 (DOS)

### [DB-037] profiles 전체 SELECT를 anon에게 허용 (PIPA 위반)
- 보안/컴플라이언스 / High / `_migration/seoul/internal/01_setup.sql:85-87`
- "Anon can view profiles ... USING (true)" — 전 사용자 email/full_name/team_id 노출
- 수정: anon SELECT 제거 + admin 페이지를 service_role로

### [DB-038] adminService.delete_all_generated_posts client-side anon 호출
- 보안 / High / `next-app/lib/adminService.ts:14`
- 'winaid' fallback(DB-024) 활성 시 anon 1회 RPC로 전체 wipe

## Medium

### [DB-006] api_usage_logs anon INSERT 허용
- 보안 / Medium / `_migration/seoul/internal/01_setup.sql:473-475`
- anon이 임의 row INSERT → 비용 통계 오염 (회계 왜곡)

### [DB-007] medical_law_cache anon INSERT/UPDATE 무제한
- 보안 / Medium / `sql/migrations/supabase_migration_medical_law_cache.sql:42-53`
- 의료광고법 룰 변조 → 검증 무력화 → 의료법 위반 글 생산

### [DB-009] hospital_style_profiles brand_preset 컬럼 next-app DB에 부재
- 데이터 무결성 / Medium / 모노레포 비대칭

### [DB-010] generated_posts (user_id, created_at) 복합 인덱스 부재
- 성능 / Medium / 사용자별 listPosts가 글 수 증가 시 latency 선형 증가

### [DB-011] hospital_crawled_posts limit 트리거 race condition
- 데이터 무결성 / Medium / 동시 INSERT 시 보관량 비결정적
- 수정: advisory lock or LOCK TABLE EXCLUSIVE

### [DB-013] refund_credit RPC 산식 fragile
- 데이터 무결성 / Medium / EXCLUDED 우회로 baseline `10` 변경 시 깨짐
- 수정: `SET credits = user_credits.credits + p_amount` 직접 표현

### [DB-014] api_rate_limit TTL/cleanup 부재
- 성능/운영성 / Medium / 1년 누적 시 수십만 row → 인덱스 비대화
- 수정: pg_cron으로 1일 이전 row DELETE

### [DB-021] DOWN 스크립트 부재 — 롤백 어려움
- 운영성 / Medium / 최근 PR은 ROLLBACK 주석 있지만 초기 마이그레이션 부재

### [DB-023] increment_image_usage RPC public-app DB 부재
- 데이터 무결성 / Medium / 향후 public-app 추가 시 즉시 깨짐

### [DB-026] blog-images 버킷 anon upload 허용
- 보안 / Medium / `supabase/schema.sql:472-475`, `_migration/seoul/internal/01_setup.sql:710-713`
- rate limit 없음 → storage abuse + 비용

### [DB-027] match_blog_posts filter_user_id NULL 허용
- 보안 / Medium / `supabase/schema.sql:264-303`
- 후속 PR이 SECURITY DEFINER 추가하면 타 사용자 임베딩 유출

### [DB-028] influencer_outreach.dm_message PII 평문
- 컴플라이언스 / Medium / 백업/덤프 시 평문 노출
- 수정: pgcrypto 암호화 + 마스킹 view

### [DB-031] setup 파일 두 개 비대칭 (public-app vs sql)
- 운영성 / Medium / 신규 환경 부팅 시 보안 비대칭

### [DB-032] payments 멱등키(idempotency_key) 컬럼 부재
- 데이터 무결성 / Medium / 결제 webhook 중복/누락 risk (현재 사용 코드 미발견)

### [DB-033] crawled_posts seo 컬럼 _migration/seoul에 없음
- 운영성 / Medium / seoul 신규 환경 INSERT 실패

### [DB-017] generated_posts에 model_id/version 추적 컬럼 부재
- AI/운영성 / Medium / 회귀 발생 시 모델 추적 불가, 의료법 위반 사후 분석 불가

## Low

### [DB-012] use_credit RPC FOR UPDATE 후 IF 분기 (미세) — Low
### [DB-015] diagnostic_stream_cache 30일 TTL DB 정리 부재 — Low
### [DB-016] api_usage_logs (user_id, task) 복합 인덱스 부재 — Low
### [DB-030] usage_logs service_role policy 명시 부재 — Low (운영성)
### [DB-034] llm_batches.created_by 인덱스 부재 — Low
### [DB-035] api_usage_logs.details JSONB 무제한 — Low
### [DB-036] hospitals.naver_blog_urls TEXT[] UNIQUE/검증 부재 — Low

## 통계
| 카테고리 | Critical | High | Medium | Low | 합계 |
|---|---|---|---|---|---|
| 🔒 보안/RLS | 1 | 9 | 4 | 0 | 14 |
| 💾 데이터 무결성 | 0 | 2 | 6 | 1 | 9 |
| ⚡ 성능 | 0 | 0 | 2 | 3 | 5 |
| 📊 운영성 | 1 | 1 | 3 | 1 | 6 |
| ⚖️ 컴플라이언스 | 0 | 1 | 1 | 0 | 2 |
| 🤖 AI | 0 | 0 | 1 | 0 | 1 |
| **합계** | **2** | **13** | **17** | **5** | **37** |

## 시급 처리 Top 7
1. DB-024 (Critical 회귀) — 'winaid' fallback 제거
2. DB-029 (High) — deduct_credits caller 검증
3. DB-002 (High, 매출 누수) — subscriptions plan_type 변조 차단
4. DB-037 (High, PIPA) — anon profiles SELECT 제거
5. DB-001 (High) — generated_posts NULL 분기 제거
6. DB-004/005 (High) — public-app hospital_images RLS + storage 폴더 enforce
7. DB-018/028 (PIPA) — pgcrypto 도입

PR #104의 anon 잠금은 generated_posts/subscriptions의 anon 정책만 처리. (a) base 정책 NULL 분기, (b) 본인 row 변조 허용, (c) profiles anon SELECT, (d) deduct_credits caller 검증, (e) admin 'winaid' fallback이 잔존/회귀.

## 미검토 영역
- 운영 DB의 pg_policies 라이브 상태 (마이그레이션 누적이라 실측 필요)
- _migration/seoul/internal/03_2026-03.sql, 04_2026-04.sql 후반부
- payments 테이블 사용처 (코드 호출 미발견)
- storage bucket 단위 listing 권한 (objects 외)
