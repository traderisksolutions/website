'use client'

/**
 * Commission check above Send (Jarod, 20 Nov 2026): an insurer file must never reach a client
 * showing the broker's commission.
 *
 * Every attachment is checked (POST /api/attachments/commission-check). A file with commission is
 * swapped for its client copy, the commission blanked; the original stays with TRS. A file that
 * was blanked or could not be checked needs a person's tick before Send; each tick is written to
 * the audit log (user and time from the session). The parent sends `attachments` from onChange and
 * keeps Send disabled until `ready`.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, InlineSpinner } from '@/components/crm/primitives'
import { useAuditLog } from '@/hooks/useAuditLog'

export type EmailAttachment = { filename: string; mime_type?: string | null; storage_url: string }
type Hit = { page?: number; sheet?: string; cell?: string; text: string }
type Check =
  | { phase: 'checking' }
  | { phase: 'failed'; error: string }
  | { phase: 'done'; status: 'clean' | 'blanked' | 'not_checked'; hits: Hit[]; reason: string | null; copy: EmailAttachment | null }

export type CommissionState = { ready: boolean; attachments: EmailAttachment[] }

const previewHref = (a: EmailAttachment) => `/api/attachments/commission-check?ref=${encodeURIComponent(a.storage_url)}&name=${encodeURIComponent(a.filename)}`
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** "page 2, 4" or "Quote!D1:D9" — where the blanked lines are. */
function where(hits: Hit[]): string {
  const pages = [...new Set(hits.map(h => h.page).filter((p): p is number => typeof p === 'number'))]
  if (pages.length) return `${pages.length === 1 ? 'page' : 'pages'} ${pages.join(', ')}`
  const cells = hits.map(h => (h.sheet ? `${h.sheet}!${h.cell}` : h.cell)).filter(Boolean)
  return cells.length > 3 ? `${cells.slice(0, 3).join(', ')} +${cells.length - 3}` : cells.join(', ')
}

export function CommissionCheck({ attachments, onChange, context }: {
  attachments: EmailAttachment[]
  onChange: (s: CommissionState) => void
  /** What the email is for, written on each tick: e.g. { resource_type: 'eb_quotation', resource_id }. */
  context?: { resource_type?: string; resource_id?: string }
}) {
  const [checks, setChecks] = useState<Record<string, Check>>({})
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const started = useRef(new Set<string>())
  const log = useAuditLog()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  async function run(a: EmailAttachment) {
    const key = a.storage_url
    setChecks(c => ({ ...c, [key]: { phase: 'checking' } }))
    setTicked(t => ({ ...t, [key]: false }))
    try {
      const res = await fetch('/api/attachments/commission-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_url: a.storage_url, filename: a.filename, mime_type: a.mime_type ?? null }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setChecks(c => ({ ...c, [key]: { phase: 'failed', error: d.error ?? `Check failed (${res.status})` } })); return }
      setChecks(c => ({ ...c, [key]: { phase: 'done', status: d.status, hits: Array.isArray(d.hits) ? d.hits : [], reason: d.reason ?? null, copy: d.client_copy ?? null } }))
    } catch (e) {
      setChecks(c => ({ ...c, [key]: { phase: 'failed', error: e instanceof Error ? e.message : 'Check failed' } }))
    }
  }

  const keys = attachments.map(a => a.storage_url).join('\n')
  useEffect(() => {
    for (const a of attachments) {
      if (!a.storage_url || started.current.has(a.storage_url)) continue
      started.current.add(a.storage_url)
      void run(a)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys])

  const state = useMemo<CommissionState>(() => {
    let ready = attachments.length === 0 || attachments.every(a => !!a.storage_url)
    const out: EmailAttachment[] = []
    for (const a of attachments) {
      const c = checks[a.storage_url]
      if (!c || c.phase === 'checking') { ready = false; out.push(a); continue }
      if (c.phase === 'done' && c.status === 'clean') { out.push(a); continue }
      if (c.phase === 'done' && c.status === 'blanked' && !c.copy) ready = false
      if (!ticked[a.storage_url]) ready = false
      out.push(c.phase === 'done' && c.status === 'blanked' && c.copy ? c.copy : a)
    }
    return { ready, attachments: out }
  }, [attachments, checks, ticked])

  // Reported only when it changes, so a parent passing a new array each render does not loop.
  const sent = useRef('')
  useEffect(() => {
    const sig = JSON.stringify(state)
    if (sig === sent.current) return
    sent.current = sig
    onChangeRef.current(state)
  }, [state])

  function tick(a: EmailAttachment, c: Check, on: boolean) {
    setTicked(t => ({ ...t, [a.storage_url]: on }))
    if (!on) return
    const status = c.phase === 'done' ? c.status : 'failed'
    log({
      action: 'attachment.commission_confirmed',
      resource_type: context?.resource_type ?? 'attachment',
      resource_id: context?.resource_id ?? a.storage_url,
      new_value: {
        file: a.filename, storage_url: a.storage_url, status,
        client_copy: c.phase === 'done' ? c.copy?.storage_url ?? null : null,
        hits: c.phase === 'done' ? c.hits.length : 0, confirmed_at: new Date().toISOString(),
      },
    })
  }

  if (!attachments.length) return null
  return (
    <div className="flex flex-col gap-2" aria-label="Commission check">
      {attachments.map(a => {
        const c = checks[a.storage_url]
        const needsTick = !!c && (c.phase === 'failed' || (c.phase === 'done' && c.status !== 'clean'))
        return (
          <div key={a.storage_url} className="flex flex-col gap-1 text-body">
            {!c || c.phase === 'checking' ? (
              <InlineSpinner label={`Checking ${a.filename} for commission`} />
            ) : c.phase === 'failed' ? (
              <span className="flex flex-wrap items-center gap-2 text-trs-neg" role="alert">
                Check failed: {a.filename} · {c.error}
                <Btn size="xs" onClick={() => void run(a)}>Retry</Btn>
              </span>
            ) : c.status === 'clean' ? (
              <span className="text-trs-muted">No commission found: {a.filename}</span>
            ) : c.status === 'blanked' ? (
              <span className="flex flex-wrap items-center gap-2 text-trs-ink">
                <span>Commission found in {a.filename}: {plural(c.hits.length, 'line')} blanked, {where(c.hits)}.</span>
                {c.copy && <a href={previewHref(c.copy)} target="_blank" rel="noreferrer" className="underline underline-offset-2">Preview client copy</a>}
              </span>
            ) : (
              <span className="text-trs-neg">Not checked: {a.filename}{c.reason ? ` · ${c.reason}` : ''}</span>
            )}
            {c?.phase === 'done' && c.status === 'blanked' && c.hits.length > 0 && (
              <ul className="m-0 pl-4 text-small text-trs-muted">
                {c.hits.slice(0, 6).map((h, i) => <li key={i}>{h.page ? `p${h.page} · ` : h.cell ? `${h.sheet ? `${h.sheet}!` : ''}${h.cell} · ` : ''}{h.text}</li>)}
                {c.hits.length > 6 && <li>+{c.hits.length - 6}</li>}
              </ul>
            )}
            {needsTick && (
              <label className="inline-flex items-center gap-2 text-body text-trs-ink">
                <input type="checkbox" checked={!!ticked[a.storage_url]} onChange={e => tick(a, c!, e.target.checked)} className="h-4 w-4 accent-trs-green-2" />
                Checked: no commission in this file
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}
