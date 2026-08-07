'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Loader2, Send, FileText, Building2, Receipt } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { openEngagementCompose } from '@/lib/engagement-handoff'
import type { CalendarEvent } from '@/app/api/calendar/events/route'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Local calendar date as YYYY-MM-DD — NOT d.toISOString().slice(0,10), which converts to UTC first
// and silently shifts the date by a day in any timezone ahead of UTC (e.g. SGT/UTC+8: local
// midnight on the 1st is 16:00 UTC the day before). That bug made month-boundary events (like a
// policy renewing on the 31st) appear under the wrong month, and misaligned day-cell lookups too.
function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isSameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }

// ── Dot color per event category — kept as a single lookup so the legend below and the day
// cells can never drift out of sync with each other. Renewal color is a direct lookup on the
// fixed milestone (0/14/30/60 days-to-go), not a live "days until today" computation — the
// milestone date itself is what's fixed, so the color shouldn't drift as today changes. ────────
function milestoneStyle(milestone: 0 | 14 | 30 | 60): { dot: string; bg: string; text: string } {
  if (milestone === 0)  return { dot: 'bg-rose-600',  bg: 'bg-rose-50',   text: 'text-rose-700' }
  if (milestone === 14) return { dot: 'bg-rose-500',  bg: 'bg-rose-50',   text: 'text-rose-700' }
  if (milestone === 30) return { dot: 'bg-amber-500', bg: 'bg-amber-50',  text: 'text-amber-700' }
  return { dot: 'bg-slate-400', bg: 'bg-slate-100', text: 'text-slate-600' }
}

function eventColor(e: CalendarEvent): string {
  if (e.type === 'renewal') return milestoneStyle(e.milestone).dot
  const overdue = new Date(e.date).getTime() < new Date(new Date().toDateString()).getTime()
  return overdue ? 'bg-orange-500' : 'bg-blue-500'
}

// Same categories as eventColor, but as a chip (dot + tinted background) for the month grid's
// stacked "invite" rows — Google Calendar-style, so a busy day reads at a glance.
function eventChipStyle(e: CalendarEvent): { dot: string; bg: string; text: string } {
  if (e.type === 'renewal') return milestoneStyle(e.milestone)
  const overdue = new Date(e.date).getTime() < new Date(new Date().toDateString()).getTime()
  return overdue
    ? { dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-700' }
    : { dot: 'bg-blue-500',   bg: 'bg-blue-50',   text: 'text-blue-700' }
}

const LEGEND = [
  { color: 'bg-rose-600',   label: 'Renews today (D-Day)' },
  { color: 'bg-rose-500',   label: 'Renewal in 14 days' },
  { color: 'bg-amber-500',  label: 'Renewal in 30 days' },
  { color: 'bg-slate-400',  label: 'Renewal in 60 days' },
  { color: 'bg-orange-500', label: 'Debit note payment overdue' },
  { color: 'bg-blue-500',   label: 'Debit note payment upcoming' },
]

export default function CalendarPage() {
  const [viewDate, setViewDate] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  useEffect(() => {
    const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
    const monthEnd   = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0)
    setLoading(true)
    fetch(`/api/calendar/events?from=${toISODate(monthStart)}&to=${toISODate(monthEnd)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: CalendarEvent[]) => setEvents(Array.isArray(rows) ? rows : []))
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

  const today = new Date()
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
  function gotoToday() { const d = new Date(); d.setDate(1); setViewDate(d) }

  return (
    <div className="min-h-screen bg-white">
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[19px] font-semibold tracking-tight text-foreground">{MONTHS[viewDate.getMonth()]} <span className="font-normal text-muted-foreground/70">{viewDate.getFullYear()}</span></h1>
        <div className="flex items-center gap-1">
          <button onClick={() => goto(-1)} aria-label="Previous month" className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors duration-150"><ChevronLeft size={15} /></button>
          <button onClick={() => goto(1)} aria-label="Next month" className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors duration-150"><ChevronRight size={15} /></button>
          <Button variant="ghost" size="sm" onClick={gotoToday} className="ml-1.5 text-[12.5px] font-medium rounded-full">Today</Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 size={18} className="animate-spin" /></div>
      )}

      {!loading && (
        <div key={monthKey} className="animate-fade-in">
          {/* Desktop / tablet month grid */}
          <div className="hidden sm:block">
            <div className="grid grid-cols-7">
              {WEEKDAYS.map(w => <div key={w} className="text-center py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/50">{w}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {cells.map((d, i) => {
                const dayEvents = d ? byDay.get(toISODate(d)) ?? [] : []
                const isToday = d && isSameDay(d, today)
                const visible = dayEvents.slice(0, 3)
                const overflow = dayEvents.length - visible.length
                return (
                  <button
                    key={i}
                    disabled={!d}
                    onClick={() => d && setSelectedDate(d)}
                    className={`flex flex-col items-stretch gap-1 py-2 px-1 rounded-xl text-left transition-colors duration-150 min-h-[92px] ${d ? 'hover:bg-accent/50 cursor-pointer' : ''}`}
                  >
                    {d && (
                      <>
                        <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[12.5px] self-center transition-colors duration-150 ${isToday ? 'bg-primary/10 text-primary font-medium' : 'text-foreground/80 font-normal'}`}>
                          {d.getDate()}
                        </span>
                        <div className="flex flex-col gap-0.5">
                          {visible.map(e => {
                            const style = eventChipStyle(e)
                            return (
                              <span key={e.id} className={`flex items-center gap-1 rounded px-1 py-[3px] text-[10px] font-medium leading-none ${style.bg} ${style.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
                                <span className="truncate">{e.companyName ?? '—'}</span>
                              </span>
                            )
                          })}
                          {overflow > 0 && (
                            <span className="text-[10px] text-muted-foreground/70 px-1">+{overflow} more</span>
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
          <div className="sm:hidden flex flex-col gap-2">
            {daysWithEvents.length === 0 && <p className="text-[12.5px] text-muted-foreground py-8 text-center">No policies or debit notes due this month.</p>}
            {daysWithEvents.map(key => {
              const d = new Date(key)
              const dayEvents = byDay.get(key)!
              return (
                <button key={key} onClick={() => setSelectedDate(d)} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-accent/50 transition-colors duration-150">
                  <span className="text-[12.5px] font-medium">{d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <div className="flex items-center gap-1">
                    {dayEvents.slice(0, 3).map(e => <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${eventColor(e)}`} />)}
                    <span className="text-[11px] text-muted-foreground ml-1">{dayEvents.length}</span>
                  </div>
                </button>
              )
            })}
          </div>

          {events.length === 0 && (
            <p className="hidden sm:block text-[12.5px] text-muted-foreground text-center mt-6">No policies or debit notes due this month.</p>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-6 pt-4 border-t border-[--border-subtle]">
            {LEGEND.map(l => (
              <div key={l.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={`w-1.5 h-1.5 rounded-full ${l.color}`} /> {l.label}
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
      <DialogContent className="sm:max-w-[520px] max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{date.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</DialogTitle></DialogHeader>
        {events.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground py-4">Nothing due this day.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {events.map(e => e.type === 'renewal' ? <RenewalCard key={e.id} e={e} /> : <DebitDueCard key={e.id} e={e} />)}
          </div>
        )}
      </DialogContent>
    </Dialog>
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
        body: `Dear Sir/Madam,\n\nThis is a reminder that your ${e.classOfInsurance ?? 'insurance'} policy${e.policyNumber ? ` (${e.policyNumber})` : ''} with ${e.insurer ?? 'your insurer'} is due for renewal on ${new Date(e.date).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })}.\n\nPlease let us know if you would like us to proceed with the renewal.\n\nThank you.`,
      })
    } finally { setSending(false) }
  }

  return (
    <div className="rounded-lg border border-[--border-subtle] p-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${milestoneStyle(e.milestone).dot}`} />
        <Building2 size={13} className="text-muted-foreground/60" /> {e.companyName ?? 'Unknown company'}
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50">{e.label}</span>
      </div>
      <div className="text-[11.5px] text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span>Policy: {e.policyNumber || '—'}</span>
        <span>Insurer: {e.insurer || '—'}</span>
        <span>Class: {e.classOfInsurance || '—'}</span>
        <span>Premium: {e.premium != null ? `${e.currency} ${e.premium.toLocaleString('en-SG', { minimumFractionDigits: 2 })}` : '—'}</span>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <Button variant="outline" size="xs" onClick={generateRenewalEmail} disabled={sending}>
          <Send size={11} className="mr-1.5" /> Generate renewal email
        </Button>
        <Link href="/debit-notes/new">
          <Button variant="outline" size="xs"><FileText size={11} className="mr-1.5" /> Generate Debit Note</Button>
        </Link>
        {e.companyId && (
          <Link href={`/debit-notes?company_id=${e.companyId}`} className="text-[11px] text-primary hover:underline ml-auto">View client →</Link>
        )}
      </div>
    </div>
  )
}

function DebitDueCard({ e }: { e: Extract<CalendarEvent, { type: 'debit_due' }> }) {
  const overdue = new Date(e.date).getTime() < new Date(new Date().toDateString()).getTime()
  return (
    <div className="rounded-lg border border-[--border-subtle] p-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${overdue ? 'bg-orange-500' : 'bg-blue-500'}`} />
        <Building2 size={13} className="text-muted-foreground/60" /> {e.companyName ?? 'Unknown company'}
        <span className={`ml-auto text-[10px] font-semibold uppercase tracking-wide ${overdue ? 'text-orange-600' : 'text-blue-600'}`}>{overdue ? 'Overdue' : 'Payment due'}</span>
      </div>
      <div className="text-[11.5px] text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span>Debit note: {e.debitNoteNo}</span>
        <span>Insurer: {e.insurer || '—'}</span>
        <span>Policy: {e.policyNumber || e.classOfInsurance || '—'}</span>
        <span>Amount: {e.currency} {e.grossAmount.toLocaleString('en-SG', { minimumFractionDigits: 2 })}</span>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <Link href={`/debit-notes?company_id=${e.companyId ?? ''}&open=${e.debitNoteId}`}>
          <Button variant="outline" size="xs"><Receipt size={11} className="mr-1.5" /> View debit note</Button>
        </Link>
      </div>
    </div>
  )
}
