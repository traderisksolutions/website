'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Btn, LinkBtn, Chip, Segmented, Spinner } from '@/components/crm/primitives'
import { cn } from '@/lib/utils'
import { openEngagementCompose } from '@/lib/engagement-handoff'
import { nowSGT, todaySGT } from '@/lib/sgt-time'
import type { CalendarEvent } from '@/app/api/calendar/events/route'
import { RENEWAL_WINDOWS, inRenewalWindow, type RenewalWindow } from '@/lib/crm/renewal'

const INK = '#202124'
const MUTED = '#5f6368'
const FAINT = '#9aa0a6'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Local calendar date as YYYY-MM-DD — NOT d.toISOString().slice(0,10), which converts to UTC first
// and silently shifts the date by a day in any timezone ahead of UTC (e.g. SGT/UTC+8: local
// midnight on the 1st is 16:00 UTC the day before). That bug made month-boundary events (like a
// policy renewing on the 31st) appear under the wrong month, and misaligned day-cell lookups too.
function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Inverse of toISODate — parses via local Y/M/D components, NOT `new Date(isoString)`, which
// treats a bare YYYY-MM-DD as UTC midnight and can render as the wrong day once formatted back
// through the runtime's local timezone (same class of bug as the toISODate comment above).
function fromISODate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function isSameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }

// ── Two dots only. Ink for a renewal milestone; faint grey for everything else (a policy that
// has ended, a payment, a case step). The kind is named in words on the row. ──
function eventDot(e: CalendarEvent): string {
  return e.type === 'renewal' ? INK : FAINT
}

/** What the row says, in words, so the dot never has to carry meaning. */
function eventKind(e: CalendarEvent): string {
  if (e.type === 'renewal') return e.label
  if (e.type === 'payment_overdue') return 'Payment past due'
  if (e.type === 'renewal_overdue') return 'Policy ended'
  if (e.type === 'case_step') return 'Case step'
  return e.date.slice(0, 10) < todaySGT() ? 'Payment past due' : 'Payment due'
}

const LEGEND: { dot: string; label: string }[] = [
  { dot: INK,   label: 'Renewal (today, 14, 30 or 60 days out)' },
  { dot: FAINT, label: 'Policy ended · Payment due · Payment past due · Case step' },
]

export default function CalendarPage() {
  const [viewDate, setViewDate] = useState(() => {
    // /calendar?date=YYYY-MM-DD lands on that month — how a company page or the Companies
    // drawer hands off to the calendar.
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('date')
      if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) { const [y, m] = q.split('-').map(Number); return new Date(y, m - 1, 1) }
    }
    const d = nowSGT(); d.setDate(1); return d
  })
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([])
  const [renewalWin, setRenewalWin] = useState<RenewalWindow>('all')
  // Renewal filter uses the same windows as the Companies tab, so "Within 30 days" means the
  // same thing on both screens. Everything that is not a renewal always shows.
  const events = useMemo(() => {
    if (renewalWin === 'all') return allEvents
    const today = todaySGT()
    return allEvents.filter(e => {
      if (e.type === 'renewal_overdue') return renewalWin === 'overdue'
      if (e.type !== 'renewal') return true
      const end = e.date.slice(0, 10)
      const endDate = new Date(end); endDate.setDate(endDate.getDate() + e.milestone)
      return inRenewalWindow(endDate.toISOString().slice(0, 10), today, renewalWin)
    })
  }, [allEvents, renewalWin])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  useEffect(() => {
    const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
    const monthEnd   = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0)
    setLoading(true)
    fetch(`/api/calendar/events?from=${toISODate(monthStart)}&to=${toISODate(monthEnd)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: CalendarEvent[]) => setAllEvents(Array.isArray(rows) ? rows : []))
      .finally(() => setLoading(false))
  }, [viewDate])

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const key = e.date.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return map
  }, [events])

  const today = nowSGT()
  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()
  const leadingBlanks = monthStart.getDay()
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewDate.getFullYear(), viewDate.getMonth(), i + 1)),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const daysWithEvents = Array.from(byDay.keys()).sort()
  const monthKey = `${viewDate.getFullYear()}-${viewDate.getMonth()}`

  function goto(delta: number) { setViewDate(d => new Date(d.getFullYear(), d.getMonth() + delta, 1)) }
  function gotoToday() { const d = nowSGT(); d.setDate(1); setViewDate(d) }

  const navBtn = 'w-10 h-10 inline-flex items-center justify-center rounded-[10px] border bg-white cursor-pointer hover:bg-[#f8f9fa]'

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">
              {MONTHS[viewDate.getMonth()]} <span className="font-normal" style={{ color: MUTED }}>{viewDate.getFullYear()}</span>
            </h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
              {loading ? 'Loading…' : `${events.length} item${events.length === 1 ? '' : 's'} this month`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => goto(-1)} aria-label="Previous month" className={navBtn} style={{ borderColor: '#dadce0', color: INK }}><ChevronLeft size={16} /></button>
            <button type="button" onClick={() => goto(1)} aria-label="Next month" className={navBtn} style={{ borderColor: '#dadce0', color: INK }}><ChevronRight size={16} /></button>
            <Btn level="secondary" className="h-10 px-4" onClick={gotoToday}>Today</Btn>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-4 flex-wrap">
          <Segmented
            value={renewalWin}
            onChange={setRenewalWin}
            options={RENEWAL_WINDOWS.filter(w => w.key !== 'none').map(w => ({ value: w.key, label: w.key === 'all' ? 'All renewals' : w.label }))}
          />
          <Link href="/companies" className="ml-auto text-[14px] no-underline hover:underline" style={{ color: MUTED }}>Companies by renewal →</Link>
        </div>

        {loading && <Spinner />}

        {!loading && (
          <div key={monthKey} className="animate-fade-in mt-8">
            {/* Desktop / tablet month grid */}
            <div className="hidden sm:block">
              <div className="grid grid-cols-7 border-b border-[#e8eaed]">
                {WEEKDAYS.map(w => <div key={w} className="text-center py-2 text-[12px] font-medium" style={{ color: MUTED }}>{w}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((d, i) => {
                  const dayEvents = d ? byDay.get(toISODate(d)) ?? [] : []
                  const isToday = d && isSameDay(d, today)
                  const visible = dayEvents.slice(0, 3)
                  const overflow = dayEvents.length - visible.length
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!d}
                      onClick={() => d && setSelectedDate(d)}
                      className={cn('flex flex-col items-stretch gap-1 py-2 px-1.5 text-left min-h-[96px] bg-transparent border-0 border-b border-[#e8eaed]', d ? 'hover:bg-[#f8f9fa] cursor-pointer' : '')}
                    >
                      {d && (
                        <>
                          <span className={cn('w-7 h-7 flex items-center justify-center rounded-full text-[13px] self-end tabular-nums', isToday ? 'font-medium text-white' : '')} style={{ background: isToday ? INK : 'transparent', color: isToday ? '#fff' : INK }}>
                            {d.getDate()}
                          </span>
                          <div className="flex flex-col gap-0.5">
                            {visible.map(e => (
                              <span key={e.id} className="flex items-center gap-1.5 rounded-[6px] px-1.5 py-[3px] text-[11.5px] font-medium leading-none" style={{ background: '#f1f3f4', color: '#3c4043' }} title={eventKind(e)}>
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: eventDot(e) }} aria-hidden />
                                <span className="truncate">{e.companyName ?? eventKind(e)}</span>
                              </span>
                            ))}
                            {overflow > 0 && (
                              <span className="text-[11.5px] px-1.5" style={{ color: MUTED }}>+{overflow} more</span>
                            )}
                          </div>
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Mobile agenda list */}
            <div className="sm:hidden flex flex-col">
              {daysWithEvents.length === 0 && <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>Nothing due this month.</p>}
              {daysWithEvents.map(key => {
                const d = fromISODate(key)
                const dayEvents = byDay.get(key)!
                return (
                  <button key={key} type="button" onClick={() => setSelectedDate(d)} className="flex items-center justify-between py-3 text-left bg-transparent border-0 border-b border-[#e8eaed] cursor-pointer hover:bg-[#f8f9fa]">
                    <span className="text-[14px]" style={{ color: INK }}>{d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    <span className="flex items-center gap-1.5">
                      {dayEvents.slice(0, 3).map(e => <span key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ background: eventDot(e) }} aria-hidden />)}
                      <span className="text-[13px] ml-1 tabular-nums" style={{ color: MUTED }}>{dayEvents.length}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            {events.length === 0 && (
              <p className="hidden sm:block py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>Nothing due this month.</p>
            )}

            {/* Legend: two dots, kinds in words. */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-6 pt-4 border-t border-[#e8eaed]">
              {LEGEND.map(l => (
                <div key={l.label} className="flex items-center gap-2 text-[12.5px]" style={{ color: MUTED }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: l.dot }} aria-hidden /> {l.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedDate && (
          <DayDetailModal
            date={selectedDate}
            events={byDay.get(toISODate(selectedDate)) ?? []}
            onClose={() => setSelectedDate(null)}
          />
        )}
      </div>
    </div>
  )
}

function DayDetailModal({ date, events, onClose }: { date: Date; events: CalendarEvent[]; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{date.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</DialogTitle></DialogHeader>
        {events.length === 0 ? (
          <p className="text-[14px] py-6 text-center m-0" style={{ color: MUTED }}>Nothing due this day.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {events.map(e =>
              e.type === 'renewal'         ? <RenewalCard key={e.id} e={e} />
              : e.type === 'payment_overdue' ? <PaymentOverdueCard key={e.id} e={e} />
              : e.type === 'renewal_overdue' ? <RenewalOverdueCard key={e.id} e={e} />
              : e.type === 'case_step'       ? <CaseStepCard key={e.id} e={e} />
              : <DebitDueCard key={e.id} e={e} />)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** One event in the day panel: a title row with the kind as a neutral chip, facts, then actions. */
function EventCard({ dot, title, kind, facts, children }: { dot: string; title: string; kind: string; facts: string[]; children?: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-[#e8eaed] bg-white p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap text-[14px] font-medium" style={{ color: INK }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} aria-hidden />
        <span className="truncate">{title}</span>
        <Chip className="ml-auto">{kind}</Chip>
      </div>
      <div className="text-[13px] grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5" style={{ color: MUTED }}>
        {facts.map((f, i) => <span key={i}>{f}</span>)}
      </div>
      {children}
    </div>
  )
}

function RenewalCard({ e }: { e: Extract<CalendarEvent, { type: 'renewal' }> }) {
  const [sending, setSending] = useState(false)

  async function generateRenewalEmail() {
    setSending(true)
    try {
      openEngagementCompose({
        toEmail: '', // recipient email not resolved here — user picks in the composer
        subject: `Policy renewal — ${e.policyNumber ?? e.classOfInsurance ?? 'your policy'} (${e.companyName ?? ''})`,
        body: `Dear Sir/Madam,\n\nThis is a reminder that your ${e.classOfInsurance ?? 'insurance'} policy${e.policyNumber ? ` (${e.policyNumber})` : ''} with ${e.insurer ?? 'your insurer'} is due for renewal on ${fromISODate(e.date.slice(0, 10)).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })}.\n\nPlease let us know if you would like us to proceed with the renewal.\n\nThank you.`,
      })
    } finally { setSending(false) }
  }

  return (
    <EventCard dot={INK} title={e.companyName ?? 'Unknown company'} kind={e.label} facts={[
      `Policy: ${e.policyNumber || '—'}`,
      `Insurer: ${e.insurer || '—'}`,
      `Class: ${e.classOfInsurance || '—'}`,
      `Premium: ${e.premium != null ? `${e.currency} ${e.premium.toLocaleString('en-SG', { minimumFractionDigits: 2 })}` : '—'}`,
    ]}>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <Btn size="xs" level="secondary" onClick={generateRenewalEmail} disabled={sending}>Draft renewal email</Btn>
        <LinkBtn size="xs" level="secondary" href="/debit-notes/new">New debit note</LinkBtn>
        {e.companyId && (
          <Link href={`/companies?company=${e.companyId}`} className="text-[13px] no-underline hover:underline ml-auto" style={{ color: MUTED }}>Open company →</Link>
        )}
      </div>
    </EventCard>
  )
}

function RenewalOverdueCard({ e }: { e: Extract<CalendarEvent, { type: 'renewal_overdue' }> }) {
  return (
    <EventCard dot={FAINT} title={e.companyName ?? 'Unknown company'} kind={`Ended ${e.daysOverdue} days ago`} facts={[
      `Policy: ${e.policyNumber || '—'}`,
      `Insurer: ${e.insurer || '—'}`,
      `Class: ${e.classOfInsurance || '—'}`,
      `Ended: ${e.endDate}`,
    ]}>
      <p className="text-[13px] m-0" style={{ color: MUTED }}>Still marked active. Either the renewal was placed and not recorded, or it lapsed.</p>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <LinkBtn size="xs" level="secondary" href={`/companies?company=${e.companyId ?? ''}`}>Open company</LinkBtn>
        <Link href={`/debit-notes?company_id=${e.companyId ?? ''}`} className="text-[13px] no-underline hover:underline ml-auto" style={{ color: MUTED }}>Debit notes →</Link>
      </div>
    </EventCard>
  )
}

function DebitDueCard({ e }: { e: Extract<CalendarEvent, { type: 'debit_due' }> }) {
  const overdue = e.date.slice(0, 10) < todaySGT()
  return (
    <EventCard dot={FAINT} title={e.companyName ?? 'Unknown company'} kind={overdue ? 'Payment past due' : 'Payment due'} facts={[
      `Debit note: ${e.debitNoteNo}`,
      `Insurer: ${e.insurer || '—'}`,
      `Policy: ${e.policyNumber || e.classOfInsurance || '—'}`,
      `To collect: ${e.currency} ${e.outstanding.toLocaleString('en-SG', { minimumFractionDigits: 2 })}`,
    ]}>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <LinkBtn size="xs" level="secondary" href={`/debit-notes?company_id=${e.companyId ?? ''}&open=${e.debitNoteId}`}>View debit note</LinkBtn>
      </div>
    </EventCard>
  )
}

function PaymentOverdueCard({ e }: { e: Extract<CalendarEvent, { type: 'payment_overdue' }> }) {
  return (
    <EventCard dot={FAINT} title={e.companyName ?? 'Unknown company'} kind={`${e.daysOverdue} days past due`} facts={[
      `Debit note: ${e.debitNoteNo}`,
      `Was due: ${e.dueDate}`,
      `Cover: ${e.classOfInsurance || '—'}`,
      `To collect: ${e.currency} ${e.outstanding.toLocaleString('en-SG', { minimumFractionDigits: 2 })}`,
    ]}>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <LinkBtn size="xs" level="secondary" href="/finance">Record payment</LinkBtn>
        {e.companyId && (
          <LinkBtn size="xs" level="tertiary" href={`/companies/${e.companyId}?tab=payments`}>Open the client</LinkBtn>
        )}
      </div>
    </EventCard>
  )
}

function CaseStepCard({ e }: { e: Extract<CalendarEvent, { type: 'case_step' }> }) {
  return (
    <EventCard dot={FAINT} title={e.companyName ?? e.caseName ?? 'Case'} kind={e.priority ? `Case step · ${e.priority}` : 'Case step'} facts={[
      `Case: ${e.caseName || '—'}`,
      `Owner: ${e.owner || 'unassigned'}`,
    ]}>
      <p className="text-[14px] m-0" style={{ color: INK }}>{e.action}</p>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <LinkBtn size="xs" level="secondary" href={`/nexus?case=${e.caseId}`}>Open the case</LinkBtn>
      </div>
    </EventCard>
  )
}
