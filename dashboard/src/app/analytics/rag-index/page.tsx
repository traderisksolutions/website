'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, CheckCircle, AlertTriangle, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type IndexedFile = {
  file_id:      string
  file_name:    string
  chunk_count:  number
  last_indexed: string
}
type Status = { files: IndexedFile[]; totalChunks: number }
type IndexResult = { indexed: string[]; skipped: string[]; deleted: string[]; errors: string[]; totalChunks: number }

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text()
  try { return JSON.parse(text) } catch { throw new Error(text.slice(0, 300)) }
}

function LegendRow({ label, color, description }: { label: string; color: string; description: string }) {
  return (
    <div className="flex gap-2.5 items-start">
      <span className="flex-shrink-0 mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
      >
        {label}
      </span>
      <p className="text-[12px] text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}

export default function RagIndexPage() {
  const [status,   setStatus]   = useState<Status | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [indexing, setIndexing] = useState(false)
  const [lastRun,  setLastRun]  = useState<IndexResult | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/knowledge/index', { cache: 'no-store' })
      const data = await safeJson(res) as Status
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to load')
      setStatus(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load index status')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  async function runReindex(force = false) {
    setIndexing(true); setError(null); setLastRun(null)
    try {
      const res  = await fetch('/api/knowledge/index', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const data = await safeJson(res) as IndexResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Re-index failed')
      setLastRun(data); await loadStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Re-index failed')
    } finally { setIndexing(false) }
  }

  const fileCount = status?.files.length ?? 0
  const overLimit = fileCount > 15

  return (
    <div className="p-8 max-w-[900px] mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">RAG Knowledge Index</h1>
          <p className="text-sm text-muted-foreground mt-1">Google Drive PDFs → vector chunks → Gemini retrieval</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={loadStatus} disabled={loading} className="gap-1.5">
            <RefreshCw size={13} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => runReindex(false)} disabled={indexing} className="gap-1.5">
            <CheckCircle size={13} strokeWidth={2} />
            Re-index New Files
          </Button>
          <Button variant="destructive" size="sm" onClick={() => runReindex(true)} disabled={indexing} className="gap-1.5"
            title="Forces all files to be re-indexed, even if unchanged">
            <RotateCcw size={13} strokeWidth={2} />
            Force Re-index All
          </Button>
        </div>
      </div>

      {/* How it works */}
      <Card className="mb-5">
        <CardContent className="p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">How it works</p>
          <div className="flex flex-col gap-2.5">
            <LegendRow label="Re-index New Files" color="#2563eb" description="Scans your Google Drive folder. Only processes PDFs that have never been indexed before. Files already in the index are skipped. Use this after uploading new documents." />
            <LegendRow label="Force Re-index All" color="#dc2626" description="Deletes all existing chunks and rebuilds the entire index from scratch. Use this if a file was updated or replaced in Drive, or if results seem stale. Slower — re-processes every PDF." />
            <LegendRow label="Auto-sync (Nightly 2am SGT)" color="#10b981" description="Runs automatically every night at 2am Singapore time. Same as Re-index New Files — only picks up PDFs added since the last run. No action needed from you." />
            <LegendRow label="Chunks" color="#8b5cf6" description="Each PDF is split into ~1,500-character passages (chunks) with 150-character overlaps. When an email arrives, the AI finds the 6 most relevant chunks and uses them to write the reply." />
          </div>
        </CardContent>
      </Card>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2.5 p-3.5 bg-destructive/8 border border-destructive/20 rounded-lg mb-4">
          <AlertTriangle size={14} className="text-destructive flex-shrink-0 mt-0.5" strokeWidth={2} />
          <p className="text-[12px] text-destructive leading-relaxed">{error}</p>
        </div>
      )}

      {/* Last run result */}
      {lastRun && (
        <div className={cn(
          'flex items-start gap-2.5 p-3.5 border rounded-lg mb-4',
          lastRun.errors.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
        )}>
          {lastRun.errors.length > 0
            ? <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={2} />
            : <CheckCircle size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" strokeWidth={2} />}
          <div>
            <p className="text-[12px] font-semibold text-foreground">
              Re-index complete — {lastRun.indexed.length} indexed, {lastRun.skipped.length} skipped, {lastRun.deleted.length} deleted
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {lastRun.errors.length > 0
                ? `Errors: ${lastRun.errors.join(' · ')}`
                : lastRun.indexed.length > 0
                  ? `Indexed: ${lastRun.indexed.join(', ')}`
                  : 'No changes detected — all files already up to date.'}
            </p>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Indexed Files</p>
            <p className="text-[26px] font-bold tracking-tight text-foreground">{loading ? '—' : fileCount}</p>
            <p className={cn('text-[11px] mt-1', overLimit ? 'text-destructive' : 'text-muted-foreground')}>
              {overLimit ? '⚠ Over recommended 15-file limit' : 'Target: ≤ 15 files'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Total Chunks</p>
            <p className="text-[26px] font-bold tracking-tight text-foreground">{loading ? '—' : (status?.totalChunks ?? 0)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Searchable text passages</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Auto-sync</p>
            <p className="text-[20px] font-bold tracking-tight text-emerald-600">Nightly 2am SGT</p>
            <p className="text-[11px] text-muted-foreground mt-1">New files only · use Re-index for immediate</p>
          </CardContent>
        </Card>
      </div>

      {/* File table */}
      <Card>
        <CardHeader className="py-3 px-5 border-b border-border">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Indexed Files</p>
            {overLimit && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                <AlertTriangle size={11} strokeWidth={2} />
                {fileCount} / 15 recommended limit
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : !status?.files.length ? (
            <div className="py-8 text-center text-sm text-muted-foreground italic">
              No files indexed yet — click &quot;Re-index New Files&quot; to start
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {['File', 'Chunks', 'Last Indexed'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground text-left uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {status.files.map((f, i) => (
                  <tr key={f.file_id} className={cn('border-b border-border/50', i % 2 === 0 ? 'bg-background' : 'bg-muted/20')}>
                    <td className="px-4 py-2.5 text-[13px] text-foreground">{f.file_name}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">{f.chunk_count}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                      {new Date(f.last_indexed).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground text-center mt-3">
        Each chunk is ~1,500 characters of extracted PDF text with a 150-character overlap. The AI retrieves the 6 most relevant chunks per email query.
      </p>
    </div>
  )
}
