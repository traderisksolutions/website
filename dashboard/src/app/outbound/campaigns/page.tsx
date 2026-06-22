'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Megaphone, Plus, Loader2, AlertCircle, ChevronRight, Newspaper } from 'lucide-react'
import { Tip } from '@/components/Tip'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { AppScrollPage } from '@/components/app-shell'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import type { AppStatus } from '@/components/status-badge'

interface Campaign {
  id: string; name: string; status: string
  lead_count: number; sent_count: number; reply_count: number
  news_headline: string | null; instantly_campaign_id: string | null
  created_at: string
}

function Stat({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <p className={cn('text-[16px] font-bold tracking-tight', highlight ? 'text-emerald-700' : 'text-foreground')}>{value}</p>
      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{label}</p>
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
    <AppScrollPage maxWidth="1100px">

      <PageHeader
        title="Campaigns"
        description="AI-drafted email sequences → human review → send via Instantly"
        actions={
          <Button size="sm" onClick={() => setShowModal(true)} className="gap-1.5">
            <Plus size={13} strokeWidth={2.5} /> New Campaign
          </Button>
        }
        className="mb-6"
      />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 mb-4 rounded-lg bg-destructive/8 border border-destructive/20 text-[13px] text-destructive">
          <AlertCircle size={14} strokeWidth={2} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="bg-transparent border-0 cursor-pointer text-destructive text-base leading-none">×</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Megaphone size={32} className="text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-[15px] font-semibold text-foreground mb-1">No campaigns yet</p>
            <p className="text-[13px] text-muted-foreground mb-5">Create your first campaign from leads in the Lead Database</p>
            <Button size="sm" onClick={() => setShowModal(true)} className="gap-1.5">
              <Plus size={13} strokeWidth={2.5} /> New Campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {campaigns.map(c => {
            const replyRate = c.sent_count > 0 ? Math.round((c.reply_count / c.sent_count) * 100) : 0
            return (
              <Link key={c.id} href={`/outbound/campaigns/${c.id}`} className="no-underline block rounded-md">
                <Card className="transition-shadow hover:shadow-[var(--shadow-panel)]">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-[9px] bg-muted flex items-center justify-center flex-shrink-0">
                      <Megaphone size={16} className="text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-[14px] font-semibold text-foreground tracking-tight overflow-hidden text-ellipsis whitespace-nowrap">{c.name}</p>
                        <StatusBadge status={c.status as AppStatus} />
                      </div>
                      {c.news_headline && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap">
                          <Newspaper size={10} /> {c.news_headline}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-6 flex-shrink-0">
                      <Stat label="Leads"   value={c.lead_count} />
                      <Stat label="Sent"    value={c.sent_count} />
                      <Stat label="Replies" value={c.reply_count} highlight={c.reply_count > 0} />
                      {c.sent_count > 0 && <Stat label="Reply rate" value={`${replyRate}%`} />}
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground/40 flex-shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {/* New Campaign Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-[3px]"
          style={{ background: 'rgba(0,0,0,0.22)' }}>
          <div className="glass-modal rounded-2xl p-7 max-w-[460px] w-[90%]">
            <p className="text-[16px] font-bold text-foreground mb-5">New Campaign</p>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Campaign Name *</label>
                <Input
                  autoFocus
                  placeholder="e.g. SG Logistics Q3 — Liability"
                  value={campName}
                  onChange={e => setCampName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createCampaign()}
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Product / Service Type *</label>
                <select value={campPt} onChange={e => setCampPt(e.target.value)}
                  className="w-full h-9 px-3 text-[13px] text-foreground bg-background border border-input rounded-md outline-none focus:ring-1 focus:ring-ring">
                  {PRODUCT_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  News Hook URL (optional){' '}
                  <Tip placement="right" text="Paste a relevant article and the AI opens Email 1 with it as a hook — 'I came across this on [topic]…' Leave blank and the AI finds a suitable piece automatically." />
                </label>
                <Input
                  placeholder="Paste article URL or leave blank for auto-fetch"
                  value={newsUrl}
                  onChange={e => setNewsUrl(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
                You&apos;ll select leads and generate AI drafts on the next screen.
              </p>
            </div>
            <div className="flex gap-2.5 justify-end mt-5">
              <Button variant="outline" size="sm" onClick={closeModal}>Cancel</Button>
              <Button size="sm" onClick={createCampaign} disabled={creating || !campName.trim()} className="gap-1.5">
                {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} strokeWidth={2.5} />}
                {creating ? 'Creating…' : 'Create Campaign'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppScrollPage>
  )
}
