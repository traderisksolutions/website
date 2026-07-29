/**
 * GET   /api/debit-notes/[id]  → full detail for the drawer/edit form.
 * PATCH /api/debit-notes/[id]  → free-form edit (always allowed, per decision — no locking/
 *                                 versioning). Editing financials regenerates the PDF so what's
 *                                 stored never disagrees with the numbers on record.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH, uploadPdf, signRead } from '@/lib/debit-note-storage'
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

type Patch = {
  lineItems?: DebitNotePdfLineItem[]; gstAmount?: number; feeRebate?: number; commission?: number
  paymentDueDate?: string; insurer?: string; status?: 'unpaid' | 'partially_paid' | 'paid'
  paidAmount?: number; paidDirectAmount?: number
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
      payment_due_date: patch.paymentDueDate ?? before.payment_due_date,
      insurer: patch.insurer ?? before.insurer,
      status: patch.status ?? before.status,
      paid_amount: patch.paidAmount ?? before.paid_amount,
      paid_direct_amount: patch.paidDirectAmount ?? before.paid_direct_amount,
      updated_at: new Date().toISOString(),
    }
    const res = await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify(update) })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })

    // Regenerate the PDF so it never drifts from the numbers now on record.
    const pdfBuffer = await renderDebitNotePdf({
      debitNoteNo: before.debit_note_no, issueDate: before.issue_date,
      coverNoteNo: before.policies?.cover_note_no ?? null, policyNumber: before.policies?.policy_number ?? null,
      clientName: before.companies?.name ?? '—', clientAddress: before.companies?.address ?? null,
      classOfInsurance: before.policies?.class_of_insurance ?? null,
      periodStart: before.policies?.start_date ?? null, periodEnd: before.policies?.end_date ?? null,
      insurer: update.insurer, description: before.policies?.description ?? null,
      currency: before.currency, lineItems, gstAmount, total: grossAmount,
      paymentDueDate: update.payment_due_date,
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
