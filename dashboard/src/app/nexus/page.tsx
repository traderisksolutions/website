'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, RefreshCw, ChevronDown, X, Search, Link2, Sparkles,
  AlertCircle, Clock, CheckCircle2, Zap, BookOpen, ArrowRight,
  MailOpen, FileText, Scale, Users, Send, Loader2, Trash2, Paperclip,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RichEditor, plainToHtml, htmlToPlain } from '@/components/RichEditor'

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

type CaseAnalysis = {
  id:                 string
  case_id:            string
  historical_timeline: TimelineEvent[]
  current_status:     { summary: string; blocking_issues: string[]; pending_from: Record<string, string> }
  playbook:           PlaybookStep[]
  outreach_strategy:  Record<string, { tone: string; key_message: string; timing: string }>
  legal_research:     { singapore_relevance: string; applicable_regulations: string[]; precedents_or_guidance: string[]; sources: string[] } | null
  strategy_model:     string | null
  created_at:         string
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

// Suggest party type from contact email domain
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 h-[52px] border-b border-[--border-subtle] flex-shrink-0 bg-card">
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-bold text-foreground tracking-tight">Nexus</span>
          <span className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wider">Grand Analysis & Strategy</span>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus size={12} strokeWidth={2.5} />
          New Case
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Case List ── */}
        <aside className="w-[240px] flex-shrink-0 border-r border-[--border-subtle] flex flex-col overflow-hidden bg-card">
          <div className="px-3 py-2.5 border-b border-[--border-subtle]">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted rounded-lg">
              <Search size={11} className="text-muted-foreground/50 flex-shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search cases…"
                className="flex-1 text-[11.5px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground/40 min-w-0"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-1.5">
            {loading ? (
              <p className="text-[11.5px] text-muted-foreground text-center py-8">Loading…</p>
            ) : visible.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[11.5px] text-muted-foreground/60 mb-3">No cases yet</p>
                <button onClick={() => setCreateOpen(true)} className="text-[11px] text-primary font-medium hover:opacity-80">
                  + Create first case
                </button>
              </div>
            ) : visible.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 flex flex-col gap-0.5 transition-colors border-l-2',
                  selectedId === c.id
                    ? 'bg-accent border-primary'
                    : 'border-transparent hover:bg-accent/50',
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    c.status === 'open' ? 'bg-primary' : 'bg-muted-foreground/40',
                  )} />
                  <span className="text-[12px] font-medium text-foreground truncate">{c.name}</span>
                </div>
                <div className="flex items-center gap-2 pl-3">
                  <span className="text-[10.5px] text-muted-foreground/60">
                    {c.thread_count} thread{c.thread_count !== 1 ? 's' : ''}
                  </span>
                  {c.last_activity && (
                    <span className="text-[10px] text-muted-foreground/40">{timeAgo(c.last_activity)}</span>
                  )}
                </div>
              </button>
            ))}
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

// ── Case Detail Panel ─────────────────────────────────────────────────────────

function CaseDetailPanel({
  caseData, onRefresh, onDelete,
}: { caseData: Case; onRefresh: () => void; onDelete: () => void }) {
  const [detail,         setDetail]         = useState<{ threads: CaseThread[]; analysis: CaseAnalysis | null } | null>(null)
  const [loading,        setLoading]        = useState(false)
  const [analyzing,      setAnalyzing]      = useState(false)
  const [analyzeError,   setAnalyzeError]   = useState<string | null>(null)
  const [activeTab,      setActiveTab]      = useState<'timeline' | 'status' | 'playbook' | 'legal'>('playbook')
  const [linkOpen,       setLinkOpen]       = useState(false)
  const [confirmDelete,  setConfirmDelete]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/nexus/cases/${caseData.id}`, { cache: 'no-store' })
      if (res.ok) setDetail(await res.json())
    } finally { setLoading(false) }
  }, [caseData.id])

  useEffect(() => {
    setDetail(null)
    setAnalyzeError(null)
    load()
  }, [caseData.id, load])

  async function runAnalysis() {
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      const res = await fetch(`/api/nexus/cases/${caseData.id}/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setDetail(prev => prev ? { ...prev, analysis: data.analysis } : prev)
      setActiveTab('playbook')
      onRefresh()
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : 'Analysis failed')
    } finally { setAnalyzing(false) }
  }

  async function unlinkThread(threadId: string) {
    await fetch(`/api/nexus/cases/${caseData.id}/threads?thread_id=${threadId}`, { method: 'DELETE' })
    load()
  }

  const threads  = detail?.threads ?? []
  const analysis = detail?.analysis ?? null

  // Build unified timeline of all messages sorted by date
  const unifiedMessages = threads.flatMap(ct =>
    ct.messages.map(m => ({
      ...m,
      party_type:  ct.party_type,
      party_label: ct.party_label ?? ct.party_type,
      subject:     ct.thread?.subject ?? '',
    }))
  ).sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime())

  return (
    <div className="flex flex-1 overflow-hidden min-w-0">

      {/* ── Center: Unified Timeline ── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-[--border-subtle]">
        {/* Case header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[--border-subtle] flex-shrink-0 bg-card">
          <div className="min-w-0 flex-1">
            <h2 className="text-[13.5px] font-bold text-foreground truncate">{caseData.name}</h2>
            {caseData.description && (
              <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">{caseData.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            {confirmDelete ? (
              <>
                <span className="text-[11px] text-[--error]">Delete this case?</span>
                <button onClick={() => { onDelete(); setConfirmDelete(false) }} className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[--error]/90 text-white hover:opacity-80">
                  Confirm
                </button>
                <button onClick={() => setConfirmDelete(false)} className="px-2.5 py-1 rounded-md text-[11px] border border-[--border-subtle] text-muted-foreground hover:bg-accent">
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="p-1.5 rounded-md text-muted-foreground/40 hover:text-[--error] hover:bg-[--error]/10 transition-colors">
                <Trash2 size={13} strokeWidth={1.8} />
              </button>
            )}
          </div>
        </div>

        {/* Party thread chips */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-[--border-subtle] flex-shrink-0 bg-muted/30 flex-wrap">
          {threads.map(ct => {
            const pc = partyColor(ct.party_type)
            const label = ct.party_label || (ct.thread?.contact ? contactName(ct.thread.contact) : ct.party_type)
            return (
              <span
                key={ct.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border"
                style={{ background: pc.bg, color: pc.text, borderColor: pc.border }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: pc.dot }} />
                {label}
                {/* Attachment extraction status indicator */}
                {ct.attachments_extracted > 0 && (
                  <span className="flex items-center gap-0.5 text-[9px] text-green-600 font-medium" title={`${ct.attachments_extracted} attachment(s) extracted`}>
                    <Paperclip size={8} strokeWidth={2} />
                    {ct.attachments_extracted}
                  </span>
                )}
                {ct.attachments_pending && ct.attachments_extracted === 0 && (
                  <span className="flex items-center gap-0.5 text-[9px] text-amber-500 font-medium" title="Attachments pending extraction">
                    <Paperclip size={8} strokeWidth={2} />
                    <Clock size={7} strokeWidth={2} />
                  </span>
                )}
                <button
                  onClick={() => unlinkThread(ct.thread_id)}
                  className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
                >
                  <X size={9} strokeWidth={2.5} />
                </button>
              </span>
            )
          })}
          <button
            onClick={() => setLinkOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border border-dashed border-muted-foreground/30 text-muted-foreground/60 hover:border-primary/40 hover:text-primary transition-colors"
          >
            <Link2 size={9} strokeWidth={2} />
            Link thread
          </button>
        </div>

        {/* Unified message timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {loading ? (
            <p className="text-[12px] text-muted-foreground text-center py-12">Loading…</p>
          ) : unifiedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Users size={28} strokeWidth={1.2} className="text-muted-foreground/30" />
              <p className="text-[12.5px] text-muted-foreground/50 text-center max-w-[280px]">
                Link email threads to this case to see the unified conversation timeline.
              </p>
              <button onClick={() => setLinkOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[12px] font-medium hover:bg-primary/15 transition-colors">
                <Link2 size={12} strokeWidth={2} /> Link first thread
              </button>
            </div>
          ) : (
            unifiedMessages.map(msg => (
              <TimelineMessageCard key={msg.id} msg={msg} />
            ))
          )}
        </div>
      </div>

      {/* ── Right: AI Analysis ── */}
      <div className="w-[360px] flex-shrink-0 flex flex-col overflow-hidden">
        {/* Analysis header + run button */}
        <div className="px-4 py-3 border-b border-[--border-subtle] flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground/60">
              AI Analysis
            </span>
            {analysis && (
              <span className="text-[9.5px] text-muted-foreground/50">{timeAgo(analysis.created_at)}</span>
            )}
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing || threads.length === 0}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[12px] font-semibold transition-all',
              analyzing
                ? 'bg-primary/10 text-primary cursor-not-allowed'
                : threads.length === 0
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-primary text-primary-foreground hover:opacity-90',
            )}
          >
            {analyzing ? (
              <><Loader2 size={13} className="animate-spin" /> Analysing all threads…</>
            ) : (
              <><Sparkles size={13} strokeWidth={2} /> {analysis ? 'Re-run Analysis' : 'Run Grand Analysis'}</>
            )}
          </button>
          {analyzeError && (
            <p className="text-[10.5px] text-[--error] mt-1.5 leading-relaxed">{analyzeError}</p>
          )}
          {threads.length === 0 && !analyzeError && (
            <p className="text-[10.5px] text-muted-foreground/50 mt-1.5 text-center">Link threads first</p>
          )}
          {analysis?.strategy_model && (
            <p className="text-[9.5px] text-muted-foreground/40 mt-1.5 text-center">
              Synthesis: Gemini 2.5 Pro · Strategy: {analysis.strategy_model.includes('claude') ? 'Claude Opus' : 'Gemini'}
            </p>
          )}
        </div>

        {/* Tabs */}
        {analysis && (
          <>
            <div className="flex border-b border-[--border-subtle] flex-shrink-0">
              {([
                { key: 'playbook',  label: 'Playbook',  icon: ArrowRight },
                { key: 'timeline',  label: 'Timeline',  icon: BookOpen },
                { key: 'status',    label: 'Status',    icon: AlertCircle },
                { key: 'legal',     label: 'Legal',     icon: Scale },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1 py-2 text-[10.5px] font-semibold transition-colors border-b-2',
                    activeTab === key
                      ? 'text-primary border-primary'
                      : 'text-muted-foreground/60 border-transparent hover:text-foreground',
                  )}
                >
                  <Icon size={10} strokeWidth={2} />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {activeTab === 'timeline'  && <TimelineTab  events={analysis.historical_timeline} />}
              {activeTab === 'status'    && <StatusTab    status={analysis.current_status} />}
              {activeTab === 'playbook'  && <PlaybookTab  steps={analysis.playbook} caseId={caseData.id} threads={threads} />}
              {activeTab === 'legal'     && <LegalTab     legal={analysis.legal_research} outreach={analysis.outreach_strategy} />}
            </div>
          </>
        )}

        {!analysis && !analyzing && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <Sparkles size={28} strokeWidth={1.2} className="text-muted-foreground/30" />
            <p className="text-[12px] text-muted-foreground/50 leading-relaxed">
              Run the grand analysis to get a unified timeline, current case status, strategic playbook, and AI-drafted emails for every party.
            </p>
          </div>
        )}
      </div>

      {/* ── Thread Linker Modal ── */}
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

// ── Timeline Tab ──────────────────────────────────────────────────────────────

function TimelineTab({ events }: { events: TimelineEvent[] }) {
  if (!events?.length) return (
    <p className="text-[11.5px] text-muted-foreground/50 italic text-center py-10">No timeline events yet.</p>
  )
  return (
    <div className="px-4 py-4 flex flex-col gap-3">
      {events.map((e, i) => {
        const pc = partyColor(e.party)
        return (
          <div key={i} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: pc.dot }} />
              {i < events.length - 1 && <div className="w-px flex-1 bg-[--border-subtle]/60 mt-1" />}
            </div>
            <div className="pb-3 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: pc.text }}>{e.party}</span>
                <span className="text-[9.5px] text-muted-foreground/50">{fmtDate(e.date)}</span>
              </div>
              <p className="text-[11.5px] text-foreground/80 leading-[1.55] mb-0.5">{e.event}</p>
              <p className="text-[10.5px] text-muted-foreground/60 italic leading-[1.45]">{e.significance}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Status Tab ────────────────────────────────────────────────────────────────

function StatusTab({ status }: { status: CaseAnalysis['current_status'] }) {
  if (!status) return (
    <p className="text-[11.5px] text-muted-foreground/50 italic text-center py-10">No status yet.</p>
  )
  return (
    <div className="px-4 py-4 flex flex-col gap-4">
      <div className="px-3 py-3 bg-primary/5 rounded-xl border border-primary/10">
        <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70 mb-1.5">Current Status</p>
        <p className="text-[12px] text-foreground/80 leading-[1.65]">{status.summary}</p>
      </div>

      {status.blocking_issues?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[--error]/70 mb-2">Blocking Issues</p>
          <div className="flex flex-col gap-1.5">
            {status.blocking_issues.map((issue, i) => (
              <div key={i} className="flex gap-2 px-2.5 py-2 bg-[--error]/5 rounded-lg border border-[--error]/10">
                <AlertCircle size={11} className="text-[--error] flex-shrink-0 mt-0.5" strokeWidth={2} />
                <p className="text-[11.5px] text-foreground/75 leading-[1.5]">{issue}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {status.pending_from && Object.entries(status.pending_from).filter(([, v]) => v).length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-2">Pending From</p>
          <div className="flex flex-col gap-1.5">
            {Object.entries(status.pending_from).filter(([, v]) => v).map(([party, item]) => {
              const pc = partyColor(party)
              return (
                <div key={party} className="flex gap-2 px-2.5 py-2 rounded-lg border" style={{ background: pc.bg, borderColor: pc.border }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider flex-shrink-0" style={{ color: pc.text }}>{party}</span>
                  <p className="text-[11.5px] text-foreground/70 leading-[1.5]">{item}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Playbook Tab ──────────────────────────────────────────────────────────────

function PlaybookTab({
  steps, caseId, threads,
}: { steps: PlaybookStep[]; caseId: string; threads: CaseThread[] }) {
  if (!steps?.length) return (
    <p className="text-[11.5px] text-muted-foreground/50 italic text-center py-10 px-4">
      No playbook steps — run the analysis to generate your action plan.
    </p>
  )

  return (
    <div className="px-3 py-4 flex flex-col gap-3">
      {steps.map(step => (
        <PlaybookStepCard key={step.step} step={step} threads={threads} />
      ))}
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
        <p className="text-[10.5px] text-muted-foreground/55 italic leading-[1.45]">{step.reasoning}</p>

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

      // Step 1 — create ai_drafts record (original AI draft, before any edits)
      //          This is what the eval engine compares against what was actually sent.
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

      // Step 2 — send via the shared route (fires eval automatically on success)
      const res = await fetch('/api/email/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId:        draftData.draftId,
          htmlBody:       bodyHtml,
          originalAiBody: step.draft,   // eval captures diff: AI draft vs what was sent
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

// ── Legal + Outreach Tab ──────────────────────────────────────────────────────

function LegalTab({
  legal, outreach,
}: { legal: CaseAnalysis['legal_research']; outreach: CaseAnalysis['outreach_strategy'] }) {
  return (
    <div className="px-4 py-4 flex flex-col gap-5">
      {/* Outreach strategy */}
      {outreach && Object.keys(outreach).length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-2">Outreach Strategy</p>
          <div className="flex flex-col gap-2">
            {Object.entries(outreach).map(([party, info]) => {
              const pc = partyColor(party)
              return (
                <div key={party} className="px-3 py-2.5 rounded-lg border" style={{ background: pc.bg, borderColor: pc.border }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: pc.text }}>{party}</p>
                  <p className="text-[11px] font-semibold text-foreground/80 mb-0.5">Tone: {info.tone}</p>
                  <p className="text-[11px] text-foreground/70 mb-0.5 leading-[1.5]">{info.key_message}</p>
                  <p className="text-[10.5px] text-muted-foreground/55 italic">{info.timing}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Legal research */}
      {legal ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-2">Singapore Legal Research</p>
          <div className="flex flex-col gap-2.5">
            <div className="px-3 py-2.5 bg-card rounded-lg border border-[--border-subtle]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1">Relevance</p>
              <p className="text-[11.5px] text-foreground/75 leading-[1.6]">{legal.singapore_relevance}</p>
            </div>

            {legal.applicable_regulations?.length > 0 && (
              <div className="px-3 py-2.5 bg-card rounded-lg border border-[--border-subtle]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1.5">Applicable Regulations</p>
                <ul className="flex flex-col gap-1">
                  {legal.applicable_regulations.map((r, i) => (
                    <li key={i} className="text-[11.5px] text-foreground/75 leading-[1.5] flex gap-1.5">
                      <span className="text-muted-foreground/40 flex-shrink-0">•</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {legal.precedents_or_guidance?.length > 0 && (
              <div className="px-3 py-2.5 bg-card rounded-lg border border-[--border-subtle]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1.5">Precedents & Guidance</p>
                <ul className="flex flex-col gap-1">
                  {legal.precedents_or_guidance.map((p, i) => (
                    <li key={i} className="text-[11.5px] text-foreground/75 leading-[1.5] flex gap-1.5">
                      <span className="text-muted-foreground/40 flex-shrink-0">•</span>{p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {legal.sources?.length > 0 && (
              <p className="text-[10px] text-muted-foreground/45 leading-[1.5]">
                Sources: {legal.sources.join(' · ')}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="px-3 py-3 rounded-lg border border-dashed border-[--border-subtle] text-center">
          <p className="text-[11.5px] text-muted-foreground/50 italic">
            Add <code className="text-[10.5px] bg-muted px-1 py-0.5 rounded">ANTHROPIC_API_KEY</code> to unlock full Singapore legal research via Claude Opus.
          </p>
        </div>
      )}
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
      // Auto-suggest party types for all threads
      const types: Record<string, string> = {}
      ;[...suggestions, ...allT].forEach((t: ThreadSuggestion) => {
        types[t.id] = autoSuggestParty(t.contact)
      })
      setPartyTypes(types)
      // Pre-select AI suggestions that aren't already linked
      const preSelected = new Set(suggestions.filter((t: ThreadSuggestion) => !linkedThreadIds.includes(t.id)).map((t: ThreadSuggestion) => t.id))
      setSelected(preSelected)
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
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[--border-subtle] flex-shrink-0 bg-muted/30">
          <div className="flex items-center gap-2 flex-1 px-3 py-1.5 bg-background rounded-lg border border-[--border-subtle]">
            <Search size={12} className="text-muted-foreground/50 flex-shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by subject, contact name, or company…"
              autoFocus
              className="flex-1 text-[12px] bg-transparent outline-none placeholder:text-muted-foreground/40"
            />
          </div>
          <button
            onClick={linkSelected}
            disabled={addCount === 0 || linking}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity flex-shrink-0 whitespace-nowrap"
          >
            {linking ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} strokeWidth={2} />}
            {addCount > 0 ? `Add ${addCount} thread${addCount > 1 ? 's' : ''} to Case` : 'Select threads'}
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
                    <tr className="bg-primary/5">
                      <td colSpan={5} className="px-3 py-1.5">
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-primary/70 flex items-center gap-1.5">
                          <Sparkles size={9} strokeWidth={2} /> AI Suggestions
                        </span>
                      </td>
                    </tr>
                    {suggestedRows.map(t => <ThreadTableRow key={t.id} thread={t} isSuggested />)}
                    <tr className="bg-muted/30">
                      <td colSpan={5} className="px-3 py-1.5">
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/50">All Recent Threads</span>
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
        <div className="flex items-center justify-between px-5 py-3 border-t border-[--border-subtle] bg-muted/20 flex-shrink-0">
          <p className="text-[10.5px] text-muted-foreground/60">
            {addCount > 0 ? `${addCount} thread${addCount > 1 ? 's' : ''} selected` : 'Click rows to select · Auto-selects AI suggestions'}
          </p>
          <button onClick={onClose} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
      </div>
    </div>
  )
}
