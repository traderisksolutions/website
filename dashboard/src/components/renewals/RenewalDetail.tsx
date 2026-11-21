'use client'

/**
 * One renewal (docs/renewals.md, release 2): facts, stage, tasks, close as Renewed (the client's
 * new policy) or Lost (a reason), lines held and not held, links to the client, the policy, its
 * threads and, for Employment Benefits, New quotation. No model is called.
 */
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Btn, Chip, Empty, Field, LinkBtn, Segmented, Spinner } from '@/components/crm/primitives'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import { PageHeader } from '@/components/page-header'
import { callApi, errText } from '@/components/placement/shared'
import { useConfirm } from '@/components/ui/confirm'
import { Input } from '@/components/ui/input'
import { Register, RegisterCell, RegisterEmpty, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import { SelectBox } from '@/components/ui/select-box'
import { fmtDate, money } from '@/lib/format'
import { lineName } from '@/lib/renewals/lines'
import { taskName } from '@/lib/renewals/pipeline'
import { LOSS_NAME, LOSS_REASONS, OPEN_STAGES, STAGE_NAME, isOpenStage, type LossReason, type OpenStage } from '@/lib/renewals/rules'
import type { RenewalDetail as Detail } from '@/lib/renewals/pipeline-store'
import { RiskChips, StageChip, ownerName, plainDays } from './bits'
import { renewalsFetch, callRenewals } from '@/lib/renewals/fetch'

const h2 = 'm-0 mb-3 text-body font-semibold text-trs-ink'
const dt = 'text-small text-trs-muted'
const dd = 'm-0 text-body text-trs-ink'

export function RenewalDetail({ id }: { id: string }) {
  const confirm = useConfirm()
  const [r, setR] = useState<Detail | null>(null)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [close, setClose] = useState<'renewed' | 'lost'>('renewed')
  const [search, setSearch] = useState('')
  const [pick, setPick] = useState<string | null>(null)
  const [reason, setReason] = useState<LossReason | ''>('')
  const [lossNote, setLossNote] = useState('')

  const load = useCallback(() => renewalsFetch(`/api/renewals/${id}`, { cache: 'no-store' }).then(async res => {
    if (res.status === 404) { setMissing(true); return }
    const d = await res.json()
    if (!res.ok) throw new Error(d?.error ?? `Request failed (${res.status}).`)
    setR(d as Detail)
  }).catch(e => setError(errText(e))), [id])
  useEffect(() => { void load() }, [load])

  const policies = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (r?.policies ?? []).filter(p => !q || [p.policy_number, p.insurer, p.class_of_insurance].some(v => (v ?? '').toLowerCase().includes(q)))
  }, [r, search])

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError(null)
    try { await fn(); await load() } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  const setStage = (stage: OpenStage) => run('stage', () => callRenewals('/api/renewals', { method: 'PATCH', body: { id, stage } }))
  const tick = (kind: string, done: boolean) => run(`task${kind}`, () => callRenewals(`/api/renewals/${id}/tasks`, { method: 'POST', body: { kind, done } }))

  async function closeRenewed() {
    const p = r?.policies.find(x => x.id === pick)
    if (!p) return
    if (!(await confirm({ title: 'Close as Renewed?', body: `The new term is ${p.policy_number ?? p.class_of_insurance ?? 'the chosen policy'}${p.end_date ? `, to ${fmtDate(p.end_date)}` : ''}. A closed renewal does not change.`, action: 'Close as Renewed' }))) return
    await run('close', () => callRenewals('/api/renewals', { method: 'PATCH', body: { id, outcome: 'renewed', renewed_policy_id: p.id } }))
  }
  async function closeLost() {
    if (!reason) return
    if (!(await confirm({ title: 'Close as Lost?', body: `Reason: ${LOSS_NAME[reason]}. A closed renewal does not change.`, action: 'Close as Lost', danger: true }))) return
    await run('close', () => callRenewals('/api/renewals', { method: 'PATCH', body: { id, outcome: 'lost', loss_reason: reason, loss_note: lossNote } }))
  }

  if (missing) return <div className="px-4 md:px-8 py-6"><Empty action={<LinkBtn href="/renewals">Pipeline</LinkBtn>}>This renewal is not on the list.</Empty></div>
  if (!r) return <div className="px-4 md:px-8 py-6">{error ? <p className="m-0 text-body text-trs-neg" role="alert">{error}</p> : <Spinner label="Loading the renewal…" />}</div>

  const closed = !!r.outcome
  const renewedTo = r.renewed_policy_id ? r.policies.find(p => p.id === r.renewed_policy_id) : null
  const canClose = close === 'renewed' ? !!pick : !!reason && (reason !== 'other' || !!lossNote.trim())
  return (
    <div className="px-4 md:px-8 py-6 mx-auto w-full min-w-0 max-w-screen-xl flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs current={{ label: r.company ?? 'Renewal', href: `/renewals/${r.id}` }} fallback={{ label: 'Renewals', href: '/renewals' }} />
        <PageHeader title={r.company ?? 'Renewal'}
          meta={`${r.line ?? 'No line'} · ${r.insurer ?? 'No insurer'} · expires ${fmtDate(r.expiry_date)}${closed ? '' : ` · ${plainDays(r.days)}`}`}
          actions={<>
            {r.company_id && <LinkBtn href={`/companies/${r.company_id}`}>Client</LinkBtn>}
            <LinkBtn href={`/policies/${r.policy_id}`}>Policy</LinkBtn>
            {r.company_id && <LinkBtn href={`/companies/${r.company_id}?tab=threads`}>Threads</LinkBtn>}
            {r.line_code === 'eb' && r.company_id && <LinkBtn href={`/eb?company=${r.company_id}`}>New quotation</LinkBtn>}
          </>}>
          <span className="inline-flex flex-wrap gap-1"><StageChip stage={r.stage} /><RiskChips risk={r.risk} /></span>
        </PageHeader>
      </div>
      {error && <p className="m-0 text-body text-trs-neg" role="alert">{error}</p>}

      <section aria-labelledby="ren-facts">
        <h2 id="ren-facts" className={h2}>Facts</h2>
        <dl className="m-0 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          {([
            ['Policy', r.policy_number ?? '—', r.class_of_insurance],
            ['Insurer', r.insurer ?? '—', null],
            ['Expiry', fmtDate(r.expiry_date), r.start_date ? `from ${fmtDate(r.start_date)}` : null],
            ['Line', r.line ?? '—', null],
            ['Expiring premium', money(r.premium, { ccy: r.currency }), null],
            ['Expiring commission', money(r.commission, { ccy: r.currency }), null],
            ['Lowest quote this term', r.quoted == null ? '—' : money(r.quoted, { ccy: r.currency }), null],
            ['Owner', ownerName(r.owner), r.owner],
            ['Last client email', r.lastContact ? fmtDate(r.lastContact) : closed ? '—' : 'None in 30 days', null],
            ['Opened', fmtDate(r.opens_on), null],
          ] as [string, string, string | null][]).map(([k, v, sub]) => (
            <div key={k} className="min-w-0">
              <dt className={dt}>{k}</dt>
              <dd className={dd}>{v}</dd>
              {sub && <dd className="m-0 text-small text-trs-muted truncate">{sub}</dd>}
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="ren-stage">
        <h2 id="ren-stage" className={h2}>Stage</h2>
        {closed ? (
          <div className="flex flex-col gap-1 text-body text-trs-ink">
            <span><StageChip stage={r.stage} /></span>
            {r.outcome === 'renewed' && <span>New term: {renewedTo ? <Link href={`/policies/${renewedTo.id}`}>{renewedTo.policy_number ?? renewedTo.class_of_insurance ?? 'policy'}</Link> : r.renewed_policy_id ? <Link href={`/policies/${r.renewed_policy_id}`}>policy</Link> : '—'}</span>}
            {r.outcome === 'lost' && <span>Reason: {r.loss_reason ? LOSS_NAME[r.loss_reason as LossReason] ?? r.loss_reason : '—'}{r.loss_note ? ` · ${r.loss_note}` : ''}</span>}
          </div>
        ) : (
          <Segmented<OpenStage> label="Stage" value={isOpenStage(r.stage) ? r.stage : 'open'} onChange={s => void setStage(s)}
            options={OPEN_STAGES.map(s => ({ value: s, label: STAGE_NAME[s] }))} />
        )}
      </section>

      <section aria-labelledby="ren-tasks">
        <h2 id="ren-tasks" className={h2}>Tasks</h2>
        <Register label="Tasks" minWidth={520}>
          <RegisterHead>
            <RegisterTh first>Task</RegisterTh>
            <RegisterTh>Due</RegisterTh>
            <RegisterTh last>Done</RegisterTh>
          </RegisterHead>
          <tbody>
            {r.tasks.length === 0 && <RegisterEmpty colSpan={3}>No tasks on this renewal.</RegisterEmpty>}
            {r.tasks.map(t => (
              <RegisterRow key={t.kind}>
                <RegisterCell first primary={taskName(t.kind)} />
                <RegisterCell><span className="inline-flex items-center gap-1.5">{fmtDate(t.due_on)}{t.overdue && <Chip tone="red">Overdue</Chip>}</span></RegisterCell>
                <RegisterCell last>
                  {t.done_at
                    ? <span className="inline-flex items-center gap-1.5"><Chip tone="green">Done {fmtDate(t.done_at)}</Chip>{!closed && <Btn size="xs" level="tertiary" loading={busy === `task${t.kind}`} disabled={!!busy} onClick={() => void tick(t.kind, false)}>Undo</Btn>}</span>
                    : closed ? '—' : <Btn size="xs" loading={busy === `task${t.kind}`} disabled={!!busy} onClick={() => void tick(t.kind, true)}>Mark done</Btn>}
                </RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      </section>

      {!closed && (
        <section aria-labelledby="ren-close" className="flex flex-col gap-3">
          <h2 id="ren-close" className={h2}>Close</h2>
          <Segmented<'renewed' | 'lost'> label="Close as" value={close} onChange={setClose} options={[{ value: 'renewed', label: 'Renewed' }, { value: 'lost', label: 'Lost' }]} />
          {close === 'renewed' ? (
            <>
              <div className="max-w-sm"><Field label="New policy"><Input aria-label="Search the client's policies" placeholder="Policy number, insurer or class" value={search} onChange={e => setSearch(e.target.value)} /></Field></div>
              <Register label="Client policies" minWidth={720} maxHeight="22rem">
                <RegisterHead>
                  <RegisterTh first>Policy</RegisterTh>
                  <RegisterTh>Insurer</RegisterTh>
                  <RegisterTh>Start</RegisterTh>
                  <RegisterTh last>End</RegisterTh>
                </RegisterHead>
                <tbody>
                  {policies.length === 0 && <RegisterEmpty colSpan={4}>{r.policies.length ? 'No policy matches.' : 'The client has no other policy on the register. Add the new term to Policies first.'}</RegisterEmpty>}
                  {policies.map(p => (
                    <RegisterRow key={p.id} selected={pick === p.id} onClick={() => setPick(p.id)}>
                      <RegisterCell first selected={pick === p.id} primary={p.policy_number ?? '—'} secondary={p.class_of_insurance ?? undefined} />
                      <RegisterCell primary={p.insurer ?? '—'} />
                      <RegisterCell primary={fmtDate(p.start_date)} />
                      <RegisterCell last primary={fmtDate(p.end_date)} />
                    </RegisterRow>
                  ))}
                </tbody>
              </Register>
              <div><Btn level="primary" disabled={!canClose || !!busy} loading={busy === 'close'} onClick={() => void closeRenewed()}>Close as Renewed</Btn></div>
            </>
          ) : (
            <div className="flex flex-col gap-3 max-w-md">
              <Field label="Reason">
                <SelectBox size="md" label="Reason" value={reason} onChange={v => setReason(v as LossReason | '')}
                  options={[{ value: '', label: 'Choose a reason' }, ...LOSS_REASONS.map(x => ({ value: x, label: LOSS_NAME[x] }))]} />
              </Field>
              <Field label={reason === 'other' ? 'Note (required for Other)' : 'Note'}>
                <Input maxLength={500} value={lossNote} onChange={e => setLossNote(e.target.value)} />
              </Field>
              <div><Btn level="primary" disabled={!canClose || !!busy} loading={busy === 'close'} onClick={() => void closeLost()}>Close as Lost</Btn></div>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="ren-lines" className="flex flex-col gap-4">
        <h2 id="ren-lines" className="m-0 text-body font-semibold text-trs-ink">Lines held · {r.held.length}</h2>
        {r.held.length ? <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">{r.held.map(c => <li key={c}><Chip tone="green">{lineName(c)}</Chip></li>)}</ul> : <p className="m-0 text-body text-trs-muted">None live.</p>}
        <h2 className="m-0 text-body font-semibold text-trs-ink">Lines not held · {r.missing.length}</h2>
        <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">{r.missing.map(c => <li key={c}><Chip>{lineName(c)}</Chip></li>)}</ul>
      </section>
    </div>
  )
}
