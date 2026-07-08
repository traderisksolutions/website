'use client'

import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { chatDockReducer, initialChatDockState, type ChatDockState } from '@/stores/chat-dock-store'
import { createClient } from '@/lib/supabase/client'
import type { ChatMessage, ChatThread } from '@/lib/chat/chat-types'
import {
  getChatBootstrapState, getOrCreateOpenThread, getThreadMessages,
  appendUserMessage, saveDraft, setThreadStatus, upsertChatUiState, updateMessageMeta,
  listThreads, createThread, setThreadTitle,
} from '@/lib/supabase/chat-queries'

interface ChatDockContextValue {
  state:         ChatDockState
  caseIdInRoute: string | null
  open:          () => void
  minimize:      () => void
  restore:       () => void
  close:         () => void
  setDraft:      (v: string) => void
  send:          (text: string) => Promise<void>
  confirmAction: (message: ChatMessage) => Promise<void>
  toggleHistory: () => void
  openThread:    (thread: ChatThread) => Promise<void>
  newThread:     () => Promise<void>
  archiveThread: (threadId: string) => Promise<void>
}

const ChatDockContext = createContext<ChatDockContextValue | null>(null)

export function useChatDock(): ChatDockContextValue {
  const ctx = useContext(ChatDockContext)
  if (!ctx) throw new Error('useChatDock must be used within ChatDockProvider')
  return ctx
}

// The Nexus case currently in view (case-aware context), read from the URL.
function caseIdFromLocation(pathname: string): string | null {
  if (typeof window === 'undefined' || !pathname.startsWith('/nexus')) return null
  return new URLSearchParams(window.location.search).get('case')
}

// Tell an open Nexus case view to re-fetch after the chat changed its analysis.
export const NEXUS_ANALYSIS_UPDATED = 'nexus:analysis-updated'
function notifyAnalysisUpdated(caseId: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(NEXUS_ANALYSIS_UPDATED, { detail: { caseId } }))
}

export function ChatDockProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatDockReducer, initialChatDockState)
  const pathname = usePathname()
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  // ── Hydrate from Supabase once ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const boot = await getChatBootstrapState()
        if (cancelled) return
        dispatch({
          type: 'HYDRATE',
          payload: {
            bootstrapped:   true,
            isOpen:         boot.uiState?.is_open ?? false,
            isMinimized:    boot.uiState?.is_minimized ?? false,
            activeThreadId: boot.thread?.id ?? null,
            caseId:         boot.thread?.case_id ?? null,
            messages:       boot.messages,
            draft:          boot.draft,
          },
        })
      } catch {
        dispatch({ type: 'HYDRATE', payload: { bootstrapped: true } })
      }
    })()
    return () => { cancelled = true }
  }, [])

  const caseIdInRoute = caseIdFromLocation(pathname)

  // ── Realtime: cross-tab sync for the active thread's messages ────────────────
  useEffect(() => {
    const threadId = state.activeThreadId
    if (!threadId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`chat-${threadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` }, (payload) => {
        const m = payload.new as ChatMessage
        // While a local reply is streaming, ignore the echo — the stream owns it.
        if (m.role === 'assistant' && stateRef.current.messages.some(x => x.message_status === 'streaming')) return
        dispatch({ type: 'ADD_MESSAGE', message: m }) // ADD_MESSAGE dedups by id
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` }, (payload) => {
        const m = payload.new as ChatMessage
        dispatch({ type: 'UPDATE_MESSAGE', id: m.id, patch: m })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [state.activeThreadId])

  // ── Draft autosave (debounced) ──────────────────────────────────────────────
  const setDraft = useCallback((v: string) => {
    dispatch({ type: 'SET_DRAFT', draft: v })
    const threadId = stateRef.current.activeThreadId
    if (!threadId) return
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => { saveDraft(threadId, v).catch(() => {}) }, 600)
  }, [])

  // ── Bind the dock to the right thread for the current case, then open ────────
  const open = useCallback(async () => {
    const cur = stateRef.current
    const routeCase = caseIdFromLocation(pathname)
    dispatch({ type: 'OPEN' })
    upsertChatUiState({ is_open: true, is_minimized: false }).catch(() => {})

    // Already bound to the right context → nothing to load.
    if (cur.activeThreadId && (cur.caseId ?? null) === (routeCase ?? null)) return
    try {
      const thread = await getOrCreateOpenThread(routeCase)
      if (!thread) return
      const messages = await getThreadMessages(thread.id)
      dispatch({ type: 'SET_THREAD', threadId: thread.id, caseId: thread.case_id, messages, draft: '' })
      upsertChatUiState({ active_thread_id: thread.id, is_open: true, is_minimized: false }).catch(() => {})
    } catch { /* keep dock open, empty */ }
  }, [pathname])

  const minimize = useCallback(() => {
    dispatch({ type: 'MINIMIZE' })
    upsertChatUiState({ is_minimized: true }).catch(() => {})
    const tid = stateRef.current.activeThreadId
    if (tid) setThreadStatus(tid, 'minimized').catch(() => {})
  }, [])

  const restore = useCallback(() => {
    dispatch({ type: 'RESTORE' })
    upsertChatUiState({ is_open: true, is_minimized: false }).catch(() => {})
    const tid = stateRef.current.activeThreadId
    if (tid) setThreadStatus(tid, 'open').catch(() => {})
  }, [])

  const close = useCallback(() => {
    dispatch({ type: 'CLOSE' })
    upsertChatUiState({ is_open: false, is_minimized: false }).catch(() => {})
    const tid = stateRef.current.activeThreadId
    if (tid) setThreadStatus(tid, 'open').catch(() => {}) // keep the thread; just hide the dock
  }, [])

  // ── Send a message ──────────────────────────────────────────────────────────
  const send = useCallback(async (text: string) => {
    const content = text.trim()
    const cur = stateRef.current
    if (!content || cur.sending) return
    dispatch({ type: 'SET_SENDING', sending: true })
    dispatch({ type: 'SET_ERROR', error: null })
    let tempId: string | null = null
    try {
      let threadId = cur.activeThreadId
      let caseId   = cur.caseId
      if (!threadId) {
        const thread = await getOrCreateOpenThread(caseIdFromLocation(pathname))
        if (!thread) throw new Error('Could not start a chat')
        threadId = thread.id; caseId = thread.case_id
        dispatch({ type: 'SET_THREAD', threadId, caseId, messages: [], draft: '' })
        upsertChatUiState({ active_thread_id: threadId, is_open: true }).catch(() => {})
      }

      const firstMessage = cur.messages.length === 0
      const userMsg = await appendUserMessage(threadId, content)
      if (!userMsg) throw new Error('Message could not be saved — try again')
      dispatch({ type: 'ADD_MESSAGE', message: userMsg })
      dispatch({ type: 'SET_DRAFT', draft: '' })
      saveDraft(threadId, '').catch(() => {})
      // First message becomes the thread title (only if still untitled).
      if (firstMessage) setThreadTitle(threadId, content.slice(0, 70)).catch(() => {})

      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, case_id: caseId, message: content }),
      })
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Assistant failed to respond')
      }

      // Stream tokens into a placeholder assistant message; swap for the persisted
      // row on `done`.
      const now = new Date().toISOString()
      const streamId = `tmp-${Date.now()}`
      tempId = streamId
      dispatch({ type: 'ADD_MESSAGE', message: { id: streamId, thread_id: threadId, user_id: null, role: 'assistant', content: '', message_status: 'streaming', citations_json: [], metadata_json: {}, created_at: now, updated_at: now } })

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = '', acc = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
          if (!line) continue
          let ev: { type?: string; text?: string; error?: string; message?: ChatMessage }
          try { ev = JSON.parse(line) } catch { continue }
          if (ev.type === 'delta' && ev.text) { acc += ev.text; dispatch({ type: 'UPDATE_MESSAGE', id: streamId, patch: { content: acc } }) }
          else if (ev.type === 'done') { if (ev.message) dispatch({ type: 'REPLACE_MESSAGE', id: streamId, message: ev.message }); else dispatch({ type: 'UPDATE_MESSAGE', id: streamId, patch: { message_status: 'complete' } }); tempId = null }
          else if (ev.type === 'error') throw new Error(ev.error ?? 'Assistant error')
        }
      }
    } catch (e) {
      if (tempId) dispatch({ type: 'UPDATE_MESSAGE', id: tempId, patch: { message_status: 'error' } })
      dispatch({ type: 'SET_ERROR', error: e instanceof Error ? e.message : 'Something went wrong' })
    } finally {
      dispatch({ type: 'SET_SENDING', sending: false })
    }
  }, [pathname])

  // ── Confirm-to-act: run a proposed action ───────────────────────────────────
  const confirmAction = useCallback(async (message: ChatMessage) => {
    const action = message.metadata_json?.action
    if (!action) return
    const caseId = stateRef.current.caseId
    try {
      if (action.type === 'reanalyze' && caseId) {
        await fetch(`/api/nexus/cases/${caseId}/analyze`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instructions: action.instructions }),
        })
        notifyAnalysisUpdated(caseId)
      } else if (action.type === 'edit_analysis' && caseId) {
        await fetch(`/api/nexus/cases/${caseId}/edit-analysis`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ops: action.ops, summary: action.summary }),
        })
        notifyAnalysisUpdated(caseId)
      } else if (action.type === 'draft_email') {
        if (action.thread_id) {
          window.sessionStorage.setItem('trs_pending_reply', JSON.stringify({ threadId: action.thread_id, toEmail: action.to_email, subject: action.subject, body: action.body }))
          window.location.href = `/engagement?lead=${action.thread_id}`
          return
        }
        await navigator.clipboard.writeText(action.body).catch(() => {})
      } else if (action.type === 'edit_case' && caseId) {
        await fetch(`/api/nexus/cases/${caseId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action.patch),
        })
        notifyAnalysisUpdated(caseId)
      }
      const meta = { ...message.metadata_json, action_done: true }
      dispatch({ type: 'UPDATE_MESSAGE', id: message.id, patch: { metadata_json: meta } })
      updateMessageMeta(message.id, meta).catch(() => {})
    } catch {
      dispatch({ type: 'SET_ERROR', error: 'Action failed — please try from the case directly.' })
    }
  }, [])

  // ── History drawer ──────────────────────────────────────────────────────────
  const toggleHistory = useCallback(() => {
    const next = !stateRef.current.showHistory
    dispatch({ type: 'SET_HISTORY', show: next })
    if (next) listThreads().then(threads => dispatch({ type: 'SET_THREADS', threads })).catch(() => {})
  }, [])

  const openThread = useCallback(async (thread: ChatThread) => {
    dispatch({ type: 'SET_HISTORY', show: false })
    const messages = await getThreadMessages(thread.id)
    dispatch({ type: 'SET_THREAD', threadId: thread.id, caseId: thread.case_id, messages, draft: '' })
    if (thread.status !== 'open') setThreadStatus(thread.id, 'open').catch(() => {})
    upsertChatUiState({ active_thread_id: thread.id, is_open: true, is_minimized: false }).catch(() => {})
  }, [])

  const newThread = useCallback(async () => {
    dispatch({ type: 'SET_HISTORY', show: false })
    const thread = await createThread(caseIdFromLocation(pathname))
    if (!thread) return
    dispatch({ type: 'SET_THREAD', threadId: thread.id, caseId: thread.case_id, messages: [], draft: '' })
    upsertChatUiState({ active_thread_id: thread.id, is_open: true, is_minimized: false }).catch(() => {})
  }, [pathname])

  const archiveThread = useCallback(async (threadId: string) => {
    await setThreadStatus(threadId, 'archived').catch(() => {})
    const threads = await listThreads()
    dispatch({ type: 'SET_THREADS', threads })
    // If we archived the active thread, drop into a fresh one.
    if (stateRef.current.activeThreadId === threadId) {
      dispatch({ type: 'SET_THREAD', threadId: null, caseId: null, messages: [], draft: '' })
      upsertChatUiState({ active_thread_id: null }).catch(() => {})
    }
  }, [])

  return (
    <ChatDockContext.Provider value={{ state, caseIdInRoute, open, minimize, restore, close, setDraft, send, confirmAction, toggleHistory, openThread, newThread, archiveThread }}>
      {children}
    </ChatDockContext.Provider>
  )
}
