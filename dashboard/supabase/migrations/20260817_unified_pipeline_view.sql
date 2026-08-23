-- Unified pipeline view — a single read model over inbound_leads + outbound_leads.
--
-- Deliberately a VIEW, not a table merge: outbound_leads has a wide FK web
-- (ob_campaign_leads, ob_campaign_sends, ob_lead_scores, ob_reply_events, ob_signal_library,
-- contacts, ob_people_dump), inbound_leads has almost none (only contacts.inbound_lead_id).
-- Altering either base table's shape to unify them would put that FK web at risk for no
-- real benefit — a normalized read-only view gets the same "one pipeline" outcome safely.
--
-- Access: outbound_leads has RLS enabled with ZERO policies (implicitly service-role-only —
-- confirmed, this is why /outbound/leads already goes through a server API route using the
-- service key rather than a client-side query). This view must be queried the same way — see
-- src/app/api/pipeline/route.ts. Do not query it from the browser/anon key; inbound_leads and
-- outbound_leads have different RLS postures and a client-side query would behave
-- inconsistently between the two halves of the union.

CREATE OR REPLACE VIEW public.unified_pipeline AS
SELECT
  'inbound'                                                   AS origin,
  id                                                           AS id,
  'inbound:' || id::text                                      AS pipeline_id,
  COALESCE(NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''), email) AS display_name,
  email,
  company                                                      AS company,
  source                                                       AS source_detail,
  status                                                       AS raw_status,
  CASE
    WHEN status = 'new'                                 THEN 'new'
    WHEN status IN ('contacted', 'engaged', 'qualified') THEN 'in_progress'
    WHEN status = 'closed'                               THEN 'closed'
    WHEN status = 'spam'                                 THEN 'spam'
    ELSE 'new'
  END                                                          AS status_bucket,
  topic                                                        AS topic_or_industry,
  priority                                                     AS priority,
  created_at,
  updated_at                                                   AS last_activity_at
FROM public.inbound_leads

UNION ALL

SELECT
  'outbound'                                                   AS origin,
  id                                                           AS id,
  'outbound:' || id::text                                     AS pipeline_id,
  COALESCE(full_name, NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''), email, current_company) AS display_name,
  email,
  current_company                                              AS company,
  source                                                        AS source_detail,
  status                                                        AS raw_status,
  CASE
    WHEN status = 'new'                                             THEN 'new'
    WHEN status IN ('contacted', 'engaged', 'qualified', 'proposal') THEN 'in_progress'
    WHEN status IN ('converted', 'closed')                          THEN 'closed'
    WHEN status = 'spam'                                             THEN 'spam'
    ELSE 'new'
  END                                                           AS status_bucket,
  current_industry                                              AS topic_or_industry,
  NULL::text                                                    AS priority,
  created_at,
  updated_at                                                    AS last_activity_at
FROM public.outbound_leads
WHERE opt_out IS NOT TRUE;
