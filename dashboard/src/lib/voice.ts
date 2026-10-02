/**
 * The house voice — TRS's soul.md.
 *
 * One open-ended document, edited by an administrator under Settings → Tone of voice, stored in
 * app_settings under `voice_soul`, and placed at the head of the system prompt of every agent
 * that writes words a person reads: client email drafts, Ask AI answers, group benefits outputs,
 * and internal summaries.
 *
 * It is prose rather than a form of switches on purpose. Tone is not a set of booleans; the
 * people who own it should be able to write "lead with the answer" and "never tell a client
 * what they should have done" in their own words and have every agent read exactly that.
 *
 * Nothing here is a rule about tools or data — those live with each agent, where they can be
 * tested. This is how the firm sounds.
 */

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const VOICE_KEY = 'voice_soul'

/**
 * Shipped as the starting point. Built on the communication principles Jarod works to —
 * direct, concise, analytical, first-principles — written for a Singapore commercial
 * insurance broker, with the courtesy that client-facing writing needs. It takes the
 * principles, not anybody's wording or identity.
 */
export const DEFAULT_SOUL = `# Trade Risk Solutions — how we write

We are a Singapore commercial insurance broker. Clients come to us to understand risk and make
a decision. Every message should leave them better able to make it.

## Principles

- **Lead with the answer.** The first sentence says what the reader most needs. Context follows,
  only if it changes the decision.
- **Be direct and concise.** Short sentences. Short paragraphs. Cut every word that carries no
  information.
- **Think from first principles.** What is the client actually exposed to? What does the policy
  actually cover? Start there, not from how the product is marketed.
- **Use numbers, not adjectives.** "S$300,000 annual limit", not "generous cover". "14 days",
  not "shortly".
- **Separate fact from view.** State what the policy wording, the quote or the client said as
  fact. Mark an assumption as an assumption. Give a recommendation as a recommendation.
- **Hold an opinion when the evidence supports it.** If one option is clearly better for this
  client, say so and say why. If it is a genuine trade-off, lay out the trade-off and leave the
  judgement visible.
- **End useful.** Close with the next step, who takes it, and by when.

## With clients, insurers and partners

- Courteous and plain. Direct is not curt.
- Never editorialise about the reader, their staff or their past decisions.
- Never state cover the policy wording does not support. If it is unclear, say it will be
  confirmed with the insurer.
- Quote figures exactly as the insurer or the document states them, and say where they came from.
- Politeness markers are welcome: "please", "thank you", "happy to walk you through it".

## Inside the firm

- Blunter is fine. Sloppy is not.
- Findings first, then what to do about them.

## Never

- Filler: "I hope this finds you well", "It is important to note that", "Great question",
  "I hope this helps", "Please do not hesitate to".
- Sales words: seamless, cutting-edge, best-in-class, game-changing, unlock, powerful.
- Idioms in place of facts: "on the table", "moving the needle", "low-hanging fruit".
- Exclamation marks.
- Rhetorical questions as headings.

## Final check before sending

Did I lead with the answer? Is every figure exact and sourced? Is the next step clear? Would a
busy client understand the decision in thirty seconds?
`

// One read per minute per server instance. The voice changes by hand, a few times a year; a
// database round trip on every draft would cost latency for nothing.
let cache: { text: string; at: number } | null = null
const TTL_MS = 60_000

export async function getVoice(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.text
  const k = process.env.SUPABASE_SERVICE_KEY
  let text = DEFAULT_SOUL
  if (k && SB_URL) {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/app_settings?key=eq.${VOICE_KEY}&select=value&limit=1`,
        { headers: { apikey: k, Authorization: `Bearer ${k}` }, cache: 'no-store' })
      const rows = res.ok ? await res.json() as { value: string | null }[] : []
      const stored = rows[0]?.value?.trim()
      // An emptied field falls back to the shipped default rather than to no voice at all —
      // a blank soul would silently strip the house style from every client draft.
      if (stored) text = stored
    } catch { /* the default is a safe voice; never fail a draft over this */ }
  }
  cache = { text, at: Date.now() }
  return text
}

/** Drop the cache after an edit so the author's own next draft reads the new voice. */
export function invalidateVoice() { cache = null }

/** Who reads the output. Decides which half of the soul governs. */
export type Audience = 'client' | 'internal'

/**
 * The system prompt with the house voice at its head.
 *
 * The voice goes first and the agent's own instructions second, so where they conflict on a
 * matter of task — what to include, what format to return — the agent's instructions win,
 * because they come last and are specific. The voice governs how it sounds.
 */
export async function withVoice(system: string, audience: Audience): Promise<string> {
  const soul = await getVoice()
  const who = audience === 'client'
    ? 'This output will be read by a client, insurer or partner. Follow the section "With clients, insurers and partners".'
    : 'This output will be read inside the firm. Follow the section "Inside the firm".'
  return `HOUSE VOICE — how everything you write must sound:\n\n${soul}\n\n${who}\n\n---\n\nYOUR TASK:\n\n${system}`
}

/**
 * For agents whose whole task lives in the user turn and which send no system prompt: the
 * voice alone, as the system instruction. Nothing about the task is restated, because the task
 * is already in the message.
 */
export async function voiceInstruction(audience: Audience): Promise<{ parts: { text: string }[] }> {
  return { parts: [{ text: await withVoice('Your task is set out in the message that follows.', audience) }] }
}
