import { NextRequest, NextResponse } from 'next/server'
import { waitUntil }                  from '@vercel/functions'
import { createSign, randomUUID }     from 'node:crypto'
import { runDraftEvaluation }         from '@/lib/run-draft-evaluation'
import { logActivity }                from '@/lib/log-activity'
import { createClient }               from '@/lib/supabase/server'
import { buildQuotedHistory, buildReferences, type ThreadMessage } from '@/lib/build-reply-thread'
import { buildRawEmail, htmlToText, type EmailAttachment, type ThreadingHeaders } from '@/lib/email-mime'

const SB_URL    = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const DEFAULT_OPS_EMAIL = 'operations@trade-risksol.com'

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

// ── Service-account impersonation (shared mailboxes) ──────────────────────────
// Signs a JWT and exchanges it for a short-lived access token that lets the
// service account send as any @trade-risksol.com address (domain-wide delegation).
function makeServiceAccountJWT(clientEmail: string, privateKey: string, subject: string): string {
  const now    = Math.floor(Date.now() / 1000)
  const header  = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss:   clientEmail,
    sub:   subject,
    scope: 'https://www.googleapis.com/auth/gmail.send',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }
  const enc   = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const input = `${enc(header)}.${enc(payload)}`
  const sign  = createSign('RSA-SHA256')
  sign.update(input)
  return `${input}.${sign.sign(privateKey, 'base64url')}`
}

async function getTokenViaServiceAccount(fromEmail: string): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')
  const sa: { client_email: string; private_key: string } = JSON.parse(raw)
  // Env vars sometimes escape newlines — normalise them
  const privateKey = sa.private_key.replace(/\\n/g, '\n')
  const jwt = makeServiceAccountJWT(sa.client_email, privateKey, fromEmail)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Service account token failed: ${JSON.stringify(data)}`)
  return data.access_token as string
}

// Legacy fallback — used only if GOOGLE_SERVICE_ACCOUNT_JSON is not set
async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
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

// Returns a Gmail access token for the given fromEmail:
// 1. Employee's personal Gmail (token in employee_profiles) → use their refresh token
// 2. Shared/generic address → use service account impersonation
// 3. Fallback → legacy shared GMAIL_REFRESH_TOKEN
const SHARED_SENDERS = new Set([DEFAULT_OPS_EMAIL.toLowerCase()])

async function getTokenForSender(fromEmail: string, userId: string | null): Promise<string> {
  const wantEmail = fromEmail.trim().toLowerCase()

  // 1. Personal Gmail — the logged-in employee sending as their own connected address.
  //    Match case-insensitively: userinfo/stored casing may differ from the From value
  //    passed by the composer (this was the "can't send via employee email" bug).
  let hasConnectedProfile = false
  if (userId) {
    try {
      const k = process.env.SUPABASE_SERVICE_KEY
      if (k) {
        const profileRes = await fetch(
          `${SB_URL}/rest/v1/employee_profiles?user_id=eq.${userId}&select=gmail_email,gmail_refresh_token&limit=1`,
          { headers: { apikey: k, Authorization: `Bearer ${k}` }, cache: 'no-store' }
        )
        const profiles = profileRes.ok ? await profileRes.json() : []
        const profile  = Array.isArray(profiles) ? profiles[0] : null
        const profileEmail = (profile?.gmail_email ?? '').trim().toLowerCase()
        hasConnectedProfile = !!profile?.gmail_refresh_token
        // Use the personal token when the connected address matches the sender, OR when
        // the stored address is blank (older connections made before we captured the
        // userinfo.email scope) and the sender isn't a shared mailbox — the user's own
        // token can only send as their own address anyway, so Gmail validates identity.
        const personalMatch = !!profile?.gmail_refresh_token &&
          (profileEmail === wantEmail || (!profileEmail && !SHARED_SENDERS.has(wantEmail)))
        if (personalMatch) {
          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id:     process.env.GMAIL_CLIENT_ID!,
              client_secret: process.env.GMAIL_CLIENT_SECRET!,
              refresh_token: profile.gmail_refresh_token as string,
              grant_type:    'refresh_token',
            }),
          })
          const tokenData = await tokenRes.json()
          if (tokenData.access_token) return tokenData.access_token as string
          // We matched the sender but the refresh failed — don't silently fall back to a
          // token that would send as the wrong identity. Tell the user to reconnect.
          throw new Error('Your Gmail connection has expired — reconnect it in Settings › Account to send from your own address.')
        }
      }
    } catch (e) {
      // Re-throw the actionable reconnect message; swallow only lookup/network noise.
      if (e instanceof Error && e.message.startsWith('Your Gmail connection')) throw e
    }
  }

  // 2. Personal (non-shared) address that the current user hasn't connected → we cannot
  //    legitimately send as them without domain-wide delegation. Fail with a clear message
  //    rather than silently sending as ops@ (which Gmail would rewrite or reject).
  const isSharedSender = SHARED_SENDERS.has(wantEmail)
  if (!isSharedSender && !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error(
      hasConnectedProfile
        ? `You're logged in with a different Gmail than ${fromEmail}. Select your own address in "From", or connect ${fromEmail} in Settings › Account.`
        : `Connect your Gmail in Settings › Account to send from ${fromEmail}.`
    )
  }

  // 3. Service account (domain-wide delegation) — shared/generic senders, or personal
  //    senders when DWD is configured.
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return getTokenViaServiceAccount(fromEmail)
  }
  // 4. Legacy shared token (ops mailbox).
  return getAccessToken()
}

// Derives a display name from an email local-part: "jarod.hong" → "Jarod Hong"
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  return local.split(/[._-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || email
}

type Signature = {
  id: string; name: string; title: string | null; phone: string | null
  email: string | null; company_tagline: string | null
}

function buildSignatureHtml(sig: Signature): string {
  return [
    '<br>',
    '<hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb">',
    `<p style="margin:0;font-size:13px;color:#1e3a5f;font-weight:600">${sig.name}</p>`,
    sig.title           ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${sig.title}</p>` : '',
    sig.phone           ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${sig.phone}</p>` : '',
    sig.email           ? `<p style="margin:4px 0 0;font-size:12px;color:#666"><a href="mailto:${sig.email}" style="color:#1d4ed8;text-decoration:none">${sig.email}</a></p>` : '',
    sig.company_tagline ? `<p style="margin:4px 0 0;font-size:12px;color:#999">${sig.company_tagline}</p>` : '<p style="margin:4px 0 0;font-size:12px;color:#999">Trade Risk Solutions</p>',
  ].filter(Boolean).join('\n')
}

function buildSignatureText(sig: Signature): string {
  return [
    '',
    '--',
    sig.name,
    sig.title           ?? '',
    sig.phone           ?? '',
    sig.email           ?? '',
    sig.company_tagline ?? 'Trade Risk Solutions',
  ].filter((l, i) => i < 2 || l).join('\n')
}

// POST /api/email/send
// Body: { draftId, htmlBody?, signatureId?, cc?, bcc?, customSubject?, replyTo?, fromEmail? }
// fromEmail selects which sender address to use. If the logged-in employee has connected
// their own Gmail and fromEmail matches, their token is used. Otherwise falls back to ops@.
export async function POST(req: NextRequest) {
  try {
    const { draftId, htmlBody, signatureId, toEmail, cc, bcc, customSubject, fromEmail: requestedFrom, originalAiBody, attachments: attachmentRefs } =
      await req.json() as { draftId: string; htmlBody?: string; signatureId?: string; toEmail?: string; cc?: string[]; bcc?: string[]; customSubject?: string; fromEmail?: string; originalAiBody?: string; attachments?: { filename: string; mime_type?: string; storage_url: string }[] }
    if (!draftId) return NextResponse.json({ error: 'draftId required' }, { status: 400 })

    // Identify the logged-in employee so we can use their Gmail token if they've connected one.
    // This used to be optional (userId just fell through to null and the send went out as ops@
    // regardless) — meaning an unauthenticated caller could trigger a real Gmail send. Now hard-gated.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const userId = user.id

    const FROM_EMAIL = (requestedFrom && requestedFrom.includes('@')) ? requestedFrom : DEFAULT_OPS_EMAIL

    // 1. Load the draft + contact email
    const draftRes = await fetch(
      `${SB_URL}/rest/v1/ai_drafts?id=eq.${draftId}&select=*&limit=1`,
      { headers: sbHeaders() }
    )
    const drafts = draftRes.ok ? await draftRes.json() : []
    const draft  = Array.isArray(drafts) ? drafts[0] : null
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    if (draft.status === 'sent') return NextResponse.json({ error: 'Already sent' }, { status: 409 })
    if (draft.channel !== 'email') return NextResponse.json({ error: 'Not an email draft' }, { status: 400 })

    // 2. Load recipient email from contacts
    const contactRes = await fetch(
      `${SB_URL}/rest/v1/contacts?id=eq.${draft.contact_id}&select=email&limit=1`,
      { headers: sbHeaders() }
    )
    const contacts = contactRes.ok ? await contactRes.json() : []
    const contact  = Array.isArray(contacts) ? contacts[0] : null
    if (!contact?.email) return NextResponse.json({ error: 'Contact has no email' }, { status: 400 })

    // Use the overridden TO address if provided, otherwise fall back to the contact's email
    const recipientEmail = (toEmail && toEmail.includes('@')) ? toEmail.trim().toLowerCase() : contact.email as string

    // 3. Load thread subject (for reply subject line) + conversation grouping context
    let subject = 'Re: Your enquiry | Trade Risk Solutions'
    let gmailThreadId: string | null = null
    // Party fork: when the To isn't already part of this conversation, the send starts a NEW
    // linked sub-thread to that party (e.g. emailing the employee about a client's claim)
    // instead of replying into the client thread.
    let forking = false
    let conversationRoot: string | null = null
    if (draft.thread_id) {
      const threadRes = await fetch(
        `${SB_URL}/rest/v1/email_threads?id=eq.${draft.thread_id}&select=subject,gmail_thread_id,conversation_root_id&limit=1`,
        { headers: sbHeaders() }
      )
      const threads = threadRes.ok ? await threadRes.json() : []
      const thread  = Array.isArray(threads) ? threads[0] : null
      if (thread?.subject) subject = thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`
      if (customSubject?.trim()) subject = customSubject.trim()
      gmailThreadId    = thread?.gmail_thread_id ?? null
      conversationRoot = thread?.conversation_root_id ?? draft.thread_id

      // Is the recipient already a party in this conversation? Collect participants + thread
      // contacts across every thread in the group; if the (external) recipient is absent, this
      // send forks a new party sub-thread linked to the conversation root.
      const rEmail = recipientEmail.toLowerCase()
      if (!rEmail.endsWith('@trade-risksol.com')) {
        const groupRes = await fetch(
          `${SB_URL}/rest/v1/email_threads?or=(id.eq.${conversationRoot},conversation_root_id.eq.${conversationRoot})&deleted_at=is.null&select=id,contact_id`,
          { headers: sbHeaders(), cache: 'no-store' }
        )
        const groupThreads: { id: string; contact_id: string | null }[] = groupRes.ok ? await groupRes.json() : []
        const groupIds   = groupThreads.map(t => t.id)
        const contactIds = Array.from(new Set(groupThreads.map(t => t.contact_id).filter((x): x is string => !!x)))
        const [pRes, cRes] = await Promise.all([
          groupIds.length
            ? fetch(`${SB_URL}/rest/v1/email_participants?thread_id=in.(${groupIds.join(',')})&select=email`, { headers: sbHeaders(), cache: 'no-store' })
            : Promise.resolve(null),
          contactIds.length
            ? fetch(`${SB_URL}/rest/v1/contacts?id=in.(${contactIds.join(',')})&select=email`, { headers: sbHeaders(), cache: 'no-store' })
            : Promise.resolve(null),
        ])
        const parts:        { email: string | null }[] = pRes && pRes.ok ? await pRes.json() : []
        const convContacts: { email: string | null }[] = cRes && cRes.ok ? await cRes.json() : []
        const known = new Set<string>()
        for (const p of parts)        if (p.email) known.add(p.email.toLowerCase())
        for (const c of convContacts) if (c.email) known.add(c.email.toLowerCase())
        forking = !known.has(rEmail)
      }
    }

    // 4. Load signature and build final bodies
    let finalHtml = htmlBody ?? null
    let finalPlain = draft.body
    if (signatureId) {
      const sigRes = await fetch(
        `${SB_URL}/rest/v1/user_signatures?id=eq.${signatureId}&select=id,name,title,phone,email,company_tagline&limit=1`,
        { headers: sbHeaders() }
      )
      const sigs: Signature[] = sigRes.ok ? await sigRes.json() : []
      const sig = sigs[0] ?? null
      if (sig) {
        if (finalHtml) finalHtml = finalHtml + buildSignatureHtml(sig)
        finalPlain = finalPlain + buildSignatureText(sig)
      }
    }

    // 4b. Append the quoted conversation history + build threading headers.
    //     Every reply on an existing thread now carries the prior chain below the signature
    //     (Gmail-style, de-duplicated) and In-Reply-To/References so it threads in the
    //     recipient's client. We self-assign a Message-ID so the chain stays continuous.
    const ourMessageId = `<${randomUUID()}@trade-risksol.com>`
    const threading: ThreadingHeaders = { messageId: ourMessageId }
    // A fork starts a fresh conversation with a new party — no prior history to quote and no
    // In-Reply-To/References (it's a new thread, not a reply into the client chain).
    if (draft.thread_id && !forking) {
      const [priorRes, partRes] = await Promise.all([
        fetch(
          `${SB_URL}/rest/v1/email_messages?thread_id=eq.${draft.thread_id}&select=from_address,sent_at,body_text,body_html,rfc822_message_id&order=sent_at.asc`,
          { headers: sbHeaders(), cache: 'no-store' }
        ),
        fetch(
          `${SB_URL}/rest/v1/email_participants?thread_id=eq.${draft.thread_id}&role=eq.from&select=email,name`,
          { headers: sbHeaders(), cache: 'no-store' }
        ),
      ])
      const priorRows: ThreadMessage[] = priorRes.ok ? await priorRes.json() : []
      const partRows: { email: string; name: string | null }[] = partRes.ok ? await partRes.json() : []
      // Map sender email → display name for the "On <date>, <Name> wrote:" attribution.
      const nameByEmail = new Map(partRows.filter(p => p.name?.trim()).map(p => [p.email.toLowerCase(), p.name!.trim()]))
      const priorMessages: ThreadMessage[] = priorRows.map(m => ({
        ...m,
        from_name: m.from_address ? nameByEmail.get(m.from_address.toLowerCase()) ?? null : null,
      }))

      if (priorMessages.length > 0) {
        const quote = buildQuotedHistory(priorMessages)
        if (quote.html && finalHtml) finalHtml = `${finalHtml}<br><br>${quote.html}`
        if (quote.text)              finalPlain = `${finalPlain}\n\n${quote.text}`
        const refs = buildReferences(priorMessages)
        threading.inReplyTo  = refs.inReplyTo
        threading.references = refs.references
      }
    }

    // 5. Send via Gmail API — use the employee's personal token if they've connected their Gmail,
    //    otherwise fall back to the shared ops@ token.
    const token    = await getTokenForSender(FROM_EMAIL, userId)

    // Download any selected attachments from Supabase Storage → base64 for the MIME envelope.
    let emailAttachments: EmailAttachment[] = []
    if (Array.isArray(attachmentRefs) && attachmentRefs.length > 0) {
      const svcKey = process.env.SUPABASE_SERVICE_KEY
      emailAttachments = (await Promise.all(attachmentRefs.slice(0, 10).map(async ref => {
        try {
          if (!ref.storage_url) return null
          // storage_url is either a full URL or a bare path in the private email-attachments
          // bucket — the latter needs the service key to fetch. (This also fixes RFQ forwards,
          // which pass bare paths.)
          const r = ref.storage_url.startsWith('http')
            ? await fetch(ref.storage_url)
            : await fetch(`${SB_URL}/storage/v1/object/email-attachments/${ref.storage_url}`,
                { headers: svcKey ? { apikey: svcKey, Authorization: `Bearer ${svcKey}` } : undefined })
          if (!r.ok) return null
          const buf = Buffer.from(await r.arrayBuffer())
          return { filename: ref.filename, mimeType: ref.mime_type || 'application/octet-stream', dataB64: buf.toString('base64') }
        } catch { return null }
      }))).filter((a): a is EmailAttachment => a !== null)
    }

    // Belt-and-braces: a bad address here (e.g. a bare display-name string like "Soon Teng" that
    // slipped in from an older auto-populated Reply-All list, before this got filtered upstream)
    // makes Gmail's API reject the ENTIRE send with "Invalid Cc header" — better to silently drop
    // the one bad entry than fail the whole message over it.
    const isValidEmail = (a: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.trim())
    const cleanCc  = (cc ?? []).filter(isValidEmail)
    const cleanBcc = (bcc ?? []).filter(isValidEmail)

    // Every non-ops send CC's operations@ so the shared mailbox (Engagement)
    // captures it — a thread appears there whoever sent it.
    const isOpsSender = FROM_EMAIL.toLowerCase() === DEFAULT_OPS_EMAIL.toLowerCase()
    const finalCc = [...cleanCc]
    if (!isOpsSender && !finalCc.some(c => c.toLowerCase() === DEFAULT_OPS_EMAIL.toLowerCase())) finalCc.push(DEFAULT_OPS_EMAIL)
    // Personal sends also Reply-To operations@ so the recipient's reply routes back
    // to the shared mailbox (Engagement) rather than the employee's personal inbox.
    const replyTo = isOpsSender ? undefined : DEFAULT_OPS_EMAIL

    const rawEmail = buildRawEmail(recipientEmail, subject, finalPlain, finalHtml, finalCc, cleanBcc, replyTo, FROM_EMAIL, emailAttachments, threading)

    const sendPayload: Record<string, unknown> = { raw: rawEmail }
    // A Gmail threadId is mailbox-specific. It belongs to the shared ops mailbox that
    // ingested the thread — attaching it to a send from a personal mailbox makes Gmail
    // reject the whole request ("Requested entity was not found"). So only thread the
    // send when we're actually sending as the ops mailbox. Personal sends go out as a
    // fresh message (subject "Re:" keeps it grouped; Reply-To routes replies back to ops).
    // Don't thread a fork into the client's Gmail thread — it must go out as a new thread so
    // the new party's replies stay in their own sub-thread.
    if (gmailThreadId && isOpsSender && !forking) sendPayload.threadId = gmailThreadId

    const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(sendPayload),
    })

    if (!sendRes.ok) {
      const err = await sendRes.text()
      // Log the full Gmail error — the UI truncates it, and the payload/sender context
      // is what actually diagnoses these (scope, invalid From, cross-mailbox threadId).
      console.error('[email/send] Gmail send failed', {
        from: FROM_EMAIL, to: recipientEmail, isOpsSender,
        threadedSend: !!sendPayload.threadId, status: sendRes.status, gmailError: err,
      })
      return NextResponse.json({ error: `Gmail send failed: ${err}` }, { status: 502 })
    }

    const sent = await sendRes.json()
    const sentAt = new Date().toISOString()

    // Gmail may rewrite a caller-supplied Message-ID. Read back the authoritative one so the
    // value we persist matches what the recipient's reply will reference — otherwise the
    // References chain would break on the next round-trip. Falls back to ours on failure.
    let storedMessageId = ourMessageId
    if (sent.id) {
      try {
        const mRes = await fetch(`${GMAIL_API}/messages/${sent.id}?format=metadata&metadataHeaders=Message-ID`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (mRes.ok) {
          const meta = await mRes.json()
          const hdr  = (meta.payload?.headers ?? []).find((h: { name: string }) => h.name.toLowerCase() === 'message-id')
          if (hdr?.value) storedMessageId = hdr.value
        }
      } catch { /* keep ourMessageId */ }
    }

    // 6. Mark draft as sent
    await fetch(`${SB_URL}/rest/v1/ai_drafts?id=eq.${draftId}`, {
      method:  'PATCH',
      headers: sbHeaders('return=minimal'),
      body:    JSON.stringify({ status: 'sent', sent_at: sentAt }),
    })

    // The plain-text body of what was actually sent (signature stripped for cleaner eval comparison)
    const sentBodyPlain = finalHtml ? htmlToText(finalHtml) : finalPlain

    // 7. Record outbound message in email_messages (into the existing thread — but not for a
    //    fork, which records into its own new sub-thread in 7c below)
    if (draft.thread_id && sent.id && !forking) {
      await fetch(`${SB_URL}/rest/v1/email_messages`, {
        method:  'POST',
        headers: sbHeaders('return=minimal'),
        body: JSON.stringify({
          thread_id:         draft.thread_id,
          gmail_message_id:  sent.id,
          rfc822_message_id: storedMessageId,
          direction:         'outbound',
          from_address:      FROM_EMAIL,
          subject,
          body_text:         sentBodyPlain,
          sent_at:           sentAt,
          has_attachments:   false,
        }),
      })

      // Update thread last_message_at
      await fetch(`${SB_URL}/rest/v1/email_threads?id=eq.${draft.thread_id}`, {
        method:  'PATCH',
        headers: sbHeaders('return=minimal'),
        body:    JSON.stringify({ last_message_at: sentAt }),
      })
    }

    // 7b. Thread-less send from ops (e.g. RFQ) → create the Engagement thread now
    //     so it appears instantly. Ingestion later dedups by gmail_message_id.
    //     Personal-mailbox sends appear on the next ops sync (per decision).
    if (!draft.thread_id && isOpsSender && sent.threadId && sent.id) {
      try {
        // Resolve/create the recipient contact so the thread reads as the insurer.
        const enc = encodeURIComponent(recipientEmail)
        let recipientContactId: string | null = await fetch(`${SB_URL}/rest/v1/contacts?email=eq.${enc}&select=id&limit=1`, { headers: sbHeaders(), cache: 'no-store' })
          .then(r => r.ok ? r.json() : []).then(rows => rows[0]?.id ?? null).catch(() => null)
        if (!recipientContactId) {
          recipientContactId = await fetch(`${SB_URL}/rest/v1/contacts?on_conflict=email`, {
            method: 'POST', headers: sbHeaders('return=representation,resolution=merge-duplicates'),
            body: JSON.stringify({ email: recipientEmail, source: 'email' }),
          }).then(r => r.ok ? r.json() : []).then(rows => (Array.isArray(rows) ? rows[0]?.id : null) ?? null).catch(() => null)
        }

        const tRes = await fetch(`${SB_URL}/rest/v1/email_threads?on_conflict=gmail_thread_id`, {
          method: 'POST', headers: sbHeaders('return=representation,resolution=merge-duplicates'),
          body: JSON.stringify({ gmail_thread_id: sent.threadId, subject, contact_id: recipientContactId, snippet: sentBodyPlain.slice(0, 140), last_message_at: sentAt }),
        })
        const newThread = tRes.ok ? (await tRes.json())[0] : null
        if (newThread?.id) {
          await fetch(`${SB_URL}/rest/v1/email_messages?on_conflict=gmail_message_id`, {
            method: 'POST', headers: sbHeaders('return=minimal,resolution=merge-duplicates'),
            body: JSON.stringify({ thread_id: newThread.id, gmail_message_id: sent.id, rfc822_message_id: storedMessageId, direction: 'outbound', from_address: FROM_EMAIL, subject, body_text: sentBodyPlain, sent_at: sentAt, has_attachments: emailAttachments.length > 0 }),
          }).catch(() => {})
        }
      } catch { /* best-effort — ingestion is the safety net */ }
    }

    // 7c. Party fork from ops → create the new linked sub-thread now, tagged to the conversation
    //     root so it shows in the party switcher immediately. (Personal-sender forks link on the
    //     next ops sync via ingest; conversation_root_id is preserved by merge-duplicates.)
    if (forking && conversationRoot && isOpsSender && sent.threadId && sent.id) {
      try {
        const enc = encodeURIComponent(recipientEmail)
        let recipientContactId: string | null = await fetch(`${SB_URL}/rest/v1/contacts?email=eq.${enc}&select=id&limit=1`, { headers: sbHeaders(), cache: 'no-store' })
          .then(r => r.ok ? r.json() : []).then(rows => rows[0]?.id ?? null).catch(() => null)
        if (!recipientContactId) {
          recipientContactId = await fetch(`${SB_URL}/rest/v1/contacts?on_conflict=email`, {
            method: 'POST', headers: sbHeaders('return=representation,resolution=merge-duplicates'),
            body: JSON.stringify({ email: recipientEmail, source: 'email' }),
          }).then(r => r.ok ? r.json() : []).then(rows => (Array.isArray(rows) ? rows[0]?.id : null) ?? null).catch(() => null)
        }

        const tRes = await fetch(`${SB_URL}/rest/v1/email_threads?on_conflict=gmail_thread_id`, {
          method: 'POST', headers: sbHeaders('return=representation,resolution=merge-duplicates'),
          body: JSON.stringify({ gmail_thread_id: sent.threadId, subject, contact_id: recipientContactId, conversation_root_id: conversationRoot, snippet: sentBodyPlain.slice(0, 140), last_message_at: sentAt }),
        })
        const forkThread = tRes.ok ? (await tRes.json())[0] : null
        if (forkThread?.id) {
          await fetch(`${SB_URL}/rest/v1/email_messages?on_conflict=gmail_message_id`, {
            method: 'POST', headers: sbHeaders('return=minimal,resolution=merge-duplicates'),
            body: JSON.stringify({ thread_id: forkThread.id, gmail_message_id: sent.id, rfc822_message_id: storedMessageId, direction: 'outbound', from_address: FROM_EMAIL, subject, body_text: sentBodyPlain, sent_at: sentAt, has_attachments: emailAttachments.length > 0 }),
          }).catch(() => {})
        }
      } catch { /* best-effort — ingestion is the safety net */ }
    }

    // If TO was overridden to a different external email, ensure it exists as a contact
    const contactEmail = contact.email as string
    if (recipientEmail !== contactEmail.toLowerCase() && !recipientEmail.endsWith('@trade-risksol.com')) {
      const encoded = encodeURIComponent(recipientEmail)
      const existsRes = await fetch(
        `${SB_URL}/rest/v1/contacts?email=ilike.${encoded}&select=id&limit=1`,
        { headers: sbHeaders(), cache: 'no-store' }
      )
      const existing = existsRes.ok ? await existsRes.json() : []
      if (!Array.isArray(existing) || existing.length === 0) {
        const nm = nameFromEmail(recipientEmail).split(/\s+/)
        await fetch(`${SB_URL}/rest/v1/contacts`, {
          method:  'POST',
          headers: sbHeaders('return=minimal'),
          body: JSON.stringify({
            first_name:       nm[0] ?? '',
            last_name:        nm.slice(1).join(' '),
            email:            recipientEmail,
            source:           'email',
            engagement_stage: 'engaged',
          }),
        })
      }
    }

    // Log email send server-side — more reliable than client-side logging
    void logActivity({
      action:        'email.sent',
      resource_type: 'thread',
      resource_id:   draft.thread_id ?? undefined,
      lead_email:    recipientEmail,
      new_value: {
        recipient:    recipientEmail,
        subject,
        from_address: FROM_EMAIL,
        gmail_message_id: sent.id,
        draft_id:     draftId,
        chars:        sentBodyPlain.length,
      },
    })

    // Run evaluation after response — waitUntil keeps the function alive on Vercel.
    // Pass sentBodyPlain directly so evaluation never fails due to missing thread_id or
    // a race condition between the email_messages insert and the evaluation read.
    waitUntil(runDraftEvaluation(draftId, draft.thread_id ?? null, sentBodyPlain, originalAiBody))

    return NextResponse.json({ ok: true, gmailMessageId: sent.id, gmailThreadId: sent.threadId ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
