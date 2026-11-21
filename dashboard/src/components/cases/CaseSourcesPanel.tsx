'use client'

/**
 * Case sources: the threads a case is built from (GET/POST /api/work/:id/sources). A person ticks
 * threads the rules propose, or any other thread of the client, and adds them; a thread that sits
 * on another case asks first (MoveThreadDialog). A thread taken off the case moves to Removed and
 * no agent puts it back. Threads in a colleague's mailbox are counted, never listed. The Side of a
 * thread is Client, Internal, Other, or an insurer on file by name.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Btn, Chip, Empty, Segmented, Spinner } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { DASH, fmtDate, fmtDay } from '@/lib/format'
import { LABEL_NAME } from '@/lib/cases/labels'
import { actorName, type Staff } from '@/lib/cases/names'
import type { Candidate, Proposal, Side } from '@/lib/cases/sources'
import type { CaseSources } from '@/lib/cases/sources-store'
import { MoveThreadDialog, type Conflict } from './MoveThreadDialog'
import { count, subjectBtn } from './shared'
import { Register } from '@/components/ui/register'
import { SideSelect, type From } from './SideSelect'
import { workFetch, callWork } from '@/lib/work/fetch'

type Tab = 'proposed' | 'recent' | 'older' | 'on' | 'removed'
/** What the rule matched, in the words of the column. */
const matchedOn = (t: Candidate | Proposal) => {
  if (!('reason' in t)) return DASH
  if (t.reason === 'policy_number') return 'Policy number'
  if (t.reason === 'label') return 'Label'
  return t.basis.replace(/^Subject shares:/, 'Subject:')
}

type PickAnswer = { ok?: boolean; error?: string; side?: Side; conflict?: Conflict['held'] }
/** The pick, read whole: a 409 carries the case that holds the thread, which callApi drops. */
async function pick(id: string, threadId: string, move: boolean): Promise<{ status: number; body: PickAnswer }> {
  const res = await workFetch(`/api/work/${id}/sources`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ action: 'pick', thread_id: threadId, move }) })
  const body = await res.json().catch(() => ({})) as PickAnswer
  return { status: res.status, body }
}

export function CaseSourcesPanel({ id, staff, onOpenThread, onChanged, onNotice, onError }: {
  id: string
  staff: readonly Staff[]
  onOpenThread: (threadId: string) => void
  /** The threads on the case changed. */
  onChanged: () => void
  onNotice: (message: string) => void
  onError: (message: string | null) => void
}) {
  const [data, setData] = useState<CaseSources | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('proposed')
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  // A side chosen on a row before it is added.
  const [sides, setSides] = useState<Record<string, From>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<Conflict[]>([])

  const load = useCallback(() => callWork<CaseSources>(`/api/work/${id}/sources`), [id])
  useEffect(() => {
    setData(null); setFailed(null)
    load().then(d => {
      setData(d)
      // Open where there is something to do: proposals, else what is on the case.
      setTab(d.proposed.length ? 'proposed' : d.picked.length ? 'on' : d.recent.length ? 'recent' : 'proposed')
    }).catch(e => setFailed(errText(e)))
  }, [load])

  if (failed) return <p className="m-0 text-body text-trs-neg" role="alert">{failed}</p>
  if (!data) return <Spinner label="Loading sources…" />

  const offered: Record<'proposed' | 'recent' | 'older', (Candidate | Proposal)[]> = { proposed: data.proposed, recent: data.recent, older: data.older }
  const all = [...data.proposed, ...data.recent, ...data.older]
  const chosen = all.filter(t => ticked.has(t.id))
  const sideOf = (t: Candidate): From => sides[t.id] ?? { side: t.side, insurer: null }

  /** Adds each thread; a thread on another case is held back for the person to decide. */
  async function add(threads: ({ id: string; subject: string | null } & From)[], move: boolean) {
    setBusy('add'); onError(null)
    const held: Conflict[] = []
    const errors: string[] = []
    let added = 0
    for (const t of threads) {
      try {
        const { status, body } = await pick(id, t.id, move)
        if (status === 409 && body.conflict) { held.push({ thread_id: t.id, subject: t.subject, held: body.conflict }); continue }
        if (status >= 400) { errors.push(body.error ?? `Request failed (${status}).`); continue }
        if (t.insurer || (body.side && body.side !== t.side)) await callWork(`/api/work/${id}/sources`, { method: 'POST', body: { action: 'side', thread_id: t.id, side: t.side, insurer_id: t.insurer } })
        added++
      } catch (e) { errors.push(errText(e)) }
    }
    try { setData(await load()) } catch (e) { errors.push(errText(e)) }
    setTicked(new Set(held.map(c => c.thread_id)))
    setConflicts(held)
    setBusy(null)
    if (added) { onNotice(`${count(added, 'thread')} ${move ? 'moved to' : 'added to'} the case.`); onChanged() }
    if (errors.length) onError(Array.from(new Set(errors)).join(' '))
  }

  async function act(action: 'exclude' | 'restore' | 'side', threadId: string, done: string | null, from?: From) {
    setBusy(threadId); onError(null)
    try {
      const d = await callWork<{ sources: CaseSources }>(`/api/work/${id}/sources`, { method: 'POST', body: { action, thread_id: threadId, side: from?.side, insurer_id: from?.insurer } })
      setData(d.sources)
      if (done) onNotice(done)
      onChanged()
    } catch (e) { onError(errText(e)) } finally { setBusy(null) }
  }

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: 'proposed', label: 'Proposed', count: data.proposed.length },
    { value: 'recent', label: 'Recent', count: data.recent.length },
    { value: 'older', label: 'Over 90 days', count: data.older.length },
    { value: 'on', label: 'On case', count: data.picked.length },
    { value: 'removed', label: 'Removed', count: data.excluded.length },
  ]
  const rows = tab === 'on' || tab === 'removed' ? [] : offered[tab]
  const sideSelect = (subject: string | null, value: From, onChange: (f: From) => void, disabled = false) => (
    <SideSelect subject={subject} value={value} insurers={data.insurers} onChange={onChange} disabled={disabled} />
  )
  const subject = (t: { id: string; subject: string | null }) => (
    <button type="button" onClick={() => onOpenThread(t.id)} className={subjectBtn} title={t.subject ?? undefined}>{t.subject || 'No subject'}</button>
  )

  return (
    <section aria-label="Sources" className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
        <Segmented<Tab> variant="tabs" value={tab} onChange={setTab} label="Sources" options={tabs} />
        <Btn level="primary" disabled={busy !== null || chosen.length === 0} loading={busy === 'add'}
          onClick={() => void add(chosen.map(t => ({ id: t.id, subject: t.subject, ...sideOf(t) })), false)}>
          {chosen.length ? `Add ${chosen.length} to case` : 'Add to case'}
        </Btn>
      </div>

      {tab === 'on' ? (
        data.picked.length === 0 ? <Empty compact>No threads on the case.</Empty> : (
          <Register label="Threads on the case" minWidth={860} dense={false}>
              <thead><tr><th>Thread</th><th>Side</th><th>Label</th><th>Picked by</th><th>Emails</th><th>Last message</th><th><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {data.picked.map(t => (
                  <tr key={t.id}>
                    <td className="px-3 max-w-[320px]">{subject(t)}</td>
                    <td className="px-2">{sideSelect(t.subject, { side: t.side, insurer: t.insurer?.id ?? null }, f => void act('side', t.id, null, f), busy !== null)}</td>
                    <td className="px-3"><Chip>{LABEL_NAME[t.label]}</Chip></td>
                    <td className="cell-left px-3 whitespace-nowrap">{t.picked_by ? actorName(t.picked_by, staff) : t.joined_by ? actorName(t.joined_by, staff) : DASH}</td>
                    <td className="px-3 tabular-nums">{t.messages}</td>
                    <td className="px-3 whitespace-nowrap tabular-nums">{fmtDate(t.last_message_at)}</td>
                    <td className="px-2 whitespace-nowrap"><Btn size="xs" disabled={busy !== null} loading={busy === t.id} onClick={() => void act('exclude', t.id, 'Thread removed from the case.')}>Remove from case</Btn></td>
                  </tr>
                ))}
              </tbody>
            </Register>
        )
      ) : tab === 'removed' ? (
        data.excluded.length === 0 ? <Empty compact>No threads removed from the case.</Empty> : (
          <Register label="Threads removed from the case" minWidth={720} dense={false}>
              <thead><tr><th>Thread</th><th>Label</th><th>Removed by</th><th>Last message</th><th><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {data.excluded.map(t => (
                  <tr key={t.id}>
                    <td className="px-3 max-w-[340px]">{subject(t)}</td>
                    <td className="px-3"><Chip>{LABEL_NAME[t.label]}</Chip></td>
                    <td className="cell-left px-3 whitespace-nowrap">{[actorName(t.excluded_by, staff), fmtDay(t.excluded_at)].join(' · ')}</td>
                    <td className="px-3 whitespace-nowrap tabular-nums">{fmtDate(t.last_message_at)}</td>
                    <td className="px-2 whitespace-nowrap"><Btn size="xs" disabled={busy !== null} loading={busy === t.id} onClick={() => void act('restore', t.id, 'Thread restored. It can be added again.')}>Restore</Btn></td>
                  </tr>
                ))}
              </tbody>
            </Register>
        )
      ) : rows.length === 0 ? <Empty compact>No threads in this group.</Empty> : (
        <Register label="Threads" minWidth={980} dense={false}>
            <thead><tr><th className="w-10"><span className="sr-only">Pick</span></th><th>Thread</th><th>Side</th><th>Label</th><th>Matched on</th><th>Last message</th><th>On case</th></tr></thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id} aria-selected={ticked.has(t.id)}>
                  <td className="px-2"><input type="checkbox" aria-label={`Pick ${t.subject || 'No subject'}`} checked={ticked.has(t.id)} disabled={busy !== null}
                    onChange={e => setTicked(s => { const n = new Set(s); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n })} /></td>
                  <td className="cell-left px-3 max-w-[320px]">{subject(t)}</td>
                  <td className="px-2">{sideSelect(t.subject, sideOf(t), s => setSides(v => ({ ...v, [t.id]: s })), busy !== null)}</td>
                  <td className="px-3"><Chip>{t.label ? LABEL_NAME[t.label] : 'Other'}</Chip></td>
                  <td className="cell-left px-3 max-w-[220px]"><span className="block truncate" title={matchedOn(t)}>{matchedOn(t)}</span></td>
                  <td className="px-3 whitespace-nowrap tabular-nums">{fmtDate(t.last_message_at)}</td>
                  <td className="cell-left px-3 max-w-[200px]">{t.onCase ? <Link href={`/today/${t.onCase.id}?section=sources`} className="block truncate text-trs-ink no-underline hover:underline">{t.onCase.title ?? 'Open case'}</Link> : <span className="text-trs-muted">{DASH}</span>}</td>
                </tr>
              ))}
            </tbody>
          </Register>
      )}
      {data.hidden > 0 && <p className="m-0 text-body text-trs-muted">{data.hidden === 1 ? '1 thread in a colleague’s mailbox' : `${data.hidden} threads in colleagues’ mailboxes`}</p>}

      <MoveThreadDialog conflicts={conflicts} caseTitle={data.item.title ?? 'This case'} staff={staff} busy={busy === 'add'}
        onCancel={() => { setConflicts([]); setTicked(new Set()) }}
        onMove={() => void add(conflicts.map(c => ({ id: c.thread_id, subject: c.subject, ...sideOf(all.find(t => t.id === c.thread_id) ?? { id: c.thread_id, subject: c.subject, last_message_at: null, label: null, side: 'other', onCase: null }) })), true)} />
    </section>
  )
}
