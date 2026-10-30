-- Construction and property quotes come as a rate on a base, often as a share of a panel.
-- rate_pct: % as written (0.0575 = 0.0575%); rate_base_amount: the sum insured or wages it applies to;
-- rate_check: 'ok' | 'mismatch' when rate × base is compared with the premium; null when not checkable.
alter table placement_quotes add column if not exists rate_text        text;
alter table placement_quotes add column if not exists rate_pct         numeric;
alter table placement_quotes add column if not exists rate_base_amount numeric;
alter table placement_quotes add column if not exists rate_check       text check (rate_check in ('ok', 'mismatch'));
alter table placement_quotes add column if not exists share_pct        numeric;   -- capacity, % of 100%
alter table placement_quotes add column if not exists role             text check (role in ('lead', 'follow'));
alter table placement_quotes add column if not exists brokerage_pct    numeric;
notify pgrst, 'reload schema';
