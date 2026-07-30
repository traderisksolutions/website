/**
 * POST /api/debit-notes/imports/bundles/[id]/approve
 * The review queue's "Approve" action — takes the (possibly human-corrected) merged fields plus
 * the resolved company/contact from the CompanyContactPicker, commits through the same
 * commitDebitNote() path the manual "Generate Debit Note" form uses, generates the TRS-branded
 * PDF (a bundle's source files are insurer documents, never a pre-made TRS PDF), and archives
 * everything (the source files + the generated PDF) into Google Drive under
 * Company/Policy — best-effort: if Drive isn't configured yet, approval still succeeds and the
 * files just aren't archived there yet.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH, stH, uploadPdf, signRead } from '@/lib/debit-note-storage'
import { commitDebitNote, attachDebitNoteArchival, type CompanyInput, type ContactInput, type AttachmentFileRef } from '@/lib/debit-note-commit'
import { renderDebitNotePdf } from '@/lib/debit-note-pdf'
import { archiveDebitNoteToDrive } from '@/lib/gdrive-write'
import { logActivity } from '@/lib/log-activity'

type Body = {
  company: CompanyInput
  contact: ContactInput
  policy: {
    policyNumber?: string | null; insurer: string; classOfInsurance?: string | null
    coverNoteNo?: string | null; description?: string | null; currency?: string
    startDate?: string | null; endDate?: string | null
  }
  debitNote: {
    currency: string; lineItems: { description: string; amount: number }[]
    gstAmount?: number | null; commissionRate?: number | null; commission?: number | null
    debitNoteNo?: string | null
    issueDate: string; paymentDueDate?: string | null; insurer?: string | null
  }
}

type MemberFile = { id: string; storage_url: string; original_filename: string | null; doc_type: string | null }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json() as Body
    if (!body.company || !body.policy?.insurer || !body.debitNote?.lineItems?.length) {
      return NextResponse.json({ error: 'company, policy.insurer and at least one line item are required' }, { status: 400 })
    }

    const bundleRes = await fetch(`${SB_URL}/rest/v1/debit_note_bundles?id=eq.${id}&select=id,status`, { headers: sbH(), cache: 'no-store' })
    const bundle = bundleRes.ok ? (await bundleRes.json())[0] : null
    if (!bundle) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (bundle.status === 'approved') return NextResponse.json({ error: 'Already approved' }, { status: 409 })

    const membersRes = await fetch(`${SB_URL}/rest/v1/pdf_import_items?bundle_id=eq.${id}&select=id,storage_url,original_filename,doc_type`, { headers: sbH(), cache: 'no-store' })
    const members = membersRes.ok ? await membersRes.json() as MemberFile[] : []

    const result = await commitDebitNote({
      company: body.company,
      contact: body.contact,
      policy: { ...body.policy, productType: null, broker: null, sumInsured: null, premium: null, source: 'pdf_import' },
      debitNote: { ...body.debitNote, source: 'pdf_import' },
    })

    const companyRes = await fetch(`${SB_URL}/rest/v1/companies?id=eq.${result.companyId}&select=name:company_name,address&limit=1`, { headers: sbH(), cache: 'no-store' })
    const companyRow = companyRes.ok ? (await companyRes.json())[0] : null
    const companyName = companyRow?.name ?? 'Unknown company'

    // Generate the TRS-branded PDF from the confirmed fields.
    const pdfBuffer = await renderDebitNotePdf({
      debitNoteNo: result.debitNoteNo, issueDate: body.debitNote.issueDate,
      coverNoteNo: body.policy.coverNoteNo ?? null, policyNumber: body.policy.policyNumber ?? null,
      clientName: companyName, clientAddress: companyRow?.address ?? null,
      classOfInsurance: body.policy.classOfInsurance ?? null,
      periodStart: body.policy.startDate ?? null, periodEnd: body.policy.endDate ?? null,
      insurer: body.debitNote.insurer ?? body.policy.insurer, description: body.policy.description ?? null,
      currency: body.debitNote.currency, lineItems: body.debitNote.lineItems,
      gstAmount: body.debitNote.gstAmount ?? null, total: result.grossAmount,
      paymentDueDate: body.debitNote.paymentDueDate ?? null,
    })
    const pdfPath = `${result.companyId}/${result.debitNoteNo}.pdf`
    await uploadPdf(pdfPath, pdfBuffer)

    const attachmentFiles: AttachmentFileRef[] = [
      ...members.map(m => ({ filename: m.original_filename ?? m.storage_url.split('/').pop()!, storage_url: m.storage_url, source: (m.doc_type ?? 'other') as AttachmentFileRef['source'] })),
      { filename: `${result.debitNoteNo}.pdf`, storage_url: pdfPath, source: 'generated' as const },
    ]

    let driveFolderUrl: string | null = null
    try {
      const driveFiles = await Promise.all([
        ...members.map(async m => {
          const res = await fetch(`${SB_URL}/storage/v1/object/debit-notes/${m.storage_url}`, { headers: stH() })
          return { name: m.original_filename ?? 'document.pdf', mimeType: 'application/pdf', bytes: Buffer.from(await res.arrayBuffer()) }
        }),
        Promise.resolve({ name: `${result.debitNoteNo}.pdf`, mimeType: 'application/pdf', bytes: pdfBuffer }),
      ])
      const policyLabel = body.policy.policyNumber ? `${body.policy.policyNumber} - ${body.policy.classOfInsurance ?? ''}`.trim() : result.debitNoteNo
      driveFolderUrl = await archiveDebitNoteToDrive(companyName, policyLabel, driveFiles)
    } catch (e) {
      // Drive archival is best-effort — most likely cause is GDRIVE_* env vars not configured yet.
      console.error('Drive archival failed (approval still succeeds):', e)
    }

    await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${result.debitNoteId}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ pdf_storage_url: pdfPath }) })
    await attachDebitNoteArchival(result.debitNoteId, { driveFolderUrl, attachmentFiles, bundleId: id })

    await fetch(`${SB_URL}/rest/v1/debit_note_bundles?id=eq.${id}`, {
      method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'approved', resolved_debit_note_id: result.debitNoteId }),
    })

    void logActivity({ action: 'debit_note_bundle.approved', resource_type: 'debit_note_bundle', resource_id: id, new_value: { debit_note_id: result.debitNoteId, debit_note_no: result.debitNoteNo, drive_archived: !!driveFolderUrl } })

    const downloadUrl = await signRead(pdfPath)
    return NextResponse.json({ ...result, downloadUrl, driveFolderUrl })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
