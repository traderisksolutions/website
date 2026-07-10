-- Add today's session to the Dev Logs (dev_logs table → /kyn-roi-log page).
-- One session row for 2026-07-09 with every change shipped. Idempotent: guards on
-- (session_date, title). Run in the Supabase SQL editor.

insert into dev_logs (session_date, title, project, changes, tags)
select
  '2026-07-09',
  'RFQ engagement + Nexus: quote decision & verification, per-line cases, Select/Not-chosen + audit trail, IDs & Documents, AI-usage/eval',
  'Dashboard',
  array[
    'Reply-To operations@ on personal sends — insurer/client replies route back to the shared Engagement inbox',
    'Nexus ID foundation — deterministic entity linking (stakeholders, missing-items, next-steps, citations join on real ids)',
    'RFQ close-out outcome per line',
    'RFQ per-line quote decision inside Run Analysis — each insurer pros/cons + broker recommendation (figures never invented)',
    'RFQ pipeline funnel + win/selection-rate analytics on the RFQ Ops panel',
    'Settings: top-tab navigation (Account / Signatures / Insurers / RFQ / Templates)',
    'Client recommendation email template — the compiled quotations note to the client',
    'AI Usage: track Opus + Gemini by provider/model (Opus was never logged); By product area / By model views',
    'Eval: surface the RFQ + Nexus eval surfaces, grouped by product area',
    'AI Usage: correct Gemini 2.5 Flash pricing to $0.30/$2.50 per 1M',
    'RFQ Review & Send: de-dup signature + signature preview under each editor',
    'RFQ wizard: multi-select lines up front, sequential per-line insurer pick',
    'RFQ pre-send quote verification failsafe — source match + cited-excerpt match + second-model consensus (catches 254,000->245,000)',
    'Eval: real AI-draft-vs-human-sent signal on RFQ + render finer Nexus/RFQ surfaces',
    'Unit tests for the quote-verify + signature-dedup logic (suite 52 -> 63 passing)',
    'RFQ outcome simplified to Selected / Not chosen (was bind/won/lost + premium/date/policy)',
    'Full RFQ audit trail — rfq_events logs every touchpoint (requested->dispatched->replied->quoted->recommended->selected/not_chosen)',
    'One Nexus case per line of insurance + standardized title "[RFQ] {insured} — {line}"',
    'Every Nexus next-step is draftable with an editable recipient (steps independent, no dependency gating)',
    'Nexus Documents index — every attachment grouped by who sent it, tracked by real id, read/pending status',
    'Engagement: auto-CC ops, instant RFQ thread, clearer sender/signature bar',
    'Active Contacts: bulk CSV import with duplicate/invalid review',
    'Nexus UX pass: scenarios, next steps, actionable stakeholders table, link-threads, chat label'
  ],
  array['Feature','Bugfix','Design']
where not exists (
  select 1 from dev_logs where session_date = '2026-07-09'
    and title like 'RFQ engagement + Nexus:%'
);
