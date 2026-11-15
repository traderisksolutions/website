'use client'

/**
 * Today › Mail: every thread the person may see, one row each, newest first, with its label, who
 * set it, its client and the open case it is on. The Inbox stays the place to read and reply: a
 * row opens the thread there. Changing a label here sets it for everyone; the rule's own answer
 * is kept beside it (POST /api/threads/:id/label).
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Btn, Segmented, Spinner, Empty } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { fmtDate, fmtDay, DASH } from '@/lib/format'
import { LABELS, LABEL_NAME, type Label } from '@/lib/cases/labels'
import { RELEVANCE, RELEVANCE_NAME, relevanceOf } from '@/lib/cases/relevance'
import { mailView, MAIL_PAGE, type MailRelevance, type MailRow, type SetBy } from '@/lib/cases/mail'
import { actorName, type Staff } from '@/lib/cases/names'

type Loaded = { threads: MailRow[]; staff: Staff[]; me: string; today: string }
export const selectCls = 'h-8 max-w-full rounded-[8px] border border-trs-line-2 bg-white px-2 text-[13px] text-trs-ink outline-none focus:border-trs-ink'

const setByText = (s: SetBy, staff: readonly Staff[]) =>
  s.kind === 'person' ? [actorName(s.email, staff), s.at ? fmtDay(s.at) : null].filter(Boolean).join(' · ') : ['Rule', s.basis].filter(Boolean).join(' · ')

export function MailView({ onCount }: { onCount: (n: number | null) => void }) {
  const [data, setData] = useState<Loaded | null>(null)
  const [relevance, setRelevance] = useState<MailRelevance>('all')
  const [label, setLabel] = useState<Label | 'all'>('all')
  const [limit, setLimit] = useState(MAIL_PAGE)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // One read holds every row, so the tabs and the label filter answer at once.
    callApi<Loaded>('/api/today/mail?limit=20000').then(setData).catch(e => setError(errText(e)))
  }, [])

  const view = useMemo(() => (data ? mailView(data.threads, { relevance, label, limit }) : null), [data, relevance, label, limit])
  useEffect(() => { onCount(view ? view.total : null) }, [view, onCount])

  async function relabel(row: MailRow, next: Label) {
    if (!data || next === row.label) return
    setSaving(row.id); setError(null)
    try {
      await callApi(`/api/threads/${row.id}/label`, { method: 'POST', body: { label: next } })
      const set_by: SetBy = { kind: 'person', email: data.me, at: new Date().toISOString() }
      const relevance = relevanceOf({ lastMessageAt: row.last_message_at, label: next, onOpenCase: !!row.case }, data.today)
      setData({ ...data, threads: data.threads.map(t => (t.id === row.id ? { ...t, label: next, set_by, relevance } : t)) })
    } catch (e) { setError(errText(e)) } finally { setSaving(null) }
  }

  if (!data || !view) return error ? <p className="m-0 text-[13.5px] text-trs-neg" role="alert">{error}</p> : <Spinner label="Loading mail…" />

  return (
    <section aria-label="Mail" className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <Segmented<MailRelevance> value={relevance} onChange={v => { setRelevance(v); setLimit(MAIL_PAGE) }} label="Relevance" options={[
          { value: 'all', label: 'All', count: view.counts.all },
          ...RELEVANCE.map(r => ({ value: r as MailRelevance, label: RELEVANCE_NAME[r], count: view.counts[r] })),
        ]} />
        <select className={selectCls} aria-label="Label" value={label} onChange={e => { setLabel(e.target.value as Label | 'all'); setLimit(MAIL_PAGE) }}>
          <option value="all">Label: all</option>
          {LABELS.map(l => <option key={l} value={l}>{LABEL_NAME[l]}</option>)}
        </select>
      </div>
      {error && <p className="m-0 text-[13.5px] text-trs-neg" role="alert">{error}</p>}
      {view.total === 0 ? <Empty>No threads in this view.</Empty> : (
        <div className="overflow-x-auto rounded-[10px] border border-trs-line bg-white">
          <table className="trs-table" style={{ minWidth: 980 }}>
            <thead><tr><th>Thread</th><th>Company</th><th>Label</th><th>Set by</th><th>Last message</th><th>Case</th></tr></thead>
            <tbody>
              {view.threads.map(t => (
                <tr key={t.id}>
                  <td className="px-3 max-w-[340px]"><Link href={`/engagement?thread=${t.id}`} className="block truncate text-trs-ink no-underline hover:underline" title={t.subject ?? undefined}>{t.subject || 'No subject'}</Link></td>
                  <td className="cell-left px-3 max-w-[200px]">{t.company ? <Link href={`/companies/${t.company.id}`} className="block truncate text-trs-ink no-underline hover:underline">{t.company.name ?? 'Company'}</Link> : <span className="text-trs-muted">Unfiled</span>}</td>
                  <td className="px-2">
                    <select className={selectCls} aria-label={`Label for ${t.subject || 'No subject'}`} value={t.label} disabled={saving === t.id} onChange={e => void relabel(t, e.target.value as Label)}>
                      {LABELS.map(l => <option key={l} value={l}>{LABEL_NAME[l]}</option>)}
                    </select>
                  </td>
                  <td className="cell-left px-3 max-w-[220px]"><span className="block truncate text-trs-ink-2" title={setByText(t.set_by, data.staff)}>{setByText(t.set_by, data.staff)}</span></td>
                  <td className="px-3 whitespace-nowrap tabular-nums">{fmtDate(t.last_message_at)}</td>
                  <td className="cell-left px-3 max-w-[220px]">{t.case ? <Link href={`/today/${t.case.id}`} className="block truncate text-trs-ink no-underline hover:underline">{t.case.title ?? 'Open case'}</Link> : <span className="text-trs-muted">{DASH}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view.total > view.threads.length && (
        <div className="flex items-center gap-3">
          <Btn onClick={() => setLimit(n => n + MAIL_PAGE)}>Show {Math.min(MAIL_PAGE, view.total - view.threads.length)} more</Btn>
          <span className="text-[12.5px] tabular-nums text-trs-muted">{view.threads.length.toLocaleString('en-SG')} of {view.total.toLocaleString('en-SG')}</span>
        </div>
      )}
    </section>
  )
}
