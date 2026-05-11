# `_ops/` — Operator scripts (read-only diagnostics)

## `check_admin_password_guc.sql`

Run **once in each Supabase project** (winaid-internal-seoul AND winaid-public-seoul) via Dashboard → SQL Editor.

Read-only. Returns 1 row per DB.

Reply with both rows back. If `guc_status` shows `❌ UNSET` for either DB, **do not apply S1 hardening yet** — set `app.admin_password` GUC first (see Phase B plan §B.4).
