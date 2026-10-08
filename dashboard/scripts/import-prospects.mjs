#!/usr/bin/env node
// Import prospect companies and named contacts into prospect_accounts / prospect_contacts.
//
//   node --env-file=.env.local scripts/import-prospects.mjs prospects.json           # dry run
//   node --env-file=.env.local scripts/import-prospects.mjs prospects.json --apply   # write
//
// Input: a JSON array of companies.
//   [{ "company": "Acme Pte Ltd", "market": "SG", "domain": "acme.com.sg", "website": "https://acme.com.sg",
//      "industry": "Logistics", "size": "51-200", "city": "Singapore", "source": "grok", "source_url": "https://…",
//      "notes": "…",
//      "contacts": [{ "full_name": "Tan Wei Ming", "first_name": "Wei Ming", "title": "CFO", "email": "weiming.tan@acme.com.sg",
//                     "email_status": "published", "email_source_url": "https://acme.com.sg/team",
//                     "phone": "+65 9123 4567", "linkedin_url": "https://linkedin.com/in/…" }] }]
//
// Rules: market is SG, HK, ID, MY or OTHER. A company matches an existing one on market + domain,
// else market + name. A contact matches on email, else on company + full name. Role inboxes
// (info@, sales@ …) and contacts without a full name are refused. Existing rows gain missing
// fields only; nothing already stored is overwritten. Safe to run twice.
// first_name is the salutation in "Hi {{first_name}}". Always pass it: Chinese names are surname
// first (Tan Wei Ming → Wei Ming), and without it the first word is used.

import { readFileSync } from 'node:fs'

const [file, flag] = process.argv.slice(2)
const APPLY = flag === '--apply'
if (!file) { console.error('Usage: import-prospects.mjs <file.json> [--apply]'); process.exit(1) }
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://trs-api-335840130686.asia-southeast1.run.app'
const KEY = process.env.SUPABASE_SERVICE_KEY
if (!KEY) { console.error('SUPABASE_SERVICE_KEY not set (use --env-file=.env.local)'); process.exit(1) }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const MARKETS = ['SG', 'HK', 'ID', 'MY', 'OTHER']
const STATUSES = ['verified', 'published', 'guessed', 'unknown', 'invalid']
const ROLE = new Set('info sales enquiry enquiries inquiry inquiries contact contactus hello hi admin administrator support help hr careers jobs recruit recruitment office marketing accounts account finance billing invoice invoices service services customerservice cs team mail email general reception noreply no-reply donotreply webmaster postmaster media press pr legal compliance ops operations enquire business partners partnership feedback events ask mailbox corporate secretary'.split(' '))
const isRole = e => { const l = e.split('@')[0]; return ROLE.has(l) || ROLE.has(l.replace(/[._-]?(sg|hk|id|my|asia|team)$/, '')) }
const isEmail = e => /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i.test(e)
const domainOf = s => { s = (s ?? '').trim().toLowerCase(); if (!s) return null; const h = s.includes('@') && !s.includes('/') ? s.split('@')[1] : s.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0]; const d = h?.replace(/^www\./, '').replace(/:\d+$/, ''); return d?.includes('.') ? d : null }
const firstName = f => { const p = f.trim().replace(/^(mr|mrs|ms|mdm|dr|ir|bapak|ibu|pak|bu)\.?\s+/i, '').split(/\s+/)[0]; return p ? p[0].toUpperCase() + p.slice(1) : null }
const clean = v => (typeof v === 'string' ? v.trim() || null : v ?? null)

async function all(path) {
  const out = []
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${path}${path.includes('?') ? '&' : '?'}order=id&limit=1000&offset=${off}`, { headers: H })
    if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
    const rows = await r.json(); out.push(...rows); if (rows.length < 1000) return out
  }
}
async function send(path, method, body) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`)
  return r.json()
}
const missingOnly = (row, next) => Object.fromEntries(Object.entries(next).filter(([k, v]) => v != null && (row[k] == null || row[k] === '')))

const input = JSON.parse(readFileSync(file, 'utf8'))
if (!Array.isArray(input)) { console.error('Expected a JSON array of companies'); process.exit(1) }

const accounts = await all('prospect_accounts?select=*')
const contacts = await all('prospect_contacts?select=*')
const byDomain = new Map(accounts.filter(a => a.domain).map(a => [`${a.market}|${a.domain.toLowerCase()}`, a]))
const byName = new Map(accounts.map(a => [`${a.market}|${a.name.toLowerCase()}`, a]))
const byEmail = new Map(contacts.filter(c => c.email).map(c => [c.email.toLowerCase(), c]))
const byPerson = new Map(contacts.map(c => [`${c.account_id}|${c.full_name.toLowerCase()}`, c]))
const n = { accountsNew: 0, accountsUpdated: 0, contactsNew: 0, contactsUpdated: 0, refused: [] }

for (const co of input) {
  const market = String(co.market ?? '').toUpperCase()
  const name = clean(co.company ?? co.name)
  if (!name || !MARKETS.includes(market)) { n.refused.push(`company "${name ?? '?'}": needs company and market (${MARKETS.join('/')})`); continue }
  const domain = domainOf(co.domain ?? co.website)
  const fields = { market, name, domain, website: clean(co.website), industry: clean(co.industry), size: clean(co.size), city: clean(co.city), source: clean(co.source) ?? 'import', source_url: clean(co.source_url), notes: clean(co.notes) }
  let acc = (domain && byDomain.get(`${market}|${domain}`)) || byName.get(`${market}|${name.toLowerCase()}`)
  if (!acc) {
    n.accountsNew++
    acc = APPLY ? (await send('prospect_accounts', 'POST', fields))[0] : { id: `new:${name}`, ...fields }
    if (domain) byDomain.set(`${market}|${domain}`, acc); byName.set(`${market}|${name.toLowerCase()}`, acc)
  } else {
    const patch = missingOnly(acc, fields)
    if (Object.keys(patch).length) { n.accountsUpdated++; if (APPLY) await send(`prospect_accounts?id=eq.${acc.id}`, 'PATCH', { ...patch, updated_at: new Date().toISOString() }); Object.assign(acc, patch) }
  }

  for (const p of co.contacts ?? []) {
    const full = clean(p.full_name ?? p.name)
    const email = clean(p.email)?.toLowerCase() ?? null
    if (!full) { n.refused.push(`${name}: contact without a full name (${email ?? 'no email'})`); continue }
    if (email && !isEmail(email)) { n.refused.push(`${name} / ${full}: bad email "${email}"`); continue }
    if (email && isRole(email)) { n.refused.push(`${name} / ${full}: role inbox ${email}`); continue }
    const status = STATUSES.includes(p.email_status) ? p.email_status : 'unknown'
    const cf = { account_id: acc.id, full_name: full, first_name: clean(p.first_name) ?? firstName(full), title: clean(p.title), email, email_status: email ? status : 'unknown', email_source_url: clean(p.email_source_url), phone: clean(p.phone), linkedin_url: clean(p.linkedin_url), source: clean(p.source) ?? fields.source }
    const hit = (email && byEmail.get(email)) || byPerson.get(`${acc.id}|${full.toLowerCase()}`)
    if (!hit) {
      n.contactsNew++
      const row = APPLY && !String(acc.id).startsWith('new:') ? (await send('prospect_contacts', 'POST', cf))[0] : { id: `new:${full}`, ...cf }
      if (email) byEmail.set(email, row); byPerson.set(`${acc.id}|${full.toLowerCase()}`, row)
    } else {
      const patch = missingOnly(hit, cf)
      // A better-evidenced status replaces 'unknown' or 'guessed'; nothing downgrades.
      if (email && hit.email === email && ['unknown', 'guessed'].includes(hit.email_status) && ['verified', 'published'].includes(status)) patch.email_status = status
      delete patch.account_id
      if (Object.keys(patch).length) { n.contactsUpdated++; if (APPLY) await send(`prospect_contacts?id=eq.${hit.id}`, 'PATCH', { ...patch, updated_at: new Date().toISOString() }); Object.assign(hit, patch) }
    }
  }
}

console.log(`${APPLY ? 'Applied' : 'Dry run'}: companies ${n.accountsNew} new, ${n.accountsUpdated} updated; contacts ${n.contactsNew} new, ${n.contactsUpdated} updated; ${n.refused.length} refused`)
n.refused.forEach(r => console.log(`  refused: ${r}`))
if (!APPLY) console.log('Nothing written. Re-run with --apply.')
