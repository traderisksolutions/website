import { NextResponse } from 'next/server'

const SB_URL      = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const OPS_EMAIL   = 'operations@trade-risksol.com'

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
// Returns unique inbound senders as Lead-compatible objects by reading
// email_messages directly — no dependency on contact_id being set.
export async function GET() {
  try {
    // 1. Fetch all inbound messages (from_address ≠ OPS_EMAIL), most recent first
    const msgRes = await fetch(
      `${SB_URL}/rest/v1/email_messages?direction=eq.inbound&select=from_address,thread_id,sent_at&order=sent_at.desc&limit=200`,
      { headers: sbHeaders() }
    )
    const msgs: { from_address: string | null; thread_id: string; sent_at: string }[] =
      msgRes.ok ? await msgRes.json() : []
    if (!Array.isArray(msgs) || msgs.length === 0) return NextResponse.json([])

    // 2. One entry per sender email — keep most recent sent_at and thread_id
    const bySender = new Map<string, { thread_id: string; sent_at: string }>()
    for (const m of msgs) {
      const addr = m.from_address?.toLowerCase().trim()
      if (!addr || addr === OPS_EMAIL.toLowerCase()) continue
      if (!bySender.has(addr)) {
        bySender.set(addr, { thread_id: m.thread_id, sent_at: m.sent_at })
      }
    }
    if (bySender.size === 0) return NextResponse.json([])

    // 3. Try to enrich from contacts table (name lookup)
    const emailList = Array.from(bySender.keys())
    const contactsRes = await fetch(
      `${SB_URL}/rest/v1/contacts?email=in.(${emailList.map(e => `"${e}"`).join(',')})&select=id,email,full_name`,
      { headers: sbHeaders() }
    )
    const contacts: { id: string; email: string; full_name: string | null }[] =
      contactsRes.ok ? await contactsRes.json() : []
    const contactByEmail = new Map(contacts.map(c => [c.email.toLowerCase(), c]))

    // 4. Shape as Lead-compatible objects
    const conversations = emailList.map(email => {
      const { sent_at } = bySender.get(email)!
      const contact  = contactByEmail.get(email)
      const fullName = contact?.full_name ?? email
      const parts    = fullName.trim().split(/\s+/)
      return {
        id:           contact?.id ?? email,
        created_at:   sent_at,
        source:       'email' as const,
        first_name:   parts[0] || null,
        last_name:    parts.slice(1).join(' ') || null,
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

    return NextResponse.json(conversations)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
