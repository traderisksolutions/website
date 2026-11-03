-- Held movements (4 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- 'pending': a movement reported ahead ("heads up, we are hiring ABC") or without a date. Nothing
-- goes to the insurer and the member list is untouched until the client confirms it with a date
-- (src/lib/admin/b/endorsements/date-gate.ts).
alter table public.policy_movements drop constraint if exists policy_movements_status_check;
alter table public.policy_movements add constraint policy_movements_status_check check (status in ('pending', 'reported', 'sent', 'noted', 'billed', 'settled', 'cancelled'));
