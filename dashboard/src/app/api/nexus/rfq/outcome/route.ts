/**
 * POST /api/nexus/rfq/outcome — record the final client decision on a line (#simplified).
 *
 *   { action: 'select',     rfq_request_id, dispatch_id }  → that insurer selected; siblings not_chosen; line selected.
 *   { action: 'not_chosen', rfq_request_id }               → whole line not chosen (client didn't proceed).
 *   { action: 'reopen',     rfq_request_id }               → reset the line back to quoted.
 *
 * The final action is written to the rfq_events audit trail. No commercial terms
 * are captured here — just who was chosen.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logRfqEvent }               from '@/lib/rfq-log'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const actor = user.email ?? 'unknown'

    const { action, rfq_request_id, dispatch_id } = await req.json() as {
      action: 'select' | 'not_chosen' | 'reopen'
      rfq_request_id?: string
      dispatch_id?: string
    }
    if (!rfq_request_id) return NextResponse.json({ error: 'rfq_request_id required' }, { status: 400 })

    // case_id for the audit row.
    const rRes = await fetch(`${SB_URL}/rest/v1/rfq_requests?id=eq.${rfq_request_id}&select=case_id&limit=1`, { headers: sbH(), cache: 'no-store' })
    const caseId = rRes.ok ? (await rRes.json())[0]?.case_id ?? null : null
    const now = new Date().toISOString()

    // ── Select: one insurer chosen ─────────────────────────────────────────────
    if (action === 'select') {
      if (!dispatch_id) return NextResponse.json({ error: 'dispatch_id required to select' }, { status: 400 })

      const wRes = await fetch(`${SB_URL}/rest/v1/rfq_quotes?dispatch_id=eq.${dispatch_id}&select=id,insurer_name&limit=1`, { headers: sbH(), cache: 'no-store' })
      const winner = wRes.ok ? (await wRes.json())[0] : null

      await fetch(`${SB_URL}/rest/v1/rfq_quotes?dispatch_id=eq.${dispatch_id}`, {
        method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ status: 'selected', updated_at: now }),
      })
      await fetch(`${SB_URL}/rest/v1/rfq_quotes?rfq_request_id=eq.${rfq_request_id}&dispatch_id=neq.${dispatch_id}`, {
        method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ status: 'not_chosen', updated_at: now }),
      })
      await fetch(`${SB_URL}/rest/v1/rfq_requests?id=eq.${rfq_request_id}`, {
        method: 'PATCH', headers: sbH('return=minimal'),
        body: JSON.stringify({ status: 'selected', won_insurer: winner?.insurer_name ?? null, decided_at: now }),
      })
      void logRfqEvent({ event_type: 'selected', case_id: caseId, rfq_request_id, dispatch_id, quote_id: winner?.id, insurer_name: winner?.insurer_name, actor, summary: `Selected ${winner?.insurer_name ?? 'insurer'}` })
      return NextResponse.json({ ok: true, status: 'selected' })
    }

    // ── Not chosen: line closed with no insurer ────────────────────────────────
    if (action === 'not_chosen') {
      await fetch(`${SB_URL}/rest/v1/rfq_quotes?rfq_request_id=eq.${rfq_request_id}`, {
        method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ status: 'not_chosen', updated_at: now }),
      })
      await fetch(`${SB_URL}/rest/v1/rfq_requests?id=eq.${rfq_request_id}`, {
        method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ status: 'not_chosen', won_insurer: null, decided_at: now }),
      })
      void logRfqEvent({ event_type: 'not_chosen', case_id: caseId, rfq_request_id, actor, summary: 'Line marked not chosen' })
      return NextResponse.json({ ok: true, status: 'not_chosen' })
    }

    // ── Reopen: undo the decision ──────────────────────────────────────────────
    if (action === 'reopen') {
      await fetch(`${SB_URL}/rest/v1/rfq_quotes?rfq_request_id=eq.${rfq_request_id}`, {
        method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ status: 'received', updated_at: now }),
      })
      await fetch(`${SB_URL}/rest/v1/rfq_requests?id=eq.${rfq_request_id}`, {
        method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ status: 'quoted', won_insurer: null, decided_at: null }),
      })
      void logRfqEvent({ event_type: 'reopened', case_id: caseId, rfq_request_id, actor, summary: 'Outcome reopened' })
      return NextResponse.json({ ok: true, status: 'quoted' })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
