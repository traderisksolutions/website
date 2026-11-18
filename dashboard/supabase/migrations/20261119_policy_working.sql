-- Policies being worked on (19 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- A placement line is one policy TRS is working on. These columns hold what a person sets when the
-- policy is added from an email thread, and the two stages shown on Policies and the Policy page.
--
-- request_type      renewal | new | endorsement | claim
-- client_stage      data_requested | data_received | quote_sent | client_decided | signed_paid;
--                   null = worked out from the log
-- insurer_stage     not_asked | asked | quotes_in | placed | policy_issued; null = worked out from the replies
-- existing          the client holds this policy today
-- renewal_date      when the current policy ends
-- previous_premium  what the client paid last time, S$

alter table public.placement_lines
  add column if not exists request_type     text,
  add column if not exists client_stage     text,
  add column if not exists insurer_stage    text,
  add column if not exists existing         boolean,
  add column if not exists renewal_date     date,
  add column if not exists previous_premium numeric;

grant all on table public.placement_lines to service_role;

notify pgrst, 'reload schema';
