/**
 * GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD&companyId=<uuid>
 * Two event categories for the visible month, merged into one list:
 *   - renewal:    up to 4 milestones per policy — 60/30/14 days before end_date, and end_date
 *                 itself ("D-Day") — see MILESTONE_DAYS. Replaces the old single end-date-only
 *                 event so a renewal gets progressively more visible as it approaches, not just a
 *                 single dot on the final day.
 *   - debit_due:  a debit note's payment_due_date
 *   - payment_overdue: money still owed whose due date has already passed, pinned to today so
 *                 the backlog does not disappear the moment you leave its month
 *   - rfq_waiting: an insurer that has not answered an RFQ, pinned to the day it crossed the
 *                 service level set in Settings
 *   - case_step:  a deadline the Nexus analysis recommended, which until now lived only inside
 *                 the case
 * `companyId` is optional — when present, scopes both categories to one company (used by the
 * company page's Due Dates tab; the main /calendar page omits it for the site-wide view).
 * Refetch only when the visible month changes (caller's job).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'
import { todaySGT }                  from '@/lib/crm/format'

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
  net_amount: number | null; paid_amount: number | null; paid_direct_amount: number | null
  status: 'unpaid' | 'partially_paid' | 'paid'; insurer: string | null; company_id: string
  companies: { id: string; name: string } | null
  policies: { policy_number: string | null; class_of_insurance: string | null } | null
}
type DispatchRow = {
  id: string; insurer_name: string | null; to_email: string | null; status: string; created_at: string
  rfq_requests: { id: string; product_line: string | null; insured_name: string | null; case_id: string | null } | null
}
type CaseAnalysisRow = {
  case_id: string; created_at: string
  structured_analysis: { recommended_next_steps?: { action?: string; owner?: string; deadline?: string; priority?: string }[] } | null
  cases: { id: string; name: string | null; status: string | null; company_id: string | null; companies: { id: string; name: string } | null } | null
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
      currency: string; grossAmount: number; outstanding: number
      status: 'unpaid' | 'partially_paid' | 'paid'
    }
  | {
      type: 'payment_overdue'; id: string; date: string
      companyId: string | null; companyName: string | null
      debitNoteId: string; debitNoteNo: string; dueDate: string; daysOverdue: number
      currency: string; outstanding: number; insurer: string | null; classOfInsurance: string | null
    }
  | {
      type: 'rfq_waiting'; id: string; date: string
      companyId: string | null; companyName: string | null
      dispatchId: string; insurerName: string; productLine: string | null; insuredName: string | null
      caseId: string | null; sentAt: string; daysWaiting: number
    }
  | {
      type: 'case_step'; id: string; date: string
      companyId: string | null; companyName: string | null
      caseId: string; caseName: string | null; action: string; owner: string | null; priority: string | null
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
    const companyId = req.nextUrl.searchParams.get('companyId')

    // A milestone lands in [from,to] only if end_date is in [from, to + 60d] (the largest
    // warning window) — widen the policy fetch accordingly, then filter precisely in JS below.
    const widenedTo = addDays(to, Math.max(...MILESTONE_DAYS))

    // company_id lives on the embedded `customers` row, not on policies itself — a plain
    // `customers.company_id=eq.` filter only trims which embedded customer is attached, not
    // which policies come back, so the embed needs `!inner` to also restrict top-level rows
    // (same PostgREST convention already used in api/nexus/step-draft/route.ts).
    const policiesUrl = `${SB_URL}/rest/v1/policies?end_date=gte.${from}&end_date=lte.${widenedTo}&status=eq.active&select=id,policy_number,insurer,class_of_insurance,currency,premium,end_date,customers${companyId ? '!inner' : ''}(company_id,companies(id,name:company_name))${companyId ? `&customers.company_id=eq.${companyId}` : ''}&order=end_date.asc`
    const dnCols = 'id,debit_note_no,payment_due_date,currency,gross_amount,net_amount,paid_amount,paid_direct_amount,status,insurer,company_id,companies(id,name:company_name),policies(policy_number,class_of_insurance)'
    const debitNotesUrl = `${SB_URL}/rest/v1/debit_notes?payment_due_date=gte.${from}&payment_due_date=lte.${to}&status=in.(unpaid,partially_paid)${companyId ? `&company_id=eq.${companyId}` : ''}&select=${dnCols}&order=payment_due_date.asc`

    // Money already past its due date. Pinned to today rather than left in the month it was
    // due, so the backlog is visible wherever you are in the calendar.
    const today = todaySGT()
    const overdueUrl = `${SB_URL}/rest/v1/debit_notes?payment_due_date=lt.${today}&status=in.(unpaid,partially_paid)${companyId ? `&company_id=eq.${companyId}` : ''}&select=${dnCols}&order=payment_due_date.asc&limit=200`

    // Insurers that have not answered an RFQ.
    const dispatchUrl = `${SB_URL}/rest/v1/rfq_dispatches?status=eq.sent&select=id,insurer_name,to_email,status,created_at,rfq_requests!rfq_dispatches_rfq_request_id_fkey(id,product_line,insured_name,case_id)&order=created_at.asc&limit=200`

    // Deadlines the Nexus analysis recommended.
    const analysisUrl = `${SB_URL}/rest/v1/case_analyses?select=case_id,created_at,structured_analysis,cases(id,name,status,company_id,companies(id,name:company_name))&order=created_at.desc&limit=120`

    const slaUrl = `${SB_URL}/rest/v1/app_settings?key=eq.rfq_sla&select=value&limit=1`

    const [policiesRes, debitNotesRes, overdueRes, dispatchRes, analysisRes, slaRes] = await Promise.all([
      fetch(policiesUrl, { headers: sbH(), cache: 'no-store' }),
      fetch(debitNotesUrl, { headers: sbH(), cache: 'no-store' }),
      fetch(overdueUrl, { headers: sbH(), cache: 'no-store' }),
      fetch(dispatchUrl, { headers: sbH(), cache: 'no-store' }),
      fetch(analysisUrl, { headers: sbH(), cache: 'no-store' }),
      fetch(slaUrl, { headers: sbH(), cache: 'no-store' }),
    ])

    const policies = policiesRes.ok ? await policiesRes.json() as PolicyRow[] : []
    const debitNotes = debitNotesRes.ok ? await debitNotesRes.json() as DebitNoteRow[] : []
    const overdueNotes = overdueRes.ok ? await overdueRes.json() as DebitNoteRow[] : []
    const dispatches = dispatchRes.ok ? await dispatchRes.json() as DispatchRow[] : []
    const analyses = analysisRes.ok ? await analysisRes.json() as CaseAnalysisRow[] : []
    let slaDays = 3
    if (slaRes.ok) {
      const raw = (await slaRes.json())[0]?.value
      const n = Number(typeof raw === 'object' && raw !== null ? (raw as { days?: unknown }).days : raw)
      if (Number.isFinite(n) && n > 0) slaDays = n
    }

    const outstandingOf = (d: DebitNoteRow) => {
      const total = Number(d.net_amount ?? d.gross_amount ?? 0)
      const paid = Number(d.paid_amount ?? 0) + Number(d.paid_direct_amount ?? 0)
      return Math.max(0, Math.round((total - paid) * 100) / 100)
    }
    const daysBetweenIso = (a: string, b: string) => {
      const [ay, am, ad] = a.split('-').map(Number); const [by, bm, bd] = b.split('-').map(Number)
      return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
    }

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

    // Only notes still owing anything — the ledger may have settled one since it was raised.
    const stillOwed = debitNotes.filter(d => outstandingOf(d) > 0)

    const overdueEvents: CalendarEvent[] = today >= from && today <= to
      ? overdueNotes.filter(d => outstandingOf(d) > 0).map((d): CalendarEvent => ({
          type: 'payment_overdue', id: `payment_overdue-${d.id}`, date: today,
          companyId: d.companies?.id ?? d.company_id ?? null, companyName: d.companies?.name ?? null,
          debitNoteId: d.id, debitNoteNo: d.debit_note_no, dueDate: d.payment_due_date,
          daysOverdue: daysBetweenIso(d.payment_due_date, today),
          currency: d.currency, outstanding: outstandingOf(d),
          insurer: d.insurer, classOfInsurance: d.policies?.class_of_insurance ?? null,
        }))
      : []

    // An insurer crosses the service level `slaDays` after we wrote to them; that is the day
    // the chaser is due, and it is the date the event lands on.
    const waitingEvents: CalendarEvent[] = dispatches.flatMap((d): CalendarEvent[] => {
      if (companyId) return []   // scoped view: RFQ chasers are a firm-wide view for now
      const sent = d.created_at.slice(0, 10)
      const crossed = addDays(sent, slaDays)
      // Already overdue for a chase: show it today, not buried in the month it lapsed.
      const dueDate = crossed < today ? today : crossed
      if (dueDate < from || dueDate > to) return []
      return [{
        type: 'rfq_waiting', id: `rfq_waiting-${d.id}`, date: dueDate,
        companyId: null, companyName: d.rfq_requests?.insured_name ?? null,
        dispatchId: d.id, insurerName: d.insurer_name ?? 'Insurer',
        productLine: d.rfq_requests?.product_line ?? null,
        insuredName: d.rfq_requests?.insured_name ?? null,
        caseId: d.rfq_requests?.case_id ?? null,
        sentAt: d.created_at, daysWaiting: daysBetweenIso(sent, today),
      }]
    })

    // One analysis per case — the newest — so an old run's deadlines do not linger.
    const seenCase = new Set<string>()
    const stepEvents: CalendarEvent[] = analyses.flatMap((a): CalendarEvent[] => {
      if (seenCase.has(a.case_id)) return []
      seenCase.add(a.case_id)
      if (a.cases?.status === 'closed') return []
      if (companyId && a.cases?.company_id !== companyId) return []
      return (a.structured_analysis?.recommended_next_steps ?? []).flatMap((st, i): CalendarEvent[] => {
        const dl = (st.deadline ?? '').slice(0, 10)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dl) || dl < from || dl > to) return []
        if (!st.action) return []
        return [{
          type: 'case_step', id: `case_step-${a.case_id}-${i}`, date: dl,
          companyId: a.cases?.companies?.id ?? a.cases?.company_id ?? null,
          companyName: a.cases?.companies?.name ?? null,
          caseId: a.case_id, caseName: a.cases?.name ?? null,
          action: st.action, owner: st.owner ?? null, priority: st.priority ?? null,
        }]
      })
    })

    const events: CalendarEvent[] = [
      ...renewalEvents,
      ...stillOwed.map((d): CalendarEvent => ({
        type: 'debit_due', id: `debit_due-${d.id}`, date: d.payment_due_date,
        companyId: d.companies?.id ?? d.company_id ?? null, companyName: d.companies?.name ?? null,
        debitNoteId: d.id, debitNoteNo: d.debit_note_no, policyNumber: d.policies?.policy_number ?? null,
        classOfInsurance: d.policies?.class_of_insurance ?? null, insurer: d.insurer,
        currency: d.currency, grossAmount: d.gross_amount, outstanding: outstandingOf(d), status: d.status,
      })),
      ...overdueEvents,
      ...waitingEvents,
      ...stepEvents,
    ]

    return NextResponse.json(events)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
