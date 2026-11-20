#!/usr/bin/env node
// Style drift check (step 1 of the platform clean-up, Jarod 20 Nov 2026). Screen code draws with
// tokens and the shared parts (primitives, register, page-header), not values typed per element.
// Jarod: one universal design and style; no styles written into elements, no page with a look of
// its own. Counts, per .tsx file under src (tests excluded), what a page draws for itself:
//   style    inline style objects             style={{ … }}
//   hex      typed colour literals            '#0f1412', "#fff"
//   font     hand-set font sizes              text-[13px]
//   radius   hand-set corner radius           rounded-[7px]
//   height   hand-set heights                 h-[30px]
//   control  hand-built controls              <button <input <select <textarea <table
//            (not counted in the shared parts: src/components/ui and crm/primitives.tsx)
// against scripts/style-baseline.json. A file above its count, or a new file with any, fails.
// Counts only go down. A line that must keep one (a PDF renderer, a chart library's prop) carries
// `drift-ok: <reason>` and is not counted. PDF templates (@react-pdf/renderer) are not screen code: they
// take style objects only, so they are not counted.
//
//   node scripts/check-style-drift.mjs                 check (part of npm run check)
//   node scripts/check-style-drift.mjs --update        rewrite the whole baseline (say so in the commit)
//   node scripts/check-style-drift.mjs --update a b    rewrite the counts of the files named only
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const BASELINE = join(ROOT, 'scripts/style-baseline.json')
const KINDS = {
  style: /style=\{\{/g,
  hex: /(?<=['"`(\s:,])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g,
  font: /\btext-\[\d+(?:\.\d+)?px\]/g,
  radius: /\brounded-(?:[a-z]+-)?\[\d+(?:\.\d+)?px\]/g,
  height: /\b(?:min-)?h-\[\d+(?:\.\d+)?px\]/g,
  control: /<(?:button|input|select|textarea|table)\b/g,
}
const SHARED = f => f.startsWith('src/components/ui/') || f === 'src/components/crm/primitives.tsx'
const ZERO = () => Object.fromEntries(Object.keys(KINDS).map(k => [k, 0]))

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (name !== '__tests__' && name !== 'node_modules') walk(p, out) }
    else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx') && !readFileSync(p, 'utf8').includes('@react-pdf/renderer')) out.push(relative(ROOT, p))
  }
  return out
}

export function count(text, file = '') {
  const c = ZERO()
  for (const line of text.split('\n')) {
    if (line.includes('drift-ok:')) continue
    for (const [k, re] of Object.entries(KINDS)) if (!(k === 'control' && SHARED(file))) c[k] += (line.match(re) ?? []).length
  }
  return c
}

const nonZero = c => Object.values(c).some(v => v > 0)
const files = walk(join(ROOT, 'src'))
const now = Object.fromEntries(files.map(f => [f, count(readFileSync(join(ROOT, f), 'utf8'), f)]))
const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}

const args = process.argv.slice(2)
if (args[0] === '--update') {
  const only = args.slice(1).map(a => relative(ROOT, join(process.cwd(), a)))
  const next = only.length ? { ...base } : {}
  for (const f of only.length ? only : files) {
    if (now[f] && nonZero(now[f])) next[f] = now[f]
    else delete next[f]
  }
  for (const f of Object.keys(next)) if (!now[f]) delete next[f]
  const sorted = Object.fromEntries(Object.keys(next).sort().map(f => [f, next[f]]))
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 1) + '\n')
  const t = ZERO()
  for (const c of Object.values(sorted)) for (const k of Object.keys(t)) t[k] += c[k] ?? 0
  console.log(`Style baseline written: ${Object.keys(sorted).length} files · ${Object.entries(t).map(([k, v]) => `${k} ${v}`).join(' · ')}${only.length ? ` (updated ${only.length} named file${only.length === 1 ? '' : 's'})` : ''}.`)
  process.exit(0)
}

const over = [], under = []
for (const f of files) {
  const b = { ...ZERO(), ...(base[f] ?? {}) }
  for (const k of Object.keys(KINDS)) {
    if (now[f][k] > b[k]) over.push(`${f}: ${k} ${b[k]} → ${now[f][k]}`)
    else if (now[f][k] < b[k]) under.push(f)
  }
}
if (over.length) {
  console.error(`Style drift: ${over.length} increase${over.length === 1 ? '' : 's'} over scripts/style-baseline.json.`)
  for (const o of over) console.error(`  ${o}`)
  console.error('Use tokens (text-trs-*, bg-trs-*), Tailwind sizes (text-sm, text-xs) and the shared parts (Btn, Field, Segmented, Register, PageHeader).')
  console.error('A line that must keep a typed value carries `drift-ok: <reason>`.')
  process.exit(1)
}
const lower = [...new Set(under)].length
console.log(`Style drift: no increase across ${files.length} files.${lower ? ` ${lower} file${lower === 1 ? '' : 's'} went down; lock that in with --update <files>.` : ''}`)
