'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, AlertCircle, CheckCircle, Sparkles,
  Newspaper, Rocket, RefreshCw, ChevronDown, ChevronUp,
  Mail, Users, BarChart2, FileText, Pause, Play, GitBranch, X, Send,
} from 'lucide-react'
import { Tip } from '@/components/Tip'
import { RichEditor, plainToHtml } from '@/components/RichEditor'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/status-badge'
import type { AppStatus } from '@/components/status-badge'
import { StatCard } from '@/components/stat-card'
import { AppScrollPage } from '@/components/app-shell'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string; name: string; status: string
  news_url: string | null; news_headline: string | null; news_summary: string | null
  lead_count: number; sent_count: number; reply_count: number
  instantly_campaign_id: string | null; created_at: string
  brief_required?: boolean; variant_mode?: boolean
  metadata?: Record<string, unknown> | null
}

interface UserSignature {
  id: string; name: string; title: string | null; phone: string | null
  email: string | null; company_tagline: string | null
}

interface AnalyticsSummary {
  total_active: number; total_sent: number; total_replied: number
  total_bounced: number; positive_replies: number
  reply_rate_pct: number; positive_rate_pct: number
}

interface VariantStep {
  id: string; variant_id: string; step_number: number
  subject: string; body: string; delay_days: number; status: string
}

interface SequenceVariant {
  id: string; variant_label: string; ab_dimension: string | null
  ab_group: 'control' | 'variant' | null
  status: string; is_winner: boolean; audience_split_pct: number | null
  steps: VariantStep[]
}

interface Sequence {
  id: string; campaign_id: string; step_number: number
  subject: string; body: string; delay_days: number; status: 'draft' | 'approved'
}

interface CampaignLead {
  id: string
  campaign_id: string
  lead_id: string
  segment_id: string | null
  approval_status: string
  send_status: string
  created_at: string
  outbound_leads: {
    id: string; full_name: string | null; email: string | null
    current_title: string | null; current_company: string | null
    opt_out: boolean
  } | null
  ob_campaign_segments: { id: string; name: string } | null
  score: {
    overall_score: number | null
    score_reasoning: string | null
  } | null
}

interface CampaignBrief {
  id: string
  campaign_id: string
  version_number: number
  status: 'draft' | 'approved' | 'superseded'
  products: unknown[]
  target_segments: unknown[]
  approved_signal_ids: unknown[]
  messaging_goals: Record<string, unknown>
  constraints: Record<string, unknown>
  approved_at: string | null
  created_at: string
}

type Tab = 'sequence' | 'leads' | 'brief' | 'variants' | 'analytics'

// ── Shared input class ─────────────────────────────────────────────────────────

const INPUT_CLS = 'w-full h-9 px-3 text-[13px] text-foreground bg-background border border-input rounded-md outline-none focus:ring-1 focus:ring-ring disabled:bg-muted/30'
const FIELD_LABEL_CLS = 'text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.04em]'

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const params = useParams()
  const id     = params.id as string

  const [campaign,      setCampaign]      = useState<Campaign | null>(null)
  const [campaignLeads, setCampaignLeads] = useState<CampaignLead[]>([])
  const [brief,         setBrief]         = useState<CampaignBrief | null>(null)
  const [tab,           setTab]           = useState<Tab>('sequence')

  const [loading,        setLoading]        = useState(true)
  const [drafting,       setDrafting]       = useState(false)
  const [launching,      setLaunching]      = useState(false)
  const [savingSeqs,     setSavingSeqs]     = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [successMsg,     setSuccessMsg]     = useState<string | null>(null)
  const [expandedStep,   setExpandedStep]   = useState<number | null>(1)
  const [localSeqs,      setLocalSeqs]      = useState<Sequence[]>([])
  const [launchConfirm,  setLaunchConfirm]  = useState(false)
  const [fetchingLeads,  setFetchingLeads]  = useState(false)
  const [togglingLeads,  setTogglingLeads]  = useState<string[]>([])
  const [fetchingBrief,  setFetchingBrief]  = useState(false)
  const [briefSaving,    setBriefSaving]    = useState(false)
  const [briefApproving, setBriefApproving] = useState(false)
  const [briefGoal,         setBriefGoal]         = useState('')
  const [briefAudience,     setBriefAudience]     = useState('')
  const [briefTone,         setBriefTone]         = useState('')
  const [briefAvoid,        setBriefAvoid]        = useState('')
  const [briefProducts,     setBriefProducts]     = useState<{ id: string; product_code: string; product_name: string; priority: number }[]>([])
  const [briefSegments,     setBriefSegments]     = useState<{ id: string; name: string; description: string | null }[]>([])
  const [variants,       setVariants]       = useState<SequenceVariant[]>([])
  const [fetchingVariants, setFetchingVariants] = useState(false)
  const [generatingVariants, setGeneratingVariants] = useState(false)
  const [expandedVariant, setExpandedVariant] = useState<string | null>(null)
  const [analytics,         setAnalytics]         = useState<AnalyticsSummary | null>(null)
  const [analyticsSegments, setAnalyticsSegments] = useState<{ segment_id: string; name: string; total: number; sent: number; replied: number }[]>([])
  const [fetchingAnalytics, setFetchingAnalytics] = useState(false)
  const [aiUsage,           setAiUsage]           = useState<{ calls: number; total_tokens: number; prompt_tokens: number; output_tokens: number } | null>(null)
  const [pausing,        setPausing]        = useState(false)
  const [sendMode,       setSendMode]       = useState<'all' | 'batch'>('all')
  const [batchSize,      setBatchSize]      = useState(5)
  const [sendingNow,     setSendingNow]     = useState(false)
  const [signatures,     setSignatures]     = useState<UserSignature[]>([])
  const [signatureId,    setSignatureId]    = useState<string>('')
  const [savingSig,      setSavingSig]      = useState(false)
  const [segments,         setSegments]         = useState<{ id: string; name: string; description: string | null }[]>([])
  const [newSegmentName,   setNewSegmentName]   = useState('')
  const [addingSegment,    setAddingSegment]    = useState(false)
  const [deletingSegment,  setDeletingSegment]  = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/outbound/campaigns/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Not found')
      setCampaign(data.campaign)
      setLocalSeqs(data.sequences ?? [])
      setSignatureId(String(data.campaign?.metadata?.signature_id ?? ''))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/signatures')
      .then(r => r.ok ? r.json() : [])
      .then(rows => setSignatures(Array.isArray(rows) ? rows : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (tab !== 'leads') return
    setFetchingLeads(true)
    Promise.all([
      fetch(`/api/outbound/campaigns/${id}/leads`).then(r => r.json()),
      fetch(`/api/outbound/campaigns/${id}/segments`).then(r => r.json()),
    ])
      .then(([leadsData, segsData]) => {
        setCampaignLeads(Array.isArray(leadsData) ? leadsData : [])
        setSegments(Array.isArray(segsData) ? segsData : [])
      })
      .catch(() => {})
      .finally(() => setFetchingLeads(false))
  }, [tab, id])

  useEffect(() => {
    if (tab !== 'variants') return
    setFetchingVariants(true)
    fetch(`/api/outbound/campaigns/${id}/variants`)
      .then(r => r.json())
      .then(data => setVariants(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setFetchingVariants(false))
  }, [tab, id])

  useEffect(() => {
    if (tab !== 'analytics') return
    setFetchingAnalytics(true)
    Promise.all([
      fetch(`/api/outbound/campaigns/${id}/analytics`).then(r => r.json()),
      fetch('/api/outbound/ai-usage').then(r => r.json()),
    ])
      .then(([analyticsData, aiData]) => {
        setAnalytics(analyticsData.summary ?? null)
        setAnalyticsSegments(Array.isArray(analyticsData.segments) ? analyticsData.segments : [])
        const campAi = Array.isArray(aiData.per_campaign)
          ? aiData.per_campaign.find((c: { campaign_id: string | null }) => c.campaign_id === id)
          : null
        setAiUsage(campAi ?? null)
      })
      .catch(() => {})
      .finally(() => setFetchingAnalytics(false))
  }, [tab, id])

  useEffect(() => {
    if (tab !== 'brief') return
    setFetchingBrief(true)
    fetch(`/api/outbound/campaigns/${id}/brief`)
      .then(r => r.json())
      .then(data => {
        const b: CampaignBrief | null = data.brief ?? null
        setBrief(b)
        setBriefProducts(Array.isArray(data.products) ? data.products : [])
        setBriefSegments(Array.isArray(data.segments) ? data.segments : [])
        if (b) {
          const mg = (typeof b.messaging_goals === 'object' && b.messaging_goals !== null ? b.messaging_goals : {}) as Record<string, unknown>
          const cn = (typeof b.constraints     === 'object' && b.constraints     !== null ? b.constraints     : {}) as Record<string, unknown>
          setBriefGoal(String(mg.goal ?? mg.primary_goal ?? ''))
          setBriefAudience(String(mg.target_audience ?? ''))
          setBriefTone(String(cn.tone ?? ''))
          setBriefAvoid(Array.isArray(cn.avoid) ? (cn.avoid as string[]).join(', ') : String(cn.avoid ?? ''))
        }
      })
      .catch(() => {})
      .finally(() => setFetchingBrief(false))
  }, [tab, id])

  // ── Draft sequences ───────────────────────────────────────────────────────

  async function draftSequences() {
    setDrafting(true); setError(null)
    try {
      const res  = await fetch(`/api/outbound/campaigns/${id}/draft`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ leadIds: [] }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'BRIEF_REQUIRED') {
          setError('A brief must be approved before generating drafts. Go to the Brief tab to create and approve one.')
          setTab('brief')
          return
        }
        throw new Error(data.error ?? 'Drafting failed')
      }
      const updated = data.sequences ?? []
      setLocalSeqs(updated)
      setSuccessMsg('AI draft complete — review and edit each step below')
      setExpandedStep(1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Drafting failed')
    } finally { setDrafting(false) }
  }

  // ── Save sequence edits ───────────────────────────────────────────────────

  async function saveSequences() {
    setSavingSeqs(true); setError(null)
    try {
      const res  = await fetch(`/api/outbound/campaigns/${id}/sequences`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sequences: localSeqs }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      if (data.sequences) setLocalSeqs(data.sequences)
      setSuccessMsg('Sequences saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally { setSavingSeqs(false) }
  }

  function updateLocalSeq(seqId: string, field: keyof Sequence, value: string | number) {
    setLocalSeqs(prev => prev.map(s => s.id === seqId ? { ...s, [field]: value } : s))
  }

  function approveStep(seqId: string) {
    updateLocalSeq(seqId, 'status', 'approved')
  }

  async function toggleLeadInclusion(leadId: string, currentStatus: string) {
    const newStatus = currentStatus === 'excluded' ? 'included' : 'excluded'
    setTogglingLeads(prev => [...prev, leadId])
    try {
      await fetch(`/api/outbound/campaigns/${id}/leads`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lead_id: leadId, approval_status: newStatus }),
      })
      setCampaignLeads(prev => prev.map(cl =>
        cl.lead_id === leadId ? { ...cl, approval_status: newStatus } : cl
      ))
    } catch { /* non-fatal */ }
    finally { setTogglingLeads(prev => prev.filter(i => i !== leadId)) }
  }

  // ── Segment management ────────────────────────────────────────────────────

  async function addSegment() {
    if (!newSegmentName.trim()) return
    setAddingSegment(true)
    try {
      const res = await fetch(`/api/outbound/campaigns/${id}/segments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSegmentName.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        setSegments(prev => [...prev, data])
        setNewSegmentName('')
      }
    } catch { /* non-fatal */ }
    finally { setAddingSegment(false) }
  }

  async function deleteSegment(segId: string) {
    setDeletingSegment(segId)
    try {
      const res = await fetch(`/api/outbound/campaigns/${id}/segments`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment_id: segId }),
      })
      if (res.ok) setSegments(prev => prev.filter(s => s.id !== segId))
    } catch { /* non-fatal */ }
    finally { setDeletingSegment(null) }
  }

  // ── Brief actions ─────────────────────────────────────────────────────────

  async function createBrief() {
    setBriefSaving(true); setError(null)
    try {
      const res = await fetch(`/api/outbound/campaigns/${id}/brief`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messaging_goals: { goal: briefGoal, target_audience: briefAudience },
          constraints:     { tone: briefTone, avoid: briefAvoid },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create brief')
      setBrief(data)
      setSuccessMsg('Brief created — review and approve to enable draft generation')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create brief')
    } finally { setBriefSaving(false) }
  }

  async function approveBrief() {
    if (!brief) return
    setBriefApproving(true); setError(null)
    try {
      const res = await fetch(`/api/outbound/campaigns/${id}/brief`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ brief_id: brief.id, approve: true }),
      })
      if (!res.ok) throw new Error('Approval failed')
      setBrief(prev => prev ? { ...prev, status: 'approved', approved_at: new Date().toISOString() } : prev)
      setSuccessMsg('Brief approved — you can now generate AI drafts')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed')
    } finally { setBriefApproving(false) }
  }

  // ── Launch ────────────────────────────────────────────────────────────────

  async function launch() {
    setLaunchConfirm(false); setLaunching(true); setError(null)
    await saveSequences()

    const validLeadIds = campaignLeads
      .filter(cl => cl.approval_status !== 'excluded' && cl.outbound_leads?.email && !cl.outbound_leads?.opt_out)
      .map(cl => cl.lead_id)

    try {
      const res  = await fetch(`/api/outbound/campaigns/${id}/launch`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ leadIds: validLeadIds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Launch failed')

      if (sendMode === 'all') {
        const sendRes = await fetch(`/api/outbound/campaigns/${id}/send-now`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: validLeadIds.length }),
        })
        const sendData = sendRes.ok ? await sendRes.json() : {}
        setSuccessMsg(`Campaign launched! ${sendData.sent ?? 0} emails sent now.`)
      } else {
        setSuccessMsg(`Campaign launched! ${data.leadsQueued} leads queued. Use "Send Now" to send ${batchSize} at a time.`)
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Launch failed')
    } finally { setLaunching(false) }
  }

  // ── Pause / Resume ────────────────────────────────────────────────────────

  async function togglePause() {
    if (!campaign) return
    const action = campaign.status === 'active' ? 'pause' : 'resume'
    setPausing(true); setError(null)
    try {
      const res = await fetch(`/api/outbound/campaigns/${id}/pause`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `${action} failed`)
      setSuccessMsg(`Campaign ${action === 'pause' ? 'paused' : 'resumed'}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally { setPausing(false) }
  }

  // ── Generate variants ─────────────────────────────────────────────────────

  async function generateVariants(abDimension?: string) {
    setGeneratingVariants(true); setError(null)
    try {
      const body: Record<string, unknown> = { variant_count: abDimension ? 2 : 1 }
      if (abDimension) body.ab_dimension = abDimension
      const res  = await fetch(`/api/outbound/campaigns/${id}/variants`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'BRIEF_REQUIRED') { setTab('brief'); return }
        throw new Error(data.error ?? 'Generation failed')
      }
      setVariants(prev => [...prev, ...(data.variants ?? [])])
      setSuccessMsg('Variants generated')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally { setGeneratingVariants(false) }
  }

  // ── Signature ─────────────────────────────────────────────────────────────

  async function saveSignature(newId: string) {
    setSignatureId(newId)
    setSavingSig(true)
    try {
      const currentMeta = (campaign?.metadata ?? {}) as Record<string, unknown>
      await fetch(`/api/outbound/campaigns/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { ...currentMeta, signature_id: newId || null } }),
      })
    } catch { /* non-fatal */ }
    finally { setSavingSig(false) }
  }

  // ── Send Now ──────────────────────────────────────────────────────────────

  async function sendNow() {
    setSendingNow(true); setError(null)
    try {
      const res = await fetch(`/api/outbound/campaigns/${id}/send-now`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: batchSize }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Send failed')
      setSuccessMsg(`Sent ${data.sent} email${data.sent !== 1 ? 's' : ''} now!`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally { setSendingNow(false) }
  }

  async function approveVariant(variantId: string) {
    const res = await fetch(`/api/outbound/campaigns/${id}/variants`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant_id: variantId, action: 'approve' }),
    })
    if (res.ok) {
      setVariants(prev => prev.map(v => v.id === variantId ? { ...v, status: 'approved' } : v))
      setSuccessMsg('Variant approved')
    }
  }

  const allApproved = localSeqs.length > 0 && localSeqs.every(s => s.status === 'approved')
  const hasDraft    = localSeqs.some(s => s.subject || s.body)
  const isActive    = campaign?.status === 'active'
  const isPaused    = campaign?.status === 'paused'

  const briefApproved = brief?.status === 'approved'
  const needsBrief    = campaign?.brief_required && !briefApproved

  // ── Early returns ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 size={20} className="animate-spin text-muted-foreground/40" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="px-8 py-7">
        <p className="text-[14px] text-destructive mb-2">Campaign not found.</p>
        <Link href="/outbound/campaigns" className="text-[13px] text-primary hover:underline">← Back to Campaigns</Link>
      </div>
    )
  }

  const replyRate = campaign.sent_count > 0
    ? Math.round((campaign.reply_count / campaign.sent_count) * 100)
    : 0

  return (
    <AppScrollPage maxWidth="1000px">

      {/* ── Breadcrumb ── */}
      <Link
        href="/outbound/campaigns"
        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground/60 hover:text-muted-foreground no-underline mb-3"
      >
        <ArrowLeft size={12} /> Campaigns
      </Link>

      {/* ── Campaign header ── */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <h1 className="text-[20px] font-bold tracking-tight text-foreground flex-1 min-w-0 m-0">
          {campaign.name}
        </h1>
        <StatusBadge status={campaign.status as AppStatus} />
        {(isActive || isPaused) && (
          <>
            <Button
              size="compact"
              onClick={togglePause}
              disabled={pausing}
              className={cn(
                'gap-1.5',
                isPaused
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white border-0'
                  : 'border-violet-300 text-violet-700 hover:bg-violet-50'
              )}
              variant={isPaused ? 'default' : 'outline'}
            >
              {pausing
                ? <Loader2 size={12} className="animate-spin" />
                : isPaused ? <Play size={12} /> : <Pause size={12} />
              }
              {isPaused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              size="compact"
              onClick={sendNow}
              disabled={sendingNow}
              className="gap-1.5 bg-blue-700 hover:bg-blue-800 text-white border-0"
            >
              {sendingNow
                ? <Loader2 size={12} className="animate-spin" />
                : <Send size={12} />
              }
              {sendingNow ? 'Sending…' : 'Send Now'}
            </Button>
          </>
        )}
      </div>

      {/* ── Compact performance strip ── */}
      {(campaign.sent_count > 0 || campaign.lead_count > 0) && (
        <div className="flex items-center gap-6 px-4 py-3 mb-4 rounded-lg bg-muted/30 border border-border/50 flex-wrap">
          {[
            { label: 'Leads',      value: campaign.lead_count,  highlight: false },
            { label: 'Sent',       value: campaign.sent_count,  highlight: false },
            { label: 'Replies',    value: campaign.reply_count, highlight: campaign.reply_count > 0 },
            ...(campaign.sent_count > 0
              ? [{ label: 'Reply Rate', value: `${replyRate}%`, highlight: replyRate > 0 }]
              : []
            ),
          ].map(m => (
            <div key={m.label} className="flex items-baseline gap-2">
              <span className={cn(
                'text-[22px] font-bold tabular-nums tracking-tight',
                m.highlight ? 'text-emerald-700' : 'text-foreground'
              )}>
                {m.value}
              </span>
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {m.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── News hook ── */}
      {campaign.news_headline && (
        <div className="flex items-start gap-2.5 mt-1 mb-3 px-3.5 py-2.5 rounded-lg bg-emerald-50" style={{ borderLeft: '3px solid rgba(15,138,95,0.45)' }}>
          <Newspaper size={13} className="text-emerald-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[11.5px] font-semibold text-emerald-700 mb-0.5 flex items-center gap-1">
              News Hook <Tip text="The AI uses this article as the opening line in Email 1." />
            </p>
            <p className="text-[12px] text-emerald-700">{campaign.news_headline}</p>
            {campaign.news_summary && (
              <p className="text-[11px] text-emerald-600/70 mt-0.5 leading-relaxed">{campaign.news_summary}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Brief required warning ── */}
      {needsBrief && tab !== 'brief' && (
        <div className="flex items-center gap-2.5 mb-3 px-3.5 py-2.5 rounded-lg bg-amber-50" style={{ borderLeft: '3px solid rgba(194,122,7,0.50)' }}>
          <AlertCircle size={13} className="text-amber-700 flex-shrink-0" />
          <p className="text-[12px] text-amber-800 flex-1 m-0">
            Brief approval required before you can generate AI drafts.
          </p>
          <button
            onClick={() => setTab('brief')}
            className="text-[12px] font-medium text-amber-800 rounded-md px-2.5 py-1 bg-amber-100/60 cursor-pointer hover:bg-amber-100 transition-colors whitespace-nowrap"
          >
            Go to Brief →
          </button>
        </div>
      )}

      {/* ── Error / Success banners ── */}
      {error && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 mb-4 rounded-lg bg-destructive/[0.06] border border-destructive/20 text-destructive text-[13px]">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="bg-transparent border-0 cursor-pointer text-destructive text-[16px] leading-none px-1">×</button>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[13px]">
          <CheckCircle size={14} className="flex-shrink-0" />
          <span className="flex-1">{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="bg-transparent border-0 cursor-pointer text-emerald-700 text-[16px] leading-none px-1">×</button>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="flex border-b border-[--border-subtle] mb-5 overflow-x-auto">
        {([
          { key: 'sequence',  label: 'Sequence',  icon: <Mail size={13} /> },
          { key: 'leads',     label: 'Leads',     icon: <Users size={13} /> },
          { key: 'brief',     label: 'Brief',     icon: <FileText size={13} />, badge: needsBrief },
          ...(campaign.variant_mode
            ? [{ key: 'variants' as Tab, label: 'Variants', icon: <GitBranch size={13} /> }]
            : []
          ),
          { key: 'analytics', label: 'Analytics', icon: <BarChart2 size={13} /> },
        ] as { key: Tab; label: string; icon: React.ReactNode; badge?: boolean }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'inline-flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap relative',
              'px-4 py-2.5 border-0 bg-transparent cursor-pointer',
              'text-[13px] transition-colors border-b-2 -mb-px',
              tab === t.key
                ? 'border-primary text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.icon} {t.label}
            {t.badge && (
              <span className="absolute top-1.5 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          SEQUENCE TAB
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'sequence' && (
        <div>
          {/* Sequence toolbar */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <p className="flex-1 min-w-0 text-[13px] text-muted-foreground m-0">
              {hasDraft
                ? 'Review and edit each step. Approve all steps before launching.'
                : 'Generate AI drafts to get started.'}
            </p>
            <Tip text="The AI writes all 3 email steps using the news hook and lead details. Review and edit each draft before approving — nothing is sent until you click Launch." />
            <Button
              size="compact"
              onClick={draftSequences}
              disabled={drafting || isActive}
              className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white border-0"
            >
              {drafting
                ? <Loader2 size={12} className="animate-spin" />
                : hasDraft ? <RefreshCw size={12} /> : <Sparkles size={12} />
              }
              {drafting ? 'Drafting…' : hasDraft ? 'Redraft All' : 'Generate AI Drafts'}
            </Button>
            {hasDraft && !isActive && (
              <Button variant="outline" size="compact" onClick={saveSequences} disabled={savingSeqs} className="gap-1.5">
                {savingSeqs && <Loader2 size={12} className="animate-spin" />}
                {savingSeqs ? 'Saving…' : 'Save Changes'}
              </Button>
            )}
            {allApproved && !isActive && (
              <>
                <Tip text="Queues all approved leads for Gmail delivery. Emails send at ~30/hour with follow-up steps handled automatically." />
                <Button
                  size="compact"
                  onClick={() => setLaunchConfirm(true)}
                  disabled={launching}
                  className="gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white border-0"
                >
                  {launching ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
                  {launching ? 'Launching…' : 'Launch Campaign'}
                </Button>
              </>
            )}
          </div>

          {/* Step cards */}
          <div className="flex flex-col gap-3">
            {localSeqs.map((seq, i) => {
              const isExpanded = expandedStep === seq.step_number
              const approved   = seq.status === 'approved'
              const stepLabel  = seq.step_number === 1
                ? 'Email 1 — Initial outreach'
                : seq.step_number === 2
                ? 'Email 2 — Follow-up'
                : 'Email 3 — Final touch'
              return (
                <Card key={seq.id} className={cn('overflow-hidden', approved && 'border-emerald-200')}>
                  <button
                    onClick={() => setExpandedStep(isExpanded ? null : seq.step_number)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 bg-transparent border-0 cursor-pointer text-left"
                  >
                    <span className={cn(
                      'w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold',
                      approved
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-muted text-muted-foreground border border-border'
                    )}>
                      {approved ? <CheckCircle size={13} /> : i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="m-0 text-[13px] font-semibold text-foreground flex items-center gap-2 flex-wrap">
                        {stepLabel}
                        {seq.step_number > 1 && (
                          <span className="text-[11px] font-normal text-muted-foreground/60">
                            {seq.delay_days === 0 ? 'Same day' : `+${seq.delay_days}d`}
                          </span>
                        )}
                      </p>
                      {seq.subject && (
                        <p className="m-0 mt-0.5 text-[12px] text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                          Subject: {seq.subject}
                        </p>
                      )}
                    </div>
                    <span className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded flex-shrink-0',
                      approved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    )}>
                      {approved ? 'Approved' : 'Draft'}
                    </span>
                    {isExpanded
                      ? <ChevronUp size={14} className="text-muted-foreground/30 flex-shrink-0" />
                      : <ChevronDown size={14} className="text-muted-foreground/30 flex-shrink-0" />
                    }
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 pt-4 border-t border-border/50">
                      {/* Timing */}
                      {seq.step_number > 1 && (
                        <div className="flex items-center gap-3 mb-4">
                          <label className={cn(FIELD_LABEL_CLS, 'whitespace-nowrap')}>
                            Send after
                          </label>
                          <input
                            type="number" min={1} max={90}
                            value={seq.delay_days}
                            disabled={isActive}
                            onChange={e => updateLocalSeq(seq.id, 'delay_days', parseInt(e.target.value) || 1)}
                            className="w-14 h-8 px-2 text-center text-[13px] text-foreground border border-input rounded-md bg-background outline-none focus:ring-1 focus:ring-ring disabled:bg-muted/30"
                          />
                          <span className="text-[12px] text-muted-foreground">days</span>
                        </div>
                      )}

                      {/* Subject */}
                      <div className="mb-4">
                        <label className={cn(FIELD_LABEL_CLS, 'block mb-1.5')}>
                          Subject Line
                        </label>
                        <input
                          className={INPUT_CLS}
                          placeholder="Subject line…"
                          value={seq.subject}
                          disabled={isActive}
                          onChange={e => updateLocalSeq(seq.id, 'subject', e.target.value)}
                        />
                      </div>

                      {/* Body */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <label className={FIELD_LABEL_CLS}>Email Body</label>
                          <span className="text-[10px] text-amber-600 font-semibold">
                            ⚠ Images &amp; HTML reduce cold-email deliverability
                          </span>
                        </div>
                        {isActive ? (
                          <div
                            className="px-3 py-2.5 text-[13px] border border-border rounded-md bg-muted/30 min-h-[120px] text-foreground leading-relaxed whitespace-pre-wrap"
                            dangerouslySetInnerHTML={{ __html: seq.body }}
                          />
                        ) : (
                          <RichEditor
                            key={seq.id}
                            initialHtml={seq.body.startsWith('<') ? seq.body : plainToHtml(seq.body)}
                            onChange={html => updateLocalSeq(seq.id, 'body', html)}
                            placeholder="Email body… Use {{first_name}} and {{company}} for personalisation."
                            minHeight={160}
                          />
                        )}
                        <p className="text-[11px] text-muted-foreground/40 mt-1.5 flex items-center gap-1 m-0">
                          Tokens: {'{{first_name}}'} · {'{{company}}'}{' '}
                          <Tip text="Gmail replaces these with each lead's first name and company before sending." />
                        </p>
                        {/* Signature preview */}
                        {signatureId && (() => {
                          const sig = signatures.find(s => s.id === signatureId)
                          return sig ? (
                            <div className="mt-2 px-3 py-2.5 rounded-lg bg-muted/30 border border-dashed border-border text-[12px] text-muted-foreground leading-relaxed">
                              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground/40 mb-1">
                                Signature appended at send
                              </p>
                              Best regards,<br />
                              <strong className="text-foreground/70">{sig.name}</strong><br />
                              {[sig.title, sig.phone].filter(Boolean).join(' · ')}
                              {(sig.title || sig.phone) ? <br /> : null}
                              {sig.email && <>{sig.email}<br /></>}
                              {sig.company_tagline && (
                                <span className="text-muted-foreground/40">{sig.company_tagline}</span>
                              )}
                            </div>
                          ) : null
                        })()}
                      </div>

                      {/* Step actions */}
                      {!isActive && !approved && seq.subject && seq.body && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="compact"
                            onClick={() => approveStep(seq.id)}
                            className="gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white border-0"
                          >
                            <CheckCircle size={12} /> Approve Step {seq.step_number}
                          </Button>
                          <Tip text="Marks this email as ready to send. All 3 steps must be approved before the Launch Campaign button appears." />
                        </div>
                      )}
                      {!isActive && approved && (
                        <Button
                          variant="outline"
                          size="compact"
                          onClick={() => updateLocalSeq(seq.id, 'status', 'draft')}
                        >
                          Unapprove
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>

          {localSeqs.length === 0 && (
            <div className="text-center py-8">
              <p className="text-[13px] text-muted-foreground/50">
                No sequences yet — click &ldquo;Generate AI Drafts&rdquo; to start
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          LEADS TAB
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'leads' && (
        <Card>
          <CardContent className="p-5">
            {/* Segment management */}
            <div className="mb-4 pb-4 border-b border-border/50">
              <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">
                Segments
              </p>
              {segments.length > 0 && (
                <div className="flex gap-1.5 mb-2.5 flex-wrap">
                  {segments.map(seg => (
                    <div key={seg.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-muted/70">
                      <span className="text-[11px] text-foreground">{seg.name}</span>
                      <button
                        onClick={() => deleteSegment(seg.id)}
                        disabled={deletingSegment === seg.id}
                        className="text-muted-foreground/40 hover:text-muted-foreground bg-transparent border-0 cursor-pointer p-0 flex"
                      >
                        {deletingSegment === seg.id
                          ? <Loader2 size={10} className="animate-spin" />
                          : <X size={10} />
                        }
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  className="flex-1 h-8 px-3 text-[12px] text-foreground border border-input rounded-md bg-background outline-none focus:ring-1 focus:ring-ring"
                  placeholder="New segment name…"
                  value={newSegmentName}
                  onChange={e => setNewSegmentName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSegment()}
                />
                <Button
                  size="compact"
                  onClick={addSegment}
                  disabled={addingSegment || !newSegmentName.trim()}
                  className="gap-1"
                >
                  {addingSegment ? <Loader2 size={11} className="animate-spin" /> : null}
                  + Add
                </Button>
              </div>
            </div>

            {/* Leads header */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold text-foreground m-0">
                Campaign leads
                {campaignLeads.length > 0 && (
                  <span className="ml-1.5 font-normal text-muted-foreground/60">
                    ({campaignLeads.filter(cl => cl.approval_status !== 'excluded').length} active)
                  </span>
                )}
              </p>
              <Link
                href="/outbound/leads"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-foreground border border-input rounded-md px-2.5 py-1.5 bg-background hover:bg-muted transition-colors no-underline"
              >
                + Add from Lead Database
              </Link>
            </div>

            {/* Leads list */}
            {fetchingLeads ? (
              <div className="flex justify-center py-8">
                <Loader2 size={18} className="animate-spin text-muted-foreground/40" />
              </div>
            ) : campaignLeads.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[13px] text-muted-foreground/60 mb-3">No leads assigned to this campaign yet.</p>
                <Link href="/outbound/leads" className="text-[13px] text-primary hover:underline">
                  Add leads from Lead Database →
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {['Include', 'Name', 'Email', 'Title / Company', 'Status'].map(h => (
                        <th key={h} className="h-9 px-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-[--border-subtle] whitespace-nowrap first:pl-4">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaignLeads.map(cl => {
                      const lead     = cl.outbound_leads
                      const excluded = cl.approval_status === 'excluded'
                      const toggling = togglingLeads.includes(cl.lead_id)
                      return (
                        <tr key={cl.id} className={cn(
                          'border-b border-border/50',
                          excluded ? 'opacity-45' : 'hover:bg-muted/20 transition-colors'
                        )}>
                          <td className="px-3 py-2.5 pl-4 w-10">
                            {toggling
                              ? <Loader2 size={13} className="animate-spin text-muted-foreground/40" />
                              : <input
                                  type="checkbox"
                                  checked={!excluded}
                                  disabled={isActive}
                                  onChange={() => toggleLeadInclusion(cl.lead_id, cl.approval_status)}
                                  className={cn('w-4 h-4', !isActive && 'cursor-pointer')}
                                  title={excluded ? 'Include in campaign' : 'Exclude from campaign'}
                                />
                            }
                          </td>
                          <td className="px-3 py-2.5 text-[13px] font-medium text-foreground whitespace-nowrap">
                            {lead?.full_name || '—'}
                          </td>
                          <td className={cn(
                            'px-3 py-2.5 text-[12px]',
                            lead?.email ? 'text-emerald-700' : 'text-muted-foreground/40'
                          )}>
                            {lead?.email || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-[12px] max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
                            <span className="text-foreground/70">{lead?.current_title || '—'}</span>
                            {lead?.current_company && (
                              <span className="text-muted-foreground/60"> · {lead.current_company}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {!excluded && (
                              <span className={cn(
                                'text-[10px] font-semibold px-2 py-0.5 rounded',
                                (cl.send_status === 'sent' || cl.send_status === 'replied')
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700'
                              )}>
                                {cl.send_status}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════
          BRIEF TAB
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'brief' && (
        <div>
          {fetchingBrief ? (
            <div className="flex justify-center py-12">
              <Loader2 size={18} className="animate-spin text-muted-foreground/40" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Brief status banner */}
              {brief ? (
                <div className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg border',
                  briefApproved
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-amber-50 border-amber-200'
                )}>
                  {briefApproved
                    ? <CheckCircle size={14} className="text-emerald-700 flex-shrink-0" />
                    : <AlertCircle size={14} className="text-amber-700 flex-shrink-0" />
                  }
                  <p className={cn(
                    'text-[13px] flex-1 m-0',
                    briefApproved ? 'text-emerald-700' : 'text-amber-800'
                  )}>
                    {briefApproved
                      ? `Brief v${brief.version_number} approved — AI drafts can be generated.`
                      : `Brief v${brief.version_number} is in draft. Approve it to enable AI draft generation.`
                    }
                  </p>
                  {!briefApproved && (
                    <Button
                      size="compact"
                      onClick={approveBrief}
                      disabled={briefApproving}
                      className="gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white border-0 flex-shrink-0"
                    >
                      {briefApproving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                      {briefApproving ? 'Approving…' : 'Approve Brief'}
                    </Button>
                  )}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <FileText size={28} className="text-muted-foreground/20 mx-auto mb-3" />
                    <p className="text-[15px] font-semibold text-foreground/70 mb-1">No brief yet</p>
                    <p className="text-[13px] text-muted-foreground/60">
                      Create a brief to define messaging goals before AI draft generation.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Products & Segments context */}
              {(briefProducts.length > 0 || briefSegments.length > 0) && (
                <div className="flex gap-3 flex-wrap">
                  {briefProducts.length > 0 && (
                    <Card className="flex-1 min-w-[200px]">
                      <CardContent className="p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground/55 mb-2.5">
                          Products
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {briefProducts.map(p => (
                            <div key={p.id} className="flex items-center gap-2">
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-violet-50 text-violet-700 whitespace-nowrap">
                                {p.product_code}
                              </span>
                              <span className="text-[13px] text-foreground">{p.product_name}</span>
                              {p.priority === 1 && (
                                <span className="text-[10px] text-muted-foreground/50 ml-auto">primary</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {briefSegments.length > 0 && (
                    <Card className="flex-1 min-w-[200px]">
                      <CardContent className="p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground/55 mb-2.5">
                          Segments
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {briefSegments.map(s => (
                            <div key={s.id}>
                              <span className="text-[13px] text-foreground font-medium">{s.name}</span>
                              {s.description && (
                                <p className="text-[11px] text-muted-foreground/60 mt-0.5">{s.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Brief form */}
              <Card>
                <CardContent className="p-5">
                  <p className="text-[13px] font-semibold text-foreground mb-4">
                    {brief
                      ? `${briefApproved ? 'Approved brief' : 'Edit draft brief'} v${brief.version_number}`
                      : 'New brief'
                    }
                  </p>
                  <div className="flex flex-col gap-4 mb-5">
                    {([
                      {
                        label: 'Campaign Goal',
                        tip: 'What do you want recipients to do? e.g. Book a 15-min call to discuss cyber insurance.',
                        placeholder: 'e.g. Book a 15-min discovery call to discuss cyber insurance coverage',
                        value: briefGoal, set: setBriefGoal,
                      },
                      {
                        label: 'Target Audience',
                        tip: 'Who are we targeting? Be specific — industry, seniority, geography.',
                        placeholder: 'e.g. SME founders and business owners in Singapore',
                        value: briefAudience, set: setBriefAudience,
                      },
                      {
                        label: 'Tone',
                        tip: 'How should the emails sound?',
                        placeholder: 'e.g. Professional, direct, not salesy',
                        value: briefTone, set: setBriefTone,
                      },
                      {
                        label: 'Topics to Avoid',
                        tip: 'Anything the AI should steer clear of — pricing, competitor names, regulatory details.',
                        placeholder: 'e.g. Pricing discussion, competitor names',
                        value: briefAvoid, set: setBriefAvoid,
                      },
                    ] as { label: string; tip: string; placeholder: string; value: string; set: (v: string) => void }[]).map(f => (
                      <div key={f.label}>
                        <label className={cn(FIELD_LABEL_CLS, 'flex items-center gap-1.5 mb-1.5')}>
                          {f.label} <Tip text={f.tip} />
                        </label>
                        <input
                          type="text"
                          className={INPUT_CLS}
                          placeholder={f.placeholder}
                          value={f.value}
                          disabled={briefApproved}
                          onChange={e => f.set(e.target.value)}
                        />
                      </div>
                    ))}
                  </div>

                  {!briefApproved && (
                    <div className="flex gap-2.5">
                      <Button size="compact" onClick={createBrief} disabled={briefSaving} className="gap-1.5">
                        {briefSaving && <Loader2 size={12} className="animate-spin" />}
                        {briefSaving ? 'Saving…' : brief ? 'Create New Version' : 'Create Brief'}
                      </Button>
                      {brief && !briefApproved && (
                        <Button
                          size="compact"
                          onClick={approveBrief}
                          disabled={briefApproving}
                          className="gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white border-0"
                        >
                          {briefApproving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                          {briefApproving ? 'Approving…' : 'Approve'}
                        </Button>
                      )}
                    </div>
                  )}
                  {briefApproved && (
                    <Button
                      variant="outline"
                      size="compact"
                      onClick={createBrief}
                      disabled={briefSaving}
                      className="gap-1.5"
                    >
                      {briefSaving ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      {briefSaving ? 'Creating…' : 'Create New Version'}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Sender signature */}
              <Card>
                <CardContent className="p-5">
                  <p className="text-[13px] font-semibold text-foreground mb-3">Sender Signature</p>
                  <select
                    value={signatureId}
                    onChange={e => saveSignature(e.target.value)}
                    className="w-full h-9 px-3 text-[13px] text-foreground bg-background border border-input rounded-md outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">No signature</option>
                    {signatures.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.title ? ` — ${s.title}` : ''}
                      </option>
                    ))}
                  </select>
                  {savingSig && (
                    <p className="text-[11px] text-muted-foreground/50 mt-1.5">Saving…</p>
                  )}
                  {signatureId && (() => {
                    const sig = signatures.find(s => s.id === signatureId)
                    return sig ? (
                      <div className="mt-3 px-3.5 py-3 rounded-lg bg-muted/30 border border-border text-[12px] text-muted-foreground leading-relaxed">
                        Best regards,<br />
                        <strong className="text-foreground/80">{sig.name}</strong><br />
                        {[sig.title, sig.phone].filter(Boolean).join(' · ')}
                        {(sig.title || sig.phone) && <br />}
                        {sig.email && <>{sig.email}<br /></>}
                        {sig.company_tagline && (
                          <span className="text-muted-foreground/50">{sig.company_tagline}</span>
                        )}
                      </div>
                    ) : null
                  })()}
                  <p className="text-[11px] text-muted-foreground/40 mt-2.5">
                    Appended to all emails sent from this campaign. Manage signatures in{' '}
                    <Link href="/settings" className="text-muted-foreground/70 underline hover:text-foreground">
                      Settings
                    </Link>.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          VARIANTS TAB
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'variants' && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <p className="text-[13px] text-muted-foreground m-0">
              AI-generated sequence variants. Approve one to use it in the campaign.
            </p>
            <div className="flex gap-2">
              <Button
                size="compact"
                onClick={() => generateVariants()}
                disabled={generatingVariants}
                className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white border-0"
              >
                {generatingVariants ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {generatingVariants ? 'Generating…' : 'Generate'}
              </Button>
              <Button
                variant="outline"
                size="compact"
                onClick={() => generateVariants('subject_line')}
                disabled={generatingVariants}
              >
                A/B Subject Lines
              </Button>
              <Button
                variant="outline"
                size="compact"
                onClick={() => generateVariants('opening_hook')}
                disabled={generatingVariants}
              >
                A/B Opening Hooks
              </Button>
            </div>
          </div>

          {fetchingVariants ? (
            <div className="flex justify-center py-12">
              <Loader2 size={18} className="animate-spin text-muted-foreground/40" />
            </div>
          ) : variants.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <GitBranch size={28} className="text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-[15px] font-semibold text-foreground/70 mb-1">No variants yet</p>
                <p className="text-[13px] text-muted-foreground/60">
                  Generate a standard variant or an A/B test to get started.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {variants.map(v => {
                const isExpanded = expandedVariant === v.id
                const approved   = v.status === 'approved'
                return (
                  <Card key={v.id} className={cn('overflow-hidden', approved && 'border-emerald-200')}>
                    <button
                      onClick={() => setExpandedVariant(isExpanded ? null : v.id)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 bg-transparent border-0 cursor-pointer text-left"
                    >
                      <span className={cn(
                        'w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center text-[13px] font-bold',
                        approved
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-muted text-muted-foreground border border-border'
                      )}>
                        {v.variant_label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold text-foreground">
                            Variant {v.variant_label}
                          </span>
                          {v.ab_dimension && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-violet-50 text-violet-700">
                              A/B: {v.ab_dimension.replace('_', ' ')}
                            </span>
                          )}
                          {v.ab_group && (
                            <span className="text-[10px] text-muted-foreground/60">{v.ab_group}</span>
                          )}
                          {v.audience_split_pct != null && v.audience_split_pct < 100 && (
                            <span className="text-[10px] text-muted-foreground/60">
                              {v.audience_split_pct}% audience
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5 m-0">{v.steps.length} steps</p>
                      </div>
                      <span className={cn(
                        'text-[10px] font-semibold px-2 py-0.5 rounded flex-shrink-0',
                        approved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      )}>
                        {approved ? 'Approved' : 'Draft'}
                      </span>
                      {isExpanded
                        ? <ChevronUp size={14} className="text-muted-foreground/30 flex-shrink-0" />
                        : <ChevronDown size={14} className="text-muted-foreground/30 flex-shrink-0" />
                      }
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border/50 px-5 py-4">
                        {v.steps.map(step => (
                          <div key={step.id} className="mb-4 pb-4 border-b border-border/40 last:border-b-0 last:mb-0 last:pb-0">
                            <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-muted-foreground/50 mb-1.5">
                              Step {step.step_number}
                              {step.delay_days > 0 && (
                                <span className="font-normal"> · +{step.delay_days}d</span>
                              )}
                            </p>
                            <p className="text-[13px] font-semibold text-foreground mb-1">{step.subject}</p>
                            <p className="text-[12px] text-foreground/70 leading-relaxed whitespace-pre-wrap m-0">
                              {step.body}
                            </p>
                          </div>
                        ))}
                        {!approved && (
                          <Button
                            size="compact"
                            onClick={() => approveVariant(v.id)}
                            className="mt-3 gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white border-0"
                          >
                            <CheckCircle size={12} /> Approve Variant {v.variant_label}
                          </Button>
                        )}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          ANALYTICS TAB
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'analytics' && (
        <div>
          {fetchingAnalytics ? (
            <div className="flex justify-center py-12">
              <Loader2 size={18} className="animate-spin text-muted-foreground/40" />
            </div>
          ) : analytics ? (
            <>
              {/* Metrics grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <StatCard label="Active Leads"     value={analytics.total_active} accent="blue" />
                <StatCard label="Sent"             value={analytics.total_sent} />
                <StatCard
                  label="Replies"
                  value={analytics.total_replied}
                  accent={analytics.total_replied > 0 ? 'green' : undefined}
                />
                <StatCard
                  label="Reply Rate"
                  value={`${analytics.reply_rate_pct}%`}
                  accent={analytics.reply_rate_pct > 0 ? 'green' : undefined}
                />
                <StatCard
                  label="Positive Replies"
                  value={analytics.positive_replies}
                  accent={analytics.positive_replies > 0 ? 'green' : undefined}
                />
                <StatCard
                  label="Positive Rate"
                  value={`${analytics.positive_rate_pct}%`}
                  accent={analytics.positive_rate_pct > 0 ? 'green' : undefined}
                />
                <StatCard
                  label="Bounced"
                  value={analytics.total_bounced}
                  accent={analytics.total_bounced > 0 ? 'red' : undefined}
                />
              </div>

              {/* Segment breakdown */}
              {analyticsSegments.length > 0 && (
                <Card className="mb-3">
                  <CardContent className="p-5">
                    <p className="text-[13px] font-semibold text-foreground mb-3">Segment breakdown</p>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            {['Segment', 'Leads', 'Sent', 'Replied', 'Reply rate'].map(h => (
                              <th key={h} className="h-9 px-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-[--border-subtle] first:pl-4 whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsSegments.map(seg => (
                            <tr key={seg.segment_id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                              <td className="px-3 py-2.5 pl-4 text-[13px] text-foreground">{seg.name}</td>
                              <td className="px-3 py-2.5 text-[13px] text-muted-foreground">{seg.total}</td>
                              <td className="px-3 py-2.5 text-[13px] text-muted-foreground">{seg.sent}</td>
                              <td className={cn(
                                'px-3 py-2.5 text-[13px]',
                                seg.replied > 0 ? 'text-emerald-700 font-semibold' : 'text-muted-foreground'
                              )}>
                                {seg.replied}
                              </td>
                              <td className="px-3 py-2.5 text-[13px] text-muted-foreground">
                                {seg.sent > 0 ? `${Math.round((seg.replied / seg.sent) * 100)}%` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* AI usage */}
              {aiUsage && (
                <Card className="mb-3">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-1.5 mb-3">
                      <Sparkles size={13} className="text-violet-600" />
                      <p className="text-[13px] font-semibold text-foreground m-0">AI Usage</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Draft Calls',   value: aiUsage.calls },
                        { label: 'Total Tokens',  value: aiUsage.total_tokens >= 1000 ? `${(aiUsage.total_tokens / 1000).toFixed(1)}k` : String(aiUsage.total_tokens) },
                        { label: 'Output Tokens', value: aiUsage.output_tokens >= 1000 ? `${(aiUsage.output_tokens / 1000).toFixed(1)}k` : String(aiUsage.output_tokens) },
                      ].map(s => (
                        <div key={s.label} className="text-center px-3 py-2.5 rounded-lg bg-violet-50 border border-violet-100">
                          <p className="text-[18px] font-bold text-violet-700 m-0 mb-0.5">{s.value}</p>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600/60 m-0">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground/40 mt-3 text-right m-0">
                      <Link href="/outbound/ai-usage" className="text-violet-600 hover:text-violet-700 no-underline">
                        View full AI usage →
                      </Link>
                    </p>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-2 justify-end mb-2">
                <Link
                  href={`/outbound/replies?campaign_id=${id}`}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-foreground border border-input rounded-md px-2.5 py-1.5 bg-background hover:bg-muted transition-colors no-underline"
                >
                  Review Replies →
                </Link>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <BarChart2 size={32} className="text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-[15px] font-semibold text-foreground/70 mb-1">Analytics available after launch</p>
                <p className="text-[13px] text-muted-foreground/60">
                  Approve all sequence steps and launch the campaign to see reply tracking here.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Launch confirm modal ── */}
      {launchConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
        >
          <div className="bg-background rounded-[14px] p-7 max-w-[460px] w-[90%] shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
            <p className="text-[16px] font-bold text-foreground mb-4">Launch Campaign</p>

            <div className="flex flex-col gap-2 mb-4">
              <label className={cn(
                'flex gap-3 items-start cursor-pointer px-3.5 py-3 rounded-lg border',
                sendMode === 'all'
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-border bg-muted/20'
              )}>
                <input
                  type="radio"
                  checked={sendMode === 'all'}
                  onChange={() => setSendMode('all')}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-[13px] font-semibold text-foreground m-0">Send all now</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5 m-0">
                    All leads get emailed immediately after launch
                  </p>
                </div>
              </label>
              <label className={cn(
                'flex gap-3 items-start cursor-pointer px-3.5 py-3 rounded-lg border',
                sendMode === 'batch'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-border bg-muted/20'
              )}>
                <input
                  type="radio"
                  checked={sendMode === 'batch'}
                  onChange={() => setSendMode('batch')}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-foreground m-0">Send in batches</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5 m-0">
                    Queue all leads, use &ldquo;Send Now&rdquo; to send a batch at a time
                  </p>
                  {sendMode === 'batch' && (
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-[12px] text-muted-foreground">Batch size:</span>
                      <input
                        type="number" min={1} max={500}
                        value={batchSize}
                        onChange={e => setBatchSize(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-[70px] h-8 px-2 text-center text-[13px] text-foreground border border-input rounded-md bg-background outline-none focus:ring-1 focus:ring-ring"
                      />
                      <span className="text-[12px] text-muted-foreground">emails per &ldquo;Send Now&rdquo;</span>
                    </div>
                  )}
                </div>
              </label>
            </div>

            <div className="px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 mb-5">
              <p className="text-[12px] text-emerald-700 leading-relaxed m-0">
                Sends from your configured ops email. Opt-outs are excluded. Pause the campaign from the header if needed.
              </p>
            </div>

            <div className="flex gap-2.5 justify-end">
              <Button variant="outline" size="compact" onClick={() => setLaunchConfirm(false)}>
                Cancel
              </Button>
              <Button
                size="compact"
                onClick={launch}
                disabled={launching}
                className="gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white border-0"
              >
                {launching ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
                {launching ? 'Launching…' : 'Confirm Launch'}
              </Button>
            </div>
          </div>
        </div>
      )}

    </AppScrollPage>
  )
}
