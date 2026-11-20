/**
 * The settings the dashboard reads, checked once at start-up (src/instrumentation.ts) instead of
 * at first use somewhere deep in a request. Names only: a value is never printed.
 *
 *   required  the app cannot serve a page without it; production refuses to start
 *   expected  a feature stops without it (mail, Drive, the scheduler); logged as a warning
 *   json      must parse as JSON with client_email and private_key (a service account)
 */
export const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'AUTH_SECRET'] as const
export const EXPECTED = [
  'WEB_API_KEY', 'CRON_SECRET', 'NEXT_PUBLIC_APP_URL',
  'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN',
  'GOOGLE_TRS_DRIVE_SA_JSON', 'GOOGLE_TRS_DRIVE_FOLDER_ID',
] as const
export const JSON_KEYS = ['GOOGLE_TRS_DRIVE_SA_JSON', 'GOOGLE_SERVICE_ACCOUNT_JSON'] as const

export type EnvReport = { missing: string[]; absent: string[]; invalid: string[] }

export function checkEnv(env: Record<string, string | undefined> = process.env): EnvReport {
  const has = (k: string) => !!env[k]?.trim()
  const invalid = JSON_KEYS.filter(k => {
    if (!has(k)) return false
    try { const j = JSON.parse(env[k]!); return !(j && typeof j.client_email === 'string' && typeof j.private_key === 'string') } catch { return true }
  })
  return { missing: REQUIRED.filter(k => !has(k)), absent: EXPECTED.filter(k => !has(k)), invalid }
}

/** One line per problem; throws in production when a required setting is missing. */
export function assertEnv(env: Record<string, string | undefined> = process.env, production = env.NODE_ENV === 'production'): EnvReport {
  const r = checkEnv(env)
  if (r.absent.length) console.warn(`[env] not set, features that need them stop: ${r.absent.join(', ')}`)
  if (r.invalid.length) console.warn(`[env] not a valid service-account JSON: ${r.invalid.join(', ')}`)
  if (r.missing.length) {
    const msg = `[env] required and not set: ${r.missing.join(', ')}`
    if (production) throw new Error(msg)
    console.error(msg)
  }
  return r
}
