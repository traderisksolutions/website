'use client'

import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback, useState } from 'react'
import { chatDockReducer, initialChatDockState, type ChatDockState } from '@/stores/chat-dock-store'
import { createClient } from '@/lib/supabase/client'
import type { ChatMessage, ChatThread } from '@/lib/chat/chat-types'
import {
  getChatBootstrapState, getOrCreateOpenThread, getThreadMessages,
  appendUserMessage, appendAssistantMessage, saveDraft, setThreadStatus, upsertChatUiState, updateMessageMeta,
  listThreads, createThread, setThreadTitle, deleteMessage, renameThreadTitle,
} from '@/lib/supabase/chat-queries'

interface ChatDockContextValue {
  state:         ChatDockState
  caseIdInRoute: string | null
  open:          () => void
  minimize:      () => void
  restore:       () => void
  close:         () => void
  setDraft:      (v: string) => void
  send:          (text: string, attachments?: { filename: string; text: string }[]) => Promise<void>
  stop:          () => void
  regenerate:    () => Promise<void>
  confirmAction: (message: ChatMessage) => Promise<void>
  undoAction:    (message: ChatMessage) => Promise<void>
  toggleHistory: () => void
  openThread:    (thread: ChatThread) => Promise<void>
  newThread:     () => Promise<void>
  archiveThread: (threadId: string) => Promise<void>
  renameThread:  (threadId: string, title: string) => Promise<void>
}

const ChatDockContext = createContext<ChatDockContextValue | null>(null)

export function useChatDock(): ChatDockContextValue {
  const ctx = useContext(ChatDockContext)
  if (!ctx) throw new Error('useChatDock must be used within ChatDockProvider')
  return ctx
}

// The Nexus case currently in view (case-aware context), read from the URL.
function caseIdFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  if (!window.location.pathname.startsWith('/nexus')) return null
  return new URLSearchParams(window.location.search).get('case')
}

// Tell an open Nexus case view to re-fetch after the chat changed its analysis.
export const NEXUS_ANALYSIS_UPDATED = 'nexus:analysis-updated'
function notifyAnalysisUpdated(caseId: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(NEXUS_ANALYSIS_UPDATED, { detail: { caseId } }))
}
// Tell the open case view to show its progress banner while a chat-triggered
// re-analysis / re-scan is running (it clears on NEXUS_ANALYSIS_UPDATED).
function notifyAnalysisStarted(caseId: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nexus:analysis-started', { detail: { caseId } }))
}

export function ChatDockProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatDockReducer, initialChatDockState)
  // The active Nexus case (Ask Opus is per-case). Seeded from the URL, then kept
  // current by the 'nexus:active-case' event the case view broadcasts.
  const [routeCaseId, setRouteCaseId] = useState<string | null>(() => caseIdFromLocation())
  const routeCaseRef = useRef<string | null>(routeCaseId)
  routeCaseRef.current = routeCaseId
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const onCase = (e: Event) => setRouteCaseId((e as CustomEvent).detail?.caseId ?? null)
    window.addEventListener('nexus:active-case', onCase as EventListener)
    return () => window.removeEventListener('nexus:active-case', onCase as EventListener)
  }, [])

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
            activeTitle:    boot.thread?.title ?? null,
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

  const caseIdInRoute = routeCaseId

  // Switching cases while the dock is in use → rebind to the new case's thread.
  useEffect(() => {
    const cur = stateRef.current
    if (!cur.bootstrapped || !routeCaseId) return
    if ((cur.caseId ?? null) === routeCaseId) return
    if (!cur.isOpen && !cur.isMinimized) return   // otherwise bind lazily on open()
    ;(async () => {
      const thread = await getOrCreateOpenThread(routeCaseId)
      if (!thread) return
      const messages = await getThreadMessages(thread.id)
      dispatch({ type: 'SET_THREAD', threadId: thread.id, caseId: thread.case_id, messages, draft: '', title: thread.title })
    })()
  }, [routeCaseId])

  // ── Realtime: cross-tab sync for the active thread's messages ────────────────
  useEffect(() => {
    const threadId = state.activeThreadId
    if (!threadId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`chat-${threadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` }, (payload) => {
        const m = payload.new as ChatMessage
        const cur = stateRef.current.messages
        if (cur.some(x => x.id === m.id)) return                                   // already have this exact row
        if (m.role === 'assistant') {
          if (cur.some(x => x.message_status === 'streaming')) return              // a local reply is streaming — it owns this
          // Stop-aware dedup: if a local (possibly stopped/partial) assistant reply
          // is a prefix of this persisted one, upgrade it in place instead of adding.
          const partial = cur.find(x => x.role === 'assistant' && x.content && m.content.startsWith(x.content))
          if (partial) { dispatch({ type: 'REPLACE_MESSAGE', id: partial.id, message: m }); return }
        }
        dispatch({ type: 'ADD_MESSAGE', message: m })                             // ADD_MESSAGE also dedups by id
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
    const routeCase = routeCaseRef.current ?? caseIdFromLocation()
    dispatch({ type: 'OPEN' })
    upsertChatUiState({ is_open: true, is_minimized: false }).catch(() => {})

    // Already bound to the right context → nothing to load.
    if (cur.activeThreadId && (cur.caseId ?? null) === (routeCase ?? null)) return
    try {
      const thread = await getOrCreateOpenThread(routeCase)
      if (!thread) return
      const messages = await getThreadMessages(thread.id)
      dispatch({ type: 'SET_THREAD', threadId: thread.id, caseId: thread.case_id, messages, draft: '', title: thread.title })
      upsertChatUiState({ active_thread_id: thread.id, is_open: true, is_minimized: false }).catch(() => {})
    } catch { /* keep dock open, empty */ }
  }, [])

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

  // ── Streaming assistant run (shared by send + regenerate) ───────────────────
  // Passes the last user message; the API dedups against history, so it never
  // double-inserts. Aborting (Stop) persists whatever streamed so far.
  const runAssistant = useCallback(async (threadId: string, caseId: string | null, userContent: string, attachments?: { filename: string; text: string }[]) => {
    dispatch({ type: 'SET_SENDING', sending: true })
    dispatch({ type: 'SET_ERROR', error: null })
    const ac = new AbortController()
    abortRef.current = ac
    const streamId = `tmp-${Date.now()}`
    let started = false, acc = '', settled = false
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, case_id: caseId, message: userContent, attachments: attachments ?? [] }),
        signal: ac.signal,
      })
      if (!res.ok || !res.body) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Assistant failed to respond') }

      const now = new Date().toISOString()
      started = true
      dispatch({ type: 'ADD_MESSAGE', message: { id: streamId, thread_id: threadId, user_id: null, role: 'assistant', content: '', message_status: 'streaming', citations_json: [], metadata_json: {}, created_at: now, updated_at: now } })

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
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
          else if (ev.type === 'done') { settled = true; if (ev.message) dispatch({ type: 'REPLACE_MESSAGE', id: streamId, message: ev.message }); else dispatch({ type: 'UPDATE_MESSAGE', id: streamId, patch: { message_status: 'complete' } }) }
          else if (ev.type === 'error') throw new Error(ev.error ?? 'Assistant error')
        }
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        // Stopped by the user — keep + persist the partial (server discarded its copy).
        if (acc.trim()) { const saved = await appendAssistantMessage(threadId, acc).catch(() => null); if (saved) dispatch({ type: 'REPLACE_MESSAGE', id: streamId, message: saved }); else dispatch({ type: 'UPDATE_MESSAGE', id: streamId, patch: { message_status: 'complete' } }) }
        else if (started) dispatch({ type: 'REMOVE_MESSAGE', id: streamId })
      } else {
        if (started && !settled) dispatch({ type: 'UPDATE_MESSAGE', id: streamId, patch: { message_status: 'error' } })
        dispatch({ type: 'SET_ERROR', error: e instanceof Error ? e.message : 'Something went wrong' })
      }
    } finally {
      abortRef.current = null
      dispatch({ type: 'SET_SENDING', sending: false })
    }
  }, [])

  // ── Send a message ──────────────────────────────────────────────────────────
  const send = useCallback(async (text: string, attachments?: { filename: string; text: string }[]) => {
    const content = text.trim()
    const cur = stateRef.current
    if ((!content && !(attachments?.length)) || cur.sending) return
    const msgText = content || '(see attached)'
    const files = (attachments ?? []).map(a => a.filename)
    let threadId = cur.activeThreadId
    let caseId   = cur.caseId
    try {
      if (!threadId) {
        const thread = await getOrCreateOpenThread(routeCaseRef.current ?? caseIdFromLocation())
        if (!thread) throw new Error('Could not start a chat')
        threadId = thread.id; caseId = thread.case_id
        dispatch({ type: 'SET_THREAD', threadId, caseId, messages: [], draft: '', title: thread.title })
        upsertChatUiState({ active_thread_id: threadId, is_open: true }).catch(() => {})
      }
      const firstMessage = cur.messages.length === 0
      const userMsg = await appendUserMessage(threadId, msgText, files.length ? { attachments: files } : undefined)
      if (!userMsg) throw new Error('Message could not be saved — try again')
      dispatch({ type: 'ADD_MESSAGE', message: userMsg })
      dispatch({ type: 'SET_DRAFT', draft: '' })
      saveDraft(threadId, '').catch(() => {})
      if (firstMessage) setThreadTitle(threadId, msgText.slice(0, 70)).catch(() => {})
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: e instanceof Error ? e.message : 'Could not send' })
      return
    }
    await runAssistant(threadId, caseId, msgText, attachments)
  }, [runAssistant])

  // Stop the in-flight streaming reply.
  const stop = useCallback(() => { abortRef.current?.abort() }, [])

  // Re-run the assistant for the last user message (drops the last assistant reply).
  const regenerate = useCallback(async () => {
    const cur = stateRef.current
    if (cur.sending || !cur.activeThreadId) return
    const last = cur.messages[cur.messages.length - 1]
    if (!last || last.role !== 'assistant') return
    const lastUser = [...cur.messages].reverse().find(m => m.role === 'user')
    if (!lastUser) return
    if (!last.id.startsWith('tmp-')) deleteMessage(last.id).catch(() => {})
    dispatch({ type: 'REMOVE_MESSAGE', id: last.id })
    await runAssistant(cur.activeThreadId, cur.caseId, lastUser.content)
  }, [runAssistant])

  // ── Confirm-to-act: run a proposed action ───────────────────────────────────
  const confirmAction = useCallback(async (message: ChatMessage) => {
    const action = message.metadata_json?.action
    if (!action) return
    const caseId = stateRef.current.caseId
    try {
      if (action.type === 'reanalyze' && caseId) {
        notifyAnalysisStarted(caseId)
        await fetch(`/api/nexus/cases/${caseId}/analyze`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instructions: action.instructions }),
        })
        notifyAnalysisUpdated(caseId)
      } else if (action.type === 'rescan_reanalyze' && caseId) {
        // One step: re-extract the document(s), then re-run so Mission Control repopulates.
        notifyAnalysisStarted(caseId)
        await fetch(`/api/nexus/cases/${caseId}/rescan-reanalyze`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: action.filename, all_pending: action.all_pending, instructions: action.instructions }),
        })
        notifyAnalysisUpdated(caseId)
      } else if (action.type === 'edit_analysis' && caseId) {
        const res = await fetch(`/api/nexus/cases/${caseId}/edit-analysis`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ops: action.ops, summary: action.summary }),
        })
        const data = await res.json().catch(() => ({}))
        notifyAnalysisUpdated(caseId)
        // Keep the pre-edit snapshot on the message so it can be undone.
        const meta = { ...message.metadata_json, action_done: true, ...(data.previous ? { action_undo: data.previous } : {}) }
        dispatch({ type: 'UPDATE_MESSAGE', id: message.id, patch: { metadata_json: meta } })
        updateMessageMeta(message.id, meta).catch(() => {})
        return
      } else if (action.type === 'draft_email') {
        // House handoff: Opus briefed the email (intent + key points); Gemini writes
        // the body on confirm (matches the analysis's Opus→Gemini drafting split).
        let subject = action.subject ?? ''
        let body    = action.body ?? ''
        let threadId: string | null | undefined = action.thread_id
        if (action.intent || !body) {
          const res = await fetch('/api/nexus/step-draft', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              case_id: caseId,
              action: action.intent ?? action.subject ?? 'Draft this email',
              rationale: Array.isArray(action.key_points) ? action.key_points.join('; ') : undefined,
              to_email: action.to_email,
            }),
          })
          const d = await res.json().catch(() => ({}))
          if (res.ok && d.body) { subject = d.subject ?? subject; body = d.body; threadId = threadId ?? d.thread_id }
        }
        if (threadId) {
          // Attach this conversation to the case so the reply flows back into Nexus.
          if (caseId) await fetch(`/api/nexus/cases/${caseId}/threads`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ thread_id: threadId, party_type: 'other' }),
          }).catch(() => {})
          window.sessionStorage.setItem('trs_pending_reply', JSON.stringify({ threadId, toEmail: action.to_email, subject, body }))
          window.location.href = `/engagement?lead=${threadId}`
          return
        }
        await navigator.clipboard.writeText(body).catch(() => {})
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

  // Undo an applied edit_analysis by restoring its captured snapshot.
  const undoAction = useCallback(async (message: ChatMessage) => {
    const snapshot = message.metadata_json?.action_undo
    const caseId = stateRef.current.caseId
    if (!snapshot || !caseId) return
    try {
      await fetch(`/api/nexus/cases/${caseId}/restore-analysis`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot }),
      })
      notifyAnalysisUpdated(caseId)
      const meta = { ...message.metadata_json, action_undone: true }
      dispatch({ type: 'UPDATE_MESSAGE', id: message.id, patch: { metadata_json: meta } })
      updateMessageMeta(message.id, meta).catch(() => {})
    } catch {
      dispatch({ type: 'SET_ERROR', error: 'Could not undo — please check the case.' })
    }
  }, [])

  // ── History drawer ──────────────────────────────────────────────────────────
  const toggleHistory = useCallback(() => {
    const next = !stateRef.current.showHistory
    dispatch({ type: 'SET_HISTORY', show: next })
    // Per-case history: only this case's conversations (general chats stay hidden).
    if (next) listThreads(routeCaseRef.current).then(threads => dispatch({ type: 'SET_THREADS', threads })).catch(() => {})
  }, [])

  const openThread = useCallback(async (thread: ChatThread) => {
    dispatch({ type: 'SET_HISTORY', show: false })
    const messages = await getThreadMessages(thread.id)
    dispatch({ type: 'SET_THREAD', threadId: thread.id, caseId: thread.case_id, messages, draft: '', title: thread.title })
    if (thread.status !== 'open') setThreadStatus(thread.id, 'open').catch(() => {})
    upsertChatUiState({ active_thread_id: thread.id, is_open: true, is_minimized: false }).catch(() => {})
  }, [])

  const newThread = useCallback(async () => {
    dispatch({ type: 'SET_HISTORY', show: false })
    const thread = await createThread(routeCaseRef.current ?? caseIdFromLocation())
    if (!thread) return
    dispatch({ type: 'SET_THREAD', threadId: thread.id, caseId: thread.case_id, messages: [], draft: '', title: thread.title })
    upsertChatUiState({ active_thread_id: thread.id, is_open: true, is_minimized: false }).catch(() => {})
  }, [])

  const archiveThread = useCallback(async (threadId: string) => {
    await setThreadStatus(threadId, 'archived').catch(() => {})
    const threads = await listThreads(routeCaseRef.current)
    dispatch({ type: 'SET_THREADS', threads })
    // If we archived the active thread, drop into a fresh one.
    if (stateRef.current.activeThreadId === threadId) {
      dispatch({ type: 'SET_THREAD', threadId: null, caseId: null, messages: [], draft: '' })
      upsertChatUiState({ active_thread_id: null }).catch(() => {})
    }
  }, [])

  const renameThread = useCallback(async (threadId: string, title: string) => {
    const clean = title.trim()
    dispatch({ type: 'SET_THREADS', threads: stateRef.current.threads.map(t => t.id === threadId ? { ...t, title: clean || null } : t) })
    if (stateRef.current.activeThreadId === threadId) dispatch({ type: 'SET_ACTIVE_TITLE', title: clean || null })
    await renameThreadTitle(threadId, clean).catch(() => {})
  }, [])

  return (
    <ChatDockContext.Provider value={{ state, caseIdInRoute, open, minimize, restore, close, setDraft, send, stop, regenerate, confirmAction, undoAction, toggleHistory, openThread, newThread, archiveThread, renameThread }}>
      {children}
    </ChatDockContext.Provider>
  )
}
