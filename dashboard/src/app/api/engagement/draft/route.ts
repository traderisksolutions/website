import { NextRequest, NextResponse } from 'next/server'
import { logGeminiUsage }           from '@/lib/gemini-usage'
import { fetchKnowledgeDocs }       from '@/lib/gdrive-knowledge'

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
    const { leadId, contactName, contactEmail, company, topic, threadId, messages, manualContent } =
      await req.json() as {
        leadId:         string
        contactName:    string
        contactEmail:   string | null
        company:        string | null
        topic:          string | null
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
    const hasRealName = contactName && !contactName.includes('@')
    const firstName   = hasRealName ? contactName.split(' ')[0] : null
    const salutation  = firstName ? `Dear ${firstName},` : 'Dear Sir/Madam,'

    // ── Pre-classification: skip drafting for newsletters / spam / non-enquiries ─
    const lastMsgText = messages.slice(-3).map(m => (m.body_text || '').slice(0, 3000)).join('\n---\n')
    const classifyPrompt = `Is this email a genuine insurance enquiry that requires a professional reply from a Singapore brokerage?

Reply with exactly one word: YES or NO.

Classify as NO if it is: a forwarded newsletter, promotional content, marketing email, spam, automated notification, delivery receipt, out-of-office, or accidental forward with no real insurance question.

EMAIL:
${lastMsgText}`

    const classifyRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: classifyPrompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 4 },
      }),
    })
    if (classifyRes.ok) {
      const classifyData = await classifyRes.json()
      const verdict = (classifyData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().toUpperCase()
      if (verdict.startsWith('NO')) {
        return NextResponse.json({
          error: 'not_an_enquiry',
          message: 'This email does not appear to be a genuine insurance enquiry (newsletter, spam, or accidental forward). No draft generated.',
        }, { status: 422 })
      }
    }

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
        const body = (m.body_text || '').slice(0, 4000)
        return `[${date}] ${who}:\n${body}`
      })
      .join('\n\n---\n\n')

    // Thread subject for additional context (topic comes from the lead/thread metadata)
    const threadSubject = topic || ''

    const lastInboundText = lastInbound ? (lastInbound.body_text || '').slice(0, 12000) : '(no inbound message found)'

    // Fetch relevant GDrive knowledge docs and upload to Gemini file API
    const knowledgeDocs = await fetchKnowledgeDocs(threadCtx + '\n' + lastInboundText, geminiKey, 'gdrive-draft')
    const docsNote = knowledgeDocs.length > 0
      ? `ATTACHED KNOWLEDGE DOCUMENTS: ${knowledgeDocs.map(d => d.name).join(', ')}\nRead the attached PDFs. If they contain specific figures for this enquiry (premiums, coverage limits, deductibles, exclusions), quote them precisely and name the document. Example: "Based on our Marine Cargo schedule, the premium is SGD X for coverage up to SGD Y." If no attached document covers the specific information, write: "We will revert with specific terms within 2 business days."`
      : 'No knowledge documents available. Do not fabricate figures. Write: "We will revert with specific terms within 2 business days."'

    // ── Agent 1: Drafter — write a complete, accurate reply ──────────────────
    const drafterPrompt = `You are an email assistant for Trade Risk Solutions (TRS), a Singapore insurance brokerage.

Write a concise, direct reply from TRS to the client's latest email.
${campaignCtxStr}
RULES:
- Start with exactly "${salutation}"
- Lead immediately with the key answer — pricing quote, coverage confirmation, or main action point. No warm-up sentences.
- Address every question the client raised — no omissions.
- State one clear next step (what TRS will do and by when).
- Tone: professional, direct, Singaporean business English.
- End with: "Best regards,\nTrade Risk Solutions"
- Body text only — no subject line.
- NEVER use: "Thank you for reaching out / contacting us", "We hope this email finds you well", "Please do not hesitate to contact us", "I trust this answers your query", or any other filler phrases.

${docsNote}

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

    const drafterParts: unknown[] = knowledgeDocs.map(d => ({ file_data: { mime_type: 'application/pdf', file_uri: d.uri } }))
    drafterParts.push({ text: drafterPrompt })

    const drafterRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: drafterParts }],
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

    // ── Agent 2: Editor — sharpen, remove filler, enforce structure ─────────
    const editorPrompt = `You are a professional email editor for Trade Risk Solutions (TRS).

Edit the draft reply below. Be ruthless about conciseness.

EDITING RULES:
1. REMOVE all filler phrases:
   - "Thank you for reaching out / your email / contacting us"
   - "We hope this email / message finds you well"
   - "Please feel free to / do not hesitate to contact us"
   - "I trust this answers your query"
   - "As always, we appreciate your…"
   - Any sentence that restates what the client already said without adding new information

2. LEAD with the answer — if the draft buries pricing, a quote, or coverage details after filler, move them to the first sentence after the greeting.

3. KEEP all substantive content: pricing figures, coverage limits, document citations, specific dates, amounts, next steps. Do not drop any.

4. LENGTH — match to complexity:
   - Single question or simple acknowledgement → 2–4 sentences total
   - Standard enquiry (1–2 topics) → 2–3 sentences per topic, 1 paragraph each
   - Detailed multi-topic email → 3–4 short paragraphs maximum

5. Preserve exactly: the greeting "${salutation}" and closing "Best regards,\nTrade Risk Solutions"

6. Output ONLY the final email body. No commentary, no preamble.

DRAFT TO EDIT:
${rawDraft}

CLIENT'S EMAIL (every question here must still be answered in the output):
${lastInboundText}`

    const editorRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: editorPrompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
    })

    if (!editorRes.ok) {
      // Editor failed — fall back to raw draft rather than erroring
      console.warn('[engagement/draft] Gemini editor failed — using raw draft')
    }
    const editorData   = editorRes.ok ? await editorRes.json() : null
    if (editorData) void logGeminiUsage('draft_reply_editor', editorData.usageMetadata ?? {}, threadId)
    const editorFinish = editorData?.candidates?.[0]?.finishReason ?? ''
    const editorText   = editorData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
    // Fall back to rawDraft if editor was truncated (MAX_TOKENS) or returned nothing
    const content = (editorText && editorFinish !== 'MAX_TOKENS') ? editorText : rawDraft

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
