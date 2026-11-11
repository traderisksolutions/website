'use client'

/**
 * Member movements across every client: each batch of joiners and leavers, the step it waits on,
 * and the next action. Longest waiting first.
 */
import { PageHeader } from '@/components/page-header'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Btn, Chip, Segmented, Spinner, Empty } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { callApi, errText, INK, MUTED, ERROR } from '@/components/placement/shared'
import { fmtDate } from '@/lib/crm/format'
import type { MovementBatch, MovementStage } from '@/app/api/policies/movements/route'
import { money } from '@/lib/format'

const STAGE: Record<MovementStage, string> = { held: 'Awaiting date', to_send: 'To send', insurer: 'With insurer', to_bill: 'To bill', billed: 'Awaiting payment' }
const counts = (b: MovementBatch) => [b.joins ? `+${b.joins}` : null, b.leaves ? `−${b.leaves}` : null, b.changes ? `${b.changes} change${b.changes === 1 ? '' : 's'}` : null].filter(Boolean).join('  ')

export default function MovementsPage() {
  const [rows, setRows] = useState<MovementBatch[] | null>(null)
  const [stage, setStage] = useState<'all' | MovementStage>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(() => {
    callApi<{ batches: MovementBatch[] }>('/api/policies/movements').then(d => setRows(d.batches)).catch(e => setError(errText(e)))
  }, [])
  useEffect(() => { load() }, [load])

  async function raise(b: MovementBatch) {
    if (!b.transaction_id) return
    setBusy(b.key); setError(null); setNotice(null)
    try {
      await callApi(`/api/policies/transactions/${b.transaction_id}/bill`, { method: 'POST', body: {} })
      setNotice(`${b.company_name}: the insurer note is in Debit notes for review.`)
      load()
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }

  const n = (s: MovementStage) => (rows ?? []).filter(r => r.stage === s).length
  const shown = (rows ?? []).filter(r => stage === 'all' || r.stage === stage)

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 max-w-[1320px] mx-auto min-w-0">
      <PageHeader className="mb-5" title="Member movements" meta={rows ? `${rows.length} open` : undefined}>
        <Segmented value={stage} onChange={v => setStage(v)} label="Stage" options={[
          { value: 'all', label: 'All', count: rows?.length ?? 0 },
          { value: 'held', label: STAGE.held, count: n('held') },
          { value: 'to_send', label: STAGE.to_send, count: n('to_send') },
          { value: 'insurer', label: STAGE.insurer, count: n('insurer') },
          { value: 'to_bill', label: STAGE.to_bill, count: n('to_bill') },
          { value: 'billed', label: STAGE.billed, count: n('billed') },
        ]} />
      </PageHeader>
      {error && <p className="m-0 mb-3 text-[13.5px]" style={{ color: ERROR }}>{error}</p>}
      {notice && <p className="m-0 mb-3 text-[13.5px]" style={{ color: INK }}>{notice}</p>}
      {!rows ? <Spinner label="Loading movements…" /> : shown.length === 0 ? <Empty>No movements here.</Empty> : (
        <Register label="Member movements" minWidth={1180}>
          <RegisterHead>
            <RegisterTh first>Company</RegisterTh>
            <RegisterTh>Policy</RegisterTh>
            <RegisterTh>Movements</RegisterTh>
            <RegisterTh>Stage</RegisterTh>
            <RegisterTh align="right">Waiting</RegisterTh>
            <RegisterTh align="right">Expected</RegisterTh>
            <RegisterTh align="right">Insurer note</RegisterTh>
            <RegisterTh last>Next</RegisterTh>
          </RegisterHead>
          <tbody>
            {shown.map(b => (
              <RegisterRow key={b.key}>
                <RegisterCell first identityWidth={240} primary={b.company_name} secondary={`reported ${fmtDate(b.reported_at)}`} />
                <RegisterCell primary={b.policy_number ?? '—'} secondary={b.insurer ?? undefined} />
                <RegisterCell nowrap={false}><span className="block text-[14px]" style={{ color: INK }}>{counts(b)}</span><span className="block text-[12px] max-w-[260px] truncate" style={{ color: MUTED }} title={b.names.join(', ')}>{b.names.join(', ')}</span></RegisterCell>
                <RegisterCell><Chip tone={b.stage === 'to_bill' ? 'amber' : b.stage === 'billed' ? 'green' : 'neutral'}>{STAGE[b.stage]}</Chip></RegisterCell>
                <RegisterCell align="right" primary={`${b.days_waiting} day${b.days_waiting === 1 ? '' : 's'}`} secondary={b.chase_count ? `${b.chase_count} chaser${b.chase_count === 1 ? '' : 's'}` : undefined} />
                <RegisterCell align="right" primary={money(b.expected)} />
                <RegisterCell align="right" primary={money(b.note_amount)} secondary={b.note_no ?? undefined} />
                <RegisterCell last>
                  {b.stage === 'to_bill' && b.can_raise
                    ? <Btn size="xs" level="secondary" loading={busy === b.key} disabled={busy !== null} onClick={() => void raise(b)}>Raise TRS note</Btn>
                    : b.stage === 'to_bill' && b.bundle_id
                      ? <Link href="/debit-notes/new" className="text-[14px] no-underline hover:underline" style={{ color: INK }}>Review TRS note</Link>
                      : <Link href={`/companies/${b.company_id}?tab=members`} className="text-[14px] no-underline hover:underline" style={{ color: INK }}>{b.stage === 'held' ? 'Ask the client for the date' : b.stage === 'to_send' ? (b.draft_id ? 'Review the request' : 'Request from insurer') : 'Open'}</Link>}
                </RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      )}
    </div>
  )
}
