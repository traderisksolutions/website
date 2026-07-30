'use client'

import { useCallback, useEffect, useRef, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Loader2, Plus, Trash2, FileText, Download, Send, UploadCloud, CheckCircle2,
  XCircle, AlertTriangle, Folder, ChevronRight, Cloud, Save, Paperclip,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { CompanyContactPicker, type PickerValue } from '@/components/company-contact-picker/CompanyContactPicker'
import { openEngagementCompose } from '@/lib/engagement-handoff'
import type { ExtractedDebitNote, DocType } from '@/lib/debit-note-extract'

const inp = 'text-[12.5px] border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25 w-full'
const today = () => new Date().toISOString().slice(0, 10)

export default function HistoricalDebitNotePage() {
  return (
    <Suspense>
      <HistoricalDebitNoteContent />
    </Suspense>
  )
}

function HistoricalDebitNoteContent() {
  const [tab, setTab] = useState<'manual' | 'bulk'>('manual')

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <Link href="/debit-notes" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mb-3"><ArrowLeft size={14} /> Debit Notes</Link>
      <h1 className="text-[18px] font-semibold text-foreground mb-1">Generate Historical Debit Note</h1>
      <p className="text-[12.5px] text-muted-foreground mb-4">
        For backfilling records from before this system existed — type in what you already know,
        or bulk-upload old PDFs (including OneDrive) with all three document types.
      </p>

      <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted w-fit mb-6">
        <button onClick={() => setTab('manual')} className={`text-[12px] font-semibold px-3 py-1.5 rounded ${tab === 'manual' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Manual entry</button>
        <button onClick={() => setTab('bulk')} className={`text-[12px] font-semibold px-3 py-1.5 rounded ${tab === 'bulk' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Bulk upload</button>
      </div>

      {tab === 'manual' ? <ManualEntryForm /> : <BulkUploadSection />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// Manual entry — type in a single historical record, generate (or attach) its PDF.
// ════════════════════════════════════════════════════════════════════════════════════════════

type Policy = { id: string; policy_number: string | null; insurer: string | null; class_of_insurance: string | null; broker: string | null; currency: string | null; start_date: string | null; end_date: string | null; status: string | null }
type LineItem = { description: string; amount: number }
type Employee = { id: string; name: string; email: string }

function ManualEntryForm() {
  const router = useRouter()
  const search = useSearchParams()
  const prefillPolicyId = search.get('policy_id')

  const [step, setStep] = useState(0)
  const [recipient, setRecipient] = useState<PickerValue | null>(null)
  const [companyPolicies, setCompanyPolicies] = useState<Policy[]>([])
  const [policyMode, setPolicyMode] = useState<'existing' | 'new'>('new')
  const [policyId, setPolicyId] = useState<string>('')

  const [policyNumber, setPolicyNumber] = useState('')
  const [coverNoteNo, setCoverNoteNo] = useState('')
  const [insurer, setInsurer] = useState('')
  const [classOfInsurance, setClassOfInsurance] = useState('')
  const [broker, setBroker] = useState('')
  const [currency, setCurrency] = useState('SGD')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])

  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: 'Gross Premium collected on behalf of Insurance Company', amount: 0 }])
  const [gstEnabled, setGstEnabled] = useState(false)
  const [gstAmount, setGstAmount] = useState(0)
  const [feeRebate, setFeeRebate] = useState(0)
  const [commission, setCommission] = useState<string>('')
  const [commissionRate, setCommissionRate] = useState<string>('')
  const [debitNoteNo, setDebitNoteNo] = useState('')
  const [issueDate, setIssueDate] = useState(today())
  const [paymentDueDate, setPaymentDueDate] = useState('')

  const [pdfMode, setPdfMode] = useState<'generate' | 'attach'>('generate')
  const [existingPdfFile, setExistingPdfFile] = useState<File | null>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ debitNoteId: string; debitNoteNo: string; downloadUrl: string; companyName: string | null; contactEmail: string | null } | null>(null)

  useEffect(() => {
    fetch('/api/contacts/search?all=1', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: { id: string; name: string; email: string; is_employee: boolean }[]) =>
        setEmployees(Array.isArray(rows) ? rows.filter(r => r.is_employee) : []))
      .catch(() => {})
  }, [])

  // Deep link from Calendar's "Generate Debit Note" quick action — preselect the policy's
  // company so the recipient picker + existing-policy list are ready without re-searching.
  useEffect(() => {
    if (!prefillPolicyId) return
    fetch(`/api/policies/${prefillPolicyId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.companyId) setRecipient({ companyId: d.companyId, companyName: d.companyName, contactId: null, contactEmail: null, contactName: null }) })
      .catch(() => {})
  }, [prefillPolicyId])

  useEffect(() => {
    if (!recipient?.companyId) { setCompanyPolicies([]); return }
    fetch(`/api/companies/${recipient.companyId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const policies: Policy[] = d?.policies ?? []
        setCompanyPolicies(policies)
        if (prefillPolicyId && policies.some(p => p.id === prefillPolicyId)) {
          setPolicyMode('existing'); setPolicyId(prefillPolicyId)
        } else {
          setPolicyMode(policies.length ? 'existing' : 'new')
        }
      })
      .catch(() => setCompanyPolicies([]))
  }, [recipient?.companyId, prefillPolicyId])

  const lineTotal = lineItems.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const total = lineTotal + (gstEnabled ? gstAmount : 0)
  const netAmount = total - feeRebate

  function updateLine(i: number, patch: Partial<LineItem>) {
    setLineItems(items => items.map((l, j) => j === i ? { ...l, ...patch } : l))
  }

  async function submit() {
    if (pdfMode === 'attach' && !existingPdfFile) { setError('Choose a PDF to attach, or switch back to "Generate PDF from these details".'); return }
    setBusy(true); setError(null)
    try {
      let existingPdf: { storageUrl: string; filename: string } | undefined
      if (pdfMode === 'attach' && existingPdfFile) {
        const supabase = createClient()
        const uu = await fetch('/api/debit-notes/imports/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: existingPdfFile.name }) })
        const ud = await uu.json()
        if (!uu.ok) throw new Error(ud.error ?? 'Could not start the upload')
        const { error: upErr } = await supabase.storage.from('debit-notes').uploadToSignedUrl(ud.path, ud.token, existingPdfFile, { contentType: 'application/pdf' })
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`)
        existingPdf = { storageUrl: ud.path, filename: existingPdfFile.name }
      }

      const policy = policyMode === 'existing'
        ? { policyId }
        : {
            policyNumber: policyNumber || null, coverNoteNo: coverNoteNo || null, insurer,
            classOfInsurance: classOfInsurance || null, broker: broker || null, currency,
            description: description || null, startDate: startDate || null, endDate: endDate || null,
            source: 'manual' as const,
          }
      const res = await fetch('/api/debit-notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: recipient?.companyId ? { companyId: recipient.companyId } : null,
          contact: recipient?.contactId ? { contactId: recipient.contactId } : null,
          policy,
          debitNote: {
            currency, lineItems: lineItems.filter(l => l.description.trim()),
            gstAmount: gstEnabled ? gstAmount : null, feeRebate, commission: commission ? Number(commission) : null,
            commissionRate: commissionRate ? Number(commissionRate) : null, debitNoteNo: debitNoteNo || null,
            issueDate, paymentDueDate: paymentDueDate || null, insurer: insurer || undefined, source: 'manual',
          },
          existingPdf,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not generate debit note')
      setResult(data); setStep(3)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate debit note')
    } finally { setBusy(false) }
  }

  async function sendViaEngagement() {
    if (!result) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/debit-notes/${result.debitNoteId}/email-attachment`, { method: 'POST' })
      const att = await res.json()
      if (!res.ok) throw new Error(att.error ?? 'Could not prepare attachment')
      openEngagementCompose({
        toEmail: result.contactEmail ?? '',
        toName: recipient?.contactName ?? undefined,
        subject: `Debit Note ${result.debitNoteNo} — ${result.companyName ?? ''}`,
        body: `Dear ${recipient?.contactName ?? 'Sir/Madam'},\n\nPlease find attached Debit Note ${result.debitNoteNo}${paymentDueDate ? ` — kindly arrange payment by ${paymentDueDate}.` : '.'}\n\nThank you.`,
        attachment: att,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send'); setBusy(false)
    }
  }

  const steps = ['Client', 'Policy', 'Financials', 'Done']

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-[12px] mb-5">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full font-medium ${i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{i + 1}. {s}</span>
            {i < steps.length - 1 && <span className="text-muted-foreground/30">›</span>}
          </div>
        ))}
      </div>

      {error && <div className="mb-4 text-[12.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

      {step === 0 && (
        <div className="flex flex-col gap-4 max-w-lg">
          <CompanyContactPicker value={recipient} onChange={setRecipient} />
          <div className="flex justify-end">
            <button onClick={() => setStep(1)} disabled={!recipient?.companyId} className="text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Next: policy →</button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-[12.5px]">
            <button onClick={() => setPolicyMode('existing')} disabled={!companyPolicies.length} className={`px-3 py-1 rounded-md border ${policyMode === 'existing' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'} disabled:opacity-40`}>Existing policy ({companyPolicies.length})</button>
            <button onClick={() => setPolicyMode('new')} className={`px-3 py-1 rounded-md border ${policyMode === 'new' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>New policy</button>
          </div>

          {policyMode === 'existing' ? (
            <select value={policyId} onChange={e => setPolicyId(e.target.value)} className={inp}>
              <option value="">Select a policy…</option>
              {companyPolicies.map(p => (
                <option key={p.id} value={p.id}>{p.policy_number || '(no number)'} · {p.insurer} · {p.class_of_insurance} · ends {p.end_date}</option>
              ))}
            </select>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Policy number"><input value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} className={inp} /></Field>
              <Field label="Cover note no."><input value={coverNoteNo} onChange={e => setCoverNoteNo(e.target.value)} className={inp} /></Field>
              <Field label="Insurance company (required)"><input value={insurer} onChange={e => setInsurer(e.target.value)} className={inp} /></Field>
              <Field label="Class of insurance"><input value={classOfInsurance} onChange={e => setClassOfInsurance(e.target.value)} className={inp} /></Field>
              <Field label="Broker">
                <select value={broker} onChange={e => setBroker(e.target.value)} className={inp}>
                  <option value="">Select…</option>
                  {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                </select>
              </Field>
              <Field label="Currency">
                <select value={currency} onChange={e => setCurrency(e.target.value)} className={inp}>
                  {['SGD', 'USD', 'MYR', 'IDR'].map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Period start"><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inp} /></Field>
              <Field label="Period end"><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inp} /></Field>
              <Field label="Description (site address / project)" className="col-span-2">
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={inp} />
              </Field>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(0)} className="text-[13px] px-4 py-1.5 rounded-lg border border-border hover:bg-muted">← Back</button>
            <button onClick={() => setStep(2)} disabled={policyMode === 'existing' ? !policyId : !insurer.trim()} className="text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Next: financials →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_140px_32px] gap-2 px-3 py-2 bg-muted/40 text-[11px] font-medium text-muted-foreground/70">
              <span>Description</span><span>Amount ({currency})</span><span />
            </div>
            {lineItems.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_140px_32px] gap-2 px-3 py-1.5 border-t border-border/40 items-center">
                <input value={l.description} onChange={e => updateLine(i, { description: e.target.value })} className={inp} />
                <input type="number" value={l.amount} onChange={e => updateLine(i, { amount: Number(e.target.value) })} className={inp} />
                {lineItems.length > 1 && <button onClick={() => setLineItems(items => items.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-600"><Trash2 size={13} /></button>}
              </div>
            ))}
            <div className="px-3 py-2 border-t border-border/40">
              <button onClick={() => setLineItems(items => [...items, { description: '', amount: 0 }])} className="text-[12px] text-primary flex items-center gap-1 hover:underline"><Plus size={12} /> add line item</button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 max-w-2xl">
            <label className="flex items-center gap-2 text-[12.5px]">
              <input type="checkbox" checked={gstEnabled} onChange={e => { setGstEnabled(e.target.checked); if (e.target.checked && !gstAmount) setGstAmount(Math.round(lineTotal * 0.09 * 100) / 100) }} className="accent-primary" /> Add GST
            </label>
            {gstEnabled && <Field label="GST amount"><input type="number" value={gstAmount} onChange={e => setGstAmount(Number(e.target.value))} className={inp} /></Field>}
          </div>

          <div className="grid grid-cols-3 gap-3 max-w-2xl">
            <Field label="Fee rebate"><input type="number" value={feeRebate} onChange={e => setFeeRebate(Number(e.target.value))} className={inp} /></Field>
            <Field label="Commission rate (%)"><input type="number" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} className={inp} /></Field>
            <Field label="Commission amount"><input type="number" value={commission} onChange={e => setCommission(e.target.value)} className={inp} /></Field>
            <Field label="Debit note no."><input value={debitNoteNo} onChange={e => setDebitNoteNo(e.target.value)} placeholder="Auto-generated if left blank" className={inp} /></Field>
            <Field label="Issue date"><input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inp} /></Field>
            <Field label="Payment due date"><input type="date" value={paymentDueDate} onChange={e => setPaymentDueDate(e.target.value)} className={inp} /></Field>
          </div>

          <div className="text-[13px] flex flex-col gap-0.5 items-end max-w-2xl">
            <span>Total: <b>{currency} {total.toLocaleString('en-SG', { minimumFractionDigits: 2 })}</b></span>
            <span className="text-muted-foreground">Net (after fee rebate): {currency} {netAmount.toLocaleString('en-SG', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="rounded-xl border border-border p-3 max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Debit note PDF</p>
            <div className="flex items-center gap-2 text-[12.5px] mb-2">
              <button onClick={() => setPdfMode('generate')} className={`px-3 py-1 rounded-md border ${pdfMode === 'generate' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>Generate from these details</button>
              <button onClick={() => setPdfMode('attach')} className={`px-3 py-1 rounded-md border ${pdfMode === 'attach' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>Attach an existing PDF</button>
            </div>
            {pdfMode === 'attach' && (
              <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground cursor-pointer">
                <Paperclip size={13} />
                {existingPdfFile ? existingPdfFile.name : 'Choose a PDF…'}
                <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => setExistingPdfFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="text-[13px] px-4 py-1.5 rounded-lg border border-border hover:bg-muted">← Back</button>
            <button onClick={submit} disabled={busy || lineTotal <= 0} className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}{busy ? 'Saving…' : 'Generate Debit Note'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center"><FileText size={22} className="text-emerald-600" /></div>
          <p className="text-[15px] font-semibold">Debit Note {result.debitNoteNo} generated</p>
          <p className="text-[12.5px] text-muted-foreground">{result.companyName}</p>
          <div className="flex items-center gap-2">
            <a href={result.downloadUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-lg border border-border hover:bg-muted"><Download size={14} /> Download PDF</a>
            <button onClick={sendViaEngagement} disabled={busy || !result.contactEmail} title={!result.contactEmail ? 'No recipient email on file for this client' : ''} className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send via Engagement
            </button>
          </div>
          <button onClick={() => router.push('/debit-notes')} className="text-[12.5px] text-muted-foreground hover:text-foreground mt-2">Back to Debit Notes</button>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// Bulk upload — 2-3 file bundles (PDFs, zips, or OneDrive), unchanged from the original import
// flow: full doc-type set including a pre-existing TRS debit note, and the OneDrive browser.
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

    const list = all.slice(0, 3).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
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

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <label className="flex-1">
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf,.zip,application/zip" multiple className="hidden"
            onChange={e => { onAddBundle(e.target.files); e.target.value = '' }} />
          <Button onClick={() => fileInputRef.current?.click()} className="w-full" disabled={!!progress}>
            <UploadCloud size={14} className="mr-1.5" /> + Add renewal bundle (up to 3 PDFs, or one .zip)
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
      {inFlight.length > 0 && <p className="mb-4 text-[11.5px] text-muted-foreground flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> {inFlight.length} still extracting…</p>}

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
