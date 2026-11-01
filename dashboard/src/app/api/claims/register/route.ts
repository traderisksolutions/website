/**
 * GET  /api/claims/register → every claim work item with its register row, newest mail first.
 * POST /api/claims/register {title, company_id?, insurer_name?, policy_number?} → opens a claim by hand.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { listClaims } from '@/lib/admin/b/register'
import { sb } from '@/lib/crm/db'
import { todaySGT } from '@/lib/sgt-time'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    return NextResponse.json({ claims: await listClaims(todaySGT()) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

const UUID = /^[0-9a-f-]{36}$/i

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const title = typeof b.title === 'string' ? b.title.trim().slice(0, 140) : ''
    if (title.length < 3) return NextResponse.json({ error: 'A claim needs a title.' }, { status: 400 })
    const companyId = typeof b.company_id === 'string' && UUID.test(b.company_id) ? b.company_id : null
    const actor = (await currentUserEmail())?.toLowerCase() ?? 'staff'
    const str = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null
    const [item] = await sb<Record<string, any>[]>('work_items', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ company_id: companyId, case_type: 'claim', title, status: 'trs_to_act', source: 'staff', owner_email: actor.includes('@') ? actor : null, insurer_name: str(b.insurer_name), policy_number: str(b.policy_number), next_action: 'Notify the insurer' }),
    })
    await sb('claims', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: item.id, company_id: companyId, insurer_name: str(b.insurer_name), policy_number: str(b.policy_number), opened_mode: 'manual' }) })
    await sb('work_item_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: item.id, kind: 'note', actor, detail: { opened: 'manual' } }) })
    return NextResponse.json({ id: item.id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
