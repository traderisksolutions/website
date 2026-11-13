import { describe, it, expect, vi, afterEach } from 'vitest'

let cookie: string | undefined
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => cookie ? { value: cookie } : undefined }) }))
vi.mock('@/lib/auth/session', () => ({ SESSION_COOKIE: 'trs_session', readSession: async (t: string | undefined) => t === 'staff' ? { email: 'nathan@trade-risksol.com' } : t === 'outsider' ? { email: 'x@example.com' } : null }))

describe('manual AI gate', () => {
  afterEach(() => { cookie = undefined; delete process.env.AI_MODE })
  it('allows a model call only for a signed-in TRS person', async () => {
    const { aiBlocked, MANUAL_REFUSAL } = await import('@/lib/ai-gate')
    cookie = 'staff'; expect(await aiBlocked()).toBeNull()
    cookie = undefined; expect(await aiBlocked()).toBe(MANUAL_REFUSAL)          // a cron, ingest, a webhook
    cookie = 'outsider'; expect(await aiBlocked()).toBe(MANUAL_REFUSAL)
  })
  it('refuses the key for a background caller, and callGemini answers with the refusal', async () => {
    const { modelKey, anthropicKeyGated } = await import('@/lib/ai-gate')
    expect((await modelKey('crm')).key).toBeNull()
    expect(await anthropicKeyGated()).toBeNull()
    const { callGemini } = await import('@/lib/ai-call')
    const r = await callGemini({ agent: 'crm', feature: 'client_ask', model: 'x', parts: [{ text: 'hi' }] })
    expect(r.text).toBeNull()
    expect(r.error).toMatch(/manual mode/)
  })
  it('AI_MODE=auto restores automatic runs', async () => {
    process.env.AI_MODE = 'auto'
    const { aiBlocked } = await import('@/lib/ai-gate')
    expect(await aiBlocked()).toBeNull()
  })
})

describe('every model key goes through the gate', () => {
  it('no code reads a model key except through ai-gate', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const files: string[] = []
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== '__tests__') walk(p) } else if (/\.tsx?$/.test(f)) files.push(p) } }
    walk('src')
    const allowed = new Set(['src/lib/ai-agents.ts', 'src/lib/ai-call.ts', 'src/lib/ai-gate.ts'])
    const offenders = files.filter(p => !allowed.has(p)).filter(p => {
      const s = readFileSync(p, 'utf8')
      return /\bagentKey\(/.test(s) || /process\.env\.ANTHROPIC_API_KEY\b(?!\s*\*)/.test(s.replace(/^\s*(\*|\/\/).*$/gm, ''))
    })
    expect(offenders).toEqual([])
  })
})

describe('AI approvals', () => {
  it('lists every agent the credit guard holds, so all held AI work has a Run button', async () => {
    const { AI_AGENTS } = await import('@/lib/agent-tasks/approvals')
    const { MODEL_AGENTS } = await import('@/lib/agent-tasks/model-guard')
    const listed = new Set(AI_AGENTS.map(a => a.agent))
    for (const a of MODEL_AGENTS) expect(listed.has(a)).toBe(true)
  })
})
