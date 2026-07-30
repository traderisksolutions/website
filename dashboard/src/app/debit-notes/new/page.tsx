'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, Plus, Trash2, FileText, Download, Send } from 'lucide-react'
import { CompanyContactPicker, type PickerValue } from '@/components/company-contact-picker/CompanyContactPicker'
import { openEngagementCompose } from '@/lib/engagement-handoff'

const inp = 'text-[12.5px] border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25 w-full'

type Policy = { id: string; policy_number: string | null; insurer: string | null; class_of_insurance: string | null; broker: string | null; currency: string | null; start_date: string | null; end_date: string | null; status: string | null }
type LineItem = { description: string; amount: number }
type Employee = { id: string; name: string; email: string }

const today = () => new Date().toISOString().slice(0, 10)

export default function NewDebitNotePage() {
  return (
    <Suspense>
      <NewDebitNoteForm />
    </Suspense>
  )
}

function NewDebitNoteForm() {
  const router = useRouter()
  const search = useSearchParams()
  const prefillPolicyId = search.get('policy_id')

  const [step, setStep] = useState(0)
  const [recipient, setRecipient] = useState<PickerValue | null>(null)
  const [companyPolicies, setCompanyPolicies] = useState<Policy[]>([])
  const [policyMode, setPolicyMode] = useState<'existing' | 'new'>('new')
  const [policyId, setPolicyId] = useState<string>('')

  // New-policy fields
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

  // Financials
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: 'Gross Premium collected on behalf of Insurance Company', amount: 0 }])
  const [gstEnabled, setGstEnabled] = useState(false)
  const [gstAmount, setGstAmount] = useState(0)
  const [feeRebate, setFeeRebate] = useState(0)
  const [commission, setCommission] = useState<string>('')
  const [commissionRate, setCommissionRate] = useState<string>('')
  const [issueDate, setIssueDate] = useState(today())
  const [paymentDueDate, setPaymentDueDate] = useState('')

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
    setBusy(true); setError(null)
    try {
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
            commissionRate: commissionRate ? Number(commissionRate) : null,
            issueDate, paymentDueDate: paymentDueDate || null, insurer: insurer || undefined, source: 'manual',
          },
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
    <div className="max-w-3xl mx-auto px-6 py-6">
      <Link href="/debit-notes" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mb-3"><ArrowLeft size={14} /> Debit Notes</Link>
      <h1 className="text-[18px] font-semibold text-foreground mb-3">Generate Debit Note</h1>

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
              <input value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} placeholder="Policy number" className={inp} />
              <input value={coverNoteNo} onChange={e => setCoverNoteNo(e.target.value)} placeholder="Cover note no." className={inp} />
              <input value={insurer} onChange={e => setInsurer(e.target.value)} placeholder="Insurance company (required)" className={inp} />
              <input value={classOfInsurance} onChange={e => setClassOfInsurance(e.target.value)} placeholder="Class of insurance" className={inp} />
              <select value={broker} onChange={e => setBroker(e.target.value)} className={inp}>
                <option value="">Broker…</option>
                {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
              </select>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={inp}>
                {['SGD', 'USD', 'MYR', 'IDR'].map(c => <option key={c}>{c}</option>)}
              </select>
              <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Period start
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inp} />
              </label>
              <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Period end
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inp} />
              </label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (site address / project)" rows={2} className={`${inp} col-span-2`} />
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
            {gstEnabled && <input type="number" value={gstAmount} onChange={e => setGstAmount(Number(e.target.value))} placeholder="GST amount" className={inp} />}
          </div>

          <div className="grid grid-cols-3 gap-3 max-w-2xl">
            <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Fee rebate
              <input type="number" value={feeRebate} onChange={e => setFeeRebate(Number(e.target.value))} className={inp} />
            </label>
            <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Commission rate (%)
              <input type="number" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} className={inp} />
            </label>
            <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Commission amount
              <input type="number" value={commission} onChange={e => setCommission(e.target.value)} className={inp} />
            </label>
            <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Issue date
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inp} />
            </label>
            <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Payment due date
              <input type="date" value={paymentDueDate} onChange={e => setPaymentDueDate(e.target.value)} className={inp} />
            </label>
          </div>

          <div className="text-[13px] flex flex-col gap-0.5 items-end max-w-2xl">
            <span>Total: <b>{currency} {total.toLocaleString('en-SG', { minimumFractionDigits: 2 })}</b></span>
            <span className="text-muted-foreground">Net (after fee rebate): {currency} {netAmount.toLocaleString('en-SG', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="text-[13px] px-4 py-1.5 rounded-lg border border-border hover:bg-muted">← Back</button>
            <button onClick={submit} disabled={busy || lineTotal <= 0} className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}{busy ? 'Generating…' : 'Generate Debit Note'}
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
