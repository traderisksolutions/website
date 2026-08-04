'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, UploadCloud, Loader2, CheckCircle2, XCircle, AlertTriangle, FileText, Download, Send, Save, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { CompanyContactPicker, type PickerValue } from '@/components/company-contact-picker/CompanyContactPicker'
import { SendDocumentsModal, type SendDocumentsTarget } from '@/components/debit-notes/SendDocumentsModal'
import type { ExtractedDebitNote, DocType } from '@/lib/debit-note-extract'

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
    <div className="max-w-4xl mx-auto px-6 py-6">
      <Link href="/debit-notes" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mb-3"><ArrowLeft size={14} /> Debit Notes</Link>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[18px] font-semibold text-foreground">Generate a new debit note</h1>
        <span className="text-[10px] text-muted-foreground/40 font-mono">build {process.env.NEXT_PUBLIC_COMMIT_SHA?.slice(0, 7) ?? 'dev'}</span>
      </div>
      <p className="text-[12.5px] text-muted-foreground mb-4">
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
      {error && <p className="mb-6 text-[11.5px] text-rose-600 whitespace-pre-wrap">{error}</p>}
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
                className="flex-shrink-0 text-[11px] text-rose-600 hover:underline disabled:opacity-50"
              >
                {cancelling === b.id ? 'Cancelling…' : 'Cancel'}
              </button>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-[13px] font-semibold mb-2">Review queue {needsReview.length > 0 && `(${needsReview.length})`}</h2>
      {loadingBundles ? (
        <p className="text-[12.5px] text-muted-foreground">Loading…</p>
      ) : needsReview.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground py-6 text-center border border-dashed border-[--border-subtle] rounded-xl">Nothing waiting on review.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {needsReview.map(b => <BundleReviewCard key={b.id} bundle={b} onResolved={loadBundles} />)}
        </div>
      )}
    </div>
  )
}

// ── Bundle review card ──────────────────────────────────────────────────────────────────────
const inp = 'text-[12.5px] border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25 w-full'

type ApprovedResult = { debitNoteId: string; debitNoteNo: string; downloadUrl: string; driveFolderUrl: string | null }
type EventType = 'new_business' | 'renewal' | 'endorsement'
type PolicyLookup = { id: string; startDate: string | null; endDate: string | null; hasDebitNotes: boolean } | null

function BundleReviewCard({ bundle, onResolved }: { bundle: Bundle; onResolved: () => void }) {
  const m = bundle.merged
  const [recipient, setRecipient] = useState<PickerValue | null>(
    bundle.companies ? { companyId: bundle.companies.id, companyName: bundle.companies.name, contactId: null, contactEmail: null, contactName: null } : null,
  )
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
  const [commissionRate, setCommissionRate] = useState(m?.commission_rate ?? 0)
  const [commissionAmount, setCommissionAmount] = useState(m?.commission_amount ?? 0)
  const [issueDate, setIssueDate] = useState(m?.issue_date || new Date().toISOString().slice(0, 10))
  const [paymentDueDate, setPaymentDueDate] = useState(m?.payment_due_date ?? '')
  const [debitNoteNo, setDebitNoteNo] = useState('')
  const [debitNoteNoTouched, setDebitNoteNoTouched] = useState(false)
  const [eventType, setEventType] = useState<EventType>('new_business')
  const [eventTypeTouched, setEventTypeTouched] = useState(false)
  const [endorsementEffectiveDate, setEndorsementEffectiveDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [approved, setApproved] = useState<ApprovedResult | null>(null)
  const [sendTarget, setSendTarget] = useState<SendDocumentsTarget | null>(null)
  const [retrying, setRetrying] = useState(false)

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
          policy: {
            policyNumber: policyNumber || null, coverNoteNo: coverNoteNo || null, insurer,
            classOfInsurance: classOfInsurance || null, currency, description: description || null,
            startDate: periodStart || null, endDate: periodEnd || null,
          },
          debitNote: {
            currency, lineItems: [{ description: 'Gross Premium collected on behalf of Insurance Company', amount: grossPremium }],
            gstAmount: gstAmount || null, commissionRate: commissionRate || null, commission: commissionAmount || null,
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
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 flex flex-col items-center gap-3 text-center">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center"><CheckCircle2 size={20} className="text-emerald-600" /></div>
        <p className="text-[14px] font-semibold">Debit Note {approved.debitNoteNo} generated</p>
        <p className="text-[11.5px] text-emerald-700 -mt-1.5">
          This debit note and its documents are now saved in your Debit Notes records
          {approved.driveFolderUrl ? (
            <> and <a href={approved.driveFolderUrl} target="_blank" rel="noreferrer" className="underline hover:no-underline">archived to Google Drive</a>.</>
          ) : '.'}
        </p>
        <div className="flex items-center gap-2">
          <a href={approved.downloadUrl} target="_blank" rel="noreferrer" className="inline-flex"><Button variant="outline" size="sm"><Download size={13} className="mr-1.5" /> Download PDF</Button></a>
          <Button size="sm" onClick={openSend} disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Send size={13} className="mr-1.5" />} Send documents</Button>
        </div>
        <Link href="/debit-notes" className="text-[11.5px] text-muted-foreground hover:text-foreground">Done</Link>
        {sendTarget && <SendDocumentsModal target={sendTarget} onClose={() => setSendTarget(null)} />}
      </div>
    )
  }

  return (
    <div className={`rounded-xl border p-3.5 flex flex-col gap-3 ${bundle.status === 'error' ? 'border-rose-200 bg-rose-50/30' : 'border-[--border-subtle]'}`}>
      <div className="flex flex-wrap items-center gap-2">
        {bundle.pdf_import_items.map(it => (
          <a key={it.id} href={`/api/debit-notes/imports/items/${it.id}/pdf`} target="_blank" rel="noreferrer"
            title={it.error_message ?? undefined}
            className="flex items-center gap-1.5 text-[11.5px] px-2 py-1 rounded-md border border-[--border-subtle] hover:bg-accent">
            <FileText size={11} className="text-muted-foreground/60" />
            {it.original_filename ?? 'document.pdf'}
            {it.doc_type && <span className="text-[9.5px] font-semibold uppercase tracking-wide text-primary">{DOC_TYPE_LABEL[it.doc_type]}</span>}
            {it.status === 'error' && <AlertTriangle size={11} className="text-rose-600" />}
          </a>
        ))}
        {bundle.match_confidence != null && (
          <span className="text-[10.5px] text-muted-foreground ml-auto">match confidence {(bundle.match_confidence * 100).toFixed(0)}%</span>
        )}
      </div>

      <div className="rounded-md border border-dashed border-muted-foreground/30 p-2 flex flex-col gap-1 font-mono text-[10.5px] text-muted-foreground">
        <span>bundle status: <b>{bundle.status}</b>{bundle.consistency_warning ? ` · warning: ${bundle.consistency_warning}` : ''}</span>
        {bundle.pdf_import_items.map(it => (
          <span key={it.id}>
            {it.original_filename ?? 'document.pdf'} — status: <b>{it.status}</b>, doc_type: <b>{it.doc_type ?? 'null'}</b>, error: <b className={it.error_message ? 'text-rose-700' : ''}>{it.error_message ?? 'null'}</b>
          </span>
        ))}
      </div>

      {bundle.pdf_import_items.some(it => it.error_message) && (
        <div className="flex flex-col gap-1">
          {bundle.pdf_import_items.filter(it => it.error_message).map(it => (
            <p key={it.id} className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2 py-1">
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
        <div className="flex items-start gap-1.5 text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {bundle.consistency_warning}
        </div>
      )}

      <CompanyContactPicker value={recipient} onChange={setRecipient} />

      <div className={`rounded-md border p-2.5 flex flex-col gap-2 ${eventType === 'endorsement' ? 'border-orange-200 bg-orange-50/40' : 'border-[--border-subtle]'}`}>
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
            <Field label="Effective date (required)" className="flex-1">
              <input type="date" value={endorsementEffectiveDate} onChange={e => setEndorsementEffectiveDate(e.target.value)} className={inp} />
            </Field>
          )}
        </div>
        {eventType === 'endorsement' && (
          <p className="text-[11px] text-orange-800">
            This bills a mid-term change (e.g. an employee added partway through the year) rather than the full policy term shown below — the PDF will call out the effective date separately so the payment due date doesn&apos;t look mismatched against the period of insurance.
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
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
        <Field label="Insurer (required)"><input value={insurer} onChange={e => setInsurer(e.target.value)} className={inp} /></Field>
        <Field label="Class of insurance"><input value={classOfInsurance} onChange={e => setClassOfInsurance(e.target.value)} className={inp} /></Field>
        <Field label="Period start"><input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className={inp} /></Field>
        <Field label="Period end (renewal date)"><input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className={inp} /></Field>
        <Field label="Gross premium (required)"><input type="number" value={grossPremium} onChange={e => setGrossPremium(Number(e.target.value))} className={inp} /></Field>
        <Field label="GST"><input type="number" value={gstAmount} onChange={e => setGstAmount(Number(e.target.value))} className={inp} /></Field>
        <Field label="Currency"><select value={currency} onChange={e => setCurrency(e.target.value)} className={inp}>{['SGD', 'USD', 'MYR', 'IDR'].map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Commission rate (%)"><input type="number" value={commissionRate} onChange={e => setCommissionRate(Number(e.target.value))} className={inp} /></Field>
        <Field label="Commission amount"><input type="number" value={commissionAmount} onChange={e => setCommissionAmount(Number(e.target.value))} className={inp} /></Field>
        <div />
        <Field label="Issue date"><input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inp} /></Field>
        <Field label="Payment due date"><input type="date" value={paymentDueDate} onChange={e => setPaymentDueDate(e.target.value)} className={inp} /></Field>
        <Field label="Description" className="col-span-3"><input value={description} onChange={e => setDescription(e.target.value)} className={inp} /></Field>
      </div>

      <div className="text-[13px] flex justify-end">
        <span>Gross premium collected: <b>{currency} {(grossPremium + gstAmount).toLocaleString('en-SG', { minimumFractionDigits: 2 })}</b></span>
      </div>

      {err && <p className="text-[11.5px] text-rose-600">{err}</p>}

      <div className="flex items-center justify-end gap-2">
        {saved && <span className="text-[11.5px] text-emerald-600 mr-auto">Draft saved</span>}
        <Button variant="ghost" size="sm" onClick={reject} disabled={busy || saving}><XCircle size={13} className="mr-1.5" /> Reject</Button>
        <Button variant="outline" size="sm" onClick={saveDraft} disabled={busy || saving}>
          {saving ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Save size={13} className="mr-1.5" />} Save draft
        </Button>
        <Button size="sm" onClick={approve} disabled={busy || saving}>{busy ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <CheckCircle2 size={13} className="mr-1.5" />} Approve</Button>
      </div>
    </div>
  )
}
