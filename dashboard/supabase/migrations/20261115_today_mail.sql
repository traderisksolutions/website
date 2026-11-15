-- Today › Mail in one read (15 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
--
-- today_mail   the threads a person may see, with label, client and open case: the count per relevance
--              under the label filter, and the newest p_limit rows of the chosen view. One read in place
--              of every thread, every alias and a mailbox check per hundred threads.
--
-- Two rules are written here and in code. scripts/dogfood-case-sources.mts compares the two answers
-- for every viewer, so a change to one without the other fails there.
--   who may see a thread     src/lib/mail/visibility.ts (canSeeThread) and visibility-server.ts
--   where a thread sits      src/lib/cases/relevance.ts (relevanceOf)
-- A thread with no stored label counts as Other here; the rule labels every thread at ingest.

create or replace function public.today_mail(p_viewer text, p_today date, p_relevance text default 'all', p_label text default 'all', p_limit int default 200)
returns jsonb
language sql stable as $$
  with held as (
    -- Threads read from a recorded mailbox, and whether operations@ or the viewer holds a copy.
    select a.thread_id, coalesce(bool_or(lower(a.mailbox) in ('operations@trade-risksol.com', lower(p_viewer))), false) as mine
    from public.email_thread_aliases a
    group by a.thread_id
  ),
  seen as (
    select t.id, t.subject, t.display_subject, t.company_id, t.last_message_at, t.label, t.label_by, t.label_basis, t.label_at,
           w.id as case_id, w.title as case_title
    from public.email_threads t
    left join held h on h.thread_id = t.id
    left join public.work_item_threads wt on wt.thread_id = t.id
    left join public.work_items w on w.id = wt.work_item_id and w.closed_at is null
    where t.deleted_at is null
      and (p_viewer is null or lower(p_viewer) = 'operations@trade-risksol.com' or h.thread_id is null or h.mine
        -- operations@ or the viewer was on the email: a participant, or the sender of a message.
        or exists (select 1 from public.email_participants p where p.thread_id = t.id and p.email in ('operations@trade-risksol.com', p_viewer))
        or exists (select 1 from public.email_messages m where m.thread_id = t.id and m.deleted_at is null
                   and (m.from_address ilike '%operations@trade-risksol.com%' or m.from_address ilike '%' || p_viewer || '%')))
  ),
  placed as (
    select s.*, coalesce(s.label, 'other') as shown_label,
           case when s.label in ('member_movement', 'endorsement') then 'member_movements'
                when s.last_message_at is null or p_today - s.last_message_at::date > 90 then 'back_burner'
                when s.case_id is not null then 'active'
                else 'back_burner' end as relevance
    from seen s
  ),
  of_label as (select * from placed where p_label = 'all' or shown_label = p_label),
  shown as (select * from of_label where p_relevance = 'all' or relevance = p_relevance),
  page as (
    select s.id, s.subject, s.display_subject, s.last_message_at, s.company_id, c.company_name, s.label, s.label_by, s.label_basis, s.label_at,
           s.relevance, s.case_id, s.case_title
    from shown s
    left join public.companies c on c.id = s.company_id
    order by s.last_message_at desc nulls last, s.id
    limit greatest(p_limit, 1)
  )
  select jsonb_build_object(
    'counts', (select jsonb_build_object(
      'all', count(*),
      'active', count(*) filter (where relevance = 'active'),
      'back_burner', count(*) filter (where relevance = 'back_burner'),
      'member_movements', count(*) filter (where relevance = 'member_movements')) from of_label),
    'total', (select count(*) from shown),
    'threads', coalesce((select jsonb_agg(to_jsonb(p) order by p.last_message_at desc nulls last, p.id) from page p), '[]'::jsonb))
$$;

revoke all on function public.today_mail(text, date, text, text, int) from public;
grant execute on function public.today_mail(text, date, text, text, int) to service_role;
notify pgrst, 'reload schema';
