-- Migration: increment_image_usage RPC — auth.uid() 직접 사용 (클라이언트 owner_id 신뢰 제거)
--
-- 기존: increment_image_usage(image_ids uuid[], owner_id text)
--       → 클라이언트가 owner_id를 전달. 조작 위험.
--
-- 신규: increment_image_usage(image_ids uuid[])
--       → auth.uid() 로 소유자 검증. 클라이언트 파라미터 신뢰 안 함.
--
-- ⚠️  Supabase SQL Editor에서 직접 실행 필요 (자동 마이그레이션 아님).

DROP FUNCTION IF EXISTS increment_image_usage(uuid[], text);

CREATE OR REPLACE FUNCTION increment_image_usage(image_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE hospital_images
  SET usage_count = COALESCE(usage_count, 0) + 1,
      updated_at  = NOW()
  WHERE id        = ANY(image_ids)
    AND user_id   = auth.uid()::text
    AND is_deleted = false;
END;
$$;

-- 기존 public 권한 제거 후 authenticated 만 허용
REVOKE ALL ON FUNCTION increment_image_usage(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION increment_image_usage(uuid[]) TO authenticated;
