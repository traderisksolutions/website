-- Filing (21 Nov 2026, docs/filing.md). Additive; safe to re-run. Apply with the runner
-- (npm run db:migrate -- --apply) on Jarod's go. Named to sort after 20261121_schema_migrations.sql.
--
-- policy_documents is the one record per file. A person's File button (and later the filing agent)
-- writes the line and plan year the Drive folders name, and who filed it:
--
--   line_code  the policy's line from the fixed list (policy_lines), null when it waits in To sort
--   plan_year  '2027–28', the policy's start year
--   filed_by   the person who pressed File; null when filed by rule
--   filed_at   when the document reached its folder
--
-- Retrieval in one query each: every renewal notice for QBE in 2027–28, all claims for one group,
-- every census for Employment Benefits this plan year.

alter table public.policy_documents add column if not exists line_code text references public.policy_lines(code);
alter table public.policy_documents add column if not exists plan_year text;
alter table public.policy_documents add column if not exists filed_by text;
alter table public.policy_documents add column if not exists filed_at timestamptz;

create index if not exists policy_documents_line_year_idx on public.policy_documents (line_code, plan_year) where status = 'filed';
create index if not exists policy_documents_filed_by_idx on public.policy_documents (filed_by) where filed_by is not null;
