'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type LogRow = {
  id:            string
  user_id:       string | null
  user_email:    string
  user_name:     string | null
  action:        string
  resource_type: string | null
  resource_id:   string | null
  lead_email:    string | null
  old_value:     Record<string, unknown> | null
  new_value:     Record<string, unknown> | null
  metadata:      Record<string, unknown> | null
  created_at:    string
}

// ── Action config ─────────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string; group: string }> = {
  'email.sent':           { label: 'Email sent',          color: '#15803d', bg: '#f0fdf4', group: 'Email' },
  'draft.approved':       { label: 'Approved & sent',      color: '#15803d', bg: '#f0fdf4', group: 'Email' },
  'draft.generated':      { label: 'Generated draft',     color: '#1d4ed8', bg: '#eff6ff', group: 'AI' },
  'rag_draft.generated':  { label: 'Generated RAG draft', color: '#6d28d9', bg: '#f5f3ff', group: 'AI' },
  'draft.rejected':       { label: 'Rejected draft',      color: '#b45309', bg: '#fffbeb', group: 'AI' },
  'status.changed':       { label: 'Status changed',      color: '#7c3aed', bg: '#f5f3ff', group: 'Lead' },
  'note.saved':           { label: 'Note saved',          color: '#0891b2', bg: '#ecfeff', group: 'Lead' },
  'thread.viewed':        { label: 'Viewed thread',       color: '#6b7280', bg: '#f9fafb', group: 'Navigation' },
}
const ALL_ACTION_TYPES = Object.keys(ACTION_CONFIG)
const ACTION_GROUPS = ['Email', 'AI', 'Lead', 'Navigation']

function actionCfg(action: string) {
  return ACTION_CONFIG[action] ?? { label: action, color: '#6b7280', bg: '#f9fafb', group: 'Other' }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

function fmtFull(iso: string) {
  return new Date(iso).toLocaleString('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function initials(email: string) {
  const name = email.split('@')[0]
  const parts = name.split(/[._-]/)
  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

function displayName(row: LogRow) {
  if (row.user_name) return row.user_name
  return row.user_email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function describeAction(row: LogRow): string {
  const m = row.metadata
  const nv = row.new_value
  const ov = row.old_value
  switch (row.action) {
    case 'email.sent':
      return `Sent email to ${nv?.recipient ?? row.lead_email ?? '?'}${nv?.subject ? ` — "${nv.subject}"` : ''}`
    case 'draft.approved':
      return `Approved & sent reply${m?.contact ? ` to ${m.contact}` : row.lead_email ? ` to ${row.lead_email}` : ''}${m?.chars ? ` (${m.chars} chars)` : ''}`
    case 'draft.generated':
      return `Generated AI draft${m?.contact ? ` for ${m.contact}` : row.lead_email ? ` for ${row.lead_email}` : ''}`
    case 'rag_draft.generated':
      return `Generated RAG draft${m?.contact ? ` for ${m.contact}` : row.lead_email ? ` for ${row.lead_email}` : ''}${m?.sources ? ` (${m.sources} sources)` : ''}`
    case 'draft.rejected':
      return `Rejected AI draft${m?.contact ? ` for ${m.contact}` : ''}`
    case 'status.changed':
      return `Changed status${ov?.status ? ` from ${ov.status}` : ''} → ${nv?.status ?? m?.new_status ?? '?'}${row.lead_email ? ` for ${row.lead_email}` : ''}`
    case 'note.saved':
      return `Saved note${row.lead_email ? ` for ${row.lead_email}` : ''}`
    case 'thread.viewed':
      return `Opened thread${m?.subject ? ` — "${m.subject}"` : m?.contact ? ` for ${m.contact}` : ''}`
    default:
      return row.action
  }
}

// ── Row detail expand ─────────────────────────────────────────────────────────

function JsonBlock({ label, data }: { label: string; data: Record<string, unknown> | null }) {
  if (!data || Object.keys(data).length === 0) return null
  return (
    <div style={{ marginTop: 8 }}>
      <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af' }}>{label}</p>
      <pre style={{ margin: 0, padding: '8px 10px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto', fontFamily: 'ui-monospace, monospace' }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

function RowDetail({ row }: { row: LogRow }) {
  const hasDetail = row.old_value || row.new_value || row.metadata || row.resource_id
  if (!hasDetail) return null
  return (
    <div style={{ padding: '10px 16px 14px 58px', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}>
      {row.resource_type && row.resource_id && (
        <p style={{ margin: '0 0 8px', fontSize: 11, color: '#9ca3af' }}>
          {row.resource_type} · <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10 }}>{row.resource_id}</code>
        </p>
      )}
      {row.old_value && row.new_value && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <JsonBlock label="Before" data={row.old_value} />
          <JsonBlock label="After"  data={row.new_value} />
        </div>
      )}
      {row.new_value && !row.old_value && <JsonBlock label="Details" data={row.new_value} />}
      {row.old_value && !row.new_value && <JsonBlock label="Before"  data={row.old_value} />}
      {row.metadata && <JsonBlock label="Metadata" data={row.metadata} />}
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899']
function avatarColor(email: string) {
  let h = 0; for (const c of email) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ActivityLogPage() {
  const [logs,         setLogs]         = useState<LogRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [refreshing,   setRefreshing]   = useState(false)
  const [filterUser,   setFilterUser]   = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [days,         setDays]         = useState(30)
  const [expanded,     setExpanded]     = useState<string | null>(null)

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      const params = new URLSearchParams({ limit: '500', days: String(days) })
      if (filterUser)   params.set('user',   filterUser)
      if (filterAction) params.set('action', filterAction)
      const res  = await fetch(`/api/audit-log?${params}`, { cache: 'no-store' })
      const data = res.ok ? await res.json() : []
      setLogs(Array.isArray(data) ? data : [])
    } finally { setLoading(false); setRefreshing(false) }
  }, [filterUser, filterAction, days])

  useEffect(() => { load() }, [load])

  // Unique employees across all loaded logs (for the user filter dropdown)
  const uniqueUsers = Array.from(new Set(
    logs.map(l => l.user_email).concat(
      // Always include all employees we've ever seen, not just in current window
    )
  )).sort()

  // Group logs by calendar day
  const grouped = logs.reduce<Record<string, LogRow[]>>((acc, row) => {
    const day = new Date(row.created_at).toLocaleDateString('en-SG', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    if (!acc[day]) acc[day] = []
    acc[day].push(row)
    return acc
  }, {})

  return (
    <div style={{ padding: '28px 32px', maxWidth: 860, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>Activity Log</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: '#888' }}>
            {logs.length} event{logs.length !== 1 ? 's' : ''} · {days > 0 ? `last ${days} days` : 'all time'}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          title="Refresh"
          style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', color: '#888', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <RefreshCw size={13} strokeWidth={2} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          <span style={{ fontSize: 12 }}>Refresh</span>
        </button>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24, alignItems: 'center' }}>
        {/* Employee filter */}
        <select
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          style={selStyle}
        >
          <option value="">All employees</option>
          {uniqueUsers.map(u => (
            <option key={u} value={u}>
              {u.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </option>
          ))}
        </select>

        {/* Action type filter */}
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={selStyle}>
          <option value="">All actions</option>
          {ACTION_GROUPS.map(group => (
            <optgroup key={group} label={group}>
              {ALL_ACTION_TYPES.filter(a => actionCfg(a).group === group).map(a => (
                <option key={a} value={a}>{actionCfg(a).label}</option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Date range */}
        <select value={days} onChange={e => setDays(parseInt(e.target.value))} style={selStyle}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={0}>All time</option>
        </select>

        {(filterUser || filterAction || days !== 30) && (
          <button
            onClick={() => { setFilterUser(''); setFilterAction(''); setDays(30) }}
            style={{ fontSize: 11, color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Feed ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <p style={{ fontSize: 13, color: '#bbb', textAlign: 'center', padding: '48px 0' }}>Loading…</p>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ fontSize: 13, color: '#bbb' }}>No activity in this period.</p>
          {days > 0 && <button onClick={() => setDays(0)} style={{ marginTop: 8, fontSize: 12, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>View all time</button>}
        </div>
      ) : (
        Object.entries(grouped).map(([day, rows]) => (
          <div key={day} style={{ marginBottom: 28 }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{day}</p>

            <div style={{ border: '1px solid #e8e8e8', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
              {rows.map((row, i) => {
                const cfg   = actionCfg(row.action)
                const isExp = expanded === row.id
                const hasDetail = row.old_value || row.new_value || row.metadata || row.resource_id
                const color = avatarColor(row.user_email)

                return (
                  <div key={row.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                    <button
                      onClick={() => hasDetail ? setExpanded(isExp ? null : row.id) : undefined}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12,
                        padding: '11px 14px', background: 'none', border: 'none',
                        cursor: hasDetail ? 'pointer' : 'default', textAlign: 'left',
                      }}
                    >
                      {/* Avatar */}
                      <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{initials(row.user_email)}</span>
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{displayName(row)}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20, color: cfg.color, background: cfg.bg, whiteSpace: 'nowrap' }}>
                            {cfg.label}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: '#555', lineHeight: 1.4 }}>{describeAction(row)}</p>
                      </div>

                      {/* Right side */}
                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: '#bbb' }} title={fmtFull(row.created_at)}>
                          {timeAgo(row.created_at)}
                        </span>
                        {hasDetail && (
                          isExp
                            ? <ChevronDown size={12} strokeWidth={2} style={{ color: '#9ca3af', flexShrink: 0 }} />
                            : <ChevronRight size={12} strokeWidth={2} style={{ color: '#d1d5db', flexShrink: 0 }} />
                        )}
                      </div>
                    </button>

                    {isExp && <RowDetail row={row} />}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const selStyle: React.CSSProperties = {
  fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 7,
  padding: '5px 10px', color: '#374151', background: '#fff',
  outline: 'none', cursor: 'pointer',
}
