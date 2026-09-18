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

type QuoteRow = {
  id: string
  quote_id: string | null
  policy_id: string | null
  proposal_no: string | null
  final_premium: number | null
  premium: number | null
  policy_type: string | null
  geo_area: string | null
  journey_id: string | null
  status: string | null
  created_at: string | null
}

type Recon =
  | 'reconciled'
  | 'amount_mismatch'
  | 'unmatched'
  | 'awaiting_policy_no'
  | 'awaiting_confirmation'
  | 'awaiting_payment'
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

// GET /api/roadplus/payments → every RoadPlus purchase attempt: each payment
// matched to its quote and policy, PLUS every quote that reached ECICS payment
// with no payment recorded against it yet. A payment row only ever exists once
// ECICS posts the webhook or the sweep finds the policy, so a payments-only list
// shows nothing at all until money lands — and hides abandoned checkouts and
// missed callbacks, which are exactly the rows someone needs to act on.
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

  // A quote holds a policy_id only once ECICS has issued a proposal and a payment
  // link — that is the moment a visitor became a purchase attempt.
  const quoteCols =
    'id,quote_id,policy_id,proposal_no,final_premium,premium,policy_type,geo_area,journey_id,status,created_at'
  let quotePath = `quotes?select=${quoteCols}&policy_id=not.is.null&order=created_at.desc&limit=${limit}`

  if (q) {
    const like = `*${q}*`
    path += `&or=(policy_no.ilike.${like},policy_id.ilike.${like},proposal_no.ilike.${like},transaction_id.ilike.${like},payment_ref_no.ilike.${like})`
    quotePath += `&or=(policy_id.ilike.${like},proposal_no.ilike.${like},quote_id.ilike.${like},journey_id.ilike.${like})`
  }

  try {
    const [payments, attempts] = await Promise.all([
      rpGet<PaymentRow[]>(path),
      rpGet<QuoteRow[]>(quotePath),
    ])

    const policyIds = Array.from(
      new Set(
        [...payments.map((p) => p.policy_id), ...attempts.map((a) => a.policy_id)].filter(
          (x): x is string => !!x,
        ),
      ),
    )
    const policies = policyIds.length
      ? await rpGet<{ policy_id: string; policy_no: string | null }[]>(
          `policies?select=policy_id,policy_no&policy_id=in.(${policyIds.map((id) => `"${id}"`).join(',')})`,
        )
      : []
    const policyNoById = new Map<string, string | null>()
    for (const p of policies) if (p.policy_no || !policyNoById.has(p.policy_id)) policyNoById.set(p.policy_id, p.policy_no)

    const paymentRows = payments.map((p) => {
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

    // Attempts already carrying a payment row are represented by that row.
    const covered = new Set<string>()
    for (const p of payments) {
      if (p.policy_id) covered.add(`pid:${p.policy_id}`)
      if (p.proposal_no) covered.add(`prop:${p.proposal_no}`)
    }
    const unpaid = attempts.filter(
      (a) =>
        !(a.policy_id && covered.has(`pid:${a.policy_id}`)) &&
        !(a.proposal_no && covered.has(`prop:${a.proposal_no}`)),
    )

    const unpaidRows = unpaid.map((a) => {
      const policyNo = (a.policy_id ? policyNoById.get(a.policy_id) : null) ?? null
      return {
        id: `quote:${a.id}`,
        partner: 'ecics',
        gateway: null,
        payment_method: null,
        proposal_no: a.proposal_no,
        policy_id: a.policy_id,
        policy_no: policyNo,
        transaction_id: null,
        payment_ref_no: null,
        amount: null,
        currency: 'SGD',
        payment_status: null,
        error_code: null,
        paid_date: null,
        // The attempt itself, not a payment — the reconcile sweep is what asks
        // ECICS whether one of these was in fact paid.
        source: 'quote',
        received_at: a.created_at,
        quoted_premium: a.final_premium ?? a.premium ?? null,
        policy_type: a.policy_type,
        geo_area: a.geo_area,
        journey_id: a.journey_id,
        recon: 'awaiting_payment' as Recon,
        // ECICS issued a policy number but no payment ever reached the ledger —
        // the callback was missed. Someone has to run reconcile or chase ECICS.
        attention: !!policyNo,
      }
    })

    const rows = [...paymentRows, ...unpaidRows].sort(
      (a, b) => new Date(b.received_at ?? 0).getTime() - new Date(a.received_at ?? 0).getTime(),
    )

    const success = paymentRows.filter((r) => r.payment_status === 'success')
    const summary = {
      collected: success.reduce((s, r) => s + Number(r.amount ?? 0), 0),
      payments: success.length,
      reconciled: paymentRows.filter((r) => r.recon === 'reconciled').length,
      attention: rows.filter((r) => r.attention).length,
      awaitingPayment: unpaidRows.length,
    }

    return NextResponse.json({ configured: true, rows, summary })
  } catch (e) {
    return NextResponse.json({ configured: true, rows: [], error: String(e) }, { status: 502 })
  }
}
