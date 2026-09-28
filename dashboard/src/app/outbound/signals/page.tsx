'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Chip, Field, Segmented, inputCls, textareaCls } from '@/components/crm/primitives'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'

// ── Types ─────────────────────────────────────────────────────────────────────

type SignalStatus = 'pending' | 'active' | 'rejected' | 'archived'
type SignalType   =
  | 'incident' | 'regulatory' | 'market_event' | 'merger_acquisition'
  | 'leadership_change' | 'financial_event' | 'sector_trend' | 'competitor_news'

interface Signal {
  id:                     string
  scope:                  'sector' | 'company'
  sector:                 string | null
  signal_type:            SignalType
  headline:               string
  summary:                string | null
  source_url:             string
  source_domain:          string | null
  corroboration_group_id: string | null
  corroboration_count:    number
  published_at:           string | null
  discovered_at:          string
  status:                 SignalStatus
  relevance_notes:        string | null
  created_by_agent:       boolean
}

// ── Status + type metadata ────────────────────────────────────────────────────

const STATUS_LABEL: Record<SignalStatus, string> = {
  pending:  'Pending',
  active:   'Active',
  rejected: 'Rejected',
  archived: 'Archived',
}

const TYPE_LABELS: Record<SignalType, string> = {
  incident:           'Incident',
  regulatory:         'Regulatory',
  market_event:       'Market event',
  merger_acquisition: 'M&A',
  leadership_change:  'Leadership change',
  financial_event:    'Financial',
  sector_trend:       'Sector trend',
  competitor_news:    'Competitor',
}

const SIGNAL_TYPES: SignalType[] = [
  'incident', 'regulatory', 'market_event', 'merger_acquisition',
  'leadership_change', 'financial_event', 'sector_trend', 'competitor_news',
]

function getHostname(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SignalLibraryPage() {
  const [signals,      setSignals]      = useState<Signal[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [successMsg,   setSuccessMsg]   = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<SignalStatus | 'all'>('pending')
  const [showForm,     setShowForm]     = useState(false)
  const [actioning,    setActioning]    = useState<string | null>(null)

  const [form, setForm] = useState({
    scope:                  'sector' as 'sector' | 'company',
    sector:                 '',
    signal_type:            'sector_trend' as SignalType,
    headline:               '',
    summary:                '',
    source_url:             '',
    source_domain:          '',
    published_at:           '',
    relevance_notes:        '',
    corroboration_group_id: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
      const res  = await fetch(`/api/outbound/signals${qs}`)
      const data = await res.json()
      setSignals(Array.isArray(data) ? data : [])
    } catch {
      setError('Failed to load signals')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function takeAction(signalId: string, action: 'approve' | 'reject' | 'archive') {
    setActioning(signalId + ':' + action)
    try {
      const res = await fetch(`/api/outbound/signals/${signalId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error('Action failed')
      const statusMap = { approve: 'active', reject: 'rejected', archive: 'archived' } as const
      setSignals(prev => prev.map(s =>
        s.id === signalId ? { ...s, status: statusMap[action] as SignalStatus } : s
      ))
      setSuccessMsg(`Signal ${action === 'approve' ? 'approved' : action + 'd'}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setActioning(null)
    }
  }

  async function submitSignal(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true); setError(null)
    try {
      const body: Record<string, unknown> = {
        scope:       form.scope,
        signal_type: form.signal_type,
        headline:    form.headline.trim(),
        source_url:  form.source_url.trim(),
      }
      if (form.sector)                 body.sector                 = form.sector.trim()
      if (form.summary)                body.summary                = form.summary.trim()
      if (form.source_domain)          body.source_domain          = form.source_domain.trim()
      if (form.published_at)           body.published_at           = form.published_at
      if (form.relevance_notes)        body.relevance_notes        = form.relevance_notes.trim()
      if (form.corroboration_group_id) body.corroboration_group_id = form.corroboration_group_id.trim()

      const res = await fetch('/api/outbound/signals', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Create failed')

      setSignals(prev => [data, ...prev])
      setSuccessMsg('Signal added to library')
      setShowForm(false)
      setForm({
        scope: 'sector', sector: '', signal_type: 'sector_trend', headline: '',
        summary: '', source_url: '', source_domain: '', published_at: '',
        relevance_notes: '', corroboration_group_id: '',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create signal')
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = statusFilter === 'all'
    ? signals
    : signals.filter(s => s.status === statusFilter)

  const pendingCount = signals.filter(s => s.status === 'pending').length

  const countLine = loading
    ? 'Loading…'
    : `${filtered.length} signal${filtered.length === 1 ? '' : 's'}${statusFilter !== 'all' ? ` · ${STATUS_LABEL[statusFilter].toLowerCase()}` : ''}`

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1000px] px-6 sm:px-12 pt-12 pb-20">

        {/* Header */}
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Signals</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>{countLine}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={load} className="h-12 px-4 rounded-[12px] border bg-white text-[15px] cursor-pointer hover:bg-[#f8f9fa]" style={{ borderColor: '#dadce0', color: INK }}>
              Refresh
            </button>
            {!showForm && (
              <button type="button" onClick={() => setShowForm(true)} className="h-12 px-6 rounded-[12px] text-white text-[15px] font-medium border-0 cursor-pointer whitespace-nowrap hover:opacity-90" style={{ background: INK }}>
                Add signal
              </button>
            )}
          </div>
        </div>

        {/* Status filter */}
        <div className="mt-6">
          <Segmented
            value={statusFilter}
            onChange={setStatusFilter}
            options={(['all', 'pending', 'active', 'rejected', 'archived'] as const).map(s => ({
              value: s, label: s === 'all' ? 'All' : STATUS_LABEL[s], count: s === 'pending' && pendingCount > 0 ? pendingCount : undefined,
            }))}
          />
        </div>

        {error && (
          <p className="mt-6 mb-0 text-[14px] flex items-center gap-3 flex-wrap" style={{ color: '#3c4043' }} role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>Dismiss</button>
          </p>
        )}
        {successMsg && (
          <p className="mt-6 mb-0 text-[14px] flex items-center gap-3 flex-wrap" style={{ color: MUTED }} role="status">
            <span>{successMsg}</span>
            <button type="button" onClick={() => setSuccessMsg(null)} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>Dismiss</button>
          </p>
        )}

        {/* Add signal form */}
        {showForm && (
          <form onSubmit={submitSignal} className="mt-6 rounded-[16px] bg-white px-6 py-5" style={{ border: `1px solid ${RULE}` }}>
            <h2 className="m-0 mb-4 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>New signal</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Scope">
                <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value as 'sector' | 'company' }))} className={inputCls} required>
                  <option value="sector">Sector</option>
                  <option value="company">Company</option>
                </select>
              </Field>
              <Field label="Signal type">
                <select value={form.signal_type} onChange={e => setForm(f => ({ ...f, signal_type: e.target.value as SignalType }))} className={inputCls} required>
                  {SIGNAL_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Sector or industry">
                  <input value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))} placeholder="Manufacturing, Retail, F&B" className={inputCls} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Headline">
                  <input value={form.headline} onChange={e => setForm(f => ({ ...f, headline: e.target.value }))} placeholder="One line describing the signal" className={inputCls} required />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Summary">
                  <textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} placeholder="Context for the signal" className={textareaCls} rows={3} />
                </Field>
              </div>
              <Field label="Source URL">
                <input value={form.source_url} onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))} placeholder="https://…" type="url" className={inputCls} required />
              </Field>
              <Field label="Published date">
                <input value={form.published_at} onChange={e => setForm(f => ({ ...f, published_at: e.target.value }))} type="date" className={inputCls} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Relevance notes">
                  <input value={form.relevance_notes} onChange={e => setForm(f => ({ ...f, relevance_notes: e.target.value }))} placeholder="How this signal supports TRS outreach" className={inputCls} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Corroboration group ID" hint="Paste an existing signal's group UUID to link them.">
                  <input value={form.corroboration_group_id} onChange={e => setForm(f => ({ ...f, corroboration_group_id: e.target.value }))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className={inputCls} />
                </Field>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Saving…' : 'Add signal'}</Button>
            </div>
          </form>
        )}

        {/* Signals list */}
        <div className="mt-6">
          {loading ? (
            <div className="rounded-[16px] overflow-hidden bg-white" style={{ border: `1px solid ${RULE}` }} aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-[88px] px-6 flex flex-col justify-center gap-2.5" style={{ borderBottom: `1px solid ${RULE}` }}>
                  <span className="h-3.5 w-3/5 rounded bg-[#f1f3f4] animate-pulse" />
                  <span className="h-3 w-2/5 rounded bg-[#f1f3f4] animate-pulse" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>
              {statusFilter === 'pending' ? 'No pending signals. Add one or run the agent to discover more.' : 'No signals here.'}
            </p>
          ) : (
            <ul className="m-0 p-0 list-none rounded-[16px] overflow-hidden bg-white" style={{ border: `1px solid ${RULE}` }}>
              {filtered.map(sig => {
                const isActioning = actioning?.startsWith(sig.id)
                return (
                  <li key={sig.id} className="flex items-start gap-6 px-6 py-4 flex-wrap" style={{ borderBottom: `1px solid ${RULE}` }}>
                    <div className="flex-1 min-w-[260px]">
                      <p className="m-0 text-[14px] font-medium leading-snug" style={{ color: INK }}>{sig.headline}</p>
                      <p className="m-0 mt-1.5 flex items-center gap-2 flex-wrap text-[12.5px]" style={{ color: MUTED }}>
                        <Chip>{STATUS_LABEL[sig.status]}</Chip>
                        <Chip>{TYPE_LABELS[sig.signal_type] ?? sig.signal_type}</Chip>
                        {sig.corroboration_count >= 2 && <Chip>{sig.corroboration_count} sources</Chip>}
                        {sig.sector && <span>{sig.sector}</span>}
                        {sig.created_by_agent && <span>AI-discovered</span>}
                      </p>
                      {sig.summary && <p className="m-0 mt-2 text-[13px] leading-relaxed" style={{ color: '#3c4043' }}>{sig.summary}</p>}
                      {sig.relevance_notes && <p className="m-0 mt-1.5 text-[13px] leading-relaxed" style={{ color: MUTED }}>{sig.relevance_notes}</p>}
                      <p className="m-0 mt-2 flex items-center gap-4 flex-wrap text-[12.5px]" style={{ color: MUTED }}>
                        <a href={sig.source_url} target="_blank" rel="noopener noreferrer" className="no-underline hover:underline underline-offset-4" style={{ color: INK }}>
                          {sig.source_domain ?? getHostname(sig.source_url)} ↗
                        </a>
                        {sig.published_at && <span>Published {fmtDate(sig.published_at)}</span>}
                        <span>Added {fmtDate(sig.discovered_at)}</span>
                      </p>
                    </div>

                    {sig.status === 'pending' && (
                      <div className="flex gap-2 flex-shrink-0">
                        <Button variant="outline" size="sm" onClick={() => takeAction(sig.id, 'approve')} disabled={!!isActioning}>
                          {actioning === sig.id + ':approve' ? 'Approving…' : 'Approve'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => takeAction(sig.id, 'reject')} disabled={!!isActioning}>
                          {actioning === sig.id + ':reject' ? 'Rejecting…' : 'Reject'}
                        </Button>
                      </div>
                    )}
                    {sig.status === 'active' && (
                      <Button variant="ghost" size="sm" className="flex-shrink-0" onClick={() => takeAction(sig.id, 'archive')} disabled={!!isActioning}>
                        {isActioning ? 'Archiving…' : 'Archive'}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
