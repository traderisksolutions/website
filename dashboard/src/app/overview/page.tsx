'use client'

import Link from 'next/link'

interface Node {
  id: string
  label: string
  sublabel: string
  color: string
  href?: string
  x: number
  y: number
}

const NODES: Node[] = [
  { id: 'website',  label: 'Website Form',   sublabel: 'Contact form on site',           color: '#3b82f6', x: 1, y: 1 },
  { id: 'email',    label: 'Email Enquiry',  sublabel: 'Direct inbound email',           color: '#3b82f6', x: 3, y: 1 },
  { id: 'whatsapp', label: 'WhatsApp Click', sublabel: 'Click-to-chat campaign',         color: '#3b82f6', x: 5, y: 1 },
  { id: 'linkedin', label: 'LinkedIn',       sublabel: 'AI-scraped decision-makers',     color: '#8b5cf6', x: 7, y: 1 },

  { id: 'inbound',  label: 'Inbound Inbox',  sublabel: 'Email · WhatsApp · Web',         color: '#3b82f6', x: 2, y: 3, href: '/inbound/email' },
  { id: 'outbound', label: 'Outbound CRM',   sublabel: 'Scraped & enriched leads',       color: '#8b5cf6', x: 6, y: 3, href: '/outbound/leads' },

  { id: 'agent1',   label: 'Agent 1',        sublabel: 'First reply — instant response', color: '#c00',    x: 2, y: 5, href: '/inbound/email' },
  { id: 'agent2',   label: 'Outbound Agent', sublabel: 'LinkedIn search & save',         color: '#8b5cf6', x: 5, y: 5, href: '/outbound/agent' },
  { id: 'engage',   label: 'Agent 2',        sublabel: 'Engagement — 2nd msg onwards',   color: '#f59e0b', x: 2, y: 7, href: '/engagement' },

  { id: 'pipeline', label: 'Lead Pipeline',  sublabel: 'Stage · channel · value',        color: '#16a34a', x: 4, y: 9, href: '/contacts' },
  { id: 'analytics',label: 'Analytics',      sublabel: 'Funnel · conversion · ROI',      color: '#16a34a', x: 6, y: 9, href: '/analytics' },
  { id: 'team',     label: 'Team',           sublabel: 'Employee outreach activity',     color: '#16a34a', x: 2, y: 9, href: '/team' },
]

const ARROWS: { from: string; to: string; label?: string }[] = [
  { from: 'website',  to: 'inbound' },
  { from: 'email',    to: 'inbound' },
  { from: 'whatsapp', to: 'inbound' },
  { from: 'linkedin', to: 'outbound' },
  { from: 'inbound',  to: 'agent1',   label: 'triggers' },
  { from: 'outbound', to: 'agent2' },
  { from: 'agent1',   to: 'engage',   label: 'hands off' },
  { from: 'agent1',   to: 'pipeline' },
  { from: 'agent2',   to: 'outbound' },
  { from: 'engage',   to: 'pipeline' },
  { from: 'outbound', to: 'pipeline' },
  { from: 'pipeline', to: 'analytics' },
  { from: 'pipeline', to: 'team' },
]

const COL_W = 110
const ROW_H = 90
const NW    = 136
const NH    = 60
const COLS  = 8
const ROWS  = 10
const SVG_W = COL_W * COLS
const SVG_H = ROW_H * ROWS

function nodeCenter(n: Node): [number, number] {
  return [n.x * COL_W - COL_W / 2, n.y * ROW_H - ROW_H / 2]
}

function getNode(id: string): Node {
  return NODES.find(n => n.id === id)!
}

function arrowPath(from: Node, to: Node): string {
  const [x1, y1] = nodeCenter(from)
  const [x2, y2] = nodeCenter(to)
  const midY = (y1 + y2) / 2
  return `M${x1},${y1 + NH / 2} C${x1},${midY} ${x2},${midY} ${x2},${y2 - NH / 2}`
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: '#555' }}>{label}</span>
    </div>
  )
}

export default function OverviewPage() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>How it works</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#aaa' }}>End-to-end flow — from first touch to closed deal</p>
      </div>

      <div style={{ display: 'flex', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
        <Legend color="#3b82f6" label="Inbound channels" />
        <Legend color="#8b5cf6" label="Outbound prospecting" />
        <Legend color="#c00"    label="AI Agent 1 — First Reply" />
        <Legend color="#f59e0b" label="AI Agent 2 — Engagement" />
        <Legend color="#16a34a" label="Pipeline & analytics" />
      </div>

      <div style={{ border: '1px solid #e5e5e5', borderRadius: 14, background: '#fafafa', overflow: 'auto', position: 'relative' }}>
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width={SVG_W} height={SVG_H} style={{ display: 'block', minWidth: SVG_W }}>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#d1d5db" />
            </marker>
          </defs>

          {ARROWS.map((a, i) => {
            const from = getNode(a.from)
            const to   = getNode(a.to)
            const [mx, my] = nodeCenter(from)
            const [tx, ty] = nodeCenter(to)
            return (
              <g key={i}>
                <path d={arrowPath(from, to)} fill="none" stroke="#e5e5e5" strokeWidth={1.5} markerEnd="url(#arrow)" />
                {a.label && (
                  <text x={(mx + tx) / 2} y={(my + ty) / 2} textAnchor="middle" fontSize={9} fill="#bbb" dominantBaseline="middle">
                    {a.label}
                  </text>
                )}
              </g>
            )
          })}

          {NODES.map(n => {
            const [cx, cy] = nodeCenter(n)
            const x = cx - NW / 2
            const y = cy - NH / 2
            const NodeContent = (
              <g key={n.id}>
                <rect x={x + 1} y={y + 2} width={NW} height={NH} rx={9} fill="#00000008" />
                <rect x={x} y={y} width={NW} height={NH} rx={9} fill="#fff" stroke={n.color + '55'} strokeWidth={1.5} />
                <rect x={x} y={y + 12} width={3} height={NH - 24} rx={2} fill={n.color} />
                <text x={cx + 4} y={cy - 8} textAnchor="middle" fontSize={12} fontWeight="700" fill="#111" dominantBaseline="middle">
                  {n.label}
                </text>
                <text x={cx + 4} y={cy + 10} textAnchor="middle" fontSize={9.5} fill="#aaa" dominantBaseline="middle">
                  {n.sublabel}
                </text>
              </g>
            )
            return n.href ? (
              <a key={n.id} href={n.href} style={{ cursor: 'pointer' }}>{NodeContent}</a>
            ) : (
              <g key={n.id}>{NodeContent}</g>
            )
          })}
        </svg>
      </div>

      <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {[
          { color: '#3b82f6', step: '01', title: 'Capture Inbound',       desc: 'Website forms, email enquiries, and WhatsApp click-to-chat messages are automatically captured and routed to the Inbound Inbox.', href: '/inbound/email', linkLabel: 'Open Inbox →' },
          { color: '#8b5cf6', step: '02', title: 'Prospect Outbound',      desc: 'The AI Outbound Agent searches LinkedIn for decision-makers matching your target criteria and saves qualified profiles to the CRM.', href: '/outbound/agent', linkLabel: 'Outbound Agent →' },
          { color: '#c00',    step: '03', title: 'Agent 1 — First Reply',  desc: 'Every new inbound lead receives an instant, personalised response within seconds — no lead goes cold.', href: '/inbound/email', linkLabel: 'View Inbound →' },
          { color: '#f59e0b', step: '04', title: 'Agent 2 — Engagement',   desc: 'Agent 2 takes over from the second message onwards, nurturing each conversation until the lead is qualified or converts.', href: '/engagement', linkLabel: 'Engagement Agent →' },
          { color: '#16a34a', step: '05', title: 'Unified Pipeline',        desc: 'Every inbound and outbound contact is tracked by stage, channel, and value in one unified Contacts & Analytics view.', href: '/contacts', linkLabel: 'View Contacts →' },
          { color: '#16a34a', step: '06', title: 'Team Activity',           desc: 'Managers see each employee\'s outreach cadence, reply rates, and meeting conversions — keeping the whole team accountable.', href: '/team', linkLabel: 'View Team →' },
        ].map(s => (
          <div key={s.step} style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: '16px 18px', background: '#fff', borderTop: `3px solid ${s.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: s.color, color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.step}</span>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#111' }}>{s.title}</p>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#666', lineHeight: 1.6 }}>{s.desc}</p>
            <Link href={s.href} style={{ fontSize: 12, fontWeight: 600, color: s.color, textDecoration: 'none' }}>{s.linkLabel}</Link>
          </div>
        ))}
      </div>
    </div>
  )
}
