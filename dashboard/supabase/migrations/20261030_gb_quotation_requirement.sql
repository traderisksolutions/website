-- Plan builder: what the broker asked for, kept on the quotation so it reopens as it was left.
-- { categories: [{ name, requirement, overrides }], employee_categories: { "<member index>": "<category>" },
--   budget: number | null, tier_b: boolean }
alter table gb_quotations add column if not exists requirement jsonb;
alter table gb_quotations add column if not exists updated_at timestamptz default now();
notify pgrst, 'reload schema';
