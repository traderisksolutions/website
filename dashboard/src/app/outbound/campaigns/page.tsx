'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, X } from 'lucide-react'
import { Tip } from '@/components/Tip'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import type { AppStatus } from '@/components/status-badge'
import { Field, inputCls } from '@/components/crm/primitives'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'

interface Campaign {
  id: string; name: string; status: string
  lead_count: number; sent_count: number; reply_count: number
  news_headline: string | null; instantly_campaign_id: string | null
  created_at: string
}

interface SegmentSuggestion {
  industry:        string
  wonCompanyCount: number
  sampleCompanies: string[]
  employeeMin:     number | null
  employeeMax:     number | null
  suggestedTitles: string[]
  locations:       string[]
}

function SegmentSuggestions() {
  const router = useRouter()
  const [suggestions, setSuggestions] = useState<SegmentSuggestion[]>([])
  const [loading,     setLoading]     = useState(true)
  const [approving,   setApproving]   = useState<string | null>(null)
  const [dismissed,   setDismissed]   = useState<Set<string>>(new Set())
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/outbound/segment-suggestions', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { suggestions: [] })
      .then(d => setSuggestions(Array.isArray(d.suggestions) ? d.suggestions : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function approve(s: SegmentSuggestion) {
    setApproving(s.industry)
    setError(null)
    try {
      const res = await fetch('/api/outbound/segment-suggestions/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry: s.industry, employeeMin: s.employeeMin, employeeMax: s.employeeMax, locations: s.locations, suggestedTitles: s.suggestedTitles }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create campaign')
      router.push(`/outbound/campaigns/${data.campaign.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create campaign')
      setApproving(null)
    }
  }

  const visible = suggestions.filter(s => !dismissed.has(s.industry))
  if (loading || visible.length === 0) return null

  return (
    <section className="mb-8">
      <h2 className="m-0 mb-3 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Suggested segments</h2>
      {error && <p className="m-0 mb-3 text-[14px]" style={{ color: '#3c4043' }}>{error}</p>}
      <ul className="m-0 p-0 list-none rounded-[16px] overflow-hidden bg-white" style={{ border: `1px solid ${RULE}` }}>
        {visible.map(s => (
          <li key={s.industry} className="flex items-start gap-4 px-6 py-4 flex-wrap" style={{ borderBottom: `1px solid ${RULE}` }}>
            <div className="flex-1 min-w-[240px]">
              <p className="m-0 text-[15px] font-medium" style={{ color: INK }}>{s.industry}</p>
              <p className="m-0 mt-1 text-[13px] leading-relaxed" style={{ color: MUTED }}>
                {s.wonCompanyCount} won customer{s.wonCompanyCount !== 1 ? 's' : ''} in this industry
                {s.sampleCompanies.length > 0 && <> ({s.sampleCompanies.join(', ')})</>}; no active campaign targets it.
                {s.employeeMin != null && s.employeeMax != null && <> Typical size {s.employeeMin}–{s.employeeMax} employees.</>}
                {s.suggestedTitles.length > 0 && <> Roles seen: {s.suggestedTitles.join(', ')}.</>}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => approve(s)} disabled={approving === s.industry}>
                {approving === s.industry ? 'Creating…' : 'Create draft campaign'}
              </Button>
              <button type="button" onClick={() => setDismissed(prev => new Set(prev).add(s.industry))} aria-label={`Dismiss ${s.industry}`}
                className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}>
                <X size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-[64px]">
      <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>{label}</p>
      <p className="m-0 text-[15px] font-medium tabular-nums" style={{ color: INK }}>{value}</p>
    </div>
  )
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const PRODUCT_TYPES = ['Business Assets', 'Business Liabilities', 'Workforce', 'API', 'General'] as const

  const [showModal,    setShowModal]    = useState(false)
  const [campName,     setCampName]     = useState('')
  const [campPt,       setCampPt]       = useState('General')
  const [newsUrl,      setNewsUrl]      = useState('')
  const [variantMode,  setVariantMode]  = useState(false)
  const [creating,     setCreating]     = useState(false)

  const loadCampaigns = useCallback(async () => {
    try {
      const res  = await fetch('/api/outbound/campaigns')
      const data = await res.json()
      setCampaigns(Array.isArray(data) ? data : [])
    } catch {
      setError('Failed to load campaigns')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadCampaigns() }, [loadCampaigns])

  async function createCampaign() {
    if (!campName.trim()) return
    setCreating(true)
    try {
      const res  = await fetch('/api/outbound/campaigns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: campName.trim(), productType: campPt, variant_mode: variantMode, newsUrl: newsUrl.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create')
      setShowModal(false); setCampName(''); setCampPt('General'); setNewsUrl('')
      await loadCampaigns()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create campaign')
    } finally { setCreating(false) }
  }

  function closeModal() { setShowModal(false); setCampName(''); setCampPt('General'); setNewsUrl(''); setVariantMode(false) }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">

        {/* Header */}
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Campaigns</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
              {loading ? 'Loading…' : `${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <button type="button" onClick={() => setShowModal(true)}
            className="h-12 px-6 rounded-[12px] text-white text-[15px] font-medium border-0 cursor-pointer whitespace-nowrap hover:opacity-90" style={{ background: INK }}>
            New campaign
          </button>
        </div>

        {error && (
          <p className="mt-6 mb-0 text-[14px] flex items-center gap-3" style={{ color: '#3c4043' }}>
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>Dismiss</button>
          </p>
        )}

        <div className="mt-8">
          <SegmentSuggestions />

          {loading ? (
            <div className="rounded-[16px] overflow-hidden bg-white" style={{ border: `1px solid ${RULE}` }} aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-[72px] px-6 flex items-center gap-8" style={{ borderBottom: `1px solid ${RULE}` }}>
                  <span className="h-3.5 w-52 rounded bg-[#f1f3f4] animate-pulse" />
                  <span className="h-3.5 w-14 rounded bg-[#f1f3f4] animate-pulse" />
                  <span className="h-3.5 w-28 rounded bg-[#f1f3f4] animate-pulse ml-auto" />
                </div>
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>
              No campaigns yet.{' '}
              <button type="button" onClick={() => setShowModal(true)} className="underline bg-transparent border-0 p-0 cursor-pointer" style={{ color: INK }}>Create the first one</button>
            </p>
          ) : (
            <ul className="m-0 p-0 list-none rounded-[16px] overflow-hidden bg-white" style={{ border: `1px solid ${RULE}` }}>
              {campaigns.map(c => {
                const replyRate = c.sent_count > 0 ? Math.round((c.reply_count / c.sent_count) * 100) : 0
                return (
                  <li key={c.id} style={{ borderBottom: `1px solid ${RULE}` }}>
                    <Link href={`/outbound/campaigns/${c.id}`} className="no-underline flex items-center gap-6 px-6 py-4 flex-wrap hover:bg-[#f8f9fa] transition-colors" style={{ color: INK }}>
                      <div className="flex-1 min-w-[220px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="m-0 text-[15px] font-medium truncate">{c.name}</p>
                          <StatusBadge status={c.status as AppStatus} />
                        </div>
                        {c.news_headline && (
                          <p className="m-0 mt-0.5 text-[13px] truncate" style={{ color: MUTED }}>{c.news_headline}</p>
                        )}
                      </div>
                      <div className="flex gap-6 flex-shrink-0 flex-wrap">
                        <Metric label="Leads"   value={c.lead_count} />
                        <Metric label="Sent"    value={c.sent_count} />
                        <Metric label="Replies" value={c.reply_count} />
                        {c.sent_count > 0 && <Metric label="Reply rate" value={`${replyRate}%`} />}
                      </div>
                      <ChevronRight size={16} className="flex-shrink-0" style={{ color: '#9aa0a6' }} aria-hidden />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* New campaign dialog */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[12vh]" style={{ background: 'rgba(32,33,36,0.28)' }}
          onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div role="dialog" aria-modal="true" aria-labelledby="new-campaign" className="w-full max-w-[520px] rounded-[16px] bg-white p-6" style={{ boxShadow: '0 24px 64px rgba(32,33,36,0.2)', color: INK }}>
            <h2 id="new-campaign" className="m-0 text-[20px] font-medium">New campaign</h2>
            <p className="m-0 mt-1 text-[13.5px]" style={{ color: MUTED }}>Leads, sequence and review continue in the campaign workspace.</p>
            <div className="mt-5 flex flex-col gap-3.5">
              <Field label="Campaign name">
                <input
                  autoFocus
                  className={inputCls}
                  placeholder="SG Logistics Q3 — Liability"
                  value={campName}
                  onChange={e => setCampName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createCampaign()}
                />
              </Field>
              <Field label="Product or service type">
                <select value={campPt} onChange={e => setCampPt(e.target.value)} className={inputCls}>
                  {PRODUCT_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                </select>
              </Field>
              <label className="block min-w-0">
                <span className="flex items-center gap-1 text-[12.5px] mb-1.5" style={{ color: MUTED }}>
                  News hook URL (optional)
                  <Tip placement="right" text="Paste a relevant article and the AI opens Email 1 with it as a hook. Leave blank and the AI finds a suitable piece." />
                </span>
                <input
                  className={inputCls}
                  placeholder="https://…"
                  value={newsUrl}
                  onChange={e => setNewsUrl(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={closeModal}>Cancel</Button>
              <Button size="sm" onClick={createCampaign} disabled={creating || !campName.trim()}>
                {creating ? 'Creating…' : 'Create campaign'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
