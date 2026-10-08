import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'
import { fetchAllRows } from '@/lib/postgrest-all'
import {
  firstNameOf, isEnrollable, SENDABLE_DEFAULT, shouldPauseForBounces,
  type CampaignAudience, type ProspectAccount, type ProspectContact,
} from './prospects'

/**
 * The review queue between the prospect database and the Gmail sender.
 *
 * enrol    prospect contacts → outbound_leads + ob_campaign_leads (approval_status 'pending')
 * approve  pending rows → 'included', queued with the campaign's approved steps; the daily
 *          sender (/api/cron/outbound-send) picks them up exactly as it does a launch
 * topUp    once a day, per active campaign with daily_new > 0, enrols that many new
 *          named people from its audience; auto_approve queues them as well
 *
 * Everything goes through PostgREST with the service key (src/lib/sb.ts). Idempotent:
 * (campaign_id, lead_id) is unique, and inserts ignore duplicates.
 */

const DEFAULT_FROM = 'operations@trade-risksol.com'

type Step = { subject: string; body: string; delay_days: number }
export type CampaignRow = {
  id: string; name: string; status: string; variant_mode: boolean | null
  audience: CampaignAudience | null; daily_new: number; auto_approve: boolean; bounce_paused_at: string | null
}

async function read<T>(path: string): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders(), cache: 'no-store' })
  if (!res.ok) throw new Error(`Read ${path.split('?')[0]} failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.json() as Promise<T>
}
async function write(path: string, method: 'POST' | 'PATCH', body: unknown, prefer = 'return=minimal'): Promise<Response> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: sbHeaders(prefer), body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Write ${path.split('?')[0]} failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res
}
const inList = (ids: string[]) => `(${ids.map(encodeURIComponent).join(',')})`
const chunks = <T,>(xs: T[], n = 100): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

export async function getCampaign(id: string): Promise<CampaignRow | null> {
  const [c] = await read<CampaignRow[]>(`ob_campaigns?id=eq.${encodeURIComponent(id)}&select=id,name,status,variant_mode,audience,daily_new,auto_approve,bounce_paused_at`)
  return c ?? null
}

/** The steps a launch would send: the first approved variant, or the approved sequence. */
export async function approvedSteps(c: Pick<CampaignRow, 'id' | 'variant_mode'>): Promise<Step[]> {
  if (c.variant_mode) {
    const [v] = await read<{ id: string }[]>(`ob_sequence_variants?campaign_id=eq.${c.id}&status=eq.approved&order=created_at.asc&limit=1`)
    if (!v) return []
    return read<Step[]>(`ob_sequence_variant_steps?variant_id=eq.${v.id}&order=step_number.asc&select=subject,body,delay_days`)
  }
  return read<Step[]>(`ob_campaign_sequences?campaign_id=eq.${c.id}&status=eq.approved&order=step_number.asc&select=subject,body,delay_days`)
}

async function fromEmail(): Promise<string> {
  try {
    const [row] = await read<{ value: unknown }[]>(`app_settings?key=eq.reply_from_email&select=value&limit=1`)
    return typeof row?.value === 'string' && row.value.includes('@') ? row.value : DEFAULT_FROM
  } catch { return DEFAULT_FROM }
}

/** One outbound_leads row per prospect contact, reused across campaigns. Returns contact id → lead id. */
async function ensureLeads(contacts: ProspectContact[], accounts: Map<string, ProspectAccount>): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const missing = contacts.filter(c => { if (c.outbound_lead_id) out.set(c.id, c.outbound_lead_id); return !c.outbound_lead_id })
  if (!missing.length) return out

  // An earlier Apollo or manual lead with the same email is the same person.
  const emails = missing.map(c => c.email!.toLowerCase())
  const existing = new Map<string, string>()
  for (const part of chunks(emails)) {
    const rows = await read<{ id: string; email: string }[]>(`outbound_leads?select=id,email&email=in.${inList(part)}`)
    rows.forEach(r => existing.set(r.email.toLowerCase(), r.id))
  }

  for (const c of missing) {
    const a = accounts.get(c.account_id)
    let leadId = existing.get(c.email!.toLowerCase())
    if (!leadId) {
      const res = await write('outbound_leads', 'POST', {
        record_type: 'person', source: 'prospect_db', status: 'new',
        full_name: c.full_name, first_name: c.first_name ?? firstNameOf(c.full_name), current_title: c.title,
        current_company: a?.name ?? null, website: a?.website ?? null, current_industry: a?.industry ?? null,
        country_code: a?.market && a.market !== 'OTHER' ? a.market : null,
        email: c.email, email_status: c.email_status, opt_out: false, consent_source: 'public_business_data',
        // linkedin_url is unique; a second lead for the same profile would fail the insert.
        linkedin_url: null, raw_payload: { prospect_contact_id: c.id, email_source_url: c.email_source_url },
      }, 'return=representation')
      leadId = ((await res.json()) as { id: string }[])[0].id
    }
    await write(`prospect_contacts?id=eq.${c.id}`, 'PATCH', { outbound_lead_id: leadId, updated_at: new Date().toISOString() })
    out.set(c.id, leadId)
  }
  return out
}

/** Add named prospects to a campaign for review. Skips role inboxes, do-not-contact and anyone already in it. */
export async function enrol(campaignId: string, contactIds: string[], by: string, opts?: { approve?: boolean; statuses?: CampaignAudience['emailStatuses'] }) {
  const campaign = await getCampaign(campaignId)
  if (!campaign) throw new Error('Campaign not found')
  const contacts: ProspectContact[] = []
  for (const part of chunks(contactIds)) contacts.push(...await read<ProspectContact[]>(`prospect_contacts?id=in.${inList(part)}&select=*`))
  const statuses = opts?.statuses ?? campaign.audience?.emailStatuses ?? SENDABLE_DEFAULT
  const ok = contacts.filter(c => isEnrollable(c, statuses))
  const accountIds = Array.from(new Set(ok.map(c => c.account_id)))
  const accounts = new Map<string, ProspectAccount>()
  for (const part of chunks(accountIds)) (await read<ProspectAccount[]>(`prospect_accounts?id=in.${inList(part)}&select=*`)).forEach(a => accounts.set(a.id, a))

  const leads = await ensureLeads(ok, accounts)
  const leadIds = Array.from(new Set(leads.values()))
  // ignore-duplicates returns only the rows actually inserted: people already in the campaign are not counted.
  const added: string[] = []
  const now = new Date().toISOString()
  for (const part of chunks(leadIds)) {
    const res = await write('ob_campaign_leads?on_conflict=campaign_id,lead_id&select=lead_id', 'POST',
      part.map(lead_id => ({ campaign_id: campaignId, lead_id, source_type: 'imported', approval_status: 'pending', send_status: 'unsent', included_by: by, included_at: now })),
      'return=representation,resolution=ignore-duplicates')
    added.push(...((await res.json()) as { lead_id: string }[]).map(r => r.lead_id))
  }
  const approved = opts?.approve && added.length ? await approve(campaignId, { leadIds: added }, by) : null
  return { requested: contactIds.length, skipped: contactIds.length - ok.length, alreadyIn: leadIds.length - added.length, enrolled: added.length, approved: approved?.approved ?? 0 }
}

/** Pending rows → included and queued for the sender. `all` approves every pending row in the campaign. */
export async function approve(campaignId: string, target: { ids?: string[]; leadIds?: string[]; all?: boolean }, by: string) {
  const campaign = await getCampaign(campaignId)
  if (!campaign) throw new Error('Campaign not found')
  const steps = await approvedSteps(campaign)
  if (!steps.length) throw new Error('Approve the sequence steps in the campaign workspace first.')

  const filter = target.all ? '' : target.ids?.length ? `&id=in.${inList(target.ids)}` : target.leadIds?.length ? `&lead_id=in.${inList(target.leadIds)}` : null
  if (filter === null) return { approved: 0 }
  const rows = await fetchAllRows<{ id: string; lead_id: string }>(
    `${SB_URL}/rest/v1/ob_campaign_leads?campaign_id=eq.${campaignId}&approval_status=eq.pending&send_status=eq.unsent${filter}&select=id,lead_id`, sbHeaders())
  if (!rows.length) return { approved: 0 }

  // Opted-out leads leave review as opted out; they never reach the send queue.
  const optedOut = new Set<string>()
  for (const part of chunks(rows.map(r => r.lead_id))) (await read<{ id: string }[]>(`outbound_leads?id=in.${inList(part)}&opt_out=eq.true&select=id`)).forEach(l => optedOut.add(l.id))
  const ids = rows.filter(r => !optedOut.has(r.lead_id)).map(r => r.id)
  const now = new Date().toISOString()
  const out = rows.filter(r => optedOut.has(r.lead_id)).map(r => r.id)
  for (const part of chunks(out)) await write(`ob_campaign_leads?id=in.${inList(part)}`, 'PATCH', { approval_status: 'excluded', send_status: 'opted_out', removed_at: now })

  const from = await fromEmail()
  for (const part of chunks(ids)) {
    await write(`ob_campaign_leads?id=in.${inList(part)}&approval_status=eq.pending`, 'PATCH', {
      approval_status: 'included', send_status: 'queued', current_step: 0, send_scheduled_at: now,
      from_email: from, metadata: { steps, approved_by: by, approved_at: now }, last_synced_at: now,
    })
  }
  if (ids.length && campaign.status !== 'active' && campaign.status !== 'paused') {
    await write(`ob_campaigns?id=eq.${campaignId}`, 'PATCH', { status: 'active', launched_at: now })
  }
  await logEvent({ event_type: 'queue_approved', entity_type: 'campaign', entity_id: campaignId, campaign_id: campaignId, payload: { approved: ids.length, opted_out: optedOut.size, by } })
  return { approved: ids.length, optedOut: out.length }
}

/** Remove rows from review: they stay in the table as 'excluded' so the top-up does not re-add them. */
export async function exclude(campaignId: string, ids: string[]) {
  if (!ids.length) return { excluded: 0 }
  await write(`ob_campaign_leads?campaign_id=eq.${campaignId}&id=in.${inList(ids)}&approval_status=eq.pending`, 'PATCH', { approval_status: 'excluded', removed_at: new Date().toISOString() })
  return { excluded: ids.length }
}

/** Daily: per active campaign with daily_new > 0, enrol that many people not yet in any campaign. */
export async function topUp(): Promise<{ campaign: string; enrolled: number; approved: number }[]> {
  const campaigns = await read<CampaignRow[]>(`ob_campaigns?status=eq.active&daily_new=gt.0&select=id,name,status,variant_mode,audience,daily_new,auto_approve,bounce_paused_at`)
  if (!campaigns.length) return []
  const contacts = await fetchAllRows<ProspectContact>(`${SB_URL}/rest/v1/prospect_contacts?do_not_contact=eq.false&email=not.is.null&select=*&order=created_at.asc`, sbHeaders())
  const accounts = new Map((await fetchAllRows<ProspectAccount>(`${SB_URL}/rest/v1/prospect_accounts?select=id,market`, sbHeaders())).map(a => [a.id, a]))
  // Anyone already in a campaign, at any status, is not picked again.
  const taken = new Set((await fetchAllRows<{ lead_id: string }>(`${SB_URL}/rest/v1/ob_campaign_leads?select=lead_id,id`, sbHeaders())).map(r => r.lead_id))
  const today = new Date().toISOString().slice(0, 10)
  const out: { campaign: string; enrolled: number; approved: number }[] = []

  for (const c of campaigns) {
    // Once per day per campaign, however often the cron fires.
    const already = await read<{ id: string }[]>(`ob_outbound_events?event_type=eq.queue_topup&campaign_id=eq.${c.id}&created_at=gte.${today}T00:00:00Z&select=id&limit=1`).catch(() => [])
    if (already.length) continue
    const markets = c.audience?.markets?.length ? c.audience.markets : null
    const statuses = c.audience?.emailStatuses?.length ? c.audience.emailStatuses : SENDABLE_DEFAULT
    const pick = contacts.filter(p => isEnrollable(p, statuses) && (!markets || markets.includes(accounts.get(p.account_id)?.market as never)) && !(p.outbound_lead_id && taken.has(p.outbound_lead_id)))
      .slice(0, c.daily_new)
    if (!pick.length) { out.push({ campaign: c.name, enrolled: 0, approved: 0 }); continue }
    const r = await enrol(c.id, pick.map(p => p.id), 'daily top-up', { approve: c.auto_approve, statuses })
    pick.forEach(p => { if (p.outbound_lead_id) taken.add(p.outbound_lead_id) })
    // enrol() sets outbound_lead_id; mark the fresh contacts taken for the next campaign in this run.
    const fresh = await read<{ outbound_lead_id: string | null }[]>(`prospect_contacts?id=in.${inList(pick.map(p => p.id))}&select=outbound_lead_id`)
    fresh.forEach(f => f.outbound_lead_id && taken.add(f.outbound_lead_id))
    await logEvent({ event_type: 'queue_topup', entity_type: 'campaign', entity_id: c.id, campaign_id: c.id, payload: r })
    out.push({ campaign: c.name, enrolled: r.enrolled, approved: r.approved })
  }
  return out
}

/** Pause any active campaign whose first emails bounce above 5% over 14 days. */
export async function bounceGuard(): Promise<string[]> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const rows = await fetchAllRows<{ campaign_id: string; send_status: string }>(
    `${SB_URL}/rest/v1/ob_campaign_leads?step1_sent_at=gte.${since}&select=campaign_id,send_status,id`, sbHeaders())
  const by = new Map<string, { firsts: number; bounced: number }>()
  for (const r of rows) {
    const s = by.get(r.campaign_id) ?? { firsts: 0, bounced: 0 }
    s.firsts++; if (r.send_status === 'bounced') s.bounced++
    by.set(r.campaign_id, s)
  }
  const paused: string[] = []
  for (const [id, s] of Array.from(by)) {
    if (!shouldPauseForBounces(s.firsts, s.bounced)) continue
    const now = new Date().toISOString()
    const res = await fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${id}&status=eq.active`, { method: 'PATCH', headers: sbHeaders('return=representation'), body: JSON.stringify({ status: 'paused', paused_at: now, bounce_paused_at: now }) })
    if (res.ok && ((await res.json()) as unknown[]).length) {
      paused.push(id)
      await logEvent({ event_type: 'bounce_paused', entity_type: 'campaign', entity_id: id, campaign_id: id, payload: s })
    }
  }
  return paused
}

