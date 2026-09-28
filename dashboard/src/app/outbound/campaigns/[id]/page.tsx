'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ChevronDown, ChevronUp, X } from 'lucide-react'
import { Tip } from '@/components/Tip'
import { RichEditor, plainToHtml } from '@/components/RichEditor'
import { Button } from '@/components/ui/button'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/status-badge'
import type { AppStatus } from '@/components/status-badge'
import { StatCard } from '@/components/stat-card'
import { Chip, inputCls } from '@/components/crm/primitives'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'

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

const INPUT_CLS = `${inputCls} disabled:bg-[#f8f9fa] disabled:text-[#5f6368]`
const FIELD_LABEL_CLS = 'text-[12.5px] text-[#5f6368]'

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
      setSuccessMsg('Drafts ready. Review and edit each step below.')
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
      setSuccessMsg('Brief created. Approve it to enable draft generation.')
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
      setSuccessMsg('Brief approved. Drafts can be generated.')
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
        setSuccessMsg(`Campaign launched. ${sendData.sent ?? 0} emails sent now.`)
      } else {
        setSuccessMsg(`Campaign launched. ${data.leadsQueued} leads queued. Use Send now to send ${batchSize} at a time.`)
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
      setSuccessMsg(`Sent ${data.sent} email${data.sent !== 1 ? 's' : ''}.`)
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
      <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
        <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20" aria-busy="true">
          <span className="block h-3.5 w-24 rounded bg-[#f1f3f4] animate-pulse" />
          <span className="block mt-6 h-9 w-80 rounded bg-[#f1f3f4] animate-pulse" />
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <span key={i} className="block h-[92px] rounded-[16px] bg-[#f1f3f4] animate-pulse" />)}
          </div>
          <span className="block mt-8 h-[200px] rounded-[16px] bg-[#f1f3f4] animate-pulse" />
        </div>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
        <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
          <Link href="/outbound/campaigns" className="inline-flex items-center gap-1.5 text-[14px] no-underline hover:underline" style={{ color: MUTED }}>← Campaigns</Link>
          <p className="mt-8 text-[16px] m-0" style={{ color: MUTED }}>Campaign not found.</p>
        </div>
      </div>
    )
  }

  const replyRate = campaign.sent_count > 0
    ? Math.round((campaign.reply_count / campaign.sent_count) * 100)
    : 0

  // The one filled primary on the page: the campaign's next action. Tab-level
  // actions drop to secondary whenever the header owns the primary.
  const headerPrimary: 'send' | 'resume' | 'launch' | null =
    isActive ? 'send' : isPaused ? 'resume' : (allApproved && !isActive) ? 'launch' : null
  const tabPrimary = headerPrimary ? 'outline' : 'default'

  const cumulativeDay = (stepNumber: number) =>
    localSeqs.filter(s => s.step_number <= stepNumber && s.step_number > 1).reduce((n, s) => n + (s.delay_days || 0), 0)

  const createdLabel = new Date(campaign.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
  const sigCurrent = signatureId ? signatures.find(s => s.id === signatureId) ?? null : null

  const TABS: { key: Tab; label: string; dot?: boolean }[] = [
    { key: 'sequence',  label: 'Sequence' },
    { key: 'leads',     label: 'Leads' },
    { key: 'brief',     label: 'Brief', dot: !!needsBrief },
    ...(campaign.variant_mode ? [{ key: 'variants' as Tab, label: 'Variants' }] : []),
    { key: 'analytics', label: 'Analytics' },
  ]

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">

        <Link href="/outbound/campaigns" className="inline-flex items-center gap-1.5 text-[14px] no-underline hover:underline" style={{ color: MUTED }}>← Campaigns</Link>

        {/* ── Header ── */}
        <div className="mt-4 flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]" style={{ textWrap: 'balance' }}>{campaign.name}</h1>
            <p className="m-0 mt-2 text-[15px] flex items-center gap-2 flex-wrap" style={{ color: MUTED }}>
              <StatusBadge status={campaign.status as AppStatus} />
              <span>Created {createdLabel}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(isActive || isPaused) && (
              <Button variant={headerPrimary === 'resume' ? 'default' : 'outline'} size="lg" onClick={togglePause} disabled={pausing}>
                {pausing ? 'Working…' : isPaused ? 'Resume' : 'Pause'}
              </Button>
            )}
            {(isActive || isPaused) && (
              <Button variant={headerPrimary === 'send' ? 'default' : 'outline'} size="lg" onClick={sendNow} disabled={sendingNow}>
                {sendingNow ? 'Sending…' : 'Send now'}
              </Button>
            )}
            {headerPrimary === 'launch' && (
              <span className="inline-flex items-center gap-1">
                <Button size="lg" onClick={() => setLaunchConfirm(true)} disabled={launching}>
                  {launching ? 'Launching…' : 'Launch campaign'}
                </Button>
                <Tip text="Queues all approved leads for Gmail delivery. Emails send at about 30 an hour; follow-up steps are handled automatically." />
              </span>
            )}
          </div>
        </div>

        {/* ── Stat tiles ── */}
        {(campaign.sent_count > 0 || campaign.lead_count > 0) && (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Leads"      value={campaign.lead_count} />
            <StatCard label="Sent"       value={campaign.sent_count} />
            <StatCard label="Replies"    value={campaign.reply_count} />
            <StatCard label="Reply rate" value={campaign.sent_count > 0 ? `${replyRate}%` : '—'} />
          </div>
        )}

        {/* ── News hook ── */}
        {campaign.news_headline && (
          <div className="mt-6">
            <p className="m-0 text-[12.5px] flex items-center gap-1" style={{ color: MUTED }}>
              News hook <Tip text="The AI uses this article as the opening line in Email 1." />
            </p>
            <p className="m-0 mt-1 text-[14px]" style={{ color: INK }}>{campaign.news_headline}</p>
            {campaign.news_summary && <p className="m-0 mt-1 text-[13px] leading-relaxed" style={{ color: MUTED }}>{campaign.news_summary}</p>}
          </div>
        )}

        {/* ── Notices: plain rows, no tint ── */}
        {needsBrief && tab !== 'brief' && (
          <p className="mt-6 mb-0 text-[14px] flex items-center gap-3 flex-wrap" style={{ color: '#3c4043' }}>
            <span>A brief must be approved before drafts can be generated.</span>
            <button type="button" onClick={() => setTab('brief')} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>Open brief</button>
          </p>
        )}
        {error && (
          <p className="mt-6 mb-0 text-[14px] flex items-center gap-3 flex-wrap" style={{ color: '#3c4043' }} role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>Dismiss</button>
          </p>
        )}
        {successMsg && (
          <p className="mt-6 mb-0 text-[14px] flex items-center gap-3 flex-wrap" style={{ color: MUTED }} role="status">
            <span>{successMsg}</span>
            <button type="button" onClick={() => setSuccessMsg(null)} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>Dismiss</button>
          </p>
        )}

        {/* ── Tabs ── */}
        <div className="mt-8 flex items-center gap-6 overflow-x-auto" role="tablist" style={{ borderBottom: `1px solid ${RULE}` }}>
          {TABS.map(t => {
            const on = tab === t.key
            return (
              <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
                className={cn('relative pb-3 bg-transparent border-0 cursor-pointer text-[15px] whitespace-nowrap inline-flex items-center gap-1.5', on ? 'font-medium' : 'hover:text-[#202124]')}
                style={{ color: on ? INK : MUTED }}>
                {t.label}
                {t.dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#9aa0a6' }} aria-hidden />}
                <span className={cn('absolute left-0 right-0 -bottom-px h-[2px] rounded-full', on ? 'block' : 'hidden')} style={{ background: INK }} aria-hidden />
              </button>
            )
          })}
        </div>

        {/* ══════════════ SEQUENCE TAB ══════════════ */}
        {tab === 'sequence' && (
          <div className="mt-6">
            <div className="flex items-center justify-end gap-2 mb-4 flex-wrap">
              {hasDraft && !isActive && (
                <Button variant="outline" size="sm" onClick={saveSequences} disabled={savingSeqs}>
                  {savingSeqs ? 'Saving…' : 'Save changes'}
                </Button>
              )}
              <span className="inline-flex items-center gap-1">
                <Button variant={tabPrimary} size="sm" onClick={draftSequences} disabled={drafting || isActive}>
                  {drafting ? 'Drafting…' : hasDraft ? 'Redraft all' : 'Generate drafts'}
                </Button>
                <Tip text="The AI writes all 3 email steps using the news hook and lead details. Review and edit each draft before approving; nothing is sent until you launch." />
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {localSeqs.map(seq => {
                const isExpanded = expandedStep === seq.step_number
                const approved   = seq.status === 'approved'
                return (
                  <div key={seq.id} className="rounded-[16px] bg-white overflow-hidden" style={{ border: `1px solid ${RULE}` }}>
                    <button
                      type="button"
                      onClick={() => setExpandedStep(isExpanded ? null : seq.step_number)}
                      aria-expanded={isExpanded}
                      className="w-full flex items-center gap-4 px-6 py-4 bg-transparent border-0 cursor-pointer text-left hover:bg-[#f8f9fa]"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="m-0 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>
                          Step {seq.step_number} · Day {cumulativeDay(seq.step_number)}
                        </p>
                        <p className="m-0 mt-0.5 text-[13px] truncate" style={{ color: MUTED }}>
                          {seq.subject ? seq.subject : 'No subject yet'}
                        </p>
                      </div>
                      <Chip>{approved ? 'Approved' : 'Draft'}</Chip>
                      {isExpanded
                        ? <ChevronUp size={16} className="flex-shrink-0" style={{ color: '#9aa0a6' }} aria-hidden />
                        : <ChevronDown size={16} className="flex-shrink-0" style={{ color: '#9aa0a6' }} aria-hidden />}
                    </button>

                    {isExpanded && (
                      <div className="px-6 pb-6 pt-5" style={{ borderTop: `1px solid ${RULE}` }}>
                        {seq.step_number > 1 && (
                          <div className="flex items-center gap-3 mb-4 flex-wrap">
                            <span className={FIELD_LABEL_CLS}>Send after</span>
                            <input
                              type="number" min={1} max={90}
                              value={seq.delay_days}
                              disabled={isActive}
                              onChange={e => updateLocalSeq(seq.id, 'delay_days', parseInt(e.target.value) || 1)}
                              className={cn(INPUT_CLS, 'w-20 text-center')}
                              aria-label="Days after the previous step"
                            />
                            <span className="text-[13px]" style={{ color: MUTED }}>days after step {seq.step_number - 1}</span>
                          </div>
                        )}

                        <label className="block mb-4">
                          <span className={cn(FIELD_LABEL_CLS, 'block mb-1.5')}>Subject</span>
                          <input
                            className={INPUT_CLS}
                            placeholder="Subject line"
                            value={seq.subject}
                            disabled={isActive}
                            onChange={e => updateLocalSeq(seq.id, 'subject', e.target.value)}
                          />
                        </label>

                        <div className="mb-4">
                          <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
                            <span className={FIELD_LABEL_CLS}>Body</span>
                            <span className="text-[12.5px]" style={{ color: MUTED }}>Images and HTML reduce cold-email deliverability.</span>
                          </div>
                          {isActive ? (
                            <div
                              className="px-3.5 py-3 text-[14px] rounded-[12px] min-h-[120px] leading-relaxed whitespace-pre-wrap"
                              style={{ border: '1px solid #dadce0', background: '#f8f9fa', color: INK }}
                              dangerouslySetInnerHTML={{ __html: seq.body }}
                            />
                          ) : (
                            <div className="rounded-[12px] bg-white px-3.5" style={{ border: '1px solid #dadce0' }}>
                              <RichEditor
                                key={seq.id}
                                borderless
                                initialHtml={seq.body.startsWith('<') ? seq.body : plainToHtml(seq.body)}
                                onChange={html => updateLocalSeq(seq.id, 'body', html)}
                                placeholder="Email body. Use {{first_name}} and {{company}} for personalisation."
                                minHeight={160}
                              />
                            </div>
                          )}
                          <p className="m-0 mt-1.5 text-[12.5px] flex items-center gap-1" style={{ color: MUTED }}>
                            Tokens: {'{{first_name}}'} · {'{{company}}'}
                            <Tip text="Gmail replaces these with each lead's first name and company before sending." />
                          </p>
                          {sigCurrent && (
                            <div className="mt-3 rounded-[12px] px-4 py-3 text-[13px] leading-relaxed" style={{ background: '#f1f3f4', color: '#3c4043' }}>
                              <p className="m-0 mb-1 text-[12.5px]" style={{ color: MUTED }}>Signature appended at send</p>
                              Best regards,<br />
                              <span className="font-medium" style={{ color: INK }}>{sigCurrent.name}</span><br />
                              {[sigCurrent.title, sigCurrent.phone].filter(Boolean).join(' · ')}
                              {(sigCurrent.title || sigCurrent.phone) ? <br /> : null}
                              {sigCurrent.email && <>{sigCurrent.email}<br /></>}
                              {sigCurrent.company_tagline && <span style={{ color: MUTED }}>{sigCurrent.company_tagline}</span>}
                            </div>
                          )}
                        </div>

                        {!isActive && !approved && seq.subject && seq.body && (
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" onClick={() => approveStep(seq.id)}>
                              Approve step {seq.step_number}
                            </Button>
                            <Tip text="Marks this email as ready to send. All 3 steps must be approved before Launch campaign appears." />
                          </div>
                        )}
                        {!isActive && approved && (
                          <Button variant="ghost" size="sm" onClick={() => updateLocalSeq(seq.id, 'status', 'draft')}>
                            Unapprove
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {localSeqs.length === 0 && (
              <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>No sequence yet. Generate drafts to start.</p>
            )}
          </div>
        )}

        {/* ══════════════ LEADS TAB ══════════════ */}
        {tab === 'leads' && (
          <div className="mt-6 flex flex-col gap-8">
            <section>
              <h2 className="m-0 mb-3 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Segments</h2>
              {segments.length > 0 && (
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {segments.map(seg => (
                    <Chip key={seg.id} className="pr-1">
                      {seg.name}
                      <button
                        type="button"
                        onClick={() => deleteSegment(seg.id)}
                        disabled={deletingSegment === seg.id}
                        aria-label={`Remove segment ${seg.name}`}
                        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#e8eaed] p-0"
                        style={{ color: MUTED }}
                      >
                        {deletingSegment === seg.id ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
                      </button>
                    </Chip>
                  ))}
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                <input
                  className={cn(inputCls, 'max-w-[320px]')}
                  placeholder="New segment name"
                  aria-label="New segment name"
                  value={newSegmentName}
                  onChange={e => setNewSegmentName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSegment()}
                />
                <Button variant="outline" onClick={addSegment} disabled={addingSegment || !newSegmentName.trim()}>
                  {addingSegment ? 'Adding…' : 'Add segment'}
                </Button>
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>
                  Leads
                  {campaignLeads.length > 0 && (
                    <span className="ml-2 text-[13px] font-normal tabular-nums" style={{ color: MUTED }}>
                      {campaignLeads.filter(cl => cl.approval_status !== 'excluded').length} included of {campaignLeads.length}
                    </span>
                  )}
                </h2>
                <Link href="/outbound/leads" className="inline-flex items-center h-9 px-3.5 rounded-[10px] text-[13.5px] font-medium bg-white no-underline hover:bg-[#f8f9fa]" style={{ border: '1px solid #dadce0', color: INK }}>
                  Add from lead database
                </Link>
              </div>

              {fetchingLeads ? (
                <div className="rounded-[16px] overflow-hidden bg-white" style={{ border: `1px solid ${RULE}` }} aria-busy="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-12 px-6 flex items-center gap-8" style={{ borderBottom: `1px solid ${RULE}` }}>
                      <span className="h-3.5 w-40 rounded bg-[#f1f3f4] animate-pulse" />
                      <span className="h-3.5 w-52 rounded bg-[#f1f3f4] animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : campaignLeads.length === 0 ? (
                <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>
                  No leads in this campaign yet.{' '}
                  <Link href="/outbound/leads" className="underline" style={{ color: INK }}>Add leads from the lead database</Link>
                </p>
              ) : (
                <Register label="Campaign leads" minWidth={720}>
                  <RegisterHead>
                    <RegisterTh first hint="Ticked leads are included in the send">Lead</RegisterTh>
                    <RegisterTh>Email</RegisterTh>
                    <RegisterTh>Segment</RegisterTh>
                    <RegisterTh last>Status</RegisterTh>
                  </RegisterHead>
                  <tbody>
                    {campaignLeads.map(cl => {
                      const lead     = cl.outbound_leads
                      const excluded = cl.approval_status === 'excluded'
                      const toggling = togglingLeads.includes(cl.lead_id)
                      const role     = [lead?.current_title, lead?.current_company].filter(Boolean).join(' · ')
                      return (
                        <RegisterRow key={cl.id} className={cn('hover:bg-[#f8f9fa]', excluded && 'opacity-50')}>
                          <RegisterCell first className="min-w-[280px]">
                            <span className="flex items-center gap-3 min-w-0">
                              <span className="inline-flex w-4 flex-shrink-0 justify-center">
                                {toggling
                                  ? <Loader2 size={13} className="animate-spin" style={{ color: '#9aa0a6' }} />
                                  : <input
                                      type="checkbox"
                                      checked={!excluded}
                                      disabled={isActive}
                                      onChange={() => toggleLeadInclusion(cl.lead_id, cl.approval_status)}
                                      className={cn('w-4 h-4', !isActive && 'cursor-pointer')}
                                      aria-label={excluded ? 'Include in campaign' : 'Exclude from campaign'}
                                    />
                                }
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[15px] font-medium leading-tight truncate" style={{ color: INK }} title={lead?.full_name ?? undefined}>{lead?.full_name || '—'}</span>
                                <span className="block text-[12.5px] mt-0.5 truncate" style={{ color: MUTED }}>{role || 'No title on file'}</span>
                              </span>
                            </span>
                          </RegisterCell>
                          <RegisterCell><span className="text-[14px]" style={{ color: lead?.email ? INK : '#9aa0a6' }}>{lead?.email || '—'}</span></RegisterCell>
                          <RegisterCell><span className="text-[14px]" style={{ color: cl.ob_campaign_segments ? '#3c4043' : '#9aa0a6' }}>{cl.ob_campaign_segments?.name ?? '—'}</span></RegisterCell>
                          <RegisterCell last>
                            <span className="text-[14px]" style={{ color: excluded ? MUTED : INK }}>
                              {excluded ? 'Excluded' : cl.send_status.replace(/_/g, ' ').replace(/^\w/, ch => ch.toUpperCase())}
                            </span>
                          </RegisterCell>
                        </RegisterRow>
                      )
                    })}
                  </tbody>
                </Register>
              )}
            </section>
          </div>
        )}

        {/* ══════════════ BRIEF TAB ══════════════ */}
        {tab === 'brief' && (
          <div className="mt-6">
            {fetchingBrief ? (
              <div className="flex flex-col gap-4" aria-busy="true">
                <span className="block h-[120px] rounded-[16px] bg-[#f1f3f4] animate-pulse" />
                <span className="block h-[280px] rounded-[16px] bg-[#f1f3f4] animate-pulse" />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {brief ? (
                  <p className="m-0 text-[14px] flex items-center gap-3 flex-wrap" style={{ color: '#3c4043' }}>
                    <Chip>{briefApproved ? 'Approved' : 'Draft'}</Chip>
                    <span>
                      {briefApproved
                        ? `Brief v${brief.version_number} approved. Drafts can be generated.`
                        : `Brief v${brief.version_number} is in draft. Approve it to enable draft generation.`}
                    </span>
                    {!briefApproved && (
                      <Button variant={tabPrimary} size="sm" onClick={approveBrief} disabled={briefApproving}>
                        {briefApproving ? 'Approving…' : 'Approve brief'}
                      </Button>
                    )}
                  </p>
                ) : (
                  <p className="m-0 text-[14px]" style={{ color: MUTED }}>No brief yet. Fill in the form below to create one.</p>
                )}

                {(briefProducts.length > 0 || briefSegments.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {briefProducts.length > 0 && (
                      <div className="rounded-[16px] px-6 py-5 bg-white" style={{ border: `1px solid ${RULE}` }}>
                        <h2 className="m-0 mb-3 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Products</h2>
                        <ul className="m-0 p-0 list-none flex flex-col gap-2">
                          {briefProducts.map(p => (
                            <li key={p.id} className="flex items-center gap-2 text-[14px]" style={{ color: INK }}>
                              <Chip>{p.product_code}</Chip>
                              <span>{p.product_name}</span>
                              {p.priority === 1 && <span className="ml-auto text-[12.5px]" style={{ color: MUTED }}>Primary</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {briefSegments.length > 0 && (
                      <div className="rounded-[16px] px-6 py-5 bg-white" style={{ border: `1px solid ${RULE}` }}>
                        <h2 className="m-0 mb-3 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Segments</h2>
                        <ul className="m-0 p-0 list-none flex flex-col gap-2">
                          {briefSegments.map(s => (
                            <li key={s.id}>
                              <span className="block text-[14px] font-medium" style={{ color: INK }}>{s.name}</span>
                              {s.description && <span className="block text-[12.5px] mt-0.5" style={{ color: MUTED }}>{s.description}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-[16px] px-6 py-5 bg-white" style={{ border: `1px solid ${RULE}` }}>
                  <h2 className="m-0 mb-4 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>
                    {brief ? `${briefApproved ? 'Approved brief' : 'Draft brief'} v${brief.version_number}` : 'New brief'}
                  </h2>
                  <div className="flex flex-col gap-4 mb-5">
                    {([
                      { label: 'Goal',            tip: 'What you want recipients to do, for example book a 15-minute call to discuss cyber insurance.', placeholder: 'Book a 15-minute discovery call on cyber cover', value: briefGoal,     set: setBriefGoal },
                      { label: 'Target audience', tip: 'Who we are targeting: industry, seniority, geography.',                                          placeholder: 'SME founders and owners in Singapore',           value: briefAudience, set: setBriefAudience },
                      { label: 'Tone',            tip: 'How the emails should sound.',                                                                    placeholder: 'Professional, direct, not salesy',               value: briefTone,     set: setBriefTone },
                      { label: 'Topics to avoid', tip: 'Anything the AI should steer clear of: pricing, competitor names, regulatory detail.',            placeholder: 'Pricing, competitor names',                     value: briefAvoid,    set: setBriefAvoid },
                    ] as { label: string; tip: string; placeholder: string; value: string; set: (v: string) => void }[]).map(f => (
                      <label key={f.label} className="block min-w-0">
                        <span className={cn(FIELD_LABEL_CLS, 'flex items-center gap-1 mb-1.5')}>{f.label} <Tip text={f.tip} /></span>
                        <input
                          type="text"
                          className={INPUT_CLS}
                          placeholder={f.placeholder}
                          value={f.value}
                          disabled={briefApproved}
                          onChange={e => f.set(e.target.value)}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button variant={!brief && !headerPrimary ? 'default' : 'outline'} size="sm" onClick={createBrief} disabled={briefSaving}>
                      {briefSaving ? 'Saving…' : brief ? 'Create new version' : 'Create brief'}
                    </Button>
                    {brief && !briefApproved && (
                      <Button variant="outline" size="sm" onClick={approveBrief} disabled={briefApproving}>
                        {briefApproving ? 'Approving…' : 'Approve brief'}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-[16px] px-6 py-5 bg-white" style={{ border: `1px solid ${RULE}` }}>
                  <h2 className="m-0 mb-3 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Sender signature</h2>
                  <select
                    value={signatureId}
                    onChange={e => saveSignature(e.target.value)}
                    className={cn(inputCls, 'max-w-[420px]')}
                    aria-label="Sender signature"
                  >
                    <option value="">No signature</option>
                    {signatures.map(s => (
                      <option key={s.id} value={s.id}>{s.name}{s.title ? ` — ${s.title}` : ''}</option>
                    ))}
                  </select>
                  {savingSig && <p className="m-0 mt-1.5 text-[12.5px]" style={{ color: MUTED }}>Saving…</p>}
                  {sigCurrent && (
                    <div className="mt-3 rounded-[12px] px-4 py-3 text-[13px] leading-relaxed max-w-[420px]" style={{ background: '#f1f3f4', color: '#3c4043' }}>
                      Best regards,<br />
                      <span className="font-medium" style={{ color: INK }}>{sigCurrent.name}</span><br />
                      {[sigCurrent.title, sigCurrent.phone].filter(Boolean).join(' · ')}
                      {(sigCurrent.title || sigCurrent.phone) && <br />}
                      {sigCurrent.email && <>{sigCurrent.email}<br /></>}
                      {sigCurrent.company_tagline && <span style={{ color: MUTED }}>{sigCurrent.company_tagline}</span>}
                    </div>
                  )}
                  <p className="m-0 mt-3 text-[12.5px]" style={{ color: MUTED }}>
                    Appended to every email sent from this campaign. Manage signatures in{' '}
                    <Link href="/settings" className="underline" style={{ color: INK }}>Settings</Link>.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ VARIANTS TAB ══════════════ */}
        {tab === 'variants' && (
          <div className="mt-6">
            <div className="flex items-center justify-end gap-2 mb-4 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => generateVariants('subject_line')} disabled={generatingVariants}>A/B subject lines</Button>
              <Button variant="outline" size="sm" onClick={() => generateVariants('opening_hook')} disabled={generatingVariants}>A/B opening hooks</Button>
              <Button variant={tabPrimary} size="sm" onClick={() => generateVariants()} disabled={generatingVariants}>
                {generatingVariants ? 'Generating…' : 'Generate variant'}
              </Button>
            </div>

            {fetchingVariants ? (
              <div className="flex flex-col gap-3" aria-busy="true">
                {Array.from({ length: 2 }).map((_, i) => <span key={i} className="block h-[72px] rounded-[16px] bg-[#f1f3f4] animate-pulse" />)}
              </div>
            ) : variants.length === 0 ? (
              <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>No variants yet. Generate a standard variant or an A/B test.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {variants.map(v => {
                  const isExpanded = expandedVariant === v.id
                  const approved   = v.status === 'approved'
                  return (
                    <div key={v.id} className="rounded-[16px] bg-white overflow-hidden" style={{ border: `1px solid ${RULE}` }}>
                      <button
                        type="button"
                        onClick={() => setExpandedVariant(isExpanded ? null : v.id)}
                        aria-expanded={isExpanded}
                        className="w-full flex items-center gap-4 px-6 py-4 bg-transparent border-0 cursor-pointer text-left hover:bg-[#f8f9fa]"
                      >
                        <span className="w-8 h-8 rounded-[8px] flex-shrink-0 inline-flex items-center justify-center text-[13px] font-medium" style={{ background: '#f1f3f4', color: INK }}>
                          {v.variant_label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Variant {v.variant_label}</span>
                            {v.ab_dimension && <Chip>A/B: {v.ab_dimension.replace(/_/g, ' ')}</Chip>}
                            {v.ab_group && <span className="text-[12.5px]" style={{ color: MUTED }}>{v.ab_group}</span>}
                            {v.audience_split_pct != null && v.audience_split_pct < 100 && (
                              <span className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>{v.audience_split_pct}% of audience</span>
                            )}
                          </div>
                          <p className="m-0 mt-0.5 text-[13px]" style={{ color: MUTED }}>{v.steps.length} step{v.steps.length === 1 ? '' : 's'}</p>
                        </div>
                        <Chip>{approved ? 'Approved' : 'Draft'}</Chip>
                        {isExpanded
                          ? <ChevronUp size={16} className="flex-shrink-0" style={{ color: '#9aa0a6' }} aria-hidden />
                          : <ChevronDown size={16} className="flex-shrink-0" style={{ color: '#9aa0a6' }} aria-hidden />}
                      </button>

                      {isExpanded && (
                        <div className="px-6 py-5" style={{ borderTop: `1px solid ${RULE}` }}>
                          {v.steps.map(step => (
                            <div key={step.id} className="py-4 first:pt-0 last:pb-0" style={{ borderBottom: `1px solid ${RULE}` }}>
                              <p className="m-0 mb-1 text-[12.5px]" style={{ color: MUTED }}>
                                Step {step.step_number}{step.delay_days > 0 ? ` · +${step.delay_days}d` : ''}
                              </p>
                              <p className="m-0 mb-1 text-[14px] font-medium" style={{ color: INK }}>{step.subject}</p>
                              <p className="m-0 text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: '#3c4043' }}>{step.body}</p>
                            </div>
                          ))}
                          {!approved && (
                            <Button variant="outline" size="sm" className="mt-4" onClick={() => approveVariant(v.id)}>
                              Approve variant {v.variant_label}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ ANALYTICS TAB ══════════════ */}
        {tab === 'analytics' && (
          <div className="mt-6">
            {fetchingAnalytics ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-busy="true">
                {Array.from({ length: 4 }).map((_, i) => <span key={i} className="block h-[92px] rounded-[16px] bg-[#f1f3f4] animate-pulse" />)}
              </div>
            ) : analytics ? (
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Active leads"     value={analytics.total_active} />
                  <StatCard label="Sent"             value={analytics.total_sent} />
                  <StatCard label="Replies"          value={analytics.total_replied} />
                  <StatCard label="Reply rate"       value={`${analytics.reply_rate_pct}%`} />
                  <StatCard label="Positive replies" value={analytics.positive_replies} />
                  <StatCard label="Positive rate"    value={`${analytics.positive_rate_pct}%`} />
                  <StatCard label="Bounced"          value={analytics.total_bounced} />
                </div>

                {analyticsSegments.length > 0 && (
                  <section>
                    <h2 className="m-0 mb-3 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Segment breakdown</h2>
                    <Register label="Segment breakdown" minWidth={560}>
                      <RegisterHead>
                        <RegisterTh first>Segment</RegisterTh>
                        <RegisterTh align="right">Leads</RegisterTh>
                        <RegisterTh align="right">Sent</RegisterTh>
                        <RegisterTh align="right">Replied</RegisterTh>
                        <RegisterTh last align="right">Reply rate</RegisterTh>
                      </RegisterHead>
                      <tbody>
                        {analyticsSegments.map(seg => (
                          <RegisterRow key={seg.segment_id} className="hover:bg-[#f8f9fa]">
                            <RegisterCell first primary={seg.name} secondary={`${seg.total} lead${seg.total === 1 ? '' : 's'}`} />
                            <RegisterCell align="right" primary={seg.total} />
                            <RegisterCell align="right" primary={seg.sent} />
                            <RegisterCell align="right" primary={seg.replied} />
                            <RegisterCell last align="right" primary={seg.sent > 0 ? `${Math.round((seg.replied / seg.sent) * 100)}%` : '—'} />
                          </RegisterRow>
                        ))}
                      </tbody>
                    </Register>
                  </section>
                )}

                {aiUsage && (
                  <section>
                    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                      <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>AI usage</h2>
                      <Link href="/outbound/ai-usage" className="text-[13px] no-underline hover:underline underline-offset-4" style={{ color: INK }}>Full AI usage →</Link>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <StatCard label="Draft calls"   value={aiUsage.calls} />
                      <StatCard label="Total tokens"  value={aiUsage.total_tokens >= 1000 ? `${(aiUsage.total_tokens / 1000).toFixed(1)}k` : String(aiUsage.total_tokens)} />
                      <StatCard label="Output tokens" value={aiUsage.output_tokens >= 1000 ? `${(aiUsage.output_tokens / 1000).toFixed(1)}k` : String(aiUsage.output_tokens)} />
                    </div>
                  </section>
                )}

                <div className="flex justify-end">
                  <Link href={`/outbound/replies?campaign_id=${id}`} className="inline-flex items-center h-9 px-3.5 rounded-[10px] text-[13.5px] font-medium bg-white no-underline hover:bg-[#f8f9fa]" style={{ border: '1px solid #dadce0', color: INK }}>
                    Review replies
                  </Link>
                </div>
              </div>
            ) : (
              <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>Analytics appear after launch.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Launch confirm dialog ── */}
      {launchConfirm && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[12vh]" style={{ background: 'rgba(32,33,36,0.28)' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setLaunchConfirm(false) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="launch-title" className="w-full max-w-[480px] rounded-[16px] bg-white p-6" style={{ boxShadow: '0 24px 64px rgba(32,33,36,0.2)', color: INK }}>
            <h2 id="launch-title" className="m-0 text-[20px] font-medium">Launch campaign</h2>
            <p className="m-0 mt-1 text-[13.5px]" style={{ color: MUTED }}>Sends from the configured ops email. Opt-outs are excluded. Pause from the campaign header at any time.</p>

            <div className="mt-5 flex flex-col gap-2">
              <label className="flex gap-3 items-start cursor-pointer px-4 py-3 rounded-[12px]" style={{ border: `1px solid ${sendMode === 'all' ? INK : '#dadce0'}` }}>
                <input type="radio" checked={sendMode === 'all'} onChange={() => setSendMode('all')} className="mt-1" />
                <span>
                  <span className="block text-[14px] font-medium" style={{ color: INK }}>Send all now</span>
                  <span className="block mt-0.5 text-[13px]" style={{ color: MUTED }}>Every included lead is emailed straight after launch.</span>
                </span>
              </label>
              <label className="flex gap-3 items-start cursor-pointer px-4 py-3 rounded-[12px]" style={{ border: `1px solid ${sendMode === 'batch' ? INK : '#dadce0'}` }}>
                <input type="radio" checked={sendMode === 'batch'} onChange={() => setSendMode('batch')} className="mt-1" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-medium" style={{ color: INK }}>Send in batches</span>
                  <span className="block mt-0.5 text-[13px]" style={{ color: MUTED }}>Queue every lead, then use Send now to release one batch at a time.</span>
                  {sendMode === 'batch' && (
                    <span className="flex items-center gap-2 mt-3 flex-wrap">
                      <span className="text-[13px]" style={{ color: MUTED }}>Batch size</span>
                      <input
                        type="number" min={1} max={500}
                        value={batchSize}
                        onChange={e => setBatchSize(Math.max(1, parseInt(e.target.value) || 1))}
                        className={cn(inputCls, 'w-24 text-center')}
                        aria-label="Batch size"
                      />
                      <span className="text-[13px]" style={{ color: MUTED }}>emails per Send now</span>
                    </span>
                  )}
                </span>
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setLaunchConfirm(false)}>Cancel</Button>
              <Button size="sm" onClick={launch} disabled={launching}>
                {launching ? 'Launching…' : 'Launch'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
