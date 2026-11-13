/**
 * Manual AI (Jarod, 13 Nov 2026): every model call happens because a person pressed a button.
 * A call is allowed only inside a request made by a signed-in TRS person; crons, the agent queue,
 * mail ingest, webhooks and scripts are refused before any model is reached, so they cost nothing.
 *
 * Both doors to a model go through here: callGemini (src/lib/ai-call.ts) and modelKey / the
 * Anthropic key below for the code that calls a model directly. AI_MODE=auto restores automatic
 * runs; it is not set anywhere.
 */
import { agentKey, type AgentId } from './ai-agents'

export const MANUAL_REFUSAL = 'AI runs only when a person starts it with a button (manual mode).'
const TRS_DOMAIN = '@trade-risksol.com'

/** Whether AI is limited to person-started requests. */
export const manualMode = () => process.env.AI_MODE !== 'auto'

/** Null when a model may be called now; else why not. */
export async function aiBlocked(): Promise<string | null> {
  if (!manualMode()) return null
  try {
    const [{ cookies }, { readSession, SESSION_COOKIE }] = await Promise.all([import('next/headers'), import('./auth/session')])
    const token = (await cookies()).get(SESSION_COOKIE)?.value
    const session = await readSession(token, process.env.AUTH_SECRET ?? '')
    return session?.email?.toLowerCase().endsWith(TRS_DOMAIN) ? null : MANUAL_REFUSAL
  } catch {
    // Outside a request (a script, a timer): never a person's click.
    return MANUAL_REFUSAL
  }
}

/** A Gemini key for an agent, or null when the call is refused. Use instead of agentKey before calling a model. */
export async function modelKey(id: Exclude<AgentId, 'unattributed'>): Promise<{ key: string | null; via: string }> {
  const blocked = await aiBlocked()
  return blocked ? { key: null, via: 'manual' } : agentKey(id)
}

/** The Anthropic key, or null when the call is refused. */
export async function anthropicKeyGated(): Promise<string | null> {
  return (await aiBlocked()) ? null : process.env.ANTHROPIC_API_KEY || null
}
