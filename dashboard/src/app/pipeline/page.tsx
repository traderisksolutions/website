'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Building2, Plus, ArrowRight, Reply, Inbox, MessageCircle, Telescope, Radar, Table2, Megaphone, MailCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { NewCompanyDialog } from '@/components/crm/dialogs'
import { SectionCard, Btn, Chip, Empty, Spinner, inputCls } from '@/components/crm/primitives'
import { fmtMoney, fmtRelative, fmtDate } from '@/lib/crm/format'
import { STAGES, STAGE_LABEL, type CompanySummaryRow, type Stage } from '@/lib/crm/types'

type Lead = {
  origin: 'inbound' | 'outbound'
  id: string; name: string; email: string | null; company: string | null
  topic: string | null; source: string | null; status: string; created_at: string; message: string | null
}
type Board = {
  leads: Lead[]
  sales: CompanySummaryRow[]
  convert: CompanySummaryRow[]
  operations: CompanySummaryRow[]
  counts: { start: number; sales: number; convert: number; operations: number }
}

const STEPS = [
  { key: 'start',      label: 'Start',      help: 'Enquiries and prospecting that are not a company yet.' },
  { key: 'sales',      label: 'Sales',      help: 'Companies we are actively working towards a quote.' },
  { key: 'convert',    label: 'Convert',    help: 'Quotes in the market, waiting on a decision.' },
  { key: 'operations', label: 'Operations', help: 'Clients we service: renewals, claims and billing.' },
] as const
type Step = typeof STEPS[number]['key']

const SOURCES = [
  { href: '/inbound/email',      label: 'Website leads', icon: Inbox },
  { href: '/inbound/whatsapp',   label: 'WhatsApp',      icon: MessageCircle },
  { href: '/outbound/agent',     label: 'Lead Discovery', icon: Telescope },
  { href: '/outbound/signals',   label: 'Signal Library', icon: Radar },
  { href: '/outbound/leads',     label: 'Lead Database',  icon: Table2 },
]
const SALES_TOOLS = [
  { href: '/outbound/campaigns', label: 'Campaigns',    icon: Megaphone },
  { href: '/outbound/replies',   label: 'Reply Review', icon: MailCheck },
]

export default function PipelinePage() {
  return <Suspense fallback={<Spinner />}><Pipeline /></Suspense>
}

function Pipeline() {
  const router = useRouter()
  const search = useSearchParams()
  const step = (STEPS.some(s => s.key === search.get('step')) ? search.get('step') : 'start') as Step
  const setStep = (s: Step) => router.replace(`/pipeline${s === 'start' ? '' : `?step=${s}`}`, { scroll: false })

  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/companies/pipeline', { cache: 'no-store' })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Could not load the pipeline.'); return }
    setBoard(d)
  }, [])
  useEffect(() => { load() }, [load])

  async function moveStage(id: string, to: Stage) {
    setBusy(id); setError(null)
    try {
      const res = await fetch(`/api/companies/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: to }) })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not move.')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(null) }
  }

  async function convert(lead: Lead) {
    setBusy(lead.id); setError(null)
    try {
      const res = await fetch('/api/companies/from-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id, origin: lead.origin }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not create the company.')
      await load()
      setStep('sales')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(null) }
  }

  async function applySuggestions(ids: string[]) {
    setBusy('bulk'); setError(null)
    try {
      const res = await fetch('/api/companies/apply-suggested-stages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not apply.')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(null) }
  }

  const filtered = useMemo(() => {
    if (!board) return null
    const s = q.trim().toLowerCase()
    const match = (r: CompanySummaryRow) => !s || r.name.toLowerCase().includes(s) || (r.owner_email ?? '').includes(s)
    const matchLead = (l: Lead) => !s || l.name.toLowerCase().includes(s) || (l.company ?? '').toLowerCase().includes(s) || (l.email ?? '').includes(s)
    return { leads: board.leads.filter(matchLead), sales: board.sales.filter(match), convert: board.convert.filter(match), operations: board.operations.filter(match) }
  }, [board, q])

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-[980px] px-6 py-6">
        <PageHeader
          title="Pipeline"
          description="How work moves: enquiries come in, become companies, get quoted, then get serviced."
          className="mb-4"
          actions={<Btn level="primary" onClick={() => setCreating(true)}><Plus size={12} /> New company</Btn>}
        />

        {/* Journey steps — always visible so the whole path reads left to right. */}
        <nav className="flex items-stretch gap-1 overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0 mb-1" role="tablist">
          {STEPS.map((s, i) => {
            const n = board?.counts[s.key] ?? 0
            const on = step === s.key
            return (
              <div key={s.key} className="flex items-center gap-1 flex-shrink-0">
                {i > 0 && <ArrowRight size={12} className="text-muted-foreground/35" />}
                <button
                  role="tab"
                  aria-selected={on}
                  onClick={() => setStep(s.key)}
                  className={cn('inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] cursor-pointer border transition-colors',
                    on ? 'bg-[--primary-light-bg] border-[--primary-light-border] text-[--primary-hex] font-semibold' : 'bg-transparent border-transparent text-muted-foreground hover:bg-muted hover:text-foreground')}
                >
                  {s.label}
                  <span className={cn('text-[10.5px] font-semibold rounded-[5px] px-1 leading-4', on ? 'bg-white/70' : 'bg-muted')}>{n}</span>
                </button>
              </div>
            )
          })}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className={`${inputCls} ml-auto max-w-[180px] hidden sm:block`} />
        </nav>
        <p className="text-[12px] text-muted-foreground border-b border-[--border-subtle] pb-3 m-0">{STEPS.find(s => s.key === step)!.help}</p>

        {error && <p className="text-[12px] text-destructive mt-3">{error}</p>}
        {!board && <Spinner label="Loading pipeline…" />}

        {board && filtered && step === 'start' && (
          <>
            <SectionCard title="Where leads come from">
              <div className="flex flex-wrap gap-1.5">
                {SOURCES.map(s => (
                  <Link key={s.href} href={s.href} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] border border-[--border-subtle] text-[11.5px] no-underline text-muted-foreground hover:bg-muted hover:text-foreground">
                    <s.icon size={12} /> {s.label}
                  </Link>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Not a company yet" description="Move a lead into Sales to create its company and start tracking everything under it.">
              {filtered.leads.length === 0 && <Empty compact>Nothing waiting. Every lead has been picked up.</Empty>}
              <ul className="m-0 p-0 list-none flex flex-col">
                {filtered.leads.map(l => (
                  <li key={`${l.origin}-${l.id}`} className="flex items-start gap-3 py-2.5 border-b border-[--border-subtle] last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] m-0 flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium truncate">{l.company || l.name}</span>
                        <Chip tone={l.origin === 'inbound' ? 'green' : 'blue'}>{l.origin === 'inbound' ? 'Inbound' : 'Outbound'}</Chip>
                        {l.status !== 'new' && <Chip tone="neutral" className="capitalize">{l.status}</Chip>}
                      </p>
                      <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5 truncate">
                        {[l.company ? l.name : null, l.email, l.topic, l.source?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}
                      </p>
                      {l.message && <p className="text-[11px] text-muted-foreground/80 m-0 mt-0.5 line-clamp-1 italic">“{l.message}”</p>}
                    </div>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0 hidden sm:block">{fmtRelative(l.created_at)}</span>
                    <Btn size="xs" level="secondary" onClick={() => convert(l)} loading={busy === l.id} className="flex-shrink-0"><Building2 size={11} /> Move to Sales</Btn>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </>
        )}

        {board && filtered && step === 'sales' && (
          <>
            <SectionCard title="Outreach tools">
              <div className="flex flex-wrap gap-1.5">
                {SALES_TOOLS.map(s => (
                  <Link key={s.href} href={s.href} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] border border-[--border-subtle] text-[11.5px] no-underline text-muted-foreground hover:bg-muted hover:text-foreground">
                    <s.icon size={12} /> {s.label}
                  </Link>
                ))}
              </div>
            </SectionCard>
            <CompanyList rows={filtered.sales} busy={busy} onStage={moveStage} onApplyAll={applySuggestions} empty="No companies being worked. Move a lead in from Start." columns="sales" />
          </>
        )}

        {board && filtered && step === 'convert' && (
          <CompanyList rows={filtered.convert} busy={busy} onStage={moveStage} onApplyAll={applySuggestions} empty="Nothing in the market. Move a company here once a quote goes out." columns="convert" />
        )}

        {board && filtered && step === 'operations' && (
          <CompanyList rows={filtered.operations} busy={busy} onStage={moveStage} onApplyAll={applySuggestions} empty="No clients yet." columns="operations" />
        )}

        <NewCompanyDialog open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load() }} />
      </div>
    </div>
  )
}

function CompanyList({ rows, busy, onStage, onApplyAll, empty, columns }: {
  rows: CompanySummaryRow[]
  busy: string | null
  onStage: (id: string, to: Stage) => void
  onApplyAll?: (ids: string[]) => void
  empty: string
  columns: 'sales' | 'convert' | 'operations'
}) {
  const suggested = rows.filter(r => r.suggestedStage)
  return (
    <SectionCard
      title={`${rows.length} compan${rows.length === 1 ? 'y' : 'ies'}`}
      description={suggested.length > 0 ? `${suggested.length} look${suggested.length === 1 ? 's' : ''} mis-staged based on their policies, money and threads.` : undefined}
      actions={onApplyAll && suggested.length > 0
        ? <Btn size="xs" level="secondary" loading={busy === 'bulk'} onClick={() => onApplyAll(suggested.map(r => r.id))}>Apply {suggested.length} suggestion{suggested.length === 1 ? '' : 's'}</Btn>
        : undefined}
    >
      {rows.length === 0 && <Empty compact>{empty}</Empty>}
      <ul className="m-0 p-0 list-none flex flex-col">
        {rows.map(r => {
          const sgd = r.money.find(m => m.currency === 'SGD') ?? r.money[0]
          return (
            <li key={r.id} className={cn('flex items-start gap-3 py-2.5 border-b border-[--border-subtle] last:border-b-0', busy === r.id && 'opacity-50')}>
              <div className="min-w-0 flex-1">
                <Link href={`/companies/${r.id}`} className="text-[13px] font-medium no-underline text-foreground hover:text-primary block truncate">{r.name}</Link>
                <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5 truncate">
                  {[r.owner_email?.split('@')[0] ?? 'No owner', `${r.openThreads} thread${r.openThreads === 1 ? '' : 's'}`, fmtRelative(r.lastActivityAt)].join(' · ')}
                </p>
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  {r.needsReply > 0 && <Chip tone="amber"><Reply size={10} /> {r.needsReply} awaiting reply</Chip>}
                  {columns !== 'operations' && r.openQuotes > 0 && <Chip tone="blue">{r.openQuotes} open quote{r.openQuotes === 1 ? '' : 's'}</Chip>}
                  {columns === 'convert' && r.openQuotes === 0 && <Chip tone="neutral">No quote recorded</Chip>}
                  {columns === 'operations' && sgd && sgd.overdue > 0 && <Chip tone="red">{fmtMoney(sgd.overdue, sgd.currency, { compact: true })} overdue</Chip>}
                  {columns === 'operations' && sgd && sgd.overdue === 0 && sgd.outstanding > 0 && <Chip tone="neutral">{fmtMoney(sgd.outstanding, sgd.currency, { compact: true })} outstanding</Chip>}
                  {columns === 'operations' && r.nextRenewalDate && <Chip tone="neutral" title={fmtDate(r.nextRenewalDate)}>Renews {fmtRelative(r.nextRenewalDate)}</Chip>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <select
                  value={r.stage}
                  disabled={busy === r.id}
                  onChange={e => onStage(r.id, e.target.value as Stage)}
                  aria-label={`Stage for ${r.name}`}
                  className="h-7 rounded-[6px] border border-[--border-subtle] bg-transparent text-[11.5px] px-1.5 text-muted-foreground cursor-pointer"
                >
                  {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                </select>
                {r.suggestedStage && (
                  <button onClick={() => onStage(r.id, r.suggestedStage!)} className="text-[11px] text-primary bg-transparent border-0 p-0 cursor-pointer hover:underline">
                    → {STAGE_LABEL[r.suggestedStage]}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}
