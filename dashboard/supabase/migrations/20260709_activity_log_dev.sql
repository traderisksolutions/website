-- Backfill the activity log (audit_logs) with today's development work.
-- One row per shipped change, action = 'dev.shipped', attributed to the developer.
-- Idempotent: re-running won't duplicate (guards on action + resource_id = commit).
-- Run in the Supabase SQL editor.

with dev as (
  select id, email from auth.users where email = 'developer@trade-risksol.com' limit 1
),
entries(commit, ts, summary) as (
  values
    ('646561d','2026-07-09 05:37+08'::timestamptz,'Nexus UX pass: scenarios, next steps, stakeholders table, link-threads, chat label'),
    ('7d71b9d','2026-07-09 05:49+08'::timestamptz,'Engagement: TRS name for internal-only threads; RFQ ''Done'' state'),
    ('7e28969','2026-07-09 05:59+08'::timestamptz,'RFQ/reply -> Engagement threads: auto-CC ops, instant RFQ thread, clearer sender/signature'),
    ('ed6f023','2026-07-09 06:18+08'::timestamptz,'Active Contacts: bulk CSV import with duplicate/invalid review'),
    ('dc7e696','2026-07-09 07:25+08'::timestamptz,'Send: Reply-To operations@ on personal sends (close the reply loop)'),
    ('be86379','2026-07-09 07:43+08'::timestamptz,'Nexus: id foundation - deterministic entity linking in analysis'),
    ('c00dd1f','2026-07-09 08:02+08'::timestamptz,'RFQ: close-out outcome per line'),
    ('db1eba3','2026-07-09 08:06+08'::timestamptz,'RFQ: per-line quote decision inside Run Analysis'),
    ('ff367f6','2026-07-09 08:11+08'::timestamptz,'RFQ: pipeline funnel + win-rate analytics'),
    ('1fa644f','2026-07-09 16:30+08'::timestamptz,'chore: untrack tsconfig.tsbuildinfo build artifact'),
    ('0881294','2026-07-09 16:50+08'::timestamptz,'Settings: top-tab navigation + client recommendation template'),
    ('3c61e35','2026-07-09 17:02+08'::timestamptz,'AI Usage: track Opus + Gemini by provider/model, refactor page'),
    ('a00d406','2026-07-09 17:05+08'::timestamptz,'Eval: surface RFQ + Nexus eval surfaces, group by product area'),
    ('5962f1a','2026-07-09 17:12+08'::timestamptz,'AI Usage: correct Gemini 2.5 Flash pricing to $0.30/$2.50 per 1M'),
    ('e8273d7','2026-07-09 17:24+08'::timestamptz,'RFQ Review & Send: de-dup signature + preview under each editor'),
    ('32d2d6c','2026-07-09 17:28+08'::timestamptz,'RFQ wizard: multi-select lines up front, sequential per-line insurer pick'),
    ('4c5d2e8','2026-07-09 17:33+08'::timestamptz,'RFQ: pre-send quote verification failsafe (source/excerpt/consensus)'),
    ('f5f705e','2026-07-09 17:39+08'::timestamptz,'Eval: real AI-vs-human signal on RFQ + render finer Nexus/RFQ surfaces'),
    ('2184695','2026-07-09 17:47+08'::timestamptz,'Dogfood: unit-test the quote-verify + signature-dedup logic'),
    ('2669d08','2026-07-09 18:04+08'::timestamptz,'RFQ: simplify outcome to Selected/Not chosen + full audit trail'),
    ('23af39d','2026-07-09 18:14+08'::timestamptz,'RFQ: one Nexus case per line of insurance + standardized title'),
    ('0c28ab2','2026-07-09 18:19+08'::timestamptz,'Nexus: every next-step is draftable, recipient editable'),
    ('b885a0a','2026-07-09 18:22+08'::timestamptz,'Nexus: Documents index - every attachment grouped by who sent it')
)
insert into audit_logs (user_id, user_email, user_name, action, resource_type, resource_id, new_value, created_at)
select dev.id, dev.email, 'Developer', 'dev.shipped', 'release', e.commit,
       jsonb_build_object('commit', e.commit, 'summary', e.summary),
       e.ts
from entries e cross join dev
where not exists (
  select 1 from audit_logs a where a.action = 'dev.shipped' and a.resource_id = e.commit
);
