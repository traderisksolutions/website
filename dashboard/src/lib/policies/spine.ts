/**
 * The company spine: one policies row per cover, from the first quote to the last debit note.
 * A placement line creates it (quoting), the chosen quote binds it, the policy document makes
 * it live, and the debit-note commit attaches billing to it. Server-side only (service key).
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { loadCompanyPayments } from '@/lib/crm/payments-server'
import { listInsurerCompanies, matchInsurer } from '@/lib/insurers'
import { productLineLabel } from '@/lib/product-lines'
import { sameClass } from '@/lib/policies/endorsement'
import { seedMembersFromCensus } from '@/lib/policies/members'
import * as store from '@/lib/placement/store'
import type { PlacementLine, PlacementQuote } from '@/lib/placement/types'
import type { HrDependant, HrEmployee } from '@/lib/hr/types'
import type { Member } from '@/lib/gb-quote'
import { EB_PRODUCT_LINES, type PolicyLifecycle, type PolicyRow, type PolicyView } from './types'

const now = () => new Date().toISOString()
const round2 = (n: number) => Math.round(n * 100) / 100
const REP = { Prefer: 'return=representation' }

export function isEbLine(productLine: string): boolean {
  return (EB_PRODUCT_LINES as readonly string[]).includes(productLine)
}

// ── Reads ───────────────────────────────────────────────────────────────────────────────────

async function policy(id: string): Promise<PolicyRow> {
  const rows = await sb<PolicyRow[]>(`policies?id=eq.${enc(id)}&select=*&limit=1`)
  if (!rows[0]) throw new Error('Policy not found')
  return rows[0]
}

/** Every policy of a company, keyed by company_id or, for rows the spine migration could not
 *  backfill, by the company's customer records. */
export async function listCompanyPolicies(companyId: string): Promise<PolicyView[]> {
  const customers = await sbTry<{ id: string }[]>(`customers?company_id=eq.${enc(companyId)}&select=id`, [])
  const or = customers.length
    ? `or=(company_id.eq.${enc(companyId)},customer_id.in.(${customers.map(c => c.id).join(',')}))`
    : `company_id=eq.${enc(companyId)}`
  const [rows, payments] = await Promise.all([
    sbTry<PolicyRow[]>(`policies?${or}&select=*&order=created_at.desc`, []),
    loadCompanyPayments(companyId),
  ])
  if (rows.length === 0) return []

  // Billing lives on the debit notes, which carry a policy_id. Same roll-up as GET /api/companies/[id].
  const byPolicy = new Map<string, { billed: number; commission: number; currency: string; notes: number; insurer: string | null }>()
  for (const d of payments.notes) {
    if (!d.policy_id) continue
    const cur = byPolicy.get(d.policy_id) ?? { billed: 0, commission: 0, currency: d.currency, notes: 0, insurer: null }
    cur.billed = round2(cur.billed + Number(d.net_amount ?? d.gross_amount ?? 0))
    cur.commission = round2(cur.commission + Number(d.commission ?? 0))
    cur.notes += 1
    if (!cur.insurer && d.insurer) cur.insurer = d.insurer
    byPolicy.set(d.policy_id, cur)
  }

  // Employment benefits: who is on cover now and where the client stands with the insurer.
  const ebIds = rows.filter(r => r.is_eb).map(r => r.id)
  const members = new Map<string, number>()
  const net = new Map<string, number>()
  if (ebIds.length) {
    const f = `policy_id=in.(${ebIds.join(',')})`
    const [active, weekly] = await Promise.all([
      sbTry<{ policy_id: string }[]>(`policy_members?${f}&status=eq.active&select=policy_id`, []),
      sbTry<{ policy_id: string; net_to_date: number }[]>(`policy_position_weekly?${f}&select=policy_id,net_to_date,week_start&order=week_start.desc`, []),
    ])
    for (const m of active) members.set(m.policy_id, (members.get(m.policy_id) ?? 0) + 1)
    for (const w of weekly) if (!net.has(w.policy_id)) net.set(w.policy_id, Number(w.net_to_date ?? 0))
    for (const id of ebIds) if (!members.has(id)) members.set(id, 0)
  }

  return rows.map(p => {
    const m = byPolicy.get(p.id)
    return {
      id: p.id,
      company_id: companyId,
      product_line: p.product_line ?? null,
      label: p.label ?? null,
      class_of_insurance: p.class_of_insurance ?? null,
      lifecycle: p.lifecycle ?? 'live',
      insurer: p.insurer ?? m?.insurer ?? null,
      policy_number: p.policy_number ?? null,
      start_date: p.start_date ?? null,
      end_date: p.end_date ?? null,
      renewal_date: p.renewal_date ?? null,
      currency: p.currency ?? m?.currency ?? 'SGD',
      bound_premium: p.bound_premium != null ? Number(p.bound_premium) : null,
      premium: p.premium != null ? Number(p.premium) : m?.billed ?? null,
      billed: m?.billed ?? null,
      commission: m?.commission ?? null,
      debitNoteCount: m?.notes ?? 0,
      is_eb: !!p.is_eb,
      placement_line_id: p.placement_line_id ?? null,
      chosen_quote_id: p.chosen_quote_id ?? null,
      membersActive: p.is_eb ? (members.get(p.id) ?? 0) : null,
      netToDate: p.is_eb ? (net.get(p.id) ?? null) : null,
    }
  })
}

// ── Create ──────────────────────────────────────────────────────────────────────────────────

/** A policy being quoted: no customer, no number, no insurer yet. */
export async function createQuotingPolicy(input: { company_id: string; product_line: string; label: string; placement_line_id: string }): Promise<{ id: string }> {
  const rows = await sb<{ id: string }[]>('policies', { method: 'POST', headers: REP, body: JSON.stringify({
    company_id: input.company_id, customer_id: null, product_line: input.product_line, label: input.label,
    placement_line_id: input.placement_line_id, lifecycle: 'quoting', is_eb: isEbLine(input.product_line),
    class_of_insurance: productLineLabel(input.product_line), currency: 'SGD', status: 'active', source: 'manual',
  }) })
  if (!rows[0]?.id) throw new Error('Policy was not created')
  return { id: rows[0].id }
}

// ── Bind ────────────────────────────────────────────────────────────────────────────────────

type QuoteRow = Omit<PlacementQuote, 'dispatch_id'> & { dispatch_id: string | null; source?: 'insurer' | 'rate_table'; engine_run_id?: string | null; plan_label?: string | null }
type LineRow = PlacementLine & { policy_id?: string | null; census_submission_id?: string | null }

const premiumText = (q: QuoteRow): string =>
  q.premium_text?.trim() || (q.premium_amount != null ? `${q.currency ?? 'SGD'} ${Number(q.premium_amount).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'a premium not stated')

/** The client went with one quote: the policy is bound, the line is bound, the other quotes
 *  and the open asks on the round stand down. Employment benefits also gets its member list. */
export async function choosePolicyQuote(policyId: string, quoteId: string, actor: string): Promise<void> {
  const p = await policy(policyId)
  const [q] = await sb<QuoteRow[]>(`placement_quotes?id=eq.${enc(quoteId)}&select=*&limit=1`)
  if (!q) throw new Error('Quote not found')
  const [line] = await sb<LineRow[]>(`placement_lines?id=eq.${enc(q.line_id)}&select=*&limit=1`)
  if (!line) throw new Error('Placement line not found')
  if (line.policy_id !== policyId) throw new Error('Quote does not belong to this policy')
  let companyId = p.company_id
  if (!companyId) companyId = (await sbTry<{ company_id: string }[]>(`placements?id=eq.${line.placement_id}&select=company_id&limit=1`, []))[0]?.company_id ?? null
  if (!companyId) throw new Error('Policy has no company')

  // Which insurer company: the dispatch knows; an engine quote is matched by name.
  let insurerCompanyId: string | null = null
  if (q.dispatch_id) {
    const [d] = await sbTry<{ insurer_company_id: string | null }[]>(`placement_dispatches?id=eq.${q.dispatch_id}&select=insurer_company_id&limit=1`, [])
    insurerCompanyId = d?.insurer_company_id ?? null
  }
  if (!insurerCompanyId) insurerCompanyId = matchInsurer(q.insurer_name, await listInsurerCompanies())?.id ?? null

  const at = now()
  await store.patchNoTs('policies', `id=eq.${policyId}`, {
    chosen_quote_id: q.id, chosen_insurer_company_id: insurerCompanyId, insurer: q.insurer_name,
    bound_premium: q.premium_amount ?? null, currency: q.currency ?? 'SGD', lifecycle: 'bound', bound_at: at, bound_by: actor,
    company_id: companyId, updated_at: at,
  })
  await store.patchNoTs('placement_quotes', `id=eq.${q.id}`, { status: 'selected' })
  await store.patchNoTs('placement_quotes', `line_id=eq.${q.line_id}&id=neq.${q.id}&status=neq.superseded`, { status: 'not_chosen' })
  await store.patch('placement_lines', `id=eq.${line.id}`, { status: 'bound', next_step: `Bound with ${q.insurer_name} — await the policy document and the debit note` })
  if (line.current_round_id) {
    await store.patch('placement_dispatches', `round_id=eq.${line.current_round_id}&status=in.(drafted,sent,acknowledged,info_requested)`, { status: 'withdrawn' })
  }
  const siblings = await sbTry<{ status: string }[]>(`placement_lines?placement_id=eq.${line.placement_id}&select=status`, [])
  if (siblings.length && siblings.every(s => s.status === 'bound' || s.status === 'declined' || s.status === 'closed')) {
    await store.patchNoTs('placements', `id=eq.${line.placement_id}`, { status: 'bound', updated_at: at })
  }
  const label = p.label ?? line.label ?? productLineLabel(line.product_line)
  await store.log({ company_id: companyId, placement_id: line.placement_id, line_id: line.id, round_id: q.round_id, dispatch_id: q.dispatch_id ?? null, kind: 'decision', actor,
    text: `${label} placed with ${q.insurer_name} at ${premiumText(q)}`, thread_id: q.thread_id ?? null,
    detail: { policy_id: policyId, quote_id: q.id, insurer_company_id: insurerCompanyId, premium_amount: q.premium_amount ?? null } })

  if (p.is_eb) {
    try {
      const census = await censusForLine(line, q)
      const n = census.length ? await seedMembersFromCensus(policyId, companyId, census) : 0
      if (n > 0) await store.log({ company_id: companyId, placement_id: line.placement_id, line_id: line.id, kind: 'info', actor: 'system', text: `${n} members listed on ${label} from the employee list`, detail: { policy_id: policyId } })
    } catch (err) {
      console.error('[spine] member seed failed', err instanceof Error ? err.message : err)
      await store.log({ company_id: companyId, placement_id: line.placement_id, line_id: line.id, kind: 'info', actor: 'system', text: `Employee list could not be copied onto ${label} — add the members by hand`, detail: { policy_id: policyId } })
    }
  }
}

type CensusIn = { name: string; relationship: string; dob?: string | null; category?: string | null; employee_ref?: string | null }

/** The employee list the quote was priced on: the HR submission first, else the engine run's census. */
async function censusForLine(line: LineRow, q: QuoteRow): Promise<CensusIn[]> {
  if (line.census_submission_id) {
    const [s] = await sbTry<{ employees: HrEmployee[] | null; dependants: HrDependant[] | null }[]>(`hr_submissions?id=eq.${line.census_submission_id}&select=employees,dependants&limit=1`, [])
    if (s) {
      const out: CensusIn[] = []
      for (const e of s.employees ?? []) {
        if (e.status === 'inactive') continue
        out.push({ name: e.name, relationship: 'employee', dob: e.dob ?? null, category: e.category ?? null, employee_ref: e.key })
        for (const d of (s.dependants ?? []).filter(d => d.employeeKey === e.key)) {
          out.push({ name: d.name, relationship: d.relationship, dob: d.dob ?? null, category: e.category ?? null, employee_ref: e.key })
        }
      }
      if (out.length) return out
    }
  }
  if (q.engine_run_id) {
    const [run] = await sbTry<{ census: Member[] | null }[]>(`gb_quotations?id=eq.${q.engine_run_id}&select=census&limit=1`, [])
    let ref: string | null = null
    return (run?.census ?? []).map((m, i) => {
      const rel = m.relationship === 'self' || !m.relationship ? 'employee' : m.relationship
      if (rel === 'employee') ref = `m${i}`
      return { name: m.name, relationship: rel, dob: m.dob ?? null, category: m.category ?? null, employee_ref: ref }
    })
  }
  return []
}

// ── Live, lifecycle ─────────────────────────────────────────────────────────────────────────

/** The policy document has arrived: number and term on the row, lifecycle live. */
export async function markPolicyLive(policyId: string, input: { policy_number: string | null; start_date: string | null; end_date: string | null; insurer?: string | null }, actor: string): Promise<void> {
  const p = await policy(policyId)
  const patch: Record<string, unknown> = { lifecycle: 'live', status: 'active', updated_at: now() }
  if (input.policy_number?.trim()) patch.policy_number = input.policy_number.trim()
  if (input.start_date) patch.start_date = input.start_date
  if (input.end_date) patch.end_date = input.end_date
  if (input.insurer?.trim()) patch.insurer = input.insurer.trim()
  await store.patchNoTs('policies', `id=eq.${policyId}`, patch)
  if (p.company_id) {
    const term = [patch.start_date ?? p.start_date, patch.end_date ?? p.end_date].filter(Boolean).join(' – ')
    const number = (patch.policy_number ?? p.policy_number) as string | null
    await store.log({ company_id: p.company_id, line_id: p.placement_line_id, kind: 'decision', actor,
      text: `${p.label ?? p.class_of_insurance ?? 'Policy'} live${number ? `: policy ${number}` : ''}${term ? `, ${term}` : ''}`, detail: { policy_id: policyId } })
  }
}

/** A lifecycle set by hand. Declined and closed also close the placement line. */
export async function setLifecycle(policyId: string, lifecycle: PolicyLifecycle, actor: string): Promise<void> {
  const p = await policy(policyId)
  if (p.lifecycle === lifecycle) return
  await store.patchNoTs('policies', `id=eq.${policyId}`, { lifecycle, updated_at: now() })
  if ((lifecycle === 'declined' || lifecycle === 'closed') && p.placement_line_id) {
    await store.patch('placement_lines', `id=eq.${p.placement_line_id}`, { status: lifecycle, next_step: null })
  }
  if (p.company_id) {
    await store.log({ company_id: p.company_id, line_id: p.placement_line_id, kind: 'decision', actor,
      text: `${p.label ?? p.class_of_insurance ?? 'Policy'} marked ${lifecycle.replace('_', ' ')} (was ${p.lifecycle.replace('_', ' ')})`, detail: { policy_id: policyId, from: p.lifecycle, to: lifecycle } })
  }
}

// ── Debit note → bound policy ───────────────────────────────────────────────────────────────

export type BoundPolicyLike = { id: string; label: string | null; class_of_insurance: string | null; product_line: string | null }

/**
 * Pure. Which bound policy a debit note bills, among a company's bound policies ordered newest
 * bind first: the first whose label, class or product line reads as the note's class; when
 * nothing matches and the company has exactly one bound policy, that one; otherwise none.
 */
export function pickBoundPolicy(bound: BoundPolicyLike[], classOfInsurance: string | null): string | null {
  if (bound.length === 0) return null
  const cls = classOfInsurance?.trim() || null
  if (cls) {
    const hit = bound.find(p =>
      sameClass(p.label, cls) || sameClass(p.class_of_insurance, cls) || (p.product_line ? sameClass(productLineLabel(p.product_line), cls) : false))
    if (hit) return hit.id
  }
  return bound.length === 1 ? bound[0].id : null
}
