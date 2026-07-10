#!/usr/bin/env node
/**
 * One-command changelog → posts a session to the Dev Logs page (/kyn-roi-log).
 *
 * Usage:
 *   node scripts/dev-log.mjs "Session title"                 # auto: today's commits become the changes
 *   node scripts/dev-log.mjs "Session title" --since=2d      # commits in the last 2 days
 *   node scripts/dev-log.mjs "Session title" --tags=Feature,Bugfix
 *   node scripts/dev-log.mjs "Title" --changes="a|b|c"       # explicit changes (pipe-separated)
 *
 * Env (set once, e.g. in scripts/.dev-log.env or your shell):
 *   SUPABASE_SERVICE_KEY   required — the dev-logs POST is service-key gated
 *   TRS_DASHBOARD_URL      optional — defaults to the production deploy
 */
import { execSync } from 'node:child_process'

const BASE = process.env.TRS_DASHBOARD_URL || 'https://trs-dashboard-pi.vercel.app'
const KEY  = process.env.SUPABASE_SERVICE_KEY
const args = process.argv.slice(2)

const title = args.find(a => !a.startsWith('--'))
if (!title) { console.error('Usage: node scripts/dev-log.mjs "Session title" [--since=1d] [--tags=Feature,Bugfix] [--changes="a|b"]'); process.exit(1) }
if (!KEY)   { console.error('✗ SUPABASE_SERVICE_KEY is not set (the dev-logs endpoint is service-key gated).'); process.exit(1) }

const opt = (name, def) => { const m = args.find(a => a.startsWith(`--${name}=`)); return m ? m.split('=').slice(1).join('=') : def }

const since = opt('since', 'midnight')                 // git --since expression
const tags  = opt('tags', 'Feature').split(',').map(s => s.trim()).filter(Boolean)
const project = opt('project', 'Dashboard')
const sessionDate = new Date().toISOString().slice(0, 10)

let changes
const explicit = opt('changes', null)
if (explicit) {
  changes = explicit.split('|').map(s => s.trim()).filter(Boolean)
} else {
  // Today's commit subjects, oldest→newest, excluding the changelog/merge noise.
  const raw = execSync(`git log --since="${since}" --no-merges --pretty=format:%s`, { encoding: 'utf8' })
  changes = raw.split('\n').map(s => s.trim())
    .filter(s => s && !/^(chore: untrack|Dev Logs?:|Activity log:)/i.test(s))
    .reverse()
}
if (changes.length === 0) { console.error('✗ No changes found for --since=' + since + '. Pass --changes="a|b|c".'); process.exit(1) }

const payload = { session_date: sessionDate, title, project, changes, tags }
console.log(`→ ${BASE}/api/dev-logs\n${JSON.stringify(payload, null, 2)}\n`)

const res = await fetch(`${BASE}/api/dev-logs`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
  body:    JSON.stringify(payload),
})
if (!res.ok) { console.error(`✗ ${res.status}: ${await res.text()}`); process.exit(1) }
console.log(`✓ Logged "${title}" — ${changes.length} change(s) on ${sessionDate}.`)
