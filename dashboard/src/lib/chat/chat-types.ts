// Shared types for the floating AI chat (consultant) dock.

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool'
export type MessageStatus = 'draft' | 'streaming' | 'complete' | 'error'
export type ThreadStatus = 'open' | 'minimized' | 'closed' | 'archived'
export type WindowMode = 'floating' | 'docked' | 'hidden'

export interface ChatThread {
  id: string
  user_id: string
  title: string | null
  status: ThreadStatus
  kind: 'assistant' | 'support' | 'draft'
  case_id: string | null
  last_message_at: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
}

export interface Citation { label: string; ref?: string; kind?: string }

// A single surgical edit to the stored analysis JSON. `at` is 1-based (as shown
// in the UI); `match` is a substring on the item's primary text — either resolves
// which item to update/remove.
export type EditOp =
  | { target: 'brief'; set: { summary?: string; current_stage?: string; claim_amount?: string; policy_reference?: string; coverage_type?: string; incident_date?: string } }
  | { target: 'blocking_issues'; op: 'add' | 'remove'; value?: string; at?: number; match?: string }
  | { target: 'next_steps'; op: 'add'; value: { action: string; owner?: string; priority?: string; rationale?: string; deadline?: string } }
  | { target: 'next_steps'; op: 'update' | 'remove'; at?: number; match?: string; value?: Record<string, unknown> }
  | { target: 'scenarios'; op: 'add'; value: { name: string; probability?: string; outcome?: string; trs_action?: string } }
  | { target: 'scenarios'; op: 'update' | 'remove'; at?: number; match?: string; value?: Record<string, unknown> }
  | { target: 'stakeholders'; op: 'add'; value: { name: string; party_type?: string; role_summary?: string; stance?: string } }
  | { target: 'stakeholders'; op: 'update' | 'remove'; at?: number; match?: string; value?: Record<string, unknown> }
  | { target: 'missing_items'; op: 'add'; value: { item: string; required_from?: string; urgency?: string; impact?: string } }
  | { target: 'missing_items'; op: 'remove'; at?: number; match?: string }
  | { target: 'timeline'; op: 'add'; value: { date?: string; party?: string; event: string; significance?: string } }
  | { target: 'timeline'; op: 'update' | 'remove'; at?: number; match?: string; value?: Record<string, unknown> }
  | { target: 'open_questions'; op: 'add'; value: { question: string; priority?: string; directed_at?: string } }
  | { target: 'open_questions'; op: 'update' | 'remove'; at?: number; match?: string; value?: Record<string, unknown> }
  | { target: 'quote_decision'; op: 'update'; line?: string; at?: number; value: { recommended_insurer?: string; rationale?: string; caveats?: string[] } }

// A confirm-to-act proposal the assistant can attach to a message. The employee
// clicks to run it — nothing executes automatically. Extensible union.
export type ProposedAction =
  | { type: 'reanalyze'; instructions: string; label?: string }
  | { type: 'rescan_reanalyze'; filename?: string; all_pending?: boolean; instructions?: string; label?: string }
  | { type: 'draft_email'; to_email?: string; subject?: string; body?: string; intent?: string; key_points?: string[]; thread_id?: string | null; label?: string }
  | { type: 'edit_case'; patch: { name?: string; description?: string; status?: string }; label?: string }
  | { type: 'edit_analysis'; summary: string; ops: EditOp[]; label?: string }

export interface ChatMessageMeta {
  action?: ProposedAction
  action_done?: boolean
  action_undo?: unknown        // snapshot to restore (edit_analysis undo)
  action_undone?: boolean
  attachments?: string[]       // filenames attached to a user message
  model?: string
  [k: string]: unknown
}

export interface ChatMessage {
  id: string
  thread_id: string
  user_id: string | null
  role: ChatRole
  content: string
  message_status: MessageStatus
  citations_json: Citation[]
  metadata_json: ChatMessageMeta
  created_at: string
  updated_at: string
}

export interface ChatUiState {
  user_id: string
  active_thread_id: string | null
  is_open: boolean
  is_minimized: boolean
  window_mode: WindowMode
  updated_at: string
}

export interface ChatBootstrap {
  uiState: ChatUiState | null
  thread: ChatThread | null
  messages: ChatMessage[]
  draft: string
}

// Context the dock derives from the current route (case-aware).
export interface ChatCaseContext { caseId: string; caseName: string | null }
