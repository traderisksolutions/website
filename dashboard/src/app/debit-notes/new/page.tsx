'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, UploadCloud, Loader2, CheckCircle2, XCircle, AlertTriangle, FileText, Download, Send, Save, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { CompanyContactPicker, type PickerValue } from '@/components/company-contact-picker/CompanyContactPicker'
import { useAutoMatchCompany } from '@/components/company-contact-picker/useAutoMatchCompany'
import { SendDocumentsModal, type SendDocumentsTarget } from '@/components/debit-notes/SendDocumentsModal'
import { DebitNotePreviewPanel } from '@/components/debit-notes/DebitNotePreviewPanel'
import type { ExtractedDebitNote, DocType } from '@/lib/debit-note-extract'
import type { DebitNotePdfData, DebitNoteBankProfile } from '@/lib/debit-note-pdf'

type MemberFile = { id: string; storage_url: string; original_filename: string | null; doc_type: DocType | null; status: string; error_message: string | null }
type Bundle = {
  id: string; status: 'pending' | 'extracting' | 'needs_review' | 'error' | 'approved' | 'rejected'
  source: 'manual_upload' | 'onedrive'; merged: ExtractedDebitNote | null; consistency_warning: string | null
  suggested_company_id: string | null; match_confidence: number | null
  companies: { id: string; name: string } | null
  pdf_import_items: MemberFile[]
}

const DOC_TYPE_LABEL: Record<DocType, string> = {
  client_invoice: 'Client invoice', commission_statement: 'Commission statement', trs_debit_note: 'TRS debit note', other: 'Other',
}

export default function NewDebitNotePage() {
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loadingBundles, setLoadingBundles] = useState(true)
  const [progress, setProgress] = useState<{ total: number; done: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadBundles = useCallback(() => {
    setLoadingBundles(true)
    fetch('/api/debit-notes/imports/bundles', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: Bundle[]) => setBundles(Array.isArray(rows) ? rows.filter(b => b.status !== 'approved' && b.status !== 'rejected') : []))
      .finally(() => setLoadingBundles(false))
  }, [])
  useEffect(loadBundles, [loadBundles])

  // Extraction runs server-side after the upload response returns, so without this the screen
  // would show "still extracting" forever until the user manually reloads the page.
  useEffect(() => {
    if (!bundles.some(b => b.status === 'pending' || b.status === 'extracting')) return
    const t = setInterval(loadBundles, 4000)
    return () => clearInterval(t)
  }, [bundles, loadBundles])

  async function extractBundle(id: string) {
    await fetch(`/api/debit-notes/imports/bundles/${id}/extract`, { method: 'POST' })
  }

  async function uploadOne(file: File): Promise<{ storage_url: string; original_filename: string }> {
    const supabase = createClient()
    const uu = await fetch('/api/debit-notes/imports/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name }) })
    const ud = await uu.json()
    if (!uu.ok) throw new Error(ud.error ?? `Could not start upload for ${file.name}`)
    const { error: upErr } = await supabase.storage.from('debit-notes').uploadToSignedUrl(ud.path, ud.token, file, { contentType: file.type || 'application/octet-stream' })
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`)
    return { storage_url: ud.path, original_filename: file.name }
  }

  async function onAddBundle(files: FileList | null) {
    if (!files || files.length === 0) return
    const all = Array.from(files)

    // A single .zip already has both files packed together.
    if (all.length === 1 && (all[0].type === 'application/zip' || all[0].name.toLowerCase().endsWith('.zip'))) {
      setError(null); setProgress({ total: 1, done: 0 })
      try {
        const uploaded = await uploadOne(all[0])
        setProgress({ total: 1, done: 1 })
        const created = await fetch('/api/debit-notes/imports/bundles/from-zip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(uploaded) })
        const bundle = await created.json()
        if (!created.ok) throw new Error(bundle.error ?? 'Could not unpack the zip')
        await extractBundle(bundle.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed')
      } finally {
        setProgress(null)
        loadBundles()
      }
      return
    }

    const list = all.slice(0, 2).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (!list.length) { setError('Only PDF (or a single .zip containing them) are accepted.'); return }
    setError(null); setProgress({ total: list.length, done: 0 })
    try {
      const uploaded: { storage_url: string; original_filename: string }[] = []
      for (const file of list) {
        uploaded.push(await uploadOne(file))
        setProgress(p => p && { ...p, done: p.done + 1 })
      }
      const created = await fetch('/api/debit-notes/imports/bundles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: uploaded }) })
      const bundle = await created.json()
      if (!created.ok) throw new Error(bundle.error ?? 'Could not register the bundle')
      await extractBundle(bundle.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setProgress(null)
      loadBundles()
    }
  }

  const needsReview = bundles.filter(b => b.status === 'needs_review' || b.status === 'error')
  const inFlight = bundles.filter(b => b.status === 'pending' || b.status === 'extracting')
  const [cancelling, setCancelling] = useState<string | null>(null)

  async function cancelBundle(id: string) {
    setCancelling(id)
    try {
      await fetch(`/api/debit-notes/imports/bundles/${id}/reject`, { method: 'POST' })
      loadBundles()
    } finally { setCancelling(null) }
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 sm:px-12 pt-10 pb-20" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: '#202124' }}>
      <Link href="/debit-notes" className="inline-flex items-center gap-1.5 text-[13.5px] text-[#5f6368] hover:text-[#202124] no-underline mb-4"><ArrowLeft size={14} /> Debit Notes</Link>
      <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08] text-[#202124] mb-2">Generate a new debit note</h1>
      <p className="m-0 text-[15px] text-[#5f6368] mb-6 max-w-[72ch]">
        A new renewal or new-business event is 2 files from the insurer: the tax invoice
        addressed to the client, and the commission statement addressed to TRS. Upload both — AI
        reads them, you confirm, and we generate the TRS-branded debit note.
      </p>

      <div className="flex items-center gap-3 mb-6">
        <label className="flex-1">
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf,.zip,application/zip" multiple className="hidden"
            onChange={e => { onAddBundle(e.target.files); e.target.value = '' }} />
          <Button onClick={() => fileInputRef.current?.click()} className="w-full" disabled={!!progress}>
            <UploadCloud size={14} className="mr-1.5" /> + Upload the 2 insurer files (or one .zip)
          </Button>
        </label>
      </div>

      {progress && (
        <div className="mb-6 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <Loader2 size={13} className="animate-spin" /> Uploading {progress.done}/{progress.total}…
        </div>
      )}
      {error && <p className="mb-6 text-[11.5px] text-[#3c4043] whitespace-pre-wrap">{error}</p>}
      {inFlight.length > 0 && (
        <div className="mb-4 flex flex-col gap-1.5">
          {inFlight.map(b => (
            <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-[--border-subtle] px-3 py-1.5 text-[11.5px] text-muted-foreground">
              <span className="flex items-center gap-1.5 truncate">
                <Loader2 size={11} className="animate-spin flex-shrink-0" />
                {b.pdf_import_items.map(it => it.original_filename).filter(Boolean).join(', ') || 'Extracting…'}
              </span>
              <button
                onClick={() => cancelBundle(b.id)}
                disabled={cancelling === b.id}
                className="flex-shrink-0 text-[11px] text-[#3c4043] hover:underline disabled:opacity-50"
              >
                {cancelling === b.id ? 'Cancelling…' : 'Cancel'}
              </button>
            </div>
          ))}
        </div>
      )}

      <h2 className="m-0 text-[22px] font-medium tracking-[-0.02em] mb-3">Review queue {needsReview.length > 0 && `(${needsReview.length})`}</h2>
      {loadingBundles ? (
        <p className="text-[12.5px] text-muted-foreground">Loading…</p>
      ) : needsReview.length === 0 ? (
        <p className="text-[14px] text-[#5f6368] py-10 text-center rounded-[16px]" style={{ background: '#F5F5F3' }}>Nothing waiting on review.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {needsReview.map(b => <BundleReviewCard key={b.id} bundle={b} onResolved={loadBundles} />)}
        </div>
      )}
    </div>
  )
}

// ── Bundle review card ──────────────────────────────────────────────────────────────────────
const inp = 'h-10 text-[14px] text-[#202124] border border-[#dadce0] rounded-[10px] px-3 bg-white focus:outline-none focus:border-[#202124] w-full'

type ApprovedResult = { debitNoteId: string; debitNoteNo: string; downloadUrl: string; driveFolderUrl: string | null }
type EventType = 'new_business' | 'renewal' | 'endorsement'
type PolicyLookup = { id: string; policyNumber: string | null; classOfInsurance: string | null; startDate: string | null; endDate: string | null; hasDebitNotes: boolean; matchedBy: 'number' | 'base' | 'term' } | null

function BundleReviewCard({ bundle, onResolved }: { bundle: Bundle; onResolved: () => void }) {
  const m = bundle.merged
  const [recipient, setRecipient] = useState<PickerValue | null>(
    bundle.companies ? { companyId: bundle.companies.id, companyName: bundle.companies.name, contactId: null, contactEmail: null, contactName: null } : null,
  )
  // The extracted client name picks the company when it matches one exactly; otherwise it
  // prefills the picker below so the reviewer confirms or creates in one click.
  useAutoMatchCompany(m?.client_name, recipient, setRecipient)
  const [policyNumber, setPolicyNumber] = useState(m?.policy_number ?? '')
  const [coverNoteNo, setCoverNoteNo] = useState(m?.cover_note_no ?? '')
  const [insurer, setInsurer] = useState(m?.insurer ?? '')
  const [classOfInsurance, setClassOfInsurance] = useState(m?.class_of_insurance ?? '')
  const [currency, setCurrency] = useState(m?.currency ?? 'SGD')
  const [description, setDescription] = useState(m?.description ?? '')
  const [periodStart, setPeriodStart] = useState(m?.period_start ?? '')
  const [periodEnd, setPeriodEnd] = useState(m?.period_end ?? '')
  const [grossPremium, setGrossPremium] = useState(m?.gross_premium ?? 0)
  const [gstAmount, setGstAmount] = useState(m?.gst_amount ?? 0)
  const [feeRebateEnabled, setFeeRebateEnabled] = useState(!!m?.fee_rebate)
  const [feeRebate, setFeeRebate] = useState(m?.fee_rebate ?? 0)
  const [commissionRate, setCommissionRate] = useState(m?.commission_rate ?? 0)
  const [commissionAmount, setCommissionAmount] = useState(m?.commission_amount ?? 0)
  const [issueDate, setIssueDate] = useState(m?.issue_date || new Date().toISOString().slice(0, 10))
  const [paymentDueDate, setPaymentDueDate] = useState(m?.payment_due_date ?? '')
  const [debitNoteNo, setDebitNoteNo] = useState('')
  const [debitNoteNoTouched, setDebitNoteNoTouched] = useState(false)
  const [eventType, setEventType] = useState<EventType>('new_business')
  const [eventTypeTouched, setEventTypeTouched] = useState(false)
  const [endorsementEffectiveDate, setEndorsementEffectiveDate] = useState('')
  /** The main policy this endorsement amends; the debit note attaches to it and keeps its renewal date. */
  const [masterPolicy, setMasterPolicy] = useState<PolicyLookup | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [approved, setApproved] = useState<ApprovedResult | null>(null)
  const [sendTarget, setSendTarget] = useState<SendDocumentsTarget | null>(null)
  const [retrying, setRetrying] = useState(false)

  // Preview PDF — re-fetches bankProfile/company (currency- and recipient-dependent, both need
  // the service key so can't be looked up client-side) whenever either changes, then rebuilds the
  // PDF data. Debounced so typing a premium doesn't rebuild the PDF on every keystroke.
  const [bankProfile, setBankProfile] = useState<DebitNoteBankProfile | null>(null)
  const [company, setCompany] = useState<{ name: string; address: string | null } | null>(null)
  // Whether the real logo/PayNow-QR assets exist server-side (public/debit-note/) — confirmed via
  // existsSync on the server, since the browser can't check the filesystem itself. Currency-
  // independent, but re-fetched alongside bankProfile/company since they share one request.
  const [assets, setAssets] = useState<{ hasLogo: boolean; hasQr: boolean }>({ hasLogo: false, hasQr: false })
  const [previewData, setPreviewData] = useState<DebitNotePdfData | null>(null)

  useEffect(() => {
    const params = new URLSearchParams({ currency })
    if (recipient?.companyId) params.set('companyId', recipient.companyId)
    fetch(`/api/debit-notes/preview-context?${params}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setBankProfile(d?.bankProfile ?? null)
        setCompany(d?.company ?? null)
        setAssets(d?.assets ?? { hasLogo: false, hasQr: false })
      })
      .catch(() => {})
  }, [currency, recipient?.companyId])

  useEffect(() => {
    if (!bankProfile) return
    const net = grossPremium + gstAmount - (feeRebateEnabled ? feeRebate : 0)
    const t = setTimeout(() => {
      setPreviewData({
        debitNoteNo: debitNoteNo || '(pending)',
        issueDate: issueDate || new Date().toISOString().slice(0, 10),
        coverNoteNo, policyNumber,
        clientName: company?.name ?? recipient?.companyName ?? '',
        clientAddress: company?.address ?? null,
        clientContactName: recipient?.contactName ?? null,
        classOfInsurance, periodStart, periodEnd, insurer, description, currency,
        // GST-inclusive — GST itself is never printed (the client isn't GST-registered, see
        // debit-note-pdf.tsx's top comment), but the line item must still show what it actually
        // collects so the printed lines sum to Premium Total instead of silently being short by
        // the GST amount folded invisibly into the total.
        lineItems: [{ description: 'Gross Premium collected on behalf of Insurance Company', amount: grossPremium + gstAmount }],
        gstAmount, feeRebate: feeRebateEnabled ? feeRebate : null, total: net,
        bankProfile, paymentDueDate, eventType,
        endorsementEffectiveDate: eventType === 'endorsement' ? endorsementEffectiveDate : null,
      })
    }, 400)
    return () => clearTimeout(t)
  }, [
    bankProfile, company, recipient, debitNoteNo, issueDate, coverNoteNo, policyNumber,
    classOfInsurance, periodStart, periodEnd, insurer, description, currency,
    grossPremium, gstAmount, feeRebateEnabled, feeRebate, paymentDueDate, eventType, endorsementEffectiveDate,
  ])

  async function retryExtraction() {
    setRetrying(true); setErr(null)
    try {
      const res = await fetch(`/api/debit-notes/imports/bundles/${bundle.id}/extract`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Extraction failed again')
      onResolved()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not retry extraction') } finally { setRetrying(false) }
  }

  // Auto-suggest "Endorsement" when this policy number already has a debit note on record and
  // the period hasn't changed (same term being billed again — e.g. an employee added mid-year),
  // vs. "Renewal" when the period has moved on. Never overrides a manual pick.
  useEffect(() => {
    if (eventTypeTouched || !policyNumber.trim()) return
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/policies/lookup?policy_number=${encodeURIComponent(policyNumber.trim())}`, { cache: 'no-store' })
        const found = res.ok ? await res.json() as PolicyLookup : null
        if (!found?.hasDebitNotes) return
        const samePeriod = found.startDate === (periodStart || null) && found.endDate === (periodEnd || null)
        setEventType(samePeriod ? 'endorsement' : 'renewal')
      } catch { /* best-effort suggestion only */ }
    }, 500)
    return () => clearTimeout(t)
  }, [policyNumber, periodStart, periodEnd, eventTypeTouched])

  // An endorsement is an amendment to the main policy: find it (same base number, or the one
  // policy with the same term end and class) so the debit note attaches to it instead of
  // creating a second policy with a second renewal.
  useEffect(() => {
    if (eventType !== 'endorsement' || !recipient?.companyId) { setMasterPolicy(null); return }
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ company_id: recipient.companyId! })
        if (policyNumber.trim()) qs.set('policy_number', policyNumber.trim())
        if (classOfInsurance.trim()) qs.set('class_of_insurance', classOfInsurance.trim())
        if (periodEnd) qs.set('period_end', periodEnd)
        const res = await fetch(`/api/policies/lookup?${qs}`, { cache: 'no-store' })
        const found = res.ok ? await res.json() as PolicyLookup | null : null
        setMasterPolicy(found && found.id ? found : null)
      } catch { setMasterPolicy(null) }
    }, 400)
    return () => clearTimeout(t)
  }, [eventType, recipient?.companyId, policyNumber, classOfInsurance, periodEnd])

  // Preview the debit note number this will actually generate as — a live suggestion the
  // reviewer can confirm or override before approving, not just found out after the fact.
  // Never overrides a manual edit; re-suggests when the issue date changes since the number is
  // date-based.
  useEffect(() => {
    if (debitNoteNoTouched || !issueDate) return
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/debit-notes/next-number?issueDate=${encodeURIComponent(issueDate)}`, { cache: 'no-store' })
        const data = res.ok ? await res.json() as { debitNoteNo?: string } : null
        if (data?.debitNoteNo) setDebitNoteNo(data.debitNoteNo)
      } catch { /* best-effort suggestion only */ }
    }, 400)
    return () => clearTimeout(t)
  }, [issueDate, debitNoteNoTouched])

  function currentMerged(): ExtractedDebitNote {
    return {
      doc_type: m?.doc_type ?? 'other', debit_note_no: null,
      policy_number: policyNumber || null, cover_note_no: coverNoteNo || null,
      insurer: insurer || null, class_of_insurance: classOfInsurance || null,
      currency, description: description || null, period_start: periodStart || null, period_end: periodEnd || null,
      gross_premium: grossPremium || null, gst_amount: gstAmount || null,
      fee_rebate: feeRebateEnabled ? (feeRebate || null) : null,
      commission_rate: commissionRate || null, commission_amount: commissionAmount || null,
      client_name: m?.client_name ?? null, client_address: m?.client_address ?? null,
      issue_date: issueDate || null, payment_due_date: paymentDueDate || null,
    }
  }

  async function saveDraft() {
    setSaving(true); setErr(null); setSaved(false)
    try {
      const res = await fetch(`/api/debit-notes/imports/bundles/${bundle.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merged: currentMerged() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save draft')
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save draft') } finally { setSaving(false) }
  }

  async function approve() {
    if (!recipient?.companyId || !insurer.trim() || !grossPremium) { setErr('Company, insurer and a premium amount are required.'); return }
    if (eventType === 'endorsement' && !endorsementEffectiveDate) { setErr('Effective date is required for a mid-term endorsement.'); return }
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/debit-notes/imports/bundles/${bundle.id}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: { companyId: recipient.companyId },
          contact: recipient.contactId ? { contactId: recipient.contactId } : null,
          policy: eventType === 'endorsement' && masterPolicy ? { policyId: masterPolicy.id } : {
            policyNumber: policyNumber || null, coverNoteNo: coverNoteNo || null, insurer,
            classOfInsurance: classOfInsurance || null, currency, description: description || null,
            startDate: periodStart || null, endDate: periodEnd || null,
          },
          debitNote: {
            // GST-inclusive line — see the matching comment on the preview builder above; must
            // stay identical to it, or the live preview would show a different number than the
            // real PDF this actually generates.
            currency, lineItems: [{ description: 'Gross Premium collected on behalf of Insurance Company', amount: grossPremium + gstAmount }],
            gstAmount: gstAmount || null, feeRebate: feeRebateEnabled ? (feeRebate || null) : null,
            commissionRate: commissionRate || null, commission: commissionAmount || null,
            debitNoteNo: debitNoteNo.trim() || null,
            issueDate: issueDate || new Date().toISOString().slice(0, 10), paymentDueDate: paymentDueDate || null, insurer,
            eventType, endorsementEffectiveDate: eventType === 'endorsement' ? endorsementEffectiveDate : null,
            origin: 'new' as const,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not approve')
      setApproved({ debitNoteId: data.debitNoteId, debitNoteNo: data.debitNoteNo, downloadUrl: data.downloadUrl, driveFolderUrl: data.driveFolderUrl ?? null })
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not approve') } finally { setBusy(false) }
  }

  async function reject() {
    setBusy(true)
    await fetch(`/api/debit-notes/imports/bundles/${bundle.id}/reject`, { method: 'POST' })
    setBusy(false); onResolved()
  }

  async function openSend() {
    if (!approved) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/debit-notes/${approved.debitNoteId}`, { cache: 'no-store' })
      const detail = await res.json()
      if (!res.ok) throw new Error(detail.error ?? 'Could not load debit note')
      setSendTarget({
        debitNoteId: approved.debitNoteId, debitNoteNo: approved.debitNoteNo,
        companyName: detail.companies?.name ?? null, contactEmail: detail.contacts?.email ?? null,
        contactName: [detail.contacts?.first_name, detail.contacts?.last_name].filter(Boolean).join(' ') || null,
        attachmentFiles: detail.attachment_files ?? [],
        companyId: detail.company_id ?? null, amount: detail.gross_amount ?? null, currency: detail.currency ?? null, insurer: detail.insurer ?? null,
      })
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load debit note') } finally { setBusy(false) }
  }

  if (approved) {
    return (
      <div className="rounded-[16px] p-6 flex flex-col items-center gap-3 text-center" style={{ background: '#EAF6EC' }}>
        <div className="w-10 h-10 rounded-full bg-[#f1f3f4] flex items-center justify-center"><CheckCircle2 size={20} className="text-[#202124]" /></div>
        <p className="text-[14px] font-semibold">Debit Note {approved.debitNoteNo} generated</p>
        <p className="text-[11.5px] text-[#202124] -mt-1.5">
          This debit note and its documents are now saved in your Debit Notes records
          {approved.driveFolderUrl ? (
            <> and <a href={approved.driveFolderUrl} target="_blank" rel="noreferrer" className="underline hover:no-underline">archived to Google Drive</a>.</>
          ) : '.'}
          {' '}If you close this or the email doesn&rsquo;t go through, it&rsquo;s not lost — you can always come back and resend from here.
        </p>
        <div className="flex items-center gap-2">
          <a href={approved.downloadUrl} target="_blank" rel="noreferrer" className="inline-flex"><Button variant="outline" size="sm"><Download size={13} className="mr-1.5" /> Download PDF</Button></a>
          <Button size="sm" onClick={openSend} disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Send size={13} className="mr-1.5" />} Send documents</Button>
        </div>
        <Link href={`/debit-notes?open=${approved.debitNoteId}`} className="text-[11.5px] text-[#202124] hover:underline">
          View {approved.debitNoteNo} in Debit Notes →
        </Link>
        <Link href="/debit-notes" className="text-[11px] text-muted-foreground hover:text-foreground">Done</Link>
        {sendTarget && <SendDocumentsModal target={sendTarget} onClose={() => setSendTarget(null)} />}
      </div>
    )
  }

  return (
    <div className="rounded-[16px] p-5 flex flex-col gap-4" style={{ border: '1px solid #e8eaed' }}>
      <div className="flex flex-wrap items-center gap-2">
        {bundle.pdf_import_items.map(it => (
          <a key={it.id} href={`/api/debit-notes/imports/items/${it.id}/pdf`} target="_blank" rel="noreferrer"
            title={it.error_message ?? undefined}
            className="flex items-center gap-1.5 text-[13px] px-3 h-9 rounded-[8px] no-underline text-[#202124] hover:bg-[#e8eaed]" style={{ background: '#F1F3F4' }}>
            <FileText size={11} className="text-muted-foreground/60" />
            {it.original_filename ?? 'document.pdf'}
            {it.doc_type && <span className="text-[12px] text-[#5f6368]">{DOC_TYPE_LABEL[it.doc_type]}</span>}
            {it.status === 'error' && <AlertTriangle size={11} className="text-[#3c4043]" />}
          </a>
        ))}
        {bundle.match_confidence != null && (
          <span className="text-[12.5px] text-[#5f6368] ml-auto">match confidence {(bundle.match_confidence * 100).toFixed(0)}%</span>
        )}
      </div>

      <div className="rounded-[10px] p-3 flex flex-col gap-1 font-mono text-[11.5px] text-[#5f6368]" style={{ background: '#F5F5F3' }}>
        <span>bundle status: <b>{bundle.status}</b>{bundle.consistency_warning ? ` · warning: ${bundle.consistency_warning}` : ''}</span>
        {bundle.pdf_import_items.map(it => (
          <span key={it.id}>
            {it.original_filename ?? 'document.pdf'} — status: <b>{it.status}</b>, doc_type: <b>{it.doc_type ?? 'null'}</b>, error: <b className={it.error_message ? 'text-[#3c4043]' : ''}>{it.error_message ?? 'null'}</b>
          </span>
        ))}
      </div>

      {bundle.pdf_import_items.some(it => it.error_message) && (
        <div className="flex flex-col gap-1">
          {bundle.pdf_import_items.filter(it => it.error_message).map(it => (
            <p key={it.id} className="text-[13px] text-[#3c4043] rounded-[10px] px-3 py-2" style={{ background: '#FFF0E7' }}>
              <b>{it.original_filename ?? 'document.pdf'}</b>: {it.error_message}
            </p>
          ))}
        </div>
      )}

      {bundle.status === 'error' && (
        <Button variant="outline" size="sm" onClick={retryExtraction} disabled={retrying} className="self-start">
          {retrying ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <RefreshCw size={13} className="mr-1.5" />} Retry extraction
        </Button>
      )}

      {bundle.consistency_warning && (
        <div className="flex items-start gap-1.5 text-[13px] text-[#3c4043] rounded-[10px] px-3 py-2" style={{ background: '#FFF6D8' }}>
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {bundle.consistency_warning}
        </div>
      )}

      <CompanyContactPicker value={recipient} onChange={setRecipient} initialQuery={!recipient ? (m?.client_name ?? undefined) : undefined} />

      <div className="rounded-[12px] p-4 flex flex-col gap-3" style={{ background: eventType === 'endorsement' ? '#FFF6D8' : '#F5F5F3' }}>
        <div className="flex items-center gap-2">
          <Field label="Debit note type" className="flex-1">
            <select
              value={eventType}
              onChange={e => { setEventType(e.target.value as EventType); setEventTypeTouched(true) }}
              className={inp}
            >
              <option value="new_business">New business</option>
              <option value="renewal">Renewal</option>
              <option value="endorsement">Mid-term endorsement</option>
            </select>
          </Field>
          {eventType === 'endorsement' && (
            <p className="m-0 text-[13.5px] leading-snug" style={{ color: '#3c4043' }}>
              {masterPolicy
                ? <>Amendment to policy <span className="font-medium">{masterPolicy.policyNumber ?? masterPolicy.classOfInsurance ?? 'on file'}</span>{masterPolicy.endDate ? <> · renews {new Date(masterPolicy.endDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</> : null}. This debit note attaches to that policy and keeps its renewal date.</>
                : <>No main policy found for this company yet. Approving creates the policy from the fields below.</>}
            </p>
          )}
          {eventType === 'endorsement' && (
            <Field label="Effective date (required)" className="flex-1">
              <input type="date" value={endorsementEffectiveDate} onChange={e => setEndorsementEffectiveDate(e.target.value)} className={inp} />
            </Field>
          )}
        </div>
        {eventType === 'endorsement' && (
          <p className="text-[13px] text-[#3c4043]">
            This bills a mid-term change (e.g. an employee added partway through the year) rather than the full policy term shown below — the PDF will call out the effective date separately so the payment due date doesn&apos;t look mismatched against the period of insurance.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {/* Row 1 — reference numbers */}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Debit note no.">
            <input
              value={debitNoteNo}
              onChange={e => { setDebitNoteNo(e.target.value); setDebitNoteNoTouched(true) }}
              placeholder="Suggesting…"
              className={inp}
            />
          </Field>
          <Field label="Policy number"><input value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} className={inp} /></Field>
          <Field label="Cover note no."><input value={coverNoteNo} onChange={e => setCoverNoteNo(e.target.value)} className={inp} /></Field>
        </div>

        {/* Row 2 — insurer & class */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Insurer (required)"><input value={insurer} onChange={e => setInsurer(e.target.value)} className={inp} /></Field>
          <Field label="Class of insurance"><input value={classOfInsurance} onChange={e => setClassOfInsurance(e.target.value)} className={inp} /></Field>
        </div>

        {/* Row 3 — dates */}
        <div className="grid grid-cols-4 gap-2">
          <Field label="Period start"><input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className={inp} /></Field>
          <Field label="Period end (renewal date)"><input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className={inp} /></Field>
          <Field label="Issue date"><input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inp} /></Field>
          <Field label="Payment due date"><input type="date" value={paymentDueDate} onChange={e => setPaymentDueDate(e.target.value)} className={inp} /></Field>
        </div>

        {/* Row 4 — fee rebate toggle */}
        <Field label="Fee rebates" className="max-w-[220px]">
          <label className="flex items-center gap-1.5 text-[12.5px] h-[30px]">
            <input type="checkbox" checked={feeRebateEnabled}
              onChange={e => { setFeeRebateEnabled(e.target.checked); if (!e.target.checked) setFeeRebate(0) }} />
            Apply fee rebate
          </label>
        </Field>

        {/* Row 5 — fee rebate amount (only when applied) — sits above the price row it nets against */}
        {feeRebateEnabled && (
          <Field label="Fee rebate amount" className="max-w-[220px]">
            <input type="number" value={feeRebate} onChange={e => setFeeRebate(Number(e.target.value))} className={inp} />
          </Field>
        )}

        {/* Row 6 — price, with the running total inline at the end of the row */}
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Gross premium (required)" className="flex-1 min-w-[140px]"><input type="number" value={grossPremium} onChange={e => setGrossPremium(Number(e.target.value))} className={inp} /></Field>
          <Field label="GST" className="flex-1 min-w-[140px]"><input type="number" value={gstAmount} onChange={e => setGstAmount(Number(e.target.value))} className={inp} /></Field>
          <Field label="Currency" className="flex-1 min-w-[140px]"><select value={currency} onChange={e => setCurrency(e.target.value)} className={inp}>{['SGD', 'USD', 'MYR', 'IDR'].map(c => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Premium Total" className="flex-1 min-w-[160px]">
            <div className="h-10 text-[14px] text-[#202124] border border-[#dadce0] rounded-[10px] px-3 bg-[#F5F5F3] font-medium flex items-center">
              {currency} {(grossPremium + gstAmount - (feeRebateEnabled ? feeRebate : 0)).toLocaleString('en-SG', { minimumFractionDigits: 2 })}
            </div>
          </Field>
        </div>

        {/* Row 7 — commission (broker's own figure, kept apart from the client-facing premium total above) */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Commission rate (%)"><input type="number" value={commissionRate} onChange={e => setCommissionRate(Number(e.target.value))} className={inp} /></Field>
          <Field label="Commission amount"><input type="number" value={commissionAmount} onChange={e => setCommissionAmount(Number(e.target.value))} className={inp} /></Field>
        </div>

        {/* Row 8 — description */}
        <Field label="Description"><input value={description} onChange={e => setDescription(e.target.value)} className={inp} /></Field>
      </div>

      <div className="text-[13px] flex justify-end">
        <span>Premium Total: <b>{currency} {(grossPremium + gstAmount - (feeRebateEnabled ? feeRebate : 0)).toLocaleString('en-SG', { minimumFractionDigits: 2 })}</b></span>
      </div>

      {/* Preview — the exact document Approve will generate (same DebitNotePdfDocument, same
          data shape), so this never drifts from the real output. Updates on any field change,
          including currency (the bank/PayNow-vs-wire block at the bottom changes with it). */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium tracking-[0.08em] text-[#5f6368]">Preview</span>
        <div className="h-[600px] rounded-lg border border-[--border-subtle] overflow-hidden bg-muted/20">
          <DebitNotePreviewPanel
            data={previewData}
            logoSrc={assets.hasLogo ? '/debit-note/trs-logo.png' : null}
            qrSrc={assets.hasQr ? '/debit-note/paynow-qr.png' : null}
          />
        </div>
      </div>

      {err && <p className="text-[11.5px] text-[#3c4043]">{err}</p>}

      <div className="flex items-center justify-end gap-2">
        {saved && <span className="text-[11.5px] text-[#202124] mr-auto">Draft saved</span>}
        <Button variant="ghost" size="sm" onClick={reject} disabled={busy || saving}><XCircle size={13} className="mr-1.5" /> Reject</Button>
        <Button variant="outline" size="sm" onClick={saveDraft} disabled={busy || saving}>
          {saving ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Save size={13} className="mr-1.5" />} Save draft
        </Button>
        <Button size="sm" onClick={approve} disabled={busy || saving}>{busy ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <CheckCircle2 size={13} className="mr-1.5" />} Approve</Button>
      </div>
    </div>
  )
}
