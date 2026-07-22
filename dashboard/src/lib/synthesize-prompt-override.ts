/**
 * Self-improvement synthesis: turn accumulated draft evaluations (substantive human edits) into
 * a rewritten instruction block per email type, stored in prompt_overrides. The drafters pick the
 * NEWEST override for a type. We INSERT (never delete) so overrides are versioned — a bad
 * auto-synthesis is one delete-newest away from rollback.
 *
 * Used by:
 *  - /api/engagement/improve-prompt (manual "synthesise now" button) → synthesizeAllPromptOverrides
 *  - run-draft-evaluation (fully automatic) → maybeAutoSynthesize after enough substantive misses
 */

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'

// How many new substantive-miss evals must accumulate (since the last override for a type)
// before we auto-resynthesise that type. Keeps Gemini calls bounded.
export const AUTO_SYNTH_THRESHOLD = 3

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

export const VALID_TYPES = ['PRICING', 'COVERAGE', 'RENEWAL', 'DOCUMENT', 'CLAIMS', 'CONVERSATION'] as const
type EmailType = typeof VALID_TYPES[number]

const BASE_INSTRUCTIONS: Record<EmailType, string> = {
  PRICING: `━━ PRICING ENQUIRY ━━
The retrieved knowledge passages may contain premium figures, coverage limits, or deductibles.
If pricing figures are present, structure as bullet points:
  • [Insurer] — SGD [premium] premium | SGD [sum insured] covered | SGD [deductible] deductible
After the bullets, recommend the best option and why.
If no pricing data in the retrieved knowledge: "We will revert with indicative pricing within 2 business days."
Ask for any missing details needed to obtain a quote (coverage amount, specific risk details, etc.).`,
  COVERAGE: `━━ COVERAGE QUESTION ━━
Answer directly in the first sentence. Quote the relevant passage from the retrieved knowledge and name the source.
If no passage answers the question: "We will check your policy wording and revert within 2 business days."
2–3 sentences unless the client asked multiple distinct questions.`,
  RENEWAL: `━━ RENEWAL ━━
Ask for: current insurer, sum insured, expiry date, any changes to the risk (new locations, headcount changes, fleet additions, etc.)
If renewal terms are already in the thread: confirm next steps clearly.
2–3 short sentences.`,
  DOCUMENT: `━━ DOCUMENT REQUEST ━━
Confirm what they need and when TRS will provide it: "We will send your [document type] by [end of day / within 24 hours]."
If you cannot identify the specific document from the thread: ask one focused clarifying question.
2–3 sentences maximum — do not over-explain.`,
  CLAIMS: `━━ CLAIMS ━━
One sentence acknowledging the situation (brief, calm, no drama).
Ask for: date of incident, policy number (if known), brief description of what happened, estimated amount of loss/damage.
Do NOT promise or imply anything about coverage, liability, or outcome.
2–3 sentences.`,
  CONVERSATION: `━━ CONVERSATION / FOLLOW-UP ━━
Continue the thread naturally — respond to what was actually asked or said.
Match the tone and length of the client's latest message. If they wrote 2 sentences, write 2–3 back.
1–3 sentences is usually enough.
If they asked a direct question, answer it in the first sentence.`,
}

type EvalRow = {
  score: number
  created_at?: string
  eval_json: { key_learning?: string; why_better?: string; what_human_changed?: string } | null
}

// Substantive-signal evals for a type: score ≤ 4 with a non-empty key_learning (style-only edits
// leave key_learning empty, so they're naturally excluded).
async function fetchLearnings(emailType: string, sinceIso?: string): Promise<EvalRow[]> {
  const since = sinceIso ? `&created_at=gt.${encodeURIComponent(sinceIso)}` : ''
  const res = await fetch(
    `${SB_URL}/rest/v1/draft_evaluations?email_type=eq.${encodeURIComponent(emailType)}&score=lte.4${since}&order=created_at.desc&limit=100&select=score,created_at,eval_json`,
    { headers: sbH('return=representation'), cache: 'no-store' }
  )
  const rows: EvalRow[] = res.ok ? await res.json() : []
  return rows.filter(r => (r.eval_json?.key_learning?.trim().length ?? 0) >= 10)
}

// Rewrite + store the override for ONE email type. Returns whether it wrote a new override.
export async function synthesizePromptOverride(
  emailType: string,
): Promise<{ ok: boolean; synthesized: boolean; count: number; override_text?: string; reason?: string }> {
  const key = process.env.GEMINI_API_KEY_DRAFT_EMAIL
  if (!key) return { ok: false, synthesized: false, count: 0, reason: 'no gemini key' }

  const items = await fetchLearnings(emailType)
  if (items.length === 0) return { ok: true, synthesized: false, count: 0, reason: 'no signal' }

  const baseInstruction = BASE_INSTRUCTIONS[emailType as EmailType]
    ?? `━━ ${emailType} ━━\nGeneral guidance for ${emailType} emails: be accurate, concise and professional; follow TRS house style; never invent figures or coverage.`

  const learningsText = items.map(it =>
    `[Score ${it.score}/5] ${it.eval_json?.key_learning?.trim()}` +
    (it.eval_json?.why_better  ? ` | Why human was better: ${it.eval_json.why_better}` : '') +
    (it.eval_json?.what_human_changed ? ` | What changed: ${it.eval_json.what_human_changed}` : '')
  ).join('\n')

  const prompt = `You are a prompt engineer improving an AI email assistant for TRS, a Singapore insurance brokerage.

The assistant drafts replies for Account Executives handling ${emailType} enquiries, following a specific instruction block.

CURRENT INSTRUCTION BLOCK:
${baseInstruction}

OBSERVED LEARNINGS (${items.length} cases where humans made SUBSTANTIVE edits to the AI draft, most recent first):
${learningsText}

Task: Rewrite the instruction block to incorporate what the learnings reveal. Output a single, clean, complete instruction block that replaces the current one — not rules appended on top.

Requirements:
- Keep the ━━ ${emailType} ━━ header
- Preserve current instructions that are still correct; update/remove ones the learnings contradict
- Integrate learnings as concrete, specific adjustments
- Imperative style, self-contained, no preamble/explanation, max 10 lines

Output ONLY the rewritten instruction block, starting with ━━ ${emailType} ━━:`

  const gemRes = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.15, maxOutputTokens: 512 } }),
  })
  if (!gemRes.ok) return { ok: false, synthesized: false, count: items.length, reason: `gemini ${gemRes.status}` }
  const gemData = await gemRes.json()
  const overrideText = (gemData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
  if (!overrideText || overrideText.length < 20) return { ok: false, synthesized: false, count: items.length, reason: 'empty synthesis' }

  // INSERT (no delete) — the drafter picks the newest; older rows remain as versioned history.
  // Set synthesized_at explicitly: newest-wins ordering AND the auto-synthesis throttle window
  // both depend on it, so we don't rely on a DB default being present.
  await fetch(`${SB_URL}/rest/v1/prompt_overrides`, {
    method: 'POST', headers: sbH(),
    body: JSON.stringify({ email_type: emailType, override_text: overrideText, source_eval_count: items.length, synthesized_at: new Date().toISOString() }),
  })

  return { ok: true, synthesized: true, count: items.length, override_text: overrideText }
}

// Manual "synthesise now": rebuild every type that currently has signal.
export async function synthesizeAllPromptOverrides(): Promise<{ ok: boolean; synthesised: number; results: { email_type: string; count: number }[] }> {
  const evalsRes = await fetch(
    `${SB_URL}/rest/v1/draft_evaluations?score=lte.4&order=created_at.desc&limit=200&select=email_type,eval_json`,
    { headers: sbH('return=representation'), cache: 'no-store' }
  )
  const evals: { email_type: string | null; eval_json: { key_learning?: string } | null }[] = evalsRes.ok ? await evalsRes.json() : []
  const types = new Set<string>()
  for (const e of evals) {
    if ((e.eval_json?.key_learning?.trim().length ?? 0) >= 10) types.add(e.email_type ?? 'CONVERSATION')
  }

  const results: { email_type: string; count: number }[] = []
  for (const t of Array.from(types)) {
    const r = await synthesizePromptOverride(t)
    if (r.synthesized) results.push({ email_type: t, count: r.count })
  }
  return { ok: true, synthesised: results.length, results }
}

// Fully-automatic trigger: after enough NEW substantive misses since the last override for a
// type, resynthesise it. The "since last override" window self-throttles (a fresh override
// resets the window to zero). Never throws — called from the fire-and-forget eval.
export async function maybeAutoSynthesize(emailType: string): Promise<void> {
  try {
    const lastRes = await fetch(
      `${SB_URL}/rest/v1/prompt_overrides?email_type=eq.${encodeURIComponent(emailType)}&order=synthesized_at.desc&limit=1&select=synthesized_at`,
      { headers: sbH('return=representation'), cache: 'no-store' }
    )
    const lastSynth: string | undefined = (lastRes.ok ? await lastRes.json() : [])[0]?.synthesized_at
    const newLearnings = await fetchLearnings(emailType, lastSynth)
    if (newLearnings.length >= AUTO_SYNTH_THRESHOLD) {
      console.log(`[eval] auto-synthesis: ${newLearnings.length} new substantive learnings for ${emailType} — resynthesising`)
      await synthesizePromptOverride(emailType)
    }
  } catch { /* non-critical */ }
}
