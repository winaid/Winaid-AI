-- AEO/GEO 진단 페이지 리드 폼 (2-2)
-- POST /api/diagnostic/leads ← public-app 게스트/회원 (anon INSERT)
-- GET /api/internal/admin/leads ← next-app admin proxy (service_role only)
-- PATCH /api/internal/admin/leads/:id ← next-app admin proxy (service_role only)
--
-- Idempotent. 여러 번 적용해도 안전.

CREATE TABLE IF NOT EXISTS public.diagnostic_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_name text NOT NULL CHECK (length(hospital_name) BETWEEN 1 AND 200),
  contact_name  text NOT NULL CHECK (length(contact_name)  BETWEEN 1 AND 100),
  phone         text NOT NULL CHECK (length(phone) BETWEEN 9 AND 20),
  message       text          CHECK (message IS NULL OR length(message) <= 2000),
  diagnostic_url   text,
  diagnostic_score int  CHECK (diagnostic_score IS NULL OR diagnostic_score BETWEEN 0 AND 100),
  diagnostic_token text,
  source        text NOT NULL CHECK (source IN ('lock-actionplan','lock-snippets','bottom-cta')),
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
  ip            text,
  user_agent    text,
  user_id       uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_leads_created_at
  ON public.diagnostic_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_leads_status
  ON public.diagnostic_leads (status);

CREATE OR REPLACE FUNCTION public.diagnostic_leads_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_diagnostic_leads_updated_at ON public.diagnostic_leads;
CREATE TRIGGER trg_diagnostic_leads_updated_at
  BEFORE UPDATE ON public.diagnostic_leads
  FOR EACH ROW EXECUTE FUNCTION public.diagnostic_leads_set_updated_at();

ALTER TABLE public.diagnostic_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS diagnostic_leads_anon_insert ON public.diagnostic_leads;
CREATE POLICY diagnostic_leads_anon_insert ON public.diagnostic_leads
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- SELECT/UPDATE는 service_role 만 (PostgREST 는 RLS 통해 자동 가드).
-- 직접 SQL Editor 접근은 superuser 라 RLS 무시.
