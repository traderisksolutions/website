-- Statement timeout for the API (20 Nov 2026). Run ONLY on Jarod's go, last in docs/database.md's order.
-- Apply with ~/trs-dn-migration/apply-sql.sh. Reversible: alter role authenticator reset statement_timeout;
--
-- PostgREST (trs-api on Cloud Run) logs in as `authenticator` (seen in pg_stat_activity, 20 Nov 2026)
-- and switches to service_role per request. A role setting applies when a connection opens, so
-- it takes effect as PostgREST's pool reconnects; restart the trs-api revision to apply it at once.
-- Today statement_timeout is 0: a runaway query (the body ilike search ran 45-85 s on 20 Nov 2026)
-- holds one of 25 connections and its share of 614 MB of memory for as long as it runs.
--
-- 30 s is above every query the dashboard makes through the API once the search index lands. What
-- is longer runs another way (docs/database.md, "Long queries"): migrations, VACUUM and repairs run
-- as postgres through apply-sql.sh, which this does not touch; an RPC that legitimately needs more
-- declares it on the function (alter function … set statement_timeout = '120s').
-- A query cut off answers HTTP 500 with code 57014 ("canceling statement due to statement timeout").

alter role authenticator set statement_timeout = '30s';
