-- Learning loop: formalise prompt_overrides as a versioned "skill" per surface, with an
-- explicit lifecycle instead of implicit newest-wins-only. `prompt_overrides` itself was
-- created ad hoc in the Supabase SQL editor (no migration on record) — this file is now the
-- source of truth for its shape, plus the new `status` column.
--
-- Statuses:
--   active     — eligible to be picked up as "the" override for its email_type (default)
--   superseded — automatically replaced when a newer synthesis lands for the same email_type
--   pinned     — manually locked in; auto-synthesis skips this email_type while pinned
--   deprecated — manually retired; drafting falls back to base instructions for this email_type
--
-- Run in the Supabase SQL editor (or via the project's migration runner).

create table if not exists prompt_overrides (
  id                 uuid        primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  email_type         text        not null,
  override_text      text        not null,
  source_eval_count  integer,
  synthesized_at     timestamptz
);

alter table prompt_overrides
  add column if not exists status text not null default 'active'
    check (status in ('active', 'superseded', 'pinned', 'deprecated'));

create index if not exists prompt_overrides_email_type_status_idx
  on prompt_overrides (email_type, status, synthesized_at desc);
