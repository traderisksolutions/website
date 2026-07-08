'use client'

import React from 'react'
import { Sparkles } from 'lucide-react'
import { useChatDock } from '@/providers/chat-dock-provider'
import { FloatingChatHeader } from './floating-chat-header'
import { FloatingChatBody } from './floating-chat-body'
import { FloatingChatComposer } from './floating-chat-composer'
import { MinimizedChatBar } from './minimized-chat-bar'

/**
 * Global, persistent floating chat dock. Mounted once in the dashboard shell so
 * it survives route changes. Three visual states: launcher (closed), full window,
 * minimized bar. Fixed bottom-right; never overlays/blocks the page.
 */
export function FloatingChatDock() {
  const { state, caseIdInRoute, open, minimize, restore, close, setDraft, send, confirmAction } = useChatDock()

  if (!state.bootstrapped) return null

  const caseAware = !!(state.caseId ?? caseIdInRoute)
  const title     = caseAware ? 'Case consultant' : 'Consultant'
  const subtitle  = caseAware ? 'Steering this case' : 'AI assistant'

  // ── Closed → launcher pill ──────────────────────────────────────────────────
  if (!state.isOpen) {
    return (
      <button
        onClick={open}
        aria-label="Open AI consultant chat"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-primary text-primary-foreground pl-3.5 pr-4 py-2.5 text-[12.5px] font-semibold transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        style={{ boxShadow: '0 10px 30px -10px rgba(12,51,138,0.5)' }}
      >
        <Sparkles size={15} /> Ask the consultant
      </button>
    )
  }

  // ── Minimized → compact bar ─────────────────────────────────────────────────
  if (state.isMinimized) {
    return (
      <div className="fixed bottom-5 right-5 z-40 w-[280px]">
        <MinimizedChatBar title={title} onRestore={restore} onClose={close} />
      </div>
    )
  }

  // ── Open → full window ──────────────────────────────────────────────────────
  return (
    <div
      className="fixed bottom-5 right-5 z-40 w-[380px] max-w-[calc(100vw-2rem)] flex flex-col rounded-xl border border-[--border-subtle] bg-card overflow-hidden"
      style={{ height: 'min(560px, calc(100vh/var(--ui-zoom) - 2.5rem))', boxShadow: '0 16px 44px -16px rgba(16,24,40,0.34)' }}
      role="dialog"
      aria-label="AI consultant chat"
    >
      <FloatingChatHeader title={title} subtitle={subtitle} onMinimize={minimize} onClose={close} />
      <FloatingChatBody
        messages={state.messages}
        sending={state.sending}
        error={state.error}
        caseAware={caseAware}
        onConfirm={confirmAction}
        onPickPrompt={(p) => { setDraft(p) }}
      />
      <FloatingChatComposer
        draft={state.draft}
        sending={state.sending}
        onChange={setDraft}
        onSend={() => send(state.draft)}
      />
    </div>
  )
}
