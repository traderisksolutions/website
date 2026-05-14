import { NextResponse } from 'next/server'

const SB_URL    = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const OPS_EMAIL = 'operations@trade-risksol.com'

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
// Returns one conversation entry per unique inbound sender.
// Primary source: email_threads.contact_id → contacts table (has UUID + name).
// Fallback: email_messages.from_address for threads without a linked contact.
export async function GET() {
  try {
    // ── Primary: threads linked to a contact ─────────────────────────────────
    const threadRes = await fetch(
      `${SB_URL}/rest/v1/email_threads?contact_id=not.is.null&select=contact_id,last_message_at&order=last_message_at.desc&limit=200`,
      { headers: sbHeaders() }
    )
    const linkedThreads: { contact_id: string; last_message_at: string }[] =
      threadRes.ok ? await threadRes.json() : []

    // One entry per contact — keep most recent last_message_at
    const latestByContact = new Map<string, string>()
    for (const t of Array.isArray(linkedThreads) ? linkedThreads : []) {
      if (!latestByContact.has(t.contact_id)) {
        latestByContact.set(t.contact_id, t.last_message_at)
      }
    }

    let contactRows: { id: string; full_name: string | null; email: string | null }[] = []
    if (latestByContact.size > 0) {
      const ids = Array.from(latestByContact.keys()).join(',')
      const cRes = await fetch(
        `${SB_URL}/rest/v1/contacts?id=in.(${ids})&select=id,full_name,email`,
        { headers: sbHeaders() }
      )
      contactRows = cRes.ok ? await cRes.json() : []
    }

    // ── Fallback: inbound messages on threads with no contact_id ─────────────
    const msgRes = await fetch(
      `${SB_URL}/rest/v1/email_messages?direction=eq.inbound&select=from_address,thread_id,sent_at&order=sent_at.desc&limit=200`,
      { headers: sbHeaders() }
    )
    const allInbound: { from_address: string | null; thread_id: string; sent_at: string }[] =
      msgRes.ok ? await msgRes.json() : []

    // Emails already covered by a linked contact
    const coveredEmails = new Set(
      (Array.isArray(contactRows) ? contactRows : []).map(c => c.email?.toLowerCase()).filter(Boolean)
    )

    const fallbackBySender = new Map<string, { sent_at: string }>()
    for (const m of Array.isArray(allInbound) ? allInbound : []) {
      const addr = m.from_address?.toLowerCase().trim()
      if (!addr || addr === OPS_EMAIL.toLowerCase() || coveredEmails.has(addr)) continue
      if (!fallbackBySender.has(addr)) {
        fallbackBySender.set(addr, { sent_at: m.sent_at })
      }
    }

    // ── Shape both sources as Lead-compatible objects ─────────────────────────
    const splitName = (full: string | null) => {
      const parts = (full ?? '').trim().split(/\s+/)
      return { first: parts[0] || null, last: parts.slice(1).join(' ') || null }
    }

    const fromContacts = (Array.isArray(contactRows) ? contactRows : []).map(c => {
      const { first, last } = splitName(c.full_name ?? c.email)
      return {
        id:           c.id,
        created_at:   latestByContact.get(c.id)!,
        source:       'email' as const,
        first_name:   first,
        last_name:    last,
        email:        c.email,
        phone:        null,
        company:      null,
        department:   null,
        contact_type: null,
        topic:        null,
        details:      null,
        message:      null,
        page_url:     null,
        status:       'contacted',
      }
    })

    const fromFallback = Array.from(fallbackBySender.entries()).map(([email, { sent_at }]) => {
      const { first, last } = splitName(email)
      return {
        id:           email,   // no UUID yet — will be fixed after back-fill SQL
        created_at:   sent_at,
        source:       'email' as const,
        first_name:   first,
        last_name:    last,
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
      }
    })

    return NextResponse.json([...fromContacts, ...fromFallback])
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
