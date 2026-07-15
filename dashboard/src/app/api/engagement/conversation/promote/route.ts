import { NextRequest, NextResponse } from 'next/server'
import { logActivity }               from '@/lib/log-activity'

// POST /api/engagement/conversation/promote
// Body: { thread_id: string, name?: string }
// Promotes a grouped conversation (the anchor client thread + every forked party sub-thread)
// into a Nexus case: creates the case and links all threads as case_threads (root → client
// party, others → other). Idempotent-ish: if any thread in the group is already in a case,
// returns that case instead of creating a duplicate.

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type ThreadRow  = { id: string; contact_id: string | null; subject: string | null; conversation_root_id: string | null }
type ContactRow = { id: string; email: string | null; first_name: string | null; last_name: string | null; company: string | null }

function cleanSubject(s: string | null): string {
  return (s ?? '').replace(/^(?:re|fw|fwd)\s*:\s*/gi, '').replace(/\[EXTERNAL\]\s*/gi, '').trim()
}

function contactLabel(c: ContactRow | undefined): string | null {
  if (!c) return null
  const full = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
  return full || c.company || c.email || null
}

export async function POST(req: NextRequest) {
  try {
    const { thread_id, name } = await req.json() as { thread_id?: string; name?: string }
    if (!thread_id) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })

    // 1. Resolve the conversation root.
    const seedRes = await fetch(
      `${SB_URL}/rest/v1/email_threads?id=eq.${encodeURIComponent(thread_id)}&deleted_at=is.null&select=id,conversation_root_id&limit=1`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    const seed = (seedRes.ok ? await seedRes.json() : [])[0] as ThreadRow | undefined
    if (!seed) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    const root = seed.conversation_root_id ?? seed.id

    // 2. All threads in the group.
    const groupRes = await fetch(
      `${SB_URL}/rest/v1/email_threads?or=(id.eq.${root},conversation_root_id.eq.${root})&deleted_at=is.null&select=id,contact_id,subject,conversation_root_id`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    const threads: ThreadRow[] = groupRes.ok ? await groupRes.json() : []
    if (threads.length === 0) return NextResponse.json({ error: 'No threads in conversation' }, { status: 400 })
    const threadIds = threads.map(t => t.id)

    // 3. Already promoted? Return the existing case so the button is safe to double-click.
    const existingRes = await fetch(
      `${SB_URL}/rest/v1/case_threads?thread_id=in.(${threadIds.join(',')})&select=case_id&limit=1`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    const existing = (existingRes.ok ? await existingRes.json() : [])[0] as { case_id: string } | undefined
    if (existing?.case_id) {
      return NextResponse.json({ case_id: existing.case_id, created: false })
    }

    // 4. Contacts for naming + party labels.
    const contactIds = Array.from(new Set(threads.map(t => t.contact_id).filter((x): x is string => !!x)))
    const contacts: ContactRow[] = contactIds.length
      ? await fetch(`${SB_URL}/rest/v1/contacts?id=in.(${contactIds.join(',')})&select=id,email,first_name,last_name,company`, { headers: sbHeaders(), cache: 'no-store' }).then(r => r.ok ? r.json() : [])
      : []
    const contactById = new Map(contacts.map(c => [c.id, c]))

    const rootThread  = threads.find(t => t.id === root) ?? threads[0]
    const rootContact = rootThread.contact_id ? contactById.get(rootThread.contact_id) : undefined
    const caseName = name?.trim()
      || cleanSubject(rootThread.subject)
      || (contactLabel(rootContact) ? `Conversation — ${contactLabel(rootContact)}` : 'Engagement conversation')

    // 5. Create the case.
    const caseRes = await fetch(`${SB_URL}/rest/v1/cases`, {
      method:  'POST',
      headers: sbHeaders('return=representation'),
      body:    JSON.stringify({ name: caseName, status: 'open' }),
    })
    if (!caseRes.ok) return NextResponse.json({ error: await caseRes.text() }, { status: caseRes.status })
    const newCase = (await caseRes.json())[0] as { id: string }
    if (!newCase?.id) return NextResponse.json({ error: 'Case create failed' }, { status: 500 })

    // 6. Link every thread. Root is the client; other parties default to 'other'.
    const links = threads.map(t => ({
      case_id:     newCase.id,
      thread_id:   t.id,
      party_type:  t.id === root ? 'client' : 'other',
      party_label: contactLabel(t.contact_id ? contactById.get(t.contact_id) : undefined),
    }))
    await fetch(`${SB_URL}/rest/v1/case_threads?on_conflict=case_id,thread_id`, {
      method:  'POST',
      headers: sbHeaders('return=minimal,resolution=merge-duplicates'),
      body:    JSON.stringify(links),
    })

    void logActivity({ action: 'nexus.conversation_promoted', resource_type: 'case', resource_id: newCase.id, metadata: { root_thread_id: root, thread_count: threads.length } })
    return NextResponse.json({ case_id: newCase.id, created: true, thread_count: threads.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
