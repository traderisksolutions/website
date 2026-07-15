import { NextRequest, NextResponse } from 'next/server'

// GET /api/engagement/conversation?thread_id=X
// Returns every thread grouped into the same conversation as X (the anchor client thread
// plus any forked sub-threads to other parties — employee, insurer, etc.), each with its
// party (contact) and a message summary. Powers the party switcher in the right details
// panel. suggest_nexus flips true once a conversation spans 3+ parties/threads.

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const NEXUS_SUGGEST_THRESHOLD = 3

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

type ThreadRow  = { id: string; contact_id: string | null; subject: string | null; conversation_root_id: string | null; last_message_at: string | null }
type MsgRow     = { thread_id: string; direction: string; sent_at: string | null; body_text: string | null }
type ContactRow = { id: string; email: string | null; first_name: string | null; last_name: string | null; company: string | null }

function partyName(c: ContactRow | undefined, fallbackEmail: string | null): string {
  if (c) {
    const full = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
    if (full) return full
    if (c.email) return c.email
  }
  return fallbackEmail ?? 'Unknown'
}

export async function GET(req: NextRequest) {
  try {
    const threadId = new URL(req.url).searchParams.get('thread_id')
    if (!threadId) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })

    // 1. Resolve the conversation root for the given thread.
    const seedRes = await fetch(
      `${SB_URL}/rest/v1/email_threads?id=eq.${encodeURIComponent(threadId)}&deleted_at=is.null&select=id,conversation_root_id&limit=1`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    const seedRows: ThreadRow[] = seedRes.ok ? await seedRes.json() : []
    const seed = seedRows[0]
    if (!seed) return NextResponse.json({ root_thread_id: threadId, suggest_nexus: false, threads: [] })
    const root = seed.conversation_root_id ?? seed.id

    // 2. Every thread in the group: the root itself, or anything pointing at it.
    const groupRes = await fetch(
      `${SB_URL}/rest/v1/email_threads?or=(id.eq.${root},conversation_root_id.eq.${root})&deleted_at=is.null&select=id,contact_id,subject,conversation_root_id,last_message_at`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    const threads: ThreadRow[] = groupRes.ok ? await groupRes.json() : []
    if (threads.length === 0) return NextResponse.json({ root_thread_id: root, suggest_nexus: false, threads: [] })

    const threadIds = threads.map(t => t.id)
    const contactIds = Array.from(new Set(threads.map(t => t.contact_id).filter((x): x is string => !!x)))

    // 3. Messages + contacts for the whole group in one round-trip each.
    const [msgRes, contactRes] = await Promise.all([
      fetch(
        `${SB_URL}/rest/v1/email_messages?thread_id=in.(${threadIds.join(',')})&select=thread_id,direction,sent_at,body_text&order=sent_at.asc`,
        { headers: sbHeaders(), cache: 'no-store' }
      ),
      contactIds.length
        ? fetch(`${SB_URL}/rest/v1/contacts?id=in.(${contactIds.join(',')})&select=id,email,first_name,last_name,company`, { headers: sbHeaders(), cache: 'no-store' })
        : Promise.resolve(null),
    ])
    const msgs: MsgRow[] = msgRes.ok ? await msgRes.json() : []
    const contacts: ContactRow[] = contactRes && contactRes.ok ? await contactRes.json() : []
    const contactById = new Map(contacts.map(c => [c.id, c]))

    // Aggregate per-thread summary (messages arrive oldest→newest).
    const summary = new Map<string, { count: number; lastDirection: string | null; lastAt: string | null; snippet: string | null }>()
    for (const id of threadIds) summary.set(id, { count: 0, lastDirection: null, lastAt: null, snippet: null })
    for (const m of msgs) {
      const s = summary.get(m.thread_id)
      if (!s) continue
      s.count += 1
      s.lastDirection = m.direction
      s.lastAt = m.sent_at
      s.snippet = (m.body_text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
    }

    const out = threads.map(t => {
      const s = summary.get(t.id)!
      const contact = t.contact_id ? contactById.get(t.contact_id) : undefined
      return {
        id:              t.id,
        is_root:         t.id === root,
        subject:         t.subject ?? '(no subject)',
        party: {
          contact_id: t.contact_id,
          email:      contact?.email ?? null,
          name:       partyName(contact, contact?.email ?? null),
          company:    contact?.company ?? null,
        },
        message_count:   s.count,
        last_direction:  s.lastDirection,
        last_message_at: s.lastAt ?? t.last_message_at,
        snippet:         s.snippet,
      }
    })

    // Root first, then most recently active.
    out.sort((a, b) => {
      if (a.is_root !== b.is_root) return a.is_root ? -1 : 1
      return (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')
    })

    return NextResponse.json({
      root_thread_id: root,
      suggest_nexus:  out.length >= NEXUS_SUGGEST_THRESHOLD,
      threads:        out,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
