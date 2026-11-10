/**
 * "Ask AI" on a to-do. With a draft and an instruction, the model rewrites that draft the way
 * the person asked, in place. With no draft, the client-relationship agent reads the case's
 * thread and writes the reply, which becomes the item's draft. Nothing here sends.
 */
import { callGemini } from '@/lib/ai-call'
import { GEMINI_FLASH } from '@/lib/gemini-models'
import { sb, sbTry, enc } from '@/lib/crm/db'
import { nextReply } from '@/lib/agents/crm-agent'

type Row = Record<string, any>

const event = (id: string, kind: string, actor: string, detail: Row = {}) =>
  sb('work_item_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: id, kind, actor, detail }) })

const SYSTEM = [
  'You edit a Singapore insurance broker’s outgoing email as instructed. Keep the facts, recipients and purpose unless the instruction changes them.',
  'Plain, courteous business English. Short sentences. No exclamation marks.',
  '{owner_name} is the sender’s signature placeholder: keep it where it is in the sign-off if present, never add one, never use it as the greeting. Write no greeting line unless the draft has one.',
  'Answer with JSON only: {"subject": string, "body": string}. The body is plain text with blank lines between paragraphs.',
].join('\n')

async function threadContext(threadId: string | null): Promise<string> {
  if (!threadId) return ''
  const msgs = await sbTry<Row[]>(`email_messages?thread_id=eq.${enc(threadId)}&deleted_at=is.null&select=sent_at,from_address,body_text&order=sent_at.desc&limit=6`, [])
  return msgs.reverse().map(m => `--- ${String(m.sent_at).slice(0, 16)} from ${m.from_address}\n${String(m.body_text ?? '').replace(/\r/g, '').split(/\n(?:On .{5,120} wrote:|-{2,}\s*Original Message|From: .{3,200}\nSent: )/)[0].trim().slice(0, 2500)}`).join('\n\n')
}

/** Rewrites one draft as instructed; returns the new subject and body as saved. */
export async function rewriteDraft(draftId: string, instruction: string, actor: string, workItemId?: string): Promise<{ subject: string; body: string }> {
  const [d] = await sb<Row[]>(`ai_drafts?id=eq.${enc(draftId)}&select=id,to_email,subject,body,thread_id,status&limit=1`)
  if (!d) throw new Error('This draft no longer exists.')
  if (!['pending', 'draft'].includes(d.status)) throw new Error('This draft was already sent or discarded.')
  const context = await threadContext(d.thread_id)
  const prompt = [
    `Instruction from ${actor}: ${instruction.trim()}`,
    '', `Current draft to ${d.to_email}`, `Subject: ${d.subject ?? ''}`, '', d.body ?? '',
    context ? `\n\nThe conversation so far, oldest first:\n${context}` : '',
  ].join('\n')
  const r = await callGemini({ agent: 'crm', feature: 'draft_reply_editor', model: GEMINI_FLASH, system: SYSTEM, parts: [{ text: prompt }], json: true, maxOutputTokens: 3000, thinkingShare: 0.25, temperature: 0.3, metadata: { draftId, workItemId } })
  if (!r.text) throw new Error(r.error ?? 'The model returned nothing.')
  let out: { subject?: string; body?: string }
  try { out = JSON.parse(r.text.replace(/^```(?:json)?\s*|\s*```$/g, '')) } catch { throw new Error('The model’s answer was not a draft.') }
  const subject = (out.subject ?? d.subject ?? '').trim(), body = (out.body ?? '').trim()
  if (!body) throw new Error('The model returned an empty draft.')
  await sb(`ai_drafts?id=eq.${enc(draftId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ subject, body }) })
  if (workItemId) await event(workItemId, 'draft', actor, { rewritten: true, instruction: instruction.trim().slice(0, 300) })
  return { subject, body }
}

/** The to-do's "Ask AI": a rewrite when a draft exists, otherwise a first draft from the case's thread. */
export async function askOnItem(id: string, instruction: string | null, actor: string): Promise<{ draftId: string }> {
  const [item] = await sb<Row[]>(`work_items?id=eq.${enc(id)}&select=id,draft_id,client_name,work_item_threads(thread_id,side,created_at)&limit=1`)
  if (!item) throw new Error('This item no longer exists.')
  let draftId: string | null = null
  if (item.draft_id) {
    const [d] = await sbTry<Row[]>(`ai_drafts?id=eq.${enc(item.draft_id)}&status=in.(pending,draft)&select=id&limit=1`, [])
    draftId = d?.id ?? null
  }
  if (!draftId) {
    // The client's thread first; any thread otherwise.
    const threads: Row[] = [...(item.work_item_threads ?? [])].sort((a, b) => Number(b.side === 'client') - Number(a.side === 'client') || String(b.created_at).localeCompare(String(a.created_at)))
    const threadId = threads[0]?.thread_id as string | undefined
    if (!threadId) throw new Error('No email thread on this case to reply to. Open the case to write one.')
    const r = await nextReply({ threadId })
    if (!r.draftId) throw new Error('The agent read the thread but did not produce a reply.')
    draftId = r.draftId
    // The agent saves the body; the recipient and subject come from the thread when it left them empty.
    const [d] = await sbTry<Row[]>(`ai_drafts?id=eq.${enc(draftId)}&select=to_email,subject&limit=1`, [])
    const fill: Row = { work_item_id: id }
    if (!d?.to_email || !d?.subject) {
      const [last] = await sbTry<Row[]>(`email_messages?thread_id=eq.${enc(threadId)}&deleted_at=is.null&direction=eq.inbound&select=from_address,subject&order=sent_at.desc&limit=1`, [])
      const from = (String(last?.from_address ?? '').match(/<(.+?)>/)?.[1] ?? String(last?.from_address ?? '')).trim().toLowerCase()
      if (!d?.to_email && from) fill.to_email = from
      if (!d?.subject && last?.subject) fill.subject = /^\s*re\s*:/i.test(last.subject) ? last.subject : `Re: ${last.subject}`
    }
    await sb(`ai_drafts?id=eq.${enc(draftId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(fill) })
    await sb(`work_items?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ draft_id: draftId, updated_at: new Date().toISOString() }) })
    await event(id, 'draft', actor, { asked: true, next_action: r.nextAction ?? null })
  }
  if (instruction?.trim()) await rewriteDraft(draftId, instruction, actor, id)
  return { draftId }
}
