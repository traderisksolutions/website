/**
 * Scenarios A, B, C for a client thread, end to end: find the census (the quotation this thread
 * or this company already has; else price the census file on the thread first), read the thread
 * once for the brief, build the three requirements, price each at every insurer, flag, save.
 *
 * The pack is kept in app_settings under gb_scenarios:<quotationId>, like a thread's read plan.
 * Pricing is priceBuilder (src/lib/gb/builder.ts): the same arithmetic as the plan builder.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { recordHousekeeping } from '../agent-activity'
import { priceBuilder } from './builder'
import { readThreadBrief } from './brief'
import { runGroupBenefitIntake, normCompany } from './intake'
import { cardsInForce } from './table-version'
import { flagInsurers, headline, isEbSubject, scenariosFor, type Brief, type Scenario, type ScenarioInsurer } from './scenarios'
import type { Member } from '../gb-quote'
import type { Requirement } from './ladder'

type Row = Record<string, any>

export type ScenarioPack = {
  at: string
  by: string | null
  threadId: string | null
  /** Every thread the brief read: this one and the company's related benefits threads. */
  threadIds?: string[]
  quotationId: string
  model: string
  messages: number
  brief: Brief
  effectiveDate: string
  basis: 'new_business' | 'renewal'
  employees: number
  dependants: number
  scenarios: (Scenario & { insurers: ScenarioInsurer[] })[]
  notes: string[]
}

const KEY = (quotationId: string) => `gb_scenarios:${quotationId}`

export async function loadScenarios(quotationId: string): Promise<ScenarioPack | null> {
  const [r] = await sbTry<Row[]>(`app_settings?key=eq.${enc(KEY(quotationId))}&select=value&limit=1`, [])
  if (!r?.value) return null
  try { return JSON.parse(r.value) as ScenarioPack } catch { return null }
}

async function saveScenarios(pack: ScenarioPack): Promise<void> {
  await sb('app_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ key: KEY(pack.quotationId), value: JSON.stringify(pack), updated_at: new Date().toISOString() }) })
}

type Quotation = { id: string; company_name: string | null; census: Member[]; effective_date: string | null; basis: string | null; member_count: number; requirement: Row | null; notes: string | null }
const Q_COLS = 'id,company_name,census,effective_date,basis,member_count,requirement,notes'

/** The quotation whose notes carry this thread's tag, newest and not superseded, with members. */
export async function quotationForThread(threadId: string): Promise<Quotation | null> {
  const rows = await sbTry<Quotation[]>(`gb_quotations?notes=like.${enc(`*[thread:${threadId}]*`)}&superseded_by=is.null&select=${Q_COLS}&order=created_at.desc&limit=5`, [])
  return rows.find(q => (q.member_count ?? 0) > 0) ?? null
}

/**
 * The client's benefits conversation: this thread plus the company's other benefits threads of the
 * last 90 days (classed group_benefits, or a subject that reads as one), newest first, at most six.
 * A renewal is often three threads: the request, the census, the claims history.
 */
export async function benefitsThreads(threadId: string): Promise<{ ids: string[]; companyId: string | null; inConversation: boolean }> {
  const [t] = await sbTry<Row[]>(`email_threads?id=eq.${enc(threadId)}&select=id,company_id,category,subject&limit=1`, [])
  if (!t?.company_id) return { ids: [threadId], companyId: null, inConversation: t?.category === 'group_benefits' }
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const rows = await sbTry<Row[]>(`email_threads?company_id=eq.${enc(t.company_id)}&deleted_at=is.null&last_message_at=gte.${enc(since)}&select=id,category,subject,last_message_at&order=last_message_at.desc&limit=40`, [])
  const gb = rows.filter(r => r.category === 'group_benefits')
  const related = rows.filter(r => r.id !== threadId && (r.category === 'group_benefits' || (isEbSubject(r.subject) && !['claim', 'rfq'].includes(r.category ?? '')))).slice(0, 5)
  // A client with an employee-benefits policy on file is in a benefits conversation whenever the
  // subject reads as one, even before any thread was classed group_benefits (Empyrion, 11 Nov 2026).
  const ebPolicy = gb.length === 0 && isEbSubject(t.subject)
    ? (await sbTry<Row[]>(`policies?company_id=eq.${enc(t.company_id)}&status=eq.active&select=id,class_of_insurance&limit=50`, [])).some(p => /benefit|medical|hospital|\bghs\b|\bgtl\b|dental|\beb\b/i.test(String(p.class_of_insurance ?? '')))
    : false
  const inConversation = t.category === 'group_benefits' || ((gb.length > 0 || ebPolicy) && isEbSubject(t.subject) && !['claim', 'rfq'].includes(t.category ?? ''))
  return { ids: [threadId, ...related.map(r => r.id)], companyId: t.company_id, inConversation }
}

/** The company's newest quotation with members, in the last 180 days. The open
 *  request itself may hold no census (a request email with no file): the census is on the one
 *  priced from a file or an earlier email. */
async function latestPricedFor(companyName: string): Promise<Quotation | null> {
  const key = normCompany(companyName)
  if (key.length < 3) return null
  const since = new Date(Date.now() - 180 * 86_400_000).toISOString()
  // A request email with no file supersedes the earlier priced quotation on the register; the census
  // still lives on the superseded row, so the filter is members, not supersession.
  const rows = await sbTry<Quotation[]>(`gb_quotations?member_count=gt.0&created_at=gte.${since}&select=${Q_COLS}&order=created_at.desc&limit=300`, [])
  return rows.find(r => normCompany(r.company_name) === key) ?? null
}

/** A thread's tag on a quotation, from its notes; null for a quotation priced from a file. */
export const threadOfQuotation = (notes: string | null | undefined): string | null => notes?.match(/\[thread:([0-9a-f-]{36})\]/i)?.[1] ?? null

async function censusFor(threadId: string, threadIds: string[]): Promise<{ quotation: Quotation; how: string } | { error: string }> {
  for (const id of threadIds) {
    const own = await quotationForThread(id)
    if (own) return { quotation: own, how: id === threadId ? 'the quotation on this thread' : 'the quotation on a related thread' }
  }
  const [thread] = await sbTry<Row[]>(`email_threads?id=eq.${enc(threadId)}&select=id,company_id,companies(company_name)&limit=1`, [])
  const companyName = thread?.companies?.company_name as string | undefined
  if (companyName) {
    const q = await latestPricedFor(companyName)
    if (q) return { quotation: q, how: `the company's latest priced quotation (${q.member_count} members, ${q.effective_date ?? 'undated'})` }
  }
  // No priced census yet: the census file on this thread, if there is one, goes through the agent.
  const r = await runGroupBenefitIntake(threadId, null).catch(e => ({ status: 'failed' as const, reason: e instanceof Error ? e.message : String(e) }))
  if (r.status === 'drafted' || r.status === 'joined' || r.status === 'skipped') {
    const id = 'quotationId' in r ? r.quotationId : null
    if (id) {
      const [q] = await sbTry<Quotation[]>(`gb_quotations?id=eq.${id}&select=${Q_COLS}&limit=1`, [])
      if (q && q.member_count > 0) return { quotation: q, how: 'the census file on this thread, priced first' }
    }
  }
  return { error: 'No member list on this thread or on the company’s open request. Ask HR for the census, then price scenarios.' }
}

/**
 * Run for a thread. `quotationId` pins the quotation to write onto (the quotation page's button);
 * without it the thread's own quotation, the company's open request, or the thread's census file.
 */
export async function runScenarios(threadId: string, by: string | null, quotationId?: string | null): Promise<{ ok: true; pack: ScenarioPack; how: string } | { ok: false; error: string }> {
  const conversation = await benefitsThreads(threadId)
  let quotation: Quotation | null = null, how = ''
  if (quotationId) {
    const [q] = await sbTry<Quotation[]>(`gb_quotations?id=eq.${enc(quotationId)}&select=${Q_COLS}&limit=1`, [])
    if (!q) return { ok: false, error: 'Quotation not found.' }
    if (!(q.member_count > 0)) return { ok: false, error: 'This quotation has no member list yet.' }
    quotation = q; how = 'this quotation'
  } else {
    const found = await censusFor(threadId, conversation.ids)
    if ('error' in found) return { ok: false, error: found.error }
    quotation = found.quotation; how = found.how
  }
  const members = (quotation.census ?? []).map(m => ({ ...m, category: 'All employees', occupation_class: m.occupation_class ?? '1' }))
  const employees = members.filter(m => !/spouse|child|dependa/i.test(m.relationship)).length
  const { brief, model, messages } = await readThreadBrief(conversation.ids, employees, by)
  // What the thread does not say about the current plan, the quotation's saved requirement does
  // (the broker's or the intake agent's plan choice); the defaults fill the rest.
  if (!brief.currentInsurer && typeof quotation.requirement?.current_insurer === 'string') brief.currentInsurer = quotation.requirement.current_insurer
  const saved = (quotation.requirement?.categories as { requirement?: Partial<Requirement> }[] | undefined)?.[0]?.requirement
  if (saved) for (const k of Object.keys(saved) as (keyof Requirement)[]) if (brief.current[k] === undefined && saved[k] !== undefined) (brief.current as Record<string, unknown>)[k] = saved[k]
  const basis = brief.basis ?? (quotation.basis === 'renewal' ? 'renewal' : 'new_business')
  const effectiveDate = brief.effectiveDate ?? brief.renewalDate ?? quotation.effective_date ?? new Date().toISOString().slice(0, 10)
  const scenarios = scenariosFor(brief)

  // The card in force per insurer on this date and basis; the others are shown folded.
  const cards = await sbTry<Row[]>('gb_rate_tables?status=eq.approved&select=id,insurer_id,insurer_name,effective_date,renewal_effective_date', [])
  const { cards: inForce, notes } = cardsInForce(cards as { id: string; insurer_id: string | null; insurer_name: string | null; effective_date: string | null; renewal_effective_date?: string | null }[], effectiveDate, basis)
  const inForceIds = new Set(inForce.map(c => c.id))

  const priced: ScenarioPack['scenarios'] = []
  let dependants = 0
  for (const s of scenarios) {
    const r = await priceBuilder({ members, categories: [{ name: 'All employees', requirement: s.requirement, overrides: {} }], effective_date: effectiveDate, basis, tier_b: brief.preferInsurers.some(n => /cigna/i.test(n)) })
    dependants = r.dependants
    priced.push({ ...s, insurers: flagInsurers(r.insurers, brief, inForceIds) })
  }
  const pack: ScenarioPack = { at: new Date().toISOString(), by, threadId, threadIds: conversation.ids, quotationId: quotation.id, model, messages, brief, effectiveDate, basis, employees, dependants, scenarios: priced, notes }
  await saveScenarios(pack)
  // The budget the thread states goes onto the quotation when the builder has none.
  if (brief.budget && !quotation.requirement?.budget) {
    await sb(`gb_quotations?id=eq.${enc(quotation.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ requirement: { ...(quotation.requirement ?? {}), budget: brief.budget, budget_text: brief.budgetText } }) }).catch(() => null)
  }
  const money = (n: number) => `S$${Math.round(n).toLocaleString('en-SG')}`
  const line = priced.map(s => { const h = headline(s.insurers); return `${s.key} ${h ? `${money(h.total)} ${h.insurer_name.split(' ')[0]}` : 'none complete'}` }).join(' · ')
  recordHousekeeping({ action: 'gb.scenarios_priced', subject: quotation.company_name ?? brief.company ?? 'Group benefits', resourceType: 'gb_quotation', resourceId: quotation.id, basis: `${line}; census from ${how}; ${messages} messages read`, metadata: { thread_id: threadId, by } })
  return { ok: true, pack, how }
}

export const packSummary = (pack: ScenarioPack): string => {
  const money = (n: number) => `S$${Math.round(n).toLocaleString('en-SG')}`
  return pack.scenarios.map(s => { const h = headline(s.insurers); return `${s.name} ${h ? money(h.total) : '—'}` }).join(' · ')
}
