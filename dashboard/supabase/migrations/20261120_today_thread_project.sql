-- Today projects (20 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Additive; safe to re-run.
--
-- A client on Today can hold several projects (a showflat, the main office). Each thread on a
-- person's list may sit under one project of its client; a thread with no project sits under the
-- client directly. The code reads these columns when they exist and works without them until then.
--
-- project       the project's name, as the person typed it; null = under the client
-- project_note  a short description of the project, shown beside its name

alter table public.today_threads add column if not exists project      text;
alter table public.today_threads add column if not exists project_note text;

notify pgrst, 'reload schema';
