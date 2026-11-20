'use client'

/**
 * "Select conversations": the client's threads in three groups (active, back burner, member
 * movements), by label and age. A person ticks the ones this renewal runs on; Continue opens
 * "Case from threads" (CombineDialog) with the case chosen, where each thread is marked as the
 * client's or an insurer's. No model is called.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Btn, Empty, Segmented, Spinner } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { count, tableFrame } from '@/components/cases/shared'
import { DASH, fmtDate } from '@/lib/format'
import { COMBINE_MAX } from '@/lib/cases/combine'
import { LABEL_NAME } from '@/lib/cases/labels'
import { RELEVANCE, RELEVANCE_NAME, type Relevance } from '@/lib/cases/relevance'
import { pickGroupOf } from '@/lib/cases/season'
import type { CompanyRelevance } from '@/lib/cases/sources-store'

export type PickTarget = { company_id: string; company: string; case_id: string; title: string | null }

export function ThreadPicker({ target, today, onClose, onContinue }: {
  /** The renewal the threads are for; null keeps the dialog shut. */
  target: PickTarget | null
  today: string
  onClose: () => void
  onContinue: (threadIds: string[]) => void
}) {
  const [view, setView] = useState<CompanyRelevance | null>(null)
  const [group, setGroup] = useState<Relevance>('active')
  const [ticked, setTicked] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const companyId = target?.company_id ?? null

  useEffect(() => {
    setView(null); setTicked([]); setGroup('active'); setError(null)
    if (!companyId) return
    let live = true
    callApi<CompanyRelevance>(`/api/companies/${companyId}/relevance`).then(d => { if (live) setView(d) }).catch(e => { if (live) setError(errText(e)) })
    return () => { live = false }
  }, [companyId, target?.case_id])

  const groups = useMemo(() => {
    const out = Object.fromEntries(RELEVANCE.map(r => [r, [] as CompanyRelevance['threads']])) as Record<Relevance, CompanyRelevance['threads']>
    for (const t of view?.threads ?? []) out[pickGroupOf(t, today)].push(t)
    return out
  }, [view, today])
  const shown = groups[group]
  const over = ticked.length > COMBINE_MAX

  return (
    <Dialog open={target !== null} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-[860px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select conversations</DialogTitle>
          <DialogDescription>{[target?.company, target?.title].filter(Boolean).join(' · ')}</DialogDescription>
        </DialogHeader>
        {error && <p className="m-0 text-body text-trs-neg" role="alert">{error}</p>}
        {!view ? (error ? null : <Spinner label="Loading the client’s threads…" />) : (
          <>
            <Segmented<Relevance> value={group} onChange={setGroup} label="Relevance" options={RELEVANCE.map(r => ({ value: r, label: RELEVANCE_NAME[r], count: groups[r].length }))} />
            {shown.length === 0 ? <Empty compact>No threads in this group.</Empty> : (
              <div className={tableFrame}>
                <table className="trs-table table-fixed min-w-[700px]">
                  <colgroup><col className="w-10" /><col /><col className="w-[150px]" /><col className="w-[116px]" /><col className="w-[24%]" /></colgroup>
                  <thead><tr><th><span className="sr-only">Pick</span></th><th>Thread</th><th>Label</th><th>Last message</th><th>On case</th></tr></thead>
                  <tbody>
                    {shown.map(t => {
                      const here = t.case?.id === target?.case_id
                      return (
                        <tr key={t.id} aria-selected={ticked.includes(t.id)}>
                          <td className="px-2"><input type="checkbox" className="h-4 w-4 accent-trs-green" aria-label={`Pick ${t.subject || 'No subject'}`} checked={here || ticked.includes(t.id)} disabled={here}
                            onChange={e => setTicked(s => (e.target.checked ? [...s, t.id] : s.filter(id => id !== t.id)))} /></td>
                          <td className="cell-left px-3"><Link href={`/engagement?thread=${t.id}`} target="_blank" className="block truncate text-trs-ink no-underline hover:underline" title={t.subject ?? undefined}>{t.subject || 'No subject'}</Link></td>
                          <td className="px-3 whitespace-nowrap">{LABEL_NAME[t.label]}</td>
                          <td className="px-3 whitespace-nowrap tabular-nums">{fmtDate(t.last_message_at)}</td>
                          <td className="cell-left px-3">{here ? 'This case' : t.case ? <span className="block truncate" title={t.case.title ?? undefined}>{t.case.title ?? 'Open case'}</span> : <span className="text-trs-muted">{DASH}</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {view.hidden > 0 && <p className="m-0 text-small tabular-nums text-trs-muted">{count(view.hidden, 'thread')} in a colleague’s mailbox not listed</p>}
          </>
        )}
        <DialogFooter className="gap-2 sm:space-x-0">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn level="primary" disabled={ticked.length === 0 || over} onClick={() => onContinue(ticked)}>{over ? `Up to ${COMBINE_MAX} threads` : ticked.length ? `Continue · ${count(ticked.length, 'thread')}` : 'Continue'}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
