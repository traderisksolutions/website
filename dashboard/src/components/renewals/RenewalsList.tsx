'use client'

/**
 * Renewals › Pipeline (docs/renewals.md, release 2): every renewal record by days to expiry, with
 * Lost and Renewed behind their own pills; filters by owner, line, stage and At risk. A row opens
 * the renewal's page (/renewals/<id>). Open renewals due (POST /api/renewals/open) is the one
 * primary. No model is called.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Btn, Empty, Segmented, Spinner } from '@/components/crm/primitives'
import { PageHeader } from '@/components/page-header'
import { callApi, errText } from '@/components/placement/shared'
import { Register, RegisterCell, RegisterEmpty, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import { SelectBox } from '@/components/ui/select-box'
import { fmtDate, money } from '@/lib/format'
import { LINES } from '@/lib/renewals/lines'
import { DEFAULT_BUCKETS, PIPE_BUCKETS, PIPE_BUCKET_NAME, pipelineMeta, taskName, type PipeBucket } from '@/lib/renewals/pipeline'
import { OPEN_STAGES, STAGE_NAME } from '@/lib/renewals/rules'
import type { PipelineRow, PipelineView } from '@/lib/renewals/pipeline-store'
import { RiskChips, StageChip, ownerName, plainDays } from './bits'

type View = PipelineView | { tables: false; today: string; rows: [] }
const OPEN = 'open'
const ALL = ''

export function RenewalsList() {
  const router = useRouter()
  const [view, setView] = useState<View | null>(null)
  const [bucket, setBucket] = useState<PipeBucket | typeof OPEN>(OPEN)
  const [risk, setRisk] = useState<'all' | 'risk'>('all')
  const [owner, setOwner] = useState(ALL)
  const [line, setLine] = useState(ALL)
  const [stage, setStage] = useState(ALL)
  const [opening, setOpening] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => callApi<View>('/api/renewals/pipeline').then(setView).catch(e => setError(errText(e))), [])
  useEffect(() => { void load() }, [load])

  const rows: PipelineRow[] = useMemo(() => (view?.tables ? view.rows : []), [view])
  // Owner, line, stage and At risk narrow the list first; the pills count what is left in each bucket.
  const filtered = useMemo(() => rows.filter(r => (!owner || (owner === 'none' ? !r.owner : r.owner === owner))
    && (!line || (line === 'none' ? !r.line_code : r.line_code === line))
    && (!stage || r.stage === stage)
    && (risk === 'all' || r.risk.length > 0)), [rows, owner, line, stage, risk])
  const shown = filtered.filter(r => (bucket === OPEN ? DEFAULT_BUCKETS.includes(r.bucket) : r.bucket === bucket))
  const meta = pipelineMeta(rows)
  const owners = useMemo(() => [...new Set(rows.map(r => r.owner).filter((o): o is string => !!o))].sort(), [rows])
  const atRisk = rows.filter(r => r.risk.length > 0).length

  async function openDue() {
    setOpening(true); setError(null); setNote(null)
    try {
      const d = await callApi<{ tables: boolean; opened: number; due: number }>('/api/renewals/open', { method: 'POST' })
      setNote(d.tables ? `Opened ${d.opened} of ${d.due} due.` : 'Renewal records are not set up yet.')
      await load()
    } catch (e) { setError(errText(e)) } finally { setOpening(false) }
  }

  return (
    <div className="px-4 md:px-8 py-6 mx-auto w-full min-w-0 max-w-screen-xl">
      <PageHeader className="mb-5" title="Renewals"
        meta={view?.tables ? `${meta.open} open · next 120 days · ${money(meta.gross, { ccy: 'SGD', dp: 0 })} gross` : undefined}
        actions={<Btn level="primary" loading={opening} disabled={opening || view?.tables === false} onClick={() => void openDue()}>Open renewals due</Btn>}>
        {view?.tables && (
          <>
            <Segmented<PipeBucket | typeof OPEN> value={bucket} onChange={setBucket} label="Days to expiry" options={[
              { value: OPEN, label: 'All open', count: filtered.filter(r => !r.outcome).length },
              ...PIPE_BUCKETS.map(b => ({ value: b, label: PIPE_BUCKET_NAME[b], count: filtered.filter(r => r.bucket === b).length })),
            ]} />
            <Segmented<'all' | 'risk'> value={risk} onChange={setRisk} label="Risk" options={[
              { value: 'all', label: 'All' }, { value: 'risk', label: 'At risk', count: atRisk },
            ]} />
            <div className="w-36"><SelectBox label="Owner" value={owner} onChange={setOwner} options={[
              { value: ALL, label: 'Every owner' }, ...owners.map(o => ({ value: o, label: ownerName(o) })), { value: 'none', label: 'No owner' },
            ]} /></div>
            <div className="w-48"><SelectBox label="Line" value={line} onChange={setLine} options={[
              { value: ALL, label: 'Every line' }, ...LINES.map(l => ({ value: l.code, label: l.name })), { value: 'none', label: 'No line' },
            ]} /></div>
            <div className="w-36"><SelectBox label="Stage" value={stage} onChange={setStage} options={[
              { value: ALL, label: 'Every stage' }, ...OPEN_STAGES.map(s => ({ value: s, label: STAGE_NAME[s] })),
            ]} /></div>
          </>
        )}
      </PageHeader>

      {note && <p className="m-0 mb-3 text-sm text-trs-ink" role="status">{note}</p>}
      {error && <p className="m-0 mb-3 text-sm text-trs-neg" role="alert">{error}</p>}
      {!view ? (error ? null : <Spinner label="Loading the renewals…" />)
        : !view.tables ? <Empty>Renewal records are not set up yet.</Empty>
        : rows.length === 0 ? <Empty>No renewal records yet. Open renewals due to start.</Empty>
        : (
          <Register label="Renewals" minWidth={1180}>
            <RegisterHead>
              <RegisterTh first>Client</RegisterTh>
              <RegisterTh>Line</RegisterTh>
              <RegisterTh>Insurer</RegisterTh>
              <RegisterTh>Expires</RegisterTh>
              <RegisterTh>Premium</RegisterTh>
              <RegisterTh>Commission</RegisterTh>
              <RegisterTh>Stage</RegisterTh>
              <RegisterTh>Owner</RegisterTh>
              <RegisterTh last>Next task</RegisterTh>
            </RegisterHead>
            <tbody>
              {shown.length === 0 && (
                <RegisterEmpty colSpan={9}>
                  {`No renewals in ${bucket === OPEN ? 'the open buckets' : PIPE_BUCKET_NAME[bucket]} for these filters.`}
                </RegisterEmpty>
              )}
              {shown.map(r => (
                <RegisterRow key={r.id} onClick={() => router.push(`/renewals/${r.id}`)}>
                  <RegisterCell first primary={<Link href={`/renewals/${r.id}`} target="_self" className="text-trs-ink no-underline hover:underline" onClick={e => e.stopPropagation()}>{r.company ?? 'Client'}</Link>}
                    secondary={r.policy_number ?? r.class_of_insurance ?? undefined} />
                  <RegisterCell primary={r.line ?? '—'} />
                  <RegisterCell title={r.insurer ?? undefined}><span className="block max-w-48 truncate text-trs-ink">{r.insurer ?? '—'}</span></RegisterCell>
                  <RegisterCell primary={fmtDate(r.expiry_date)} secondary={r.outcome ? undefined : plainDays(r.days)} />
                  <RegisterCell primary={money(r.premium, { ccy: r.currency })} />
                  <RegisterCell primary={money(r.commission, { ccy: r.currency })} />
                  <RegisterCell><span className="inline-flex flex-wrap justify-center gap-1"><StageChip stage={r.stage} /><RiskChips risk={r.risk} /></span></RegisterCell>
                  <RegisterCell primary={ownerName(r.owner)} />
                  <RegisterCell last primary={r.next ? taskName(r.next.kind) : '—'} secondary={r.next ? fmtDate(r.next.due_on) : undefined} />
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        )}
    </div>
  )
}
