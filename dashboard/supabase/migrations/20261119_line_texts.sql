-- Lines library texts (19 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- One row per saved version of a line's text. Append-only: an edit or a restore adds a row; the
-- latest row per (line_key, part) is the current text. Until a line has a row, the text comes from
-- src/lib/placement/line-study.json.
--
-- line_key   car | ear | pel | ... (line-study.json `k`)
-- part       to_insurer | to_client | knowledge (text); client_data | insurer_asks (table rows as JSON)
-- body       the text as saved
-- edited_by  the signed-in person's email

create table if not exists public.placement_line_texts (
  id         uuid primary key default gen_random_uuid(),
  line_key   text not null,
  part       text not null check (part in ('to_insurer', 'to_client', 'knowledge', 'client_data', 'insurer_asks')),
  body       text not null,
  edited_by  text not null,
  created_at timestamptz not null default now()
);

create index if not exists placement_line_texts_key on public.placement_line_texts (line_key, part, created_at desc);

grant all on table public.placement_line_texts to service_role;

notify pgrst, 'reload schema';
