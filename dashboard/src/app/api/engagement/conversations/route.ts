import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { fetchAllRows } from '@/lib/postgrest-all'
import { lastRealMessage } from '@/lib/threads/waiting'
import { chaseDueOn } from '@/lib/admin/b/cadence'

const SB_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://trs-api-335840130686.asia-southeast1.run.app'
const TRS_DOMAIN = 'trade-risksol.com'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
/**
 * The status of each thread from its last messages, skipping auto-replies and forwards inside TRS.
 * Bodies and recipients are read only for the newest few messages of each thread.
 */
async function readStatus(
  msgs: { id: string; thread_id: string; from_address: string | null; direction: string; subject: string | null; sent_at: string | null }[],
  threads: { id: string; companies?: { kind?: string | null } | null }[],
  lastDirection: Map<string, 'inbound' | 'outbound'>,
  chaseDue: Map<string, string>,
) {
  const byThread = new Map<string, typeof msgs>()
  for (const m of msgs) { const l = byThread.get(m.thread_id); if (l) l.push(m); else byThread.set(m.thread_id, [m]) }
  const recent = Array.from(byThread.values()).flatMap(l => l.slice(-4))
  const ids = recent.map(m => m.id)
  const bodies = new Map<string, string | null>()
  const to = new Map<string, string[]>()
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200).join(',')
    const [b, p] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/email_messages?id=in.(${part})&select=id,body_text`, { headers: sbHeaders(), cache: 'no-store' }).then(r => r.ok ? r.json() : []),
      fetch(`${SB_URL}/rest/v1/email_participants?message_id=in.(${part})&role=in.(to,cc)&select=message_id,email`, { headers: sbHeaders(), cache: 'no-store' }).then(r => r.ok ? r.json() : []),
    ])
    for (const x of b as { id: string; body_text: string | null }[]) bodies.set(x.id, (x.body_text ?? '').slice(0, 500))
    for (const x of p as { message_id: string; email: string }[]) { const l = to.get(x.message_id); if (l) l.push(x.email); else to.set(x.message_id, [x.email]) }
  }
  const insurer = new Set(threads.filter(t => t.companies?.kind === 'insurer').map(t => t.id))
  for (const [threadId, list] of byThread) {
    const tail = list.slice(-4).map(m => ({ ...m, body_text: bodies.get(m.id) ?? null, to: to.get(m.id) ?? [], cc: [] as string[] }))
    const last = lastRealMessage(tail) ?? tail.at(-1)
    if (last?.direction !== 'inbound' && last?.direction !== 'outbound') continue
    lastDirection.set(threadId, last.direction)
    if (last.direction === 'outbound' && last.sent_at) chaseDue.set(threadId, chaseDueOn(last.sent_at, insurer.has(threadId) ? 'insurer' : 'client'))
  }
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    // 1. Fetch all threads ordered by last activity
    type CampaignCtx = { campaign_id: string; campaign_name: string; product_type: string; step_replied_to: number | null } | null
    type ThreadRow = {
      id: string; subject: string | null; display_subject: string | null; snippet: string | null; last_message_at: string; contact_id: string | null; campaign_context: CampaignCtx; category: string | null
      company_id: string | null; companies: { id: string; name: string; owner_email?: string | null; kind?: string | null } | null
    }
    const threadRes = await fetch(
      `${SB_URL}/rest/v1/email_threads?select=id,subject,display_subject,snippet,last_message_at,contact_id,campaign_context,category,company_id,companies(id,name:company_name,owner_email,kind)&deleted_at=is.null&order=last_message_at.desc&limit=200`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    const threads: ThreadRow[] = threadRes.ok ? await threadRes.json() : []
    if (!Array.isArray(threads)) return NextResponse.json([])

    // A deep link (/engagement?lead=<thread id>) can point at a thread older than the newest 200.
    // ?include=<thread id> adds that one thread so the page can open it.
    const include = req.nextUrl.searchParams.get('include')
    if (include && UUID.test(include) && !threads.some(t => t.id === include)) {
      const one = await fetch(
        `${SB_URL}/rest/v1/email_threads?id=eq.${include}&select=id,subject,display_subject,snippet,last_message_at,contact_id,campaign_context,category,company_id,companies(id,name:company_name,owner_email,kind)&deleted_at=is.null&limit=1`,
        { headers: sbHeaders(), cache: 'no-store' }
      )
      const rows: ThreadRow[] = one.ok ? await one.json() : []
      if (Array.isArray(rows) && rows[0]) threads.push(rows[0])
    }
    if (threads.length === 0) return NextResponse.json([])

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
    const lastDirection = new Map<string, 'inbound' | 'outbound'>() // thread_id -> direction of the last real message
    const chaseDue = new Map<string, string>() // thread_id -> the day a chaser is due, when TRS wrote last
    if (allThreadIds.length > 0) {
      // Prefer inbound messages first (direct client email). Every row: the API stops at 1,000,
      // which left the newest messages of the list unread and their status wrong.
      const msgs = await fetchAllRows<{ id: string; thread_id: string; from_address: string | null; direction: string; subject: string | null; sent_at: string | null }>(
        `${SB_URL}/rest/v1/email_messages?thread_id=in.(${allThreadIds.join(',')})&deleted_at=is.null&select=id,thread_id,from_address,direction,subject,sent_at&order=sent_at.asc`,
        sbHeaders(),
      ).catch(() => [])
      await readStatus(msgs, threads, lastDirection, chaseDue)
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

      // No external contact (internal-only thread, e.g. TRS forward / ops↔ops):
      // read as "Trade Risk Solutions" rather than an ugly dash.
      const internalOnly = !email && !contact?.first_name && !contact?.last_name
      return [{
        id:               t.id,
        thread_id:        t.id,
        created_at:       t.last_message_at,
        source:           'email' as const,
        subject:          t.subject,
        display_subject:  t.display_subject ?? null,
        snippet:          t.snippet,
        first_name:       contact?.first_name ?? (internalOnly ? 'Trade Risk Solutions' : null),
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
        category:         t.category ?? null,
        companyId:        t.company_id ?? null,
        companyName:      t.companies?.name ?? null,
        companyOwner:     t.companies?.owner_email ?? null,
        lastDirection:    lastDirection.get(t.id) ?? null,
        chaseDue:         chaseDue.get(t.id) ?? null,
      }]
    })

    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
