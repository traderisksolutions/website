// Dedicated Supabase access layer for the floating chat. All calls run through
// the browser client under RLS (owner-only), so no user_id spoofing is possible.
// Grouped here so table queries never scatter across components.

import { createClient } from '@/lib/supabase/client'
import type { ChatBootstrap, ChatMessage, ChatMessageMeta, ChatThread, ChatUiState, ThreadStatus } from '@/lib/chat/chat-types'

function db() { return createClient() }

async function currentUserId(): Promise<string | null> {
  const { data } = await db().auth.getUser()
  return data.user?.id ?? null
}

// Most-recent non-closed thread for a case (if given) else global.
export async function getOrCreateOpenThread(caseId?: string | null): Promise<ChatThread | null> {
  const supabase = db()
  const uid = await currentUserId()
  if (!uid) return null

  let q = supabase.from('chat_threads').select('*')
    .eq('user_id', uid).in('status', ['open', 'minimized'])
    .order('updated_at', { ascending: false }).limit(1)
  q = caseId ? q.eq('case_id', caseId) : q.is('case_id', null)

  const { data: existing } = await q
  if (existing && existing[0]) return existing[0] as ChatThread

  const { data: created, error } = await supabase.from('chat_threads')
    .insert({ user_id: uid, status: 'open', kind: 'assistant', case_id: caseId ?? null })
    .select('*').single()
  if (error) return null
  return created as ChatThread
}

// All of the user's non-archived threads, newest first — for the history drawer.
export async function listThreads(caseId?: string | null): Promise<ChatThread[]> {
  const uid = await currentUserId()
  if (!uid) return []
  let q = db().from('chat_threads').select('*')
    .eq('user_id', uid).neq('status', 'archived')
  // Ask Opus is per-case: only this case's conversations (hides general chats).
  if (caseId) q = q.eq('case_id', caseId)
  const { data } = await q.order('updated_at', { ascending: false }).limit(50)
  return (data ?? []) as ChatThread[]
}

// A brand-new thread (distinct from getOrCreateOpenThread, which reuses one).
export async function createThread(caseId?: string | null): Promise<ChatThread | null> {
  const uid = await currentUserId()
  if (!uid) return null
  const { data, error } = await db().from('chat_threads')
    .insert({ user_id: uid, status: 'open', kind: 'assistant', case_id: caseId ?? null })
    .select('*').single()
  if (error) return null
  return data as ChatThread
}

// Set the title only if it's still empty (first user message becomes the title).
export async function setThreadTitle(threadId: string, title: string): Promise<void> {
  await db().from('chat_threads').update({ title }).eq('id', threadId).is('title', null)
}

export async function getThreadMessages(threadId: string): Promise<ChatMessage[]> {
  const { data } = await db().from('chat_messages').select('*')
    .eq('thread_id', threadId).order('created_at', { ascending: true })
  return (data ?? []) as ChatMessage[]
}

export async function appendUserMessage(threadId: string, content: string, meta?: ChatMessageMeta): Promise<ChatMessage | null> {
  const uid = await currentUserId()
  const supabase = db()
  const { data, error } = await supabase.from('chat_messages')
    .insert({ thread_id: threadId, user_id: uid, role: 'user', content, message_status: 'complete', metadata_json: meta ?? {} })
    .select('*').single()
  if (error) return null
  await touchThread(threadId)
  return data as ChatMessage
}

export async function appendAssistantMessage(threadId: string, content: string, meta?: ChatMessageMeta): Promise<ChatMessage | null> {
  const { data, error } = await db().from('chat_messages')
    .insert({ thread_id: threadId, role: 'assistant', content, message_status: 'complete', metadata_json: meta ?? {} })
    .select('*').single()
  if (error) return null
  await touchThread(threadId)
  return data as ChatMessage
}

export async function updateMessageMeta(messageId: string, meta: ChatMessageMeta): Promise<void> {
  await db().from('chat_messages').update({ metadata_json: meta }).eq('id', messageId)
}

export async function deleteMessage(messageId: string): Promise<void> {
  await db().from('chat_messages').delete().eq('id', messageId)
}

// Force-set a thread title (rename), unlike setThreadTitle which only fills nulls.
export async function renameThreadTitle(threadId: string, title: string): Promise<void> {
  await db().from('chat_threads').update({ title }).eq('id', threadId)
}

async function touchThread(threadId: string): Promise<void> {
  await db().from('chat_threads').update({ last_message_at: new Date().toISOString() }).eq('id', threadId)
}

export async function saveDraft(threadId: string, draftText: string): Promise<void> {
  const uid = await currentUserId()
  if (!uid) return
  await db().from('chat_drafts').upsert(
    { thread_id: threadId, user_id: uid, draft_text: draftText, updated_at: new Date().toISOString() },
    { onConflict: 'thread_id' },
  )
}

export async function setThreadStatus(threadId: string, status: ThreadStatus): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (status === 'closed' || status === 'archived') patch.closed_at = new Date().toISOString()
  await db().from('chat_threads').update(patch).eq('id', threadId)
}

export async function upsertChatUiState(partial: Partial<Omit<ChatUiState, 'user_id' | 'updated_at'>>): Promise<void> {
  const uid = await currentUserId()
  if (!uid) return
  await db().from('chat_ui_state').upsert(
    { user_id: uid, ...partial, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
}

// One-shot hydration: ui state + most-recent relevant thread + its messages + draft.
export async function getChatBootstrapState(): Promise<ChatBootstrap> {
  const empty: ChatBootstrap = { uiState: null, thread: null, messages: [], draft: '' }
  const supabase = db()
  const uid = await currentUserId()
  if (!uid) return empty

  const { data: uiRows } = await supabase.from('chat_ui_state').select('*').eq('user_id', uid).limit(1)
  const uiState = (uiRows?.[0] ?? null) as ChatUiState | null

  let thread: ChatThread | null = null
  if (uiState?.active_thread_id) {
    const { data } = await supabase.from('chat_threads').select('*').eq('id', uiState.active_thread_id).limit(1)
    thread = (data?.[0] ?? null) as ChatThread | null
  }
  if (!thread) {
    const { data } = await supabase.from('chat_threads').select('*')
      .eq('user_id', uid).in('status', ['open', 'minimized'])
      .order('updated_at', { ascending: false }).limit(1)
    thread = (data?.[0] ?? null) as ChatThread | null
  }
  if (!thread) return { ...empty, uiState }

  const [messages, draftRows] = await Promise.all([
    getThreadMessages(thread.id),
    supabase.from('chat_drafts').select('draft_text').eq('thread_id', thread.id).limit(1),
  ])
  return { uiState, thread, messages, draft: (draftRows.data?.[0]?.draft_text ?? '') as string }
}
