/**
 * Re-prices the older Employment Benefits quotations (gb_quotations, not superseded) through the
 * /eb builder and keeps each as an eb_quotations row, so the Quotation register lists them.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx --tsconfig tsconfig.json scripts/eb-reprice-legacy.ts            dry run (the default): prints, writes nothing
 *   npx tsx --tsconfig tsconfig.json scripts/eb-reprice-legacy.ts --apply    writes; needs 20261120_eb_quotations_legacy.sql
 *
 * Per row: the census (CensusLife members), its categories (censusCategories), today's cover per
 * category (last year's policy, else the confirmed schedule, else the census plan; src/lib/gb/eb-legacy.ts),
 * every product priced from the house workbook (priceDesign), the plans the builder matched
 * (snapshotFrom), the benefit rows, then the insert with the next version for the company.
 * Company by companyKey against companies; thread from "[thread:<uuid>]" in the notes.
 * Idempotent: a row whose id is already an eb_quotations.legacy_gb_id is skipped.
 * No model is called. Reads and writes go through the service key; nothing secret is printed.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { companyKey } from '@/lib/format'
import { legacyInput, pickedPlans, threadOf, type LegacyRow } from '@/lib/gb/eb-legacy'
import { snapshotFrom, proposalModel } from '@/lib/gb/eb-proposal'
import { priceDesign } from '@/lib/gb/eb-price'
import { loadWorkbook } from '@/lib/gb/workbook'
import { loadRules } from '@/lib/gb/plan-pairs'

const APPLY = process.argv.includes('--apply')
const ACTOR = 'eb-reprice-legacy-2026-11-20'
type Row = LegacyRow & { created_at: string; updated_at: string | null }
const f0 = (n: number) => Math.round(n).toLocaleString('en-SG')

async function main() {
  console.log(APPLY ? 'APPLY: writing eb_quotations rows' : 'DRY RUN: nothing is written (pass --apply to write)')
  const wb = await loadWorkbook()
  if (!wb) throw new Error('The house workbook is not loaded (app_settings). Import it from the dashboard first.')
  const { rules } = await loadRules()

  // Idempotence: the column exists only once the migration is applied.
  let moved = new Set<string>(), column = true
  try { moved = new Set((await sb<{ legacy_gb_id: string }[]>('eb_quotations?legacy_gb_id=not.is.null&select=legacy_gb_id')).map(r => r.legacy_gb_id)) }
  catch { column = false; console.log('Column eb_quotations.legacy_gb_id is missing: 20261120_eb_quotations_legacy.sql is not applied.') }
  if (APPLY && !column) throw new Error('Apply the migration before --apply.')

  const rows = await sb<Row[]>('gb_quotations?superseded_by=is.null&select=id,company_name,effective_date,basis,census,requirement,notes,created_at,updated_at&order=created_at.asc')
  const companies = await sb<{ id: string; company_name: string | null; kind: string | null }[]>('companies?select=id,company_name,kind&limit=20000')
  const byKey = new Map<string, { id: string; company_name: string | null; kind: string | null }[]>()
  for (const c of companies) { const k = companyKey(c.company_name); if (k) byKey.set(k, [...(byKey.get(k) ?? []), c]) }
  const existing = await sbTry<{ company_id: string | null; company_name: string }[]>('eb_quotations?select=company_id,company_name', [])
  const versions = new Map<string, number>()
  for (const e of existing) { const k = e.company_id ?? `name:${e.company_name}`; versions.set(k, (versions.get(k) ?? 0) + 1) }

  console.log(`${rows.length} quotations not superseded; ${moved.size} already moved\n`)
  const summary = { priced: 0, skipped: 0, failed: 0, written: 0 }
  for (const r of rows) {
    const tag = `${r.id.slice(0, 8)} ${r.company_name ?? '(no name)'}`
    if (moved.has(r.id)) { console.log(`${tag} | already moved, skipped`); summary.skipped++; continue }
    const { input, problems } = legacyInput(r)
    if (!input) { console.log(`${tag} | NOT PRICED: ${problems.join('; ')}`); summary.failed++; continue }

    const hits = byKey.get(companyKey(input.company)) ?? []
    const company = hits.length === 1 ? hits[0] : hits.find(h => h.kind === 'client') ?? hits[0] ?? null
    if (!company) problems.push('no company on file by this name')
    else if (hits.length > 1) problems.push(`${hits.length} companies share this name; took ${company.kind ?? 'unknown kind'} ${company.id.slice(0, 8)}`)
    const threadId = threadOf(r.notes)

    const priced = priceDesign({
      wb, rules, effectiveDate: input.effectiveDate, basis: input.basis, currentInsurer: input.currentInsurer,
      categories: input.categories.map(c => ({ name: c.name, members: c.members, design: c.design, today: c.today })),
    })
    const s = snapshotFrom({
      priced, picks: pickedPlans(priced), products: priced.products, company: company?.company_name ?? input.company,
      effectiveDate: input.effectiveDate, basis: input.basis, members: input.members, categories: priced.categories.map(c => c.name),
    })
    const m = proposalModel(s)
    const unpriced = m.products.filter((_, i) => !(m.totals[i] > 0))
    if (unpriced.length) problems.push(`no premium at ${unpriced.join(', ')}`)
    const totals = m.products.map((p, i) => `${p} ${m.totals[i] > 0 ? `S$${f0(m.totals[i])}` : '—'}`).join(' · ')
    const sources = [...new Set(input.categories.map(c => c.source))].join('/')
    console.log(`${tag} | ${m.employees} employees, ${m.lives} lives | ${input.categories.length} ${input.categories.length === 1 ? 'category' : 'categories'} (today from ${sources}) | ${m.products.length - unpriced.length} of ${m.products.length} products priced | ${totals}${problems.length ? ` | problems: ${problems.join('; ')}` : ''}`)
    summary.priced++

    if (!APPLY) continue
    const { benefitRows } = await import('@/lib/gb/eb-proposal-store')
    const benefits = await benefitRows(s).catch(() => ({}))
    const vKey = company?.id ?? `name:${s.company}`
    const version = (versions.get(vKey) ?? 0) + 1
    // The thread must exist, or the foreign key refuses the row.
    const thread = threadId ? (await sbTry<{ id: string }[]>(`email_threads?id=eq.${enc(threadId)}&select=id&limit=1`, []))[0]?.id ?? null : null
    await sb('eb_quotations', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
      company_id: company?.id ?? null, company_name: s.company, thread_id: thread, effective_date: s.effectiveDate, basis: s.basis,
      products: s.products, snapshot: { ...s, benefits }, version, created_by: ACTOR, legacy_gb_id: r.id,
      created_at: r.created_at, updated_at: r.updated_at ?? r.created_at,
    }) })
    versions.set(vKey, version)
    summary.written++
  }
  console.log(`\npriced ${summary.priced} · not priced ${summary.failed} · already moved ${summary.skipped}${APPLY ? ` · written ${summary.written}` : ' · written 0 (dry run)'}`)
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
