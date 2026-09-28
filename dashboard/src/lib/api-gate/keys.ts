// Key format, hashing and comparison for the API gate.
//
// Web Crypto, not node:crypto — middleware.ts runs on the Edge runtime
// under Next 14, where createHash/timingSafeEqual do not exist. Everything
// here works in both runtimes, so the CLI and the gate can share it.

const KEY_NAMESPACE = 'trs'   // greppable in a log or a leaked config
const SECRET_BYTES  = 24      // 192 bits of CSPRNG output, base64url → 32 chars

/** Characters stored in clear and used as the lookup handle. Long enough
 * to be unique in practice, short enough to be useless on its own. */
export const KEY_PREFIX_LENGTH = 12

// Array.from rather than a spread: this project's tsconfig targets a low
// enough ES level that iterating a Uint8Array directly is a compile error.
function base64url(bytes: Uint8Array): string {
  let binary = ''
  Array.from(bytes).forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function generateApiKey(): Promise<{ key: string; keyPrefix: string; keyHash: string }> {
  const key = `${KEY_NAMESPACE}_${base64url(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)))}`
  return { key, keyPrefix: key.slice(0, KEY_PREFIX_LENGTH), keyHash: await hashApiKey(key) }
}

export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** The prefix to look a key up by, or null when the string isn't shaped
 * like one of ours. Rejecting on shape first means a junk header costs no
 * network round trip to Supabase. */
export function keyPrefixOf(key: string): string | null {
  if (!key.startsWith(`${KEY_NAMESPACE}_`)) return null
  if (key.length < KEY_PREFIX_LENGTH + 8) return null
  return key.slice(0, KEY_PREFIX_LENGTH)
}

/** Constant-time string comparison.
 *
 * Hand-rolled because the Edge runtime has no timingSafeEqual. Both inputs
 * here are 64-character hex digests, so the length check leaks nothing
 * an attacker could not already compute. Worth doing even though a
 * 192-bit random key is not realistically guessable byte by byte: it costs
 * nothing now and is tedious to retrofit after someone weakens the format. */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function keyMatches(presentedKey: string, storedHash: string): Promise<boolean> {
  return constantTimeEquals(await hashApiKey(presentedKey), storedHash)
}

/** Constant-time check of the shared CRON_SECRET, which is a configured
 * string rather than a stored hash. Hashed on both sides so the comparison
 * is over fixed-length input either way. */
export async function secretMatches(presented: string, expected: string): Promise<boolean> {
  return constantTimeEquals(await hashApiKey(presented), await hashApiKey(expected))
}
