'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'

type LogRow = {
  id:            string
  user_email:    string
  action:        string
  resource_type: string | null
  resource_id:   string | null
  metadata:      Record<string, unknown> | null
  created_at:    string
}

const ACTION_META: Record<string, { label: string; color: string; bg: string }> = {
  'thread.viewed':   { label: 'Viewed thread',    color: '#555',    bg: '#f4f4f5' },
  'draft.generated': { label: 'Generated draft',  color: '#1d4ed8', bg: '#eff6ff' },
  'draft.approved':  { label: 'Approved & sent',  color: '#15803d', bg: '#f0fdf4' },
  'draft.rejected':  { label: 'Rejected draft',   color: '#b45309', bg: '#fffbeb' },
  'status.changed':  { label: 'Changed status',   color: '#7c3aed', bg: '#f5f3ff' },
}

function actionMeta(action: string) {
  return ACTION_META[action] ?? { label: action, color: '#888', bg: '#f4f4f5' }
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short',
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

function describeAction(row: LogRow): string {
  const m = row.metadata
  switch (row.action) {
    case 'thread.viewed':
      return `Opened thread${m?.subject ? ` — "${m.subject}"` : m?.contact ? ` for ${m.contact}` : ''}`
    case 'draft.generated':
      return `Generated AI draft${m?.contact ? ` for ${m.contact}` : ''}`
    case 'draft.approved':
      return `Approved & sent reply${m?.contact ? ` to ${m.contact}` : ''}${m?.chars ? ` (${m.chars} chars)` : ''}`
    case 'draft.rejected':
      return `Rejected AI draft${m?.contact ? ` for ${m.contact}` : ''}`
    case 'status.changed':
      return `Changed lead status to ${m?.new_status ?? '?'}${m?.contact ? ` for ${m.contact}` : ''}`
    default:
      return row.action
  }
}

export default function ActivityLogPage() {
  const [logs,       setLogs]       = useState<LogRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filterUser, setFilterUser] = useState('')

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      const url = filterUser
        ? `/api/audit-log?limit=300&user=${encodeURIComponent(filterUser)}`
        : '/api/audit-log?limit=300'
      const res  = await fetch(url, { cache: 'no-store' })
      const data = res.ok ? await res.json() : []
      setLogs(Array.isArray(data) ? data : [])
    } finally { setLoading(false); setRefreshing(false) }
  }, [filterUser])

  useEffect(() => { load() }, [load])

  // Group logs by date
  const grouped = logs.reduce<Record<string, LogRow[]>>((acc, row) => {
    const day = new Date(row.created_at).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    if (!acc[day]) acc[day] = []
    acc[day].push(row)
    return acc
  }, {})

  const uniqueUsers = Array.from(new Set(logs.map(l => l.user_email))).sort()

  return (
    <div style={{ padding: '28px 32px', maxWidth: 820, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>Activity Log</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: '#888' }}>{logs.length} events · all team members</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {uniqueUsers.length > 1 && (
            <select
              value={filterUser}
              onChange={e => setFilterUser(e.target.value)}
              style={{ fontSize: 12, border: '1px solid #e8e8e8', borderRadius: 7, padding: '5px 10px', color: '#333', background: '#fff', outline: 'none', cursor: 'pointer' }}
            >
              <option value="">All members</option>
              {uniqueUsers.map(u => <option key={u} value={u}>{u.split('@')[0]}</option>)}
            </select>
          )}
          <button
            onClick={() => load(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', display: 'flex' }}
          >
            <RefreshCw size={14} strokeWidth={2} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: '#bbb', textAlign: 'center', padding: '48px 0' }}>Loading…</p>
      ) : logs.length === 0 ? (
        <p style={{ fontSize: 13, color: '#bbb', textAlign: 'center', padding: '48px 0' }}>
          No activity yet. Actions taken in the dashboard will appear here.
        </p>
      ) : (
        Object.entries(grouped).map(([day, rows]) => (
          <div key={day} style={{ marginBottom: 32 }}>
            <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{day}</p>

            <div style={{ border: '1px solid #e8e8e8', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
              {rows.map((row, i) => {
                const meta = actionMeta(row.action)
                return (
                  <div
                    key={row.id}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '12px 16px',
                      borderBottom: i < rows.length - 1 ? '1px solid #f0f0f0' : 'none',
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#555' }}>{initials(row.user_email)}</span>
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>
                          {row.user_email.split('@')[0]}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20,
                          color: meta.color, background: meta.bg,
                        }}>
                          {meta.label}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: '#666' }}>{describeAction(row)}</p>
                    </div>

                    {/* Timestamp */}
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <span style={{ fontSize: 11, color: '#bbb' }} title={fmtDate(row.created_at)}>
                        {timeAgo(row.created_at)}
                      </span>
                    </div>
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
