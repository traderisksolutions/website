/**
 * Loads the brochure benefit schedules of the five Tier A schemes into gb_benefits, replacing the
 * earlier machine extraction for those tables. Source: data/gb-brochure-benefits-2026-10.json, read
 * page by page from each insurer's brochure (29–30 Oct 2026), one row per plan per benefit, with the
 * page number kept in `notes`. Idempotent: deletes and reloads the five tables' rows.
 * Dry run by default; pass --write to change the database.
 * Run: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/gb-load-brochure-benefits.mts [--write]
 */
import { readFileSync } from 'node:fs'
import { sb } from '../src/lib/crm/db'
import { fetchAllRows } from '../src/lib/postgrest-all'
import { insurerKey, type InsurerKey } from '../src/lib/gb/ladder'
import { resolveProduct } from '../src/lib/gb/resolve'

type B = { insurer: string; coverage: string; plan: string; benefit_id: string; label: string; value: string; numeric: number | null; basis: string | null; source_page: number | null }
const rows = JSON.parse(readFileSync('data/gb-brochure-benefits-2026-10.json', 'utf8')) as B[]
const WRITE = process.argv.includes('--write')

const CANON: Record<string, string> = {
  'ghs.annual_limit': 'GHS_ANNUAL_LIMIT', 'ghs.hospital_type': 'GHS_HOSPITAL_TYPE', 'ghs.room_board': 'GHS_ROOM_BOARD', 'ghs.copay': 'GHS_CO_PAYMENT',
  'ghs.icu': 'GHS_ICU', 'ghs.inpatient': 'GHS_HOSP_MISC', 'ghs.pre_post': 'GHS_PRE_HOSP', 'ghs.emergency_op': 'GHS_EMERG_ACC_OP', 'ghs.psychiatric': 'GHS_PSYCH',
  'ghs.cancer_kidney': 'GHS_OP_CANCER', 'ghs.death': 'GHS_DEATH', 'ghs.surgical_implants': 'GHS_IMPLANTS', 'ghs.rehab': 'GHS_REHAB', 'ghs.pregnancy': 'GHS_MISCARRIAGE',
  'ghs.overseas': 'GHS_OVERSEAS', 'gmm.annual_limit': 'EMM_ANNUAL_LIMIT', 'gmm.copay': 'EMM_CO_INSURANCE',
  'gp.panel': 'GOPC_PANEL_VISIT', 'gp.nonpanel': 'GOPC_NONPANEL', 'gp.ae': 'GOPC_AE_VISIT', 'gp.tcm': 'GOPC_TCM', 'gp.copay': 'GOPC_CO_PAYMENT',
  'sp.annual_limit': 'GOSC_ANNUAL_LIMIT', 'sp.diagnostic': 'GOSC_DIAGNOSTIC', 'sp.physio': 'GOSC_PHYSIO', 'sp.copay': 'GOSC_CO_PAYMENT',
  'dental.annual_limit': 'GD_ANNUAL_LIMIT', 'dental.copay': 'GD_CO_PAYMENT', 'gtl.sum_assured': 'GTL_SUM_ASSURED',
  'pa.death': 'GPA_AD', 'pa.tpd': 'GPA_PTD', 'pa.medical': 'GPA_MEDICAL_EXP', 'ci.sum_assured': 'GCI_SUM_ASSURED', 'ci.conditions': 'GCI_CONDITIONS',
}
const num = (p: string) => /plan\s*(\d+[AB]?)/i.exec(p)?.[1] ?? null

/** Brochure (V1.2) plan name → the live table's product code and plan code. */
function target(ins: InsurerKey, coverage: string, plan: string, benefit: string): { product: RegExp; plan: string } | null {
  const n = num(plan)
  const isGmm = benefit.startsWith('gmm.')
  switch (ins) {
    case 'rcc': case 'singlife':
      return { product: new RegExp(`^${coverage.replace(/[&]/g, '\\&')}$`), plan }
    case 'income': {
      const prod: Record<string, RegExp> = { 'Hospital & Surgical': /\(GHS\)/, 'Major Medical': /\(GHS\)/, 'Outpatient GP': /\(GOPC\)/, 'Outpatient Specialist': /\(GOSC\)/, Dental: /\(GD\)/, 'Term Life': /\(GTL\)/, 'Critical Illness': /\(GCI\)/, 'Personal Accident': /\(GPA\)/ }
      return n && prod[coverage] ? { product: prod[coverage], plan: `Plan ${n}` } : null
    }
    case 'qbe': {
      if (!n) return null
      if (coverage === 'Hospital & Surgical') {
        const gov = /govt/i.test(plan), beds = /4-bed/i.test(plan) ? '4' : '1', co = /20%/.test(plan) && !gov
        return { product: /\(GHS\)/, plan: `Plan ${n} · ${gov ? 'Government' : 'Private'} ${beds}-bedded${co ? ' · 20% co-insurance' : ''}` }
      }
      if (coverage === 'Outpatient Specialist') return { product: /\(SP\)/, plan: /20%/.test(plan) ? `Plan ${n} · 20% co-insurance` : `Plan ${n}` }
      if (coverage === 'Dental') return { product: /\(GD\)/, plan: `Plan ${n} · ${/non/i.test(plan) ? 'Non-panel' : 'Panel'}` }
      if (coverage === 'Outpatient GP') return { product: /\(GP\)/, plan: `Plan ${n}` }
      if (coverage === 'Personal Accident') return { product: /\(GPA\)/, plan: `Plan ${n}` }
      return null
    }
    case 'aia': {
      if (!n) return null
      if (coverage === 'Hospital & Surgical' || isGmm) return /fw/i.test(plan) ? { product: /^GHS-FW$/, plan: `PLAN ${n}` } : { product: /^GHS\+EMM$/, plan: `PLAN ${n}` }
      if (coverage === 'Outpatient GP') return { product: /^GP$/, plan: `PLAN ${n}` }
      if (coverage === 'Outpatient Specialist') return { product: /\$5/.test(plan) ? /^GP COPAY S\$5 \+ SP$/ : /^GP COPAY S\$0 \+ SP$/, plan: `PLAN ${n}` }
      if (coverage === 'Dental') return { product: /^DENTAL$/, plan: `PLAN ${n}` }
      if (coverage === 'Personal Accident') return { product: /^GADD$/, plan: `PLAN ${n}` }
      if (coverage === 'Term Life') return { product: /^GTL$/, plan: `PLAN ${n}` }
      if (coverage === 'Critical Illness') return { product: /^GTL \+ GACI$/, plan: `PLAN ${n}` }
      return null
    }
    default: return null
  }
}

const H = { apikey: process.env.SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }
const U = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1'
const tables = await (await fetch(`${U}/gb_rate_tables?select=id,insurer_name`, { headers: H })).json() as { id: string; insurer_name: string }[]
const plans = await fetchAllRows<{ rate_table_id: string; product_code: string; plan_code: string }>(`${U}/gb_plans?select=rate_table_id,product_code,plan_code`, H)
const out: Record<string, unknown>[] = []
const unmapped: string[] = []
for (const r of rows) {
  const ins = insurerKey(r.insurer)
  const table = tables.find(t => insurerKey(t.insurer_name) === ins)
  const canon = CANON[r.benefit_id]
  if (!ins || !table || !canon) { unmapped.push(`${r.insurer} | ${r.benefit_id} (no table or canon)`); continue }
  if (r.plan === 'N/A') continue
  const tg = target(ins, r.coverage, r.plan, r.benefit_id)
  const hit = tg && plans.find(p => p.rate_table_id === table.id && tg.product.test(p.product_code) && p.plan_code === tg.plan)
  if (!hit) { unmapped.push(`${r.insurer} | ${r.coverage} | ${r.plan} | ${r.benefit_id} → ${tg?.plan ?? '?'}`); continue }
  out.push({
    rate_table_id: table.id, product_code: hit.product_code, plan_code: hit.plan_code, category: r.coverage, benefit_name: r.label,
    value_text: r.value, value_numeric: r.numeric, unit: r.basis, notes: r.source_page ? `Brochure p${r.source_page}` : 'Brochure',
    canon_codes: resolveProduct(hit.product_code).codes, canon_benefit: canon,
  })
}
const unique = new Map(out.map(o => [`${o.rate_table_id}|${o.product_code}|${o.plan_code}|${o.canon_benefit}`, o]))
console.log('brochure rows', rows.length, 'mapped', out.length, 'unique', unique.size, 'unmapped', unmapped.length)
console.log(unmapped.slice(0, 20).join('\n'))
if (WRITE) {
  const ids = [...new Set(out.map(o => o.rate_table_id as string))]
  await sb(`gb_benefits?rate_table_id=in.(${ids.join(',')})`, { method: 'DELETE' })
  const vals = [...unique.values()]
  for (let i = 0; i < vals.length; i += 400) await sb('gb_benefits', { method: 'POST', body: JSON.stringify(vals.slice(i, i + 400)), headers: { Prefer: 'return=minimal' } })
  console.log('written', vals.length, 'rows for', ids.length, 'tables')
}
