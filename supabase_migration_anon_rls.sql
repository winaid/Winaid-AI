-- ============================================
-- anon 역할 RLS 정책 추가
-- 관리자 페이지에서 Supabase Auth 로그인 없이
-- 비밀번호만으로 말투 학습/크롤링 기능 사용 가능하게 함
--
-- Supabase Dashboard > SQL Editor에서 실행하세요.
-- ============================================

-- 1. hospital_style_profiles: anon 역할 허용
CREATE POLICY "Anon can view style profiles" ON public.hospital_style_profiles
  FOR SELECT USING (true);

CREATE POLICY "Anon can insert style profiles" ON public.hospital_style_profiles
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon can update style profiles" ON public.hospital_style_profiles
  FOR UPDATE USING (true);

-- 2. hospital_crawled_posts: anon 역할 허용
CREATE POLICY "Anon can view crawled posts" ON public.hospital_crawled_posts
  FOR SELECT USING (true);

CREATE POLICY "Anon can insert crawled posts" ON public.hospital_crawled_posts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon can update crawled posts" ON public.hospital_crawled_posts
  FOR UPDATE USING (true);

CREATE POLICY "Anon can delete crawled posts" ON public.hospital_crawled_posts
  FOR DELETE USING (true);

-- ============================================
-- 완료!
-- 이제 관리자 페이지에서 비밀번호만 입력하면
-- 말투 학습/크롤링 기능을 사용할 수 있습니다.
-- ============================================
