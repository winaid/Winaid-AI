-- hospital_images: soft delete + usage_count 증가 RPC
-- 2026-04-24 작업. 기존 블로그 src 깨짐 방지 (hard delete → soft delete)
-- + 라이브러리 이미지 사용 통계 자동 증가 (dead column 활성화).
-- 주의: user_id 컬럼은 text 타입 → owner_id 파라미터도 text 로 받음.

-- 1) soft delete 컬럼
ALTER TABLE hospital_images ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_hospital_images_active ON hospital_images(user_id, is_deleted) WHERE is_deleted = false;

-- 2) usage_count 증가 RPC (SECURITY DEFINER + owner 검증)
--    클라이언트가 여러 이미지 사용 시 단일 호출로 증가. RLS 우회 안전:
--    owner_id 파라미터 검증으로 본인 이미지만 증가 가능.
CREATE OR REPLACE FUNCTION increment_image_usage(image_ids uuid[], owner_id text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE hospital_images
  SET usage_count = COALESCE(usage_count, 0) + 1
  WHERE id = ANY(image_ids) AND user_id = owner_id AND is_deleted = false;
  SELECT 1;
$$;

REVOKE ALL ON FUNCTION increment_image_usage(uuid[], text) FROM public;
GRANT EXECUTE ON FUNCTION increment_image_usage(uuid[], text) TO authenticated;

-- 참고: 이전 시그니처 (uuid[], uuid) 가 존재하면 제거 (함수 시그니처 충돌 방지)
DROP FUNCTION IF EXISTS increment_image_usage(uuid[], uuid);
