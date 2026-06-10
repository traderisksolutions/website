import { NextRequest, NextResponse } from 'next/server'
import { logGeminiUsage }           from '@/lib/gemini-usage'

const SB_URL    = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

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

// GET /api/engagement/draft?thread_id=X or ?contactId=X
// Returns the latest pending/approved draft for a thread or contact.
export async function GET(req: NextRequest) {
  try {
    const sp       = new URL(req.url).searchParams
    const threadId = sp.get('thread_id')
    const contactId = sp.get('contactId')

    let url: string
    if (threadId) {
      url = `${SB_URL}/rest/v1/ai_drafts?thread_id=eq.${encodeURIComponent(threadId)}&status=in.(pending,approved)&order=created_at.desc&limit=1`
    } else if (contactId) {
      url = `${SB_URL}/rest/v1/ai_drafts?contact_id=eq.${contactId}&status=in.(pending,approved)&order=created_at.desc&limit=5`
    } else {
      return NextResponse.json([])
    }

    const res  = await fetch(url, { headers: sbHeaders(), cache: 'no-store' })
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
      // Upsert then fetch (merge-duplicates returns empty when row exists — always re-fetch)
      await fetch(`${SB_URL}/rest/v1/contacts?on_conflict=email`, {
        method:  'POST',
        headers: sbHeaders('return=minimal,resolution=merge-duplicates'),
        body:    JSON.stringify({ email: contactEmail, source: 'email' }),
      })
      const cFetch    = await fetch(`${SB_URL}/rest/v1/contacts?email=eq.${encodeURIComponent(contactEmail)}&select=id&limit=1`, { headers: sbHeaders(), cache: 'no-store' })
      const cRows     = cFetch.ok ? await cFetch.json() : []
      const contactId = Array.isArray(cRows) ? (cRows[0]?.id ?? null) : null
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

    // Resolve a human-readable greeting name
    // If contactName is just an email address, fall back to generic salutation
    const hasRealName   = contactName && !contactName.includes('@')
    const salutation    = hasRealName ? `Dear ${contactName.split(' ')[0]},` : 'Dear Sir/Madam,'

    // Fetch campaign context if this thread came from a campaign reply
    let campaignCtxStr = ''
    if (threadId) {
      try {
        const ctxRes = await fetch(
          `${SB_URL}/rest/v1/email_threads?id=eq.${encodeURIComponent(threadId)}&select=campaign_context&limit=1`,
          { headers: sbHeaders(), cache: 'no-store' }
        )
        const ctxRows = ctxRes.ok ? await ctxRes.json() : []
        const ctx = ctxRows[0]?.campaign_context
        if (ctx?.campaign_name) {
          campaignCtxStr = `\nCAMPAIGN CONTEXT: This contact replied to a TRS cold outreach campaign "${ctx.campaign_name}" (${ctx.product_type} focus${ctx.step_replied_to ? `, step ${ctx.step_replied_to}` : ''}). This is their first real engagement — acknowledge their interest warmly and continue naturally. Do NOT explicitly reference the campaign or that this was a cold email.`
        }
      } catch { /* non-fatal — proceed without context */ }
    }

    // Build thread context — last 15 messages, 1500 chars each, with dates
    const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound')
    const recentMsgs  = messages.slice(-15)

    const threadCtx = recentMsgs
      .map(m => {
        const who  = m.direction === 'inbound' ? `CLIENT (${m.from_address})` : 'TRS (us)'
        const date = m.sent_at ? new Date(m.sent_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
        const body = (m.body_text || '').slice(0, 1500)
        return `[${date}] ${who}:\n${body}`
      })
      .join('\n\n---\n\n')

    // Thread subject for additional context (topic comes from the lead/thread metadata)
    const threadSubject = topic || ''

    const lastInboundText = lastInbound ? (lastInbound.body_text || '').slice(0, 2000) : '(no inbound message found)'

    // ── Agent 1: Drafter — write a complete, accurate reply ──────────────────
    const drafterPrompt = `You are an email assistant for Trade Risk Solutions (TRS), a Singapore insurance brokerage.

Write a complete professional reply from TRS to the client's latest email.
${campaignCtxStr}
RULES:
- Start with exactly "${salutation}"
- Respond to EVERYTHING the client asked or mentioned — do not omit any point
- Confirm receipt of any documents or attachments specifically mentioned
- State clearly what TRS will do next (review, revert, arrange meeting, etc.)
- Tone: professional, warm, Singaporean business English
- End with: "Best regards,\nTrade Risk Solutions"
- Body text only — no subject line, no meta-commentary

CLIENT DETAILS:
- Name: ${hasRealName ? contactName : '(unknown)'}
- Email: ${contactEmail ?? '—'}
- Company: ${company || '(unknown)'}
- Thread subject: ${threadSubject}

CLIENT'S LATEST EMAIL (respond to this):
${lastInboundText}

THREAD HISTORY (background context only):
${threadCtx || '(no prior messages)'}

Write only the email body starting with "${salutation}".`

    const drafterRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: drafterPrompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
      }),
    })

    if (!drafterRes.ok) {
      const errText = await drafterRes.text()
      console.error('[engagement/draft] Gemini drafter error:', drafterRes.status, errText)
      return NextResponse.json({ error: `Gemini ${drafterRes.status}: ${errText.slice(0, 300)}` }, { status: 502 })
    }
    const drafterData = await drafterRes.json()
    void logGeminiUsage('draft_reply_drafter', drafterData.usageMetadata ?? {}, threadId)
    const rawDraft = drafterData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    if (!rawDraft) {
      const reason = drafterData?.candidates?.[0]?.finishReason ?? JSON.stringify(drafterData).slice(0, 200)
      return NextResponse.json({ error: `Gemini drafter returned no content (${reason})` }, { status: 502 })
    }

    // ── Agent 2: Editor — trim to natural, context-appropriate length ────────
    const editorPrompt = `You are a professional email editor for Trade Risk Solutions (TRS).

Edit the draft reply below to make it concise and natural. Apply these rules:

EDITING RULES:
- Remove repetition, filler, and unnecessary elaboration
- KEEP all key information: what was received, what TRS will do next, any specific details (names, dates, amounts)
- Match length to complexity:
    • Simple acknowledgement or single-question email → 2-4 sentences
    • Standard enquiry with 1-2 topics → 1-2 short paragraphs
    • Complex multi-topic or detailed email → 2-3 paragraphs maximum
- Preserve the exact greeting "${salutation}" and the closing "Best regards,\nTrade Risk Solutions"
- Natural business English — not stiff or corporate-sounding
- Output ONLY the final email body. No commentary, no "Here is the edited version:", nothing else.

DRAFT TO EDIT:
${rawDraft}

CLIENT'S EMAIL (for context on what must be addressed):
${lastInboundText}`

    const editorRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: editorPrompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
      }),
    })

    if (!editorRes.ok) {
      // Editor failed — fall back to raw draft rather than erroring
      console.warn('[engagement/draft] Gemini editor failed — using raw draft')
    }
    const editorData = editorRes.ok ? await editorRes.json() : null
    if (editorData) void logGeminiUsage('draft_reply_editor', editorData.usageMetadata ?? {}, threadId)
    const content = editorData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || rawDraft

    // Upsert contact then re-fetch by email to get ID reliably.
    // merge-duplicates returns empty when the row already exists — never rely on its response body.
    let contactId: string | null = null
    if (contactEmail) {
      await fetch(`${SB_URL}/rest/v1/contacts?on_conflict=email`, {
        method:  'POST',
        headers: sbHeaders('return=minimal,resolution=merge-duplicates'),
        body:    JSON.stringify({ email: contactEmail, source: 'email' }),
      })
      const cFetch = await fetch(
        `${SB_URL}/rest/v1/contacts?email=eq.${encodeURIComponent(contactEmail)}&select=id&limit=1`,
        { headers: sbHeaders(), cache: 'no-store' }
      )
      const cRows = cFetch.ok ? await cFetch.json() : []
      contactId = Array.isArray(cRows) ? (cRows[0]?.id ?? null) : null

      if (contactId && leadId) {
        await fetch(`${SB_URL}/rest/v1/inbound_leads?id=eq.${leadId}`, {
          method:  'PATCH',
          headers: sbHeaders('return=minimal'),
          body:    JSON.stringify({ contact_id: contactId }),
        })
      }
    }

    // Fallback chain when contactEmail is null (thread stored without a resolved contact).
    // Tries three sources in order: thread.contact_id → email_participants → email_messages.
    if (!contactId && threadId) {
      const isInternalAddr = (e: string) => e.toLowerCase().endsWith('@trade-risksol.com')
      const isAutomatedAddr = (e: string) => {
        const l = e.toLowerCase()
        return l.includes('noreply') || l.includes('no-reply') || l.includes('mailer-daemon') || l.includes('postmaster')
      }
      const isUsable = (e: string) => e && !isInternalAddr(e) && !isAutomatedAddr(e)

      // 1. thread.contact_id → contacts table
      const tRes = await fetch(
        `${SB_URL}/rest/v1/email_threads?id=eq.${encodeURIComponent(threadId)}&select=contact_id&limit=1`,
        { headers: sbHeaders(), cache: 'no-store' }
      )
      const tRows = tRes.ok ? await tRes.json() : []
      const threadContactId: string | null = Array.isArray(tRows) ? (tRows[0]?.contact_id ?? null) : null
      if (threadContactId) {
        contactId = threadContactId
      }

      // Helper: upsert contact by email and return its ID (two-step — merge-duplicates returns empty for existing rows)
      const upsertAndGetId = async (email: string): Promise<string | null> => {
        await fetch(`${SB_URL}/rest/v1/contacts?on_conflict=email`, {
          method:  'POST',
          headers: sbHeaders('return=minimal,resolution=merge-duplicates'),
          body:    JSON.stringify({ email, source: 'email' }),
        })
        const r = await fetch(`${SB_URL}/rest/v1/contacts?email=eq.${encodeURIComponent(email)}&select=id&limit=1`, { headers: sbHeaders(), cache: 'no-store' })
        const rows = r.ok ? await r.json() : []
        return Array.isArray(rows) ? (rows[0]?.id ?? null) : null
      }

      // 2. email_participants for this thread — first external address
      if (!contactId) {
        const pRes = await fetch(
          `${SB_URL}/rest/v1/email_participants?thread_id=eq.${encodeURIComponent(threadId)}&select=email,contact_id&order=id.asc`,
          { headers: sbHeaders(), cache: 'no-store' }
        )
        const parts: { email: string | null; contact_id: string | null }[] = pRes.ok ? await pRes.json() : []
        for (const p of Array.isArray(parts) ? parts : []) {
          if (p.contact_id) { contactId = p.contact_id; break }
          if (p.email && isUsable(p.email)) {
            const id = await upsertAndGetId(p.email)
            if (id) { contactId = id; break }
          }
        }
      }

      // 3. email_messages inbound from_address
      if (!contactId) {
        const mRes = await fetch(
          `${SB_URL}/rest/v1/email_messages?thread_id=eq.${encodeURIComponent(threadId)}&direction=eq.inbound&select=from_address&order=sent_at.asc&limit=5`,
          { headers: sbHeaders(), cache: 'no-store' }
        )
        const msgs: { from_address: string | null }[] = mRes.ok ? await mRes.json() : []
        for (const msg of Array.isArray(msgs) ? msgs : []) {
          if (msg.from_address && isUsable(msg.from_address)) {
            const id = await upsertAndGetId(msg.from_address)
            if (id) { contactId = id; break }
          }
        }
      }

      // 4. Parse body_text of all messages for external To:/Cc: addresses.
      //    Catches forwarded emails where the external contact only appears inside the body
      //    (e.g. "To: Carolyn.tan@chubb.com" in a forwarded chain).
      if (!contactId) {
        const bRes = await fetch(
          `${SB_URL}/rest/v1/email_messages?thread_id=eq.${encodeURIComponent(threadId)}&select=body_text&limit=10`,
          { headers: sbHeaders(), cache: 'no-store' }
        )
        const bodyMsgs: { body_text: string | null }[] = bRes.ok ? await bRes.json() : []
        const allBodyText = bodyMsgs.map(m => m.body_text ?? '').join('\n')
        const lineRe = /^(?:To|Cc|CC):[^\n]+/gim
        let lm: RegExpExecArray | null
        outer: while ((lm = lineRe.exec(allBodyText)) !== null) {
          const emails = lm[0].match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[a-z]{2,}/g) ?? []
          for (const e of emails) {
            if (isUsable(e)) {
              const id = await upsertAndGetId(e)
              if (id) { contactId = id; break outer }
            }
          }
        }
      }
    }

    if (!contactId) {
      return NextResponse.json({ error: 'Could not resolve contact_id — lead has no email' }, { status: 400 })
    }

    // Supersede any existing pending drafts for this thread so only the latest is shown
    if (threadId) {
      await fetch(`${SB_URL}/rest/v1/ai_drafts?thread_id=eq.${encodeURIComponent(threadId)}&status=eq.pending`, {
        method:  'PATCH',
        headers: sbHeaders('return=minimal'),
        body:    JSON.stringify({ status: 'superseded' }),
      })
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
