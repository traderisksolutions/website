import { NextResponse } from 'next/server'

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

const VALID_TYPES = ['PRICING', 'COVERAGE', 'RENEWAL', 'DOCUMENT', 'CLAIMS', 'CONVERSATION'] as const
type EmailType = typeof VALID_TYPES[number]

// The hardcoded baseline instruction per type — used as the starting template for rewrites
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

// GET — fetch current synthesised instruction overrides
export async function GET() {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/prompt_overrides?order=synthesized_at.desc&select=id,email_type,override_text,synthesized_at,source_eval_count`,
      { headers: sbH('return=representation'), cache: 'no-store' }
    )
    const data = res.ok ? await res.json() : []
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

// POST — synthesise all evaluations → rewrite full typeInstructions per email type → store in prompt_overrides
export async function POST() {
  const key = process.env.GEMINI_API_KEY_DRAFT_EMAIL
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY_DRAFT_EMAIL not set' }, { status: 500 })

  try {
    // 1. Fetch all evaluations that carry signal (score 1–4)
    const evalsRes = await fetch(
      `${SB_URL}/rest/v1/draft_evaluations?score=lte.4&order=created_at.desc&limit=100&select=email_type,score,eval_json`,
      { headers: sbH('return=representation'), cache: 'no-store' }
    )
    type EvalRow = {
      email_type: string | null
      score: number
      eval_json: { key_learning?: string; why_better?: string; what_human_changed?: string } | null
    }
    const evals: EvalRow[] = evalsRes.ok ? await evalsRes.json() : []
    if (!evals.length) return NextResponse.json({ error: 'No evaluations found to learn from' }, { status: 400 })

    // 2. Group by email type
    const byType: Record<string, { score: number; learning: string; why: string; what: string }[]> = {}
    for (const e of evals) {
      const t = (e.email_type ?? 'CONVERSATION') as EmailType
      const l = e.eval_json?.key_learning?.trim()
      if (!l || l.length < 10) continue
      if (!byType[t]) byType[t] = []
      byType[t].push({
        score:    e.score,
        learning: l,
        why:      e.eval_json?.why_better ?? '',
        what:     e.eval_json?.what_human_changed ?? '',
      })
    }

    const results: { email_type: string; override_text: string; count: number }[] = []

    // 3. For each type with signal, rewrite the full instruction block
    for (const emailType of VALID_TYPES) {
      const items = byType[emailType] ?? []
      if (items.length === 0) continue

      const baseInstruction = BASE_INSTRUCTIONS[emailType]
      const learningsText = items
        .map(it =>
          `[Score ${it.score}/5] ${it.learning}` +
          (it.why  ? ` | Why human was better: ${it.why}` : '') +
          (it.what ? ` | What changed: ${it.what}` : '')
        )
        .join('\n')

      const prompt = `You are a prompt engineer improving an AI email assistant for TRS, a Singapore insurance brokerage.

The assistant drafts replies for Account Executives handling ${emailType} enquiries. It is told to follow a specific instruction block that shapes how it writes each reply type.

CURRENT INSTRUCTION BLOCK (what the AI currently follows):
${baseInstruction}

OBSERVED LEARNINGS (${items.length} cases where humans significantly edited the AI draft, most recent first):
${learningsText}

Task: Rewrite the instruction block to incorporate what the learnings reveal. The output should be a single, clean, complete instruction block that replaces the current one — not a list of rules appended on top.

Requirements:
- Keep the same ━━ ${emailType} ━━ header format
- Preserve any current instructions that are still correct
- Integrate the learnings as concrete, specific adjustments to the existing instructions
- Remove or update any guidance that the learnings contradict
- Write in the same imperative style as the current block
- The result should be self-contained — no preamble, no explanation, no "here is the rewrite"
- Maximum 10 lines

Output ONLY the rewritten instruction block, starting with ━━ ${emailType} ━━:`

      const gemRes = await fetch(`${GEMINI_URL}?key=${key}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents:         [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.15, maxOutputTokens: 512 },
        }),
      })

      if (!gemRes.ok) continue
      const gemData = await gemRes.json()
      const overrideText = (gemData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
      if (!overrideText || overrideText.length < 20) continue

      // 4. Replace existing override for this email type
      await fetch(`${SB_URL}/rest/v1/prompt_overrides?email_type=eq.${emailType}`, {
        method:  'DELETE',
        headers: sbH(),
      })
      await fetch(`${SB_URL}/rest/v1/prompt_overrides`, {
        method:  'POST',
        headers: sbH(),
        body:    JSON.stringify({
          email_type:        emailType,
          override_text:     overrideText,
          source_eval_count: items.length,
        }),
      })

      results.push({ email_type: emailType, override_text: overrideText, count: items.length })
    }

    return NextResponse.json({ ok: true, synthesised: results.length, results })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Synthesis failed' }, { status: 500 })
  }
}
