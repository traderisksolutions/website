// Per-surface base instruction blocks the skill synthesizer rewrites as learnings accumulate.
// Shared by synthesize-prompt-override.ts (manual + cron synthesis) and run-draft-evaluation.ts
// (the automatic in-line trigger) so both paths compose against the same starting instructions.
export const EMAIL_TYPE_BASE_INSTRUCTIONS: Record<string, string> = {
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
