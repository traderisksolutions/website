'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Megaphone, Plus, Loader2, AlertCircle, ChevronRight, Newspaper } from 'lucide-react'
import { Tip } from '@/components/Tip'

interface Campaign {
  id: string; name: string; status: string
  lead_count: number; sent_count: number; reply_count: number
  news_headline: string | null; instantly_campaign_id: string | null
  created_at: string
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  draft:     { color: '#92400e', bg: '#fef3c7' },
  review:    { color: '#1e40af', bg: '#dbeafe' },
  active:    { color: '#166534', bg: '#f0fdf4' },
  paused:    { color: '#7c3aed', bg: '#ede9fe' },
  completed: { color: '#555',    bg: '#f4f4f5' },
  archived:  { color: '#aaa',    bg: '#f9f9f9' },
}

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: '20px 24px',
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const PRODUCT_TYPES = ['Business Assets', 'Business Liabilities', 'Workforce', 'API', 'General'] as const

  // New campaign modal state
  const [showModal,    setShowModal]    = useState(false)
  const [campName,     setCampName]     = useState('')
  const [campPt,       setCampPt]       = useState('General')
  const [newsUrl,      setNewsUrl]      = useState('')
  const [creating,     setCreating]     = useState(false)

  const loadCampaigns = useCallback(async () => {
    try {
      const res  = await fetch('/api/outbound/campaigns')
      const data = await res.json()
      setCampaigns(Array.isArray(data) ? data : [])
    } catch {
      setError('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCampaigns() }, [loadCampaigns])

  async function createCampaign() {
    if (!campName.trim()) return
    setCreating(true)
    try {
      const res  = await fetch('/api/outbound/campaigns', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:        campName.trim(),
          productType: campPt,
          leadIds:     ['placeholder'],
          newsUrl:     newsUrl.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create')
      setShowModal(false); setCampName(''); setCampPt('General'); setNewsUrl('')
      await loadCampaigns()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create campaign')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>
            Campaigns
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#aaa' }}>
            AI-drafted email sequences → human review → send via Instantly
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: '#111', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={13} /> New Campaign
        </button>
      </div>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', marginBottom: 16, borderRadius: 8,
          background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13,
        }}>
          <AlertCircle size={14} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 16 }}>×</button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#ccc' }} />
        </div>
      ) : campaigns.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '48px 24px' }}>
          <Megaphone size={32} style={{ color: '#e5e5e5', marginBottom: 12 }} />
          <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#555' }}>No campaigns yet</p>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: '#aaa' }}>
            Create your first campaign from leads in the Lead Database
          </p>
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: '#111', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={13} /> New Campaign
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {campaigns.map(c => {
            const sc = STATUS_COLORS[c.status] ?? STATUS_COLORS.draft
            const replyRate = c.sent_count > 0 ? Math.round((c.reply_count / c.sent_count) * 100) : 0
            return (
              <Link key={c.id} href={`/outbound/campaigns/${c.id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  ...card, cursor: 'pointer', padding: '16px 20px',
                  display: 'flex', alignItems: 'center', gap: 16,
                  transition: 'border-color 0.1s',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9, background: '#f4f4f5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Megaphone size={16} style={{ color: '#888' }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </p>
                      <span style={{
                        padding: '1px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        color: sc.color, background: sc.bg, flexShrink: 0,
                      }}>
                        {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                      </span>
                    </div>
                    {c.news_headline && (
                      <p style={{ margin: 0, fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Newspaper size={10} /> {c.news_headline}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 24, flexShrink: 0 }}>
                    <Stat label="Leads"   value={c.lead_count} />
                    <Stat label="Sent"    value={c.sent_count} />
                    <Stat label="Replies" value={c.reply_count} highlight={c.reply_count > 0} />
                    {c.sent_count > 0 && <Stat label="Reply rate" value={`${replyRate}%`} />}
                  </div>

                  <div style={{ color: '#ccc', flexShrink: 0 }}>
                    <ChevronRight size={16} />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* New Campaign Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 14, padding: '28px 32px',
            maxWidth: 460, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <p style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#111' }}>New Campaign</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Campaign Name *
                </label>
                <input
                  autoFocus
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 7, border: '1px solid #e5e5e5', background: '#fafafa', color: '#111', outline: 'none', boxSizing: 'border-box' }}
                  placeholder="e.g. SG Logistics Q3 — Liability"
                  value={campName}
                  onChange={e => setCampName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createCampaign()}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Product / Service Type *
                </label>
                <select
                  value={campPt}
                  onChange={e => setCampPt(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 7, border: '1px solid #e5e5e5', background: '#fafafa', color: '#111', outline: 'none' }}
                >
                  {PRODUCT_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  News Hook URL (optional) <Tip placement="right" text="Paste a relevant article and the AI opens Email 1 with it as a hook — 'I came across this on [topic]…' Leave blank and the AI finds a suitable piece automatically." />
                </label>
                <input
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 7, border: '1px solid #e5e5e5', background: '#fafafa', color: '#111', outline: 'none', boxSizing: 'border-box' }}
                  placeholder="Paste article URL or leave blank for auto-fetch"
                  value={newsUrl}
                  onChange={e => setNewsUrl(e.target.value)}
                />
              </div>
              <p style={{ margin: 0, fontSize: 11, color: '#bbb', lineHeight: 1.5 }}>
                You&apos;ll select leads and generate AI drafts on the next screen.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
              <button onClick={() => { setShowModal(false); setCampName(''); setCampPt('General'); setNewsUrl('') }} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 7, border: '1px solid #e5e5e5',
                background: '#fff', color: '#333', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}>Cancel</button>
              <button
                onClick={createCampaign}
                disabled={creating || !campName.trim()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: '#111', color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: creating || !campName.trim() ? 'default' : 'pointer',
                  opacity: creating || !campName.trim() ? 0.45 : 1,
                }}
              >
                {creating ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />}
                {creating ? 'Creating…' : 'Create Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function Stat({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: highlight ? '#166534' : '#111' }}>{value}</p>
      <p style={{ margin: 0, fontSize: 10, color: '#aaa', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
    </div>
  )
}
