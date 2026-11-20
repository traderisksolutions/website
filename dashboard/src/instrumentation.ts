/** Runs once when a server instance starts: settings are checked before the first request. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { assertEnv } = await import('@/lib/env')
  assertEnv()
}
