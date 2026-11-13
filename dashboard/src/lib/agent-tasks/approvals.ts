/**
 * AI approvals (Jarod, 13 Nov 2026): the agents that read with a model never run on their own
 * (src/lib/ai-gate.ts); their work waits in the queue until a person approves a run of it here,
 * a few tasks at a time. The run happens inside that person's request, so the gate lets it
 * through; nothing else does.
 */
import type { AgentName } from './queue'

export type AiAgent = { agent: AgentName; label: string; does: string; kind?: string }

/** Every agent whose work is a model read. The credit guard holds the same set (model-guard.ts). */
export const AI_AGENTS: AiAgent[] = [
  { agent: 'document_clerk', label: 'Document clerk', does: 'Reads each email attachment for its type, insurer, policy number and premium, and files it' },
  { agent: 'policy_reader', label: 'Policy reader', does: 'Reads filed cover documents into the client’s facts' },
  { agent: 'knowledge_keeper', label: 'Knowledge keeper', does: 'Reads client and insurer emails into the client’s facts' },
  { agent: 'intake', kind: 'read_case', label: 'Case reader', does: 'Reads a client’s recent threads into its case: stage, next step, who it waits on' },
  { agent: 'placement', label: 'Placement', does: 'Reads insurer replies into quotes on a placement' },
  { agent: 'relay', label: 'Relay', does: 'Reads an incoming email to tell a claim, an endorsement or a thanks apart' },
  { agent: 'endorsement_main', label: 'Endorsements', does: 'Reads endorsement requests into the change asked for' },
  { agent: 'eb_movements', label: 'Member movements', does: 'Reads joiner and leaver lists into member movements' },
]

export const MAX_PER_RUN = 25
