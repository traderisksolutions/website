-- Autonomy ladder (5 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- autonomy_ladder  one row per draft class: how many approvals went out unedited, and whether the
--                  class is manual, a candidate (20 unedited), auto (a person switched it on), or
--                  paused. A class never switches itself on.
-- ai_drafts.sent_by_agent  true when the auto-send job sent it; the autonomy metric counts these
--                  as agent_auto.
create table if not exists public.autonomy_ladder (
  draft_class        text primary key,
  rung               int not null default 99,          -- order of graduation: ack first
  status             text not null default 'manual' check (status in ('manual', 'candidate', 'auto', 'paused')),
  approvals_unedited int not null default 0,
  approvals_total    int not null default 0,
  min_unedited       int not null default 20,
  last_graduated_at  timestamptz,
  paused_by          text,
  paused_reason      text,
  changed_by         text,
  updated_at         timestamptz not null default now()
);
insert into public.autonomy_ladder (draft_class, rung) values
  ('ack', 1), ('status', 2), ('request', 3), ('forward', 4), ('relay', 5), ('answer', 6)
on conflict (draft_class) do nothing;

alter table public.ai_drafts add column if not exists sent_by_agent boolean not null default false;
create index if not exists ai_drafts_auto_sent_idx on public.ai_drafts(sent_at desc) where sent_by_agent;

grant all on table public.autonomy_ladder to service_role;
notify pgrst, 'reload schema';
