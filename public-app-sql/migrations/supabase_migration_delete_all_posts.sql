-- delete_all_generated_posts: admin 전체 콘텐츠 삭제 RPC
-- generated_posts 테이블만 대상. 사용자/결제/설정 등 다른 테이블은 건드리지 않음.
-- 인증 실패 시 -1 반환, 성공 시 삭제 건수 반환.

CREATE OR REPLACE FUNCTION delete_all_generated_posts(
  admin_password TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  valid_password TEXT := 'winaid';
  deleted_count BIGINT;
BEGIN
  IF admin_password IS NULL OR admin_password != valid_password THEN
    RETURN -1;  -- 인증 실패
  END IF;

  DELETE FROM public.generated_posts;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$fn$;
