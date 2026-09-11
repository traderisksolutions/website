import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rpConfigured, rpGet } from '@/lib/roadplus-db'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

type PaymentRow = {
  id: string
  partner: string | null
  gateway: string | null
  payment_method: string | null
  proposal_no: string | null
  policy_id: string | null
  policy_no: string | null
  transaction_id: string | null
  payment_ref_no: string | null
  amount: number | null
  currency: string | null
  payment_status: string | null
  error_code: string | null
  paid_date: string | null
  source: string | null
  received_at: string | null
  quotes: { final_premium: number | null; policy_type: string | null; geo_area: string | null; journey_id: string | null } | null
}

type Recon =
  | 'reconciled'
  | 'amount_mismatch'
  | 'unmatched'
  | 'awaiting_policy_no'
  | 'awaiting_confirmation'
  | 'failed'

// Route files may only export handlers, so these stay module-private.
/** Rows that need a person to look at them. */
const ATTENTION: Recon[] = ['amount_mismatch', 'unmatched']

// How long a payment may sit unconfirmed or without a policy number before we
// flag it. The reconcile sweep runs every 5 minutes, so an hour is generous.
const STALE_MS = 60 * 60 * 1000

function reconcile(p: PaymentRow, policyNoById: Map<string, string | null>): { recon: Recon; stale: boolean } {
  const age = p.received_at ? Date.now() - new Date(p.received_at).getTime() : 0
  const stale = age > STALE_MS
  if (p.payment_status === 'failed') return { recon: 'failed', stale: false }
  if (p.payment_status !== 'success') return { recon: 'awaiting_confirmation', stale }
  const quoted = p.quotes?.final_premium
  if (!p.quotes || quoted == null) return { recon: 'unmatched', stale: false }
  if (p.amount == null || Math.abs(Number(p.amount) - Number(quoted)) > 0.005)
    return { recon: 'amount_mismatch', stale: false }
  const policyNo = p.policy_no ?? (p.policy_id ? policyNoById.get(p.policy_id) : null)
  if (!policyNo) return { recon: 'awaiting_policy_no', stale }
  return { recon: 'reconciled', stale: false }
}

// GET /api/roadplus/payments → every RoadPlus payment, matched to its quote and
// policy, with a reconciliation status and a summary.
export async function GET(req: NextRequest) {
  if (!(await requireUser()))
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!rpConfigured())
    return NextResponse.json({ configured: false, rows: [] })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 500), 1000)

  const cols =
    'id,partner,gateway,payment_method,proposal_no,policy_id,policy_no,transaction_id,' +
    'payment_ref_no,amount,currency,payment_status,error_code,paid_date,source,received_at,' +
    'quotes(final_premium,policy_type,geo_area,journey_id)'
  let path = `payments?select=${cols}&order=received_at.desc&limit=${limit}`
  if (q) {
    const like = `*${q}*`
    path += `&or=(policy_no.ilike.${like},policy_id.ilike.${like},proposal_no.ilike.${like},transaction_id.ilike.${like},payment_ref_no.ilike.${like})`
  }

  try {
    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()
    const [payments, pendingQuotes] = await Promise.all([
      rpGet<PaymentRow[]>(path),
      // Finalized in the last 14 days — the window the reconcile sweep covers.
      rpGet<{ policy_id: string | null }[]>(
        `quotes?select=policy_id&status=eq.pending_payment&policy_id=not.is.null&created_at=gte.${since}`,
      ),
    ])

    const policyIds = Array.from(new Set(payments.map((p) => p.policy_id).filter((x): x is string => !!x)))
    const policies = policyIds.length
      ? await rpGet<{ policy_id: string; policy_no: string | null }[]>(
          `policies?select=policy_id,policy_no&policy_id=in.(${policyIds.map((id) => `"${id}"`).join(',')})`,
        )
      : []
    const policyNoById = new Map<string, string | null>()
    for (const p of policies) if (p.policy_no || !policyNoById.has(p.policy_id)) policyNoById.set(p.policy_id, p.policy_no)

    const rows = payments.map((p) => {
      const { recon, stale } = reconcile(p, policyNoById)
      const { quotes, ...rest } = p
      return {
        ...rest,
        policy_no: p.policy_no ?? (p.policy_id ? policyNoById.get(p.policy_id) ?? null : null),
        quoted_premium: quotes?.final_premium ?? null,
        policy_type: quotes?.policy_type ?? null,
        geo_area: quotes?.geo_area ?? null,
        journey_id: quotes?.journey_id ?? null,
        recon,
        // Unconfirmed or number-less for over an hour → a person should check.
        attention: ATTENTION.includes(recon) || stale,
      }
    })

    const paidIds = new Set(payments.filter((p) => p.payment_status === 'success').map((p) => p.policy_id))
    const success = rows.filter((r) => r.payment_status === 'success')
    const summary = {
      collected: success.reduce((s, r) => s + Number(r.amount ?? 0), 0),
      payments: success.length,
      reconciled: rows.filter((r) => r.recon === 'reconciled').length,
      attention: rows.filter((r) => r.attention).length,
      awaitingPayment: pendingQuotes.filter((x) => x.policy_id && !paidIds.has(x.policy_id)).length,
    }

    return NextResponse.json({ configured: true, rows, summary })
  } catch (e) {
    return NextResponse.json({ configured: true, rows: [], error: String(e) }, { status: 502 })
  }
}
