// The one place campaign email leaves the system. Every 20 minutes in office hours:
//   1. daily top-up (auto-enrol campaigns), enrol approved personal drafts
//   2. check sent threads for replies and bounces (stops the sequence; a bounce suppresses)
//   3. pause any campaign whose bounce rate is over 5%
//   4. send due steps: active campaigns, office hours in the contact's market, suppression
//      checked per send, daily cap across campaigns
// Until CAMPAIGN_SENDING_ENABLED=true, step 4 only counts what is due.
import 'server-only'
import { enc, sb, sbCount, startOfSgtDay } from './db'
import { salesConfig, sendingEnabled, gmailConfigured } from './config'
import { GmailError, sendRaw, threadFroms } from './gmail'
import { buildMime, newMessageId, toBase64Url } from './mime'
import { applyMerge, firstNameOf, replySubject } from './render'
import { renderEmail, withinSendWindow } from './rules'
import { classifyThread } from './schedule'
import { logSalesEvent } from './events'
import { unsubscribeUrl } from './unsubscribe'
import { dailyTopUp, unavailableEmails, type TopUpResult } from './campaigns'
import { syncAudience } from './audience'

const ACTOR = 'system:campaigns'
const MAX_FAILURES = 3
export const BOUNCE_PAUSE = { minSends: 20, maxRate: 0.05, days: 14 }

type Campaign = { id: string; name: string; status: string; from_name: string; first_touch: string; demo_url: string | null; deck_url: string | null; booking_url: string | null }
type Step = { campaign_id: string; step_number: number; subject: string; body: string; delay_days: number }
type Contact = {
  id: string; campaign_id: string; email: string; name: string | null; first_name: string | null; company: string | null; title: string | null
  location: string | null; current_step: number; next_send_at: string | null; thread_id: string | null; first_subject: string | null
  last_message_id: string | null; sales_outreach_id: string | null; audience_id: string | null; status: string; opening: string | null
}

export type RunResult = {
  topUp: TopUpResult[]; enrolled: number; replies: number; bounces: number; replyCheck: 'on' | 'off'; paused: string[]
  sending: boolean; due: number; sent: number; skipped: { outsideHours: number; suppressed: number; missingLink: number; withdrawn: number }
  failed: number; capLeft: number; stoppedBy?: string
}

/** Approved personal drafts not yet in a campaign go into the newest campaign whose first touch
 *  is the personal draft. */
async function enrolApprovedDrafts(): Promise<number> {
  const c = (await sb<{ id: string; status: string }[]>('sales_campaigns?select=id,status&first_touch=eq.personal_draft&status=in.(draft,active,paused)&order=created_at.desc&limit=1'))[0]
  if (!c) return 0
  type Draft = { id: string; email: string; location: string | null; contact: { full_name: string | null; first_name: string | null; role: string | null; linkedin_url: string | null; suppressed: boolean | null; email_status: string | null } | null; account: { trading_name: string | null; legal_name: string | null } | null }
  const drafts = await sb<Draft[]>('sales_outreach?select=id,email,location,contact:sales_contacts(full_name,first_name,role,linkedin_url,suppressed,email_status),account:sales_accounts(trading_name,legal_name)&status=eq.approved&channel=eq.email&email=not.is.null&limit=500')
  if (!drafts.length) return 0
  const enrolled = new Set((await sb<{ sales_outreach_id: string }[]>(`sales_campaign_contacts?select=sales_outreach_id&sales_outreach_id=in.(${drafts.map(d => d.id).join(',')})`)).map(r => r.sales_outreach_id))
  const busy = await unavailableEmails()
  let n = 0
  for (const d of drafts) {
    if (enrolled.has(d.id) || d.contact?.suppressed || d.contact?.email_status !== 'verified') continue
    const email = d.email.toLowerCase()
    if (busy.has(email)) continue
    const aud = (await sb<{ id: string }[]>(`sales_audience?email=eq.${enc(email)}&select=id&limit=1`))[0]
    try {
      await sb('sales_campaign_contacts', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({
        campaign_id: c.id, email, name: d.contact?.full_name ?? null, first_name: d.contact?.first_name ?? firstNameOf(d.contact?.full_name),
        company: d.account?.trading_name ?? d.account?.legal_name ?? null, title: d.contact?.role ?? null, linkedin_url: d.contact?.linkedin_url ?? null,
        location: (d.location ?? 'SG').toUpperCase(), source: 'approved_draft', sales_outreach_id: d.id, audience_id: aud?.id ?? null,
        status: c.status === 'active' ? 'active' : 'pending', next_send_at: c.status === 'active' ? new Date().toISOString() : null,
      }) })
      n += 1
    } catch (e) {
      // 23505: this person is already live in another campaign. Leave them there.
      if (!/23505|duplicate/i.test(String(e))) throw e
    }
  }
  return n
}

async function stopContact(c: Contact, status: 'replied' | 'bounced' | 'unsubscribed' | 'completed') {
  await sb(`sales_campaign_contacts?id=eq.${c.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status, next_send_at: null, updated_at: new Date().toISOString() }) })
}

/** Replies and bounces in threads we started. Stops the sequence; a bounce also suppresses the
 *  address everywhere. */
async function checkThreads(sender: string, result: RunResult) {
  const live = await sb<Contact[]>('sales_campaign_contacts?select=*&status=eq.active&thread_id=not.is.null&order=updated_at&limit=60')
  for (const c of live) {
    const froms = await threadFroms(c.thread_id!)
    if (froms === null) { result.replyCheck = 'off'; return }
    const state = classifyThread(sender, froms)
    if (state === 'none') continue
    if (state === 'reply') {
      await stopContact(c, 'replied')
      result.replies += 1
      if (c.sales_outreach_id) await sb(`sales_outreach?id=eq.${c.sales_outreach_id}&status=eq.sent`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'replied', reply_class: 'replied' }) })
    } else {
      await stopContact(c, 'bounced')
      result.bounces += 1
      await sb('sales_suppressions?on_conflict=email', { method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates', body: JSON.stringify({ email: c.email.toLowerCase(), reason: 'bounced' }) })
      await sb(`sales_contacts?email=ilike.${enc(c.email)}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ email_status: 'bounced' }) })
      await logSalesEvent({ kind: 'bounced', actor: ACTOR, outreachId: c.sales_outreach_id, detail: { campaign: c.campaign_id, contact: c.id } })
    }
  }
}

/** Checked at send time, not only at enrolment: an address can be unsubscribed, or marked
 *  invalid or bounced, after it was approved. */
async function isSuppressed(c: Contact): Promise<boolean> {
  const email = c.email.toLowerCase()
  const [s, a] = await Promise.all([
    sb<{ id: string }[]>(`sales_suppressions?email=eq.${enc(email)}&select=id&limit=1`),
    sb<{ suppressed: boolean; email_status: string | null }[]>(`sales_audience?email=eq.${enc(email)}&select=suppressed,email_status&limit=1`),
  ])
  return s.length > 0 || Boolean(a[0]?.suppressed) || ['invalid', 'bounced'].includes(a[0]?.email_status ?? '')
}

/** Pause any active campaign whose bounce rate over 14 days passes 5% on at least 20 first
 *  emails. Bounces hurt the sending domain for every later email, including normal mail. */
async function pauseOnBounces(now: Date): Promise<string[]> {
  const since = new Date(now.getTime() - BOUNCE_PAUSE.days * 86_400_000).toISOString()
  const active = await sb<{ id: string; name: string }[]>('sales_campaigns?select=id,name&status=eq.active')
  const paused: string[] = []
  for (const c of active) {
    const sends = await sbCount(`sales_sends?select=id&campaign_id=eq.${c.id}&step_number=eq.1&status=eq.sent&sent_at=gte.${enc(since)}`)
    if (sends < BOUNCE_PAUSE.minSends) continue
    const bounces = await sbCount(`sales_campaign_contacts?select=id&campaign_id=eq.${c.id}&status=eq.bounced&updated_at=gte.${enc(since)}`)
    const rate = bounces / (sends || 1)
    if (rate <= BOUNCE_PAUSE.maxRate) continue
    const reason = `Paused automatically: ${bounces} bounces on ${sends} first emails in ${BOUNCE_PAUSE.days} days (${Math.round(rate * 100)}%, limit 5%)`
    await sb(`sales_campaigns?id=eq.${c.id}&status=eq.active`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'paused', paused_reason: reason, updated_at: now.toISOString() }) })
    paused.push(c.name)
  }
  return paused
}

export async function runCampaigns(now = new Date()): Promise<RunResult> {
  const result: RunResult = {
    topUp: [], enrolled: 0, replies: 0, bounces: 0, replyCheck: 'on', paused: [], sending: sendingEnabled(), due: 0, sent: 0,
    skipped: { outsideHours: 0, suppressed: 0, missingLink: 0, withdrawn: 0 }, failed: 0, capLeft: 0,
  }
  await syncAudience()
  result.topUp = await dailyTopUp(now)
  result.enrolled = await enrolApprovedDrafts()

  const sender = salesConfig.senderEmail()
  if (gmailConfigured()) await checkThreads(sender, result)
  else result.replyCheck = 'off'
  result.paused = await pauseOnBounces(now)

  const campaigns = await sb<Campaign[]>('sales_campaigns?select=id,name,status,from_name,first_touch,demo_url,deck_url,booking_url&status=eq.active')
  if (!campaigns.length) return result
  const byId = new Map(campaigns.map(c => [c.id, c]))
  const steps = await sb<Step[]>(`sales_campaign_steps?select=campaign_id,step_number,subject,body,delay_days&campaign_id=in.(${Array.from(byId.keys()).join(',')})`)
  const stepOf = (cid: string, n: number) => steps.find(s => s.campaign_id === cid && s.step_number === n)

  const due = await sb<Contact[]>(`sales_campaign_contacts?select=*&campaign_id=in.(${Array.from(byId.keys()).join(',')})&status=eq.active&next_send_at=lte.${enc(now.toISOString())}&order=next_send_at&limit=200`)
  result.due = due.length

  const sentToday = await sbCount(`sales_sends?select=id&status=eq.sent&sent_at=gte.${enc(startOfSgtDay(now))}`)
  result.capLeft = Math.max(0, salesConfig.dailyCap() - sentToday)
  if (!result.sending) return result
  const runMax = Math.min(salesConfig.perRun(), result.capLeft)

  for (const c of due) {
    if (result.sent >= runMax || result.stoppedBy) break
    const campaign = byId.get(c.campaign_id)!
    if (!withinSendWindow(c.location ?? 'SG', now)) { result.skipped.outsideHours += 1; continue }
    if (await isSuppressed(c)) { await stopContact(c, 'unsubscribed'); result.skipped.suppressed += 1; continue }

    const n = c.current_step + 1
    const step = stepOf(c.campaign_id, n)
    let subject: string
    let body: string
    try {
      if (n === 1 && campaign.first_touch === 'personal_draft' && c.sales_outreach_id) {
        const d = (await sb<{ status: string; subject: string | null; body: string | null }[]>(`sales_outreach?id=eq.${c.sales_outreach_id}&select=status,subject,body&limit=1`))[0]
        if (!d || d.status !== 'approved' || !d.body) {
          // Approval withdrawn since enrolment: take them out, nothing sent.
          await sb(`sales_campaign_contacts?id=eq.${c.id}&current_step=eq.0`, { method: 'DELETE', prefer: 'return=minimal' })
          result.skipped.withdrawn += 1
          continue
        }
        subject = d.subject ?? ''
        body = d.body
      } else {
        if (!step) { await stopContact(c, 'completed'); continue }
        const values = { first_name: c.first_name ?? firstNameOf(c.name), name: c.name, company: c.company, title: c.title, opening: c.opening, demo_link: campaign.demo_url, deck_link: campaign.deck_url, booking_link: campaign.booking_url }
        subject = n > 1 && c.first_subject ? replySubject(c.first_subject) : applyMerge(step.subject, values)
        body = applyMerge(step.body, values)
      }
    } catch { result.skipped.missingLink += 1; continue }

    // Claim: push next_send_at an hour out, only if no other run moved it.
    const lease = new Date(now.getTime() + 3_600_000).toISOString()
    const claimed = await sb<{ id: string }[]>(`sales_campaign_contacts?id=eq.${c.id}&status=eq.active&next_send_at=eq.${enc(c.next_send_at!)}&select=id`, { method: 'PATCH', body: JSON.stringify({ next_send_at: lease }) })
    if (!claimed.length) continue

    const unsub = unsubscribeUrl(salesConfig.appUrl(), c.id)
    const { html, text } = renderEmail({ body, businessName: salesConfig.businessName(), businessDomain: salesConfig.businessDomain(), unsubscribeUrl: unsub })
    const messageId = newMessageId(salesConfig.businessDomain())
    // A copy of every email lands in the sender's inbox unless CAMPAIGN_INBOX_COPY=false.
    const bcc = process.env.CAMPAIGN_INBOX_COPY === 'false' ? null : sender
    const raw = buildMime({ fromName: campaign.from_name, fromEmail: sender, to: c.email, bcc, subject, text, html, messageId, inReplyTo: n > 1 ? c.last_message_id : null, unsubscribeUrl: unsub })

    try {
      const sent = await sendRaw(toBase64Url(raw), n > 1 ? c.thread_id : null)
      await sb('sales_sends', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({ contact_id: c.id, campaign_id: c.campaign_id, step_number: n, status: 'sent', provider: 'gmail', provider_message_id: sent.id }) })
      const next = stepOf(c.campaign_id, n + 1)
      await sb(`sales_campaign_contacts?id=eq.${c.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({
        current_step: n, status: next ? 'active' : 'completed',
        next_send_at: next ? new Date(now.getTime() + next.delay_days * 86_400_000).toISOString() : null,
        thread_id: c.thread_id ?? sent.threadId, first_subject: c.first_subject ?? subject, last_message_id: messageId, updated_at: new Date().toISOString(),
      }) })
      if (n === 1 && c.sales_outreach_id) {
        const so = await sb<{ account_id: string; contact_id: string | null }[]>(`sales_outreach?id=eq.${c.sales_outreach_id}&status=eq.approved&select=account_id,contact_id`, { method: 'PATCH', body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString() }) })
        await logSalesEvent({ kind: 'sent', actor: ACTOR, accountId: so[0]?.account_id ?? null, contactId: so[0]?.contact_id ?? null, outreachId: c.sales_outreach_id, detail: { campaign: c.campaign_id, provider: 'gmail', message_id: sent.id } })
      }
      result.sent += 1
    } catch (e) {
      const status = e instanceof GmailError ? e.status : 0
      const error = e instanceof Error ? e.message.slice(0, 300) : 'unknown'
      await sb('sales_sends', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({ contact_id: c.id, campaign_id: c.campaign_id, step_number: n, status: 'failed', error, provider: 'gmail' }) })
      const failures = await sbCount(`sales_sends?select=id&contact_id=eq.${c.id}&status=eq.failed`)
      if (failures >= MAX_FAILURES) await stopContact(c, 'completed')
      result.failed += 1
      // Auth or quota problems affect every send: stop, retry next run.
      if ([0, 400, 401, 403, 429].includes(status)) result.stoppedBy = error
    }
  }
  return result
}
