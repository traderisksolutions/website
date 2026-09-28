#!/usr/bin/env node
// Build-time half of the API gate. Wired into package.json's "prebuild",
// and it fails the build rather than warning — a warning in a build log is
// a warning nobody reads.
//
// src/lib/api-gate/policy.ts says every /api/** route needs a key and an
// actor UNLESS it is listed as an exception. That default means a new
// route handler is protected simply by existing, so there is no such thing
// here as an "uncovered" route. What needs watching is the exception list
// itself:
//
//   1. No stale exception. A rule whose route was deleted stays behind and
//      quietly waits to exempt whatever is created at that path next.
//   2. No silent growth. The set of `open` prefixes is asserted against a
//      list written out below, so relaxing a route is a visible diff here
//      and not a one-word edit somewhere else.
//   3. Spot-checks, because longest-prefix matching is easy to reason
//      about wrongly and the cost of getting it wrong is silent.
//
// Plain JS with no TS loader, so the policy is read by parsing rather than
// importing.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot   = fileURLToPath(new URL('..', import.meta.url))
const apiDir     = join(repoRoot, 'src', 'app', 'api')
const policyFile = join(repoRoot, 'src', 'lib', 'api-gate', 'policy.ts')

// The routes allowed to require less than a key plus an actor. Changing
// this list is the point at which someone has to justify the change; every
// entry's reason lives beside it in src/lib/api-gate/policy.ts.
const EXPECTED_OPEN = [
  '/api/auth/gmail/callback',    // Google OAuth redirect
  '/api/auth/onedrive/callback', // Microsoft OAuth redirect
  '/api/outbound/webhooks',      // Instantly.ai, own shared secret
  '/api/unsubscribe',            // HMAC-signed recipient link
]

const SPOT_CHECKS = [
  ['/api/inbound/draft',        'key+actor'], // was genuinely ungated; spends Gemini quota
  ['/api/cron/outbound',        'key+actor'],
  ['/api/companies/123',        'key+actor'],
  ['/api/pricing-matrix/x',     'key+actor'],
  ['/api/nexus/runs',           'key+actor'],
  ['/api/pm_dump',              'key+actor'], // Python function, called server-to-server
  ['/api/analyze_xlsx',         'key+actor'],
  ['/api/auth/gmail/callback',  'open'],
  ['/api/unsubscribe',          'open'],
  ['/api/outbound/webhooks/instantly', 'open'],
  ['/api/outbound/leads',       'key+actor'], // sibling of the webhook family, NOT open
]

function fail(message) {
  console.error(`\n  API gate check failed.\n\n  ${message}\n`)
  process.exit(1)
}

const source = readFileSync(policyFile, 'utf8')
const rules = [...source.matchAll(/prefix:\s*'([^']+)',\s*\n\s*requirement:\s*'([^']+)'/g)]
  .map(m => ({ prefix: m[1], requirement: m[2] }))

if (rules.length === 0) {
  // Guards the parser itself. Without this, every check below would pass
  // vacuously the moment the file's formatting changed.
  fail(`Parsed no rules out of ${relative(repoRoot, policyFile)}. The parser and the file have diverged — fix this script.`)
}

function matchRule(pathname) {
  let best = null
  for (const rule of rules) {
    if (pathname !== rule.prefix && !pathname.startsWith(`${rule.prefix}/`)) continue
    if (!best || rule.prefix.length > best.prefix.length) best = rule
  }
  return best
}

function routeFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...routeFiles(full))
    else if (entry === 'route.ts' || entry === 'route.tsx') found.push(full)
  }
  return found
}

const routes = routeFiles(apiDir).map(file => ({
  path: `/${relative(repoRoot, file)}`
    .replace(/^\/src\/app/, '')
    .replace(/\/route\.tsx?$/, '')
    .split('/')
    .map(seg => seg.replace(/^\[\.{3}(.+)\]$/, '$1-value').replace(/^\[(.+)\]$/, '$1-value'))
    .join('/'),
}))

if (routes.length === 0) {
  fail('Found no route handlers under src/app/api. The walker and the directory layout have diverged — fix this script.')
}

// 1. No stale exception
const used = new Set(routes.map(r => matchRule(r.path)?.prefix).filter(Boolean))
const stale = rules.filter(r => !used.has(r.prefix)).map(r => r.prefix)
if (stale.length > 0) {
  fail(
    `These rules in src/lib/api-gate/policy.ts match no route on disk:\n    ${stale.join('\n    ')}\n\n` +
    `  Delete them. A leftover rule does not just sit there — it exempts whatever\n` +
    `  gets created at that path next, and nobody will be looking.`,
  )
}

// 2. No silent growth of the open list
const actualOpen = rules.filter(r => r.requirement === 'open').map(r => r.prefix).sort()
const expectedOpen = [...EXPECTED_OPEN].sort()
if (JSON.stringify(actualOpen) !== JSON.stringify(expectedOpen)) {
  const added   = actualOpen.filter(p => !expectedOpen.includes(p))
  const removed = expectedOpen.filter(p => !actualOpen.includes(p))
  fail(
    `The set of routes exempt from the API gate has changed.\n` +
    (added.length   ? `    now open:  ${added.join(', ')}\n`   : '') +
    (removed.length ? `    no longer: ${removed.join(', ')}\n` : '') +
    `\n  If that is intended, say why in the rule's \`reason\` and update\n` +
    `  EXPECTED_OPEN in scripts/check-api-coverage.mjs.`,
  )
}

// 3. Spot-checks
const wrong = SPOT_CHECKS
  .filter(([path, expected]) => (matchRule(path)?.requirement ?? 'key+actor') !== expected)
  .map(([path, expected]) => `${path} expected ${expected}, got ${matchRule(path)?.requirement ?? 'key+actor'}`)
if (wrong.length > 0) fail(`Routes resolved to the wrong requirement:\n    ${wrong.join('\n    ')}`)

const openCount = routes.filter(r => matchRule(r.path)?.requirement === 'open').length
console.log(`API gate: ${routes.length} routes, ${routes.length - openCount} require a key + an actor, ${openCount} exempt via ${actualOpen.length} declared rules.`)
