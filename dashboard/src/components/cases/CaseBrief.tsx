'use client'

/**
 * Case brief: what the case knows, one note per row with the email it came from. An agent's note
 * always carries its source; a person's note may carry none. Set aside takes a note off the brief
 * without deleting it; Restore puts it back. Words from a colleague's mailbox are withheld.
 */
import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Btn, Empty, Field, Segmented, Spinner, textareaCls } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { selectCls } from '@/components/today/MailView'
import { DASH, fmtDay } from '@/lib/format'
import { actorName, senderName } from '@/lib/cases/names'
import type { CaseMemory, Note } from '@/lib/cases/memory-store'
import { subjectBtn, tableFrame } from './shared'

type Tab = 'current' | 'aside'

export function CaseBrief({ id, onOpenThread, onChanged, onNotice, onError }: {
  id: string
  onOpenThread: (threadId: string) => void
  /** A note was added, set aside or restored. */
  onChanged: () => void
  onNotice: (message: string) => void
  onError: (message: string | null) => void
}) {
  const [memory, setMemory] = useState<CaseMemory | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('current')
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [section, setSection] = useState('')
  const [text, setText] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const load = useCallback(() => callApi<CaseMemory>(`/api/work/${id}/memory`), [id])
  useEffect(() => {
    setMemory(null); setFailed(null)
    load().then(setMemory).catch(e => setFailed(errText(e)))
  }, [load])

  if (failed) return <p className="m-0 text-[13.5px] text-trs-neg" role="alert">{failed}</p>
  if (!memory) return <Spinner label="Loading brief…" />

  const name = new Map<string, string>(memory.sections.map(s => [s.section, s.name]))
  const current = memory.sections.flatMap(s => s.notes)
  const rows = tab === 'current' ? current : memory.set_aside
  const email = new Map(memory.emails.map(e => [e.id, e]))
  /** Who said it, when, and the words the note rests on. */
  const source = (n: Note) => {
    if (n.private) return <span className="text-trs-muted">Colleague’s mailbox · quote withheld</span>
    if (!n.message_id) return <span className="text-trs-muted">{DASH}</span>
    const m = email.get(n.message_id)
    const line = [m ? senderName(m.from) : null, n.source_date ? fmtDay(n.source_date) : null, n.quote ? `“${n.quote}”` : null].filter(Boolean).join(' · ')
    return n.thread_id
      ? <button type="button" onClick={() => onOpenThread(n.thread_id!)} className={`${subjectBtn} whitespace-normal`} title="Open the email thread">{line || 'Open the email'}</button>
      : line || DASH
  }

  async function mark(n: Note, action: 'reject' | 'restore') {
    setBusy(n.id); onError(null)
    try {
      const d = await callApi<{ memory: CaseMemory }>(`/api/work/${id}/memory`, { method: 'POST', body: { action, note_id: n.id } })
      setMemory(d.memory)
      onNotice(action === 'reject' ? 'Note set aside.' : 'Note restored to the brief.')
      onChanged()
    } catch (e) { onError(errText(e)) } finally { setBusy(null) }
  }

  async function add() {
    setBusy('add'); setAddError(null)
    try {
      const d = await callApi<{ memory: CaseMemory }>(`/api/work/${id}/memory`, { method: 'POST', body: { action: 'note', section: section || memory!.sections[0]?.section, text } })
      setMemory(d.memory); setAdding(false); setText(''); setTab('current')
      onNotice('Note added to the brief.')
      onChanged()
    } catch (e) { setAddError(errText(e)) } finally { setBusy(null) }
  }

  return (
    <section aria-label="Brief" className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
        <Segmented<Tab> value={tab} onChange={setTab} label="Brief" options={[{ value: 'current', label: 'Current', count: current.length }, { value: 'aside', label: 'Set aside', count: memory.set_aside.length }]} />
        <Btn level="primary" disabled={busy !== null} onClick={() => { setAddError(null); setAdding(true) }}>Add note</Btn>
      </div>

      {rows.length === 0 ? <Empty compact>{tab === 'current' ? 'No notes on the brief.' : 'No notes set aside.'}</Empty> : (
        <div className={tableFrame}>
          <table className="trs-table" style={{ minWidth: 900 }}>
            <thead><tr><th className="w-[150px]">Section</th><th>Note</th><th>Source</th><th className="w-[140px]">By</th><th className="w-[104px]"><span className="sr-only">Action</span></th></tr></thead>
            <tbody>
              {rows.map(n => (
                <tr key={n.id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{name.get(n.section) ?? n.section}</td>
                  <td className="cell-left px-3 py-2 text-[13px] leading-[1.5] break-words">{n.text}</td>
                  <td className="cell-left px-3 py-2 text-[13px] leading-[1.5] max-w-[340px] break-words">{source(n)}</td>
                  <td className="cell-left px-3 py-2 whitespace-nowrap">{n.author_kind === 'agent' ? actorName(n.author) : actorName(n.author, memory.staff)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {n.status === 'current'
                      ? <Btn size="xs" disabled={busy !== null} loading={busy === n.id} onClick={() => void mark(n, 'reject')}>Set aside</Btn>
                      : <Btn size="xs" disabled={busy !== null} loading={busy === n.id} onClick={() => void mark(n, 'restore')}>Restore</Btn>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={adding} onOpenChange={o => { if (!o && busy !== 'add') setAdding(false) }}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-[520px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Note</DialogTitle>
            <DialogDescription className="sr-only">A note you add to the case brief.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 min-w-0">
            <Field label="Section">
              <select className={`${selectCls} w-full h-9`} value={section || memory.sections[0]?.section} onChange={e => setSection(e.target.value)}>
                {memory.sections.map(s => <option key={s.section} value={s.section}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Note">
              <textarea className={textareaCls} rows={4} maxLength={600} value={text} onChange={e => setText(e.target.value)} />
            </Field>
            {addError && <p className="m-0 text-[13px] text-trs-neg" role="alert">{addError}</p>}
          </div>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Btn disabled={busy === 'add'} onClick={() => setAdding(false)}>Cancel</Btn>
            <Btn level="primary" disabled={!text.trim()} loading={busy === 'add'} onClick={() => void add()}>Save note</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
