'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { UploadCloud, Loader2, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SourceFilesTab } from '@/components/group-benefits/SourceFilesTab'
import { HrLinksTab } from '@/components/group-benefits/hr/HrLinksTab'
import { EbRegister } from '@/components/group-benefits/EbRegister'
import { InsurerEmailDialog, loadInsurerContacts, contactsFor, ContactLines, type InsurerContact } from '@/components/group-benefits/InsurerEmailDialog'
import { InsurerContactsDialog } from '@/components/group-benefits/InsurerContactsDialog'
import { shortInsurer, ON_REQUEST_PLANS } from '@/lib/gb/insurer-names'
import { normInsurer } from '@/lib/insurers'
import type { CompanyPick } from '@/components/group-benefits/hr/SendLinkDialog'
import { VERIFICATION, verificationOf } from '@/lib/gb/verification'
import { uploadToDrive } from '@/lib/upload-attachment'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { Segmented } from '@/components/crm/primitives'
import { PlanRules } from '@/components/group-benefits/PlanRules'

// Parse a response as JSON, but degrade gracefully if the server returned plain text
// (e.g. a Vercel "Request Entity Too Large" page) instead of crashing on JSON.parse.
async function safeJson<T = Record<string, unknown>>(r: Response): Promise<T & { error?: string }> {
  const t = await r.text().catch(() => '')
  try { return (t ? JSON.parse(t) : {}) as T & { error?: string } }
  catch { return { error: t.slice(0, 160) || 'Server error' } as T & { error?: string } }
}

type RateTable = {
  id: string; insurer_name: string | null; product_code: string; product_name: string | null
  plan_year: number | null; effective_date: string | null; status: string; version: number
  source_pdf_name: string | null; created_at: string; approved_at: string | null
  calculator_filename?: string | null; rules_status?: string | null; rules_updated_at?: string | null
  verification?: { status?: string; basis?: string } | null
}

// Every status is the same neutral chip; the label carries the meaning.
const STATUS_LABEL: Record<string, string> = { draft: 'Draft', extracting: 'Extracting', in_review: 'In review', approved: 'Approved', archived: 'Archived' }
const CHIP = 'inline-flex items-center rounded-[6px] bg-[#f1f2ee] text-[#2a332f] text-[11.5px] font-medium px-2 py-0.5 whitespace-nowrap'

// Workflow order: quotes are the job; employee lists feed them; insurers and coverage are reference.
type Tab = 'eb' | 'hrlinks' | 'tables' | 'rules'
const TABS: readonly Tab[] = ['eb', 'hrlinks', 'tables', 'rules']
const TAB_LABEL: Record<Tab, string> = { eb: 'Quotations', hrlinks: 'Employee lists', tables: 'Insurers', rules: 'Plan rules' }


/**
 * Employment Benefits (was Pricing Matrix; renamed 23 Oct 2026, address kept) — one module since 2 Oct 2026.
 *
 * There used to be two: this one (then "Group Benefits") holding every insurer, rate and quote, and
 * an older /pricing-matrix that by then held none — no calculators, no rates, no quotes. The empty
 * one was deleted and this one took its name and address; /group-benefits redirects here.
 *
 * Since 27 Oct 2026 the Quotes tab is the register of employment-benefits policies across companies
 * (GET /api/eb/policies); "New quotation" opens a placement and lands on the company's Members tab.
 * The engine-by-hand paths below stay reachable under "By hand".
 * ?tab=quote&company=<name>, ?thread=<id> and ?hrLink=<id> are older links: they go to New quotation, the one screen a
 * census enters by (13 Nov 2026; Quick quote and the By hand wizard were retired here). ?tab=hrlinks&company=<name>&companyId=<id> opens the HR links tab
 * with the Send HR a link dialog filled in, which is how the company page's "Send HR a link" arrives.
 */
export default function PricingMatrixPage() {
  return <Suspense fallback={null}><PricingMatrix /></Suspense>
}

function PricingMatrix() {
  const router = useRouter()
  const params = useSearchParams()
  // Four tabs since 2 Oct 2026. Old links still land: ?tab=quote opens a new quote, and the retired
  // Source files and Calculators tabs open Rate tables, which now lists the Drive files too.
  const asked = params.get('tab')
  // The register is the page (12 Nov 2026); ?tab=quote still opens a new one; ?tab=quotes is the policies list.
  const initialTab: Tab = asked === 'quote' ? 'eb' : TABS.find(t => t === asked) ?? 'eb'
  const company = params.get('company') ?? undefined
  const companyId = params.get('companyId') ?? null
  const hrLinkId = params.get('hrLink') ?? null
  const [tab, setTab]   = useState<Tab>(initialTab)
  const [tables, setTables] = useState<RateTable[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [emailInsurer, setEmailInsurer] = useState<{ insurer: string | null; plan?: string } | null>(null)
  // Arriving from the company page with ?tab=hrlinks&company=…: the dialog opens once, filled in.
  const [sendFromUrl, setSendFromUrl] = useState(asked === 'hrlinks' && !!(company || companyId || params.get('send')))
  const hrCompany: CompanyPick | null = company || companyId ? { id: companyId, name: company ?? '' } : null

  async function load() {
    setLoading(true)
    const res = await fetch('/api/group-benefits/rate-tables', { cache: 'no-store' })
    setTables(res.ok ? await res.json() : [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  // New quotation has its own address (13 Nov 2026); older links with ?tab=quote, ?thread or ?hrLink land there.
  useEffect(() => {
    if (!(asked === 'quote' || params.get('thread') || hrLinkId)) return
    const q = new URLSearchParams()
    for (const k of ['company', 'companyId', 'thread', 'hrLink']) { const v = params.get(k); if (v) q.set(k, v) }
    router.replace(`/pricing-matrix/new${q.size ? `?${q}` : ''}`)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps


  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white" style={{ color: '#0f1412' }}>
    <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div className="min-w-0 max-w-[640px]">
          <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Employment Benefits</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* One primary action: + New quotation on the register. Email insurer is secondary; Drive is on each quotation. */}
          <button onClick={() => setEmailInsurer({ insurer: null })} className="h-9 px-4 rounded-[7px] border border-[#d5d9d4] bg-white text-[#0f1412] text-[14px] font-medium inline-flex items-center gap-2 cursor-pointer hover:bg-[#faf9f6]">
            <Mail size={16} /> Email insurer
          </button>
        </div>
      </div>

      <div className="mt-8 mb-6">
        <Segmented size="sm" label="Section" value={tab} onChange={setTab} options={TABS.map(t => ({ value: t, label: TAB_LABEL[t] }))} />
      </div>

      {tab === 'rules' && <PlanRules />}
      {tab === 'tables' && (
        <InsurersTab tables={tables} loading={loading} onUpload={() => setShowUpload(true)} onEmail={(insurer, plan) => setEmailInsurer({ insurer, plan })} />
      )}
      {tab === 'eb' && <EbRegister newHref="/pricing-matrix/new" />}
      {tab === 'hrlinks' && <HrLinksTab openSend={sendFromUrl} initialCompany={hrCompany} initialEffectiveDate={params.get('start')} initialQuotationId={params.get('quote')} onDialogClosed={() => setSendFromUrl(false)} />}

      <InsurerEmailDialog open={!!emailInsurer} initialInsurer={emailInsurer?.insurer} initialPlan={emailInsurer?.plan} onClose={() => setEmailInsurer(null)} />
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onDone={() => { setShowUpload(false); load() }} />}
    </div>
    </div>
  )
}


/**
 * Insurers, in two groups. Priced here: the local insurers whose rate tables are loaded; a quote
 * prices them all at once. Quote on request: everyone else with an employee benefits contact
 * (Cigna, April), emailed from the row. The Drive files the rate tables are read from sit below.
 */
function InsurersTab({ tables, loading, onUpload, onEmail }: {
  tables: RateTable[]; loading: boolean; onUpload: () => void; onEmail: (insurer: string, plan?: string) => void
}) {
  const router = useRouter()
  const [contacts, setContacts] = useState<InsurerContact[]>([])
  const [ebInsurers, setEbInsurers] = useState<string[]>([])
  const [contactsError, setContactsError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const reload = () => loadInsurerContacts().then(d => { setContacts(d.contacts); setEbInsurers(d.eb_insurers.map(e => e.insurer)) }).catch(e => setContactsError(e instanceof Error ? e.message : 'Could not load contacts'))
  useEffect(() => { void reload() }, [])

  const priced = new Set(tables.map(t => normInsurer(t.insurer_name)))
  const named = new Set(ON_REQUEST_PLANS.map(p => normInsurer(p.insurer)))
  // Tier B plans first (Cigna, April), then every other insurer with an employee-benefits product
  // on the Insurers page (Tier C), contact or not, so a missing contact shows as a gap to fill.
  const onRequest = [
    ...ON_REQUEST_PLANS.map(p => ({ key: p.key, insurer: p.insurer, label: p.label, rates: `Tier B · ${p.rates}`, plan: p.label as string | undefined })),
    ...Array.from(new Set([...ebInsurers, ...contacts.map(c => c.insurer)]))
      .filter(n => !priced.has(normInsurer(n)) && !named.has(normInsurer(n)))
      .sort((a, b) => shortInsurer(a).localeCompare(shortInsurer(b)))
      .map(n => ({ key: n, insurer: n, label: shortInsurer(n), rates: 'Tier C · On request', plan: undefined })),
  ]
  const who = (name: string | null) => contactsFor(name ?? '', contacts)
  const h2 = 'm-0 text-[16px] font-medium tracking-[-0.01em]'
  const LINK = 'inline-flex items-center gap-1.5 text-[13px] font-medium bg-transparent border-0 p-0 cursor-pointer hover:underline'

  return (
    <div className="flex flex-col gap-10">
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className={h2}>Priced here · {tables.length}</h2>
          <button onClick={onUpload} className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-1.5 rounded-lg border border-[#d5d9d4] text-[#0f1412] bg-white hover:bg-[#faf9f6]">
            <UploadCloud size={14} /> Upload rate PDF
          </button>
        </div>
        {loading ? <p className="m-0 py-10 text-center text-[15px]" style={{ color: '#4a5550' }}>Loading…</p>
        : tables.length === 0 ? (
          <p className="m-0 py-16 text-center text-[15px]" style={{ color: '#4a5550' }}>No rate tables yet. Upload an insurer rate PDF to begin.</p>
        ) : (
          <Register label="Insurers priced here" minWidth={980}>
            <RegisterHead>
              <RegisterTh first width={180}>Insurer</RegisterTh>
              <RegisterTh align="right">Year</RegisterTh>
              <RegisterTh>Rates</RegisterTh>
              <RegisterTh>Contact</RegisterTh>
              <RegisterTh last align="right">{''}</RegisterTh>
            </RegisterHead>
            <tbody>
              {tables.map(t => (
                <RegisterRow key={t.id} onClick={() => router.push(`/pricing-matrix/${t.id}`)}>
                  <RegisterCell first primary={shortInsurer(t.insurer_name)} secondary={t.insurer_name ?? undefined} />
                  <RegisterCell align="right"><span className="text-[14px] tabular-nums" style={{ color: t.plan_year ? '#0f1412' : '#8c958f' }}>{t.plan_year ?? '—'}</span></RegisterCell>
                  <RegisterCell>{(() => { const v = verificationOf({ verification: t.verification }); return <span className={CHIP} style={{ color: VERIFICATION[v.status].color }} title={v.basis ?? undefined}>{t.status === 'approved' ? VERIFICATION[v.status].label : STATUS_LABEL[t.status] ?? t.status}</span> })()}</RegisterCell>
                  <RegisterCell nowrap={false}><ContactLines people={who(t.insurer_name)} /></RegisterCell>
                  <RegisterCell last align="right">
                    <button className={LINK} style={{ color: '#0f1412' }} onClick={e => { e.stopPropagation(); setEditing(t.insurer_name ?? '') }}>Edit contacts</button>
                  </RegisterCell>
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        )}
      </section>

      <section>
        <h2 className={cn(h2, 'mb-3')}>Quote on request · {onRequest.length}</h2>
        {contactsError && <p className="m-0 mb-3 text-[13px]" style={{ color: '#a1242f' }}>{contactsError}</p>}
        <Register label="Quoted on request" minWidth={860}>
          <RegisterHead>
            <RegisterTh first width={220}>Plan</RegisterTh>
            <RegisterTh>Rates</RegisterTh>
            <RegisterTh>Contact</RegisterTh>
            <RegisterTh last align="right">{''}</RegisterTh>
          </RegisterHead>
          <tbody>
            {onRequest.map(r => (
              <RegisterRow key={r.key}>
                <RegisterCell first primary={r.label} secondary={r.plan ? r.insurer : undefined} />
                <RegisterCell><span className="text-[14px]" style={{ color: '#2a332f' }}>{r.rates}</span></RegisterCell>
                <RegisterCell nowrap={false}><ContactLines people={who(r.insurer)} /></RegisterCell>
                <RegisterCell last align="right">
                  <span className="inline-flex items-center gap-4">
                    <button className={LINK} style={{ color: '#4a5550' }} onClick={() => setEditing(r.insurer)}>Edit contacts</button>
                    <button className={LINK} style={{ color: '#0f1412' }} onClick={() => onEmail(r.insurer, r.plan)}><Mail size={14} /> Email</button>
                  </span>
                </RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      </section>

      <section>
        <h2 className={cn(h2, 'mb-3')}>Files in Drive</h2>
        <SourceFilesTab />
      </section>

      <InsurerContactsDialog open={!!editing} insurer={editing} onClose={() => setEditing(null)} onChanged={() => void reload()} />
    </div>
  )
}

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!file) { setError('Choose a PDF'); return }
    if (file.type !== 'application/pdf') { setError('File must be a PDF'); return }
    if (file.size > 25 * 1024 * 1024) { setError('PDF too large (max 25 MB)'); return }
    setBusy(true); setError(null)
    try {
      // 1. Push the PDF straight to Drive through a resumable session — bypasses the
      //    serverless request-body size limit that fails on large insurer brochures.
      const ref = await uploadToDrive(file, 'group-benefits/rate-tables')
      // 2. Record the uploaded file → creates the draft row.
      const cr = await fetch('/api/group-benefits/rate-tables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storage_path: ref, filename: file.name }) })
      const cd = await safeJson<{ id?: string }>(cr)
      if (!cr.ok || !cd.id) { setError(cd.error ?? 'Upload failed'); return }
      // The review page starts extraction (single trigger) and polls for completion.
      onDone()
      router.push(`/pricing-matrix/${cd.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[16px] bg-white p-6 flex flex-col gap-3" style={{ boxShadow: '0 24px 64px rgba(15,20,18,0.2)' }} onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="m-0 text-[20px] font-medium tracking-[-0.01em] text-foreground">Upload insurer rate PDF</h3>
          <p className="text-[11.5px] text-muted-foreground/70 mt-0.5">Insurer, product, age basis, plan year and effective date are read from the PDF — you can correct them during review.</p>
        </div>
        <label className="flex flex-col items-center justify-center gap-2 rounded-[12px] py-10 cursor-pointer bg-[#f1f2ee] hover:bg-[#e6e8e4]">
          <UploadCloud size={24} className="text-muted-foreground/50" />
          <span className="text-[12.5px] font-medium">{file ? file.name : 'Choose a PDF'}</span>
          <input type="file" accept="application/pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {error && <p className="text-[12px] text-[#a1242f]">{error}</p>}
        <div className="flex justify-end gap-2 mt-1">
          <button onClick={onClose} className="h-9 px-3.5 rounded-[10px] text-[14px] bg-transparent border-0 hover:bg-[#f1f2ee]">Cancel</button>
          <button onClick={submit} disabled={busy || !file} className="flex items-center gap-1.5 h-9 px-5 rounded-[10px] text-[14px] font-medium bg-[#132c1c] text-white hover:opacity-90 disabled:opacity-50">
            {busy && <Loader2 size={14} className="animate-spin" />}{busy ? 'Uploading…' : 'Upload and extract'}
          </button>
        </div>
      </div>
    </div>
  )
}
