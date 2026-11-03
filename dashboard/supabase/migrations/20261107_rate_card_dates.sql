-- Rate card versions by date (4 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- A package card applies from effective_date for new business and from renewal_effective_date
-- for renewals, when the insurer gives a later date for them. The engine prices each quote on the
-- card in force on its effective date (src/lib/gb/table-version.ts).
alter table public.gb_rate_tables add column if not exists renewal_effective_date date;
