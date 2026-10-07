#!/usr/bin/env node
// Issue, list and revoke API client keys for src/lib/api-gate.
//
//   node scripts/api-key.mjs list
//   node scripts/api-key.mjs issue dashboard browser web
//   node scripts/api-key.mjs issue internal  machine machine
//   node scripts/api-key.mjs revoke internal
//
// Needs SUPABASE_SERVICE_KEY (and optionally NEXT_PUBLIC_SUPABASE_URL) in
// the environment. Writes through PostgREST as service_role, which is the
// only role that can reach api_clients at all — the table has RLS on with
// no policies, on purpose.
//
// Apply supabase/migrations/20260924_api_clients.sql first; there is no
// table otherwise.
//
// Issuing is the only moment the full key exists. It is printed once and
// only its hash is stored, so a lost key is replaced, never recovered.
// `issue` on an existing name rotates in place: same row, new secret, old
// secret dead on the next request.
//
// Key format MUST agree with src/lib/api-gate/keys.ts — same namespace,
// same secret length, same prefix length, same SHA-256 hex. Both use Web
// Crypto, which Node exposes as the same global, so this file is a
// transcription of that one rather than a second implementation.

const KEY_NAMESPACE = 'trs'
const SECRET_BYTES = 24
const KEY_PREFIX_LENGTH = 12
const VALID_SCOPES = ['web', 'machine']

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://trs-api-335840130686.asia-southeast1.run.app'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY is not set. api_clients is readable only by service_role.')
  process.exit(1)
}

function headers(prefer) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  }
}

function base64url(bytes) {
  return Buffer.from(bytes).toString('base64url')
}

async function hashApiKey(key) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function generateApiKey() {
  const key = `${KEY_NAMESPACE}_${base64url(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)))}`
  return { key, keyPrefix: key.slice(0, KEY_PREFIX_LENGTH), keyHash: await hashApiKey(key) }
}

async function list() {
  const res = await fetch(`${SB_URL}/rest/v1/api_clients?select=*&order=name`, { headers: headers() })
  if (!res.ok) {
    console.error(`Could not read api_clients: HTTP ${res.status}. Has the migration been applied?`)
    process.exit(1)
  }
  const rows = await res.json()
  if (rows.length === 0) {
    console.log('No API clients. Nothing can call /api/** once the gate is enforcing.')
    return
  }
  for (const r of rows) {
    const used = r.last_used_at ? new Date(r.last_used_at).toISOString() : 'never'
    console.log(
      `${r.status === 'active' ? '●' : '○'} ${r.name.padEnd(14)} ${r.kind.padEnd(8)} ${r.key_prefix}… ` +
      `scopes=[${(r.scopes ?? []).join(',') || '-'}] last-used=${used}`,
    )
  }
}

async function issue([name, kind, scopeList]) {
  if (!name || (kind !== 'browser' && kind !== 'machine')) {
    console.error('Usage: api-key.mjs issue <name> <browser|machine> [scope,scope]')
    process.exit(1)
  }
  const scopes = (scopeList ?? '').split(',').filter(Boolean)
  const unknown = scopes.filter(s => !VALID_SCOPES.includes(s))
  if (unknown.length > 0) {
    // Caught here rather than at request time, where the symptom would be
    // a 403 on a key that looks perfectly well configured.
    console.error(`Unknown scope(s): ${unknown.join(', ')}. Valid: ${VALID_SCOPES.join(', ')}`)
    process.exit(1)
  }
  // The gate pairs credential types deliberately, so a mismatched pair
  // here produces a key that can never authenticate anything.
  if (kind === 'browser' && !scopes.includes('web')) {
    console.error('A "browser" key needs the "web" scope — it is only ever valid next to a signed-in session.')
    process.exit(1)
  }
  if (kind === 'machine' && !scopes.includes('machine')) {
    console.error('A "machine" key needs the "machine" scope — it is only ever valid next to CRON_SECRET.')
    process.exit(1)
  }

  const { key, keyPrefix, keyHash } = await generateApiKey()
  const res = await fetch(`${SB_URL}/rest/v1/api_clients?on_conflict=name`, {
    method: 'POST',
    headers: headers('resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify({
      name, kind, key_prefix: keyPrefix, key_hash: keyHash, scopes,
      status: 'active', revoked_at: null,
    }),
  })
  if (!res.ok) {
    console.error(`Insert failed: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`)
    process.exit(1)
  }

  console.log(`\nClient:  ${name} (${kind})`)
  console.log(`Scopes:  ${scopes.join(', ')}`)
  console.log(`\n  ${key}\n`)
  console.log('Shown once — stored only as a hash and never printable again.')
  console.log(kind === 'browser'
    ? 'Set as WEB_API_KEY in Vercel. It ships to the browser and is public; the Supabase session is the real control.'
    : 'Set as INTERNAL_API_KEY in Vercel. A real secret — never put it in a NEXT_PUBLIC_ variable.')
}

async function revoke([name]) {
  if (!name) {
    console.error('Usage: api-key.mjs revoke <name>')
    process.exit(1)
  }
  const res = await fetch(`${SB_URL}/rest/v1/api_clients?name=eq.${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: headers('return=representation'),
    body: JSON.stringify({ status: 'revoked', revoked_at: new Date().toISOString() }),
  })
  const rows = res.ok ? await res.json() : []
  if (!res.ok || rows.length === 0) {
    console.error(`No API client named "${name}" (HTTP ${res.status}).`)
    process.exit(1)
  }
  // No cache in front of the key lookup, so this bites on the next request.
  console.log(`Revoked "${name}". Effective immediately.`)
}

const [command, ...args] = process.argv.slice(2)
const commands = { list, issue, revoke }
if (!commands[command]) {
  console.error('Usage: api-key.mjs <list|issue|revoke> [args]')
  process.exit(1)
}
commands[command](args).catch(error => {
  console.error(error)
  process.exit(1)
})
