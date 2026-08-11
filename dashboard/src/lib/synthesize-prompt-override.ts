/**
 * Self-improvement synthesis: turn accumulated draft evaluations (substantive human edits) into
 * a rewritten instruction block per email type, stored in prompt_overrides. Thin wrapper around
 * the ai-learning-loop library's SkillSynthesizer — see src/lib/ai-learning-loop/ for the
 * versioning/lifecycle logic (active/superseded/pinned/deprecated) and the dashboard-facing
 * history/recommendation reads.
 *
 * Used by:
 *  - /api/engagement/improve-prompt (manual "synthesise now" button) → synthesizeAllPromptOverrides
 *  - run-draft-evaluation (fully automatic) → maybeAutoSynthesize after enough substantive misses
 */
import { createSupabaseDB, createGeminiComposer, SkillSynthesizer, EvalStore } from '@/lib/ai-learning-loop'
import { EMAIL_TYPE_BASE_INSTRUCTIONS } from '@/lib/email-surface-instructions'
import { createEngagementChatLearningSource } from '@/lib/nexus-chat-learnings'

// How many new substantive-miss evals must accumulate (since the last version for a surface)
// before we auto-resynthesise that surface. Keeps Gemini calls bounded.
export const AUTO_SYNTH_THRESHOLD = 3

export const VALID_TYPES = ['PRICING', 'COVERAGE', 'RENEWAL', 'DOCUMENT', 'CLAIMS', 'CONVERSATION'] as const

function synthesizer() {
  const db = createSupabaseDB()
  const composer = createGeminiComposer(process.env.GEMINI_API_KEY_DRAFT_EMAIL)
  // Chat learnings pooled across every Nexus case (grouped by email_type) are a second
  // learning source alongside draft_evaluations — see src/lib/nexus-chat-learnings.ts.
  return { db, synth: new SkillSynthesizer(db, composer, EMAIL_TYPE_BASE_INSTRUCTIONS, [createEngagementChatLearningSource()]) }
}

// Rewrite + store the override for ONE email type. Returns whether it wrote a new override.
export async function synthesizePromptOverride(
  emailType: string,
): Promise<{ ok: boolean; synthesized: boolean; count: number; override_text?: string; reason?: string }> {
  if (!process.env.GEMINI_API_KEY_DRAFT_EMAIL) return { ok: false, synthesized: false, count: 0, reason: 'no gemini key' }
  const { synth } = synthesizer()
  const r = await synth.synthesize(emailType)
  return { ok: true, synthesized: r.synthesized, count: r.count, override_text: r.text, reason: r.reason }
}

// Manual "synthesise now": rebuild every type that currently has signal.
export async function synthesizeAllPromptOverrides(): Promise<{ ok: boolean; synthesised: number; results: { email_type: string; count: number }[] }> {
  const { db, synth } = synthesizer()
  const evalStore = new EvalStore(db)

  // Discover which surfaces currently have substantive-miss signal at all (scans recent
  // low-scoring evals across every surface, not just VALID_TYPES — new surfaces like RFQ_*
  // or CHAT_CONSULTANT get synthesised too). Also always try every known VALID_TYPES surface
  // so one with chat-learning signal but no draft-eval signal yet still gets picked up —
  // synth.synthesize() is a cheap no-op (no Gemini call) when a surface truly has nothing.
  const recentLearnings = await evalStore.listLearnings(undefined, { maxScore: 4, limit: 200 })
  const types = new Set([...recentLearnings.map(e => e.surface), ...VALID_TYPES])

  const results: { email_type: string; count: number }[] = []
  for (const t of Array.from(types)) {
    const r = await synth.synthesize(t)
    if (r.synthesized) results.push({ email_type: t, count: r.count })
  }
  return { ok: true, synthesised: results.length, results }
}

// Fully-automatic trigger: after enough NEW substantive misses since the last override for a
// type, resynthesise it. Never throws — called from the fire-and-forget eval.
export async function maybeAutoSynthesize(emailType: string): Promise<void> {
  try {
    const { synth } = synthesizer()
    await synth.maybeAutoSynthesize(emailType, AUTO_SYNTH_THRESHOLD)
  } catch { /* non-critical */ }
}
