'use client'

import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react'
import {
  ChevronDown, X, Search, Send, Loader2, Pin, PinOff, Minus, Maximize2, Minimize2, Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn, Chip, Field, inputCls, textareaCls, Segmented, Spinner } from '@/components/crm/primitives'
import { RichEditor, plainToHtml } from '@/components/RichEditor'
import { NexusPhasedAnalysisModal } from '@/components/nexus/NexusPhasedAnalysisModal'
import { ActivityFeed, LastHandledBy } from '@/components/ActivityFeed'
import { logClient } from '@/lib/log-client'
import { relTime } from '@/lib/activity-labels'
import { createClient } from '@/lib/supabase/client'
import { usePolledRefresh } from '@/hooks/usePolledRefresh'

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
  id?:         string
  thread_id:   string
  filename:    string
  mime_type:   string | null
  size_bytes?: number | null
  storage_url: string | null
  parsed_at:   string | null
  created_at?: string | null
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
type V1Citation    = { id: string; label: string; type: string; date?: string; excerpt?: string; message_id?: string; attachment_id?: string; thread_id?: string }
type V1Stakeholder = { id: string; name: string; party_type: string; email?: string; company?: string; role_summary: string; stance?: string; thread_id?: string; contact_id?: string }
type V1TimelineEvt = { date: string; party: string; event: string; significance: string; citation_ids?: string[]; stakeholder_id?: string; date_verified?: boolean; date_excerpt?: string }
type V1Evidence    = { id: string; filename_or_label: string; source_type: string; key_facts: string[]; coverage_relevant: boolean; citation_id?: string; message_id?: string; attachment_id?: string }
type V1Question    = { question: string; priority: string; directed_at?: string; citation_ids?: string[]; stakeholder_id?: string }
type V1Missing     = { item: string; required_from: string; urgency: string; impact: string; stakeholder_id?: string }
type V1Scenario    = { name: string; probability: string; outcome: string; trs_action: string; assumptions?: string[]; trigger_conditions?: string[]; strategic_implication?: string; citation_ids?: string[] }
type V1NextStep    = { step: number; action: string; owner: string; deadline?: string; priority: string; rationale: string; citation_ids?: string[]; depends_on?: number[]; party_type?: string; to_emails?: string[]; stakeholder_id?: string; contact_id?: string; thread_id?: string }
type V1Draft       = { artifact_type: string; to_party: string; party_type: string; to_emails: string[]; cc_emails: string[]; subject: string; body: string; intent: string; priority: string; citation_ids?: string[]; stakeholder_id?: string; thread_id?: string }
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
  case_brief:             { summary: string; incident_date?: string; claim_amount?: string; policy_reference?: string; coverage_type?: string; current_stage: string; blocking_issues: string[]; pending_from: Record<string, string>; pending?: { stakeholder_id: string; item: string }[] }
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

// Design tokens (Home system). State is never colour-coded; a party is a category and may
// carry one soft field. Every chip is the same neutral fill with ink text.
const INK   = '#202124'
const BODY  = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const DOT   = '#9aa0a6'
const HAIR  = '#e8eaed'
const CTRL  = '#dadce0'
const FIELD = '#f1f3f4'
const HOVER = '#f8f9fa'
const NAVY  = '#0C338A' // email compose surfaces only

const PARTY_FIELD: Record<string, string> = {
  client:       '#EAF2FF',
  insurer:      '#F1EEFF',
  lawyer:       '#FFF6D8',
  regulator:    '#F5F5F3',
  counterparty: '#FFF0E7',
  trs:          '#EAF6EC',
  other:        '#F5F5F3',
}
const partyField = (p: string) => PARTY_FIELD[(p ?? '').toLowerCase()] ?? PARTY_FIELD.other

const PRIORITY_LABEL: Record<string, string> = { URGENT: 'Urgent', HIGH: 'High', THIS_WEEK: 'This week', LATER: 'Later' }
const priorityLabel = (p: string) => PRIORITY_LABEL[p] ?? 'Later'

/** A neutral list row: grey dot, ink text. Used for blocking items, questions, prerequisites. */
function DotRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <li className={cn('flex items-start gap-2.5 text-[14px] leading-[1.55] list-none', className)} style={{ color: BODY }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-[8px]" style={{ background: DOT }} aria-hidden />
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  )
}

/** A party chip: the category's soft field, ink text. Category, not state. */
function PartyChip({ party, className }: { party: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap leading-4', className)} style={{ background: partyField(party), color: BODY }}>
      {partyLabel(party)}
    </span>
  )
}

/** A chip that sits on a grey field: white fill, ink text. */
function WhiteChip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-[6px] bg-white px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap leading-4" style={{ color: BODY }}>{children}</span>
}

/** A small muted label above a group of rows (13px, sentence case). */
function GroupLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('m-0 text-[12.5px] font-medium', className)} style={{ color: MUTED }}>{children}</p>
}

const ghostBtn = 'inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer text-[13px] underline-offset-4 hover:underline disabled:opacity-40 disabled:cursor-default'

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

// ── Compose state ─────────────────────────────────────────────────────────────

type ComposeState = {
  draftId:  string
  to:       string
  cc:       string
  subject:  string
  body:     string
  threadId: string | null
}

// ── Analysis progress ──────────────────────────────────────────────────────────

const ANALYSIS_STAGES = [
  { model: null,             label: 'Fetching threads and messages',              from: 0,  to: 5,  duration: 2500  },
  { model: 'Gemini Flash',   label: 'Reading every attachment (re-scanning any unread)', from: 5,  to: 22, duration: 14000 },
  { model: 'Gemini Flash',   label: 'Extracting the evidence from every thread',  from: 22, to: 52, duration: 26000 },
  { model: 'Claude Opus',    label: 'Building a date-verified timeline',         from: 52, to: 70, duration: 16000 },
  { model: 'Claude Opus',    label: 'Judging the case — scenarios and next steps', from: 70, to: 88, duration: 18000 },
  { model: 'Gemini Flash',   label: 'Writing the recommended emails',            from: 88, to: 96, duration: 7000  },
  { model: null,             label: 'Saving and refreshing Mission control',     from: 96, to: 99, duration: 2500  },
] as const

type AnalysisProgress = { pct: number; stageIdx: number }

function getAnalysisProgress(elapsed: number): AnalysisProgress {
  let remaining = elapsed
  for (let i = 0; i < ANALYSIS_STAGES.length; i++) {
    const stage = ANALYSIS_STAGES[i]
    if (remaining <= stage.duration || i === ANALYSIS_STAGES.length - 1) {
      const t   = Math.min(remaining / stage.duration, 1)
      const pct = Math.round(stage.from + (stage.to - stage.from) * t)
      return { pct, stageIdx: i }
    }
    remaining -= stage.duration
  }
  return { pct: 99, stageIdx: ANALYSIS_STAGES.length - 1 }
}

// ── Nexus Page ────────────────────────────────────────────────────────────────

export default function NexusPage() {
  const [cases,         setCases]         = useState<Case[]>([])
  const [loading,       setLoading]       = useState(true)
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [search,        setSearch]        = useState('')
  const [createOpen,    setCreateOpen]    = useState(false)
  const [prefillCompany, setPrefillCompany] = useState<{ id: string; name: string } | null>(null)

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

  // Deep-link: /nexus?case=<id> selects
  // that case. Runs before the default first-case selection can claim it.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('case')
    if (id) setSelectedId(id)
  }, [])

  // Deep-link: /nexus?newCase=1&companyId=<id> (the company page's "+ New case" action) opens
  // the create modal pre-filled with that company, skipping the typeahead below.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const companyId = params.get('newCase') === '1' ? params.get('companyId') : null
    if (!companyId) return
    fetch(`/api/companies/${companyId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.company) { setPrefillCompany({ id: d.company.id, name: d.company.name }); setCreateOpen(true) } })
  }, [])

  // Keep ?case= in sync + broadcast the active case so the per-case Ask Opus dock
  // binds to it (and hides on the case list, where there is no active case).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (selectedId) url.searchParams.set('case', selectedId)
    else url.searchParams.delete('case')
    window.history.replaceState(null, '', url.toString())
    window.dispatchEvent(new CustomEvent('nexus:active-case', { detail: { caseId: selectedId } }))
  }, [selectedId])

  const visible = cases.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.description ?? '').toLowerCase().includes(search.toLowerCase())
  )

  async function handleCreate(name: string, description: string, companyId: string | null, companyName: string | null) {
    const res = await fetch('/api/nexus/cases', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, description, companyId: companyId ?? undefined, companyName: companyName ?? undefined }),
    })
    const newCase = await res.json()
    if (newCase?.id) {
      setCases(prev => [{ ...newCase, thread_count: 0, last_activity: null }, ...prev])
      setSelectedId(newCase.id)
      setCreateOpen(false)
      setPrefillCompany(null)
    }
  }

  async function handleDeleteCase(id: string) {
    await fetch(`/api/nexus/cases/${id}`, { method: 'DELETE' })
    setCases(prev => prev.filter(c => c.id !== id))
    if (selectedId === id) setSelectedId(cases.find(c => c.id !== id)?.id ?? null)
  }

  const selectedCase = cases.find(c => c.id === selectedId) ?? null

  return (
    <div className="flex flex-col overflow-hidden bg-white h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))]" style={{ color: INK }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 px-6 h-[68px] flex-shrink-0 bg-white" style={{ borderBottom: `1px solid ${HAIR}` }}>
        <h1 className="m-0 text-[28px] font-medium tracking-[-0.03em] leading-none" style={{ color: INK }}>Nexus</h1>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="h-10 px-4 rounded-[10px] text-white text-[14px] font-medium border-0 cursor-pointer whitespace-nowrap hover:opacity-90"
          style={{ background: INK }}
        >
          New case
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Case List ── */}
        {/* Under 768px the list and the detail stack: the list shows until a case is picked, the detail carries a back link. */}
        <aside className={cn('w-full md:w-[280px] flex-shrink-0 flex-col overflow-hidden bg-white', selectedCase ? 'hidden md:flex' : 'flex')} style={{ borderRight: `1px solid ${HAIR}` }}>
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${HAIR}` }}>
            <label className="relative block">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: FAINT }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search cases"
                aria-label="Search cases"
                className={cn(inputCls, 'pl-9')}
              />
            </label>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-3 flex flex-col gap-3" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-2 py-2">
                    <span className="h-3.5 w-40 rounded animate-pulse" style={{ background: FIELD }} />
                    <span className="h-3 w-24 rounded animate-pulse" style={{ background: FIELD }} />
                  </div>
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <p className="m-0 text-[15px]" style={{ color: MUTED }}>{search ? 'No cases match.' : 'No cases yet.'}</p>
                {!search && (
                  <button type="button" onClick={() => setCreateOpen(true)} className={cn(ghostBtn, 'mt-3')} style={{ color: INK }}>
                    Create the first case
                  </button>
                )}
              </div>
            ) : (
              <div className="py-1">
                {visible.map(c => {
                  const on = selectedId === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-current={on ? 'true' : undefined}
                      onClick={() => setSelectedId(c.id)}
                      className={cn('w-full text-left px-4 py-3 flex flex-col gap-1 border-0 cursor-pointer transition-colors', on ? '' : 'hover:bg-[#f8f9fa]')}
                      style={{ background: on ? FIELD : 'transparent' }}
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="text-[14px] font-medium truncate flex-1" style={{ color: INK }}>{c.name}</span>
                        <Chip>{c.status === 'open' ? 'Open' : c.status === 'closed' ? 'Closed' : c.status}</Chip>
                      </div>
                      <div className="text-[12.5px] truncate" style={{ color: MUTED }}>
                        {c.thread_count} thread{c.thread_count !== 1 ? 's' : ''}
                        {c.last_activity && <> · {timeAgo(c.last_activity)}</>}
                        {c.description && <> · {c.description}</>}
                      </div>
                    </button>
                  )
                })}
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
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-[15px] px-6 text-center" style={{ color: MUTED }}>
            {loading ? 'Loading…' : 'Select a case, or create one.'}
          </div>
        )}
      </div>

      {/* ── Create case modal ── */}
      {createOpen && (
        <CreateCaseModal
          onCreate={handleCreate}
          onClose={() => { setCreateOpen(false); setPrefillCompany(null) }}
          prefillCompany={prefillCompany}
        />
      )}
    </div>
  )
}

// ── Create Case Modal ─────────────────────────────────────────────────────────

function CreateCaseModal({ onCreate, onClose, prefillCompany }: {
  onCreate: (name: string, desc: string, companyId: string | null, companyName: string | null) => Promise<void>
  onClose: () => void
  prefillCompany: { id: string; name: string } | null
}) {
  const [name, setName]   = useState('')
  const [desc, setDesc]   = useState('')
  const [saving, setSaving] = useState(false)

  // Company — required. Pre-filled (and locked) when opened from a company page's "+ New case";
  // otherwise a debounced typeahead over the same /api/companies?search= LinkCompanyPopover uses,
  // resolved server-side (find-or-create by name) so typing a brand-new name still works.
  const [companyQuery, setCompanyQuery]     = useState('')
  const [companyResults, setCompanyResults] = useState<{ id: string; name: string }[]>([])
  const [companySearching, setCompanySearching] = useState(false)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [companyPickerOpen, setCompanyPickerOpen]  = useState(false)

  useEffect(() => {
    if (prefillCompany || !companyPickerOpen) return
    setCompanySearching(true)
    const t = setTimeout(() => {
      fetch(`/api/companies?search=${encodeURIComponent(companyQuery.trim())}`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : [])
        .then((rows: { id: string; name: string }[]) => setCompanyResults(Array.isArray(rows) ? rows : []))
        .finally(() => setCompanySearching(false))
    }, 200)
    return () => clearTimeout(t)
  }, [companyQuery, companyPickerOpen, prefillCompany])

  const companyValid = !!prefillCompany || !!selectedCompanyId || companyQuery.trim().length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !companyValid) return
    setSaving(true)
    try {
      const companyId   = prefillCompany?.id ?? selectedCompanyId
      const companyName = prefillCompany ? null : (selectedCompanyId ? null : companyQuery.trim())
      await onCreate(name.trim(), desc.trim(), companyId, companyName)
    }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(32,33,36,0.4)' }} onClick={onClose}>
      <form
        onSubmit={submit}
        className="bg-white rounded-[16px] w-full max-w-[440px] p-6 flex flex-col gap-4"
        style={{ boxShadow: 'var(--shadow-modal)', color: INK }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-[20px] font-medium tracking-[-0.02em]" style={{ color: INK }}>New case</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}>
            <X size={15} />
          </button>
        </div>
        <Field label="Case name">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. FlyORO cargo damage claim, Jun 2026"
            className={inputCls}
          />
        </Field>
        <Field label="Company">
          {prefillCompany ? (
            <div className="w-full h-10 rounded-[10px] px-3.5 text-[14px] flex items-center" style={{ background: FIELD, color: INK }}>
              {prefillCompany.name}
            </div>
          ) : (
            <div className="relative">
              <input
                value={companyQuery}
                onChange={e => { setCompanyQuery(e.target.value); setSelectedCompanyId(null) }}
                onFocus={() => setCompanyPickerOpen(true)}
                onBlur={() => setTimeout(() => setCompanyPickerOpen(false), 150)}
                placeholder="Search, or type a new company name"
                className={inputCls}
              />
              {companyPickerOpen && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white rounded-[12px] max-h-44 overflow-y-auto" style={{ border: `1px solid ${HAIR}`, boxShadow: '0 8px 24px rgba(32,33,36,0.08)' }}>
                  {companySearching && <div className="px-3.5 py-2.5 text-[13px] flex items-center gap-1.5" style={{ color: MUTED }}><Loader2 size={12} className="animate-spin" /> Searching…</div>}
                  {!companySearching && companyResults.length === 0 && (
                    <div className="px-3.5 py-2.5 text-[13px]" style={{ color: MUTED }}>
                      {companyQuery.trim() ? `No match. “${companyQuery.trim()}” will be created as a new company.` : 'Type to search companies.'}
                    </div>
                  )}
                  {!companySearching && companyResults.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setSelectedCompanyId(c.id); setCompanyQuery(c.name); setCompanyPickerOpen(false) }}
                      className="w-full text-left px-3.5 py-2.5 text-[14px] bg-transparent border-0 cursor-pointer hover:bg-[#f8f9fa]"
                      style={{ color: INK }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Field>
        <Field label="Description" hint="Optional.">
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="One line on what the case is about"
            rows={3}
            className={textareaCls}
          />
        </Field>
        <div className="flex gap-2 justify-end pt-1">
          <Btn type="button" level="secondary" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" level="primary" disabled={!name.trim() || !companyValid} loading={saving}>
            {saving ? 'Creating…' : 'Create case'}
          </Btn>
        </div>
      </form>
    </div>
  )
}

// ── Case Detail Panel (Mission Control shell) ─────────────────────────────────

function CaseDetailPanel({
  caseData, onRefresh, onDelete, onBack,
}: { caseData: Case; onRefresh: () => void; onDelete: () => void; onBack: () => void }) {
  const [detail,        setDetail]        = useState<{ threads: CaseThread[]; analysis: CaseAnalysis | null } | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [analyzing,     setAnalyzing]     = useState(false)
  const [analyzeError,  setAnalyzeError]  = useState<string | null>(null)
  const [view,          setView]          = useState<'mission' | 'messages' | 'logs' | 'history'>('mission')
  const [linkOpen,      setLinkOpen]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingTitle,  setEditingTitle]  = useState(false)
  const [titleValue,    setTitleValue]    = useState(caseData.name)
  const [runs,          setRuns]          = useState<RunSummary[]>([])
  const [runsLoading,   setRunsLoading]   = useState(false)
  const [userEmail,     setUserEmail]     = useState<string | null>(null)
  const [analyzeProgress, setAnalyzeProgress] = useState<AnalysisProgress | null>(null)
  const analyzeStartRef   = useRef<number | null>(null)
  const [composeState,  setComposeState]  = useState<ComposeState | null>(null)
  const [phasedModalOpen,       setPhasedModalOpen]       = useState(false)
  const [phasedModalThreadIds,  setPhasedModalThreadIds]  = useState<string[] | null>(null)

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

  // Record who opened this case (feeds "last handled by" + the activity feed).
  useEffect(() => { logClient('nexus.case_viewed', { resource_type: 'case', resource_id: caseData.id }) }, [caseData.id])

  // Keep a stable ref to load() so polling effects can call it without stale closure
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load }, [load])

  // Re-fetch when the AI consultant chat edits/re-runs this case's analysis, and
  // show the same progress banner while a chat-triggered re-analysis is running.
  useEffect(() => {
    function onStarted(e: Event) {
      const detail = (e as CustomEvent<{ caseId?: string }>).detail
      if (detail?.caseId && detail.caseId !== caseData.id) return
      analyzeStartRef.current = Date.now()
      localStorage.setItem(LS_KEY, Date.now().toString())
      setAnalyzing(true)
    }
    function onUpdated(e: Event) {
      const detail = (e as CustomEvent<{ caseId?: string }>).detail
      if (!detail?.caseId || detail.caseId === caseData.id) {
        setAnalyzing(false); localStorage.removeItem(LS_KEY); loadRef.current()
      }
    }
    window.addEventListener('nexus:analysis-started', onStarted)
    window.addEventListener('nexus:analysis-updated', onUpdated)
    return () => {
      window.removeEventListener('nexus:analysis-started', onStarted)
      window.removeEventListener('nexus:analysis-updated', onUpdated)
    }
  }, [caseData.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live "new evidence" detection: an inbound reply landing on any linked thread
  // after the last analysis makes the case stale (→ Update-now bell in the header).
  const threadKey = (detail?.threads ?? []).map(t => t.thread_id).join(',')
  // Was a realtime subscription on Supabase. Cloud SQL cannot push, so this polls instead.
  // Reloading the case detail is what the subscription did anyway; the only change is that a
  // new reply shows within the interval rather than instantly.
  usePolledRefresh(() => { loadRef.current() }, {
    enabled:    threadKey.length > 0,
    intervalMs: 30000,
    deps:       [caseData.id, threadKey],
  })

  const LS_KEY = `nexus_analyzing_${caseData.id}`

  useEffect(() => {
    setDetail(null)
    setAnalyzeError(null)
    setView('mission')
    load()
  }, [caseData.id, load])

  // Resume in-progress analysis after navigation away: if localStorage shows an
  // analysis was started for this case within the last 5 minutes, show the
  // spinner and poll runs until a completed/failed row appears.
  useEffect(() => {
    const startedAt = Number(localStorage.getItem(LS_KEY) ?? '0')
    if (!startedAt || Date.now() - startedAt >= 5 * 60 * 1000) return

    analyzeStartRef.current = startedAt
    setAnalyzing(true)
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/nexus/cases/${caseData.id}/runs`, { cache: 'no-store' })
        if (!res.ok) return
        const runs: RunSummary[] = await res.json()
        if (!Array.isArray(runs) || runs.length === 0) return
        const latest = runs[0]
        if (new Date(latest.created_at).getTime() > startedAt) {
          clearInterval(poll)
          localStorage.removeItem(LS_KEY)
          setAnalyzing(false)
          loadRef.current()
        }
      } catch { /* ignore transient poll errors */ }
    }, 3000)

    return () => {
      clearInterval(poll)
      setAnalyzing(false)
    }
  }, [caseData.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tick progress every 200 ms while analysis is running
  useEffect(() => {
    if (!analyzing) { setAnalyzeProgress(null); return }
    const tick = setInterval(() => {
      const start = analyzeStartRef.current ?? Date.now()
      setAnalyzeProgress(getAnalysisProgress(Date.now() - start))
    }, 200)
    return () => clearInterval(tick)
  }, [analyzing])

  async function renameCase() {
    const name = titleValue.trim()
    setEditingTitle(false)
    if (!name || name === caseData.name) { setTitleValue(caseData.name); return }
    await fetch(`/api/nexus/cases/${caseData.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).catch(() => {})
    onRefresh()
  }

  // Opens the phased analysis modal (3 short requests instead of one long one — see
  // NexusPhasedAnalysisModal) rather than firing the single long-running request directly.
  function runAnalysis(threadIds?: string[]) {
    setPhasedModalThreadIds(threadIds && threadIds.length > 0 ? threadIds : null)
    setPhasedModalOpen(true)
  }

  function onPhasedAnalysisComplete() {
    setPhasedModalOpen(false)
    setView('mission')
    load()
    onRefresh()
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

  function openCompose(state: ComposeState) { setComposeState(state) }

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

  // Inbound replies that landed after the last analysis → the case is stale.
  const newReplyCount = useMemo(() => {
    const at = analysis?.created_at
    if (!at) return 0
    const cut = new Date(at).getTime()
    return threads.reduce((n, ct) => n + ct.messages.filter(m => m.direction === 'inbound' && m.sent_at && new Date(m.sent_at).getTime() > cut).length, 0)
  }, [threads, analysis?.created_at])

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-w-0">
      <MissionHeader
        caseData={caseData}
        onBack={onBack}
        newReplyCount={newReplyCount}
        threads={threads}
        analysis={analysis}
        analyzing={analyzing}
        analyzeProgress={analyzeProgress}
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
        editingTitle={editingTitle}
        titleValue={titleValue}
        onTitleChange={setTitleValue}
        onStartEditTitle={() => { setTitleValue(caseData.name); setEditingTitle(true) }}
        onSaveTitle={renameCase}
        onCancelTitle={() => setEditingTitle(false)}
      />
      <div className="flex-1 overflow-y-auto bg-white">
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
            analyzeProgress={analyzeProgress}
            attachmentRecords={allAttachmentRecords}
            currentRun={currentRun}
            previousRun={previousRun}
            onLinkThreads={() => setLinkOpen(true)}
            onUnlink={unlinkThread}
            onUpdatePartyType={updatePartyType}
            onRunAnalysis={runAnalysis}
            onOpenCompose={openCompose}
          />
        ) : view === 'messages' ? (
          <MessagesView
            messages={unifiedMessages}
            loading={loading}
            onGoToMission={() => setView('mission')}
          />
        ) : (
          <LogsView
            analysis={analysis}
            threads={threads}
            attachmentRecords={allAttachmentRecords}
            onLinkThreads={() => setLinkOpen(true)}
            onUnlink={unlinkThread}
            onUpdatePartyType={updatePartyType}
            onGoToMission={() => setView('mission')}
            onRunAnalysis={runAnalysis}
            analyzing={analyzing}
          />
        )}
      </div>
      {composeState && (
        <NexusComposeWindow
          state={composeState}
          onClose={() => setComposeState(null)}
        />
      )}
      {linkOpen && (
        <ThreadLinkerModal
          caseId={caseData.id}
          linkedThreadIds={threads.map(ct => ct.thread_id)}
          linkedThreads={threads}
          onLink={() => { load(); onRefresh() }}
          onClose={() => setLinkOpen(false)}
        />
      )}
      {phasedModalOpen && (
        <NexusPhasedAnalysisModal
          caseId={caseData.id}
          userEmail={userEmail}
          initialThreadIds={phasedModalThreadIds}
          onClose={() => setPhasedModalOpen(false)}
          onComplete={onPhasedAnalysisComplete}
        />
      )}
    </div>
  )
}

// ── Mission Header ────────────────────────────────────────────────────────────

function MissionHeader({
  caseData, onBack, threads, analysis, newReplyCount, analyzing, analyzeProgress, analyzeError, confirmDelete, view, totalMsgCount, runsCount,
  onSetView, onRunAnalysis, onLinkThreads, onDelete, onConfirmDelete, onCancelDelete,
  editingTitle, titleValue, onTitleChange, onStartEditTitle, onSaveTitle, onCancelTitle,
}: {
  caseData:        Case
  onBack:          () => void
  threads:         CaseThread[]
  analysis:        CaseAnalysis | null
  newReplyCount:   number
  analyzing:       boolean
  analyzeProgress: AnalysisProgress | null
  analyzeError:    string | null
  confirmDelete:   boolean
  view:            'mission' | 'messages' | 'logs' | 'history'
  totalMsgCount:   number
  runsCount:       number
  onSetView:       (v: 'mission' | 'messages' | 'logs' | 'history') => void
  onRunAnalysis:   () => void
  onLinkThreads:   () => void
  editingTitle:    boolean
  titleValue:      string
  onTitleChange:   (v: string) => void
  onStartEditTitle:() => void
  onSaveTitle:     () => void
  onCancelTitle:   () => void
  onDelete:        () => void
  onConfirmDelete: () => void
  onCancelDelete:  () => void
}) {
  const attCount   = threads.flatMap(ct => ct.attachment_records ?? []).filter(a => a.parsed_at !== null).length
  const modelLabel = analysis?.strategy_model?.includes('claude') ? 'Claude + Gemini' : analysis?.strategy_model ? 'Gemini' : null

  const metaLine = [
    `${threads.length} thread${threads.length !== 1 ? 's' : ''}`,
    attCount > 0 ? `${attCount} attachment${attCount !== 1 ? 's' : ''}` : null,
    analysis ? `Analysed ${timeAgo(analysis.created_at)}` : null,
    modelLabel,
  ].filter(Boolean).join(' · ')

  const tabs = [
    { key: 'mission',  label: 'Mission control', count: 0 },
    { key: 'messages', label: 'Messages', count: totalMsgCount },
    { key: 'logs',     label: 'Logs', count: 0 },
    { key: 'history',  label: 'History', count: runsCount },
  ] as { key: 'mission' | 'messages' | 'logs' | 'history'; label: string; count: number }[]

  return (
    <div className="relative flex-shrink-0 bg-white" style={{ borderBottom: `1px solid ${HAIR}` }}>
      {analyzing && analyzeProgress && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden z-10" style={{ background: HAIR }}>
          <div className="h-full transition-[width] duration-300 ease-linear" style={{ width: `${analyzeProgress.pct}%`, background: INK }} />
        </div>
      )}
      {/* Top row: name + actions */}
      <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onBack} className={cn(ghostBtn, 'md:hidden mb-2 text-[14px]')} style={{ color: MUTED }}>← Cases</button>
          <div className="flex items-center gap-2.5 min-w-0">
            {editingTitle ? (
              <input
                value={titleValue}
                onChange={e => onTitleChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onSaveTitle(); if (e.key === 'Escape') onCancelTitle() }}
                onBlur={onSaveTitle}
                autoFocus
                aria-label="Case name"
                className={cn(inputCls, 'text-[20px] font-medium h-11 max-w-[520px]')}
              />
            ) : (
              <>
                <h2 className="m-0 text-[20px] font-medium tracking-[-0.02em] truncate" style={{ color: INK }}>{caseData.name}</h2>
                <button type="button" onClick={onStartEditTitle} title="Rename case" aria-label="Rename case"
                  className="flex-shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: FAINT }}>
                  <Pencil size={13} strokeWidth={2} />
                </button>
              </>
            )}
            <Chip>{caseData.status === 'open' ? 'Open' : caseData.status === 'closed' ? 'Closed' : caseData.status}</Chip>
          </div>
          {caseData.description && (
            <p className="m-0 mt-1 text-[13px] truncate" style={{ color: MUTED }}>{caseData.description}</p>
          )}
          <LastHandledBy resourceId={caseData.id} className="block mt-1 text-[12.5px] truncate" />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {confirmDelete ? (
            <>
              <span className="text-[13px] mr-1" style={{ color: MUTED }}>Delete this case?</span>
              <Btn level="secondary" onClick={onDelete} style={{ color: '#c5221f' }}>Delete</Btn>
              <Btn level="secondary" onClick={onCancelDelete}>Cancel</Btn>
            </>
          ) : (
            <>
              {/* New inbound replies since the last analysis → the case is stale. */}
              {analysis && !analyzing && newReplyCount > 0 && (
                <Btn level="secondary" onClick={onRunAnalysis} title="New replies since the last analysis. Re-analyse to include them.">
                  Re-analyse · {newReplyCount} new {newReplyCount === 1 ? 'reply' : 'replies'}
                </Btn>
              )}
              <Btn level="secondary" onClick={onLinkThreads}>Link threads</Btn>
              {/* First analysis only — re-analysis is otherwise steered via the AI consultant chat. */}
              {(!analysis || analyzing) && (
                <Btn level="secondary" onClick={onRunAnalysis} disabled={analyzing || threads.length === 0} loading={analyzing}>
                  {analyzing ? (analyzeProgress ? `${analyzeProgress.pct}%` : 'Analysing…') : 'Run analysis'}
                </Btn>
              )}
              <Btn level="tertiary" onClick={onConfirmDelete} style={{ color: MUTED }}>Delete</Btn>
            </>
          )}
        </div>
      </div>

      {/* Timeout notice — a plain row, no tint. */}
      {analyzeError === '__TIMEOUT__' && (
        <p className="m-0 px-6 pb-3 text-[13px] leading-[1.5]" style={{ color: BODY }}>
          Analysis timed out. This case has too many threads or attachments for the 60-second function limit. Unlink some threads and re-run, or move to a 300-second limit on Vercel Pro.
        </p>
      )}

      {/* View tabs + meta row */}
      <div className="flex items-end justify-between gap-4 px-6 flex-wrap">
        <div className="flex items-center gap-6" role="tablist" aria-label="Case views">
          {tabs.map(({ key, label, count }) => {
            const on = view === key
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onSetView(key)}
                className={cn('relative pb-2.5 bg-transparent border-0 cursor-pointer text-[15px] whitespace-nowrap', on ? 'font-medium' : 'hover:text-[#202124]')}
                style={{ color: on ? INK : MUTED }}
              >
                {label}
                {count > 0 && <span className="ml-1.5 tabular-nums text-[13px]" style={{ color: FAINT }}>{count}</span>}
                <span className={cn('absolute left-0 right-0 bottom-0 h-[2px] rounded-full', on ? 'block' : 'hidden')} style={{ background: INK }} aria-hidden />
              </button>
            )
          })}
        </div>
        <p className="m-0 pb-2.5 text-[13px] whitespace-nowrap" style={{ color: MUTED }}>{metaLine}</p>
      </div>

      {analyzeError && analyzeError !== '__TIMEOUT__' && (
        <p className="m-0 px-6 pb-3 text-[13px] leading-[1.5]" style={{ color: BODY }}>{analyzeError}</p>
      )}
    </div>
  )
}

// ── Mission Control Body ──────────────────────────────────────────────────────

function MissionControlBody({
  caseData, threads, analysis, loading, analyzing, analyzeProgress, attachmentRecords, currentRun, previousRun,
  onLinkThreads, onUnlink, onUpdatePartyType, onRunAnalysis, onOpenCompose,
}: {
  caseData:          Case
  threads:           CaseThread[]
  analysis:          CaseAnalysis | null
  loading:           boolean
  analyzing:         boolean
  analyzeProgress:   AnalysisProgress | null
  attachmentRecords: AttachmentRecord[]
  currentRun:        RunSummary | null
  previousRun:       RunSummary | null
  onLinkThreads:     () => void
  onUnlink:          (t: string) => void
  onUpdatePartyType: (t: string, p: string) => void
  onRunAnalysis:     () => void
  onOpenCompose:     (s: ComposeState) => void
}) {
  if (loading && threads.length === 0) {
    return <div className="py-24"><Spinner /></div>
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
        analyzeProgress={analyzeProgress}
      />
    )
  }

  const sa = analysis.structured_analysis ?? null

  return (
    <div className="px-6 py-6 flex flex-col gap-10 pb-16 max-w-[1100px]">
      {analyzing && <AnalyzingBanner progress={analyzeProgress} />}

      {/* 1 — Executive brief */}
      <ExecBriefCard analysis={analysis} sa={sa} />


      {/* Delta banner — supplementary, right under the brief */}
      {!analyzing && currentRun && previousRun && (
        <RunComparisonBanner
          caseId={caseData.id}
          currentRun={currentRun}
          previousRun={previousRun}
          currentSteps={sa?.recommended_next_steps ?? []}
        />
      )}

      {/* 2 — Timeline */}
      <MissionTimelineSection
        v1Timeline={sa?.timeline ?? []}
        legacyTimeline={analysis.historical_timeline ?? []}
        citations={sa?.citations ?? []}
      />

      {/* 3 — Scenarios (full width) */}
      <ScenarioSection scenarios={sa?.scenario_analysis ?? []} />

      {/* 4 — Next steps / action plan */}
      <NextStepsSection
        v1Steps={sa?.recommended_next_steps ?? []}
        missingItems={sa?.missing_items ?? []}
        drafts={sa?.draft_artifacts ?? []}
        stakeholders={sa?.stakeholder_map ?? []}
        caseId={caseData.id}
        threads={threads}
        onOpenCompose={onOpenCompose}
      />

      {/* 5 — Stakeholders (actionable per-party view) */}
      <StakeholderMapSection
        stakeholders={sa?.stakeholder_map ?? []}
        missingItems={sa?.missing_items ?? []}
        pendingFrom={sa?.case_brief?.pending_from ?? analysis.current_status?.pending_from ?? {}}
        pending={sa?.case_brief?.pending}
        threads={threads}
      />

      {/* 6 — Documents (every attachment, grouped by who sent it) */}
      <AttachmentsSection threads={threads} attachmentRecords={attachmentRecords} />
    </div>
  )
}

// ── Logs View (evidence · draft outputs · linked threads · metadata) ───────────

function LogsView({
  analysis, threads, attachmentRecords, onLinkThreads, onUnlink, onUpdatePartyType, onGoToMission, onRunAnalysis, analyzing,
}: {
  analysis:          CaseAnalysis | null
  threads:           CaseThread[]
  attachmentRecords: AttachmentRecord[]
  onLinkThreads:     () => void
  onUnlink:          (t: string) => void
  onUpdatePartyType: (t: string, p: string) => void
  onGoToMission:     () => void
  onRunAnalysis:     (threadIds?: string[]) => void
  analyzing:         boolean
}) {
  const sa = analysis?.structured_analysis ?? null

  if (!analysis) {
    return (
      <div className="px-6 py-16 flex flex-col items-center gap-3 text-center">
        <p className="m-0 text-[15px]" style={{ color: MUTED }}>Logs fill after the first analysis.</p>
        <button type="button" onClick={onGoToMission} className={ghostBtn} style={{ color: INK }}>Go to Mission control</button>
      </div>
    )
  }

  return (
    <div className="px-6 py-6 flex flex-col gap-10 pb-16 max-w-[1100px]">
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
        onRunAnalysis={onRunAnalysis}
        analyzing={analyzing}
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
    <div className="flex flex-col items-center justify-center gap-4 py-24 px-8 text-center">
      <p className="m-0 text-[15px] max-w-[360px] leading-[1.6]" style={{ color: MUTED }}>
        No threads linked. Each linked thread is one conversation with a party: client, insurer, lawyer or regulator.
      </p>
      <Btn level="secondary" onClick={onAdd}>Link threads</Btn>
    </div>
  )
}

// ── Pre-Analysis State ────────────────────────────────────────────────────────

function PreAnalysisState({
  threads, attachmentRecords, onAdd, onRunAnalysis, onUnlink, onUpdatePartyType, analyzing, analyzeProgress,
}: {
  threads:           CaseThread[]
  attachmentRecords: AttachmentRecord[]
  onAdd:             () => void
  onRunAnalysis:     () => void
  onUnlink:          (t: string) => void
  onUpdatePartyType: (t: string, p: string) => void
  analyzing:         boolean
  analyzeProgress:   AnalysisProgress | null
}) {
  return (
    <div className="px-6 py-6 flex flex-col gap-8 pb-16 max-w-[1100px]">
      {analyzing && <AnalyzingBanner progress={analyzeProgress} />}

      {!analyzing && (
        <div className="rounded-[16px] px-6 py-8 flex flex-col items-center gap-4 text-center" style={{ background: FIELD }}>
          <p className="m-0 text-[15px] max-w-[420px] leading-[1.6]" style={{ color: BODY }}>
            {threads.length} thread{threads.length !== 1 ? 's' : ''} linked. The analysis produces a brief, stakeholder map, timeline, evidence ledger and draft emails.
          </p>
          <button
            type="button"
            onClick={onRunAnalysis}
            className="h-10 px-4 rounded-[10px] text-white text-[14px] font-medium border-0 cursor-pointer hover:opacity-90"
            style={{ background: INK }}
          >
            Run analysis
          </button>
        </div>
      )}

      <div>
        <SectionLabel title="Linked threads" count={threads.length}>
          <Btn level="secondary" size="xs" onClick={onAdd}>Link threads</Btn>
        </SectionLabel>
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

function AnalyzingBanner({ progress }: { progress: AnalysisProgress | null }) {
  const idx = progress?.stageIdx ?? 0
  return (
    <div className="flex flex-col gap-3 px-5 py-4 rounded-[16px]" style={{ background: FIELD }} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: MUTED }} />
          <p className="m-0 text-[14px] font-medium" style={{ color: INK }}>Analysis running</p>
          <span className="text-[13px]" style={{ color: MUTED }}>step {Math.min(idx + 1, ANALYSIS_STAGES.length)} of {ANALYSIS_STAGES.length}</span>
        </div>
        {progress && <span className="text-[14px] font-medium tabular-nums" style={{ color: INK }}>{progress.pct}%</span>}
      </div>

      <div className="h-[3px] rounded-full overflow-hidden" style={{ background: HAIR }}>
        <div className="h-full rounded-full transition-[width] duration-300 ease-linear" style={{ width: `${progress?.pct ?? 0}%`, background: INK }} />
      </div>

      {/* Step checklist — what it's doing and what's next */}
      <ul className="m-0 p-0 flex flex-col gap-1 pt-0.5">
        {ANALYSIS_STAGES.map((s, i) => {
          const state = i < idx ? 'done' : i === idx ? 'current' : 'pending'
          return (
            <li key={i} className={cn('flex items-center gap-2 text-[13px] list-none', state === 'current' && 'font-medium')}
              style={{ color: state === 'current' ? INK : state === 'done' ? BODY : FAINT }}>
              <span className="w-3.5 flex-shrink-0 flex items-center justify-center">
                {state === 'current'
                  ? <Loader2 size={11} className="animate-spin" />
                  : <span className="w-1.5 h-1.5 rounded-full" style={{ background: state === 'done' ? INK : DOT }} />}
              </span>
              <span>{s.label}</span>
              {s.model && state === 'current' && <Chip>{s.model}</Chip>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ── Shared Primitives ─────────────────────────────────────────────────────────

/** Section heading: 16px medium sentence case; the count as muted tabular text. */
function SectionLabel({
  title, count, children,
}: {
  title:     string
  count?:    number
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
      <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em] leading-tight" style={{ color: INK }}>
        {title}
        {count !== undefined && <span className="ml-2 text-[13px] font-normal tabular-nums" style={{ color: FAINT }}>{count}</span>}
      </h2>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  )
}

function NoDataState({ message }: { message: string }) {
  return <p className="m-0 py-5 text-[14px]" style={{ color: MUTED }}>{message}</p>
}

/** One fact: muted term, ink value. Renders inside a <dl>. */
function KFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-[13.5px] min-w-0">
      <dt className="m-0 flex-shrink-0" style={{ color: MUTED }}>{label}</dt>
      <dd className="m-0 font-medium truncate" style={{ color: INK }}>{value}</dd>
    </div>
  )
}

// ── Citation Chip ─────────────────────────────────────────────────────────────

function CitationChip({ id, citations }: { id: string; citations: V1Citation[] }) {
  const c = citations.find(x => x.id === id)
  if (!c) return null
  const label = c.label.length > 18 ? c.label.slice(0, 18) + '…' : c.label
  // v1.1: cited facts resolve to a real message/attachment → link to the source thread.
  const href = c.thread_id ? `/engagement?lead=${c.thread_id}` : null
  const cls = 'inline-flex items-center rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium align-middle no-underline whitespace-nowrap'
  if (href) return (
    <a href={href} onClick={e => e.stopPropagation()} title={`${c.excerpt ?? c.label}. Opens the source.`} className={cn(cls, 'hover:underline')} style={{ background: FIELD, color: BODY }}>
      {label}
    </a>
  )
  return (
    <span title={c.excerpt ?? c.label} className={cn(cls, 'cursor-help')} style={{ background: FIELD, color: BODY }}>
      {label}
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

  const criticalCount = questions.filter(q => q.priority === 'critical' || q.priority === 'high').length
  const urgentCount   = missing.filter(m => m.urgency === 'urgent').length
  const pendingRows   = Object.entries(pendingFrom).filter(([, v]) => v)

  return (
    <div>
      <SectionLabel title="Executive brief" />
      <div className="rounded-[16px] bg-white px-6 py-5 flex flex-col gap-5" style={{ border: `1px solid ${HAIR}` }}>
        {(stage || coverage || claim || policy) && (
          <dl className="m-0 flex flex-wrap gap-x-8 gap-y-1.5">
            {stage    && <KFact label="Stage"    value={stage} />}
            {coverage && <KFact label="Coverage" value={coverage} />}
            {claim    && <KFact label="Claim"    value={claim} />}
            {policy   && <KFact label="Policy"   value={policy} />}
          </dl>
        )}

        {summary && <p className="m-0 text-[14px] leading-[1.7]" style={{ color: BODY }}>{summary}</p>}

        {blocking.length > 0 && (
          <div>
            <GroupLabel className="mb-2">Blocking <span className="tabular-nums" style={{ color: FAINT }}>{blocking.length}</span></GroupLabel>
            <ul className="m-0 p-0 flex flex-col gap-1.5">
              {blocking.map((b, i) => <DotRow key={i}>{b}</DotRow>)}
            </ul>
          </div>
        )}

        {pendingRows.length > 0 && (
          <div>
            <GroupLabel className="mb-2">Pending from</GroupLabel>
            <div className="flex flex-wrap gap-3">
              {pendingRows.map(([party, item]) => (
                <div key={party} className="flex flex-col gap-1 px-4 py-3 rounded-[12px] flex-1 min-w-[200px]" style={{ background: partyField(party) }}>
                  <span className="text-[12.5px] font-medium" style={{ color: MUTED }}>{partyLabel(party)}</span>
                  <p className="m-0 text-[14px] leading-[1.5]" style={{ color: BODY }}>{item as string}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {(questions.length > 0 || missing.length > 0) && (
          <ul className="m-0 p-0 flex flex-col gap-1.5 pt-4" style={{ borderTop: `1px solid ${HAIR}` }}>
            {questions.length > 0 && (
              <DotRow>{criticalCount} critical question{criticalCount !== 1 ? 's' : ''} of {questions.length} open</DotRow>
            )}
            {missing.length > 0 && (
              <DotRow>{urgentCount} urgent item{urgentCount !== 1 ? 's' : ''} missing of {missing.length}</DotRow>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Stakeholder Map Section ───────────────────────────────────────────────────

// Stance → short disposition (full text kept for the expanded row/tooltip). The label carries the meaning; no colour.
function stanceStyle(stance?: string): { label: string; full: string } | null {
  if (!stance) return null
  const s = stance.toLowerCase()
  if (/(advers|hostile|oppos|against|dispute|litig)/.test(s)) return { label: 'Adversarial', full: stance }
  if (/(align|cooperat|support|favour|favor|friendly|collaborat|engaged|our client)/.test(s)) return { label: 'Cooperative', full: stance }
  return { label: 'Neutral', full: stance }
}

const PARTY_LABEL: Record<string, string> = { client: 'Client', insurer: 'Insurer', lawyer: 'Lawyer', regulator: 'Regulator', trs: 'TRS', counterparty: 'Counterparty', other: 'Other' }
function partyLabel(p: string): string { return PARTY_LABEL[p?.toLowerCase()] ?? (p ? p[0].toUpperCase() + p.slice(1) : 'Other') }
const PARTY_ORDER = ['client', 'insurer', 'lawyer', 'counterparty', 'regulator', 'trs', 'other']

// Does a free-text party token (from pending_from / missing_items.required_from)
// refer to this stakeholder? Fuzzy on party type, first name, and company.
function partyRefersTo(token: string, s: V1Stakeholder): boolean {
  if (!token) return false
  const t = token.toLowerCase()
  const first = s.name?.toLowerCase().split(/\s+/)[0]
  return (
    (!!s.party_type && t.includes(s.party_type.toLowerCase())) ||
    (!!first && first.length > 2 && t.includes(first)) ||
    (!!s.company && t.includes(s.company.toLowerCase())) ||
    (!!s.name && s.name.toLowerCase().includes(t))
  )
}

function matchStakeholderThread(s: V1Stakeholder, threads: CaseThread[]): CaseThread | null {
  // 1. Exact id link (v1.1 analyses carry resolved thread_id/contact_id).
  if (s.thread_id) {
    const byId = threads.find(ct => ct.thread_id === s.thread_id)
    if (byId) return byId
  }
  if (s.contact_id) {
    const byContact = threads.find(ct => ct.thread?.contact_id === s.contact_id)
    if (byContact) return byContact
  }
  // 2. Fallback: fuzzy match (older analyses without ids).
  const email = s.email?.toLowerCase()
  if (email) {
    const byEmail = threads.find(ct =>
      ct.thread?.contact?.email?.toLowerCase() === email ||
      ct.messages.some(m => m.from_address?.toLowerCase() === email))
    if (byEmail) return byEmail
  }
  const byType = threads.filter(ct => ct.party_type?.toLowerCase() === s.party_type?.toLowerCase())
  return byType.length === 1 ? byType[0] : null
}

function StakeholderMapSection({
  stakeholders, missingItems, pendingFrom, pending, threads,
}: {
  stakeholders: V1Stakeholder[]
  missingItems: V1Missing[]
  pendingFrom:  Record<string, string>
  pending?:     { stakeholder_id: string; item: string }[]
  threads:      CaseThread[]
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (!stakeholders?.length) return (
    <div>
      <SectionLabel title="Stakeholders" />
      <NoDataState message="No stakeholders identified in this analysis." />
    </div>
  )

  const hasIds = (missingItems || []).some(m => m.stakeholder_id) || (pending || []).length > 0

  // Enrich each stakeholder (outstanding items, last activity, awaiting/overdue).
  const rows = stakeholders.map((s, i) => {
    const key = s.id ?? String(i)
    const thread = matchStakeholderThread(s, threads)
    // Prefer exact stakeholder_id links (v1.1); fall back to fuzzy party matching.
    const outstanding = Array.from(new Set(
      hasIds
        ? [
            ...(pending || []).filter(p => p.stakeholder_id === s.id).map(p => p.item),
            ...(missingItems || []).filter(m => m.stakeholder_id ? m.stakeholder_id === s.id : partyRefersTo(m.required_from, s)).map(m => m.item),
          ]
        : [
            ...Object.entries(pendingFrom || {}).filter(([party]) => partyRefersTo(party, s)).map(([, what]) => what),
            ...(missingItems || []).filter(m => partyRefersTo(m.required_from, s)).map(m => m.item),
          ]
    )).filter(o => o && String(o).trim()).slice(0, 6)   // drop empty entries (#5)
    const last = thread && thread.messages.length
      ? [...thread.messages].sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0]
      : null
    const awaiting  = last?.direction === 'outbound'
    const days      = last ? Math.floor((Date.now() - new Date(last.sent_at).getTime()) / 86_400_000) : 0
    const isInsurer = s.party_type?.toLowerCase().includes('insur')
    const overdue   = !!awaiting && (isInsurer ? days >= 3 : days >= 5)
    return { key, s, st: stanceStyle(s.stance), thread, outstanding, last, awaiting, days, overdue }
  })

  // Group by party type; within a group, most-actionable first.
  const groups = new Map<string, typeof rows>()
  for (const r of rows) { const g = r.s.party_type?.toLowerCase() || 'other'; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(r) }
  const gi = (g: string) => { const n = PARTY_ORDER.indexOf(g); return n < 0 ? 99 : n }
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => gi(a[0]) - gi(b[0]))
  for (const [, rs] of sortedGroups) rs.sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(b.awaiting) - Number(a.awaiting) || b.days - a.days)

  const toggle = (key: string) => setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const th = 'py-2.5 px-3 text-[12px] font-medium text-left'

  return (
    <div>
      <SectionLabel title="Stakeholders" count={stakeholders.length} />
      <div className="rounded-[16px] bg-white overflow-hidden" style={{ border: `1px solid ${HAIR}` }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[14px]">
            <thead>
              <tr style={{ color: MUTED, borderBottom: `1px solid ${HAIR}` }}>
                <th className="w-8"></th>
                <th className={th}>Stakeholder</th>
                <th className={th}>Stance</th>
                <th className={th}>Last contact</th>
              </tr>
            </thead>
            <tbody>
              {sortedGroups.map(([g, rs]) => (
                <Fragment key={g}>
                  <tr>
                    <td colSpan={4} className="pt-3 pb-1 px-3 text-[12.5px] font-medium" style={{ color: MUTED }}>
                      {partyLabel(g)} <span className="tabular-nums" style={{ color: FAINT }}>{rs.length}</span>
                    </td>
                  </tr>
                  {rs.map(r => {
                    const open = expanded.has(r.key)
                    const status = !r.last ? 'No thread'
                      : r.overdue ? `Waiting ${r.days}d, past the reply window`
                      : r.awaiting ? `Waiting ${r.days}d`
                      : `Replied ${timeAgo(r.last.sent_at)}`
                    return (
                      <Fragment key={r.key}>
                        <tr className="cursor-pointer hover:bg-[#f8f9fa]" style={{ borderTop: `1px solid ${HAIR}` }} onClick={() => toggle(r.key)} aria-expanded={open}>
                          <td className="py-3 pl-3 align-top"><ChevronDown size={14} className={cn('transition-transform mt-0.5', open && 'rotate-180')} style={{ color: FAINT }} /></td>
                          <td className="py-3 px-3 align-top">
                            <div className="font-medium" style={{ color: INK }}>{r.s.name}</div>
                            {r.s.company && <div className="text-[12.5px]" style={{ color: MUTED }}>{r.s.company}</div>}
                          </td>
                          <td className="py-3 px-3 align-top">
                            {r.st ? <Chip title={r.st.full}>{r.st.label}</Chip> : <span style={{ color: FAINT }}>—</span>}
                          </td>
                          <td className="py-3 px-3 align-top text-[13.5px] whitespace-nowrap" style={{ color: r.last ? BODY : FAINT }}>
                            {status}
                            {r.outstanding.length > 0 && <span style={{ color: MUTED }}> · {r.outstanding.length} item{r.outstanding.length !== 1 ? 's' : ''} awaited</span>}
                          </td>
                        </tr>
                        {open && (
                          <tr style={{ background: HOVER }}>
                            <td></td>
                            <td colSpan={3} className="px-3 pb-4 pt-1">
                              {r.s.email && <p className="m-0 mb-1 text-[13px]" style={{ color: MUTED }}>{r.s.email}</p>}
                              {r.s.role_summary && <p className="m-0 mb-2 text-[14px] leading-[1.55]" style={{ color: BODY }}>{r.s.role_summary}</p>}
                              {r.st && <p className="m-0 mb-2 text-[13px]" style={{ color: MUTED }}>Stance: {r.st.full}</p>}
                              {r.outstanding.length > 0 && (
                                <div className="mb-2">
                                  <GroupLabel className="mb-1">Waiting on them</GroupLabel>
                                  <ul className="m-0 p-0 flex flex-col gap-1">
                                    {r.outstanding.map((o, oi) => <DotRow key={oi} className="text-[13.5px]">{o}</DotRow>)}
                                  </ul>
                                </div>
                              )}
                              {r.thread && (
                                <a href={`/engagement?lead=${r.thread.thread_id}`} onClick={e => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[13px] font-medium underline-offset-4 hover:underline no-underline" style={{ color: INK }}>
                                  {r.overdue ? 'Chase in Engagement' : 'Open in Engagement'} →
                                </a>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Scenario Section ──────────────────────────────────────────────────────────

const SCENARIO_PROB: Record<string, { barW: string; pct: string }> = {
  high:   { barW: '65%', pct: '~65%' },
  medium: { barW: '35%', pct: '~35%' },
  low:    { barW: '15%', pct: '~15%' },
}

// Disposition (Optimistic / Expected / Adverse) inferred from the scenario name —
// a neutral axis that doesn't clash with probability (e.g. "Optimistic ~15%").
function scenarioView(s: V1Scenario) {
  const name = s.name ?? ''
  const n = name.toLowerCase()
  let disp: string | null = null
  if (/best|favou?r|upside|optimistic/.test(n))                          disp = 'Optimistic'
  else if (/worst|adverse|downside|repudiat|inability|fail/.test(n))     disp = 'Adverse'
  else if (/base|expected|likely|middle|central/.test(n))               disp = 'Expected'
  const cleanName = name.replace(/^\s*(best|base|worst)\s+case\s*[—\-:]\s*/i, '').trim() || name
  const pm = SCENARIO_PROB[s.probability?.toLowerCase()] ?? SCENARIO_PROB.low
  return { disp, cleanName, pm }
}

// ── Documents / Attachments index (grouped by the party that sent them) ────────

function fmtBytes(n?: number | null): string {
  if (!n) return ''
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`
  return `${n} B`
}

function AttachmentsSection({ threads, attachmentRecords }: { threads: CaseThread[]; attachmentRecords: AttachmentRecord[] }) {
  // Dedupe (same file can appear on multiple messages) by id, else filename+thread.
  const seen = new Set<string>()
  const files = attachmentRecords.filter(a => {
    const key = a.id ?? `${a.thread_id}:${a.filename}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })
  if (files.length === 0) return (
    <div>
      <SectionLabel title="Documents" />
      <NoDataState message="No attachments on this case yet." />
    </div>
  )

  // Attribute each file to the party whose thread it arrived on.
  const threadParty = new Map(threads.map(ct => [ct.thread_id, { type: (ct.party_type ?? 'other').toLowerCase(), label: ct.party_label ?? (ct.thread?.contact ? contactName(ct.thread.contact) : null) }]))
  const groups = new Map<string, { label: string; items: AttachmentRecord[] }>()
  for (const f of files) {
    const p = threadParty.get(f.thread_id) ?? { type: 'other', label: null }
    const key = p.label || partyLabel(p.type)
    if (!groups.has(key)) groups.set(key, { label: key, items: [] })
    groups.get(key)!.items.push(f)
  }
  // party-type order, then by label; newest file first within a group.
  const partyRank = (label: string) => {
    const ct = threads.find(t => (t.party_label ?? '') === label)
    const n = PARTY_ORDER.indexOf((ct?.party_type ?? 'other').toLowerCase())
    return n < 0 ? 99 : n
  }
  const sortedGroups = Array.from(groups.values()).sort((a, b) => partyRank(a.label) - partyRank(b.label) || a.label.localeCompare(b.label))
  for (const g of sortedGroups) g.items.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())

  const total = files.length
  const parsed = files.filter(f => f.parsed_at).length

  return (
    <div>
      <SectionLabel title="Documents" count={total}>
        <span className="text-[13px] tabular-nums" style={{ color: MUTED }}>{parsed} of {total} read by Nexus</span>
      </SectionLabel>
      <div className="flex flex-col gap-3">
        {sortedGroups.map(g => {
          const ct = threads.find(t => (t.party_label ?? '') === g.label)
          const pt = ct?.party_type ?? 'other'
          return (
            <div key={g.label} className="rounded-[16px] bg-white overflow-hidden" style={{ border: `1px solid ${HAIR}` }}>
              <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ borderBottom: `1px solid ${HAIR}` }}>
                <PartyChip party={pt} className="flex-shrink-0" />
                <span className="text-[14px] font-medium truncate" style={{ color: INK }}>{g.label}</span>
                <span className="text-[13px] tabular-nums ml-auto" style={{ color: FAINT }}>{g.items.length}</span>
              </div>
              <div className="flex flex-col">
                {g.items.map((f, i) => (
                  <div key={f.id ?? i} className="flex items-center gap-3 px-4 py-2.5 text-[14px] hover:bg-[#f8f9fa]" style={{ borderTop: i === 0 ? 'none' : `1px solid ${HAIR}` }}>
                    {f.storage_url
                      ? <a href={f.storage_url} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-4 hover:underline no-underline truncate" style={{ color: INK }}>{f.filename}</a>
                      : <span className="font-medium truncate" style={{ color: INK }}>{f.filename}</span>}
                    <span className="text-[12.5px] flex-shrink-0 tabular-nums" style={{ color: MUTED }}>{fmtBytes(f.size_bytes)}</span>
                    <span className="ml-auto flex items-center gap-3 flex-shrink-0">
                      {f.created_at && <span className="text-[12.5px]" style={{ color: MUTED }}>{new Date(f.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>}
                      <Chip>{f.parsed_at ? 'Read' : 'Pending'}</Chip>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScenarioSection({ scenarios }: { scenarios: V1Scenario[] }) {
  if (!scenarios?.length) return (
    <div>
      <SectionLabel title="Scenarios" />
      <NoDataState message="Scenarios appear after analysis." />
    </div>
  )

  const th = 'py-2.5 px-4 text-[12px] font-medium text-left'

  // Full-width comparison table — rows are scenarios, columns compare across them.
  return (
    <div>
      <SectionLabel title="Scenarios" count={scenarios.length} />
      <div className="rounded-[16px] bg-white overflow-hidden" style={{ border: `1px solid ${HAIR}` }}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left min-w-[720px]">
            <thead>
              <tr style={{ color: MUTED, borderBottom: `1px solid ${HAIR}` }}>
                <th className={cn(th, 'w-[22%]')}>Scenario</th>
                <th className={cn(th, 'w-[13%]')}>Probability</th>
                <th className={cn(th, 'w-[32%]')}>Projected outcome</th>
                <th className={cn(th, 'w-[33%]')}>TRS action and watch-fors</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s, i) => {
                const { disp, cleanName, pm } = scenarioView(s)
                const assumptions       = s.assumptions?.filter(Boolean)       ?? []
                const triggerConditions = s.trigger_conditions?.filter(Boolean) ?? []
                return (
                  <tr key={i} className="align-top" style={{ borderTop: i === 0 ? 'none' : `1px solid ${HAIR}` }}>
                    {/* Disposition chip + scenario name + strategic implication */}
                    <td className="py-4 px-4">
                      {disp && <Chip className="mb-1.5">{disp}</Chip>}
                      <p className="m-0 text-[14px] font-medium leading-snug" style={{ color: INK }}>{cleanName}</p>
                      {s.strategic_implication && (
                        <p className="m-0 mt-1 text-[13px] leading-[1.5]" style={{ color: MUTED }}>{s.strategic_implication}</p>
                      )}
                    </td>

                    {/* Probability % + bar */}
                    <td className="py-4 px-4">
                      <span className="text-[14px] font-medium tabular-nums" style={{ color: INK }}>{pm.pct}</span>
                      <div className="h-[3px] rounded-full mt-1.5 overflow-hidden" style={{ background: HAIR }}>
                        <div className="h-full rounded-full" style={{ width: pm.barW, background: DOT }} />
                      </div>
                    </td>

                    {/* Outcome + assumptions */}
                    <td className="py-4 px-4">
                      <p className="m-0 text-[14px] leading-[1.55]" style={{ color: BODY }}>{s.outcome}</p>
                      {assumptions.length > 0 && (
                        <div className="mt-2.5">
                          <GroupLabel className="mb-1">Assumes</GroupLabel>
                          <ul className="m-0 p-0 flex flex-col gap-1">
                            {assumptions.map((a, ai) => <DotRow key={ai} className="text-[13px]">{a}</DotRow>)}
                          </ul>
                        </div>
                      )}
                    </td>

                    {/* TRS action + watch-fors */}
                    <td className="py-4 px-4">
                      <p className="m-0 text-[14px] font-medium leading-[1.5]" style={{ color: INK }}>{s.trs_action}</p>
                      {triggerConditions.length > 0 && (
                        <div className="mt-2.5">
                          <GroupLabel className="mb-1">Watch for</GroupLabel>
                          <ul className="m-0 p-0 flex flex-col gap-1">
                            {triggerConditions.map((t, ti) => <DotRow key={ti} className="text-[13px]">{t}</DotRow>)}
                          </ul>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
    ? v1Timeline.map(e => ({ date: e.date, party: e.party, event: e.event, significance: e.significance, citation_ids: e.citation_ids ?? [], date_verified: e.date_verified, date_excerpt: e.date_excerpt }))
    : legacyTimeline.map(e => ({ date: e.date, party: e.party, event: e.event, significance: e.significance, citation_ids: [] as string[], date_verified: undefined as boolean | undefined, date_excerpt: undefined as string | undefined }))

  if (!events.length) return (
    <div>
      <SectionLabel title="Timeline" />
      <NoDataState message="No timeline events in this analysis." />
    </div>
  )

  const PREVIEW = 6
  const shown   = showAll ? events : events.slice(0, PREVIEW)

  return (
    <div>
      <SectionLabel title="Timeline" count={events.length}>
        {events.length > PREVIEW && (
          <button type="button" onClick={() => setShowAll(v => !v)} className={ghostBtn} style={{ color: INK }}>
            {showAll ? 'Show fewer' : `Show all ${events.length}`}
          </button>
        )}
      </SectionLabel>
      <div className="rounded-[16px] bg-white px-6 py-5" style={{ border: `1px solid ${HAIR}` }}>
        {shown.map((e, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="w-2 h-2 rounded-full flex-shrink-0 mt-[7px]" style={{ background: DOT }} />
              {i < shown.length - 1 && <div className="w-px flex-1 mt-1.5 mb-1" style={{ background: HAIR }} />}
            </div>
            <div className={cn('min-w-0 flex-1', i < shown.length - 1 ? 'pb-5' : 'pb-0')}>
              <div className="flex items-center gap-2 mb-1 flex-wrap text-[12.5px]" style={{ color: MUTED }}>
                <span className="font-medium">{partyLabel(e.party)}</span>
                <span title={e.date_excerpt ? `Source: “${e.date_excerpt}”` : undefined}>{fmtDate(e.date)}</span>
                {e.date_verified === false && <Chip title="This date was not found verbatim in the source. Check it.">Date unverified</Chip>}
                {e.citation_ids.map(cid => <CitationChip key={cid} id={cid} citations={citations} />)}
              </div>
              <p className="m-0 text-[14px] leading-[1.55]" style={{ color: INK }}>{e.event}</p>
              {e.significance && <p className="m-0 mt-0.5 text-[13px] leading-[1.5]" style={{ color: MUTED }}>{e.significance}</p>}
            </div>
          </div>
        ))}
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
      <SectionLabel title="Evidence" count={items.length}>
        <Segmented value={tab} onChange={setTab} options={TAB_META.map(t => ({ value: t.key, label: t.label, count: groups[t.key]?.length ?? 0 }))} />
      </SectionLabel>
      <div className="rounded-[16px] bg-white overflow-hidden" style={{ border: `1px solid ${HAIR}` }}>
        {shown.length === 0 ? (
          <p className="m-0 text-[14px] text-center py-10" style={{ color: MUTED }}>
            No {tab === 'email' ? 'email' : tab === 'attachment' ? 'attachment' : 'knowledge'} evidence in this analysis.
          </p>
        ) : (
          <div>
            {shown.map((item, i) => {
              const itemKey = item.id ?? String(i)
              const isOpen  = expandedId === itemKey
              return (
                <div key={itemKey} style={{ borderTop: i === 0 ? 'none' : `1px solid ${HAIR}` }}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setExpandedId(isOpen ? null : itemKey)}
                    className="w-full text-left px-5 py-3.5 flex items-start gap-3 bg-transparent border-0 cursor-pointer hover:bg-[#f8f9fa]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[14px] font-medium truncate" style={{ color: INK }}>{item.filename_or_label}</span>
                        {item.coverage_relevant && <Chip>Coverage</Chip>}
                        {item.citation_id && <CitationChip id={item.citation_id} citations={citations} />}
                      </div>
                      {!isOpen && item.key_facts?.[0] && (
                        <p className="m-0 text-[13px] line-clamp-1" style={{ color: MUTED }}>{item.key_facts[0]}</p>
                      )}
                    </div>
                    <ChevronDown size={14} strokeWidth={2} className={cn('flex-shrink-0 mt-0.5 transition-transform', isOpen && 'rotate-180')} style={{ color: FAINT }} />
                  </button>
                  {isOpen && (
                    <ul className="m-0 px-5 pb-4 pt-0 flex flex-col gap-1.5">
                      {(item.key_facts ?? []).map((f, fi) => <DotRow key={fi}>{f}</DotRow>)}
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

// ── Next Steps Section ────────────────────────────────────────────────────────

const stepPriorityLabel = (p?: string) => {
  const k = (p ?? '').toLowerCase()
  return k === 'urgent' ? 'Urgent' : k === 'high' ? 'High' : k ? k[0].toUpperCase() + k.slice(1) : 'Normal'
}

type StepDraftState = {
  status:    'idle' | 'creating' | 'done' | 'error'
  draftId?:  string
  threadId?: string
  errorMsg?: string
}

function NextStepsSection({
  v1Steps, missingItems, drafts, stakeholders, caseId, threads, onOpenCompose,
}: {
  v1Steps:        V1NextStep[]
  missingItems:   V1Missing[]
  drafts:         V1Draft[]
  stakeholders:   V1Stakeholder[]
  caseId:         string
  threads:        CaseThread[]
  onOpenCompose:  (s: ComposeState) => void
}) {
  const [stepDraftState, setStepDraftState] = useState<Record<number, StepDraftState>>({})
  const [copiedStep,     setCopiedStep]     = useState<number | null>(null)
  const [pickFor,        setPickFor]        = useState<number | null>(null)   // step awaiting a manual recipient
  const [pickEmail,      setPickEmail]      = useState('')

  // Case contact emails by party type — used to resolve a recipient for any step
  // so every step that targets a reachable party can be drafted (not just step 1).
  const partyEmails: Record<string, string[]> = {}
  for (const ct of threads) {
    const em = ct.thread?.contact?.email
    if (em) { const k = (ct.party_type ?? 'other').toLowerCase(); (partyEmails[k] ??= []).push(em) }
  }
  // Every known email on the case (contacts + analysis stakeholders) — powers the
  // recipient datalist so the employee can pick when a step doesn't auto-resolve.
  const knownEmails = Array.from(new Set([
    ...threads.map(ct => ct.thread?.contact?.email).filter(Boolean) as string[],
    ...stakeholders.map(s => s.email).filter(Boolean) as string[],
  ]))

  function resolveEmail(step: V1NextStep, artifact: V1Draft | null): string {
    // Prefer the exact id-resolved recipient (v1.1); then the analysis stakeholder
    // (reaches parties not yet a case thread, e.g. a new insurer); then party_type.
    const byThread = step.thread_id ? threads.find(ct => ct.thread_id === step.thread_id)?.thread?.contact?.email : ''
    const byContact = step.contact_id ? threads.find(ct => ct.thread?.contact_id === step.contact_id)?.thread?.contact?.email : ''
    const byStakeholder = step.stakeholder_id ? stakeholders.find(s => s.id === step.stakeholder_id)?.email : ''
    return byThread || byContact || byStakeholder || step.to_emails?.[0] || artifact?.to_emails?.[0] || partyEmails[(step.party_type ?? '').toLowerCase()]?.[0] || ''
  }

  // Auto-detect that a step's email was likely already sent: the most recent
  // OUTBOUND message on the recipient's thread. Surfaces "already actioned".
  function lastSentForStep(step: V1NextStep, email: string): string | null {
    if (!email) return null
    const e = email.toLowerCase()
    const t = (step.thread_id ? threads.find(ct => ct.thread_id === step.thread_id) : null)
      ?? threads.find(ct => ct.thread?.contact?.email?.toLowerCase() === e || ct.messages.some(m => m.from_address?.toLowerCase() === e))
    if (!t) return null
    const outs = t.messages.filter(m => m.direction === 'outbound')
    if (outs.length === 0) return null
    return outs.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0].sent_at
  }

  // Nexus decides; Engagement acts. Fresh-draft the step (Gemini from Opus's
  // action) and hand it to the recipient's Engagement thread. Nexus never sends.
  async function draftInEngagement(step: V1NextStep, toEmail: string) {
    const key = step.step
    if (!toEmail) return
    setStepDraftState(prev => ({ ...prev, [key]: { status: 'creating' } }))
    try {
      const res = await fetch('/api/nexus/step-draft', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: caseId, action: step.action, rationale: step.rationale, party_type: step.party_type ?? step.owner, to_email: toEmail }),
      })
      const data = await res.json()
      if (!res.ok) { setStepDraftState(prev => ({ ...prev, [key]: { status: 'error', errorMsg: data.error ?? 'Draft failed' } })); return }

      if (data.thread_id) {
        // Hand the draft to Engagement and open that conversation there.
        window.sessionStorage.setItem('trs_pending_reply', JSON.stringify({ threadId: data.thread_id, toEmail: data.to_email, subject: data.subject, body: data.body }))
        window.location.href = `/engagement?lead=${data.thread_id}`
      } else {
        // No existing thread — open the standalone composer in Engagement (compose
        // only; the thread is created on send). The draft always lands in Engagement.
        const toName = stakeholders.find(s => s.email && s.email.toLowerCase() === toEmail.toLowerCase())?.name
        window.sessionStorage.setItem('trs_pending_new', JSON.stringify({ toEmail: data.to_email ?? toEmail, toName, subject: data.subject, body: data.body }))
        window.location.href = `/engagement?compose=new`
      }
    } catch (e) {
      setStepDraftState(prev => ({ ...prev, [key]: { status: 'error', errorMsg: String(e) } }))
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
      <SectionLabel title="Next steps" />
      <NoDataState message="Next steps appear after analysis." />
    </div>
  )

  const urgentMissing = (missingItems ?? []).filter(m => m.urgency === 'urgent')

  const draftableCount = (v1Steps ?? []).filter((step) => !!drafts[step.step - 1]).length

  return (
    <div>
      <SectionLabel title="Next steps" count={v1Steps?.length ?? 0}>
        {draftableCount > 0 && <span className="text-[13px] tabular-nums" style={{ color: MUTED }}>{draftableCount} with a draft</span>}
      </SectionLabel>
      <div className="flex flex-col gap-3">
        {urgentMissing.length > 0 && (
          <div className="px-5 py-4 rounded-[16px]" style={{ background: FIELD }}>
            <GroupLabel className="mb-2">Prerequisites <span className="tabular-nums" style={{ color: FAINT }}>{urgentMissing.length}</span></GroupLabel>
            <ul className="m-0 p-0 flex flex-col gap-1.5">
              {urgentMissing.map((m, i) => (
                <DotRow key={i}>
                  <span className="font-medium" style={{ color: INK }}>{m.item}</span>
                  <span style={{ color: MUTED }}> · from {m.required_from}</span>
                  {m.impact && <span className="block text-[13px] mt-0.5" style={{ color: MUTED }}>{m.impact}</span>}
                </DotRow>
              ))}
            </ul>
          </div>
        )}

        {(v1Steps ?? []).map((step, i) => {
          const artifact = drafts[step.step - 1] ?? null
          const ds       = stepDraftState[step.step] ?? { status: 'idle' }
          const toEmail  = resolveEmail(step, artifact)
          const lastSent = lastSentForStep(step, toEmail)

          return (
            <div key={i} className="flex gap-4 px-5 py-4 rounded-[16px] bg-white" style={{ border: `1px solid ${HAIR}` }}>
              <span className="text-[14px] font-medium tabular-nums flex-shrink-0 w-5 text-right pt-[1px]" style={{ color: FAINT }}>
                {step.step}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 mb-1.5 flex-wrap">
                  <span className="text-[14px] font-medium leading-[1.45]" style={{ color: INK }}>{step.action}</span>
                  <Chip className="flex-shrink-0">{stepPriorityLabel(step.priority)}</Chip>
                </div>
                <div className="flex items-center gap-2 mb-2 flex-wrap text-[12.5px]" style={{ color: MUTED }}>
                  {step.owner && <PartyChip party={step.owner} />}
                  {step.deadline && (
                    <span title="Timing is guidance, not a blocker. Any step can be drafted now.">{step.deadline} · guidance</span>
                  )}
                  {lastSent && (
                    <Chip title={`An email to this recipient was sent on ${new Date(lastSent).toLocaleString('en-SG')}. Check the thread before sending again.`}>
                      Emailed {relTime(lastSent)}
                    </Chip>
                  )}
                </div>
                <p className="m-0 text-[13.5px] leading-[1.55] mb-3" style={{ color: MUTED }}>{step.rationale}</p>

                {/* ── Step action bar (every step is draftable; recipient editable) ── */}
                <div className="flex items-center gap-2 flex-wrap pt-3" style={{ borderTop: `1px solid ${HAIR}` }}>
                  <Btn
                    level="secondary"
                    size="xs"
                    onClick={() => { if (toEmail) draftInEngagement(step, toEmail); else { setPickFor(pickFor === step.step ? null : step.step); setPickEmail('') } }}
                    disabled={ds.status === 'creating'}
                    loading={ds.status === 'creating'}
                    title={toEmail ? `Draft in Engagement to ${toEmail}` : 'Choose a recipient to draft to'}
                  >
                    {ds.status === 'creating' ? 'Drafting…' : toEmail ? 'Draft in Engagement' : 'Draft in Engagement…'}
                  </Btn>
                  <Btn level="tertiary" size="xs" onClick={() => copyStep(step)}>
                    {copiedStep === step.step ? 'Copied' : 'Copy'}
                  </Btn>
                  {ds.errorMsg && (
                    <span className="text-[12.5px]" style={{ color: ds.status === 'error' ? INK : MUTED }}>{ds.errorMsg}</span>
                  )}
                </div>

                {/* Manual recipient picker — shown when the step has no auto-resolved recipient */}
                {pickFor === step.step && (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <input
                      list="nexus-known-emails"
                      value={pickEmail}
                      onChange={e => setPickEmail(e.target.value)}
                      placeholder="recipient@company.com"
                      aria-label="Recipient"
                      className={cn(inputCls, 'flex-1 min-w-[200px] w-auto')}
                      autoFocus
                    />
                    <Btn
                      level="primary"
                      onClick={() => { if (pickEmail.includes('@')) { draftInEngagement(step, pickEmail.trim()); setPickFor(null) } }}
                      disabled={!pickEmail.includes('@')}
                    >
                      Draft
                    </Btn>
                    <Btn level="tertiary" onClick={() => setPickFor(null)}>Cancel</Btn>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <datalist id="nexus-known-emails">{knownEmails.map(e => <option key={e} value={e} />)}</datalist>
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
      <SectionLabel title="Draft outputs" />
      <NoDataState message="No drafts yet. Analysis writes one draft per party." />
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
      <SectionLabel title="Draft outputs" count={steps.length}>
        {!hasDrafts && hasLegacy && <span className="text-[13px]" style={{ color: MUTED }}>Legacy format</span>}
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

  const STEP_DIFF_LABEL: Record<StepDiffItem['type'], string> = {
    added:   'Added',
    removed: 'Removed',
    changed: 'Changed',
  }

  return (
    <div className="rounded-[16px]" style={{ background: FIELD }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={handleToggle}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left bg-transparent border-0 cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap text-[13.5px]">
          <span className="font-medium" style={{ color: INK }}>Compared with the run {prevAgo}</span>
          <span className="truncate" style={{ color: MUTED }}>
            {diffs.slice(0, 3).join(' · ')}{diffs.length > 3 ? ` · ${diffs.length - 3} more` : ''}
          </span>
        </div>
        <ChevronDown size={14} strokeWidth={2} className={cn('flex-shrink-0 transition-transform', open && 'rotate-180')} style={{ color: FAINT }} />
      </button>
      {open && (
        <div className="px-5 pb-4 pt-3 flex flex-col gap-4" style={{ borderTop: `1px solid ${HAIR}` }}>
          {/* Metadata diffs */}
          <div>
            <GroupLabel className="mb-2">Changes since the previous run</GroupLabel>
            {diffs.length === 0 ? (
              <p className="m-0 text-[13px]" style={{ color: MUTED }}>No metadata changes</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {diffs.map((d, i) => <WhiteChip key={i}>{d}</WhiteChip>)}
              </div>
            )}
          </div>

          {/* Step-level diffs */}
          {prevSteps !== null && stepDiff.length > 0 && (
            <div>
              <GroupLabel className="mb-2">Step changes</GroupLabel>
              <ul className="m-0 p-0 flex flex-col gap-2">
                {stepDiff.map((d, i) => (
                  <li key={i} className="list-none rounded-[12px] bg-white px-4 py-2.5" style={{ border: `1px solid ${HAIR}` }}>
                    <p className="m-0 text-[12.5px] mb-0.5" style={{ color: MUTED }}>{STEP_DIFF_LABEL[d.type]} · step {d.step}</p>
                    <p className="m-0 text-[14px] leading-[1.45]" style={{ color: INK }}>{d.action}</p>
                    {d.prevAction && <p className="m-0 mt-0.5 text-[13px] line-through leading-[1.4]" style={{ color: FAINT }}>{d.prevAction}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {prevSteps !== null && stepDiff.length === 0 && (
            <p className="m-0 text-[13px]" style={{ color: MUTED }}>Step actions unchanged</p>
          )}

          <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>
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
    return <div className="py-24"><Spinner /></div>
  }

  if (runs.length === 0) {
    return (
      <div className="px-6 py-6 flex flex-col gap-10 pb-16 max-w-[1100px]">
        <div className="flex flex-col items-center gap-3 py-12 px-8 text-center">
          <p className="m-0 text-[15px]" style={{ color: MUTED }}>No analysis runs yet.</p>
          <button type="button" onClick={onGoToMission} className={ghostBtn} style={{ color: INK }}>Go to Mission control</button>
        </div>
        <div>
          <SectionLabel title="Case activity" />
          <ActivityFeed resourceId={caseId} emptyText="No activity on this case yet." />
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 py-6 flex flex-col gap-10 pb-16 max-w-[1100px]">
      <div>
        <SectionLabel title="Case activity" />
        <ActivityFeed resourceId={caseId} emptyText="No activity on this case yet." />
      </div>
      <div>
      <SectionLabel title="Analysis runs" count={runs.length}>
        {runs.length >= 2 && <span className="text-[13px]" style={{ color: MUTED }}>Newest first</span>}
        {runs.filter(r => !r.pinned).length > 15 && (
          <Btn
            level="tertiary"
            size="xs"
            onClick={async () => { setPruning(true); try { await onPrune() } finally { setPruning(false) } }}
            disabled={pruning}
            loading={pruning}
            title="Delete unpinned runs beyond the 15 most recent. Pinned runs are always kept."
          >
            Prune old runs
          </Btn>
        )}
      </SectionLabel>
      <div className="flex flex-col gap-3">

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
          <div key={run.id} className="rounded-[16px] bg-white overflow-hidden" style={{ border: `1px solid ${HAIR}` }}>
            {/* Run header */}
            <div className="px-5 py-4">
              <div className="flex items-start justify-between gap-3 mb-2.5 flex-wrap">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-[14px] font-medium" style={{ color: INK }}>{ts}</span>
                  {run.triggered_by && <span className="text-[13px] truncate" style={{ color: MUTED }}>by {run.triggered_by}</span>}
                  {isCurrent && <Chip>Current</Chip>}
                  {run.pinned && !isCurrent && <Chip>Pinned</Chip>}
                  {run.run_status === 'failed' && <Chip>Failed</Chip>}
                  {run.run_status === 'partial' && <Chip>Partial</Chip>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-[13px]" style={{ color: MUTED }}>
                  {durationS && <span className="tabular-nums">{durationS}</span>}
                  {modelLabel && <span>{modelLabel}</span>}
                  <button
                    type="button"
                    onClick={() => onPinToggle(run.id, !run.pinned)}
                    title={run.pinned ? 'Unpin run. It becomes eligible for pruning.' : 'Pin run. Pinned runs are never pruned.'}
                    aria-label={run.pinned ? 'Unpin run' : 'Pin run'}
                    aria-pressed={run.pinned}
                    className="flex items-center justify-center w-7 h-7 rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]"
                    style={{ color: run.pinned ? INK : FAINT }}
                  >
                    {run.pinned ? <Pin size={13} strokeWidth={2} /> : <PinOff size={13} strokeWidth={2} />}
                  </button>
                </div>
              </div>

              {/* Stats line */}
              <p className="m-0 mb-2.5 text-[13px] flex flex-wrap gap-x-4 gap-y-1" style={{ color: MUTED }}>
                {[
                  { v: run.threads_included,    l: 'threads'     },
                  { v: run.messages_included,   l: 'messages'    },
                  { v: run.attachments_count,   l: 'attachments' },
                  { v: run.steps_count,         l: 'steps'       },
                  { v: run.citations_count,     l: 'citations'   },
                  { v: run.missing_items_count, l: 'blockers'    },
                  { v: run.evidence_count,      l: 'evidence'    },
                ].map(({ v, l }) => (
                  <span key={l}><span className="font-medium tabular-nums" style={{ color: INK }}>{v}</span> {l}</span>
                ))}
                {run.gdrive_docs_count > 0 && (
                  <span><span className="font-medium tabular-nums" style={{ color: INK }}>{run.gdrive_docs_count}</span> Drive docs</span>
                )}
                {(run.gemini_tokens ?? 0) > 0 && (
                  <span className="tabular-nums">{((run.gemini_tokens ?? 0) + (run.claude_tokens ?? 0)).toLocaleString()} tokens</span>
                )}
              </p>

              {/* Diff vs. previous */}
              {diffs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {diffs.map((d, di) => <Chip key={di}>{d}</Chip>)}
                </div>
              )}

              {/* Truncation flags */}
              {run.truncation_flags?.length > 0 && (
                <ul className="m-0 p-0 mb-2.5 flex flex-col gap-1">
                  {run.truncation_flags.map((f, fi) => <DotRow key={fi} className="text-[13px]">{f}</DotRow>)}
                </ul>
              )}

              {/* Error message for failed runs */}
              {run.run_status === 'failed' && run.error_message && (
                <div className="mb-2.5 px-4 py-3 rounded-[12px]" style={{ background: FIELD }}>
                  <GroupLabel className="mb-1">Error</GroupLabel>
                  <p className="m-0 text-[12.5px] font-mono leading-[1.5] break-all" style={{ color: BODY }}>{run.error_message}</p>
                </div>
              )}

              {/* Raw section viewer toggle — not available for failed runs */}
              {run.run_status !== 'failed' ? (
                <button
                  type="button"
                  onClick={() => loadRaw(run.id)}
                  disabled={isLoadingRaw}
                  aria-expanded={isExpanded}
                  className={ghostBtn}
                  style={{ color: MUTED }}
                >
                  {isLoadingRaw && <Loader2 size={12} strokeWidth={2} className="animate-spin" />}
                  {isExpanded ? 'Hide raw sections' : 'Show raw sections'}
                  <ChevronDown size={12} strokeWidth={2} className={cn('transition-transform', isExpanded && 'rotate-180')} />
                </button>
              ) : (
                <span className="text-[13px]" style={{ color: MUTED }}>No analysis data. The run failed before completion.</span>
              )}
            </div>

            {/* Raw JSON viewer */}
            {isExpanded && rawJson[run.id] && (
              <div style={{ borderTop: `1px solid ${HAIR}`, background: HOVER }}>
                <pre className="m-0 px-5 py-3 text-[12px] leading-relaxed overflow-x-auto max-h-96 font-mono" style={{ color: BODY }}>
                  {rawJson[run.id]}
                </pre>
              </div>
            )}
          </div>
        )
      })}
      </div>
      </div>
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
    <div className="rounded-[16px]" style={{ background: FIELD }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left bg-transparent border-0 cursor-pointer"
      >
        <span className="text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>
          Analysis metadata
          {(meta.truncation_flags?.length ?? 0) > 0 && (
            <span className="ml-2 text-[13px] font-normal tabular-nums" style={{ color: FAINT }}>{meta.truncation_flags.length} flag{meta.truncation_flags.length > 1 ? 's' : ''}</span>
          )}
        </span>
        <ChevronDown size={14} strokeWidth={2} className={cn('transition-transform', open && 'rotate-180')} style={{ color: FAINT }} />
      </button>

      {open && (
        <div className="px-5 pb-5 pt-4 flex flex-col gap-4" style={{ borderTop: `1px solid ${HAIR}` }}>
          <dl className="m-0 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            <MetaStat label="Run at" value={ts} />
            <MetaStat label="Synthesis" value={meta.synthesis_model} />
            <MetaStat label="Strategy" value={meta.strategy_model} />
            <MetaStat label="Threads" value={String(meta.threads_included)} />
            <MetaStat label="Messages" value={String(meta.messages_included)} />
            <MetaStat label="Synthesis tokens" value={meta.synthesis_tokens ? meta.synthesis_tokens.toLocaleString() : '—'} />
            {meta.strategy_tokens && <MetaStat label="Strategy tokens" value={meta.strategy_tokens.toLocaleString()} />}
          </dl>

          {meta.attachments_included?.length > 0 && (
            <div>
              <GroupLabel className="mb-1.5">Attachments processed</GroupLabel>
              <ul className="m-0 p-0 flex flex-col gap-1">
                {meta.attachments_included.map((a, i) => (
                  <li key={i} className="list-none flex items-center gap-3 text-[13.5px]">
                    <span className="flex-1 min-w-0 truncate" style={{ color: BODY }}>{a.filename}</span>
                    <span className="flex-shrink-0 text-[12.5px]" style={{ color: MUTED }}>{METHOD_LABEL[a.method] ?? a.method}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {meta.gdrive_docs?.length > 0 && (
            <div>
              <GroupLabel className="mb-1.5">Knowledge base documents</GroupLabel>
              <ul className="m-0 p-0 flex flex-col gap-1">
                {meta.gdrive_docs.map((d, i) => <li key={i} className="list-none text-[13.5px]" style={{ color: BODY }}>{d}</li>)}
              </ul>
            </div>
          )}

          {meta.truncation_flags?.length > 0 && (
            <div>
              <GroupLabel className="mb-1.5">Quality flags</GroupLabel>
              <ul className="m-0 p-0 flex flex-col gap-1">
                {meta.truncation_flags.map((f, i) => <DotRow key={i} className="text-[13.5px]">{f}</DotRow>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="m-0 text-[12.5px]" style={{ color: MUTED }}>{label}</dt>
      <dd className="m-0 text-[14px] font-medium truncate" style={{ color: INK }}>{value}</dd>
    </div>
  )
}

// ── Threads Overview Card ─────────────────────────────────────────────────────

function ThreadsOverviewCard({
  threads, attachmentRecords, onAddThread, onUnlink, onUpdatePartyType, onRunAnalysis, analyzing,
}: {
  threads:           CaseThread[]
  attachmentRecords: AttachmentRecord[]
  onAddThread:       () => void
  onUnlink:          (t: string) => void
  onUpdatePartyType: (t: string, p: string) => void
  onRunAnalysis:     (threadIds?: string[]) => void
  analyzing:         boolean
}) {
  const [expanded, setExpanded] = useState(false)
  // Which threads to include in a re-run (defaults to all; resets when the set changes).
  const threadKey = threads.map(t => t.thread_id).join(',')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(threads.map(t => t.thread_id)))
  useEffect(() => { setSelected(new Set(threads.map(t => t.thread_id))) }, [threadKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSelected = selected.size === threads.length

  const extracted = attachmentRecords.filter(a => a.parsed_at !== null).length
  const pending   = threads.filter(ct => ct.attachments_pending && ct.attachments_extracted === 0).length

  if (threads.length === 0) return null

  return (
    <div>
      <SectionLabel title="Linked threads" count={threads.length}>
        {(extracted > 0 || pending > 0) && (
          <span className="text-[13px] tabular-nums" style={{ color: MUTED }}>
            {extracted > 0 && `${extracted} attachment${extracted !== 1 ? 's' : ''} extracted`}
            {extracted > 0 && pending > 0 && ' · '}
            {pending > 0 && `${pending} pending`}
          </span>
        )}
        <Btn level="secondary" size="xs" onClick={onAddThread}>Link threads</Btn>
      </SectionLabel>

      <div className="rounded-[16px] bg-white overflow-hidden" style={{ border: `1px solid ${HAIR}` }}>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-transparent border-0 cursor-pointer text-left hover:bg-[#f8f9fa]"
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            {threads.slice(0, 5).map(ct => {
              const name = ct.thread?.contact ? contactName(ct.thread.contact) : ct.party_label ?? ct.party_type
              return (
                <span key={ct.id} className="inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap leading-4" style={{ background: partyField(ct.party_type), color: BODY }}>
                  {name.length > 16 ? name.slice(0, 16) + '…' : name}
                </span>
              )
            })}
            {threads.length > 5 && <span className="text-[13px]" style={{ color: MUTED }}>{threads.length - 5} more</span>}
          </div>
          <ChevronDown size={14} strokeWidth={2} className={cn('flex-shrink-0 transition-transform', expanded && 'rotate-180')} style={{ color: FAINT }} />
        </button>

        {expanded && (
          <>
            <div style={{ borderTop: `1px solid ${HAIR}` }}>
              {threads.map((ct, i) => (
                <div key={ct.id} className="flex items-start gap-3 px-4 py-3" style={{ borderTop: i === 0 ? 'none' : `1px solid ${HAIR}` }}>
                  <input
                    type="checkbox"
                    checked={selected.has(ct.thread_id)}
                    onChange={() => toggle(ct.thread_id)}
                    className="mt-4 accent-[#202124] flex-shrink-0"
                    title="Include this thread in the next analysis"
                    aria-label="Include this thread in the next analysis"
                  />
                  <div className="flex-1 min-w-0">
                    <LinkedThreadCard ct={ct} onUnlink={onUnlink} onUpdatePartyType={onUpdatePartyType} />
                  </div>
                </div>
              ))}
            </div>
            {/* Re-run on the ticked subset — uncheck emails, then re-analyse this group */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap" style={{ borderTop: `1px solid ${HAIR}`, background: HOVER }}>
              <span className="text-[13px] tabular-nums" style={{ color: MUTED }}>
                {selected.size} of {threads.length} thread{threads.length === 1 ? '' : 's'} selected
                {!allSelected && <button type="button" onClick={() => setSelected(new Set(threads.map(t => t.thread_id)))} className={cn(ghostBtn, 'ml-2')} style={{ color: INK }}>Select all</button>}
              </span>
              <Btn
                level="secondary"
                onClick={() => onRunAnalysis(allSelected ? undefined : Array.from(selected))}
                disabled={analyzing || selected.size === 0}
                loading={analyzing}
              >
                {analyzing ? 'Analysing…' : allSelected ? 'Re-analyse all' : `Re-analyse ${selected.size} selected`}
              </Btn>
            </div>
          </>
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
    return <div className="py-16"><Spinner /></div>
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 px-8 text-center">
        <p className="m-0 text-[15px] max-w-[320px] leading-[1.6]" style={{ color: MUTED }}>No messages yet. Link email threads on Mission control to see every message here.</p>
        <button type="button" onClick={onGoToMission} className={ghostBtn} style={{ color: INK }}>Go to Mission control</button>
      </div>
    )
  }

  return (
    <div className="px-6 py-6 flex flex-col gap-3 pb-16 max-w-[1100px]">
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
  const contact = ct.thread?.contact ?? null
  const msgCount = ct.messages.length

  const metaLine = [
    `${msgCount} message${msgCount !== 1 ? 's' : ''}`,
    ct.attachments_extracted > 0 ? `${ct.attachments_extracted} attachment${ct.attachments_extracted !== 1 ? 's' : ''} extracted` : null,
    ct.attachments_pending && ct.attachments_extracted === 0 ? 'attachments pending' : null,
    fmtDate(ct.thread?.last_message_at),
  ].filter(Boolean).join(' · ')

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-[12px] bg-white flex-wrap" style={{ border: `1px solid ${HAIR}` }}>
      {/* Main content */}
      <div className="flex-1 min-w-0 basis-[240px]">
        <div className="flex items-center gap-2 mb-0.5 min-w-0">
          <PartyChip party={ct.party_type} className="flex-shrink-0" />
          <span className="text-[14px] font-medium truncate" style={{ color: INK }}>{contact ? contactName(contact) : '—'}</span>
          {contact?.company && <span className="text-[13px] truncate" style={{ color: MUTED }}>· {contact.company}</span>}
        </div>
        <p className="m-0 text-[13.5px] truncate" style={{ color: BODY }}>{ct.thread?.subject ?? '(no subject)'}</p>
        <p className="m-0 mt-1 text-[12.5px]" style={{ color: MUTED }}>{metaLine}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <select
          value={ct.party_type}
          onChange={e => onUpdatePartyType(ct.thread_id, e.target.value)}
          onClick={e => e.stopPropagation()}
          aria-label="Party type"
          className="h-8 rounded-[8px] px-2 text-[13px] bg-white outline-none cursor-pointer focus:border-[#202124]"
          style={{ border: `1px solid ${CTRL}`, color: INK }}
        >
          {PARTY_TYPES.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <a
          href={`/engagement?lead=${ct.thread_id}`}
          onClick={e => e.stopPropagation()}
          className="text-[13px] font-medium no-underline underline-offset-4 hover:underline whitespace-nowrap"
          style={{ color: INK }}
          title="Open this conversation in Engagement"
        >
          Open
        </a>
        <button
          type="button"
          onClick={() => onUnlink(ct.thread_id)}
          className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]"
          style={{ color: FAINT }}
          title="Remove from case"
          aria-label="Remove from case"
        >
          <X size={13} strokeWidth={2} />
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
    <div className="rounded-[16px] px-5 py-4" style={{ background: FIELD }}>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <span className="text-[14px] font-medium" style={{ color: INK }}>Attachment coverage</span>
        {pendingThreads.length > 0 && (
          <span className="text-[13px] tabular-nums" style={{ color: MUTED }}>
            {pendingThreads.length} thread{pendingThreads.length > 1 ? 's' : ''} pending extraction
          </span>
        )}
      </div>

      {ext === 0 && pendingThreads.length === 0 ? (
        <p className="m-0 text-[14px]" style={{ color: MUTED }}>No attachments in the linked threads.</p>
      ) : (
        <div className="flex items-center gap-6 flex-wrap">
          <dl className="m-0 flex items-center gap-6">
            <div>
              <dd className="m-0 text-[24px] font-medium tabular-nums leading-none tracking-[-0.02em]" style={{ color: INK }}>{ext}</dd>
              <dt className="m-0 text-[12.5px] mt-1" style={{ color: MUTED }}>Extracted</dt>
            </div>
            {pendingThreads.length > 0 && (
              <div>
                <dd className="m-0 text-[24px] font-medium tabular-nums leading-none tracking-[-0.02em]" style={{ color: INK }}>{pendingThreads.length}</dd>
                <dt className="m-0 text-[12.5px] mt-1" style={{ color: MUTED }}>Pending</dt>
              </div>
            )}
          </dl>
          {ext > 0 && (
            <div className="flex flex-wrap gap-1.5 ml-auto">
              {byType.pdf   > 0 && <WhiteChip>PDF {byType.pdf} </WhiteChip>}
              {byType.docx  > 0 && <WhiteChip>DOCX {byType.docx} </WhiteChip>}
              {byType.xlsx  > 0 && <WhiteChip>XLSX {byType.xlsx} </WhiteChip>}
              {byType.image > 0 && <WhiteChip>Image {byType.image} </WhiteChip>}
              {other        > 0 && <WhiteChip>Other {other} </WhiteChip>}
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
  const party = msg.direction === 'outbound' ? 'trs' : msg.party_type
  const who = msg.direction === 'outbound' ? 'TRS' : msg.party_label

  return (
    <div
      className="rounded-[16px] bg-white cursor-pointer hover:bg-[#f8f9fa]"
      style={{ border: `1px solid ${HAIR}` }}
      onClick={() => setOpen(v => !v)}
      role="button"
      aria-expanded={open}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 justify-between flex-wrap">
            <span className="flex items-center gap-2 min-w-0">
              <PartyChip party={party} />
              <span className="text-[14px] font-medium truncate" style={{ color: INK }}>{who}</span>
              {msg.subject && <span className="text-[13px] truncate" style={{ color: MUTED }}>· {msg.subject}</span>}
            </span>
            <span className="text-[12.5px] flex-shrink-0" style={{ color: MUTED }}>{fmtDate(msg.sent_at)}</span>
          </div>
          {!open && (
            <p className="m-0 mt-1 text-[13.5px] leading-[1.5] line-clamp-2" style={{ color: BODY }}>
              {(msg.body_text ?? '').slice(0, 200)}
            </p>
          )}
          {msg.has_attachments && <span className="inline-block mt-1.5"><Chip>Attachments</Chip></span>}
        </div>
        <ChevronDown size={14} strokeWidth={2} className={cn('flex-shrink-0 transition-transform mt-1', open && 'rotate-180')} style={{ color: FAINT }} />
      </div>
      {open && (
        <div className="px-4 pb-4" style={{ borderTop: `1px solid ${HAIR}` }}>
          <p className="m-0 mt-3 text-[14px] leading-[1.7] whitespace-pre-wrap" style={{ color: BODY }}>
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

  // Find the thread for this step's party type
  const matchingThread = threads.find(ct => ct.party_type === step.party_type) ?? null

  return (
    <div className="rounded-[16px] bg-white overflow-hidden" style={{ border: `1px solid ${HAIR}` }}>
      {/* Step header */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start gap-3 justify-between mb-2 flex-wrap">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <span className="text-[14px] font-medium tabular-nums flex-shrink-0" style={{ color: FAINT }}>{step.step}</span>
            <span className="text-[14px] font-medium truncate" style={{ color: INK }}>{step.action}</span>
          </div>
          <Chip className="flex-shrink-0">{priorityLabel(step.priority)}</Chip>
        </div>

        {/* Party */}
        <div className="flex items-center gap-2 mb-2">
          <PartyChip party={step.party_type} />
          <span className="text-[13px] truncate" style={{ color: MUTED }}>{step.party_name}</span>
        </div>

        {/* Intent */}
        <p className="m-0 text-[14px] leading-[1.55] mb-1" style={{ color: BODY }}>{step.intent}</p>

        {/* Reasoning */}
        {step.reasoning && <p className="m-0 text-[13px] leading-[1.5]" style={{ color: MUTED }}>{step.reasoning}</p>}

        {/* To/CC preview */}
        {(step.to_emails?.length > 0 || step.cc_emails?.length > 0) && (
          <dl className="m-0 mt-2 flex flex-col gap-0.5">
            {step.to_emails?.length > 0 && <KFact label="To" value={step.to_emails.join(', ')} />}
            {step.cc_emails?.length > 0 && <KFact label="Cc" value={step.cc_emails.join(', ')} />}
          </dl>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 pb-4 flex gap-2">
        <Btn level="secondary" onClick={() => setComposeOpen(v => !v)} aria-expanded={composeOpen}>
          {composeOpen ? 'Hide draft' : 'Open draft'}
        </Btn>
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
      <div className="px-5 py-5 flex flex-col items-center gap-2" style={{ borderTop: `1px solid ${HAIR}` }}>
        <p className="m-0 text-[14px] font-medium" style={{ color: INK }}>Email sent</p>
        <button type="button" onClick={onClose} className={ghostBtn} style={{ color: MUTED }}>Close</button>
      </div>
    )
  }

  const rowLabel = 'text-[12.5px] w-14 flex-shrink-0'
  const rowInput = 'flex-1 min-w-0 h-9 rounded-[8px] px-3 text-[14px] bg-white outline-none focus:border-[#202124]'

  return (
    <div style={{ borderTop: `1px solid ${HAIR}` }}>
      <div className="px-5 pt-4 pb-3 flex flex-col gap-2">
        {/* From */}
        {senders.length > 1 && (
          <label className="flex items-center gap-2">
            <span className={rowLabel} style={{ color: MUTED }}>From</span>
            <select value={fromEmail} onChange={e => setFromEmail(e.target.value)} className={rowInput} style={{ border: `1px solid ${CTRL}`, color: INK }}>
              {senders.map(s => <option key={s.email} value={s.email}>{s.label || s.email}</option>)}
            </select>
          </label>
        )}

        {/* To */}
        <label className="flex items-center gap-2">
          <span className={rowLabel} style={{ color: MUTED }}>To</span>
          <input value={toList} onChange={e => setToList(e.target.value)} className={rowInput} style={{ border: `1px solid ${CTRL}`, color: INK }} />
        </label>

        {/* CC */}
        <label className="flex items-center gap-2">
          <span className={rowLabel} style={{ color: MUTED }}>Cc</span>
          <input value={ccList} onChange={e => setCcList(e.target.value)} className={rowInput} style={{ border: `1px solid ${CTRL}`, color: INK }} />
        </label>

        {/* Subject */}
        <label className="flex items-center gap-2">
          <span className={rowLabel} style={{ color: MUTED }}>Subject</span>
          <input value={subject} onChange={e => setSubject(e.target.value)} className={rowInput} style={{ border: `1px solid ${CTRL}`, color: INK }} />
        </label>

        {/* Signature selector */}
        {signatures.length > 0 && (
          <label className="flex items-center gap-2">
            <span className={rowLabel} style={{ color: MUTED }}>Signature</span>
            <select value={selectedSigId} onChange={e => setSelectedSigId(e.target.value)} className={rowInput} style={{ border: `1px solid ${CTRL}`, color: INK }}>
              <option value="">No signature</option>
              {signatures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Rich editor */}
      <div className="px-5 pb-3" style={{ borderTop: `1px solid ${HAIR}` }}>
        <RichEditor
          key={editorKey}
          initialHtml={draftHtml}
          onChange={setDraftHtml}
          minHeight={120}
        />
      </div>

      {/* Actions */}
      <div className="px-5 pb-4 pt-3 flex items-center gap-3 flex-wrap" style={{ borderTop: `1px solid ${HAIR}` }}>
        {error && <p className="m-0 flex-1 text-[13px] truncate" style={{ color: BODY }}>{error}</p>}
        <div className="flex gap-2 ml-auto">
          <Btn level="secondary" onClick={onClose}>Cancel</Btn>
          {/* Email compose surface: the send button keeps TRS navy. */}
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !toList.trim()}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-white text-[13.5px] font-medium border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
            style={{ background: NAVY }}
          >
            {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} strokeWidth={2} />}
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Nexus Compose Window (Gmail-style floating) ───────────────────────────────

type UserSignature = {
  id:              string
  name:            string
  title:           string | null
  phone:           string | null
  email:           string | null
  company_tagline: string | null
  sending_email:   string | null
}

function NexusComposeWindow({
  state, onClose,
}: {
  state:   ComposeState
  onClose: () => void
}) {
  const [to,         setTo]         = useState(state.to)
  const [cc,         setCc]         = useState(state.cc)
  const [subject,    setSubject]    = useState(state.subject)
  const [bodyHtml,   setBodyHtml]   = useState(plainToHtml(state.body))
  const [minimized,  setMinimized]  = useState(false)
  const [expanded,   setExpanded]   = useState(false)
  const [signatures, setSignatures] = useState<UserSignature[]>([])
  const [sigId,      setSigId]      = useState<string | null>(null)
  const [sending,    setSending]    = useState(false)
  const [sent,       setSent]       = useState(false)
  const [sendError,  setSendError]  = useState<string | null>(null)
  const [showCc,     setShowCc]     = useState(!!state.cc)

  useEffect(() => {
    fetch('/api/signatures').then(r => r.ok ? r.json() : []).then((sigs: UserSignature[]) => {
      setSignatures(sigs)
    }).catch(() => {})
  }, [])

  async function handleSend() {
    if (!to.trim()) return
    setSending(true); setSendError(null)
    try {
      const ccList = cc.split(',').map(s => s.trim()).filter(Boolean)
      const res = await fetch('/api/email/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          draftId:       state.draftId,
          htmlBody:      bodyHtml,
          toEmail:       to.trim(),
          cc:            ccList.length ? ccList : undefined,
          customSubject: subject.trim() || undefined,
          signatureId:   sigId ?? undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Send failed')
      setSent(true)
      setTimeout(() => onClose(), 2000)
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const barBtn = 'w-7 h-7 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer text-white/70 hover:text-white hover:bg-white/10'

  // Minimised tab bar
  if (minimized) {
    return (
      <div className="fixed bottom-0 right-6 z-50 flex items-center gap-3 pl-4 pr-2 py-2 rounded-t-[12px] cursor-pointer select-none text-white" style={{ background: INK, boxShadow: 'var(--shadow-panel)' }}>
        <span className="text-[13.5px] font-medium truncate max-w-[220px]" onClick={() => setMinimized(false)}>
          {subject || 'New message'}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMinimized(false)} className={barBtn} title="Restore" aria-label="Restore"><Maximize2 size={12} /></button>
          <button type="button" onClick={onClose} className={barBtn} title="Close" aria-label="Close"><X size={12} /></button>
        </div>
      </div>
    )
  }

  const panelW = expanded ? 'w-[680px] max-w-[calc(100vw-48px)]' : 'w-[520px] max-w-[calc(100vw-48px)]'
  const panelH = expanded ? 'h-[600px]' : 'h-[460px]'

  return (
    <div className={cn('fixed bottom-0 right-6 z-50 flex flex-col bg-white rounded-t-[16px] overflow-hidden', panelW, panelH)} style={{ boxShadow: 'var(--shadow-modal)' }}>
      {/* Title bar */}
      <div className="flex items-center justify-between pl-4 pr-2 py-2 flex-shrink-0 select-none text-white" style={{ background: INK }} onDoubleClick={() => setMinimized(true)}>
        <span className="text-[13.5px] font-medium truncate flex-1 mr-3">{subject || 'New message'}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMinimized(true)} className={barBtn} title="Minimise" aria-label="Minimise"><Minus size={12} /></button>
          <button type="button" onClick={() => setExpanded(v => !v)} className={barBtn} title={expanded ? 'Restore' : 'Expand'} aria-label={expanded ? 'Restore' : 'Expand'}>
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button type="button" onClick={onClose} className={barBtn} title="Close" aria-label="Close"><X size={12} /></button>
        </div>
      </div>

      {/* Field rows — dividers only, no outer border */}
      <div className="flex flex-col flex-shrink-0 bg-white">
        {/* To */}
        <label className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: `1px solid ${HAIR}` }}>
          <span className="text-[12.5px] w-14 flex-shrink-0" style={{ color: MUTED }}>To</span>
          <input
            value={to}
            onChange={e => setTo(e.target.value)}
            className="flex-1 min-w-0 text-[14px] bg-transparent outline-none border-0 placeholder:text-[#80868b]"
            style={{ color: INK }}
            placeholder="recipient@example.com"
          />
          {!showCc && (
            <button type="button" onClick={() => setShowCc(true)} className={cn(ghostBtn, 'flex-shrink-0')} style={{ color: MUTED }}>Cc</button>
          )}
        </label>

        {/* CC (toggle) */}
        {showCc && (
          <label className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: `1px solid ${HAIR}` }}>
            <span className="text-[12.5px] w-14 flex-shrink-0" style={{ color: MUTED }}>Cc</span>
            <input
              value={cc}
              onChange={e => setCc(e.target.value)}
              className="flex-1 min-w-0 text-[14px] bg-transparent outline-none border-0 placeholder:text-[#80868b]"
              style={{ color: INK }}
              placeholder="cc@example.com, …"
            />
          </label>
        )}

        {/* Subject */}
        <label className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: `1px solid ${HAIR}` }}>
          <span className="text-[12.5px] w-14 flex-shrink-0" style={{ color: MUTED }}>Subject</span>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="flex-1 min-w-0 text-[14px] bg-transparent outline-none border-0 placeholder:text-[#80868b]"
            style={{ color: INK }}
            placeholder="Subject"
          />
        </label>
      </div>

      {/* Body — RichEditor */}
      <div className="flex-1 overflow-hidden px-4 py-3 bg-white min-h-0">
        <RichEditor
          initialHtml={bodyHtml}
          onChange={setBodyHtml}
          borderless
          minHeight={140}
        />
      </div>

      {/* Send error */}
      {sendError && (
        <p className="m-0 px-4 py-2 text-[13px] flex-shrink-0" style={{ color: BODY, background: FIELD }}>{sendError}</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white flex-shrink-0" style={{ borderTop: `1px solid ${HAIR}` }}>
        <div className="flex items-center gap-2 min-w-0">
          {signatures.length > 0 && (
            <select
              value={sigId ?? ''}
              onChange={e => setSigId(e.target.value || null)}
              aria-label="Signature"
              className="h-8 max-w-[200px] rounded-[8px] px-2 text-[13px] bg-transparent border-0 outline-none cursor-pointer hover:bg-[#f1f3f4]"
              style={{ color: MUTED }}
            >
              <option value="">No signature</option>
              {signatures.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Btn level="tertiary" onClick={onClose}>Discard</Btn>
          {/* Email compose surface: the send button keeps TRS navy. */}
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || sent || !to.trim()}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-white text-[13.5px] font-medium border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            style={{ background: sent ? INK : NAVY }}
          >
            {sent ? 'Sent' : sending ? <><Loader2 size={12} className="animate-spin" /> Sending…</> : <><Send size={12} /> Send</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Thread Linker Modal ───────────────────────────────────────────────────────

function ThreadLinkerModal({
  caseId, linkedThreadIds, linkedThreads, onLink, onClose,
}: { caseId: string; linkedThreadIds: string[]; linkedThreads: CaseThread[]; onLink: () => void; onClose: () => void }) {
  const [unlinking, setUnlinking] = useState<string | null>(null)
  async function unlink(threadId: string) {
    setUnlinking(threadId)
    try {
      await fetch(`/api/nexus/cases/${caseId}/threads?thread_id=${threadId}`, { method: 'DELETE' })
      onLink()
    } finally { setUnlinking(null) }
  }
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

  const groupRow = (label: string, count?: number) => (
    <tr>
      <td colSpan={5} className="px-4 pt-4 pb-1.5 text-[12.5px] font-medium" style={{ color: MUTED }}>
        {label}{count !== undefined && <span className="ml-1.5 tabular-nums" style={{ color: FAINT }}>{count}</span>}
      </td>
    </tr>
  )

  const ThreadTableRow = ({ thread, isSuggested }: { thread: ThreadSuggestion; isSuggested: boolean }) => {
    const alreadyLinked = linkedThreadIds.includes(thread.id)
    const isSelected    = selected.has(thread.id)
    const pty           = partyTypes[thread.id] ?? 'client'

    return (
      <tr
        className={cn('transition-colors', alreadyLinked ? 'opacity-50 cursor-default' : 'cursor-pointer hover:bg-[#f8f9fa]')}
        style={{ borderTop: `1px solid ${HAIR}`, background: isSelected && !alreadyLinked ? FIELD : undefined }}
        onClick={() => !alreadyLinked && toggleSelect(thread.id)}
        aria-selected={isSelected}
      >
        {/* Checkbox */}
        <td className="px-4 py-3 w-10 align-top">
          {alreadyLinked ? (
            <Chip>Linked</Chip>
          ) : (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelect(thread.id)}
              onClick={e => e.stopPropagation()}
              aria-label="Select thread"
              className="w-4 h-4 accent-[#202124] cursor-pointer mt-0.5"
            />
          )}
        </td>

        {/* Contact */}
        <td className="py-3 pr-3 min-w-0 max-w-[160px] align-top">
          <p className="m-0 text-[14px] font-medium truncate" style={{ color: INK }}>{thread.contact ? contactName(thread.contact) : '—'}</p>
          {thread.contact?.company && <p className="m-0 text-[12.5px] truncate" style={{ color: MUTED }}>{thread.contact.company}</p>}
        </td>

        {/* Subject */}
        <td className="py-3 pr-3 min-w-0 align-top">
          <p className="m-0 text-[14px] truncate" style={{ color: BODY }}>{thread.subject ?? '(no subject)'}</p>
          {isSuggested && <p className="m-0 text-[12.5px] truncate" style={{ color: MUTED }}>{thread.match_reason}</p>}
        </td>

        {/* Date */}
        <td className="py-3 pr-3 text-[13px] whitespace-nowrap align-top" style={{ color: MUTED }}>
          {fmtDate(thread.last_message_at)}
        </td>

        {/* Party type */}
        <td className="py-2.5 pr-4 w-[150px] align-top" onClick={e => e.stopPropagation()}>
          {alreadyLinked ? (
            <span className="text-[13px]" style={{ color: MUTED }}>Already linked</span>
          ) : (
            <div className="flex flex-col gap-1.5">
              <select
                value={pty}
                onChange={e => setPartyTypes(prev => ({ ...prev, [thread.id]: e.target.value }))}
                aria-label="Party type"
                className="h-8 w-full rounded-[8px] px-2 text-[13px] bg-white outline-none cursor-pointer focus:border-[#202124]"
                style={{ border: `1px solid ${CTRL}`, color: INK }}
              >
                {PARTY_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
              <input
                value={labels[thread.id] ?? ''}
                onChange={e => setLabels(prev => ({ ...prev, [thread.id]: e.target.value }))}
                placeholder="Label, e.g. QBE Marine"
                aria-label="Party label"
                className="h-8 w-full rounded-[8px] px-2 text-[13px] bg-white outline-none focus:border-[#202124] placeholder:text-[#80868b]"
                style={{ border: `1px solid ${CTRL}`, color: INK }}
              />
            </div>
          )}
        </td>
      </tr>
    )
  }

  const th = 'py-2.5 pr-3 text-left text-[12px] font-medium'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(32,33,36,0.4)' }} onClick={onClose}>
      <div
        className="bg-white rounded-[16px] w-full max-w-[800px] flex flex-col overflow-hidden max-h-[calc(85vh/var(--ui-zoom))]"
        style={{ boxShadow: 'var(--shadow-modal)', color: INK }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Link threads"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4 flex-shrink-0">
          <h2 className="m-0 text-[20px] font-medium tracking-[-0.02em]" style={{ color: INK }}>Link threads</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}>
            <X size={15} />
          </button>
        </div>

        {/* Search + bulk action bar */}
        <div className="flex items-center gap-3 px-6 pb-4 flex-shrink-0 flex-wrap" style={{ borderBottom: `1px solid ${HAIR}` }}>
          <label className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: FAINT }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search subject, contact or company"
              aria-label="Search threads"
              autoFocus
              className={cn(inputCls, 'pl-9 pr-9')}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}>
                <X size={13} />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={linkSelected}
            disabled={addCount === 0 || linking}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] text-white text-[14px] font-medium border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 whitespace-nowrap"
            style={{ background: INK }}
          >
            {linking && <Loader2 size={13} className="animate-spin" />}
            {addCount > 0 ? `Add ${addCount} thread${addCount > 1 ? 's' : ''}` : 'Add threads'}
          </button>
        </div>

        {/* Thread table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <Spinner label="Loading conversations…" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[640px]">
                <thead className="sticky top-0 bg-white" style={{ boxShadow: `inset 0 -1px 0 ${HAIR}` }}>
                  <tr style={{ color: MUTED }}>
                    <th className="px-4 py-2.5 text-left w-10"></th>
                    <th className={th}>Contact</th>
                    <th className={th}>Subject</th>
                    <th className={th}>Date</th>
                    <th className={cn(th, 'pr-4')}>Party</th>
                  </tr>
                </thead>
                <tbody>
                  {!search && linkedThreads.length > 0 && (
                    <>
                      {groupRow('Already in this case', linkedThreads.length)}
                      {linkedThreads.map(ct => (
                        <tr key={`linked-${ct.thread_id}`} style={{ borderTop: `1px solid ${HAIR}` }}>
                          <td className="px-4 py-3 w-10 align-top"><Chip>Linked</Chip></td>
                          <td className="py-3 pr-3 max-w-[160px] align-top"><p className="m-0 text-[14px] font-medium truncate" style={{ color: INK }}>{ct.thread?.contact ? contactName(ct.thread.contact) : (ct.party_label ?? '—')}</p></td>
                          <td className="py-3 pr-3 min-w-0 align-top"><p className="m-0 text-[14px] truncate" style={{ color: BODY }}>{ct.thread?.subject ?? '(no subject)'}</p></td>
                          <td className="py-3 pr-3 text-[13px] whitespace-nowrap align-top" style={{ color: MUTED }}>{fmtDate(ct.thread?.last_message_at ?? null)}</td>
                          <td className="py-3 pr-4 w-[150px] align-top">
                            <div className="flex items-center justify-between gap-2">
                              <PartyChip party={ct.party_type} />
                              <button type="button" onClick={() => unlink(ct.thread_id)} disabled={unlinking === ct.thread_id} className={ghostBtn} style={{ color: MUTED }}>
                                {unlinking === ct.thread_id ? '…' : 'Unlink'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                  {suggestedRows.length > 0 && !search && (
                    <>
                      {groupRow('Suggested, by contact and subject', suggestedRows.length)}
                      {suggestedRows.map(t => <ThreadTableRow key={t.id} thread={t} isSuggested />)}
                      {groupRow('All recent conversations')}
                    </>
                  )}
                  {restRows.map(t => <ThreadTableRow key={t.id} thread={t} isSuggested={false} />)}
                  {restRows.length === 0 && suggestedRows.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-12 text-[15px]" style={{ color: MUTED }}>
                      {search ? 'No threads match.' : 'No threads available.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-3 flex-shrink-0 flex-wrap" style={{ borderTop: `1px solid ${HAIR}` }}>
          <div className="flex items-center gap-3">
            <p className="m-0 text-[13px] tabular-nums" style={{ color: MUTED }}>
              {addCount > 0 ? `${addCount} thread${addCount > 1 ? 's' : ''} selected` : 'Select rows to add'}
            </p>
            {addCount > 0 && (
              <button type="button" onClick={() => setSelected(new Set())} className={ghostBtn} style={{ color: INK }}>Clear</button>
            )}
          </div>
          <Btn level="secondary" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  )
}
