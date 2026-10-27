'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FilePlus } from 'lucide-react'
import { SectionCard, Empty, Spinner, Btn } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterGroupRow } from '@/components/ui/register'
import { fmtDate, fmtRelative } from '@/lib/crm/format'
import { productLineLabel } from '@/lib/product-lines'
import { threadHref } from '@/lib/placement/position'
import type { CompanyThread } from '@/lib/crm/types'
import type { DispatchPosition, LinePosition, Placement, PlacementBundle, PlacementLine, PlacementQuote, PlacementStatus, Spec } from '@/lib/placement/types'
import type { PolicyView } from '@/components/policies/types'
import { NewPlacementDialog } from './NewPlacementDialog'
import { NewRoundDialog } from './NewRoundDialog'
import { callApi, errText, INK, MUTED, ERROR } from './shared'

const STATUS_WORD: Record<PlacementStatus, string> = { open: 'Open', presented: 'Presented', bound: 'Bound', closed: 'Closed' }
/** Line · Round · Insurer · Contact · Status · Premium · Limit · Valid until · Last contact · Thread · action */
const COLS = 10
/** The premium as a figure: the normalised amount when read, else the insurer's words, short. */
function money(q: { premium_amount: number | null; currency: string | null; premium_text: string | null }): string {
  if (q.premium_amount != null) return `${q.currency === 'SGD' || !q.currency ? 'S$' : q.currency + ' '}${q.premium_amount.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const t = (q.premium_text ?? '').trim()
  return t ? (t.length > 24 ? t.slice(0, 22) + '…' : t) : '—'
}
/** A button inside the dense grid or the placement line: 22px tall so the row stays 34px. */
const ROW_BTN = 'h-[22px] px-1.5 text-[12px] rounded-[6px]'
const CONTACT_MAX = 30

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)

/** Where one insurer stands on one line, in words. Chase due outranks the plain sent state. */
function dispatchWord(dp: DispatchPosition): string {
  const d = dp.dispatch
  switch (d.status) {
    case 'withdrawn': return 'Withdrawn'
    case 'declined': return 'Declined'
    case 'expired': return 'Expired'
    case 'quoted': return dp.expired ? 'Expired' : 'Quoted'
    case 'info_requested': return 'Needs info'
    case 'drafted': return 'Drafted'
    case 'acknowledged': return dp.chaseDue ? 'Chase due' : 'Acknowledged'
    case 'sent': return dp.chaseDue ? 'Chase due' : `Sent ${fmtRelative(d.sent_at ?? d.last_outbound_at)}`
  }
}

type RoundTarget = { placementId: string; line: PlacementLine; currentSpec: Spec; currentContactIds: string[]; prefill?: { spec: Spec; source_log_id: string } }

/** The insurer contacts asked in the line's current round. */
const contactsAsked = (pos: LinePosition) => pos.dispatches.map(d => d.dispatch.insurer_contact_id).filter((id): id is string => !!id)

const lineLabel = (line: PlacementLine) => line.label ?? productLineLabel(line.product_line)

/** Muted one-line text in a cell. */
const Muted = ({ children }: { children: React.ReactNode }) => <span className="text-[13px]" style={{ color: MUTED }}>{children}</span>

/**
 * Placements for this client: every policy asked for, every insurer asked, and what each one
 * said, as one dense grid per placement. The log lives on the Log tab; drafts to approve open
 * from the page header.
 */
export function PlacementPanel({ companyId, companyName, threads, data, policies, onChanged, onOpenDrafts }: {
  companyId: string
  companyName: string
  threads: CompanyThread[]
  data: { bundle: PlacementBundle; positions: LinePosition[] } | null
  policies: PolicyView[] | null
  onChanged: () => void
  onOpenDrafts: () => void
}) {
  const [newOpen, setNewOpen] = useState(false)
  const [round, setRound] = useState<RoundTarget | null>(null)
  const [busyFor, setBusyFor] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const setErr = (id: string, msg: string | null) => setErrors(e => { const n = { ...e }; if (msg) n[id] = msg; else delete n[id]; return n })

  const placements = useMemo(() => data ? [...data.bundle.placements].sort((a, b) => b.created_at.localeCompare(a.created_at)) : [], [data])

  /** The policy a line feeds: placement_lines.policy_id once the spine migration is applied, else the policy that names the line. */
  const policyForLine = (line: PlacementLine): PolicyView | null => {
    const direct = (line as PlacementLine & { policy_id?: string | null }).policy_id
    return (policies ?? []).find(p => (direct && p.id === direct) || p.placement_line_id === line.id) ?? null
  }

  async function patchStatus(p: Placement, status: PlacementStatus) {
    setBusyFor(p.id); setErr(p.id, null)
    try {
      await callApi(`/api/placements/${p.id}`, { method: 'PATCH', body: { status } })
      onChanged()
    } catch (e) {
      setErr(p.id, errText(e))
    } finally {
      setBusyFor(null)
    }
  }

  async function emailClient(p: Placement) {
    setBusyFor(p.id); setErr(p.id, null)
    try {
      await callApi<{ draftId: string }>(`/api/placements/${p.id}/client-draft`, { method: 'POST', body: {} })
      onChanged()
      onOpenDrafts()
    } catch (e) {
      setErr(p.id, errText(e))
    } finally {
      setBusyFor(null)
    }
  }

  async function choose(p: Placement, policy: PolicyView, quoteId: string) {
    setBusyFor(quoteId); setErr(p.id, null)
    try {
      await callApi(`/api/policies/${policy.id}/choose`, { method: 'POST', body: { quote_id: quoteId } })
      onChanged()
    } catch (e) {
      setErr(p.id, errText(e))
    } finally {
      setBusyFor(null)
    }
  }

  const openNewRound = (p: Placement, pos: LinePosition) =>
    setRound({ placementId: p.id, line: pos.line, currentSpec: pos.round?.spec ?? pos.line.spec, currentContactIds: contactsAsked(pos) })
  const openPendingRound = (p: Placement, pos: LinePosition) => pos.pendingChange && setRound({
    placementId: p.id, line: pos.line, currentSpec: pos.round?.spec ?? pos.line.spec, currentContactIds: contactsAsked(pos),
    prefill: { spec: ((pos.pendingChange.detail as { spec?: Spec })?.spec ?? {}), source_log_id: pos.pendingChange.id },
  })

  /** The action cell: Chosen in words, Choose as a button, nothing when the quote cannot be picked. */
  const actionCell = (p: Placement, policy: PolicyView | null, q: PlacementQuote | null) => {
    const chosen = !!q && (q.status === 'selected' || (!!policy?.chosen_quote_id && policy.chosen_quote_id === q.id))
    return (
      <RegisterCell last align="right">
        {q && chosen && <span className="text-[13px]" style={{ color: INK }}>Chosen</span>}
        {q && !chosen && policy && q.status !== 'not_chosen' && (
          <Btn size="xs" level="tertiary" className={ROW_BTN} disabled={busyFor !== null} loading={busyFor === q.id} onClick={() => choose(p, policy, q.id)}>Choose</Btn>
        )}
      </RegisterCell>
    )
  }

  return (
    <>
      <SectionCard
        title="Placements"
        actions={<Btn size="xs" level="primary" onClick={() => setNewOpen(true)}><FilePlus size={12} /> New placement</Btn>}
      >
        {!data && <Spinner label="Loading placements…" />}
        {data && placements.length === 0 && <Empty compact>No placements yet.</Empty>}
        {data && placements.map(p => {
          const positions = data.positions.filter(x => x.line.placement_id === p.id)
          const busy = busyFor === p.id
          const byAgent = p.created_by === 'agent'
          // Still the agent's proposal while nothing has gone to an insurer: Dismiss stands in for Close.
          const proposal = byAgent && p.status === 'open' && positions.every(x => x.dispatches.every(d => d.dispatch.status === 'drafted'))
          return (
            <div key={p.id} className="py-3 first:pt-0 border-b border-[#e8eaed] last:border-b-0">
              {/* One 24px line: title · status · inception · client thread · origin, actions on the right. */}
              <div className="flex items-center gap-x-2 gap-y-1 flex-wrap sm:flex-nowrap min-h-6 text-[12.5px] whitespace-nowrap" style={{ color: MUTED }}>
                <span className="text-[13px] font-medium truncate min-w-0" style={{ color: INK }} title={p.title}>{p.title}</span>
                <span>· {STATUS_WORD[p.status]}</span>
                {p.inception_date && <span>· Inception {fmtDate(p.inception_date)}</span>}
                {p.client_thread_id && <span>· <Link href={threadHref(p.client_thread_id) ?? '#'} className="no-underline hover:underline" style={{ color: INK }}>Client thread</Link></span>}
                {byAgent && <span>· Proposed by the agent</span>}
                <span className="ml-auto flex items-center gap-1 shrink-0">
                  {p.status !== 'closed' && <Btn size="xs" level="tertiary" className={ROW_BTN} disabled={busy} onClick={() => emailClient(p)}>Email client</Btn>}
                  {(p.status === 'open' || p.status === 'presented') && <Btn size="xs" level="tertiary" className={ROW_BTN} disabled={busy} onClick={() => patchStatus(p, 'bound')}>Mark bound</Btn>}
                  {p.status !== 'closed' && <Btn size="xs" level="tertiary" className={ROW_BTN} disabled={busy} onClick={() => patchStatus(p, 'closed')}>{proposal ? 'Dismiss' : 'Close'}</Btn>}
                </span>
              </div>
              {errors[p.id] && <p className="text-[12.5px] m-0 mt-1" style={{ color: ERROR }}>{errors[p.id]}</p>}

              {positions.length === 0 ? <Empty compact>No lines on this placement.</Empty> : (
                <Register label={`${p.title} lines`} minWidth={1040} dense className="mt-1.5">
                  <RegisterHead>
                    <RegisterTh first>Line</RegisterTh>
                    <RegisterTh>Insurer</RegisterTh>
                    <RegisterTh>Contact</RegisterTh>
                    <RegisterTh>Status</RegisterTh>
                    <RegisterTh>Premium p.a.</RegisterTh>
                    <RegisterTh>Limit</RegisterTh>
                    <RegisterTh>Valid until</RegisterTh>
                    <RegisterTh>Last contact</RegisterTh>
                    <RegisterTh>Thread</RegisterTh>
                    <RegisterTh last />
                  </RegisterHead>
                  <tbody>
                    {positions.map(pos => {
                      const policy = policyForLine(pos.line)
                      const label = lineLabel(pos.line)
                      const roundNo = pos.roundNo > 0 ? pos.roundNo : '—'
                      const asked = pos.dispatches.length + pos.engineQuotes.length
                      const groupRow = (
                        <LineGroupRow key={`g:${pos.line.id}`} pos={pos} label={label} asked={asked}
                          onNewRound={() => openNewRound(p, pos)} onOpenPending={() => openPendingRound(p, pos)} />
                      )
                      if (asked === 0) {
                        return [groupRow, (
                          <RegisterRow key={pos.line.id}>
                            <RegisterCell first primary={label} title={label} />
                            <RegisterCell colSpan={COLS - 1} last><Muted>No insurer asked yet</Muted></RegisterCell>
                          </RegisterRow>
                        )]
                      }
                      // Rate-engine quotes first (employment benefits tiers A and B), then the insurers asked by email.
                      const engineRows = pos.engineQuotes.map((q, i) => {
                        const plan = q.plan_label ?? 'Rate table'
                        return (
                          <RegisterRow key={q.id}>
                            <RegisterCell first primary={i === 0 ? label : ''} title={i === 0 ? label : undefined} />
                            <RegisterCell primary={q.insurer_name} />
                            <RegisterCell title={plan}><Muted>{clip(plan, CONTACT_MAX)}</Muted></RegisterCell>
                            <RegisterCell primary="Priced" />
                            <RegisterCell primary={money(q)} title={q.premium_text ?? undefined} />
                            <RegisterCell primary={q.limit_text ?? '—'} />
                            <RegisterCell primary={q.valid_until ? fmtDate(q.valid_until) : '—'} />
                            <RegisterCell primary={fmtDate(q.created_at)} />
                            <RegisterCell><Muted>Rate table</Muted></RegisterCell>
                            {actionCell(p, policy, q)}
                          </RegisterRow>
                        )
                      })
                      const offset = pos.engineQuotes.length
                      const dispatchRows = pos.dispatches.map((dp, i0) => {
                        const i = i0 + offset
                        const q = dp.quote
                        const last = later(dp.dispatch.last_inbound_at, dp.dispatch.last_outbound_at)
                        return (
                          <RegisterRow key={dp.dispatch.id}>
                            <RegisterCell first primary={i === 0 ? label : ''} title={i === 0 ? label : undefined} />
                            <RegisterCell primary={dp.dispatch.insurer_name} />
                            <RegisterCell title={dp.dispatch.to_email}><Muted>{clip(dp.dispatch.to_email, CONTACT_MAX)}</Muted></RegisterCell>
                            <RegisterCell primary={dispatchWord(dp)} />
                            <RegisterCell primary={q ? `${money(q)}${q.needs_review ? ' · check' : ''}` : '—'} title={q?.premium_text ?? undefined} />
                            <RegisterCell primary={q?.limit_text ?? '—'} />
                            <RegisterCell primary={q?.valid_until ? fmtDate(q.valid_until) : '—'} />
                            <RegisterCell primary={last ? fmtDate(last) : '—'} />
                            <RegisterCell>
                              {dp.threadHref
                                ? <Link href={dp.threadHref} className="text-[13px] no-underline hover:underline" style={{ color: INK }}>Thread</Link>
                                : <Muted>—</Muted>}
                            </RegisterCell>
                            {actionCell(p, policy, q)}
                          </RegisterRow>
                        )
                      })
                      return [groupRow, ...engineRows, ...dispatchRows]
                    })}
                  </tbody>
                </Register>
              )}
            </div>
          )
        })}
      </SectionCard>

      <NewPlacementDialog open={newOpen} onClose={() => setNewOpen(false)} companyId={companyId} companyName={companyName} threads={threads} onDone={onChanged} />
      {round && (
        <NewRoundDialog
          open
          onClose={() => setRound(null)}
          placementId={round.placementId}
          line={round.line}
          currentSpec={round.currentSpec}
          currentContactIds={round.currentContactIds}
          prefill={round.prefill}
          onDone={onChanged}
        />
      )}
    </>
  )
}

/**
 * The line's group row, one line tall: label · round · limit · quoted of asked, the agent's next
 * step in muted text, and on the right New round plus Open round when a client change is waiting.
 */
function LineGroupRow({ pos, label, asked, onNewRound, onOpenPending }: {
  pos: LinePosition; label: string; asked: number; onNewRound: () => void; onOpenPending: () => void
}) {
  const limit = pos.round?.spec?.limit ?? pos.line.spec?.limit
  const summary = [label, pos.roundNo > 0 ? `round ${pos.roundNo}` : 'no round', limit ? `limit ${limit}` : null, `${pos.quotedCount} of ${asked} quoted`].filter(Boolean).join(' · ')
  return (
    <RegisterGroupRow colSpan={COLS}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate shrink-0 max-w-[60%]" title={summary}>{summary}</span>
        {pos.line.next_step && <span className="font-normal truncate min-w-0" style={{ color: MUTED }} title={pos.line.next_step}>{pos.line.next_step}</span>}
        <span className="ml-auto flex items-center gap-1 shrink-0">
          {pos.pendingChange && (
            <Btn size="xs" level="tertiary" className={ROW_BTN} title={pos.pendingChange.text} onClick={onOpenPending}>Open round (client change)</Btn>
          )}
          <Btn size="xs" level="tertiary" className={ROW_BTN} onClick={onNewRound}>New round</Btn>
        </span>
      </div>
    </RegisterGroupRow>
  )
}
