'use client'

import { useState } from 'react'
import { ChevronDown, Sparkles, Copy, Check } from 'lucide-react'

type Lead = {
  id:           number
  date:         string
  source:       string
  first_name:   string
  last_name:    string
  contact_type: string
  company:      string | null
  email:        string | null
  phone:        string | null
  topic:        string
  details:      string
  status:       string
}

const MOCK_LEADS: Lead[] = [
  { id: 1, date: '26 Apr 2025, 14:32', source: 'whatsapp_click', first_name: 'James',   last_name: 'Tan',   contact_type: 'Individual', company: null,          email: null,                 phone: null,            topic: 'Motor Insurance',   details: 'Looking to renew my car in June. Current policy is expiring and I want to compare plans. Is there a good comprehensive option for a 5-year-old Toyota Corolla?', status: 'new' },
  { id: 2, date: '26 Apr 2025, 11:15', source: 'website_form',   first_name: 'Sarah',   last_name: 'Lim',   contact_type: 'Business',   company: 'Acme Pte Ltd', email: 'sarah@acme.com',    phone: '+65 9123 4567', topic: 'Employee Benefits', details: 'We have about 50 headcount and are looking for a group medical insurance plan. Would like to understand options for outpatient and hospitalisation coverage.', status: 'new' },
  { id: 3, date: '25 Apr 2025, 17:04', source: 'whatsapp_click', first_name: 'Kevin',   last_name: 'Ong',   contact_type: 'Individual', company: null,          email: null,                 phone: null,            topic: 'Travel Insurance',  details: 'Planning a family trip to Japan in August — 4 pax including 2 kids. Interested in a plan that covers trip cancellation and medical emergencies.', status: 'contacted' },
  { id: 4, date: '25 Apr 2025, 09:47', source: 'website_form',   first_name: 'Michelle', last_name: 'Chan', contact_type: 'Business',   company: 'BuildCo',     email: 'michelle@buildco.sg', phone: '+65 8234 5678', topic: 'Commercial Plans',  details: 'We operate a fleet of 8 commercial vehicles (lorries and vans). Looking for comprehensive commercial motor insurance with good workshop network.', status: 'qualified' },
  { id: 5, date: '24 Apr 2025, 16:22', source: 'whatsapp_click', first_name: 'Alex',    last_name: 'Wong',  contact_type: 'Individual', company: null,          email: null,                 phone: null,            topic: 'Motor Insurance',   details: 'Just got my first car — a Honda Civic 2024. Looking for comprehensive coverage. Not sure what add-ons I need. Budget is around $1,200/year.', status: 'new' },
]

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  new:       { bg: 'rgba(59,130,246,0.10)',  color: '#1d4ed8' },
  contacted: { bg: 'rgba(245,158,11,0.10)',  color: '#b45309' },
  qualified: { bg: 'rgba(34,197,94,0.10)',   color: '#15803d' },
  converted: { bg: 'rgba(168,85,247,0.10)',  color: '#7e22ce' },
  dropped:   { bg: 'rgba(107,114,128,0.10)', color: '#4b5563' },
}

const SOURCE_LABEL: Record<string, string> = {
  whatsapp_click: 'WhatsApp',
  website_form:   'Email Form',
  manual:         'Manual',
}

const AI_REPLIES: Record<number, string> = {
  1: "Hi James! Thanks for reaching out to Trade Risk Solutions.\n\nFor a 5-year-old Toyota Corolla, we have several great comprehensive motor insurance options. Our top recommendation includes:\n• Zero excess on windscreen claims\n• Authorised and non-authorised workshop options\n• 24/7 roadside assistance\n• NCD (No-Claims Discount) protection\n\nCould I arrange a quick call before your June renewal? Usually just 10–15 minutes and we can get you a quote on the spot.",
  2: "Hi Sarah! Thank you for your enquiry on behalf of Acme Pte Ltd.\n\nFor a team of 50, we can offer a comprehensive Group Medical Insurance plan covering outpatient and hospitalisation. Key highlights:\n• Panel clinics island-wide\n• Inpatient ward cover (B1 or A class)\n• Option to add dental and maternity riders\n• Group premium rates with annual review\n\nI'd love to schedule a 30-minute call with your HR team. Would this week or next work?",
  3: "Hi Kevin! Thanks for getting in touch.\n\nFor a family of 4 travelling to Japan in August, I'd recommend a Family Travel Insurance plan with:\n• Unlimited emergency medical evacuation\n• Trip cancellation cover (up to $15,000)\n• Child coverage included at no extra premium\n• Loss of baggage and travel documents\n\nShall I prepare a comparison of our top 2–3 family plans so you can pick the best fit?",
  4: "Hi Michelle! Thank you for reaching out regarding BuildCo's fleet.\n\nFor 8 commercial vehicles, a Fleet Motor Insurance policy offers significant advantages:\n• Single renewal date for all vehicles\n• Fleet NCD — discount grows with a clean record\n• Dedicated claims handler for faster processing\n• Comprehensive coverage including goods in transit\n\nCould you share the vehicle registration numbers and current insurer so I can prepare a direct comparison?",
  5: "Hi Alex! Congratulations on your first car — a Honda Civic 2024 is a great choice!\n\nFor a new driver, I'd recommend a comprehensive plan with:\n• Authorised Honda workshop coverage\n• Young driver NCD accelerator\n• Personal accident cover for driver and passengers\n• Loss of use benefit during repairs\n\nYour $1,200/year budget is very workable for a 2024 Civic. I can get you 2–3 quotes within the day — shall I proceed?",
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-700">{value}</p>
    </div>
  )
}

export default function InboundPage() {
  const [expanded,   setExpanded]   = useState<number | null>(null)
  const [generating, setGenerating] = useState<number | null>(null)
  const [generated,  setGenerated]  = useState<Set<number>>(new Set())
  const [copied,     setCopied]     = useState(false)

  const stats = [
    { label: 'New',       count: MOCK_LEADS.filter(l => l.status === 'new').length,       color: '#3b82f6' },
    { label: 'Contacted', count: MOCK_LEADS.filter(l => l.status === 'contacted').length, color: '#f59e0b' },
    { label: 'Qualified', count: MOCK_LEADS.filter(l => l.status === 'qualified').length, color: '#22c55e' },
    { label: 'Total',     count: MOCK_LEADS.length,                                       color: '#6b7280' },
  ]

  function toggleRow(id: number) {
    setExpanded(prev => prev === id ? null : id)
  }

  async function generateReply(e: React.MouseEvent, id: number) {
    e.stopPropagation()
    setExpanded(id)
    if (generated.has(id)) return
    setGenerating(id)
    await new Promise(r => setTimeout(r, 1400))
    setGenerating(null)
    setGenerated(prev => new Set(prev).add(id))
  }

  function copyReply(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="flex flex-col flex-1">

      {/* Page header */}
      <div
        className="px-6 flex items-center"
        style={{
          height: '52px',
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(28px) saturate(200%)',
          WebkitBackdropFilter: 'blur(28px) saturate(200%)',
          borderBottom: '1px solid rgba(200,200,204,0.45)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.6), 0 2px 12px rgba(0,0,0,0.06)',
        }}
      >
        <h1 className="text-sm font-semibold text-gray-800">Inbound Contacts</h1>
      </div>

      <main className="flex-1 p-6 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className="glass rounded-xl px-5 py-5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">{s.label}</p>
              <p className="text-3xl font-bold" style={{ color: s.color }}>{s.count}</p>
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
                <tr className="text-[11px] text-gray-400 font-semibold uppercase tracking-widest" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <th className="px-4 py-3 text-left w-8"></th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Source</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Topic</th>
                  <th className="px-4 py-3 text-left">Details</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">AI Reply</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_LEADS.map(lead => {
                  const isOpen   = expanded === lead.id
                  const isGen    = generating === lead.id
                  const hasDraft = generated.has(lead.id)
                  const st       = STATUS_STYLES[lead.status]

                  return (
                    <>
                      <tr
                        key={lead.id}
                        className="hover:bg-black/[0.02] transition-colors cursor-pointer group"
                        style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}
                        onClick={() => toggleRow(lead.id)}
                      >
                        <td className="px-4 py-4">
                          <ChevronDown size={13} strokeWidth={2} className="text-gray-300 group-hover:text-gray-500 transition-all duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                        </td>
                        <td className="px-4 py-4 text-gray-500 whitespace-nowrap text-xs">{lead.date}</td>
                        <td className="px-4 py-4 text-xs font-medium text-gray-800 whitespace-nowrap">{lead.first_name} {lead.last_name}</td>
                        <td className="px-4 py-4 text-xs text-gray-500 whitespace-nowrap">{SOURCE_LABEL[lead.source] ?? lead.source}</td>
                        <td className="px-4 py-4">
                          <span className="text-[11px] font-medium text-gray-500">{lead.contact_type}</span>
                          {lead.company && <p className="text-[11px] text-gray-400 mt-0.5">{lead.company}</p>}
                        </td>
                        <td className="px-4 py-4 text-xs text-gray-600 whitespace-nowrap">{lead.topic}</td>
                        <td className="px-4 py-4" style={{ maxWidth: '280px' }}>
                          <p className="truncate text-xs text-gray-500">{lead.details}</p>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-[11px] font-semibold capitalize" style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '9999px', background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
                            {lead.status}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={e => generateReply(e, lead.id)}
                            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all"
                            style={{ borderColor: hasDraft ? '#22c55e' : 'rgba(0,0,0,0.14)', color: hasDraft ? '#15803d' : '#555', background: hasDraft ? 'rgba(34,197,94,0.06)' : 'transparent', whiteSpace: 'nowrap' }}
                          >
                            <Sparkles size={11} strokeWidth={2} />
                            {hasDraft ? 'View reply' : 'Generate'}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded panel */}
                      {isOpen && (
                        <tr key={`${lead.id}-exp`}>
                          <td colSpan={9} className="px-5 pb-5 pt-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                            <div className="rounded-xl p-5 space-y-5" style={{ background: 'rgba(0,0,0,0.025)', border: '1px solid rgba(0,0,0,0.06)' }}>

                              {/* Structured fields grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <Field label="First Name" value={lead.first_name} />
                                <Field label="Last Name"  value={lead.last_name} />
                                <Field label="Topic"   value={lead.topic} />
                                <Field label="Type"    value={lead.contact_type} />
                                <Field label="Company" value={lead.company} />
                                <Field label="Email"   value={lead.email} />
                                <Field label="Phone"   value={lead.phone} />
                                <Field label="Source"  value={SOURCE_LABEL[lead.source] ?? lead.source} />
                                <Field label="Status"  value={lead.status} />
                              </div>

                              {/* Details */}
                              <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '1rem' }}>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Details</p>
                                <p className="text-sm text-gray-700 leading-relaxed">{lead.details}</p>
                              </div>

                              {/* AI Reply */}
                              <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '1rem' }}>
                                <div className="flex items-center justify-between mb-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">AI Reply Draft</p>
                                  {hasDraft && (
                                    <button onClick={() => copyReply(AI_REPLIES[lead.id])} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all" style={{ borderColor: 'rgba(0,0,0,0.12)', color: '#555' }}>
                                      {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2} />}
                                      {copied ? 'Copied!' : 'Copy'}
                                    </button>
                                  )}
                                </div>

                                {isGen ? (
                                  <div className="flex items-center gap-2 py-2">
                                    <div className="flex gap-1">
                                      {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                                    </div>
                                    <span className="text-xs text-gray-400">Generating reply…</span>
                                  </div>
                                ) : hasDraft ? (
                                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{AI_REPLIES[lead.id]}</p>
                                ) : (
                                  <button onClick={e => generateReply(e, lead.id)} className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg" style={{ background: '#18181b', color: '#fff' }}>
                                    <Sparkles size={13} strokeWidth={2} />
                                    Generate AI Reply
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
