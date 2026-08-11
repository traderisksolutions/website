-- Pricing Matrix — per-company employee "Classification" tiers (Director / Manager / Employee,
-- etc.), replacing the global app_settings['pm_employee_categories'] free-text list.
--
-- Tiers now persist against the CRM's existing `companies` table (already used by leads/customers/
-- debit-notes — see src/components/company-contact-picker/CompanyContactPicker.tsx and
-- /api/companies) instead of a new client entity, so a renewal quote for the same company reuses
-- last year's custom tiers automatically.
--
-- This is purely additive: CensusMember.employee_category / pm_quotations.category_overrides
-- (20260811_pm_category_overrides.sql) are UNCHANGED — they already key by whatever string sits
-- in employee_category; classification tiers are just that field's vocabulary, now formalized and
-- persisted per company instead of typed ad hoc per quote. A quote never linked to a company (or a
-- company with no tiers yet) falls back to the app_settings['pm_classification_tiers_default'] list
-- at read time — no migration needed for that fallback.
--
-- Run in the Supabase SQL editor (after 20260813_pm_computation_rules.sql).

create table if not exists pm_classification_tiers (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  name         text not null,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (company_id, name)
);
create index if not exists pm_classification_tiers_company_idx on pm_classification_tiers (company_id, sort_order);

drop trigger if exists pm_classification_tiers_touch on pm_classification_tiers;
create trigger pm_classification_tiers_touch before update on pm_classification_tiers
  for each row execute function pm_touch_updated_at();

-- Nullable: a quote's company may not exist in the CRM yet (or the quote predates this feature).
-- company_name (existing free text) stays as the denormalized display fallback either way.
alter table pm_quotations add column if not exists company_id uuid references companies(id) on delete set null;
