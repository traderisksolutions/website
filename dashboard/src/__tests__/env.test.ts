import { describe, expect, it, vi } from 'vitest'
import { assertEnv, checkEnv } from '@/lib/env'

const base = { NEXT_PUBLIC_SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'k', AUTH_SECRET: 's' }

describe('settings check', () => {
  it('names missing required settings, absent expected ones, and service accounts that do not parse', () => {
    const r = checkEnv({ SUPABASE_SERVICE_KEY: 'k', GOOGLE_SERVICE_ACCOUNT_JSON: '{type:service_account}', GOOGLE_TRS_DRIVE_SA_JSON: '{"client_email":"a@b.invalid","private_key":"x"}' })
    expect(r.missing).toEqual(['NEXT_PUBLIC_SUPABASE_URL', 'AUTH_SECRET'])
    expect(r.absent).toContain('CRON_SECRET')
    expect(r.invalid).toEqual(['GOOGLE_SERVICE_ACCOUNT_JSON'])
  })

  it('refuses to start in production without a required setting, and only warns elsewhere', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => assertEnv({ AUTH_SECRET: 's' }, true)).toThrow('required and not set: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY')
    expect(() => assertEnv({ AUTH_SECRET: 's' }, false)).not.toThrow()
    expect(assertEnv(base, true).missing).toEqual([])
    quiet.mockRestore(); warn.mockRestore()
  })

  it('never prints a value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    assertEnv({ ...base, GOOGLE_SERVICE_ACCOUNT_JSON: 'secret-private-key-material' }, true)
    expect(warn.mock.calls.flat().join(' ')).not.toContain('secret-private-key-material')
    warn.mockRestore()
  })
})
