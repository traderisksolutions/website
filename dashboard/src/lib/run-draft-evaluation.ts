/**
 * Async, non-blocking evaluation of an AI draft vs the email the human actually sent.
 * Called fire-and-forget from /api/email/send — never blocks the send response.
 *
 * Stores results in draft_evaluations.
 * If score >= 4, also stores in prompt_examples for future few-shot injection.
 */

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:         k,
    Authorization:  `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:         'return=minimal',
  }
}

async function sb<T>(path: string): Promise<{ ok: boolean; data: T[]; status: number }> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbH(), cache: 'no-store' })
  const data = res.ok ? await res.json() : []
  return { ok: res.ok, status: res.status, data: Array.isArray(data) ? data : [] }
}

export async function runDraftEvaluation(draftId: string, threadId: string | null): Promise<void> {
  try {
    console.log(`[eval] starting for draft=${draftId} thread=${threadId}`)

    const geminiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL
    if (!geminiKey) {
      console.error('[eval] GEMINI_API_KEY_DRAFT_EMAIL not set — skipping')
      return
    }

    // 1. Load the AI draft (select without email_type first to avoid 400 if column missing)
    const draftRes = await sb<{ body: string; thread_id: string | null }>(
      `ai_drafts?id=eq.${draftId}&select=body,thread_id&limit=1`
    )
    if (!draftRes.ok) {
      console.error(`[eval] draft fetch failed status=${draftRes.status}`)
      return
    }
    const draftRow = draftRes.data[0]
    if (!draftRow?.body) {
      console.error(`[eval] no draft body found for id=${draftId}`)
      return
    }

    // Try to get email_type separately (column may not exist yet)
    let emailType = 'CONVERSATION'
    const etRes = await sb<{ email_type: string | null }>(
      `ai_drafts?id=eq.${draftId}&select=email_type&limit=1`
    )
    if (etRes.ok && etRes.data[0]?.email_type) emailType = etRes.data[0].email_type

    const tid = threadId ?? draftRow.thread_id
    if (!tid) {
      console.error(`[eval] no thread_id for draft=${draftId}`)
      return
    }

    // 2. Last outbound message = what the human actually sent
    const outRes = await sb<{ body_text: string }>(
      `email_messages?thread_id=eq.${encodeURIComponent(tid)}&direction=eq.outbound&order=sent_at.desc&select=body_text&limit=1`
    )
    if (!outRes.ok) {
      console.error(`[eval] outbound message fetch failed status=${outRes.status}`)
      return
    }
    const humanBody = outRes.data[0]?.body_text ?? ''
    if (!humanBody.trim()) {
      console.error(`[eval] no outbound email body found for thread=${tid}`)
      return
    }
    console.log(`[eval] found outbound message (${humanBody.length} chars)`)

    const draft = { body: draftRow.body, email_type: emailType, thread_id: draftRow.thread_id }

    // 3. Last inbound message = what the client sent (context for scoring)
    const inboundRes = await sb<{ body_text: string }>(
      `email_messages?thread_id=eq.${encodeURIComponent(tid)}&direction=eq.inbound&order=sent_at.desc&select=body_text&limit=1`
    )
    const incomingEmail = inboundRes.data[0]?.body_text ?? ''

    const aiBody = draft.body

    // Skip evaluation if the AI and human bodies are nearly identical (no edits made)
    const aiTrimmed    = aiBody.trim().replace(/\s+/g, ' ')
    const humanTrimmed = humanBody.trim().replace(/\s+/g, ' ')
    const longer  = Math.max(aiTrimmed.length, humanTrimmed.length)
    const shorter = Math.min(aiTrimmed.length, humanTrimmed.length)
    let matching = 0
    for (let i = 0; i < shorter; i++) { if (aiTrimmed[i] === humanTrimmed[i]) matching++ }
    const overlap = longer > 0 ? matching / longer : 0
    // If >95% identical, score it as a 5 without calling Gemini (saves cost)
    if (overlap > 0.95) {
      console.log(`[eval] >95% overlap — storing score=5 without Gemini call`)
      await storeEval(draftId, tid, emailType, aiBody, humanBody, 5, {
        what_human_changed: 'No meaningful changes — sent almost as-is.',
        why_better:         'AI draft was high quality.',
        key_learning:       'Continue current approach for this email type.',
        context_summary:    `${emailType} email handled well. Client email: ${incomingEmail.slice(0, 120)}`,
      }, true)
      return
    }

    // 4. Gemini evaluation call
    console.log(`[eval] calling Gemini to score draft (overlap=${Math.round(overlap*100)}%)`)
    const evalPrompt = `You evaluate AI-generated email replies for Trade Risk Solutions, a Singapore insurance brokerage.

EMAIL TYPE: ${emailType}

INCOMING CLIENT EMAIL:
${incomingEmail.slice(0, 2000)}

AI DRAFT (what the AI generated):
${aiBody.slice(0, 2000)}

HUMAN-SENT REPLY (what was actually sent after editing):
${humanBody.slice(0, 2000)}

Score the AI draft on how close it was to what the human sent (1–5):
5 = sent almost as-is — only cosmetic or punctuation edits
4 = good draft, human made small but meaningful improvements
3 = usable but human made significant rewrites, restructuring, or cuts
2 = major problems — human rewrote more than half
1 = AI draft discarded — human wrote from scratch

Return ONLY valid JSON (no markdown fences, no text outside the JSON):
{
  "score": <number 1-5>,
  "what_human_changed": "<one sentence describing the main edit>",
  "why_better": "<one sentence: what the human version did better>",
  "key_learning": "<one specific actionable rule the AI prompt should add or change for ${emailType} emails>",
  "context_summary": "<2-sentence summary of this email exchange — used as a label if this example is stored>"
}`

    const evalRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents:         [{ parts: [{ text: evalPrompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 512 },
      }),
    })
    if (!evalRes.ok) {
      console.error(`[eval] Gemini call failed status=${evalRes.status}`)
      return
    }

    const evalData = await evalRes.json()
    const raw = evalData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''

    let parsed: Record<string, unknown>
    try {
      const m = raw.match(/\{[\s\S]*\}/)
      parsed  = m ? JSON.parse(m[0]) : {}
    } catch { return }

    const score = typeof parsed.score === 'number' ? Math.min(5, Math.max(1, Math.round(parsed.score))) : 0
    if (!score) return

    await storeEval(draftId, tid, emailType, aiBody, humanBody, score, {
      what_human_changed: String(parsed.what_human_changed ?? ''),
      why_better:         String(parsed.why_better ?? ''),
      key_learning:       String(parsed.key_learning ?? ''),
      context_summary:    String(parsed.context_summary ?? ''),
    }, score >= 4)

  } catch {
    // Never surface — evaluation is non-critical
  }
}

async function storeEval(
  draftId: string,
  threadId: string,
  emailType: string,
  aiBody: string,
  humanBody: string,
  score: number,
  evalJson: Record<string, string>,
  storeExample: boolean,
) {
  const h = sbH()

  await fetch(`${SB_URL}/rest/v1/draft_evaluations`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ draft_id: draftId, thread_id: threadId, email_type: emailType, ai_body: aiBody, human_body: humanBody, score, eval_json: evalJson }),
  })

  if (storeExample) {
    await fetch(`${SB_URL}/rest/v1/prompt_examples`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ email_type: emailType, context_summary: evalJson.context_summary, ideal_reply: humanBody, score }),
    })
  }
}
