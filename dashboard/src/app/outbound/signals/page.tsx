'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, AlertCircle, CheckCircle, Plus, ExternalLink, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AppScrollPage } from '@/components/app-shell'
import { PageHeader } from '@/components/page-header'

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

const SIGNAL_STATUS: Record<SignalStatus, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending',  color: '#92400e', bg: 'rgba(245,158,11,0.10)'  },
  active:   { label: 'Active',   color: '#166534', bg: 'rgba(22,101,52,0.09)'   },
  rejected: { label: 'Rejected', color: '#991b1b', bg: 'rgba(153,27,27,0.08)'   },
  archived: { label: 'Archived', color: '#667085', bg: 'rgba(20,30,50,0.05)'    },
}

const TYPE_LABELS: Record<SignalType, string> = {
  incident:           'Incident',
  regulatory:         'Regulatory',
  market_event:       'Market Event',
  merger_acquisition: 'M&A',
  leadership_change:  'Leadership Change',
  financial_event:    'Financial',
  sector_trend:       'Sector Trend',
  competitor_news:    'Competitor',
}

const SIGNAL_TYPES: SignalType[] = [
  'incident', 'regulatory', 'market_event', 'merger_acquisition',
  'leadership_change', 'financial_event', 'sector_trend', 'competitor_news',
]

function getHostname(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

// ── Shared form label ─────────────────────────────────────────────────────────

function FormLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
      {children}
    </label>
  )
}

const INPUT_CLS = 'w-full h-9 px-3 text-[13px] text-foreground bg-background border border-input rounded-md outline-none focus:ring-1 focus:ring-ring'
const TEXTAREA_CLS = 'w-full px-3 py-2 text-[13px] text-foreground bg-background border border-input rounded-md resize-y outline-none focus:ring-1 focus:ring-ring font-sans leading-relaxed'

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

  const corroborated = filtered.filter(s => s.corroboration_count >= 2)
  const pendingCount = signals.filter(s => s.status === 'pending').length

  return (
    <AppScrollPage maxWidth="1000px">

      <PageHeader
        title="Signal Library"
        description="Market signals that inform outbound campaigns. Signals with 2+ sources are corroborated."
        actions={
          <>
            <Button variant="outline" size="compact" onClick={load} className="gap-1.5">
              <RefreshCw size={12} /> Refresh
            </Button>
            <Button size="compact" onClick={() => setShowForm(v => !v)} className="gap-1.5">
              <Plus size={13} /> Add Signal
            </Button>
          </>
        }
        className="mb-5"
      />

      {/* Status filter pills */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {(['all', 'pending', 'active', 'rejected', 'archived'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            aria-pressed={statusFilter === s}
            className={cn('filter-pill', statusFilter === s && 'active')}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white rounded-[5px] text-[10px] px-1.5 py-px font-bold leading-none">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 mb-4 rounded-lg bg-destructive/[0.08] border-l-[3px] border-destructive/40 text-[13px] text-destructive">
          <AlertCircle size={14} className="flex-shrink-0" strokeWidth={2} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="bg-transparent border-0 cursor-pointer text-destructive text-base leading-none">×</button>
        </div>
      )}

      {/* Success */}
      {successMsg && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 mb-4 rounded-lg bg-[rgba(15,138,95,0.08)] border-l-[3px] border-[rgba(15,138,95,0.5)] text-[13px] text-emerald-700">
          <CheckCircle size={14} className="flex-shrink-0" strokeWidth={2} />
          <span className="flex-1">{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="bg-transparent border-0 cursor-pointer text-emerald-700 text-base leading-none">×</button>
        </div>
      )}

      {/* Corroboration notice */}
      {corroborated.length > 0 && (
        <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-violet-50 border-l-[3px] border-violet-300 text-[12.5px] text-violet-700">
          {corroborated.length} signal{corroborated.length !== 1 ? 's' : ''} have 2+ corroborating sources — strong candidates for campaign use.
        </div>
      )}

      {/* Add signal form */}
      {showForm && (
        <Card className="mb-5 border-primary/20 bg-primary/[0.02]">
          <CardContent className="p-6">
            <p className="text-[14px] font-bold text-foreground mb-4">New Signal</p>
            <form onSubmit={submitSignal}>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <FormLabel>Scope *</FormLabel>
                  <select
                    value={form.scope}
                    onChange={e => setForm(f => ({ ...f, scope: e.target.value as 'sector' | 'company' }))}
                    className={INPUT_CLS}
                    required
                  >
                    <option value="sector">Sector</option>
                    <option value="company">Company</option>
                  </select>
                </div>
                <div>
                  <FormLabel>Signal Type *</FormLabel>
                  <select
                    value={form.signal_type}
                    onChange={e => setForm(f => ({ ...f, signal_type: e.target.value as SignalType }))}
                    className={INPUT_CLS}
                    required
                  >
                    {SIGNAL_TYPES.map(t => (
                      <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mb-3">
                <FormLabel>Sector / Industry</FormLabel>
                <input
                  value={form.sector}
                  onChange={e => setForm(f => ({ ...f, sector: e.target.value }))}
                  placeholder="e.g. Manufacturing, Retail, F&B"
                  className={INPUT_CLS}
                />
              </div>

              <div className="mb-3">
                <FormLabel>Headline *</FormLabel>
                <input
                  value={form.headline}
                  onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
                  placeholder="Brief description of the signal"
                  className={INPUT_CLS}
                  required
                />
              </div>

              <div className="mb-3">
                <FormLabel>Summary</FormLabel>
                <textarea
                  value={form.summary}
                  onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                  placeholder="Additional context about the signal…"
                  className={TEXTAREA_CLS}
                  style={{ minHeight: 60 }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <FormLabel>Source URL *</FormLabel>
                  <input
                    value={form.source_url}
                    onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
                    placeholder="https://…"
                    type="url"
                    className={INPUT_CLS}
                    required
                  />
                </div>
                <div>
                  <FormLabel>Published Date</FormLabel>
                  <input
                    value={form.published_at}
                    onChange={e => setForm(f => ({ ...f, published_at: e.target.value }))}
                    type="date"
                    className={INPUT_CLS}
                  />
                </div>
              </div>

              <div className="mb-3">
                <FormLabel>Relevance Notes</FormLabel>
                <input
                  value={form.relevance_notes}
                  onChange={e => setForm(f => ({ ...f, relevance_notes: e.target.value }))}
                  placeholder="Why this matters for TRS outreach…"
                  className={INPUT_CLS}
                />
              </div>

              <div className="mb-5">
                <FormLabel>
                  Corroboration Group ID{' '}
                  <span className="text-[10px] font-normal text-muted-foreground/50 normal-case tracking-normal ml-1">
                    (paste an existing signal&apos;s group UUID to link them)
                  </span>
                </FormLabel>
                <input
                  value={form.corroboration_group_id}
                  onChange={e => setForm(f => ({ ...f, corroboration_group_id: e.target.value }))}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={INPUT_CLS}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={submitting} className="gap-1.5">
                  {submitting ? <Loader2 size={13} className="animate-spin" /> : null}
                  {submitting ? 'Saving…' : 'Add Signal'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Signals list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={18} className="animate-spin text-muted-foreground/40" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-[13.5px] text-muted-foreground/40">
              {statusFilter === 'pending'
                ? 'No pending signals — add one above or run the agent to discover signals.'
                : 'No signals found.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(sig => {
            const sm         = SIGNAL_STATUS[sig.status]
            const isActioning = actioning?.startsWith(sig.id)
            return (
              <Card key={sig.id}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">

                      {/* Header badges */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-[5px] whitespace-nowrap"
                          style={{ color: sm.color, background: sm.bg }}
                        >
                          {sm.label}
                        </span>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">
                          {TYPE_LABELS[sig.signal_type] ?? sig.signal_type}
                        </span>
                        {sig.sector && (
                          <span className="text-[11px] text-muted-foreground/60">{sig.sector}</span>
                        )}
                        {sig.corroboration_count >= 2 && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-[5px] text-violet-700 bg-violet-50 whitespace-nowrap">
                            {sig.corroboration_count} sources
                          </span>
                        )}
                        {sig.created_by_agent && (
                          <span className="text-[10.5px] text-muted-foreground/40">AI-discovered</span>
                        )}
                      </div>

                      {/* Headline */}
                      <p className="text-[14px] font-semibold text-foreground leading-snug mb-1.5">
                        {sig.headline}
                      </p>

                      {/* Summary */}
                      {sig.summary && (
                        <p className="text-[12.5px] text-muted-foreground leading-relaxed mb-2">
                          {sig.summary}
                        </p>
                      )}

                      {/* Relevance notes */}
                      {sig.relevance_notes && (
                        <p className="text-[12px] text-violet-700/75 italic mb-2">
                          {sig.relevance_notes}
                        </p>
                      )}

                      {/* Source + dates */}
                      <div className="flex items-center gap-4 flex-wrap">
                        <a
                          href={sig.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11.5px] text-primary no-underline hover:underline"
                        >
                          <ExternalLink size={10} />
                          {sig.source_domain ?? getHostname(sig.source_url)}
                        </a>
                        {sig.published_at && (
                          <span className="text-[11px] text-muted-foreground/50">
                            Published {new Date(sig.published_at).toLocaleDateString()}
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground/30">
                          Added {new Date(sig.discovered_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    {sig.status === 'pending' && (
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="compact"
                          onClick={() => takeAction(sig.id, 'approve')}
                          disabled={!!isActioning}
                          className="gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white border-0"
                        >
                          {isActioning && actioning === sig.id + ':approve'
                            ? <Loader2 size={12} className="animate-spin" />
                            : <CheckCircle size={12} />}
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="compact"
                          onClick={() => takeAction(sig.id, 'reject')}
                          disabled={!!isActioning}
                          className="text-destructive border-destructive/30 hover:bg-destructive/[0.05]"
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                    {sig.status === 'active' && (
                      <Button
                        variant="outline"
                        size="compact"
                        onClick={() => takeAction(sig.id, 'archive')}
                        disabled={!!isActioning}
                        className="flex-shrink-0 gap-1.5"
                      >
                        {isActioning ? <Loader2 size={12} className="animate-spin" /> : null}
                        Archive
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </AppScrollPage>
  )
}
