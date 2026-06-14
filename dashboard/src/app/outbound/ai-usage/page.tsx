'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Sparkles, BarChart2 } from 'lucide-react'

interface Summary {
  total_calls:         number
  total_prompt_tokens: number
  total_output_tokens: number
  total_tokens:        number
  estimated_cost_usd:  number
}

interface CampaignRow {
  campaign_id:   string | null
  campaign_name: string
  calls:         number
  prompt_tokens: number
  output_tokens: number
  total_tokens:  number
  last_at:       string
}

const card: React.CSSProperties = {
  background: '#fff', borderRadius: 10, border: '1px solid #f0f0f0',
  padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function AiUsagePage() {
  const [summary,     setSummary]     = useState<Summary | null>(null)
  const [perCampaign, setPerCampaign] = useState<CampaignRow[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/outbound/ai-usage')
      .then(r => r.json())
      .then(data => {
        setSummary(data.summary ?? null)
        setPerCampaign(Array.isArray(data.per_campaign) ? data.per_campaign : [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
      <Link href="/outbound/campaigns" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#888', fontSize: 12, textDecoration: 'none', marginBottom: 16 }}>
        <ArrowLeft size={12} /> Campaigns
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Sparkles size={18} style={{ color: '#7c3aed' }} />
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>AI Usage</h1>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#ccc' }} />
        </div>
      )}

      {error && (
        <div style={{ padding: '14px 18px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!loading && summary && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }} className="sm:grid-cols-4">
            {[
              { label: 'Total AI Calls',     value: summary.total_calls.toLocaleString() },
              { label: 'Total Tokens',        value: fmt(summary.total_tokens) },
              { label: 'Input Tokens',        value: fmt(summary.total_prompt_tokens) },
              { label: 'Output Tokens',       value: fmt(summary.total_output_tokens) },
              { label: 'Est. Cost (USD)',      value: `$${summary.estimated_cost_usd.toFixed(4)}`, highlight: summary.estimated_cost_usd > 0 },
            ].map(s => (
              <div key={s.label} style={{ ...card, textAlign: 'center', padding: '16px' }}>
                <p style={{ margin: '0 0 3px', fontSize: 22, fontWeight: 700, color: s.highlight ? '#7c3aed' : '#111' }}>{s.value}</p>
                <p style={{ margin: 0, fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{s.label}</p>
              </div>
            ))}
          </div>

          <p style={{ margin: '0 0 4px', fontSize: 11, color: '#bbb', marginBottom: 16 }}>
            Cost estimate uses Gemini 2.5 Flash pricing: $0.075/1M input tokens, $0.30/1M output tokens.
          </p>

          {/* Per-campaign table */}
          {perCampaign.length > 0 ? (
            <div style={card}>
              <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, color: '#111' }}>Breakdown by campaign</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Campaign', 'AI Calls', 'Input Tokens', 'Output Tokens', 'Total Tokens', 'Last Used'].map(h => (
                        <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#aaa', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {perCampaign.map((row, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '8px 12px', fontSize: 13, color: '#111', borderBottom: '1px solid #f8f8f8' }}>
                          {row.campaign_id ? (
                            <Link href={`/outbound/campaigns/${row.campaign_id}`} style={{ color: '#1d4ed8', textDecoration: 'none', fontWeight: 500 }}>
                              {row.campaign_name}
                            </Link>
                          ) : (
                            <span style={{ color: '#aaa' }}>{row.campaign_name}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 13, color: '#555', borderBottom: '1px solid #f8f8f8' }}>{row.calls}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, color: '#555', borderBottom: '1px solid #f8f8f8' }}>{fmt(row.prompt_tokens)}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, color: '#555', borderBottom: '1px solid #f8f8f8' }}>{fmt(row.output_tokens)}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#111', borderBottom: '1px solid #f8f8f8' }}>{fmt(row.total_tokens)}</td>
                        <td style={{ padding: '8px 12px', fontSize: 12, color: '#aaa', borderBottom: '1px solid #f8f8f8', whiteSpace: 'nowrap' }}>
                          {new Date(row.last_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ ...card, textAlign: 'center', padding: '48px 24px' }}>
              <BarChart2 size={32} style={{ color: '#e5e5e5', marginBottom: 12 }} />
              <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#555' }}>No AI usage yet</p>
              <p style={{ margin: 0, fontSize: 13, color: '#aaa' }}>AI usage appears here after generating email drafts in a campaign.</p>
            </div>
          )}
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
