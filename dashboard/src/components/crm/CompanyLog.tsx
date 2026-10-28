'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { SectionCard, Empty, Spinner, Btn, textareaCls } from './primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { fmtDate, fmtDateTime, fmtRelative } from '@/lib/crm/format'
import { threadHref } from '@/lib/placement/position'
import { callApi, errText, selectCls, INK, MUTED, ERROR } from '@/components/placement/shared'
import type { ActivityEvent, ActivityKind } from '@/lib/crm/types'
import type { LogKind, Placement, PlacementBundle } from '@/lib/placement/types'

const PAGE = 100

const ACTIVITY_WORD: Record<ActivityKind, string> = {
  email_in: 'Email in', email_out: 'Email out', ai_draft: 'Draft', debit_note: 'Debit note', payment: 'Payment',
  quote: 'Quote', case: 'Case', stage: 'Stage', note: 'Note',
}
const LOG_WORD: Record<LogKind, string> = {
  note: 'Note', decision: 'Decision', ask: 'Request', reply: 'Reply', change: 'Change', chase: 'Follow-up',
  quote: 'Quote', sent: 'Sent', declined: 'Declined', info: 'Info request', opened: 'Opened', closed: 'Closed', done: 'Done',
}

type Entry = { id: string; at: string; kind: string; text: string; detail: string | null; href: string | null }

/**
 * The company memory on one register: the placement log (what was asked, quoted, decided) and
 * everything else that happened (mail, notes, payments), newest first. A note added here goes to
 * the newest open placement.
 */
export function CompanyLog({ bundle, events, onChanged }: {
  bundle: PlacementBundle | null
  events: ActivityEvent[] | null
  onChanged: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [text, setText] = useState('')
  const [kind, setKind] = useState<'note' | 'decision'>('note')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const target: Placement | null = useMemo(() => {
    if (!bundle) return null
    return [...bundle.placements].filter(p => p.status !== 'closed').sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  }, [bundle])

  const entries: Entry[] = useMemo(() => {
    const fromLog: Entry[] = (bundle?.log ?? []).map(e => ({ id: `log-${e.id}`, at: e.created_at, kind: LOG_WORD[e.kind] ?? e.kind, text: e.text, detail: e.actor, href: threadHref(e.thread_id) }))
    const fromActivity: Entry[] = (events ?? []).map(e => ({ id: `act-${e.id}`, at: e.at, kind: ACTIVITY_WORD[e.kind] ?? e.kind, text: e.title, detail: e.detail, href: e.href }))
    return [...fromLog, ...fromActivity].sort((a, b) => b.at.localeCompare(a.at))
  }, [bundle, events])

  async function add() {
    if (!target || !text.trim()) return
    setBusy(true); setError(null)
    try {
      await callApi(`/api/placements/${target.id}/log`, { method: 'POST', body: { kind, text: text.trim() } })
      setText('')
      onChanged()
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  const loading = bundle === null || events === null
  const visible = showAll ? entries : entries.slice(0, PAGE)

  return (
    <SectionCard title="Log">
      {target && (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-start mb-4">
          <textarea className={`${textareaCls} flex-1`} rows={2} value={text} onChange={e => setText(e.target.value)} placeholder={target.title} aria-label="Log entry" />
          <div className="flex gap-2 items-start">
            <select className={`${selectCls} w-auto`} value={kind} onChange={e => setKind(e.target.value as 'note' | 'decision')} aria-label="Kind">
              <option value="note">Note</option>
              <option value="decision">Decision</option>
            </select>
            <Btn level="secondary" className="h-10" onClick={add} loading={busy} disabled={!text.trim()}>Add</Btn>
          </div>
        </div>
      )}
      {error && <p className="text-[13px] m-0 mb-3" style={{ color: ERROR }}>{error}</p>}
      {loading && <Spinner label="Loading log…" />}
      {!loading && entries.length === 0 && <Empty compact>Nothing yet.</Empty>}
      {!loading && entries.length > 0 && (
        <>
          <Register label="Company log" minWidth={720}>
            <RegisterHead>
              <RegisterTh first>When</RegisterTh>
              <RegisterTh>Kind</RegisterTh>
              <RegisterTh>Entry</RegisterTh>
              <RegisterTh last />
            </RegisterHead>
            <tbody>
              {visible.map(e => (
                <RegisterRow key={e.id}>
                  <RegisterCell first identityWidth={120} title={`${fmtRelative(e.at)} · ${fmtDateTime(e.at)}`} primary={fmtDate(e.at)} />
                  <RegisterCell primary={e.kind} />
                  <RegisterCell nowrap={false}>
                    <span className="block text-[13px] whitespace-pre-wrap" style={{ color: INK }} title={e.detail ?? undefined}>{e.text}{e.detail && <span style={{ color: MUTED }}> · {e.detail}</span>}</span>
                  </RegisterCell>
                  <RegisterCell last align="right">
                    {e.href
                      ? <Link href={e.href} className="text-[14px] no-underline hover:underline" style={{ color: INK }}>Open</Link>
                      : <span className="text-[14px]" style={{ color: MUTED }}>—</span>}
                  </RegisterCell>
                </RegisterRow>
              ))}
            </tbody>
          </Register>
          {!showAll && entries.length > PAGE && (
            <div className="pt-3">
              <Btn level="tertiary" size="xs" onClick={() => setShowAll(true)}>Show all ({entries.length})</Btn>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}
