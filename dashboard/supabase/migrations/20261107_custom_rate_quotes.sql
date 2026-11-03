-- Custom-rate quotes (4 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- An insurer's per-head or per-S$1,000 rates for a large employee-benefits group, typed in by a
-- broker and totalled against the line's census (src/lib/gb/custom-quote.ts). Filed as a quote
-- with no dispatch, like the rate engine's, so it sits in the same comparison.
alter table placement_quotes drop constraint if exists placement_quotes_source_check;
alter table placement_quotes add constraint placement_quotes_source_check check (source in ('insurer', 'rate_table', 'custom_rates'));
notify pgrst, 'reload schema';
