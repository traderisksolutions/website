/**
 * POST /api/nexus/draft-create
 *
 * Creates an ai_drafts record for a Nexus playbook step so that:
 *   1. /api/email/send can use it (requires draftId)
 *   2. runDraftEvaluation fires automatically after send
 *
 * The "original AI draft" (body) is stored here before any human edits.
 * The diff between this and what was finally sent is captured by the eval engine.
 *
 * Returns: { draftId: string }
 */

import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

export async function POST(req: NextRequest) {
  try {
    const { thread_id, body, email_type, to_email, nexus_case_id, nexus_step_index } = await req.json() as {
      thread_id?:       string | null
      body:             string
      email_type:       string
      to_email:         string
      nexus_case_id?:   string | null
      nexus_step_index?: number | null
    }

    if (!body?.trim())    return NextResponse.json({ error: 'body required' }, { status: 400 })
    if (!to_email?.trim()) return NextResponse.json({ error: 'to_email required' }, { status: 400 })

    // 1. Try to get contact_id from the thread
    let contactId: string | null = null

    if (thread_id) {
      const tRes = await fetch(
        `${SB_URL}/rest/v1/email_threads?id=eq.${thread_id}&select=contact_id&limit=1`,
        { headers: sbHeaders() }
      )
      const threads = tRes.ok ? await tRes.json() : []
      contactId = Array.isArray(threads) ? (threads[0]?.contact_id ?? null) : null
    }

    // 2. No contact from thread — upsert one from to_email
    if (!contactId && to_email.includes('@')) {
      const uRes = await fetch(
        `${SB_URL}/rest/v1/contacts?on_conflict=email`,
        {
          method:  'POST',
          headers: sbHeaders('return=representation,resolution=merge-duplicates'),
          body:    JSON.stringify({ email: to_email.toLowerCase().trim(), source: 'nexus' }),
        }
      )
      const rows = uRes.ok ? await uRes.json() : []
      contactId  = Array.isArray(rows) && rows[0]?.id ? rows[0].id : null

      if (!contactId) {
        // Fallback: fetch after upsert
        const fRes = await fetch(
          `${SB_URL}/rest/v1/contacts?email=eq.${encodeURIComponent(to_email.toLowerCase().trim())}&select=id&limit=1`,
          { headers: sbHeaders() }
        )
        const fRows = fRes.ok ? await fRes.json() : []
        contactId   = Array.isArray(fRows) ? (fRows[0]?.id ?? null) : null
      }
    }

    if (!contactId) {
      return NextResponse.json(
        { error: 'Could not resolve a contact for this playbook step. Check that the thread has a linked contact.' },
        { status: 400 }
      )
    }

    // 3. Create the ai_drafts record with the original (unedited) AI draft
    const draftRes = await fetch(`${SB_URL}/rest/v1/ai_drafts`, {
      method:  'POST',
      headers: sbHeaders('return=representation'),
      body: JSON.stringify({
        contact_id:       contactId,
        thread_id:        thread_id ?? null,
        body:             body.trim(),
        email_type:       email_type ?? 'NEXUS',
        channel:          'email',
        status:           'pending',
        ...(nexus_case_id    ? { nexus_case_id }    : {}),
        ...(nexus_step_index != null ? { nexus_step_index } : {}),
      }),
    })

    if (!draftRes.ok) {
      const err = await draftRes.text()
      return NextResponse.json({ error: `Draft creation failed: ${err}` }, { status: 500 })
    }

    const drafts = await draftRes.json()
    const draft  = Array.isArray(drafts) ? drafts[0] : drafts
    if (!draft?.id) return NextResponse.json({ error: 'Draft created but no ID returned' }, { status: 500 })

    return NextResponse.json({ draftId: draft.id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
