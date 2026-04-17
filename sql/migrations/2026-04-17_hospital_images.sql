-- 병원별 이미지 라이브러리 (블로그 이미지 템플릿용)
-- Supabase Dashboard 에서 bucket 'hospital-images' (public: false) 수동 생성 필요.

CREATE TABLE IF NOT EXISTS hospital_images (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  hospital_name text,
  storage_path text NOT NULL,
  original_filename text,
  file_size integer,
  mime_type text,
  width smallint,
  height smallint,
  tags text[] DEFAULT '{}',
  alt_text text DEFAULT '',
  ai_description text,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hospital_images_user
  ON hospital_images (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hospital_images_tags
  ON hospital_images USING GIN (tags);
