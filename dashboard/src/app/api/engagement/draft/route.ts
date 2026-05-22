import { NextRequest, NextResponse } from 'next/server'

const SB_URL    = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:         k,
    Authorization:  `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:         prefer,
  }
}

interface MsgSnippet {
  direction: string
  from_address: string
  body_text: string
  sent_at: string
}

// GET /api/engagement/draft?contactId=X  → pending drafts for a contact
export async function GET(req: NextRequest) {
  try {
    const contactId = new URL(req.url).searchParams.get('contactId')
    if (!contactId) return NextResponse.json([])

    const res = await fetch(
      `${SB_URL}/rest/v1/ai_drafts?contact_id=eq.${contactId}&status=in.(pending,approved)&order=created_at.desc&limit=5`,
      { headers: sbHeaders() }
    )
    const rows = res.ok ? await res.json() : []
    return NextResponse.json(Array.isArray(rows) ? rows : [])
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/engagement/draft  → generate AI draft, upsert contact, save to ai_drafts
export async function POST(req: NextRequest) {
  try {
    const { leadId, contactName, contactEmail, company, topic, leadStatus, threadId, messages, manualContent } =
      await req.json() as {
        leadId:         string
        contactName:    string
        contactEmail:   string | null
        company:        string | null
        topic:          string | null
        leadStatus:     string
        threadId:       string | null
        messages:       MsgSnippet[]
        manualContent?: string
      }

    // Manual compose — skip Gemini entirely
    if (manualContent !== undefined) {
      if (!contactEmail) return NextResponse.json({ error: 'Contact has no email address' }, { status: 400 })
      // Upsert contact
      const upsertRes = await fetch(`${SB_URL}/rest/v1/contacts?on_conflict=email`, {
        method:  'POST',
        headers: sbHeaders('return=representation,resolution=merge-duplicates'),
        body: JSON.stringify({ full_name: contactName, email: contactEmail, source: 'email' }),
      })
      const upserted  = upsertRes.ok ? await upsertRes.json() : null
      const contactId = (Array.isArray(upserted) ? upserted[0] : upserted)?.id ?? null
      if (!contactId) return NextResponse.json({ error: 'Could not resolve contact_id' }, { status: 400 })
      const draftRes = await fetch(`${SB_URL}/rest/v1/ai_drafts`, {
        method:  'POST',
        headers: sbHeaders('return=representation'),
        body: JSON.stringify({ contact_id: contactId, thread_id: threadId ?? null, channel: 'email', body: manualContent, status: 'pending', generated_by: 'manual' }),
      })
      const saved = draftRes.ok ? await draftRes.json() : null
      const draft = Array.isArray(saved) ? saved[0] : saved
      return NextResponse.json({ draftId: draft?.id ?? null, content: manualContent, contactId })
    }

    const geminiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL
    if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY_DRAFT_EMAIL not set' }, { status: 500 })

    // Build thread context for Gemini
    const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound')
    const recentMsgs  = messages.slice(-6) // last 6 messages for context

    const threadCtx = recentMsgs
      .map(m => {
        const who  = m.direction === 'inbound' ? `CLIENT (${m.from_address})` : 'TRS (us)'
        const body = (m.body_text || '').slice(0, 500)
        return `${who}:\n${body}`
      })
      .join('\n\n---\n\n')

    const prompt = `You are an AI email assistant for Trade Risk Solutions, a Singapore insurance brokerage.

Write a professional reply email from TRS to the client. The reply should:
- Be addressed to ${contactName}
- Directly respond to the client's most recent message
- Be warm but professional in tone
- Reference specific details from the conversation (coverage type, amounts, timeline if mentioned)
- End with "Best regards,\nTrade Risk Solutions"
- Be 3–6 sentences (concise and actionable)
- NOT include a subject line — just the body text

Contact: ${contactName}${company ? ` at ${company}` : ''}
Topic: ${topic || 'Insurance enquiry'}
Current status: ${leadStatus}

${lastInbound ? `CLIENT'S LAST MESSAGE:\n${(lastInbound.body_text || '').slice(0, 600)}` : ''}

RECENT THREAD CONTEXT:
${threadCtx || '(No prior messages — this is the first reply)'}

Write only the email body. Start with "Hi ${contactName.split(' ')[0] || 'there'}," and end with the sign-off.`

    const gemRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
      }),
    })

    if (!gemRes.ok) {
      const errText = await gemRes.text()
      console.error('[engagement/draft] Gemini error:', gemRes.status, errText)
      return NextResponse.json({ error: `Gemini ${gemRes.status}: ${errText.slice(0, 300)}` }, { status: 502 })
    }
    const gemData = await gemRes.json()
    const content = gemData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    if (!content) {
      const reason = gemData?.candidates?.[0]?.finishReason ?? JSON.stringify(gemData).slice(0, 200)
      return NextResponse.json({ error: `Gemini returned no content (${reason})` }, { status: 502 })
    }

    // Upsert contact by email (ON CONFLICT email DO UPDATE so concurrent calls are safe)
    let contactId: string | null = null
    if (contactEmail) {
      const upsertRes = await fetch(
        `${SB_URL}/rest/v1/contacts?on_conflict=email`,
        {
          method:  'POST',
          headers: sbHeaders('return=representation,resolution=merge-duplicates'),
          body: JSON.stringify({
            full_name: contactName,
            email:     contactEmail,
            source:    'email',
          }),
        }
      )
      const upserted = upsertRes.ok ? await upsertRes.json() : null
      const row = Array.isArray(upserted) ? upserted[0] : upserted
      contactId = row?.id ?? null

      // Link inbound_lead to contact if not already linked
      if (contactId && leadId) {
        await fetch(`${SB_URL}/rest/v1/inbound_leads?id=eq.${leadId}`, {
          method:  'PATCH',
          headers: sbHeaders('return=minimal'),
          body: JSON.stringify({ contact_id: contactId }),
        })
      }
    }

    if (!contactId) {
      return NextResponse.json({ error: 'Could not resolve contact_id — lead has no email' }, { status: 400 })
    }

    // Save draft to ai_drafts
    const draftRes = await fetch(`${SB_URL}/rest/v1/ai_drafts`, {
      method:  'POST',
      headers: sbHeaders('return=representation'),
      body: JSON.stringify({
        contact_id:   contactId,
        thread_id:    threadId ?? null,
        channel:      'email',
        body:         content,
        status:       'pending',
        generated_by: 'gemini',
      }),
    })

    const saved = draftRes.ok ? await draftRes.json() : null
    const draft = Array.isArray(saved) ? saved[0] : saved

    return NextResponse.json({ draftId: draft?.id ?? null, content, contactId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH /api/engagement/draft  → approve or reject
export async function PATCH(req: NextRequest) {
  try {
    const { draftId, status, content, rejection_note } =
      await req.json() as {
        draftId:        string
        status:         'approved' | 'rejected' | 'sent'
        content?:       string
        rejection_note?: string
      }

    if (!draftId || !status) {
      return NextResponse.json({ error: 'draftId and status required' }, { status: 400 })
    }

    const patch: Record<string, unknown> = { status }
    if (content)        patch.body           = content
    if (rejection_note) patch.rejection_note = rejection_note
    if (status === 'sent') patch.sent_at     = new Date().toISOString()

    const res = await fetch(`${SB_URL}/rest/v1/ai_drafts?id=eq.${draftId}`, {
      method:  'PATCH',
      headers: sbHeaders('return=minimal'),
      body:    JSON.stringify(patch),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
