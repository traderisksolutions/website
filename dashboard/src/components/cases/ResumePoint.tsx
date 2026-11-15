'use client'

/**
 * Resume point: where the case stands for whoever picks it up (next step, last touch, new emails,
 * open questions, hand-over) and how far each agent has read it. Read from the case's memory;
 * nothing here is written by a model at view time.
 */
import { useCallback, useEffect, useState } from 'react'
import { Spinner } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { DASH, fmtDateTime } from '@/lib/format'
import { actorName } from '@/lib/cases/names'
import type { CaseMemory } from '@/lib/cases/memory-store'
import { headingCls, ReadNewButton, tableFrame } from './shared'

export function ResumePoint({ id, onChanged, onNotice, onError }: {
  id: string
  /** The case reader read the case. */
  onChanged: () => void
  onNotice: (message: string) => void
  onError: (message: string | null) => void
}) {
  const [memory, setMemory] = useState<CaseMemory | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const load = useCallback(() => callApi<CaseMemory>(`/api/work/${id}/memory`), [id])
  useEffect(() => {
    setMemory(null); setFailed(null)
    load().then(setMemory).catch(e => setFailed(errText(e)))
  }, [load])

  if (failed) return <p className="m-0 text-[13.5px] text-trs-neg" role="alert">{failed}</p>
  if (!memory) return <Spinner label="Loading resume point…" />

  const r = memory.resume
  const reader = memory.agents.find(a => a.agent === 'case_worker')
  const rows: [string, string][] = [
    ['Next step', r.next_step ?? DASH],
    ['Last touch', r.last ? [actorName(r.last.actor, memory.staff), fmtDateTime(r.last.at), r.last.note ?? r.last.kind.replace(/_/g, ' ')].join(' · ') : DASH],
    ['New emails', memory.new_emails === 0 ? 'None' : reader?.last_read ? `${memory.new_emails} since the last read` : `${memory.new_emails} not read`],
    ['Open questions', r.open_questions.length ? [r.open_questions.length, ...r.open_questions].join(' · ') : 'None'],
    ['Hand-over', r.handover ?? DASH],
  ]

  return (
    <section aria-label="Resume point" className="flex flex-col gap-5 min-w-0">
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <h2 className={headingCls}>Resume point</h2>
          <ReadNewButton id={id} unread={memory.new_emails} onError={onError}
            onDone={notice => { onNotice(notice); onChanged(); load().then(setMemory).catch(e => onError(errText(e))) }} />
        </div>
        <div className={tableFrame}>
          <table className="trs-table" style={{ minWidth: 480 }} aria-label="Resume point">
            <thead><tr><th className="w-[150px]">Item</th><th>Detail</th></tr></thead>
            <tbody>
              {rows.map(([item, detail]) => (
                <tr key={item} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{item}</td>
                  <td className="cell-left px-3 py-2 text-[13px] leading-[1.5] break-words">{detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <h2 className={headingCls}>Agents</h2>
        <div className={tableFrame}>
          <table className="trs-table" style={{ minWidth: 520 }} aria-label="Agents">
            <thead><tr><th>Agent</th><th>Last read</th><th>Emails read</th><th>Unread</th><th>Notes kept</th></tr></thead>
            <tbody>
              {memory.agents.map(a => (
                <tr key={a.agent}>
                  <td className="px-3 whitespace-nowrap">{a.name}</td>
                  <td className="px-3 whitespace-nowrap tabular-nums">{fmtDateTime(a.last_read)}</td>
                  <td className="px-3 tabular-nums">{a.emails_read}</td>
                  <td className="px-3 tabular-nums">{a.unread}</td>
                  <td className="px-3 tabular-nums">{a.notes_kept}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
