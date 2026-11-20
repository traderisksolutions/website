'use client'

/**
 * Client wish list for one case: what the client asked for at renewal, typed by a person and
 * graded must have or good to have. A wish is a case note in the wish section, so it shows on the
 * Brief and in the Comparison. Set aside takes one off without deleting it.
 */
import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Btn, Empty, Spinner, inputCls } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { actorName } from '@/lib/cases/names'
import { NEEDS, NEED_NAME, isNeed, type Need } from '@/lib/cases/compare'
import type { CaseMemory, Note } from '@/lib/cases/memory-store'
import { Register } from '@/components/ui/register'
import { selectCls } from './shared'

const WISH = 'wish'
const wishesOf = (m: CaseMemory) => m.sections.find(s => s.section === WISH)?.notes ?? []

export function NeedSelect({ value, onChange, disabled, label }: { value: Need | null; onChange: (need: Need | null) => void; disabled?: boolean; label: string }) {
  return (
    <select className={`${selectCls} w-full`} aria-label={label} disabled={disabled} value={value ?? ''} onChange={e => onChange(isNeed(e.target.value) ? e.target.value : null)}>
      <option value="">Not graded</option>
      {NEEDS.map(n => <option key={n} value={n}>{NEED_NAME[n]}</option>)}
    </select>
  )
}

export function WishListDialog({ caseId, title, onClose, onChanged }: {
  /** The case whose wish list is open; null closes the dialog. */
  caseId: string | null
  title?: string | null
  onClose: () => void
  /** A wish was added, graded or set aside. */
  onChanged?: () => void
}) {
  const [memory, setMemory] = useState<CaseMemory | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [need, setNeed] = useState<Need | null>('must')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMemory(null); setError(null); setText(''); setNeed('must')
    if (caseId) callApi<CaseMemory>(`/api/work/${caseId}/memory`).then(setMemory).catch(e => setError(errText(e)))
  }, [caseId])

  const post = useCallback(async (key: string, body: Record<string, unknown>) => {
    setBusy(key); setError(null)
    try {
      const d = await callApi<{ memory: CaseMemory }>(`/api/work/${caseId}/memory`, { method: 'POST', body })
      setMemory(d.memory)
      onChanged?.()
      return true
    } catch (e) { setError(errText(e)); return false } finally { setBusy(null) }
  }, [caseId, onChanged])

  async function add() {
    if (!text.trim() || busy) return
    if (await post('add', { action: 'note', section: WISH, text, need })) setText('')
  }
  const grade = (n: Note, to: Need | null) => void post(n.id, { action: 'need', note_id: n.id, need: to })
  const setAside = (n: Note) => void post(n.id, { action: 'reject', note_id: n.id })

  const wishes = memory ? wishesOf(memory) : []
  return (
    <Dialog open={caseId !== null} onOpenChange={o => { if (!o && busy === null) onClose() }}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-[720px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Client wish list</DialogTitle>
          <DialogDescription className={title ? 'truncate' : 'sr-only'}>{title || 'What the client asked for at renewal.'}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 min-w-0">
          {!memory ? (error ? null : <Spinner label="Loading the wish list…" />) : wishes.length === 0 ? <Empty compact>No wishes on the case.</Empty> : (
            <Register label="Client wish list" minWidth={400} dense={false} className="[&_table]:table-fixed sm:[&_table]:!min-w-[560px]">
                <colgroup><col /><col className="w-[150px]" /><col className="hidden sm:table-column w-[130px]" /><col className="w-[96px]" /></colgroup>
                <thead><tr><th>Wish</th><th>Need</th><th className="hidden sm:table-cell">By</th><th><span className="sr-only">Action</span></th></tr></thead>
                <tbody>
                  {wishes.map(n => (
                    <tr key={n.id} className="align-middle">
                      <td className="cell-left px-3 py-2 text-13 leading-[1.5] break-words">{n.text}</td>
                      <td className="px-2 py-1.5"><NeedSelect label={`Need for: ${n.text}`} value={n.need ?? null} disabled={busy !== null} onChange={to => grade(n, to)} /></td>
                      <td className="cell-left hidden px-3 py-2 text-13 truncate sm:table-cell">{n.author_kind === 'agent' ? actorName(n.author) : actorName(n.author, memory.staff)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap"><Btn size="xs" disabled={busy !== null} loading={busy === n.id} onClick={() => setAside(n)}>Set aside</Btn></td>
                    </tr>
                  ))}
                </tbody>
            </Register>
          )}
          {memory && (
            <form className="flex flex-wrap items-center gap-2 min-w-0" onSubmit={e => { e.preventDefault(); void add() }}>
              <input className={`${inputCls} flex-1 min-w-[200px]`} aria-label="New wish" placeholder="Wish" maxLength={600} value={text} onChange={e => setText(e.target.value)} />
              <span className="w-[150px] flex-none"><NeedSelect label="Need for the new wish" value={need} disabled={busy !== null} onChange={setNeed} /></span>
              <Btn type="submit" level="primary" disabled={!text.trim() || busy !== null} loading={busy === 'add'}>Add wish</Btn>
            </form>
          )}
          {error && <p className="m-0 text-13 text-trs-neg" role="alert">{error}</p>}
        </div>
        <DialogFooter className="gap-2 sm:space-x-0">
          <Btn disabled={busy !== null} onClick={onClose}>Close</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
