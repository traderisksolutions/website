'use client'

/**
 * Renewals, release 1 (docs/renewals.md): the open renewal records as one table, Open renewals due
 * (POST /api/renewals/open) and a link to To fix. The stage moves in the row; closing as Renewed or
 * Lost, the pipeline and the forecast come in release 2. No model is called.
 */
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Btn, Empty, LinkBtn, Segmented, Spinner } from '@/components/crm/primitives'
import { PageHeader } from '@/components/page-header'
import { callApi, errText, selectCls } from '@/components/placement/shared'
import { Register, RegisterCell, RegisterEmpty, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import { fmtDate, money } from '@/lib/format'
import { BUCKETS, OPEN_STAGES, STAGE_NAME, type Bucket, type OpenStage } from '@/lib/renewals/rules'
import type { RenewalRow, RenewalsView } from '@/lib/renewals/store'

const ALL = 'all'

export function RenewalsList() {
  const [view, setView] = useState<RenewalsView | null>(null)
  const [bucket, setBucket] = useState<Bucket | typeof ALL>(ALL)
  const [opening, setOpening] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => callApi<RenewalsView>('/api/renewals').then(setView).catch(e => setError(errText(e))), [])
  useEffect(() => { void load() }, [load])

  const rows = useMemo(() => view?.rows ?? [], [view])
  const shown = useMemo(() => rows.filter(r => bucket === ALL || r.bucket === bucket), [rows, bucket])

  async function openDue() {
    setOpening(true); setError(null); setNote(null)
    try {
      const d = await callApi<{ tables: boolean; opened: number; due: number }>('/api/renewals/open', { method: 'POST' })
      setNote(d.tables ? `Opened ${d.opened} of ${d.due} due.` : 'Renewal records are not set up yet.')
      await load()
    } catch (e) { setError(errText(e)) } finally { setOpening(false) }
  }

  async function setStage(r: RenewalRow, stage: OpenStage) {
    setSaving(r.id); setError(null)
    try {
      await callApi('/api/renewals', { method: 'PATCH', body: { id: r.id, stage } })
      setView(v => v && { ...v, rows: v.rows.map(x => (x.id === r.id ? { ...x, stage } : x)) })
    } catch (e) { setError(errText(e)) } finally { setSaving(null) }
  }

  return (
    <div className="px-4 md:px-8 py-6 mx-auto w-full min-w-0 max-w-[1280px]">
      <PageHeader className="mb-5" title="Renewals"
        meta={view?.tables ? `${view.total} open · ${fmtDate(view.today)}` : undefined}
        actions={<>
          <LinkBtn href="/renewals/fix">To fix</LinkBtn>
          <Btn level="primary" loading={opening} disabled={opening || view?.tables === false} onClick={() => void openDue()}>Open renewals due</Btn>
        </>}>
        {view?.tables && (
          <Segmented<Bucket | typeof ALL> value={bucket} onChange={setBucket} label="Days to expiry" options={[
            { value: ALL, label: 'All', count: rows.length },
            ...BUCKETS.map(b => ({ value: b, label: `${b} days`, count: rows.filter(r => r.bucket === b).length })),
          ]} />
        )}
      </PageHeader>

      {note && <p className="m-0 mb-3 text-body text-trs-ink" role="status">{note}</p>}
      {error && <p className="m-0 mb-3 text-body text-trs-neg" role="alert">{error}</p>}
      {!view ? (error ? null : <Spinner label="Loading the renewals…" />)
        : !view.tables ? <Empty action={<LinkBtn href="/renewals/fix">To fix</LinkBtn>}>Renewal records are not set up yet.</Empty>
        : (
          <Register label="Renewals" minWidth={1080}>
            <RegisterHead>
              <RegisterTh first>Client</RegisterTh>
              <RegisterTh>Line</RegisterTh>
              <RegisterTh>Insurer</RegisterTh>
              <RegisterTh>Expires</RegisterTh>
              <RegisterTh>Days</RegisterTh>
              <RegisterTh>Premium</RegisterTh>
              <RegisterTh>Commission</RegisterTh>
              <RegisterTh>Stage</RegisterTh>
              <RegisterTh last>Owner</RegisterTh>
            </RegisterHead>
            <tbody>
              {shown.length === 0 && <RegisterEmpty colSpan={9}>No open renewals{bucket === ALL ? '' : ` at ${bucket} days`}.</RegisterEmpty>}
              {shown.map(r => (
                <RegisterRow key={r.id}>
                  <RegisterCell first primary={r.company_id ? <Link href={`/companies/${r.company_id}`} className="text-trs-ink no-underline hover:underline">{r.company ?? 'Client'}</Link> : (r.company ?? '—')}
                    secondary={r.policy_number ?? r.class_of_insurance ?? undefined} />
                  <RegisterCell primary={r.line ?? '—'} />
                  <RegisterCell title={r.insurer ?? undefined}><span className="block max-w-48 truncate text-trs-ink">{r.insurer ?? '—'}</span></RegisterCell>
                  <RegisterCell primary={fmtDate(r.expiry_date)} />
                  <RegisterCell primary={r.days} />
                  <RegisterCell primary={money(r.premium, { ccy: r.currency })} />
                  <RegisterCell primary={money(r.commission, { ccy: r.currency })} />
                  <RegisterCell>
                    <select aria-label={`Stage for ${r.company ?? 'this renewal'}`} className={`${selectCls} h-8 w-36`} value={r.stage}
                      disabled={saving === r.id} onChange={e => void setStage(r, e.target.value as OpenStage)}>
                      {OPEN_STAGES.map(s => <option key={s} value={s}>{STAGE_NAME[s]}</option>)}
                    </select>
                  </RegisterCell>
                  <RegisterCell last primary={r.owner ?? '—'} />
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        )}
    </div>
  )
}
