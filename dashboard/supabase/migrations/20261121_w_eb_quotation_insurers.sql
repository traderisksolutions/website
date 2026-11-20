-- Employment Benefits: each insurer on a kept quotation, tracked (21 Nov 2026, docs/eb-v2.md P5,
-- gaps G24 override and G26). Additive; safe to re-run. Apply with the runner on Jarod's go. Named to
-- sort after 20261121_v2_eb_schemes.sql.
--
-- One row per quotation per insurer: the route (Brochure price or Insurer to quote), a broker's
-- override with its reason, where the request stands (not asked, requested, chased, quoted,
-- declined, revised) with the date of each step, and a note. Written from the proposal page; no model.

create table if not exists public.eb_quotation_insurers (
  id               uuid primary key default gen_random_uuid(),
  quotation_id     uuid not null references public.eb_quotations(id) on delete cascade,
  insurer          text not null,
  route            text check (route in ('brochure', 'quote')),
  route_override   boolean not null default false,
  override_reason  text,
  status           text not null default 'not_asked' check (status in ('not_asked', 'requested', 'chased', 'quoted', 'declined', 'revised')),
  requested_at     timestamptz,
  chased_at        timestamptz,
  quoted_at        timestamptz,
  declined_at      timestamptz,
  revised_at       timestamptz,
  note             text,
  updated_by       text,
  updated_at       timestamptz not null default now(),
  unique (quotation_id, insurer)
);

create index if not exists eb_quotation_insurers_quotation_idx on public.eb_quotation_insurers (quotation_id);

grant all on table public.eb_quotation_insurers to service_role;
