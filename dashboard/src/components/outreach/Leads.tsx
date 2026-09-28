'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkspaceLead } from '@/app/api/outbound/workspace/route'
import type { CompanySummaryRow, Stage } from '@/lib/crm/types'
import { STAGES, STAGE_LABEL } from '@/lib/crm/types'
import { fmtRelative } from '@/lib/crm/format'
import { Chip } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { INK, MUTED, RULE, leadStateLabel } from './Campaigns'

/**
 * The execution views: every lead in one sortable grid with quick views; where leads come
 * from and how each source performs; the stage view of companies already in the journey;
 * and the two dialogs — Move to Sales with context, New campaign.
 */

export type LeadQuick = 'all' | 'follow_up' | 'replied' | 'qualified' | 'new' | 'bounced' | 'dnc'
export const LEAD_QUICK: { key: LeadQuick; label: string }[] = [
  { key: 'all', label: 'All leads' }, { key: 'follow_up', label: 'Needs follow-up' }, { key: 'replied', label: 'Replied' }, { key: 'qualified', label: 'Qualified' }, { key: 'new', label: 'New' }, { key: 'bounced', label: 'Bounced' }, { key: 'dnc', label: 'Do not contact' },
]
export function inLeadQuick(l: WorkspaceLead, k: LeadQuick): boolean {
  switch (k) {
    case 'all': return true
    case 'follow_up': return (l.replied || l.positive || l.status === 'engaged' || (l.origin === 'inbound' && l.status === 'new')) && !['qualified', 'proposal', 'converted', 'dropped'].includes(l.status) && !l.doNotContact
    case 'replied': return l.replied
    case 'qualified': return l.status === 'qualified' || l.status === 'proposal'
    case 'new': return l.status === 'new' && !l.replied
    case 'bounced': return l.bounced
    case 'dnc': return l.doNotContact
  }
}
export type LeadSort = 'created' | 'name' | 'company' | 'status' | 'source' | 'campaign'
// The identity column carries name over company, so `company` is sorted by the API but has no header of its own.
const COLS: { key: LeadSort; label: string; align: 'left' | 'right'; hint?: string }[] = [
  { key: 'name', label: 'Lead', align: 'left', hint: 'Lead name, then company' },
  { key: 'campaign', label: 'Campaign', align: 'left' },
  { key: 'status', label: 'Status', align: 'left' },
  { key: 'source', label: 'Source', align: 'left' },
  { key: 'created', label: 'Last activity', align: 'right', hint: 'Sorted by date added' },
]
export const LEAD_SORT_LABEL: Record<LeadSort, string> = { created: 'date added', name: 'name', company: 'company', status: 'status', source: 'source', campaign: 'campaign' }
export function sortLeads(list: WorkspaceLead[], key: LeadSort, dir: 'asc' | 'desc'): WorkspaceLead[] {
  const d = dir === 'asc' ? 1 : -1
  const s = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').localeCompare(b ?? '')
  return [...list].sort((a, b) => {
    switch (key) {
      case 'name': return d * s(a.name, b.name)
      case 'company': return d * s(a.company, b.company) || s(a.name, b.name)
      case 'campaign': return d * s(a.campaigns[0]?.name, b.campaigns[0]?.name) || s(a.name, b.name)
      case 'status': return d * s(leadStateLabel(a), leadStateLabel(b)) || s(a.name, b.name)
      case 'source': return d * s(sourceLabel(a.source), sourceLabel(b.source)) || s(a.name, b.name)
      default: return d * s(a.createdAt, b.createdAt)
    }
  })
}
export function sourceLabel(src: string | null): string {
  const m: Record<string, string> = { website: 'Website', website_form: 'Website', whatsapp: 'WhatsApp', apollo: 'Lead Discovery', agent_discovery: 'Lead Discovery', signal_library: 'Signal Library', lead_database: 'Lead Database', manual: 'Manual', referral: 'Referral', email: 'Email', imported: 'Imported', refresh_rule: 'Lead Database' }
  if (!src) return 'Unknown'
  return m[src] ?? src.replace(/_/g, ' ').replace(/^\w/, ch => ch.toUpperCase())
}

export function LeadsGrid({ leads, sort, dir, onSort, selectedId, onSelect, highlight }: {
  leads: WorkspaceLead[]; sort: LeadSort; dir: 'asc' | 'desc'; onSort: (k: LeadSort) => void; selectedId: string | null; onSelect: (l: WorkspaceLead) => void; highlight: string
}) {
  const mark = (t: string) => { const i = highlight ? t.toLowerCase().indexOf(highlight) : -1; return i < 0 ? t : <>{t.slice(0, i)}<mark style={{ background: 'transparent', color: 'inherit', textDecoration: 'underline', textDecorationColor: '#9aa0a6', textUnderlineOffset: 3 }}>{t.slice(i, i + highlight.length)}</mark>{t.slice(i + highlight.length)}</> }
  return (
    <Register label="Leads" minWidth={900} maxHeight="calc(100vh - 300px)">
      <RegisterHead>
        {COLS.map((c, i) => (
          <RegisterTh key={c.key} first={i === 0} last={i === COLS.length - 1} align={c.align} active={sort === c.key} dir={dir} onSort={() => onSort(c.key)} hint={c.hint}>{c.label}</RegisterTh>
        ))}
      </RegisterHead>
      <tbody>
        {leads.length === 0 && <RegisterEmpty colSpan={COLS.length}>No leads match.</RegisterEmpty>}
        {leads.map(l => {
          const on = selectedId === l.id
          const state = leadStateLabel(l)
          return (
            <RegisterRow key={`${l.origin}-${l.id}`} selected={on} onClick={() => onSelect(l)}>
              <RegisterCell first selected={on} primary={mark(l.name)} secondary={l.company ? mark(l.company) : l.email ? mark(l.email) : l.title ?? 'No company on file'} title={l.name} />
              <RegisterCell>
                <span className="block text-[14px] max-w-[240px] truncate" style={{ color: '#3c4043' }}>
                  {l.campaigns[0]?.name ?? (l.origin === 'inbound' ? 'Enquiry' : <span style={{ color: '#9aa0a6' }}>None</span>)}{l.campaigns.length > 1 ? ` +${l.campaigns.length - 1}` : ''}
                </span>
              </RegisterCell>
              <RegisterCell><span className="text-[14px]" style={{ color: INK }}>{state}</span></RegisterCell>
              <RegisterCell><Chip>{sourceLabel(l.source)}</Chip></RegisterCell>
              <RegisterCell last align="right" primary={fmtRelative(l.lastActivityAt ?? l.createdAt)} secondary={`Added ${fmtRelative(l.createdAt)}`} />
            </RegisterRow>
          )
        })}
      </tbody>
    </Register>
  )
}

export function LeadPanel({ l, onClose, onMoveToSales }: { l: WorkspaceLead; onClose: () => void; onMoveToSales: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  const state = leadStateLabel(l)
  const rows: [string, string | null][] = [['Email', l.email], ['Title', l.title], ['Company', l.company], ['Source', sourceLabel(l.source)], ['Product interest', l.product], ['Status', state], ['Added', fmtRelative(l.createdAt)]]
  return (
    <aside role="dialog" aria-label={l.name} className="fixed inset-y-0 right-0 z-40 w-full sm:w-[460px] bg-white flex flex-col" style={{ borderLeft: `1px solid ${RULE}`, boxShadow: '-24px 0 48px -32px rgba(32,33,36,0.25)', color: INK }}>
      <div className="px-7 pt-7 flex items-start gap-3">
        <div className="min-w-0 flex-1"><h2 className="m-0 text-[22px] font-medium leading-[1.2]">{l.name}</h2><p className="m-0 mt-1.5 text-[13.5px]" style={{ color: MUTED }}>{[l.company, state].filter(Boolean).join(' · ')}</p></div>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 w-9 h-9 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><X size={18} /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-7 py-6 flex flex-col gap-6">
        <dl className="m-0 grid grid-cols-[130px_1fr] gap-y-2 text-[14px]">
          {rows.map(([k, v]) => <div key={k} className="contents"><dt style={{ color: MUTED }}>{k}</dt><dd className="m-0 break-words" style={{ color: INK }}>{v ?? '—'}</dd></div>)}
        </dl>
        <section>
          <h3 className="m-0 mb-2 text-[14px] font-medium" style={{ color: INK }}>Campaigns</h3>
          {l.campaigns.length === 0 ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>{l.origin === 'inbound' ? 'Came in as an enquiry, not from a campaign.' : 'Not in a campaign.'}</p> : (
            <ul className="m-0 p-0 list-none">{l.campaigns.map(c => <li key={c.id} className="py-2" style={{ borderBottom: `1px solid ${RULE}` }}><Link href={`/outbound/campaigns/${c.id}`} className="text-[14px] no-underline hover:underline underline-offset-4" style={{ color: INK }}>{c.name}</Link></li>)}</ul>
          )}
        </section>
      </div>
      <div className="px-7 py-4 flex items-center justify-between gap-3" style={{ borderTop: `1px solid ${RULE}` }}>
        {l.companyId ? <Link href={`/companies?company=${l.companyId}`} className="h-10 px-5 rounded-[10px] text-white text-[14px] font-medium no-underline inline-flex items-center" style={{ background: INK }}>Open company</Link>
          : l.status === 'converted' ? <span className="text-[13px]" style={{ color: MUTED }}>Already converted.</span>
          : <button type="button" onClick={onMoveToSales} disabled={l.doNotContact} className="h-10 px-5 rounded-[10px] text-white text-[14px] font-medium border-0 cursor-pointer disabled:opacity-50" style={{ background: INK }}>Move to Sales</button>}
        {l.origin === 'inbound' && <Link href={`/engagement`} className="text-[13px] no-underline hover:underline underline-offset-4" style={{ color: INK }}>Open in All Inbox</Link>}
      </div>
    </aside>
  )
}

export function MoveToSalesDialog({ l, onClose, onDone }: { l: WorkspaceLead; onClose: () => void; onDone: (companyId: string | null) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [name, setName] = useState(l.company ?? '')
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  async function go() {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/companies/from-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: l.id, origin: l.origin, name: name.trim() || undefined, stage: 'prospect' }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not move')
      onDone(d.companyId ?? d.company?.id ?? d.id ?? null)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not move') } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[14vh]" style={{ background: 'rgba(32,33,36,0.28)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="mts" className="w-full max-w-[480px] rounded-[16px] bg-white p-6" style={{ boxShadow: '0 24px 64px rgba(32,33,36,0.2)', color: INK }}>
        <h2 id="mts" className="m-0 text-[20px] font-medium">Move {l.name} to Sales?</h2>
        <p className="m-0 mt-1 text-[13.5px]" style={{ color: MUTED }}>A company is created from this lead and starts at Prospect. Campaign attribution and the email thread stay with it.</p>
        <dl className="m-0 mt-4 grid grid-cols-[120px_1fr] gap-y-2 text-[14px]">
          <dt style={{ color: MUTED }}>Company</dt><dd className="m-0"><input value={name} onChange={e => setName(e.target.value)} placeholder="Company name" aria-label="Company name" className="h-9 w-full rounded-[8px] border px-3 text-[14px] outline-none focus:border-[#202124]" style={{ borderColor: '#dadce0' }} /></dd>
          <dt style={{ color: MUTED }}>Product</dt><dd className="m-0">{l.product ?? '—'}</dd>
          <dt style={{ color: MUTED }}>Source</dt><dd className="m-0">{sourceLabel(l.source)}{l.campaigns[0] ? ` · ${l.campaigns[0].name}` : ''}</dd>
          <dt style={{ color: MUTED }}>Next step</dt><dd className="m-0">Initial qualification call</dd>
        </dl>
        {err && <p className="m-0 mt-3 text-[13px]" style={{ color: '#3c4043' }}>{err}</p>}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3.5 rounded-[10px] text-[13.5px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: INK }}>Cancel</button>
          <button type="button" onClick={() => void go()} disabled={busy} className="h-9 px-4 rounded-[10px] text-white text-[13.5px] font-medium border-0 cursor-pointer disabled:opacity-50" style={{ background: INK }}>{busy ? 'Moving…' : 'Move to Sales'}</button>
        </div>
      </div>
    </div>
  )
}

const PRODUCTS = ['General', 'Business Assets', 'Business Liabilities', 'Workforce', 'API']
export function NewCampaignDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [product, setProduct] = useState('General')
  const [newsUrl, setNewsUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  async function go() {
    if (!name.trim()) { setErr('Give the campaign a name.'); return }
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/outbound/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), productType: product, newsUrl: newsUrl.trim() || undefined }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not create')
      const id = d.id ?? d.campaign?.id
      if (id) router.push(`/outbound/campaigns/${id}`); else onClose()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not create') } finally { setBusy(false) }
  }
  const inp = 'h-10 w-full rounded-[10px] border px-3.5 text-[14px] outline-none focus:border-[#202124]'
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" style={{ background: 'rgba(32,33,36,0.28)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ncamp" className="w-full max-w-[520px] rounded-[16px] bg-white p-6" style={{ boxShadow: '0 24px 64px rgba(32,33,36,0.2)', color: INK }}>
        <h2 id="ncamp" className="m-0 text-[20px] font-medium">New campaign</h2>
        <p className="m-0 mt-1 text-[13.5px]" style={{ color: MUTED }}>Step 1 of 4: the basics. Audience, sequence and review continue in the campaign workspace.</p>
        <div className="mt-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[12.5px]" style={{ color: MUTED }}>Campaign name<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Commercial Plans — Singapore SMEs" className={inp} style={{ borderColor: '#dadce0', color: INK }} onKeyDown={e => { if (e.key === 'Enter') void go() }} /></label>
          <label className="flex flex-col gap-1 text-[12.5px]" style={{ color: MUTED }}>Product or insurance line<select value={product} onChange={e => setProduct(e.target.value)} className={inp} style={{ borderColor: '#dadce0', color: INK }}>{PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-[12.5px]" style={{ color: MUTED }}>News hook, optional<input value={newsUrl} onChange={e => setNewsUrl(e.target.value)} placeholder="https://…" className={inp} style={{ borderColor: '#dadce0', color: INK }} /></label>
        </div>
        {err && <p className="m-0 mt-3 text-[13px]" style={{ color: '#3c4043' }}>{err}</p>}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3.5 rounded-[10px] text-[13.5px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: INK }}>Cancel</button>
          <button type="button" onClick={() => void go()} disabled={busy} className="h-9 px-4 rounded-[10px] text-white text-[13.5px] font-medium border-0 cursor-pointer disabled:opacity-50" style={{ background: INK }}>{busy ? 'Creating…' : 'Continue to audience'}</button>
        </div>
      </div>
    </div>
  )
}

/** Sources: where leads come from and how each source performs. Click a row to see its leads. */
export function SourcesView({ leads, onPick }: { leads: WorkspaceLead[]; onPick: (src: string) => void }) {
  const rows = useMemo(() => {
    const m = new Map<string, { label: string; total: number; contacted: number; replied: number; qualified: number; converted: number }>()
    for (const l of leads) {
      const k = sourceLabel(l.source)
      const r = m.get(k) ?? { label: k, total: 0, contacted: 0, replied: 0, qualified: 0, converted: 0 }
      r.total++
      if (l.sendStatus === 'sent' || l.replied || ['contacted', 'engaged', 'qualified', 'proposal', 'converted'].includes(l.status)) r.contacted++
      if (l.replied) r.replied++
      if (l.status === 'qualified' || l.status === 'proposal') r.qualified++
      if (l.status === 'converted') r.converted++
      m.set(k, r)
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total)
  }, [leads])
  const pct = (n: number, d: number) => d ? `${Math.round((n / d) * 100)}%` : '—'
  const HEADS = ['Source', 'Leads', 'Contacted', 'Reply rate', 'Qualified', 'Converted']
  return (
    <Register label="Lead sources" minWidth={640}>
      <RegisterHead>
        {HEADS.map((h, i) => <RegisterTh key={h} first={i === 0} last={i === HEADS.length - 1} align={i === 0 ? 'left' : 'right'}>{h}</RegisterTh>)}
      </RegisterHead>
      <tbody>
        {rows.length === 0 && <RegisterEmpty colSpan={HEADS.length}>No leads yet.</RegisterEmpty>}
        {rows.map(r => (
          <RegisterRow key={r.label} onClick={() => onPick(r.label)}>
            <RegisterCell first primary={r.label} secondary={`${r.total} lead${r.total === 1 ? '' : 's'}`} />
            <RegisterCell align="right" primary={r.total} />
            <RegisterCell align="right" primary={r.contacted} secondary={`${pct(r.contacted, r.total)} of leads`} />
            <RegisterCell align="right" primary={pct(r.replied, r.contacted)} secondary={`${r.replied} replied`} />
            <RegisterCell align="right" primary={r.qualified} />
            <RegisterCell last align="right" primary={r.converted} />
          </RegisterRow>
        ))}
      </tbody>
    </Register>
  )
}

/** Pipeline: companies already in the journey, by stage. The stage is editable in place. */
export function PipelineView({ board, onStage, busy }: { board: { sales: CompanySummaryRow[]; convert: CompanySummaryRow[]; operations: CompanySummaryRow[]; counts: { sales: number; convert: number; operations: number } } | null; onStage: (id: string, to: Stage) => void; busy: string | null }) {
  const [step, setStep] = useState<'sales' | 'convert' | 'operations'>('sales')
  const STEPS = [{ key: 'sales', label: 'Sales', help: 'Companies we are actively working towards a quote.' }, { key: 'convert', label: 'Convert', help: 'Quotes in the market, waiting on a decision.' }, { key: 'operations', label: 'Operations', help: 'Clients we service: renewals, claims and billing.' }] as const
  if (!board) return <p className="m-0 text-[14px]" style={{ color: MUTED }}>Loading…</p>
  const rows = board[step]
  return (
    <div>
      <div className="flex items-center gap-7 mb-2" role="tablist" style={{ borderBottom: `1px solid ${RULE}` }}>
        {STEPS.map(s => { const on = step === s.key; return <button key={s.key} type="button" role="tab" aria-selected={on} onClick={() => setStep(s.key)} className={cn('relative pb-3 bg-transparent border-0 cursor-pointer text-[15px]', on ? 'font-medium' : 'hover:text-[#202124]')} style={{ color: on ? INK : MUTED }}>{s.label}<span className="ml-1.5 tabular-nums" style={{ color: '#80868b' }}>{board.counts[s.key]}</span><span className={cn('absolute left-0 right-0 -bottom-px h-[2px] rounded-full', on ? 'block' : 'hidden')} style={{ background: INK }} aria-hidden /></button> })}
      </div>
      <p className="m-0 mb-4 text-[13.5px]" style={{ color: MUTED }}>{STEPS.find(s => s.key === step)!.help}</p>
      {rows.length === 0 ? <p className="m-0 py-10 text-center text-[15px]" style={{ color: MUTED }}>Nothing here yet.</p> : (
        <ul className="m-0 p-0 list-none rounded-[16px] overflow-hidden bg-white" style={{ border: `1px solid ${RULE}` }}>
          {rows.map(r => (
            <li key={r.id} className={cn('flex items-center gap-4 px-6 py-4', busy === r.id && 'opacity-50')} style={{ borderBottom: `1px solid ${RULE}` }}>
              <div className="min-w-0 flex-1">
                <Link href={`/companies?company=${r.id}`} className="block text-[15px] font-medium truncate no-underline hover:underline underline-offset-4" style={{ color: INK }}>{r.name}</Link>
                <p className="m-0 mt-0.5 text-[12.5px] truncate" style={{ color: MUTED }}>{[r.owner_email?.split('@')[0] ?? 'No owner', `${r.openThreads} thread${r.openThreads === 1 ? '' : 's'}`, r.needsReply ? `${r.needsReply} awaiting reply` : null, r.openQuotes ? `${r.openQuotes} open quote${r.openQuotes === 1 ? '' : 's'}` : null, fmtRelative(r.lastActivityAt)].filter(Boolean).join(' · ')}</p>
              </div>
              <select value={r.stage} disabled={busy === r.id} onChange={e => onStage(r.id, e.target.value as Stage)} aria-label={`Stage for ${r.name}`} className="h-9 rounded-[8px] border bg-white px-2 text-[13px] cursor-pointer" style={{ borderColor: '#dadce0', color: INK }}>
                {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </select>
              {r.suggestedStage && <button type="button" onClick={() => onStage(r.id, r.suggestedStage!)} className="text-[13px] bg-transparent border-0 p-0 cursor-pointer hover:underline underline-offset-4 whitespace-nowrap" style={{ color: INK }}>→ {STAGE_LABEL[r.suggestedStage]}</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
