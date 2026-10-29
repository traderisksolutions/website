/**
 * PATCH /api/thread-insurers/[id] { policy_id: uuid } | { not_a_policy: true } → the row, confirmed.
 * A broker tags the thread to its policy (or says it is about none); the sweep never overwrites it.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { enc, sb, sbTry } from '@/lib/crm/db'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Row id is not valid')
  const b = await readBody<{ policy_id?: unknown; not_a_policy?: unknown }>(req)
  if (!b) return fail('Send policy_id or not_a_policy')
  try {
    const [row] = await sbTry<{ id: string; client_company_id: string | null }[]>(`thread_insurers?id=eq.${enc(id)}&select=id,client_company_id&limit=1`, [])
    if (!row) return fail('Row not found', 404)
    let patch: Record<string, unknown>
    if (b.not_a_policy === true) patch = { policy_id: null, policy_status: 'not_a_policy', policy_how: 'broker', reason: `Marked by ${actor}` }
    else {
      if (!isUuid(b.policy_id)) return fail('Policy id is not valid')
      const [p] = await sbTry<{ company_id: string | null }[]>(`policies?id=eq.${enc(b.policy_id as string)}&select=company_id&limit=1`, [])
      if (!p) return fail('Policy not found', 404)
      if (row.client_company_id && p.company_id !== row.client_company_id) return fail("That policy belongs to another company", 409)
      patch = { policy_id: b.policy_id, policy_status: 'confirmed', policy_how: 'broker', reason: `Confirmed by ${actor}` }
    }
    const out = await sb<unknown[]>(`thread_insurers?id=eq.${enc(id)}&select=*`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    })
    return NextResponse.json({ row: out[0] ?? null })
  } catch (e) {
    return errorResponse(e)
  }
}
