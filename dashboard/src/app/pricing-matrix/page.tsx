'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { UploadCloud, Mail, X } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { SourceFilesTab } from '@/components/group-benefits/SourceFilesTab'
import { HrLinksTab } from '@/components/group-benefits/hr/HrLinksTab'
import { EbQuotationRegister } from '@/components/eb/EbQuotationRegister'
import { WorkbookReload } from '@/components/eb/WorkbookReload'
import { PageHeader } from '@/components/page-header'
import { InsurerEmailDialog, loadInsurerContacts, contactsFor, ContactLines, type InsurerContact } from '@/components/group-benefits/InsurerEmailDialog'
import { InsurerContactsDialog } from '@/components/group-benefits/InsurerContactsDialog'
import { shortInsurer, ON_REQUEST_PLANS } from '@/lib/gb/insurer-names'
import { normInsurer } from '@/lib/insurers'
import type { CompanyPick } from '@/components/group-benefits/hr/SendLinkDialog'
import { VERIFICATION, verificationOf } from '@/lib/gb/verification'
import { uploadToDrive } from '@/lib/upload-attachment'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { Btn, Chip, LinkBtn, Segmented } from '@/components/crm/primitives'
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
 * Since 20 Nov 2026 the page is the Quotation register: the quotations kept from /eb (eb_quotations),
 * each opening its proposal. The older quotations (gb_quotations) keep their /pricing-matrix/quote/<id>
 * addresses; scripts/eb-reprice-legacy.ts re-prices them into the register on Jarod's go.
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
    if (q.get('companyId')) { q.set('company', q.get('companyId')!); q.delete('companyId') } else q.delete('company')
    router.replace(`/eb${q.size ? `?${q}` : ''}`)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps


  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white" style={{ color: '#0f1412' }}>
    <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
      {/* Jarod, 20 Nov 2026: the register of quotations kept from /eb. One primary: New quotation. */}
      <PageHeader title="Quotation register" actions={<>
        <Btn onClick={() => setEmailInsurer({ insurer: null })}><Mail size={16} /> Email insurer</Btn>
        <LinkBtn level="primary" href="/eb">New quotation</LinkBtn>
      </>} />

      <div className="mt-8 mb-6">
        <Segmented variant="tabs" size="sm" label="Section" value={tab} onChange={setTab} options={TABS.map(t => ({ value: t, label: TAB_LABEL[t] }))} />
      </div>

      {tab === 'rules' && <PlanRules />}
      {tab === 'tables' && (
        <InsurersTab tables={tables} loading={loading} onUpload={() => setShowUpload(true)} onEmail={(insurer, plan) => setEmailInsurer({ insurer, plan })} />
      )}
      {tab === 'eb' && <EbQuotationRegister />}
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

  return (
    <div className="flex flex-col gap-10">
      <WorkbookReload />
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className={h2}>Priced here · {tables.length}</h2>
          <Btn size="xs" onClick={onUpload}><UploadCloud size={14} /> Upload rate PDF</Btn>
        </div>
        {loading ? <p className="m-0 py-10 text-center text-[15px]" style={{ color: '#4a5550' }}>Loading…</p>
        : tables.length === 0 ? (
          <p className="m-0 py-16 text-center text-[15px]" style={{ color: '#4a5550' }}>No rate tables yet. Upload an insurer rate PDF to begin.</p>
        ) : (
          <Register label="Insurers priced here" minWidth={980}>
            <RegisterHead>
              <RegisterTh first width={180}>Insurer</RegisterTh>
              <RegisterTh>Year</RegisterTh>
              <RegisterTh>Rates</RegisterTh>
              <RegisterTh>Contact</RegisterTh>
              <RegisterTh last>{''}</RegisterTh>
            </RegisterHead>
            <tbody>
              {tables.map(t => (
                <RegisterRow key={t.id} onClick={() => router.push(`/pricing-matrix/${t.id}`)}>
                  <RegisterCell first primary={shortInsurer(t.insurer_name)} secondary={t.insurer_name ?? undefined} />
                  <RegisterCell><span className="text-[14px] tabular-nums" style={{ color: t.plan_year ? '#0f1412' : '#8c958f' }}>{t.plan_year ?? '—'}</span></RegisterCell>
                  <RegisterCell>{(() => { const v = verificationOf({ verification: t.verification }); return <Chip title={v.basis ?? undefined}>{t.status === 'approved' ? VERIFICATION[v.status].label : STATUS_LABEL[t.status] ?? t.status}</Chip> })()}</RegisterCell>
                  <RegisterCell align="left" nowrap={false}><ContactLines people={who(t.insurer_name)} /></RegisterCell>
                  <RegisterCell last>
                    <Btn size="xs" level="tertiary" onClick={e => { e.stopPropagation(); setEditing(t.insurer_name ?? '') }}>Edit contacts</Btn>
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
            <RegisterTh last>{''}</RegisterTh>
          </RegisterHead>
          <tbody>
            {onRequest.map(r => (
              <RegisterRow key={r.key}>
                <RegisterCell first primary={r.label} secondary={r.plan ? r.insurer : undefined} />
                <RegisterCell><span className="text-[14px]" style={{ color: '#2a332f' }}>{r.rates}</span></RegisterCell>
                <RegisterCell align="left" nowrap={false}><ContactLines people={who(r.insurer)} /></RegisterCell>
                <RegisterCell last>
                  <span className="inline-flex items-center gap-2">
                    <Btn size="xs" level="tertiary" onClick={() => setEditing(r.insurer)}>Edit contacts</Btn>
                    <Btn size="xs" onClick={() => onEmail(r.insurer, r.plan)}><Mail size={14} /> Email</Btn>
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
    <DialogPrimitive.Root open onOpenChange={o => { if (!o) onClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="trs-modal-overlay fixed inset-0 z-[100]" />
        <DialogPrimitive.Content aria-describedby={undefined} className="trs-modal-panel fixed left-1/2 top-1/2 z-[101] flex w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-[28px] bg-white px-8 pt-7 pb-6 shadow-[0_30px_80px_rgba(15,20,18,0.25)] focus:outline-none">
          <DialogPrimitive.Close aria-label="Close" className="absolute right-[18px] top-[18px] inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border-0 bg-[#e8e8ed] text-[#3a3a3c] cursor-pointer"><X size={16} /></DialogPrimitive.Close>
          <DialogPrimitive.Title className="m-0 pr-10 text-[22px] font-semibold tracking-[-0.02em] text-trs-ink">Upload insurer rate PDF</DialogPrimitive.Title>
          <label className="flex flex-col items-center justify-center gap-2 rounded-[12px] py-10 cursor-pointer bg-[#f1f2ee] hover:bg-[#e6e8e4]">
            <UploadCloud size={24} className="text-trs-muted" />
            <span className="text-[13px] font-medium">{file ? file.name : 'Choose a PDF'}</span>
            <input type="file" accept="application/pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {error && <p className="m-0 text-[13px] text-trs-neg" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn level="primary" loading={busy} disabled={busy || !file} onClick={() => void submit()}>{busy ? 'Uploading…' : 'Upload and extract'}</Btn>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
