-- Client structure (31 Oct 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- One email domain can carry several legal entities (checsg.com.sg is both China Harbour
-- Engineering Company Ltd Singapore Branch and China Harbour (Singapore) Engineering Company
-- Pte. Ltd.), and one policy can insure a whole group ("NEO GROUP LTD AND ITS SUBSIDIARIES").
-- The domain names the group; the entity comes from the signature, the schedule or the policy.
--
--   companies.parent_id   the group: a subsidiary, branch or sister points at its parent
--   companies.uen         the ACRA number, the one identifier that never changes spelling
--   company_contacts      who handles what: a parent's HR manager can handle every subsidiary
--   policy_insureds       every entity a policy covers, beside the policyholder in policies.company_id
--   record_merges         every merge, with what moved, so it can be read back and undone
--   merge_records()       moves every reference in one transaction, found from the live schema

-- ── group structure ─────────────────────────────────────────────────────────────────────────
alter table public.companies add column if not exists parent_id uuid references public.companies(id) on delete set null;
alter table public.companies add column if not exists relation  text;
alter table public.companies add column if not exists uen       text;
alter table public.companies drop constraint if exists companies_relation_check;
alter table public.companies add constraint companies_relation_check
  check (relation is null or relation in ('subsidiary', 'branch', 'sister', 'franchise', 'division'));
alter table public.companies drop constraint if exists companies_parent_not_self;
alter table public.companies add constraint companies_parent_not_self check (parent_id is null or parent_id <> id);
create index if not exists companies_parent_idx on public.companies(parent_id) where parent_id is not null;
create unique index if not exists companies_uen_key on public.companies(upper(uen)) where uen is not null;

-- ── who handles what ────────────────────────────────────────────────────────────────────────
-- contacts.company_id stays the employer. A row here says the contact acts for this company,
-- for these lines (product-line slugs, or 'claims', 'accounts', 'all').
alter table public.company_contacts add column if not exists scope      text[] not null default '{}';
alter table public.company_contacts add column if not exists status     text   not null default 'active';
alter table public.company_contacts add column if not exists source     text   not null default 'manual';
alter table public.company_contacts add column if not exists evidence   text;
alter table public.company_contacts add column if not exists updated_at timestamptz not null default now();
alter table public.company_contacts drop constraint if exists company_contacts_status_check;
alter table public.company_contacts add constraint company_contacts_status_check check (status in ('active', 'left'));
delete from public.company_contacts a using public.company_contacts b
 where a.company_id = b.company_id and a.contact_id = b.contact_id and a.ctid > b.ctid;
create unique index if not exists company_contacts_pair_key on public.company_contacts(company_id, contact_id);

-- ── insured entities ────────────────────────────────────────────────────────────────────────
create table if not exists public.policy_insureds (
  policy_id  uuid not null references public.policies(id)  on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role       text not null default 'named_insured' check (role in ('policyholder', 'named_insured', 'additional_insured')),
  source     text not null default 'manual',
  evidence   text,
  created_at timestamptz not null default now(),
  primary key (policy_id, company_id)
);
create index if not exists policy_insureds_company_idx on public.policy_insureds(company_id);
alter table public.policy_insureds enable row level security;
drop policy if exists staff_policy_insureds on public.policy_insureds;
create policy staff_policy_insureds on public.policy_insureds using (auth.role() = 'authenticated');
grant all on table public.policy_insureds to authenticated, service_role;

-- ── merges ──────────────────────────────────────────────────────────────────────────────────
create table if not exists public.record_merges (
  id         uuid primary key default gen_random_uuid(),
  table_name text not null,
  keep_id    uuid not null,
  drop_id    uuid not null,
  drop_row   jsonb not null,
  moved      jsonb not null default '{}'::jsonb,   -- "table.column" → rows repointed
  removed    jsonb not null default '[]'::jsonb,   -- rows deleted because the survivor already had them
  merged_by  text,
  reason     text,
  merged_at  timestamptz not null default now()
);
alter table public.record_merges enable row level security;
drop policy if exists staff_record_merges on public.record_merges;
create policy staff_record_merges on public.record_merges using (auth.role() = 'authenticated');
grant all on table public.record_merges to authenticated, service_role;

-- Every uuid column that points at p_table: real foreign keys, plus columns named in p_cols that
-- predate their foreign key (debit_notes.company_id, company_chunks.company_id …).
create or replace function public.merge_reference_columns(p_table regclass, p_cols text[])
returns table (tbl text, col text) language sql stable as $$
  select distinct c.conrelid::regclass::text, a.attname::text
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.contype = 'f' and c.confrelid = p_table
  union
  select distinct format('%I.%I', k.table_schema, k.table_name)::regclass::text, k.column_name::text
    from information_schema.columns k
    join information_schema.tables t on t.table_schema = k.table_schema and t.table_name = k.table_name and t.table_type = 'BASE TABLE'
   where k.table_schema = 'public' and k.data_type = 'uuid' and k.column_name = any (p_cols)
     and k.table_name <> 'record_merges'
$$;

-- Fold p_drop into p_keep. Each referencing row is repointed; a row the survivor already has
-- (a unique key would be broken) is removed and kept in record_merges.removed. Raises, and so
-- rolls everything back, if any reference to p_drop is left before the delete.
create or replace function public.merge_records(p_table regclass, p_keep uuid, p_drop uuid, p_actor text, p_reason text, p_cols text[] default '{}', p_snapshot jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; x record; v_row jsonb; v_moved jsonb := '{}'::jsonb; v_removed jsonb := '[]'::jsonb; n int; left_over int;
begin
  if p_keep = p_drop then raise exception 'A record cannot be merged into itself'; end if;
  execute format('select to_jsonb(t) from %s t where id = $1 for update', p_table) into v_row using p_drop;
  if v_row is null then raise exception 'Record % not found in %', p_drop, p_table; end if;
  execute format('select 1 from %s where id = $1', p_table) into n using p_keep;
  if n is null then raise exception 'Survivor % not found in %', p_keep, p_table; end if;

  for r in select * from public.merge_reference_columns(p_table, p_cols) loop
    n := 0;
    for x in execute format('select ctid as c from %s where %I = $1', r.tbl, r.col) using p_drop loop
      begin
        execute format('update %s set %I = $1 where ctid = $2', r.tbl, r.col) using p_keep, x.c;
        n := n + 1;
      exception when unique_violation then
        execute format('delete from %s t where ctid = $1 returning to_jsonb(t)', r.tbl) into v_row using x.c;
        v_removed := v_removed || jsonb_build_object('table', r.tbl, 'row', v_row);
      end;
    end loop;
    if n > 0 then v_moved := v_moved || jsonb_build_object(r.tbl || '.' || r.col, n); end if;
  end loop;

  for r in select * from public.merge_reference_columns(p_table, p_cols) loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into left_over using p_drop;
    if left_over > 0 then raise exception '% rows in %.% still point at %', left_over, r.tbl, r.col, p_drop; end if;
  end loop;

  execute format('select to_jsonb(t) from %s t where id = $1', p_table) into v_row using p_drop;
  v_row := coalesce(p_snapshot, v_row);
  insert into public.record_merges (table_name, keep_id, drop_id, drop_row, moved, removed, merged_by, reason)
  values (p_table::text, p_keep, p_drop, v_row, v_moved, v_removed, p_actor, p_reason);
  execute format('delete from %s where id = $1', p_table) using p_drop;
  return jsonb_build_object('moved', v_moved, 'removed', jsonb_array_length(v_removed));
end $$;

-- Companies: also keep the duplicate's domains, owners and notes on the survivor.
create or replace function public.merge_companies(p_keep uuid, p_drop uuid, p_actor text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k public.companies; d public.companies; res jsonb;
begin
  select * into k from public.companies where id = p_keep for update;
  select * into d from public.companies where id = p_drop for update;
  if k.id is null or d.id is null then raise exception 'Company not found'; end if;
  -- The duplicate's uen moves to the survivor: clear it first so the unique index holds. d keeps
  -- the original row for the record_merges snapshot.
  update public.companies set uen = null where id = p_drop;
  update public.companies set
    domains      = (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(k.domains, '{}') || coalesce(d.domains, '{}')) x where x is not null and x <> ''),
    owner_emails = (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(k.owner_emails, '{}') || coalesce(d.owner_emails, '{}')) x where x is not null and x <> ''),
    domain       = coalesce(k.domain, d.domain),
    uen          = coalesce(k.uen, d.uen),
    parent_id    = case when coalesce(k.parent_id, d.parent_id) in (p_keep, p_drop) then null else coalesce(k.parent_id, d.parent_id) end,
    relation     = coalesce(k.relation, d.relation),
    notes        = nullif(concat_ws(E'\n', k.notes, case when d.notes is not null and d.notes <> coalesce(k.notes, '') then d.notes end), ''),
    updated_at   = now()
  where id = p_keep;
  res := public.merge_records('public.companies', p_keep, p_drop, p_actor, p_reason,
    array['company_id', 'client_company_id', 'insurer_company_id', 'suggested_company_id', 'chosen_insurer_company_id'], to_jsonb(d));
  return res;
end $$;

-- Contacts: same mailbox recorded twice (letter case, a pasted "<mailto:" tail).
create or replace function public.merge_contacts(p_keep uuid, p_drop uuid, p_actor text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.contacts k set
    first_name = coalesce(k.first_name, d.first_name), last_name = coalesce(k.last_name, d.last_name),
    title = coalesce(k.title, d.title), phone = coalesce(k.phone, d.phone),
    company_id = coalesce(k.company_id, d.company_id), updated_at = now()
  from public.contacts d where k.id = p_keep and d.id = p_drop;
  return public.merge_records('public.contacts', p_keep, p_drop, p_actor, p_reason, array['contact_id']);
end $$;

-- Functions are executable by PUBLIC by default, and these run as their owner. Only the
-- service role may call them; the dashboard does, server-side.
revoke execute on function public.merge_reference_columns(regclass, text[]) from public, anon, authenticated;
revoke execute on function public.merge_records(regclass, uuid, uuid, text, text, text[], jsonb) from public, anon, authenticated;
revoke execute on function public.merge_companies(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.merge_contacts(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.merge_reference_columns(regclass, text[]) to service_role;
grant execute on function public.merge_records(regclass, uuid, uuid, text, text, text[], jsonb) to service_role;
grant execute on function public.merge_companies(uuid, uuid, text, text) to service_role;
grant execute on function public.merge_contacts(uuid, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
