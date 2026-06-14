'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, AlertCircle, CheckCircle, Plus, ExternalLink, RefreshCw } from 'lucide-react'

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

// ── Styles ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: '20px 24px',
}

const btnPrimary = (disabled = false, bg = '#111'): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', borderRadius: 8, border: 'none',
  background: bg, color: '#fff', fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
  whiteSpace: 'nowrap',
})

const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '6px 12px', borderRadius: 7, border: '1px solid #e5e5e5',
  background: '#fff', color: '#333', fontSize: 12, fontWeight: 500,
  cursor: 'pointer', whiteSpace: 'nowrap',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 7,
  border: '1px solid #e5e5e5', background: '#fff', color: '#111',
  outline: 'none', boxSizing: 'border-box',
}

const STATUS_META: Record<SignalStatus, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending',  color: '#92400e', bg: '#fef3c7' },
  active:   { label: 'Active',   color: '#166534', bg: '#f0fdf4' },
  rejected: { label: 'Rejected', color: '#991b1b', bg: '#fef2f2' },
  archived: { label: '#555',     bg: '#f4f4f5', label2: 'Archived' } as never,
}

const TYPE_LABELS: Record<SignalType, string> = {
  incident:          'Incident',
  regulatory:        'Regulatory',
  market_event:      'Market Event',
  merger_acquisition:'M&A',
  leadership_change: 'Leadership Change',
  financial_event:   'Financial',
  sector_trend:      'Sector Trend',
  competitor_news:   'Competitor',
}

const SIGNAL_TYPES: SignalType[] = [
  'incident','regulatory','market_event','merger_acquisition',
  'leadership_change','financial_event','sector_trend','competitor_news',
]

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SignalLibraryPage() {
  const [signals,      setSignals]      = useState<Signal[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [successMsg,   setSuccessMsg]   = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<SignalStatus | 'all'>('pending')
  const [showForm,     setShowForm]     = useState(false)
  const [actioning,    setActioning]    = useState<string | null>(null)

  // New signal form
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

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-7" style={{ maxWidth: 1000, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>
            Signal Library
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>
            Market signals that inform outbound campaigns. Signals with 2+ sources are corroborated.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={btnSecondary}>
            <RefreshCw size={12} /> Refresh
          </button>
          <button onClick={() => setShowForm(v => !v)} style={btnPrimary(false, '#111')}>
            <Plus size={13} /> Add Signal
          </button>
        </div>
      </div>

      {/* Status pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['all', 'pending', 'active', 'rejected', 'archived'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              border: `1px solid ${statusFilter === s ? '#111' : '#e5e5e5'}`,
              background: statusFilter === s ? '#111' : '#fff',
              color: statusFilter === s ? '#fff' : '#666',
              cursor: 'pointer',
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s === 'pending' && signals.filter(sig => sig.status === 'pending').length > 0 && (
              <span style={{ marginLeft: 5, background: '#f59e0b', color: '#fff', borderRadius: 8, padding: '0 5px', fontSize: 10 }}>
                {signals.filter(sig => sig.status === 'pending').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error / Success */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13 }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 16 }}>×</button>
        </div>
      )}
      {successMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: 13 }}>
          <CheckCircle size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Corroboration notice */}
      {corroborated.length > 0 && (
        <div style={{ marginBottom: 14, padding: '8px 14px', borderRadius: 8, background: '#ede9fe', border: '1px solid #c4b5fd', fontSize: 12, color: '#5b21b6' }}>
          {corroborated.length} signal{corroborated.length !== 1 ? 's' : ''} have 2+ corroborating sources — strong candidates for campaign use.
        </div>
      )}

      {/* Add signal form */}
      {showForm && (
        <div style={{ ...card, marginBottom: 20, border: '1px solid #e0e7ff', background: '#f8f9ff' }}>
          <p style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600, color: '#111' }}>New Signal</p>
          <form onSubmit={submitSignal}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Scope *</label>
                <select
                  value={form.scope}
                  onChange={e => setForm(f => ({ ...f, scope: e.target.value as 'sector' | 'company' }))}
                  style={{ ...inputStyle }}
                  required
                >
                  <option value="sector">Sector</option>
                  <option value="company">Company</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Signal Type *</label>
                <select
                  value={form.signal_type}
                  onChange={e => setForm(f => ({ ...f, signal_type: e.target.value as SignalType }))}
                  style={{ ...inputStyle }}
                  required
                >
                  {SIGNAL_TYPES.map(t => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sector / Industry</label>
              <input
                value={form.sector}
                onChange={e => setForm(f => ({ ...f, sector: e.target.value }))}
                placeholder="e.g. Manufacturing, Retail, F&B"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Headline *</label>
              <input
                value={form.headline}
                onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
                placeholder="Brief description of the signal"
                style={inputStyle}
                required
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Summary</label>
              <textarea
                value={form.summary}
                onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                placeholder="Additional context about the signal…"
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Source URL *</label>
                <input
                  value={form.source_url}
                  onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
                  placeholder="https://…"
                  type="url"
                  style={inputStyle}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Published Date</label>
                <input
                  value={form.published_at}
                  onChange={e => setForm(f => ({ ...f, published_at: e.target.value }))}
                  type="date"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Relevance Notes</label>
              <input
                value={form.relevance_notes}
                onChange={e => setForm(f => ({ ...f, relevance_notes: e.target.value }))}
                placeholder="Why this matters for TRS outreach…"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Corroboration Group ID
                <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 6, fontSize: 10, color: '#aaa' }}>
                  (paste an existing signal&apos;s group UUID to link them)
                </span>
              </label>
              <input
                value={form.corroboration_group_id}
                onChange={e => setForm(f => ({ ...f, corroboration_group_id: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={submitting} style={btnPrimary(submitting)}>
                {submitting ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : 'Add Signal'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={btnSecondary}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Signals list */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#ccc' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ fontSize: 14, color: '#aaa', margin: 0 }}>
            {statusFilter === 'pending' ? 'No pending signals — add one above or run the agent to discover signals.' : 'No signals found.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(sig => {
            const sm = STATUS_META[sig.status]
            const isActioning = actioning?.startsWith(sig.id)
            return (
              <div key={sig.id} style={{ ...card, padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                        color: sm.color, background: sm.bg,
                      }}>
                        {sig.status === 'archived' ? 'Archived' : sm.label}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 4,
                        color: '#555', background: '#f4f4f5',
                      }}>
                        {TYPE_LABELS[sig.signal_type] ?? sig.signal_type}
                      </span>
                      {sig.sector && (
                        <span style={{ fontSize: 11, color: '#888' }}>{sig.sector}</span>
                      )}
                      {sig.corroboration_count >= 2 && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                          color: '#5b21b6', background: '#ede9fe',
                        }}>
                          {sig.corroboration_count} sources
                        </span>
                      )}
                      {sig.created_by_agent && (
                        <span style={{ fontSize: 10, color: '#aaa' }}>AI-discovered</span>
                      )}
                    </div>

                    {/* Headline */}
                    <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#111', lineHeight: 1.4 }}>
                      {sig.headline}
                    </p>

                    {/* Summary */}
                    {sig.summary && (
                      <p style={{ margin: '0 0 6px', fontSize: 12, color: '#555', lineHeight: 1.5 }}>
                        {sig.summary}
                      </p>
                    )}

                    {/* Relevance notes */}
                    {sig.relevance_notes && (
                      <p style={{ margin: '0 0 6px', fontSize: 12, color: '#7c3aed', fontStyle: 'italic' }}>
                        {sig.relevance_notes}
                      </p>
                    )}

                    {/* Source + date */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <a
                        href={sig.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#1d4ed8', textDecoration: 'none' }}
                      >
                        <ExternalLink size={10} />
                        {sig.source_domain ?? new URL(sig.source_url).hostname}
                      </a>
                      {sig.published_at && (
                        <span style={{ fontSize: 11, color: '#aaa' }}>
                          Published {new Date(sig.published_at).toLocaleDateString()}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: '#ccc' }}>
                        Added {new Date(sig.discovered_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  {sig.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => takeAction(sig.id, 'approve')}
                        disabled={!!isActioning}
                        style={btnPrimary(!!isActioning, '#166534')}
                      >
                        {isActioning && actioning === sig.id + ':approve'
                          ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                          : <CheckCircle size={12} />
                        }
                        Approve
                      </button>
                      <button
                        onClick={() => takeAction(sig.id, 'reject')}
                        disabled={!!isActioning}
                        style={{ ...btnSecondary, color: '#991b1b' }}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {sig.status === 'active' && (
                    <button
                      onClick={() => takeAction(sig.id, 'archive')}
                      disabled={!!isActioning}
                      style={btnSecondary}
                    >
                      {isActioning ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                      Archive
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
