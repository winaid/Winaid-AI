-- hospital_images RLS 활성화 + 사용자 격리 정책
-- 2026-04-17 마이그레이션 당시 RLS 미설정으로 타 user 이미지 열람/수정/삭제 가능했던 문제 보완.

ALTER TABLE hospital_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own images" ON hospital_images;
CREATE POLICY "Users can view own images" ON hospital_images
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own images" ON hospital_images;
CREATE POLICY "Users can insert own images" ON hospital_images
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own images" ON hospital_images;
CREATE POLICY "Users can update own images" ON hospital_images
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own images" ON hospital_images;
CREATE POLICY "Users can delete own images" ON hospital_images
  FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket 'hospital-images' 는 public URL 으로 사용 중이므로 별도 정책 변경 없음.
-- 추후 private 으로 전환하려면 signed URL + storage.objects RLS 추가 필요 (별도 작업).
