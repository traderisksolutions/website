#!/usr/bin/env node
// Five text styles (Jarod, 21 Nov 2026). Every piece of text is one of:
//   Header       text-title   24px semibold ink
//   Header 2     text-heading 16px semibold ink
//   Title        text-body    14px semibold ink
//   Body         text-body    14px regular ink
//   Description  text-small   12px regular grey
// The theme allows only regular and semibold. This check fails on the ways a page could drift:
// a size alias (text-xs, text-2xl…), a weight on 12px text, or 24/16px text that is not semibold.
// PDF templates draw their own type and are skipped.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ALIAS = /(?<![\w:\-\[])text-(xs|sm|base|lg|xl|2xl|3xl|4xl|11|12|12\.5|13|13\.5|14|15|16|20|24|32)(?![\w\-.\]/])/
const WEIGHT = /(?<![\w:\-\[])font-(normal|medium|semibold|bold)(?![\w-])/
const LIT = /'[^'\n]*'|"[^"\n]*"|`[^`$\n]*`/g
const bad = []
function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) { walk(p); continue }
    if (!p.endsWith('.tsx')) continue
    const src = readFileSync(p, 'utf8')
    if (src.includes('@react-pdf')) continue
    src.split('\n').forEach((line, i) => {
      for (const lit of line.match(LIT) ?? []) {
        const where = `${p}:${i + 1}`
        if (ALIAS.test(lit)) bad.push(`${where} size alias: use text-title, text-heading, text-body or text-small`)
        const small = /\btext-small\b/.test(lit), big = /\btext-(title|heading)\b/.test(lit)
        if (small && WEIGHT.test(lit) && !/\btext-(title|heading|body)\b/.test(lit)) bad.push(`${where} 12px text takes no weight (Description is regular)`)
        if (big && !/\btext-(small|body)\b/.test(lit) && /\bfont-(normal|medium|bold)\b/.test(lit)) bad.push(`${where} 24/16px text is semibold`)
      }
    })
  }
}
walk('src')
if (bad.length) { console.error(`Text styles: ${bad.length} off the five styles.\n` + bad.slice(0, 40).join('\n')); process.exit(1) }
console.log('Text styles: every text on the five styles.')
