-- Insurers live in Companies. This retires the separate `insurers` table as a source of keys.
--
-- NOT YET APPLIED. Written 2 Oct 2026; DDL was blocked that day on a gcloud re-login. Until it
-- runs, src/lib/insurers.ts keeps `insurers` as a hidden key table derived from Companies, which
-- is correct but indirect. Apply with ~/trs-dn-migration/apply-sql.sh.
--
-- What it does, all additive until the last step:
--   1. Give `insurers` an exact company link, filled by the same name matching the app uses.
--   2. Add company_id beside every insurer_id that holds a foreign key to `insurers`, and fill it.
--   3. Nothing is dropped. insurer_id and the `insurers` table stay until every reader has moved
--      to company_id; the mail-filing agent still reads insurer_contacts → insurers.

begin;

-- Same normalisation as normInsurer() in src/lib/insurers.ts.
create or replace function pg_temp.norm_insurer(s text) returns text language sql immutable as $$
  select regexp_replace(
           regexp_replace(lower(coalesce(s, '')),
             '\m(insurance|assurance|singapore|pte|ltd|limited|company|co|general|group|the)\M', ' ', 'g'),
           '[^a-z0-9]+', '', 'g')
$$;

alter table public.insurers add column if not exists company_id uuid references public.companies(id);
update public.insurers i
   set company_id = c.id
  from public.companies c
 where c.kind = 'insurer'
   and i.company_id is null
   and pg_temp.norm_insurer(c.company_name) = pg_temp.norm_insurer(i.name);

alter table public.gb_rate_tables       add column if not exists company_id uuid references public.companies(id);
alter table public.pm_calculators       add column if not exists company_id uuid references public.companies(id);
alter table public.pm_taxonomy_synonyms add column if not exists company_id uuid references public.companies(id);
alter table public.insurer_contacts     add column if not exists company_id uuid references public.companies(id);

update public.gb_rate_tables       t set company_id = i.company_id from public.insurers i where t.insurer_id = i.id and t.company_id is null;
update public.pm_calculators       t set company_id = i.company_id from public.insurers i where t.insurer_id = i.id and t.company_id is null;
update public.pm_taxonomy_synonyms t set company_id = i.company_id from public.insurers i where t.insurer_id = i.id and t.company_id is null;
update public.insurer_contacts     t set company_id = i.company_id from public.insurers i where t.insurer_id = i.id and t.company_id is null;

-- Anything left unlinked is worth seeing before the old keys are ever dropped.
select 'insurers without a company' as check, count(*) from public.insurers where company_id is null
union all select 'rate tables without a company', count(*) from public.gb_rate_tables where insurer_id is not null and company_id is null
union all select 'insurer contacts without a company', count(*) from public.insurer_contacts where company_id is null;

notify pgrst, 'reload schema';
commit;
