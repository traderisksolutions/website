-- Quote capture (3 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- Insurers' quotations, indications and bind confirmations read from mail that was never sent
-- through the placement module (192 of them were relayed by hand in the last 4 months). Such a
-- quote has no placement, line, round or dispatch, so those columns become nullable; the row
-- carries the client, the insurer and the product line directly, plus where it was read from.

alter table placement_quotes alter column placement_id drop not null;
alter table placement_quotes alter column line_id     drop not null;
alter table placement_quotes alter column round_id    drop not null;
alter table placement_quotes alter column dispatch_id drop not null;

alter table placement_quotes add column if not exists company_id         uuid references companies(id) on delete set null;
alter table placement_quotes add column if not exists insurer_company_id uuid references companies(id) on delete set null;
alter table placement_quotes add column if not exists product_line       text;
alter table placement_quotes add column if not exists kind               text;
alter table placement_quotes add column if not exists policy_number      text;
alter table placement_quotes add column if not exists gst_text           text;
alter table placement_quotes add column if not exists gst_amount         numeric;
alter table placement_quotes add column if not exists period_text        text;
alter table placement_quotes add column if not exists period_from        date;
alter table placement_quotes add column if not exists period_to          date;
alter table placement_quotes add column if not exists limits             jsonb not null default '{}'::jsonb;
alter table placement_quotes add column if not exists conditions         text;
alter table placement_quotes add column if not exists source_document_id uuid;   -- email_attachments.id the figures were read from
alter table placement_quotes add column if not exists confidence         text;
alter table placement_quotes add column if not exists read_by            text;   -- 'patterns' | 'model' | 'staff'
alter table placement_quotes drop constraint if exists placement_quotes_kind_check;
alter table placement_quotes add constraint placement_quotes_kind_check check (kind is null or kind in ('quotation', 'indication', 'bind_confirmation', 'renewal_terms'));
alter table placement_quotes drop constraint if exists placement_quotes_confidence_check;
alter table placement_quotes add constraint placement_quotes_confidence_check check (confidence is null or confidence in ('high', 'medium', 'low'));

-- One captured quote per source message or document, insurer and product line. Dispatch-matched
-- quotes (the placement module's own) and rate-engine quotes are outside this key.
create unique index if not exists placement_quotes_capture_key
  on placement_quotes (coalesce(source_document_id, source_message_id), insurer_name, coalesce(product_line, ''), coalesce(tier_label, ''))
  where dispatch_id is null and source_message_id is not null;
create index if not exists placement_quotes_company_idx on placement_quotes(company_id, created_at desc) where company_id is not null;
create index if not exists placement_quotes_insurer_company_idx on placement_quotes(insurer_company_id) where insurer_company_id is not null;

notify pgrst, 'reload schema';
