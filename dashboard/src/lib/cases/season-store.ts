/**
 * The reads and the one write behind Renewal Season (season.ts). No model is called here.
 *
 *   loadSeason(today)               every policy ending in the window beside its open renewal case
 *   startRenewal(policyId, actor)   a person starts the renewal case for a policy; a second call returns the first case
 *
 * A row's documents count is the case's own checklist as its Brief works it out (the case's line,
 * a person's calls, then the files on its threads), from a lean read: file names and who sent
 * them, never a message's text.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { normCompany } from '@/lib/gb/intake'
import { looksLikeEndorsement } from '@/lib/policies/endorsement'
import { ITEM_COLS, asCall, asItem } from './brief-store'
import { BASIC_LIST, caseItems, caseLine, checklistLine, checklistState, type Call, type FileMessage } from './checklist'
import { cleanComparison, offered } from './compare'
import { CaseError, PERSON } from './sources-store'
import {
  isRenewed, keepsOwnRow, pairCases, renewalTitle, seasonMonths, seasonRows, seasonWindow,
  type SeasonCase, type SeasonCaseState, type SeasonCompare, type SeasonPolicy, type SeasonRow, type SeasonWindow,
} from './season'

type Row = Record<string, any>
const quiet = { Prefer: 'return=minimal' }
/** The date in Singapore, where every policy on the register ends. */
export const seasonToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)

const LIFECYCLES = new Set(['bound', 'live', 'renewal_due'])
const POLICY_COLS = 'id,company_id,policy_number,insurer,class_of_insurance,label,product_line,start_date,end_date,lifecycle,description,is_eb'
const CASE_COLS = 'id,company_id,client_name,title,policy_id,policy_number,deadline,stage,placement_id,owner_email,product_line'

/** One read per chunk of ids, the chunks side by side. */
async function readIn(ids: readonly string[], size: number, path: (list: string) => string): Promise<Row[]> {
  const unique = Array.from(new Set(ids))
  const chunks = Array.from({ length: Math.ceil(unique.length / size) }, (_, i) => unique.slice(i * size, (i + 1) * size))
  return (await Promise.all(chunks.map(c => sbTry<Row[]>(path(c.join(',')), [])))).flat()
}

export type SeasonView = { rows: SeasonRow[]; today: string; window: SeasonWindow; months: string[] }

export async function loadSeason(today = seasonToday()): Promise<SeasonView> {
  const window = seasonWindow(today)
  const [ending, open] = await Promise.all([
    sb<Row[]>(`policies?end_date=gte.${window.from}&end_date=lte.${window.to}&company_id=not.is.null&select=${POLICY_COLS},companies!policies_company_id_fkey(company_name,kind)&order=end_date.asc&limit=1000`),
    sb<Row[]>(`work_items?case_type=eq.renewal&closed_at=is.null&select=${CASE_COLS}&order=created_at.asc&limit=1000`),
  ])
  const names = new Map<string, string>()
  const live = ending.filter(p => !looksLikeEndorsement(p) && (!p.lifecycle || LIFECYCLES.has(p.lifecycle)) && (!p.companies?.kind || p.companies.kind === 'client'))
  for (const p of live) if (p.companies?.company_name) names.set(p.company_id, p.companies.company_name)
  // The next term on the register takes a policy off the list.
  const terms = await readIn(live.map(p => p.company_id), 40, list => `policies?company_id=in.(${list})&end_date=gt.${window.from}&select=id,company_id,class_of_insurance,start_date,end_date&limit=1000`)
  const policies = (live as SeasonPolicy[]).filter(p => !isRenewed(p, terms as SeasonPolicy[]))
  const cases = open as SeasonCase[]

  const pairs = pairCases(policies, cases)
  const paired = new Set([...pairs.values()].map(p => p.case_id))
  const listed = open.filter(c => paired.has(c.id) || keepsOwnRow(c as SeasonCase, window))
  const unnamed = listed.map(c => c.company_id as string | null).filter((id): id is string => !!id && !names.has(id))
  const [states, extra, quotations, analysed] = await Promise.all([
    caseStates(listed),
    readIn(unnamed, 80, list => `companies?id=in.(${list})&select=id,company_name`),
    sbTry<Row[]>(`gb_quotations?member_count=gt.0&created_at=gte.${enc(new Date(Date.now() - 400 * 86_400_000).toISOString())}&select=id,company_name,member_count,created_at&order=created_at.desc&limit=500`, []),
    sbTry<{ key: string }[]>('app_settings?key=like.gb_analysis:*&select=key&limit=2000', []),
  ])
  for (const c of extra) if (c.company_name) names.set(c.id, c.company_name)
  const packs = new Set(analysed.map(r => r.key.slice('gb_analysis:'.length)))

  const compare = (r: Omit<SeasonRow, 'compare'>): SeasonCompare | null => {
    if (r.group === 'employment_benefits') {
      const key = normCompany(r.company)
      // The client's latest quotation that carries a census, as Today › Coming up finds it.
      const q = key.length >= 3 ? quotations.find(x => normCompany(x.company_name) === key) : undefined
      if (q && packs.has(q.id)) return { kind: 'compare_cover', href: `/pricing-matrix/quote/${q.id}/compare` }
      return r.company_id ? { kind: 'new_quotation', href: `/eb?company=${r.company_id}` } : null
    }
    // Any other line is compared by hand on its case.
    return r.case ? { kind: 'comparison', href: `/today/${r.case.id}?section=comparison` } : null
  }
  return { rows: seasonRows({ policies, cases, names, states, compare }, today), today, window, months: seasonMonths(today) }
}

/** Threads, client wishes, required documents and options compared for each case, in a handful of reads. */
async function caseStates(cases: readonly Row[]): Promise<Map<string, SeasonCaseState>> {
  const ids = cases.map(c => c.id as string)
  const out = new Map<string, SeasonCaseState>()
  if (!ids.length) return out
  const [links, excluded, wishes, calls, items, policies, compared] = await Promise.all([
    readIn(ids, 40, list => `work_item_threads?work_item_id=in.(${list})&select=work_item_id,thread_id&limit=5000`),
    readIn(ids, 40, list => `work_item_thread_excluded?work_item_id=in.(${list})&select=work_item_id,thread_id&limit=5000`),
    readIn(ids, 40, list => `work_item_notes?work_item_id=in.(${list})&section=eq.wish&status=eq.current&select=work_item_id&limit=5000`),
    readIn(ids, 40, list => `work_item_checklist?work_item_id=in.(${list})&select=work_item_id,item_id,status,message_id,filename,found,rejected,actor,at&limit=5000`),
    sbTry<Row[]>(`line_checklist_items?select=${ITEM_COLS}&order=position.asc&limit=2000`, []),
    readIn(cases.map(c => c.policy_id as string | null).filter((id): id is string => !!id), 40, list => `policies?id=in.(${list})&select=id,product_line,class_of_insurance`),
    readIn(ids, 40, list => `work_item_comparisons?work_item_id=in.(${list})&select=work_item_id,options&limit=5000`),
  ])
  const off = new Set(excluded.map(e => `${e.work_item_id}:${e.thread_id}`))
  const threads = new Map<string, string[]>()
  for (const l of links) if (!off.has(`${l.work_item_id}:${l.thread_id}`)) threads.set(l.work_item_id, [...(threads.get(l.work_item_id) ?? []), l.thread_id])
  const wished = new Map<string, number>()
  for (const w of wishes) wished.set(w.work_item_id, (wished.get(w.work_item_id) ?? 0) + 1)
  const options = new Map(compared.map(k => [k.work_item_id as string, offered(cleanComparison(k))]))
  const called = new Map<string, Call[]>()
  for (const c of calls) called.set(c.work_item_id, [...(called.get(c.work_item_id) ?? []), asCall(c)])

  const files = await readIn([...threads.values()].flat(), 10, list => `email_attachments?thread_id=in.(${list})&select=message_id,thread_id,filename&limit=1000`)
  const named = new Map<string, string[]>()
  for (const f of files) if (f.filename) named.set(f.message_id, [...(named.get(f.message_id) ?? []), f.filename])
  const senders = await readIn([...named.keys()], 40, list => `email_messages?id=in.(${list})&deleted_at=is.null&select=id,thread_id,from_address,sent_at&limit=1000`)
  const byThread = new Map<string, FileMessage[]>()
  for (const m of senders) byThread.set(m.thread_id, [...(byThread.get(m.thread_id) ?? []), { id: m.id, thread_id: m.thread_id, from_address: m.from_address ?? null, sent_at: m.sent_at ?? null, files: named.get(m.id) }])

  const all = items.map(asItem)
  const basic = all.filter(i => i.line === BASIC_LIST)
  const policy = new Map(policies.map(p => [p.id as string, p]))
  for (const c of cases) {
    const on = threads.get(c.id) ?? []
    const wishCount = wished.get(c.id) ?? 0
    const p = c.policy_id ? policy.get(c.policy_id) : undefined
    const own = checklistLine(caseLine({ chosen: c.product_line, policyLine: p?.product_line, policyClass: p?.class_of_insurance, title: c.title })?.line)
    const state = checklistState(caseItems(basic, own ? all.filter(i => i.line === own) : []), called.get(c.id) ?? [], on.flatMap(t => byThread.get(t) ?? []), wishCount > 0)
    out.set(c.id, { threads: on.length, wishes: wishCount, documents: state.total ? { ticked: state.required_ticked, required: state.required } : null, options: options.get(c.id) ?? 0 })
  }
  return out
}

/** Starts the renewal case for a policy on the register. The case a policy already has is returned, never a second one. */
export async function startRenewal(policyId: string, actor: string): Promise<{ id: string; created: boolean }> {
  const [p] = await sb<Row[]>(`policies?id=eq.${enc(policyId)}&select=${POLICY_COLS},companies!policies_company_id_fkey(company_name)&limit=1`)
  if (!p) throw new CaseError('This policy is no longer on the register.', 404)
  if (!p.company_id) throw new CaseError('File the policy under a client first.', 400)
  const open = await sb<Row[]>(`work_items?case_type=eq.renewal&closed_at=is.null&company_id=eq.${enc(p.company_id)}&select=id,policy_id,policy_number&order=created_at.asc&limit=200`)
  const have = open.find(o => o.policy_id === p.id) ?? (p.policy_number ? open.find(o => !o.policy_id && o.policy_number === p.policy_number) : undefined)
  if (have) return { id: have.id, created: false }
  const now = new Date().toISOString()
  const [made] = await sb<Row[]>('work_items', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    company_id: p.company_id, client_name: p.companies?.company_name ?? null, case_type: 'renewal', title: renewalTitle(p as SeasonPolicy),
    status: 'trs_to_act', deadline: p.end_date, deadline_basis: 'policy end date', insurer_name: p.insurer, policy_id: p.id, policy_number: p.policy_number,
    next_action: 'Select the conversations for this renewal', owner_email: actor, source: PERSON, confidence: 'high', last_activity_at: now,
  }) })
  // Stage and start point are written apart, as the renewal sweep writes them.
  await sbTry(`work_items?id=eq.${enc(made.id)}`, null, { method: 'PATCH', headers: quiet, body: JSON.stringify({ stage: 'request', stage_at: now, start_point: 'renewal' }) })
  await sb('work_item_events', { method: 'POST', headers: quiet, body: JSON.stringify({ work_item_id: made.id, kind: 'started', actor, detail: { policy_id: p.id, note: 'Renewal started from Renewal Season' } }) })
  return { id: made.id as string, created: true }
}
