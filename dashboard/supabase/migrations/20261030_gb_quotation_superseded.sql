-- A later request for the same company supersedes an earlier draft instead of sitting beside it.
-- Superseded rows are kept (nothing deleted) and hidden from the Quotes list.
alter table gb_quotations add column if not exists superseded_by uuid references gb_quotations(id) on delete set null;
create index if not exists gb_quotations_superseded_idx on gb_quotations (superseded_by);
notify pgrst, 'reload schema';
