'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'

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
      <CardHeader>
        <CardTitle>RFQ Operations</CardTitle>
        <CardDescription>
          The quote-chase SLA and insurer responsiveness. When an insurer hasn’t replied within the SLA,
          the RFQ view flags it as overdue so you can chase — nothing is ever sent automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground/80">Chase SLA (days)</span>
            <Input type="number" min={1} value={days} onChange={e => setDays(e.target.value)} className="w-28" />
          </label>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          {saved && <span className="text-xs text-emerald-600 font-medium mb-2">Saved ✓</span>}
        </div>

        {/* Pipeline funnel + win metrics (#4) */}
        {funnel && funnel.funnel.requested > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Pipeline</span>
            <div className="flex flex-wrap items-stretch gap-2">
              {([
                { l: 'Requested',   v: funnel.funnel.requested },
                { l: 'Dispatched',  v: funnel.funnel.dispatched },
                { l: 'Quoted',      v: funnel.funnel.quoted },
                { l: 'Recommended', v: funnel.funnel.recommended },
                { l: 'Won',         v: funnel.funnel.won,  tone: 'emerald' },
                { l: 'Lost',        v: funnel.funnel.lost, tone: 'rose' },
              ] as { l: string; v: number; tone?: string }[]).map(s => (
                <div key={s.l} className={`flex flex-col items-center justify-center rounded-lg border px-4 py-2 min-w-[84px] ${
                  s.tone === 'emerald' ? 'border-emerald-200 bg-emerald-50/60' : s.tone === 'rose' ? 'border-rose-200 bg-rose-50/50' : 'border-border bg-muted/20'}`}>
                  <span className="text-[18px] font-bold text-foreground leading-none">{s.v}</span>
                  <span className="text-[9.5px] uppercase tracking-wider text-muted-foreground/60 mt-1">{s.l}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground mt-0.5">
              <span>Win rate <b className="text-foreground">{funnel.win_rate}%</b> <span className="text-muted-foreground/50">(of decided)</span></span>
              <span>Quote conversion <b className="text-foreground">{funnel.quote_conversion}%</b></span>
              <span>In flight <b className="text-foreground">{funnel.in_flight}</b></span>
              {funnel.avg_time_to_quote_days != null && <span>Avg time-to-quote <b className="text-foreground">{funnel.avg_time_to_quote_days}d</b></span>}
              {funnel.avg_time_to_decision_days != null && <span>Avg time-to-decision <b className="text-foreground">{funnel.avg_time_to_decision_days}d</b></span>}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Insurer scoreboard</span>
          {stats === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : stats.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dispatches yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground/60 bg-muted/30">
                    <th className="py-2 px-3 font-semibold">Insurer</th>
                    <th className="py-2 px-3 font-semibold">Requested</th>
                    <th className="py-2 px-3 font-semibold">Replied</th>
                    <th className="py-2 px-3 font-semibold">Quoted</th>
                    <th className="py-2 px-3 font-semibold">Quote rate</th>
                    <th className="py-2 px-3 font-semibold">Avg reply</th>
                    <th className="py-2 px-3 font-semibold">Won</th>
                    <th className="py-2 px-3 font-semibold">Win rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.map(s => (
                    <tr key={s.insurer}>
                      <td className="py-2 px-3 font-medium text-foreground">{s.insurer}</td>
                      <td className="py-2 px-3 text-muted-foreground">{s.requested}</td>
                      <td className="py-2 px-3 text-muted-foreground">{s.replied}</td>
                      <td className="py-2 px-3 text-muted-foreground">{s.quoted}</td>
                      <td className="py-2 px-3 text-muted-foreground">{s.quote_rate}%</td>
                      <td className="py-2 px-3 text-muted-foreground">{s.avg_response_days != null ? `${s.avg_response_days}d` : '—'}</td>
                      <td className="py-2 px-3 text-muted-foreground">{s.won}</td>
                      <td className="py-2 px-3 text-muted-foreground">{s.win_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
