/**
 * The house voice reaches every client draft, so the failure modes worth pinning are the silent
 * ones: an emptied field stripping the voice from every draft, a database error failing a
 * draft, and the client/internal distinction getting lost.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const SOUL = '# Our voice\n\n- Lead with the answer.'

function mockSettings(value: string | null, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok, json: async () => (value === null ? [] : [{ value }]),
  })))
}

describe('voice', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example'
    process.env.SUPABASE_SERVICE_KEY = 'k'
  })
  afterEach(() => vi.unstubAllGlobals())

  it('puts the stored voice at the head of the prompt, then the task', async () => {
    mockSettings(SOUL)
    const { withVoice } = await import('@/lib/voice')
    const out = await withVoice('Draft a reply.', 'client')
    expect(out.indexOf(SOUL)).toBeGreaterThan(-1)
    expect(out.indexOf(SOUL)).toBeLessThan(out.indexOf('Draft a reply.'))
  })

  it('names the audience, so client drafts follow the courteous half', async () => {
    mockSettings(SOUL)
    const { withVoice } = await import('@/lib/voice')
    expect(await withVoice('x', 'client')).toMatch(/read by a client, insurer or partner/)
    expect(await withVoice('x', 'internal')).toMatch(/read inside the firm/)
  })

  it('falls back to the shipped default when nothing is stored', async () => {
    mockSettings(null)
    const { withVoice, DEFAULT_SOUL } = await import('@/lib/voice')
    expect(await withVoice('x', 'client')).toContain(DEFAULT_SOUL)
  })

  it('falls back to the default when the field was emptied, rather than to no voice', async () => {
    mockSettings('   \n  ')
    const { getVoice, DEFAULT_SOUL } = await import('@/lib/voice')
    expect(await getVoice()).toBe(DEFAULT_SOUL)
  })

  it('never fails a draft because the settings read failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const { getVoice, DEFAULT_SOUL } = await import('@/lib/voice')
    expect(await getVoice()).toBe(DEFAULT_SOUL)
  })

  it('reads the database once a minute, not once per draft', async () => {
    mockSettings(SOUL)
    const { getVoice } = await import('@/lib/voice')
    await getVoice(); await getVoice(); await getVoice()
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('re-reads after an edit, so the author sees their change on the next draft', async () => {
    mockSettings(SOUL)
    const { getVoice, invalidateVoice } = await import('@/lib/voice')
    await getVoice(); invalidateVoice(); await getVoice()
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
  })

  it('ships a default that keeps the courtesy carve-out and bans the filler', async () => {
    const { DEFAULT_SOUL } = await import('@/lib/voice')
    expect(DEFAULT_SOUL).toMatch(/Direct is not curt/)
    expect(DEFAULT_SOUL).toMatch(/Lead with the answer/)
    expect(DEFAULT_SOUL).toMatch(/Exclamation marks/)
    expect(DEFAULT_SOUL).not.toMatch(/Chamath/)    // principles, not anybody's name or identity
  })
})
