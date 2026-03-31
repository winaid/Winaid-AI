-- =====================================================
-- Blog History Table for Similarity Checking
-- =====================================================
-- 목적: 사용자가 발행한 블로그 글 이력을 저장하여
--       새 글 작성 시 자체 블로그와의 유사도 검사에 활용

-- 1. blog_history 테이블 생성
CREATE TABLE IF NOT EXISTS public.blog_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  html_content TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  embedding VECTOR(768), -- 임베딩 벡터 (768차원, Gemini embedding 기준)
  naver_url TEXT,
  category TEXT,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스 생성
-- 사용자별 검색을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_blog_history_user_id 
  ON public.blog_history(user_id);

-- 최신 글 조회를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_blog_history_published_at 
  ON public.blog_history(published_at DESC);

-- 벡터 유사도 검색을 위한 인덱스 (pgvector 확장 필요)
-- CREATE INDEX IF NOT EXISTS idx_blog_history_embedding 
--   ON public.blog_history 
--   USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);

-- 3. Row Level Security (RLS) 정책 설정
ALTER TABLE public.blog_history ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 블로그 이력만 조회 가능
CREATE POLICY "Users can view their own blog history"
  ON public.blog_history
  FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

-- 사용자는 자신의 블로그 이력만 삽입 가능
CREATE POLICY "Users can insert their own blog history"
  ON public.blog_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- 사용자는 자신의 블로그 이력만 수정 가능
CREATE POLICY "Users can update their own blog history"
  ON public.blog_history
  FOR UPDATE
  USING (auth.uid() = user_id OR user_id IS NULL);

-- 사용자는 자신의 블로그 이력만 삭제 가능
CREATE POLICY "Users can delete their own blog history"
  ON public.blog_history
  FOR DELETE
  USING (auth.uid() = user_id OR user_id IS NULL);

-- 4. 코멘트 추가 (문서화)
COMMENT ON TABLE public.blog_history IS 
  '블로그 발행 이력 - 유사도 검사 및 자체 콘텐츠 중복 방지용';

COMMENT ON COLUMN public.blog_history.embedding IS 
  '텍스트 임베딩 벡터 (768차원) - Gemini embedding-001 모델 사용';

COMMENT ON COLUMN public.blog_history.keywords IS 
  '추출된 키워드 배열 - 검색 및 분류용';

-- =====================================================
-- 선택사항: pgvector 확장 설치
-- =====================================================
-- Supabase에서 pgvector 확장이 설치되어 있지 않다면:
-- CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- 마이그레이션 완료
-- =====================================================
-- 이 SQL을 Supabase Dashboard > SQL Editor에서 실행하세요.
-- 또는 Supabase CLI: supabase migration new blog_history
