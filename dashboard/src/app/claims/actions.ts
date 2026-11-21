'use server'
/**
 * Claims (21 Nov 2026): the register, one claim, opening a claim, closing it with its outcome and
 * asking the claims agent to read it again. They replace /api/claims/register and /api/claims/[id].
 */
import { staffAction } from '@/lib/auth/action'
import { db, one } from '@/lib/db/client'
import { listClaims, claimDetail } from '@/lib/admin/b/register'
import { enqueue } from '@/lib/agent-tasks/queue'
import { todaySGT } from '@/lib/sgt-time'

const UUID = /^[0-9a-f-]{36}$/i
const OUTCOMES = new Set(['settled', 'declined', 'withdrawn'])

export async function claimsRegister() {
  return staffAction('claims', async () => listClaims(todaySGT()))
}

export async function claim(id: string) {
  return staffAction('claim', async () => {
    const d = await claimDetail(id, todaySGT())
    if (!d) throw new Error('No such claim.')
    return d
  })
}

/** Opens a claim by hand: its case on the work queue, the claim row and the first event. */
export async function openClaim(b: { title?: string; company_id?: string | null; insurer_name?: string | null; policy_number?: string | null }) {
  return staffAction('open claim', async user => {
    const title = typeof b.title === 'string' ? b.title.trim().slice(0, 140) : ''
    if (title.length < 3) throw new Error('A claim needs a title.')
    const companyId = typeof b.company_id === 'string' && UUID.test(b.company_id) ? b.company_id : null
    const str = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null
    const item = await one<{ id: string }>('Open claim', db().from('work_items').insert({
      company_id: companyId, case_type: 'claim', title, status: 'trs_to_act', source: 'staff', owner_email: user.email,
      insurer_name: str(b.insurer_name), policy_number: str(b.policy_number), next_action: 'Notify the insurer',
    } as never).select('id').single())
    if (!item) throw new Error('The claim was not opened.')
    const c = await db().from('claims').insert({ work_item_id: item.id, company_id: companyId, insurer_name: str(b.insurer_name), policy_number: str(b.policy_number), opened_mode: 'manual' } as never)
    if (c.error) throw new Error(c.error.message)
    const ev = await db().from('work_item_events').insert({ work_item_id: item.id, kind: 'note', actor: user.email, detail: { opened: 'manual' } } as never)
    if (ev.error) throw new Error(ev.error.message)
    return { id: item.id }
  })
}

/** refresh: the claims agent reads the case again · outcome: closes it settled, declined or withdrawn. */
export async function claimAction(id: string, b: { action?: string; stage?: string; amount_settled?: number | string | null }) {
  return staffAction('claim action', async user => {
    if (b.action === 'refresh') {
      await enqueue({ agent: 'claims', kind: 'case_update', work_item_id: id, idem_key: `claims:case_update:${id}:staff:${Date.now()}`, created_by_agent: 'staff' })
      return { ok: true as const }
    }
    if (b.action !== 'outcome' || !OUTCOMES.has(String(b.stage))) throw new Error('Choose settled, declined or withdrawn.')
    const amount = b.amount_settled == null || b.amount_settled === '' ? null : Number(b.amount_settled)
    if (amount !== null && !(Number.isFinite(amount) && amount >= 0)) throw new Error('The settled amount must be a number.')
    const now = new Date().toISOString()
    const c = await db().from('claims').upsert({ work_item_id: id, stage: String(b.stage), ...(amount !== null ? { amount_settled: amount } : {}), waiting_on: null, gaps: [], closed_at: now, updated_at: now } as never, { onConflict: 'work_item_id' })
    if (c.error) throw new Error(c.error.message)
    const w = await db().from('work_items').update({ status: 'done', closed_at: now, closed_by: user.email, updated_at: now } as never).eq('id', id)
    if (w.error) throw new Error(w.error.message)
    const ev = await db().from('work_item_events').insert({ work_item_id: id, kind: 'closed', actor: user.email, detail: { outcome: b.stage, amount_settled: amount } } as never)
    if (ev.error) throw new Error(ev.error.message)
    return { ok: true as const }
  })
}
