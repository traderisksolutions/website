/**
 * GET  /api/debit-notes                → list for the Debit Note table (filters: company_id,
 *                                         insurer, status, search) — a company/policy/insurer
 *                                         join so the table doesn't need N+1 lookups.
 * POST /api/debit-notes                → Generate Debit Note: commits company/contact/policy/
 *                                         debit-note rows via the shared commit path, renders
 *                                         the PDF, uploads it, and attaches it to the record.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH, uploadPdf, signRead } from '@/lib/debit-note-storage'
import {
  commitDebitNote, type CompanyInput, type ContactInput, type PolicyInput, type DebitNoteInput,
} from '@/lib/debit-note-commit'
import { renderDebitNotePdf } from '@/lib/debit-note-pdf'
import { logActivity } from '@/lib/log-activity'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sp = req.nextUrl.searchParams
    const filters: string[] = []
    if (sp.get('company_id')) filters.push(`company_id=eq.${sp.get('company_id')}`)
    if (sp.get('status'))     filters.push(`status=eq.${sp.get('status')}`)
    if (sp.get('insurer'))    filters.push(`insurer=ilike.*${encodeURIComponent(sp.get('insurer')!)}*`)

    const select = 'id,debit_note_no,issue_date,payment_due_date,currency,gross_amount,fee_rebate,net_amount,commission,paid_amount,status,insurer,source,company_id,policy_id,companies(name:company_name),policies(policy_number,broker,class_of_insurance,end_date)'
    const url = `${SB_URL}/rest/v1/debit_notes?select=${select}${filters.length ? '&' + filters.join('&') : ''}&order=issue_date.desc&limit=500`
    const res = await fetch(url, { headers: sbH(), cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })
    return NextResponse.json(await res.json())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json() as {
      company: CompanyInput; contact: ContactInput; policy: PolicyInput; debitNote: DebitNoteInput
      /** Historical backfill: attach a PDF you already have instead of generating one from the
       *  typed fields. Must already be uploaded (same signed-URL flow as everywhere else). */
      existingPdf?: { storageUrl: string; filename: string } | null
    }
    if (!body.company || !body.policy || !body.debitNote?.lineItems?.length) {
      return NextResponse.json({ error: 'company, policy and at least one line item are required' }, { status: 400 })
    }

    const result = await commitDebitNote(body)

    // Pull the resolved details back for the PDF (covers the "existing company/policy" path
    // where the request only carried IDs).
    const [companyRes, policyRes, contactRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/companies?id=eq.${result.companyId}&select=name:company_name,address&limit=1`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/policies?id=eq.${result.policyId}&select=*&limit=1`, { headers: sbH(), cache: 'no-store' }),
      result.contactId
        ? fetch(`${SB_URL}/rest/v1/contacts?id=eq.${result.contactId}&select=first_name,last_name,email&limit=1`, { headers: sbH(), cache: 'no-store' })
        : Promise.resolve(null),
    ])
    const company = companyRes.ok ? (await companyRes.json())[0] : null
    const policy  = policyRes.ok ? (await policyRes.json())[0] : null
    const contact = contactRes && 'ok' in contactRes && contactRes.ok ? (await contactRes.json())[0] : null
    const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null : null

    let pdfPath: string
    if (body.existingPdf) {
      // Historical backfill with a real document on hand — use it as-is, don't regenerate.
      pdfPath = body.existingPdf.storageUrl
    } else {
      const pdfBuffer = await renderDebitNotePdf({
        debitNoteNo:  result.debitNoteNo,
        issueDate:    body.debitNote.issueDate,
        coverNoteNo:  policy?.cover_note_no ?? null,
        policyNumber: policy?.policy_number ?? null,
        clientName:   company?.name ?? '—',
        clientAddress: company?.address ?? null,
        clientContactName: contactName,
        classOfInsurance: policy?.class_of_insurance ?? null,
        periodStart:  policy?.start_date ?? null,
        periodEnd:    policy?.end_date ?? null,
        insurer:      body.debitNote.insurer ?? policy?.insurer ?? null,
        description:  policy?.description ?? null,
        currency:     body.debitNote.currency,
        lineItems:    body.debitNote.lineItems,
        gstAmount:    body.debitNote.gstAmount ?? null,
        total:        result.grossAmount,
        paymentDueDate: body.debitNote.paymentDueDate ?? null,
      })
      pdfPath = `${result.companyId}/${result.debitNoteNo}.pdf`
      await uploadPdf(pdfPath, pdfBuffer)
    }

    await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${result.debitNoteId}`, {
      method: 'PATCH', headers: sbH(),
      body: JSON.stringify({
        pdf_storage_url: pdfPath,
        attachment_files: [{
          filename: body.existingPdf?.filename ?? `${result.debitNoteNo}.pdf`, storage_url: pdfPath,
          source: body.existingPdf ? 'trs_debit_note' : 'generated',
        }],
      }),
    })
    const downloadUrl = await signRead(pdfPath)

    void logActivity({ action: 'debit_note.pdf_generated', resource_type: 'debit_note', resource_id: result.debitNoteId, new_value: { debit_note_no: result.debitNoteNo } })

    return NextResponse.json({
      ...result,
      pdfPath,
      downloadUrl,
      companyName: company?.name ?? null,
      contactEmail: contact?.email ?? null,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
