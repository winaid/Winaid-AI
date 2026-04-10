-- ============================================
-- video_outputs 테이블 — 파이프라인/AI쇼츠/카드뉴스쇼츠 결과 영상 저장
-- ============================================
--
-- Storage bucket: video-outputs (public, 50MB 파일 한도)
--   대시보드에서 수동 생성 필요:
--   1. Storage → New bucket → name: video-outputs, public: ON
--   2. RLS는 user_id별 폴더 prefix로 격리 (path = {user_id}/{timestamp}_{name}.mp4)
--
-- 보관 기간: 7일 (created_at + 7 days)
--   조회 시 expires_at > now() 필터 (이 파일 안의 list 함수 참고)
--   실제 파일 삭제는 별도 cron/Edge Function에서 처리
-- ============================================

CREATE TABLE IF NOT EXISTS public.video_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_path TEXT NOT NULL,        -- Storage 내부 경로 (삭제 시 사용)
  file_size BIGINT DEFAULT 0,
  duration REAL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('pipeline', 'ai_shorts', 'card_to_shorts')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

ALTER TABLE public.video_outputs ENABLE ROW LEVEL SECURITY;

-- RLS: 본인 영상만 insert/select/delete 가능 (generated_posts와 동일 패턴)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='video_outputs' AND policyname='Users can insert own videos') THEN
    CREATE POLICY "Users can insert own videos" ON public.video_outputs
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='video_outputs' AND policyname='Users can view own videos') THEN
    CREATE POLICY "Users can view own videos" ON public.video_outputs
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='video_outputs' AND policyname='Users can delete own videos') THEN
    CREATE POLICY "Users can delete own videos" ON public.video_outputs
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_video_outputs_user_id ON public.video_outputs(user_id);
CREATE INDEX IF NOT EXISTS idx_video_outputs_created_at ON public.video_outputs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_outputs_expires_at ON public.video_outputs(expires_at);

-- ============================================
-- Storage RLS (선택) — 본인 폴더에만 접근
-- Storage RLS는 Supabase 대시보드 또는 별도 SQL로 적용. 아래는 참고용.
-- ============================================
-- CREATE POLICY "Users can upload to own folder"
--   ON storage.objects FOR INSERT
--   WITH CHECK (
--     bucket_id = 'video-outputs'
--     AND auth.uid()::text = (storage.foldername(name))[1]
--   );
--
-- CREATE POLICY "Public can read video-outputs"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'video-outputs');
