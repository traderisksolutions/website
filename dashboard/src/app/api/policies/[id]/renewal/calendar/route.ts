/**
 * GET /api/policies/[id]/renewal/calendar → the renewal calendar of a COMPANY: here [id] is the
 * company id. Every policy of the company and its group in expiry order, with the pack's headline
 * figures and the state of its renewal report draft (none, drafted, sent).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { sbTry, enc } from '@/lib/crm/db'
import { getCompanyRenewals, type CompanyRenewalRow } from '@/lib/policies/ledger'
import { RENEWAL_ADVICE } from '@/lib/policies/ledger/report-model'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f-]{36}$/i

export type ReportState = 'sent' | 'pending' | null
export type CalendarRow = CompanyRenewalRow & { report: ReportState; days_to_expiry: number | null }

/** For each policy: the state of its latest renewal report draft, if any. */
async function reportStates(policyIds: string[]): Promise<Map<string, ReportState>> {
  const out = new Map<string, ReportState>()
  if (!policyIds.length) return out
  const items = await sbTry<{ id: string; policy_id: string }[]>(`work_items?policy_id=in.(${policyIds.map(enc).join(',')})&case_type=eq.renewal&select=id,policy_id`, [])
  if (!items.length) return out
  const drafts = await sbTry<{ work_item_id: string; status: string; created_at: string }[]>(`ai_drafts?work_item_id=in.(${items.map(i => i.id).join(',')})&email_type=eq.${RENEWAL_ADVICE}&select=work_item_id,status,created_at&order=created_at.desc`, [])
  const byItem = new Map(items.map(i => [i.id, i.policy_id]))
  for (const d of drafts) {
    const pid = byItem.get(d.work_item_id)
    if (!pid || out.has(pid)) continue
    out.set(pid, d.status === 'sent' ? 'sent' : ['pending', 'draft'].includes(d.status) ? 'pending' : null)
  }
  return out
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Company id is not valid' }, { status: 400 })
  try {
    const today = new Date().toISOString().slice(0, 10)
    const rows = (await getCompanyRenewals(id, today)).filter(r => r.policy.end_date).sort((a, b) => String(a.policy.end_date).localeCompare(String(b.policy.end_date)))
    const states = await reportStates(rows.map(r => r.policy.id))
    const out: CalendarRow[] = rows.map(r => ({ ...r, report: states.get(r.policy.id) ?? null, days_to_expiry: r.policy.end_date ? Math.round((Date.parse(r.policy.end_date) - Date.parse(today)) / 86_400_000) : null }))
    return NextResponse.json({ rows: out, today })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
