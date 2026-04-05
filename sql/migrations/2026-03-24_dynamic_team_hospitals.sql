-- ============================================
-- 2026-03-24: 팀/병원 데이터 동적 관리 테이블
-- ============================================
-- 기존: teamHospitals.ts 하드코딩
-- 변경: DB에서 관리 → admin에서 추가/삭제 가능

-- 1) teams 테이블
CREATE TABLE IF NOT EXISTS public.teams (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,           -- '본부장님', '1팀', '2팀', '3팀'
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon can read teams" ON public.teams FOR SELECT USING (true);

-- 2) hospitals 테이블
CREATE TABLE IF NOT EXISTS public.hospitals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id INT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- '맘애든어린이치과'
  manager TEXT NOT NULL DEFAULT '',    -- '김주열 팀장님'
  address TEXT DEFAULT '',             -- '충남 천안시 서북구 불당동'
  naver_blog_urls TEXT[] DEFAULT '{}', -- ARRAY['https://blog.naver.com/x577wqy3']
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name)
);

ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon can read hospitals" ON public.hospitals FOR SELECT USING (true);
CREATE POLICY "Anon can insert hospitals" ON public.hospitals FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon can update hospitals" ON public.hospitals FOR UPDATE USING (true);
CREATE POLICY "Anon can delete hospitals" ON public.hospitals FOR DELETE USING (true);

-- 3) 인덱스
CREATE INDEX IF NOT EXISTS idx_hospitals_team_id ON public.hospitals(team_id);
CREATE INDEX IF NOT EXISTS idx_hospitals_is_active ON public.hospitals(is_active);

-- 4) Seed 데이터 — 기존 teamData.ts 이식
INSERT INTO public.teams (id, label, sort_order) VALUES
  (0, '본부장님', 0),
  (1, '1팀', 1),
  (2, '2팀', 2),
  (3, '3팀', 3)
ON CONFLICT (id) DO NOTHING;

-- 시퀀스 조정 (다음 auto-increment가 4부터)
SELECT setval('teams_id_seq', 4, false);

INSERT INTO public.hospitals (team_id, name, manager, address, naver_blog_urls) VALUES
  -- 본부장님
  (0, '광화문선치과', '본부장님', '서울 종로구 광화문', ARRAY['https://blog.naver.com/sundent21']),
  -- 1팀 김주열
  (1, '맘애든어린이치과', '김주열 팀장님', '충남 천안시 서북구 불당동', ARRAY['https://blog.naver.com/x577wqy3','https://blog.naver.com/ekttwj8518']),
  (1, '코랄치과', '김주열 팀장님', '서울 강동구 성내동', '{}'),
  (1, '미소모아치과', '김주열 팀장님', '전북 전주시 완산구 서신동', ARRAY['https://blog.naver.com/usmisomore','https://blog.naver.com/w02aqvujp','https://blog.naver.com/qwglfo4481']),
  (1, '에버유의원', '김주열 팀장님', '서울 마포구 도화동', ARRAY['https://blog.naver.com/eah8fsd9f8']),
  (1, '청주새롬탑치과', '김주열 팀장님', '충북 청주시 흥덕구 복대동', ARRAY['https://blog.naver.com/qwrtuipp184','https://blog.naver.com/qwrtuipp169']),
  (1, '서울삼성치과', '김주열 팀장님', '서울 관악구 봉천동', ARRAY['https://blog.naver.com/pagfoco0q3q','https://blog.naver.com/i0v5id9o']),
  -- 1팀 김소영
  (1, '닥터신치과', '김소영 매니저님', '경기 성남시 중원구 상대원동', ARRAY['https://blog.naver.com/hkyrsp9710']),
  (1, '아산베스트치과', '김소영 매니저님', '충남 아산시 용화동', ARRAY['https://blog.naver.com/soiidinmfve75174','https://blog.naver.com/czzhuy6104']),
  (1, '검단일등치과', '김소영 매니저님', '인천 서구 불로동', ARRAY['https://blog.naver.com/geomdan1stdental','https://blog.naver.com/o48j69omlwlnj6']),
  (1, '코랄치과 (김소영)', '김소영 매니저님', '서울 강동구 성내동', ARRAY['https://blog.naver.com/timber12502','https://blog.naver.com/ffpvksk4i','https://blog.naver.com/ran2hoho']),
  -- 1팀 최휘원
  (1, '부천그랜드치과', '최휘원 매니저님', '경기 부천시 원미구 중동', ARRAY['https://blog.naver.com/dnautmqq']),
  -- 2팀 신미정
  (2, '유성온치과', '신미정 팀장님', '대전 유성구 봉명동', ARRAY['https://blog.naver.com/yuseong_on']),
  (2, 'A플란트치과', '신미정 팀장님', '서울 성동구 도선동', ARRAY['https://blog.naver.com/aplant2020']),
  (2, '다대치과', '신미정 팀장님', '부산 사하구 다대동', ARRAY['https://blog.naver.com/guntj185r3']),
  (2, '최창수치과', '신미정 팀장님', '부산 동구 초량동', ARRAY['https://blog.naver.com/basket1992']),
  -- 2팀 오진희
  (2, '에이스플란트치과', '오진희 매니저님', '서울 강남구 역삼동', ARRAY['https://blog.naver.com/stfoaiatovc57525']),
  (2, '신사이사랑치과', '오진희 매니저님', '서울 강남구 논현동', ARRAY['https://blog.naver.com/pauls2001n']),
  (2, '동그라미치과', '오진희 매니저님', '경기 고양시 덕양구 화정동', ARRAY['https://blog.naver.com/evacuate14570']),
  (2, '청담클린치과', '오진희 매니저님', '서울 강남구 삼성동', ARRAY['https://blog.naver.com/melovenus']),
  -- 3팀 김태광
  (3, '루원퍼스트치과', '김태광 팀장님', '인천 서구 가정동', ARRAY['https://blog.naver.com/hance1978']),
  (3, '연세조이플란트치과', '김태광 팀장님', '서울 강동구 성내동', ARRAY['https://blog.naver.com/ii24h0um']),
  (3, '전주예일치과', '김태광 팀장님', '전북 전주시 완산구 효자동2가', ARRAY['https://blog.naver.com/zmkz4oeq']),
  (3, '연세하늘치과', '김태광 팀장님', '서울 중구 충무로2가', ARRAY['https://blog.naver.com/skydentalgreen']),
  -- 3팀 이도화
  (3, '오늘안치과', '이도화 선임님', '경기 성남시 수정구 태평동', ARRAY['https://blog.naver.com/spssmaster77']),
  (3, '라이프치과', '이도화 선임님', '서울 강서구 화곡동', ARRAY['https://blog.naver.com/bgfsdvyhd']),
  (3, '미도치과', '이도화 선임님', '서울 강남구 대치동', ARRAY['https://blog.naver.com/m02jgiaz6']),
  (3, '더착한치과', '이도화 선임님', '부산 강서구 명지동', ARRAY['https://blog.naver.com/mg2032875']),
  (3, '이고운치과', '이도화 선임님', '경기 파주시 목동동', ARRAY['https://blog.naver.com/tdhhnx5899']),
  -- 3팀 최소현
  (3, '오늘안치과 (최소현)', '최소현 매니저님', '경기 성남시 수정구 태평동', ARRAY['https://blog.naver.com/clinical641']),
  (3, '연세하늘치과 (최소현)', '최소현 매니저님', '서울 중구 충무로2가', ARRAY['https://blog.naver.com/jkj9799']),
  (3, '바른플란트치과', '최소현 매니저님', '서울 중랑구 망우동', ARRAY['https://blog.naver.com/brplant','https://blog.naver.com/wwwlsl123']),
  -- 3팀 이지안
  (3, '논산중앙치과', '이지안 매니저님', '충남 논산시 반월동', ARRAY['https://blog.naver.com/cha1636ndsu'])
ON CONFLICT (name) DO UPDATE SET
  team_id = EXCLUDED.team_id,
  manager = EXCLUDED.manager,
  address = EXCLUDED.address,
  naver_blog_urls = EXCLUDED.naver_blog_urls,
  updated_at = now();
