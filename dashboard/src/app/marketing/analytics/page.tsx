'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Btn, Segmented, Spinner } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { MarketingPage, Note } from '@/components/marketing/page-shell'
import { useSiteKey, useSites } from '@/components/marketing/site-switch'
import { fmtDate, n } from '@/lib/marketing/labels'
import { PERIOD_LABEL, PERIODS, type Period, type Row, type Traffic } from '@/lib/marketing/ga4-types'
import type { SiteSummary } from '@/lib/marketing/types'

type Payload = { site: SiteSummary; traffic: Traffic }

export default function AnalyticsPage() {
  return <Suspense fallback={null}><Analytics /></Suspense>
}

const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '—')
const change = (now: number, before: number) => (before ? `${now >= before ? '+' : ''}${(((now - before) / before) * 100).toFixed(0)}%` : '—')

/** Google Analytics for one website: visits and people for a period, by channel, source, landing page, device and country. */
function Analytics() {
  const { sites } = useSites()
  const [siteKey, setSiteKey] = useSiteKey(sites)
  const [period, setPeriod] = useState<Period>('d28')
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (fresh = false) => {
    if (!siteKey) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/marketing/analytics?site=${siteKey}&period=${period}${fresh ? '&fresh=1' : ''}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`)
      setData(j)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load Google Analytics') }
    finally { setLoading(false) }
  }, [siteKey, period])
  useEffect(() => { void load() }, [load])

  const t = data?.traffic
  const ok = t?.status === 'ok' ? t : null
  return (
    <MarketingPage
      title="Google Analytics"
      line={ok ? `${PERIOD_LABEL[period]} · ${fmtDate(ok.range.start)} to ${fmtDate(ok.range.end)} · compared with the ${PERIOD_LABEL[period]} before` : data?.site.domain}
      sites={sites} siteKey={siteKey} onSite={setSiteKey}
      actions={<Btn size="sm" disabled={loading || !siteKey} onClick={() => void load(true)}>Refresh</Btn>}
      filters={<Segmented<Period> value={period} onChange={setPeriod} label="Period" options={PERIODS.map(p => ({ value: p, label: PERIOD_LABEL[p] }))} />}>
      {error && <Note role="alert">{error}</Note>}
      {loading && !data && <Spinner label="Loading Google Analytics" />}
      {t?.status === 'not_connected' && <NotConnected traffic={t} />}
      {ok && (
        <div className="flex flex-col gap-10">
          <section>
            <h2 className="m-0 mb-3 text-heading font-medium">Visits</h2>
            <Register label="Totals" minWidth={640}>
              <RegisterHead><RegisterTh first>Measure</RegisterTh><RegisterTh>{PERIOD_LABEL[period]}</RegisterTh><RegisterTh>Before</RegisterTh><RegisterTh last>Change</RegisterTh></RegisterHead>
              <tbody>
                <Total label="Visits" now={ok.totals.sessions} before={ok.previous.sessions} />
                <Total label="People" now={ok.totals.users} before={ok.previous.users} />
                <Total label="Engaged visits" now={ok.totals.engagedSessions} before={ok.previous.engagedSessions} />
                <RegisterRow>
                  <RegisterCell first align="left" primary="Engaged rate" />
                  <RegisterCell><span className="tabular-nums">{pct(ok.totals.engagedSessions, ok.totals.sessions)}</span></RegisterCell>
                  <RegisterCell><span className="tabular-nums">{pct(ok.previous.engagedSessions, ok.previous.sessions)}</span></RegisterCell>
                  <RegisterCell last>—</RegisterCell>
                </RegisterRow>
              </tbody>
            </Register>
          </section>

          <section>
            <h2 className="m-0 mb-3 text-heading font-medium">Visits by day</h2>
            {ok.daily.length === 0 ? <Note>No visits in this period.</Note> : (
              <div className="h-72 w-full" role="img" aria-label={`Visits and people by day, ${PERIOD_LABEL[period]}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ok.daily} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--trs-line)" />
                    <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d) ?? d} tick={{ fontSize: 11, fill: 'var(--trs-subtle)' }} tickLine={false} axisLine={{ stroke: 'var(--trs-line-2)' }} minTickGap={32} />
                    <YAxis domain={[0, 'auto']} allowDecimals={false} tickFormatter={(v: number) => n(v)} tick={{ fontSize: 11, fill: 'var(--trs-subtle)' }} tickLine={false} axisLine={false} width={44} />
                    <Tooltip labelFormatter={(d) => fmtDate(String(d))} formatter={(v) => n(Number(v))} />
                    <Legend verticalAlign="top" align="left" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                    <Line type="linear" dataKey="sessions" name="Visits" stroke="var(--trs-chart-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Line type="linear" dataKey="users" name="People" stroke="var(--trs-chart-2)" strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <Breakdown title="By channel" keyLabel="Channel" rows={ok.channels} total={ok.totals.sessions} />
          <Breakdown title="By source" keyLabel="Source / medium" rows={ok.sources} total={ok.totals.sessions} />
          <Breakdown title="By landing page" keyLabel="Landing page" rows={ok.landingPages} total={ok.totals.sessions} />
          <Breakdown title="By device" keyLabel="Device" rows={ok.devices} total={ok.totals.sessions} format={k => k ? k[0].toUpperCase() + k.slice(1) : '—'} />
          <Breakdown title="By country" keyLabel="Country" rows={ok.countries} total={ok.totals.sessions} />
          <Note>Read {fmtDate(ok.fetchedAt)} from GA4 property {ok.property}. GA4 settles a day behind, so every period ends yesterday.</Note>
        </div>
      )}
    </MarketingPage>
  )
}

function Total({ label, now, before }: { label: string; now: number; before: number }) {
  return (
    <RegisterRow>
      <RegisterCell first align="left" primary={label} />
      <RegisterCell><span className="tabular-nums">{n(now)}</span></RegisterCell>
      <RegisterCell><span className="tabular-nums">{n(before)}</span></RegisterCell>
      <RegisterCell last><span className="tabular-nums">{change(now, before)}</span></RegisterCell>
    </RegisterRow>
  )
}

function Breakdown({ title, keyLabel, rows, total, format }: { title: string; keyLabel: string; rows: Row[]; total: number; format?: (k: string) => string }) {
  return (
    <section>
      <h2 className="m-0 mb-3 text-heading font-medium">{title}</h2>
      <Register label={title} minWidth={720}>
        <RegisterHead><RegisterTh first>{keyLabel}</RegisterTh><RegisterTh>Visits</RegisterTh><RegisterTh>Share</RegisterTh><RegisterTh>People</RegisterTh><RegisterTh last>Engaged rate</RegisterTh></RegisterHead>
        <tbody>
          {rows.length === 0 ? <RegisterEmpty colSpan={5}>No visits in this period.</RegisterEmpty> : rows.map(r => (
            <RegisterRow key={r.key}>
              <RegisterCell first align="left" identityWidth={360} primary={(format ? format(r.key) : r.key) || '(not set)'} />
              <RegisterCell><span className="tabular-nums">{n(r.sessions)}</span></RegisterCell>
              <RegisterCell><span className="tabular-nums">{pct(r.sessions, total)}</span></RegisterCell>
              <RegisterCell><span className="tabular-nums">{n(r.users)}</span></RegisterCell>
              <RegisterCell last><span className="tabular-nums">{pct(r.engagedSessions, r.sessions)}</span></RegisterCell>
            </RegisterRow>
          ))}
        </tbody>
      </Register>
    </section>
  )
}

function NotConnected({ traffic }: { traffic: Extract<Traffic, { status: 'not_connected' }> }) {
  return (
    <section className="max-w-[720px]">
      <h2 className="m-0 mb-3 text-heading font-medium">Not connected</h2>
      <Register label="Connection" minWidth={560}>
        <RegisterHead><RegisterTh first>Item</RegisterTh><RegisterTh last>Value</RegisterTh></RegisterHead>
        <tbody>
          <RegisterRow><RegisterCell first align="left" primary="Google Analytics tag" /><RegisterCell last>{traffic.measurementId ?? '—'}</RegisterCell></RegisterRow>
          <RegisterRow><RegisterCell first align="left" primary="Service account" /><RegisterCell last><span className="select-all">{traffic.account ?? 'Not set'}</span></RegisterCell></RegisterRow>
          <RegisterRow><RegisterCell first align="left" primary="Google's answer" /><RegisterCell last align="left" nowrap={false}>{traffic.reason}</RegisterCell></RegisterRow>
        </tbody>
      </Register>
      <div className="mt-3"><Note>To connect: in Google Analytics, Admin › Property access management, add the service account as Viewer.</Note></div>
    </section>
  )
}
