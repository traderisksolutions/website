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
    type ThreadRow = { id: string; subject: string | null; snippet: string | null; last_message_at: string; contact_id: string | null }
    const threadRes = await fetch(
      `${SB_URL}/rest/v1/email_threads?select=id,subject,snippet,last_message_at,contact_id&order=last_message_at.desc&limit=200`,
      { headers: sbHeaders() }
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
        { headers: sbHeaders() }
      )
      const rows: ContactRow[] = cRes.ok ? await cRes.json() : []
      for (const c of (Array.isArray(rows) ? rows : [])) contactMap.set(c.id, c)
    }

    // 3. For threads with no contact_id, find the inbound sender from email_messages
    const orphanIds = threads.filter(t => !t.contact_id).map(t => t.id)
    const orphanSenderMap = new Map<string, string>() // thread_id -> from_address
    if (orphanIds.length > 0) {
      const msgRes = await fetch(
        `${SB_URL}/rest/v1/email_messages?thread_id=in.(${orphanIds.join(',')})&direction=eq.inbound&select=thread_id,from_address&order=sent_at.asc`,
        { headers: sbHeaders() }
      )
      const msgs: { thread_id: string; from_address: string | null }[] = msgRes.ok ? await msgRes.json() : []
      for (const m of (Array.isArray(msgs) ? msgs : [])) {
        if (!orphanSenderMap.has(m.thread_id) && m.from_address) {
          orphanSenderMap.set(m.thread_id, m.from_address)
        }
      }

      // For threads where the first inbound sender is internal (e.g. forwarded email),
      // look for an external participant instead
      const internalOrphanIds = orphanIds.filter(id => {
        const e = orphanSenderMap.get(id)
        return !e || isInternal(e) || isAutomated(e)
      })
      if (internalOrphanIds.length > 0) {
        const partRes = await fetch(
          `${SB_URL}/rest/v1/email_participants?thread_id=in.(${internalOrphanIds.join(',')})&select=thread_id,email&order=thread_id.asc`,
          { headers: sbHeaders() }
        )
        const parts: { thread_id: string; email: string | null }[] = partRes.ok ? await partRes.json() : []
        for (const p of (Array.isArray(parts) ? parts : [])) {
          if (!orphanSenderMap.has(p.thread_id) && p.email && !isInternal(p.email) && !isAutomated(p.email)) {
            orphanSenderMap.set(p.thread_id, p.email)
          }
        }
      }
    }

    // 4. Shape one entry per thread
    const result = threads.flatMap(t => {
      const contact = t.contact_id ? contactMap.get(t.contact_id) : null
      const email   = contact?.email ?? orphanSenderMap.get(t.id) ?? null
      if (!email || isInternal(email) || isAutomated(email)) return []

      return [{
        id:           t.id,
        thread_id:    t.id,
        created_at:   t.last_message_at,
        source:       'email' as const,
        subject:      t.subject,
        snippet:      t.snippet,
        first_name:   contact?.first_name ?? null,
        last_name:    contact?.last_name  ?? null,
        email,
        phone:        null,
        company:      null,
        department:   null,
        contact_type: null,
        topic:        null,
        details:      null,
        message:      null,
        page_url:     null,
        status:       'contacted',
      }]
    })

    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
