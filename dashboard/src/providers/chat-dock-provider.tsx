'use client'

import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { chatDockReducer, initialChatDockState, type ChatDockState } from '@/stores/chat-dock-store'
import type { ChatMessage } from '@/lib/chat/chat-types'
import {
  getChatBootstrapState, getOrCreateOpenThread, getThreadMessages,
  appendUserMessage, saveDraft, setThreadStatus, upsertChatUiState, updateMessageMeta,
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

      const userMsg = await appendUserMessage(threadId, content)
      if (!userMsg) throw new Error('Message could not be saved — try again')
      dispatch({ type: 'ADD_MESSAGE', message: userMsg })
      dispatch({ type: 'SET_DRAFT', draft: '' })
      saveDraft(threadId, '').catch(() => {})

      const res  = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, case_id: caseId, message: content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Assistant failed to respond')
      if (data.message) dispatch({ type: 'ADD_MESSAGE', message: data.message as ChatMessage })
    } catch (e) {
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
      }
      const meta = { ...message.metadata_json, action_done: true }
      dispatch({ type: 'UPDATE_MESSAGE', id: message.id, patch: { metadata_json: meta } })
      updateMessageMeta(message.id, meta).catch(() => {})
    } catch {
      dispatch({ type: 'SET_ERROR', error: 'Action failed — please try from the case directly.' })
    }
  }, [])

  return (
    <ChatDockContext.Provider value={{ state, caseIdInRoute, open, minimize, restore, close, setDraft, send, confirmAction }}>
      {children}
    </ChatDockContext.Provider>
  )
}
