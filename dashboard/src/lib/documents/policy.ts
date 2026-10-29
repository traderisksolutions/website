/**
 * A document that proves cover the dashboard has no record of (a hold cover forwarded on
 * WhatsApp, a schedule from an insurer TRS placed outside the RFQ flow) becomes a policy: the
 * facts the agent read off it, confirmed by the broker in one click.
 */
import { enc, sb } from '@/lib/crm/db'
import { parseMoney } from '@/lib/placement/spec'
import { isEbProductLine } from '@/lib/placement/eb'
import type { PolicyDocument } from './store'

const LINE_WORDS: [RegExp, string][] = [
  [/goods?.?in.?transit|inland.?transit|\bgit\b/i, 'inland_transit'],
  [/marine.?cargo|cargo/i, 'marine_cargo'],
  [/stock.?throughput/i, 'stock_throughput'],
  [/work.?injury|\bwica\b|workmen/i, 'wica'],
  [/foreign.?worker.?medical|\bfwmi\b/i, 'foreign_worker_medical'],
  [/foreign.?worker.?bond|security.?bond/i, 'foreign_worker_bond'],
  [/group.?(health|hospital)|\bghs\b|\bgmhs\b/i, 'group_health'],
  [/employee.?benefit|\bgtl\b|group.?term/i, 'employee_benefits'],
  [/professional.?indemnity|\bpi\b/i, 'professional_indemnity'],
  [/directors.?(&|and)?.?officers|\bd&o\b/i, 'do'],
  [/cyber/i, 'cyber'],
  [/public.?liability|general.?liability|\bcgl\b|\bpl\b/i, 'general_liability'],
  [/contractor.?s?.?all.?risk|\bcar\b|construction/i, 'construction_car'],
  [/industrial.?all.?risk|\biar\b|fire/i, 'iar_fire'],
  [/commercial.?vehicle|motor/i, 'commercial_vehicle'],
  [/trade.?credit/i, 'trade_credit'],
  [/bond|guarantee/i, 'surety_bonds'],
  [/keyman/i, 'keyman'],
  [/business.?travel/i, 'group_travel'],
]

/** The product line a class of insurance names, or null. Pure. */
export function productLineFor(classOfInsurance: string | null | undefined): string | null {
  const c = classOfInsurance ?? ''
  for (const [re, slug] of LINE_WORDS) if (re.test(c)) return slug
  return null
}

/** Where in its life a policy is, from the document that proves it. Pure. */
export function lifecycleFor(docType: string, periodTo: string | null, today = new Date().toISOString().slice(0, 10)): string {
  if (docType === 'quotation') return 'quoting'
  if (docType === 'renewal_notice') return 'renewal_due'
  if (periodTo && periodTo < today) return 'lapsed'
  if (docType === 'cover_note') return 'bound'
  return 'live'
}

/** The policies row the document describes. Pure. */
export function policyFromDocument(d: Pick<PolicyDocument, 'company_id' | 'doc_type' | 'insurer_name' | 'policy_number' | 'period_from' | 'period_to' | 'premium_text' | 'title'>, classOfInsurance: string | null) {
  const money = parseMoney(d.premium_text)
  const line = productLineFor(classOfInsurance ?? d.title)
  const isCoverNote = d.doc_type === 'cover_note'
  return {
    company_id: d.company_id, customer_id: null,
    insurer: d.insurer_name, class_of_insurance: classOfInsurance ?? d.title ?? 'Policy', label: classOfInsurance ?? d.title ?? null,
    product_line: line, is_eb: isEbProductLine(line),
    policy_number: isCoverNote ? null : d.policy_number, cover_note_no: isCoverNote ? d.policy_number : null,
    start_date: d.period_from, end_date: d.period_to, renewal_date: d.period_to,
    premium: money?.amount ?? null, currency: money?.currency ?? 'SGD',
    lifecycle: lifecycleFor(d.doc_type, d.period_to), status: 'active', source: 'document',
  }
}

export async function createPolicy(row: ReturnType<typeof policyFromDocument>, actor: string): Promise<{ id: string }> {
  const rows = await sb<{ id: string }[]>('policies', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ ...row, bound_by: row.lifecycle === 'bound' || row.lifecycle === 'live' ? actor : null }),
  })
  if (!rows[0]?.id) throw new Error('Policy was not created')
  return { id: rows[0].id }
}

export const policyExists = async (companyId: string, number: string) =>
  (await sb<{ id: string }[]>(`policies?company_id=eq.${enc(companyId)}&or=(policy_number.eq.${enc(number)},cover_note_no.eq.${enc(number)})&select=id&limit=1`))[0]?.id ?? null
