/**
 * POST /api/debit-notes/imports/[id]/approve
 * The review queue's "Approve" action — takes the (possibly human-corrected) extracted fields
 * plus the resolved company/contact from the CompanyContactPicker, and commits through the
 * exact same commitDebitNote() path the manual "Generate Debit Note" form uses. The original
 * uploaded PDF becomes the debit note's PDF (moved to the standard `${companyId}/${dnNo}.pdf`
 * path) — no re-rendering, since it's a real scanned/emailed document, not one we authored.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH, BUCKET }       from '@/lib/debit-note-storage'
import { commitDebitNote, type CompanyInput, type ContactInput } from '@/lib/debit-note-commit'
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
    gstAmount?: number | null; issueDate: string; paymentDueDate?: string | null; insurer?: string | null
  }
}

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

    const itemRes = await fetch(`${SB_URL}/rest/v1/pdf_import_items?id=eq.${id}&select=storage_url,status&limit=1`, { headers: sbH(), cache: 'no-store' })
    const item = itemRes.ok ? (await itemRes.json())[0] : null
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (item.status === 'approved') return NextResponse.json({ error: 'Already approved' }, { status: 409 })

    const result = await commitDebitNote({
      company: body.company,
      contact: body.contact,
      policy: { ...body.policy, productType: null, broker: null, sumInsured: null, premium: null, source: 'pdf_import' },
      debitNote: { ...body.debitNote, source: 'pdf_import' },
    })

    // Move the original uploaded PDF into the standard path and attach it.
    const destPath = `${result.companyId}/${result.debitNoteNo}.pdf`
    const copyRes = await fetch(`${SB_URL}/storage/v1/object/copy`, {
      method: 'POST', headers: sbH(),
      body: JSON.stringify({ bucketId: BUCKET, sourceKey: item.storage_url, destinationKey: destPath }),
    })
    if (copyRes.ok) {
      await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${result.debitNoteId}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ pdf_storage_url: destPath }) })
    }

    await fetch(`${SB_URL}/rest/v1/pdf_import_items?id=eq.${id}`, {
      method: 'PATCH', headers: sbH(),
      body: JSON.stringify({ status: 'approved', resolved_debit_note_id: result.debitNoteId }),
    })

    void logActivity({ action: 'pdf_import.approved', resource_type: 'pdf_import_item', resource_id: id, new_value: { debit_note_id: result.debitNoteId, debit_note_no: result.debitNoteNo } })

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
