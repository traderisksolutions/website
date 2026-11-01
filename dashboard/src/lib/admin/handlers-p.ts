/** Placement agent, queue side: quote capture from insurer mail. The RFQ workflow itself stays on its own routes. */
import { register } from '@/lib/agent-tasks/runner'
import { skip, type AgentTask } from '@/lib/agent-tasks/queue'
import { captureQuoteFromMessage } from '@/lib/placement/quote-read'

/** placement · quote_in — payload { message_id } (or task.message_id). */
export async function handlePlacement(task: AgentTask): Promise<Record<string, unknown> | 'handled'> {
  if (task.kind !== 'quote_in') { await skip(task.id, `unknown kind ${task.kind}`); return 'handled' }
  const messageId = String(task.payload.message_id ?? task.message_id ?? '')
  if (!messageId) { await skip(task.id, 'no message'); return 'handled' }
  const r = await captureQuoteFromMessage(messageId)
  if (!r.captured) { await skip(task.id, r.reason); return 'handled' }
  return { quote_id: r.quoteId, kind: r.kind, premium: r.premium, currency: r.currency, product_line: r.product_line, read_by: r.read_by, confidence: r.confidence }
}

register('placement', handlePlacement)
