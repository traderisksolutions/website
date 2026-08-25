import type { InstructionComposer } from './skill-synthesizer'
import { logError } from '@/lib/error-log'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'

/** Default InstructionComposer: asks Gemini to rewrite a surface's instruction block given
 *  its accumulated learnings. Isolated behind the InstructionComposer interface so tests use
 *  a fake composer instead of making real API calls, and swapping providers later doesn't
 *  touch SkillSynthesizer. */
export function createGeminiComposer(apiKey: string | undefined): InstructionComposer {
  return {
    async compose({ surface, baseInstruction, learnings }) {
      if (!apiKey) return null

      const learningsText = learnings.map(l =>
        `[Score ${l.score}/5] ${l.keyLearning}` +
        (l.whyBetter ? ` | Why human was better: ${l.whyBetter}` : '') +
        (l.whatChanged ? ` | What changed: ${l.whatChanged}` : '')
      ).join('\n')

      const prompt = `You are a prompt engineer improving an AI assistant's instructions for the "${surface}" surface.

CURRENT INSTRUCTION BLOCK:
${baseInstruction}

OBSERVED LEARNINGS (${learnings.length} cases where humans made SUBSTANTIVE edits to the AI output, most recent first):
${learningsText}

Task: Rewrite the instruction block to incorporate what the learnings reveal. Output a single, clean, complete instruction block that replaces the current one — not rules appended on top.

Requirements:
- Preserve the current instruction block's header/structure format
- Preserve current instructions that are still correct; update/remove ones the learnings contradict
- Integrate learnings as concrete, specific adjustments
- Imperative style, self-contained, no preamble/explanation, max 10 lines

Output ONLY the rewritten instruction block:`

      const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.15, maxOutputTokens: 512 } }),
      })
      if (!res.ok) {
        void logError({ source: 'gemini', feature: 'skill_synthesis', statusCode: res.status, message: await res.text(), resourceType: 'surface', resourceId: surface })
        return null
      }
      const data = await res.json()
      const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
      return text || null
    },
  }
}
