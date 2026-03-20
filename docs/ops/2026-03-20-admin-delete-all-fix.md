# 운영 수정 기록: 어드민 "전체 삭제" 기능 복구

> 일시: 2026-03-20
> 수정 대상: 운영 Supabase DB (RPC 함수)
> 코드 변경: 없음
> 영향 범위: AdminPage "전체 삭제" 버튼

---

## 문제 증상

어드민 페이지에서 "전체 삭제" 버튼을 눌러도 콘텐츠가 삭제되지 않았다.
로그인, 통계 조회, 개별 삭제는 정상 동작.

## 원인

운영 DB의 `delete_all_generated_posts` RPC 함수가 다른 admin 함수들과 비밀번호 검증 로직이 불일치했다.

- `get_admin_stats`, `delete_generated_post`, `get_all_generated_posts`는 `current_setting('app.admin_password')` + fallback `'winaid'` 패턴을 사용
- `delete_all_generated_posts`는 구버전(하드코딩 비밀번호)이 적용되어 있었을 가능성이 높음
- 마이그레이션 파일이 3곳에 분산되어 있어(`supabase_migration_delete_all_posts.sql`, `supabase_migration_admin_password_env.sql`, `supabase_FULL_SETUP.sql`) 적용 누락이 발생하기 쉬운 구조였음

## 왜 프론트엔드 코드는 정상이었는가

`postStorageService.ts`의 `deleteAllGeneratedPosts` 함수는:

1. `sessionStorage.getItem('ADMIN_TOKEN')`에서 비밀번호를 가져옴
2. `supabase.rpc('delete_all_generated_posts', { admin_password })` 호출
3. 응답 검증 (null 방어, -1 인증 실패 처리, NaN 방어)

호출 시그니처 `(admin_password TEXT) RETURNS BIGINT`가 DB 함수와 완전히 일치.
문제는 DB 측 함수 내부 로직에 있었으므로 프론트 수정이 불필요했다.

## 적용한 SQL

Supabase SQL Editor에서 아래 SQL을 직접 실행:

```sql
CREATE OR REPLACE FUNCTION delete_all_generated_posts(
  admin_password TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT;
  deleted_count BIGINT;
BEGIN
  BEGIN
    valid_password := current_setting('app.admin_password');
  EXCEPTION WHEN OTHERS THEN
    valid_password := 'winaid';
  END;

  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN -1;
  END IF;

  DELETE FROM public.generated_posts;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$fn$;
```

동일한 SQL은 `sql/migrations/2026-03-20_fix_delete_all_generated_posts.sql`에 보존됨.

## 코드 변경이 없었던 이유

- 프론트엔드 호출 경로(`AdminPage → postStorageService → supabase.rpc`)는 이미 정상
- Cloudflare Functions의 `/api/content/delete-all` 엔드포인트는 이 기능과 무관 (KV 삭제용이며 AdminPage에서 사용하지 않음)
- 수정이 필요한 곳은 DB 함수 정의 한 곳뿐이었음

## 재발 방지 포인트

1. **마이그레이션 일관성**: admin RPC 함수를 수정할 때 `supabase_migration_admin_password_env.sql`의 4개 함수(`get_admin_stats`, `get_all_generated_posts`, `delete_generated_post`, `delete_all_generated_posts`)를 항상 함께 업데이트할 것
2. **DB-코드 drift 감지**: 새 마이그레이션 적용 후 AdminPage에서 로그인/조회/개별삭제/전체삭제를 모두 테스트할 것
3. **함수 존재 확인 쿼리**: 배포 후 아래 쿼리로 4개 admin 함수가 모두 존재하는지 확인
   ```sql
   SELECT proname FROM pg_proc p
   JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'public'
     AND proname IN ('get_admin_stats', 'get_all_generated_posts', 'delete_generated_post', 'delete_all_generated_posts');
   ```

## 확인 방법

1. AdminPage에서 "전체 삭제" 버튼 클릭 → "전체삭제" 입력 → 확인 → 삭제 성공 toast 확인
2. Supabase SQL Editor에서 함수 정의 확인:
   ```sql
   SELECT pg_get_functiondef(p.oid)
   FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'public' AND p.proname = 'delete_all_generated_posts';
   ```
3. 함수 내부에 `current_setting('app.admin_password')` + fallback 로직이 포함되어 있는지 확인
