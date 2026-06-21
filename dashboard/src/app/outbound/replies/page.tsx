'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type ReplyLabel =
  | 'positive' | 'neutral' | 'negative' | 'unsubscribe'
  | 'out_of_office' | 'wrong_person' | 'meeting_intent' | 'question'

interface Classification {
  id: string
  ai_label:   ReplyLabel | null
  ai_confidence: number | null
  ai_reasoning:  string | null
  human_label:   ReplyLabel | null
  human_reviewed_at: string | null
}

interface ReplyEvent {
  id:              string
  campaign_id:     string | null
  lead_id:         string | null
  lead_email:      string | null
  subject:         string | null
  body_preview:    string | null
  received_at:     string
  classification:  Classification | null
}

// ── Styles ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: '16px 20px',
}

const LABEL_META: Record<ReplyLabel, { label: string; color: string; bg: string }> = {
  positive:      { label: 'Positive',       color: '#166534', bg: '#f0fdf4' },
  meeting_intent:{ label: 'Meeting Intent', color: '#065f46', bg: '#d1fae5' },
  question:      { label: 'Question',       color: '#1e40af', bg: '#dbeafe' },
  neutral:       { label: 'Neutral',        color: '#555',    bg: '#f4f4f5' },
  negative:      { label: 'Not Interested', color: '#991b1b', bg: '#fef2f2' },
  unsubscribe:   { label: 'Unsubscribe',    color: '#7c3aed', bg: '#ede9fe' },
  out_of_office: { label: 'Out of Office',  color: '#92400e', bg: '#fef3c7' },
  wrong_person:  { label: 'Wrong Person',   color: '#92400e', bg: '#fef3c7' },
}

const ALL_LABELS: ReplyLabel[] = [
  'positive','meeting_intent','question','neutral',
  'negative','unsubscribe','out_of_office','wrong_person',
]

// ── Main Page ─────────────────────────────────────────────────────────────────

function RepliesInner() {
  const searchParams   = useSearchParams()
  const campaignFilter = searchParams.get('campaign_id')

  const [replies,      setReplies]      = useState<ReplyEvent[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [successMsg,   setSuccessMsg]   = useState<string | null>(null)
  const [needsReview,  setNeedsReview]  = useState(false)
  const [labelFilter,  setLabelFilter]  = useState<ReplyLabel | 'all'>('all')
  const [saving,       setSaving]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (needsReview)   qs.set('needs_review', 'true')
      if (campaignFilter) qs.set('campaign_id', campaignFilter)
      const res  = await fetch(`/api/outbound/replies${qs.toString() ? `?${qs}` : ''}`)
      const data = await res.json()
      setReplies(Array.isArray(data) ? data : [])
    } catch {
      setError('Failed to load replies')
    } finally {
      setLoading(false)
    }
  }, [needsReview, campaignFilter])

  useEffect(() => { load() }, [load])

  async function applyLabel(replyId: string, human_label: ReplyLabel) {
    setSaving(replyId)
    try {
      const res = await fetch(`/api/outbound/replies/${replyId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ human_label }),
      })
      if (!res.ok) throw new Error('Label failed')
      setReplies(prev => prev.map(r =>
        r.id === replyId
          ? {
              ...r,
              classification: {
                ...(r.classification ?? { id: '', ai_label: null, ai_confidence: null, ai_reasoning: null }),
                human_label,
                human_reviewed_at: new Date().toISOString(),
              },
            }
          : r
      ))
      setSuccessMsg('Label saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save label')
    } finally {
      setSaving(null)
    }
  }

  const filtered = replies.filter(r => {
    if (labelFilter === 'all') return true
    const effective = r.classification?.human_label ?? r.classification?.ai_label
    return effective === labelFilter
  })

  const pendingCount = replies.filter(
    r => r.classification && !r.classification.human_label
  ).length

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-7" style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>
            Reply Review
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>
            AI-classified inbound replies. Confirm or override the label.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#555', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={needsReview}
              onChange={e => setNeedsReview(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Needs review only
            {pendingCount > 0 && (
              <span style={{ background: '#f59e0b', color: '#fff', borderRadius: 8, padding: '0 6px', fontSize: 11, fontWeight: 600 }}>
                {pendingCount}
              </span>
            )}
          </label>
        </div>
      </div>

      {/* Info banner */}
      <div style={{
        background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
        padding: '14px 18px', marginBottom: 16,
      }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1e40af' }}>What is Reply Review?</p>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#374151', lineHeight: 1.65 }}>
          When leads reply to your outbound campaigns via Instantly, those replies arrive here automatically via webhook.
          The AI reads each reply and classifies it as <strong>Positive</strong>, <strong>Meeting Intent</strong>, <strong>Question</strong>,{' '}
          <strong>Neutral</strong>, <strong>Not Interested</strong>, <strong>Unsubscribe</strong>, <strong>Out of Office</strong>, or <strong>Wrong Person</strong>.
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#374151', lineHeight: 1.65 }}>
          <strong>Your job:</strong> Confirm the AI label (click it to tick it) or select a different one if the AI got it wrong.
          Reviewed labels keep your pipeline data accurate and help train the classification over time.
          Replies highlighted in <span style={{ background: '#fef3c7', padding: '0 4px', borderRadius: 3, fontWeight: 600, color: '#92400e' }}>amber</span> have not been reviewed yet.
        </p>
      </div>

      {/* Label filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          onClick={() => setLabelFilter('all')}
          style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
            border: `1px solid ${labelFilter === 'all' ? '#111' : '#e5e5e5'}`,
            background: labelFilter === 'all' ? '#111' : '#fff',
            color: labelFilter === 'all' ? '#fff' : '#666', cursor: 'pointer',
          }}
        >
          All
        </button>
        {(['positive','meeting_intent','question','neutral','negative'] as ReplyLabel[]).map(l => {
          const m = LABEL_META[l]
          return (
            <button
              key={l}
              onClick={() => setLabelFilter(l)}
              style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                border: `1px solid ${labelFilter === l ? m.color : '#e5e5e5'}`,
                background: labelFilter === l ? m.bg : '#fff',
                color: labelFilter === l ? m.color : '#666', cursor: 'pointer',
              }}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {/* Error / Success */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 14, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13 }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 16 }}>×</button>
        </div>
      )}
      {successMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 14, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: 13 }}>
          <CheckCircle size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Replies */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#ccc' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ fontSize: 14, color: '#aaa', margin: 0 }}>
            {needsReview ? 'All replies have been reviewed.' : 'No replies yet.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(reply => {
            const cl        = reply.classification
            const aiLabel   = cl?.ai_label ?? null
            const humLabel  = cl?.human_label ?? null
            const effective = humLabel ?? aiLabel
            const meta      = effective ? LABEL_META[effective] : null
            const isReviewed = !!humLabel
            const isSaving  = saving === reply.id

            return (
              <div key={reply.id} style={{
                ...card,
                border: `1px solid ${isReviewed ? '#e8e8e8' : cl && !humLabel ? '#fcd34d' : '#e8e8e8'}`,
              }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                      {meta && (
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                          color: meta.color, background: meta.bg,
                        }}>
                          {humLabel ? '✓ ' : 'AI: '}{meta.label}
                        </span>
                      )}
                      {cl?.ai_confidence != null && (
                        <span style={{ fontSize: 11, color: '#aaa' }}>
                          {Math.round(cl.ai_confidence * 100)}% confidence
                        </span>
                      )}
                      {!cl && (
                        <span style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic' }}>Not yet classified</span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111' }}>
                      {reply.lead_email ?? '—'}
                    </p>
                    {reply.subject && (
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>
                        Re: {reply.subject}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: '#ccc', flexShrink: 0 }}>
                    {new Date(reply.received_at).toLocaleDateString()}
                  </span>
                </div>

                {/* Preview */}
                {reply.body_preview && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 7, background: '#f8f8f8',
                    border: '1px solid #f0f0f0', marginBottom: 10,
                  }}>
                    <p style={{ margin: 0, fontSize: 12, color: '#444', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                      {reply.body_preview}
                    </p>
                  </div>
                )}

                {/* AI reasoning */}
                {cl?.ai_reasoning && (
                  <p style={{ margin: '0 0 10px', fontSize: 11, color: '#7c3aed', fontStyle: 'italic' }}>
                    AI: {cl.ai_reasoning}
                  </p>
                )}

                {/* Human label selector */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {isSaving ? (
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: '#ccc' }} />
                  ) : (
                    ALL_LABELS.map(l => {
                      const m = LABEL_META[l]
                      const selected = humLabel === l
                      return (
                        <button
                          key={l}
                          onClick={() => applyLabel(reply.id, l)}
                          style={{
                            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                            border: `1px solid ${selected ? m.color : '#e5e5e5'}`,
                            background: selected ? m.bg : '#fff',
                            color: selected ? m.color : '#888',
                            cursor: 'pointer',
                          }}
                        >
                          {m.label}
                        </button>
                      )
                    })
                  )}
                  {reply.campaign_id && (
                    <a
                      href={`/outbound/campaigns/${reply.campaign_id}`}
                      style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#1d4ed8', textDecoration: 'none' }}
                    >
                      <ExternalLink size={10} /> Campaign
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export default function RepliesPage() {
  return (
    <Suspense>
      <RepliesInner />
    </Suspense>
  )
}
