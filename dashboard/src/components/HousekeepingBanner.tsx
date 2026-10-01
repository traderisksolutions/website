'use client'

/**
 * "Since you were away" — what the filing agent did, once, then cleared.
 *
 * Sits under the nav on every page rather than in a notifications panel, because the point is
 * that it is seen and cleared, not that it accumulates somewhere nobody opens. Dismiss moves
 * this person's mark to now, so the next banner starts from here.
 *
 * Draws nothing at all when the agent did nothing — a banner that is always there is a banner
 * people stop reading.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

const INK = '#202124'
const BODY = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const HAIR = '#e8eaed'
const EDGE = '#dadce0'
const FLAG = '#c5221f'

type Item = { action: string; text: string; count: number; names: string[] }
type LogRow = { at: string; action: string; subject: string | null; basis: string | null }
type Payload = { since: string; firstRun: boolean; total: number; items: Item[]; pending: number; log: LogRow[]; error?: string }

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

export function HousekeepingBanner() {
  const [d, setD] = useState<Payload | null>(null)
  const [gone, setGone] = useState(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/housekeeping/since', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (alive && j && !j.error) setD(j as Payload) })
      .catch(() => {})   // the banner is never worth an error on someone's screen
    return () => { alive = false }
  }, [])

  const dismiss = useCallback(async () => {
    setBusy(true)
    setGone(true)              // go immediately; the write is not worth waiting on
    try { await fetch('/api/housekeeping/since', { method: 'POST' }) }
    catch { /* the mark will move on the next dismissal */ }
    finally { setBusy(false) }
  }, [])

  if (!d || gone) return null
  // The banner reports what CHANGED. The pending count is a standing to-do, not a change, so it
  // rides along as context but never summons the banner on its own — otherwise 59 unfiled
  // threads would make it permanent, and Dismiss would do nothing that survived a reload.
  if (d.items.length === 0) return null

  return (
    <div className="px-4 sm:px-6 pt-4" data-housekeeping-banner>
      <div className="rounded-[12px] bg-white" style={{ border: `1px solid ${EDGE}` }}>

        <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4 pb-3" style={{ borderBottom: `1px solid ${HAIR}` }}>
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium tracking-[-0.01em] m-0" style={{ color: INK }}>Since you were away</h2>
            <p className="mt-1 text-[13px] tabular-nums m-0" style={{ color: FAINT }}>
              {d.firstRun ? 'Last 7 days' : `Since you last cleared this: ${when(d.since)}`}
              {d.total > 0 && ` · ${d.total} action${d.total === 1 ? '' : 's'} by the filing agent`}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {d.log.length > 0 && (
              <button type="button" onClick={() => setOpen(o => !o)}
                className="h-[32px] rounded-[9px] border px-3 text-[13px] transition-colors hover:border-[#202124]"
                style={{ borderColor: EDGE, color: INK }}>
                {open ? 'Hide' : `See all ${d.total}`}
              </button>
            )}
            <button type="button" onClick={dismiss} disabled={busy}
              className="h-[32px] rounded-[9px] border px-3 text-[13px] transition-colors hover:border-[#202124] disabled:opacity-50"
              style={{ borderColor: EDGE, color: INK }}>
              Dismiss
            </button>
          </div>
        </div>

        <ul className="m-0 list-none px-5 pb-3 pt-1">
          {d.items.map(i => (
            <li key={i.action} className="flex gap-3 py-2.5" style={{ borderBottom: `1px solid ${HAIR}` }}>
              <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: INK }} />
              <span className="text-[14px] leading-[1.5]" style={{ color: BODY }}>{i.text}</span>
            </li>
          ))}
          {d.pending > 0 && (
            <li className="flex items-baseline gap-3 py-2.5">
              <span className="relative top-[-3px] h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: FLAG }} />
              <span className="text-[14px] leading-[1.5]" style={{ color: BODY }}>
                <span className="font-medium tabular-nums" style={{ color: INK }}>{d.pending} conversation{d.pending === 1 ? '' : 's'}</span>
                {' '}it would not guess on
                <Link href="/companies/triage" className="ml-2.5 text-[13px] underline decoration-[#dadce0] underline-offset-[3px] hover:decoration-[#202124]" style={{ color: INK }}>
                  Choose a client
                </Link>
              </span>
            </li>
          )}
        </ul>

        {open && d.log.length > 0 && (
          <div className="overflow-x-auto px-5 pb-4" style={{ borderTop: `1px solid ${HAIR}` }}>
            <table className="w-full min-w-[640px]">
              <thead>
                <tr style={{ color: FAINT }}>
                  <th className="pb-2 pt-3 text-left text-[11px] font-medium uppercase tracking-[0.04em]">When</th>
                  <th className="pb-2 pt-3 text-left text-[11px] font-medium uppercase tracking-[0.04em]">Did</th>
                  <th className="pb-2 pt-3 text-left text-[11px] font-medium uppercase tracking-[0.04em]">To</th>
                  <th className="pb-2 pt-3 text-left text-[11px] font-medium uppercase tracking-[0.04em]">On what basis</th>
                </tr>
              </thead>
              <tbody>
                {d.log.map((r, n) => (
                  <tr key={n} style={{ borderTop: `1px solid ${HAIR}` }}>
                    <td className="py-2.5 pr-3 align-top text-[13px] tabular-nums whitespace-nowrap" style={{ color: FAINT }}>{when(r.at)}</td>
                    <td className="py-2.5 pr-3 align-top text-[13px]" style={{ color: INK }}>{r.action.replace('.', ' ')}</td>
                    <td className="py-2.5 pr-3 align-top text-[13px]" style={{ color: INK }}>{r.subject ?? '—'}</td>
                    <td className="py-2.5 align-top text-[13px] leading-[1.5]" style={{ color: MUTED }}>{r.basis ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
