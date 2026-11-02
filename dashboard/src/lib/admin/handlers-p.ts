/**
 * Placement agent, queue side. Two kinds:
 *   inbound   every stored message, handed on by intake: a reply on a request the module sent, the
 *             client's thread of an open placement, or a forward of either (workflow.handleInbound).
 *   quote_in  insurer mail that may carry a quotation outside the module: figures into placement_quotes.
 * The RFQ workflow's own routes (open a round, send, compare, confirm) stay where they are.
 */
import { register } from '@/lib/agent-tasks/runner'
import { skip, type AgentTask } from '@/lib/agent-tasks/queue'
import { captureQuoteFromMessage } from '@/lib/placement/quote-read'
import { handleInbound } from '@/lib/placement/workflow'

export async function handlePlacement(task: AgentTask): Promise<Record<string, unknown> | 'handled'> {
  if (task.kind === 'inbound') {
    const p = task.payload ?? {}
    const messageId = String(p.message_id ?? task.message_id ?? ''), threadId = String(p.thread_id ?? task.thread_id ?? '')
    if (!messageId || !threadId) { await skip(task.id, 'no message'); return 'handled' }
    const r = await handleInbound({ message_id: messageId, thread_id: threadId, gmail_thread_id: (p.gmail_thread_id as string | null) ?? null, direction: p.direction === 'outbound' ? 'outbound' : 'inbound' })
    if (r.handled === 'none') { await skip(task.id, r.detail ?? 'not placement mail'); return 'handled' }
    return { handled: r.handled, detail: r.detail ?? null }
  }
  if (task.kind !== 'quote_in') { await skip(task.id, `unknown kind ${task.kind}`); return 'handled' }
  const messageId = String(task.payload.message_id ?? task.message_id ?? '')
  if (!messageId) { await skip(task.id, 'no message'); return 'handled' }
  const r = await captureQuoteFromMessage(messageId)
  if (!r.captured) { await skip(task.id, r.reason); return 'handled' }
  return { quote_id: r.quoteId, kind: r.kind, premium: r.premium, currency: r.currency, product_line: r.product_line, read_by: r.read_by, confidence: r.confidence }
}

register('placement', handlePlacement)
