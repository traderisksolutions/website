-- Insurer products (28 Oct 2026, phase 2 of the RFQ flow).
--   An insurer (a company of kind 'insurer') offers named products, each for one product line
--   ("MSIG · WICA Plus"), with what it will and will not take, and the people to ask for it.
--   The router suggests insurers only from here. Seeded from insurer_contacts: one product per
--   insurer per product line, named after the line, with the same people. Nothing is dropped;
--   insurer_contacts stays for the mail-filing agent until it moves over.
-- Apply after 20261028_placement_records.sql. Safe to re-run.

create table if not exists insurer_products (
  id                 uuid primary key default gen_random_uuid(),
  insurer_company_id uuid not null references companies(id) on delete cascade,
  product_line       text not null,               -- slug from src/lib/product-lines.ts
  name               text not null,               -- the insurer's own name for it: "WICA Plus"
  accepts            text[] not null default '{}', -- industries or risks it takes; empty = no stated limit
  declines           text[] not null default '{}', -- industries or risks it will not take
  min_premium        numeric,
  max_lives          int,
  notes              text,
  status             text not null default 'active' check (status in ('active','paused')),
  created_by         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists insurer_products_name_idx on insurer_products(insurer_company_id, product_line, lower(name));
create index if not exists insurer_products_line_idx on insurer_products(product_line) where status = 'active';

create table if not exists insurer_product_contacts (
  product_id  uuid not null references insurer_products(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  is_default  boolean not null default false,
  role_title  text,
  created_at  timestamptz not null default now(),
  primary key (product_id, contact_id)
);
create index if not exists insurer_product_contacts_contact_idx on insurer_product_contacts(contact_id);

-- Which product each request asked about, for the per-product record.
alter table placement_dispatches add column if not exists insurer_product_id uuid references insurer_products(id) on delete set null;
create index if not exists placement_dispatches_product_idx on placement_dispatches(insurer_product_id) where insurer_product_id is not null;

-- ── Seed from insurer_contacts ──────────────────────────────────────────────────────────────
-- Same normalisation as normInsurer() in src/lib/insurers.ts.
create or replace function pg_temp.norm_insurer(s text) returns text language sql immutable as $$
  select regexp_replace(
           regexp_replace(lower(coalesce(s, '')),
             '\m(insurance|assurance|singapore|pte|ltd|limited|company|co|general|group|the)\M', ' ', 'g'),
           '[^a-z0-9]+', '', 'g')
$$;

with labels(slug, label) as (values
    ('iar_fire', 'Industrial All Risk (IAR) & Fire'),
    ('business_interruption', 'Business Interruption (BI)'),
    ('construction_car', 'Contractors'' All Risks (CAR)'),
    ('machinery_breakdown', 'Machinery Breakdown'),
    ('electronic_equipment', 'Electronic Equipment Insurance'),
    ('commercial_vehicle', 'Commercial Vehicle Insurance'),
    ('marine_cargo', 'Marine Cargo'),
    ('stock_throughput', 'Stock Throughput'),
    ('inland_transit', 'Inland Transit'),
    ('trade_credit', 'Trade Credit'),
    ('surety_bonds', 'Surety Bonds'),
    ('general_liability', 'General Comprehensive Liability'),
    ('professional_indemnity', 'Professional Indemnity (PI)'),
    ('do', 'Directors & Officers (D&O)'),
    ('imi', 'Investment Management Insurance (IMI)'),
    ('environmental_liability', 'Environmental Liability'),
    ('medical_malpractice', 'Medical Malpractice Insurance'),
    ('cyber', 'Cyber Insurance'),
    ('wica', 'Work Injury Compensation (WICA)'),
    ('foreign_worker_medical', 'Foreign Worker Medical Insurance'),
    ('foreign_worker_bond', 'Foreign Worker Bond Insurance'),
    ('group_health', 'Group Health Insurance'),
    ('group_travel', 'Group Business Travel'),
    ('employee_benefits', 'Employee Benefits Insurance'),
    ('keyman', 'Keyman Insurance')
),
src as (
  select ic.product_line, ic.contact_id, ic.role_title,
         (select c.id from companies c
           where c.kind = 'insurer' and pg_temp.norm_insurer(c.company_name) = pg_temp.norm_insurer(i.name)
           order by c.created_at limit 1) as insurer_company_id
    from insurer_contacts ic
    join insurers i on i.id = ic.insurer_id
   where ic.contact_id is not null
),
made as (
  insert into insurer_products (insurer_company_id, product_line, name, created_by)
  select distinct s.insurer_company_id, s.product_line, coalesce(l.label, initcap(replace(s.product_line, '_', ' '))), 'seed'
    from src s left join labels l on l.slug = s.product_line
   where s.insurer_company_id is not null
  on conflict do nothing
  returning id
)
select count(*) as products_seeded from made;

insert into insurer_product_contacts (product_id, contact_id, role_title)
select p.id, s.contact_id, s.role_title
  from (
    select ic.product_line, ic.contact_id, ic.role_title,
           (select c.id from companies c
             where c.kind = 'insurer' and pg_temp.norm_insurer(c.company_name) = pg_temp.norm_insurer(i.name)
             order by c.created_at limit 1) as insurer_company_id
      from insurer_contacts ic join insurers i on i.id = ic.insurer_id
     where ic.contact_id is not null
  ) s
  join insurer_products p on p.insurer_company_id = s.insurer_company_id and p.product_line = s.product_line and p.created_by = 'seed'
on conflict do nothing;

-- One default person per product: the first added.
update insurer_product_contacts ipc set is_default = true
 where not exists (select 1 from insurer_product_contacts d where d.product_id = ipc.product_id and d.is_default)
   and ipc.contact_id = (select x.contact_id from insurer_product_contacts x where x.product_id = ipc.product_id order by x.created_at, x.contact_id limit 1);

-- Anything the seed could not place is worth seeing.
select 'insurer contacts with no insurer company' as check, count(*)
  from insurer_contacts ic join insurers i on i.id = ic.insurer_id
 where not exists (select 1 from companies c where c.kind = 'insurer' and pg_temp.norm_insurer(c.company_name) = pg_temp.norm_insurer(i.name));

grant select, insert, update, delete on insurer_products, insurer_product_contacts to service_role;
revoke all on insurer_products, insurer_product_contacts from anon;
notify pgrst, 'reload schema';
