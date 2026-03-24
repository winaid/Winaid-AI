-- post_feedbacks: 내부용 피드백 (history 상세 하단)
-- 로그인한 사용자만 작성 가능, 작성자 이름 저장

CREATE TABLE IF NOT EXISTS post_feedbacks (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id     uuid NOT NULL,                          -- generated_posts.id
  user_id     uuid NOT NULL,                          -- auth.users.id
  user_name   text NOT NULL DEFAULT '',               -- 작성자 표시 이름
  content     text NOT NULL DEFAULT '',               -- 피드백 본문
  created_at  timestamptz DEFAULT now() NOT NULL
);

-- 인덱스: 특정 글의 피드백 조회 (시간순)
CREATE INDEX IF NOT EXISTS idx_post_feedbacks_post_id ON post_feedbacks (post_id, created_at ASC);

-- RLS: 인증된 사용자만 CRUD
ALTER TABLE post_feedbacks ENABLE ROW LEVEL SECURITY;

-- 조회: 같은 조직이면 모두 볼 수 있도록 (현재는 인증만 체크)
CREATE POLICY "Authenticated users can read feedbacks"
  ON post_feedbacks FOR SELECT
  TO authenticated
  USING (true);

-- 작성: 본인만
CREATE POLICY "Authenticated users can insert own feedbacks"
  ON post_feedbacks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 삭제: 본인만
CREATE POLICY "Users can delete own feedbacks"
  ON post_feedbacks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
