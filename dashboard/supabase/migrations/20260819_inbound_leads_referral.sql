-- Sales Loop v2, Phase 4 (F1) — give referrals a real lead record.
--
-- inbound_leads.source's CHECK constraint (per full_schema.sql's dump) only lists
-- manual/website_form/whatsapp_click/email. The live public site's claims form
-- (trs-website/claims.html) already sends 'claims_form' — not in that list, so the dump is
-- either stale (the live constraint was already widened by hand, matching this project's own
-- documented precedent of full_schema.sql drifting from the hosted schema) or claims-form
-- submissions have been silently failing on insert. Either way, restating the constraint as the
-- union of every source value the application actually sends is safe: a no-op if the live
-- constraint already matches, a real fix if it doesn't.
--
-- Adds 'referral' as a new value — the actual point of this migration — so a team-logged
-- referral becomes a trackable inbound_leads row (source, status lifecycle, shows in Pipeline)
-- instead of a bare contacts row with no lead record at all.

ALTER TABLE public.inbound_leads
  DROP CONSTRAINT IF EXISTS inbound_leads_source_check;

ALTER TABLE public.inbound_leads
  ADD CONSTRAINT inbound_leads_source_check
  CHECK (source = ANY (ARRAY[
    'manual', 'website_form', 'whatsapp_click', 'email', 'claims_form', 'referral'
  ]::text[]));
