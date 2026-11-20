/**
 * Debit notes on the server (21 Nov 2026): issue, edit, delete, approve an imported bundle and zip
 * a note's documents. Moved unchanged from /api/debit-notes, /api/debit-notes/[id],
 * /[id]/zip-attachment and /imports/bundles/[id]/approve for the Finance actions
 * (src/app/debit-notes/actions.ts). Only the route's responses became return values and errors.
 */
import { SB_URL, sbH, uploadPdf, signRead, deleteObject, downloadObject, storageKeySegment, storeImportFile } from '@/lib/debit-note-storage'
import { sbTry } from '@/lib/crm/db'
import { derivePayment, summarizePayments } from '@/lib/crm/payments'
import { listReceipts, ledgerAvailable } from '@/lib/crm/receipts'
import type { DebitNoteRow } from '@/lib/crm/types'
import { findMasterPolicy, hasEndorsementSuffix, looksLikeEndorsement, type PolicyLike } from '@/lib/policies/endorsement'
import { driveWebLink } from '@/lib/storage/attachment-bytes'
import { storeUpload } from '@/lib/storage/drive-upload'
import AdmZip from 'adm-zip'
import {
  commitDebitNote, attachDebitNoteArchival, type CompanyInput, type ContactInput, type PolicyInput, type DebitNoteInput, type AttachmentFileRef,
} from '@/lib/debit-note-commit'
import { archiveDebitNoteToDrive } from '@/lib/gdrive-write'
import { closeLineForDebitNote } from '@/lib/placement/workflow'
import { renderDebitNotePdf } from '@/lib/debit-note-pdf-server'
import type { DebitNotePdfLineItem } from '@/lib/debit-note-pdf'
import { getBankProfileForCurrency } from '@/lib/debit-note-bank-profile'
import { billedFromBundle } from '@/lib/policies/movement-flow'
import { logActivity } from '@/lib/log-activity'

export async function loadFull(id: string) {
  const res = await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${id}&select=*,companies(id,name:company_name,address),policies(*),contacts(id,first_name,last_name,email)&limit=1`, { headers: sbH(), cache: 'no-store' })
  if (!res.ok) return null
  return (await res.json())[0] ?? null
}

type PayStatus = 'unpaid' | 'partially_paid' | 'paid'
type EventType = 'new_business' | 'renewal' | 'endorsement'

type Patch = {
  debitNoteNo?: string
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

export type IssueInput = { company: CompanyInput; contact: ContactInput; policy: PolicyInput; debitNote: DebitNoteInput; existingPdf?: { storageUrl: string; filename: string } | null }

/** Issues a debit note: records it, renders and stores the PDF, files it in Drive, closes the request line. */
export async function issueDebitNote(input: IssueInput, actor: string) {
  const body = input as {
    company: CompanyInput; contact: ContactInput; policy: PolicyInput; debitNote: DebitNoteInput
    /** Historical backfill: attach a PDF you already have instead of generating one from the
     *  typed fields. Must already be uploaded (same signed-URL flow as everywhere else). */
    existingPdf?: { storageUrl: string; filename: string } | null
  }
  if (!body.company || !body.policy || !body.debitNote?.lineItems?.length) {
    throw new Error('company, policy and at least one line item are required')
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
  let pdfForDrive: Buffer | null = null
  if (body.existingPdf) {
    // Historical backfill with a real document on hand — use it as-is, don't regenerate.
    pdfPath = body.existingPdf.storageUrl
  } else {
    const bankProfile = await getBankProfileForCurrency(body.debitNote.currency)
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
      feeRebate:    body.debitNote.feeRebate ?? null,
      total:        result.grossAmount - (body.debitNote.feeRebate ?? 0),
      bankProfile,
      paymentDueDate: body.debitNote.paymentDueDate ?? null,
      eventType: body.debitNote.eventType, endorsementEffectiveDate: body.debitNote.endorsementEffectiveDate ?? null,
    })
    pdfPath = await uploadPdf(`${result.companyId}/${storageKeySegment(result.debitNoteNo)}.pdf`, pdfBuffer)
    pdfForDrive = pdfBuffer
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
  // Null for a historical PDF reference from before Drive storage: the note is issued either way.
  const downloadUrl = driveWebLink(pdfPath)

  // File it in the company's Drive folder, as the import path does. Best-effort: a note with no
  // Drive folder is still issued, and the quote request it finishes stays open until it is filed.
  let driveFolderUrl: string | null = null
  if (pdfForDrive) {
    try {
      driveFolderUrl = await archiveDebitNoteToDrive(company?.name ?? 'Unknown company', [{ name: `${result.debitNoteNo}.pdf`, mimeType: 'application/pdf', bytes: pdfForDrive }])
      await attachDebitNoteArchival(result.debitNoteId, { driveFolderUrl })
    } catch (e) {
      console.error('Drive archival failed (debit note still issued):', e)
    }
  }
  try { await closeLineForDebitNote(result.debitNoteId, actor) }
  catch (e) { console.error('[debit-notes] closing the quote request line failed:', e) }

  void logActivity({ action: 'debit_note.pdf_generated', resource_type: 'debit_note', resource_id: result.debitNoteId, new_value: { debit_note_no: result.debitNoteNo } })

  return ({
    ...result,
    pdfPath,
    downloadUrl,
    driveFolderUrl,
    companyName: company?.name ?? null,
    contactEmail: contact?.email ?? null,
  })
}

export type DebitNotePatch = Patch

/** Edits a debit note and its policy, renders the PDF again and replaces the stored copy. */
export async function updateDebitNote(id: string, patch: Patch) {
  const before = await loadFull(id)
  if (!before) throw new Error('Not found')

  const debitNoteNo = patch.debitNoteNo?.trim() || before.debit_note_no
  const renumbering = debitNoteNo !== before.debit_note_no
  if (renumbering) {
    const dupe = await fetch(`${SB_URL}/rest/v1/debit_notes?debit_note_no=eq.${encodeURIComponent(debitNoteNo)}&id=neq.${id}&select=id&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])) as { id: string }[]
    if (dupe.length > 0) throw new Error(`${debitNoteNo} is already in use by another debit note`)
  }

  const lineItems = patch.lineItems ?? before.line_items
  const gstAmount  = patch.gstAmount  ?? before.gst_amount ?? 0
  // Line items are GST-inclusive as of the debit-notes/new creation flow (the printed premium
  // line already has its GST folded in — see that page's comment) — gstAmount is tracked here
  // purely for internal accounting/reporting, never added again on top of the line items it's
  // already part of. NOTE: a debit note created before that change has GST-EXCLUSIVE stored
  // line_items, so re-saving one of those through this edit route will under-count GST in the
  // recomputed total by exactly gstAmount — a one-time migration gap for historical records,
  // not something this route can detect from the data alone.
  const grossAmount = (lineItems as DebitNotePdfLineItem[]).reduce((s, l) => s + l.amount, 0)

  const update = {
    debit_note_no: debitNoteNo,
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
  if (!res.ok) throw new Error(await res.text())

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
    if (!policyRes.ok) throw new Error(await policyRes.text())
  }

  // Regenerate the PDF so it never drifts from the numbers now on record.
  const bankProfile = await getBankProfileForCurrency(update.currency)
  const pdfBuffer = await renderDebitNotePdf({
    debitNoteNo, issueDate: update.issue_date,
    coverNoteNo: policy?.cover_note_no ?? null, policyNumber: policy?.policy_number ?? null,
    clientName: before.companies?.name ?? '—', clientAddress: before.companies?.address ?? null,
    clientContactName: [before.contacts?.first_name, before.contacts?.last_name].filter(Boolean).join(' ') || null,
    classOfInsurance: policy?.class_of_insurance ?? null,
    periodStart: policy?.start_date ?? null, periodEnd: policy?.end_date ?? null,
    insurer: update.insurer, description: policy?.description ?? null,
    currency: update.currency, lineItems, gstAmount, feeRebate: update.fee_rebate,
    total: grossAmount - (update.fee_rebate ?? 0),
    bankProfile,
    paymentDueDate: update.payment_due_date,
    eventType: update.event_type as EventType, endorsementEffectiveDate: update.endorsement_effective_date,
  })
  // The file sits at a path named for the number, so the stored filename never disagrees with
  // the number printed on the PDF. Same number: the same Drive file is overwritten (same ref).
  // Renumbering: a new file, and the old one is trashed.
  const pdfPath = await uploadPdf(`${before.company_id}/${storageKeySegment(debitNoteNo)}.pdf`, pdfBuffer)
  if (pdfPath !== before.pdf_storage_url) {
    await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ pdf_storage_url: pdfPath }) })
    if (before.pdf_storage_url) await deleteObject(before.pdf_storage_url)
  }

  void logActivity({ action: 'debit_note.updated', resource_type: 'debit_note', resource_id: id, old_value: { status: before.status, gross_amount: before.gross_amount, debit_note_no: before.debit_note_no }, new_value: { status: update.status, gross_amount: grossAmount, debit_note_no: debitNoteNo } })

  const downloadUrl = await signRead(pdfPath)
  return ({ ok: true, downloadUrl })
}

/** Deletes a debit note and its PDF; the policy goes too when no other note is on it. */
export async function deleteDebitNote(id: string) {
  const before = await loadFull(id)
  if (!before) throw new Error('Not found')

  const res = await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${id}`, { method: 'DELETE', headers: sbH() })
  if (!res.ok) throw new Error(await res.text())

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

  return ({ ok: true })
}

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
    gstAmount?: number | null; feeRebate?: number | null; commissionRate?: number | null; commission?: number | null
    debitNoteNo?: string | null
    issueDate: string; paymentDueDate?: string | null; insurer?: string | null
    eventType?: 'new_business' | 'renewal' | 'endorsement'; endorsementEffectiveDate?: string | null
    origin?: 'new' | 'historical'
  }
}

type MemberFile = { id: string; storage_url: string; original_filename: string | null; doc_type: string | null }

export type BundleApproval = Body

/** Approves an imported bundle: issues the debit note from what was read, keeps the source files. */
export async function approveBundle(id: string, body: Body, actor: string) {
  if (!body.company || !body.policy?.insurer || !body.debitNote?.lineItems?.length) {
    throw new Error('company, policy.insurer and at least one line item are required')
  }

  const bundleRes = await fetch(`${SB_URL}/rest/v1/debit_note_bundles?id=eq.${id}&select=id,status`, { headers: sbH(), cache: 'no-store' })
  const bundle = bundleRes.ok ? (await bundleRes.json())[0] : null
  if (!bundle) throw new Error('Not found')
  if (bundle.status === 'approved') throw new Error('Already approved')

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
  const contactName = body.contact && 'name' in body.contact ? (body.contact.name ?? null)
    : result.contactId
      ? await fetch(`${SB_URL}/rest/v1/contacts?id=eq.${result.contactId}&select=first_name,last_name&limit=1`, { headers: sbH(), cache: 'no-store' })
          .then(r => r.ok ? r.json() : null)
          .then(rows => rows?.[0] ? [rows[0].first_name, rows[0].last_name].filter(Boolean).join(' ') || null : null)
      : null

  // Generate the TRS-branded PDF from the confirmed fields.
  const bankProfile = await getBankProfileForCurrency(body.debitNote.currency)
  const pdfBuffer = await renderDebitNotePdf({
    debitNoteNo: result.debitNoteNo, issueDate: body.debitNote.issueDate,
    coverNoteNo: body.policy.coverNoteNo ?? null, policyNumber: body.policy.policyNumber ?? null,
    clientName: companyName, clientAddress: companyRow?.address ?? null,
    clientContactName: contactName,
    classOfInsurance: body.policy.classOfInsurance ?? null,
    periodStart: body.policy.startDate ?? null, periodEnd: body.policy.endDate ?? null,
    insurer: body.debitNote.insurer ?? body.policy.insurer, description: body.policy.description ?? null,
    currency: body.debitNote.currency, lineItems: body.debitNote.lineItems,
    gstAmount: body.debitNote.gstAmount ?? null, feeRebate: body.debitNote.feeRebate ?? null,
    total: result.grossAmount - (body.debitNote.feeRebate ?? 0),
    bankProfile,
    paymentDueDate: body.debitNote.paymentDueDate ?? null,
    eventType: body.debitNote.eventType, endorsementEffectiveDate: body.debitNote.endorsementEffectiveDate ?? null,
  })
  const pdfPath = await uploadPdf(`${result.companyId}/${storageKeySegment(result.debitNoteNo)}.pdf`, pdfBuffer)

  const attachmentFiles: AttachmentFileRef[] = [
    ...members.map(m => ({ filename: m.original_filename ?? 'document.pdf', storage_url: m.storage_url, source: (m.doc_type ?? 'other') as AttachmentFileRef['source'] })),
    { filename: `${result.debitNoteNo}.pdf`, storage_url: pdfPath, source: 'generated' as const },
  ]

  let driveFolderUrl: string | null = null
  try {
    // Files land flat in the company folder (no per-policy subfolder), so every filename is
    // prefixed with the debit note number — otherwise two renewals both handing over a
    // "Tax Invoice.pdf" would sit side by side with no way to tell them apart.
    const driveFiles = await Promise.all([
      ...members.map(async m => {
        // Throws NEVER_STORED for a file that was never stored, so nothing empty is filed.
        return { name: `${result.debitNoteNo} - ${m.original_filename ?? 'document.pdf'}`, mimeType: 'application/pdf', bytes: await downloadObject(m.storage_url) }
      }),
      Promise.resolve({ name: `${result.debitNoteNo}.pdf`, mimeType: 'application/pdf', bytes: pdfBuffer }),
    ])
    driveFolderUrl = await archiveDebitNoteToDrive(companyName, driveFiles)
  } catch (e) {
    // Drive archival is best-effort — most likely cause is GDRIVE_* env vars not configured yet.
    console.error('Drive archival failed (approval still succeeds):', e)
  }

  await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${result.debitNoteId}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ pdf_storage_url: pdfPath }) })
  await attachDebitNoteArchival(result.debitNoteId, { driveFolderUrl, attachmentFiles, bundleId: id })
  try { await closeLineForDebitNote(result.debitNoteId, actor) }
  catch (e) { console.error('[debit-notes] closing the quote request line failed:', e) }
  // A bundle raised from an insurer's member-movement note: link the TRS note, mark the movements billed.
  try { await billedFromBundle(id, result.debitNoteId, result.debitNoteNo) }
  catch (e) { console.error('[debit-notes] movement billing link failed:', e) }

  await fetch(`${SB_URL}/rest/v1/debit_note_bundles?id=eq.${id}`, {
    method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'approved', resolved_debit_note_id: result.debitNoteId }),
  })

  void logActivity({ action: 'debit_note_bundle.approved', resource_type: 'debit_note_bundle', resource_id: id, new_value: { debit_note_id: result.debitNoteId, debit_note_no: result.debitNoteNo, drive_archived: !!driveFolderUrl } })

  const downloadUrl = await signRead(pdfPath)
  return ({ ...result, downloadUrl, driveFolderUrl })
}

type AttachmentFile = { filename?: string | null; storage_url: string }

/** Zips chosen documents of a debit note into one email attachment. */
export async function zipDebitNoteDocuments(id: string, storageUrls: string[] | undefined) {
  if (!storageUrls?.length) throw new Error('storageUrls required')

  const dnRes = await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${id}&select=debit_note_no,attachment_files&limit=1`, { headers: sbH(), cache: 'no-store' })
  const dn = dnRes.ok ? (await dnRes.json())[0] : null
  if (!dn) throw new Error('Not found')

  const files = new Map((dn.attachment_files as AttachmentFile[] ?? []).map(f => [f.storage_url, f]))
  const invalid = storageUrls.filter(u => !files.has(u))
  if (invalid.length) throw new Error(`Not attached to this debit note: ${invalid.join(', ')}`)

  const zip = new AdmZip()
  const used = new Set<string>()
  for (const ref of storageUrls) {
    const name = files.get(ref)!.filename || (ref.startsWith('drivefile:') ? 'document' : ref.split('/').pop()) || 'document'
    let bytes: Buffer
    try { bytes = await downloadObject(ref) }
    catch (e) { throw new Error(`${name}: ${e instanceof Error ? e.message : 'could not be read'}`) }
    zip.addFile(uniqueIn(used, name), bytes)
  }

  const filename = `${dn.debit_note_no}-documents.zip`
  const storageUrl = await storeUpload('email-outgoing', storageKeySegment(filename), 'application/zip', zip.toBuffer())
  return ({ filename, mime_type: 'application/zip', storage_url: storageUrl })
}

function uniqueIn(used: Set<string>, name: string): string {
  let out = name
  for (let n = 2; used.has(out); n++) out = name.replace(/(\.[^.]*)?$/, m => ` (${n})${m}`)
  used.add(out)
  return out
}

/** Opens an uploaded zip, stores each PDF in it as a file of one new bundle, and drops the zip. */
export async function bundleFromZip(storageUrl: string | undefined) {
  if (!storageUrl) throw new Error('storage_url required')

  const zipBytes = await downloadObject(storageUrl)
  const zip = new AdmZip(zipBytes)
  const pdfEntries = zip.getEntries().filter(e => !e.isDirectory && e.entryName.toLowerCase().endsWith('.pdf'))
  if (!pdfEntries.length) throw new Error('No PDF files found inside that zip')

  const bundleRes = await fetch(`${SB_URL}/rest/v1/debit_note_bundles`, {
    method: 'POST', headers: sbH(), body: JSON.stringify({ status: 'pending', source: 'manual_upload' }),
  })
  if (!bundleRes.ok) throw new Error(await bundleRes.text())
  const bundle = (await bundleRes.json())[0]

  for (const entry of pdfEntries) {
    const filename = entry.entryName.split('/').pop() ?? entry.entryName
    const ref = await storeImportFile(filename, entry.getData())
    const itemRes = await fetch(`${SB_URL}/rest/v1/pdf_import_items`, {
      method: 'POST', headers: sbH(),
      body: JSON.stringify({ bundle_id: bundle.id, storage_url: ref, original_filename: filename, status: 'pending' }),
    })
    if (!itemRes.ok) throw new Error(`Could not record ${filename}: ${(await itemRes.text()).slice(0, 200)}`)
  }

  await deleteObject(storageUrl)

  return ({ id: bundle.id, fileCount: pdfEntries.length })
}

type ReconRow = DebitNoteRow & {
  companies: { company_name: string | null } | null
  policies:  { policy_number: string | null; class_of_insurance: string | null } | null
}

const SELECT = [
  'id,company_id,contact_id,policy_id,debit_note_no,issue_date,payment_due_date,currency',
  'gross_amount,net_amount,commission,paid_amount,paid_direct_amount,status,paid_direct_status',
  'pay_direct_to_insurer,insurer,event_type,drive_folder_url,updated_at',
  'companies(company_name),policies(policy_number,class_of_insurance)',
].join(',')

/** Every debit note with what is owed on it, receipts, totals billed and collected per currency. */
export async function reconciliation(includeSettled: boolean) {

  const rows = await sbTry<ReconRow[]>(
    `debit_notes?select=${SELECT}&order=payment_due_date.asc.nullslast,issue_date.asc&limit=500`,
    [],
  )

  const all = rows.map(r => ({
    ...derivePayment({
      ...r,
      policyNumber: r.policies?.policy_number ?? null,
      classOfInsurance: r.policies?.class_of_insurance ?? null,
    }),
    companyName: r.companies?.company_name ?? null,
  }))

  const open = all.filter(n => n.outstanding > 0)
  const settled = all.filter(n => n.outstanding <= 0)
  const notes = includeSettled ? all : open

  const receipts = await listReceipts(notes.map(n => n.id))

  // Billed and collected across everything, so the page can show progress rather than just
  // a large red number.
  const billed = new Map<string, number>()
  const collected = new Map<string, number>()
  for (const n of all) {
    const total = Number(n.net_amount ?? n.gross_amount ?? 0)
    const paid = Number(n.paid_amount ?? 0) + Number(n.paid_direct_amount ?? 0)
    billed.set(n.currency, Math.round(((billed.get(n.currency) ?? 0) + total) * 100) / 100)
    collected.set(n.currency, Math.round(((collected.get(n.currency) ?? 0) + paid) * 100) / 100)
  }

  return ({
    notes: notes.map(n => ({ ...n, receipts: receipts.get(n.id) ?? [] })),
    summary: summarizePayments(open),
    totals: Array.from(billed.entries()).map(([currency, amount]) => ({
      currency,
      billed: amount,
      collected: collected.get(currency) ?? 0,
    })).sort((a, b) => (a.currency === 'SGD' ? -1 : b.currency === 'SGD' ? 1 : a.currency.localeCompare(b.currency))),
    counts: { open: open.length, settled: settled.length, total: all.length },
    ledgerReady: await ledgerAvailable(),
  })
}

type LookupRow = PolicyLike & { id: string; start_date: string | null; end_date: string | null; policy_number: string | null; class_of_insurance: string | null }

export type PolicyLookup = { policy_number?: string; company_id?: string; class_of_insurance?: string; period_end?: string; list?: boolean }

/** A policy by number, or the master policy an endorsement belongs to; `list` gives a company's policies. */
export async function lookupPolicy(q: PolicyLookup) {
  const policyNumber = q.policy_number?.trim() || null
  const companyId = q.company_id?.trim() || null
  const classOfInsurance = q.class_of_insurance?.trim() || null
  const periodEnd = q.period_end?.trim() || null
  const wantsList = q.list === true

  const companyPolicies = async (id: string) => {
    const res = await fetch(`${SB_URL}/rest/v1/customers?company_id=eq.${encodeURIComponent(id)}&select=policies(id,policy_number,class_of_insurance,description,start_date,end_date,status)`, { headers: sbH(), cache: 'no-store' })
    const customers: { policies: (LookupRow & { status: string })[] | null }[] = res.ok ? await res.json() : []
    return customers.flatMap(c => c.policies ?? []).filter(p => p.status === 'active')
  }

  if (wantsList) {
    if (!companyId) return ([])
    const rows = (await companyPolicies(companyId))
      .filter(p => !looksLikeEndorsement(p))
      .sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''))
      .map(p => ({ id: p.id, policyNumber: p.policy_number, classOfInsurance: p.class_of_insurance, startDate: p.start_date, endDate: p.end_date }))
    return (rows)
  }

  if (!policyNumber && !(companyId && (classOfInsurance || periodEnd))) return (null)

  const respond = async (policy: LookupRow, matchedBy: 'number' | 'base' | 'term') => {
    const dnRes = await fetch(`${SB_URL}/rest/v1/debit_notes?policy_id=eq.${policy.id}&select=id&limit=1`, { headers: sbH(), cache: 'no-store' })
    const hasDebitNotes = dnRes.ok && (await dnRes.json()).length > 0
    return ({ id: policy.id, policyNumber: policy.policy_number, classOfInsurance: policy.class_of_insurance, startDate: policy.start_date, endDate: policy.end_date, hasDebitNotes, matchedBy })
  }

  if (policyNumber) {
    const res = await fetch(`${SB_URL}/rest/v1/policies?policy_number=eq.${encodeURIComponent(policyNumber)}&select=id,policy_number,class_of_insurance,description,start_date,end_date&limit=1`, { headers: sbH(), cache: 'no-store' })
    const exact: LookupRow | undefined = res.ok ? (await res.json())[0] : undefined
    if (exact) return respond(exact, 'number')
  }

  if (!companyId) return (null)
  const policies = await companyPolicies(companyId)
  const master = findMasterPolicy({ policy_number: policyNumber, class_of_insurance: classOfInsurance, end_date: periodEnd }, policies)
  if (!master) return (null)
  return respond(master, hasEndorsementSuffix(policyNumber) ? 'base' : 'term')
}
