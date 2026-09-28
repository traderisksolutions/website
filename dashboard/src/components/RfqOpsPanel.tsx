'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'

const INK = '#202124'
const MUTED = '#5f6368'

// RFQ operations settings (Workstream 3): the quote-chase SLA (a nudge threshold —
// never auto-sends) and an insurer responsiveness scoreboard.

export const RFQ_SLA_KEY = 'rfq_sla'

type Stat = {
  insurer: string; requested: number; replied: number; quoted: number
  recommended: number; won: number; quote_rate: number; win_rate: number; avg_response_days: number | null
}

type Funnel = {
  funnel: { requested: number; dispatched: number; quoted: number; recommended: number; won: number; lost: number }
  win_rate: number; quote_conversion: number; in_flight: number
  avg_time_to_quote_days: number | null; avg_time_to_decision_days: number | null
}

export default function RfqOpsPanel() {
  const [days,   setDays]   = useState<string>('3')
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [stats,  setStats]  = useState<Stat[] | null>(null)
  const [funnel, setFunnel] = useState<Funnel | null>(null)

  const load = useCallback(async () => {
    const [sRes, stRes, fRes] = await Promise.all([
      fetch(`/api/settings?key=${RFQ_SLA_KEY}`, { cache: 'no-store' }),
      fetch('/api/nexus/rfq/insurer-stats', { cache: 'no-store' }),
      fetch('/api/nexus/rfq/funnel', { cache: 'no-store' }),
    ])
    if (sRes.ok) {
      const row = await sRes.json()
      try { const v = row?.value ? JSON.parse(row.value) : null; if (v?.default_days) setDays(String(v.default_days)) } catch { /* keep default */ }
    }
    setStats(stRes.ok ? await stRes.json() : [])
    setFunnel(fRes.ok ? await fRes.json() : null)
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setSaved(false)
    try {
      const n = Math.max(1, parseInt(days, 10) || 3)
      const res = await fetch('/api/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: RFQ_SLA_KEY, value: JSON.stringify({ default_days: n }) }),
      })
      if (res.ok) { setDays(String(n)); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    } finally { setSaving(false) }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 pt-5">
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px]" style={{ color: MUTED }}>Chase SLA (days)</span>
            <Input type="number" min={1} value={days} onChange={e => setDays(e.target.value)} className="w-28" />
          </label>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          {saved && <span className="text-[13px] mb-2.5" style={{ color: MUTED }}>Saved</span>}
        </div>

        {/* Pipeline funnel + win metrics (#4) */}
        {funnel && funnel.funnel.requested > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="m-0 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Pipeline</h3>
            <div className="flex flex-wrap items-stretch gap-2">
              {([
                { l: 'Requested',   v: funnel.funnel.requested },
                { l: 'Dispatched',  v: funnel.funnel.dispatched },
                { l: 'Quoted',      v: funnel.funnel.quoted },
                { l: 'Recommended', v: funnel.funnel.recommended },
                { l: 'Selected',    v: funnel.funnel.won },
                { l: 'Not chosen',  v: funnel.funnel.lost },
              ] as { l: string; v: number }[]).map(s => (
                <div key={s.l} className="flex flex-col rounded-[16px] px-4 py-3 min-w-[104px]" style={{ background: '#f1f3f4' }}>
                  <span className="text-[12.5px]" style={{ color: MUTED }}>{s.l}</span>
                  <span className="text-[22px] font-medium tracking-[-0.02em] leading-none tabular-nums mt-1.5" style={{ color: INK }}>{s.v}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]" style={{ color: MUTED }}>
              <span>Selection rate <span className="tabular-nums" style={{ color: INK }}>{funnel.win_rate}%</span> of decided</span>
              <span>Quote conversion <span className="tabular-nums" style={{ color: INK }}>{funnel.quote_conversion}%</span></span>
              <span>In flight <span className="tabular-nums" style={{ color: INK }}>{funnel.in_flight}</span></span>
              {funnel.avg_time_to_quote_days != null && <span>Average time to quote <span className="tabular-nums" style={{ color: INK }}>{funnel.avg_time_to_quote_days} days</span></span>}
              {funnel.avg_time_to_decision_days != null && <span>Average time to decision <span className="tabular-nums" style={{ color: INK }}>{funnel.avg_time_to_decision_days} days</span></span>}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <h3 className="m-0 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Insurer scoreboard</h3>
          <Register label="Insurer scoreboard" minWidth={640}>
            <RegisterHead>
              <RegisterTh first hint="Insurer, and how many quote requests were sent to them">Insurer</RegisterTh>
              <RegisterTh align="right" hint="Requests that received any reply">Replied</RegisterTh>
              <RegisterTh align="right" hint="Requests that came back with a quote, and the quote rate">Quoted</RegisterTh>
              <RegisterTh align="right" hint="Average days from request to first reply">Average reply</RegisterTh>
              <RegisterTh last align="right" hint="Quotes the client selected, and the selection rate">Selected</RegisterTh>
            </RegisterHead>
            <tbody>
              {stats === null && <RegisterEmpty colSpan={5}>Loading…</RegisterEmpty>}
              {stats && stats.length === 0 && <RegisterEmpty colSpan={5}>No dispatches yet.</RegisterEmpty>}
              {(stats ?? []).map(s => (
                <RegisterRow key={s.insurer}>
                  <RegisterCell first title={s.insurer} primary={s.insurer} secondary={`${s.requested} request${s.requested === 1 ? '' : 's'}`} />
                  <RegisterCell align="right" primary={s.replied} />
                  <RegisterCell align="right" primary={s.quoted} secondary={`${s.quote_rate}% quote rate`} />
                  <RegisterCell align="right" primary={s.avg_response_days != null ? `${s.avg_response_days} days` : '—'} />
                  <RegisterCell last align="right" primary={s.won} secondary={`${s.win_rate}% selection rate`} />
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        </div>
      </CardContent>
    </Card>
  )
}
