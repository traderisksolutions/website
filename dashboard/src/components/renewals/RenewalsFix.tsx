'use client'

/**
 * Renewals › To fix (docs/renewals.md): what a renewal needs before it can open with the right
 * date, line and premium. Three tables: policies without an end date (a suggested date a person
 * sets or confirms), spellings to map to a line, policies with no placing debit note. Nothing is
 * written without a person's confirmation. No model is called.
 */
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Btn, Chip, Empty, Spinner, inputCls } from '@/components/crm/primitives'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import { PageHeader } from '@/components/page-header'
import { callApi, errText, selectCls } from '@/components/placement/shared'
import { useConfirm } from '@/components/ui/confirm'
import { Register, RegisterCell, RegisterEmpty, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import { fmtDate } from '@/lib/format'
import { LINES, lineName, type LineCode } from '@/lib/renewals/lines'
import type { EndDateFix, FixView, LineFix } from '@/lib/renewals/store'
import { callRenewals } from '@/lib/renewals/fetch'

const h2 = 'm-0 text-body font-medium text-trs-ink'

function ClientCell({ id, name }: { id: string | null; name: string | null }) {
  return <RegisterCell first primary={id ? <Link href={`/companies/${id}`} className="text-trs-ink no-underline hover:underline">{name ?? 'Client'}</Link> : (name ?? '—')} />
}
/** A cell whose text is cut at a fixed width, the whole text on hover, so a long class or insurer cannot widen the table. */
const Clip = ({ text, sub }: { text: string | null; sub?: string | null }) => (
  <RegisterCell title={[text, sub].filter(Boolean).join(' · ')}>
    <span className="block max-w-48 truncate text-trs-ink">{text ?? '—'}</span>
    {sub && <span className="block max-w-48 truncate text-small text-trs-muted">{sub}</span>}
  </RegisterCell>
)
const PolicyCell = ({ number, cls }: { number: string | null; cls: string | null }) => <Clip text={number ?? '—'} sub={cls} />

export function RenewalsFix() {
  const confirm = useConfirm()
  const [view, setView] = useState<FixView | null>(null)
  const [dates, setDates] = useState<Record<string, string>>({})
  const [lines, setLines] = useState<Record<string, LineCode>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => callRenewals<FixView>('/api/renewals/fix').then(v => {
    setView(v)
    setDates(Object.fromEntries(v.endDates.map(r => [r.policy_id, r.suggested ?? ''])))
    setLines(Object.fromEntries(v.lines.map(r => [r.key, r.suggested])))
  }).catch(e => setError(errText(e))), [])
  useEffect(() => { void load() }, [load])

  async function saveDates(items: { policy_id: string; end_date: string }[], key: string) {
    setBusy(key); setError(null); setNote(null)
    try {
      const d = await callRenewals<{ written: number }>('/api/renewals/fix', { method: 'POST', body: { action: 'end_dates', items } })
      setNote(`${d.written} end ${d.written === 1 ? 'date' : 'dates'} written.`)
      await load()
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  async function saveLines(items: { spelling: string; line_code: LineCode }[], key: string) {
    setBusy(key); setError(null); setNote(null)
    try {
      const d = await callRenewals<{ tables: boolean; spellings: number; policies: number }>('/api/renewals/fix', { method: 'POST', body: { action: 'lines', items } })
      setNote(d.tables ? `${d.spellings} ${d.spellings === 1 ? 'spelling' : 'spellings'} confirmed · ${d.policies} ${d.policies === 1 ? 'policy' : 'policies'} updated.` : 'Lines can be confirmed once renewal records are set up.')
      await load()
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }

  async function confirmAllDates(rows: EndDateFix[]) {
    const items = rows.filter(r => r.suggested).map(r => ({ policy_id: r.policy_id, end_date: r.suggested! }))
    if (!items.length) return
    if (!(await confirm({ title: `Write ${items.length} suggested end ${items.length === 1 ? 'date' : 'dates'}?`, body: 'Each policy without an end date gets its suggested date. Dates already set stay as they are.', action: 'Write dates' }))) return
    await saveDates(items, 'all-dates')
  }
  async function confirmAllLines(rows: LineFix[]) {
    if (!rows.length) return
    const n = rows.reduce((s, r) => s + r.policies, 0)
    if (!(await confirm({ title: `Confirm ${rows.length} suggested ${rows.length === 1 ? 'line' : 'lines'}?`, body: `${n} ${n === 1 ? 'policy gets' : 'policies get'} the line shown. Policies with a line already stay as they are.`, action: 'Confirm lines' }))) return
    await saveLines(rows.map(r => ({ spelling: r.spelling, line_code: lines[r.key] ?? r.suggested })), 'all-lines')
  }

  const suggestedCount = view?.endDates.filter(r => r.suggested).length ?? 0
  return (
    <div className="px-4 md:px-8 py-6 mx-auto w-full min-w-0 max-w-[1280px]">
      <Breadcrumbs className="mb-3" current={{ label: 'To fix', href: '/renewals/fix' }} fallback={{ label: 'Renewals', href: '/renewals' }} />
      <PageHeader className="mb-6" title="To fix"
        meta={view ? `${view.endDates.length} without an end date · ${view.lines.length} spellings to map · ${view.noNote.length} without a placing debit note` : undefined} />

      {note && <p className="m-0 mb-3 text-body text-trs-ink" role="status">{note}</p>}
      {error && <p className="m-0 mb-3 text-body text-trs-neg" role="alert">{error}</p>}
      {!view ? (error ? null : <Spinner label="Loading what needs fixing…" />) : (
        <div className="flex flex-col gap-10 min-w-0">
          <section className="flex flex-col gap-3 min-w-0" aria-labelledby="fix-dates">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="fix-dates" className={h2}>Policies without an end date · {view.endDates.length}</h2>
              <Btn size="xs" disabled={!suggestedCount || !!busy} loading={busy === 'all-dates'} onClick={() => void confirmAllDates(view.endDates)}>Confirm all suggested</Btn>
            </div>
            <Register label="Policies without an end date" minWidth={1100}>
              <RegisterHead>
                <RegisterTh first>Client</RegisterTh>
                <RegisterTh>Policy</RegisterTh>
                <RegisterTh>Insurer</RegisterTh>
                <RegisterTh>Start date</RegisterTh>
                <RegisterTh>Last debit note</RegisterTh>
                <RegisterTh>End date</RegisterTh>
                <RegisterTh last>Action</RegisterTh>
              </RegisterHead>
              <tbody>
                {view.endDates.length === 0 && <RegisterEmpty colSpan={7}>Every live policy has an end date.</RegisterEmpty>}
                {view.endDates.map(r => {
                  const value = dates[r.policy_id] ?? ''
                  return (
                    <RegisterRow key={r.policy_id}>
                      <ClientCell id={r.company_id} name={r.company} />
                      <PolicyCell number={r.policy_number} cls={r.class_of_insurance} />
                      <Clip text={r.insurer} />
                      <RegisterCell primary={fmtDate(r.start_date)} />
                      <RegisterCell primary={fmtDate(r.last_note_on)} />
                      <RegisterCell>
                        <div className="flex items-center justify-center gap-2">
                          <input type="date" aria-label={`End date for ${r.company ?? 'this policy'}`} className={`${inputCls} h-8 w-36`} value={value}
                            onChange={e => setDates(d => ({ ...d, [r.policy_id]: e.target.value }))} />
                          {r.suggested && value === r.suggested && <Chip>Suggested</Chip>}
                        </div>
                      </RegisterCell>
                      <RegisterCell last>
                        <Btn size="xs" disabled={!value || !!busy} loading={busy === r.policy_id} onClick={() => void saveDates([{ policy_id: r.policy_id, end_date: value }], r.policy_id)}>Confirm</Btn>
                      </RegisterCell>
                    </RegisterRow>
                  )
                })}
              </tbody>
            </Register>
          </section>

          <section className="flex flex-col gap-3 min-w-0" aria-labelledby="fix-lines">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="fix-lines" className={h2}>Lines to map · {view.lines.length}</h2>
              <Btn size="xs" disabled={!view.tables || !view.lines.length || !!busy} loading={busy === 'all-lines'} onClick={() => void confirmAllLines(view.lines)}>Confirm all suggested</Btn>
            </div>
            {!view.tables && <p className="m-0 text-body text-trs-muted">Lines can be confirmed once renewal records are set up.</p>}
            <Register label="Lines to map" minWidth={760}>
              <RegisterHead>
                <RegisterTh first>Spelling</RegisterTh>
                <RegisterTh>Policies</RegisterTh>
                <RegisterTh>Line</RegisterTh>
                <RegisterTh last>Action</RegisterTh>
              </RegisterHead>
              <tbody>
                {view.lines.length === 0 && <RegisterEmpty colSpan={4}>Every spelling is mapped to a line.</RegisterEmpty>}
                {view.lines.map(r => {
                  const value = lines[r.key] ?? r.suggested
                  return (
                    <RegisterRow key={r.key}>
                      <RegisterCell first identityWidth={360} primary={r.spelling} />
                      <RegisterCell primary={r.policies} />
                      <RegisterCell>
                        <div className="flex items-center justify-center gap-2">
                          <select aria-label={`Line for ${r.spelling}`} className={`${selectCls} h-8 w-56`} value={value}
                            onChange={e => setLines(l => ({ ...l, [r.key]: e.target.value as LineCode }))}>
                            {LINES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                          </select>
                          {value === r.suggested && <Chip>Suggested</Chip>}
                        </div>
                      </RegisterCell>
                      <RegisterCell last>
                        <Btn size="xs" disabled={!view.tables || !!busy} loading={busy === r.key} title={`Map to ${lineName(value)}`}
                          onClick={() => void saveLines([{ spelling: r.spelling, line_code: value }], r.key)}>Confirm</Btn>
                      </RegisterCell>
                    </RegisterRow>
                  )
                })}
              </tbody>
            </Register>
          </section>

          <section className="flex flex-col gap-3 min-w-0" aria-labelledby="fix-notes">
            <h2 id="fix-notes" className={h2}>Policies with no placing debit note · {view.noNote.length}</h2>
            {view.noNote.length === 0 ? <Empty compact>Every live policy has a placing debit note.</Empty> : (
              <Register label="Policies with no placing debit note" minWidth={900}>
                <RegisterHead>
                  <RegisterTh first>Client</RegisterTh>
                  <RegisterTh>Policy</RegisterTh>
                  <RegisterTh>Insurer</RegisterTh>
                  <RegisterTh>Ends</RegisterTh>
                  <RegisterTh last>Action</RegisterTh>
                </RegisterHead>
                <tbody>
                  {view.noNote.map(r => (
                    <RegisterRow key={r.policy_id}>
                      <ClientCell id={r.company_id} name={r.company} />
                      <PolicyCell number={r.policy_number} cls={r.class_of_insurance} />
                      <Clip text={r.insurer} />
                      <RegisterCell primary={fmtDate(r.end_date)} />
                      <RegisterCell last><Link href={`/policies/${r.policy_id}`} className="text-trs-green no-underline hover:underline">Open policy</Link></RegisterCell>
                    </RegisterRow>
                  ))}
                </tbody>
              </Register>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
