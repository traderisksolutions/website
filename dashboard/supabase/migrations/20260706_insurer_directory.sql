-- Insurer Directory — Phase A of the RFQ engagement agent.
-- Stores insurance partners and their per-product-line point-of-contact.
-- Editable only via the trs-dashboard Settings page (/api/settings/insurers).
-- Run this in the Supabase SQL editor.

-- ── 1. Insurers (partners) ────────────────────────────────────────────────────

create table if not exists insurers (
  id         uuid default gen_random_uuid() primary key,
  name       text not null unique,
  status     text not null default 'active',   -- active | inactive
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── 2. Per-product-line contacts ──────────────────────────────────────────────
-- One row per (insurer × product line × email). e.g. AIA has a Construction row
-- and a Commercial Property row, each with its own point person.

create table if not exists insurer_contacts (
  id            uuid default gen_random_uuid() primary key,
  insurer_id    uuid not null references insurers(id) on delete cascade,
  product_line  text not null,                 -- slug from src/lib/product-lines.ts
  contact_name  text,
  contact_email text not null,
  notes         text,
  updated_by    uuid,                          -- auth.users id of last editor
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (insurer_id, product_line, contact_email)
);

create index if not exists insurer_contacts_insurer_id_idx   on insurer_contacts(insurer_id);
create index if not exists insurer_contacts_product_line_idx on insurer_contacts(product_line);
