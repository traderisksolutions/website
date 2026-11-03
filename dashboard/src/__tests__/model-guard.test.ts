import { describe, it, expect, vi, beforeEach } from 'vitest'

let reply: { text: string | null; error?: string } = { text: 'OK' }
let calls = 0
vi.mock('@/lib/ai-call', () => ({ callGemini: async () => { calls++; return reply } }))
const logged: string[] = []
vi.mock('@/lib/error-log', () => ({ logError: async (e: { message: string }) => { logged.push(e.message) } }))

describe('credit guard', () => {
  beforeEach(async () => { (await import('@/lib/agent-tasks/model-guard')).resetModelState(); calls = 0; logged.length = 0 })

  it('reads an empty balance as unavailable, and checks at most every 5 minutes', async () => {
    const { modelState } = await import('@/lib/agent-tasks/model-guard')
    reply = { text: null, error: 'Gemini 429: Your prepayment credits are depleted' }
    expect((await modelState(1_000)).ok).toBe(false)
    await modelState(60_000)
    expect(calls).toBe(1)
    reply = { text: 'OK' }
    expect((await modelState(400_000)).ok).toBe(true)
    expect(calls).toBe(2)
  })
  it('an empty answer still means the model is reachable', async () => {
    const { answered } = await import('@/lib/agent-tasks/model-guard')
    expect(answered({ text: null, error: 'The model returned nothing (finishReason: MAX_TOKENS).' })).toBe(true)
    expect(answered({ text: null, error: 'Daily AI spend cap reached (USD 15.02 of 15)' })).toBe(false)
  })
  it('holds only the reading agents, and alerts once an hour', async () => {
    const { splitAgents, alertHeld } = await import('@/lib/agent-tasks/model-guard')
    expect(splitAgents(['intake', 'document_clerk', 'chaser', 'placement'] as never, false)).toEqual({ run: ['intake', 'chaser'], held: ['document_clerk', 'placement'] })
    expect(splitAgents(['document_clerk'] as never, true).held).toEqual([])
    await alertHeld(['placement'] as never, 'credits depleted', 10_000_000)
    await alertHeld(['placement'] as never, 'credits depleted', 10_000_000 + 60_000)
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatch(/1 agent held in the queue until it answers \(placement\)/)
  })
})
