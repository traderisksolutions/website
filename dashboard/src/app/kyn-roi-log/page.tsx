'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, RefreshCw, Info, ChevronDown, ScrollText } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { DevLogEntry } from '@/app/api/dev-logs/route'

const PROJECT_LABELS: Record<string, string> = {
  'trs-dashboard': 'Dashboard',
  'trs-website':   'Website',
  'ai-agent':      'AI Agent',
}

const TAG_COLORS: Record<string, string> = {
  feature:  'bg-blue-50 text-blue-600',
  bugfix:   'bg-red-50 text-red-600',
  design:   'bg-violet-50 text-violet-600',
  refactor: 'bg-amber-50 text-amber-600',
  security: 'bg-orange-50 text-orange-600',
  perf:     'bg-green-50 text-green-600',
}

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
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <ScrollText size={20} strokeWidth={2} className="text-primary flex-shrink-0" />
            <h1 className="text-[22px] font-bold tracking-tight text-foreground leading-tight">
              Dev Logs
            </h1>
          </div>
          <p className="text-[13.5px] text-muted-foreground leading-snug">
            Session changelog — what was built and when
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md border border-border text-muted-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Table card */}
      <Card>
        {/* Column headers */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-[--border-subtle] bg-muted/20 rounded-t-lg">
          <div className="w-28 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Date
          </div>
          <div className="w-24 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Project
          </div>
          <div className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Session
          </div>
          <div className="w-36 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hidden sm:block">
            Tags
          </div>
          <div className="w-5 flex-shrink-0" />
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground gap-2">
            <RefreshCw size={14} strokeWidth={2} className="animate-spin opacity-50" />
            Loading logs…
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="mx-5 my-4 px-4 py-3 rounded-lg bg-destructive/6 border border-destructive/20 text-[12.5px] text-destructive">
            Could not load logs — {error}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Info size={24} strokeWidth={1.5} className="opacity-30" />
            <div className="text-center">
              <p className="text-[13px] font-medium">No log entries yet</p>
              <p className="text-[12px] text-muted-foreground/70 mt-1">
                Say &ldquo;add to logs&rdquo; at the end of a session and Claude will write one.
              </p>
            </div>
          </div>
        )}

        {/* Rows */}
        {logs.map((log, idx) => {
          const open   = expanded.has(log.id)
          const isLast = idx === logs.length - 1
          return (
            <div key={log.id}>
              <button
                onClick={() => toggle(log.id)}
                aria-expanded={open}
                className={cn(
                  'w-full text-left flex items-center gap-4 px-5 py-4 transition-colors',
                  !isLast && 'border-b border-[--border-subtle]',
                  open ? 'bg-muted/30' : 'hover:bg-muted/20',
                )}
              >
                {/* Date */}
                <div className="w-28 flex-shrink-0">
                  <p className="text-[12px] font-semibold text-foreground tabular-nums">
                    {fmtDate(log.session_date)}
                  </p>
                </div>

                {/* Project */}
                <div className="w-24 flex-shrink-0">
                  <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-primary/8 text-primary">
                    {PROJECT_LABELS[log.project] ?? log.project}
                  </span>
                </div>

                {/* Title */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">{log.title}</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                    {log.changes.length} change{log.changes.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Tags */}
                <div className="w-36 flex-shrink-0 flex flex-wrap gap-1 hidden sm:flex">
                  {(log.tags ?? []).slice(0, 3).map(tag => (
                    <span
                      key={tag}
                      className={cn(
                        'text-[9.5px] font-bold px-1.5 py-[1px] rounded-sm capitalize',
                        TAG_COLORS[tag] ?? 'bg-muted text-muted-foreground',
                      )}
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Chevron */}
                <ChevronDown
                  size={14}
                  strokeWidth={2}
                  className={cn(
                    'text-muted-foreground/40 flex-shrink-0 transition-transform duration-200',
                    open && 'rotate-180',
                  )}
                />
              </button>

              {/* Expanded: bullet list */}
              {open && (
                <div className={cn(
                  'bg-muted/10 px-5 py-4',
                  !isLast && 'border-b border-[--border-subtle]',
                )}>
                  <ul className="space-y-2">
                    {log.changes.map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[12.5px] text-foreground/80 leading-snug">
                        <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-primary/40 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
      </Card>

    </div>
  )
}
