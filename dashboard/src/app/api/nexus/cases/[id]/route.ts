import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type Params = { params: { id: string } }

// GET /api/nexus/cases/[id] — full case with linked threads, their messages, and latest analysis
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const caseId = params.id

    // Fetch case
    const caseRes = await fetch(
      `${SB_URL}/rest/v1/cases?id=eq.${caseId}&limit=1&select=*`,
      { headers: sbHeaders() }
    )
    const caseRows = caseRes.ok ? await caseRes.json() : []
    const caseRow = Array.isArray(caseRows) ? caseRows[0] : null
    if (!caseRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Fetch case_threads
    const ctRes = await fetch(
      `${SB_URL}/rest/v1/case_threads?case_id=eq.${caseId}&order=created_at.asc&select=*`,
      { headers: sbHeaders() }
    )
    const caseThreads: { id: string; thread_id: string; party_type: string; party_label: string | null }[] =
      ctRes.ok ? await ctRes.json() : []

    // Fetch email thread details + messages for each linked thread in parallel
    const threadIds = Array.isArray(caseThreads) ? caseThreads.map(ct => ct.thread_id) : []

    const [threadDetails, allMessages, extractedAttachments] = await Promise.all([
      threadIds.length > 0
        ? fetch(
            `${SB_URL}/rest/v1/email_threads?id=in.(${threadIds.join(',')})&deleted_at=is.null&select=id,subject,last_message_at,contact_id`,
            { headers: sbHeaders() }
          ).then(r => r.ok ? r.json() : []).catch(() => [])
        : Promise.resolve([]),

      threadIds.length > 0
        ? fetch(
            `${SB_URL}/rest/v1/email_messages?thread_id=in.(${threadIds.join(',')})&deleted_at=is.null&order=sent_at.asc&select=id,thread_id,direction,from_address,subject,body_text,sent_at,has_attachments`,
            { headers: sbHeaders() }
          ).then(r => r.ok ? r.json() : []).catch(() => [])
        : Promise.resolve([]),

      // Attachment extraction status + file metadata per thread
      threadIds.length > 0
        ? fetch(
            `${SB_URL}/rest/v1/email_attachments?thread_id=in.(${threadIds.join(',')})&select=thread_id,filename,mime_type,storage_url,parsed_at&order=created_at.asc`,
            { headers: sbHeaders() }
          ).then(r => r.ok ? r.json() : []).catch(() => [])
        : Promise.resolve([]),
    ])

    // Fetch contacts for thread owners
    const contactIds = (Array.isArray(threadDetails) ? threadDetails : [])
      .map((t: { contact_id: string | null }) => t.contact_id)
      .filter((id): id is string => Boolean(id))

    const contacts: { id: string; email: string | null; first_name: string | null; last_name: string | null; company: string | null }[] =
      contactIds.length > 0
        ? await fetch(
            `${SB_URL}/rest/v1/contacts?id=in.(${contactIds.join(',')})&select=id,email,first_name,last_name,company`,
            { headers: sbHeaders() }
          ).then(r => r.ok ? r.json() : []).catch(() => [])
        : []

    const contactMap = Object.fromEntries((Array.isArray(contacts) ? contacts : []).map(c => [c.id, c]))

    // Enrich threads
    const threadMap = Object.fromEntries(
      (Array.isArray(threadDetails) ? threadDetails : []).map((t: { id: string; subject: string | null; last_message_at: string | null; contact_id: string | null }) => [
        t.id,
        { ...t, contact: t.contact_id ? contactMap[t.contact_id] ?? null : null },
      ])
    )

    // Group messages by thread
    const messagesByThread: Record<string, unknown[]> = {}
    for (const msg of (Array.isArray(allMessages) ? allMessages : [])) {
      const m = msg as { thread_id: string }
      if (!messagesByThread[m.thread_id]) messagesByThread[m.thread_id] = []
      messagesByThread[m.thread_id].push(msg)
    }

    // Attachment records per thread
    type AttRow = { thread_id: string; filename: string; mime_type: string | null; storage_url: string | null; parsed_at: string | null }
    const attRows: AttRow[] = Array.isArray(extractedAttachments) ? extractedAttachments : []
    const attByThread: Record<string, AttRow[]> = {}
    for (const row of attRows) {
      if (!attByThread[row.thread_id]) attByThread[row.thread_id] = []
      attByThread[row.thread_id].push(row)
    }

    // Build enriched case_threads
    const enrichedThreads = (Array.isArray(caseThreads) ? caseThreads : []).map(ct => {
      const msgs        = (messagesByThread[ct.thread_id] ?? []) as { has_attachments: boolean }[]
      const threadAtts  = attByThread[ct.thread_id] ?? []
      const extracted   = threadAtts.filter(a => a.parsed_at !== null).length
      return {
        ...ct,
        thread:                threadMap[ct.thread_id] ?? null,
        messages:              messagesByThread[ct.thread_id] ?? [],
        attachments_extracted: extracted,
        attachments_pending:   msgs.some(m => m.has_attachments) && extracted === 0,
        attachment_records:    threadAtts,
      }
    })

    // Fetch latest analysis
    const analysisRes = await fetch(
      `${SB_URL}/rest/v1/case_analyses?case_id=eq.${caseId}&order=created_at.desc&limit=1&select=*`,
      { headers: sbHeaders() }
    )
    const analyses = analysisRes.ok ? await analysisRes.json() : []
    const latestAnalysis = Array.isArray(analyses) && analyses.length > 0 ? analyses[0] : null

    return NextResponse.json({ case: caseRow, threads: enrichedThreads, analysis: latestAnalysis })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/nexus/cases/[id] — update name / description / status
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const body = await req.json()
    const allowed = ['name', 'description', 'status']
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of allowed) if (k in body) update[k] = body[k]

    const res = await fetch(`${SB_URL}/rest/v1/cases?id=eq.${params.id}`, {
      method:  'PATCH',
      headers: sbHeaders('return=representation'),
      body:    JSON.stringify(update),
    })
    const rows = res.ok ? await res.json() : []
    return NextResponse.json(Array.isArray(rows) ? rows[0] : rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/nexus/cases/[id] — delete case (cascades to case_threads + case_analyses)
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/cases?id=eq.${params.id}`, {
      method:  'DELETE',
      headers: sbHeaders('return=minimal'),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
