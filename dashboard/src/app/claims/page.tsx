'use client'

/**
 * Claims: the register of every claim TRS handles, every class, newest mail first; one claim's
 * detail below it. The claims agent keeps each row current from the mail; drafts are approved
 * here or on /work through the same /api/work route. Website claim forms sit under their own
 * segment.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Btn, Chip, LinkBtn, Segmented, Spinner, Empty, inputCls, textareaCls } from '@/components/crm/primitives'
import { callApi, errText, INK, MUTED, ERROR } from '@/components/placement/shared'
import type { ClaimDetail } from '@/lib/admin/b/register'
import { bucketOf as bucket, type RegisterRow, type Bucket } from '@/lib/admin/b/register-view'
import { WebsiteForms } from './website-forms'

type View = Bucket | 'forms'
type Who = 'mine' | 'all'
type Tone = 'neutral' | 'blue' | 'amber' | 'green' | 'red'

const CLASS: Record<string, string> = { wica: 'WICA', ghs: 'GHS', gpa: 'GPA', motor: 'Motor', property: 'Property', liability: 'Liability', marine: 'Marine', travel: 'Travel', other: 'Other' }
const STAGE: Record<string, { label: string; tone: Tone }> = {
  notified: { label: 'Notified', tone: 'amber' }, documents_pending: { label: 'Documents pending', tone: 'amber' },
  with_insurer: { label: 'With insurer', tone: 'blue' }, adjuster: { label: 'With adjuster', tone: 'blue' },
  offer: { label: 'Offer', tone: 'blue' }, settled: { label: 'Settled', tone: 'green' }, declined: { label: 'Declined', tone: 'red' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
}
const ITEM_STATUS: Record<string, { label: string; tone: Tone }> = {
  trs_to_act: { label: 'TRS to act', tone: 'amber' }, stalled: { label: 'Stalled', tone: 'red' },
  waiting_client: { label: 'Waiting on client', tone: 'neutral' }, waiting_insurer: { label: 'With insurer', tone: 'blue' }, done: { label: 'Closed', tone: 'green' },
}
const WAITING: Record<string, string> = { trs: 'TRS', client: 'Client', insurer: 'Insurer', adjuster: 'Adjuster', third_party: 'Third party' }
const SIDE: Record<string, string> = { client: 'Client', trs: 'TRS', insurer: 'Insurer', internal: 'Internal', other: 'Other' }
const JOINED: Record<string, string> = {
  policy_number: 'Policy number in subject', claim_ref: 'Insurer claim reference', forward: 'Recovered from forward', midway: 'Opened midway',
  thread: 'Same thread', reply: 'Same thread', subject: 'Subject match', people: 'Same people and dates', manual: 'Added by staff', case_worker: 'Case worker',
}

const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' }) : '—'
const money = (n: number | null) => n == null ? '—' : n.toLocaleString('en-SG', { maximumFractionDigits: 2 })
const statusOf = (r: RegisterRow) => r.stage && r.stage !== 'notified' ? STAGE[r.stage] : ITEM_STATUS[r.status] ?? STAGE.notified

export default function ClaimsPage() {
  const [rows, setRows] = useState<RegisterRow[] | null>(null)
  const [view, setView] = useState<View>('open')
  const [who, setWho] = useState<Who>('all')
  const [me, setMe] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [formsNew, setFormsNew] = useState<number | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    callApi<{ claims: RegisterRow[] }>('/api/claims/register').then(d => { setRows(d.claims); setError(null) }).catch(e => setError(errText(e)))
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { callApi<{ user?: { email?: string } | null }>('/api/auth/me').then(d => setMe(d.user?.email?.toLowerCase() ?? null)).catch(() => setMe(null)) }, [])
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('claim'); if (id) { setSelected(id); setView('all') } }, [])

  const mine = useMemo(() => (rows ?? []).filter(r => who === 'all' || r.owner_email === me), [rows, who, me])
  const count = (b: Bucket) => b === 'all' ? mine.length : mine.filter(r => bucket(r) === b).length
  const shown = view === 'forms' ? [] : mine.filter(r => view === 'all' || bucket(r) === view)

  function select(id: string) {
    setSelected(id)
    const u = new URL(window.location.href); u.searchParams.set('claim', id); window.history.replaceState(null, '', u.toString())
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  return (
    <div className="w-full min-w-0 px-4 md:px-8 py-6 max-w-[1200px] mx-auto" style={{ color: INK }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="m-0 text-[30px] font-medium tracking-[-0.02em]">Claims</h1>
        <div className="flex flex-wrap gap-2">
          <LinkBtn href="/claims/second-opinion" level="tertiary">Second opinion reports</LinkBtn>
          <Btn level="secondary" onClick={() => setNewOpen(o => !o)}>New claim</Btn>
        </div>
      </div>

      {newOpen && <NewClaim onDone={(id) => { setNewOpen(false); setNotice('Claim opened.'); load(); select(id) }} onCancel={() => setNewOpen(false)} />}

      <div className="flex flex-wrap gap-2 mb-4">
        <Segmented value={view} onChange={setView} options={[
          { value: 'open', label: 'Open', count: count('open') },
          { value: 'settled', label: 'Settled', count: count('settled') },
          { value: 'declined', label: 'Declined', count: count('declined') },
          { value: 'all', label: 'All', count: count('all') },
          { value: 'forms', label: 'Website forms', ...(formsNew ? { count: formsNew } : {}) },
        ]} />
        {view !== 'forms' && <Segmented value={who} onChange={setWho} options={[{ value: 'mine', label: 'Mine' }, { value: 'all', label: 'Everyone' }]} />}
      </div>

      {error && <p className="m-0 mb-3 text-[13.5px]" style={{ color: ERROR }}>{error}</p>}
      {notice && <p className="m-0 mb-3 text-[13.5px]">{notice}</p>}

      {view === 'forms' ? <WebsiteForms onCount={setFormsNew} /> : !rows ? <Spinner label="Loading claims…" /> : shown.length === 0 ? <Empty>No claims here.</Empty> : (
        <>
          <div className="hidden md:block overflow-x-auto rounded-[10px] bg-white" style={{ boxShadow: 'var(--card-shadow)' }}>
            <table className="w-full text-[13.5px] border-collapse">
              <thead>
                <tr className="text-left text-[12px]" style={{ color: MUTED }}>
                  {['Claim', 'Client', 'Class · insurer', 'Loss', 'Status', 'Waiting on', 'Claimed S$', 'Last mail', 'Threads'].map((h, i) => (
                    <th key={h} className={`font-medium px-3 py-2.5 whitespace-nowrap ${i === 6 || i === 8 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(r => {
                  const st = statusOf(r)
                  return (
                    <tr key={r.id} onClick={() => select(r.id)} aria-selected={selected === r.id} className="cursor-pointer border-t border-[#e6e8e4] hover:bg-[#faf9f6]" style={selected === r.id ? { background: '#edf7e8' } : undefined}>
                      <td className="px-3 py-2.5 max-w-[260px]"><span className={selected === r.id ? 'font-medium' : ''}>{r.title}</span>{r.opened_mode === 'midway' || r.opened_mode === 'from_forward' ? <span className="block text-[12px]" style={{ color: MUTED }}>{r.opened_mode === 'midway' ? 'Opened midway' : 'Opened from forward'}</span> : null}</td>
                      <td className="px-3 py-2.5">{r.client ?? '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{CLASS[r.class] ?? r.class}{r.insurer ? ` · ${r.insurer}` : ''}</td>
                      <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{day(r.loss_date)}</td>
                      <td className="px-3 py-2.5"><Chip tone={st.tone}>{st.label}</Chip></td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.waiting_on ? `${WAITING[r.waiting_on] ?? r.waiting_on}${r.waiting_days != null ? ` · ${r.waiting_days} d` : ''}` : '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{money(r.amount_claimed)}</td>
                      <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{day(r.last_mail_at)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.threads}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="md:hidden flex flex-col gap-2">
            {shown.map(r => {
              const st = statusOf(r)
              return (
                <button key={r.id} type="button" onClick={() => select(r.id)} className="text-left rounded-[10px] bg-white px-4 py-3 border-0 cursor-pointer min-w-0 w-full" style={{ boxShadow: selected === r.id ? 'inset 0 0 0 1.5px #132c1c' : 'var(--card-shadow)', color: INK }}>
                  <div className="text-[12.5px] truncate" style={{ color: MUTED }}>{r.client ?? '—'} · {CLASS[r.class] ?? r.class}{r.insurer ? ` · ${r.insurer}` : ''}</div>
                  <div className="text-[15px] font-medium leading-snug">{r.title}</div>
                  <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                    <Chip tone={st.tone}>{st.label}</Chip>
                    {r.waiting_on && <Chip>{WAITING[r.waiting_on] ?? r.waiting_on}{r.waiting_days != null ? ` · ${r.waiting_days} d` : ''}</Chip>}
                    {r.amount_claimed != null && <span className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>S$ {money(r.amount_claimed)}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {view !== 'forms' && selected && (
        <div ref={detailRef} className="mt-5 scroll-mt-20">
          <Detail id={selected} onChanged={(msg) => { setNotice(msg); load() }} onError={setError} />
        </div>
      )}
    </div>
  )
}

function NewClaim({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [insurer, setInsurer] = useState('')
  const [policy, setPolicy] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function save() {
    setBusy(true); setErr(null)
    try { const { id } = await callApi<{ id: string }>('/api/claims/register', { method: 'POST', body: { title, insurer_name: insurer, policy_number: policy } }); onDone(id) }
    catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="rounded-[10px] bg-white p-4 mb-4 flex flex-col gap-3" style={{ boxShadow: 'var(--card-shadow)' }}>
      <h2 className="m-0 text-[16px] font-medium">New claim</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-[12.5px] min-w-0" style={{ color: MUTED }}>Claim<input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Worker hand injury" /></label>
        <label className="text-[12.5px] min-w-0" style={{ color: MUTED }}>Insurer<input className={inputCls} value={insurer} onChange={e => setInsurer(e.target.value)} /></label>
        <label className="text-[12.5px] min-w-0" style={{ color: MUTED }}>Policy number<input className={inputCls} value={policy} onChange={e => setPolicy(e.target.value)} /></label>
      </div>
      {err && <p className="m-0 text-[13.5px]" style={{ color: ERROR }}>{err}</p>}
      <div className="flex justify-between gap-2">
        <Btn level="tertiary" onClick={onCancel} disabled={busy}>Cancel</Btn>
        <Btn level="secondary" onClick={() => void save()} loading={busy} disabled={title.trim().length < 3}>Open claim</Btn>
      </div>
    </div>
  )
}

function Detail({ id, onChanged, onError }: { id: string; onChanged: (msg: string) => void; onError: (msg: string) => void }) {
  const [d, setD] = useState<ClaimDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [outcome, setOutcome] = useState(false)
  const load = useCallback(() => { setErr(null); callApi<ClaimDetail>(`/api/claims/${id}`).then(setD).catch(e => setErr(errText(e))) }, [id])
  useEffect(() => { setD(null); setOutcome(false); load() }, [load])

  if (err) return <p className="m-0 text-[13.5px]" style={{ color: ERROR }}>{err}</p>
  if (!d) return <Spinner label="Loading claim…" />
  const r = d.row
  const st = statusOf(r)
  const got = d.documents.filter(x => x.received).length

  return (
    <section className="rounded-[10px] bg-white p-4 md:p-5 flex flex-col gap-5" style={{ boxShadow: 'var(--card-shadow)' }} aria-label="Claim">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex flex-col gap-2">
          <h2 className="m-0 text-[22px] font-medium tracking-[-0.01em] leading-tight">{r.title}</h2>
          <div className="flex flex-wrap gap-1.5">
            <Chip tone={st.tone}>{st.label}</Chip>
            {r.client && <Chip>{r.client}</Chip>}
            {r.policy_number && <Chip>{r.policy_number}</Chip>}
            {r.insurer && <Chip>{r.insurer}</Chip>}
            {r.insurer_ref && <Chip>Claim ref. {r.insurer_ref}</Chip>}
            {r.loss_date && <Chip>Loss {day(r.loss_date)}</Chip>}
            {r.amount_claimed != null && <Chip>Claimed S$ {money(r.amount_claimed)}</Chip>}
            {r.amount_settled != null && <Chip tone="green">Settled S$ {money(r.amount_settled)}</Chip>}
            {r.opened_mode === 'midway' && <Chip tone="amber">Opened midway</Chip>}
            {r.opened_mode === 'from_forward' && <Chip tone="amber">Opened from forward</Chip>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn level="tertiary" onClick={() => void callApi(`/api/claims/${id}`, { method: 'POST', body: { action: 'refresh' } }).then(() => onChanged('Re-read queued.')).catch(e => onError(errText(e)))}>Re-read</Btn>
          {!r.closed && <Btn level="secondary" onClick={() => setOutcome(o => !o)}>Record outcome</Btn>}
        </div>
      </div>

      {outcome && <Outcome id={id} onDone={() => { setOutcome(false); onChanged('Outcome recorded.'); load() }} />}

      {d.needs_human && (
        <div className="border-l-[3px] pl-3 text-[14px]" style={{ borderColor: 'rgba(161,36,47,0.4)' }}>
          <div className="text-[12px] uppercase tracking-[0.04em]" style={{ color: ERROR }}>Decision needed</div>
          <div>{d.needs_human}</div>
        </div>
      )}
      {d.next_action && <div className="text-[14px]"><span style={{ color: MUTED }}>Next: </span>{d.next_action}</div>}

      <div>
        <h3 className="m-0 mb-2 text-[14px] font-medium">Timeline</h3>
        {d.timeline.length === 0 ? <Empty compact>No mail on this claim.</Empty> : (
          <ol className="m-0 p-0 list-none flex flex-col">
            {d.timeline.map((e, i) => (
              <li key={i} className="grid grid-cols-[64px_72px_1fr] md:grid-cols-[72px_88px_1fr] gap-2 py-1.5 border-t border-[#e6e8e4] text-[13.5px]" style={e.rebuilt ? { color: MUTED } : undefined}>
                <span className="tabular-nums">{day(e.at)}</span>
                <span>{SIDE[e.side] ?? e.side}</span>
                <span className="min-w-0">
                  {e.rebuilt && <Chip tone="amber" className="mr-1.5">{e.rebuilt === 'forward' ? 'From forward' : 'Rebuilt'}</Chip>}
                  <span className="break-words">{e.line || '(no text)'}</span>
                  <span className="block text-[12px] truncate" style={{ color: MUTED }}>{e.from}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[8px] p-3 flex flex-col gap-2" style={{ boxShadow: 'var(--card-shadow)' }}>
          <div className="flex justify-between items-baseline"><h3 className="m-0 text-[14px] font-medium">Documents</h3><span className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>{got} of {d.documents.length}</span></div>
          <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[13.5px]">
            {d.documents.map(x => <li key={x.item} className="flex gap-2"><span aria-hidden style={{ color: x.received ? '#132c1c' : ERROR }}>{x.received ? '✓' : '✕'}</span><span className="min-w-0">{x.item}{x.source && <span className="block text-[12px] truncate" style={{ color: MUTED }}>{x.source}</span>}</span></li>)}
          </ul>
          {d.files.length > 0 && <div className="text-[12.5px] pt-1 border-t border-[#e6e8e4]" style={{ color: MUTED }}>Files held: {d.files.length}</div>}
        </div>
        <div className="rounded-[8px] p-3 flex flex-col gap-2" style={{ boxShadow: 'var(--card-shadow)' }}>
          <div className="flex justify-between items-baseline"><h3 className="m-0 text-[14px] font-medium">Missing</h3><span className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>{d.gaps.length}</span></div>
          {d.gaps.length === 0 ? <span className="text-[13.5px]" style={{ color: MUTED }}>Nothing missing.</span> : (
            <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[13.5px]">
              {d.gaps.map(g => <li key={g.item}>{g.item}<span className="block text-[12px]" style={{ color: MUTED }}>{g.basis}</span></li>)}
            </ul>
          )}
        </div>
      </div>

      <Drafts id={id} drafts={d.drafts} onDone={(msg) => { onChanged(msg); load() }} onError={onError} />

      <div>
        <div className="flex justify-between items-baseline mb-2"><h3 className="m-0 text-[14px] font-medium">Inbox threads</h3><span className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>{d.threads.length}</span></div>
        {d.threads.length === 0 ? <Empty compact>No threads linked.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px] border-collapse min-w-[560px]">
              <thead><tr className="text-left text-[12px]" style={{ color: MUTED }}>{['Thread', 'Side', 'How it joined', 'Messages', 'Last'].map((h, i) => <th key={h} className={`font-medium px-2 py-2 ${i === 3 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>
                {d.threads.map(t => (
                  <tr key={t.id} className="border-t border-[#e6e8e4]">
                    <td className="px-2 py-2 max-w-[320px]"><Link href={`/engagement?thread=${t.id}`} className="no-underline hover:underline break-words" style={{ color: INK }}>{t.subject ?? 'Thread'}</Link></td>
                    <td className="px-2 py-2"><Chip tone={t.side === 'insurer' ? 'blue' : 'neutral'}>{SIDE[t.side] ?? t.side}</Chip></td>
                    <td className="px-2 py-2">
                      {t.joined_by === 'forward' || t.joined_by === 'midway' ? <Chip tone="amber">{JOINED[t.joined_by]}</Chip> : JOINED[t.joined_by ?? ''] ?? 'Case worker'}
                      {t.rebuilt > 0 && <span className="text-[12.5px]" style={{ color: MUTED }}> · {t.rebuilt} rebuilt</span>}
                      {t.joined_evidence && <span className="block text-[12px]" style={{ color: MUTED }}>{t.joined_evidence}</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{t.messages}</td>
                    <td className="px-2 py-2 tabular-nums whitespace-nowrap">{day(t.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function Outcome({ id, onDone }: { id: string; onDone: () => void }) {
  const [stage, setStage] = useState<'settled' | 'declined' | 'withdrawn'>('settled')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function save() {
    setBusy(true); setErr(null)
    try { await callApi(`/api/claims/${id}`, { method: 'POST', body: { action: 'outcome', stage, amount_settled: stage === 'settled' ? amount : null } }); onDone() }
    catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[8px] p-3" style={{ background: '#faf9f6' }}>
      <Segmented value={stage} onChange={setStage} options={[{ value: 'settled', label: 'Settled' }, { value: 'declined', label: 'Declined' }, { value: 'withdrawn', label: 'Withdrawn' }]} />
      {stage === 'settled' && <label className="text-[12.5px] w-[180px]" style={{ color: MUTED }}>Settled S$<input className={inputCls} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>}
      <Btn level="secondary" loading={busy} onClick={() => void save()}>Save outcome</Btn>
      {err && <p className="m-0 w-full text-[13.5px]" style={{ color: ERROR }}>{err}</p>}
    </div>
  )
}

function Drafts({ id, drafts, onDone, onError }: { id: string; drafts: ClaimDetail['drafts']; onDone: (msg: string) => void; onError: (msg: string) => void }) {
  const current = drafts.find(x => x.current) ?? null
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [to, setTo] = useState(current?.to ?? '')
  const [cc, setCc] = useState(current?.cc ?? '')
  const [subject, setSubject] = useState(current?.subject ?? '')
  const [body, setBody] = useState(current?.body ?? '')
  useEffect(() => { setTo(current?.to ?? ''); setCc(current?.cc ?? ''); setSubject(current?.subject ?? ''); setBody(current?.body ?? ''); setEditing(false) }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const post = (b: unknown) => callApi<{ draftId?: string }>(`/api/work/${id}`, { method: 'POST', body: b })
  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label)
    try { onDone(await fn()) } catch (e) { onError(errText(e)) } finally { setBusy(null) }
  }
  const send = () => run('send', async () => {
    if (editing) await post({ action: 'edit_draft', to, cc: cc || null, subject, body })
    const { draftId } = await post({ action: 'prepare_send' })
    await callApi('/api/email/send', { method: 'POST', body: { draftId } })
    await post({ action: 'sent' })
    return 'Sent.'
  })

  return (
    <div>
      <div className="flex justify-between items-baseline mb-2"><h3 className="m-0 text-[14px] font-medium">Drafts</h3><span className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>{drafts.length}</span></div>
      {!current ? <Empty compact>No draft waiting.</Empty> : (
        <div className="rounded-[8px] px-3 py-2.5 flex flex-col gap-2" style={{ boxShadow: 'var(--card-shadow)' }}>
          {editing ? (
            <div className="flex flex-col gap-2">
              <label className="text-[12.5px]" style={{ color: MUTED }}>To<input className={inputCls} value={to} onChange={e => setTo(e.target.value)} /></label>
              <label className="text-[12.5px]" style={{ color: MUTED }}>Cc<input className={inputCls} value={cc} onChange={e => setCc(e.target.value)} /></label>
              <label className="text-[12.5px]" style={{ color: MUTED }}>Subject<input className={inputCls} value={subject} onChange={e => setSubject(e.target.value)} /></label>
              <textarea className={textareaCls} rows={10} value={body} onChange={e => setBody(e.target.value)} />
            </div>
          ) : (
            <>
              <div className="text-[12.5px] break-words" style={{ color: MUTED }}>To {current.to}{current.cc ? ` · Cc ${current.cc}` : ''}</div>
              <div className="text-[13.5px] font-medium">{current.subject}</div>
              <pre className="m-0 whitespace-pre-wrap font-sans text-[14px] leading-relaxed">{current.body.replace(/\{owner_name\}/g, 'Your name')}</pre>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Btn level="secondary" disabled={busy !== null} onClick={() => void run('discard', async () => { await post({ action: 'discard_draft' }); return 'Draft discarded.' })}>Discard</Btn>
            <span className="flex-1" />
            <Btn level="secondary" disabled={busy !== null} onClick={() => setEditing(e => !e)}>{editing ? 'Cancel edit' : 'Edit'}</Btn>
            <Btn level="primary" loading={busy === 'send'} disabled={busy !== null} onClick={() => void send()}>{editing ? 'Save and send' : 'Approve and send'}</Btn>
          </div>
        </div>
      )}
    </div>
  )
}
