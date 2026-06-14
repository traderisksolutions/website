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

// ── Types ─────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string; name: string; status: string
  news_url: string | null; news_headline: string | null; news_summary: string | null
  lead_count: number; sent_count: number; reply_count: number
  instantly_campaign_id: string | null; created_at: string
  brief_required?: boolean; variant_mode?: boolean
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

// ── Styles ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: '20px 24px',
}

const btnPrimary = (disabled = false, bg = '#111'): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', borderRadius: 8, border: 'none',
  background: bg, color: '#fff', fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
  whiteSpace: 'nowrap',
})

const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '6px 12px', borderRadius: 7, border: '1px solid #e5e5e5',
  background: '#fff', color: '#333', fontSize: 12, fontWeight: 500,
  cursor: 'pointer', whiteSpace: 'nowrap',
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  draft:     { color: '#92400e', bg: '#fef3c7' },
  review:    { color: '#1e40af', bg: '#dbeafe' },
  active:    { color: '#166534', bg: '#f0fdf4' },
  paused:    { color: '#7c3aed', bg: '#ede9fe' },
  completed: { color: '#555',    bg: '#f4f4f5' },
}

type Tab = 'sequence' | 'leads' | 'brief' | 'variants' | 'analytics'

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // Load campaign leads + segments when switching to leads tab
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

  // Load variants when switching to variants tab
  useEffect(() => {
    if (tab !== 'variants') return
    setFetchingVariants(true)
    fetch(`/api/outbound/campaigns/${id}/variants`)
      .then(r => r.json())
      .then(data => setVariants(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setFetchingVariants(false))
  }, [tab, id])

  // Load analytics when switching to analytics tab
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

  // Load brief when switching to brief tab
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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#ccc' }} />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div style={{ padding: '28px 32px' }}>
        <p style={{ color: '#991b1b', fontSize: 14 }}>Campaign not found.</p>
        <Link href="/outbound/campaigns" style={{ color: '#1d4ed8', fontSize: 13 }}>← Back to Campaigns</Link>
      </div>
    )
  }

  const sc = STATUS_COLORS[campaign.status] ?? STATUS_COLORS.draft

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-7" style={{ maxWidth: 1000, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/outbound/campaigns" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#888', fontSize: 12, textDecoration: 'none', marginBottom: 10 }}>
          <ArrowLeft size={12} /> Campaigns
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.02em', flex: 1, minWidth: 0 }}>
            {campaign.name}
          </h1>
          <span style={{
            padding: '3px 10px', borderRadius: 5, fontSize: 12, fontWeight: 600,
            color: sc.color, background: sc.bg, flexShrink: 0,
          }}>
            {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
          </span>
          {(isActive || isPaused) && (
            <>
              <button
                onClick={togglePause}
                disabled={pausing}
                style={btnPrimary(pausing, isPaused ? '#166534' : '#7c3aed')}
              >
                {pausing
                  ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  : isPaused ? <Play size={13} /> : <Pause size={13} />
                }
                {isPaused ? 'Resume' : 'Pause'}
              </button>
              <button
                onClick={sendNow}
                disabled={sendingNow}
                style={btnPrimary(sendingNow, '#1d4ed8')}
              >
                {sendingNow
                  ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Sending…</>
                  : <><Send size={13} /> Send Now</>
                }
              </button>
            </>
          )}
        </div>

        {campaign.news_headline && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10,
            padding: '10px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0',
          }}>
            <Newspaper size={13} style={{ color: '#166534', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 600, color: '#166534', display: 'flex', alignItems: 'center', gap: 4 }}>
                News Hook <Tip text="The AI uses this article as the opening line in Email 1." />
              </p>
              <p style={{ margin: '0 0 2px', fontSize: 12, color: '#166534' }}>{campaign.news_headline}</p>
              {campaign.news_summary && <p style={{ margin: 0, fontSize: 11, color: '#4ade80', lineHeight: 1.5 }}>{campaign.news_summary}</p>}
            </div>
          </div>
        )}

        {needsBrief && tab !== 'brief' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 10,
            padding: '10px 14px', borderRadius: 8, background: '#fef3c7', border: '1px solid #fcd34d',
          }}>
            <AlertCircle size={13} style={{ color: '#92400e', flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 12, color: '#92400e', flex: 1 }}>
              Brief approval required before you can generate AI drafts.
            </p>
            <button onClick={() => setTab('brief')} style={{ ...btnSecondary, fontSize: 12 }}>
              Go to Brief →
            </button>
          </div>
        )}
      </div>

      {/* Error / Success */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13 }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 16 }}>×</button>
        </div>
      )}
      {successMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: 13 }}>
          <CheckCircle size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', marginBottom: 20, gap: 0, overflowX: 'auto' }}>
        {([
          { key: 'brief',     label: 'Brief',     icon: <FileText size={13} />, badge: needsBrief },
          { key: 'leads',     label: 'Leads',     icon: <Users size={13} /> },
          { key: 'sequence',  label: 'Sequence',  icon: <Mail size={13} /> },
          ...(campaign.variant_mode ? [{ key: 'variants' as Tab, label: 'Variants', icon: <GitBranch size={13} /> }] : []),
          { key: 'analytics', label: 'Analytics', icon: <BarChart2 size={13} /> },
        ] as { key: Tab; label: string; icon: React.ReactNode; badge?: boolean }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, whiteSpace: 'nowrap',
              padding: '8px 16px', border: 'none', borderBottom: `2px solid ${tab === t.key ? '#111' : 'transparent'}`,
              background: 'none', fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#111' : '#888', cursor: 'pointer', position: 'relative',
            }}
          >
            {t.icon} {t.label}
            {t.badge && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#f59e0b',
                position: 'absolute', top: 6, right: 6,
              }} />
            )}
          </button>
        ))}
      </div>

      {/* ══ SEQUENCE TAB ══ */}
      {tab === 'sequence' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#888' }}>
                {hasDraft
                  ? 'Review and edit each step. Approve all steps before launching.'
                  : 'Generate AI drafts to get started.'}
              </p>
            </div>
            <Tip text="The AI writes all 3 email steps using the news hook and lead details. Review and edit each draft before approving — nothing is sent until you click Launch." />
            <button
              onClick={draftSequences}
              disabled={drafting || isActive}
              style={btnPrimary(drafting || isActive, '#7c3aed')}
            >
              {drafting
                ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Drafting…</>
                : hasDraft
                ? <><RefreshCw size={13} /> Redraft All</>
                : <><Sparkles size={13} /> Generate AI Drafts</>
              }
            </button>
            {hasDraft && !isActive && (
              <button onClick={saveSequences} disabled={savingSeqs} style={btnSecondary}>
                {savingSeqs ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                {savingSeqs ? 'Saving…' : 'Save Changes'}
              </button>
            )}
            {allApproved && !isActive && (
              <>
                <Tip text="Queues all approved leads for Gmail delivery. Emails send at ~30/hour with follow-up steps handled automatically." />
                <button onClick={() => setLaunchConfirm(true)} disabled={launching} style={btnPrimary(launching, '#166534')}>
                  {launching
                    ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Launching…</>
                    : <><Rocket size={13} /> Launch Campaign</>
                  }
                </button>
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {localSeqs.map((seq, i) => {
              const isExpanded = expandedStep === seq.step_number
              const approved   = seq.status === 'approved'
              return (
                <div key={seq.id} style={{
                  ...card, padding: 0, overflow: 'hidden',
                  border: `1px solid ${approved ? '#bbf7d0' : '#e8e8e8'}`,
                }}>
                  <button
                    onClick={() => setExpandedStep(isExpanded ? null : seq.step_number)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                      background: approved ? '#f0fdf4' : '#f4f4f5',
                      color: approved ? '#166534' : '#888',
                      border: `1px solid ${approved ? '#bbf7d0' : '#e5e5e5'}`,
                    }}>
                      {approved ? <CheckCircle size={13} /> : i + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111' }}>
                        {seq.step_number === 1 ? 'Email 1 — Initial outreach' : seq.step_number === 2 ? 'Email 2 — Follow-up' : 'Email 3 — Final touch'}
                        {seq.step_number > 1 && (
                          <span style={{ fontSize: 11, fontWeight: 400, color: '#aaa', marginLeft: 8 }}>
                            {seq.delay_days === 0 ? 'Same day' : `+${seq.delay_days} days`}
                          </span>
                        )}
                      </p>
                      {seq.subject && (
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Subject: {seq.subject}
                        </p>
                      )}
                    </div>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                      color: approved ? '#166534' : '#92400e',
                      background: approved ? '#f0fdf4' : '#fef3c7', flexShrink: 0,
                    }}>
                      {approved ? 'Approved' : 'Draft'}
                    </span>
                    {isExpanded ? <ChevronUp size={14} style={{ color: '#ccc' }} /> : <ChevronDown size={14} style={{ color: '#ccc' }} />}
                  </button>

                  {isExpanded && (
                    <div style={{ padding: '0 20px 20px', borderTop: '1px solid #f4f4f5' }}>
                      {seq.step_number > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 14 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                            Send after
                          </label>
                          <input
                            type="number" min={1} max={90}
                            value={seq.delay_days}
                            disabled={isActive}
                            onChange={e => updateLocalSeq(seq.id, 'delay_days', parseInt(e.target.value) || 1)}
                            style={{ width: 60, padding: '4px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #e5e5e5', background: '#fafafa', textAlign: 'center' }}
                          />
                          <span style={{ fontSize: 12, color: '#888' }}>days</span>
                        </div>
                      )}

                      <div style={{ marginTop: seq.step_number === 1 ? 14 : 0, marginBottom: 10 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Subject Line
                        </label>
                        <input
                          style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 7, border: '1px solid #e5e5e5', background: isActive ? '#fafafa' : '#fff', color: '#111', outline: 'none', boxSizing: 'border-box' }}
                          placeholder="Subject line…"
                          value={seq.subject}
                          disabled={isActive}
                          onChange={e => updateLocalSeq(seq.id, 'subject', e.target.value)}
                        />
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Email Body
                        </label>
                        <textarea
                          style={{
                            width: '100%', padding: '10px', fontSize: 13, borderRadius: 7,
                            border: '1px solid #e5e5e5', background: isActive ? '#fafafa' : '#fff',
                            color: '#111', outline: 'none', boxSizing: 'border-box',
                            minHeight: 160, resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit',
                          }}
                          placeholder="Email body… Use {{first_name}} and {{company}} for personalisation."
                          value={seq.body}
                          disabled={isActive}
                          onChange={e => updateLocalSeq(seq.id, 'body', e.target.value)}
                        />
                        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#bbb', display: 'flex', alignItems: 'center', gap: 4 }}>
                          Tokens: {'{{first_name}}'} · {'{{company}}'} <Tip text="Gmail replaces these with each lead's first name and company before sending." />
                        </p>
                      </div>

                      {!isActive && !approved && seq.subject && seq.body && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button onClick={() => approveStep(seq.id)} style={btnPrimary(false, '#166534')}>
                            <CheckCircle size={13} /> Approve Step {seq.step_number}
                          </button>
                          <Tip text="Marks this email as ready to send. All 3 steps must be approved before the Launch Campaign button appears." />
                        </div>
                      )}
                      {!isActive && approved && (
                        <button onClick={() => updateLocalSeq(seq.id, 'status', 'draft')} style={btnSecondary}>
                          Unapprove
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {localSeqs.length === 0 && !hasDraft && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ fontSize: 13, color: '#ccc' }}>No sequences yet — click &ldquo;Generate AI Drafts&rdquo; to start</p>
            </div>
          )}
        </div>
      )}

      {/* ══ LEADS TAB ══ */}
      {tab === 'leads' && (
        <div style={card}>
          {/* Segment management */}
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#555' }}>Segments</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: segments.length > 0 ? 8 : 0, flexWrap: 'wrap' }}>
              {segments.map(seg => (
                <div key={seg.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px 2px 10px', borderRadius: 20, background: '#f4f4f5', border: '1px solid #e5e5e5' }}>
                  <span style={{ fontSize: 11, color: '#444' }}>{seg.name}</span>
                  <button onClick={() => deleteSegment(seg.id)} disabled={deletingSegment === seg.id}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', padding: 0, display: 'flex' }}>
                    {deletingSegment === seg.id ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <X size={10} />}
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                style={{ flex: 1, padding: '5px 9px', fontSize: 12, borderRadius: 6, border: '1px solid #e5e5e5', outline: 'none', color: '#111' }}
                placeholder="New segment name…"
                value={newSegmentName}
                onChange={e => setNewSegmentName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSegment()}
              />
              <button onClick={addSegment} disabled={addingSegment || !newSegmentName.trim()} style={btnPrimary(addingSegment || !newSegmentName.trim(), '#555')}>
                {addingSegment ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : '+ Add'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111' }}>
              Campaign leads
              {campaignLeads.length > 0 && (
                <span style={{ fontWeight: 400, color: '#aaa', marginLeft: 6 }}>
                  ({campaignLeads.filter(cl => cl.approval_status !== 'excluded').length} active)
                </span>
              )}
            </p>
            <Link
              href="/outbound/leads"
              style={{ ...btnSecondary, textDecoration: 'none', fontSize: 12 }}
            >
              + Add from Lead Database
            </Link>
          </div>

          {fetchingLeads ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#ccc' }} />
            </div>
          ) : campaignLeads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ fontSize: 13, color: '#aaa', marginBottom: 12 }}>No leads assigned to this campaign yet.</p>
              <Link href="/outbound/leads" style={{ color: '#1d4ed8', fontSize: 13 }}>Add leads from Lead Database →</Link>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Include', 'Name', 'Email', 'Title / Company', 'Status'].map(h => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: '#aaa', fontWeight: 600, fontSize: 11, borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaignLeads.map(cl => {
                    const lead     = cl.outbound_leads
                    const excluded = cl.approval_status === 'excluded'
                    const toggling = togglingLeads.includes(cl.lead_id)
                    return (
                      <tr key={cl.id} style={{ opacity: excluded ? 0.45 : 1 }}>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #f8f8f8' }}>
                          {toggling
                            ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: '#ccc' }} />
                            : <input
                                type="checkbox"
                                checked={!excluded}
                                disabled={isActive}
                                onChange={() => toggleLeadInclusion(cl.lead_id, cl.approval_status)}
                                style={{ cursor: isActive ? 'default' : 'pointer', width: 15, height: 15 }}
                                title={excluded ? 'Include in campaign' : 'Exclude from campaign'}
                              />
                          }
                        </td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #f8f8f8', fontSize: 13, fontWeight: 500, color: '#111', whiteSpace: 'nowrap' }}>
                          {lead?.full_name || '—'}
                        </td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #f8f8f8', fontSize: 12, color: lead?.email ? '#166534' : '#ccc' }}>
                          {lead?.email || '—'}
                        </td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #f8f8f8', fontSize: 12, color: '#888', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#555' }}>{lead?.current_title || '—'}</span>
                          {lead?.current_company && (
                            <span style={{ color: '#aaa' }}> · {lead.current_company}</span>
                          )}
                        </td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #f8f8f8' }}>
                          {!excluded && (
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                              color: cl.send_status === 'sent' || cl.send_status === 'replied' ? '#166534' : '#92400e',
                              background: cl.send_status === 'sent' || cl.send_status === 'replied' ? '#f0fdf4' : '#fef3c7',
                            }}>
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
        </div>
      )}

      {/* ══ BRIEF TAB ══ */}
      {tab === 'brief' && (
        <div>
          {fetchingBrief ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#ccc' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Status banner */}
              {brief ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                  borderRadius: 10, border: `1px solid ${briefApproved ? '#bbf7d0' : '#fcd34d'}`,
                  background: briefApproved ? '#f0fdf4' : '#fef3c7',
                }}>
                  {briefApproved
                    ? <CheckCircle size={14} style={{ color: '#166534', flexShrink: 0 }} />
                    : <AlertCircle size={14} style={{ color: '#92400e', flexShrink: 0 }} />
                  }
                  <p style={{ margin: 0, fontSize: 13, color: briefApproved ? '#166534' : '#92400e', flex: 1 }}>
                    {briefApproved
                      ? `Brief v${brief.version_number} approved — AI drafts can be generated.`
                      : `Brief v${brief.version_number} is in draft. Approve it to enable AI draft generation.`
                    }
                  </p>
                  {!briefApproved && (
                    <button
                      onClick={approveBrief}
                      disabled={briefApproving}
                      style={btnPrimary(briefApproving, '#166534')}
                    >
                      {briefApproving
                        ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Approving…</>
                        : <><CheckCircle size={13} /> Approve Brief</>
                      }
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ ...card, textAlign: 'center', padding: '32px 24px' }}>
                  <FileText size={28} style={{ color: '#e5e5e5', marginBottom: 12 }} />
                  <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#555' }}>No brief yet</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#aaa' }}>Create a brief to define messaging goals before AI draft generation.</p>
                </div>
              )}

              {/* Products & Segments context */}
              {(briefProducts.length > 0 || briefSegments.length > 0) && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {briefProducts.length > 0 && (
                    <div style={{ ...card, flex: 1, minWidth: 200, padding: '14px 18px' }}>
                      <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Products</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {briefProducts.map(p => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color: '#7c3aed', background: '#ede9fe', whiteSpace: 'nowrap' }}>
                              {p.product_code}
                            </span>
                            <span style={{ fontSize: 13, color: '#333' }}>{p.product_name}</span>
                            {p.priority === 1 && (
                              <span style={{ fontSize: 10, color: '#aaa', marginLeft: 'auto' }}>primary</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {briefSegments.length > 0 && (
                    <div style={{ ...card, flex: 1, minWidth: 200, padding: '14px 18px' }}>
                      <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Segments</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {briefSegments.map(s => (
                          <div key={s.id}>
                            <span style={{ fontSize: 13, color: '#333', fontWeight: 500 }}>{s.name}</span>
                            {s.description && (
                              <p style={{ margin: '1px 0 0', fontSize: 11, color: '#aaa' }}>{s.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Brief form */}
              <div style={card}>
                <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, color: '#111' }}>
                  {brief ? `${briefApproved ? 'Approved brief' : 'Edit draft brief'} v${brief.version_number}` : 'New brief'}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
                  {([
                    { label: 'Campaign Goal',     tip: 'What do you want recipients to do? e.g. Book a 15-min call to discuss cyber insurance.', placeholder: 'e.g. Book a 15-min discovery call to discuss cyber insurance coverage', value: briefGoal,     set: setBriefGoal },
                    { label: 'Target Audience',   tip: 'Who are we targeting? Be specific — industry, seniority, geography.',                      placeholder: 'e.g. SME founders and business owners in Singapore',                  value: briefAudience, set: setBriefAudience },
                    { label: 'Tone',              tip: 'How should the emails sound?',                                                              placeholder: 'e.g. Professional, direct, not salesy',                             value: briefTone,     set: setBriefTone },
                    { label: 'Topics to Avoid',   tip: 'Anything the AI should steer clear of — pricing, competitor names, regulatory details.',   placeholder: 'e.g. Pricing discussion, competitor names',                         value: briefAvoid,    set: setBriefAvoid },
                  ] as { label: string; tip: string; placeholder: string; value: string; set: (v: string) => void }[]).map(f => (
                    <div key={f.label}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {f.label} <Tip text={f.tip} />
                      </label>
                      <input
                        type="text"
                        style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 7, border: '1px solid #e5e5e5', background: briefApproved ? '#fafafa' : '#fff', color: '#111', outline: 'none', boxSizing: 'border-box' }}
                        placeholder={f.placeholder}
                        value={f.value}
                        disabled={briefApproved}
                        onChange={e => f.set(e.target.value)}
                      />
                    </div>
                  ))}
                </div>

                {!briefApproved && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={createBrief}
                      disabled={briefSaving}
                      style={btnPrimary(briefSaving, '#111')}
                    >
                      {briefSaving
                        ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                        : brief ? 'Create New Version' : 'Create Brief'
                      }
                    </button>
                    {brief && !briefApproved && (
                      <button
                        onClick={approveBrief}
                        disabled={briefApproving}
                        style={btnPrimary(briefApproving, '#166534')}
                      >
                        {briefApproving
                          ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Approving…</>
                          : <><CheckCircle size={13} /> Approve</>
                        }
                      </button>
                    )}
                  </div>
                )}

                {briefApproved && (
                  <button
                    onClick={createBrief}
                    disabled={briefSaving}
                    style={btnSecondary}
                  >
                    {briefSaving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
                    {briefSaving ? 'Creating…' : 'Create New Version'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ VARIANTS TAB ══ */}
      {tab === 'variants' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#888' }}>
              AI-generated sequence variants. Approve one to use it in the campaign.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => generateVariants()}
                disabled={generatingVariants}
                style={btnPrimary(generatingVariants, '#7c3aed')}
              >
                {generatingVariants
                  ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
                  : <><Sparkles size={13} /> Generate</>}
              </button>
              <button
                onClick={() => generateVariants('subject_line')}
                disabled={generatingVariants}
                style={btnSecondary}
              >
                A/B Subject Lines
              </button>
              <button
                onClick={() => generateVariants('opening_hook')}
                disabled={generatingVariants}
                style={btnSecondary}
              >
                A/B Opening Hooks
              </button>
            </div>
          </div>

          {fetchingVariants ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#ccc' }} />
            </div>
          ) : variants.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '48px 24px' }}>
              <GitBranch size={28} style={{ color: '#e5e5e5', marginBottom: 12 }} />
              <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#555' }}>No variants yet</p>
              <p style={{ margin: 0, fontSize: 13, color: '#aaa' }}>Generate a standard variant or an A/B test to get started.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {variants.map(v => {
                const isExpanded = expandedVariant === v.id
                const approved   = v.status === 'approved'
                return (
                  <div key={v.id} style={{
                    ...card, padding: 0, overflow: 'hidden',
                    border: `1px solid ${approved ? '#bbf7d0' : '#e8e8e8'}`,
                  }}>
                    <button
                      onClick={() => setExpandedVariant(isExpanded ? null : v.id)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <span style={{
                        width: 28, height: 28, borderRadius: 6, flexShrink: 0, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
                        background: approved ? '#f0fdf4' : '#f4f4f5',
                        color: approved ? '#166534' : '#555',
                        border: `1px solid ${approved ? '#bbf7d0' : '#e5e5e5'}`,
                      }}>
                        {v.variant_label}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Variant {v.variant_label}</span>
                          {v.ab_dimension && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color: '#7c3aed', background: '#ede9fe' }}>
                              A/B: {v.ab_dimension.replace('_', ' ')}
                            </span>
                          )}
                          {v.ab_group && (
                            <span style={{ fontSize: 10, color: '#aaa' }}>{v.ab_group}</span>
                          )}
                          {v.audience_split_pct != null && v.audience_split_pct < 100 && (
                            <span style={{ fontSize: 10, color: '#aaa' }}>{v.audience_split_pct}% audience</span>
                          )}
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#aaa' }}>{v.steps.length} steps</p>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, flexShrink: 0,
                        color: approved ? '#166534' : '#92400e',
                        background: approved ? '#f0fdf4' : '#fef3c7',
                      }}>
                        {approved ? 'Approved' : 'Draft'}
                      </span>
                      {isExpanded ? <ChevronUp size={14} style={{ color: '#ccc' }} /> : <ChevronDown size={14} style={{ color: '#ccc' }} />}
                    </button>

                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #f4f4f5', padding: '16px 20px' }}>
                        {v.steps.map(step => (
                          <div key={step.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #f8f8f8' }}>
                            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Step {step.step_number}
                              {step.delay_days > 0 && <span style={{ fontWeight: 400 }}> · +{step.delay_days}d</span>}
                            </p>
                            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: '#111' }}>{step.subject}</p>
                            <p style={{ margin: 0, fontSize: 12, color: '#555', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{step.body}</p>
                          </div>
                        ))}
                        {!approved && (
                          <button onClick={() => approveVariant(v.id)} style={btnPrimary(false, '#166534')}>
                            <CheckCircle size={13} /> Approve Variant {v.variant_label}
                          </button>
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

      {/* ══ ANALYTICS TAB ══ */}
      {tab === 'analytics' && (
        <div>
          {fetchingAnalytics ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#ccc' }} />
            </div>
          ) : analytics ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }} className="sm:grid-cols-4">
                {[
                  { label: 'Active Leads',    value: analytics.total_active },
                  { label: 'Sent',            value: analytics.total_sent },
                  { label: 'Replies',         value: analytics.total_replied,    highlight: analytics.total_replied > 0 },
                  { label: 'Reply Rate',      value: `${analytics.reply_rate_pct}%` },
                  { label: 'Positive Replies',value: analytics.positive_replies, highlight: analytics.positive_replies > 0 },
                  { label: 'Positive Rate',   value: `${analytics.positive_rate_pct}%`, highlight: analytics.positive_rate_pct > 0 },
                  { label: 'Bounced',         value: analytics.total_bounced },
                ].map(s => (
                  <div key={s.label} style={{ ...card, textAlign: 'center', padding: '14px 16px' }}>
                    <p style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: s.highlight ? '#166534' : '#111' }}>{s.value}</p>
                    <p style={{ margin: 0, fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{s.label}</p>
                  </div>
                ))}
              </div>
              {analyticsSegments.length > 0 && (
                <div style={{ ...card, marginBottom: 12 }}>
                  <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#111' }}>Segment breakdown</p>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Segment', 'Leads', 'Sent', 'Replied', 'Reply rate'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#aaa', borderBottom: '1px solid #f0f0f0' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsSegments.map(seg => (
                        <tr key={seg.segment_id}>
                          <td style={{ padding: '8px 10px', fontSize: 13, color: '#111', borderBottom: '1px solid #f8f8f8' }}>{seg.name}</td>
                          <td style={{ padding: '8px 10px', fontSize: 13, color: '#555', borderBottom: '1px solid #f8f8f8' }}>{seg.total}</td>
                          <td style={{ padding: '8px 10px', fontSize: 13, color: '#555', borderBottom: '1px solid #f8f8f8' }}>{seg.sent}</td>
                          <td style={{ padding: '8px 10px', fontSize: 13, color: seg.replied > 0 ? '#166534' : '#555', fontWeight: seg.replied > 0 ? 600 : 400, borderBottom: '1px solid #f8f8f8' }}>{seg.replied}</td>
                          <td style={{ padding: '8px 10px', fontSize: 13, color: '#555', borderBottom: '1px solid #f8f8f8' }}>
                            {seg.sent > 0 ? `${Math.round((seg.replied / seg.sent) * 100)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* AI usage for this campaign */}
              {aiUsage && (
                <div style={{ ...card, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <Sparkles size={13} style={{ color: '#7c3aed' }} />
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111' }}>AI Usage</p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {[
                      { label: 'Draft Calls',    value: aiUsage.calls },
                      { label: 'Total Tokens',   value: aiUsage.total_tokens >= 1000 ? `${(aiUsage.total_tokens / 1000).toFixed(1)}k` : String(aiUsage.total_tokens) },
                      { label: 'Output Tokens',  value: aiUsage.output_tokens >= 1000 ? `${(aiUsage.output_tokens / 1000).toFixed(1)}k` : String(aiUsage.output_tokens) },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center', padding: '10px', borderRadius: 8, background: '#faf5ff', border: '1px solid #e9d5ff' }}>
                        <p style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 700, color: '#7c3aed' }}>{s.value}</p>
                        <p style={{ margin: 0, fontSize: 10, color: '#9333ea', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: 11, color: '#bbb', textAlign: 'right' }}>
                    <Link href="/outbound/ai-usage" style={{ color: '#9333ea', textDecoration: 'none' }}>View full AI usage →</Link>
                  </p>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 8 }}>
                <Link href={`/outbound/replies?campaign_id=${id}`} style={{ ...btnSecondary, textDecoration: 'none', fontSize: 12 }}>
                  Review Replies →
                </Link>
              </div>
            </>
          ) : (
            <div style={{ ...card, textAlign: 'center', padding: '48px 24px' }}>
              <BarChart2 size={32} style={{ color: '#e5e5e5', marginBottom: 12 }} />
              <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#555' }}>Analytics available after launch</p>
              <p style={{ margin: 0, fontSize: 13, color: '#aaa' }}>Approve all sequence steps and launch the campaign to see reply tracking here.</p>
            </div>
          )}
        </div>
      )}

      {/* Launch confirm modal */}
      {launchConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', maxWidth: 460, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <p style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#111' }}>Launch Campaign</p>

            {/* Send mode picker */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <label style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
                padding: '10px 14px', borderRadius: 8,
                border: `1px solid ${sendMode === 'all' ? '#166534' : '#e5e5e5'}`,
                background: sendMode === 'all' ? '#f0fdf4' : '#fafafa',
              }}>
                <input type="radio" checked={sendMode === 'all'} onChange={() => setSendMode('all')} style={{ marginTop: 3 }} />
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111' }}>Send all now</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>All leads get emailed immediately after launch</p>
                </div>
              </label>
              <label style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
                padding: '10px 14px', borderRadius: 8,
                border: `1px solid ${sendMode === 'batch' ? '#1d4ed8' : '#e5e5e5'}`,
                background: sendMode === 'batch' ? '#eff6ff' : '#fafafa',
              }}>
                <input type="radio" checked={sendMode === 'batch'} onChange={() => setSendMode('batch')} style={{ marginTop: 3 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111' }}>Send in batches</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>Queue all leads, use "Send Now" to send a batch at a time</p>
                  {sendMode === 'batch' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <span style={{ fontSize: 12, color: '#666' }}>Batch size:</span>
                      <input
                        type="number" min={1} max={500}
                        value={batchSize}
                        onChange={e => setBatchSize(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{ width: 70, padding: '4px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #e5e5e5', textAlign: 'center' }}
                      />
                      <span style={{ fontSize: 12, color: '#888' }}>emails per "Send Now"</span>
                    </div>
                  )}
                </div>
              </label>
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
              <p style={{ margin: 0, fontSize: 12, color: '#166534', lineHeight: 1.5 }}>
                Sends from your configured ops email. Opt-outs are excluded. Pause the campaign from the header if needed.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setLaunchConfirm(false)} style={btnSecondary}>Cancel</button>
              <button onClick={launch} style={btnPrimary(launching, '#166534')}>
                {launching ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Rocket size={13} />}
                {launching ? 'Launching…' : 'Confirm Launch'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
