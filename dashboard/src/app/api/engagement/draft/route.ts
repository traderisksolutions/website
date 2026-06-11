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

    // ── Classify email type (spam filter + routing) ────────────────────────────
    const lastMsgText = messages.slice(-3).map(m => (m.body_text || '').slice(0, 3000)).join('\n---\n')
    const classifyPrompt = `Classify this email for a Singapore insurance brokerage. Reply with EXACTLY one word from this list:

SKIP       — spam, newsletter, promotional email, automated notification, delivery receipt, out-of-office
PRICING    — client asking for a quote, premium, or indicative cost for insurance coverage
COVERAGE   — client asking what a policy covers, whether a scenario is covered, or about exclusions/terms
RENEWAL    — renewing an existing policy, or asking about expiry/renewal options
DOCUMENT   — requesting a document (certificate of insurance, policy wording, endorsement, invoice)
CLAIMS     — reporting an incident, asking about a claim, or requesting claims assistance
CONVERSATION — general back-and-forth, follow-up, relationship email, or anything not in the above

EMAIL:
${lastMsgText}

Reply with one word only.`

    const classifyRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: classifyPrompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 12 },
      }),
    })

    const VALID_TYPES = ['PRICING', 'COVERAGE', 'RENEWAL', 'DOCUMENT', 'CLAIMS', 'CONVERSATION'] as const
    type EmailType = typeof VALID_TYPES[number]
    let emailType: EmailType = 'CONVERSATION'

    if (classifyRes.ok) {
      const classifyData = await classifyRes.json()
      const verdict = (classifyData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().toUpperCase()
      if (verdict.startsWith('SKIP')) {
        return NextResponse.json({
          error: 'not_an_enquiry',
          message: 'This email does not require a reply (newsletter, spam, or automated notification). No draft generated.',
        }, { status: 422 })
      }
      emailType = VALID_TYPES.find(t => verdict.startsWith(t)) ?? 'CONVERSATION'
    }
    console.log('[engagement/draft] email type:', emailType)

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

    // Only fetch GDrive docs when they're actually useful (pricing or coverage types)
    const needsDocs  = emailType === 'PRICING' || emailType === 'COVERAGE'
    const knowledgeDocs = needsDocs
      ? await fetchKnowledgeDocs(threadCtx + '\n' + lastInboundText, geminiKey, 'gdrive-draft')
      : []
    const hasDocs  = knowledgeDocs.length > 0
    const docNames = hasDocs ? knowledgeDocs.map(d => d.name).join(', ') : ''

    // ── Build type-specific instructions ─────────────────────────────────────
    const typeInstructions = (() => {
      switch (emailType) {
        case 'PRICING':
          return hasDocs
            ? `━━ PRICING ENQUIRY ━━
Attached documents: ${docNames}

For each attached PDF: identify the insurer name (in header/footer), find pricing relevant to the product asked about, and extract: Premium (SGD), Sum Insured, Deductible, and key conditions.

Reply structure:
1. One sentence acknowledging the specific product and parameters the client mentioned
2. "We have obtained indicative quotes for your [product] enquiry:"
   • [Insurer] — SGD [premium] premium | SGD [sum insured] covered | SGD [deductible] deductible[, key note if important]
   (one bullet per insurer with relevant pricing found in the documents)
3. One sentence recommending the best option and why
4. One sentence: what TRS does next

If a document has no pricing for the requested product, skip it.
If NO document contains relevant pricing: "We will revert with indicative pricing within 2 business days."`
            : `━━ PRICING ENQUIRY ━━
No pricing documents are attached. Write: "We will revert with indicative pricing within 2 business days."
Ask for any missing details needed to obtain a quote (coverage amount, specific risk details, etc.).`

        case 'COVERAGE':
          return hasDocs
            ? `━━ COVERAGE QUESTION ━━
Attached documents: ${docNames}

Read the documents, find the specific clause or section that answers the client's question.
- State the answer directly in the first sentence after the greeting
- Quote the relevant coverage detail or exclusion and name the source document
- If no document answers it: "We will check your policy wording and revert within 2 business days."
- 2–3 sentences unless the client asked multiple distinct questions`
            : `━━ COVERAGE QUESTION ━━
No policy documents are attached.
- Answer from general knowledge only if certain
- If uncertain: "We will check your policy wording and revert within 2 business days."
- 2–3 sentences maximum`

        case 'RENEWAL':
          return `━━ RENEWAL ━━
- If TRS doesn't yet have renewal terms: ask for the policy details needed — current insurer, sum insured, expiry date, any changes to the risk (new locations, headcount changes, fleet additions, etc.)
- If renewal terms are already in the thread: confirm next steps clearly
- 2–3 short sentences`

        case 'DOCUMENT':
          return `━━ DOCUMENT REQUEST ━━
- Confirm what they need and when TRS will provide it: "We will send your [document type] by [end of day / within 24 hours]."
- If you cannot identify the specific document from the thread: ask one focused clarifying question
- 2–3 sentences maximum — do not over-explain`

        case 'CLAIMS':
          return `━━ CLAIMS ━━
- One sentence acknowledging the situation (brief, calm, no drama)
- Ask for what TRS needs: date of incident, policy number (if known), brief description of what happened, estimated amount of loss/damage
- Do NOT promise or imply anything about coverage, liability, or outcome
- 2–3 sentences`

        default: // CONVERSATION
          return `━━ CONVERSATION / FOLLOW-UP ━━
- Continue the thread naturally — respond to what was actually asked or said
- Match the tone and length of the client's latest message. If they wrote 2 sentences, write 2–3 back.
- 1–3 sentences is usually enough
- If they asked a direct question, answer it in the first sentence`
      }
    })()

    // ── Single-pass drafter ───────────────────────────────────────────────────
    const drafterPrompt = `You are an email assistant for Trade Risk Solutions (TRS), a Singapore insurance brokerage. You draft replies that Account Executives review and send. Replies must read like a senior AE wrote them — direct, specific, no filler.
${campaignCtxStr}
${typeInstructions}

━━ UNIVERSAL RULES ━━
- Start with exactly "${salutation}"
- Lead immediately with the answer or action — no warm-up sentences
- BANNED PHRASES (never use): "Thank you for reaching out / contacting us / your email", "We hope this email finds you well", "Please do not hesitate to contact us", "I trust this answers your query", "Please be advised", "Kindly note", "As per our conversation", "As always, we appreciate"
- Match brevity to the thread: if the client wrote 2 sentences, write 2–3 back. Don't over-explain.
- Short sentences — aim for 15–20 words max
- 2–5 paragraphs maximum
- End with exactly: "Best regards,\nTrade Risk Solutions"
- Body text only — no subject line
- Only cite figures or coverage terms you can read directly from the attached documents — never fabricate

━━ CLIENT DETAILS ━━
- Name: ${hasRealName ? contactName : '(unknown)'}
- Email: ${contactEmail ?? '—'}
- Company: ${company || '(unknown)'}
- Thread subject: ${threadSubject}

━━ CLIENT'S LATEST EMAIL (respond to this) ━━
${lastInboundText}

━━ THREAD HISTORY (read for full context) ━━
${threadCtx || '(no prior messages)'}

Write only the email body starting with "${salutation}".`

    const drafterParts: unknown[] = knowledgeDocs.map(d => ({ file_data: { mime_type: 'application/pdf', file_uri: d.uri } }))
    drafterParts.push({ text: drafterPrompt })

    const drafterRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: drafterParts }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
    })

    if (!drafterRes.ok) {
      const errText = await drafterRes.text()
      console.error('[engagement/draft] Gemini drafter error:', drafterRes.status, errText)
      return NextResponse.json({ error: `Gemini ${drafterRes.status}: ${errText.slice(0, 300)}` }, { status: 502 })
    }
    const drafterData = await drafterRes.json()
    void logGeminiUsage('draft_reply_drafter', drafterData.usageMetadata ?? {}, threadId)
    const content = drafterData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
    if (!content) {
      const reason = drafterData?.candidates?.[0]?.finishReason ?? JSON.stringify(drafterData).slice(0, 200)
      return NextResponse.json({ error: `Gemini drafter returned no content (${reason})` }, { status: 502 })
    }

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
