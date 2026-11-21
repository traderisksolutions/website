/**
 * After binding, read on the server for every Employment Benefits policy: billed against quoted,
 * movements followed to their notes, claims against premium (after-binding.ts). No model; no writes.
 */
import { db, rows } from '@/lib/db/client'
import { proposalModel, type Snapshot } from './eb-proposal'
import { houseProduct } from './insurer-track'
import { productOfTable } from './library'
import { billCheck, followMovements, lossRatio, type BillCheck, type Followed } from './after-binding'

export type BoundPolicy = {
  id: string; companyId: string | null; company: string; insurer: string | null; policyNumber: string | null; start: string | null; end: string | null
  bill: BillCheck; quotationId: string | null; movements: Followed[]; claims: number; settled: number; lossRatio: number | null
}

const QUOTE_WINDOW_DAYS = 45
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000
const within = (d: string | null, start: string | null, end: string | null) => !!d && (!start || d >= start) && (!end || d <= end)

export async function loadAfterBinding(): Promise<BoundPolicy[]> {
  const policies = await rows('EB policies', db().from('policies')
    .select('id,company_id,insurer,policy_number,start_date,end_date,premium,companies!policies_company_id_fkey(company_name)')
    .or('is_eb.eq.true,line_code.eq.eb').order('end_date', { ascending: false, nullsFirst: false }).limit(500)) as unknown as {
      id: string; company_id: string | null; insurer: string | null; policy_number: string | null; start_date: string | null; end_date: string | null; premium: number | string | null; companies: { company_name: string | null } | null
    }[]
  if (!policies.length) return []
  const ids = policies.map(p => p.id), companies = [...new Set(policies.map(p => p.company_id).filter((x): x is string => !!x))]
  const [notes, movements, claims, quotations] = await Promise.all([
    rows('EB debit notes', db().from('debit_notes').select('policy_id,issue_date,event_type,gross_amount').in('policy_id', ids).limit(5000)),
    // Movement lists are filed to the client more often than to a policy: matched by client and period.
    companies.length ? rows('EB movements', db().from('policy_documents').select('id,policy_id,company_id,received_at,created_at,filename').eq('doc_type', 'member_movement').neq('status', 'ignored').in('company_id', companies).limit(5000)) : Promise.resolve([]),
    rows('EB claims', db().from('claims').select('policy_id,amount_settled,loss_date,created_at').in('policy_id', ids).limit(5000)),
    companies.length ? rows('EB quotations', db().from('eb_quotations').select('id,company_id,effective_date,sent_at,snapshot').in('company_id', companies).order('created_at', { ascending: false }).limit(300)) : Promise.resolve([]),
  ])
  return policies.map(p => {
    const mine = notes.filter(n => n.policy_id === p.id)
    const premiumNotes = mine.filter(n => n.event_type === 'new_business' || n.event_type === 'renewal')
    const billed = premiumNotes.length ? premiumNotes.reduce((a, n) => a + Number(n.gross_amount ?? 0), 0) : null
    // The kept quotation for this client closest to the policy's start, preferring one sent.
    const product = productOfTable(p.insurer)
    const candidates = (quotations as { id: string; company_id: string | null; effective_date: string | null; sent_at: string | null; snapshot: unknown }[])
      .filter(q => q.company_id === p.company_id && q.effective_date && p.start_date && days(q.effective_date, p.start_date) <= QUOTE_WINDOW_DAYS)
      .sort((a, b) => Number(!!b.sent_at) - Number(!!a.sent_at) || days(a.effective_date!, p.start_date!) - days(b.effective_date!, p.start_date!))
    let quoted: number | null = null, quotationId: string | null = null
    for (const q of candidates) {
      const s = q.snapshot as Snapshot
      const i = s?.products?.findIndex(col => product && houseProduct(s, col) === product) ?? -1
      if (i >= 0) { const t = proposalModel(s).totals[i]; if (t > 0) { quoted = t; quotationId = q.id; break } }
    }
    const ownClaims = claims.filter(c => c.policy_id === p.id && within(c.loss_date ?? c.created_at, p.start_date, p.end_date))
    const settled = ownClaims.reduce((a, c) => a + Number(c.amount_settled ?? 0), 0)
    return {
      id: p.id, companyId: p.company_id, company: p.companies?.company_name ?? '–', insurer: p.insurer, policyNumber: p.policy_number, start: p.start_date, end: p.end_date,
      bill: billCheck(billed, quoted, p.premium == null ? null : Number(p.premium)), quotationId,
      movements: followMovements((movements as { id: string; policy_id: string | null; company_id: string | null; received_at: string | null; created_at: string; filename: string }[])
        .filter(m => m.policy_id === p.id || (!m.policy_id && m.company_id === p.company_id && within((m.received_at ?? m.created_at).slice(0, 10), p.start_date, p.end_date))).map(m => ({ id: m.id, date: (m.received_at ?? m.created_at).slice(0, 10), filename: m.filename })),
        mine.filter(n => n.issue_date).map(n => ({ date: n.issue_date!, kind: n.event_type ?? '', amount: n.gross_amount == null ? null : Number(n.gross_amount) }))),
      claims: ownClaims.length, settled, lossRatio: lossRatio(settled, billed),
    }
  })
}
