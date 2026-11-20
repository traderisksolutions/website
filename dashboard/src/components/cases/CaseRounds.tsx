'use client'

/**
 * Case rounds: who is owed what next, read from the case's emails by rule (no model reads here).
 * Next steps lists the emails not yet passed on, each with the button that drafts it from its
 * template, and Run, which drafts every one of them; the drafts land on Overview, where a person
 * edits and sends them. Under it, one round
 * at a time: each insurer's chain (asked, replied, sent to client), then every email as one move.
 * Type is the rule's reading of an email; a person's choice there replaces it for that email.
 * Words from a colleague's mailbox are withheld.
 */
import { useCallback, useEffect, useState } from 'react'
import { Btn, Chip, Empty, Segmented, Spinner } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { selectCls } from '@/components/cases/shared'
import { DASH, fmtDay, fmtDayTime } from '@/lib/format'
import type { StageTone } from '@/lib/crm/types'
import type { ChainState, RoundMove, Step, Writer } from '@/lib/cases/rounds'
import type { CaseRoundsView } from '@/lib/cases/rounds-store'
import type { StepDrafted, StepsRun } from '@/lib/cases/rounds-draft'
import { count, headingCls, subjectBtn } from './shared'
import { Register } from '@/components/ui/register'

const STATE_TONE: Record<ChainState, StageTone> = { to_ask: 'amber', asked: 'neutral', heard: 'neutral', replied: 'amber', sent: 'green', declined: 'red' }
const OUTSIDE: Writer[] = ['client', 'insurer']
/** Rounds shown as tabs; a case with more gets a list. */
const TABS_MAX = 5
const dense = (text: string) => text.replace(/\n\s*\n+/g, '\n').trim()

export function CaseRounds({ id, onOpenThread, onOpenDraft, onChanged, onNotice, onError }: {
  id: string
  onOpenThread: (threadId: string) => void
  /** To the unsent emails on Overview. */
  onOpenDraft: () => void
  /** A step was drafted or an email's type was set. */
  onChanged: () => void
  onNotice: (message: string) => void
  onError: (message: string | null) => void
}) {
  const [view, setView] = useState<CaseRoundsView | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [round, setRound] = useState<number | null>(null)

  const load = useCallback(() => callApi<CaseRoundsView>(`/api/work/${id}/rounds`), [id])
  useEffect(() => {
    setView(null); setFailed(null); setRound(null)
    load().then(setView).catch(e => setFailed(errText(e)))
  }, [load])

  if (failed) return <p className="m-0 text-13.5 text-trs-neg" role="alert">{failed}</p>
  if (!view) return <Spinner label="Loading rounds…" />

  async function draft(s: Step) {
    setBusy(s.id); onError(null)
    try {
      const d = await callApi<CaseRoundsView & { made: StepDrafted }>(`/api/work/${id}/rounds`, { method: 'POST', body: { action: 'draft', step: s.id } })
      setView(d)
      onNotice(d.made.existing ? 'This step already has a draft. It is on Overview.' : `Draft to ${d.made.to} written. It is on Overview.`)
      onChanged()
    } catch (e) { onError(errText(e)) } finally { setBusy(null) }
  }
  async function run() {
    setBusy('run'); onError(null)
    try {
      const d = await callApi<CaseRoundsView & { ran: StepsRun }>(`/api/work/${id}/rounds`, { method: 'POST', body: { action: 'run' } })
      setView(d)
      const { made, existing, skipped } = d.ran
      if (made || existing) onNotice([made ? `${count(made, 'draft')} written` : null, existing ? `${existing} already drafted` : null].filter(Boolean).join(', ') + '. On Overview.')
      if (skipped.length) onError(skipped.map(s => `${s.step}: ${s.reason}`).join(' '))
      if (made) onChanged()
    } catch (e) { onError(errText(e)) } finally { setBusy(null) }
  }
  async function call(m: RoundMove, value: string) {
    const [by, move] = value === 'rule' ? [null, null] : value.split(':')
    setBusy(m.message_id); onError(null)
    try {
      setView(await callApi<CaseRoundsView>(`/api/work/${id}/rounds`, { method: 'POST', body: { action: 'move', message_id: m.message_id, by, move } }))
      onNotice(by ? 'Email type set.' : 'Email handed back to the rule.')
      onChanged()
    } catch (e) { onError(errText(e)) } finally { setBusy(null) }
  }

  const { rounds, steps, names } = view
  const moves = rounds.reduce((n, r) => n + r.moves.length, 0)
  if (moves === 0) return <Empty>No emails on the case. Add its threads under Sources.</Empty>

  const shown = rounds.find(r => r.n === round) ?? rounds[rounds.length - 1]
  const toDraft = steps.filter(s => s.act === 'draft' && !view.drafted[s.id]).length
  const options = [...rounds].reverse().map(r => ({ value: String(r.n), label: `Round ${r.n}`, count: r.moves.length }))
  const action = (s: Step) => {
    if (s.act === 'draft' && view.drafted[s.id]) return <Btn size="xs" onClick={onOpenDraft}>Open draft</Btn>
    if (s.act === 'draft') return <Btn size="xs" disabled={busy !== null || !!view.item.closed_at} loading={busy === s.id} onClick={() => void draft(s)}>Draft</Btn>
    return s.thread_id ? <Btn size="xs" onClick={() => onOpenThread(s.thread_id!)}>Open thread</Btn> : null
  }
  const type = (m: RoundMove) => {
    if (m.private) return <span className="text-trs-muted">{names.move[m.move]}</span>
    const writers = m.by === 'trs' ? (['trs'] as Writer[]) : OUTSIDE
    return (
      <select className={`${selectCls} w-full`} aria-label="Email type" value={`${m.by}:${m.move}`} disabled={busy !== null} onChange={e => void call(m, e.target.value)}>
        {writers.map(w => (
          <optgroup key={w} label={names.writer[w]}>
            {view.moves[w].map(o => <option key={o.move} value={`${w}:${o.move}`}>{o.name}</option>)}
          </optgroup>
        ))}
        {m.set_by === 'person' && <option value="rule">Rule: {names.move[m.rule]}</option>}
      </select>
    )
  }

  return (
    <section aria-label="Rounds" className="flex flex-col gap-5 min-w-0">
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <h2 className={headingCls}>Next steps · {steps.length}</h2>
          <Btn level="primary" disabled={busy !== null || toDraft === 0 || !!view.item.closed_at} loading={busy === 'run'} onClick={() => void run()}>{toDraft ? `Run · ${count(toDraft, 'draft')}` : 'Run'}</Btn>
        </div>
        {steps.length === 0 ? <Empty compact>Nothing is waiting to be passed on.</Empty> : (
          <Register label="Next steps" minWidth={680} dense={false} className="[&_table]:table-fixed">
              <colgroup><col /><col className="w-[120px]" /><col className="w-[132px]" /><col className="w-[124px]" /></colgroup>
              <thead><tr><th>Step</th><th>Since</th><th>Drafted by</th><th><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {steps.map(s => (
                  <tr key={s.id} className="align-top">
                    <td className="cell-left px-3 py-2 text-13 leading-[1.5] break-words">{s.text}{s.count > 1 ? ` · ${count(s.count, 'email')}` : ''}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDay(s.since)}</td>
                    <td className="cell-left px-3 py-2 whitespace-nowrap">{s.agent ?? <span className="text-trs-muted">{DASH}</span>}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{action(s)}</td>
                  </tr>
                ))}
              </tbody>
            </Register>
        )}
      </div>

      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <h2 className={headingCls}>Round {shown.n} of {rounds.length}{shown.opened_at ? ` · opened ${fmtDay(shown.opened_at)}` : ''}{view.referral ? ` · through ${view.referral}` : ''}</h2>
          {rounds.length > TABS_MAX
            ? <select className={selectCls} aria-label="Round" value={String(shown.n)} onChange={e => setRound(Number(e.target.value))}>{options.map(o => <option key={o.value} value={o.value}>{o.label} · {count(o.count, 'email')}</option>)}</select>
            : rounds.length > 1 && <Segmented<string> value={String(shown.n)} onChange={v => setRound(Number(v))} label="Round" options={options} />}
        </div>
        {shown.chains.length > 0 && (
          <Register label={`Round ${shown.n} insurers`} minWidth={680} dense={false} className="[&_table]:table-fixed">
              <colgroup><col /><col className="w-[120px]" /><col className="w-[170px]" /><col className="w-[130px]" /><col className="w-[150px]" /></colgroup>
              <thead><tr><th>Insurer</th><th>Asked</th><th>Replied</th><th>Sent to client</th><th>State</th></tr></thead>
              <tbody>
                {shown.chains.map(c => (
                  <tr key={c.insurer}>
                    <td className="cell-left px-3 py-2">{c.thread_id ? <button type="button" className={subjectBtn} title="Open the email thread" onClick={() => onOpenThread(c.thread_id!)}>{c.insurer}</button> : c.insurer}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDay(c.asked_at)}</td>
                    <td className="cell-left px-3 py-2 whitespace-nowrap tabular-nums">{c.replied ? `${names.move[c.replied]} · ${fmtDay(c.replied_at)}` : DASH}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDay(c.sent_at)}</td>
                    <td className="cell-left px-3 py-2"><Chip tone={STATE_TONE[c.state]}>{names.state[c.state]}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </Register>
        )}
        {shown.moves.length === 0 ? <Empty compact>No emails in this round.</Empty> : (
          <Register label={`Round ${shown.n} emails`} minWidth={900} dense={false} className="[&_table]:table-fixed">
              <colgroup><col className="w-[108px]" /><col className="w-[170px]" /><col className="w-[130px]" /><col className="w-[168px]" /><col /><col className="w-[15%]" /></colgroup>
              <thead><tr><th>Date</th><th>From</th><th>Insurer</th><th>Type</th><th>Message</th><th>Files</th></tr></thead>
              <tbody>
                {shown.moves.map(m => (
                  <tr key={m.message_id} className="align-top">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDayTime(m.at)}</td>
                    <td className="cell-left px-3 py-2">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-13 text-trs-ink [overflow-wrap:anywhere]">{m.name}</span>
                        {m.via && <Chip tone="blue">{m.via === 'referral' ? 'Referral' : `via ${m.via}`}</Chip>}
                      </span>
                    </td>
                    <td className="cell-left px-3 py-2 text-13 [overflow-wrap:anywhere]">{m.insurer ?? <span className="text-trs-muted">{DASH}</span>}</td>
                    <td className="px-2 py-1.5">{type(m)}</td>
                    <td className="cell-left px-3 py-2">
                      {m.private ? <span className="text-13 text-trs-muted">In a colleague&apos;s mailbox</span> : (
                        <button type="button" onClick={() => onOpenThread(m.thread_id)} title="Open the email thread"
                          className="block w-full bg-transparent border-0 p-0 cursor-pointer text-left text-13 leading-[1.5] text-trs-ink whitespace-pre-line break-words">
                          {dense(m.text) || <span className="text-trs-muted">No text</span>}
                        </button>
                      )}
                    </td>
                    <td className="cell-left px-3 py-2 text-13 leading-[1.5] [overflow-wrap:anywhere]">{m.files.length ? m.files.map((f, i) => <span key={i} className="block">{f}</span>) : <span className="text-trs-muted">{DASH}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </Register>
        )}
      </div>
    </section>
  )
}
