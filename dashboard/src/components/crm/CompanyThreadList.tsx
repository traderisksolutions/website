'use client'

/**
 * A client's threads by where they sit: Active, Back burner, Member movements, each with its
 * label and the open case it is on (GET /api/companies/:id/relevance). A row opens the thread in
 * the reader beside this list. Threads in a colleague's mailbox are counted, never listed.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Chip, Empty, Segmented, Spinner } from './primitives'
import { callApi, errText } from '@/components/placement/shared'
import { fmtDate, DASH } from '@/lib/format'
import { LABEL_NAME } from '@/lib/cases/labels'
import { RELEVANCE, RELEVANCE_NAME, type Relevance } from '@/lib/cases/relevance'
import type { CompanyRelevance } from '@/lib/cases/sources-store'

export function CompanyThreadList({ companyId, onOpen }: {
  companyId: string
  /** Opens a thread in the reader. */
  onOpen: (threadId: string) => void
}) {
  const [data, setData] = useState<CompanyRelevance | null>(null)
  const [tab, setTab] = useState<Relevance>('active')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null); setError(null)
    callApi<CompanyRelevance>(`/api/companies/${companyId}/relevance`)
      // Open on the first group that holds anything.
      .then(d => { setData(d); setTab(RELEVANCE.find(r => d.counts[r] > 0) ?? 'active') })
      .catch(e => setError(errText(e)))
  }, [companyId])

  if (error) return <p className="m-0 text-[13.5px] text-trs-neg" role="alert">{error}</p>
  if (!data) return <Spinner label="Loading threads…" />
  const rows = data.threads.filter(t => t.relevance === tab)

  return (
    <section aria-label="Threads by relevance" className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
        <Segmented<Relevance> value={tab} onChange={setTab} label="Relevance" options={RELEVANCE.map(r => ({ value: r, label: RELEVANCE_NAME[r], count: data.counts[r] }))} />
        {data.season.on && <span className="text-[13px] text-trs-ink-2">Renewal season · {[data.season.basis, data.season.date ? fmtDate(data.season.date) : null].filter(Boolean).join(' ')}</span>}
      </div>
      {rows.length === 0 ? <Empty compact>No threads in this group.</Empty> : (
        <div className="overflow-x-auto rounded-[10px] border border-trs-line bg-white">
          <table className="trs-table table-fixed" style={{ minWidth: 680 }}>
            <colgroup><col /><col style={{ width: 164 }} /><col style={{ width: 124 }} /><col style={{ width: '30%' }} /></colgroup>
            <thead><tr><th>Thread</th><th>Label</th><th>Last message</th><th>Case</th></tr></thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id}>
                  <td className="px-3"><button type="button" onClick={() => onOpen(t.id)} className="block max-w-full truncate bg-transparent border-0 p-0 cursor-pointer text-left text-[13px] text-trs-ink hover:underline" title={t.subject ?? undefined}>{t.subject || 'No subject'}</button></td>
                  <td className="px-3"><Chip>{LABEL_NAME[t.label]}</Chip></td>
                  <td className="px-3 whitespace-nowrap tabular-nums">{fmtDate(t.last_message_at)}</td>
                  <td className="cell-left px-3">{t.case ? <Link href={`/today/${t.case.id}`} className="block truncate text-trs-ink no-underline hover:underline">{t.case.title ?? 'Open case'}</Link> : <span className="text-trs-muted">{DASH}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.hidden > 0 && <p className="m-0 text-[13px] text-trs-muted">{data.hidden === 1 ? '1 thread in a colleague’s mailbox' : `${data.hidden} threads in colleagues’ mailboxes`}</p>}
    </section>
  )
}
