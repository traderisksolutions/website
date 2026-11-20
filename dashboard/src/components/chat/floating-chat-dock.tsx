'use client'

import React, { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Btn } from '@/components/crm/primitives'
import { useChatDock } from '@/providers/chat-dock-provider'
import { FloatingChatHeader } from './floating-chat-header'
import { FloatingChatBody } from './floating-chat-body'
import { FloatingChatComposer } from './floating-chat-composer'
import { MinimizedChatBar } from './minimized-chat-bar'
import { ChatThreadList } from './chat-thread-list'

/**
 * Global, persistent floating chat dock. Mounted once in the dashboard shell so
 * it survives route changes. Three visual states: launcher (closed), full window,
 * minimized bar. Fixed bottom-right; never overlays/blocks the page.
 */
export function FloatingChatDock() {
  const { state, caseIdInRoute, scopeInRoute, open, minimize, restore, close, setDraft, send, stop, regenerate, confirmAction, undoAction, toggleHistory, openThread, newThread, archiveThread, renameThread } = useChatDock()
  const [attachments, setAttachments] = useState<{ filename: string; text: string }[]>([])
  const [attaching, setAttaching] = useState(false)

  async function attachFiles(files: FileList) {
    setAttaching(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData(); fd.append('file', file)
        const res = await fetch('/api/chat/attach', { method: 'POST', body: fd })
        const d = await res.json().catch(() => ({}))
        if (res.ok && d.text) setAttachments(prev => [...prev, { filename: d.filename, text: d.text }])
      }
    } finally { setAttaching(false) }
  }
  function sendWithAttachments() {
    send(state.draft, attachments.length ? attachments : undefined)
    setAttachments([])
  }

  if (!state.bootstrapped) return null
  // Scoped: only show when a specific Nexus case or client company is open.
  if (!caseIdInRoute && !scopeInRoute.companyId) return null

  const caseAware = true
  // The client is the subject. A case only takes the dock when it has no company behind it.
  const companyScoped = !!scopeInRoute.companyId
  const title     = companyScoped ? 'Client consultant' : 'Case consultant'
  const subtitle  = companyScoped
    ? (scopeInRoute.label ? `Ask anything about ${scopeInRoute.label}` : 'Ask anything about this client')
    : 'Steering this case'

  // ── Closed → launcher pill ──────────────────────────────────────────────────
  if (!state.isOpen) {
    return (
      <Btn
        level="primary"
        onClick={open}
        aria-label="Open AI consultant chat"
        className="fixed bottom-5 right-5 z-40 gap-2 rounded-full shadow-[0_10px_30px_-10px_rgba(19,44,28,0.5)]"
      >
        <Sparkles size={15} /> Ask Opus
      </Btn>
    )
  }

  // ── Minimized → compact bar ─────────────────────────────────────────────────
  if (state.isMinimized) {
    return (
      <div className="fixed z-40 bottom-4 inset-x-4 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[280px]">
        <MinimizedChatBar title={title} onRestore={restore} onClose={close} />
      </div>
    )
  }

  // ── Open → full window (desktop) / bottom-sheet (mobile) ────────────────────
  return (
    <div
      className="fixed z-40 flex flex-col border border-trs-line bg-white overflow-hidden shadow-[0_16px_44px_-16px_rgba(16,24,40,0.34)]
        inset-x-0 bottom-0 w-full rounded-t h-[min(85vh,calc(100vh/var(--ui-zoom)-1rem))]
        sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[380px] sm:max-w-[calc(100vw-2rem)] sm:rounded sm:h-[min(560px,calc(100vh/var(--ui-zoom)-2.5rem))]"
      role="dialog"
      aria-label="AI consultant chat"
    >
      <FloatingChatHeader
        title={state.showHistory ? 'Chats' : (state.activeTitle || title)}
        subtitle={state.showHistory ? null : (state.activeTitle ? title : subtitle)}
        historyActive={state.showHistory}
        editable={!state.showHistory && !!state.activeThreadId}
        onRename={(v) => { if (state.activeThreadId) renameThread(state.activeThreadId, v) }}
        onHistory={toggleHistory}
        onNewChat={newThread}
        onMinimize={minimize}
        onClose={close}
      />
      {state.showHistory ? (
        <ChatThreadList
          threads={state.threads}
          activeThreadId={state.activeThreadId}
          onOpen={openThread}
          onNew={newThread}
          onArchive={archiveThread}
          onRename={renameThread}
        />
      ) : (
        <>
          <FloatingChatBody
            messages={state.messages}
            sending={state.sending}
            status={state.status}
            confirmingId={state.confirmingId}
            error={state.error}
            caseAware={caseAware}
            onConfirm={confirmAction}
            onUndo={undoAction}
            onPickPrompt={(p) => { setDraft(p) }}
            onRegenerate={regenerate}
          />
          <FloatingChatComposer
            draft={state.draft}
            sending={state.sending}
            attachments={attachments}
            attaching={attaching}
            onChange={setDraft}
            onSend={sendWithAttachments}
            onStop={stop}
            onAttachFiles={attachFiles}
            onRemoveAttach={(i) => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
          />
        </>
      )}
    </div>
  )
}
