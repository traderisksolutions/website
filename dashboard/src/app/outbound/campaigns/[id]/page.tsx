'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, AlertCircle, CheckCircle, Sparkles,
  Newspaper, Rocket, RefreshCw, ChevronDown, ChevronUp,
  Mail, Users, BarChart2,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string; name: string; status: string
  news_url: string | null; news_headline: string | null; news_summary: string | null
  lead_count: number; sent_count: number; reply_count: number
  instantly_campaign_id: string | null; created_at: string
}

interface Sequence {
  id: string; campaign_id: string; step_number: number
  subject: string; body: string; delay_days: number; status: 'draft' | 'approved'
}

interface Send {
  status: string
}

interface Lead {
  id: string; full_name: string | null; email: string | null
  current_title: string | null; current_company: string | null
  status: string; opt_out: boolean
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

type Tab = 'sequence' | 'leads' | 'analytics'

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id     = params.id as string

  const [campaign,  setCampaign]  = useState<Campaign | null>(null)
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [sends,     setSends]     = useState<Send[]>([])
  const [leads,     setLeads]     = useState<Lead[]>([])
  const [tab,       setTab]       = useState<Tab>('sequence')

  const [loading,       setLoading]       = useState(true)
  const [drafting,      setDrafting]      = useState(false)
  const [launching,     setLaunching]     = useState(false)
  const [savingSeqs,    setSavingSeqs]    = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [successMsg,    setSuccessMsg]    = useState<string | null>(null)
  const [expandedStep,  setExpandedStep]  = useState<number | null>(1)
  const [localSeqs,     setLocalSeqs]     = useState<Sequence[]>([])
  const [launchConfirm, setLaunchConfirm] = useState(false)
  const [fetchingLeads, setFetchingLeads] = useState(false)

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/outbound/campaigns/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Not found')
      setCampaign(data.campaign)
      setSequences(data.sequences ?? [])
      setLocalSeqs(data.sequences ?? [])
      setSends(data.sends ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // Load leads when switching to leads tab
  useEffect(() => {
    if (tab !== 'leads' || leads.length > 0) return
    setFetchingLeads(true)
    fetch('/api/outbound/leads?status=new&limit=200')
      .then(r => r.json())
      .then(data => setLeads(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setFetchingLeads(false))
  }, [tab, leads.length])

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
      if (!res.ok) throw new Error(data.error ?? 'Drafting failed')
      const updated = data.sequences ?? []
      setLocalSeqs(updated); setSequences(updated)
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
      setSequences(data.sequences ?? localSeqs)
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

  // ── Launch ────────────────────────────────────────────────────────────────

  async function launch() {
    setLaunchConfirm(false); setLaunching(true); setError(null)
    // First save any pending edits
    await saveSequences()

    const validLeadIds = leads.filter(l => l.email && !l.opt_out).map(l => l.id)
    try {
      const res  = await fetch(`/api/outbound/campaigns/${id}/launch`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ leadIds: validLeadIds }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'INSTANTLY_NOT_CONFIGURED') {
          setError('Instantly API key not yet configured. Add INSTANTLY_API_KEY to your environment variables, then launch.')
        } else {
          throw new Error(data.error ?? 'Launch failed')
        }
        return
      }
      setSuccessMsg(`Campaign launched! ${data.leadsQueued} leads queued in Instantly.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Launch failed')
    } finally { setLaunching(false) }
  }

  const allApproved = localSeqs.length > 0 && localSeqs.every(s => s.status === 'approved')
  const hasDraft    = localSeqs.some(s => s.subject || s.body)
  const isActive    = campaign?.status === 'active'
  const sendStats   = {
    pending:    sends.filter(s => s.status === 'pending').length,
    sent:       sends.filter(s => s.status === 'sent').length,
    replied:    sends.filter(s => s.status === 'replied').length,
    bounced:    sends.filter(s => s.status === 'bounced').length,
  }

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
    <div style={{ padding: '28px 32px', maxWidth: 1000, margin: '0 auto' }}>

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
        </div>

        {campaign.news_headline && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10,
            padding: '10px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0',
          }}>
            <Newspaper size={13} style={{ color: '#166534', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 600, color: '#166534' }}>News Hook</p>
              <p style={{ margin: '0 0 2px', fontSize: 12, color: '#166534' }}>{campaign.news_headline}</p>
              {campaign.news_summary && <p style={{ margin: 0, fontSize: 11, color: '#4ade80', lineHeight: 1.5 }}>{campaign.news_summary}</p>}
            </div>
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
      <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', marginBottom: 20, gap: 0 }}>
        {([
          { key: 'sequence',  label: 'Sequence',  icon: <Mail size={13} /> },
          { key: 'leads',     label: 'Leads',     icon: <Users size={13} /> },
          { key: 'analytics', label: 'Analytics', icon: <BarChart2 size={13} /> },
        ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '8px 16px', border: 'none', borderBottom: `2px solid ${tab === t.key ? '#111' : 'transparent'}`,
              background: 'none', fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#111' : '#888', cursor: 'pointer',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ══ SEQUENCE TAB ══ */}
      {tab === 'sequence' && (
        <div>
          {/* Action bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#888' }}>
                {hasDraft
                  ? 'Review and edit each step. Approve all steps before launching.'
                  : 'Generate AI drafts to get started.'}
              </p>
            </div>
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
              <button onClick={() => setLaunchConfirm(true)} disabled={launching} style={btnPrimary(launching, '#166534')}>
                {launching
                  ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Launching…</>
                  : <><Rocket size={13} /> Launch Campaign</>
                }
              </button>
            )}
          </div>

          {/* Sequence steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {localSeqs.map((seq, i) => {
              const isExpanded = expandedStep === seq.step_number
              const approved   = seq.status === 'approved'
              return (
                <div key={seq.id} style={{
                  ...card, padding: 0, overflow: 'hidden',
                  border: `1px solid ${approved ? '#bbf7d0' : '#e8e8e8'}`,
                }}>
                  {/* Step header */}
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
                        {seq.step_number === 1 ? 'Email 1 — Initial outreach' : seq.step_number === 2 ? `Email 2 — Follow-up` : `Email 3 — Final touch`}
                        {seq.step_number > 1 && (
                          <span style={{ fontSize: 11, fontWeight: 400, color: '#aaa', marginLeft: 8 }}>
                            {seq.delay_days === 0 ? 'Same day' : `+${seq.delay_days} days after previous`}
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
                      background: approved ? '#f0fdf4' : '#fef3c7',
                      flexShrink: 0,
                    }}>
                      {approved ? 'Approved' : 'Draft'}
                    </span>
                    {isExpanded ? <ChevronUp size={14} style={{ color: '#ccc' }} /> : <ChevronDown size={14} style={{ color: '#ccc' }} />}
                  </button>

                  {/* Step editor */}
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
                        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#bbb' }}>
                          Tokens: {'{{first_name}}'} · {'{{company}}'}
                        </p>
                      </div>

                      {!isActive && !approved && seq.subject && seq.body && (
                        <button
                          onClick={() => approveStep(seq.id)}
                          style={btnPrimary(false, '#166534')}
                        >
                          <CheckCircle size={13} /> Approve Step {seq.step_number}
                        </button>
                      )}
                      {!isActive && approved && (
                        <button
                          onClick={() => updateLocalSeq(seq.id, 'status', 'draft')}
                          style={btnSecondary}
                        >
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
          {fetchingLeads ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#ccc' }} />
            </div>
          ) : leads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ fontSize: 13, color: '#aaa', marginBottom: 12 }}>No leads with emails yet.</p>
              <Link href="/outbound/leads" style={{ color: '#1d4ed8', fontSize: 13 }}>Go to Lead Database →</Link>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Name', 'Email', 'Title', 'Company', 'Status'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: '#aaa', fontWeight: 600, fontSize: 11, borderBottom: '1px solid #f0f0f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 100).map(l => (
                  <tr key={l.id}>
                    <td style={{ padding: '9px 10px', borderBottom: '1px solid #f8f8f8', fontSize: 13, fontWeight: 500, color: '#111' }}>{l.full_name || '—'}</td>
                    <td style={{ padding: '9px 10px', borderBottom: '1px solid #f8f8f8', fontSize: 12, color: l.email ? '#166534' : '#ccc' }}>{l.email || '—'}</td>
                    <td style={{ padding: '9px 10px', borderBottom: '1px solid #f8f8f8', fontSize: 12, color: '#888', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.current_title || '—'}</td>
                    <td style={{ padding: '9px 10px', borderBottom: '1px solid #f8f8f8', fontSize: 12, color: '#555' }}>{l.current_company || '—'}</td>
                    <td style={{ padding: '9px 10px', borderBottom: '1px solid #f8f8f8' }}>
                      {l.opt_out
                        ? <span style={{ fontSize: 11, color: '#aaa' }}>Opted out</span>
                        : <span style={{ fontSize: 11, fontWeight: 600, color: '#166534', background: '#f0fdf4', padding: '2px 7px', borderRadius: 4 }}>{l.status}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ══ ANALYTICS TAB ══ */}
      {tab === 'analytics' && (
        <div>
          {isActive ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Total Leads',  value: campaign.lead_count  },
                { label: 'Sent',         value: campaign.sent_count  },
                { label: 'Replied',      value: campaign.reply_count, highlight: true },
                { label: 'Reply Rate',   value: campaign.sent_count > 0 ? `${Math.round((campaign.reply_count / campaign.sent_count) * 100)}%` : '—' },
              ].map(s => (
                <div key={s.label} style={{ ...card, textAlign: 'center', padding: '16px' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: s.highlight && (campaign.reply_count > 0) ? '#166534' : '#111' }}>{s.value}</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{s.label}</p>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ ...card, textAlign: 'center', padding: '48px 24px' }}>
              <BarChart2 size={32} style={{ color: '#e5e5e5', marginBottom: 12 }} />
              <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#555' }}>Analytics available after launch</p>
              <p style={{ margin: 0, fontSize: 13, color: '#aaa' }}>Approve all sequence steps and launch the campaign to see reply tracking here.</p>
            </div>
          )}

          {sends.length > 0 && (
            <div style={card}>
              <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#111' }}>Send breakdown</p>
              <div style={{ display: 'flex', gap: 20 }}>
                {[
                  { label: 'Pending',      value: sendStats.pending   },
                  { label: 'Sent',         value: sendStats.sent      },
                  { label: 'Replied',      value: sendStats.replied   },
                  { label: 'Bounced',      value: sendStats.bounced   },
                ].map(s => (
                  <div key={s.label}>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>{s.value}</p>
                    <p style={{ margin: 0, fontSize: 11, color: '#aaa' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Launch confirm modal */}
      {launchConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#111' }}>Launch Campaign</p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#555', lineHeight: 1.65 }}>
              This will push all approved email steps and qualified leads to Instantly and begin sending.
              Opt-outs are automatically excluded.
            </p>
            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
              <p style={{ margin: 0, fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                Ensure INSTANTLY_API_KEY is configured before launching.
                Once launched, this cannot be undone from this dashboard.
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
