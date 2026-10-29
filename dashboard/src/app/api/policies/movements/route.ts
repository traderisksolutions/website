/**
 * GET /api/policies/movements → { batches }
 * Every member movement not yet settled or cancelled, across all clients, grouped into the batch
 * it was reported or requested in, with the step it is waiting on:
 *   to_send   reported by the client, request to the insurer not sent
 *   insurer   sent, waiting for the insurer's debit or credit note
 *   to_bill   insurer's note read, TRS note not issued
 *   billed    TRS note issued, waiting for payment
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { errorResponse } from '@/lib/placement/api'
import { sbTry } from '@/lib/crm/db'
import type { PolicyMovement, PolicyTransaction } from '@/lib/policies/types'

export const dynamic = 'force-dynamic'

export type MovementStage = 'to_send' | 'insurer' | 'to_bill' | 'billed'
export type MovementBatch = {
  key: string; stage: MovementStage; company_id: string; company_name: string; policy_id: string; policy_number: string | null; insurer: string | null
  joins: number; leaves: number; changes: number; names: string[]
  reported_at: string; sent_at: string | null; days_waiting: number; chase_count: number; draft_id: string | null
  expected: number | null; note_no: string | null; note_amount: number | null; transaction_id: string | null; bundle_id: string | null; can_raise: boolean
}

const stageOf = (m: PolicyMovement): MovementStage => (m.status === 'reported' ? 'to_send' : m.status === 'sent' ? 'insurer' : m.status === 'noted' ? 'to_bill' : 'billed')

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const ms = await sbTry<PolicyMovement[]>(`policy_movements?status=in.(reported,sent,noted,billed)&select=*&order=created_at.asc&limit=5000`, [])
    const policyIds = [...new Set(ms.map(m => m.policy_id))], companyIds = [...new Set(ms.map(m => m.company_id))], txIds = [...new Set(ms.map(m => m.transaction_id).filter(Boolean))] as string[]
    const [policies, companies, txs] = await Promise.all([
      policyIds.length ? sbTry<{ id: string; policy_number: string | null; insurer: string | null }[]>(`policies?id=in.(${policyIds.join(',')})&select=id,policy_number,insurer`, []) : [],
      companyIds.length ? sbTry<{ id: string; company_name: string }[]>(`companies?id=in.(${companyIds.join(',')})&select=id,company_name`, []) : [],
      txIds.length ? sbTry<PolicyTransaction[]>(`policy_transactions?id=in.(${txIds.join(',')})&select=*`, []) : [],
    ])
    const pol = new Map(policies.map(p => [p.id, p])), co = new Map(companies.map(c => [c.id, c.company_name])), tx = new Map(txs.map(t => [t.id, t]))
    const groups = new Map<string, PolicyMovement[]>()
    for (const m of ms) {
      const key = `${stageOf(m)}|${m.policy_id}|${m.transaction_id ?? m.sent_draft_id ?? m.reported_message_id ?? m.id}`
      groups.set(key, [...(groups.get(key) ?? []), m])
    }
    const now = Date.now()
    const batches: MovementBatch[] = [...groups.entries()].map(([key, g]) => {
      const first = g[0], t = first.transaction_id ? tx.get(first.transaction_id) : undefined
      const stage = stageOf(first)
      const since = stage === 'to_send' ? first.created_at : stage === 'insurer' ? (first.sent_at ?? first.created_at) : stage === 'to_bill' ? (first.noted_at ?? first.updated_at) : (first.billed_at ?? first.updated_at)
      const ests = g.map(m => m.estimate_amount).filter((x): x is number => x != null)
      return {
        key, stage, company_id: first.company_id, company_name: co.get(first.company_id) ?? 'Unknown company', policy_id: first.policy_id,
        policy_number: pol.get(first.policy_id)?.policy_number ?? null, insurer: pol.get(first.policy_id)?.insurer ?? null,
        joins: g.filter(m => m.kind === 'join').length, leaves: g.filter(m => m.kind === 'leave').length, changes: g.filter(m => m.kind === 'change').length,
        names: g.map(m => m.member_name), reported_at: first.created_at, sent_at: first.sent_at, days_waiting: Math.floor((now - Date.parse(since)) / 86_400_000),
        chase_count: Math.max(...g.map(m => m.chase_count ?? 0)), draft_id: first.sent_draft_id,
        expected: ests.length === g.length && ests.length ? Math.round(ests.reduce((s, x) => s + Number(x), 0) * 100) / 100 : null,
        note_no: t?.note_no ?? null, note_amount: t ? Number(t.amount) : null, transaction_id: t?.id ?? null, bundle_id: t?.bundle_id ?? null,
        can_raise: !!t && !t.debit_note_id && !t.bundle_id && !!t.source_attachment_id,
      }
    }).sort((a, b) => b.days_waiting - a.days_waiting)
    return NextResponse.json({ batches })
  } catch (e) {
    return errorResponse(e)
  }
}
