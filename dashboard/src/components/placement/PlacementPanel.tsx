'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FilePlus } from 'lucide-react'
import { SectionCard, Empty, Spinner, Btn } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { fmtDate, fmtRelative } from '@/lib/crm/format'
import { productLineLabel } from '@/lib/product-lines'
import { threadHref } from '@/lib/placement/position'
import type { CompanyThread } from '@/lib/crm/types'
import type { DispatchPosition, LinePosition, Placement, PlacementBundle, PlacementLine, PlacementStatus, Spec } from '@/lib/placement/types'
import type { PolicyView } from '@/components/policies/types'
import { NewPlacementDialog } from './NewPlacementDialog'
import { NewRoundDialog } from './NewRoundDialog'
import { callApi, errText, INK, MUTED, ERROR } from './shared'

const STATUS_WORD: Record<PlacementStatus, string> = { open: 'Open', presented: 'Presented', bound: 'Bound', closed: 'Closed' }
const LINE_COLS = 9

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

const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)

type RoundTarget = { placementId: string; line: PlacementLine; currentSpec: Spec; currentContactIds: string[]; prefill?: { spec: Spec; source_log_id: string } }

/** The insurer contacts asked in the line's current round. */
const contactsAsked = (pos: LinePosition) => pos.dispatches.map(d => d.dispatch.insurer_contact_id).filter((id): id is string => !!id)

/**
 * Placements for this client: every policy asked for, every insurer asked, and what each one
 * said. The log lives on the Log tab; drafts to approve open from the page header.
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
            <div key={p.id} className="py-5 first:pt-0" style={{ borderBottom: '1px solid #e8eaed' }}>
              <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                <div className="min-w-0">
                  <span className="block text-[15px] font-medium leading-tight" style={{ color: INK }}>{p.title}</span>
                  {byAgent && <span className="block text-[12.5px] mt-0.5" style={{ color: MUTED }}>Proposed by the agent</span>}
                  <span className="block text-[12.5px] mt-0.5" style={{ color: MUTED }}>
                    {STATUS_WORD[p.status]}
                    {p.inception_date && ` · Inception ${fmtDate(p.inception_date)}`}
                    {p.client_thread_id && <> · <Link href={threadHref(p.client_thread_id) ?? '#'} className="no-underline hover:underline" style={{ color: INK }}>Client thread</Link></>}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {p.status !== 'closed' && <Btn size="xs" level="tertiary" disabled={busy} onClick={() => emailClient(p)}>Email client</Btn>}
                  {(p.status === 'open' || p.status === 'presented') && <Btn size="xs" level="tertiary" disabled={busy} onClick={() => patchStatus(p, 'bound')}>Mark bound</Btn>}
                  {p.status !== 'closed' && <Btn size="xs" level="tertiary" disabled={busy} onClick={() => patchStatus(p, 'closed')}>{proposal ? 'Dismiss' : 'Close'}</Btn>}
                </div>
              </div>
              {errors[p.id] && <p className="text-[13px] m-0 mb-3" style={{ color: ERROR }}>{errors[p.id]}</p>}

              {positions.length === 0 ? <Empty compact>No lines on this placement.</Empty> : (
                <Register label={`${p.title} lines`} minWidth={1160}>
                  <RegisterHead>
                    <RegisterTh first>Line</RegisterTh>
                    <RegisterTh>Insurer</RegisterTh>
                    <RegisterTh>Status</RegisterTh>
                    <RegisterTh>Premium</RegisterTh>
                    <RegisterTh>Limit</RegisterTh>
                    <RegisterTh>Valid until</RegisterTh>
                    <RegisterTh>Last contact</RegisterTh>
                    <RegisterTh>Thread</RegisterTh>
                    <RegisterTh last />
                  </RegisterHead>
                  <tbody>
                    {positions.map(pos => {
                      const policy = policyForLine(pos.line)
                      const lineCell = (
                        <LineCell
                          pos={pos}
                          onNewRound={() => setRound({ placementId: p.id, line: pos.line, currentSpec: pos.round?.spec ?? pos.line.spec, currentContactIds: contactsAsked(pos) })}
                          onOpenPending={() => pos.pendingChange && setRound({
                            placementId: p.id, line: pos.line, currentSpec: pos.round?.spec ?? pos.line.spec, currentContactIds: contactsAsked(pos),
                            prefill: { spec: ((pos.pendingChange.detail as { spec?: Spec })?.spec ?? {}), source_log_id: pos.pendingChange.id },
                          })}
                        />
                      )
                      if (pos.dispatches.length === 0 && pos.engineQuotes.length === 0) {
                        return (
                          <RegisterRow key={pos.line.id}>
                            <RegisterCell first nowrap={false}>{lineCell}</RegisterCell>
                            <RegisterCell colSpan={LINE_COLS - 1} last><span className="text-[14px]" style={{ color: MUTED }}>No insurer on file for this line</span></RegisterCell>
                          </RegisterRow>
                        )
                      }
                      // Rate-engine quotes first (employment benefits tiers A and B), then the insurers asked by email.
                      const engineRows = pos.engineQuotes.map((q, i) => {
                        const chosen = q.status === 'selected' || (!!policy?.chosen_quote_id && policy.chosen_quote_id === q.id)
                        return (
                          <RegisterRow key={q.id}>
                            <RegisterCell first nowrap={false}>{i === 0 ? lineCell : null}</RegisterCell>
                            <RegisterCell primary={q.insurer_name} secondary={q.plan_label ? (q.plan_label.length > 44 ? q.plan_label.slice(0, 42) + '…' : q.plan_label) : 'Rate table'} />
                            <RegisterCell><span className="text-[14px]" style={{ color: INK }}>Priced</span></RegisterCell>
                            <RegisterCell primary={q.premium_text ?? '—'} />
                            <RegisterCell primary={q.limit_text ?? '—'} />
                            <RegisterCell primary={q.valid_until ? fmtDate(q.valid_until) : '—'} />
                            <RegisterCell primary={fmtDate(q.created_at)} />
                            <RegisterCell><span className="text-[14px]" style={{ color: MUTED }}>Rate table</span></RegisterCell>
                            <RegisterCell last align="right">
                              {chosen && <span className="text-[14px]" style={{ color: INK }}>Chosen</span>}
                              {!chosen && policy && q.status !== 'not_chosen' && (
                                <Btn size="xs" level="tertiary" disabled={busyFor !== null} loading={busyFor === q.id} onClick={() => choose(p, policy, q.id)}>Choose</Btn>
                              )}
                            </RegisterCell>
                          </RegisterRow>
                        )
                      })
                      const offset = pos.engineQuotes.length
                      return [...engineRows, ...pos.dispatches.map((dp, i0) => {
                        const i = i0 + offset
                        const q = dp.quote
                        const last = later(dp.dispatch.last_inbound_at, dp.dispatch.last_outbound_at)
                        const chosen = !!q && (q.status === 'selected' || (!!policy?.chosen_quote_id && policy.chosen_quote_id === q.id))
                        return (
                          <RegisterRow key={dp.dispatch.id}>
                            <RegisterCell first nowrap={false}>{i === 0 ? lineCell : null}</RegisterCell>
                            <RegisterCell primary={dp.dispatch.insurer_name} secondary={dp.dispatch.to_email} />
                            <RegisterCell><span className="text-[14px]" style={{ color: INK }}>{dispatchWord(dp)}</span></RegisterCell>
                            <RegisterCell primary={q?.premium_text ? `${q.premium_text}${q.needs_review ? ' · check' : ''}` : '—'} />
                            <RegisterCell primary={q?.limit_text ?? '—'} />
                            <RegisterCell primary={q?.valid_until ? fmtDate(q.valid_until) : '—'} />
                            <RegisterCell primary={last ? fmtDate(last) : '—'} />
                            <RegisterCell>
                              {dp.threadHref
                                ? <Link href={dp.threadHref} className="text-[14px] no-underline hover:underline" style={{ color: INK }}>Thread</Link>
                                : <span className="text-[14px]" style={{ color: MUTED }}>—</span>}
                            </RegisterCell>
                            <RegisterCell last align="right">
                              {q && chosen && <span className="text-[14px]" style={{ color: INK }}>Chosen</span>}
                              {q && !chosen && policy && q.status !== 'not_chosen' && (
                                <Btn size="xs" level="tertiary" disabled={busyFor !== null} loading={busyFor === q.id} onClick={() => choose(p, policy, q.id)}>Choose</Btn>
                              )}
                            </RegisterCell>
                          </RegisterRow>
                        )
                      })]
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

/** The identity cell of a line: label, round and limit, the agent's next step, a pending client change. */
function LineCell({ pos, onNewRound, onOpenPending }: { pos: LinePosition; onNewRound: () => void; onOpenPending: () => void }) {
  const limit = pos.round?.spec?.limit ?? pos.line.spec?.limit
  return (
    <div className="flex flex-col gap-1">
      <span className="block text-[15px] font-medium leading-tight truncate" style={{ color: INK }}>{pos.line.label ?? productLineLabel(pos.line.product_line)}</span>
      <span className="block text-[12.5px] truncate" style={{ color: MUTED }}>
        {pos.roundNo > 0 ? `Round ${pos.roundNo}` : 'No round'}
        {limit && ` · limit ${limit}`}
      </span>
      {pos.line.next_step && <span className="block text-[12.5px] whitespace-normal" style={{ color: MUTED }}>{pos.line.next_step}</span>}
      {pos.pendingChange && (
        <span className="block text-[12.5px] whitespace-normal" style={{ color: INK }}>
          {pos.pendingChange.text}
          {' '}
          <Btn level="tertiary" size="xs" className="h-6 px-1.5 align-middle" onClick={onOpenPending}>Open round</Btn>
        </span>
      )}
      <span className="block"><Btn level="tertiary" size="xs" className="h-7 px-2 -ml-2" onClick={onNewRound}>New round</Btn></span>
    </div>
  )
}
