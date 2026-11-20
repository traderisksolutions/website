// @vitest-environment node
import { generateKeyPairSync, createVerify } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGoogleTokenCache, GoogleAuthError, gmailToken, refreshToken, serviceAccountEmail, serviceAccountToken } from '@/lib/google/auth'

// Throwaway key, generated per run. Never a real credential.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const SA = { client_email: 'svc@test-project.invalid', private_key: PEM }
const DRIVE = 'https://www.googleapis.com/auth/drive.readonly'

const ENV_KEYS = ['GOOGLE_TRS_DRIVE_SA_JSON', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'] as const
const saved: Record<string, string | undefined> = {}

const tokenResponse = (token: string, expiresIn = 3600) =>
  new Response(JSON.stringify({ access_token: token, expires_in: expiresIn }), { status: 200, headers: { 'content-type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k] }
  clearGoogleTokenCache()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const sentBody = (call = 0) => new URLSearchParams(fetchMock.mock.calls[call][1].body as URLSearchParams)
const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))

describe('serviceAccountToken', () => {
  it('signs an RS256 JWT with iss, scope, aud and a one-hour exp', async () => {
    process.env.GOOGLE_TRS_DRIVE_SA_JSON = JSON.stringify(SA)
    fetchMock.mockResolvedValueOnce(tokenResponse('tok-1'))
    const before = Math.floor(Date.now() / 1000)

    expect(await serviceAccountToken(DRIVE)).toBe('tok-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token')
    const body = sentBody()
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    const [h, p, s] = (body.get('assertion') ?? '').split('.')
    expect(decode(h)).toEqual({ alg: 'RS256', typ: 'JWT' })
    const claims = decode(p)
    expect(claims.iss).toBe(SA.client_email)
    expect(claims.scope).toBe(DRIVE)
    expect(claims.aud).toBe('https://oauth2.googleapis.com/token')
    expect(claims.sub).toBeUndefined()
    expect(claims.exp - claims.iat).toBe(3600)
    expect(claims.iat).toBeGreaterThanOrEqual(before)
    expect(createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(s, 'base64url'))).toBe(true)
  })

  it('adds sub when impersonating, and accepts keys with literal \\n', async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ ...SA, private_key: PEM.replace(/\n/g, '\\n') })
    fetchMock.mockResolvedValueOnce(tokenResponse('tok-sub'))
    expect(await serviceAccountToken('https://www.googleapis.com/auth/gmail.send', 'legacy', 'ops@example.invalid')).toBe('tok-sub')
    expect(decode((sentBody().get('assertion') ?? '').split('.')[1]).sub).toBe('ops@example.invalid')
  })

  it('caches per account and scope until 60 s before expiry', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-20T00:00:00Z'), toFake: ['Date'] })
    process.env.GOOGLE_TRS_DRIVE_SA_JSON = JSON.stringify(SA)
    fetchMock.mockImplementation(async () => tokenResponse(`tok-${fetchMock.mock.calls.length}`))

    expect(await serviceAccountToken(DRIVE)).toBe('tok-1')
    expect(await serviceAccountToken(DRIVE)).toBe('tok-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    expect(await serviceAccountToken('https://www.googleapis.com/auth/analytics.readonly')).toBe('tok-2')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    vi.setSystemTime(new Date(Date.now() + 3600_000 - 61_000))
    expect(await serviceAccountToken(DRIVE)).toBe('tok-1')
    vi.setSystemTime(new Date(Date.now() + 2_000))
    expect(await serviceAccountToken(DRIVE)).toBe('tok-3')
  })

  it('shares one call between concurrent requests', async () => {
    process.env.GOOGLE_TRS_DRIVE_SA_JSON = JSON.stringify(SA)
    fetchMock.mockResolvedValueOnce(tokenResponse('tok-once'))
    const all = await Promise.all([serviceAccountToken(DRIVE), serviceAccountToken(DRIVE), serviceAccountToken(DRIVE)])
    expect(all).toEqual(['tok-once', 'tok-once', 'tok-once'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to the older key only for trs-or-legacy', async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ ...SA, client_email: 'old@test-project.invalid' })
    await expect(serviceAccountToken(DRIVE, 'trs')).rejects.toThrow(/GOOGLE_TRS_DRIVE_SA_JSON/)
    fetchMock.mockResolvedValueOnce(tokenResponse('tok-old'))
    expect(await serviceAccountToken(DRIVE, 'trs-or-legacy')).toBe('tok-old')
    expect(decode((sentBody().get('assertion') ?? '').split('.')[1]).iss).toBe('old@test-project.invalid')
  })

  it('a bad JSON credential errors without the raw value', async () => {
    const raw = '{type:service_account, private_key: "SECRET-KEY-MATERIAL-123"'
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = raw
    const err = await serviceAccountToken(DRIVE, 'legacy').catch(e => e)
    expect(err).toBeInstanceOf(GoogleAuthError)
    expect(err.message).toBe('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON')
    expect(err.message).not.toContain('SECRET-KEY-MATERIAL')
    expect(String(err.stack)).not.toContain('SECRET-KEY-MATERIAL')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(serviceAccountEmail('legacy')).toBeNull()
  })

  it('a Google refusal names the account and scope, not the key', async () => {
    process.env.GOOGLE_TRS_DRIVE_SA_JSON = JSON.stringify(SA)
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }), { status: 400 }))
    const err = await serviceAccountToken(DRIVE).catch(e => e)
    expect(err).toBeInstanceOf(GoogleAuthError)
    expect(err.status).toBe(400)
    expect(err.message).toContain(SA.client_email)
    expect(err.message).toContain(DRIVE)
    expect(err.message).toContain('invalid_grant')
    expect(err.message).not.toContain('PRIVATE KEY')
    // A failure is not cached.
    fetchMock.mockResolvedValueOnce(tokenResponse('tok-retry'))
    expect(await serviceAccountToken(DRIVE)).toBe('tok-retry')
  })
})

describe('refreshToken', () => {
  it('sends the refresh grant and caches per refresh token and scope', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-20T00:00:00Z'), toFake: ['Date'] })
    fetchMock.mockImplementation(async () => tokenResponse(`at-${fetchMock.mock.calls.length}`, 600))

    expect(await refreshToken('cid', 'csecret', 'rt-A')).toBe('at-1')
    const body = sentBody()
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('client_id')).toBe('cid')
    expect(body.get('refresh_token')).toBe('rt-A')
    expect(body.get('scope')).toBeNull()

    expect(await refreshToken('cid', 'csecret', 'rt-A')).toBe('at-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    expect(await refreshToken('cid', 'csecret', 'rt-B')).toBe('at-2')
    expect(await refreshToken('cid', 'csecret', 'rt-A', 'https://www.googleapis.com/auth/gmail.readonly')).toBe('at-3')
    expect(sentBody(2).get('scope')).toBe('https://www.googleapis.com/auth/gmail.readonly')
    expect(fetchMock).toHaveBeenCalledTimes(3)

    vi.setSystemTime(new Date(Date.now() + 600_000 - 59_000))
    expect(await refreshToken('cid', 'csecret', 'rt-A')).toBe('at-4')
  })

  it('a refusal never shows the refresh token or secret', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), { status: 400 }))
    const err = await refreshToken('cid', 'csecret-xyz', 'rt-secret-value', undefined, 'ops mailbox').catch(e => e)
    expect(err).toBeInstanceOf(GoogleAuthError)
    expect(err.message).toContain('ops mailbox')
    expect(err.message).not.toContain('rt-secret-value')
    expect(err.message).not.toContain('csecret-xyz')
  })

  it('gmailToken reads the GMAIL_* env and errors by name when missing', async () => {
    await expect(gmailToken()).rejects.toThrow(/Gmail not connected/)
    expect(fetchMock).not.toHaveBeenCalled()
    process.env.GMAIL_CLIENT_ID = 'cid'
    process.env.GMAIL_CLIENT_SECRET = 'cs'
    process.env.GMAIL_REFRESH_TOKEN = 'rt'
    fetchMock.mockResolvedValueOnce(tokenResponse('gm-1'))
    expect(await gmailToken()).toBe('gm-1')
    expect(await gmailToken()).toBe('gm-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
