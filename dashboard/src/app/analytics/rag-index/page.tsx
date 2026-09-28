'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { RefreshCw, ExternalLink } from 'lucide-react'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { cn } from '@/lib/utils'
import { Btn, Chip } from '@/components/crm/primitives'
import { StatCard } from '@/components/stat-card'

// ── Types ──────────────────────────────────────────────────────────────────
type IndexedFile  = { file_id: string; file_name: string; source_folder: string; chunk_count: number; last_indexed: string }
type Status       = { files: IndexedFile[]; totalChunks: number; folderUrls: Record<string, string> }
type IndexResult  = { indexed: string[]; skipped: string[]; deleted: string[]; errors: string[]; totalChunks: number }

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text()
  try { return JSON.parse(text) } catch { throw new Error(text.slice(0, 300)) }
}

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const FIELD = '#f1f3f4'
const MONO = 'ui-monospace, monospace'

// ── Tab definitions ────────────────────────────────────────────────────────
type TabDef = { id: string; label: string; folder: string; purpose: string; fileFormat: string }

const TABS: TabDef[] = [
  { id: 'outbound',   label: 'Outbound AI',   folder: 'ai-outbound',         purpose: 'Cold campaign emails to prospects via Instantly',      fileFormat: '[topic]-[type]-[mmm-yyyy].pdf' },
  { id: 'engagement', label: 'Engagement AI', folder: 'engagement_ai_agent', purpose: 'Inbound lead reply drafting by the Engagement agent', fileFormat: '[topic]-[type]-[mmm-yyyy].pdf' },
  { id: 'inbound',    label: 'Inbound AI',    folder: 'inbound_ai_agent',    purpose: 'Auto-draft replies for new inbound leads',            fileFormat: 'faq-[product]-[mmm-yyyy].txt' },
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
  { filename: 'general-faq-jun-2026.pdf',         description: 'Common coverage FAQs for inbound replies' },
  { filename: 'claims-process-mar-2026.pdf',      description: 'Step-by-step claims procedure' },
  { filename: 'company-credentials-jan-2026.pdf', description: 'TRS background and licences' },
  { filename: 'liability-objection-may-2026.pdf', description: 'How to handle pricing pushback' },
  { filename: 'motor-coverage-apr-2026.pdf',      description: 'What motor insurance covers and excludes' },
  { filename: 'benefits-pricing-feb-2026.pdf',    description: 'Employee benefits indicative pricing' },
  { filename: 'marine-guide-jun-2026.pdf',        description: 'Plain-language marine guide for clients' },
]

const INBOUND_EXAMPLES: NamingExample[] = [
  { filename: 'faq-marine-cargo-jun-2026.txt',     description: 'Marine cargo FAQs for new leads (use FAQ builder)' },
  { filename: 'faq-group-medical-jun-2026.txt',    description: 'Group medical common questions' },
  { filename: 'product-overview-jun-2026.txt',     description: 'All TRS products at a glance' },
  { filename: 'process-claims-steps-jun-2026.txt', description: 'Step-by-step claims guide' },
  { filename: 'objections-pricing-jun-2026.txt',   description: 'Handling pricing or coverage pushback' },
  { filename: 'company-credentials-jun-2026.txt',  description: 'TRS background, licences, track record' },
]

// ── Sub-components ─────────────────────────────────────────────────────────
function LegendRow({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex gap-3 items-start py-3 border-b" style={{ borderColor: RULE }}>
      <span className="flex-shrink-0 mt-0.5"><Chip>{label}</Chip></span>
      <p className="m-0 text-[14px] leading-relaxed" style={{ color: '#3c4043' }}>{description}</p>
    </div>
  )
}

function NamingGuide({ folder, examples, fileFormat }: {
  folder: string; examples: NamingExample[]; fileFormat: string
}) {
  return (
    <section className="mb-8">
      <h2 className="m-0 mb-3 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>File naming</h2>
      <div className="rounded-[16px] px-5 py-4" style={{ background: FIELD }}>
        <p className="m-0 text-[13px]" style={{ color: MUTED }}>
          <code style={{ fontFamily: MONO, color: INK }}>{folder}/</code> · format <code style={{ fontFamily: MONO, color: INK }}>{fileFormat}</code>
        </p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {examples.map(ex => (
            <div key={ex.filename} className="min-w-0 text-[13px] leading-snug">
              <code className="break-all" style={{ fontFamily: MONO, color: INK }}>{ex.filename}</code>
              <span className="ml-1.5" style={{ color: MUTED }}>{ex.description}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
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

  const totalFiles = status?.files.length ?? 0
  const totalChunks = status?.totalChunks ?? status?.files.reduce((s, f) => s + f.chunk_count, 0) ?? 0

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">

        {/* Header */}
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">RAG index</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
              {loading && !status ? 'Loading…' : `${totalFiles} file${totalFiles === 1 ? '' : 's'} · ${totalChunks.toLocaleString()} chunks · ${TABS.length} Drive folders indexed for retrieval`}
            </p>
          </div>
          <Btn level="secondary" onClick={loadStatus} loading={loading}>
            {!loading && <RefreshCw size={13} strokeWidth={2} />}
            Refresh
          </Btn>
        </div>

        {/* Error line */}
        {error && (
          <p className="m-0 mt-4 text-[14px]" style={{ color: INK }}>Error: {error}</p>
        )}

        {/* ── Tablist ── */}
        <div
          role="tablist"
          aria-label="Knowledge base folders"
          ref={tablistRef}
          className="mt-6 flex items-center gap-6 border-b overflow-x-auto"
          style={{ borderColor: RULE }}
        >
          {TABS.map((t, idx) => {
            const isActive   = t.id === activeTab
            const folderCount = status?.files.filter(f => f.source_folder === t.folder).length ?? 0

            return (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${t.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(t.id)}
                onKeyDown={(e) => handleTabKey(e, idx)}
                className={cn(
                  'relative -mb-px inline-flex items-center gap-1.5 pb-3 pt-1 text-[15px] bg-transparent border-0 border-b-2 cursor-pointer whitespace-nowrap outline-none',
                  isActive ? 'font-medium' : 'hover:text-[#202124]',
                )}
                style={{ color: isActive ? INK : MUTED, borderColor: isActive ? INK : 'transparent' }}
              >
                {t.label}
                {!loading && <span className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>{folderCount}</span>}
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
              className="pt-6"
            >
              {/* Folder line + actions */}
              <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
                <p className="m-0 text-[14px] min-w-0" style={{ color: '#3c4043' }}>
                  <code style={{ fontFamily: MONO, color: INK }}>{t.folder}/</code>
                  <span style={{ color: MUTED }}> · {t.purpose}</span>
                </p>
                <div className="flex gap-2 flex-shrink-0 flex-wrap">
                  {status?.folderUrls?.[t.folder] && (
                    <a
                      href={status.folderUrls[t.folder]}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open this folder in Google Drive"
                      className="inline-flex items-center gap-1.5 h-9 px-3.5 text-[13.5px] font-medium rounded-[10px] bg-white text-[#202124] border border-[#dadce0] hover:bg-[#f8f9fa] no-underline whitespace-nowrap"
                    >
                      <ExternalLink size={12} strokeWidth={2} />
                      Open in Drive
                    </a>
                  )}
                  <Btn level="primary" onClick={() => runReindex(t.folder, false)} disabled={isIndexing} loading={isIndexing}>
                    {isIndexing ? 'Indexing…' : 'Index new files'}
                  </Btn>
                  <Btn
                    level="secondary"
                    className="text-[#c5221f]"
                    onClick={() => runReindex(t.folder, true)}
                    disabled={isIndexing}
                    title={`Delete every chunk in ${t.folder}/ and re-process all files`}
                  >
                    Rebuild folder
                  </Btn>
                </div>
              </div>

              {/* Last run result (per folder) */}
              {lastRun && (
                <div className="mb-6 py-3 border-t border-b" style={{ borderColor: RULE }}>
                  <p className="m-0 text-[14px]" style={{ color: INK }}>
                    Re-index complete: {lastRun.indexed.length} indexed, {lastRun.skipped.length} skipped, {lastRun.deleted.length} deleted{lastRun.errors.length > 0 ? `, ${lastRun.errors.length} error${lastRun.errors.length === 1 ? '' : 's'}` : ''}.
                  </p>
                  <p className="m-0 mt-1 text-[13px] break-words" style={{ color: MUTED }}>
                    {lastRun.errors.length > 0
                      ? `Errors: ${lastRun.errors.join(' · ')}`
                      : lastRun.indexed.length > 0
                        ? `Indexed: ${lastRun.indexed.join(', ')}`
                        : 'No changes. All files were already up to date.'}
                  </p>
                </div>
              )}

              {/* Stat tiles */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                <StatCard
                  label="Indexed files"
                  value={loading ? '—' : folderFiles.length}
                  sublabel={overLimit ? `${folderFiles.length - 15} over the 15-file limit` : 'Limit 15 per folder'}
                  loading={loading}
                />
                <StatCard label="Chunks" value={loading ? '—' : folderChunks} sublabel="Searchable text passages" loading={loading} />
                <StatCard label="Nightly sync" value="02:00 SGT" sublabel="New files only" />
              </div>

              {/* Naming guide */}
              <NamingGuide
                folder={t.folder}
                fileFormat={t.fileFormat}
                examples={t.id === 'outbound' ? OUTBOUND_EXAMPLES : t.id === 'inbound' ? INBOUND_EXAMPLES : ENGAGEMENT_EXAMPLES}
              />

              {/* File table */}
              <section className="mb-8">
                <header className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Indexed files</h2>
                  {overLimit && <Chip>{folderFiles.length} of 15</Chip>}
                </header>
                {loading ? (
                  <div className="flex flex-col gap-2">
                    {[0, 1, 2].map(i => <div key={i} className="h-11 rounded-[10px] animate-pulse" style={{ background: FIELD }} />)}
                  </div>
                ) : folderFiles.length === 0 ? (
                  <p className="m-0 py-16 text-center text-[15px]" style={{ color: MUTED }}>
                    No files indexed in <code style={{ fontFamily: MONO }}>{t.folder}/</code> yet.
                  </p>
                ) : (
                  <Register label={`Indexed files in ${t.folder}`} minWidth={560}>
                    <RegisterHead>
                      <RegisterTh first>File</RegisterTh>
                      <RegisterTh align="right">Chunks</RegisterTh>
                      <RegisterTh last align="right">Last indexed</RegisterTh>
                    </RegisterHead>
                    <tbody>
                      {folderFiles.map(f => {
                        const indexed = new Date(f.last_indexed)
                        return (
                          <RegisterRow key={f.file_id} className="hover:bg-[#f8f9fa]">
                            <RegisterCell first primary={f.file_name} title={`${f.source_folder}/${f.file_name}`} className="min-w-[280px] max-w-[480px]"
                              secondary={<code style={{ fontFamily: MONO }}>{f.source_folder}/{f.file_name}</code>} />
                            <RegisterCell align="right" primary={f.chunk_count} secondary={`chunk${f.chunk_count === 1 ? '' : 's'}`} />
                            <RegisterCell last align="right"
                              primary={indexed.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                              secondary={indexed.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })} />
                          </RegisterRow>
                        )
                      })}
                    </tbody>
                  </Register>
                )}
              </section>
            </div>
          )
        })}

        {/* How it works — shared reference */}
        <section className="mt-4">
          <h2 className="m-0 mb-1 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>How indexing works</h2>
          <div className="border-t" style={{ borderColor: RULE }}>
            <LegendRow label="Index new files" description="Scans only the selected folder. Processes files that have not been indexed yet and skips existing ones. Use after uploading new documents." />
            <LegendRow label="Rebuild folder" description="Deletes all chunks for the selected folder and rebuilds from scratch. Use if you replaced or updated a file in Drive. Re-processes every file in the folder." />
            <LegendRow label="Nightly sync" description="Scans every folder at 02:00 Singapore time. Picks up new files only. No action needed." />
            <LegendRow label="Chunks" description="Each PDF is split into passages of about 1,500 characters with 150-character overlaps. The AI retrieves the 6 most relevant chunks per email query." />
          </div>
        </section>
      </div>
    </div>
  )
}
