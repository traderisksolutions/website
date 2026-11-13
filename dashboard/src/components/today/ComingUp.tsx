'use client'

/**
 * Coming up: what falls due from today to 90 days out, as one list in horizon groups: Overdue,
 * Today, Next 15 days, 16 to 30, 31 to 45, 46 to 90. Renewals (the policy end date), debit notes
 * due, money past due and case steps, read from /api/calendar/events. Each row opens the client.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Chip, Spinner, Empty } from '@/components/crm/primitives'
import { fmtDate } from '@/components/assistant/shared'
import type { CalendarEvent } from '@/app/api/calendar/events/route'

type Horizon = 'overdue' | 'today' | 'd15' | 'd30' | 'd45' | 'd90'
const HORIZONS: { key: Horizon; label: string; from: number; to: number }[] = [
  { key: 'overdue', label: 'Overdue', from: -Infinity, to: -1 },
  { key: 'today', label: 'Today', from: 0, to: 0 },
  { key: 'd15', label: 'Next 15 days', from: 1, to: 15 },
  { key: 'd30', label: '16 to 30 days', from: 16, to: 30 },
  { key: 'd45', label: '31 to 45 days', from: 31, to: 45 },
  { key: 'd90', label: '46 to 90 days', from: 46, to: 90 },
]
type Kind = 'renewal' | 'payment' | 'step'
const KIND_LABEL: Record<Kind, string> = { renewal: 'Renewal', payment: 'Payment', step: 'Case step' }

type Row = { id: string; date: string; days: number; kind: Kind; companyId: string | null; company: string; what: string; detail: string | null; late: boolean; href?: string }

const isoToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)
const daysFrom = (today: string, iso: string) => Math.round((Date.parse(iso.slice(0, 10) + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000)
const money = (ccy: string, n: number) => `${ccy} ${n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** One row per thing due. Renewal warnings (90/45/30/15) are dropped: the horizon group is the warning. */
export function toRows(events: CalendarEvent[], today: string): Row[] {
  const out: Row[] = []
  for (const e of events) {
    if (e.type === 'renewal') {
      if (e.milestone !== 0) continue
      const d = daysFrom(today, e.date)
      out.push({ id: e.id, date: e.date, days: d, kind: 'renewal', companyId: e.companyId, company: e.companyName ?? 'Unfiled', what: [e.classOfInsurance ?? 'Policy', e.insurer].filter(Boolean).join(' · '), detail: e.policyNumber, late: d < 0, href: `/policies/${e.policyId}` })
    } else if (e.type === 'renewal_overdue') {
      out.push({ id: e.id, date: e.endDate, days: -e.daysOverdue, kind: 'renewal', companyId: e.companyId, company: e.companyName ?? 'Unfiled', what: [e.classOfInsurance ?? 'Policy', e.insurer].filter(Boolean).join(' · '), detail: e.policyNumber, late: true, href: `/policies/${e.policyId}` })
    } else if (e.type === 'debit_due') {
      if (e.status === 'paid') continue
      const d = daysFrom(today, e.date)
      out.push({ id: e.id, date: e.date, days: d, kind: 'payment', companyId: e.companyId, company: e.companyName ?? 'Unfiled', what: `${e.debitNoteNo} · ${money(e.currency, e.outstanding)} outstanding`, detail: [e.classOfInsurance, e.insurer].filter(Boolean).join(' · ') || null, late: d < 0, href: `/debit-notes?open=${e.debitNoteId}` })
    } else if (e.type === 'payment_overdue') {
      out.push({ id: e.id, date: e.dueDate, days: -e.daysOverdue, kind: 'payment', companyId: e.companyId, company: e.companyName ?? 'Unfiled', what: `${e.debitNoteNo} · ${money(e.currency, e.outstanding)} outstanding`, detail: [e.classOfInsurance, e.insurer].filter(Boolean).join(' · ') || null, late: true, href: `/debit-notes?open=${e.debitNoteId}` })
    } else if (e.type === 'case_step') {
      const d = daysFrom(today, e.date)
      out.push({ id: e.id, date: e.date, days: d, kind: 'step', companyId: e.companyId, company: e.companyName ?? 'Unfiled', what: e.action || 'Case step', detail: e.caseName, late: d < 0 })
    }
  }
  // One row per renewal: the overdue pin and the end-date milestone describe the same policy.
  const seen = new Set<string>()
  return out.filter(r => { const k = `${r.kind}|${r.what}|${r.detail ?? ''}|${r.company}`; if (seen.has(k)) return false; seen.add(k); return true })
    .sort((a, b) => a.days - b.days || a.company.localeCompare(b.company))
}

export function ComingUp() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = useMemo(isoToday, [])

  useEffect(() => {
    fetch(`/api/calendar/events?from=${addDays(today, -90)}&to=${addDays(today, 90)}`, { cache: 'no-store' })
      .then(async r => { if (!r.ok) throw new Error(`Could not load the dates (${r.status}).`); return r.json() as Promise<CalendarEvent[] | { events: CalendarEvent[] }> })
      .then(d => setEvents(Array.isArray(d) ? d : d.events ?? []))
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [today])

  // Overdue stops at 30 days: a renewal a year past its date is register hygiene (Companies, Overdue), not this week's work.
  const all = useMemo(() => events ? toRows(events, today).filter(r => r.days <= 90) : [], [events, today])
  const rows = useMemo(() => all.filter(r => r.days >= -30), [all])
  const older = all.length - rows.length
  const groups = HORIZONS.map(h => ({ ...h, rows: rows.filter(r => r.days >= h.from && r.days <= h.to) })).filter(g => g.rows.length > 0)

  if (error) return <p className="m-0 text-[13.5px] text-trs-neg">{error}</p>
  if (!events) return <Spinner label="Loading what is coming up…" />
  if (rows.length === 0 && older === 0) return <Empty>Nothing due in the next 90 days.</Empty>

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[13px] text-trs-muted tabular-nums">
        {HORIZONS.map(h => `${rows.filter(r => r.days >= h.from && r.days <= h.to).length} ${h.label.toLowerCase()}`).join(' · ')}
        {older > 0 && <> · <Link href="/companies?renewal=overdue" className="text-trs-ink">{older} overdue over 30 days</Link></>}
      </p>
      {rows.length === 0 && <Empty>Nothing due in the next 90 days.</Empty>}
      <div className="rounded-[10px] border border-trs-line bg-white overflow-hidden">
        {groups.map(g => (
          <section key={g.key} aria-label={g.label}>
            <div className="flex items-center justify-between px-4 h-9 bg-trs-canvas border-b border-trs-line">
              <h2 className="m-0 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-trs-muted">{g.label}</h2>
              <span className="font-mono text-[11.5px] text-trs-muted">{g.rows.length}</span>
            </div>
            {g.rows.map(r => (
              <div key={r.id} className="grid grid-cols-[72px_minmax(0,1fr)] md:grid-cols-[88px_minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-start px-4 py-2.5 border-b border-trs-line last:border-b-0">
                <span className={`font-mono text-[12px] tabular-nums pt-[2px] ${r.late ? 'text-trs-neg' : 'text-trs-muted'}`}>{fmtDate(r.date)}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {r.companyId ? <Link href={`/companies/${r.companyId}`} className="text-[14px] font-medium text-trs-ink no-underline hover:underline truncate">{r.company}</Link> : <span className="text-[14px] font-medium text-trs-ink truncate">{r.company}</span>}
                    <Chip tone={r.late ? 'red' : r.days === 0 ? 'amber' : 'neutral'}>{KIND_LABEL[r.kind]}</Chip>
                  </div>
                  <div className="text-[13px] text-trs-ink-2 truncate">{r.href ? <Link href={r.href} className="text-trs-ink-2 no-underline hover:underline">{r.what}</Link> : r.what}{r.detail ? <span className="text-trs-muted"> · {r.detail}</span> : null}</div>
                </div>
                <span className="col-start-2 md:col-start-auto text-[12.5px] text-trs-muted tabular-nums whitespace-nowrap">{r.days < 0 ? `${-r.days} day${r.days === -1 ? '' : 's'} late` : r.days === 0 ? 'Today' : `in ${r.days} day${r.days === 1 ? '' : 's'}`}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
