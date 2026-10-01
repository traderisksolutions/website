import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildCitations, renderProvenance, CITE_INSTRUCTION } from '@/lib/agents/guardrails'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: async () => mockUser } })),
}))
let mockUser: { data: { user: { id: string; email: string } | null } } = { data: { user: null } }

const req = (headers: Record<string, string> = {}) =>
  ({ headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } }) as never

describe('requireHumanSender', () => {
  beforeEach(() => {
    mockUser = { data: { user: { id: 'u1', email: 'nathan.budiutomo@trade-risksol.com' } } }
    process.env.CRON_SECRET = 'cron-token'
  })

  it('admits a signed-in member of staff', async () => {
    const { requireHumanSender } = await import('@/lib/agents/guardrails')
    const r = await requireHumanSender(req())
    expect(r.ok).toBe(true)
    expect(r.email).toContain('@trade-risksol.com')
  })

  it('refuses the cron bearer even though it is valid elsewhere', async () => {
    const { requireHumanSender } = await import('@/lib/agents/guardrails')
    const r = await requireHumanSender(req({ authorization: 'Bearer cron-token' }))
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('cron')
  })

  it('refuses a caller that identifies itself as an agent', async () => {
    const { requireHumanSender } = await import('@/lib/agents/guardrails')
    for (const h of ['x-agent', 'x-cron-secret', 'x-internal-secret']) {
      expect((await requireHumanSender(req({ [h]: '1' }))).ok).toBe(false)
    }
  })

  it('refuses when nobody is signed in', async () => {
    mockUser = { data: { user: null } }
    const { requireHumanSender } = await import('@/lib/agents/guardrails')
    expect((await requireHumanSender(req())).ok).toBe(false)
  })
})

describe('buildCitations', () => {
  const chunk = (o: Partial<Parameters<typeof buildCitations>[0][number]>) => ({
    source: 'message' as const, file_name: null, thread_id: 't1',
    attachment_id: null, sent_at: '2026-03-10T00:00:00Z', ...o,
  })

  it('offers the file for attachment rather than quoting the value', () => {
    const { attachments, citations } = buildCitations([
      chunk({ source: 'attachment', file_name: 'nric-tan.pdf', attachment_id: 'a1' }),
    ])
    expect(attachments).toHaveLength(1)
    expect(attachments[0].fileName).toBe('nric-tan.pdf')
    expect(citations[0].n).toBe(1)
  })

  it('cites an ordinary email but has nothing to attach', () => {
    const { attachments, citations } = buildCitations([chunk({})])
    expect(attachments).toHaveLength(0)
    expect(citations).toHaveLength(1)
  })

  it('attaches a file once even when several passages come from it', () => {
    const a = chunk({ source: 'attachment', file_name: 'policy.pdf', attachment_id: 'same' })
    const { attachments, citations } = buildCitations([a, a, a])
    expect(attachments).toHaveLength(1)
    expect(citations).toHaveLength(3)
  })
})

describe('renderProvenance', () => {
  it('says plainly when nothing came from elsewhere', () => {
    expect(renderProvenance([])).toContain('this thread only')
  })
  it('lists each source with its date for a reviewer to check', () => {
    const out = renderProvenance([
      { n: 1, source: 'attachment', fileName: 'nric.pdf', threadId: 't', attachmentId: 'a', sentAt: '2026-03-10T00:00:00Z' },
    ])
    expect(out).toContain('nric.pdf')
    expect(out).toContain('2026-03-10')
  })
})

describe('CITE_INSTRUCTION', () => {
  it('tells the model it is drafting, not sending', () => {
    expect(CITE_INSTRUCTION).toMatch(/never sending it yourself/i)
  })
  it('forbids writing an identifier into the body', () => {
    expect(CITE_INSTRUCTION).toMatch(/do not write the value/i)
  })
})
