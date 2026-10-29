'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { UploadCloud, Loader2, Clock, Plus, Mail, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NewQuoteWizard } from '@/components/group-benefits/NewQuoteWizard'
import { QuickQuote, type InitialRead } from '@/components/group-benefits/QuickQuote'
import { CoverageTab } from '@/components/group-benefits/CoverageTab'
import { SourceFilesTab } from '@/components/group-benefits/SourceFilesTab'
import { HrLinksTab } from '@/components/group-benefits/hr/HrLinksTab'
import { EbPoliciesTab } from '@/components/group-benefits/EbPoliciesTab'
import { InsurerEmailDialog, loadInsurerContacts, contactsFor, ContactLines, type InsurerContact } from '@/components/group-benefits/InsurerEmailDialog'
import { InsurerContactsDialog } from '@/components/group-benefits/InsurerContactsDialog'
import { shortInsurer, ON_REQUEST_PLANS } from '@/lib/gb/insurer-names'
import { normInsurer } from '@/lib/insurers'
import type { CompanyPick } from '@/components/group-benefits/hr/SendLinkDialog'
import type { HrLinkCensusResponse, HrLinkDetailResponse } from '@/components/group-benefits/hr/labels'
import { VERIFICATION, verificationOf } from '@/lib/gb/verification'
import { createClient } from '@/lib/supabase/client'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { Segmented } from '@/components/crm/primitives'

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
type Activity = { id: string; created_at: string; user_name: string | null; action: string; new_value: Record<string, unknown> | null }

// Every status is the same neutral chip; the label carries the meaning.
const STATUS_LABEL: Record<string, string> = { draft: 'Draft', extracting: 'Extracting', in_review: 'In review', approved: 'Approved', archived: 'Archived' }
const CHIP = 'inline-flex items-center rounded-[6px] bg-[#f1f2ee] text-[#2a332f] text-[11.5px] font-medium px-2 py-0.5 whitespace-nowrap'

// Workflow order: quotes are the job; employee lists feed them; insurers and coverage are reference.
type Tab = 'quotes' | 'hrlinks' | 'tables' | 'coverage' | 'activity'
const TABS: readonly Tab[] = ['quotes', 'hrlinks', 'tables', 'coverage', 'activity']
const TAB_LABEL: Record<Tab, string> = { quotes: 'Quotes', hrlinks: 'Employee lists', tables: 'Insurers', coverage: 'Coverage', activity: 'Activity' }


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
 * ?tab=quote&company=<name> opens the quote wizard for a client, which is how older links arrive. ?tab=quote&hrLink=<id> opens Quick quote with the census HR
 * submitted through that link. ?tab=hrlinks&company=<name>&companyId=<id> opens the HR links tab
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
  const initialTab: Tab = asked === 'quote' ? 'quotes' : TABS.find(t => t === asked) ?? 'quotes'
  const company = params.get('company') ?? undefined
  const companyId = params.get('companyId') ?? null
  const hrLinkId = params.get('hrLink') ?? null
  const [tab, setTab]   = useState<Tab>(initialTab)
  const [byHand, setByHand] = useState(false)
  const [newQuote, setNewQuote] = useState(asked === 'quote')
  const [tables, setTables] = useState<RateTable[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [emailInsurer, setEmailInsurer] = useState<{ insurer: string | null; plan?: string } | null>(null)
  const [driveUrl, setDriveUrl] = useState<string | null>(null)
  // Arriving from the company page with ?tab=hrlinks&company=…: the dialog opens once, filled in.
  const [sendFromUrl, setSendFromUrl] = useState(asked === 'hrlinks' && !!(company || companyId || params.get('send')))
  const hrCompany: CompanyPick | null = company || companyId ? { id: companyId, name: company ?? '' } : null
  // Arriving with ?hrLink=<id>: the census comes from the link's submission, not a file.
  const [hrRead, setHrRead] = useState<InitialRead | null>(null)
  const [hrReadState, setHrReadState] = useState<'idle' | 'loading' | 'ready' | 'failed'>(hrLinkId ? 'loading' : 'idle')
  const [hrReadError, setHrReadError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/group-benefits/rate-tables', { cache: 'no-store' })
    setTables(res.ok ? await res.json() : [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    fetch('/api/group-benefits/folder', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then((d: { url?: string } | null) => setDriveUrl(d?.url ?? null)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!hrLinkId) return
    let cancelled = false
    ;(async () => {
      try {
        const [cr, lr] = await Promise.all([
          fetch(`/api/group-benefits/hr-links/${hrLinkId}/census`, { cache: 'no-store' }),
          fetch(`/api/group-benefits/hr-links/${hrLinkId}`, { cache: 'no-store' }),
        ])
        const cd = await cr.json().catch(() => ({})) as HrLinkCensusResponse
        const ld = await lr.json().catch(() => ({})) as HrLinkDetailResponse
        if (cancelled) return
        if (cd.migrationPending || ld.migrationPending) { setHrReadError('Migration 20261019_hr_connect is not applied yet.'); setHrReadState('failed'); return }
        if (!cr.ok || !Array.isArray(cd.census)) { setHrReadError(cd.error ?? `Could not load the employee list (${cr.status}).`); setHrReadState('failed'); return }
        if (cd.census.length === 0) { setHrReadError('The link has no submitted list yet.'); setHrReadState('failed'); return }
        const link = lr.ok ? ld.link : undefined
        setHrRead({
          members: cd.census,
          company: link?.company_name ?? company ?? '',
          effectiveDate: link?.effective_date ?? null,
          source: link ? `HR link ${link.reference}` : 'HR link',
        })
        setHrReadState('ready')
      } catch (e) {
        if (cancelled) return
        setHrReadError(e instanceof Error ? e.message : 'Could not load the employee list.'); setHrReadState('failed')
      }
    })()
    return () => { cancelled = true }
  }, [hrLinkId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: '#0f1412' }}>
    <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div className="min-w-0 max-w-[640px]">
          <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Employment Benefits</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {driveUrl && (
            <a href={driveUrl} target="_blank" rel="noreferrer" className="h-11 px-4 rounded-[12px] border border-[#d5d9d4] bg-white text-[#0f1412] text-[15px] font-medium inline-flex items-center gap-2 no-underline hover:bg-[#faf9f6]">
              <FolderOpen size={16} /> Drive
            </a>
          )}
          <button onClick={() => setEmailInsurer({ insurer: null })} className="h-11 px-4 rounded-[12px] border border-[#d5d9d4] bg-white text-[#0f1412] text-[15px] font-medium inline-flex items-center gap-2 cursor-pointer hover:bg-[#faf9f6]">
            <Mail size={16} /> Email insurer
          </button>
          <button onClick={() => { setTab('quotes'); setNewQuote(false); setByHand(false) }} className="h-11 px-5 rounded-[12px] bg-[#0f1412] text-white text-[15px] font-medium border-0 inline-flex items-center gap-2 cursor-pointer hover:opacity-90">
            <Plus size={16} /> Quotes
          </button>
        </div>
      </div>

      {/* On a phone the bar scrolls sideways on its own instead of widening the page. The underline
          sits inside the bar and the scrollbar is hidden, so a desktop never shows a scroll handle. */}
      <div className="mt-8 mb-6 flex items-end gap-7 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ borderBottom: '1px solid #e6e8e4' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); if (t === 'quotes') setNewQuote(false) }}
            className={cn('relative pb-3 text-[15px] bg-transparent border-0 p-0 cursor-pointer whitespace-nowrap flex-shrink-0', tab === t ? 'font-medium text-[#0f1412]' : 'text-[#4a5550] hover:text-[#0f1412]')}>
            {TAB_LABEL[t]}
            {tab === t && <span className="absolute left-0 right-0 bottom-0 h-[2px] rounded-full bg-[#0f1412]" aria-hidden />}
          </button>
        ))}
      </div>

      {tab === 'tables' && (
        <InsurersTab tables={tables} loading={loading} onUpload={() => setShowUpload(true)} onEmail={(insurer, plan) => setEmailInsurer({ insurer, plan })} />
      )}
      {tab === 'quotes' && newQuote && (
        <button onClick={() => setNewQuote(false)} className="mb-4 text-[13px] bg-transparent border-0 p-0 cursor-pointer hover:underline" style={{ color: '#4a5550' }}>← All quotes</button>
      )}
      {tab === 'quotes' && newQuote && !byHand && hrReadState === 'loading' && (
        <p className="m-0 py-10 text-center text-[15px]" style={{ color: '#4a5550' }}>Loading the employee list…</p>
      )}
      {tab === 'quotes' && newQuote && !byHand && hrReadState === 'failed' && (
        <p className="m-0 mb-4 text-[13.5px]" style={{ color: '#a1242f' }}>{hrReadError}</p>
      )}
      {tab === 'quotes' && newQuote && !byHand && hrReadState !== 'loading' && (
        <div className="flex flex-col gap-10">
          <QuickQuote key={hrRead ? hrLinkId ?? 'hr' : 'file'} initialCompany={company} initialRead={hrRead ?? undefined} onUseWizard={() => setByHand(true)} />
          <section>
            <h2 className="m-0 mb-3 text-[16px] font-medium tracking-[-0.01em]">Engine quotes</h2>
            <QuotesTab onNew={() => window.scrollTo({ top: 0 })} />
          </section>
        </div>
      )}
      {tab === 'quotes' && newQuote && byHand && (
        <div className="flex flex-col gap-3">
          <button onClick={() => setByHand(false)} className="self-start text-[12.5px] bg-transparent border-0 p-0 cursor-pointer hover:underline" style={{ color: '#4a5550' }}>← Quick quote</button>
          <NewQuoteWizard initialCompany={company} onSaved={() => { /* results shown inline; Quotes tab reloads on open */ }} />
        </div>
      )}
      {tab === 'quotes' && !newQuote && <EbPoliciesTab onByHand={() => { setNewQuote(true); setByHand(false) }} />}
      {tab === 'coverage' && <CoverageTab />}
      {tab === 'hrlinks' && <HrLinksTab openSend={sendFromUrl} initialCompany={hrCompany} initialEffectiveDate={params.get('start')} initialQuotationId={params.get('quote')} onDialogClosed={() => setSendFromUrl(false)} />}
      {tab === 'activity' && <ActivityTab />}

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
  const [contactsError, setContactsError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const reload = () => loadInsurerContacts().then(d => setContacts(d.contacts)).catch(e => setContactsError(e instanceof Error ? e.message : 'Could not load contacts'))
  useEffect(() => { void reload() }, [])

  const priced = new Set(tables.map(t => normInsurer(t.insurer_name)))
  const named = new Set(ON_REQUEST_PLANS.map(p => normInsurer(p.insurer)))
  // Named higher-tier plans first, then any other insurer with an employee benefits contact.
  const onRequest = [
    ...ON_REQUEST_PLANS.map(p => ({ key: p.key, insurer: p.insurer, label: p.label, rates: p.rates, plan: p.label as string | undefined })),
    ...Array.from(new Set(contacts.map(c => c.insurer)))
      .filter(n => !priced.has(normInsurer(n)) && !named.has(normInsurer(n)))
      .sort((a, b) => shortInsurer(a).localeCompare(shortInsurer(b)))
      .map(n => ({ key: n, insurer: n, label: shortInsurer(n), rates: 'On request', plan: undefined })),
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

type Quote = { id: string; company_name: string | null; effective_date: string | null; product_codes: string[]; member_count: number; results: { insurer_name: string; total: number }[]; created_at: string; source?: string | null }

/** Who started the quote. Every quote is priced by the engine from the loaded rate tables. */
const SOURCE_LABEL: Record<string, string> = { email: 'Client email', csv: 'Upload', hr_link: 'HR link', manual: 'By hand' }
type QuoteFilter = 'all' | 'waiting' | 'priced'

const fmtDay = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const lowest = (q: Quote) => [...(q.results ?? [])].filter(r => r.total > 0).sort((a, b) => a.total - b.total)[0]

/**
 * One row per company, the latest quote first. A company quoted three times is one row with
 * "3 quotes"; casing differences ("BCEI SG PTE LTD" / "BCEI SG Pte Ltd") are the same company.
 * Waiting = no employee list yet, which is the next thing to chase.
 */
function QuotesTab({ onNew }: { onNew: () => void }) {
  const router = useRouter()
  const [rows, setRows] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<QuoteFilter>('all')
  useEffect(() => {
    fetch('/api/group-benefits/quote', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then((d) => { setRows(Array.isArray(d) ? d : []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const companies = (() => {
    const m = new Map<string, Quote[]>()
    for (const q of rows) {
      const k = (q.company_name ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() || `untitled:${q.id}`
      m.set(k, [...(m.get(k) ?? []), q])
    }
    return Array.from(m.values()).map(list => {
      const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
      const latestPriced = sorted.find(q => q.member_count > 0 && lowest(q))
      return { latest: sorted[0], shown: latestPriced ?? sorted[0], count: list.length, priced: !!latestPriced }
    }).sort((a, b) => b.latest.created_at.localeCompare(a.latest.created_at))
  })()
  const waiting = companies.filter(c => !c.priced).length
  const shown = companies.filter(c => filter === 'all' || (filter === 'waiting' ? !c.priced : c.priced))

  if (loading) return <p className="m-0 py-10 text-center text-[15px]" style={{ color: '#4a5550' }}>Loading…</p>
  if (rows.length === 0) return (
    <p className="m-0 py-16 text-center text-[15px]" style={{ color: '#4a5550' }}>
      No quotes yet. <button onClick={onNew} className="bg-transparent border-0 p-0 cursor-pointer underline" style={{ color: '#0f1412' }}>Start one</button>.
    </p>
  )
  return (
    <div className="flex flex-col gap-4">
      <Segmented value={filter} onChange={setFilter} className="self-start" options={[
        { value: 'all', label: 'All', count: companies.length },
        { value: 'waiting', label: 'Waiting for employee list', count: waiting },
        { value: 'priced', label: 'Priced', count: companies.length - waiting },
      ]} />
      <Register label="Quotes" minWidth={760}>
        <RegisterHead>
          <RegisterTh first width={300}>Company</RegisterTh>
          <RegisterTh>Status</RegisterTh>
          <RegisterTh>From</RegisterTh>
          <RegisterTh align="right">Members</RegisterTh>
          <RegisterTh align="right">Lowest premium</RegisterTh>
          <RegisterTh last align="right">Updated</RegisterTh>
        </RegisterHead>
        <tbody>
          {shown.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-[14px]" style={{ color: '#4a5550' }}>None.</td></tr>}
          {shown.map(({ latest, shown: q, count, priced }) => {
            const best = priced ? lowest(q) : undefined
            return (
              <RegisterRow key={q.id} onClick={() => router.push(`/pricing-matrix/quote/${q.id}`)}>
                <RegisterCell first primary={q.company_name || 'Untitled'}
                  secondary={[q.effective_date ? `starts ${fmtDay(q.effective_date)}` : null, count > 1 ? `${count} quotes` : null].filter(Boolean).join(' · ') || undefined} />
                <RegisterCell><span className={CHIP} style={priced ? undefined : { background: '#fff4dc', color: '#8a5a00' }}>{priced ? 'Priced' : 'Waiting for employee list'}</span></RegisterCell>
                <RegisterCell><span className="text-[14px]" style={{ color: '#2a332f' }}>{SOURCE_LABEL[q.source ?? ''] ?? q.source ?? '—'}</span></RegisterCell>
                <RegisterCell align="right"><span className="text-[14px] tabular-nums" style={{ color: q.member_count ? '#0f1412' : '#8c958f' }}>{q.member_count || '—'}</span></RegisterCell>
                {best ? <RegisterCell align="right" primary={best.total.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' })} secondary={shortInsurer(best.insurer_name)} /> : <RegisterCell align="right"><span style={{ color: '#8c958f' }}>—</span></RegisterCell>}
                <RegisterCell last align="right"><span className="text-[14px] tabular-nums" style={{ color: '#4a5550' }}>{fmtDay(latest.created_at)}</span></RegisterCell>
              </RegisterRow>
            )
          })}
        </tbody>
      </Register>
    </div>
  )
}

function ActivityTab() {
  const [rows, setRows] = useState<Activity[]>([])
  useEffect(() => {
    fetch('/api/activity?resource_type=gb_rate_table&limit=100', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : []).then(setRows).catch(() => {})
  }, [])
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(r => (
        <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 text-[13.5px]" style={{ borderBottom: '1px solid #e6e8e4' }}>
          <Clock size={12} className="text-muted-foreground/40 flex-shrink-0" />
          <span className="font-medium text-foreground/80">{r.action.replace('gb.', '').replace(/_/g, ' ')}</span>
          <span className="text-muted-foreground/60 truncate flex-1">{r.new_value ? JSON.stringify(r.new_value) : ''}</span>
          <span className="text-muted-foreground/50 flex-shrink-0">{r.user_name ?? ''} · {new Date(r.created_at).toLocaleString('en-SG')}</span>
        </div>
      ))}
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
      // 1. Push the PDF straight to Supabase Storage via a signed URL — bypasses the
      //    serverless request-body size limit that fails on large insurer brochures.
      const uu = await fetch('/api/group-benefits/rate-tables/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name }) })
      const ud = await safeJson<{ path?: string; token?: string }>(uu)
      if (!uu.ok || !ud.path || !ud.token) { setError(ud.error ?? 'Could not start upload'); return }
      const supabase = createClient()
      const { error: upErr } = await supabase.storage.from('group-benefits').uploadToSignedUrl(ud.path, ud.token, file, { contentType: 'application/pdf' })
      if (upErr) { setError(`Upload failed: ${upErr.message}`); return }
      // 2. Record the uploaded object → creates the draft row.
      const cr = await fetch('/api/group-benefits/rate-tables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storage_path: ud.path, filename: file.name }) })
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
          <button onClick={onClose} className="h-10 px-3.5 rounded-[10px] text-[14px] bg-transparent border-0 hover:bg-[#f1f2ee]">Cancel</button>
          <button onClick={submit} disabled={busy || !file} className="flex items-center gap-1.5 h-10 px-5 rounded-[10px] text-[14px] font-medium bg-[#0f1412] text-white hover:opacity-90 disabled:opacity-50">
            {busy && <Loader2 size={14} className="animate-spin" />}{busy ? 'Uploading…' : 'Upload and extract'}
          </button>
        </div>
      </div>
    </div>
  )
}
