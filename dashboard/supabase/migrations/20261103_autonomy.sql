-- Autonomy metric (3 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- outbound_origin  one row per outgoing email: where it came from (an agent's draft a person
--                  approved, an agent alone, or a person's own hand), how much of the draft was
--                  changed, and the work it represents. Computed once; the last 3 days recomputed daily.
-- ai_drafts.body_as_drafted  the draft as the agent first wrote it, kept by trigger on the first
--                  edit, so the edit share can be measured after the body is overwritten.

create table if not exists public.outbound_origin (
  message_id   uuid primary key references public.email_messages(id) on delete cascade,
  thread_id    uuid,
  company_id   uuid,
  sender       text not null,
  sent_at      timestamptz not null,
  origin       text not null check (origin in ('agent_approved', 'agent_auto', 'hand_written')),
  draft_id     uuid,
  edit_share   numeric(4,3),
  work_class   text not null,
  work_sub     text not null default '',
  tier         text not null check (tier in ('deterministic', 'approval', 'person', 'excluded')),
  side         text not null default 'none',
  words        int not null default 0,
  attachments  int not null default 0,
  effort       int not null default 0,
  side_channel boolean not null default false,
  computed_at  timestamptz not null default now()
);
create index if not exists outbound_origin_sent_idx on public.outbound_origin(sent_at desc);
create index if not exists outbound_origin_company_idx on public.outbound_origin(company_id);

alter table public.ai_drafts add column if not exists body_as_drafted text;

create or replace function public.ai_drafts_keep_first_body() returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body and old.body_as_drafted is null then new.body_as_drafted := old.body; end if;
  return new;
end $$;
drop trigger if exists ai_drafts_keep_first_body on public.ai_drafts;
create trigger ai_drafts_keep_first_body before update of body on public.ai_drafts
  for each row execute function public.ai_drafts_keep_first_body();

grant all on table public.outbound_origin to service_role;
notify pgrst, 'reload schema';
