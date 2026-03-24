-- internal_feedbacks: 내부용 피드백 (페이지 단위, 각 기록별 댓글이 아님)
-- 로그인한 사용자만 작성 가능, 작성자 이름 저장

CREATE TABLE IF NOT EXISTS internal_feedbacks (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL,                          -- auth.users.id
  user_name   text NOT NULL DEFAULT '',               -- 작성자 표시 이름
  content     text NOT NULL DEFAULT '',               -- 피드백 본문
  page        text NOT NULL DEFAULT 'history',        -- 어떤 화면에서 작성했는지
  created_at  timestamptz DEFAULT now() NOT NULL
);

-- 인덱스: 페이지별 최신순 조회
CREATE INDEX IF NOT EXISTS idx_internal_feedbacks_page
  ON internal_feedbacks (page, created_at DESC);

-- RLS
ALTER TABLE internal_feedbacks ENABLE ROW LEVEL SECURITY;

-- 조회: 인증된 사용자 모두
CREATE POLICY "Authenticated users can read feedbacks"
  ON internal_feedbacks FOR SELECT
  TO authenticated
  USING (true);

-- 작성: 본인만
CREATE POLICY "Authenticated users can insert own feedbacks"
  ON internal_feedbacks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 삭제: 본인만
CREATE POLICY "Users can delete own feedbacks"
  ON internal_feedbacks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
