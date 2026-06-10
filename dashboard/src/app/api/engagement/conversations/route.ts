import { NextResponse } from 'next/server'

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const TRS_DOMAIN = 'trade-risksol.com'

const isInternal  = (e: string) => e.toLowerCase().endsWith(`@${TRS_DOMAIN}`)
const isAutomated = (e: string) => {
  const l = e.toLowerCase()
  return l.includes('noreply') || l.includes('no-reply') || l.includes('donotreply') ||
         l.includes('mailer-daemon') || l.includes('postmaster') || l.endsWith('@google.com')
}

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:         k,
    Authorization:  `Bearer ${k}`,
    'Content-Type': 'application/json',
  }
}

// GET /api/engagement/conversations
// Returns one entry per email thread (not per contact).
export async function GET() {
  try {
    // 1. Fetch all threads ordered by last activity
    type CampaignCtx = { campaign_id: string; campaign_name: string; product_type: string; step_replied_to: number | null } | null
    type ThreadRow = { id: string; subject: string | null; snippet: string | null; last_message_at: string; contact_id: string | null; campaign_context: CampaignCtx }
    const threadRes = await fetch(
      `${SB_URL}/rest/v1/email_threads?select=id,subject,snippet,last_message_at,contact_id,campaign_context&order=last_message_at.desc&limit=200`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    const threads: ThreadRow[] = threadRes.ok ? await threadRes.json() : []
    if (!Array.isArray(threads) || threads.length === 0) return NextResponse.json([])

    // 2. Batch-fetch contacts for linked threads
    const contactIds = Array.from(new Set(threads.filter(t => t.contact_id).map(t => t.contact_id!)))
    type ContactRow = { id: string; first_name: string | null; last_name: string | null; email: string | null }
    const contactMap = new Map<string, ContactRow>()
    if (contactIds.length > 0) {
      const cRes = await fetch(
        `${SB_URL}/rest/v1/contacts?id=in.(${contactIds.join(',')})&select=id,first_name,last_name,email`,
        { headers: sbHeaders(), cache: 'no-store' }
      )
      const rows: ContactRow[] = cRes.ok ? await cRes.json() : []
      for (const c of (Array.isArray(rows) ? rows : [])) contactMap.set(c.id, c)
    }

    // 3. For all threads, look up sender email from email_messages as fallback
    //    — includes both inbound AND outbound because forwarded emails are stored as outbound
    const allThreadIds = threads.map(t => t.id)
    const threadSenderMap = new Map<string, string>() // thread_id -> best external email
    if (allThreadIds.length > 0) {
      // Prefer inbound messages first (direct client email)
      const msgRes = await fetch(
        `${SB_URL}/rest/v1/email_messages?thread_id=in.(${allThreadIds.join(',')})&select=thread_id,from_address,direction&order=sent_at.asc`,
        { headers: sbHeaders(), cache: 'no-store' }
      )
      const msgs: { thread_id: string; from_address: string | null; direction: string }[] =
        msgRes.ok ? await msgRes.json() : []
      // First pass: inbound messages
      for (const m of (Array.isArray(msgs) ? msgs : [])) {
        if (m.direction === 'inbound' && !threadSenderMap.has(m.thread_id) &&
            m.from_address && !isInternal(m.from_address) && !isAutomated(m.from_address)) {
          threadSenderMap.set(m.thread_id, m.from_address)
        }
      }
      // Second pass: external participants from email_participants
      const unresolved = allThreadIds.filter(id => !threadSenderMap.has(id))
      if (unresolved.length > 0) {
        const partRes = await fetch(
          `${SB_URL}/rest/v1/email_participants?thread_id=in.(${unresolved.join(',')})&select=thread_id,email&order=thread_id.asc`,
          { headers: sbHeaders(), cache: 'no-store' }
        )
        const parts: { thread_id: string; email: string | null }[] = partRes.ok ? await partRes.json() : []
        for (const p of (Array.isArray(parts) ? parts : [])) {
          if (!threadSenderMap.has(p.thread_id) && p.email &&
              !isInternal(p.email) && !isAutomated(p.email)) {
            threadSenderMap.set(p.thread_id, p.email)
          }
        }
      }
    }

    // 4. Shape one entry per thread
    const result = threads.flatMap(t => {
      const contact = t.contact_id ? contactMap.get(t.contact_id) : null

      // Resolve email: contact record → message/participant lookup → snippet → null
      let email: string | null = null
      const contactEmail = contact?.email ?? null
      if (contactEmail && !isInternal(contactEmail) && !isAutomated(contactEmail)) {
        email = contactEmail
      }
      if (!email) email = threadSenderMap.get(t.id) ?? null

      // Snippet fallback: covers cases where snippet starts with "From: Name <email>"
      if (!email && t.snippet) {
        const m = t.snippet.match(/[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/i)
        const candidate = m?.[0] ?? null
        if (candidate && !isInternal(candidate) && !isAutomated(candidate)) {
          email = candidate
        }
      }

      // Skip only threads that are provably internal-only (spam/system/TRS-internal loops)
      if (email && (isInternal(email) || isAutomated(email))) return []
      // Skip threads with no subject and no snippet (empty/ghost records)
      if (!email && !t.subject && !t.snippet) return []

      return [{
        id:               t.id,
        thread_id:        t.id,
        created_at:       t.last_message_at,
        source:           'email' as const,
        subject:          t.subject,
        snippet:          t.snippet,
        first_name:       contact?.first_name ?? null,
        last_name:        contact?.last_name  ?? null,
        email,
        phone:            null,
        company:          null,
        department:       null,
        contact_type:     null,
        topic:            null,
        details:          null,
        message:          null,
        page_url:         null,
        status:           'contacted',
        campaign_context: t.campaign_context ?? null,
      }]
    })

    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
