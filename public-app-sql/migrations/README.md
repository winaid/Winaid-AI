# Migration conventions (public-app · public-app-sql/migrations/)

## 파일 명명

```
YYYY-MM-DD_<purpose>.sql                 # 신규 (2026-03-20 이후)
supabase_migration_<purpose>.sql         # legacy (2026-03 이전, 유지보수만)
add_<purpose>.sql                        # legacy
```

## 적용 순서

`ls *.sql | sort` 결과 순서. 즉:
1. `2026-MM-DD_*.sql` (날짜 순)
2. `add_*.sql` (legacy)
3. `supabase_migration_*.sql` (legacy)

신규 마이그레이션은 항상 dated 형식 사용.

## 필수 패턴 (re-runnable / idempotent)

모든 마이그레이션은 **여러 번 실행해도 같은 결과** 여야 함. 신규 fresh setup
+ 기존 환경 양쪽에서 안전.

### CREATE TABLE
```sql
CREATE TABLE IF NOT EXISTS public.foo (...);
```

### ADD COLUMN
```sql
ALTER TABLE public.foo
  ADD COLUMN IF NOT EXISTS bar TEXT;
```

### ALTER COLUMN TYPE (DO 블록 안에서 조건부)
```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='foo'
      AND column_name='bar' AND data_type='uuid'
  ) THEN
    ALTER TABLE public.foo ALTER COLUMN bar TYPE TEXT USING bar::text;
  END IF;
END $$;
```

### CREATE INDEX
```sql
CREATE INDEX IF NOT EXISTS idx_foo_bar ON public.foo(bar);
```

### CREATE / DROP POLICY
```sql
DROP POLICY IF EXISTS "policy_name" ON public.foo;
CREATE POLICY "policy_name" ON public.foo ...;
```

### CREATE / DROP TRIGGER
```sql
DROP TRIGGER IF EXISTS trg_foo ON public.foo;
CREATE TRIGGER trg_foo ...;
```

### CREATE OR REPLACE FUNCTION (RETURN 타입 변경 가능성 있을 때)
```sql
DROP FUNCTION IF EXISTS public.foo(arg_type1, arg_type2) CASCADE;
CREATE OR REPLACE FUNCTION public.foo(...) ...;
```

> ⚠️ `CREATE OR REPLACE FUNCTION` 은 RETURN 타입 변경 시 fail. RETURN 타입이
> 후속 마이그레이션에서 바뀔 가능성 있으면 `DROP FUNCTION IF EXISTS sig CASCADE`
> 를 직전에 명시.

### ⚠️ ADD CONSTRAINT — 항상 DROP IF EXISTS 선행
```sql
-- BAD ❌
ALTER TABLE public.foo
  ADD CONSTRAINT foo_bar_check CHECK (bar IN ('a','b'));

-- GOOD ✅
ALTER TABLE public.foo DROP CONSTRAINT IF EXISTS foo_bar_check;
ALTER TABLE public.foo
  ADD CONSTRAINT foo_bar_check CHECK (bar IN ('a','b'));
```

이유: CREATE TABLE 의 inline `CHECK` 절도 동명 constraint 자동 생성. 같은
이름으로 ADD CONSTRAINT 시도 시 `42710 already exists` 에러 발생.

### Schema drift 발견 시

운영 DB 가 source SQL 과 다른 형태(out-of-band Dashboard 변경 등)이면
즉시 정식 migration 파일로 정리. 미루면 다음 마이그레이션 / fresh setup
시 충돌 발생.

예시: `2026-05-01_post_migration_drift.sql`

## 설치/적용 가이드

신규 Supabase 프로젝트:
1. Dashboard SQL Editor 열기
2. `bootstrap_new_supabase.sql` paste & run (base schema)
3. `migrations/*.sql` 을 파일명 알파벳 순으로 paste & run
4. 검증: `SELECT count(*) FROM information_schema.tables WHERE table_schema='public';`
