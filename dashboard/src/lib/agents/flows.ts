/**
 * Each agent's workflow as the AI Agents place draws it (Jarod's approved design, 20 Nov 2026):
 * the steps from trigger to what is written, with where it runs in the dashboard. Data, read by the
 * Overview canvas; the agent's code is the authority, this is its map. Pure.
 *
 * A node: kind, title, detail, column, row (rows 0 to 2). An edge: from, to, optional label.
 */
import type { AgentId } from '@/lib/ai-agents'

export type NodeKind = 'trigger' | 'model' | 'code' | 'decide' | 'person' | 'write'
export type FlowNode = { kind: NodeKind; title: string; detail: string; col: number; row: number }
export type Flow = { name: string; sources: string[]; nodes: FlowNode[]; edges: [number, number, string?][] }

export const NODE_KIND: Record<NodeKind, string> = { trigger: 'Trigger', model: 'Model read', code: 'Code', decide: 'Decision', person: 'Person', write: 'Writes' }

const n = (kind: NodeKind, title: string, detail: string, col: number, row: number): FlowNode => ({ kind, title, detail, col, row })

export const FLOWS: Record<Exclude<AgentId, 'unattributed'>, Flow> = {
  housekeeping: {
    name: 'Filing agent', sources: ['Inbox', 'Clients › Companies'],
    nodes: [n('trigger', 'Email arrives', 'Gmail · 3 mailboxes', 0, 1), n('code', 'Store message', 'email_messages', 1, 1), n('model', 'Read signature', 'First email per person', 2, 0),
      n('code', 'Match company', 'Domain, then subject rules', 2, 2), n('decide', 'Company found?', '', 3, 1), n('write', 'File thread', 'email_threads.company_id', 4, 0),
      n('write', 'Create company', 'companies · new domain', 4, 2), n('write', 'Log action', 'audit_logs', 5, 1)],
    edges: [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5, 'Yes'], [4, 6, 'No'], [5, 7], [6, 7]],
  },
  crm: {
    name: 'Client relationships', sources: ['Inbox', 'Today'],
    nodes: [n('trigger', 'Draft reply', 'Button · Inbox, Today', 0, 1), n('code', 'Load threads', 'Company, policies, open cases', 1, 1), n('model', 'Read and draft', 'Gemini', 2, 1),
      n('code', 'Check figures', 'Every figure from records', 3, 1), n('person', 'Review', 'Edit, Save, Discard', 4, 1), n('write', 'Send', 'Gmail · sender’s mailbox', 5, 1)],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4, 'Pass'], [4, 5, 'Send']],
  },
  askai: {
    name: 'Ask AI', sources: ['Ask panel'],
    nodes: [n('trigger', 'Question', 'Ask panel', 0, 1), n('code', 'Search archive', 'Threads, documents', 1, 0), n('code', 'Web search', 'Public sources', 1, 2),
      n('model', 'Answer', 'Cites each claim', 2, 1), n('person', 'Read', 'Answer in panel', 3, 1)],
    edges: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]],
  },
  pricingmatrix: {
    name: 'Brochure reader', sources: ['Employment Benefits › Brochures'],
    nodes: [n('trigger', 'Brochure uploaded', 'Employment Benefits › Brochures', 0, 1), n('model', 'Reading A', 'First model', 1, 0), n('model', 'Reading B', 'Second model', 1, 2),
      n('code', 'Compare readings', 'Cell by cell', 2, 1), n('decide', 'Readings agree?', '', 3, 1), n('write', 'Save rates', 'gb_rate_tables', 4, 0), n('person', 'Resolve', 'Differences listed', 4, 2)],
    edges: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [4, 5, 'Yes'], [4, 6, 'No'], [6, 5]],
  },
  group_benefit: {
    name: 'Employment Benefits quoting', sources: ['Employment Benefits › New quotation'],
    nodes: [n('trigger', 'New quotation', 'Button · Employment Benefits', 0, 1), n('code', 'Read census', 'xlsx, csv, PDF', 1, 0), n('model', 'Read last year', 'Schedule, debit note', 1, 2),
      n('code', 'Price 5 insurers', 'House workbook', 2, 1), n('code', 'Commission check', 'Attachments to client', 3, 1), n('person', 'Review', 'Proposal and email', 4, 1), n('write', 'Send', 'Client email + PDF', 5, 1)],
    edges: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [4, 5], [5, 6, 'Send']],
  },
  placement: {
    name: 'Placement', sources: ['Clients › Placements'],
    nodes: [n('trigger', 'Request', 'Thread or button', 0, 1), n('model', 'Split into lines', 'Per cover', 1, 1), n('person', 'Send to insurers', 'Drafts per insurer', 2, 1),
      n('trigger', 'Insurer replies', 'Email arrives', 3, 0), n('model', 'Read quote', 'Premium, terms', 4, 0), n('code', 'Comparison', 'Side by side', 5, 1), n('person', 'Approve', 'Draft to client', 6, 1)],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  },
  benefits_admin: {
    name: 'Benefits admin', sources: ['Others › Member movements', 'Others › Debit notes'],
    nodes: [n('trigger', 'Movement email', 'Client HR', 0, 1), n('model', 'Read movements', 'Joiners, leavers', 1, 1), n('person', 'Send endorsement', 'Draft to insurer', 2, 1),
      n('trigger', 'Debit note arrives', 'Insurer email', 3, 1), n('model', 'Read note', 'Amount, period', 4, 1), n('person', 'Confirm', 'Onto the policy', 5, 1)],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
  },
  admin: {
    name: 'Autonomous admin', sources: ['Inbox', 'Today'],
    nodes: [n('trigger', 'Email arrives', 'Gmail', 0, 1), n('model', 'Intake', 'Case, history', 1, 1), n('code', 'Route', 'To the right agent', 2, 1),
      n('write', 'Knowledge bank', 'Facts per company', 3, 0), n('model', 'Draft reply', 'If a reply is due', 3, 2), n('person', 'Approve', 'Today', 4, 2)],
    edges: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5]],
  },
}
