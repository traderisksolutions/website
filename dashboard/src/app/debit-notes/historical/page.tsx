'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, FileText, UploadCloud, CheckCircle2,
  XCircle, AlertTriangle, Folder, ChevronRight, Cloud, Save,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { CompanyContactPicker, type PickerValue } from '@/components/company-contact-picker/CompanyContactPicker'
import type { ExtractedDebitNote, DocType } from '@/lib/debit-note-extract'

export default function HistoricalDebitNotePage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <Link href="/debit-notes" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mb-3"><ArrowLeft size={14} /> Debit Notes</Link>
      <h1 className="text-[18px] font-semibold text-foreground mb-1">Generate Historical Debit Note</h1>
      <p className="text-[12.5px] text-muted-foreground mb-4">
        For backfilling records from before this system existed — bulk-upload old PDFs (one .zip
        per event, several at once, or pull straight from OneDrive) with all three document
        types, including a pre-existing TRS debit note.
      </p>

      <BulkUploadSection />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// Bulk upload — 2-3 file bundles (PDFs, zips, or OneDrive). Each .zip is one event's worth of
// files; selecting several zips at once processes each as its own bundle.
// ════════════════════════════════════════════════════════════════════════════════════════════

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

const isZip = (f: File) => f.type === 'application/zip' || f.name.toLowerCase().endsWith('.zip')

function BulkUploadSection() {
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loadingBundles, setLoadingBundles] = useState(true)
  const [progress, setProgress] = useState<{ total: number; done: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showOneDrive, setShowOneDrive] = useState(false)
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
    const zips = all.filter(isZip)

    // One or more .zip files — each is a complete event's worth of files, processed as its own
    // bundle. A bad zip in the middle of the batch doesn't stop the rest.
    if (zips.length > 0) {
      setError(null); setProgress({ total: zips.length, done: 0 })
      const failures: string[] = []
      for (const zip of zips) {
        try {
          const uploaded = await uploadOne(zip)
          const created = await fetch('/api/debit-notes/imports/bundles/from-zip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(uploaded) })
          const bundle = await created.json()
          if (!created.ok) throw new Error(bundle.error ?? 'Could not unpack the zip')
          await extractBundle(bundle.id)
        } catch (e) {
          failures.push(`${zip.name}: ${e instanceof Error ? e.message : 'failed'}`)
        }
        setProgress(p => p && { ...p, done: p.done + 1 })
      }
      if (failures.length) setError(failures.join('\n'))
      setProgress(null)
      loadBundles()
      return
    }

    const list = all.slice(0, 3).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (!list.length) { setError('Only PDF files (or one or more .zip files) are accepted.'); return }
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
    <div>
      <div className="flex items-center gap-3 mb-6">
        <label className="flex-1">
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf,.zip,application/zip" multiple className="hidden"
            onChange={e => { onAddBundle(e.target.files); e.target.value = '' }} />
          <Button onClick={() => fileInputRef.current?.click()} className="w-full" disabled={!!progress}>
            <UploadCloud size={14} className="mr-1.5" /> + Add renewal bundle (up to 3 PDFs, or one or more .zip files)
          </Button>
        </label>
        <Button variant="outline" onClick={() => setShowOneDrive(s => !s)}>
          <Cloud size={14} className="mr-1.5" /> Pull from OneDrive
        </Button>
      </div>

      {showOneDrive && <OneDriveBrowser onPulled={loadBundles} />}

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

// ── OneDrive folder browser ──────────────────────────────────────────────────────────────────
type OneDriveEntry = { id: string; name: string; isFolder: boolean; mimeType: string | null; size: number | null }

function OneDriveBrowser({ onPulled }: { onPulled: () => void }) {
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<OneDriveEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pulling, setPulling] = useState(false)

  const load = useCallback((p: string) => {
    setLoading(true); setError(null)
    fetch(`/api/onedrive/browse?path=${encodeURIComponent(p)}`, { cache: 'no-store' })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Could not browse OneDrive'); return d })
      .then(setEntries)
      .catch(e => setError(e instanceof Error ? e.message : 'Could not browse OneDrive'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => load(path), [path, load])

  async function pull(mode: 'folder' | 'subfolders') {
    setPulling(true); setError(null)
    try {
      const res = await fetch('/api/onedrive/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, mode }) })
      const data = await res.json() as { results?: ({ id: string } | { error: string; path: string })[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Pull failed')
      const created = (data.results ?? []).filter((r): r is { id: string } => 'id' in r)
      const failed = (data.results ?? []).filter((r): r is { error: string; path: string } => 'error' in r)
      await Promise.all(created.map(c => fetch(`/api/debit-notes/imports/bundles/${c.id}/extract`, { method: 'POST' })))
      if (failed.length) setError(failed.map(f => `${f.path}: ${f.error}`).join('\n'))
      onPulled()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pull failed')
    } finally { setPulling(false) }
  }

  const crumbs = path.split('/').filter(Boolean)

  return (
    <div className="mb-6 border border-[--border-subtle] rounded-xl p-3.5">
      <div className="flex items-center gap-1 text-[11.5px] text-muted-foreground mb-2 flex-wrap">
        <button onClick={() => setPath('')} className="hover:text-foreground hover:underline">Root</button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={10} />
            <button onClick={() => setPath(crumbs.slice(0, i + 1).join('/'))} className="hover:text-foreground hover:underline">{c}</button>
          </span>
        ))}
      </div>

      {loading && <p className="text-[12px] text-muted-foreground">Loading…</p>}
      {error && <p className="text-[11.5px] text-rose-600 whitespace-pre-wrap mb-2">{error}</p>}
      {!loading && (
        <div className="flex flex-col gap-1 mb-3 max-h-56 overflow-y-auto">
          {entries.map(e => (
            <button key={e.id} disabled={!e.isFolder} onClick={() => e.isFolder && setPath(path ? `${path}/${e.name}` : e.name)}
              className="flex items-center gap-2 text-left px-2 py-1.5 rounded-md hover:bg-accent text-[12.5px] disabled:hover:bg-transparent">
              {e.isFolder ? <Folder size={13} className="text-muted-foreground/60" /> : <FileText size={13} className="text-muted-foreground/40" />}
              {e.name}
            </button>
          ))}
          {entries.length === 0 && <p className="text-[11.5px] text-muted-foreground/60 px-2">Empty folder.</p>}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => pull('folder')} disabled={pulling || !path}>
          {pulling ? <Loader2 size={12} className="animate-spin mr-1.5" /> : null} Pull this folder as one bundle
        </Button>
        <Button size="sm" variant="outline" onClick={() => pull('subfolders')} disabled={pulling || !path}>
          Pull every sub-folder as separate bundles
        </Button>
      </div>
    </div>
  )
}

// ── Bundle review card ──────────────────────────────────────────────────────────────────────
const inp = 'text-[12.5px] border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25 w-full'

function BundleReviewCard({ bundle, onResolved }: { bundle: Bundle; onResolved: () => void }) {
  const m = bundle.merged
  const [recipient, setRecipient] = useState<PickerValue | null>(
    bundle.companies ? { companyId: bundle.companies.id, companyName: bundle.companies.name, contactId: null, contactEmail: null, contactName: null } : null,
  )
  const [debitNoteNo, setDebitNoteNo] = useState(m?.debit_note_no ?? '')
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
  const [issueDate, setIssueDate] = useState(m?.issue_date ?? '')
  const [paymentDueDate, setPaymentDueDate] = useState(m?.payment_due_date ?? '')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function currentMerged(): ExtractedDebitNote {
    return {
      doc_type: m?.doc_type ?? 'other', debit_note_no: debitNoteNo || null,
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
            debitNoteNo: debitNoteNo || null,
            issueDate: issueDate || new Date().toISOString().slice(0, 10), paymentDueDate: paymentDueDate || null, insurer,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not approve')
      onResolved()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not approve') } finally { setBusy(false) }
  }

  async function reject() {
    setBusy(true)
    await fetch(`/api/debit-notes/imports/bundles/${bundle.id}/reject`, { method: 'POST' })
    setBusy(false); onResolved()
  }

  return (
    <div className={`rounded-xl border p-3.5 flex flex-col gap-3 ${bundle.status === 'error' ? 'border-rose-200 bg-rose-50/30' : 'border-[--border-subtle]'}`}>
      <div className="flex flex-wrap items-center gap-2">
        {bundle.pdf_import_items.map(it => (
          <a key={it.id} href={`/api/debit-notes/imports/items/${it.id}/pdf`} target="_blank" rel="noreferrer"
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

      {bundle.consistency_warning && (
        <div className="flex items-start gap-1.5 text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {bundle.consistency_warning}
        </div>
      )}

      <CompanyContactPicker value={recipient} onChange={setRecipient} />

      <div className="grid grid-cols-3 gap-2">
        <Field label="Debit note no."><input value={debitNoteNo} onChange={e => setDebitNoteNo(e.target.value)} placeholder="Auto-generated if left blank" className={inp} /></Field>
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
