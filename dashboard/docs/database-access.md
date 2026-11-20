# Database access

Step 2 of the platform clean-up (Jarod, 20 Nov 2026): every read and write is typed against the schema, and a failed query is an error, never an empty list.

## The typed client

```ts
import { db, rows, one } from '@/lib/db/client'

const policies = await rows('Policies', db().from('policies')
  .select('id, end_date, companies!policies_company_id_fkey(company_name)')
  .in('lifecycle', ['bound', 'live'])
  .order('end_date', { ascending: true }))
```

- `db()` is `@supabase/postgrest-js` typed by `src/lib/db/database.gen.ts`. A wrong table, column or value type is a build error, and the row type follows the `select`.
- `rows(what, query)` and `one(what, query)` throw `DbError` on any error. `what` names the read in the message.
- It runs over the same PostgREST as `sb()`. The database (Cloud SQL `trs-pg`) has only a private address, so a direct driver such as Drizzle waits for the move to Cloud Run.
- Not caught at build time: an embed that is ambiguous through a linking table (PGRST201). Name the foreign key in the embed (`companies!policies_company_id_fkey(…)`); if you forget, `rows()` throws on the first run.

## After a migration

```
set -a; source .env.local; set +a; npm run db:types
```

This rewrites `src/lib/db/database.gen.ts` from the live schema. Commit it with the migration.

## The drift check

`scripts/check-db-drift.mjs` runs in `npm run check` and CI. It counts, per file, the untyped ways into the database: `sb(…)`/`sbTry(…)` query strings, and hand-built `…/rest/v1/…` calls. It compares them with `scripts/db-baseline.json`. A file above its count, or a new file with any, fails. After moving a file to the typed client, run `npm run db:baseline -- <files>` and commit the lower counts.

Baseline on 20 Nov 2026: 1,537 `sb` calls and 543 hand-built calls in 347 files. The Policies page is the first file moved.
