-- ============================================
-- profiles 테이블 이름 표시 버그 수정
-- 문제: handle_new_user() 트리거가 name만 저장하고 full_name을 비워둠
--       + INSERT RLS 정책 없어서 클라이언트 upsert 실패
-- ============================================

-- 1. 기존 데이터 복구: name이 있는데 full_name이 없는 경우 복사
UPDATE public.profiles
SET full_name = name
WHERE full_name IS NULL AND name IS NOT NULL;

-- 2. handle_new_user() 트리거 수정: full_name + team_id도 저장
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, full_name, team_id, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    (NEW.raw_user_meta_data->>'team_id')::INTEGER,
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. profiles INSERT 정책 추가 (본인 프로필 생성 허용)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can insert own profile') THEN
    CREATE POLICY "Users can insert own profile" ON public.profiles
      FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;
