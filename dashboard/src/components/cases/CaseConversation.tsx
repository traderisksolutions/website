'use client'

/**
 * Case conversation: what was said on the threads picked for the case, as two tables, the client's
 * side above the insurer's, oldest first. The rows are the emails' own words (no model writes
 * here). "New" marks an email the case reader has not read; the button starts that read.
 */
import { useCallback, useEffect, useState } from 'react'
import { Chip, Empty, Spinner } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { DASH, fmtDayTime } from '@/lib/format'
import type { Said } from '@/lib/cases/sources'
import type { CaseSources } from '@/lib/cases/sources-store'
import type { CaseMemory } from '@/lib/cases/memory-store'
import { actorName } from '@/lib/cases/names'
import { count, headingCls, ReadNewButton, tableFrame } from './shared'

const SIDES = [{ key: 'client', name: 'Client' }, { key: 'insurer', name: 'Insurer' }] as const
/** An email's words without the blank lines between them. */
const dense = (text: string) => text.replace(/\n\s*\n+/g, '\n').trim()

export function CaseConversation({ id, onOpenThread, onChanged, onNotice, onError }: {
  id: string
  onOpenThread: (threadId: string) => void
  /** The case reader read the case. */
  onChanged: () => void
  onNotice: (message: string) => void
  onError: (message: string | null) => void
}) {
  const [data, setData] = useState<{ sources: CaseSources; memory: CaseMemory } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [sources, memory] = await Promise.all([callApi<CaseSources>(`/api/work/${id}/sources`), callApi<CaseMemory>(`/api/work/${id}/memory`)])
    return { sources, memory }
  }, [id])
  useEffect(() => {
    setData(null); setFailed(null)
    load().then(setData).catch(e => setFailed(errText(e)))
  }, [load])

  if (failed) return <p className="m-0 text-[13.5px] text-trs-neg" role="alert">{failed}</p>
  if (!data) return <Spinner label="Loading conversation…" />

  const { sources, memory } = data
  const fresh = new Set(memory.emails.filter(e => e.new).map(e => e.id))
  const table = (name: string, rows: Said[]) => (
    <div key={name} className="flex flex-col gap-2 min-w-0">
      <h2 className={headingCls}>{name} · {count(rows.length, 'message')}</h2>
      {rows.length === 0 ? <Empty compact>No messages on this side.</Empty> : (
        <div className={tableFrame}>
          <table className="trs-table table-fixed" style={{ minWidth: 720 }} aria-label={`${name} messages`}>
            <colgroup><col style={{ width: 108 }} /><col style={{ width: 180 }} /><col /><col style={{ width: '18%' }} /></colgroup>
            <thead><tr><th>Date</th><th>From</th><th>Message</th><th>Files</th></tr></thead>
            <tbody>
              {rows.map(m => (
                <tr key={m.message_id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDayTime(m.at)}</td>
                  <td className="cell-left px-3 py-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] text-trs-ink [overflow-wrap:anywhere]" title={m.from}>{m.by === 'trs' && m.name.includes('@') ? actorName(m.from, memory.staff) : m.name}</span>
                      {m.by === 'trs' && <Chip>TRS</Chip>}
                      {fresh.has(m.message_id) && <Chip tone="amber">New</Chip>}
                    </span>
                  </td>
                  <td className="cell-left px-3 py-2">
                    <button type="button" onClick={() => onOpenThread(m.thread_id)} title="Open the email thread"
                      className="block w-full bg-transparent border-0 p-0 cursor-pointer text-left text-[13px] leading-[1.5] text-trs-ink whitespace-pre-line break-words">
                      {dense(m.text) || <span className="text-trs-muted">No text</span>}
                    </button>
                  </td>
                  <td className="cell-left px-3 py-2 text-[13px] leading-[1.5] [overflow-wrap:anywhere]">{m.files.length ? m.files.map((f, i) => <span key={i} className="block">{f}</span>) : <span className="text-trs-muted">{DASH}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  return (
    <section aria-label="Conversation" className="flex flex-col gap-5 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
        <p className="m-0 text-[13px] text-trs-muted">{count(sources.picked.length, 'thread')} on the case</p>
        <ReadNewButton id={id} unread={memory.new_emails} level="primary" onError={onError}
          onDone={notice => { onNotice(notice); onChanged(); load().then(setData).catch(e => onError(errText(e))) }} />
      </div>
      {sources.picked.length === 0
        ? <Empty>No threads on the case. Add them under Sources.</Empty>
        : SIDES.map(s => table(s.name, sources.buckets[s.key]))}
    </section>
  )
}
