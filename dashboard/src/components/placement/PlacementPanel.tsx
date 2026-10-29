'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FilePlus } from 'lucide-react'
import { SectionCard, Empty, Spinner, Btn } from '@/components/crm/primitives'
import { fmtDate } from '@/lib/crm/format'
import { productLineLabel } from '@/lib/product-lines'
import { threadHref } from '@/lib/placement/position'
import type { CompanyThread } from '@/lib/crm/types'
import type { LinePosition, Placement, PlacementBundle, PlacementLine, PlacementStatus, Spec } from '@/lib/placement/types'
import type { PolicyView } from '@/components/policies/types'
import { NewPlacementDialog } from './NewPlacementDialog'
import { NewRoundDialog } from './NewRoundDialog'
import { ComparisonGrid } from './ComparisonGrid'
import { IssueDebitNoteDialog } from './IssueDebitNoteDialog'
import { sharedOn } from '@/lib/placement/compare'
import { callApi, errText, INK, MUTED, ERROR } from './shared'

const STATUS_WORD: Record<PlacementStatus, string> = { open: 'Open', presented: 'Presented', bound: 'Bound', closed: 'Closed' }
/** A button inside the dense grid or the placement line: 22px tall so the row stays 34px. */
const ROW_BTN = 'h-[22px] px-1.5 text-[12px] rounded-[6px]'
type RoundTarget = { placementId: string; line: PlacementLine; currentSpec: Spec; currentContactIds: string[]; prefill?: { spec: Spec; source_log_id: string } }

/** The insurer contacts asked in the line's current round. */
const contactsAsked = (pos: LinePosition) => pos.dispatches.map(d => d.dispatch.insurer_contact_id).filter((id): id is string => !!id)

const lineLabel = (line: PlacementLine) => line.label ?? productLineLabel(line.product_line)

/**
 * Requests for quotes for this client: every policy asked for, every insurer asked, and every
 * option each one priced, as one comparison grid per line. The log lives on the Log tab; drafts to approve open
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
  const [leftOut, setLeftOut] = useState<Set<string>>(new Set())
  const [dnFor, setDnFor] = useState<{ pos: LinePosition; placement: Placement; policy: PolicyView | null } | null>(null)
  const shared = useMemo(() => sharedOn(data?.bundle.shares), [data])
  const toggleEmail = (id: string) => setLeftOut(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

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

  /** Current quotes on the placement's lines, and those ticked for the next comparison email. */
  const emailable = (positions: LinePosition[]) => positions.flatMap(x => [...x.dispatches.flatMap(d => d.quotes), ...x.engineQuotes]).filter(q => q.status !== 'not_chosen')
  async function emailClient(p: Placement, positions: LinePosition[]) {
    setBusyFor(p.id); setErr(p.id, null)
    try {
      const all = emailable(positions)
      const ticked = all.filter(q => !leftOut.has(q.id)).map(q => q.id)
      await callApi<{ draftId: string }>(`/api/placements/${p.id}/client-draft`, { method: 'POST', body: ticked.length === all.length ? {} : { quote_ids: ticked } })
      onChanged()
      onOpenDrafts()
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

  return (
    <>
      <SectionCard
        title="Prospective requested quotes"
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
            <div key={p.id} className="py-3 first:pt-0 border-b border-[#e6e8e4] last:border-b-0">
              {/* One 24px line: title · status · inception · client thread · origin, actions on the right. */}
              <div className="flex items-center gap-x-2 gap-y-1 flex-wrap sm:flex-nowrap min-h-6 text-[12.5px] whitespace-nowrap" style={{ color: MUTED }}>
                <span className="text-[13px] font-medium tabular-nums" style={{ color: INK }}>{p.ref}</span>
                <span className="text-[13px] font-medium truncate min-w-0" style={{ color: INK }} title={p.title}>· {p.title}</span>
                <span>· Received {fmtDate(p.created_at)}</span>
                <span>· {STATUS_WORD[p.status]}</span>
                {p.inception_date && <span>· Inception {fmtDate(p.inception_date)}</span>}
                {p.client_thread_id && <span>· <Link href={threadHref(p.client_thread_id) ?? '#'} className="no-underline hover:underline" style={{ color: INK }}>Client thread</Link></span>}
                {byAgent && <span>· Proposed by the agent</span>}
                <span className="ml-auto flex items-center gap-1 shrink-0">
                  {p.status !== 'closed' && (() => {
                    const all = emailable(positions)
                    const n = all.filter(q => !leftOut.has(q.id)).length
                    return (
                      <Btn size="xs" level="secondary" className={ROW_BTN} disabled={busy || n === 0} loading={busy} onClick={() => emailClient(p, positions)}
                        title="Drafts the comparison email with a table of the ticked prices; you check it and send it">
                        Draft comparison email{all.length ? ` (${n} of ${all.length})` : ''}
                      </Btn>
                    )
                  })()}
                  {p.status !== 'closed' && <Btn size="xs" level="tertiary" className={ROW_BTN} disabled={busy} onClick={() => patchStatus(p, 'closed')}>{proposal ? 'Dismiss' : 'Close'}</Btn>}
                </span>
              </div>
              {errors[p.id] && <p className="text-[12.5px] m-0 mt-1" style={{ color: ERROR }}>{errors[p.id]}</p>}

              {positions.length === 0 ? <Empty compact>No lines on this placement.</Empty> : positions.map(pos => (
                <div key={pos.line.id} className="mt-2.5">
                  <LineHeader pos={pos} label={lineLabel(pos.line)} onNewRound={() => openNewRound(p, pos)} onOpenPending={() => openPendingRound(p, pos)}
                    onIssueDn={() => setDnFor({ pos, placement: p, policy: policyForLine(pos.line) })} />
                  <ComparisonGrid pos={pos} policy={policyForLine(pos.line)} shared={shared} leftOut={leftOut} onToggleEmail={toggleEmail} onChanged={onChanged} onOpenDrafts={onOpenDrafts} />
                </div>
              ))}
            </div>
          )
        })}
      </SectionCard>

      <IssueDebitNoteDialog target={dnFor} onClose={() => setDnFor(null)} onDone={onChanged} />
      <NewPlacementDialog open={newOpen} onClose={() => setNewOpen(false)} companyId={companyId} companyName={companyName} threads={threads} onDone={onChanged} />
      {round && (
        <NewRoundDialog
          open
          onClose={() => setRound(null)}
          placementId={round.placementId}
          line={round.line}
          currentSpec={round.currentSpec}
          currentContactIds={round.currentContactIds}
          companyId={companyId}
          prefill={round.prefill}
          onDone={onChanged}
        />
      )}
    </>
  )
}

/**
 * The line's heading, one line tall: label · round · limit · quoted of asked, the agent's next
 * step in muted text, and on the right New round plus Open round when a client change is waiting.
 */
function LineHeader({ pos, label, onNewRound, onOpenPending, onIssueDn }: {
  pos: LinePosition; label: string; onNewRound: () => void; onOpenPending: () => void; onIssueDn: () => void
}) {
  const l = pos.line
  const finished = l.status === 'done' || !!l.done_at
  const bind = finished ? 'Done'
    : l.insurer_confirmed_at ? 'Insurer confirmed'
    : l.confirm_sent_at ? 'Confirmation sent'
    : l.client_confirmed_at ? 'Client chose'
    : null
  const asked = pos.dispatches.length + pos.engineQuotes.length
  const limit = pos.round?.spec?.limit ?? pos.line.spec?.limit
  const summary = [pos.roundNo > 0 ? `Round ${pos.roundNo}` : 'No round', limit ? `limit ${limit}` : null, `${pos.quotedCount} of ${asked} quoted`].filter(Boolean).join(' · ')
  return (
    <div className="flex items-center gap-2 min-w-0 min-h-6 mb-1 text-[12.5px]" style={{ color: MUTED }}>
      <span className="font-medium shrink-0" style={{ color: INK }}>{label}</span>
      <span className="shrink-0">· {summary}</span>
      {bind && <span className="shrink-0 px-1.5 rounded-[5px]" style={{ background: '#dcefd2', color: INK }}>{bind}</span>}
      {pos.line.next_step && <span className="truncate min-w-0" title={pos.line.next_step}>· {pos.line.next_step}</span>}
      <span className="ml-auto flex items-center gap-1 shrink-0">
        {pos.pendingChange && (
          <Btn size="xs" level="tertiary" className={ROW_BTN} title={pos.pendingChange.text} onClick={onOpenPending}>Open round (client change)</Btn>
        )}
        {(l.status === 'bound' || l.insurer_confirmed_at) && !finished && (
          <Btn size="xs" level={l.insurer_confirmed_at ? 'secondary' : 'tertiary'} className={ROW_BTN} onClick={onIssueDn}
            title={l.insurer_confirmed_at ? undefined : 'The insurer has not confirmed cover yet'}>Issue debit note</Btn>
        )}
        {!finished && l.status !== 'bound' && <Btn size="xs" level="tertiary" className={ROW_BTN} onClick={onNewRound}>New round</Btn>}
      </span>
    </div>
  )
}
