# Database size and upkeep

Production Postgres: Cloud SQL `trs-pg`, db-f1-micro (about 614 MB RAM, shared_buffers 128 MB, max_connections 25), reached through PostgREST (`trs-api`, role `authenticator`).

## Sizes, 20 Nov 2026

| Relation | Size | Rows | Note |
| --- | --- | --- | --- |
| Database | 2,895 MB | | Memory at 100%; Inbox search 45–85 s; body ilike timed out |
| email_messages | 2,538 MB | 10,513 | Heap 9 MB; the rest is TOAST (body_html) |
| company_chunks_embedding_idx | 55 MB | | idx_scan = 0 |
| agent_tasks | 19 MB | 30,000 | Oldest row 1 Nov 2026 |
| error_logs | 13 MB | 19,000 | Oldest row 2 Oct 2026 |

Sample of 50 email_messages rows (by id, 20 Nov 2026): 14.3 MB of body_html, of which 11.3 MB (79%) is data:image URIs, in 21 rows (42%), 145 images. Median body 25 KB; largest 5.3 MB (an outbound reply quoting earlier images).

Cause: mail ingest wrote each cid: inline image into body_html as a data: URI, the compose editor inserted pasted images as data: URIs, and every reply quoted the earlier ones again.

## Steps and what each frees

| Step | What it does | Frees (estimate) |
| --- | --- | --- |
| 1. Code deploy | Ingest stores inline images in Drive (`email-images/stored/<YYYY-MM>/<hash>.<ext>`) and writes a signed link (`/api/public/email-image/<drive id>?s=<hmac>`). The editor uploads pasted images. | Stops the growth |
| 2. `scripts/move-inline-images.ts` | Moves the existing data: URIs out of body_html the same way | Nothing on disk yet; the rows shrink |
| 3. `20261120_reclaim_email_space.sql` | `VACUUM (FULL, ANALYZE) email_messages` | 1.7–2.0 GB (see Estimate) |
| 4. Vector index | Not dropped: `match_company_chunks` is called (see below) | 0 MB (55 MB if dropped later) |
| 5. `20261120_statement_timeout.sql` | 30 s limit for the API role | Bounds memory per query |
| Daily log trim | Admin sweep: agent_tasks finished over 30 days ago, error_logs over 90 days | 0 today (both tables are younger); from mid-Dec 2026 |

Expected after step 3: email_messages about 0.5–0.8 GB, database about 0.9–1.2 GB.

### Estimate

| Read (20 Nov 2026) | Result | Extrapolated |
| --- | --- | --- |
| 50 rows by id, all rows | 79% of body_html is data:image | 79% of 2,538 MB = 2.0 GB |
| Job dry run, 2 batches (first 0.9% of the id range) | 49 of 50 rows change, 153 images, 15.4 MB | about 5,500 rows, 1.7 GB |

The dry run took about 37 s a batch on the loaded database: the full dry run is about 2 hours, the apply longer (one Drive upload per distinct image).

Small data: URIs stay inline: under 1,000 characters (spacers, tracking pixels), SVG (can carry script), and anything that is not a readable PNG, JPEG, GIF, WebP or BMP. The job reports them as kept.

## Run order

Each production step waits for Jarod's go.

```
# 1. Code deploy (the usual routine in CLAUDE.md). New mail stops adding data: URIs.

# 2a. Dry run: reads 25 rows at a time, 2 s apart; prints rows, images and MB it would move.
set -a; source .env.local; set +a
npx tsx --tsconfig tsconfig.json scripts/move-inline-images.ts
#     (sample first: --max-batches 4)

# Before 2b: the links are signed with AUTH_SECRET, so the job must run with production's value.
#     The job fetches its first link from the live site and stops before changing any row unless it answers 200.
# 2b. Apply. Uploads each image (or finds it by hash), logs it, then rewrites body_html.
#     Log: ~/trs-move-inline-images.jsonl (message id, image hash, Drive id); a rerun skips logged images.
#     Undo: ~/trs-move-inline-images-undo.jsonl.gz (original body_html per row, written before the change).
#     Stop at any time; resume with --from <last id printed>.
npx tsx --tsconfig tsconfig.json scripts/move-inline-images.ts --apply

# 3. Off-hours (after 22:00 SGT or a weekend). Locks email_messages for minutes.
#    In apply-sql.sh, raise --task-timeout to 30m for this file.
~/trs-dn-migration/apply-sql.sh supabase/migrations/20261120_reclaim_email_space.sql

# 4. Vector index: no file. See "Vector index" below.

# 5. Statement timeout, last; then restart the trs-api revision so every pooled connection takes it.
~/trs-dn-migration/apply-sql.sh supabase/migrations/20261120_statement_timeout.sql

# Log trim, once by hand (the admin sweep then runs it daily):
npx tsx --tsconfig tsconfig.json scripts/trim-logs.ts            # counts
npx tsx --tsconfig tsconfig.json scripts/trim-logs.ts --apply
```

The timeout goes last because the job's batch read (`body_html like '%data:image%'` after an id, limit 25) reads TOAST until it finds 25 matches and may run longer than 30 s where matches are sparse.

## Verify

Cheap: catalogue reads only, no table scan.

```sql
select pg_size_pretty(pg_database_size(current_database()));
select relname, pg_size_pretty(pg_total_relation_size(c.oid)) total,
       pg_size_pretty(pg_relation_size(c.oid)) heap,
       pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid)) toast
from pg_class c where relname in ('email_messages','agent_tasks','error_logs','company_chunks');
select indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) from pg_stat_user_indexes where indexrelname = 'company_chunks_embedding_idx';
select rolname, rolconfig from pg_roles where rolname = 'authenticator';   -- {statement_timeout=30s}
```

In the dashboard: open a thread with a pasted screenshot or a signature logo; the image shows (journey `inline-images`). A stored image's link without its `?s=` answers 404.

## Inline image links

- Stored in Drive under the root's `email-images/stored/<YYYY-MM>/`, named by the first 32 hex characters of the image's sha256; the same image in one month folder is stored once.
- The link is absolute (`NEXT_PUBLIC_APP_URL`, else https://trs-dashboard-pi.vercel.app) so a quoted reply carries a working image to the recipient.
- `?s=` is an HMAC-SHA256 of the Drive id under `AUTH_SECRET`. It does not expire, because the email it sits in is kept. Rotating `AUTH_SECRET` breaks every stored link; re-sign them first (the Drive id is in the link).
- Images inserted from the editor (`/api/upload/image`, `email-images/<YYYY-MM>/`) are served by Drive id alone, as before.

## Vector index

`company_chunks_embedding_idx` is not dropped. `rpc/match_company_chunks` (vector similarity over company_chunks) is called by `/api/engagement/draft`, `src/lib/agents/ask-ai.ts` and `src/lib/agents/crm-agent.ts` through `searchCompany` (`src/lib/agents/company-retrieval.ts`). The function's SQL is not in the repo. idx_scan = 0 suggests the planner filters by company first and never uses the index. To decide: read `select pg_get_functiondef('match_company_chunks'::regproc)` and `explain` one call; if the index is not in the plan, `drop index if exists company_chunks_embedding_idx;` frees 55 MB.

## Long queries

With a 30 s API limit:

| Path | Duration | Route |
| --- | --- | --- |
| Inbox body search (ilike) | 45–85 s today | Owned by the search-index work; until it lands, a body search past 30 s fails with 57014 |
| `scripts/move-inline-images.ts` batch read | Seconds; longer where matches are sparse | Run before the timeout (step 2 before step 5) |
| VACUUM, migrations, repairs | Minutes | psql as `postgres` through apply-sql.sh; not affected |
| `rpc/merge_companies`, `merge_contacts`, `merge_reference_columns` | Seconds (one company's rows) | If one needs more: `alter function … set statement_timeout = '120s'` |
| Backfill and admin scripts | Paged, 25–1,000 rows per request | Each request stays short |
| `thread-embed` Cloud Run job | One thread per request | Not affected |

## Log retention

| Table | Kept | Rule |
| --- | --- | --- |
| agent_tasks | queued, running, needs_human: always; finished: 30 days | After 30 days a finished task with a dated idem_key (`renewals:sweep:2026-11-01`) is deleted; any other is slimmed (payload `{"trimmed":true}`, result and error cleared) and kept, because its idem_key stops the same task being queued twice |
| error_logs | 90 days | Deleted after |
| gemini_usage_log | Always | Spend history |
| audit_logs | Always | Never touched |
