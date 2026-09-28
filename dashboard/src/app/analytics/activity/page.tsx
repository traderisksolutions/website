'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { Btn, Chip, Segmented, inputCls } from '@/components/crm/primitives'
import { PersonTag } from '@/components/board/TodoEditor'
import type { StaffMember } from '@/lib/crm/staff'

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
// Every action renders as the same neutral chip; the label carries the meaning.

const ACTION_CONFIG: Record<string, { label: string; group: string }> = {
  'email.sent':           { label: 'Email sent',          group: 'Email' },
  'draft.approved':       { label: 'Approved and sent',   group: 'Email' },
  'draft.generated':      { label: 'Generated draft',     group: 'AI' },
  'rag_draft.generated':  { label: 'Generated RAG draft', group: 'AI' },
  'draft.rejected':       { label: 'Rejected draft',      group: 'AI' },
  'status.changed':       { label: 'Status changed',      group: 'Lead' },
  'note.saved':           { label: 'Note saved',          group: 'Lead' },
  'thread.viewed':        { label: 'Viewed thread',       group: 'Navigation' },
  // Nexus
  'nexus.case_renamed':        { label: 'Renamed case',        group: 'Nexus' },
  'nexus.case_status_changed': { label: 'Changed case status', group: 'Nexus' },
  'nexus.case_updated':        { label: 'Updated case',        group: 'Nexus' },
  'nexus.analysis_run':        { label: 'Ran analysis',        group: 'Nexus' },
  'nexus.analysis_edited':     { label: 'Edited analysis',     group: 'Nexus' },
  'nexus.thread_linked':       { label: 'Linked thread',       group: 'Nexus' },
  'nexus.thread_unlinked':     { label: 'Unlinked thread',     group: 'Nexus' },
  'nexus.case_viewed':         { label: 'Opened case',         group: 'Navigation' },
  // RFQ
  'rfq.dispatched':            { label: 'Sent RFQ to insurer', group: 'RFQ' },
  'contacts.bulk_import':      { label: 'Imported contacts',   group: 'Lead' },
}
const ALL_ACTION_TYPES = Object.keys(ACTION_CONFIG)
const ACTION_GROUPS = ['Email', 'AI', 'Nexus', 'RFQ', 'Lead', 'Navigation']

function actionCfg(action: string) {
  return ACTION_CONFIG[action] ?? { label: action, group: 'Other' }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const FIELD = '#f1f3f4'

type Period = '7' | '30' | '90' | '0'
const PERIODS: { value: Period; label: string }[] = [
  { value: '7', label: '7d' }, { value: '30', label: '30d' }, { value: '90', label: '90d' }, { value: '0', label: 'All' },
]

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
      return `Approved and sent reply${m?.contact ? ` to ${m.contact}` : row.lead_email ? ` to ${row.lead_email}` : ''}${m?.chars ? ` (${m.chars} chars)` : ''}`
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
    <div className="mt-2 min-w-0">
      <p className="m-0 mb-1 text-[12px]" style={{ color: MUTED }}>{label}</p>
      <pre className="m-0 px-3 py-2 rounded-[10px] text-[12px] leading-relaxed whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto" style={{ background: FIELD, color: INK, fontFamily: 'ui-monospace, monospace' }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

function RowDetail({ row }: { row: LogRow }) {
  const hasDetail = row.old_value || row.new_value || row.metadata || row.resource_id
  if (!hasDetail) return null
  return (
    <div className="pb-4 pt-1 pl-0 sm:pl-[140px]">
      {row.resource_type && row.resource_id && (
        <p className="m-0 mb-2 text-[12.5px]" style={{ color: MUTED }}>
          {row.resource_type} · <code className="text-[12px]" style={{ fontFamily: 'ui-monospace, monospace' }}>{row.resource_id}</code>
        </p>
      )}
      {row.old_value && row.new_value && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
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

  // Staff directory for PersonTag, derived from the rows already loaded (no extra fetch).
  const staff = useMemo(() => {
    const by = new Map<string, StaffMember>()
    for (const l of logs) {
      if (!l.user_email) continue
      const cur = by.get(l.user_email) ?? { email: l.user_email, name: displayName(l), actions: 0 }
      cur.actions += 1
      by.set(l.user_email, cur)
    }
    return by
  }, [logs])

  // Group logs by calendar day
  const grouped = logs.reduce<Record<string, LogRow[]>>((acc, row) => {
    const day = new Date(row.created_at).toLocaleDateString('en-SG', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    if (!acc[day]) acc[day] = []
    acc[day].push(row)
    return acc
  }, {})

  const periodLabel = days > 0 ? `last ${days} days` : 'all time'
  const anyFilter = filterUser || filterAction || days !== 30

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Activity log</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
              {loading ? 'Loading…' : `${logs.length} event${logs.length !== 1 ? 's' : ''} · ${periodLabel}`}
            </p>
          </div>
          <Btn level="secondary" onClick={() => load(true)} loading={refreshing} title="Refresh">
            {!refreshing && <RefreshCw size={13} strokeWidth={2} />}
            Refresh
          </Btn>
        </div>

        {/* ── Filters ────────────────────────────────────────────────────────── */}
        <div className="mt-6 mb-6 flex items-center gap-2 flex-wrap">
          <select
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
            className={inputCls.replace('w-full ', '') + ' w-auto min-w-[180px] cursor-pointer'}
            aria-label="Employee"
          >
            <option value="">All employees</option>
            {uniqueUsers.map(u => (
              <option key={u} value={u}>
                {u.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </option>
            ))}
          </select>

          <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className={inputCls.replace('w-full ', '') + ' w-auto min-w-[180px] cursor-pointer'} aria-label="Action">
            <option value="">All actions</option>
            {ACTION_GROUPS.map(group => (
              <optgroup key={group} label={group}>
                {ALL_ACTION_TYPES.filter(a => actionCfg(a).group === group).map(a => (
                  <option key={a} value={a}>{actionCfg(a).label}</option>
                ))}
              </optgroup>
            ))}
          </select>

          <Segmented<Period>
            value={String(days) as Period}
            onChange={v => setDays(parseInt(v))}
            options={PERIODS}
          />

          {anyFilter && (
            <Btn level="tertiary" onClick={() => { setFilterUser(''); setFilterAction(''); setDays(30) }}>
              Clear
            </Btn>
          )}
        </div>

        {/* ── Feed ───────────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-12 rounded-[10px] animate-pulse" style={{ background: FIELD }} />)}
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center">
            <p className="m-0 text-[15px]" style={{ color: MUTED }}>No activity in this period.</p>
            {days > 0 && <Btn level="tertiary" className="mt-3" onClick={() => setDays(0)}>Show all time</Btn>}
          </div>
        ) : (
          Object.entries(grouped).map(([day, rows]) => (
            <section key={day} className="mb-8">
              <p className="m-0 mb-1 text-[12.5px]" style={{ color: MUTED }}>{day}</p>

              <div className="border-t" style={{ borderColor: RULE }}>
                {rows.map(row => {
                  const cfg   = actionCfg(row.action)
                  const isExp = expanded === row.id
                  const hasDetail = row.old_value || row.new_value || row.metadata || row.resource_id

                  return (
                    <div key={row.id} className="border-b" style={{ borderColor: RULE }}>
                      <button
                        type="button"
                        onClick={() => hasDetail ? setExpanded(isExp ? null : row.id) : undefined}
                        aria-expanded={hasDetail ? isExp : undefined}
                        className={`w-full flex items-start gap-3 py-3 bg-transparent border-0 text-left ${hasDetail ? 'cursor-pointer hover:bg-[#f8f9fa]' : 'cursor-default'}`}
                      >
                        {/* Employee */}
                        <div className="w-[128px] flex-shrink-0 pt-px hidden sm:block">
                          {row.user_email
                            ? <PersonTag email={row.user_email} staff={staff} size="md" />
                            : <span className="text-[13px]" style={{ color: MUTED }}>{displayName(row)}</span>}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="sm:hidden">
                              {row.user_email && <PersonTag email={row.user_email} staff={staff} />}
                            </span>
                            <Chip>{cfg.label}</Chip>
                            <span className="text-[14px] min-w-0 break-words" style={{ color: INK }}>{describeAction(row)}</span>
                          </div>
                        </div>

                        {/* Right side */}
                        <div className="flex-shrink-0 flex items-center gap-2 pt-0.5">
                          <span className="text-[12.5px] tabular-nums whitespace-nowrap" style={{ color: MUTED }} title={fmtFull(row.created_at)}>
                            {timeAgo(row.created_at)}
                          </span>
                          {hasDetail
                            ? (isExp
                              ? <ChevronDown size={14} strokeWidth={2} style={{ color: '#9aa0a6' }} />
                              : <ChevronRight size={14} strokeWidth={2} style={{ color: '#9aa0a6' }} />)
                            : <span className="w-[14px]" />}
                        </div>
                      </button>

                      {isExp && <RowDetail row={row} />}
                    </div>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
