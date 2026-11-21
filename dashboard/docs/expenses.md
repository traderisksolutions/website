# Expenses

Every running cost the dashboard adds, and every one proposed. Nothing in **Proposed** is switched on until Jarod decides. Figures are estimates in US$ per month unless marked as billed.

## Running

| Item | Since | Cost a month | What it buys |
| --- | --- | --- | --- |
| Cloud Scheduler, 12 jobs (3 free) | 21 Nov 2026 | about 0.90 | One scheduler for every timed job; the 8 Vercel crons move here once a clean day is confirmed |
| Secret Manager, 1 secret (PGRST_DB_URI) | 21 Nov 2026 | about 0.06 | The database login kept out of plain settings after the rotation |

## Proposed

| Item | Cost a month | What it buys | Status |
| --- | --- | --- | --- |
| Keep the database API warm (trs-api, 1 minimum instance) | about 10 | Removes the 1–2 s wait after a quiet spell (cold start) | Declined for now, 21 Nov 2026 |
| Move the dashboard to Cloud Run | about 5–20, against Vercel Pro at 20 a seat | Direct database queries, one platform; Vercel can be cancelled once all 8 projects move and DNS leaves Vercel | Deferred, 21 Nov 2026 |
| Larger database tier (Cloud SQL above db-f1-micro) | not priced | Faster heavy reads | Declined earlier: keep the free-as-possible tier |
| Microsoft folder watch schedule (Cloud Scheduler, 1 job calling /api/cron/microsoft hourly) | about 0.10 | Files dropped in the agreed OneDrive/SharePoint folder are filed like email attachments. Also needs a Microsoft app with one admin consent (no Microsoft charge) | Built switched off, 21 Nov 2026 |
| Run held agent work every 30 minutes | model spend, not priced: each run reads with Gemini | Held AI work clears without a person pressing Run on Today › AI approvals | Proposed, 21 Nov 2026 |

Add a row whenever a change would add a cost; move it to Running only on Jarod's go.
