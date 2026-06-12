'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Node {
  id: string; label: string; sublabel: string; color: string; href?: string; x: number; y: number
}

const NODES: Node[] = [
  { id: 'website',   label: 'Website Form',   sublabel: 'Contact form on site',           color: '#3b82f6', x: 1, y: 1 },
  { id: 'email',     label: 'Email Enquiry',  sublabel: 'Direct inbound email',           color: '#3b82f6', x: 3, y: 1 },
  { id: 'whatsapp',  label: 'WhatsApp Click', sublabel: 'Click-to-chat campaign',         color: '#3b82f6', x: 5, y: 1 },
  { id: 'linkedin',  label: 'Apollo.io',      sublabel: 'Company & people data',          color: '#8b5cf6', x: 7, y: 1 },
  { id: 'inbound',   label: 'Inbound Inbox',  sublabel: 'Email · WhatsApp · Web',         color: '#3b82f6', x: 2, y: 3, href: '/inbound/email' },
  { id: 'agent2',    label: 'Lead Discovery', sublabel: 'Apollo search & email lookup',   color: '#8b5cf6', x: 5, y: 3, href: '/outbound/agent' },
  { id: 'agent1',    label: 'Agent 1',        sublabel: 'First reply — instant response', color: '#dc2626', x: 2, y: 5, href: '/inbound/email' },
  { id: 'outbound',  label: 'Lead Database',  sublabel: 'Saved outbound leads',           color: '#8b5cf6', x: 6, y: 5, href: '/outbound/leads' },
  { id: 'engage',    label: 'Agent 2',        sublabel: 'Engagement — 2nd msg onwards',   color: '#f59e0b', x: 2, y: 7, href: '/engagement' },
  { id: 'campaigns', label: 'Campaigns',      sublabel: 'AI sequences → Instantly',       color: '#0891b2', x: 6, y: 7, href: '/outbound/campaigns' },
  { id: 'pipeline',  label: 'Lead Pipeline',  sublabel: 'Stage · channel · value',        color: '#16a34a', x: 4, y: 9, href: '/contacts' },
  { id: 'analytics', label: 'Analytics',      sublabel: 'Funnel · conversion · ROI',      color: '#16a34a', x: 6, y: 9, href: '/analytics' },
  { id: 'team',      label: 'Team',           sublabel: 'Employee outreach activity',     color: '#16a34a', x: 2, y: 9, href: '/team' },
]

const ARROWS: { from: string; to: string; label?: string }[] = [
  { from: 'website', to: 'inbound' }, { from: 'email', to: 'inbound' }, { from: 'whatsapp', to: 'inbound' },
  { from: 'linkedin', to: 'agent2' }, { from: 'inbound', to: 'agent1', label: 'triggers' },
  { from: 'agent1', to: 'engage', label: 'hands off' }, { from: 'agent1', to: 'pipeline' },
  { from: 'agent2', to: 'outbound' }, { from: 'outbound', to: 'campaigns' }, { from: 'outbound', to: 'pipeline' },
  { from: 'campaigns', to: 'pipeline' }, { from: 'engage', to: 'pipeline' },
  { from: 'pipeline', to: 'analytics' }, { from: 'pipeline', to: 'team' },
]

const COL_W = 110; const ROW_H = 90; const NW = 136; const NH = 60
const COLS = 8; const ROWS = 10; const SVG_W = COL_W * COLS; const SVG_H = ROW_H * ROWS

function nodeCenter(n: Node): [number, number] { return [n.x * COL_W - COL_W / 2, n.y * ROW_H - ROW_H / 2] }
function getNode(id: string): Node { return NODES.find(n => n.id === id)! }
function arrowPath(from: Node, to: Node): string {
  const [x1, y1] = nodeCenter(from); const [x2, y2] = nodeCenter(to)
  const midY = (y1 + y2) / 2
  return `M${x1},${y1 + NH / 2} C${x1},${midY} ${x2},${midY} ${x2},${y2 - NH / 2}`
}

const LEGEND = [
  { color: '#3b82f6', label: 'Inbound channels' },
  { color: '#8b5cf6', label: 'Outbound prospecting' },
  { color: '#0891b2', label: 'Campaigns' },
  { color: '#dc2626', label: 'Agent 1 — First Reply' },
  { color: '#f59e0b', label: 'Agent 2 — Engagement' },
  { color: '#16a34a', label: 'Pipeline & analytics' },
]

const STEPS = [
  { color: '#3b82f6', step: '01', title: 'Capture Inbound',       desc: 'Website forms, email enquiries, and WhatsApp click-to-chat messages are automatically captured and routed to the Inbound Inbox.', href: '/inbound/email', linkLabel: 'Open Inbox →' },
  { color: '#8b5cf6', step: '02', title: 'Discover Leads',         desc: 'Lead Discovery uses Apollo to search for companies and decision-makers by sector and location. Select people and retrieve their verified email addresses.', href: '/outbound/agent', linkLabel: 'Lead Discovery →' },
  { color: '#0891b2', step: '03', title: 'Run Campaigns',          desc: 'Add discovered leads to a Campaign. The AI drafts a multi-step email sequence; you review and approve it, then it sends automatically via Instantly.', href: '/outbound/campaigns', linkLabel: 'Campaigns →' },
  { color: '#dc2626', step: '04', title: 'Agent 1 — First Reply',  desc: 'Every new inbound lead receives an instant, personalised response within seconds — no lead goes cold.', href: '/inbound/email', linkLabel: 'View Inbound →' },
  { color: '#f59e0b', step: '05', title: 'Agent 2 — Engagement',   desc: 'Agent 2 takes over from the second message onwards, nurturing each conversation until the lead is qualified or converts.', href: '/engagement', linkLabel: 'Engagement Agent →' },
  { color: '#16a34a', step: '06', title: 'Unified Pipeline',        desc: 'Every inbound and outbound contact is tracked by stage, channel, and value in one unified Contacts & Analytics view.', href: '/contacts', linkLabel: 'View Contacts →' },
]

export default function OverviewPage() {
  return (
    <div className="p-8 max-w-[1100px] mx-auto">

      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-foreground">How it works</h1>
        <p className="text-sm text-muted-foreground mt-1">End-to-end flow — from first touch to closed deal</p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-6">
        {LEGEND.map(l => (
          <div key={l.label} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: l.color }} />
            <span className="text-[12px] text-muted-foreground">{l.label}</span>
          </div>
        ))}
      </div>

      {/* SVG diagram */}
      <Card className="overflow-auto mb-8">
        <CardContent className="p-0">
          <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width={SVG_W} height={SVG_H} style={{ display: 'block', minWidth: SVG_W }}>
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#d1d5db" />
              </marker>
            </defs>
            {ARROWS.map((a, i) => {
              const from = getNode(a.from); const to = getNode(a.to)
              const [mx, my] = nodeCenter(from); const [tx, ty] = nodeCenter(to)
              return (
                <g key={i}>
                  <path d={arrowPath(from, to)} fill="none" stroke="#e2e8f0" strokeWidth={1.5} markerEnd="url(#arrow)" />
                  {a.label && (
                    <text x={(mx + tx) / 2} y={(my + ty) / 2} textAnchor="middle" fontSize={9} fill="#94a3b8" dominantBaseline="middle">{a.label}</text>
                  )}
                </g>
              )
            })}
            {NODES.map(n => {
              const [cx, cy] = nodeCenter(n); const x = cx - NW / 2; const y = cy - NH / 2
              const NodeContent = (
                <g key={n.id}>
                  <rect x={x + 1} y={y + 2} width={NW} height={NH} rx={9} fill="#00000006" />
                  <rect x={x} y={y} width={NW} height={NH} rx={9} fill="#fff" stroke={n.color + '55'} strokeWidth={1.5} />
                  <rect x={x} y={y + 12} width={3} height={NH - 24} rx={2} fill={n.color} />
                  <text x={cx + 4} y={cy - 8} textAnchor="middle" fontSize={12} fontWeight="700" fill="#0f172a" dominantBaseline="middle">{n.label}</text>
                  <text x={cx + 4} y={cy + 10} textAnchor="middle" fontSize={9.5} fill="#94a3b8" dominantBaseline="middle">{n.sublabel}</text>
                </g>
              )
              return n.href ? (
                <a key={n.id} href={n.href} style={{ cursor: 'pointer' }}>{NodeContent}</a>
              ) : (
                <g key={n.id}>{NodeContent}</g>
              )
            })}
          </svg>
        </CardContent>
      </Card>

      {/* Steps grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {STEPS.map(s => (
          <Card key={s.step} className="overflow-hidden" style={{ borderTop: `3px solid ${s.color}` }}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-6 h-6 rounded-full text-white text-[10px] font-black flex items-center justify-center flex-shrink-0"
                  style={{ background: s.color }}
                >
                  {s.step}
                </span>
                <p className="text-[13px] font-semibold text-foreground tracking-tight">{s.title}</p>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">{s.desc}</p>
              <Link href={s.href} className="text-[12px] font-semibold no-underline" style={{ color: s.color }}>{s.linkLabel}</Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
