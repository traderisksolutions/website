-- Reclaim email_messages space (20 Nov 2026). NOT a schema change. Run ONLY on Jarod's go, off-hours
-- (after 22:00 SGT or a weekend), and only after scripts/move-inline-images.ts --apply has finished.
-- Apply with ~/trs-dn-migration/apply-sql.sh (psql as postgres, autocommit: VACUUM cannot run inside
-- a transaction). Raise that job's --task-timeout from 10m to 30m for this file.
--
-- VACUUM FULL rewrites email_messages and its TOAST into new files and returns the freed space to
-- the disk. It holds an ACCESS EXCLUSIVE lock for the whole rewrite: every read and write of
-- email_messages (the Inbox, thread pages, mail ingest) waits until it ends. Expected: a few minutes
-- for the roughly 0.5 GB left after the images move; it needs about that much free disk while it runs.
-- lock_timeout stops it queueing behind a long transaction and blocking everyone behind it; if it
-- gives up, run it again later. Killing it part-way is safe: the old files stay until it commits.
--
-- Before (20 Nov 2026): email_messages 2,538 MB total, heap 9 MB, 10,513 rows.
-- Check after: select pg_size_pretty(pg_total_relation_size('public.email_messages'));

set lock_timeout = '10s';
set statement_timeout = 0;
VACUUM (FULL, ANALYZE) email_messages;
