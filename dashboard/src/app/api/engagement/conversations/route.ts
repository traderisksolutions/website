import { NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

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
// Returns contacts who have at least one email thread, shaped as Lead objects.
// Merged with /api/leads in the engagement page to show all inbound email conversations.
export async function GET() {
  try {
    // 1. Get all threads with a linked contact, most recent first
    const threadsRes = await fetch(
      `${SB_URL}/rest/v1/email_threads?contact_id=not.is.null&select=contact_id,last_message_at&order=last_message_at.desc`,
      { headers: sbHeaders() }
    )
    const threads: { contact_id: string; last_message_at: string }[] =
      threadsRes.ok ? await threadsRes.json() : []
    if (!Array.isArray(threads) || threads.length === 0) return NextResponse.json([])

    // 2. One entry per contact — keep most recent thread timestamp
    const latestByContact = new Map<string, string>()
    for (const t of threads) {
      if (!latestByContact.has(t.contact_id)) {
        latestByContact.set(t.contact_id, t.last_message_at)
      }
    }
    const contactIds = Array.from(latestByContact.keys())

    // 3. Fetch contact details
    const contactsRes = await fetch(
      `${SB_URL}/rest/v1/contacts?id=in.(${contactIds.join(',')})&select=id,full_name,email,created_at`,
      { headers: sbHeaders() }
    )
    const contacts: { id: string; full_name: string | null; email: string | null; created_at: string }[] =
      contactsRes.ok ? await contactsRes.json() : []

    // 4. Shape as Lead-compatible objects so the engagement page can render them unchanged
    const conversations = contacts.map(c => {
      const parts = (c.full_name ?? '').trim().split(/\s+/)
      return {
        id:           c.id,
        created_at:   latestByContact.get(c.id) ?? c.created_at,
        source:       'email' as const,
        first_name:   parts[0] || null,
        last_name:    parts.slice(1).join(' ') || null,
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

    return NextResponse.json(conversations)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
