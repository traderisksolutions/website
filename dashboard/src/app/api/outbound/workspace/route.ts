/**
 * GET /api/outbound/workspace → everything the Sales Outreach workspace shows in one read:
 * every campaign with its funnel counted from the campaign-lead, send and reply tables, every
 * lead (inbound enquiries and outbound prospects) with its campaign and outreach state, and
 * the most recent replies. Counts are computed here, not read from the cached columns on
 * ob_campaigns, so they agree with the detail workspace.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { sbTry } from '@/lib/crm/db'
import { todaySGT } from '@/lib/crm/format'

type CampaignRow = { id: string; name: string; status: string; product_type: string | null; news_headline: string | null; created_at: string; updated_at: string }
type SeqRow = { id: string; campaign_id: string; step_number: number; subject: string; delay_days: number; status: string }
type CampLeadRow = { campaign_id: string; lead_id: string; approval_status: string; send_status: string; included_at: string; source_type: string }
type SendRow = { campaign_id: string; sequence_id: string; status: string; sent_at: string | null }
type ClassRow = { campaign_id: string | null; lead_id: string | null; ai_label: string | null; human_label: string | null; final_label: string | null }
type ReplyRow = { id: string; campaign_id: string | null; lead_id: string | null; event_type: string; lead_email: string | null; subject: string | null; body_preview: string | null; received_at: string }
type OutRow = { id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null; current_company: string | null; current_title: string | null; current_industry: string | null; source: string | null; status: string; created_at: string; opt_out: boolean | null }
type InRow = { id: string; first_name: string | null; last_name: string | null; email: string | null; company: string | null; topic: string | null; product_line: string | null; source: string | null; status: string; created_at: string; company_id: string | null }

export type WorkspaceCampaign = {
  id: string; name: string; status: string; product: string | null; headline: string | null
  createdAt: string; updatedAt: string; lastActivityAt: string | null
  leads: number; queued: number; contacted: number; replies: number; positive: number; qualified: number; converted: number; bounced: number
  steps: { number: number; subject: string; delayDays: number; status: string; sent: number; replied: number }[]
}
export type WorkspaceLead = {
  id: string; origin: 'inbound' | 'outbound'; name: string; email: string | null; company: string | null; title: string | null
  source: string | null; product: string | null; status: string; createdAt: string; lastActivityAt: string | null
  campaigns: { id: string; name: string }[]; sendStatus: string | null; replied: boolean; positive: boolean; bounced: boolean; doNotContact: boolean; companyId: string | null
}
export type WorkspaceReply = { id: string; campaignId: string | null; campaignName: string | null; leadId: string | null; leadEmail: string | null; subject: string | null; preview: string | null; receivedAt: string; label: string | null; type: string }

const POSITIVE = new Set(['positive', 'meeting_intent'])

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const [campaigns, seqs, campLeads, sends, classes, replies, outbound, inbound] = await Promise.all([
      sbTry<CampaignRow[]>(`ob_campaigns?select=id,name,status,product_type,news_headline,created_at,updated_at&order=created_at.desc&limit=200`, []),
      sbTry<SeqRow[]>(`ob_campaign_sequences?select=id,campaign_id,step_number,subject,delay_days,status&order=step_number.asc&limit=2000`, []),
      sbTry<CampLeadRow[]>(`ob_campaign_leads?select=campaign_id,lead_id,approval_status,send_status,included_at,source_type&limit=20000`, []),
      sbTry<SendRow[]>(`ob_campaign_sends?select=campaign_id,sequence_id,status,sent_at&limit=20000`, []),
      sbTry<ClassRow[]>(`ob_reply_classifications?select=campaign_id,lead_id,ai_label,human_label,final_label&limit=5000`, []),
      sbTry<ReplyRow[]>(`ob_reply_events?select=id,campaign_id,lead_id,event_type,lead_email,subject,body_preview,received_at&order=received_at.desc&limit=300`, []),
      sbTry<OutRow[]>(`outbound_leads?select=id,full_name,first_name,last_name,email,current_company,current_title,current_industry,source,status,created_at,opt_out&order=created_at.desc&limit=2000`, []),
      sbTry<InRow[]>(`inbound_leads?select=id,first_name,last_name,email,company,topic,product_line,source,status,created_at,company_id&order=created_at.desc&limit=500`, []),
    ])

    const outById = new Map(outbound.map(l => [l.id, l]))
    const campById = new Map(campaigns.map(c => [c.id, c]))
    const labelOf = (c: ClassRow) => c.final_label ?? c.human_label ?? c.ai_label
    const positiveLeads = new Set(classes.filter(c => c.lead_id && POSITIVE.has(labelOf(c) ?? '')).map(c => c.lead_id!))
    const positiveByCampaign = new Map<string, Set<string>>()
    for (const c of classes) if (c.campaign_id && c.lead_id && POSITIVE.has(labelOf(c) ?? '')) { const s = positiveByCampaign.get(c.campaign_id) ?? new Set(); s.add(c.lead_id); positiveByCampaign.set(c.campaign_id, s) }
    const repliedByCampaign = new Map<string, Set<string>>()
    for (const r of replies) if (r.event_type === 'reply' && r.campaign_id && r.lead_id) { const s = repliedByCampaign.get(r.campaign_id) ?? new Set(); s.add(r.lead_id); repliedByCampaign.set(r.campaign_id, s) }
    const lastReplyByCampaign = new Map<string, string>()
    for (const r of replies) if (r.campaign_id && !lastReplyByCampaign.has(r.campaign_id)) lastReplyByCampaign.set(r.campaign_id, r.received_at)

    const leadCampaigns = new Map<string, { id: string; name: string }[]>()
    const leadSend = new Map<string, string>()
    const wsCampaigns: WorkspaceCampaign[] = campaigns.map(c => {
      const mine = campLeads.filter(l => l.campaign_id === c.id && l.approval_status !== 'excluded')
      const replied = new Set([...mine.filter(l => l.send_status === 'replied').map(l => l.lead_id), ...Array.from(repliedByCampaign.get(c.id) ?? [])])
      const positive = new Set(Array.from(positiveByCampaign.get(c.id) ?? []).filter(id => mine.some(l => l.lead_id === id)))
      const statuses = mine.map(l => outById.get(l.lead_id)?.status ?? 'new')
      for (const l of mine) {
        const arr = leadCampaigns.get(l.lead_id) ?? []; arr.push({ id: c.id, name: c.name }); leadCampaigns.set(l.lead_id, arr)
        const prev = leadSend.get(l.lead_id); if (!prev || prev === 'unsent' || prev === 'queued') leadSend.set(l.lead_id, l.send_status)
      }
      const mySends = sends.filter(s => s.campaign_id === c.id)
      const lastSend = mySends.map(s => s.sent_at).filter((x): x is string => !!x).sort().pop() ?? null
      const lastIncluded = mine.map(l => l.included_at).sort().pop() ?? null
      const lastActivityAt = [lastSend, lastIncluded, lastReplyByCampaign.get(c.id) ?? null, c.updated_at].filter((x): x is string => !!x).sort().pop() ?? null
      return {
        id: c.id, name: c.name, status: c.status, product: c.product_type, headline: c.news_headline, createdAt: c.created_at, updatedAt: c.updated_at, lastActivityAt,
        leads: mine.length,
        queued: mine.filter(l => l.send_status === 'queued').length,
        contacted: mine.filter(l => ['sent', 'replied', 'bounced', 'unsubscribed'].includes(l.send_status)).length,
        replies: replied.size,
        positive: positive.size,
        qualified: statuses.filter(s => s === 'qualified' || s === 'proposal').length,
        converted: statuses.filter(s => s === 'converted').length,
        bounced: mine.filter(l => l.send_status === 'bounced').length,
        steps: seqs.filter(s => s.campaign_id === c.id).map(s => ({
          number: s.step_number, subject: s.subject, delayDays: s.delay_days, status: s.status,
          sent: mySends.filter(x => x.sequence_id === s.id && (x.status === 'sent' || x.status === 'replied')).length,
          replied: mySends.filter(x => x.sequence_id === s.id && x.status === 'replied').length,
        })),
      }
    })

    const wsLeads: WorkspaceLead[] = [
      ...outbound.map((l): WorkspaceLead => {
        const send = leadSend.get(l.id) ?? null
        return {
          id: l.id, origin: 'outbound', name: l.full_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || 'Unknown', email: l.email,
          company: l.current_company, title: l.current_title, source: l.source, product: l.current_industry, status: l.status, createdAt: l.created_at, lastActivityAt: null,
          campaigns: leadCampaigns.get(l.id) ?? [], sendStatus: send, replied: send === 'replied' || positiveLeads.has(l.id), positive: positiveLeads.has(l.id),
          bounced: send === 'bounced', doNotContact: !!l.opt_out || send === 'opted_out' || send === 'unsubscribed', companyId: null,
        }
      }),
      ...inbound.map((l): WorkspaceLead => ({
        id: l.id, origin: 'inbound', name: [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || 'Unknown', email: l.email,
        company: l.company, title: null, source: l.source ?? 'website', product: l.topic ?? l.product_line, status: l.status, createdAt: l.created_at, lastActivityAt: null,
        campaigns: [], sendStatus: null, replied: false, positive: false, bounced: false, doNotContact: false, companyId: l.company_id,
      })),
    ]

    const wsReplies: WorkspaceReply[] = replies.slice(0, 60).map(r => ({
      id: r.id, campaignId: r.campaign_id, campaignName: r.campaign_id ? campById.get(r.campaign_id)?.name ?? null : null, leadId: r.lead_id, leadEmail: r.lead_email,
      subject: r.subject, preview: r.body_preview, receivedAt: r.received_at, type: r.event_type,
      label: (() => { const c = r.lead_id ? classes.find(x => x.lead_id === r.lead_id && x.campaign_id === r.campaign_id) : undefined; return c ? labelOf(c) : null })(),
    }))

    return NextResponse.json({ today: todaySGT(), campaigns: wsCampaigns, leads: wsLeads, replies: wsReplies })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
