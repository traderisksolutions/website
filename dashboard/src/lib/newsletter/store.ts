/**
 * Newsletter per site: double opt-in subscribers, weekly issues built from published articles,
 * approval, then batched sending through the dashboard's Gmail connection. Server only.
 */
import 'server-only'
import { enc, isUuid, sb, sbCount } from '@/lib/sales/db'
import { buildMime, newMessageId, toBase64Url } from '@/lib/sales/mime'
import { sendRaw, senderAliasState } from '@/lib/sales/gmail'
import { gmailConfigured } from '@/lib/sales/config'
import { articleUrl } from '@/lib/marketing/sites'
import { confirmEmail, issueEmail, type IssueArticle, type SiteBrand } from './email'
import { signToken, verifyToken } from './tokens'

export type NlSite = { id: string; key: string; name: string; domain: string; base_url: string; blog_base_path: string; newsletter_sender_email: string | null; newsletter_sender_name: string | null }
export type Subscriber = { id: string; site_id: string; email: string; status: 'pending' | 'confirmed' | 'unsubscribed'; source_url: string | null; confirm_sent_at: string | null; confirmed_at: string | null; created_at: string }
export type Issue = { id: string; site_id: string; subject: string; intro: string; article_ids: string[]; status: 'draft' | 'sending' | 'sent'; test_sent_at: string | null; approved_by: string | null; approved_at: string | null; sent_at: string | null; recipients: number; failures: number; created_at: string }
type Article = { id: string; title: string; slug: string; excerpt: string | null; published_at: string | null; market?: string }

const SITE_COLS = 'id,key,name,domain,base_url,blog_base_path,newsletter_sender_email,newsletter_sender_name'
/** WhatsApp link per site, for the "WhatsApp us" step. */
const WHATSAPP: Record<string, string> = { corpcover: 'https://wa.me/6587747769' }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://app.traderisksolutions.com.sg').replace(/\/$/, '')

export async function getNlSite(ref: string | null | undefined): Promise<NlSite | null> {
  const r = (ref ?? '').trim().toLowerCase()
  const filter = !r ? '' : isUuid(r) ? `&id=eq.${r}` : `&or=(key.eq.${enc(r)},domain.eq.${enc(r)})`
  return (await sb<NlSite[]>(`marketing_sites?select=${SITE_COLS}${filter}&order=sort_order&limit=1`))[0] ?? null
}
export const listNlSites = () => sb<NlSite[]>(`marketing_sites?select=${SITE_COLS}&order=sort_order`)

const brand = (s: NlSite): SiteBrand => ({ name: s.name, base_url: s.base_url, phone_wa: WHATSAPP[s.key] ?? null })

/** Sending is possible only with a sender set, Gmail connected and the sender a verified alias. */
export async function senderState(site: NlSite): Promise<{ ready: boolean; reason: string | null }> {
  if (!site.newsletter_sender_email) return { ready: false, reason: 'No sender address set for this site.' }
  if (!gmailConfigured()) return { ready: false, reason: 'Gmail is not connected to the dashboard.' }
  const st = await senderAliasState(site.newsletter_sender_email)
  if (!st) return { ready: false, reason: 'Could not check the sender with Gmail.' }
  if (!st.verified) return { ready: false, reason: `${site.newsletter_sender_email} is not a verified "Send mail as" address of ${st.mailbox ?? 'the connected mailbox'}.` }
  return { ready: true, reason: null }
}

async function send(site: NlSite, to: string, mail: { subject: string; html: string; text: string }, unsubscribeUrl: string | null) {
  const raw = buildMime({
    fromName: site.newsletter_sender_name || site.name, fromEmail: site.newsletter_sender_email!, to,
    subject: mail.subject, text: mail.text, html: mail.html, messageId: newMessageId(site.domain), unsubscribeUrl,
  })
  return sendRaw(toBase64Url(raw))
}

const confirmLink = (id: string) => `${appUrl()}/api/public/newsletter/confirm?s=${id}&t=${signToken('newsletter-confirm', id)}`
export const unsubscribeLink = (id: string) => `${appUrl()}/api/public/newsletter/unsubscribe?s=${id}&t=${signToken('newsletter-unsubscribe', id)}`

// ---------- public ----------

/** Add or re-activate a subscriber and send the confirmation when the sender is ready. */
export async function subscribe(siteKey: unknown, emailIn: unknown, sourceUrl: unknown): Promise<{ error: string } | { status: 'pending' | 'already' }> {
  const site = typeof siteKey === 'string' ? await getNlSite(siteKey) : null
  if (!site) return { error: 'unknown site' }
  const email = typeof emailIn === 'string' ? emailIn.trim().toLowerCase().slice(0, 200) : ''
  if (!EMAIL.test(email)) return { error: 'email is not valid' }
  const source = typeof sourceUrl === 'string' ? sourceUrl.slice(0, 500) : null
  const now = new Date().toISOString()
  let sub = (await sb<Subscriber[]>(`newsletter_subscribers?site_id=eq.${site.id}&email=eq.${enc(email)}&select=*&limit=1`))[0]
  if (sub?.status === 'confirmed') return { status: 'already' }
  if (!sub) sub = (await sb<Subscriber[]>('newsletter_subscribers', { method: 'POST', body: JSON.stringify({ site_id: site.id, email, source_url: source }) }))[0]
  else if (sub.status === 'unsubscribed') await sb(`newsletter_subscribers?id=eq.${sub.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'pending', unsubscribed_at: null, source_url: source, updated_at: now }) })
  // One confirmation per 10 minutes per address, so the form cannot be used to flood an inbox.
  if (sub.confirm_sent_at && Date.now() - new Date(sub.confirm_sent_at).getTime() < 600_000) return { status: 'pending' }
  await sendConfirmation(site, sub.id, email).catch(e => console.error('newsletter confirm send failed', e instanceof Error ? e.message : e))
  return { status: 'pending' }
}

async function sendConfirmation(site: NlSite, id: string, email: string): Promise<boolean> {
  if (!(await senderState(site)).ready) return false
  await send(site, email, confirmEmail(brand(site), confirmLink(id)), null)
  await sb(`newsletter_subscribers?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ confirm_sent_at: new Date().toISOString() }) })
  return true
}

export async function confirm(id: string, token: string): Promise<NlSite | null> {
  if (!isUuid(id) || !verifyToken('newsletter-confirm', id, token)) return null
  const sub = (await sb<Subscriber[]>(`newsletter_subscribers?id=eq.${id}&select=*&limit=1`))[0]
  if (!sub) return null
  if (sub.status !== 'confirmed') {
    const now = new Date().toISOString()
    await sb(`newsletter_subscribers?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'confirmed', confirmed_at: now, unsubscribed_at: null, updated_at: now }) })
  }
  return getNlSite(sub.site_id)
}

export async function unsubscribe(id: string, token: string): Promise<NlSite | null> {
  if (!isUuid(id) || !verifyToken('newsletter-unsubscribe', id, token)) return null
  const sub = (await sb<Subscriber[]>(`newsletter_subscribers?id=eq.${id}&select=*&limit=1`))[0]
  if (!sub) return null
  const now = new Date().toISOString()
  await sb(`newsletter_subscribers?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'unsubscribed', unsubscribed_at: now, updated_at: now }) })
  return getNlSite(sub.site_id)
}

// ---------- staff ----------

async function publishedArticles(site: NlSite, limit = 30): Promise<Article[]> {
  return sb<Article[]>(`cms_articles?site_id=eq.${site.id}&status=eq.published&select=id,title,slug,excerpt,published_at&order=published_at.desc.nullslast&limit=${limit}`)
}

export async function overview(site: NlSite) {
  const [pending, confirmed, unsubscribed, subscribers, issues, articles, sender] = await Promise.all([
    sbCount(`newsletter_subscribers?site_id=eq.${site.id}&status=eq.pending`),
    sbCount(`newsletter_subscribers?site_id=eq.${site.id}&status=eq.confirmed`),
    sbCount(`newsletter_subscribers?site_id=eq.${site.id}&status=eq.unsubscribed`),
    sb<Subscriber[]>(`newsletter_subscribers?site_id=eq.${site.id}&select=*&order=created_at.desc&limit=200`),
    sb<Issue[]>(`newsletter_issues?site_id=eq.${site.id}&select=*&order=created_at.desc&limit=30`),
    publishedArticles(site),
    senderState(site),
  ])
  return { counts: { pending, confirmed, unsubscribed }, subscribers, issues, articles, sender }
}

/** A new draft: the articles published since the last sent issue (else the latest), lead first, up to 3. */
export async function createIssue(site: NlSite, actor: string): Promise<Issue> {
  const last = (await sb<Issue[]>(`newsletter_issues?site_id=eq.${site.id}&status=eq.sent&select=sent_at&order=sent_at.desc&limit=1`))[0]
  const all = await publishedArticles(site)
  const fresh = last?.sent_at ? all.filter(a => a.published_at && a.published_at > last.sent_at!) : all
  const pick = (fresh.length ? fresh : all).slice(0, 3)
  const subject = pick[0] ? `${site.name}: ${pick[0].title}` : `${site.name} this week`
  return (await sb<Issue[]>('newsletter_issues', { method: 'POST', body: JSON.stringify({ site_id: site.id, subject, intro: '', article_ids: pick.map(a => a.id), created_by: actor }) }))[0]
}

export async function getIssue(id: string): Promise<Issue | null> {
  if (!isUuid(id)) return null
  return (await sb<Issue[]>(`newsletter_issues?id=eq.${id}&select=*&limit=1`))[0] ?? null
}

export async function updateIssue(issue: Issue, body: Record<string, unknown>): Promise<string | null> {
  if (issue.status !== 'draft') return 'Only a draft can be edited.'
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.subject === 'string') { const s = body.subject.trim().slice(0, 150); if (!s) return 'Subject is required.'; patch.subject = s }
  if (typeof body.intro === 'string') patch.intro = body.intro.slice(0, 2000)
  if (Array.isArray(body.article_ids)) {
    const ids = body.article_ids.filter((x): x is string => typeof x === 'string' && isUuid(x)).slice(0, 6)
    if (!ids.length) return 'Choose at least one article.'
    patch.article_ids = ids
  }
  await sb(`newsletter_issues?id=eq.${issue.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(patch) })
  return null
}

export async function deleteIssue(issue: Issue): Promise<string | null> {
  if (issue.status !== 'draft') return 'Only a draft can be deleted.'
  await sb(`newsletter_issues?id=eq.${issue.id}`, { method: 'DELETE', prefer: 'return=minimal' })
  return null
}

/** The issue as it will be sent; `subscriberId` fills the unsubscribe link. */
export async function renderIssue(site: NlSite, issue: Issue, subscriberId: string | null) {
  const rows = issue.article_ids.length ? await sb<Article[]>(`cms_articles?id=in.(${issue.article_ids.join(',')})&select=id,title,slug,excerpt,published_at,market`) : []
  const tag = `utm_source=newsletter&utm_medium=email&utm_campaign=${(issue.approved_at ?? issue.created_at).slice(0, 10)}`
  const withTag = (u: string) => `${u}${u.includes('?') ? '&' : '?'}${tag}`
  const articles: IssueArticle[] = issue.article_ids.map(id => rows.find(r => r.id === id)).filter((a): a is Article => !!a)
    .map(a => ({ title: a.title, excerpt: a.excerpt, url: withTag(articleUrl(site, a.slug, a.market)) }))
  const base = site.base_url.replace(/\/$/, '')
  const dateLabel = new Date(issue.approved_at ?? Date.now()).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore' })
  return issueEmail(brand(site), { subject: issue.subject, intro: issue.intro, dateLabel }, articles, {
    review: withTag(`${base}/sg/?start=review`), find: withTag(`${base}/sg/get-covered`),
    unsubscribe: subscriberId ? unsubscribeLink(subscriberId) : `${appUrl()}/api/public/newsletter/unsubscribe`,
  })
}

export async function sendTest(site: NlSite, issue: Issue, to: string): Promise<string | null> {
  const st = await senderState(site)
  if (!st.ready) return st.reason
  if (!EMAIL.test(to)) return 'Your account has no email address to send the test to.'
  const mail = await renderIssue(site, issue, null)
  await send(site, to, { ...mail, subject: `[Test] ${mail.subject}` }, null)
  await sb(`newsletter_issues?id=eq.${issue.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ test_sent_at: new Date().toISOString() }) })
  return null
}

export async function approve(site: NlSite, issue: Issue, actor: string): Promise<string | null> {
  if (issue.status !== 'draft') return 'This issue is already approved.'
  if (!issue.article_ids.length) return 'Choose at least one article.'
  const st = await senderState(site)
  if (!st.ready) return st.reason
  const now = new Date().toISOString()
  await sb(`newsletter_issues?id=eq.${issue.id}&status=eq.draft`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'sending', approved_by: actor, approved_at: now, updated_at: now }) })
  return null
}

/** Send to the next batch of confirmed subscribers who have not had this issue. The page calls this
 *  until `remaining` is 0. Gmail allows about 2,000 recipients a day per mailbox. */
export async function sendBatch(site: NlSite, issue: Issue, size = 20): Promise<{ sent: number; failed: number; remaining: number } | { error: string }> {
  if (issue.status !== 'sending') return { error: 'This issue is not approved for sending.' }
  const done = await sb<{ subscriber_id: string }[]>(`newsletter_sends?issue_id=eq.${issue.id}&select=subscriber_id&limit=10000`)
  const doneSet = new Set(done.map(d => d.subscriber_id))
  const all = await sb<Subscriber[]>(`newsletter_subscribers?site_id=eq.${site.id}&status=eq.confirmed&select=id,email&order=confirmed_at.asc&limit=10000`)
  const todo = all.filter(s => !doneSet.has(s.id))
  let sent = 0, failed = 0
  for (const s of todo.slice(0, size)) {
    // Claim the row first: the primary key makes a second, concurrent batch skip this subscriber
    // instead of emailing them twice.
    try { await sb('newsletter_sends', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({ issue_id: issue.id, subscriber_id: s.id, status: 'failed', error: 'sending' }) }) }
    catch { continue }
    const row = `newsletter_sends?issue_id=eq.${issue.id}&subscriber_id=eq.${s.id}`
    try {
      const mail = await renderIssue(site, issue, s.id)
      const r = await send(site, s.email, mail, unsubscribeLink(s.id))
      await sb(row, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'sent', gmail_id: r.id, error: null, at: new Date().toISOString() }) })
      sent++
    } catch (e) {
      failed++
      await sb(row, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }) }).catch(() => {})
    }
  }
  const remaining = Math.max(0, todo.length - Math.min(todo.length, size))
  const totals = { recipients: await sbCount(`newsletter_sends?issue_id=eq.${issue.id}&status=eq.sent`), failures: await sbCount(`newsletter_sends?issue_id=eq.${issue.id}&status=eq.failed&error=neq.sending`) }
  await sb(`newsletter_issues?id=eq.${issue.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ ...totals, ...(remaining === 0 ? { status: 'sent', sent_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() }) })
  return { sent, failed, remaining }
}

export async function setSender(site: NlSite, body: Record<string, unknown>): Promise<string | null> {
  const email = typeof body.sender_email === 'string' ? body.sender_email.trim().toLowerCase() : ''
  if (email && !EMAIL.test(email)) return 'Sender email is not valid.'
  const name = typeof body.sender_name === 'string' ? body.sender_name.trim().slice(0, 80) : ''
  await sb(`marketing_sites?id=eq.${site.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ newsletter_sender_email: email || null, newsletter_sender_name: name || null }) })
  return null
}

/** Re-send confirmations to pending subscribers who never got one (e.g. signed up before the sender was set). */
export async function sendPendingConfirmations(site: NlSite): Promise<{ sent: number } | { error: string }> {
  const st = await senderState(site)
  if (!st.ready) return { error: st.reason ?? 'Sender not ready.' }
  const subs = await sb<Subscriber[]>(`newsletter_subscribers?site_id=eq.${site.id}&status=eq.pending&confirm_sent_at=is.null&select=id,email&limit=40`)
  let sent = 0
  for (const s of subs) { try { await sendConfirmation(site, s.id, s.email); sent++ } catch { /* next */ } }
  return { sent }
}
