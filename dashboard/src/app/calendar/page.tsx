'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Loader2, Send, FileText, Building2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { openEngagementCompose } from '@/lib/engagement-handoff'

type PolicyDue = {
  id: string; policyNumber: string | null; insurer: string | null; classOfInsurance: string | null
  currency: string; premium: number | null; endDate: string; companyId: string | null; companyName: string | null
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toISODate(d: Date) { return d.toISOString().slice(0, 10) }
function isSameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }

function urgencyColor(endDate: string): string {
  const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000)
  if (days < 7) return 'bg-rose-500'
  if (days < 30) return 'bg-amber-500'
  return 'bg-slate-400'
}

export default function CalendarPage() {
  const [viewDate, setViewDate] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [policies, setPolicies] = useState<PolicyDue[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  useEffect(() => {
    const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
    const monthEnd   = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0)
    setLoading(true)
    fetch(`/api/calendar/policies?from=${toISODate(monthStart)}&to=${toISODate(monthEnd)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: PolicyDue[]) => setPolicies(Array.isArray(rows) ? rows : []))
      .finally(() => setLoading(false))
  }, [viewDate])

  const byDay = useMemo(() => {
    const map = new Map<string, PolicyDue[]>()
    for (const p of policies) {
      const key = p.endDate.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return map
  }, [policies])

  const today = new Date()
  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()
  const leadingBlanks = monthStart.getDay()
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewDate.getFullYear(), viewDate.getMonth(), i + 1)),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const daysWithPolicies = Array.from(byDay.keys()).sort()

  function goto(delta: number) { setViewDate(d => new Date(d.getFullYear(), d.getMonth() + delta, 1)) }
  function gotoToday() { const d = new Date(); d.setDate(1); setViewDate(d) }

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[18px] font-semibold text-foreground">Calendar</h1>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon-sm" onClick={() => goto(-1)} aria-label="Previous month"><ChevronLeft size={14} /></Button>
          <span className="text-[13px] font-medium w-36 text-center">{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
          <Button variant="outline" size="icon-sm" onClick={() => goto(1)} aria-label="Next month"><ChevronRight size={14} /></Button>
          <Button variant="outline" size="sm" onClick={gotoToday} className="ml-1">Today</Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 size={18} className="animate-spin" /></div>
      )}

      {!loading && (
        <>
          {/* Desktop / tablet month grid */}
          <div className="hidden sm:block border border-[--border-subtle] rounded-xl overflow-hidden">
            <div className="grid grid-cols-7 bg-muted/40">
              {WEEKDAYS.map(w => <div key={w} className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/60 text-center">{w}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((d, i) => {
                const dues = d ? byDay.get(toISODate(d)) ?? [] : []
                const isToday = d && isSameDay(d, today)
                return (
                  <button
                    key={i}
                    disabled={!d}
                    onClick={() => d && setSelectedDate(d)}
                    className={`h-20 border-t border-l border-[--border-subtle] p-1.5 flex flex-col items-start text-left ${d ? 'hover:bg-accent/40 cursor-pointer' : 'bg-muted/10'} ${i % 7 === 6 ? '' : ''}`}
                  >
                    {d && (
                      <>
                        <span className={`text-[11.5px] w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-primary-foreground font-semibold' : 'text-foreground/80'}`}>{d.getDate()}</span>
                        {dues.length > 0 && (
                          <div className="flex items-center gap-0.5 mt-auto">
                            {dues.slice(0, 3).map(p => <span key={p.id} className={`w-1.5 h-1.5 rounded-full ${urgencyColor(p.endDate)}`} />)}
                          </div>
                        )}
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Mobile agenda list */}
          <div className="sm:hidden flex flex-col gap-2">
            {daysWithPolicies.length === 0 && <p className="text-[12.5px] text-muted-foreground py-8 text-center">No policies due this month.</p>}
            {daysWithPolicies.map(key => {
              const d = new Date(key)
              const dues = byDay.get(key)!
              return (
                <button key={key} onClick={() => setSelectedDate(d)} className="flex items-center justify-between rounded-lg border border-[--border-subtle] px-3 py-2.5 text-left hover:bg-accent/40">
                  <span className="text-[12.5px] font-medium">{d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <div className="flex items-center gap-1">
                    {dues.slice(0, 3).map(p => <span key={p.id} className={`w-1.5 h-1.5 rounded-full ${urgencyColor(p.endDate)}`} />)}
                    <span className="text-[11px] text-muted-foreground ml-1">{dues.length} due</span>
                  </div>
                </button>
              )
            })}
          </div>

          {policies.length === 0 && (
            <p className="hidden sm:block text-[12.5px] text-muted-foreground text-center mt-4">No policies due this month.</p>
          )}
        </>
      )}

      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          policies={byDay.get(toISODate(selectedDate)) ?? []}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  )
}

function DayDetailModal({ date, policies, onClose }: { date: Date; policies: PolicyDue[]; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[520px] max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{date.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</DialogTitle></DialogHeader>
        {policies.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground py-4">No policies due this day.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {policies.map(p => <PolicyDueCard key={p.id} p={p} />)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PolicyDueCard({ p }: { p: PolicyDue }) {
  const [sending, setSending] = useState(false)

  async function generateRenewalEmail() {
    setSending(true)
    try {
      openEngagementCompose({
        toEmail: '', // recipient email not resolved here — user picks in the composer
        subject: `Policy renewal — ${p.policyNumber ?? p.classOfInsurance ?? 'your policy'} (${p.companyName ?? ''})`,
        body: `Dear Sir/Madam,\n\nThis is a reminder that your ${p.classOfInsurance ?? 'insurance'} policy${p.policyNumber ? ` (${p.policyNumber})` : ''} with ${p.insurer ?? 'your insurer'} is due for renewal on ${new Date(p.endDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })}.\n\nPlease let us know if you would like us to proceed with the renewal.\n\nThank you.`,
      })
    } finally { setSending(false) }
  }

  return (
    <div className="rounded-lg border border-[--border-subtle] p-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold"><Building2 size={13} className="text-muted-foreground/60" /> {p.companyName ?? 'Unknown company'}</div>
      <div className="text-[11.5px] text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span>Policy: {p.policyNumber || '—'}</span>
        <span>Insurer: {p.insurer || '—'}</span>
        <span>Class: {p.classOfInsurance || '—'}</span>
        <span>Premium: {p.premium != null ? `${p.currency} ${p.premium.toLocaleString('en-SG', { minimumFractionDigits: 2 })}` : '—'}</span>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <Button variant="outline" size="xs" onClick={generateRenewalEmail} disabled={sending}>
          <Send size={11} className="mr-1.5" /> Generate renewal email
        </Button>
        <Link href={`/debit-notes/new?policy_id=${p.id}`}>
          <Button variant="outline" size="xs"><FileText size={11} className="mr-1.5" /> Generate Debit Note</Button>
        </Link>
        {p.companyId && (
          <Link href={`/contacts?company=${p.companyId}`} className="text-[11px] text-primary hover:underline ml-auto">View client →</Link>
        )}
      </div>
    </div>
  )
}
