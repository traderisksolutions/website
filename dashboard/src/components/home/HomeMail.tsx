'use client'

/**
 * Home › Mail: the newest active threads the person may see, one row each, with the company, the
 * label and what the label rests on (the rule's basis, or the person who set it). A row opens the
 * thread in the Inbox. Ticked threads go to the same form as Today › Mail (CombineDialog): the
 * person names the client and each thread's side, and the case opens on its next steps. No model
 * is called. Labels are changed on Today › Mail.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Btn, LinkBtn, Spinner } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { CombineDialog } from '@/components/today/CombineDialog'
import { count } from '@/components/cases/shared'
import { fmtDay } from '@/lib/format'
import { LABEL_NAME } from '@/lib/cases/labels'
import { actorName, type Staff } from '@/lib/cases/names'
import type { MailView, SetBy } from '@/lib/cases/mail'

type Loaded = MailView & { staff: Staff[] }
const PAGE = 15

const sourceText = (s: SetBy, staff: readonly Staff[]) =>
  s.kind === 'person' ? [actorName(s.email, staff), s.at ? fmtDay(s.at) : null].filter(Boolean).join(' · ') : s.basis || 'Rule'

export function HomeMail() {
  const [view, setView] = useState<Loaded | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const [ticked, setTicked] = useState<string[]>([])
  const [combining, setCombining] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Only the newest request may answer.
  const asked = useRef(0)

  const load = useCallback(async () => {
    const n = ++asked.current
    setLoading(true)
    try {
      const next = await callApi<Loaded>(`/api/today/mail?relevance=active&label=all&limit=${limit}`)
      if (n === asked.current) { setView(next); setError(null) }
    } catch (e) {
      if (n === asked.current) setError(errText(e))
    } finally {
      if (n === asked.current) setLoading(false)
    }
  }, [limit])
  useEffect(() => { void load() }, [load])

  return (
    <section aria-label="Mail" className="rounded-[14px] border border-trs-line bg-white min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-5 py-3 border-b border-trs-line">
        <div className="flex items-baseline gap-2">
          <h2 className="m-0 text-[17px] font-medium text-trs-ink">Mail</h2>
          {view && <span className="font-mono text-[12px] text-trs-muted">{view.total.toLocaleString('en-SG')} active</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ticked.length > 0 && <Btn level="tertiary" size="xs" onClick={() => setTicked([])}>Clear</Btn>}
          <Btn size="xs" disabled={ticked.length === 0} onClick={() => setCombining(true)}>{ticked.length ? `Next steps for ${count(ticked.length, 'thread')}` : 'Next steps'}</Btn>
          <LinkBtn size="xs" href="/today?view=mail">All mail</LinkBtn>
        </div>
      </div>
      {error && <p className="m-0 px-4 md:px-5 py-2 text-[13px] text-trs-neg border-b border-trs-line" role="alert">{error}</p>}
      {!view && !error && <div className="px-5 py-4"><Spinner label="Loading mail…" /></div>}
      {view && view.total === 0 && <p className="m-0 px-5 py-4 text-[13.5px] text-trs-muted">No active threads.</p>}
      {view && view.total > 0 && (
        <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <table className="trs-table table-fixed" style={{ minWidth: 720 }}>
            <colgroup><col style={{ width: 40 }} /><col style={{ width: '22%' }} /><col /><col style={{ width: 150 }} /><col style={{ width: '24%' }} /></colgroup>
            <thead><tr><th><span className="sr-only">Pick</span></th><th>Company</th><th>Thread</th><th>Label</th><th>Source</th></tr></thead>
            <tbody>
              {view.threads.map(t => (
                <tr key={t.id} aria-selected={ticked.includes(t.id)}>
                  <td className="px-2"><input type="checkbox" aria-label={`Pick ${t.subject || 'No subject'}`} checked={ticked.includes(t.id)}
                    onChange={e => setTicked(s => (e.target.checked ? [...s, t.id] : s.filter(id => id !== t.id)))} /></td>
                  <td className="cell-left px-3">{t.company ? <Link href={`/companies/${t.company.id}`} className="block truncate text-trs-ink no-underline hover:underline">{t.company.name ?? 'Company'}</Link> : <span className="text-trs-muted">Unfiled</span>}</td>
                  <td className="cell-left px-3"><Link href={`/engagement?thread=${t.id}`} className="block truncate text-trs-ink no-underline hover:underline" title={t.subject ?? undefined}>{t.subject || 'No subject'}</Link></td>
                  <td className="cell-left px-3 whitespace-nowrap">{LABEL_NAME[t.label]}</td>
                  <td className="cell-left px-3"><span className="block truncate text-trs-ink-2" title={sourceText(t.set_by, view.staff)}>{sourceText(t.set_by, view.staff)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view && view.total > view.threads.length && (
        <div className="flex items-center gap-3 px-4 md:px-5 py-2 border-t border-trs-line">
          <button type="button" onClick={() => setLimit(n => n + PAGE)} className="bg-transparent border-0 p-0 text-[13px] text-trs-muted cursor-pointer hover:underline">Show {Math.min(PAGE, view.total - view.threads.length)} more</button>
          <span className="text-[12.5px] tabular-nums text-trs-muted">{view.threads.length.toLocaleString('en-SG')} of {view.total.toLocaleString('en-SG')}</span>
        </div>
      )}
      <CombineDialog threadIds={combining ? ticked : null} onClose={() => setCombining(false)} />
    </section>
  )
}
