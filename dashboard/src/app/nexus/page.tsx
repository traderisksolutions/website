'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, ChevronDown, X, Search, Link2, Sparkles,
  AlertCircle, Clock, CheckCircle2, Zap, BookOpen, ArrowRight,
  MailOpen, FileText, Scale, Users, Send, Loader2, Trash2, Paperclip,
  FolderOpen, Network, HelpCircle, ShieldAlert, TrendingUp, ListChecks,
  BadgeDollarSign, Database, Eye, Pin, PinOff,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RichEditor, plainToHtml, htmlToPlain } from '@/components/RichEditor'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────────

type Case = {
  id:           string
  name:         string
  description:  string | null
  status:       string
  created_at:   string
  updated_at:   string
  thread_count: number
  last_activity: string | null
}

type Contact = {
  id:         string
  email:      string | null
  first_name: string | null
  last_name:  string | null
  company:    string | null
}

type CaseThreadMsg = {
  id:              string
  thread_id:       string
  direction:       'inbound' | 'outbound'
  from_address:    string | null
  body_text:       string | null
  sent_at:         string
  has_attachments: boolean
}

type AttachmentRecord = {
  thread_id:   string
  filename:    string
  mime_type:   string | null
  storage_url: string | null
  parsed_at:   string | null
}

type CaseThread = {
  id:                    string
  case_id:               string
  thread_id:             string
  party_type:            string
  party_label:           string | null
  thread:                { id: string; subject: string | null; last_message_at: string | null; contact_id: string | null; contact: Contact | null } | null
  messages:              CaseThreadMsg[]
  attachments_extracted: number
  attachments_pending:   boolean
  attachment_records:    AttachmentRecord[]
}

type TimelineEvent = {
  date:         string
  party:        string
  event:        string
  significance: string
}

type PlaybookStep = {
  step:        number
  action:      string
  party_type:  string
  party_name:  string
  to_emails:   string[]
  cc_emails:   string[]
  subject:     string
  priority:    'URGENT' | 'HIGH' | 'THIS_WEEK' | 'LATER'
  intent:      string
  reasoning:   string
  draft:       string
}

// V1 analysis types (mirrors NexusAnalysisV1 from run-nexus-analysis)
type V1Citation    = { id: string; label: string; type: string; date?: string; excerpt?: string }
type V1Stakeholder = { id: string; name: string; party_type: string; email?: string; company?: string; role_summary: string; stance?: string }
type V1TimelineEvt = { date: string; party: string; event: string; significance: string; citation_ids?: string[] }
type V1Evidence    = { id: string; filename_or_label: string; source_type: string; key_facts: string[]; coverage_relevant: boolean; citation_id?: string }
type V1Question    = { question: string; priority: string; directed_at?: string; citation_ids?: string[] }
type V1Missing     = { item: string; required_from: string; urgency: string; impact: string }
type V1Scenario    = { name: string; probability: string; outcome: string; trs_action: string; assumptions?: string[]; trigger_conditions?: string[]; strategic_implication?: string; citation_ids?: string[] }
type V1NextStep    = { step: number; action: string; owner: string; deadline?: string; priority: string; rationale: string; citation_ids?: string[]; depends_on?: number[] }
type V1Draft       = { artifact_type: string; to_party: string; party_type: string; to_emails: string[]; cc_emails: string[]; subject: string; body: string; intent: string; priority: string; citation_ids?: string[] }
type V1Reserve     = { recommended_reserve?: string; basis: string; confidence: string; risk_factors: string[]; citation_ids?: string[] }
type AnalysisMetadata = {
  analysis_ts:          string
  synthesis_model:      string
  strategy_model:       string
  synthesis_tokens:     number | null
  strategy_tokens:      number | null
  threads_included:     number
  messages_included:    number
  attachments_included: { filename: string; method: string }[]
  gdrive_docs:          string[]
  truncation_flags:     string[]
}
type NexusAnalysisV1 = {
  schema_version:         string
  case_brief:             { summary: string; incident_date?: string; claim_amount?: string; policy_reference?: string; coverage_type?: string; current_stage: string; blocking_issues: string[]; pending_from: Record<string, string> }
  stakeholder_map:        V1Stakeholder[]
  timeline:               V1TimelineEvt[]
  evidence_ledger:        V1Evidence[]
  open_questions:         V1Question[]
  missing_items:          V1Missing[]
  scenario_analysis:      V1Scenario[]
  recommended_next_steps: V1NextStep[]
  draft_artifacts:        V1Draft[]
  reserve_guidance:       V1Reserve | null
  citations:              V1Citation[]
  analysis_metadata?:     AnalysisMetadata
}

type CaseAnalysis = {
  id:                  string
  case_id:             string
  historical_timeline: TimelineEvent[]
  current_status:      { summary: string; blocking_issues: string[]; pending_from: Record<string, string> }
  playbook:            PlaybookStep[]
  outreach_strategy:   Record<string, { tone: string; key_message: string; timing: string }>
  legal_research:      { singapore_relevance: string; applicable_regulations: string[]; precedents_or_guidance: string[]; sources: string[] } | null
  strategy_model:      string | null
  created_at:          string
  structured_analysis?: NexusAnalysisV1
  schema_version?:     string
}

type RunSummary = {
  id:                  string
  created_at:          string
  run_status:          string
  run_duration_ms:     number | null
  triggered_by:        string | null
  schema_version:      string | null
  synthesis_model:     string | null
  strategy_model:      string | null
  gemini_tokens:       number | null
  claude_tokens:       number | null
  threads_included:    number
  messages_included:   number
  attachments_count:   number
  gdrive_docs_count:   number
  steps_count:         number
  citations_count:     number
  missing_items_count: number
  evidence_count:      number
  truncation_flags:    string[]
  pinned:              boolean
  error_message:       string | null
}

type ThreadSuggestion = {
  id:              string
  subject:         string | null
  last_message_at: string | null
  match_reason:    string
  contact:         Contact | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PARTY_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  client:    { bg: 'rgba(29,78,216,0.06)',  text: '#1d4ed8', border: 'rgba(29,78,216,0.2)',  dot: '#1d4ed8' },
  insurer:   { bg: 'rgba(5,150,105,0.06)',  text: '#059669', border: 'rgba(5,150,105,0.2)',  dot: '#059669' },
  lawyer:    { bg: 'rgba(124,58,237,0.06)', text: '#7c3aed', border: 'rgba(124,58,237,0.2)', dot: '#7c3aed' },
  regulator: { bg: 'rgba(220,38,38,0.06)',  text: '#dc2626', border: 'rgba(220,38,38,0.2)',  dot: '#dc2626' },
  other:     { bg: 'rgba(107,114,128,0.06)',text: '#6b7280', border: 'rgba(107,114,128,0.2)',dot: '#6b7280' },
  trs:       { bg: 'rgba(15,118,110,0.06)', text: '#0f766e', border: 'rgba(15,118,110,0.2)', dot: '#0f766e' },
}
const partyColor = (p: string) => PARTY_COLORS[p.toLowerCase()] ?? PARTY_COLORS.other

const PRIORITY_META: Record<string, { label: string; color: string; bg: string; icon: typeof Zap }> = {
  URGENT:    { label: 'Urgent',    color: '#dc2626', bg: 'rgba(220,38,38,0.08)',   icon: Zap },
  HIGH:      { label: 'High',      color: '#b45309', bg: 'rgba(180,83,9,0.08)',    icon: AlertCircle },
  THIS_WEEK: { label: 'This week', color: '#0369a1', bg: 'rgba(3,105,161,0.08)',   icon: Clock },
  LATER:     { label: 'Later',     color: '#6b7280', bg: 'rgba(107,114,128,0.08)', icon: CheckCircle2 },
}
const priorityMeta = (p: string) => PRIORITY_META[p] ?? PRIORITY_META.LATER

function contactName(c: Contact | null): string {
  if (!c) return '—'
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '—'
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30)  return `${d}d ago`
  return fmtDate(iso)
}

const PARTY_TYPES = ['client', 'insurer', 'lawyer', 'regulator', 'other'] as const

function autoSuggestParty(contact: Contact | null): string {
  const domain = (contact?.email ?? '').split('@')[1]?.toLowerCase() ?? ''
  const ins = ['qbe', 'berkley', 'allianz', 'aig.', 'zurich', 'chubb', 'tokio', 'sompo', 'ntuc', 'aviva', 'great-eastern', 'manulife', 'prudential', 'generali', 'liberty', 'rsagroup', 'ergo', 'markel', 'beazley', 'hiscox', 'munichre', 'swissre', 'hannover', 'aspen', 'brit.', 'convex', 'amtrust', 'travelers', 'axa.', 'msig', 'aia.']
  const law = ['rajah', 'wongpartnership', 'allengledhill', 'drewnapier', 'shooklin', 'rodyk', 'clifford', 'dentons', 'baker', 'advocates', 'solicitor', '.law', 'legal.sg', 'llp.sg']
  if (domain.endsWith('.gov.sg') || domain.includes('mas.gov')) return 'regulator'
  if (ins.some(k => domain.includes(k))) return 'insurer'
  if (law.some(k => domain.includes(k))) return 'lawyer'
  return 'client'
}

// ── Nexus Page ────────────────────────────────────────────────────────────────

export default function NexusPage() {
  const [cases,         setCases]         = useState<Case[]>([])
  const [loading,       setLoading]       = useState(true)
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [search,        setSearch]        = useState('')
  const [createOpen,    setCreateOpen]    = useState(false)

  const loadCases = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/nexus/cases', { cache: 'no-store' })
      const data = res.ok ? await res.json() : []
      setCases(Array.isArray(data) ? data : [])
      if (!selectedId && Array.isArray(data) && data.length > 0) {
        setSelectedId(data[0].id)
      }
    } finally { setLoading(false) }
  }, [selectedId])

  useEffect(() => { loadCases() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = cases.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.description ?? '').toLowerCase().includes(search.toLowerCase())
  )

  async function handleCreate(name: string, description: string) {
    const res = await fetch('/api/nexus/cases', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, description }),
    })
    const newCase = await res.json()
    if (newCase?.id) {
      setCases(prev => [{ ...newCase, thread_count: 0, last_activity: null }, ...prev])
      setSelectedId(newCase.id)
      setCreateOpen(false)
    }
  }

  async function handleDeleteCase(id: string) {
    await fetch(`/api/nexus/cases/${id}`, { method: 'DELETE' })
    setCases(prev => prev.filter(c => c.id !== id))
    if (selectedId === id) setSelectedId(cases.find(c => c.id !== id)?.id ?? null)
  }

  const selectedCase = cases.find(c => c.id === selectedId) ?? null

  return (
    <div className="flex flex-col overflow-hidden h-[calc(100vh-var(--mobile-nav-h,0px))]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 h-[52px] border-b border-[--border-subtle] flex-shrink-0 bg-card">
        <div className="flex items-center gap-3">
          <div>
            <span className="text-[13.5px] font-bold text-foreground tracking-tight">Nexus</span>
            <span className="ml-2 text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wider">Grand Analysis & Strategy</span>
          </div>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 transition-opacity shadow-sm"
        >
          <Plus size={12} strokeWidth={2.5} />
          New Case
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Case List ── */}
        <aside className="w-[240px] flex-shrink-0 border-r border-[--border-subtle] flex flex-col overflow-hidden bg-card">
          <div className="px-3 py-2.5 border-b border-[--border-subtle]">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/70 rounded-lg border border-[--border-subtle]/60">
              <Search size={11} className="text-muted-foreground/40 flex-shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search cases…"
                className="flex-1 text-[11.5px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground/40 min-w-0"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={16} className="animate-spin text-muted-foreground/40" />
              </div>
            ) : visible.length === 0 ? (
              <div className="px-5 py-10 text-center flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted/80 flex items-center justify-center">
                  <FolderOpen size={18} strokeWidth={1.4} className="text-muted-foreground/40" />
                </div>
                <div>
                  <p className="text-[12px] font-medium text-foreground/60 mb-1">No cases yet</p>
                  <p className="text-[10.5px] text-muted-foreground/45">Group related threads into a case to begin grand analysis.</p>
                </div>
                <button onClick={() => setCreateOpen(true)} className="text-[11.5px] text-primary font-semibold hover:opacity-80 transition-opacity">
                  + Create first case
                </button>
              </div>
            ) : (
              <div className="py-1">
                {visible.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 flex flex-col gap-1 transition-all border-l-[3px] group',
                      selectedId === c.id
                        ? 'bg-primary/5 border-primary'
                        : 'border-transparent hover:bg-muted/50 hover:border-muted-foreground/20',
                    )}
                  >
                    <div className="flex items-center justify-between gap-1.5 min-w-0">
                      <span className="text-[12px] font-semibold text-foreground truncate flex-1">{c.name}</span>
                      <span className={cn(
                        'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0',
                        c.status === 'open'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground',
                      )}>
                        {c.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10.5px] text-muted-foreground/60">
                        {c.thread_count} thread{c.thread_count !== 1 ? 's' : ''}
                      </span>
                      {c.last_activity && (
                        <span className="text-[10px] text-muted-foreground/40">{timeAgo(c.last_activity)}</span>
                      )}
                    </div>
                    {c.description && (
                      <p className="text-[10.5px] text-muted-foreground/50 truncate leading-[1.3]">{c.description}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* ── Main panel ── */}
        {selectedCase ? (
          <CaseDetailPanel
            caseData={selectedCase}
            onRefresh={loadCases}
            onDelete={() => handleDeleteCase(selectedCase.id)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-[12.5px] text-muted-foreground/50">
            {loading ? 'Loading…' : 'Select or create a case to begin.'}
          </div>
        )}
      </div>

      {/* ── Create case modal ── */}
      {createOpen && (
        <CreateCaseModal onCreate={handleCreate} onClose={() => setCreateOpen(false)} />
      )}
    </div>
  )
}

// ── Create Case Modal ─────────────────────────────────────────────────────────

function CreateCaseModal({ onCreate, onClose }: { onCreate: (name: string, desc: string) => Promise<void>; onClose: () => void }) {
  const [name, setName]   = useState('')
  const [desc, setDesc]   = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try { await onCreate(name.trim(), desc.trim()) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-[400px] p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-foreground">New Case</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">Case Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. FlyORO Cargo Damage Claim Jun 2026"
            className="w-full px-3 py-2 text-[12.5px] border border-[--border-subtle] rounded-lg bg-background outline-none focus:ring-1 focus:ring-primary/30 text-foreground"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">Description (optional)</label>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Brief description of the case…"
            rows={3}
            className="w-full px-3 py-2 text-[12.5px] border border-[--border-subtle] rounded-lg bg-background outline-none focus:ring-1 focus:ring-primary/30 text-foreground resize-none"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-[12px] border border-[--border-subtle] rounded-lg text-muted-foreground hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="px-4 py-2 text-[12px] font-semibold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {saving ? 'Creating…' : 'Create Case'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Case Detail Panel (Mission Control shell) ─────────────────────────────────

function CaseDetailPanel({
  caseData, onRefresh, onDelete,
}: { caseData: Case; onRefresh: () => void; onDelete: () => void }) {
  const [detail,        setDetail]        = useState<{ threads: CaseThread[]; analysis: CaseAnalysis | null } | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [analyzing,     setAnalyzing]     = useState(false)
  const [analyzeError,  setAnalyzeError]  = useState<string | null>(null)
  const [view,          setView]          = useState<'mission' | 'messages' | 'history'>('mission')
  const [linkOpen,      setLinkOpen]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [runs,          setRuns]          = useState<RunSummary[]>([])
  const [runsLoading,   setRunsLoading]   = useState(false)
  const [userEmail,     setUserEmail]     = useState<string | null>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null))
  }, [])

  const loadRuns = useCallback(async () => {
    setRunsLoading(true)
    try {
      const res = await fetch(`/api/nexus/cases/${caseData.id}/runs`, { cache: 'no-store' })
      if (res.ok) setRuns(await res.json())
    } finally { setRunsLoading(false) }
  }, [caseData.id])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [detailRes] = await Promise.all([
        fetch(`/api/nexus/cases/${caseData.id}`, { cache: 'no-store' }),
        loadRuns(),
      ])
      if (detailRes.ok) setDetail(await detailRes.json())
    } finally { setLoading(false) }
  }, [caseData.id, loadRuns])

  useEffect(() => {
    setDetail(null)
    setAnalyzeError(null)
    setView('mission')
    load()
  }, [caseData.id, load])

  async function runAnalysis() {
    setAnalyzing(true); setAnalyzeError(null)
    try {
      const res  = await fetch(`/api/nexus/cases/${caseData.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggered_by: userEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setDetail(prev => prev ? { ...prev, analysis: data.analysis } : prev)
      setView('mission')
      onRefresh()
      loadRuns()
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : 'Analysis failed')
    } finally { setAnalyzing(false) }
  }

  async function pinRun(runId: string, pinned: boolean) {
    setRuns(prev => prev.map(r => r.id === runId ? { ...r, pinned } : r))
    await fetch(`/api/nexus/cases/${caseData.id}/runs`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ runId, pinned }),
    })
  }

  async function pruneRuns() {
    await fetch(`/api/nexus/cases/${caseData.id}/runs?keep=15`, { method: 'DELETE' })
    loadRuns()
  }

  async function unlinkThread(threadId: string) {
    await fetch(`/api/nexus/cases/${caseData.id}/threads?thread_id=${threadId}`, { method: 'DELETE' })
    load()
  }

  async function updatePartyType(threadId: string, partyType: string) {
    await fetch(`/api/nexus/cases/${caseData.id}/threads`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ thread_id: threadId, party_type: partyType }),
    })
    load()
  }

  const threads              = detail?.threads ?? []
  const analysis             = detail?.analysis ?? null
  const totalMsgCount        = threads.reduce((s, ct) => s + ct.messages.length, 0)
  const allAttachmentRecords = threads.flatMap(ct => ct.attachment_records ?? [])
  const unifiedMessages      = threads
    .flatMap(ct => ct.messages.map(m => ({
      ...m,
      party_type:  ct.party_type,
      party_label: ct.party_label ?? ct.party_type,
      subject:     ct.thread?.subject ?? '',
    })))
    .sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime())

  const currentRun  = runs.length >= 1 ? runs[0] : null
  const previousRun = runs.length >= 2 ? runs[1] : null

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-w-0">
      <MissionHeader
        caseData={caseData}
        threads={threads}
        analysis={analysis}
        analyzing={analyzing}
        analyzeError={analyzeError}
        confirmDelete={confirmDelete}
        view={view}
        totalMsgCount={totalMsgCount}
        runsCount={runs.length}
        onSetView={setView}
        onRunAnalysis={runAnalysis}
        onLinkThreads={() => setLinkOpen(true)}
        onDelete={() => { onDelete(); setConfirmDelete(false) }}
        onConfirmDelete={() => setConfirmDelete(true)}
        onCancelDelete={() => setConfirmDelete(false)}
      />
      <div className="flex-1 overflow-y-auto bg-background">
        {view === 'history' ? (
          <RunHistoryView
            caseId={caseData.id}
            runs={runs}
            loading={runsLoading}
            onGoToMission={() => setView('mission')}
            onPinToggle={pinRun}
            onPrune={pruneRuns}
          />
        ) : view === 'mission' ? (
          <MissionControlBody
            caseData={caseData}
            threads={threads}
            analysis={analysis}
            loading={loading}
            analyzing={analyzing}
            attachmentRecords={allAttachmentRecords}
            currentRun={currentRun}
            previousRun={previousRun}
            onLinkThreads={() => setLinkOpen(true)}
            onUnlink={unlinkThread}
            onUpdatePartyType={updatePartyType}
            onRunAnalysis={runAnalysis}
          />
        ) : (
          <MessagesView
            messages={unifiedMessages}
            loading={loading}
            onGoToMission={() => setView('mission')}
          />
        )}
      </div>
      {linkOpen && (
        <ThreadLinkerModal
          caseId={caseData.id}
          linkedThreadIds={threads.map(ct => ct.thread_id)}
          onLink={() => { load(); onRefresh() }}
          onClose={() => setLinkOpen(false)}
        />
      )}
    </div>
  )
}

// ── Mission Header ────────────────────────────────────────────────────────────

function MissionHeader({
  caseData, threads, analysis, analyzing, analyzeError, confirmDelete, view, totalMsgCount, runsCount,
  onSetView, onRunAnalysis, onLinkThreads, onDelete, onConfirmDelete, onCancelDelete,
}: {
  caseData:        Case
  threads:         CaseThread[]
  analysis:        CaseAnalysis | null
  analyzing:       boolean
  analyzeError:    string | null
  confirmDelete:   boolean
  view:            'mission' | 'messages' | 'history'
  totalMsgCount:   number
  runsCount:       number
  onSetView:       (v: 'mission' | 'messages' | 'history') => void
  onRunAnalysis:   () => void
  onLinkThreads:   () => void
  onDelete:        () => void
  onConfirmDelete: () => void
  onCancelDelete:  () => void
}) {
  const attCount   = threads.flatMap(ct => ct.attachment_records ?? []).filter(a => a.parsed_at !== null).length
  const modelLabel = analysis?.strategy_model?.includes('claude') ? 'Claude + Gemini' : analysis?.strategy_model ? 'Gemini' : null

  return (
    <div className="flex-shrink-0 border-b border-[--border-subtle] bg-card">
      {/* Top row: name + actions */}
      <div className="flex items-start justify-between px-5 pt-3.5 pb-2.5">
        <div className="min-w-0 flex-1 pr-4">
          <div className="flex items-center gap-2.5 mb-0.5">
            <h2 className="text-[14px] font-bold text-foreground truncate">{caseData.name}</h2>
            <span className={cn(
              'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0',
              caseData.status === 'open' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
            )}>
              {caseData.status}
            </span>
          </div>
          {caseData.description && (
            <p className="text-[11px] text-muted-foreground/55 truncate">{caseData.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {confirmDelete ? (
            <>
              <span className="text-[11px] text-red-600 mr-1">Delete this case?</span>
              <button onClick={onDelete} className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors">Delete</button>
              <button onClick={onCancelDelete} className="px-2.5 py-1 rounded-md text-[11px] border border-[--border-subtle] text-muted-foreground hover:bg-accent">Cancel</button>
            </>
          ) : (
            <>
              <button
                onClick={onLinkThreads}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold border border-[--border-subtle] text-foreground/70 hover:bg-accent transition-colors"
              >
                <Link2 size={11} strokeWidth={2} /> Link threads
              </button>
              <button
                onClick={onRunAnalysis}
                disabled={analyzing || threads.length === 0}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold transition-all shadow-sm',
                  analyzing
                    ? 'bg-primary/10 text-primary cursor-not-allowed'
                    : threads.length === 0
                      ? 'bg-muted text-muted-foreground/50 cursor-not-allowed'
                      : 'bg-primary text-primary-foreground hover:opacity-90',
                )}
              >
                {analyzing
                  ? <><Loader2 size={11} className="animate-spin" /> Analysing…</>
                  : <><Sparkles size={11} strokeWidth={2} /> {analysis ? 'Re-run' : 'Run'} Analysis</>}
              </button>
              <button
                onClick={onConfirmDelete}
                className="p-1.5 rounded-md text-muted-foreground/30 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={13} strokeWidth={1.8} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* View tabs + meta row */}
      <div className="flex items-center justify-between px-5 border-t border-[--border-subtle]/40">
        <div className="flex">
          {([
            { key: 'mission',  label: 'Mission Control' },
            { key: 'messages', label: `Messages${totalMsgCount > 0 ? ` (${totalMsgCount})` : ''}` },
            { key: 'history',  label: `History${runsCount > 0 ? ` (${runsCount})` : ''}` },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onSetView(key)}
              className={cn(
                'px-4 py-2.5 text-[11.5px] font-semibold border-b-2 transition-colors',
                view === key
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground/60 border-transparent hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/40 pb-2.5">
          <span>{threads.length} thread{threads.length !== 1 ? 's' : ''}</span>
          {attCount > 0 && <span>{attCount} attachment{attCount !== 1 ? 's' : ''}</span>}
          {analysis && <span>Analysed {timeAgo(analysis.created_at)}</span>}
          {modelLabel && <span className="bg-muted/70 px-1.5 py-0.5 rounded text-[9.5px] font-medium">{modelLabel}</span>}
        </div>
      </div>

      {analyzeError && (
        <div className="mx-5 mb-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
          <p className="text-[10.5px] text-red-600 leading-relaxed">{analyzeError}</p>
        </div>
      )}
    </div>
  )
}

// ── Mission Control Body ──────────────────────────────────────────────────────

function MissionControlBody({
  caseData, threads, analysis, loading, analyzing, attachmentRecords, currentRun, previousRun,
  onLinkThreads, onUnlink, onUpdatePartyType, onRunAnalysis,
}: {
  caseData:          Case
  threads:           CaseThread[]
  analysis:          CaseAnalysis | null
  loading:           boolean
  analyzing:         boolean
  attachmentRecords: AttachmentRecord[]
  currentRun:        RunSummary | null
  previousRun:       RunSummary | null
  onLinkThreads:     () => void
  onUnlink:          (t: string) => void
  onUpdatePartyType: (t: string, p: string) => void
  onRunAnalysis:     () => void
}) {
  if (loading && threads.length === 0) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={20} className="animate-spin text-muted-foreground/30" />
      </div>
    )
  }

  if (threads.length === 0) return <NoThreadsState onAdd={onLinkThreads} />

  if (!analysis) {
    return (
      <PreAnalysisState
        threads={threads}
        attachmentRecords={attachmentRecords}
        onAdd={onLinkThreads}
        onRunAnalysis={onRunAnalysis}
        onUnlink={onUnlink}
        onUpdatePartyType={onUpdatePartyType}
        analyzing={analyzing}
      />
    )
  }

  const sa = analysis.structured_analysis ?? null

  return (
    <div className="px-6 py-6 flex flex-col gap-8 pb-12">
      {analyzing && <AnalyzingBanner />}

      {/* Executive context first */}
      <ExecBriefCard analysis={analysis} sa={sa} />

      {/* Delta banner — supplementary, below the brief so it doesn't displace primary content */}
      {!analyzing && currentRun && previousRun && (
        <RunComparisonBanner
          caseId={caseData.id}
          currentRun={currentRun}
          previousRun={previousRun}
          currentSteps={sa?.recommended_next_steps ?? []}
        />
      )}

      {/* Action plan surfaces immediately after context */}
      <NextStepsSection
        v1Steps={sa?.recommended_next_steps ?? []}
        missingItems={sa?.missing_items ?? []}
        drafts={sa?.draft_artifacts ?? []}
        caseId={caseData.id}
        threads={threads}
      />

      {/* Supporting intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        <StakeholderMapSection stakeholders={sa?.stakeholder_map ?? []} />
        <ScenarioSection scenarios={sa?.scenario_analysis ?? []} />
      </div>

      <MissionTimelineSection
        v1Timeline={sa?.timeline ?? []}
        legacyTimeline={analysis.historical_timeline ?? []}
        citations={sa?.citations ?? []}
      />

      {(sa?.evidence_ledger?.length ?? 0) > 0 && (
        <EvidencePanelSection items={sa!.evidence_ledger} citations={sa!.citations ?? []} />
      )}

      <DraftOutputsSection
        drafts={sa?.draft_artifacts ?? []}
        legacyPlaybook={analysis.playbook ?? []}
        threads={threads}
      />

      <ThreadsOverviewCard
        threads={threads}
        attachmentRecords={attachmentRecords}
        onAddThread={onLinkThreads}
        onUnlink={onUnlink}
        onUpdatePartyType={onUpdatePartyType}
      />

      {sa?.analysis_metadata && (
        <AnalysisMetadataCard meta={sa.analysis_metadata} />
      )}
    </div>
  )
}

// ── No Threads State ──────────────────────────────────────────────────────────

function NoThreadsState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-28 px-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted/60 border border-[--border-subtle] flex items-center justify-center">
        <Network size={28} strokeWidth={1.2} className="text-muted-foreground/30" />
      </div>
      <div className="max-w-[300px]">
        <p className="text-[14px] font-bold text-foreground/60 mb-2">No threads linked</p>
        <p className="text-[12px] text-muted-foreground/45 leading-[1.7]">
          Link email threads to build this case. Each thread represents a conversation with a party — client, insurer, lawyer, or regulator.
        </p>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-opacity shadow-sm"
      >
        <Link2 size={12} strokeWidth={2} /> Link first thread
      </button>
    </div>
  )
}

// ── Pre-Analysis State ────────────────────────────────────────────────────────

function PreAnalysisState({
  threads, attachmentRecords, onAdd, onRunAnalysis, onUnlink, onUpdatePartyType, analyzing,
}: {
  threads:           CaseThread[]
  attachmentRecords: AttachmentRecord[]
  onAdd:             () => void
  onRunAnalysis:     () => void
  onUnlink:          (t: string) => void
  onUpdatePartyType: (t: string, p: string) => void
  analyzing:         boolean
}) {
  return (
    <div className="px-6 py-6 flex flex-col gap-6">
      {analyzing && <AnalyzingBanner />}

      {!analyzing && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] px-5 py-6 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center">
            <Sparkles size={24} strokeWidth={1.4} className="text-primary/60" />
          </div>
          <div className="max-w-[340px]">
            <p className="text-[13.5px] font-bold text-foreground/80 mb-1.5">Ready for grand analysis</p>
            <p className="text-[11.5px] text-muted-foreground/55 leading-[1.7]">
              {threads.length} thread{threads.length !== 1 ? 's' : ''} linked. Run the analysis to get a full mission brief, stakeholder map, timeline, evidence ledger, and draft communications.
            </p>
          </div>
          <button
            onClick={onRunAnalysis}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-opacity shadow-sm"
          >
            <Sparkles size={13} strokeWidth={2} /> Run Grand Analysis
          </button>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/45">Linked Threads</span>
            <span className="text-[9.5px] font-bold text-muted-foreground/40 bg-muted/70 px-1.5 py-0.5 rounded-full">
              {threads.length}
            </span>
          </div>
          <button onClick={onAdd} className="text-[11px] text-primary font-semibold hover:opacity-80 transition-opacity">
            + Add
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {threads.map(ct => (
            <LinkedThreadCard key={ct.id} ct={ct} onUnlink={onUnlink} onUpdatePartyType={onUpdatePartyType} />
          ))}
        </div>
      </div>

      {(attachmentRecords.length > 0 || threads.some(ct => ct.attachments_pending)) && (
        <AttachmentCoverageCard threads={threads} attachmentRecords={attachmentRecords} />
      )}
    </div>
  )
}

// ── Analyzing Banner ──────────────────────────────────────────────────────────

function AnalyzingBanner() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/15 rounded-xl">
      <Loader2 size={14} className="animate-spin text-primary flex-shrink-0" />
      <div>
        <p className="text-[12px] font-semibold text-primary/90">Grand analysis in progress</p>
        <p className="text-[10.5px] text-primary/60">Reading all threads and attachments — this typically takes 30–60 seconds.</p>
      </div>
    </div>
  )
}

// ── Shared Primitives ─────────────────────────────────────────────────────────

function SectionLabel({
  title, count, children,
}: {
  title:     string
  count?:    number
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/45">{title}</span>
        {count !== undefined && (
          <span className="text-[9.5px] font-bold text-muted-foreground/40 bg-muted/70 px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

function NoDataState({
  icon: Icon, message,
}: {
  icon:    LucideIcon
  message: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-5 rounded-xl border border-dashed border-[--border-subtle] text-muted-foreground/45">
      <Icon size={16} strokeWidth={1.4} />
      <p className="text-[11.5px] italic">{message}</p>
    </div>
  )
}

function KFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted/50 rounded-lg border border-[--border-subtle]">
      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">{label}</span>
      <span className="text-[11.5px] font-semibold text-foreground/85">{value}</span>
    </div>
  )
}

// ── Citation Chip ─────────────────────────────────────────────────────────────

function CitationChip({ id, citations }: { id: string; citations: V1Citation[] }) {
  const c = citations.find(x => x.id === id)
  if (!c) return null
  return (
    <span
      title={c.excerpt ?? c.label}
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/8 text-primary/70 border border-primary/15 cursor-help align-middle"
    >
      [{c.label.length > 18 ? c.label.slice(0, 18) + '…' : c.label}]
    </span>
  )
}

// ── Executive Brief Card ──────────────────────────────────────────────────────

function ExecBriefCard({ analysis, sa }: { analysis: CaseAnalysis; sa: NexusAnalysisV1 | null }) {
  const brief       = sa?.case_brief
  const status      = analysis.current_status
  const summary     = brief?.summary         ?? status?.summary         ?? ''
  const blocking    = brief?.blocking_issues  ?? status?.blocking_issues  ?? []
  const pendingFrom = brief?.pending_from     ?? status?.pending_from     ?? {}
  const stage       = brief?.current_stage
  const claim       = brief?.claim_amount
  const coverage    = brief?.coverage_type
  const policy      = brief?.policy_reference
  const questions   = sa?.open_questions ?? []
  const missing     = sa?.missing_items  ?? []

  return (
    <div>
      <SectionLabel title="Executive Brief" />
      <div className="rounded-xl border border-[--border-subtle] bg-card px-5 py-4 flex flex-col gap-4">
        {(stage || coverage || claim || policy) && (
          <div className="flex flex-wrap gap-2">
            {stage    && <KFact label="Stage"    value={stage} />}
            {coverage && <KFact label="Coverage" value={coverage} />}
            {claim    && <KFact label="Claim"    value={claim} />}
            {policy   && <KFact label="Policy"   value={policy} />}
          </div>
        )}

        {summary && <p className="text-[12.5px] text-foreground/80 leading-[1.7]">{summary}</p>}

        {blocking.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <AlertCircle size={10} strokeWidth={2} className="text-red-500" />
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-red-600/80">
                Blocking ({blocking.length})
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {blocking.map((b, i) => (
                <div key={i} className="flex gap-2 text-[11.5px] text-foreground/75 leading-[1.5]">
                  <span className="text-red-400 flex-shrink-0">•</span>{b}
                </div>
              ))}
            </div>
          </div>
        )}

        {Object.entries(pendingFrom).filter(([, v]) => v).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(pendingFrom).filter(([, v]) => v).map(([party, item]) => {
              const pc = partyColor(party)
              return (
                <div
                  key={party}
                  className="flex items-start gap-2 px-3 py-2 rounded-lg border flex-1 min-w-[180px]"
                  style={{ background: pc.bg, borderColor: pc.border }}
                >
                  <span className="text-[9.5px] font-bold uppercase tracking-wider flex-shrink-0 mt-0.5" style={{ color: pc.text }}>
                    {party}
                  </span>
                  <p className="text-[11.5px] text-foreground/70 leading-[1.45]">{item as string}</p>
                </div>
              )
            })}
          </div>
        )}

        {(questions.length > 0 || missing.length > 0) && (
          <div className="flex gap-5 pt-1 border-t border-[--border-subtle]/50 flex-wrap">
            {questions.length > 0 && (
              <div className="flex items-center gap-1.5">
                <HelpCircle size={10} strokeWidth={2} className="text-amber-500" />
                <span className="text-[10.5px] text-muted-foreground/70">
                  <span className="font-semibold text-amber-600">
                    {questions.filter(q => q.priority === 'critical' || q.priority === 'high').length}
                  </span>{' '}critical question{questions.filter(q => q.priority === 'critical' || q.priority === 'high').length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {missing.length > 0 && (
              <div className="flex items-center gap-1.5">
                <ShieldAlert size={10} strokeWidth={2} className="text-muted-foreground/50" />
                <span className="text-[10.5px] text-muted-foreground/70">
                  <span className="font-semibold text-foreground/70">
                    {missing.filter(m => m.urgency === 'urgent').length}
                  </span>{' '}urgent item{missing.filter(m => m.urgency === 'urgent').length !== 1 ? 's' : ''} missing
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Stakeholder Map Section ───────────────────────────────────────────────────

function StakeholderMapSection({ stakeholders }: { stakeholders: V1Stakeholder[] }) {
  if (!stakeholders?.length) return (
    <div>
      <SectionLabel title="Stakeholders" />
      <NoDataState icon={Users} message="No stakeholders identified in this analysis." />
    </div>
  )

  return (
    <div>
      <SectionLabel title="Stakeholders" count={stakeholders.length} />
      <div className="flex flex-col gap-2">
        {stakeholders.map((s, i) => {
          const pc = partyColor(s.party_type)
          return (
            <div key={s.id ?? i} className="flex items-start gap-3 px-4 py-3 rounded-xl border border-[--border-subtle] bg-card">
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0 pt-0.5">
                <span className="w-2 h-2 rounded-full" style={{ background: pc.dot }} />
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: pc.text, background: pc.bg }}>
                  {s.party_type.slice(0, 3).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 flex-wrap mb-0.5">
                  <span className="text-[12px] font-semibold text-foreground">{s.name}</span>
                  {s.company && <span className="text-[10.5px] text-muted-foreground/50">· {s.company}</span>}
                </div>
                {s.email && <p className="text-[10px] text-muted-foreground/45 mb-1">{s.email}</p>}
                <p className="text-[11.5px] text-foreground/70 leading-[1.5]">{s.role_summary}</p>
                {s.stance && <p className="text-[10.5px] text-muted-foreground/50 italic mt-0.5">Stance: {s.stance}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Scenario Section ──────────────────────────────────────────────────────────

const SCENARIO_PROB: Record<string, { color: string; bg: string; border: string; barW: string }> = {
  high:   { color: '#059669', bg: 'rgba(5,150,105,0.05)',   border: 'rgba(5,150,105,0.18)',   barW: '78%' },
  medium: { color: '#d97706', bg: 'rgba(217,119,6,0.05)',   border: 'rgba(217,119,6,0.18)',   barW: '48%' },
  low:    { color: '#6b7280', bg: 'rgba(107,114,128,0.05)', border: 'rgba(107,114,128,0.18)', barW: '22%' },
}

function ScenarioSection({ scenarios }: { scenarios: V1Scenario[] }) {
  if (!scenarios?.length) return (
    <div>
      <SectionLabel title="Scenarios" />
      <NoDataState icon={TrendingUp} message="Run analysis to see scenario projections." />
    </div>
  )

  return (
    <div>
      <SectionLabel title="Scenarios" count={scenarios.length} />
      <div className="flex flex-col gap-2.5">
        {scenarios.map((s, i) => {
          const pm = SCENARIO_PROB[s.probability?.toLowerCase()] ?? SCENARIO_PROB.low
          const assumptions       = s.assumptions?.filter(Boolean)       ?? []
          const triggerConditions = s.trigger_conditions?.filter(Boolean) ?? []
          return (
            <div key={i} className="px-4 py-3.5 rounded-xl border" style={{ background: pm.bg, borderColor: pm.border }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-bold text-foreground">{s.name}</span>
                <span className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: pm.color }}>
                  {s.probability?.toUpperCase()}
                </span>
              </div>
              <div className="h-[3px] rounded-full bg-black/[0.06] mb-3 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: pm.barW, background: pm.color }} />
              </div>
              <p className="text-[11.5px] text-foreground/75 leading-[1.55] mb-2.5">{s.outcome}</p>

              {assumptions.length > 0 && (
                <div className="mb-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-foreground/35 mb-1">Assumes</p>
                  <ul className="flex flex-col gap-0.5">
                    {assumptions.map((a, ai) => (
                      <li key={ai} className="flex items-start gap-1.5">
                        <span className="text-[9px] text-foreground/30 flex-shrink-0 mt-[3px]">•</span>
                        <span className="text-[11px] text-foreground/60 leading-[1.5]">{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {triggerConditions.length > 0 && (
                <div className="mb-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-foreground/35 mb-1">Watch for</p>
                  <ul className="flex flex-col gap-0.5">
                    {triggerConditions.map((t, ti) => (
                      <li key={ti} className="flex items-start gap-1.5">
                        <Zap size={8} strokeWidth={2} className="flex-shrink-0 mt-[3px] text-foreground/30" />
                        <span className="text-[11px] text-foreground/60 leading-[1.5]">{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {s.strategic_implication && (
                <p className="text-[10.5px] italic text-foreground/50 leading-[1.5] mb-2.5 border-t border-black/[0.05] pt-2">
                  {s.strategic_implication}
                </p>
              )}

              <div className="flex gap-1.5 items-start border-t border-black/[0.06] pt-2.5">
                <ArrowRight size={10} strokeWidth={2.5} className="flex-shrink-0 mt-0.5" style={{ color: pm.color }} />
                <p className="text-[11px] font-medium leading-[1.5]" style={{ color: pm.color }}>{s.trs_action}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Mission Timeline Section ──────────────────────────────────────────────────

function MissionTimelineSection({
  v1Timeline, legacyTimeline, citations,
}: {
  v1Timeline:     V1TimelineEvt[]
  legacyTimeline: TimelineEvent[]
  citations:      V1Citation[]
}) {
  const [showAll, setShowAll] = useState(false)

  const events = v1Timeline?.length > 0
    ? v1Timeline.map(e => ({ date: e.date, party: e.party, event: e.event, significance: e.significance, citation_ids: e.citation_ids ?? [] }))
    : legacyTimeline.map(e => ({ date: e.date, party: e.party, event: e.event, significance: e.significance, citation_ids: [] as string[] }))

  if (!events.length) return (
    <div>
      <SectionLabel title="Timeline" />
      <NoDataState icon={Clock} message="No timeline events in this analysis." />
    </div>
  )

  const PREVIEW = 6
  const shown   = showAll ? events : events.slice(0, PREVIEW)

  return (
    <div>
      <SectionLabel title="Timeline" count={events.length}>
        {events.length > PREVIEW && (
          <button
            onClick={() => setShowAll(v => !v)}
            className="text-[10.5px] text-primary font-semibold hover:opacity-80 transition-opacity"
          >
            {showAll ? 'Show less' : `View all (${events.length})`}
          </button>
        )}
      </SectionLabel>
      <div className="rounded-xl border border-[--border-subtle] bg-card px-5 py-4">
        {shown.map((e, i) => {
          const pc = partyColor(e.party)
          return (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: pc.dot }} />
                {i < shown.length - 1 && <div className="w-px flex-1 bg-[--border-subtle]/70 mt-1.5 mb-1" />}
              </div>
              <div className="pb-4 min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: pc.text }}>
                    {e.party}
                  </span>
                  <span className="text-[9.5px] text-muted-foreground/50">{fmtDate(e.date)}</span>
                  {e.citation_ids.map(cid => <CitationChip key={cid} id={cid} citations={citations} />)}
                </div>
                <p className="text-[12px] text-foreground/80 leading-[1.55] mb-0.5">{e.event}</p>
                <p className="text-[10.5px] text-muted-foreground/55 italic leading-[1.45]">{e.significance}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Evidence Panel Section ────────────────────────────────────────────────────

type EvidenceTab = 'email' | 'attachment' | 'knowledge_doc'

function EvidencePanelSection({ items, citations }: { items: V1Evidence[]; citations: V1Citation[] }) {
  const [tab,        setTab]        = useState<EvidenceTab>('email')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const groups: Record<EvidenceTab, V1Evidence[]> = {
    email:         items.filter(e => e.source_type === 'email'),
    attachment:    items.filter(e => e.source_type === 'attachment'),
    knowledge_doc: items.filter(e => e.source_type === 'knowledge_doc'),
  }

  const TAB_META: { key: EvidenceTab; label: string }[] = [
    { key: 'email',         label: 'Email' },
    { key: 'attachment',    label: 'Attachments' },
    { key: 'knowledge_doc', label: 'Knowledge' },
  ]

  const shown = groups[tab] ?? []

  return (
    <div>
      <SectionLabel title="Evidence" count={items.length} />
      <div className="rounded-xl border border-[--border-subtle] bg-card overflow-hidden">
        <div className="flex border-b border-[--border-subtle] bg-muted/20">
          {TAB_META.map(({ key, label }) => {
            const count = groups[key]?.length ?? 0
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-semibold border-b-2 transition-colors',
                  tab === key
                    ? 'border-primary text-primary bg-card'
                    : 'border-transparent text-muted-foreground/60 hover:text-foreground',
                )}
              >
                {label}
                {count > 0 && (
                  <span className="text-[9px] font-bold bg-muted/80 rounded-full px-1.5 py-0.5 text-muted-foreground/55">
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {shown.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground/40 italic text-center py-8">
            No {tab === 'email' ? 'email' : tab === 'attachment' ? 'attachment' : 'knowledge'} evidence in this analysis.
          </p>
        ) : (
          <div className="divide-y divide-[--border-subtle]">
            {shown.map((item, i) => {
              const itemKey = item.id ?? String(i)
              const isOpen  = expandedId === itemKey
              return (
                <div key={itemKey}>
                  <button
                    onClick={() => setExpandedId(isOpen ? null : itemKey)}
                    className="w-full text-left px-5 py-3.5 flex items-start gap-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[12px] font-semibold text-foreground truncate">
                          {item.filename_or_label}
                        </span>
                        {item.coverage_relevant && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 flex-shrink-0">
                            Coverage
                          </span>
                        )}
                        {item.citation_id && <CitationChip id={item.citation_id} citations={citations} />}
                      </div>
                      {!isOpen && item.key_facts?.[0] && (
                        <p className="text-[10.5px] text-muted-foreground/60 line-clamp-1">{item.key_facts[0]}</p>
                      )}
                    </div>
                    <ChevronDown
                      size={11}
                      strokeWidth={2}
                      className={cn('text-muted-foreground/30 flex-shrink-0 mt-0.5 transition-transform', isOpen && 'rotate-180')}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 bg-muted/[0.07]">
                      <ul className="flex flex-col gap-1">
                        {(item.key_facts ?? []).map((f, fi) => (
                          <li key={fi} className="flex gap-2 text-[11.5px] text-foreground/75 leading-[1.55]">
                            <span className="text-muted-foreground/40 flex-shrink-0">•</span>{f}
                          </li>
                        ))}
                      </ul>
                    </div>
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

// ── Next Steps Section ────────────────────────────────────────────────────────

const STEP_PRIORITY: Record<string, { color: string; bg: string }> = {
  urgent: { color: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
  high:   { color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
  normal: { color: '#6b7280', bg: 'rgba(107,114,128,0.08)' },
}

type StepDraftState = {
  status:    'idle' | 'creating' | 'done' | 'error'
  draftId?:  string
  threadId?: string
  errorMsg?: string
}

function NextStepsSection({
  v1Steps, missingItems, drafts, caseId, threads,
}: {
  v1Steps:      V1NextStep[]
  missingItems: V1Missing[]
  drafts:       V1Draft[]
  caseId:       string
  threads:      CaseThread[]
}) {
  const [stepDraftState, setStepDraftState] = useState<Record<number, StepDraftState>>({})
  const [copiedStep,     setCopiedStep]     = useState<number | null>(null)

  async function createDraft(step: V1NextStep, artifact: V1Draft) {
    const key      = step.step
    const threadId = threads[0]?.thread_id ?? null
    setStepDraftState(prev => ({ ...prev, [key]: { status: 'creating' } }))
    try {
      const res = await fetch('/api/nexus/draft-create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id:        threadId,
          body:             artifact.body,
          email_type:       'NEXUS',
          to_email:         artifact.to_emails?.[0] ?? '',
          nexus_case_id:    caseId,
          nexus_step_index: step.step,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.draftId) {
        setStepDraftState(prev => ({
          ...prev,
          [key]: { status: 'error', errorMsg: data.error ?? 'Draft creation failed' },
        }))
        return
      }
      setStepDraftState(prev => ({
        ...prev,
        [key]: { status: 'done', draftId: data.draftId, threadId: threadId ?? undefined },
      }))
    } catch (e) {
      setStepDraftState(prev => ({
        ...prev,
        [key]: { status: 'error', errorMsg: String(e) },
      }))
    }
  }

  function copyStep(step: V1NextStep) {
    const parts = [
      step.action,
      '',
      `Owner: ${step.owner}`,
      step.deadline ? `Deadline: ${step.deadline}` : null,
      `Priority: ${step.priority}`,
      '',
      step.rationale,
    ].filter(l => l !== null).join('\n')
    navigator.clipboard.writeText(parts).catch(() => {})
    setCopiedStep(step.step)
    setTimeout(() => setCopiedStep(s => s === step.step ? null : s), 1500)
  }

  if (!v1Steps?.length && !missingItems?.length) return (
    <div>
      <SectionLabel title="Next Steps" />
      <NoDataState icon={CheckCircle2} message="Next steps will appear here after analysis." />
    </div>
  )

  const urgentMissing = (missingItems ?? []).filter(m => m.urgency === 'urgent')

  const draftableCount = (v1Steps ?? []).filter((step) => !!drafts[step.step - 1]).length

  return (
    <div>
      <SectionLabel title="Next Steps" count={v1Steps?.length ?? 0}>
        {draftableCount > 0 && (
          <span className="text-[10px] text-muted-foreground/45 flex items-center gap-1">
            <MailOpen size={9} strokeWidth={2} />
            {draftableCount} with draft
          </span>
        )}
      </SectionLabel>
      <div className="flex flex-col gap-2">
        {urgentMissing.length > 0 && (
          <div className="px-4 py-3 rounded-xl border border-amber-200 bg-amber-50">
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-amber-700 mb-2">Prerequisites Required</p>
            <div className="flex flex-col gap-1.5">
              {urgentMissing.map((m, i) => (
                <div key={i} className="flex items-start gap-2">
                  <ShieldAlert size={10} strokeWidth={2} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[11.5px] font-medium text-amber-800">{m.item}</span>
                    <span className="text-[10.5px] text-amber-600"> · from {m.required_from}</span>
                    {m.impact && <p className="text-[10.5px] text-amber-600/80 mt-0.5">{m.impact}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(v1Steps ?? []).map((step, i) => {
          const pc       = partyColor(step.owner)
          const ps       = STEP_PRIORITY[step.priority?.toLowerCase()] ?? STEP_PRIORITY.normal
          const artifact = drafts[step.step - 1] ?? null
          const ds       = stepDraftState[step.step] ?? { status: 'idle' }

          return (
            <div key={i} className="flex gap-4 px-4 py-3.5 rounded-xl border border-[--border-subtle] bg-card">
              <span className="text-[13px] font-black text-muted-foreground/20 flex-shrink-0 w-6 text-right pt-0.5">
                {step.step}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="text-[12.5px] font-semibold text-foreground leading-[1.4]">{step.action}</span>
                  <span
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: ps.bg, color: ps.color }}
                  >
                    {step.priority?.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: pc.bg, color: pc.text }}>
                    {step.owner?.toUpperCase()}
                  </span>
                  {step.deadline && (
                    <span className="text-[10px] text-muted-foreground/55 flex items-center gap-1">
                      <Clock size={9} strokeWidth={2} /> {step.deadline}
                    </span>
                  )}
                  {(step.depends_on?.length ?? 0) > 0 && (
                    <span className="text-[9.5px] text-muted-foreground/45 flex items-center gap-1 border border-dashed border-[--border-subtle] rounded px-1.5 py-0.5">
                      Requires step{step.depends_on!.length > 1 ? 's' : ''} {step.depends_on!.join(', ')}
                    </span>
                  )}
                </div>
                <p className="text-[11.5px] text-muted-foreground/60 italic leading-[1.5] mb-3">{step.rationale}</p>

                {/* ── Step action bar ── */}
                <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[--border-subtle]/60">
                  {ds.status === 'done' ? (
                    <a
                      href={ds.threadId ? `/engagement?lead=${ds.threadId}` : '/engagement'}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[10.5px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                    >
                      <CheckCircle2 size={11} strokeWidth={2.5} />
                      Draft created · Open in Engagement
                      <ArrowRight size={10} strokeWidth={2.5} />
                    </a>
                  ) : artifact ? (
                    <button
                      onClick={() => createDraft(step, artifact)}
                      disabled={ds.status === 'creating'}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[--border-subtle] bg-background text-[10.5px] font-semibold text-foreground/70 hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {ds.status === 'creating' ? (
                        <Loader2 size={10} strokeWidth={2} className="animate-spin" />
                      ) : (
                        <MailOpen size={10} strokeWidth={2} />
                      )}
                      {ds.status === 'creating' ? 'Creating…' : 'Create draft email'}
                    </button>
                  ) : null}
                  <button
                    onClick={() => copyStep(step)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10.5px] font-medium transition-colors',
                      copiedStep === step.step
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-[--border-subtle] bg-background text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground/70',
                    )}
                  >
                    {copiedStep === step.step ? (
                      <><CheckCircle2 size={10} strokeWidth={2.5} /> Copied!</>
                    ) : (
                      <><FileText size={10} strokeWidth={2} /> Copy</>
                    )}
                  </button>
                  {ds.status === 'error' && (
                    <span className="text-[10px] text-red-500">{ds.errorMsg}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Draft Outputs Section ─────────────────────────────────────────────────────

function DraftOutputsSection({
  drafts, legacyPlaybook, threads,
}: {
  drafts:         V1Draft[]
  legacyPlaybook: PlaybookStep[]
  threads:        CaseThread[]
}) {
  const hasDrafts = drafts?.length > 0
  const hasLegacy = legacyPlaybook?.length > 0

  if (!hasDrafts && !hasLegacy) return (
    <div>
      <SectionLabel title="Draft Outputs" />
      <NoDataState icon={MailOpen} message="No draft communications. Run analysis to generate drafts for each party." />
    </div>
  )

  const steps: PlaybookStep[] = hasDrafts
    ? drafts.map((d, i) => ({
        step:       i + 1,
        action:     d.artifact_type === 'email' ? `Email ${d.to_party}` : `${d.artifact_type} to ${d.to_party}`,
        party_type: d.party_type,
        party_name: d.to_party,
        to_emails:  d.to_emails ?? [],
        cc_emails:  d.cc_emails ?? [],
        subject:    d.subject ?? '',
        priority:   (d.priority === 'urgent' ? 'URGENT' : d.priority === 'high' ? 'HIGH' : 'THIS_WEEK') as PlaybookStep['priority'],
        intent:     d.intent ?? '',
        reasoning:  '',
        draft:      d.body ?? '',
      }))
    : legacyPlaybook

  return (
    <div>
      <SectionLabel title="Draft Outputs" count={steps.length}>
        {!hasDrafts && hasLegacy && (
          <span className="text-[10px] text-muted-foreground/40 italic">Legacy format</span>
        )}
      </SectionLabel>
      <div className="flex flex-col gap-3">
        {steps.map(step => (
          <PlaybookStepCard key={step.step} step={step} threads={threads} />
        ))}
      </div>
    </div>
  )
}

// ── Run comparison helpers ────────────────────────────────────────────────────

function computeRunDiff(current: RunSummary, prev: RunSummary): string[] {
  if (current.run_status === 'failed') return ['run failed']
  if (prev.run_status === 'failed') return ['previous run had failed']
  const out: string[] = []
  const d = (n: number, label: string, labelP?: string) => {
    if (n === 0) return
    const sign = n > 0 ? `+${n}` : String(n)
    out.push(`${sign} ${Math.abs(n) === 1 ? label : (labelP ?? label + 's')}`)
  }
  d(current.threads_included  - prev.threads_included,  'thread')
  d(current.messages_included - prev.messages_included, 'message')
  d(current.attachments_count - prev.attachments_count, 'attachment')
  const citeDelta = current.citations_count - prev.citations_count
  if (citeDelta !== 0) d(citeDelta, 'citation')
  if (current.steps_count !== prev.steps_count)
    out.push(`steps ${prev.steps_count}→${current.steps_count}`)
  const missDelta = current.missing_items_count - prev.missing_items_count
  if (missDelta > 0)       d(missDelta, 'new blocker')
  else if (missDelta < 0)  out.push(`${Math.abs(missDelta)} blocker${Math.abs(missDelta) !== 1 ? 's' : ''} resolved`)
  if (current.synthesis_model !== prev.synthesis_model || current.strategy_model !== prev.strategy_model)
    out.push('model updated')
  return out
}

type StepDiffItem = {
  type:        'added' | 'removed' | 'changed'
  step:        number
  action:      string
  prevAction?: string
}

function diffStepActions(
  currentSteps:  V1NextStep[],
  previousSteps: V1NextStep[],
): StepDiffItem[] {
  const prevMap = new Map(previousSteps.map(s => [s.step, s.action]))
  const curMap  = new Map(currentSteps.map(s  => [s.step, s.action]))
  const allNums = Array.from(new Set([...Array.from(prevMap.keys()), ...Array.from(curMap.keys())])).sort((a, b) => a - b)
  const result: StepDiffItem[] = []
  for (const step of allNums) {
    const cur  = curMap.get(step)
    const prev = prevMap.get(step)
    if (!prev && cur)          result.push({ type: 'added',   step, action: cur })
    else if (prev && !cur)     result.push({ type: 'removed', step, action: prev })
    else if (cur && prev && cur !== prev)
      result.push({ type: 'changed', step, action: cur, prevAction: prev })
  }
  return result
}

// ── Run Comparison Banner ─────────────────────────────────────────────────────

function RunComparisonBanner({
  caseId, currentRun, previousRun, currentSteps,
}: {
  caseId:        string
  currentRun:    RunSummary
  previousRun:   RunSummary
  currentSteps:  V1NextStep[]
}) {
  const [open,            setOpen]            = useState(false)
  const [prevSteps,       setPrevSteps]       = useState<V1NextStep[] | null>(null)
  const [prevStepsLoaded, setPrevStepsLoaded] = useState(false)

  async function loadPrevSteps() {
    if (prevStepsLoaded) return
    setPrevStepsLoaded(true)
    try {
      const res = await fetch(`/api/nexus/cases/${caseId}/runs/${previousRun.id}`, { cache: 'no-store' })
      if (res.ok) {
        const sa = await res.json()
        setPrevSteps(Array.isArray(sa?.recommended_next_steps) ? sa.recommended_next_steps : [])
      }
    } catch { /* non-critical */ }
  }

  function handleToggle() {
    setOpen(v => !v)
    if (!prevStepsLoaded) loadPrevSteps()
  }

  const diffs    = computeRunDiff(currentRun, previousRun)
  const stepDiff = prevSteps !== null ? diffStepActions(currentSteps, prevSteps) : []

  if (diffs.length === 0 && currentRun.run_status !== 'failed') return null

  const prevAgo = timeAgo(previousRun.created_at)

  const STEP_DIFF_COLOR: Record<StepDiffItem['type'], string> = {
    added:   'bg-green-50 text-green-700 border-green-200',
    removed: 'bg-red-50   text-red-600   border-red-200',
    changed: 'bg-amber-50 text-amber-700 border-amber-200',
  }
  const STEP_DIFF_LABEL: Record<StepDiffItem['type'], string> = {
    added:   '+ added',
    removed: '− removed',
    changed: '~ changed',
  }

  return (
    <div className="rounded-xl border border-[--border-subtle] bg-muted/30">
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <TrendingUp size={11} strokeWidth={2} className="text-primary/50 flex-shrink-0" />
          <span className="text-[10.5px] font-semibold text-foreground/60">vs. {prevAgo}</span>
          <span className="text-[10px] text-muted-foreground/50 truncate hidden sm:block">
            {diffs.slice(0, 3).join(' · ')}{diffs.length > 3 ? ` · +${diffs.length - 3} more` : ''}
          </span>
        </div>
        <ChevronDown size={12} strokeWidth={2} className={cn('text-muted-foreground/30 flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-[--border-subtle]/40 pt-3 flex flex-col gap-3">
          {/* Metadata diffs */}
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-2">Changes since previous run</p>
            {diffs.length === 0 ? (
              <p className="text-[10.5px] text-muted-foreground/40 italic">No metadata changes</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {diffs.map((d, i) => (
                  <span key={i} className="text-[10.5px] px-2 py-0.5 rounded-full bg-primary/[0.06] text-primary/70 border border-primary/10 font-medium">
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Step-level diffs */}
          {prevSteps !== null && stepDiff.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-2">Step changes</p>
              <div className="flex flex-col gap-1.5">
                {stepDiff.map((d, i) => (
                  <div key={i} className={cn('rounded-lg border px-2.5 py-1.5', STEP_DIFF_COLOR[d.type])}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[8.5px] font-bold uppercase tracking-wider opacity-70">
                        {STEP_DIFF_LABEL[d.type]} · step {d.step}
                      </span>
                    </div>
                    <p className="text-[10.5px] font-medium leading-[1.4]">{d.action}</p>
                    {d.prevAction && (
                      <p className="text-[10px] opacity-60 line-through leading-[1.3] mt-0.5">{d.prevAction}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {prevSteps !== null && stepDiff.length === 0 && (
            <p className="text-[10px] text-muted-foreground/40 italic">Step actions unchanged</p>
          )}

          <p className="text-[10px] text-muted-foreground/40">
            Previous run: {new Date(previousRun.created_at).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })}
            {previousRun.run_duration_ms ? ` · ${Math.round(previousRun.run_duration_ms / 1000)}s` : ''}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Run History View ──────────────────────────────────────────────────────────

function RunHistoryView({
  caseId, runs, loading, onGoToMission, onPinToggle, onPrune,
}: {
  caseId:        string
  runs:          RunSummary[]
  loading:       boolean
  onGoToMission: () => void
  onPinToggle:   (runId: string, pinned: boolean) => Promise<void>
  onPrune:       () => Promise<void>
}) {
  const [pruning, setPruning] = useState(false)
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [rawJson,      setRawJson]      = useState<Record<string, string>>({})
  const [rawLoading,   setRawLoading]   = useState<string | null>(null)

  async function loadRaw(runId: string) {
    if (rawJson[runId]) { setExpandedId(prev => prev === runId ? null : runId); return }
    setRawLoading(runId)
    try {
      const res = await fetch(`/api/nexus/cases/${caseId}/runs/${runId}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setRawJson(prev => ({ ...prev, [runId]: JSON.stringify(data, null, 2) }))
      }
    } finally {
      setRawLoading(null)
      setExpandedId(runId)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={20} className="animate-spin text-muted-foreground/30" />
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-28 px-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-muted/60 border border-[--border-subtle] flex items-center justify-center">
          <Database size={24} strokeWidth={1.2} className="text-muted-foreground/30" />
        </div>
        <p className="text-[12.5px] font-bold text-foreground/50">No analysis runs yet</p>
        <button onClick={onGoToMission} className="text-[11px] text-primary font-semibold hover:opacity-80">
          Go to Mission Control →
        </button>
      </div>
    )
  }

  return (
    <div className="px-6 py-6 flex flex-col gap-4 pb-12">
      <div className="flex items-center justify-between">
        <SectionLabel title="Analysis Run History" count={runs.length} />
        <div className="flex items-center gap-2">
          {runs.filter(r => !r.pinned).length > 15 && (
            <button
              onClick={async () => { setPruning(true); try { await onPrune() } finally { setPruning(false) } }}
              disabled={pruning}
              title="Delete unpinned runs beyond the 15 most recent. Pinned runs are always kept."
              className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-red-500 transition-colors disabled:opacity-40"
            >
              {pruning ? <Loader2 size={9} strokeWidth={2} className="animate-spin" /> : <Trash2 size={9} strokeWidth={2} />}
              Prune old runs
            </button>
          )}
          {runs.length >= 2 && (
            <span className="text-[10px] text-muted-foreground/40">Newest first</span>
          )}
        </div>
      </div>

      {runs.map((run, i) => {
        const isCurrent   = i === 0
        const hasPrev     = i < runs.length - 1
        const diffs       = hasPrev ? computeRunDiff(run, runs[i + 1]) : []
        const isExpanded  = expandedId === run.id
        const isLoadingRaw = rawLoading === run.id
        const modelLabel  = run.strategy_model?.includes('claude') ? 'Claude + Gemini'
                          : run.synthesis_model ? 'Gemini only' : null
        const durationS   = run.run_duration_ms ? `${Math.round(run.run_duration_ms / 1000)}s` : null
        const ts = (() => {
          try { return new Date(run.created_at).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' }) }
          catch { return run.created_at }
        })()

        return (
          <div
            key={run.id}
            className={cn(
              'rounded-xl border bg-card transition-colors overflow-hidden',
              isCurrent ? 'border-primary/20 bg-primary/[0.02]'
              : run.pinned ? 'border-primary/15 ring-1 ring-primary/8'
              : 'border-[--border-subtle]',
            )}
          >
            {/* Run header */}
            <div className="px-4 py-3.5">
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  {isCurrent && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary flex-shrink-0">
                      Current
                    </span>
                  )}
                  {run.pinned && !isCurrent && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/8 text-primary/70 flex-shrink-0 flex items-center gap-0.5">
                      <Pin size={7} strokeWidth={2.5} /> Pinned
                    </span>
                  )}
                  <span className="text-[11.5px] font-semibold text-foreground/80">{ts}</span>
                  {run.triggered_by && (
                    <span className="text-[10px] text-muted-foreground/45 truncate">by {run.triggered_by}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {run.run_status === 'failed' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200">failed</span>
                  )}
                  {run.run_status === 'partial' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-500 border border-amber-200">partial</span>
                  )}
                  {durationS && (
                    <span className="text-[10px] text-muted-foreground/40">{durationS}</span>
                  )}
                  {modelLabel && (
                    <span className="text-[9px] font-medium text-muted-foreground/40 bg-muted/70 px-1.5 py-0.5 rounded">{modelLabel}</span>
                  )}
                  <button
                    onClick={() => onPinToggle(run.id, !run.pinned)}
                    title={run.pinned ? 'Unpin run (will be eligible for pruning)' : 'Pin run (exempt from auto-prune)'}
                    className={cn(
                      'flex items-center justify-center w-5 h-5 rounded transition-colors',
                      run.pinned
                        ? 'text-primary bg-primary/10 hover:bg-primary/20'
                        : 'text-muted-foreground/30 hover:text-muted-foreground/60 hover:bg-muted/60',
                    )}
                  >
                    {run.pinned ? <Pin size={9} strokeWidth={2.5} /> : <PinOff size={9} strokeWidth={2} />}
                  </button>
                </div>
              </div>

              {/* Stats grid */}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-2.5">
                {[
                  { v: run.threads_included,    l: 'threads'     },
                  { v: run.messages_included,   l: 'messages'    },
                  { v: run.attachments_count,   l: 'attachments' },
                  { v: run.steps_count,         l: 'steps'       },
                  { v: run.citations_count,     l: 'citations'   },
                  { v: run.missing_items_count, l: 'blockers'    },
                  { v: run.evidence_count,      l: 'evidence'    },
                ].map(({ v, l }) => (
                  <span key={l} className="text-[10.5px] text-muted-foreground/55">
                    <span className="font-semibold text-foreground/70">{v}</span> {l}
                  </span>
                ))}
                {run.gdrive_docs_count > 0 && (
                  <span className="text-[10.5px] text-muted-foreground/55">
                    <span className="font-semibold text-foreground/70">{run.gdrive_docs_count}</span> GDrive docs
                  </span>
                )}
                {(run.gemini_tokens ?? 0) > 0 && (
                  <span className="text-[10.5px] text-muted-foreground/40">
                    {((run.gemini_tokens ?? 0) + (run.claude_tokens ?? 0)).toLocaleString()} tokens
                  </span>
                )}
              </div>

              {/* Diff vs. previous */}
              {diffs.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2.5">
                  {diffs.map((d, di) => (
                    <span key={di} className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground/60 border border-[--border-subtle]">
                      {d}
                    </span>
                  ))}
                </div>
              )}

              {/* Truncation flags */}
              {run.truncation_flags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2.5">
                  {run.truncation_flags.map((f, fi) => (
                    <span key={fi} className="text-[9.5px] text-amber-600 flex items-center gap-1">
                      <AlertCircle size={9} strokeWidth={2} /> {f}
                    </span>
                  ))}
                </div>
              )}

              {/* Error message for failed runs */}
              {run.run_status === 'failed' && run.error_message && (
                <div className="mb-2.5 px-2.5 py-2 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-red-400 mb-0.5">Error</p>
                  <p className="text-[10.5px] text-red-700 font-mono leading-[1.4] break-all">
                    {run.error_message}
                  </p>
                </div>
              )}

              {/* Raw section viewer toggle — not available for failed runs */}
              {run.run_status !== 'failed' ? (
                <button
                  onClick={() => loadRaw(run.id)}
                  disabled={isLoadingRaw}
                  className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
                >
                  {isLoadingRaw ? (
                    <Loader2 size={9} strokeWidth={2} className="animate-spin" />
                  ) : (
                    <Eye size={9} strokeWidth={2} />
                  )}
                  {isExpanded ? 'Hide raw sections' : 'View raw sections'}
                  <ChevronDown size={9} strokeWidth={2} className={cn('transition-transform', isExpanded && 'rotate-180')} />
                </button>
              ) : (
                <span className="text-[10px] text-muted-foreground/30 italic">No analysis data — run failed before completion</span>
              )}
            </div>

            {/* Raw JSON viewer */}
            {isExpanded && rawJson[run.id] && (
              <div className="border-t border-[--border-subtle]/60 bg-muted/20 rounded-b-xl overflow-hidden">
                <pre className="px-4 py-3 text-[9.5px] text-muted-foreground/60 leading-relaxed overflow-x-auto max-h-96 font-mono">
                  {rawJson[run.id]}
                </pre>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Analysis Metadata Card (operator debug) ───────────────────────────────────

function AnalysisMetadataCard({ meta }: { meta: AnalysisMetadata }) {
  const [open, setOpen] = useState(false)

  const ts = (() => {
    try { return new Date(meta.analysis_ts).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' }) }
    catch { return meta.analysis_ts }
  })()

  const METHOD_LABEL: Record<string, string> = {
    'pre-extracted-text': 'text extract',
    'gemini-vision':      'vision',
    'gemini-pdf':         'PDF read',
    'gdrive':             'GDrive',
    'gmail-live':         'Gmail live',
  }

  return (
    <div className="rounded-xl border border-dashed border-[--border-subtle]/60 bg-muted/20">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Database size={11} strokeWidth={2} className="text-muted-foreground/40" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">Analysis Metadata</span>
          {(meta.truncation_flags?.length ?? 0) > 0 && (
            <span className="text-[9px] font-bold text-amber-500 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
              {meta.truncation_flags.length} flag{meta.truncation_flags.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ChevronDown size={12} strokeWidth={2} className={cn('text-muted-foreground/30 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-[--border-subtle]/40">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3">
            <MetaStat label="Run at" value={ts} />
            <MetaStat label="Synthesis" value={meta.synthesis_model} />
            <MetaStat label="Strategy" value={meta.strategy_model} />
            <MetaStat label="Threads" value={String(meta.threads_included)} />
            <MetaStat label="Messages" value={String(meta.messages_included)} />
            <MetaStat label="Synth tokens" value={meta.synthesis_tokens ? meta.synthesis_tokens.toLocaleString() : '—'} />
            {meta.strategy_tokens && <MetaStat label="Strategy tokens" value={meta.strategy_tokens.toLocaleString()} />}
          </div>

          {meta.attachments_included?.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/35 mb-1.5">Attachments processed</p>
              <div className="flex flex-col gap-1">
                {meta.attachments_included.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Paperclip size={9} strokeWidth={2} className="text-muted-foreground/30 flex-shrink-0" />
                    <span className="text-[10.5px] text-muted-foreground/60 flex-1 min-w-0 truncate">{a.filename}</span>
                    <span className="text-[9px] text-muted-foreground/35 flex-shrink-0">{METHOD_LABEL[a.method] ?? a.method}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {meta.gdrive_docs?.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/35 mb-1.5">Knowledge base docs</p>
              <div className="flex flex-col gap-1">
                {meta.gdrive_docs.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <BookOpen size={9} strokeWidth={2} className="text-muted-foreground/30 flex-shrink-0" />
                    <span className="text-[10.5px] text-muted-foreground/60">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {meta.truncation_flags?.length > 0 && (
            <div className="px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-[9px] font-bold uppercase tracking-wider text-amber-600 mb-1.5">Quality flags</p>
              <div className="flex flex-col gap-1">
                {meta.truncation_flags.map((f, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <AlertCircle size={9} strokeWidth={2} className="text-amber-500 flex-shrink-0 mt-[2px]" />
                    <span className="text-[10.5px] text-amber-700">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/35 mb-0.5">{label}</p>
      <p className="text-[11px] text-muted-foreground/65 font-medium">{value}</p>
    </div>
  )
}

// ── Threads Overview Card ─────────────────────────────────────────────────────

function ThreadsOverviewCard({
  threads, attachmentRecords, onAddThread, onUnlink, onUpdatePartyType,
}: {
  threads:           CaseThread[]
  attachmentRecords: AttachmentRecord[]
  onAddThread:       () => void
  onUnlink:          (t: string) => void
  onUpdatePartyType: (t: string, p: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const extracted = attachmentRecords.filter(a => a.parsed_at !== null).length
  const pending   = threads.filter(ct => ct.attachments_pending && ct.attachments_extracted === 0).length

  if (threads.length === 0) return null

  return (
    <div>
      <SectionLabel title="Linked Threads" count={threads.length}>
        <div className="flex items-center gap-3">
          {extracted > 0 && <span className="text-[10px] text-muted-foreground/50">{extracted} att. extracted</span>}
          {pending > 0 && <span className="text-[10px] text-amber-600 font-medium">{pending} pending</span>}
          <button onClick={onAddThread} className="text-[11px] text-primary font-semibold hover:opacity-80 transition-opacity">
            + Add
          </button>
        </div>
      </SectionLabel>

      <div className="rounded-xl border border-[--border-subtle] bg-card overflow-hidden">
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            {threads.slice(0, 5).map(ct => {
              const pc   = partyColor(ct.party_type)
              const name = ct.thread?.contact ? contactName(ct.thread.contact) : ct.party_label ?? ct.party_type
              return (
                <span key={ct.id} className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: pc.bg, color: pc.text }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: pc.dot }} />
                  {name.length > 16 ? name.slice(0, 16) + '…' : name}
                </span>
              )
            })}
            {threads.length > 5 && <span className="text-[10px] text-muted-foreground/50">+{threads.length - 5} more</span>}
          </div>
          <ChevronDown size={11} strokeWidth={2} className={cn('text-muted-foreground/30 flex-shrink-0 ml-3 transition-transform', expanded && 'rotate-180')} />
        </button>

        {expanded && (
          <div className="border-t border-[--border-subtle] divide-y divide-[--border-subtle]">
            {threads.map(ct => (
              <div key={ct.id} className="px-4">
                <LinkedThreadCard ct={ct} onUnlink={onUnlink} onUpdatePartyType={onUpdatePartyType} />
              </div>
            ))}
          </div>
        )}
      </div>

      {(attachmentRecords.length > 0 || threads.some(ct => ct.attachments_pending)) && (
        <div className="mt-3">
          <AttachmentCoverageCard threads={threads} attachmentRecords={attachmentRecords} />
        </div>
      )}
    </div>
  )
}

// ── Messages View ─────────────────────────────────────────────────────────────

function MessagesView({
  messages, loading, onGoToMission,
}: {
  messages:      (CaseThreadMsg & { party_type: string; party_label: string; subject: string })[]
  loading:       boolean
  onGoToMission: () => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={18} className="animate-spin text-muted-foreground/30" />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-24 px-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted/60 border border-[--border-subtle] flex items-center justify-center">
          <Network size={28} strokeWidth={1.2} className="text-muted-foreground/30" />
        </div>
        <div className="max-w-[260px]">
          <p className="text-[13px] font-semibold text-foreground/60 mb-1.5">No messages yet</p>
          <p className="text-[11.5px] text-muted-foreground/45 leading-[1.6]">
            Link email threads on Mission Control to see all communications here.
          </p>
        </div>
        <button
          onClick={onGoToMission}
          className="text-[12px] text-primary font-semibold hover:opacity-80 transition-opacity"
        >
          ← Mission Control
        </button>
      </div>
    )
  }

  return (
    <div className="px-5 py-4 flex flex-col gap-3">
      {messages.map(msg => <TimelineMessageCard key={msg.id} msg={msg} />)}
    </div>
  )
}

// ── Linked Thread Card ────────────────────────────────────────────────────────

function LinkedThreadCard({
  ct, onUnlink, onUpdatePartyType,
}: {
  ct:                CaseThread
  onUnlink:          (threadId: string) => void
  onUpdatePartyType: (threadId: string, partyType: string) => void
}) {
  const pc      = partyColor(ct.party_type)
  const contact = ct.thread?.contact ?? null
  const msgCount = ct.messages.length

  return (
    <div className="flex items-start gap-3 px-3.5 py-3 rounded-xl border border-[--border-subtle] bg-card hover:bg-muted/20 transition-colors group">
      {/* Party dot */}
      <span className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ background: pc.dot }} />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 mb-0.5">
          <span className="text-[12px] font-semibold text-foreground truncate">
            {contact ? contactName(contact) : '—'}
          </span>
          {contact?.company && (
            <span className="text-[10.5px] text-muted-foreground/50 truncate">· {contact.company}</span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground/60 truncate mb-2">
          {ct.thread?.subject ?? '(no subject)'}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10.5px] text-muted-foreground/50">
            {msgCount} msg{msgCount !== 1 ? 's' : ''}
          </span>
          {ct.attachments_extracted > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 font-medium">
              <Paperclip size={9} strokeWidth={2} /> {ct.attachments_extracted} extracted
            </span>
          )}
          {ct.attachments_pending && ct.attachments_extracted === 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500 font-medium">
              <Paperclip size={9} strokeWidth={2} /><Clock size={8} strokeWidth={2} /> pending
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/35 ml-auto">
            {fmtDate(ct.thread?.last_message_at)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
        <select
          value={ct.party_type}
          onChange={e => onUpdatePartyType(ct.thread_id, e.target.value)}
          onClick={e => e.stopPropagation()}
          className="text-[10.5px] border border-[--border-subtle] rounded-md px-1.5 py-0.5 bg-background outline-none font-semibold focus:ring-1 focus:ring-primary/20"
          style={{ color: pc.text }}
        >
          {PARTY_TYPES.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <button
          onClick={() => onUnlink(ct.thread_id)}
          className="p-1 rounded-md text-muted-foreground/25 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Remove from case"
        >
          <X size={11} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

// ── Attachment Coverage Card ───────────────────────────────────────────────────

function AttachmentCoverageCard({
  threads, attachmentRecords,
}: {
  threads:           CaseThread[]
  attachmentRecords: AttachmentRecord[]
}) {
  const extracted      = attachmentRecords.filter(a => a.parsed_at !== null)
  const pendingThreads = threads.filter(ct => ct.attachments_pending && ct.attachments_extracted === 0)

  const ext = extracted.length
  const byType = {
    pdf:   extracted.filter(a => a.mime_type?.includes('pdf') || a.filename.toLowerCase().endsWith('.pdf')).length,
    image: extracted.filter(a => a.mime_type?.startsWith('image/')).length,
    docx:  extracted.filter(a => a.mime_type?.includes('word') || a.filename.toLowerCase().endsWith('.docx')).length,
    xlsx:  extracted.filter(a => a.mime_type?.includes('sheet') || a.filename.toLowerCase().match(/\.(xlsx?|csv)$/)).length,
  }
  const other = Math.max(0, ext - byType.pdf - byType.image - byType.docx - byType.xlsx)

  return (
    <div className="rounded-xl border border-[--border-subtle] bg-card px-4 py-3.5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-foreground/60 flex items-center gap-1.5">
          <Paperclip size={10} strokeWidth={2} /> Attachment Coverage
        </span>
        {pendingThreads.length > 0 && (
          <span className="text-[9.5px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
            {pendingThreads.length} thread{pendingThreads.length > 1 ? 's' : ''} pending extraction
          </span>
        )}
      </div>

      {ext === 0 && pendingThreads.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/40 italic">No attachments found in linked threads.</p>
      ) : (
        <div className="flex items-center gap-5 flex-wrap">
          <div>
            <p className="text-[22px] font-bold text-foreground tabular-nums leading-none">{ext}</p>
            <p className="text-[9.5px] text-muted-foreground/50 uppercase tracking-wide mt-0.5">Extracted</p>
          </div>
          {pendingThreads.length > 0 && (
            <div>
              <p className="text-[22px] font-bold text-amber-600 tabular-nums leading-none">{pendingThreads.length}</p>
              <p className="text-[9.5px] text-muted-foreground/50 uppercase tracking-wide mt-0.5">Pending</p>
            </div>
          )}
          {ext > 0 && (
            <div className="flex flex-wrap gap-1.5 ml-auto">
              {byType.pdf   > 0 && <span className="text-[10px] px-2 py-0.5 bg-red-50 text-red-700 rounded-full border border-red-100 font-medium">PDF ×{byType.pdf}</span>}
              {byType.docx  > 0 && <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100 font-medium">DOCX ×{byType.docx}</span>}
              {byType.xlsx  > 0 && <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 font-medium">XLSX ×{byType.xlsx}</span>}
              {byType.image > 0 && <span className="text-[10px] px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full border border-purple-100 font-medium">Image ×{byType.image}</span>}
              {other        > 0 && <span className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground rounded-full border border-[--border-subtle] font-medium">Other ×{other}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Timeline Message Card ─────────────────────────────────────────────────────

function TimelineMessageCard({
  msg,
}: {
  msg: CaseThreadMsg & { party_type: string; party_label: string; subject: string }
}) {
  const [open, setOpen] = useState(false)
  const pc = partyColor(msg.direction === 'outbound' ? 'trs' : msg.party_type)
  const who = msg.direction === 'outbound' ? 'TRS' : msg.party_label

  return (
    <div
      className="rounded-xl border transition-colors cursor-pointer"
      style={{ borderColor: pc.border, background: open ? pc.bg : 'transparent' }}
      onClick={() => setOpen(v => !v)}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: pc.dot }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 justify-between">
            <span className="text-[11px] font-semibold" style={{ color: pc.text }}>{who}</span>
            <span className="text-[9.5px] text-muted-foreground/50 flex-shrink-0">{fmtDate(msg.sent_at)}</span>
          </div>
          {!open && (
            <p className="text-[11px] text-muted-foreground/60 leading-[1.4] mt-0.5 line-clamp-2">
              {(msg.body_text ?? '').slice(0, 200)}
            </p>
          )}
          {msg.has_attachments && (
            <span className="inline-flex items-center gap-1 text-[9.5px] text-muted-foreground/50 mt-1">
              <FileText size={9} strokeWidth={1.8} /> attachments
            </span>
          )}
        </div>
        <ChevronDown
          size={11}
          strokeWidth={2}
          className={cn('text-muted-foreground/30 flex-shrink-0 transition-transform mt-1', open && 'rotate-180')}
        />
      </div>
      {open && (
        <div className="px-3 pb-3 border-t border-[--border-subtle]/50 mt-1">
          <p className="text-[11.5px] text-foreground/75 leading-[1.7] whitespace-pre-wrap mt-2">
            {msg.body_text ?? '(empty)'}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Playbook Step Card (with inline compose) ──────────────────────────────────

function PlaybookStepCard({ step, threads }: { step: PlaybookStep; threads: CaseThread[] }) {
  const [composeOpen, setComposeOpen] = useState(false)
  const pm = priorityMeta(step.priority)
  const pc = partyColor(step.party_type)
  const PIcon = pm.icon

  // Find the thread for this step's party type
  const matchingThread = threads.find(ct => ct.party_type === step.party_type) ?? null

  return (
    <div className="rounded-xl border border-[--border-subtle] bg-card overflow-hidden">
      {/* Step header */}
      <div className="px-3 pt-3 pb-2.5">
        <div className="flex items-start gap-2 justify-between mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[11px] font-black text-muted-foreground/40 flex-shrink-0">
              {String(step.step).padStart(2, '0')}
            </span>
            <span className="text-[12px] font-bold text-foreground truncate">{step.action}</span>
          </div>
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold flex-shrink-0"
            style={{ background: pm.bg, color: pm.color }}
          >
            <PIcon size={8} strokeWidth={2.5} />
            {pm.label}
          </span>
        </div>

        {/* Party */}
        <div className="flex items-center gap-1.5 mb-2">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: pc.bg, color: pc.text }}
          >
            {step.party_type.toUpperCase()}
          </span>
          <span className="text-[11px] text-muted-foreground/60 truncate">{step.party_name}</span>
        </div>

        {/* Intent */}
        <p className="text-[11px] text-foreground/70 leading-[1.55] mb-1.5">{step.intent}</p>

        {/* Reasoning */}
        {step.reasoning && (
          <p className="text-[10.5px] text-muted-foreground/55 italic leading-[1.45]">{step.reasoning}</p>
        )}

        {/* To/CC preview */}
        {(step.to_emails?.length > 0 || step.cc_emails?.length > 0) && (
          <div className="mt-2 flex flex-col gap-0.5">
            {step.to_emails?.length > 0 && (
              <p className="text-[9.5px] text-muted-foreground/50">
                <span className="font-semibold">To:</span> {step.to_emails.join(', ')}
              </p>
            )}
            {step.cc_emails?.length > 0 && (
              <p className="text-[9.5px] text-muted-foreground/50">
                <span className="font-semibold">CC:</span> {step.cc_emails.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 pb-3 flex gap-1.5">
        <button
          onClick={() => setComposeOpen(v => !v)}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors',
            composeOpen
              ? 'bg-primary text-primary-foreground'
              : 'bg-primary/8 text-primary hover:bg-primary/12',
          )}
        >
          <MailOpen size={11} strokeWidth={2} />
          {composeOpen ? 'Hide Draft' : 'Open Draft'}
        </button>
      </div>

      {/* Inline compose */}
      {composeOpen && (
        <NexusStepCompose
          step={step}
          threadId={matchingThread?.thread_id ?? null}
          onClose={() => setComposeOpen(false)}
        />
      )}
    </div>
  )
}

// ── Nexus Step Compose ────────────────────────────────────────────────────────

type SigOption = { id: string; name: string; title: string | null; phone: string | null; email: string | null; company_tagline: string | null; sending_email: string | null }

function NexusStepCompose({
  step, threadId, onClose,
}: { step: PlaybookStep; threadId: string | null; onClose: () => void }) {
  const [draftHtml, setDraftHtml]     = useState(plainToHtml(step.draft))
  const [editorKey]                   = useState(0)
  const [toList,    setToList]        = useState(step.to_emails.join(', '))
  const [ccList,    setCcList]        = useState(step.cc_emails.join(', '))
  const [subject,   setSubject]       = useState(step.subject)
  const [sending,   setSending]       = useState(false)
  const [sent,      setSent]          = useState(false)
  const [error,     setError]         = useState<string | null>(null)

  const [signatures,    setSignatures]    = useState<SigOption[]>([])
  const [selectedSigId, setSelectedSigId] = useState('')
  const [senders,       setSenders]       = useState<{ email: string; label: string; type: string }[]>([])
  const [fromEmail,     setFromEmail]     = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/signatures', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/email/available-senders', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([sigs, sndrs]) => {
      const sigArr = Array.isArray(sigs) ? sigs : []
      setSignatures(sigArr)
      if (sigArr.length > 0) setSelectedSigId(sigArr[0].id)
      const sndrArr = Array.isArray(sndrs) ? sndrs : []
      setSenders(sndrArr)
      if (sndrArr.length > 0) setFromEmail(sndrArr[0].email)
    })
  }, [])

  function buildSigHtml(sig: SigOption): string {
    return [
      '<br><hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb">',
      `<p style="margin:0;font-size:13px;color:#1e3a5f;font-weight:600">${sig.name}</p>`,
      sig.title ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${sig.title}</p>` : '',
      sig.phone ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${sig.phone}</p>` : '',
      sig.email ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${sig.email}</p>` : '',
    ].filter(Boolean).join('')
  }

  async function handleSend() {
    if (!toList.trim()) return
    setSending(true); setError(null)
    try {
      const sig      = signatures.find(s => s.id === selectedSigId)
      const sigHtml  = sig ? buildSigHtml(sig) : ''
      const bodyHtml = draftHtml + sigHtml
      const toFirst  = toList.split(',')[0]?.trim() ?? ''

      const draftRes = await fetch('/api/nexus/draft-create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id:  threadId,
          body:       step.draft,
          email_type: `NEXUS_${step.party_type.toUpperCase()}`,
          to_email:   toFirst,
        }),
      })
      const draftData = await draftRes.json()
      if (!draftRes.ok || !draftData.draftId) throw new Error(draftData.error || 'Could not prepare draft for sending')

      const res = await fetch('/api/email/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId:        draftData.draftId,
          htmlBody:       bodyHtml,
          originalAiBody: step.draft,
          toEmail:        toFirst,
          cc:             ccList.split(',').map(e => e.trim()).filter(Boolean),
          customSubject:  subject,
          fromEmail:      fromEmail || null,
          signatureId:    selectedSigId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally { setSending(false) }
  }

  if (sent) {
    return (
      <div className="border-t border-[--border-subtle] px-3 py-4 flex flex-col items-center gap-2">
        <CheckCircle2 size={20} className="text-[--success]" strokeWidth={1.8} />
        <p className="text-[12px] font-semibold text-[--success]">Email sent</p>
        <button onClick={onClose} className="text-[11px] text-muted-foreground hover:text-foreground">Close</button>
      </div>
    )
  }

  return (
    <div className="border-t border-[--border-subtle]">
      <div className="px-3 pt-3 pb-2 flex flex-col gap-2">
        {/* From */}
        {senders.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-[9.5px] font-semibold text-muted-foreground/60 w-10 flex-shrink-0">From</span>
            <select
              value={fromEmail}
              onChange={e => setFromEmail(e.target.value)}
              className="flex-1 text-[11px] border border-[--border-subtle] rounded-md px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-primary/20"
            >
              {senders.map(s => <option key={s.email} value={s.email}>{s.label || s.email}</option>)}
            </select>
          </div>
        )}

        {/* To */}
        <div className="flex items-center gap-2">
          <span className="text-[9.5px] font-semibold text-muted-foreground/60 w-10 flex-shrink-0">To</span>
          <input
            value={toList}
            onChange={e => setToList(e.target.value)}
            className="flex-1 text-[11px] border border-[--border-subtle] rounded-md px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-primary/20"
          />
        </div>

        {/* CC */}
        <div className="flex items-center gap-2">
          <span className="text-[9.5px] font-semibold text-muted-foreground/60 w-10 flex-shrink-0">CC</span>
          <input
            value={ccList}
            onChange={e => setCcList(e.target.value)}
            className="flex-1 text-[11px] border border-[--border-subtle] rounded-md px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-primary/20"
          />
        </div>

        {/* Subject */}
        <div className="flex items-center gap-2">
          <span className="text-[9.5px] font-semibold text-muted-foreground/60 w-10 flex-shrink-0">Subj</span>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="flex-1 text-[11px] border border-[--border-subtle] rounded-md px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-primary/20"
          />
        </div>

        {/* Signature selector */}
        {signatures.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[9.5px] font-semibold text-muted-foreground/60 w-10 flex-shrink-0">Sig</span>
            <select
              value={selectedSigId}
              onChange={e => setSelectedSigId(e.target.value)}
              className="flex-1 text-[11px] border border-[--border-subtle] rounded-md px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-primary/20"
            >
              <option value="">— No signature —</option>
              {signatures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Rich editor */}
      <div className="px-3 pb-2 border-t border-[--border-subtle]/50">
        <RichEditor
          key={editorKey}
          initialHtml={draftHtml}
          onChange={setDraftHtml}
          minHeight={120}
        />
      </div>

      {/* Actions */}
      <div className="px-3 pb-3 flex items-center gap-2 border-t border-[--border-subtle]/50 pt-2">
        {error && <p className="flex-1 text-[10.5px] text-[--error] truncate">{error}</p>}
        <div className="flex gap-1.5 ml-auto">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[11px] border border-[--border-subtle] text-muted-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !toList.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {sending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} strokeWidth={2} />}
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Thread Linker Modal ───────────────────────────────────────────────────────

function ThreadLinkerModal({
  caseId, linkedThreadIds, onLink, onClose,
}: { caseId: string; linkedThreadIds: string[]; onLink: () => void; onClose: () => void }) {
  const [search,       setSearch]       = useState('')
  const [suggestions,  setSuggestions]  = useState<ThreadSuggestion[]>([])
  const [allThreads,   setAllThreads]   = useState<ThreadSuggestion[]>([])
  const [loading,      setLoading]      = useState(true)
  const [linking,      setLinking]      = useState(false)
  const [partyTypes,   setPartyTypes]   = useState<Record<string, string>>({})
  const [labels,       setLabels]       = useState<Record<string, string>>({})
  const [selected,     setSelected]     = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/nexus/cases/${caseId}/suggest`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/nexus/cases/${caseId}/suggest?all=1`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([sugg, all]) => {
      const suggestions = Array.isArray(sugg) ? sugg : []
      const allT = Array.isArray(all) ? all : []
      setSuggestions(suggestions)
      setAllThreads(allT)
      const types: Record<string, string> = {}
      ;[...suggestions, ...allT].forEach((t: ThreadSuggestion) => {
        types[t.id] = autoSuggestParty(t.contact)
      })
      setPartyTypes(types)
      setSelected(new Set())
    }).finally(() => setLoading(false))
  }, [caseId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function linkSelected() {
    const toLink = Array.from(selected).filter(id => !linkedThreadIds.includes(id))
    if (toLink.length === 0) return
    setLinking(true)
    try {
      await Promise.all(toLink.map(threadId =>
        fetch(`/api/nexus/cases/${caseId}/threads`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            thread_id:   threadId,
            party_type:  partyTypes[threadId] ?? 'client',
            party_label: labels[threadId]?.trim() || null,
          }),
        })
      ))
      onLink()
    } finally { setLinking(false) }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const suggestionIds  = new Set(suggestions.map(s => s.id))
  const selectable     = (t: ThreadSuggestion) => !linkedThreadIds.includes(t.id)
  const filtered       = allThreads.filter(t => selectable(t) && (
    !search ||
    (t.subject ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (t.contact?.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (t.contact?.company ?? '').toLowerCase().includes(search.toLowerCase())
  ))
  const suggestedRows  = suggestions.filter(selectable)
  const restRows       = filtered.filter(t => !suggestionIds.has(t.id) || !!search)
  const addCount       = Array.from(selected).filter(id => !linkedThreadIds.includes(id)).length

  const ThreadTableRow = ({ thread, isSuggested }: { thread: ThreadSuggestion; isSuggested: boolean }) => {
    const alreadyLinked = linkedThreadIds.includes(thread.id)
    const isSelected    = selected.has(thread.id)
    const pty           = partyTypes[thread.id] ?? 'client'
    const pc            = partyColor(pty)

    return (
      <tr
        className={cn(
          'border-b border-[--border-subtle] transition-colors cursor-pointer',
          alreadyLinked ? 'opacity-40 cursor-default' : isSelected ? 'bg-primary/5' : 'hover:bg-muted/40',
        )}
        onClick={() => !alreadyLinked && toggleSelect(thread.id)}
      >
        {/* Checkbox */}
        <td className="px-3 py-2.5 w-8">
          {alreadyLinked ? (
            <CheckCircle2 size={13} className="text-green-500" strokeWidth={2} />
          ) : (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelect(thread.id)}
              onClick={e => e.stopPropagation()}
              className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
            />
          )}
        </td>

        {/* Contact */}
        <td className="py-2.5 pr-3 min-w-0 max-w-[140px]">
          <p className="text-[11.5px] font-semibold text-foreground truncate">
            {thread.contact ? contactName(thread.contact) : '—'}
          </p>
          {thread.contact?.company && (
            <p className="text-[10px] text-muted-foreground/60 truncate">{thread.contact.company}</p>
          )}
        </td>

        {/* Subject */}
        <td className="py-2.5 pr-3 min-w-0">
          <p className="text-[11.5px] text-foreground truncate">{thread.subject ?? '(no subject)'}</p>
          {isSuggested && (
            <p className="text-[9.5px] text-primary/60 italic truncate">{thread.match_reason}</p>
          )}
        </td>

        {/* Date */}
        <td className="py-2.5 pr-3 text-[10.5px] text-muted-foreground/60 whitespace-nowrap">
          {fmtDate(thread.last_message_at)}
        </td>

        {/* Party type */}
        <td className="py-2 pr-3 w-[130px]" onClick={e => e.stopPropagation()}>
          {alreadyLinked ? (
            <span className="text-[10px] text-muted-foreground">Already linked</span>
          ) : (
            <div className="flex flex-col gap-1">
              <select
                value={pty}
                onChange={e => setPartyTypes(prev => ({ ...prev, [thread.id]: e.target.value }))}
                className="text-[10.5px] border border-[--border-subtle] rounded-md px-1.5 py-0.5 bg-background outline-none w-full font-semibold"
                style={{ color: pc.text }}
              >
                {PARTY_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
              <input
                value={labels[thread.id] ?? ''}
                onChange={e => setLabels(prev => ({ ...prev, [thread.id]: e.target.value }))}
                placeholder="e.g. QBE Marine"
                className="text-[10px] border border-[--border-subtle] rounded-md px-1.5 py-0.5 bg-background outline-none w-full text-muted-foreground"
              />
            </div>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-[760px] flex flex-col overflow-hidden max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[--border-subtle] flex-shrink-0">
          <div>
            <h3 className="text-[13.5px] font-bold text-foreground">Add Email Threads to Case</h3>
            <p className="text-[10.5px] text-muted-foreground/60 mt-0.5">
              Select conversations and assign each party. Party types are auto-suggested from contact email.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-4"><X size={14} /></button>
        </div>

        {/* Search + bulk action bar */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-[--border-subtle] flex-shrink-0 bg-muted/20">
          <div className="flex items-center gap-2 flex-1 px-3 py-1.5 bg-background rounded-lg border border-[--border-subtle]">
            <Search size={12} className="text-muted-foreground/50 flex-shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by subject, contact name, or company…"
              autoFocus
              className="flex-1 text-[12px] bg-transparent outline-none placeholder:text-muted-foreground/40"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-muted-foreground/40 hover:text-muted-foreground">
                <X size={11} />
              </button>
            )}
          </div>
          <button
            onClick={linkSelected}
            disabled={addCount === 0 || linking}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-semibold bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex-shrink-0 whitespace-nowrap shadow-sm"
          >
            {linking ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} strokeWidth={2} />}
            {addCount > 0 ? `Add ${addCount} to Case` : 'Select threads'}
          </button>
        </div>

        {/* Thread table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-[12px] text-muted-foreground text-center py-10">Loading conversations…</p>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur-sm border-b border-[--border-subtle]">
                <tr>
                  <th className="px-3 py-2 text-left w-8"></th>
                  <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Contact</th>
                  <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Subject</th>
                  <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Date</th>
                  <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Party</th>
                </tr>
              </thead>
              <tbody>
                {suggestedRows.length > 0 && !search && (
                  <>
                    <tr className="bg-primary/[0.04]">
                      <td colSpan={5} className="px-3 py-2 border-b border-primary/10">
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-primary/60 flex items-center gap-1.5">
                          <Sparkles size={9} strokeWidth={2.5} /> AI Suggestions — review for relevance
                        </span>
                      </td>
                    </tr>
                    {suggestedRows.map(t => <ThreadTableRow key={t.id} thread={t} isSuggested />)}
                    <tr className="bg-muted/40">
                      <td colSpan={5} className="px-3 py-2 border-b border-[--border-subtle]">
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/50">All Recent Conversations</span>
                      </td>
                    </tr>
                  </>
                )}
                {restRows.map(t => <ThreadTableRow key={t.id} thread={t} isSuggested={false} />)}
                {restRows.length === 0 && suggestedRows.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-10 text-[11.5px] text-muted-foreground/50 italic">
                    {search ? 'No matching threads found.' : 'No threads available.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-[--border-subtle] bg-muted/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <p className="text-[10.5px] text-muted-foreground/60">
              {addCount > 0 ? `${addCount} thread${addCount > 1 ? 's' : ''} selected` : 'Click rows to select'}
            </p>
            {addCount > 0 && (
              <button onClick={() => setSelected(new Set())} className="text-[10.5px] text-muted-foreground/50 hover:text-muted-foreground underline-offset-2 hover:underline">
                Clear all
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
