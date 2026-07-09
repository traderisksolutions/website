/**
 * POST /api/nexus/rfq/outcome — record the outcome of a line of insurance (#4b).
 *
 *   { action: 'bind',   rfq_request_id, dispatch_id, bound_premium?, effective_date?, policy_number? }
 *       → winning quote won (+ commercial terms); sibling quotes lost; line = won.
 *   { action: 'lost',   rfq_request_id, outcome_reason? }
 *       → every quote on the line lost; line = lost.
 *   { action: 'reopen', rfq_request_id }
 *       → reset the line to 'quoted' and its quotes to 'received' (manual correction).
 *
 * Nexus never sends. Binding does NOT auto-close the case (manual close).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'

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

    const body = await req.json() as {
      action: 'bind' | 'lost' | 'reopen'
      rfq_request_id?: string
      dispatch_id?:    string
      bound_premium?:  string
      effective_date?: string
      policy_number?:  string
      outcome_reason?: string
    }
    const { action, rfq_request_id } = body
    if (!rfq_request_id) return NextResponse.json({ error: 'rfq_request_id required' }, { status: 400 })

    const now = new Date().toISOString()

    // ── Bind: one insurer wins the line ────────────────────────────────────────
    if (action === 'bind') {
      if (!body.dispatch_id) return NextResponse.json({ error: 'dispatch_id required to bind' }, { status: 400 })

      // Winner insurer name (for the request snapshot).
      const wRes = await fetch(`${SB_URL}/rest/v1/rfq_quotes?dispatch_id=eq.${body.dispatch_id}&select=insurer_name&limit=1`, { headers: sbH(), cache: 'no-store' })
      const winnerInsurer = wRes.ok ? (await wRes.json())[0]?.insurer_name ?? null : null

      const bind = {
        status:         'won',
        bound_premium:  body.bound_premium  ?? null,
        effective_date: body.effective_date ?? null,
        policy_number:  body.policy_number  ?? null,
        bound_at:       now,
        outcome_reason: null,
        updated_at:     now,
      }
      // Winner → won.
      await fetch(`${SB_URL}/rest/v1/rfq_quotes?dispatch_id=eq.${body.dispatch_id}`, {
        method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify(bind),
      })
      // Siblings on the same line → lost.
      await fetch(`${SB_URL}/rest/v1/rfq_quotes?rfq_request_id=eq.${rfq_request_id}&dispatch_id=neq.${body.dispatch_id}`, {
        method: 'PATCH', headers: sbH('return=minimal'),
        body: JSON.stringify({ status: 'lost', outcome_reason: 'Another insurer bound', updated_at: now }),
      })
      // Line → won (+ commercial snapshot).
      await fetch(`${SB_URL}/rest/v1/rfq_requests?id=eq.${rfq_request_id}`, {
        method: 'PATCH', headers: sbH('return=minimal'),
        body: JSON.stringify({
          status: 'won', won_dispatch_id: body.dispatch_id, won_insurer: winnerInsurer,
          bound_premium: body.bound_premium ?? null, effective_date: body.effective_date ?? null,
          policy_number: body.policy_number ?? null, outcome_reason: null, decided_at: now,
        }),
      })
      void logActivity({ action: 'rfq.bind', resource_type: 'rfq_request', resource_id: rfq_request_id, new_value: { dispatch_id: body.dispatch_id, insurer: winnerInsurer, premium: body.bound_premium } })
      return NextResponse.json({ ok: true, status: 'won' })
    }

    // ── Lost: the whole line is lost ───────────────────────────────────────────
    if (action === 'lost') {
      await fetch(`${SB_URL}/rest/v1/rfq_quotes?rfq_request_id=eq.${rfq_request_id}`, {
        method: 'PATCH', headers: sbH('return=minimal'),
        body: JSON.stringify({ status: 'lost', outcome_reason: body.outcome_reason ?? null, updated_at: now }),
      })
      await fetch(`${SB_URL}/rest/v1/rfq_requests?id=eq.${rfq_request_id}`, {
        method: 'PATCH', headers: sbH('return=minimal'),
        body: JSON.stringify({ status: 'lost', outcome_reason: body.outcome_reason ?? null, decided_at: now }),
      })
      void logActivity({ action: 'rfq.lost', resource_type: 'rfq_request', resource_id: rfq_request_id, new_value: { reason: body.outcome_reason } })
      return NextResponse.json({ ok: true, status: 'lost' })
    }

    // ── Reopen: undo an outcome ────────────────────────────────────────────────
    if (action === 'reopen') {
      await fetch(`${SB_URL}/rest/v1/rfq_quotes?rfq_request_id=eq.${rfq_request_id}`, {
        method: 'PATCH', headers: sbH('return=minimal'),
        body: JSON.stringify({ status: 'received', bound_premium: null, effective_date: null, policy_number: null, outcome_reason: null, bound_at: null, updated_at: now }),
      })
      await fetch(`${SB_URL}/rest/v1/rfq_requests?id=eq.${rfq_request_id}`, {
        method: 'PATCH', headers: sbH('return=minimal'),
        body: JSON.stringify({ status: 'quoted', won_dispatch_id: null, won_insurer: null, bound_premium: null, effective_date: null, policy_number: null, outcome_reason: null, decided_at: null }),
      })
      return NextResponse.json({ ok: true, status: 'quoted' })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
