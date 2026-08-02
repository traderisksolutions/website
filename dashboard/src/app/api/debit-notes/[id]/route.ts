/**
 * GET    /api/debit-notes/[id]  → full detail for the drawer/edit form.
 * PATCH  /api/debit-notes/[id]  → free-form edit (always allowed, per decision — no locking/
 *                                  versioning). Editing financials regenerates the PDF so what's
 *                                  stored never disagrees with the numbers on record. Also
 *                                  accepts an optional `policy` sub-object to edit the linked
 *                                  policy's own fields (policy number, class, dates, etc.) in the
 *                                  same save.
 * DELETE /api/debit-notes/[id]  → removes a single debit note row (and its generated PDF, if
 *                                  any). Never cascades to the policy or sibling debit notes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH, uploadPdf, signRead, deleteObject } from '@/lib/debit-note-storage'
import { renderDebitNotePdf, type DebitNotePdfLineItem } from '@/lib/debit-note-pdf'
import { logActivity } from '@/lib/log-activity'

async function loadFull(id: string) {
  const res = await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${id}&select=*,companies(id,name:company_name,address),policies(*),contacts(id,first_name,last_name,email)&limit=1`, { headers: sbH(), cache: 'no-store' })
  if (!res.ok) return null
  return (await res.json())[0] ?? null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const row = await loadFull(id)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

type PayStatus = 'unpaid' | 'partially_paid' | 'paid'
type EventType = 'new_business' | 'renewal' | 'endorsement'

type Patch = {
  lineItems?: DebitNotePdfLineItem[]; gstAmount?: number; feeRebate?: number
  commission?: number; commissionRate?: number
  issueDate?: string; paymentDueDate?: string; insurer?: string; currency?: string
  status?: PayStatus; paidAmount?: number
  paidDirectAmount?: number; paidDirectStatus?: PayStatus
  payDirectToInsurer?: boolean; payToTrsOps?: boolean
  eventType?: EventType; endorsementEffectiveDate?: string | null
  policy?: {
    policyNumber?: string | null; classOfInsurance?: string | null; coverNoteNo?: string | null
    description?: string | null; startDate?: string | null; endDate?: string | null; broker?: string | null
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const patch = await req.json() as Patch
    const before = await loadFull(id)
    if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const lineItems = patch.lineItems ?? before.line_items
    const gstAmount  = patch.gstAmount  ?? before.gst_amount ?? 0
    const grossAmount = (lineItems as DebitNotePdfLineItem[]).reduce((s, l) => s + l.amount, 0) + gstAmount

    const update = {
      line_items: lineItems,
      gst_amount: gstAmount,
      gross_amount: grossAmount,
      fee_rebate: patch.feeRebate ?? before.fee_rebate,
      commission: patch.commission ?? before.commission,
      commission_rate: patch.commissionRate ?? before.commission_rate,
      issue_date: patch.issueDate ?? before.issue_date,
      payment_due_date: patch.paymentDueDate ?? before.payment_due_date,
      insurer: patch.insurer ?? before.insurer,
      currency: patch.currency ?? before.currency,
      status: patch.status ?? before.status,
      paid_amount: patch.paidAmount ?? before.paid_amount,
      paid_direct_amount: patch.paidDirectAmount ?? before.paid_direct_amount,
      paid_direct_status: patch.paidDirectStatus ?? before.paid_direct_status,
      pay_direct_to_insurer: patch.payDirectToInsurer ?? before.pay_direct_to_insurer,
      pay_to_trs_ops: patch.payToTrsOps ?? before.pay_to_trs_ops,
      event_type: patch.eventType ?? before.event_type,
      endorsement_effective_date: patch.endorsementEffectiveDate !== undefined ? patch.endorsementEffectiveDate : before.endorsement_effective_date,
      updated_at: new Date().toISOString(),
    }
    const res = await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify(update) })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })

    const policy = before.policies ? {
      policy_number:      patch.policy?.policyNumber      ?? before.policies.policy_number,
      class_of_insurance:  patch.policy?.classOfInsurance  ?? before.policies.class_of_insurance,
      cover_note_no:       patch.policy?.coverNoteNo       ?? before.policies.cover_note_no,
      description:         patch.policy?.description       ?? before.policies.description,
      start_date:          patch.policy?.startDate         ?? before.policies.start_date,
      end_date:            patch.policy?.endDate           ?? before.policies.end_date,
      broker:              patch.policy?.broker            ?? before.policies.broker,
    } : null
    if (patch.policy && policy) {
      const policyRes = await fetch(`${SB_URL}/rest/v1/policies?id=eq.${before.policy_id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify(policy) })
      if (!policyRes.ok) return NextResponse.json({ error: await policyRes.text() }, { status: 502 })
    }

    // Regenerate the PDF so it never drifts from the numbers now on record.
    const pdfBuffer = await renderDebitNotePdf({
      debitNoteNo: before.debit_note_no, issueDate: update.issue_date,
      coverNoteNo: policy?.cover_note_no ?? null, policyNumber: policy?.policy_number ?? null,
      clientName: before.companies?.name ?? '—', clientAddress: before.companies?.address ?? null,
      clientContactName: [before.contacts?.first_name, before.contacts?.last_name].filter(Boolean).join(' ') || null,
      classOfInsurance: policy?.class_of_insurance ?? null,
      periodStart: policy?.start_date ?? null, periodEnd: policy?.end_date ?? null,
      insurer: update.insurer, description: policy?.description ?? null,
      currency: update.currency, lineItems, gstAmount, total: grossAmount,
      paymentDueDate: update.payment_due_date,
      eventType: update.event_type as EventType, endorsementEffectiveDate: update.endorsement_effective_date,
    })
    const pdfPath = before.pdf_storage_url ?? `${before.company_id}/${before.debit_note_no}.pdf`
    await uploadPdf(pdfPath, pdfBuffer)
    if (!before.pdf_storage_url) {
      await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ pdf_storage_url: pdfPath }) })
    }

    void logActivity({ action: 'debit_note.updated', resource_type: 'debit_note', resource_id: id, old_value: { status: before.status, gross_amount: before.gross_amount }, new_value: { status: update.status, gross_amount: grossAmount } })

    const downloadUrl = await signRead(pdfPath)
    return NextResponse.json({ ok: true, downloadUrl })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const before = await loadFull(id)
    if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const res = await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${id}`, { method: 'DELETE', headers: sbH() })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })

    if (before.pdf_storage_url) await deleteObject(before.pdf_storage_url)

    // policy_number is UNIQUE — a policy left behind with no debit notes on it can never be
    // re-approved into (the insert 409s on that same number), so clean it up once this was the
    // last debit note referencing it. Company/contact are never touched here: those are shared
    // CRM identity that outlives any single policy.
    const siblings = await fetch(`${SB_URL}/rest/v1/debit_notes?policy_id=eq.${before.policy_id}&select=id&limit=1`, { headers: sbH(), cache: 'no-store' })
    const hasSiblings = siblings.ok && (await siblings.json()).length > 0
    if (!hasSiblings) {
      await fetch(`${SB_URL}/rest/v1/policies?id=eq.${before.policy_id}`, { method: 'DELETE', headers: sbH() }).catch(() => {})
    }

    void logActivity({ action: 'debit_note.deleted', resource_type: 'debit_note', resource_id: id, old_value: { debit_note_no: before.debit_note_no, gross_amount: before.gross_amount, policy_also_deleted: !hasSiblings } })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
