'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, X, Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkspaceCampaign, WorkspaceLead, WorkspaceReply } from '@/app/api/outbound/workspace/route'
import { fmtRelative, fmtDate } from '@/lib/crm/format'

/**
 * Campaigns as first-class objects: an editorial list with the funnel as aligned numbers,
 * status and next action in words, on a soft field by status; and a panel that answers
 * "what is happening in this campaign right now" without leaving the list.
 */

export const INK = '#202124'
export const MUTED = '#5f6368'
export const RULE = '#e8eaed'

export const STATUS_LABEL: Record<string, string> = { draft: 'Draft', review: 'In review', active: 'Active', paused: 'Paused', completed: 'Completed', archived: 'Archived' }
const FIELD_BY_STATUS: Record<string, string> = { active: '#EAF2FF', review: '#F1EEFF', draft: '#FFF6D8', paused: '#F1EEFF', completed: '#EAF6EC', archived: '#F5F5F3' }

export function campaignAttention(c: WorkspaceCampaign): string[] {
  const out: string[] = []
  const toQualify = c.positive - c.qualified - c.converted
  if (toQualify > 0) out.push(`${toQualify} positive repl${toQualify === 1 ? 'y needs' : 'ies need'} qualifying`)
  if (c.bounced > 0) out.push(`${c.bounced} email${c.bounced === 1 ? '' : 's'} bounced`)
  if (c.status === 'active' && c.leads > 0 && c.contacted === 0) out.push('Active but nothing sent yet')
  if ((c.status === 'draft' || c.status === 'review') && c.steps.length === 0) out.push('No sequence written yet')
  if (c.status === 'active' && c.queued > 0) out.push(`${c.queued} lead${c.queued === 1 ? '' : 's'} queued to send`)
  return out
}
export function nextAction(c: WorkspaceCampaign): string {
  if (c.status === 'active' && c.queued > 0) return `${c.queued} queued to send`
  if (c.status === 'draft' || c.status === 'review') return c.steps.length ? 'Ready to launch' : 'Write the sequence'
  if (c.status === 'paused') return 'Paused'
  if (c.status === 'completed') return 'Completed'
  return c.lastActivityAt ? `Last activity ${fmtRelative(c.lastActivityAt)}` : 'No activity yet'
}
const pct = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 100)}%` : '—'

export type CampaignQuick = 'all' | 'active' | 'attention' | 'paused' | 'draft' | 'completed'
export const CAMPAIGN_QUICK: { key: CampaignQuick; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'active', label: 'Active' }, { key: 'attention', label: 'Needs attention' }, { key: 'paused', label: 'Paused' }, { key: 'draft', label: 'Draft' }, { key: 'completed', label: 'Completed' },
]
export function inCampaignQuick(c: WorkspaceCampaign, k: CampaignQuick): boolean {
  switch (k) {
    case 'all': return c.status !== 'archived'
    case 'active': return c.status === 'active'
    case 'attention': return campaignAttention(c).length > 0 && c.status !== 'archived' && c.status !== 'completed'
    case 'paused': return c.status === 'paused'
    case 'draft': return c.status === 'draft' || c.status === 'review'
    case 'completed': return c.status === 'completed' || c.status === 'archived'
  }
}
export type CampaignSort = 'activity' | 'name' | 'leads' | 'replyRate' | 'positive' | 'converted' | 'created'
export const CAMPAIGN_SORTS: { key: CampaignSort; label: string }[] = [
  { key: 'activity', label: 'last activity' }, { key: 'leads', label: 'leads' }, { key: 'replyRate', label: 'reply rate' }, { key: 'positive', label: 'positive replies' }, { key: 'converted', label: 'conversions' }, { key: 'created', label: 'created' }, { key: 'name', label: 'name' },
]
export function sortCampaigns(list: WorkspaceCampaign[], s: CampaignSort): WorkspaceCampaign[] {
  const rate = (c: WorkspaceCampaign) => c.contacted ? c.replies / c.contacted : -1
  return [...list].sort((a, b) => {
    switch (s) {
      case 'name': return a.name.localeCompare(b.name)
      case 'leads': return b.leads - a.leads
      case 'replyRate': return rate(b) - rate(a)
      case 'positive': return b.positive - a.positive
      case 'converted': return b.converted - a.converted
      case 'created': return b.createdAt.localeCompare(a.createdAt)
      default: return (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') || a.name.localeCompare(b.name)
    }
  })
}

export function CampaignRow({ c, selected, onOpen, compact }: { c: WorkspaceCampaign; selected: boolean; onOpen: () => void; compact?: boolean }) {
  const attention = campaignAttention(c)
  return (
    <li>
      <article className={cn('rounded-[20px] px-6 py-5 flex flex-col gap-4 transition-transform motion-safe:hover:-translate-y-0.5', !compact && 'md:flex-row md:items-center md:gap-8', selected && 'ring-2 ring-[#202124]')} style={{ background: FIELD_BY_STATUS[c.status] ?? '#F5F5F3', color: INK }}>
        <div className={cn('min-w-0', !compact && 'md:w-[34%]')}>
          <h3 className="m-0 text-[17px] font-medium leading-[1.3]" style={{ textWrap: 'balance' }}>{c.name}</h3>
          <p className="m-0 mt-1 text-[13px] truncate" style={{ color: MUTED }}>{[c.product ? `${c.product}` : null, c.headline].filter(Boolean).join(' · ') || 'Outbound campaign'}</p>
          <p className="m-0 mt-2 text-[13px]" style={{ color: '#3c4043' }}>
            <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: c.status === 'active' ? '#1a73e8' : c.status === 'paused' ? '#7b61c1' : c.status === 'completed' ? '#188038' : '#9aa0a6' }} aria-hidden />{STATUS_LABEL[c.status] ?? c.status}</span>
            <span className="mx-2" style={{ color: '#9aa0a6' }}>·</span>{nextAction(c)}
          </p>
        </div>
        <dl className="m-0 grid grid-cols-5 gap-3 flex-1 min-w-0">
          {[['leads', c.leads], ['contacted', c.contacted], ['replies', c.replies], ['positive', c.positive], ['converted', c.converted]].map(([k, v]) => (
            <div key={String(k)} className="min-w-0"><dd className="m-0 text-[20px] font-medium tabular-nums leading-none">{v as number}</dd><dt className="mt-1 text-[12px]" style={{ color: MUTED }}>{k as string}</dt></div>
          ))}
        </dl>
        <div className={cn('flex items-center justify-between gap-2 flex-shrink-0', !compact && 'md:flex-col md:items-end md:w-[150px]')}>
          <span className="text-[12.5px] text-right" style={{ color: MUTED }}>{attention.length ? attention[0] : `Started ${fmtDate(c.createdAt)}`}</span>
          <button type="button" onClick={onOpen} aria-label={`Open campaign ${c.name}`} className="inline-flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer text-[14px] font-medium hover:underline underline-offset-4 whitespace-nowrap" style={{ color: INK }}>Open campaign <ArrowRight size={15} /></button>
        </div>
      </article>
    </li>
  )
}

type Tab = 'overview' | 'leads' | 'sequence' | 'activity'
export function CampaignPanel({ c, leads, replies, onClose, onStatus, onMoveToSales }: {
  c: WorkspaceCampaign; leads: WorkspaceLead[]; replies: WorkspaceReply[]; onClose: () => void
  onStatus: (id: string, status: string) => Promise<void>; onMoveToSales: (l: WorkspaceLead) => void
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [leadFilter, setLeadFilter] = useState<'all' | 'positive' | 'bounced' | 'queued'>('all')
  const [busy, setBusy] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => { setTab('overview'); setLeadFilter('all'); panel.current?.focus() }, [c.id])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  const mine = useMemo(() => leads.filter(l => l.campaigns.some(x => x.id === c.id)), [leads, c.id])
  const shownLeads = mine.filter(l => leadFilter === 'all' ? true : leadFilter === 'positive' ? l.positive : leadFilter === 'bounced' ? l.bounced : l.sendStatus === 'queued')
  const myReplies = replies.filter(r => r.campaignId === c.id)
  const attention = campaignAttention(c)
  const canPause = c.status === 'active', canResume = c.status === 'paused'
  async function setStatus(s: string) { setBusy(true); try { await onStatus(c.id, s) } finally { setBusy(false) } }

  return (
    <aside ref={panel} tabIndex={-1} role="dialog" aria-label={c.name} className="fixed inset-y-0 right-0 z-40 w-full sm:w-[520px] bg-white flex flex-col outline-none" style={{ borderLeft: `1px solid ${RULE}`, boxShadow: '-24px 0 48px -32px rgba(32,33,36,0.25)', color: INK }}>
      <div className="flex-shrink-0 px-7 pt-7">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[22px] font-medium leading-[1.2] tracking-[-0.01em]" style={{ textWrap: 'balance' }}>{c.name}</h2>
            <p className="m-0 mt-1.5 text-[13.5px]" style={{ color: MUTED }}>{[c.product, STATUS_LABEL[c.status] ?? c.status].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 w-9 h-9 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><X size={18} /></button>
        </div>
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <Link href={`/outbound/campaigns/${c.id}`} className="h-9 px-4 rounded-[10px] text-white text-[13.5px] font-medium no-underline inline-flex items-center gap-1.5" style={{ background: INK }}>Open workspace <ArrowUpRight size={14} /></Link>
          {canPause && <button type="button" onClick={() => void setStatus('paused')} disabled={busy} className="h-9 px-3.5 rounded-[10px] bg-white text-[13.5px] border cursor-pointer inline-flex items-center gap-1.5 hover:bg-[#f8f9fa] disabled:opacity-50" style={{ borderColor: '#dadce0', color: INK }}><Pause size={13} /> Pause</button>}
          {canResume && <button type="button" onClick={() => void setStatus('active')} disabled={busy} className="h-9 px-3.5 rounded-[10px] bg-white text-[13.5px] border cursor-pointer inline-flex items-center gap-1.5 hover:bg-[#f8f9fa] disabled:opacity-50" style={{ borderColor: '#dadce0', color: INK }}><Play size={13} /> Resume</button>}
        </div>

        {/* Funnel */}
        <p className="m-0 mt-5 text-[14px] leading-relaxed" style={{ color: '#3c4043' }}>
          <b className="font-medium" style={{ color: INK }}>{c.leads}</b> leads → <b className="font-medium" style={{ color: INK }}>{c.contacted}</b> contacted → <b className="font-medium" style={{ color: INK }}>{c.replies}</b> replies → <b className="font-medium" style={{ color: INK }}>{c.positive}</b> positive → <b className="font-medium" style={{ color: INK }}>{c.converted}</b> converted
        </p>
        <p className="m-0 mt-1 text-[12.5px]" style={{ color: MUTED }}>Contact rate {pct(c.contacted, c.leads)} · Reply rate {pct(c.replies, c.contacted)} · Positive rate {pct(c.positive, c.contacted)} · Conversion {pct(c.converted, c.leads)}</p>

        <div className="mt-5 flex items-center gap-6" role="tablist" style={{ borderBottom: `1px solid ${RULE}` }}>
          {(['overview', 'leads', 'sequence', 'activity'] as Tab[]).map(t => {
            const on = tab === t
            return <button key={t} type="button" role="tab" aria-selected={on} onClick={() => setTab(t)} className={cn('relative pb-3 bg-transparent border-0 cursor-pointer text-[14px] capitalize', on ? 'font-medium' : 'hover:text-[#202124]')} style={{ color: on ? INK : MUTED }}>{t}<span className={cn('absolute left-0 right-0 -bottom-px h-[2px] rounded-full', on ? 'block' : 'hidden')} style={{ background: INK }} aria-hidden /></button>
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-7 py-6">
        {tab === 'overview' && (
          <div className="flex flex-col gap-6">
            <section>
              <h3 className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>Needs attention</h3>
              {attention.length === 0 ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>Nothing waiting.</p> : (
                <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
                  {attention.map(a => <li key={a}><button type="button" onClick={() => { setTab('leads'); setLeadFilter(a.includes('bounced') ? 'bounced' : a.includes('positive') ? 'positive' : a.includes('queued') ? 'queued' : 'all') }} className="bg-transparent border-0 p-0 cursor-pointer text-[14px] text-left hover:underline underline-offset-4" style={{ color: INK }}>{a}</button></li>)}
                </ul>
              )}
            </section>
            <section>
              <h3 className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>Sequence progress</h3>
              <Steps c={c} />
            </section>
            <section>
              <h3 className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>Scheduled</h3>
              <p className="m-0 text-[14px]" style={{ color: '#3c4043' }}>{c.queued > 0 ? `${c.queued} lead${c.queued === 1 ? '' : 's'} queued for the next send.` : 'Nothing queued.'} {c.status === 'active' && <Link href={`/outbound/campaigns/${c.id}`} className="no-underline hover:underline underline-offset-4" style={{ color: INK }}>Send from the workspace →</Link>}</p>
            </section>
            <section>
              <h3 className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>Recent replies</h3>
              <Replies rows={myReplies.slice(0, 5)} />
            </section>
          </div>
        )}
        {tab === 'leads' && (
          <div>
            <div className="flex items-center gap-4 mb-3 text-[13px]">
              {([['all', 'All'], ['positive', 'Positive'], ['queued', 'Queued'], ['bounced', 'Bounced']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setLeadFilter(k)} className={cn('bg-transparent border-0 p-0 cursor-pointer', leadFilter === k ? 'font-medium underline underline-offset-[6px] decoration-2' : 'hover:underline underline-offset-[6px]')} style={{ color: leadFilter === k ? INK : MUTED }}>{l}</button>
              ))}
              <span className="ml-auto tabular-nums" style={{ color: MUTED }}>{shownLeads.length} of {mine.length}</span>
            </div>
            {shownLeads.length === 0 ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>No leads here.</p> : (
              <ul className="m-0 p-0 list-none">
                {shownLeads.map(l => (
                  <li key={l.id} className="flex items-start justify-between gap-3 py-3" style={{ borderBottom: `1px solid ${RULE}` }}>
                    <span className="min-w-0">
                      <span className="block text-[14px] truncate" style={{ color: INK }}>{l.name}{l.company ? <span style={{ color: MUTED }}> · {l.company}</span> : null}</span>
                      <span className="block text-[12.5px] truncate" style={{ color: MUTED }}>{leadStateLabel(l)}{l.email ? ` · ${l.email}` : ''}</span>
                    </span>
                    {(l.positive || l.status === 'qualified' || l.status === 'proposal') && l.status !== 'converted' && <button type="button" onClick={() => onMoveToSales(l)} className="flex-shrink-0 text-[13px] font-medium bg-transparent border-0 p-0 cursor-pointer hover:underline underline-offset-4 whitespace-nowrap" style={{ color: INK }}>Move to Sales</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {tab === 'sequence' && (c.steps.length === 0 ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>No sequence yet. <Link href={`/outbound/campaigns/${c.id}`} className="no-underline hover:underline underline-offset-4" style={{ color: INK }}>Write it in the workspace →</Link></p> : <Steps c={c} full />)}
        {tab === 'activity' && <Replies rows={myReplies} />}
      </div>
    </aside>
  )
}

export function leadStateLabel(l: WorkspaceLead): string {
  if (l.doNotContact) return 'Do not contact'
  if (l.status === 'converted') return 'Converted'
  if (l.status === 'qualified' || l.status === 'proposal') return 'Qualified'
  if (l.bounced) return 'Bounced'
  if (l.positive) return 'Replied · Interested'
  if (l.replied) return 'Replied'
  if (l.sendStatus === 'sent' || l.status === 'contacted' || l.status === 'engaged') return l.status === 'engaged' ? 'Engaged' : 'Contacted'
  if (l.sendStatus === 'queued') return 'Queued'
  if (l.status === 'dropped') return 'Not interested'
  return 'New'
}

function Steps({ c, full }: { c: WorkspaceCampaign; full?: boolean }) {
  if (c.steps.length === 0) return <p className="m-0 text-[14px]" style={{ color: MUTED }}>No sequence yet.</p>
  return (
    <ol className="m-0 p-0 list-none flex flex-col">
      {c.steps.map(s => (
        <li key={s.number} className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${RULE}` }}>
          <span className="w-6 h-6 rounded-full inline-flex items-center justify-center text-[12px] font-medium flex-shrink-0" style={{ background: '#f1f3f4', color: INK }}>{s.number}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] truncate" style={{ color: INK }}>{s.subject || `Step ${s.number}`}</span>
            <span className="block text-[12.5px]" style={{ color: MUTED }}>{s.number === 1 ? 'Sent first' : `${s.delayDays} day${s.delayDays === 1 ? '' : 's'} after the previous step`}{s.status === 'draft' ? ' · draft' : ''}</span>
          </span>
          <span className="text-[12.5px] text-right tabular-nums flex-shrink-0" style={{ color: MUTED }}>{s.sent} sent{full ? <><br />{s.replied} replied</> : ` · ${s.replied} replied`}</span>
        </li>
      ))}
    </ol>
  )
}

function Replies({ rows }: { rows: WorkspaceReply[] }) {
  if (rows.length === 0) return <p className="m-0 text-[14px]" style={{ color: MUTED }}>No replies yet.</p>
  return (
    <ul className="m-0 p-0 list-none">
      {rows.map(r => (
        <li key={r.id} className="py-3" style={{ borderBottom: `1px solid ${RULE}` }}>
          <span className="block text-[14px] truncate" style={{ color: INK }}>{r.subject ?? (r.type === 'reply' ? 'Reply' : r.type)}</span>
          <span className="block text-[12.5px] truncate" style={{ color: MUTED }}>{[r.leadEmail, r.label ? r.label.replace('_', ' ') : null, fmtRelative(r.receivedAt)].filter(Boolean).join(' · ')}</span>
          {r.preview && <span className="block mt-1 text-[13px] line-clamp-2" style={{ color: '#3c4043' }}>{r.preview}</span>}
        </li>
      ))}
    </ul>
  )
}
