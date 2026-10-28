'use client'

/**
 * "Since you were away" — what the filing agent did, once, then cleared.
 *
 * Built on the Alert component: informational variant, announced politely rather than as an
 * interruption. Each summary line unfurls what was actually acted on and why, so a wrong
 * decision can be found rather than only counted.
 *
 * Sits under the nav on every page rather than in a notifications panel, because the point is
 * that it is seen and cleared. Draws nothing when the agent did nothing.
 *
 * Since 28 Oct 2026 it is one 36px strip (it was a ~180px card that pushed every page down):
 * the summary line, Show to unfurl the agent's actions and their detail, the triage link, dismiss.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Info, X } from 'lucide-react'

type Item = { action: string; text: string; count: number; detail: string[] }
type Payload = { since: string; firstRun: boolean; total: number; items: Item[]; pending: number; error?: string }

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

export function HousekeepingBanner() {
  const [d, setD] = useState<Payload | null>(null)
  const [gone, setGone] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/housekeeping/since', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (alive && j && !j.error) setD(j as Payload) })
      .catch(() => {})   // the banner is never worth an error on somebody's screen
    return () => { alive = false }
  }, [])

  const dismiss = useCallback(async () => {
    setGone(true)              // go immediately; the write is not worth waiting on
    try { await fetch('/api/housekeeping/since', { method: 'POST' }) }
    catch { /* the mark moves on the next dismissal */ }
  }, [])

  if (!d || gone) return null
  // The banner reports what CHANGED. The pending count is a standing to-do, not a change, so it
  // rides along as an action link but never summons the banner on its own — otherwise unfiled
  // threads would make it permanent and Dismiss would do nothing that survived a reload.
  if (d.items.length === 0) return null

  const summary = `${d.total} action${d.total === 1 ? '' : 's'} by the filing agent`
  const period = d.firstRun ? 'last 7 days' : `since ${when(d.since)}`

  return (
    <div data-housekeeping-banner role="status" aria-live="polite" className="border-b border-[#e8eaed] bg-[#f8fafd] text-[13px]" style={{ color: '#3c4043' }}>
      <div className="flex items-center gap-2.5 h-9 px-4 sm:px-6 min-w-0">
        <Info size={14} className="flex-shrink-0" style={{ color: '#1a73e8' }} aria-hidden />
        <span className="font-medium flex-shrink-0" style={{ color: '#202124' }}>Since you were away</span>
        <span className="truncate tabular-nums" style={{ color: '#5f6368' }}>{summary}, {period}</span>
        <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
          className="inline-flex items-center gap-1 flex-shrink-0 bg-transparent border-0 p-0 cursor-pointer text-[13px] hover:underline underline-offset-[3px]" style={{ color: '#202124' }}>
          {open ? 'Hide' : 'Show'}<ChevronDown size={13} className={open ? 'rotate-180' : ''} aria-hidden />
        </button>
        <span className="flex-1" />
        {d.pending > 0 && (
          <Link href="/companies/triage" className="hidden sm:inline flex-shrink-0 tabular-nums underline underline-offset-[3px] decoration-[#9aa0a6]" style={{ color: '#202124' }}>
            Choose a client for {d.pending} conversation{d.pending === 1 ? '' : 's'}
          </Link>
        )}
        <button type="button" onClick={dismiss} aria-label="Dismiss" title="Dismiss"
          className="w-6 h-6 inline-flex items-center justify-center rounded-[6px] bg-transparent border-0 cursor-pointer flex-shrink-0 hover:bg-[#eef1f5]" style={{ color: '#5f6368' }}>
          <X size={14} />
        </button>
      </div>
      {open && (
        <ul className="m-0 list-none px-4 sm:px-6 pb-3 pl-[42px] sm:pl-[50px] flex flex-col gap-2">
          {d.items.map((i, k) => (
            <li key={k} className="min-w-0">
              <div style={{ color: '#202124' }}>{i.text}</div>
              {i.detail.length > 0 && (
                <ul className="m-0 mt-1 pl-4 list-disc text-[12.5px] flex flex-col gap-0.5" style={{ color: '#5f6368' }}>
                  {i.detail.map((t, j) => <li key={j}>{t}</li>)}
                </ul>
              )}
            </li>
          ))}
          {d.pending > 0 && (
            <li className="sm:hidden"><Link href="/companies/triage" className="underline underline-offset-[3px]" style={{ color: '#202124' }}>Choose a client for {d.pending} conversation{d.pending === 1 ? '' : 's'}</Link></li>
          )}
        </ul>
      )}
    </div>
  )
}
