-- ============================================
-- 피드백 이미지 첨부 기능 추가
-- ============================================
--
-- ⚠️ Supabase Dashboard에서 수동으로 해야 할 것:
--
-- 1. Storage > Create new bucket > "feedback-images" (Public bucket)
-- 2. Policies 설정:
--    - INSERT: authenticated users만 허용
--      → (bucket_id = 'feedback-images' AND auth.role() = 'authenticated')
--    - SELECT: 모든 사용자 허용 (public)
--      → (bucket_id = 'feedback-images')
--    - DELETE: 본인 업로드만 삭제 가능
--      → (bucket_id = 'feedback-images' AND auth.uid()::text = (storage.foldername(name))[2])
--
-- ============================================

ALTER TABLE internal_feedbacks ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}';
