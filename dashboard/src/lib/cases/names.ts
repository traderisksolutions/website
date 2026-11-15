/**
 * Names as the case pages show them: a person by the name on file, an agent by its role, the
 * sender of an email by the name on the email.
 *
 * Pure and browser-safe. Tested in __tests__/mail.test.ts.
 */
export type Staff = { email: string; name: string }

/** The agents that work a case, in the order the case lists them. */
export const CASE_AGENTS = [
  { id: 'case_worker', name: 'Case reader' },
  { id: 'placement', name: 'Placement' },
  { id: 'relay', name: 'Relay' },
] as const
const AGENT_NAME = new Map<string, string>(CASE_AGENTS.map(a => [a.id, a.name]))

/** A person's name on file, an agent's role, or the part of an address before the @. */
export function actorName(actor: string | null | undefined, staff: readonly Staff[] = []): string {
  const a = String(actor ?? '').trim().toLowerCase()
  if (!a) return 'Unknown'
  if (!a.includes('@')) { const s = AGENT_NAME.get(a) ?? a.replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1) }
  return staff.find(s => s.email.toLowerCase() === a)?.name || a.split('@')[0]
}

export const isAgent = (actor: string | null | undefined) => !!actor && !actor.includes('@')

/** "Tan Wei Ling" from `"Tan Wei Ling" <hr@client.example>`; the address when the email carries no name. */
export function senderName(from: string | null | undefined): string {
  const s = String(from ?? '').trim()
  const named = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(s)
  const name = named?.[1]?.trim()
  if (name && !name.includes('@')) return name
  return (named?.[2] ?? s).trim().toLowerCase() || 'Unknown'
}
