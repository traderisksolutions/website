'use client'

/**
 * "Thread on another case": shown when a ticked thread already sits on another case. Nothing
 * moves until the person chooses. Move re-sends the pick with `move`; Cancel leaves the thread
 * where it is.
 */
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Btn } from '@/components/crm/primitives'
import { DASH, fmtDay } from '@/lib/format'
import { actorName, type Staff } from '@/lib/cases/names'
import { tableFrame } from './shared'

export type Conflict = {
  thread_id: string; subject: string | null
  /** The case that holds the thread now. */
  held: { id: string; title: string | null; picked_by: string | null; picked_at: string | null }
}

export function MoveThreadDialog({ conflicts, caseTitle, staff, busy, onCancel, onMove }: {
  conflicts: Conflict[]
  caseTitle: string
  staff: readonly Staff[]
  busy: boolean
  onCancel: () => void
  onMove: () => void
}) {
  return (
    <Dialog open={conflicts.length > 0} onOpenChange={o => { if (!o && !busy) onCancel() }}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-[760px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{conflicts.length === 1 ? 'Thread on another case' : 'Threads on other cases'}</DialogTitle>
          <DialogDescription className="sr-only">A thread sits on one case. Moving it takes it off the case that holds it now.</DialogDescription>
        </DialogHeader>
        <div className={tableFrame}>
          <table className="trs-table" style={{ minWidth: 640 }}>
            <thead><tr><th>Thread</th><th>Now on</th><th>Picked by</th><th>Move to</th></tr></thead>
            <tbody>
              {conflicts.map(c => (
                <tr key={c.thread_id}>
                  <td className="px-3 max-w-[220px]"><span className="block truncate" title={c.subject ?? undefined}>{c.subject || 'No subject'}</span></td>
                  <td className="cell-left px-3 max-w-[180px]"><span className="block truncate" title={c.held.title ?? undefined}>{c.held.title ?? 'Open case'}</span></td>
                  <td className="cell-left px-3 whitespace-nowrap">{c.held.picked_by ? [actorName(c.held.picked_by, staff), c.held.picked_at ? fmtDay(c.held.picked_at) : null].filter(Boolean).join(' · ') : DASH}</td>
                  <td className="cell-left px-3 max-w-[180px]"><span className="block truncate" title={caseTitle}>{caseTitle}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter className="gap-2 sm:space-x-0">
          <Btn disabled={busy} onClick={onCancel}>Cancel</Btn>
          <Btn level="primary" disabled={busy} loading={busy} onClick={onMove}>Move to this case</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
