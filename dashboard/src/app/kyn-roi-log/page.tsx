'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn, Chip } from '@/components/crm/primitives'
import type { DevLogEntry } from '@/app/api/dev-logs/route'

const PROJECT_LABELS: Record<string, string> = {
  'trs-dashboard': 'Dashboard',
  'trs-website':   'Website',
  'ai-agent':      'AI agent',
}

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const FIELD = '#f1f3f4'

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function KynRoiLogPage() {
  const [logs,     setLogs]     = useState<DevLogEntry[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function load() {
    setLoading(true)
    setError(null)
    fetch('/api/dev-logs', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((rows: DevLogEntry[]) => setLogs(rows))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">

        {/* Header */}
        <div className="flex items-end justify-between gap-6 flex-wrap mb-8">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Dev logs</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
              {loading ? 'Loading…' : `${logs.length} session entr${logs.length === 1 ? 'y' : 'ies'} · what was built and when`}
            </p>
          </div>
          <Btn level="secondary" onClick={load} loading={loading}>
            {!loading && <RefreshCw size={12} strokeWidth={2} />}
            Refresh
          </Btn>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-12 rounded-[10px] animate-pulse" style={{ background: FIELD }} />)}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <p className="m-0 py-4 text-[14px]" style={{ color: INK }}>Error: could not load logs. {error}</p>
        )}

        {/* Empty */}
        {!loading && !error && logs.length === 0 && (
          <p className="m-0 py-16 text-center text-[15px]" style={{ color: MUTED }}>
            No log entries yet. Say &ldquo;add to logs&rdquo; at the end of a session and Claude writes one.
          </p>
        )}

        {/* Rows */}
        {!loading && logs.length > 0 && (
          <div className="border-t" style={{ borderColor: RULE }}>
            {logs.map(log => {
              const open = expanded.has(log.id)
              return (
                <div key={log.id} className="border-b" style={{ borderColor: RULE }}>
                  <button
                    type="button"
                    onClick={() => toggle(log.id)}
                    aria-expanded={open}
                    className={cn(
                      'w-full text-left flex items-start sm:items-center gap-3 sm:gap-4 py-3.5 bg-transparent border-0 cursor-pointer transition-colors',
                      open ? 'bg-[#f8f9fa]' : 'hover:bg-[#f8f9fa]',
                    )}
                  >
                    {/* Date */}
                    <p className="m-0 w-[96px] sm:w-[112px] flex-shrink-0 text-[13px] tabular-nums pt-0.5 sm:pt-0" style={{ color: MUTED }}>
                      {fmtDate(log.session_date)}
                    </p>

                    {/* Title, project, tags */}
                    <div className="flex-1 min-w-0">
                      <p className="m-0 text-[14px] leading-snug" style={{ color: INK }}>{log.title}</p>
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <Chip>{PROJECT_LABELS[log.project] ?? log.project}</Chip>
                        {(log.tags ?? []).slice(0, 3).map(tag => (
                          <Chip key={tag} className="capitalize">{tag}</Chip>
                        ))}
                        <span className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>
                          {log.changes.length} change{log.changes.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Chevron */}
                    <ChevronDown
                      size={14}
                      strokeWidth={2}
                      className={cn('flex-shrink-0 mt-1 sm:mt-0 transition-transform duration-200', open && 'rotate-180')}
                      style={{ color: '#9aa0a6' }}
                    />
                  </button>

                  {/* Expanded: bullet list */}
                  {open && (
                    <ul className="m-0 pl-0 sm:pl-[128px] pb-4 pt-1 list-none flex flex-col gap-2">
                      {log.changes.map((item, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-[14px] leading-snug" style={{ color: '#3c4043' }}>
                          <span className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#9aa0a6' }} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
