/**
 * Instructions and knowledge the agents read (Jarod's approved design, 20 Nov 2026). Pure: the
 * catalogue, which agent reads which text, the suggested first drafts, and how the texts in force
 * join a model call (documents.ts reads them; ai-call.ts adds them). Tested in agent-knowledge.test.ts.
 *
 * A text reaches a model only once a person saves a version of it: the drafts below are offered in
 * the editor, never sent. Tone of voice is read by every agent, and only on calls that write prose
 * (a JSON read is left as its code asked).
 */
import type { AgentId } from '@/lib/ai-agents'

export type AgentKey = Exclude<AgentId, 'unattributed'>
export type KnowledgeKey = 'tone' | 'renewal' | 'forms' | 'checklists' | 'insurers' | 'policies' | 'brochures' | 'workbook'
export type Knowledge = { key: KnowledgeKey; title: string; kind: 'text' | 'drive' }

export const KNOWLEDGE: Knowledge[] = [
  { key: 'tone', title: 'Tone of voice', kind: 'text' },
  { key: 'renewal', title: 'Renewal method', kind: 'text' },
  { key: 'forms', title: 'Client forms', kind: 'text' },
  { key: 'checklists', title: 'Document checklists', kind: 'text' },
  { key: 'insurers', title: 'Insurer contacts and appetite', kind: 'text' },
  { key: 'policies', title: 'Policy register', kind: 'text' },
  { key: 'brochures', title: 'Insurer brochures', kind: 'drive' },
  { key: 'workbook', title: 'House workbook (EB Calculator)', kind: 'drive' },
]
export const KNOWLEDGE_BY_KEY = Object.fromEntries(KNOWLEDGE.map(k => [k.key, k])) as Record<KnowledgeKey, Knowledge>
export const isKnowledgeKey = (v: unknown): v is KnowledgeKey => typeof v === 'string' && v in KNOWLEDGE_BY_KEY

/** What each agent reads besides Tone of voice. */
export const AGENT_KNOWLEDGE: Record<AgentKey, KnowledgeKey[]> = {
  housekeeping: ['insurers', 'policies'],
  crm: ['policies', 'forms'],
  askai: ['policies', 'insurers'],
  pricingmatrix: ['brochures', 'workbook'],
  group_benefit: ['workbook', 'brochures', 'renewal', 'checklists'],
  placement: ['insurers', 'checklists'],
  benefits_admin: ['policies', 'forms'],
  admin: ['policies', 'forms', 'checklists'],
}

export const docKeyOfAgent = (a: AgentKey) => `agent:${a}`
export const docKeyOfKnowledge = (k: KnowledgeKey) => `kn:${k}`

/** Suggested first versions, from the approved design: shown in an empty editor, sent nowhere. */
export const DRAFTS: Record<string, string> = {
  'kn:tone': `Write as Trade Risk Solutions, a Singapore insurance broker.
Plain English. Short sentences. No exclamation marks.
Open with the answer, then the detail.
Name the insurer, the plan and the figure. Never round a premium.
Sign off with the sender's own signature.
Never promise cover, a premium or a date the insurer has not confirmed.`,
  'kn:renewal': `Start renewals 120 days before expiry; Employment Benefits 180.
1. Ask the client for the latest census and any claims experience.
2. Request renewal terms from the current insurer.
3. Market to the other four house insurers on the same cover.
4. Compare on the same cover first, then one tier lower.
5. Send the proposal 30 days before expiry.`,
  'kn:forms': `Joiner form: name, NRIC/FIN last 4, date of birth, category, start date.
Leaver form: name, last day of employment.
Claim form: insurer's own form only; attach the original bill.`,
  'kn:checklists': `Employment Benefits quote: census (xlsx, csv or PDF), last year's schedule, last year's debit note.
Property: sum insured by item, address, construction, fire protection.
WICA: headcount and wages by occupation class.`,
  'kn:insurers': `List each insurer TRS places with: the lines it writes, its appetite and limits, and who to write to.`,
  'kn:policies': `The policy register is the source for current insurer, plan, period and premium.
Read only. Agents never change a policy without a person.`,
  'agent:housekeeping': `Switched off (20 Nov 2026).
If switched on: file a thread only when the domain or a policy number matches one company.
Never create or merge a company without a person.`,
  'agent:crm': `Draft only. A person sends every email.
Read only the threads of this company.
Every figure in a draft comes from the records; a rewrite that changes a figure is dropped.`,
  'agent:askai': `Every claim cites a source: a thread, a document or a web page.
Say "not found" when the archive has no answer.`,
  'agent:pricingmatrix': `Two readings, two models. Save a rate only when both agree.
Differences go to a person. No premium from a model.`,
  'agent:group_benefit': `Code computes every premium; the model reads documents only.
The commission check runs on every attachment to a client; Send waits for it.`,
  'agent:placement': `A person sends every email to an insurer.
Chase after 5 working days.`,
  'agent:benefits_admin': `Nothing is written to a policy without a person's confirm.`,
  'agent:admin': `Draft only. A person approves every reply on Today.`,
}

export type DocVersion = { doc_key: string; version: number; body: string; created_by: string; created_at: string }

/**
 * The text a call carries after its own system prompt: the agent's instructions, its knowledge
 * texts, and Tone of voice when the call writes prose. Drive sources are read where their code reads
 * them, so they add nothing here. Returns the versions used, for the usage log.
 */
export function composeGuidance(agent: AgentKey, inForce: ReadonlyMap<string, DocVersion>, json: boolean): { text: string; versions: Record<string, number> } {
  const parts: string[] = [], versions: Record<string, number> = {}
  const take = (key: string, title: string) => {
    const d = inForce.get(key)
    if (!d?.body.trim()) return
    parts.push(`${title} (version ${d.version}):\n${d.body.trim()}`)
    versions[key] = d.version
  }
  take(docKeyOfAgent(agent), 'Instructions and guardrails')
  for (const k of AGENT_KNOWLEDGE[agent]) if (KNOWLEDGE_BY_KEY[k].kind === 'text') take(docKeyOfKnowledge(k), KNOWLEDGE_BY_KEY[k].title)
  if (!json) take(docKeyOfKnowledge('tone'), 'Tone of voice')
  return { text: parts.join('\n\n'), versions }
}

/** Every key an agent's calls may read. */
export const keysOfAgent = (agent: AgentKey): string[] => [docKeyOfAgent(agent), docKeyOfKnowledge('tone'), ...AGENT_KNOWLEDGE[agent].map(docKeyOfKnowledge)]
