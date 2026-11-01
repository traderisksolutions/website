'use client'

/**
 * Autonomy: the share of outgoing mail that came from an agent's draft, against the 80% target.
 * The figure sits in the page's own header line; every section is a table.
 */
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Btn, Segmented, SectionCard, Spinner } from '@/components/crm/primitives'
import type { Bucket, Metrics } from '@/lib/analytics/autonomy/metrics'
import type { LadderRow } from '@/lib/autonomy/rules'

const INK = '#0f1412'
const MUTED = '#4a5550'
const FAINT = '#6f7a74'
const RULE = '#e6e8e4'

type Payload = Metrics & { days: number; target: number; computedThrough: string | null; error?: string }

const pct = (n: number | null | undefined) => n == null ? '—' : `${Math.round(n * 100)}%`
const date = (s: string | null) => s ? new Date(s).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) : '—'
const label = (k: string) => k.replace(/_/g, ' ')

const th = 'text-left text-[11px] uppercase tracking-[0.04em] font-medium pb-2'
const td = 'py-2.5 text-[13px] align-top'
const num = 'py-2.5 text-[13px] text-right tabular-nums align-top'

function Rows({ rows, first, extra }: { rows: Bucket[]; first: string; extra?: (b: Bucket) => React.ReactNode }) {
  return (
    <div className="overflow-x-auto"><table className="trs-table w-full min-w-[640px]">
      <thead>
        <tr style={{ color: FAINT, borderBottom: `1px solid ${RULE}` }}>
          <th className={th}>{first}</th>
          <th className={`${th} text-right`}>Share</th>
          <th className={`${th} text-right`}>Effort share</th>
          <th className={`${th} text-right`}>Messages</th>
          <th className={`${th} text-right`}>Agent, approved</th>
          <th className={`${th} text-right`}>Agent, auto</th>
          <th className={`${th} text-right`}>Hand written</th>
          <th className={`${th} text-right`}>Sent unedited</th>
          {extra && <th className={th}></th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(b => (
          <tr key={b.key} style={{ borderBottom: `1px solid ${RULE}` }}>
            <td className={td} style={{ color: INK }}>{b.label}</td>
            <td className={num} style={{ color: INK }}>{pct(b.share)}</td>
            <td className={num} style={{ color: MUTED }}>{pct(b.effortShare)}</td>
            <td className={num} style={{ color: MUTED }}>{b.messages.toLocaleString()}</td>
            <td className={num} style={{ color: MUTED }}>{b.agent - b.auto}</td>
            <td className={num} style={{ color: MUTED }}>{b.auto}</td>
            <td className={num} style={{ color: MUTED }}>{b.hand}</td>
            <td className={num} style={{ color: MUTED }}>{pct(b.uneditedRate)}</td>
            {extra && <td className={td} style={{ color: MUTED }}>{extra(b)}</td>}
          </tr>
        ))}
      </tbody>
    </table></div>
  )
}

type Sent = { id: string; work_item_id: string | null; draft_class: string; to: string; subject: string; client: string | null; sent_at: string }
type LadderPayload = { ladder: LadderRow[]; killSwitch: boolean; sentToday: Sent[]; error?: string }

const CLASS_LABEL: Record<string, string> = { ack: 'Acknowledgement', status: 'Status update', request: 'Request for information', forward: 'Forward to insurer', relay: 'Relay to client', answer: 'Answer about cover' }
const STATUS_LABEL: Record<string, string> = { manual: 'Manual', candidate: 'Candidate', auto: 'Auto-send on', paused: 'Paused' }

/** The ladder: which classes may send without a person, and how far each is from qualifying. */
function Ladder() {
  const [l, setL] = useState<LadderPayload | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/autonomy', { cache: 'no-store' })
      const j = await res.json() as LadderPayload
      if (!res.ok || j.error) setErr(j.error ?? `Request failed (${res.status})`); else { setL(j); setErr(null) }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Request failed') }
  }, [])
  useEffect(() => { load() }, [load])
  const act = async (cls: string, action: 'auto' | 'pause' | 'manual') => {
    setBusy(cls)
    try {
      const res = await fetch(`/api/autonomy/${encodeURIComponent(cls)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const j = await res.json(); if (!res.ok || j.error) setErr(j.error ?? 'Request failed'); else await load()
    } finally { setBusy(null) }
  }
  const pauseAll = async () => {
    setBusy('all')
    try { const res = await fetch('/api/autonomy/pause-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); const j = await res.json(); if (!res.ok || j.error) setErr(j.error ?? 'Request failed'); else await load() }
    finally { setBusy(null) }
  }
  const auto = l?.ladder.filter(r => r.status === 'auto').length ?? 0
  return (
    <>
      <SectionCard title="Auto-send ladder" actions={<Btn level="secondary" size="sm" onClick={pauseAll} disabled={busy !== null || auto === 0}>Pause all</Btn>}>
        <p className="text-[12px] mb-3" style={{ color: FAINT }}>
          A class qualifies after {l?.ladder[0]?.min_unedited ?? 20} approvals sent unedited. A person switches it on; the count never does. Money, terms, chases and decisions never auto-send. {l?.killSwitch ? 'AUTONOMY_AUTOSEND is off: nothing sends.' : ''}
        </p>
        {err && <div className="mb-3 rounded-[10px] px-3.5 py-3 text-[13px]" style={{ border: '1px solid #d5d9d4', color: INK }}>{err}</div>}
        <div className="overflow-x-auto"><table className="trs-table w-full min-w-[640px]">
          <thead><tr style={{ color: FAINT, borderBottom: `1px solid ${RULE}` }}>
            <th className={th}>Rung</th><th className={th}>Class</th><th className={th}>State</th><th className={`${th} text-right`}>Unedited</th><th className={`${th} text-right`}>Approved</th><th className={`${th} text-right`}>Needed</th><th className={th}>Since</th><th className={th}></th>
          </tr></thead>
          <tbody>
            {(l?.ladder ?? []).map(r => (
              <tr key={r.draft_class} style={{ borderBottom: `1px solid ${RULE}` }}>
                <td className={num} style={{ color: MUTED, textAlign: 'left' }}>{r.rung}</td>
                <td className={td} style={{ color: INK }}>{CLASS_LABEL[r.draft_class] ?? r.draft_class}</td>
                <td className={td} style={{ color: r.status === 'auto' ? INK : MUTED }}>{STATUS_LABEL[r.status] ?? r.status}{r.status === 'paused' && r.paused_reason ? ` · ${r.paused_reason}` : ''}</td>
                <td className={num} style={{ color: INK }}>{r.approvals_unedited}</td>
                <td className={num} style={{ color: MUTED }}>{r.approvals_total}</td>
                <td className={num} style={{ color: MUTED }}>{r.min_unedited}</td>
                <td className={td} style={{ color: MUTED }}>{date(r.last_graduated_at)}</td>
                <td className={td}>
                  <div className="flex gap-1.5 justify-end">
                    {(r.status === 'candidate' || (r.status === 'paused' && r.approvals_unedited >= r.min_unedited)) && <Btn level="primary" size="sm" disabled={busy !== null} onClick={() => act(r.draft_class, 'auto')}>Switch on auto-send</Btn>}
                    {r.status === 'auto' && <Btn level="secondary" size="sm" disabled={busy !== null} onClick={() => act(r.draft_class, 'pause')}>Pause</Btn>}
                    {r.status === 'paused' && <Btn level="tertiary" size="sm" disabled={busy !== null} onClick={() => act(r.draft_class, 'manual')}>Back to manual</Btn>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </SectionCard>
      <SectionCard title={`Auto-sent today · ${l?.sentToday.length ?? 0}`}>
        {l && l.sentToday.length === 0 && <p className="text-[13px]" style={{ color: MUTED }}>Nothing auto-sent today.</p>}
        {l && l.sentToday.length > 0 && (
          <div className="overflow-x-auto"><table className="trs-table w-full min-w-[640px]">
            <thead><tr style={{ color: FAINT, borderBottom: `1px solid ${RULE}` }}><th className={th}>Time</th><th className={th}>Class</th><th className={th}>Client</th><th className={th}>To</th><th className={th}>Subject</th><th className={th}></th></tr></thead>
            <tbody>{l.sentToday.map(s => (
              <tr key={s.id} style={{ borderBottom: `1px solid ${RULE}` }}>
                <td className={td} style={{ color: MUTED }}>{new Date(s.sent_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}</td>
                <td className={td} style={{ color: INK }}>{CLASS_LABEL[s.draft_class] ?? s.draft_class}</td>
                <td className={td} style={{ color: INK }}>{s.client ?? '—'}</td>
                <td className={td} style={{ color: MUTED }}>{s.to}</td>
                <td className={td} style={{ color: MUTED }}>{s.subject}</td>
                <td className={td}>{s.work_item_id && <a className="underline" style={{ color: INK }} href={`/today/${s.work_item_id}`}>Open case</a>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </SectionCard>
    </>
  )
}

export default function AutonomyPage() {
  const [d, setD] = useState<Payload | null>(null)
  const [days, setDays] = useState(90)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch(`/api/analytics/autonomy?days=${days}`, { cache: 'no-store' })
      const j = await res.json() as Payload
      if (!res.ok || j.error) { setErr(j.error ?? `Request failed (${res.status})`); setD(null) } else setD(j)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Request failed') }
    finally { setLoading(false) }
  }, [days])
  useEffect(() => { load() }, [load])

  const week = d?.thisWeek

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6 py-8 sm:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-5" style={{ borderBottom: `1px solid ${RULE}` }}>
          <div>
            <h1 className="text-[22px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Autonomy</h1>
            <p className="mt-1.5 text-[14px]" style={{ color: MUTED }}>
              {loading && !d ? 'Reading…' : (
                <>
                  <span className="tabular-nums font-medium" style={{ color: INK }}>{pct(week?.share ?? d?.total.share)}</span>
                  <span className="mx-1.5">·</span><span>target {pct(d?.target ?? 0.8)}</span>
                  <span className="mx-1.5">·</span><span className="tabular-nums">{week ? `${week.messages} messages this week` : `${d?.total.messages ?? 0} messages`}</span>
                  <span className="mx-1.5">·</span><span className="tabular-nums">{pct(d?.total.share)} over {d?.days ?? days} days</span>
                  <span className="mx-1.5">·</span><span>computed through {date(d?.computedThrough ?? null)}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Segmented value={String(days)} onChange={v => setDays(Number(v))} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '180', label: '180 days' }]} />
            <Btn level="tertiary" onClick={load} aria-label="Reload"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></Btn>
          </div>
        </header>

        <p className="pt-3 text-[12px]" style={{ color: FAINT }}>
          Share = messages sent from an agent's draft over all outgoing messages; internal mail and the agent mailboxes are left out. Effort weights each message by its own words plus 40 per file. Unedited = less than a tenth of the draft changed. {d ? `${d.excluded} messages excluded.` : ''}
        </p>

        {err && <div className="mt-5 rounded-[10px] px-3.5 py-3 text-[13px]" style={{ border: '1px solid #d5d9d4', color: INK }}>{err}</div>}
        {loading && !d && <div className="py-16"><Spinner label="Loading" /></div>}

        <div className="mt-6 space-y-6"><Ladder /></div>

        {d && (
          <div className="mt-6 space-y-6">
            <SectionCard title="By week"><Rows rows={[...d.byWeek].reverse()} first="Week of" /></SectionCard>
            <SectionCard title="By class of work">
              <Rows rows={d.byClass} first="Class" extra={b => b.personOnly ? 'person only' : ''} />
            </SectionCard>
            <SectionCard title="By sender"><Rows rows={d.bySender} first="Sender" /></SectionCard>
            <SectionCard title="By client"><Rows rows={d.byClient} first="Client" /></SectionCard>
          </div>
        )}
      </div>
    </div>
  )
}
