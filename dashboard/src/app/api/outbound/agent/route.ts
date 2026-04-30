import { NextRequest } from 'next/server'
import { runOutboundAgent, AgentEvent } from '@/lib/outbound-agent'

export const maxDuration = 60

// POST /api/outbound/agent  { query, roles, maxCompanies }
// Streams AgentEvent objects as SSE (text/event-stream)
export async function POST(req: NextRequest) {
  const { query, roles, maxCompanies } = await req.json()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function emit(e: AgentEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`))
      }
      await runOutboundAgent({ query, roles, maxCompanies, onEvent: emit })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection:      'keep-alive',
    },
  })
}
