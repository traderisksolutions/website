// Campaigns, their recipients and the approval queue. Rows live in sales_campaigns,
// sales_campaign_steps, sales_campaign_contacts and sales_sends; people come from sales_audience.
import 'server-only'
import { enc, inChunks, sb, sbAll } from './db'
import { salesConfig } from './config'
import { firstNameOf, openingFromDraft, templateProblems } from './render'
import { assignSlots, sgtDay } from './schedule'
import { matchingAudience, type AudienceFilter, type AudienceRow } from './audience'

/** Nobody hears from two campaigns within this window. */
export const COOLDOWN_DAYS = 90

export type CampaignRow = {
  id: string; name: string; status: 'draft' | 'active' | 'paused' | 'completed'; from_name: string
  first_touch: 'template' | 'personal_draft'; audience: AudienceFilter; demo_url: string | null; deck_url: string | null; booking_url: string | null
  auto_enrol: boolean; auto_approve: boolean; daily_new: number; last_topup_on: string | null; paused_reason: string | null
  created_by: string | null; created_at: string; updated_at: string
}
export type StepRow = { id?: string; step_number: number; subject: string; body: string; delay_days: number }
export type CampaignCounts = { review: number; pending: number; active: number; completed: number; replied: number; bounced: number; unsubscribed: number; sent: number }
export type CampaignContact = {
  id: string; email: string; name: string | null; first_name: string | null; title: string | null; company: string | null; location: string | null
  status: string; current_step: number; next_send_at: string | null; source: string; opening: string | null; opening_source: string | null
  approved_by: string | null; approved_at: string | null
}

const emptyCounts = (): CampaignCounts => ({ review: 0, pending: 0, active: 0, completed: 0, replied: 0, bounced: 0, unsubscribed: 0, sent: 0 })

async function countsFor(ids: string[]): Promise<Map<string, CampaignCounts>> {
  const out = new Map<string, CampaignCounts>()
  if (!ids.length) return out
  const contacts = await inChunks(ids, 100, c => sbAll<{ campaign_id: string; status: keyof CampaignCounts }>(`sales_campaign_contacts?select=campaign_id,status&campaign_id=in.(${c.join(',')})`))
  for (const c of contacts) { const k = out.get(c.campaign_id) ?? emptyCounts(); k[c.status] = (k[c.status] ?? 0) + 1; out.set(c.campaign_id, k) }
  const sends = await inChunks(ids, 100, c => sbAll<{ campaign_id: string }>(`sales_sends?select=campaign_id&status=eq.sent&campaign_id=in.(${c.join(',')})`))
  for (const s of sends) { const k = out.get(s.campaign_id) ?? emptyCounts(); k.sent += 1; out.set(s.campaign_id, k) }
  return out
}

export async function listCampaigns(): Promise<(CampaignRow & { counts: CampaignCounts })[]> {
  const rows = await sb<CampaignRow[]>('sales_campaigns?select=*&order=created_at.desc')
  const counts = await countsFor(rows.map(r => r.id))
  return rows.map(r => ({ ...r, counts: counts.get(r.id) ?? emptyCounts() }))
}

export async function getCampaign(id: string) {
  const campaign = (await sb<CampaignRow[]>(`sales_campaigns?id=eq.${id}&select=*&limit=1`))[0] ?? null
  if (!campaign) return null
  const [steps, contacts, counts] = await Promise.all([
    sb<StepRow[]>(`sales_campaign_steps?campaign_id=eq.${id}&select=id,step_number,subject,body,delay_days&order=step_number`),
    sb<CampaignContact[]>(`sales_campaign_contacts?campaign_id=eq.${id}&select=id,email,name,first_name,title,company,location,status,current_step,next_send_at,source,opening,opening_source,approved_by,approved_at&order=company.asc.nullslast&limit=1000`),
    countsFor([id]),
  ])
  return { campaign, steps, contacts, counts: counts.get(id) ?? emptyCounts() }
}

/** Problems that block activation. */
export function activationProblems(c: Pick<CampaignRow, 'first_touch' | 'demo_url' | 'deck_url' | 'booking_url'>, steps: StepRow[]): string[] {
  const out: string[] = []
  if (c.first_touch === 'template' && !steps.some(s => s.step_number === 1)) out.push('Email 1 is empty')
  for (const s of steps) {
    if (!s.body.trim()) out.push(`Email ${s.step_number} has no message`)
    if (s.step_number === 1 && !s.subject.trim()) out.push('Email 1 has no subject')
  }
  out.push(...templateProblems(steps.flatMap(s => [s.subject, s.body]), c))
  return out
}

/** Emails live in any campaign, or sent to within the cooldown. */
export async function unavailableEmails(): Promise<Set<string>> {
  const since = new Date(Date.now() - COOLDOWN_DAYS * 86_400_000).toISOString()
  const [live, recent] = await Promise.all([
    sbAll<{ email: string }>('sales_campaign_contacts?select=email&status=in.(review,pending,active)'),
    sbAll<{ contact: { email: string } | null }>(`sales_sends?select=contact:sales_campaign_contacts(email)&status=eq.sent&sent_at=gte.${enc(since)}`),
  ])
  const set = new Set(live.map(r => r.email.toLowerCase()))
  for (const r of recent) if (r.contact) set.add(r.contact.email.toLowerCase())
  return set
}

/** How many people the filter matches, and how many could be enrolled now. */
export async function previewAudience(f: AudienceFilter): Promise<{ matching: number; available: number }> {
  const [rows, busy] = await Promise.all([matchingAudience(f), unavailableEmails()])
  return { matching: rows.length, available: rows.filter(r => !busy.has(r.email)).length }
}

/** Opening sentence per sales contact, from their lead-tool draft. */
async function openingsFor(contactIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const rows = await inChunks(contactIds, 200, c => sb<{ contact_id: string; body: string | null }[]>(`sales_outreach?select=contact_id,body&channel=eq.email&contact_id=in.(${c.join(',')})`))
  for (const r of rows) { const o = openingFromDraft(r.body); if (o && !out.has(r.contact_id)) out.set(r.contact_id, o) }
  return out
}

/** Add everyone the campaign's audience matches who is not busy elsewhere, as "awaiting
 *  approval" with a suggested opening. One person per business: several colleagues getting the
 *  same email on the same morning reads as a blast. Nothing is scheduled until a person approves. */
export async function enrolAudience(campaignId: string): Promise<{ added: number; skipped: number }> {
  const c = (await sb<Pick<CampaignRow, 'id' | 'status' | 'first_touch' | 'audience'>[]>(`sales_campaigns?id=eq.${campaignId}&select=id,status,first_touch,audience&limit=1`))[0]
  if (!c) throw new Error('campaign not found')
  if (c.first_touch === 'personal_draft') throw new Error('This campaign enrols people when their draft is approved')
  const [rows, busy] = await Promise.all([matchingAudience(c.audience ?? {}), unavailableEmails()])
  const openings = await openingsFor(rows.map(r => r.sales_contact_id).filter((x): x is string => Boolean(x)))
  const companyKey = (r: AudienceRow) => (r.company ?? r.email.split('@')[1]).trim().toLowerCase()
  const busyCompanies = new Set(rows.filter(r => busy.has(r.email)).map(companyKey))
  const best = new Map<string, AudienceRow>()
  const score = (r: AudienceRow) => (firstNameOf(r.name) ? 2 : 0) + (r.sales_contact_id && openings.has(r.sales_contact_id) ? 1 : 0)
  for (const r of rows) {
    const k = companyKey(r)
    if (busy.has(r.email) || busyCompanies.has(k)) continue
    const cur = best.get(k)
    if (!cur || score(r) > score(cur)) best.set(k, r)
  }
  const fresh = Array.from(best.values())
  let added = 0
  for (let i = 0; i < fresh.length; i += 200) {
    const batch = fresh.slice(i, i + 200).map(r => ({
      campaign_id: c.id, email: r.email, name: r.name, first_name: r.first_name, company: r.company, title: r.title, linkedin_url: r.linkedin_url,
      location: r.location, source: 'audience', audience_id: r.id, status: 'review', next_send_at: null,
      opening: r.sales_contact_id ? openings.get(r.sales_contact_id) ?? null : null, opening_source: r.sales_contact_id && openings.has(r.sales_contact_id) ? 'draft' : null,
    }))
    const res = await sb<{ id: string }[]>('sales_campaign_contacts?on_conflict=campaign_id,email', { method: 'POST', prefer: 'return=representation,resolution=ignore-duplicates', body: JSON.stringify(batch) })
    added += res.length
  }
  return { added, skipped: rows.length - added }
}

/** Edit the personal opening while a contact awaits approval. */
export async function setOpening(contactId: string, opening: string): Promise<boolean> {
  const rows = await sb<{ id: string }[]>(`sales_campaign_contacts?id=eq.${contactId}&status=eq.review&select=id`, {
    method: 'PATCH', body: JSON.stringify({ opening: opening.trim().slice(0, 400) || null, opening_source: opening.trim() ? 'person' : null, updated_at: new Date().toISOString() }),
  })
  return rows.length > 0
}

/** Approve contacts awaiting approval: each gets a first-send time inside office hours, within
 *  the daily cap. ids = null approves all awaiting. */
export async function approveContacts(campaignId: string, ids: string[] | null, actor: string, limit?: number): Promise<{ approved: number; firstSend: string | null; lastSend: string | null }> {
  let q = `sales_campaign_contacts?campaign_id=eq.${campaignId}&status=eq.review&select=id,location&order=${limit ? 'created_at.asc' : 'company.asc.nullslast'}`
  if (ids) q += `&id=in.(${ids.join(',')})`
  if (limit) q += `&limit=${limit}`
  const waiting = await sb<{ id: string; location: string | null }[]>(q)
  if (!waiting.length) return { approved: 0, firstSend: null, lastSend: null }

  // First emails already scheduled per Singapore day, across campaigns.
  const scheduled = await sbAll<{ next_send_at: string }>('sales_campaign_contacts?select=next_send_at&status=eq.active&current_step=eq.0&next_send_at=not.is.null')
  const taken: Record<string, number> = {}
  for (const r of scheduled) { const d = sgtDay(new Date(r.next_send_at)); taken[d] = (taken[d] ?? 0) + 1 }

  const slots = assignSlots(waiting.map(w => w.location), new Date(), salesConfig.dailyCap(), taken)
  const now = new Date().toISOString()
  let approved = 0
  for (let i = 0; i < waiting.length; i++) {
    const rows = await sb<{ id: string }[]>(`sales_campaign_contacts?id=eq.${waiting[i].id}&status=eq.review&select=id`, {
      method: 'PATCH', body: JSON.stringify({ status: 'active', next_send_at: slots[i].toISOString(), approved_by: actor, approved_at: now, updated_at: now }),
    })
    approved += rows.length
  }
  return { approved, firstSend: slots[0].toISOString(), lastSend: slots[slots.length - 1].toISOString() }
}

/** Daily top-up: once per Singapore weekday from 08:00 SGT, each active campaign with auto_enrol
 *  adds the new people its audience now matches; with auto_approve it also approves up to
 *  daily_new of them, oldest first. The date stamp makes it once a day. */
export type TopUpResult = { campaign: string; enrolled: number; approved: number; firstSend: string | null; lastSend: string | null }

export async function dailyTopUp(now = new Date()): Promise<TopUpResult[]> {
  const sgt = new Date(now.getTime() + 8 * 3_600_000)
  const weekday = sgt.getUTCDay() >= 1 && sgt.getUTCDay() <= 5
  if (!weekday || sgt.getUTCHours() < 8) return []
  const today = sgtDay(now)
  const due = await sb<{ id: string; name: string; auto_approve: boolean; daily_new: number; last_topup_on: string | null }[]>('sales_campaigns?select=id,name,auto_approve,daily_new,last_topup_on&status=eq.active&auto_enrol=is.true')
  const out: TopUpResult[] = []
  for (const c of due.filter(c => !c.last_topup_on || c.last_topup_on < today)) {
    // Claim today's run first, so overlapping runners cannot both top up.
    const claimed = await sb<{ id: string }[]>(`sales_campaigns?id=eq.${c.id}&or=(last_topup_on.is.null,last_topup_on.lt.${today})&select=id`, { method: 'PATCH', body: JSON.stringify({ last_topup_on: today }) })
    if (!claimed.length) continue
    const { added } = await enrolAudience(c.id)
    let approved = { approved: 0, firstSend: null as string | null, lastSend: null as string | null }
    if (c.auto_approve && c.daily_new > 0) {
      const startOfDay = new Date(Date.parse(`${today}T00:00:00+08:00`)).toISOString()
      const already = (await sb<{ id: string }[]>(`sales_campaign_contacts?campaign_id=eq.${c.id}&approved_at=gte.${enc(startOfDay)}&select=id`)).length
      const room = c.daily_new - already
      if (room > 0) approved = await approveContacts(c.id, null, 'system:daily', room)
    }
    out.push({ campaign: c.name, enrolled: added, ...approved })
  }
  return out
}
