#!/usr/bin/env node
// The migration runner (21 Nov 2026). Applies the files in supabase/migrations that the ledger
// (public.schema_migrations) has not recorded, in name order, each in its own transaction with its
// ledger row, and records them. Every file is guarded in the SQL itself, so a file already in the
// ledger is skipped even if the read below is stale.
//
//   set -a; source .env.local; set +a
//   node scripts/migrate.mjs                    # list pending files (reads the ledger through PostgREST)
//   node scripts/migrate.mjs --sql > out.sql    # print the bundle that would run
//   node scripts/migrate.mjs --apply            # run it through apply-sql.sh (production; needs the owner's go)
//   node scripts/migrate.mjs --baseline --apply # once: create the ledger and record every file as applied
//
// The database has no public address; apply-sql.sh runs psql as a one-shot Cloud Run job on the VPC.
// Its path comes from TRS_APPLY_SQL (default ~/trs-dn-migration/apply-sql.sh). After an apply, run
// schema-snapshot.sh, `node scripts/db-pull.mjs` and `npm run db:types`, and commit the result.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const DIR = 'supabase/migrations'
const LEDGER = '20261121_schema_migrations.sql'
const args = new Set(process.argv.slice(2))
const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
const lit = s => `'${s.replaceAll("'", "''")}'`
const sha = s => createHash('sha256').update(s).digest('hex')

/** Names the ledger holds, or null when it cannot be read (not created yet, or no credentials). */
async function applied() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  const res = await fetch(`${url}/rest/v1/schema_migrations?select=name`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).catch(() => null)
  if (!res?.ok) return null
  return new Set((await res.json()).map(r => r.name))
}

function bundle() {
  const ledger = readFileSync(join(DIR, LEDGER), 'utf8')
  const out = ['\\set ON_ERROR_STOP on', ledger]
  if (args.has('--baseline')) {
    out.push(`insert into public.schema_migrations (name, baseline) values\n${files.map(f => `  (${lit(f)}, true)`).join(',\n')}\non conflict (name) do nothing;`)
  } else {
    for (const f of files) {
      const sql = readFileSync(join(DIR, f), 'utf8')
      // a file that manages its own transaction is run as written; its ledger row follows it
      const own = /^\s*(begin|commit)\s*;/im.test(sql)
      out.push([
        `select not exists (select 1 from public.schema_migrations where name = ${lit(f)}) as pending \\gset`,
        '\\if :pending',
        `\\echo applying ${f}`,
        own ? '' : 'begin;',
        sql,
        `insert into public.schema_migrations (name, checksum) values (${lit(f)}, ${lit(sha(sql))});`,
        own ? '' : 'commit;',
        '\\endif',
      ].filter(Boolean).join('\n'))
    }
  }
  out.push("notify pgrst, 'reload schema';", "select count(*) as recorded from public.schema_migrations;")
  return out.join('\n\n') + '\n'
}

if (args.has('--sql')) { process.stdout.write(bundle()); process.exit(0) }

const done = await applied()
const pending = done ? files.filter(f => !done.has(f)) : null
if (!args.has('--apply')) {
  if (!pending) console.log('The ledger could not be read (not created yet, or .env.local not sourced). Run --baseline --apply once.')
  else console.log(pending.length ? `Pending (${pending.length}):\n${pending.join('\n')}` : 'Nothing pending.')
  process.exit(0)
}
if (!args.has('--baseline') && !pending) { console.error('The ledger could not be read; create it with --baseline --apply first.'); process.exit(1) }
// files run in name order, so a new file must sort after everything already applied
const newest = done ? [...done].sort().at(-1) : undefined
const early = (pending ?? []).filter(f => newest && f < newest)
if (early.length && !args.has('--baseline')) { console.error(`These sort before ${newest}, the newest applied file; rename them with today's date:\n${early.join('\n')}`); process.exit(1) }
if (pending && !pending.length && !args.has('--baseline')) { console.log('Nothing pending.'); process.exit(0) }

const runner = process.env.TRS_APPLY_SQL ?? join(homedir(), 'trs-dn-migration/apply-sql.sh')
const file = join(mkdtempSync(join(tmpdir(), 'trs-migrate-')), 'bundle.sql')
// only the pending files go in the bundle; the guards cover a ledger that moved since the read
if (pending && !args.has('--baseline')) files.splice(0, files.length, ...pending)
writeFileSync(file, bundle())
execFileSync(runner, [file], { stdio: 'inherit' })
