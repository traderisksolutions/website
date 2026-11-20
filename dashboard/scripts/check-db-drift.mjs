#!/usr/bin/env node
// Database access drift check (step 2 of the platform clean-up, 20 Nov 2026). New reads and writes
// go through the typed client (src/lib/db/client.ts: db().from(…), rows(), one()), which the build
// checks against the schema. Counts, per .ts/.tsx file under src (tests excluded), the untyped ways
// in, against scripts/db-baseline.json:
//   sb       sb(…), sbTry(…) query strings          src/lib/crm/db.ts
//   fetch    hand-built PostgREST calls             fetch(`${SB_URL}/rest/v1/…`), …/rest/v1/
// A file above its count, or a new file with any, fails. Counts only go down.
//
//   node scripts/check-db-drift.mjs                 check (part of npm run check)
//   node scripts/check-db-drift.mjs --update [files] rewrite the baseline, or only the named files
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const BASELINE = join(ROOT, 'scripts/db-baseline.json')
const KINDS = {
  sb: /\bsb(?:Try)?(?:<[^>()]*>)?\(/g,
  fetch: /\/rest\/v1\b/g,
}
// The helpers themselves, and the typed client.
const EXEMPT = new Set(['src/lib/crm/db.ts', 'src/lib/sb.ts', 'src/lib/db/client.ts', 'src/lib/db/database.gen.ts'])
const ZERO = () => Object.fromEntries(Object.keys(KINDS).map(k => [k, 0]))

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (name !== '__tests__' && name !== 'node_modules') walk(p, out) }
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) out.push(relative(ROOT, p))
  }
  return out
}

function count(text) {
  const c = ZERO()
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue
    for (const [k, re] of Object.entries(KINDS)) c[k] += (line.match(re) ?? []).length
  }
  return c
}

const nonZero = c => Object.values(c).some(v => v > 0)
const files = walk(join(ROOT, 'src')).filter(f => !EXEMPT.has(f))
const now = Object.fromEntries(files.map(f => [f, count(readFileSync(join(ROOT, f), 'utf8'))]))
const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}

const args = process.argv.slice(2)
if (args[0] === '--update') {
  const only = args.slice(1).map(a => relative(ROOT, join(process.cwd(), a)))
  const next = only.length ? { ...base } : {}
  for (const f of only.length ? only : files) {
    if (now[f] && nonZero(now[f])) next[f] = now[f]
    else delete next[f]
  }
  for (const f of Object.keys(next)) if (!now[f]) delete next[f]
  const sorted = Object.fromEntries(Object.keys(next).sort().map(f => [f, next[f]]))
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 1) + '\n')
  const t = ZERO()
  for (const c of Object.values(sorted)) for (const k of Object.keys(t)) t[k] += c[k] ?? 0
  console.log(`Database baseline written: ${Object.keys(sorted).length} files · sb ${t.sb} · fetch ${t.fetch}${only.length ? ` (updated ${only.length} named file${only.length === 1 ? '' : 's'})` : ''}.`)
  process.exit(0)
}

const over = [], under = new Set()
for (const f of files) {
  const b = { ...ZERO(), ...(base[f] ?? {}) }
  for (const k of Object.keys(KINDS)) {
    if (now[f][k] > b[k]) over.push(`${f}: ${k} ${b[k]} → ${now[f][k]}`)
    else if (now[f][k] < b[k]) under.add(f)
  }
}
if (over.length) {
  console.error(`Database drift: ${over.length} increase${over.length === 1 ? '' : 's'} over scripts/db-baseline.json.`)
  for (const o of over) console.error(`  ${o}`)
  console.error("Use the typed client: import { db, rows, one } from '@/lib/db/client'; rows('What', db().from('table').select('cols')).")
  process.exit(1)
}
console.log(`Database drift: no increase across ${files.length} files.${under.size ? ` ${under.size} file${under.size === 1 ? '' : 's'} went down; lock that in with --update <files>.` : ''}`)
