'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, Download, Reply, RefreshCw, FolderOpen, Mail, Link2, UploadCloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThreadSelectorModal } from '@/components/group-benefits/ThreadSelectorModal'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { BenefitComparison } from '@/components/group-benefits/BenefitComparison'
import { ValueScore } from '@/components/group-benefits/ValueScore'
import type { Comparison } from '@/lib/gb/compare'
import { resolveProduct } from '@/lib/gb/resolve'
import { PRODUCT_BY_CODE } from '@/lib/gb/canon'
import { shortInsurer, ON_REQUEST_PLANS } from '@/lib/gb/insurer-names'
import { Step } from '@/components/group-benefits/Step'
import { InsurerEmailDialog, loadInsurerContacts, contactsFor, ContactLines, type InsurerContact } from '@/components/group-benefits/InsurerEmailDialog'
import { InsurerContactsDialog } from '@/components/group-benefits/InsurerContactsDialog'

type InsurerResult = { rate_table_id: string; insurer_id: string | null; insurer_name: string; by_product: Record<string, number>; subtotal: number; gst: number; total: number; missing: number }
type Line = { member_name: string; relationship: string; category: string; age: number | null; insurer_name: string; product_code: string; plan_code: string | null; premium: number | null; note: string | null }
type Quotation = { id: string; company_name: string | null; effective_date: string | null; product_codes: string[]; member_count: number; results: InsurerResult[]; benefits_analysis: Comparison | null; priorities: string | null; notes: string | null; created_at: string; source: string }

/** Quotes compared before 2 Oct 2026 hold generated prose, not a comparison. Detect that by the
 *  absence of the comparison's own shape and offer a recompare, rather than rendering a narrative
 *  this page no longer produces. */
const isComparison = (a: unknown): a is Comparison =>
  !!a && typeof a === 'object' && Array.isArray((a as Comparison).groups) && Array.isArray((a as Comparison).premium)

const money = (n: number) => n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' })
const fmtDate = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const BTN2 = 'inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-1.5 rounded-lg border border-[#d5d9d4] bg-white text-[#0f1412] hover:bg-[#faf9f6] no-underline cursor-pointer'
const BTN1 = 'inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-[#0f1412] text-white hover:opacity-90 no-underline border-0 cursor-pointer'

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [q, setQ] = useState<Quotation | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [analysis, setAnalysis] = useState<Comparison | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachFormat, setAttachFormat] = useState<'xlsx' | 'csv'>('xlsx')
  const [showThreadPick, setShowThreadPick] = useState(false)
  const [preparing, setPreparing] = useState<string | null>(null)
  const [emailInsurer, setEmailInsurer] = useState<{ insurer: string | null; plan?: string } | null>(null)
  const [editingContacts, setEditingContacts] = useState<string | null>(null)
  const [contacts, setContacts] = useState<InsurerContact[]>([])
  const [folderError, setFolderError] = useState<string | null>(null)
  const reloadContacts = () => loadInsurerContacts().then(d => setContacts(d.contacts)).catch(() => {})
  useEffect(() => { void reloadContacts() }, [])

  /** The company's Employment Benefits folder in Drive, created on first open. */
  async function openFolder(name: string) {
    const tab = window.open('', '_blank')
    setFolderError(null)
    try {
      const res = await fetch('/api/group-benefits/folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_name: name }) })
      const d = await res.json().catch(() => ({})) as { url?: string; error?: string }
      if (!res.ok || !d.url) { tab?.close(); setFolderError(d.error ?? `Drive folder failed (${res.status})`); return }
      if (tab) tab.location.href = d.url; else window.location.href = d.url
    } catch (e) { tab?.close(); setFolderError(e instanceof Error ? e.message : 'Drive folder failed') }
  }

  async function prepareReply(leadId: string) {
    setPreparing('Generating files & drafting reply…')
    try {
      const res = await fetch(`/api/group-benefits/quote/${id}/prepare-reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, insurers: byInsurer.map(r => r.insurer_name), format: attachFormat }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Could not prepare reply'); setPreparing(null); setShowThreadPick(false); return }
      router.push(`/engagement?lead=${leadId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed'); setPreparing(null); setShowThreadPick(false)
    }
  }

  const load = useCallback(async () => {
    const res = await fetch(`/api/group-benefits/quote/${id}`, { cache: 'no-store' })
    if (!res.ok) return
    const d = await res.json()
    setQ(d.quotation); setLines(d.lines ?? []); setAnalysis(d.quotation?.benefits_analysis ?? null)
  }, [id])
  useEffect(() => { load() }, [load])

  const byInsurer = useMemo(() => {
    if (!q) return []
    const m = new Map<string, { insurer_name: string; subtotal: number; gst: number; total: number; missing: number; by_product: Record<string, number> }>()
    for (const r of q.results ?? []) {
      const key = r.insurer_id ?? `name:${r.insurer_name}`
      const e = m.get(key) ?? { insurer_name: r.insurer_name, subtotal: 0, gst: 0, total: 0, missing: 0, by_product: {} }
      e.subtotal += r.subtotal; e.gst += r.gst; e.total += r.total; e.missing += r.missing
      for (const [p, v] of Object.entries(r.by_product)) e.by_product[p] = (e.by_product[p] ?? 0) + v
      m.set(key, e)
    }
    return Array.from(m.values()).sort((a, b) => a.total - b.total)
  }, [q])

  async function compareBenefits() {
    setAnalyzing(true); setError(null)
    try {
      const res = await fetch(`/api/group-benefits/quote/${id}/compare-benefits`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      const d = await res.json()
      if (res.ok && d.comparison) setAnalysis(d.comparison as Comparison); else setError(d.error ?? 'Comparison failed')
    } finally { setAnalyzing(false) }
  }

  if (!q) return <div className="p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>

  const company = q.company_name || ''
  const enc = encodeURIComponent(company)
  const covers = Array.from(new Set((q.product_codes ?? []).flatMap(t => resolveProduct(t).codes))).map(c => PRODUCT_BY_CODE[c]?.abbrev ?? c).join(', ') || (q.product_codes ?? []).join('/')
  const priced = byInsurer.length > 0 && q.member_count > 0
  const basis = (q.notes ?? '').split('\n').filter(l => l.trim() && !/^\s*Drafted by/.test(l)).map(l => l.replace(/\s*\[(message|thread):[^\]]*\]/g, ''))
  const summary = (label: string) => <summary className="cursor-pointer text-[16px] font-medium tracking-[-0.01em] list-none [&::-webkit-details-marker]:hidden"><span className="inline-block w-4 text-[#8c958f]">›</span>{label}</summary>

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: '#0f1412' }}>
    <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
      <button onClick={() => router.push('/pricing-matrix')} className="inline-flex items-center gap-1.5 text-[14px] bg-transparent border-0 p-0 cursor-pointer hover:underline mb-3" style={{ color: '#4a5550' }}>← Quotes</button>

      <div className="mb-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">{company || 'Untitled quote'}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {company && <button onClick={() => openFolder(company)} className={BTN2}><FolderOpen size={14} /> Drive</button>}
            <button onClick={() => setEmailInsurer({ insurer: null })} className={BTN2}><Mail size={14} /> Email insurer</button>
            {priced && <a href={`/api/group-benefits/quote/${id}/report-pdf?download=1`} className={BTN2}>Download PDF</a>}
            {priced && <a href={`/pricing-matrix/quote/${id}/report`} className={BTN2}>Client report</a>}
          </div>
        </div>
        <p className="m-0 text-[14px] mt-2 tabular-nums" style={{ color: '#4a5550' }}>
          {q.member_count} members · {covers}{q.effective_date ? ` · starts ${fmtDate(q.effective_date)}` : ''} · quoted {fmtDate(q.created_at)}
        </p>
        {folderError && <p className="m-0 mt-2 text-[13px]" style={{ color: '#a1242f' }}>{folderError}</p>}
      </div>

      {/* No employee list: the one thing to do next, here, not three clicks away. */}
      {!priced && (
        <section className="mb-10 rounded-[14px] p-5 flex flex-wrap items-center justify-between gap-4" style={{ border: '1px solid #e6e8e4', background: '#faf9f6' }}>
          <div>
            <h2 className="m-0 text-[16px] font-medium">Employee list</h2>
            <p className="m-0 mt-1 text-[14px]" style={{ color: '#4a5550' }}>Not received. Pricing starts when it arrives.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/pricing-matrix?tab=quote&company=${enc}`} className={BTN2}><UploadCloud size={14} /> Upload employee list</a>
            <a href={`/pricing-matrix?tab=hrlinks&company=${enc}&quote=${id}${q.effective_date ? `&start=${q.effective_date}` : ''}`} className={BTN1}><Link2 size={14} /> Send HR a link</a>
          </div>
        </section>
      )}

      {priced && (
        <section className="mb-10">
          <Step n={1} className="mb-4">Premiums</Step>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]"
               style={{ '--n': Math.min(byInsurer.length, 5) } as React.CSSProperties}>
            {byInsurer.map((r, i) => (
              <div key={r.insurer_name} className={cn('rounded-xl border p-4', i === 0 ? 'border-[#0f1412] bg-white' : 'border-border bg-card')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold text-foreground" title={r.insurer_name}>{shortInsurer(r.insurer_name)}</span>
                  {i === 0 && <span className="text-[11.5px] font-medium bg-[#f1f2ee] text-[#2a332f] px-2 py-0.5 rounded-[6px] whitespace-nowrap">Lowest</span>}
                </div>
                <p className="text-[22px] font-bold text-foreground mt-1 tabular-nums">{money(r.total)}</p>
                <p className="text-[11px] text-muted-foreground/70 tabular-nums">incl. {money(r.gst)} GST</p>
                <div className="mt-2 flex flex-col gap-0.5 text-[11.5px] text-muted-foreground">
                  {Object.entries(r.by_product).map(([p, v]) => <div key={p} className="flex justify-between gap-2"><span className="truncate">{p}</span><span className="tabular-nums">{money(v)}</span></div>)}
                </div>
                {r.missing > 0 && <p className="text-[11px] text-[#8a5a00] mt-1.5">{r.missing} line{r.missing === 1 ? '' : 's'} unpriced</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {priced && (
        <section className="mb-10">
          <Step n={2} className="mb-4">Compare</Step>
          {isComparison(analysis) ? (
            <div className="flex flex-col gap-6">
              <ValueScore quoteId={id} comparison={analysis} priorities={q.priorities} employeesFallback={q.member_count} />
              <BenefitComparison comparison={analysis} busy={analyzing} onRecompute={() => compareBenefits()} />
            </div>
          ) : (
            <div className="border border-border rounded-lg p-4 flex items-center justify-between gap-3">
              <span className="text-[14px]" style={{ color: '#2a332f' }}>{analysis ? 'Written comparison from before 2 Oct 2026.' : 'Benefits not compared yet.'}</span>
              <button onClick={compareBenefits} disabled={analyzing} className={cn(BTN2, 'disabled:opacity-50')}>
                {analyzing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {analyzing ? 'Comparing…' : analysis ? 'Recompare' : 'Compare benefits'}
              </button>
            </div>
          )}
          {error && <p className="text-[12.5px] mt-2" style={{ color: '#a1242f' }}>{error}</p>}
        </section>
      )}

      {priced && (
        <section className="mb-10">
          <Step n={3} className="mb-4">Quote on request</Step>
          <Register label="Quoted on request" minWidth={760}>
            <RegisterHead>
              <RegisterTh first width={220}>Plan</RegisterTh>
              <RegisterTh>Rates</RegisterTh>
              <RegisterTh>Contact</RegisterTh>
              <RegisterTh last align="right">{''}</RegisterTh>
            </RegisterHead>
            <tbody>
              {ON_REQUEST_PLANS.map(p => (
                <RegisterRow key={p.key}>
                  <RegisterCell first primary={p.label} secondary={p.insurer} />
                  <RegisterCell><span className="text-[14px]" style={{ color: '#2a332f' }}>{p.rates}</span></RegisterCell>
                  <RegisterCell nowrap={false}><ContactLines people={contactsFor(p.insurer, contacts)} /></RegisterCell>
                  <RegisterCell last align="right">
                    <span className="inline-flex items-center gap-4">
                      <button className="text-[13px] font-medium bg-transparent border-0 p-0 cursor-pointer hover:underline" style={{ color: '#4a5550' }} onClick={() => setEditingContacts(p.insurer)}>Edit contacts</button>
                      <button className="inline-flex items-center gap-1.5 text-[13px] font-medium bg-transparent border-0 p-0 cursor-pointer hover:underline" style={{ color: '#0f1412' }} onClick={() => setEmailInsurer({ insurer: p.insurer, plan: p.label })}><Mail size={14} /> Email</button>
                    </span>
                  </RegisterCell>
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        </section>
      )}

      {priced && (
        <section className="mb-10">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <Step n={4}>Send to client</Step>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: '#4a5550' }}>
                Attach as
                <div className="inline-flex rounded-lg border border-border overflow-hidden">
                  {(['xlsx', 'csv'] as const).map(f => (
                    <button key={f} onClick={() => setAttachFormat(f)}
                      className={cn('px-2.5 py-1 font-medium border-0', attachFormat === f ? 'bg-[#0f1412] text-white' : 'bg-white text-muted-foreground hover:bg-muted/40')}>{f}</button>
                  ))}
                </div>
              </div>
              <button onClick={() => setShowThreadPick(true)} className={BTN1}><Reply size={14} /> Reply to client thread</button>
            </div>
          </div>
          <Register label="Quote files" minWidth={560}>
            <RegisterHead>
              <RegisterTh first width={200}>Insurer</RegisterTh>
              <RegisterTh align="right">Premium</RegisterTh>
              <RegisterTh last align="right">File</RegisterTh>
            </RegisterHead>
            <tbody>
              {byInsurer.map(r => (
                <RegisterRow key={r.insurer_name}>
                  <RegisterCell first primary={shortInsurer(r.insurer_name)} />
                  <RegisterCell align="right"><span className="text-[14px] tabular-nums">{money(r.total)}</span></RegisterCell>
                  <RegisterCell last align="right">
                    <span className="inline-flex gap-2">
                      <a href={`/api/group-benefits/quote/${id}/export?format=xlsx&insurer=${encodeURIComponent(r.insurer_name)}`} className={BTN2}><Download size={13} /> XLSX</a>
                      <a href={`/api/group-benefits/quote/${id}/export?format=csv&insurer=${encodeURIComponent(r.insurer_name)}`} className={BTN2}><Download size={13} /> CSV</a>
                    </span>
                  </RegisterCell>
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        </section>
      )}

      {showThreadPick && <ThreadSelectorModal onPick={prepareReply} onClose={() => { if (!preparing) setShowThreadPick(false) }} busyLabel={preparing} />}

      {/* Reference, folded: what each plan was matched against, and every member's line. */}
      {basis.length > 0 && (
        <details className="mb-6 border-t pt-5" style={{ borderColor: '#e6e8e4' }} open={!priced}>
          {summary('Basis')}
          <ul className="m-0 mt-3 pl-4 list-disc flex flex-col gap-1 text-[13.5px] max-w-[95ch]" style={{ color: '#2a332f' }}>
            {basis.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </details>
      )}
      {lines.length > 0 && (
        <details className="mb-8 border-t pt-5" style={{ borderColor: '#e6e8e4' }}>
          {summary(`Per-member breakdown · ${lines.length} lines`)}
          <div className="mt-3">
            <Register label="Per-member breakdown" minWidth={760} maxHeight="520px">
              <RegisterHead>
                <RegisterTh first width={260}>Member</RegisterTh>
                <RegisterTh>Insurer</RegisterTh>
                <RegisterTh>Product</RegisterTh>
                <RegisterTh>Plan</RegisterTh>
                <RegisterTh align="right">Age</RegisterTh>
                <RegisterTh last align="right">Premium</RegisterTh>
              </RegisterHead>
              <tbody>
                {lines.map((l, i) => (
                  <RegisterRow key={i}>
                    <RegisterCell first primary={l.member_name} secondary={l.relationship} />
                    <RegisterCell><span className="text-[14px]" style={{ color: '#2a332f' }}>{shortInsurer(l.insurer_name)}</span></RegisterCell>
                    <RegisterCell><span className="text-[14px]" style={{ color: '#2a332f' }}>{l.product_code}</span></RegisterCell>
                    <RegisterCell><span className="text-[14px]" style={{ color: l.plan_code ? '#2a332f' : '#8c958f' }}>{l.plan_code ?? '—'}</span></RegisterCell>
                    <RegisterCell align="right"><span className="text-[14px] tabular-nums" style={{ color: l.age != null ? '#2a332f' : '#8c958f' }}>{l.age ?? '—'}</span></RegisterCell>
                    <RegisterCell last align="right" nowrap={false}>
                      {l.premium != null ? <span className="text-[14px] font-medium tabular-nums" style={{ color: '#0f1412' }}>{money(l.premium)}</span> : <span className="block text-[13px] leading-snug" style={{ color: '#4a5550' }}>{l.note}</span>}
                    </RegisterCell>
                  </RegisterRow>
                ))}
              </tbody>
            </Register>
          </div>
        </details>
      )}

      <InsurerContactsDialog open={!!editingContacts} insurer={editingContacts} onClose={() => setEditingContacts(null)} onChanged={() => void reloadContacts()} />
      <InsurerEmailDialog open={!!emailInsurer} onClose={() => setEmailInsurer(null)} initialInsurer={emailInsurer?.insurer} initialPlan={emailInsurer?.plan}
        initialCompany={company} initialStart={q.effective_date} initialLives={q.member_count ? `${q.member_count} members` : null} />
    </div>
    </div>
  )
}
