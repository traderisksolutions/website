'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, UploadCloud, Loader2, CheckCircle2, XCircle, AlertTriangle, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { CompanyContactPicker, type PickerValue } from '@/components/company-contact-picker/CompanyContactPicker'
import type { ExtractedDebitNote } from '@/lib/debit-note-extract'

type ImportItem = {
  id: string; storage_url: string; original_filename: string | null
  status: 'pending' | 'extracting' | 'needs_review' | 'error' | 'approved' | 'rejected'
  extracted: ExtractedDebitNote | null
  suggested_company_id: string | null; match_confidence: number | null
  error_message: string | null
  companies: { id: string; name: string } | null
}

type Progress = { total: number; done: number; currentFile: string | null }

export default function DebitNoteImportPage() {
  const [items, setItems] = useState<ImportItem[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadItems = useCallback(() => {
    setLoadingItems(true)
    fetch('/api/debit-notes/imports', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: ImportItem[]) => setItems(Array.isArray(rows) ? rows.filter(r => r.status !== 'approved' && r.status !== 'rejected') : []))
      .finally(() => setLoadingItems(false))
  }, [])
  useEffect(loadItems, [loadItems])

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    const list = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (!list.length) { setError('Only PDF files are accepted.'); return }
    setProgress({ total: list.length, done: 0, currentFile: null })
    const supabase = createClient()

    for (const file of list) {
      setProgress(p => p && { ...p, currentFile: file.name })
      try {
        const uu = await fetch('/api/debit-notes/imports/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name }) })
        const ud = await uu.json()
        if (!uu.ok) throw new Error(ud.error ?? `Could not start upload for ${file.name}`)

        const { error: upErr } = await supabase.storage.from('debit-notes').uploadToSignedUrl(ud.path, ud.token, file, { contentType: 'application/pdf' })
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

        const created = await fetch('/api/debit-notes/imports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storage_url: ud.path, original_filename: file.name }) })
        const item = await created.json()
        if (!created.ok) throw new Error(item.error ?? 'Could not register upload')

        await fetch(`/api/debit-notes/imports/${item.id}/extract`, { method: 'POST' })
      } catch (e) {
        setError(prev => prev ? `${prev}\n${file.name}: ${e instanceof Error ? e.message : 'failed'}` : `${file.name}: ${e instanceof Error ? e.message : 'failed'}`)
      } finally {
        setProgress(p => p && { ...p, done: p.done + 1 })
      }
    }
    setProgress(null)
    loadItems()
  }

  const needsReview = items.filter(i => i.status === 'needs_review' || i.status === 'error')
  const inFlight = items.filter(i => i.status === 'pending' || i.status === 'extracting')

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <Link href="/debit-notes" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mb-3"><ArrowLeft size={14} /> Debit Notes</Link>
      <h1 className="text-[18px] font-semibold text-foreground mb-1">Upload PDFs</h1>
      <p className="text-[12.5px] text-muted-foreground mb-4">Bulk-upload historical or new debit note / tax invoice PDFs. Each one is read by AI, then queued below for you to confirm the client match and details before anything is saved.</p>

      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[--border-subtle] rounded-xl py-10 cursor-pointer hover:border-primary/40 hover:bg-primary/[0.03] transition-colors mb-6">
        <UploadCloud size={26} className="text-muted-foreground/50" />
        <span className="text-[13px] font-medium text-foreground">Choose PDF files</span>
        <span className="text-[11px] text-muted-foreground/60">or drag them here — multiple at once is fine</span>
        <input type="file" accept=".pdf,application/pdf" multiple className="hidden" onChange={e => { onFiles(e.target.files); e.target.value = '' }} />
      </label>

      {progress && (
        <div className="mb-6 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <Loader2 size={13} className="animate-spin" />
          Processing {progress.done}/{progress.total}{progress.currentFile ? ` — ${progress.currentFile}` : ''}
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}
      {error && <pre className="mb-6 text-[11.5px] text-rose-600 whitespace-pre-wrap">{error}</pre>}
      {inFlight.length > 0 && <p className="mb-4 text-[11.5px] text-muted-foreground flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> {inFlight.length} still extracting…</p>}

      <h2 className="text-[13px] font-semibold mb-2">Review queue {needsReview.length > 0 && `(${needsReview.length})`}</h2>
      {loadingItems ? (
        <p className="text-[12.5px] text-muted-foreground">Loading…</p>
      ) : needsReview.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground py-6 text-center border border-dashed border-[--border-subtle] rounded-xl">Nothing waiting on review.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {needsReview.map(item => <ReviewCard key={item.id} item={item} onResolved={loadItems} />)}
        </div>
      )}
    </div>
  )
}

const inp = 'text-[12.5px] border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25 w-full'

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ''}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{label}</span>
      {children}
    </label>
  )
}

function ReviewCard({ item, onResolved }: { item: ImportItem; onResolved: () => void }) {
  const ex = item.extracted
  const [recipient, setRecipient] = useState<PickerValue | null>(
    item.companies ? { companyId: item.companies.id, companyName: item.companies.name, contactId: null, contactEmail: null, contactName: null } : null,
  )
  const [policyNumber, setPolicyNumber] = useState(ex?.policy_number ?? '')
  const [coverNoteNo, setCoverNoteNo] = useState(ex?.cover_note_no ?? '')
  const [insurer, setInsurer] = useState(ex?.insurer ?? '')
  const [classOfInsurance, setClassOfInsurance] = useState(ex?.class_of_insurance ?? '')
  const [currency, setCurrency] = useState(ex?.currency ?? 'SGD')
  const [description, setDescription] = useState(ex?.description ?? '')
  const [periodStart, setPeriodStart] = useState(ex?.period_start ?? '')
  const [periodEnd, setPeriodEnd] = useState(ex?.period_end ?? '')
  const [grossPremium, setGrossPremium] = useState(ex?.gross_premium ?? 0)
  const [gstAmount, setGstAmount] = useState(ex?.gst_amount ?? 0)
  const [issueDate, setIssueDate] = useState(ex?.issue_date ?? '')
  const [paymentDueDate, setPaymentDueDate] = useState(ex?.payment_due_date ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function approve() {
    if (!recipient?.companyId || !insurer.trim() || !grossPremium) { setErr('Company, insurer and a premium amount are required.'); return }
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/debit-notes/imports/${item.id}/approve`, {
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
            gstAmount: gstAmount || null, issueDate: issueDate || new Date().toISOString().slice(0, 10),
            paymentDueDate: paymentDueDate || null, insurer,
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
    await fetch(`/api/debit-notes/imports/${item.id}/reject`, { method: 'POST' })
    setBusy(false); onResolved()
  }

  return (
    <div className={`rounded-xl border p-3.5 flex flex-col gap-3 ${item.status === 'error' ? 'border-rose-200 bg-rose-50/30' : 'border-[--border-subtle]'}`}>
      <div className="flex items-center justify-between">
        <a href={`/api/debit-notes/imports/${item.id}/pdf`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline">
          <FileText size={13} /> {item.original_filename ?? 'document.pdf'}
        </a>
        {item.status === 'error' && <span className="flex items-center gap-1 text-[11px] text-rose-700"><AlertTriangle size={11} /> {item.error_message}</span>}
        {item.match_confidence != null && item.status !== 'error' && (
          <span className="text-[10.5px] text-muted-foreground">match confidence {(item.match_confidence * 100).toFixed(0)}%</span>
        )}
      </div>

      <CompanyContactPicker value={recipient} onChange={setRecipient} />

      <div className="grid grid-cols-3 gap-2">
        <Field label="Policy number"><input value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} className={inp} /></Field>
        <Field label="Cover note no."><input value={coverNoteNo} onChange={e => setCoverNoteNo(e.target.value)} className={inp} /></Field>
        <Field label="Insurer (required)"><input value={insurer} onChange={e => setInsurer(e.target.value)} className={inp} /></Field>
        <Field label="Class of insurance"><input value={classOfInsurance} onChange={e => setClassOfInsurance(e.target.value)} className={inp} /></Field>
        <Field label="Period start"><input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className={inp} /></Field>
        <Field label="Period end (renewal date)"><input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className={inp} /></Field>
        <Field label="Gross premium (required)"><input type="number" value={grossPremium} onChange={e => setGrossPremium(Number(e.target.value))} className={inp} /></Field>
        <Field label="GST"><input type="number" value={gstAmount} onChange={e => setGstAmount(Number(e.target.value))} className={inp} /></Field>
        <Field label="Currency"><select value={currency} onChange={e => setCurrency(e.target.value)} className={inp}>{['SGD', 'USD', 'MYR', 'IDR'].map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Issue date"><input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inp} /></Field>
        <Field label="Payment due date"><input type="date" value={paymentDueDate} onChange={e => setPaymentDueDate(e.target.value)} className={inp} /></Field>
        <Field label="Description" className="col-span-3"><input value={description} onChange={e => setDescription(e.target.value)} className={inp} /></Field>
      </div>

      {err && <p className="text-[11.5px] text-rose-600">{err}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={reject} disabled={busy}><XCircle size={13} className="mr-1.5" /> Reject</Button>
        <Button size="sm" onClick={approve} disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <CheckCircle2 size={13} className="mr-1.5" />} Approve</Button>
      </div>
    </div>
  )
}
