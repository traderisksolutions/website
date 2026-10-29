'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Btn, Chip, LinkBtn, Segmented, Spinner, TONE_STYLE } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterGroupRow, RegisterEmpty } from '@/components/ui/register'
import { callApi, errText, INK, MUTED, ERROR } from '@/components/placement/shared'
import { fmtDate } from '@/lib/crm/format'
import { threadHref } from '@/lib/placement/position'
import { dueTone, statusOf, type OwnerParty, type View } from '@/lib/nexus/rules'
import type { LedgerRow } from '@/lib/nexus/ledger'

type Ledger = { rows: LedgerRow[]; counts: Record<View, number>; chaseable: number; mine_count: number; actor: string }
type ChaseReply = { drafted: number; results: { id: string; draft_id?: string; skipped?: string }[] }

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'week', label: 'Due this week' },
  { value: 'waiting', label: 'Waiting on others' },
  { value: 'done', label: 'Done this week' },
]
const EMPTY: Record<View, string> = {
  overdue: 'Nothing overdue.', week: 'Nothing due this week.', waiting: 'Nothing waiting on others.', done: 'Nothing done this week.',
}
const GROUPS: { party: OwnerParty; label: string }[] = [
  { party: 'trs', label: 'We owe' },
  { party: 'insurer', label: 'Insurers owe' },
  { party: 'client', label: 'Clients owe' },
  { party: 'date', label: 'Dates' },
]
const CHIP: Record<OwnerParty, { tone: 'green' | 'blue' | 'amber' | 'neutral'; label: string }> = {
  trs: { tone: 'green', label: 'TRS' }, insurer: { tone: 'blue', label: 'Insurer' }, client: { tone: 'amber', label: 'Client' }, date: { tone: 'neutral', label: 'Renewal' },
}
const COLS = 9
const person = (email: string | null) => email ? email.split('@')[0] : null
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

function source(r: LedgerRow): { href: string | null; label: string } {
  switch (r.source_kind) {
    case 'rfq': return { href: `/companies/${r.company_id}?tab=quotes`, label: r.source_label ? `RFQ ${r.source_label}` : 'RFQ' }
    case 'debit_note': return { href: `/debit-notes?company_id=${r.company_id ?? ''}&open=${r.source_ref ?? ''}`, label: r.source_label ? `DN ${r.source_label}` : 'Debit note' }
    case 'renewal': return { href: r.company_id ? `/companies/${r.company_id}?tab=policies` : null, label: r.source_label ? `Policy ${r.source_label}` : 'Policy' }
    default: return { href: threadHref(r.thread_id), label: r.source_kind === 'claim' ? 'Claim thread' : 'Thread' }
  }
}

/** Who the row is owed to: the outside party when TRS owes; otherwise the broker waiting. */
function owedTo(r: LedgerRow): string {
  if (r.owner_party === 'trs') return r.counterparty_name ?? r.counterparty_email ?? ''
  return person(r.owner_email) ?? 'TRS'
}

export function FollowUpsLedger() {
  const [view, setView] = useState<View>('overdue')
  const [mine, setMine] = useState(false)
  const [data, setData] = useState<Ledger | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await callApi<Ledger>(`/api/nexus/follow-ups?view=${view}${mine ? '&mine=1' : ''}`)) }
    catch (e) { setError(errText(e)) }
    finally { setLoading(false) }
  }, [view, mine])
  useEffect(() => { void load() }, [load])

  const groups = useMemo(() => GROUPS.map(g => ({ ...g, rows: (data?.rows ?? []).filter(r => r.owner_party === g.party) })).filter(g => g.rows.length > 0), [data])

  async function patch(r: LedgerRow, body: Record<string, unknown>, done: string) {
    setBusy(r.id); setNote(null); setError(null)
    try { await callApi(`/api/nexus/follow-ups/${r.id}`, { method: 'PATCH', body }); setNote(done); await load() }
    catch (e) { setError(errText(e)) }
    finally { setBusy(null) }
  }

  async function chase(ids: string[] | 'all') {
    setBusy(ids === 'all' ? 'all' : ids[0]); setNote(null); setError(null)
    try {
      const res = await callApi<ChaseReply>('/api/nexus/follow-ups/chases', { method: 'POST', body: ids === 'all' ? { all: true, mine } : { ids } })
      const skipped = res.results.filter(x => x.skipped)
      const reasons = [...new Set(skipped.map(x => x.skipped))].slice(0, 3).join('; ')
      setNote(`${res.drafted} ${res.drafted === 1 ? 'chase' : 'chases'} drafted to Drafts to approve.${skipped.length ? ` ${skipped.length} skipped: ${reasons}.` : ''}`)
      await load()
    } catch (e) { setError(errText(e)) }
    finally { setBusy(null) }
  }

  // Overdue rows owed by insurers or clients, counted by the server so it holds on every view.
  const allCount = data?.chaseable ?? 0

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1500px] px-4 sm:px-12 pt-12 pb-20">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Nexus</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>Follow-ups</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <LinkBtn level="tertiary" href="/nexus/cases">Case review</LinkBtn>
            <Btn level="primary" disabled={allCount === 0 || !!busy} loading={busy === 'all'} onClick={() => void chase('all')}>
              Draft all chases ({allCount})
            </Btn>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-6 mb-3">
          <Segmented value={view} onChange={setView} options={VIEW_OPTIONS.map(o => ({ ...o, count: data?.counts[o.value] }))} />
          <Btn size="xs" level={mine ? 'secondary' : 'tertiary'} aria-pressed={mine} onClick={() => setMine(m => !m)}>Mine</Btn>
        </div>
        {error && <p role="alert" className="m-0 mb-3 text-[13px]" style={{ color: ERROR }}>{error}</p>}
        {note && <p role="status" className="m-0 mb-3 text-[13px]" style={{ color: MUTED }}>{note}</p>}

        {loading && !data ? <Spinner label="Loading follow-ups…" /> : (
          <Register label="Follow-ups" minWidth={1320} maxHeight="calc(100vh - 290px)">
            <RegisterHead>
              <RegisterTh first>Company</RegisterTh>
              <RegisterTh>Status</RegisterTh>
              <RegisterTh>Who owes</RegisterTh>
              <RegisterTh>What</RegisterTh>
              <RegisterTh>To</RegisterTh>
              <RegisterTh>Since</RegisterTh>
              <RegisterTh>Due</RegisterTh>
              <RegisterTh>Source</RegisterTh>
              <RegisterTh last><span className="sr-only">Actions</span></RegisterTh>
            </RegisterHead>
            <tbody>
              {!data && error && <RegisterEmpty colSpan={COLS}>Follow-ups could not be loaded.</RegisterEmpty>}
              {data && groups.length === 0 && <RegisterEmpty colSpan={COLS}>{EMPTY[view]}</RegisterEmpty>}
              {groups.map(g => (
                <Fragment key={g.party}>
                  <RegisterGroupRow colSpan={COLS}>{g.label} <span className="tabular-nums font-normal" style={{ color: MUTED }}>{g.rows.length}</span></RegisterGroupRow>
                  {g.rows.map(r => <Row key={r.id} r={r} view={view} busy={busy === r.id}
                    onDone={() => void patch(r, { status: 'done' }, 'Marked done.')}
                    onReopen={() => void patch(r, { status: 'open' }, 'Reopened.')}
                    onSnooze={() => void patch(r, { snooze_days: 3 }, 'Snoozed for 3 days.')}
                    onChase={() => void chase([r.id])} />)}
                </Fragment>
              ))}
            </tbody>
          </Register>
        )}
      </div>
    </div>
  )
}

function Row({ r, view, busy, onDone, onReopen, onSnooze, onChase }: {
  r: LedgerRow; view: View; busy: boolean; onDone: () => void; onReopen: () => void; onSnooze: () => void; onChase: () => void
}) {
  const chip = CHIP[r.owner_party]
  const tone = view === 'done' ? null : dueTone(r.due_at, new Date())
  const status = statusOf(r, view, new Date())
  const src = source(r)
  const thread = threadHref(r.thread_id)
  const debtor = r.owner_party === 'insurer' || r.owner_party === 'client' ? r.counterparty_name ?? r.counterparty_email : r.owner_party === 'date' ? r.counterparty_name : null
  return (
    <RegisterRow>
      <RegisterCell first title={r.company_name ?? undefined}>
        {r.company_id && r.company_name
          ? <Link href={`/companies/${r.company_id}`} className="block truncate font-medium no-underline hover:underline" style={{ color: INK }}>{r.company_name}</Link>
          : <span style={{ color: MUTED }}>—</span>}
      </RegisterCell>
      <RegisterCell><Chip tone={status.tone}>{status.label}</Chip></RegisterCell>
      <RegisterCell>
        <div className="flex items-center gap-2 min-w-0 max-w-[220px]">
          <Chip tone={chip.tone}>{chip.label}</Chip>
          {debtor && <span className="truncate text-[12px]" style={{ color: MUTED }} title={debtor}>{debtor}</span>}
        </div>
      </RegisterCell>
      <RegisterCell title={r.what} primary={clip(r.what, 60)} />
      <RegisterCell title={r.owner_party === 'trs' ? r.counterparty_email ?? undefined : r.owner_email ?? undefined} primary={clip(owedTo(r), 28)} />
      <RegisterCell primary={fmtDate(r.since_at)} />
      <RegisterCell>
        <span className="tabular-nums" style={{ color: tone === 'overdue' ? TONE_STYLE.red.color : tone === 'soon' ? TONE_STYLE.amber.color : INK, fontWeight: tone ? 500 : undefined }}>
          {view === 'done' ? `Done ${fmtDate(r.closed_at)}` : r.due_at ? fmtDate(r.due_at) : '—'}
        </span>
      </RegisterCell>
      <RegisterCell>
        {src.href ? <Link href={src.href} className="underline underline-offset-4" style={{ color: INK }}>{src.label}</Link> : <span style={{ color: MUTED }}>{src.label}</span>}
      </RegisterCell>
      <RegisterCell last>
        <div className="flex items-center gap-1 justify-end">
          {thread && <LinkBtn size="xs" level="tertiary" href={thread}>Open thread</LinkBtn>}
          {view === 'done' ? (
            <Btn size="xs" level="tertiary" loading={busy} onClick={onReopen}>Reopen</Btn>
          ) : (
            <>
              {(r.owner_party === 'insurer' || r.owner_party === 'client') && r.source_kind !== 'rfq' && (
                <Btn size="xs" level="tertiary" disabled={busy || !r.counterparty_email} title={r.counterparty_email ? undefined : 'No email address on this row'} onClick={onChase}>Draft chase</Btn>
              )}
              <Btn size="xs" level="tertiary" disabled={busy} onClick={onDone}>Mark done</Btn>
              <Btn size="xs" level="tertiary" disabled={busy} onClick={onSnooze}>Snooze 3 days</Btn>
            </>
          )}
        </div>
      </RegisterCell>
    </RegisterRow>
  )
}
