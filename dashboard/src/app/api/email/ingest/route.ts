import { NextRequest, NextResponse } from 'next/server'
import { waitUntil }        from '@vercel/functions'

export const maxDuration = 300

const SB_URL          = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API       = 'https://gmail.googleapis.com/gmail/v1/users/me'
const TRS_DOMAIN      = 'trade-risksol.com'

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:         k,
    Authorization:  `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:         prefer,
  }
}

const isInternal  = (e: string) => e.toLowerCase().endsWith(`@${TRS_DOMAIN}`)
const isAutomated = (e: string) => {
  const l = e.toLowerCase()
  return l.includes('noreply') || l.includes('no-reply') || l.includes('donotreply') ||
         l.includes('mailer-daemon') || l.includes('postmaster')
}

async function getAccessToken(): Promise<string> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to get Gmail access token')
  return data.access_token
}

async function fetchGmailMessage(token: string, messageId: string) {
  const res = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.ok ? await res.json() : null
}

function headerVal(headers: { name: string; value: string }[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

type MimePart = { mimeType: string; body: { data?: string }; parts?: unknown[] }

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|tr|li|blockquote)>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
}

// Returns the primary display text (first text/plain or stripped HTML), same as before.
function decodeBody(parts: MimePart[]): string {
  let htmlFallback = ''
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8')
    }
    if (part.mimeType === 'text/html' && part.body?.data && !htmlFallback) {
      htmlFallback = Buffer.from(part.body.data, 'base64').toString('utf-8')
    }
    if (part.parts) {
      const nested = decodeBody(part.parts as MimePart[])
      if (nested) return nested
    }
  }
  if (htmlFallback) return stripHtml(htmlFallback)
  return ''
}

// Collects ALL text content from ALL MIME parts — including embedded message/rfc822 attachments
// used for Outlook-style forwarded emails where the original message is a nested attachment.
function decodeFullText(parts: MimePart[]): string {
  const chunks: string[] = []
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      chunks.push(Buffer.from(part.body.data, 'base64').toString('utf-8'))
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      chunks.push(stripHtml(Buffer.from(part.body.data, 'base64').toString('utf-8')))
    }
    if (part.parts) {
      chunks.push(decodeFullText(part.parts as MimePart[]))
    }
  }
  return chunks.filter(Boolean).join('\n')
}

function splitDisplayName(name: string | null): { first_name: string | null; last_name: string | null } {
  if (!name?.trim()) return { first_name: null, last_name: null }
  const parts = name.trim().split(/\s+/)
  return { first_name: parts[0] || null, last_name: parts.length > 1 ? parts.slice(1).join(' ') : null }
}

const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'live.com', 'me.com', 'msn.com', 'protonmail.com', 'aol.com', 'googlemail.com',
])

function inferCompanyFromEmail(email: string): string | null {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain || PERSONAL_DOMAINS.has(domain)) return null
  const name = domain.split('.')[0]
  return name.charAt(0).toUpperCase() + name.slice(1)
}

// Extract all unique external email addresses from To:/Cc: lines in a forwarded message body.
// Used to capture third-party participants (insurers, clients, brokers) as contacts.
function extractForwardedParticipants(text: string): string[] {
  const normalised = text.replace(/\r\n/g, '\n')
  const emails: string[] = []
  const lineRe = /^(?:To|Cc|CC):[^\n]+/gim
  let m: RegExpExecArray | null
  while ((m = lineRe.exec(normalised)) !== null) {
    const found = m[0].match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[a-z]{2,}/g) ?? []
    for (const e of found) {
      if (!isInternal(e) && !isAutomated(e)) emails.push(e.toLowerCase())
    }
  }
  return Array.from(new Set(emails))
}

// Extract original external sender from a forwarded/replied message body.
// Scans ALL "From:" lines and returns the first non-internal, non-automated one,
// because email chains may have multiple From: lines (internal forwarders before the client).
function parseForwardedSender(body: string): { email: string; name: string | null } | null {
  const text = body.replace(/\r\n/g, '\n')

  const patterns = [
    /^From:\s*"?(.+?)"?\s*[<\[](?:mailto:)?([^\]>]+@[^\]>]+)[\]>]/gim,  // Name <email> or Name [mailto:email]
    /^From:\s*([^\s<\[]+@[^\s>\]]+)/gim,                                    // bare email address
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const email = (m[2] ?? m[1]).trim().replace(/^mailto:/i, '')
      const name  = m[2] ? (m[1].trim() || null) : null
      if (email.includes('@') && !isInternal(email) && !isAutomated(email)) {
        return { email, name }
      }
    }
  }
  return null
}

function parseAddresses(raw: string): { email: string; name: string | null }[] {
  if (!raw.trim()) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(addr => {
    const m     = addr.match(/<(.+?)>/)
    const email = m ? m[1].trim() : addr.trim()
    const name  = addr.includes('<') ? addr.split('<')[0].trim().replace(/^"|"$/g, '') : null
    return { email, name }
  })
}

// Read the last stored Gmail history ID from DB
async function getStoredHistoryId(): Promise<string> {
  const res = await fetch(
    `${SB_URL}/rest/v1/system_config?key=eq.gmail_history_id&select=value&limit=1`,
    { headers: sbHeaders('return=representation') }
  )
  const rows = res.ok ? await res.json() : []
  return Array.isArray(rows) && rows[0]?.value ? rows[0].value : '0'
}

// Persist the new history ID so next webhook knows where to start
async function saveHistoryId(historyId: string) {
  await fetch(`${SB_URL}/rest/v1/system_config?key=eq.gmail_history_id`, {
    method:  'PATCH',
    headers: sbHeaders('return=minimal'),
    body:    JSON.stringify({ value: historyId, updated_at: new Date().toISOString() }),
  })
}

// Fetch all INBOX message IDs received in the last N minutes using Gmail search.
// Used by the manual Refresh button — does not depend on historyId being valid.
async function getRecentMessageIds(token: string, sinceMinutes: number): Promise<string[]> {
  const afterEpoch = Math.floor((Date.now() - sinceMinutes * 60_000) / 1000)
  console.log('[ingest] pulling INBOX emails since', sinceMinutes, 'minutes ago')
  const res  = await fetch(
    `${GMAIL_API}/messages?labelIds=INBOX&q=after:${afterEpoch}&maxResults=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = res.ok ? await res.json() : {}
  const ids: string[] = (data.messages ?? []).map((m: { id: string }) => m.id)
  console.log('[ingest] recent pull found', ids.length, 'message(s)')
  return ids
}

// Use Gmail History API to get only new message IDs since the last historyId.
// Falls back to fetching the 25 most recent INBOX messages if history is unavailable.
async function getNewMessageIds(token: string): Promise<string[]> {
  const storedId = await getStoredHistoryId()

  // If we have a valid stored ID, use the History API — processes only new messages
  if (storedId !== '0') {
    const histRes = await fetch(
      `${GMAIL_API}/history?startHistoryId=${storedId}&labelId=INBOX`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (histRes.ok) {
      const histData = await histRes.json()
      const ids = new Set<string>()
      for (const record of histData.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          if (added.message?.id) ids.add(added.message.id)
        }
        // Also catch messages that had INBOX label added (forwarded/moved emails)
        for (const labeled of record.labelsAdded ?? []) {
          if (labeled.labelIds?.includes('INBOX') && labeled.message?.id) {
            ids.add(labeled.message.id)
          }
        }
      }
      if (ids.size > 0) {
        console.log('[ingest] history API: found', ids.size, 'new message(s)')
        return Array.from(ids)
      }
      console.log('[ingest] history API returned 0 new messages — using INBOX fallback')
    }
  }

  // Fallback: fetch recent INBOX messages (used on first run or if history is stale)
  console.log('[ingest] fallback: fetching recent INBOX messages')
  const listRes = await fetch(
    `${GMAIL_API}/messages?labelIds=INBOX&maxResults=25`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const listData = listRes.ok ? await listRes.json() : {}
  return (listData.messages ?? []).map((m: { id: string }) => m.id)
}

// If the sender is an outbound campaign lead, tag the thread and mark the lead as replied.
// Non-blocking — called fire-and-forget inside ingestMessage. Never throws.
async function tagThreadWithCampaignContext(email: string, threadId: string): Promise<void> {
  const h = sbHeaders('return=minimal')

  // Check if this Gmail thread was sent by our outbound cron (ob_campaign_leads.gmail_thread_id)
  const obLeadRes = await fetch(
    `${SB_URL}/rest/v1/ob_campaign_leads?gmail_thread_id=eq.${encodeURIComponent(threadId)}&select=id,campaign_id,send_status&limit=1`,
    { headers: h, cache: 'no-store' }
  )
  const obLeads: { id: string; campaign_id: string; send_status: string }[] = obLeadRes.ok ? await obLeadRes.json() : []

  if (obLeads.length > 0 && obLeads[0].send_status !== 'replied') {
    // Mark the lead as replied
    await fetch(`${SB_URL}/rest/v1/ob_campaign_leads?id=eq.${obLeads[0].id}`, {
      method:  'PATCH',
      headers: h,
      body:    JSON.stringify({ send_status: 'replied' }),
    })

    // Promote contact to 'engaged' (outbound reply = active conversation)
    const cRes = await fetch(
      `${SB_URL}/rest/v1/contacts?email=eq.${encodeURIComponent(email)}&select=id,engagement_stage&limit=1`,
      { headers: h, cache: 'no-store' }
    ).catch(() => null)
    const cRows: { id: string; engagement_stage: string | null }[] = cRes?.ok ? await cRes.json() : []
    const cRow = cRows[0]
    if (cRow && (!cRow.engagement_stage || cRow.engagement_stage === 'prospect')) {
      await fetch(`${SB_URL}/rest/v1/contacts?id=eq.${cRow.id}`, {
        method:  'PATCH',
        headers: h,
        body:    JSON.stringify({ engagement_stage: 'engaged' }),
      }).catch(() => {})
    }

    // Tag the thread with campaign context
    const campRes = await fetch(
      `${SB_URL}/rest/v1/ob_campaigns?id=eq.${obLeads[0].campaign_id}&select=name,product_type&limit=1`,
      { headers: h, cache: 'no-store' }
    )
    const camps: { name: string; product_type: string }[] = campRes.ok ? await campRes.json() : []
    if (camps.length) {
      await fetch(`${SB_URL}/rest/v1/email_threads?id=eq.${threadId}`, {
        method:  'PATCH',
        headers: h,
        body:    JSON.stringify({
          campaign_context: {
            campaign_id:      obLeads[0].campaign_id,
            campaign_name:    camps[0].name,
            product_type:     camps[0].product_type ?? 'General',
          },
        }),
      })
      console.log('[ingest] outbound reply detected on thread', threadId, '→', camps[0].name)
    }
    return
  }

  // Fallback: check by sender email in outbound_leads (for non-Gmail-tracked campaigns)
  const leadRes = await fetch(
    `${SB_URL}/rest/v1/outbound_leads?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
    { headers: h, cache: 'no-store' }
  )
  const leads: { id: string }[] = leadRes.ok ? await leadRes.json() : []
  if (!leads.length) return

  const leadId = leads[0].id
  const clRes = await fetch(
    `${SB_URL}/rest/v1/ob_campaign_leads?lead_id=eq.${leadId}&send_status=in.(queued,sent)&select=id,campaign_id&order=created_at.desc&limit=1`,
    { headers: h, cache: 'no-store' }
  )
  const cls: { id: string; campaign_id: string }[] = clRes.ok ? await clRes.json() : []
  if (!cls.length) return

  await fetch(`${SB_URL}/rest/v1/ob_campaign_leads?id=eq.${cls[0].id}`, {
    method:  'PATCH',
    headers: h,
    body:    JSON.stringify({ send_status: 'replied' }),
  })

  const campRes = await fetch(
    `${SB_URL}/rest/v1/ob_campaigns?id=eq.${cls[0].campaign_id}&select=name,product_type&limit=1`,
    { headers: h, cache: 'no-store' }
  )
  const camps: { name: string; product_type: string }[] = campRes.ok ? await campRes.json() : []
  if (!camps.length) return

  await fetch(`${SB_URL}/rest/v1/email_threads?id=eq.${threadId}`, {
    method:  'PATCH',
    headers: h,
    body:    JSON.stringify({
      campaign_context: {
        campaign_id:   cls[0].campaign_id,
        campaign_name: camps[0].name,
        product_type:  camps[0].product_type ?? 'General',
      },
    }),
  })
  console.log('[ingest] outbound reply (email match) on thread', threadId, '→', camps[0].name)
}

// Core: ingest a single Gmail message into the database
async function ingestMessage(token: string, gmailMsgId: string, origin: string) {
  const msg = await fetchGmailMessage(token, gmailMsgId)
  if (!msg) return

  const hdrs     = msg.payload?.headers ?? []
  const subject  = headerVal(hdrs, 'Subject')
  const fromRaw  = headerVal(hdrs, 'From')
  const toRaw    = headerVal(hdrs, 'To')
  const ccRaw    = headerVal(hdrs, 'Cc')
  const dateStr  = headerVal(hdrs, 'Date')
  const sentAt   = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()
  const gmailThreadId = msg.threadId

  const fromEmail = (fromRaw.match(/<(.+?)>/) ?? [, fromRaw])[1]?.trim() ?? fromRaw.trim()
  const fromName  = fromRaw.includes('<') ? fromRaw.split('<')[0].trim().replace(/^"|"$/g, '') : null

  if (isAutomated(fromEmail)) {
    console.log('[ingest] skip automated:', fromEmail)
    return
  }

  const parts    = msg.payload?.parts ?? [msg.payload]
  const bodyText = decodeBody(parts)
  const direction: 'inbound' | 'outbound' = isInternal(fromEmail) ? 'outbound' : 'inbound'

  // Identify the primary external (non-TRS) contact for this thread
  const toList  = parseAddresses(toRaw)
  const ccList  = parseAddresses(ccRaw)
  const allParticipants = [{ email: fromEmail, name: fromName }, ...toList, ...ccList]
  const externalParty   = allParticipants.find(p => !isInternal(p.email) && !isAutomated(p.email))

  // If no external party in headers, check forwarded message body.
  // Use decodeFullText (which reads all MIME parts incl. nested message/rfc822) so that
  // Outlook-style forwards where the original email is an embedded attachment are handled.
  let resolvedParty = externalParty
  if (!resolvedParty && isInternal(fromEmail)) {
    const fullText  = decodeFullText(parts)
    const forwarded = parseForwardedSender(fullText)
    if (forwarded && !isInternal(forwarded.email) && !isAutomated(forwarded.email)) {
      resolvedParty = forwarded
      console.log('[ingest] resolved external from forwarded body:', forwarded.email)
    }
  }

  // If no external party found but sender is an internal TRS employee, still store the thread
  // so ops team can see it. This covers internal forwards (e.g. FlyORO doc chain) where the
  // original client email is buried in a format we can't yet parse.
  if (!resolvedParty) {
    if (isInternal(fromEmail)) {
      console.log('[ingest] no external party found for internal forward — storing with null contact:', gmailMsgId)
    } else {
      console.log('[ingest] skip — no external party and sender is not internal:', gmailMsgId)
      return
    }
  }

  console.log('[ingest]', gmailMsgId, '|', direction, '|', resolvedParty?.email ?? 'no-contact')

  // 1. Upsert primary external contact (skip if no party resolved)
  let contactId: string | null = null
  if (resolvedParty) {
    const { first_name: pFirst, last_name: pLast } = splitDisplayName(resolvedParty.name)
    const primaryBody: Record<string, unknown> = { email: resolvedParty.email, source: 'email' }
    if (pFirst) primaryBody.first_name = pFirst
    if (pLast)  primaryBody.last_name  = pLast
    const contactUpsert = await fetch(`${SB_URL}/rest/v1/contacts?on_conflict=email`, {
      method:  'POST',
      headers: sbHeaders('return=minimal,resolution=merge-duplicates'),
      body:    JSON.stringify(primaryBody),
    })
    if (!contactUpsert.ok) console.error('[ingest] contact upsert failed:', await contactUpsert.text())
    const contactFetch = await fetch(
      `${SB_URL}/rest/v1/contacts?email=eq.${encodeURIComponent(resolvedParty.email)}&select=id,company,engagement_stage&limit=1`,
      { headers: sbHeaders() }
    )
    const contactFetchRows = contactFetch.ok ? await contactFetch.json() : []
    const existingContact  = Array.isArray(contactFetchRows) ? contactFetchRows[0] : null
    contactId = existingContact?.id ?? null

    // Promote to 'engaged' if contact is new or still at prospect stage
    if (contactId) {
      const stage = existingContact?.engagement_stage
      if (!stage || stage === 'prospect') {
        await fetch(`${SB_URL}/rest/v1/contacts?id=eq.${contactId}`, {
          method:  'PATCH',
          headers: sbHeaders('return=minimal'),
          body:    JSON.stringify({ engagement_stage: 'engaged' }),
        }).catch(() => {})
      }
    }

    if (contactId && !existingContact?.company) {
      const inferred = inferCompanyFromEmail(resolvedParty.email)
      if (inferred) {
        await fetch(`${SB_URL}/rest/v1/contacts?id=eq.${contactId}`, {
          method:  'PATCH',
          headers: sbHeaders('return=minimal'),
          body:    JSON.stringify({ company: inferred }),
        })
      }
    }
  }

  // 2. Upsert thread linked to external contact
  const threadUpsert = await fetch(`${SB_URL}/rest/v1/email_threads?on_conflict=gmail_thread_id`, {
    method:  'POST',
    headers: sbHeaders('return=representation,resolution=merge-duplicates'),
    body:    JSON.stringify({
      gmail_thread_id: gmailThreadId,
      subject,
      snippet:         bodyText.slice(0, 200),
      last_message_at: sentAt,
      status:          'active',
      contact_id:      contactId,
    }),
  })
  if (!threadUpsert.ok) { console.error('[ingest] thread upsert failed:', await threadUpsert.text()); return }
  const threadRows = await threadUpsert.json()
  const thread     = Array.isArray(threadRows) ? threadRows[0] : threadRows
  if (!thread?.id) { console.error('[ingest] thread has no id'); return }

  // Ensure contact_id is set (merge-duplicates may have returned the old row without it)
  if (contactId && !thread.contact_id) {
    await fetch(`${SB_URL}/rest/v1/email_threads?id=eq.${thread.id}`, {
      method:  'PATCH',
      headers: sbHeaders('return=minimal'),
      body:    JSON.stringify({ contact_id: contactId }),
    })
  }

  // 3. Insert message (ON CONFLICT ignore = safe to re-run, returns empty if duplicate)
  const msgInsert = await fetch(`${SB_URL}/rest/v1/email_messages?on_conflict=gmail_message_id`, {
    method:  'POST',
    headers: sbHeaders('return=representation,resolution=ignore-duplicates'),
    body:    JSON.stringify({
      thread_id:        thread.id,
      gmail_message_id: gmailMsgId,
      direction,
      from_address:     fromEmail,
      subject,
      body_text:        bodyText,
      sent_at:          sentAt,
      has_attachments:  (msg.payload?.parts ?? []).some((p: { filename?: string }) => p.filename && p.filename.length > 0),
    }),
  })
  if (!msgInsert.ok) { console.error('[ingest] message insert failed:', await msgInsert.text()); return }
  const msgRows = await msgInsert.json()
  const dbMsg   = Array.isArray(msgRows) ? msgRows[0] : msgRows
  if (!dbMsg?.id) return // already existed — no need to re-insert participants

  // 4. Insert participants (ON CONFLICT DO NOTHING via unique constraint)
  type P = { thread_id: string; message_id: string; email: string; name: string | null; role: string; contact_id: string | null }
  const participants: P[] = [
    { thread_id: thread.id, message_id: dbMsg.id, email: fromEmail, name: fromName, role: 'from',
      contact_id: !isInternal(fromEmail) ? contactId : null },
    ...toList.map(({ email, name }) => ({
      thread_id: thread.id, message_id: dbMsg.id, email, name, role: 'to',
      contact_id: resolvedParty && email === resolvedParty.email ? contactId : null,
    })),
    ...ccList.map(({ email, name }) => ({
      thread_id: thread.id, message_id: dbMsg.id, email, name, role: 'cc',
      contact_id: resolvedParty && email === resolvedParty.email ? contactId : null,
    })),
  ]
  await fetch(`${SB_URL}/rest/v1/email_participants?on_conflict=message_id,email,role`, {
    method:  'POST',
    headers: sbHeaders('return=minimal,resolution=ignore-duplicates'),
    body:    JSON.stringify(participants),
  })

  // 5. Upsert contacts for all other external participants (To + CC header addresses)
  const otherExternal = allParticipants.filter(
    p => resolvedParty?.email !== p.email && !isInternal(p.email) && !isAutomated(p.email)
  )
  await Promise.allSettled(otherExternal.map(async p => {
    const { first_name, last_name } = splitDisplayName(p.name)
    const body: Record<string, unknown> = { email: p.email, source: 'email' }
    if (first_name) body.first_name = first_name
    if (last_name)  body.last_name  = last_name
    const inferredCo = inferCompanyFromEmail(p.email)
    if (inferredCo)  body.company   = inferredCo
    const res = await fetch(`${SB_URL}/rest/v1/contacts?on_conflict=email`, {
      method:  'POST',
      headers: sbHeaders('return=minimal,resolution=merge-duplicates'),
      body:    JSON.stringify(body),
    })
    if (!res.ok) console.error('[ingest] cc contact upsert failed for', p.email, ':', await res.text())
  }))

  // 5b. Capture external participants buried in forwarded email bodies (To: / Cc: lines).
  //     For internal forwards (Nathan, Catherine) the full body contains the original
  //     email chain — extract every external address so they all land in contacts.
  if (isInternal(fromEmail)) {
    const fullText   = decodeFullText(parts)
    const bodyEmails = extractForwardedParticipants(fullText)
    const alreadySeen = new Set([
      fromEmail,
      ...(resolvedParty ? [resolvedParty.email] : []),
      ...allParticipants.map(p => p.email.toLowerCase()),
    ])
    const newExternals = bodyEmails.filter(e => !alreadySeen.has(e))
    if (newExternals.length > 0) {
      console.log('[ingest] capturing', newExternals.length, 'forwarded-body participant(s):', newExternals)
      await Promise.allSettled(newExternals.map(async email => {
        const inferred: Record<string, unknown> = { email, source: 'email' }
        const co = inferCompanyFromEmail(email)
        if (co) inferred.company = co
        await fetch(`${SB_URL}/rest/v1/contacts?on_conflict=email`, {
          method:  'POST',
          headers: sbHeaders('return=minimal,resolution=merge-duplicates'),
          body:    JSON.stringify(inferred),
        })
      }))
    }
  }

  // 6. Trigger AI analysis + draft reply for inbound messages only
  if (direction === 'inbound') {
    // Tag thread with campaign context if sender is an outbound campaign lead (non-blocking)
    if (resolvedParty && !isInternal(fromEmail)) {
      tagThreadWithCampaignContext(fromEmail, thread.id).catch(() => {})
    }
    // Call auto-summarize as a separate serverless function so it gets its own
    // independent maxDuration (300s) rather than sharing this function's budget.
    waitUntil(
      fetch(`${origin}/api/engagement/auto-summarize`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET ?? '' },
        body:    JSON.stringify({ thread_id: thread.id, message_id: dbMsg.id }),
      })
        .then(r => { if (!r.ok) console.warn('[ingest] auto-summarize returned', r.status, 'for thread', thread.id) })
        .catch(e => console.error('[ingest] auto-summarize trigger failed:', e instanceof Error ? e.message : e))
    )
  }
}

// GET /api/email/ingest — manual trigger / Vercel cron polling fallback
// Auth: ?token=GMAIL_PUBSUB_VERIFICATION_TOKEN  OR  Authorization: Bearer CRON_SECRET
// Optional: ?window=60 → pull last N minutes instead of History API (used by Refresh button)
export async function GET(req: NextRequest) {
  const tokenParam  = req.nextUrl.searchParams.get('token')
  const bearerMatch = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (tokenParam !== process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN && !bearerMatch) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const windowMinutes = parseInt(req.nextUrl.searchParams.get('window') ?? '0', 10)
  const host   = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000'
  const origin = host.startsWith('localhost') ? `http://${host}` : `https://${host}`
  try {
    const token      = await getAccessToken()
    const messageIds = windowMinutes > 0
      ? await getRecentMessageIds(token, windowMinutes)
      : await getNewMessageIds(token)
    console.log('[ingest:manual] processing', messageIds.length, 'message(s)')
    const results = await Promise.allSettled(messageIds.map(id => ingestMessage(token, id, origin)))
    const ok  = results.filter(r => r.status === 'fulfilled').length
    const err = results.filter(r => r.status === 'rejected').length
    return NextResponse.json({ ok: true, processed: messageIds.length, succeeded: ok, failed: err })
  } catch (e) {
    console.error('[ingest:manual] FATAL:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/email/ingest — receives Gmail Pub/Sub push notifications
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('token') ?? req.headers.get('x-pubsub-secret')
  if (secret !== process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { message?: { data?: string } }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const rawData = body?.message?.data
  if (!rawData) return NextResponse.json({ ok: true })

  let notification: { historyId?: string }
  try { notification = JSON.parse(Buffer.from(rawData, 'base64').toString('utf-8')) }
  catch { return NextResponse.json({ error: 'Bad payload' }, { status: 400 }) }

  const { historyId } = notification
  if (!historyId) return NextResponse.json({ ok: true })

  const host   = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000'
  const origin = host.startsWith('localhost') ? `http://${host}` : `https://${host}`

  try {
    const token      = await getAccessToken()
    const messageIds = await getNewMessageIds(token)
    console.log('[ingest] processing', messageIds.length, 'message(s)')

    // Process each new message
    await Promise.allSettled(messageIds.map(id => ingestMessage(token, id, origin)))

    // Persist new historyId so next webhook only fetches newer messages
    await saveHistoryId(historyId)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[ingest] FATAL:', e)
    return NextResponse.json({ ok: true }) // always ack Pub/Sub
  }
}
