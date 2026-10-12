// The Search Console refresh token at rest: AES-256-GCM under a key derived from AUTH_SECRET
// (or GSC_TOKEN_KEY when set). Rotating the key invalidates every stored token: reconnect.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function key(): Buffer {
  const k = process.env.GSC_TOKEN_KEY || process.env.AUTH_SECRET
  if (!k) throw new Error('AUTH_SECRET not set')
  return createHash('sha256').update(`gsc-token:${k}`).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return `v1.${iv.toString('base64url')}.${enc.toString('base64url')}.${c.getAuthTag().toString('base64url')}`
}

export function decryptSecret(blob: string): string {
  const [v, iv, enc, tag] = blob.split('.')
  if (v !== 'v1' || !iv || !enc || !tag) throw new Error('bad secret blob')
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8')
}
