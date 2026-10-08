'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { QueuePayload, QueueRow } from '@/app/api/outbound/campaigns/[id]/queue/route'
import { EMAIL_STATUS_LABEL, MARKET_LABEL, MARKETS, type EmailStatus, type Market } from '@/lib/outreach/prospects'

/**
 * Review before send: every person in the campaign with the next email rendered exactly as the
 * sender merges it. Approve one, a selection, or all; the daily sender picks up approved rows.
 * The daily top-up settings say how many new named people join the queue each day.
 */

// Local, not imported from ./Campaigns, which imports this file.
const INK = '#202124', MUTED = '#5f6368', RULE = '#e8eaed'

type Filter = 'pending' | 'queued' | 'all'
const sgt = (iso: string) => new Date(iso).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function rowState(r: QueueRow, nextRun: string): string {
  if (r.approval === 'pending') return 'Awaiting review'
  if (['replied', 'bounced', 'unsubscribed', 'opted_out'].includes(r.send)) return r.send === 'opted_out' ? 'Opted out' : r.send[0].toUpperCase() + r.send.slice(1)
  if (!r.preview) return `Sequence complete, ${r.totalSteps} of ${r.totalSteps} sent`
  const when = r.scheduledAt && r.scheduledAt > nextRun ? r.scheduledAt : nextRun
  return `Email ${r.preview.step} of ${r.totalSteps} from ${sgt(when)}`
}

export function CampaignQueue({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<QueuePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('pending')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const r = await fetch(`/api/outbound/campaigns/${campaignId}/queue`, { cache: 'no-store' })
      const j = await r.json()
      if (r.status === 409) { setError('Review queue not available. Apply supabase/migrations/20261008_prospects.sql.'); return }
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      setData(j)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the queue.') }
  }, [campaignId])
  useEffect(() => { setData(null); setPicked(new Set()); setOpen(null); setNotice(null); void load() }, [load])

  async function act(body: Record<string, unknown>, done: (j: Record<string, number>) => string) {
    setBusy(true); setNotice(null)
    try {
      const r = await fetch(`/api/outbound/campaigns/${campaignId}/queue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setNotice(done(j)); setPicked(new Set()); await load()
    } catch (e) { setNotice(e instanceof Error && e.message ? e.message : 'Could not save.') }
    finally { setBusy(false) }
  }

  if (error) return <p className="m-0 text-[14px]" style={{ color: MUTED }}>{error}</p>
  if (!data) return <div className="flex flex-col gap-2" aria-busy="true">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-[10px] bg-[#f1f3f4] animate-pulse" />)}</div>

  const pending = data.rows.filter(r => r.approval === 'pending')
  const queued = data.rows.filter(r => r.approval === 'included' && r.preview && ['queued', 'sent'].includes(r.send))
  const shown = filter === 'pending' ? pending : filter === 'queued' ? queued : data.rows
  const pickedPending = shown.filter(r => picked.has(r.id) && r.approval === 'pending')
  const noSteps = data.stepsApproved === 0

  return (
    <div className="flex flex-col gap-6">
      {data.campaign.bouncePausedAt && <p className="m-0 text-[14px]">Paused for bounces on {sgt(data.campaign.bouncePausedAt)}. Check the bounced addresses before resuming.</p>}
      {noSteps && <p className="m-0 text-[14px]">No approved steps. <Link href={`/outbound/campaigns/${campaignId}`} style={{ color: INK }}>Approve the sequence in the workspace</Link> before approving people.</p>}

      <TopUpSettings data={data} busy={busy} onSave={s => act({ action: 'settings', ...s }, () => 'Daily top-up saved.')} />

      <section>
        <div className="flex items-center gap-4 flex-wrap text-[13px]">
          {([['pending', 'Awaiting review', pending.length], ['queued', 'Queued', queued.length], ['all', 'Everyone', data.rows.length]] as const).map(([k, l, n]) => (
            <button key={k} type="button" onClick={() => { setFilter(k); setPicked(new Set()) }} aria-pressed={filter === k} className={cn('bg-transparent border-0 p-0 cursor-pointer', filter === k ? 'font-medium underline underline-offset-[6px] decoration-2' : 'hover:underline underline-offset-[6px]')} style={{ color: filter === k ? INK : MUTED }}>{l} <span className="tabular-nums" style={{ color: '#80868b' }}>{n}</span></button>
          ))}
        </div>
        <p className="m-0 mt-3 text-[13px]" style={{ color: MUTED }}>Next send run {sgt(data.nextRun)} SGT. Each run sends 20% of due emails.</p>
        {notice && <p className="m-0 mt-2 text-[13.5px]" role="status">{notice}</p>}
        {pending.length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button type="button" disabled={busy || noSteps} onClick={() => void act({ action: 'approve', all: true }, j => `${j.approved} approved and queued.`)} className="h-9 px-4 rounded-[10px] text-white text-[13.5px] font-medium border-0 cursor-pointer disabled:opacity-50" style={{ background: INK }}>Approve all {pending.length}</button>
            {pickedPending.length > 0 && <>
              <button type="button" disabled={busy || noSteps} onClick={() => void act({ action: 'approve', ids: pickedPending.map(r => r.id) }, j => `${j.approved} approved and queued.`)} className="h-9 px-4 rounded-[10px] bg-white text-[13.5px] border cursor-pointer hover:bg-[#f8f9fa] disabled:opacity-50" style={{ borderColor: '#dadce0', color: INK }}>Approve {pickedPending.length} selected</button>
              <button type="button" disabled={busy} onClick={() => void act({ action: 'exclude', ids: pickedPending.map(r => r.id) }, j => `${j.excluded} removed from the campaign.`)} className="h-9 px-4 rounded-[10px] bg-white text-[13.5px] border cursor-pointer hover:bg-[#f8f9fa] disabled:opacity-50" style={{ borderColor: '#dadce0', color: INK }}>Remove {pickedPending.length}</button>
            </>}
          </div>
        )}

        {shown.length === 0 ? <p className="m-0 mt-4 text-[14px]" style={{ color: MUTED }}>{filter === 'pending' ? 'Nobody awaiting review.' : 'Nobody here.'}</p> : (
          <ul className="m-0 mt-3 p-0 list-none">
            {shown.map(r => (
              <li key={r.id} className="py-3" style={{ borderTop: `1px solid ${RULE}` }}>
                <div className="flex items-start gap-3">
                  {r.approval === 'pending'
                    ? <input type="checkbox" aria-label={`Select ${r.name}`} checked={picked.has(r.id)} onChange={() => setPicked(p => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} className="mt-1 w-4 h-4 flex-shrink-0 accent-[#202124]" />
                    : <span className="w-4 flex-shrink-0" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[14px] font-medium truncate">{r.name}</p>
                    <p className="m-0 mt-0.5 text-[12.5px] truncate" style={{ color: MUTED }}>{[r.company, r.email].filter(Boolean).join(' · ')}</p>
                    <p className="m-0 mt-1 text-[13px]" style={{ color: '#3c4043' }}>{rowState(r, data.nextRun)}</p>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-3">
                    {r.preview && <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} className="bg-transparent border-0 p-0 cursor-pointer text-[13px] underline underline-offset-4" style={{ color: INK }}>{open === r.id ? 'Hide' : 'Preview'}</button>}
                    {r.approval === 'pending' && <button type="button" disabled={busy || noSteps} onClick={() => void act({ action: 'approve', ids: [r.id] }, () => `${r.name} approved and queued.`)} className="bg-transparent border-0 p-0 cursor-pointer text-[13px] font-medium underline underline-offset-4 disabled:opacity-50" style={{ color: INK }}>Approve</button>}
                  </div>
                </div>
                {open === r.id && r.preview && (
                  <div className="mt-3 ml-7 rounded-[10px] px-4 py-3 text-[13.5px]" style={{ background: '#F5F5F3' }}>
                    <p className="m-0 font-medium">{r.preview.subject}</p>
                    <p className="m-0 mt-2 whitespace-pre-wrap leading-relaxed" style={{ color: '#3c4043' }}>{r.preview.body}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function TopUpSettings({ data, busy, onSave }: { data: QueuePayload; busy: boolean; onSave: (s: { markets: Market[]; emailStatuses: EmailStatus[]; dailyNew: number; autoApprove: boolean }) => void }) {
  const c = data.campaign
  const [markets, setMarkets] = useState<Market[]>(c.audience?.markets ?? [])
  const [statuses, setStatuses] = useState<EmailStatus[]>(c.audience?.emailStatuses ?? ['verified', 'published'])
  const [dailyNew, setDailyNew] = useState(String(c.dailyNew))
  const [auto, setAuto] = useState(c.autoApprove)
  const flip = <T,>(xs: T[], x: T) => xs.includes(x) ? xs.filter(y => y !== x) : [...xs, x]
  const n = Number(dailyNew)
  const valid = Number.isInteger(n) && n >= 0 && n <= 200 && statuses.length > 0

  return (
    <section>
      <h3 className="m-0 mb-3 text-[14px] font-medium">Daily top-up</h3>
      <div className="grid grid-cols-[110px_1fr] gap-y-3 items-center text-[13.5px]">
        <span style={{ color: MUTED }}>Markets</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {MARKETS.map(m => <label key={m} className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={markets.includes(m)} onChange={() => setMarkets(flip(markets, m))} className="w-4 h-4 accent-[#202124]" />{MARKET_LABEL[m]}</label>)}
        </div>
        <span style={{ color: MUTED }}>Emails</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(['verified', 'published', 'guessed'] as EmailStatus[]).map(s => <label key={s} className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={statuses.includes(s)} onChange={() => setStatuses(flip(statuses, s))} className="w-4 h-4 accent-[#202124]" />{EMAIL_STATUS_LABEL[s]}</label>)}
        </div>
        <label htmlFor="daily-new" style={{ color: MUTED }}>New per day</label>
        <div className="flex items-center gap-4 flex-wrap">
          <input id="daily-new" type="number" min={0} max={200} inputMode="numeric" value={dailyNew} onChange={e => setDailyNew(e.target.value)} className="h-9 w-20 rounded-[8px] border bg-white px-2.5 text-[13.5px] tabular-nums" style={{ borderColor: '#dadce0', color: INK }} />
          <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={auto} onChange={() => setAuto(!auto)} className="w-4 h-4 accent-[#202124]" />Approve automatically</label>
        </div>
      </div>
      <p className="m-0 mt-3 text-[12.5px]" style={{ color: MUTED }}>{markets.length ? markets.map(m => MARKET_LABEL[m]).join(', ') : 'All markets'} · named people only · 0 turns the top-up off</p>
      <button type="button" disabled={busy || !valid} onClick={() => onSave({ markets, emailStatuses: statuses, dailyNew: n, autoApprove: auto })} className="mt-3 h-9 px-4 rounded-[10px] bg-white text-[13.5px] border cursor-pointer hover:bg-[#f8f9fa] disabled:opacity-50" style={{ borderColor: '#dadce0', color: INK }}>Save top-up</button>
    </section>
  )
}
