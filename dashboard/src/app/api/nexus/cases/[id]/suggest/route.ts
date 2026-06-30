import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

type Params = { params: { id: string } }

// GET /api/nexus/cases/[id]/suggest — suggest unlinked threads that might belong to this case
// ?all=1 → return all recent threads (for the thread linker modal browse view)
// Strategy: match by shared contacts, similar subject keywords, or date proximity
export async function GET(req: NextRequest, { params }: Params) {
  const isAll = new URL(req.url).searchParams.get('all') === '1'
  if (isAll) {
    // Return all recent threads for the browse view in the linker modal
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/email_threads?deleted_at=is.null&order=last_message_at.desc&limit=50&select=id,subject,last_message_at,contact_id`,
        { headers: sbHeaders() }
      )
      const threads: { id: string; subject: string | null; last_message_at: string | null; contact_id: string | null }[] =
        res.ok ? await res.json() : []

      const contactIds = Array.from(new Set((Array.isArray(threads) ? threads : []).map(t => t.contact_id).filter((id): id is string => Boolean(id))))
      const contacts = contactIds.length > 0
        ? await fetch(
            `${SB_URL}/rest/v1/contacts?id=in.(${contactIds.join(',')})&select=id,email,first_name,last_name,company`,
            { headers: sbHeaders() }
          ).then(r => r.ok ? r.json() : []).catch(() => [])
        : []
      const cMap = Object.fromEntries((Array.isArray(contacts) ? contacts : []).map((c: { id: string }) => [c.id, c]))

      return NextResponse.json(
        (Array.isArray(threads) ? threads : []).map(t => ({
          ...t,
          contact: t.contact_id ? cMap[t.contact_id] ?? null : null,
          match_reason: 'Recent thread',
        }))
      )
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  // Normal suggest flow below...
  try {
    const caseId = params.id

    // 1. Get already-linked thread IDs and their contacts
    const ctRes = await fetch(
      `${SB_URL}/rest/v1/case_threads?case_id=eq.${caseId}&select=thread_id`,
      { headers: sbHeaders() }
    )
    const linked: { thread_id: string }[] = ctRes.ok ? await ctRes.json() : []
    const linkedIds = Array.isArray(linked) ? linked.map(l => l.thread_id) : []

    if (linkedIds.length === 0) {
      // No threads linked yet — return most recent threads as candidates
      const recentRes = await fetch(
        `${SB_URL}/rest/v1/email_threads?deleted_at=is.null&order=last_message_at.desc&limit=15&select=id,subject,last_message_at,contact_id`,
        { headers: sbHeaders() }
      )
      const recent = recentRes.ok ? await recentRes.json() : []
      const threads = Array.isArray(recent) ? recent : []
      return NextResponse.json(threads.map((t: Record<string, unknown>) => ({ ...t, match_reason: 'Recent thread — review for case relevance' })))
    }

    // 2. Fetch linked threads to get contacts and subjects
    const threadRes = await fetch(
      `${SB_URL}/rest/v1/email_threads?id=in.(${linkedIds.join(',')})&deleted_at=is.null&select=id,subject,contact_id,last_message_at`,
      { headers: sbHeaders() }
    )
    const linkedThreads: { id: string; subject: string | null; contact_id: string | null; last_message_at: string | null }[] =
      threadRes.ok ? await threadRes.json() : []

    const linkedContactIds = (Array.isArray(linkedThreads) ? linkedThreads : [])
      .map(t => t.contact_id).filter((id): id is string => Boolean(id))

    // Extract date range from linked threads (±30 days)
    const dates = (Array.isArray(linkedThreads) ? linkedThreads : [])
      .map(t => t.last_message_at).filter(Boolean).map(d => new Date(d!).getTime())
    const minDate = dates.length > 0 ? new Date(Math.min(...dates) - 30 * 86400_000).toISOString() : null
    const maxDate = dates.length > 0 ? new Date(Math.max(...dates) + 30 * 86400_000).toISOString() : null

    // Extract keywords from subjects
    const stopWords = new Set(['re:', 'fwd:', 'the', 'a', 'an', 'and', 'or', 'for', 'of', 'in', 'to', 'from', 'with', 'on', 'at', 'by', 'your', 'our', 'we', 'us', '&'])
    const subjectKeywords = (Array.isArray(linkedThreads) ? linkedThreads : [])
      .flatMap(t => (t.subject ?? '').toLowerCase().split(/\s+/))
      .filter(w => w.length > 3 && !stopWords.has(w))
    const topKeywords = Array.from(new Set(subjectKeywords)).slice(0, 5)

    // 3. Build candidate pool: threads sharing contacts OR date range
    const excludeClause = linkedIds.length > 0 ? `&id=not.in.(${linkedIds.join(',')})` : ''

    const candidates: {
      id: string; subject: string | null; contact_id: string | null; last_message_at: string | null
    }[] = []

    // Contact-matched threads
    if (linkedContactIds.length > 0) {
      const contactRes = await fetch(
        `${SB_URL}/rest/v1/email_threads?contact_id=in.(${linkedContactIds.join(',')})&deleted_at=is.null${excludeClause}&order=last_message_at.desc&limit=10&select=id,subject,contact_id,last_message_at`,
        { headers: sbHeaders() }
      )
      const contactThreads = contactRes.ok ? await contactRes.json() : []
      if (Array.isArray(contactThreads)) candidates.push(...contactThreads)
    }

    // Date-proximity threads
    if (minDate && maxDate) {
      const dateRes = await fetch(
        `${SB_URL}/rest/v1/email_threads?last_message_at=gte.${minDate}&last_message_at=lte.${maxDate}&deleted_at=is.null${excludeClause}&order=last_message_at.desc&limit=10&select=id,subject,contact_id,last_message_at`,
        { headers: sbHeaders() }
      )
      const dateThreads = dateRes.ok ? await dateRes.json() : []
      if (Array.isArray(dateThreads)) {
        for (const t of dateThreads) {
          if (!candidates.some(c => c.id === t.id)) candidates.push(t)
        }
      }
    }

    // 4. Score and annotate each candidate
    const scored = candidates
      .filter(t => !linkedIds.includes(t.id))
      .map(t => {
        const reasons: string[] = []
        const subject = (t.subject ?? '').toLowerCase()

        if (linkedContactIds.includes(t.contact_id ?? '')) {
          reasons.push('Same contact as a linked thread')
        }

        const keywordMatches = topKeywords.filter(k => subject.includes(k))
        if (keywordMatches.length >= 2) {
          reasons.push(`Subject keywords match: "${keywordMatches.slice(0, 2).join('", "')}"`)
        } else if (keywordMatches.length === 1) {
          reasons.push(`Subject keyword match: "${keywordMatches[0]}"`)
        }

        if (minDate && maxDate && t.last_message_at) {
          const d = new Date(t.last_message_at).getTime()
          if (d >= new Date(minDate).getTime() && d <= new Date(maxDate).getTime()) {
            reasons.push('Activity within same time window')
          }
        }

        return {
          ...t,
          match_score:  reasons.length,
          match_reason: reasons.length > 0 ? reasons.join(' · ') : 'Date proximity match',
        }
      })
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 10)

    // 5. Enrich with contact info
    const candidateContactIds = Array.from(new Set(scored.map(t => t.contact_id).filter((id): id is string => Boolean(id))))
    const candidateContacts = candidateContactIds.length > 0
      ? await fetch(
          `${SB_URL}/rest/v1/contacts?id=in.(${candidateContactIds.join(',')})&select=id,email,first_name,last_name,company`,
          { headers: sbHeaders() }
        ).then(r => r.ok ? r.json() : []).catch(() => [])
      : []
    const candidateContactMap = Object.fromEntries(
      (Array.isArray(candidateContacts) ? candidateContacts : [])
        .map((c: { id: string }) => [c.id, c])
    )

    const enriched = scored.map(t => ({
      ...t,
      contact: t.contact_id ? candidateContactMap[t.contact_id] ?? null : null,
    }))

    return NextResponse.json(enriched)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
