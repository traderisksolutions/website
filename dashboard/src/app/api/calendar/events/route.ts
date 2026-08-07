/**
 * GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Two event categories for the visible month, merged into one list:
 *   - renewal:    up to 4 milestones per policy — 60/30/14 days before end_date, and end_date
 *                 itself ("D-Day") — see MILESTONE_DAYS. Replaces the old single end-date-only
 *                 event so a renewal gets progressively more visible as it approaches, not just a
 *                 single dot on the final day.
 *   - debit_due:  a debit note's payment_due_date (unchanged)
 * Refetch only when the visible month changes (caller's job).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'

/** Days-before-end_date for each renewal warning, plus 0 for the end date itself ("D-Day"). Order
 *  matters only for readability — events are independently date-filtered below. Not exported: a
 *  Next.js route module may only export its HTTP handlers + a few known config values. */
const MILESTONE_DAYS = [60, 30, 14, 0] as const
type MilestoneDays = typeof MILESTONE_DAYS[number]

const MILESTONE_LABEL: Record<MilestoneDays, string> = {
  60: '60 days to renewal', 30: '30 days to renewal', 14: '14 days to renewal', 0: 'Renews today (D-Day)',
}

type PolicyRow = {
  id: string; policy_number: string | null; insurer: string | null; class_of_insurance: string | null
  currency: string | null; premium: number | null; end_date: string
  customers: { company_id: string | null; companies: { id: string; name: string } | null } | null
}
type DebitNoteRow = {
  id: string; debit_note_no: string; payment_due_date: string; currency: string; gross_amount: number
  status: 'unpaid' | 'partially_paid' | 'paid'; insurer: string | null; company_id: string
  companies: { id: string; name: string } | null
  policies: { policy_number: string | null; class_of_insurance: string | null } | null
}

export type CalendarEvent =
  | {
      type: 'renewal'; id: string; date: string; milestone: MilestoneDays; label: string
      companyId: string | null; companyName: string | null
      policyId: string; policyNumber: string | null; insurer: string | null
      classOfInsurance: string | null; currency: string; premium: number | null
    }
  | {
      type: 'debit_due'; id: string; date: string
      companyId: string | null; companyName: string | null
      debitNoteId: string; debitNoteNo: string; policyNumber: string | null
      classOfInsurance: string | null; insurer: string | null
      currency: string; grossAmount: number; status: 'unpaid' | 'partially_paid' | 'paid'
    }

/** Local calendar-date arithmetic on a plain YYYY-MM-DD string — avoids the UTC round-trip bug
 *  fixed in calendar/page.tsx's toISODate (see that file for why: Date + toISOString() shifts by a
 *  day in any timezone ahead of UTC). */
function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const from = req.nextUrl.searchParams.get('from')
    const to   = req.nextUrl.searchParams.get('to')
    if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 })

    // A milestone lands in [from,to] only if end_date is in [from, to + 60d] (the largest
    // warning window) — widen the policy fetch accordingly, then filter precisely in JS below.
    const widenedTo = addDays(to, Math.max(...MILESTONE_DAYS))

    const [policiesRes, debitNotesRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/policies?end_date=gte.${from}&end_date=lte.${widenedTo}&status=eq.active&select=id,policy_number,insurer,class_of_insurance,currency,premium,end_date,customers(company_id,companies(id,name:company_name))&order=end_date.asc`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/debit_notes?payment_due_date=gte.${from}&payment_due_date=lte.${to}&status=in.(unpaid,partially_paid)&select=id,debit_note_no,payment_due_date,currency,gross_amount,status,insurer,company_id,companies(id,name:company_name),policies(policy_number,class_of_insurance)&order=payment_due_date.asc`, { headers: sbH(), cache: 'no-store' }),
    ])

    const policies = policiesRes.ok ? await policiesRes.json() as PolicyRow[] : []
    const debitNotes = debitNotesRes.ok ? await debitNotesRes.json() as DebitNoteRow[] : []

    const renewalEvents: CalendarEvent[] = policies.flatMap((p): CalendarEvent[] =>
      MILESTONE_DAYS.map((days): CalendarEvent | null => {
        const date = addDays(p.end_date, -days)
        if (date < from || date > to) return null
        return {
          type: 'renewal', id: `renewal-${p.id}-${days}`, date, milestone: days, label: MILESTONE_LABEL[days],
          companyId: p.customers?.companies?.id ?? null, companyName: p.customers?.companies?.name ?? null,
          policyId: p.id, policyNumber: p.policy_number, insurer: p.insurer,
          classOfInsurance: p.class_of_insurance, currency: p.currency ?? 'SGD', premium: p.premium,
        }
      }).filter((e): e is CalendarEvent => e !== null)
    )

    const events: CalendarEvent[] = [
      ...renewalEvents,
      ...debitNotes.map((d): CalendarEvent => ({
        type: 'debit_due', id: `debit_due-${d.id}`, date: d.payment_due_date,
        companyId: d.companies?.id ?? d.company_id ?? null, companyName: d.companies?.name ?? null,
        debitNoteId: d.id, debitNoteNo: d.debit_note_no, policyNumber: d.policies?.policy_number ?? null,
        classOfInsurance: d.policies?.class_of_insurance ?? null, insurer: d.insurer,
        currency: d.currency, grossAmount: d.gross_amount, status: d.status,
      })),
    ]

    return NextResponse.json(events)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
