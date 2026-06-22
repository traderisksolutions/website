'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { RefreshCw, CheckCircle, AlertTriangle, RotateCcw, Megaphone, Bot, FileText, Inbox, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────
type IndexedFile  = { file_id: string; file_name: string; source_folder: string; chunk_count: number; last_indexed: string }
type Status       = { files: IndexedFile[]; totalChunks: number; folderUrls: Record<string, string> }
type IndexResult  = { indexed: string[]; skipped: string[]; deleted: string[]; errors: string[]; totalChunks: number }

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text()
  try { return JSON.parse(text) } catch { throw new Error(text.slice(0, 300)) }
}

// ── Design tokens ──────────────────────────────────────────────────────────
// Switch TAB_VARIANT to 'pill' for a filled-background style
const TAB_VARIANT: 'line' | 'pill' = 'line'

const TOKENS = {
  line: {
    activeColor:    (color: string) => color,
    activeBorder:   (color: string) => color,
    hoverBg:        'transparent',
    activeBg:       'transparent',
    inactiveBg:     'transparent',
    panelPaddingTop: 20,
  },
  pill: {
    activeColor:    (color: string) => color,
    activeBorder:   (_: string) => 'transparent',
    hoverBg:        'var(--muted)',
    activeBg:       'var(--muted)',
    inactiveBg:     'transparent',
    panelPaddingTop: 20,
  },
}

// ── Tab definitions ────────────────────────────────────────────────────────
type TabDef = { id: string; label: string; icon: React.ElementType; color: string; folder: string; purpose: string; fileFormat: string }

const TABS: TabDef[] = [
  { id: 'outbound',   label: 'Outbound AI',   icon: Megaphone, color: '#2563eb', folder: 'ai-outbound',         purpose: 'Cold campaign emails — prospects via Instantly',                     fileFormat: '[topic]-[type]-[mmm-yyyy].pdf' },
  { id: 'engagement', label: 'Engagement AI',  icon: Bot,       color: '#10b981', folder: 'engagement_ai_agent', purpose: 'Inbound lead reply drafting — Engagement Agent',                    fileFormat: '[topic]-[type]-[mmm-yyyy].pdf' },
  { id: 'inbound',    label: 'Inbound AI',     icon: Inbox,     color: '#7c3aed', folder: 'inbound_ai_agent',   purpose: 'Auto-draft replies for new inbound leads — Inbound Agent',          fileFormat: 'faq-[product]-[mmm-yyyy].txt' },
]

// ── Naming examples ────────────────────────────────────────────────────────
type NamingExample = { filename: string; description: string }

const OUTBOUND_EXAMPLES: NamingExample[] = [
  { filename: 'marine-pricing-may-2026.pdf',              description: 'Marine cargo indicative premiums' },
  { filename: 'benefits-underwriting-jan-2026.pdf',       description: 'Employee benefits underwriting criteria' },
  { filename: 'construction-policy-wording-mar-2026.pdf', description: 'Construction coverage and exclusions' },
  { filename: 'motor-guide-apr-2026.pdf',                 description: 'Plain-language motor explainer' },
  { filename: 'liability-case-study-jun-2026.pdf',        description: 'Client outcome for social proof' },
  { filename: 'company-credentials-jan-2026.pdf',         description: 'TRS licences, awards, track record' },
]

const ENGAGEMENT_EXAMPLES: NamingExample[] = [
  { filename: 'general-faq-jun-2026.pdf',        description: 'Common coverage FAQs for inbound replies' },
  { filename: 'claims-process-mar-2026.pdf',     description: 'Step-by-step claims procedure' },
  { filename: 'company-credentials-jan-2026.pdf', description: 'TRS background and licences' },
  { filename: 'liability-objection-may-2026.pdf', description: 'How to handle pricing pushback' },
  { filename: 'motor-coverage-apr-2026.pdf',     description: 'What motor insurance covers and excludes' },
  { filename: 'benefits-pricing-feb-2026.pdf',   description: 'Employee benefits indicative pricing' },
  { filename: 'marine-guide-jun-2026.pdf',       description: 'Plain-language marine guide for clients' },
]

const INBOUND_EXAMPLES: NamingExample[] = [
  { filename: 'faq-marine-cargo-jun-2026.txt',        description: 'Marine cargo FAQs for new leads (use FAQ builder)' },
  { filename: 'faq-group-medical-jun-2026.txt',       description: 'Group medical common questions' },
  { filename: 'product-overview-jun-2026.txt',        description: 'All TRS products at a glance' },
  { filename: 'process-claims-steps-jun-2026.txt',    description: 'Step-by-step claims guide' },
  { filename: 'objections-pricing-jun-2026.txt',      description: 'Handling pricing or coverage pushback' },
  { filename: 'company-credentials-jun-2026.txt',     description: 'TRS background, licences, track record' },
]

// ── Sub-components ─────────────────────────────────────────────────────────
function LegendRow({ label, color, description }: { label: string; color: string; description: string }) {
  return (
    <div className="flex gap-2.5 items-start">
      <span className="flex-shrink-0 mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-[5px] whitespace-nowrap"
        style={{ background: `${color}18`, color }}>
        {label}
      </span>
      <p className="text-[12px] text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}

function NamingGuide({ folder, color, icon: Icon, examples, fileFormat }: {
  folder: string; color: string; icon: React.ElementType; examples: NamingExample[]; fileFormat: string
}) {
  return (
    <div className="mb-4 rounded-lg border p-4" style={{ borderColor: `${color}20`, background: `${color}06` }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ width: 28, height: 28, background: `${color}18`, border: `1px solid ${color}30` }}>
          <Icon size={14} style={{ color }} strokeWidth={1.8} />
        </div>
        <div>
          <p className="text-[12px] font-semibold text-foreground font-mono">{folder}/</p>
          <p className="text-[11px] text-muted-foreground">
            Format: <code className="font-mono text-[11px]">{fileFormat}</code>
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {examples.map(ex => (
          <div key={ex.filename} className="flex items-start gap-2">
            <FileText size={11} className="flex-shrink-0 mt-0.5" style={{ color }} strokeWidth={2} />
            <div>
              <code className="text-[12px] font-mono text-foreground">{ex.filename}</code>
              <span className="text-[11px] text-muted-foreground ml-1.5">— {ex.description}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function RagIndexPage() {
  const [status,           setStatus]          = useState<Status | null>(null)
  const [loading,          setLoading]          = useState(true)
  const [error,            setError]            = useState<string | null>(null)
  const [activeTab,        setActiveTab]        = useState<string>(TABS[0].id)
  const [indexingFolder,   setIndexingFolder]   = useState<string | null>(null)
  const [lastRunByFolder,  setLastRunByFolder]  = useState<Record<string, IndexResult>>({})
  const tablistRef = useRef<HTMLDivElement>(null)

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

  async function runReindex(folder: string, force = false) {
    setIndexingFolder(folder); setError(null)
    try {
      const res  = await fetch('/api/knowledge/index', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force, folder }),
      })
      const data = await safeJson(res) as IndexResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Re-index failed')
      setLastRunByFolder(prev => ({ ...prev, [folder]: data }))
      await loadStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Re-index failed')
    } finally { setIndexingFolder(null) }
  }

  // Roving tabindex keyboard navigation
  function handleTabKey(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    const len = TABS.length
    let next = -1
    if      (e.key === 'ArrowRight') next = (idx + 1) % len
    else if (e.key === 'ArrowLeft')  next = (idx - 1 + len) % len
    else if (e.key === 'Home')       next = 0
    else if (e.key === 'End')        next = len - 1
    if (next >= 0) {
      e.preventDefault()
      setActiveTab(TABS[next].id)
      const btns = tablistRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')
      btns?.[next]?.focus()
    }
  }

  const tokens = TOKENS[TAB_VARIANT]

  return (
    <div className="p-8 max-w-[900px] mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">RAG Knowledge Index</h1>
          <p className="text-sm text-muted-foreground mt-1">Google Drive PDFs → vector chunks → AI retrieval</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadStatus} disabled={loading} className="gap-1.5">
          <RefreshCw size={13} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2.5 p-3.5 bg-destructive/8 border border-destructive/20 rounded-lg mb-4">
          <AlertTriangle size={14} className="text-destructive flex-shrink-0 mt-0.5" strokeWidth={2} />
          <p className="text-[12px] text-destructive leading-relaxed">{error}</p>
        </div>
      )}

      {/* ── Tablist ── */}
      <div
        role="tablist"
        aria-label="Knowledge base folders"
        ref={tablistRef}
        className={cn(
          'flex',
          TAB_VARIANT === 'line' ? 'border-b border-border gap-0' : 'gap-1 p-1 rounded-lg bg-muted mb-4'
        )}
      >
        {TABS.map((t, idx) => {
          const isActive   = t.id === activeTab
          const folderCount = status?.files.filter(f => f.source_folder === t.folder).length ?? 0

          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(t.id)}
              onKeyDown={(e) => handleTabKey(e, idx)}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-all duration-150 outline-none select-none',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-t-md',
                TAB_VARIANT === 'line'
                  ? cn(
                      'border-b-2 -mb-px',
                      isActive
                        ? 'text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                    )
                  : cn(
                      'rounded-md flex-1 justify-center',
                      isActive
                        ? 'text-foreground bg-background shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )
              )}
              style={
                TAB_VARIANT === 'line' && isActive
                  ? { color: tokens.activeColor(t.color), borderColor: tokens.activeBorder(t.color) }
                  : undefined
              }
            >
              <t.icon size={14} strokeWidth={2} />
              {t.label}
              {!loading && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-[5px] ml-0.5 transition-colors"
                  style={{
                    background: isActive ? `${t.color}15` : 'transparent',
                    color:      isActive ? t.color         : 'var(--muted-foreground)',
                    border:     `1px solid ${isActive ? `${t.color}30` : 'transparent'}`,
                  }}
                >
                  {folderCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Tab Panels ── */}
      {TABS.map(t => {
        const isActive     = t.id === activeTab
        const folderFiles  = status?.files.filter(f => f.source_folder === t.folder) ?? []
        const folderChunks = folderFiles.reduce((s, f) => s + f.chunk_count, 0)
        const overLimit    = folderFiles.length > 15
        const isIndexing   = indexingFolder === t.folder
        const lastRun      = lastRunByFolder[t.folder] ?? null

        return (
          <div
            key={t.id}
            id={`panel-${t.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${t.id}`}
            hidden={!isActive}
            style={{ paddingTop: tokens.panelPaddingTop }}
          >
            {/* Folder header + action buttons */}
            <div className="flex items-start justify-between gap-4 rounded-lg border p-4 mb-4"
              style={{ borderColor: `${t.color}25`, background: `${t.color}07` }}>
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5"
                  style={{ width: 32, height: 32, background: `${t.color}18`, border: `1px solid ${t.color}30` }}>
                  <t.icon size={15} style={{ color: t.color }} strokeWidth={1.8} />
                </div>
                <div>
                  <code className="text-[13px] font-semibold text-foreground">{t.folder}/</code>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{t.purpose}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0 flex-wrap">
                {status?.folderUrls?.[t.folder] && (
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="gap-1.5 h-8 text-[12px]"
                    title="Open this folder in Google Drive"
                  >
                    <a href={status.folderUrls[t.folder]} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={12} strokeWidth={2} />
                      Open in Drive
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => runReindex(t.folder, false)}
                  disabled={isIndexing}
                  className="gap-1.5 h-8 text-[12px]"
                >
                  <CheckCircle size={12} strokeWidth={2} />
                  {isIndexing ? 'Indexing…' : 'Re-index New'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => runReindex(t.folder, true)}
                  disabled={isIndexing}
                  className="gap-1.5 h-8 text-[12px]"
                  title={`Re-process all files in ${t.folder}/ from scratch`}
                >
                  <RotateCcw size={12} strokeWidth={2} />
                  Force All
                </Button>
              </div>
            </div>

            {/* Last run result (per folder) */}
            {lastRun && (
              <div className={cn(
                'flex items-start gap-2.5 p-3.5 border rounded-lg mb-4',
                lastRun.errors.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
              )}>
                {lastRun.errors.length > 0
                  ? <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={2} />
                  : <CheckCircle   size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" strokeWidth={2} />}
                <div>
                  <p className="text-[12px] font-semibold text-foreground">
                    Re-index complete — {lastRun.indexed.length} indexed, {lastRun.skipped.length} skipped, {lastRun.deleted.length} deleted
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {lastRun.errors.length > 0
                      ? `Errors: ${lastRun.errors.join(' · ')}`
                      : lastRun.indexed.length > 0
                        ? `Indexed: ${lastRun.indexed.join(', ')}`
                        : 'No changes — all files already up to date.'}
                  </p>
                </div>
              </div>
            )}

            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Indexed Files</p>
                  <p className="text-[26px] font-bold tracking-tight text-foreground">{loading ? '—' : folderFiles.length}</p>
                  <p className={cn('text-[11px] mt-1', overLimit ? 'text-destructive' : 'text-muted-foreground')}>
                    {overLimit ? '⚠ Over recommended 15-file limit' : 'Target: ≤ 15 files per folder'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Total Chunks</p>
                  <p className="text-[26px] font-bold tracking-tight text-foreground">{loading ? '—' : folderChunks}</p>
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

            {/* Naming guide */}
            <NamingGuide
              folder={t.folder}
              color={t.color}
              icon={t.icon}
              fileFormat={t.fileFormat}
              examples={t.id === 'outbound' ? OUTBOUND_EXAMPLES : t.id === 'inbound' ? INBOUND_EXAMPLES : ENGAGEMENT_EXAMPLES}
            />

            {/* File table */}
            <Card>
              <CardHeader className="py-3 px-5 border-b border-border">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                    Indexed Files — <span className="font-mono">{t.folder}/</span>
                  </p>
                  {overLimit && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                      <AlertTriangle size={11} strokeWidth={2} />
                      {folderFiles.length} / 15 limit
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
                ) : folderFiles.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground italic">
                    No files indexed in <code className="font-mono">{t.folder}/</code> yet — click &quot;Re-index New&quot; to start
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {['File', 'Chunks', 'Last Indexed'].map(h => (
                          <TableHead key={h}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {folderFiles.map(f => (
                        <TableRow key={f.file_id}>
                          <TableCell className="text-[13px] text-foreground">{f.file_name}</TableCell>
                          <TableCell>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded"
                              style={{ background: `${t.color}15`, color: t.color }}>
                              {f.chunk_count}
                            </span>
                          </TableCell>
                          <TableCell className="text-[12px] text-muted-foreground">
                            {new Date(f.last_indexed).toLocaleDateString('en-SG', {
                              day: 'numeric', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )
      })}

      {/* How it works — shared reference card */}
      <Card className="mt-5">
        <CardContent className="p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">How indexing works</p>
          <div className="flex flex-col gap-2.5">
            <LegendRow label="Re-index New" color="#2563eb" description="Scans only the selected folder. Processes new files that haven't been indexed yet — skips existing ones. Use after uploading new documents." />
            <LegendRow label="Force All" color="#dc2626" description="Deletes all chunks for the selected folder and rebuilds from scratch. Use if you replaced or updated a file in Drive. Re-processes every file in the folder." />
            <LegendRow label="Auto-sync (Nightly 2am SGT)" color="#10b981" description="Scans both folders automatically every night at 2am Singapore time. Picks up new files only. No action needed from you." />
            <LegendRow label="Chunks" color="#8b5cf6" description="Each PDF is split into ~1,500-character passages with 150-character overlaps. The AI retrieves the 6 most relevant chunks per email query." />
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground text-center mt-3">
        Each chunk is ~1,500 characters of extracted PDF text with a 150-character overlap. The AI retrieves the 6 most relevant chunks per email query.
      </p>
    </div>
  )
}
