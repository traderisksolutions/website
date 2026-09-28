-- Endorsement debit notes are amendments to a master policy. Until now each one created its own
-- active policy row (e.g. "2026-A5768313-HFW-E001" beside "2026-A5768313-HFW", same term), so a
-- cover renewed twice on Calendar and Companies. This repoints those debit notes to the master
-- policy — same customer, same base number (endorsement suffix stripped), otherwise the one
-- master with the same term end and class — and removes the duplicate policy rows.
-- The app now does this at approval time (src/lib/debit-note-commit.ts), so this is a one-off.
-- Run in the Supabase SQL editor.

DO $$
DECLARE
  r      record;
  parent uuid;
  suffix text := '\s*[/\- ](E|END|ENDT|T)\s?[0-9]{1,5}(\s*,.*)?$';
  words  text := 'endorse|amendment|additional (employee|staff|member|life)';
BEGIN
  FOR r IN
    SELECT p.id, p.customer_id, p.policy_number, p.class_of_insurance, p.end_date
      FROM public.policies p
     WHERE p.policy_number ~* suffix
        OR coalesce(p.class_of_insurance, '') ~* words
        OR coalesce(p.description, '') ~* words
  LOOP
    SELECT q.id INTO parent
      FROM public.policies q
     WHERE q.customer_id = r.customer_id
       AND q.id <> r.id
       AND NOT (q.policy_number ~* suffix OR coalesce(q.class_of_insurance, '') ~* words OR coalesce(q.description, '') ~* words)
       AND (
             regexp_replace(r.policy_number, suffix, '', 'i') = q.policy_number
          OR (q.end_date = r.end_date
              AND lower(split_part(regexp_replace(coalesce(q.class_of_insurance, ''), words, '', 'gi'), ' ', 1))
                = lower(split_part(regexp_replace(coalesce(r.class_of_insurance, ''), words, '', 'gi'), ' ', 1)))
           )
     ORDER BY (regexp_replace(r.policy_number, suffix, '', 'i') = q.policy_number) DESC, q.created_at ASC
     LIMIT 1;

    IF parent IS NOT NULL THEN
      UPDATE public.debit_notes SET policy_id = parent, event_type = 'endorsement' WHERE policy_id = r.id;
      DELETE FROM public.policies WHERE id = r.id;
      RAISE NOTICE 'endorsement % folded into policy %', r.policy_number, parent;
    END IF;
    parent := NULL;
  END LOOP;
END $$;
