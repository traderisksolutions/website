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

// A confirm-to-act proposal the assistant can attach to a message. The employee
// clicks to run it — nothing executes automatically. Extensible union.
export type ProposedAction =
  | { type: 'reanalyze'; instructions: string; label?: string }
  | { type: 'draft_email'; to_email?: string; subject?: string; body: string; thread_id?: string | null; label?: string }
  | { type: 'edit_case'; patch: { name?: string; description?: string; status?: string }; label?: string }

export interface ChatMessageMeta {
  action?: ProposedAction
  action_done?: boolean
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
