'use client'

/**
 * Claims sent in through the website's claims form: the leads view that was /claims before the
 * register. Reached from the "Website forms" segment on /claims.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { Copy, Check, RefreshCw, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn, Chip, Segmented, btnClass } from '@/components/crm/primitives'
import { timeAgo } from '@/lib/format'

async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch('/api/leads', { cache: 'no-store' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  const all: Lead[] = await res.json()
  return all.filter(l => l.source === 'claims_form' || l.department === 'Claims')
}

async function patchStatus(id: string, status: string) {
  await fetch('/api/leads', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }),
  })
}

type Lead = {
  id: string; created_at: string; source: string
  first_name: string | null; last_name: string | null
  email: string | null; phone: string | null; company: string | null
  department: string | null; contact_type: string | null
  topic: string | null; details: string | null; message: string | null
  page_url: string | null; status: string
}

const STATUS_LABEL: Record<string, string> = {
  new: 'New', contacted: 'Contacted', qualified: 'Qualified', converted: 'Converted', dropped: 'Dropped',
}
const ALL_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'dropped']


function fullName(l: Lead) { return [l.first_name, l.last_name].filter(Boolean).join(' ') || '—' }
function bodyText(l: Lead) { return l.details || l.message || '' }

function LeadCard({ lead, onStatus }: { lead: Lead; onStatus: (id: string, s: string) => void }) {
  const [open,       setOpen]       = useState(false)
  const [statusMenu, setStatusMenu] = useState(false)
  const [copied,     setCopied]     = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const body    = bodyText(lead)
  const waPhone = lead.phone ? lead.phone.replace(/\D/g, '') : null

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1800)
  }

  useEffect(() => {
    if (!statusMenu) return
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setStatusMenu(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [statusMenu])

  const secondaryLink = cn(btnClass('secondary'), 'no-underline')

  return (
    <div className="rounded border border-trs-line bg-white">
      <div
        className="px-5 py-4 flex items-start gap-4 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-body font-medium text-trs-ink">{fullName(lead)}</span>
            {lead.company && <span className="text-body text-trs-muted">· {lead.company}</span>}
            {lead.topic   && <span className="text-body text-trs-muted">— {lead.topic}</span>}
          </div>
          {body && (
            <p className="m-0 mt-1 text-body truncate text-trs-muted">
              {body}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className="text-small tabular-nums text-trs-subtle">{timeAgo(lead.created_at)}</span>
          <div className="relative" ref={menuRef}>
            <Btn
              level="tertiary"
              onClick={e => { e.stopPropagation(); setStatusMenu(m => !m) }}
              aria-haspopup="menu"
              aria-expanded={statusMenu}
              className="h-auto gap-1 border-0 px-2 py-0.5 text-small bg-trs-field text-trs-muted hover:bg-trs-field hover:text-trs-ink-2"
            >
              {STATUS_LABEL[lead.status] ?? STATUS_LABEL.new} <ChevronDown size={11} />
            </Btn>
            {statusMenu && (
              <div role="menu" className="absolute right-0 top-[calc(100%+4px)] bg-white rounded min-w-[150px] z-50 py-1 border border-trs-line shadow-[0_16px_48px_rgba(15,20,18,0.14)]">
                {ALL_STATUSES.map(s => (
                  <Btn key={s} level="tertiary" role="menuitem" onClick={e => { e.stopPropagation(); onStatus(lead.id, s); setStatusMenu(false) }}
                    className={cn('h-auto w-full justify-start rounded-none border-0 px-3 py-2 text-left text-body text-trs-ink hover:bg-trs-field', lead.status === s ? 'font-medium' : 'font-normal')}>
                    {STATUS_LABEL[s]}
                  </Btn>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {open && (
        <div className="px-5 py-4 border-t border-trs-line" onClick={e => e.stopPropagation()}>
          {body && (
            <div className="mb-4">
              <p className="m-0 mb-1.5 text-small text-trs-muted">Claim details</p>
              <p className="m-0 text-body leading-relaxed whitespace-pre-wrap text-trs-ink">{body}</p>
            </div>
          )}
          <div className="grid gap-x-6 gap-y-3 mb-4 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
            {lead.email && (
              <div>
                <p className="m-0 mb-1 text-small text-trs-muted">Email</p>
                <Btn level="tertiary" onClick={() => copy(lead.email!, 'email')} className="h-auto border-0 p-0 font-normal text-body text-trs-ink hover:bg-transparent">
                  <span className="max-w-[180px] truncate">{lead.email}</span>
                  {copied === 'email' ? <Check size={12} className="text-trs-muted" /> : <Copy size={12} className="text-trs-subtle" />}
                </Btn>
              </div>
            )}
            {lead.phone && (
              <div>
                <p className="m-0 mb-1 text-small text-trs-muted">Phone</p>
                <Btn level="tertiary" onClick={() => copy(lead.phone!, 'phone')} className="h-auto border-0 p-0 font-normal text-body tabular-nums text-trs-ink hover:bg-transparent">
                  {lead.phone}
                  {copied === 'phone' ? <Check size={12} className="text-trs-muted" /> : <Copy size={12} className="text-trs-subtle" />}
                </Btn>
              </div>
            )}
            {lead.contact_type && (
              <div>
                <p className="m-0 mb-1 text-small text-trs-muted">Type</p>
                <p className="m-0 text-body text-trs-ink">{lead.contact_type}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap pt-4 border-t border-trs-line">
            {waPhone && (
              <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer" className={secondaryLink}>
                WhatsApp
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`} className={secondaryLink}>
                Email
              </a>
            )}
            {lead.phone && (
              <a href={`tel:${waPhone}`} className={secondaryLink}>
                Call
              </a>
            )}
            {lead.status === 'new' && (
              <Btn level="tertiary" className="ml-auto" onClick={() => onStatus(lead.id, 'contacted')}>
                Mark contacted
              </Btn>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Website forms ─────────────────────────────────────────────────────────────
export function WebsiteForms({ onCount }: { onCount?: (n: number) => void }) {
  const [leads,      setLeads]      = useState<Lead[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [filter,     setFilter]     = useState<'all' | 'new'>('all')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      const l = await fetchLeads()
      setLeads(l); onCount?.(l.filter(x => x.status === 'new').length)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [onCount])

  useEffect(() => {
    load()
    const t = setInterval(() => load(), 120_000)
    return () => clearInterval(t)
  }, [load])

  function handleStatus(id: string, status: string) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    patchStatus(id, status)
  }

  const newCount = leads.filter(l => l.status === 'new').length
  const filtered = filter === 'new' ? leads.filter(l => l.status === 'new') : leads

  return (
    <div className="text-trs-ink">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: leads.length },
            { value: 'new', label: 'New', count: newCount },
          ]}
        />
        <Btn level="tertiary" onClick={() => load(true)} loading={refreshing}>
          {!refreshing && <RefreshCw size={14} />} Refresh
        </Btn>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded animate-pulse bg-trs-field" />)}
          </div>
        ) : error ? (
          <p className="py-16 text-center text-body m-0 text-trs-neg">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-body m-0 text-trs-muted">{filter === 'new' ? 'No new forms.' : 'No forms yet.'}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(lead => <LeadCard key={lead.id} lead={lead} onStatus={handleStatus} />)}
          </div>
        )}
      </div>
    </div>
  )
}
