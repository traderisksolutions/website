'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Waypoints, Loader2, Trash2, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppSplitLayout, AppMainPanel, AppPageHeader } from '@/components/app-shell'
import { DataTableToolbar, DataTableSearch } from '@/components/data-table/toolbar'
import { StatusBadge } from '@/components/status-badge'

interface PipelineRow {
  origin:            'inbound' | 'outbound'
  id:                 string
  pipeline_id:        string
  display_name:       string | null
  email:              string | null
  company:            string | null
  source_detail:      string | null
  raw_status:         string
  status_bucket:      'new' | 'in_progress' | 'closed' | 'spam'
  topic_or_industry:  string | null
  priority:           'high' | 'medium' | 'low' | null
  created_at:         string
  last_activity_at:   string
}

const ORIGIN_OPTIONS = ['all', 'inbound', 'outbound'] as const
const ORIGIN_LABELS: Record<string, string> = { all: 'All', inbound: 'Inbound', outbound: 'Outbound' }

const STATUS_OPTIONS = ['all', 'new', 'in_progress', 'closed', 'spam'] as const
const STATUS_LABELS: Record<string, string> = {
  all: 'All', new: 'New', in_progress: 'In Progress', closed: 'Closed', spam: 'Spam',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-[--border-subtle]">
          <td className="pl-8 pr-2 h-11" />
          {[60, 45, 30, 20, 20, 25].map((w, j) => (
            <td key={j} className="pr-3 h-11"><div className="skeleton sk-line" style={{ width: `${w}%` }} /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

export default function PipelinePage() {
  const router = useRouter()
  const [rows, setRows] = useState<PipelineRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [origin, setOrigin] = useState<typeof ORIGIN_OPTIONS[number]>('all')
  const [status, setStatus] = useState<typeof STATUS_OPTIONS[number]>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => setSearch(searchInput), 250)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [searchInput])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const seq = ++requestSeq.current
    const params = new URLSearchParams()
    if (origin !== 'all') params.set('origin', origin)
    if (status !== 'all') params.set('status', status)
    if (search) params.set('q', search)
    try {
      const res = await fetch(`/api/pipeline?${params.toString()}`, { cache: 'no-store' })
      if (seq !== requestSeq.current) return   // a newer request already landed — drop this one
      if (!res.ok) throw new Error('Failed to load pipeline')
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
    } catch {
      if (seq === requestSeq.current) setError('Failed to load pipeline')
    } finally {
      if (seq === requestSeq.current) { setLoading(false); setSelected(new Set()) }
    }
  }, [origin, status, search])

  useEffect(() => { load() }, [load])

  const counts = useMemo(() => ({
    total:    rows.length,
    inbound:  rows.filter(r => r.origin === 'inbound').length,
    outbound: rows.filter(r => r.origin === 'outbound').length,
  }), [rows])

  function toggleOne(id: string) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function toggleAll() {
    setSelected(prev => prev.size === rows.length ? new Set() : new Set(rows.map(r => r.pipeline_id)))
  }

  async function deleteSelected() {
    const targets = rows.filter(r => selected.has(r.pipeline_id))
    if (targets.length === 0) return
    if (!confirm(`Delete ${targets.length} lead${targets.length === 1 ? '' : 's'}? This can't be undone.`)) return
    setDeleting(true)
    try {
      const res = await fetch('/api/pipeline', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: targets.map(r => ({ origin: r.origin, id: r.id })) }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.partial ? `Only ${d.deleted} of ${targets.length} deleted — ${d.error}` : (d.error ?? 'Delete failed'))
        // Some rows may have actually been removed even on a partial failure — refresh either way.
        await load()
        return
      }
      await load()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AppSplitLayout>
      <AppMainPanel>
        <AppPageHeader
          title="Pipeline"
          description={loading
            ? 'Loading pipeline…'
            : `${counts.total} lead${counts.total !== 1 ? 's' : ''} · ${counts.inbound} inbound · ${counts.outbound} outbound`}
        />

        <div className="flex-1 overflow-hidden px-6 pb-6">
          <div className="h-full flex flex-col rounded-xl bg-card overflow-hidden" style={{ boxShadow: 'var(--card-shadow)' }}>

            <DataTableToolbar>
              <div className="flex flex-wrap gap-1">
                {ORIGIN_OPTIONS.map(o => (
                  <button key={o} onClick={() => setOrigin(o)} aria-pressed={origin === o}
                    className={cn('filter-pill', origin === o && 'active')}>
                    {ORIGIN_LABELS[o]}
                  </button>
                ))}
              </div>
              <div className="w-px h-5 bg-[--border-subtle] mx-1" />
              <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                {STATUS_OPTIONS.map(s => (
                  <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s}
                    className={cn('filter-pill', status === s && 'active')}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
              <DataTableSearch
                value={searchInput}
                onChange={setSearchInput}
                placeholder="Search pipeline…"
                className="flex-shrink-0"
              />
            </DataTableToolbar>

            {error && (
              <div className="flex items-center gap-2 px-5 py-2.5 flex-shrink-0 text-[13px]" style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border, var(--error))', color: 'var(--error)' }}>
                <AlertCircle size={14} className="flex-shrink-0" />
                <span className="flex-1">{error}</span>
                <button onClick={() => load()} className="text-[12px] font-semibold underline bg-transparent border-0 cursor-pointer" style={{ color: 'var(--error)' }}>Retry</button>
                <button onClick={() => setError(null)} className="bg-transparent border-none cursor-pointer leading-none" style={{ color: 'var(--error)' }}><X size={14} /></button>
              </div>
            )}

            {selected.size > 0 && (
              <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-2.5 bg-foreground text-background text-[13px] flex-shrink-0">
                <span className="font-semibold">{selected.size} selected</span>
                <div className="flex-1" />
                <button
                  onClick={deleteSelected}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold bg-background text-foreground rounded-md cursor-pointer disabled:opacity-40"
                >
                  {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
                <button onClick={() => setSelected(new Set())} className="text-[12px] opacity-60 hover:opacity-100 cursor-pointer bg-transparent border-0 text-background">
                  Clear
                </button>
              </div>
            )}

            <div className="flex-1 overflow-auto">
              <table className="data-table w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className="pl-8 pr-2 w-8 text-left">
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && selected.size === rows.length}
                        onChange={toggleAll}
                        className="cursor-pointer"
                        aria-label="Select all"
                      />
                    </th>
                    <th className="pr-3 text-left">Name</th>
                    <th className="text-left">Email / Company</th>
                    <th className="text-left">Origin</th>
                    <th className="text-left">Topic / Industry</th>
                    <th className="text-left">Priority</th>
                    <th className="text-left">Status</th>
                    <th className="text-right pr-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <SkeletonRows />
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <div className="empty-state">
                          <div className="empty-icon-wrap">
                            <Waypoints size={20} className="text-muted-foreground" />
                          </div>
                          <p className="empty-title">{search ? 'No leads found' : 'No leads yet'}</p>
                          <p className="empty-desc">
                            {search ? `No leads match "${search}"` : 'Inbound and outbound leads will appear here as they come in.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rows.map(r => {
                      return (
                        <tr key={r.pipeline_id}
                          onClick={() => router.push(r.origin === 'inbound' ? `/inbound/email?lead=${r.id}` : `/outbound/leads?lead=${r.id}`)}
                          className={cn('cursor-pointer border-b border-[--border-subtle] hover:bg-muted/40 transition-colors', selected.has(r.pipeline_id) && 'bg-primary/[0.04]')}>
                          <td className="pl-8 pr-2 h-11" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(r.pipeline_id)}
                              onChange={() => toggleOne(r.pipeline_id)}
                              className="cursor-pointer"
                              aria-label={`Select ${r.display_name ?? 'lead'}`}
                            />
                          </td>
                          <td className="pr-3 h-11">
                            <span className="text-[13px] font-medium text-foreground leading-none">
                              {r.display_name || '—'}
                            </span>
                          </td>
                          <td className="text-[12px] text-muted-foreground pr-3 max-w-[220px]">
                            <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                              {r.email ?? '—'}{r.company ? ` · ${r.company}` : ''}
                            </span>
                          </td>
                          <td className="pr-3">
                            <span className={cn(
                              'text-[10.5px] font-semibold px-2 py-0.5 rounded-[6px] uppercase tracking-wide',
                              r.origin === 'inbound' ? 'bg-primary/8 text-primary' : 'bg-muted text-muted-foreground',
                            )}>
                              {r.origin}
                            </span>
                          </td>
                          <td className="text-[12px] text-muted-foreground pr-3">
                            {r.topic_or_industry ?? '—'}
                          </td>
                          <td className="pr-3">
                            {r.priority ? <StatusBadge status={r.priority} /> : <span className="text-muted-foreground/30">—</span>}
                          </td>
                          <td className="pr-3">
                            <StatusBadge status={r.status_bucket} label={STATUS_LABELS[r.status_bucket] ?? r.status_bucket} />
                          </td>
                          <td className="text-[11px] text-muted-foreground/60 whitespace-nowrap text-right pr-4">
                            {fmtDate(r.created_at)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {!loading && rows.length > 0 && (
              <div className="px-4 py-2.5 border-t border-[--border-subtle] bg-muted/20 flex-shrink-0">
                <span className="text-[11px] text-muted-foreground/60">
                  {rows.length} lead{rows.length !== 1 ? 's' : ''}
                  {(origin !== 'all' || status !== 'all') && ' · filtered'}
                </span>
              </div>
            )}
          </div>
        </div>
      </AppMainPanel>
    </AppSplitLayout>
  )
}
