'use client'

import TopNav from '@/components/TopNav'
import {
  Inbox, MessageSquare, Mail, PenLine,
  Circle, Phone, CheckCircle2, Target, XCircle,
  CalendarDays, LayoutList,
} from 'lucide-react'
import type { NavTrigger } from '@/lib/nav-config'

const TOP_NAV: NavTrigger[] = [
  {
    label: 'View',
    groups: [
      {
        label: 'Layout',
        items: [
          { label: 'Table',  href: '/inbound',       icon: LayoutList, description: 'Row-by-row data view',  badge: 'Active' },
          { label: 'Cards',  href: '/inbound?view=cards', icon: Inbox, description: 'Card grid layout' },
        ],
      },
    ],
  },
  {
    label: 'Source',
    groups: [
      {
        label: 'Channels',
        items: [
          { label: 'All Sources',    href: '/inbound',                    icon: Inbox,          description: 'Every inbound channel' },
          { label: 'WhatsApp',       href: '/inbound?source=whatsapp',    icon: MessageSquare,  description: 'Click-to-chat enquiries' },
          { label: 'Email Form',     href: '/inbound?source=email',       icon: Mail,           description: 'Website email submissions' },
          { label: 'Manual',         href: '/inbound?source=manual',      icon: PenLine,        description: 'Staff-added entries' },
        ],
      },
    ],
  },
  {
    label: 'Status',
    groups: [
      {
        label: 'Pipeline Stage',
        items: [
          { label: 'New',        href: '/inbound?status=new',       icon: Circle,        description: 'Fresh, uncontacted enquiries' },
          { label: 'Contacted',  href: '/inbound?status=contacted', icon: Phone,         description: 'Follow-up initiated' },
          { label: 'Qualified',  href: '/inbound?status=qualified', icon: CheckCircle2,  description: 'Verified intent to purchase' },
          { label: 'Converted',  href: '/inbound?status=converted', icon: Target,        description: 'Became a customer' },
          { label: 'Dropped',    href: '/inbound?status=dropped',   icon: XCircle,       description: 'Not proceeding' },
        ],
      },
    ],
  },
  {
    label: 'Period',
    groups: [
      {
        label: 'Date Range',
        items: [
          { label: 'Today',       href: '/inbound?period=today',   icon: CalendarDays },
          { label: 'Yesterday',   href: '/inbound?period=yesterday', icon: CalendarDays },
          { label: 'This week',   href: '/inbound?period=week',    icon: CalendarDays },
          { label: 'This month',  href: '/inbound?period=month',   icon: CalendarDays },
          { label: 'All time',    href: '/inbound',                 icon: CalendarDays },
        ],
      },
    ],
  },
]

/* ── Placeholder data ── */
const MOCK_LEADS = [
  { id: 1, date: '26 Apr 2025, 14:32', source: 'whatsapp_click', type: 'Individual', message: "Hi, I'm James Tan. I want to know more about Motor Insurance. Looking to renew my car in June.", status: 'new' },
  { id: 2, date: '26 Apr 2025, 11:15', source: 'website_form',   type: 'Business',   message: '[Email Enquiry] Name: Sarah Lim | Type: Business | Company: Acme Pte Ltd | Email: sarah@acme.com | Topic: Employee Benefits | Details: 50 headcount, looking for group medical.', status: 'new' },
  { id: 3, date: '25 Apr 2025, 17:04', source: 'whatsapp_click', type: 'Individual', message: "Hi, I'm Kevin Ong. I want to know more about Travel Insurance. Family trip to Japan in August.", status: 'contacted' },
  { id: 4, date: '25 Apr 2025, 09:47', source: 'website_form',   type: 'Business',   message: '[Email Enquiry] Name: Michelle Chan | Type: Business | Company: BuildCo | Email: michelle@buildco.sg | Topic: Commercial Plans | Details: Fleet of 8 commercial vehicles.', status: 'qualified' },
  { id: 5, date: '24 Apr 2025, 16:22', source: 'whatsapp_click', type: 'Individual', message: "Hi, I'm Alex Wong. I want to know more about Motor Insurance. First car, looking for comprehensive coverage.", status: 'new' },
]

const STATUS_STYLES: Record<string, string> = {
  new:       'bg-blue-50 text-blue-700',
  contacted: 'bg-yellow-50 text-yellow-700',
  qualified: 'bg-green-50 text-green-700',
  converted: 'bg-purple-50 text-purple-700',
  dropped:   'bg-gray-100 text-gray-500',
}

const SOURCE_LABEL: Record<string, string> = {
  whatsapp_click: 'WhatsApp',
  website_form:   'Email Form',
  manual:         'Manual',
}

export default function InboundPage() {
  const stats = [
    { label: 'New',       count: MOCK_LEADS.filter(l => l.status === 'new').length,       color: '#3b82f6' },
    { label: 'Contacted', count: MOCK_LEADS.filter(l => l.status === 'contacted').length, color: '#f59e0b' },
    { label: 'Qualified', count: MOCK_LEADS.filter(l => l.status === 'qualified').length, color: '#22c55e' },
    { label: 'Total',     count: MOCK_LEADS.length,                                       color: '#6b7280' },
  ]

  return (
    <div className="flex flex-col flex-1">
      <TopNav items={TOP_NAV} title="Inbound Contacts" />

      <main className="flex-1 p-6 space-y-5">

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className="glass rounded-xl px-5 py-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>{s.count}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
            <h2 className="text-sm font-semibold text-gray-800">All Leads</h2>
            <span className="text-xs text-gray-400">{MOCK_LEADS.length} entries · placeholder data</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Date</th>
                  <th className="px-5 py-3 text-left">Source</th>
                  <th className="px-5 py-3 text-left">Type</th>
                  <th className="px-5 py-3 text-left">Message preview</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">AI Reply</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {MOCK_LEADS.map(lead => (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap text-xs">{lead.date}</td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-medium text-gray-600">
                        {SOURCE_LABEL[lead.source] ?? lead.source}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-500">{lead.type}</td>
                    <td className="px-5 py-3.5 max-w-xs">
                      <p className="truncate text-gray-700">{lead.message}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[lead.status]}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <button className="text-xs text-gray-400 hover:text-gray-900 font-medium opacity-0 group-hover:opacity-100 transition-opacity border border-gray-200 rounded-md px-2.5 py-1 hover:border-gray-400">
                        Generate ✦
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  )
}
