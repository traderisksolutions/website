/**
 * Async, non-blocking evaluation of an AI draft vs the email the human actually sent.
 * Called fire-and-forget from /api/email/send — never blocks the send response.
 *
 * Stores results in draft_evaluations.
 * If score >= 4, also stores in prompt_examples for future few-shot injection.
 */

import { fetchAttachmentContext } from '@/lib/thread-attachment-context'
import { maybeAutoSynthesize }    from '@/lib/synthesize-prompt-override'

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent'

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

// Word-set Jaccard similarity — robust to insertions/reordering (unlike positional char match,
// where a single early edit tanks the score and forces a needless Gemini call).
function wordSet(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean))
}
function wordJaccard(a: string, b: string): number {
  const sa = wordSet(a), sb = wordSet(b)
  if (sa.size === 0 && sb.size === 0) return 1
  let inter = 0
  for (const w of Array.from(sa)) if (sb.has(w)) inter++
  const union = sa.size + sb.size - inter
  return union > 0 ? inter / union : 1
}

// humanBodyOverride: the plain-text body of what was actually sent, passed directly from the
// send route so evaluation works even when thread_id is null or email_messages insert is delayed.
// aiBodyOverride: the original AI-generated body before human edits. Passed for RAG drafts because
// the ai_drafts row is created at send time with the already-edited content.
export async function runDraftEvaluation(
  draftId:           string,
  threadId:          string | null,
  humanBodyOverride?: string,
  aiBodyOverride?:    string,
): Promise<void> {
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

    // 2. Resolve the human-sent body — prefer the override (passed directly from send route),
    //    then fall back to email_messages DB lookup. The override is the reliable path when
    //    thread_id is null or the DB insert hasn't committed yet.
    let humanBody = humanBodyOverride?.trim() ?? ''

    if (!humanBody && tid) {
      const outRes = await sb<{ body_text: string }>(
        `email_messages?thread_id=eq.${encodeURIComponent(tid)}&direction=eq.outbound&order=sent_at.desc&select=body_text&limit=1`
      )
      if (!outRes.ok) {
        console.error(`[eval] outbound message fetch failed status=${outRes.status}`)
        return
      }
      humanBody = outRes.data[0]?.body_text?.trim() ?? ''
    }

    if (!humanBody) {
      console.error(`[eval] no outbound email body found for draft=${draftId} thread=${tid ?? 'null'}`)
      return
    }
    console.log(`[eval] found outbound message (${humanBody.length} chars)`)

    // Strip email signature before comparison — the sent body includes the appended signature
    // (e.g. "--\nJarod Hong\n...") but the AI draft does not. Stripping prevents artificially
    // low overlap scores that would trigger an unnecessary Gemini evaluation call.
    const sigDelimiters = ['\n--\n', '\n___\n', '\n—\n']
    for (const delim of sigDelimiters) {
      const idx = humanBody.indexOf(delim)
      if (idx > 60) { humanBody = humanBody.slice(0, idx).trim(); break }
    }

    const draft = { body: draftRow.body, email_type: emailType, thread_id: draftRow.thread_id }

    // Use override when provided (RAG drafts: original AI content before human edits)
    const aiBody = aiBodyOverride?.trim() || draft.body

    // 3. Gather FULL context so the evaluator judges the draft the way a reviewer would:
    //    the whole thread, our AI analysis (what we understood + recommended), and attachment
    //    contents (so a human fixing a figure from a PDF/Excel is understood, not mislabeled).
    let threadText = '', analysisText = '', attachmentText = ''
    if (tid) {
      const [msgsRes, sumRes, atts] = await Promise.all([
        sb<{ direction: string; from_address: string | null; body_text: string | null; sent_at: string }>(
          `email_messages?thread_id=eq.${encodeURIComponent(tid)}&order=sent_at.asc&select=direction,from_address,body_text,sent_at`
        ),
        sb<{ summary: string | null; next_action: string | null }>(
          `thread_summaries?thread_id=eq.${encodeURIComponent(tid)}&order=created_at.desc&limit=1&select=summary,next_action`
        ),
        fetchAttachmentContext(tid, 8000),
      ])
      threadText = msgsRes.data.map(m => {
        const who = m.direction === 'inbound' ? `CLIENT (${m.from_address})` : 'TRS (us)'
        return `${who}:\n${(m.body_text ?? '').slice(0, 1500)}`
      }).join('\n\n---\n\n')
      const s = sumRes.data[0]
      if (s?.summary || s?.next_action) {
        analysisText = [s?.summary && `Summary: ${s.summary}`, s?.next_action && `Recommended next action: ${s.next_action}`].filter(Boolean).join('\n')
      }
      attachmentText = atts
    }

    // Skip the Gemini call when the AI and human bodies are near-identical (no meaningful edits).
    const similarity = wordJaccard(aiBody, humanBody)
    if (similarity > 0.9) {
      console.log(`[eval] ${Math.round(similarity*100)}% word-overlap — storing 5/5 (sent as-is) without Gemini call`)
      await storeEval(draftId, tid ?? '', emailType, aiBody, humanBody,
        { substance: 5, style: 5, editType: 'none' }, {
          what_human_changed: 'No meaningful changes — sent almost as-is.',
          why_better:         'AI draft was high quality.',
          key_learning:       '',
          context_summary:    `${emailType} email handled well as drafted.`,
        }, true)
      return
    }

    // 4. Gemini evaluation call — two axes (substance vs style)
    console.log(`[eval] calling Gemini to score draft (word-overlap=${Math.round(similarity*100)}%)`)
    const evalPrompt = `You evaluate AI-generated email replies for Trade Risk Solutions, a Singapore insurance brokerage. You compare the AI's draft to what the human account executive actually sent, and extract lessons to improve future drafts.

EMAIL TYPE: ${emailType}

━━ CONVERSATION THREAD ━━
${threadText.slice(0, 6000) || '(no prior messages)'}

━━ OUR AI ANALYSIS (what the system understood + recommended) ━━
${analysisText || '(none)'}

━━ ATTACHMENT CONTENTS (documents in the thread) ━━
${attachmentText ? attachmentText.slice(0, 6000) : '(none)'}

━━ AI DRAFT (what the AI generated) ━━
${aiBody.slice(0, 3000)}

━━ HUMAN-SENT REPLY (what was actually sent) ━━
${humanBody.slice(0, 3000)}

Judge the AI draft on TWO independent axes, each 1–5 (5 = the human needed to change nothing on that axis; 1 = badly wrong / fully rewritten):
- SUBSTANCE: facts, figures, completeness, correctness, and whether it followed the recommended next action. Did the human have to fix or add real content?
- STYLE: tone, phrasing, formatting, personalisation — presentation only.

Also classify edit_type: "none" (sent ~as-is), "style" (only tone/wording changed), "substance" (facts/content changed), or "both".

Return ONLY valid JSON (no markdown fences):
{
  "substance_score": <1-5>,
  "style_score": <1-5>,
  "edit_type": "none|style|substance|both",
  "what_human_changed": "<one sentence describing the main edit>",
  "why_better": "<one sentence: what the human version did better>",
  "key_learning": "<ONE specific, actionable rule for future ${emailType} drafts, based on a SUBSTANTIVE gap. If the edit was purely stylistic/personalisation with no substantive fix, return an empty string — we do not over-train on one person's tone.>",
  "context_summary": "<2-sentence summary of this exchange — used as a label if stored>"
}`

    const evalRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents:         [{ parts: [{ text: evalPrompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: 'application/json' },
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

    const clamp = (v: unknown) => typeof v === 'number' ? Math.min(5, Math.max(1, Math.round(v))) : 0
    const substance = clamp(parsed.substance_score)
    const style     = clamp(parsed.style_score)
    if (!substance && !style) return
    const editType  = ['none', 'style', 'substance', 'both'].includes(String(parsed.edit_type)) ? String(parsed.edit_type) : 'both'

    // Store the sent reply as a few-shot ideal example when the AI was substantively strong.
    await storeEval(draftId, tid ?? '', emailType, aiBody, humanBody,
      { substance: substance || style, style: style || substance, editType }, {
        what_human_changed: String(parsed.what_human_changed ?? ''),
        why_better:         String(parsed.why_better ?? ''),
        key_learning:       String(parsed.key_learning ?? ''),
        context_summary:    String(parsed.context_summary ?? ''),
      }, (substance || style) >= 4)

    // Fully-automatic self-improvement: a substantive miss with a real learning may trigger a
    // resynthesis of this email type's drafting instructions (throttled inside).
    if ((editType === 'substance' || editType === 'both') && String(parsed.key_learning ?? '').trim().length >= 10) {
      await maybeAutoSynthesize(emailType)
    }

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
  scores: { substance: number; style: number; editType: string },
  evalJson: Record<string, string>,
  storeExample: boolean,
) {
  const h = sbH()

  // score (legacy, for existing UI/thresholds) mirrors the substance axis — the one that matters.
  await fetch(`${SB_URL}/rest/v1/draft_evaluations`, {
    method: 'POST', headers: h,
    body: JSON.stringify({
      draft_id: draftId, thread_id: threadId || null, email_type: emailType,
      ai_body: aiBody, human_body: humanBody,
      score: scores.substance, substance_score: scores.substance, style_score: scores.style, edit_type: scores.editType,
      eval_json: evalJson,
    }),
  })

  if (storeExample) {
    // Dedup: don't store a near-identical ideal reply we already have for this type — keeps the
    // few-shot pool diverse rather than repeating the same template.
    const exRes = await fetch(
      `${SB_URL}/rest/v1/prompt_examples?email_type=eq.${encodeURIComponent(emailType)}&order=created_at.desc&limit=20&select=ideal_reply`,
      { headers: { apikey: h.apikey, Authorization: h.Authorization }, cache: 'no-store' }
    )
    const existing: { ideal_reply: string | null }[] = exRes.ok ? await exRes.json() : []
    const dup = existing.some(e => e.ideal_reply && wordJaccard(e.ideal_reply, humanBody) > 0.85)
    if (!dup) {
      await fetch(`${SB_URL}/rest/v1/prompt_examples`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ email_type: emailType, context_summary: evalJson.context_summary, ideal_reply: humanBody, score: scores.substance }),
      })
    }
  }
}
