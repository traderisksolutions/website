// Lightweight client store for the floating chat (reducer — no external dep).
// Holds instant UI state; the provider syncs the important bits to Supabase.

import type { ChatMessage, ChatThread } from '@/lib/chat/chat-types'

export interface ChatDockState {
  bootstrapped:   boolean
  isOpen:         boolean
  isMinimized:    boolean
  showHistory:    boolean
  activeThreadId: string | null
  caseId:         string | null
  messages:       ChatMessage[]
  threads:        ChatThread[]
  draft:          string
  sending:        boolean
  error:          string | null
}

export const initialChatDockState: ChatDockState = {
  bootstrapped:   false,
  isOpen:         false,
  isMinimized:    false,
  showHistory:    false,
  activeThreadId: null,
  caseId:         null,
  messages:       [],
  threads:        [],
  draft:          '',
  sending:        false,
  error:          null,
}

export type ChatDockAction =
  | { type: 'HYDRATE'; payload: Partial<ChatDockState> & { bootstrapped: true } }
  | { type: 'OPEN' }
  | { type: 'MINIMIZE' }
  | { type: 'RESTORE' }
  | { type: 'CLOSE' }
  | { type: 'SET_THREAD'; threadId: string | null; caseId: string | null; messages: ChatMessage[]; draft: string }
  | { type: 'SET_DRAFT'; draft: string }
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; id: string; patch: Partial<ChatMessage> }
  | { type: 'REPLACE_MESSAGE'; id: string; message: ChatMessage }
  | { type: 'REMOVE_MESSAGE'; id: string }
  | { type: 'SET_MESSAGES'; messages: ChatMessage[] }
  | { type: 'SET_SENDING'; sending: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_HISTORY'; show: boolean }
  | { type: 'SET_THREADS'; threads: ChatThread[] }

export function chatDockReducer(state: ChatDockState, action: ChatDockAction): ChatDockState {
  switch (action.type) {
    case 'HYDRATE':    return { ...state, ...action.payload }
    case 'OPEN':       return { ...state, isOpen: true, isMinimized: false }
    case 'MINIMIZE':   return { ...state, isMinimized: true }
    case 'RESTORE':    return { ...state, isOpen: true, isMinimized: false }
    case 'CLOSE':      return { ...state, isOpen: false, isMinimized: false }
    case 'SET_THREAD': return { ...state, activeThreadId: action.threadId, caseId: action.caseId, messages: action.messages, draft: action.draft, error: null }
    case 'SET_DRAFT':  return { ...state, draft: action.draft }
    case 'ADD_MESSAGE':    return state.messages.some(m => m.id === action.message.id) ? state : { ...state, messages: [...state.messages, action.message] }
    case 'UPDATE_MESSAGE': return { ...state, messages: state.messages.map(m => m.id === action.id ? { ...m, ...action.patch } : m) }
    case 'REPLACE_MESSAGE': return { ...state, messages: state.messages.map(m => m.id === action.id ? action.message : m) }
    case 'REMOVE_MESSAGE':  return { ...state, messages: state.messages.filter(m => m.id !== action.id) }
    case 'SET_MESSAGES':   return { ...state, messages: action.messages }
    case 'SET_SENDING':    return { ...state, sending: action.sending }
    case 'SET_ERROR':      return { ...state, error: action.error }
    case 'SET_HISTORY':    return { ...state, showHistory: action.show }
    case 'SET_THREADS':    return { ...state, threads: action.threads }
    default:               return state
  }
}
