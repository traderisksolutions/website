/**
 * The lines library (Quotes › Lines): per line, what the client must send, what insurers ask back,
 * the two drafts and the Knowledge for AI. The starting text is the 19 Nov 2026 mail study
 * (line-study.json, 14 lines); every edit is a new row in placement_line_texts, the latest row wins.
 * Tables are stored as JSON rows in the same text column so they version the same way.
 */
import study from './line-study.json'

type Study = {
  k: string; s: string; label: string; br: string
  fields: [string, string, string][]; docs: [string, string][]; asks: [string, number][]; declines: [string, number][]; cask: [string, number][]
  rounds: string; priced: string; cycle: string; markets: string; deadline: string
  tone: { to_insurer: string; to_client: string }; t_ins: string; t_cli: string; gaps: string[]
}

export type LineKey = string
export const LINES = (study as unknown as Study[]).map(l => ({ key: l.k, short: l.s, label: l.label, brochure: l.br, documents: l.docs, declines: l.declines }))
const byKey = new Map((study as unknown as Study[]).map(l => [l.k, l]))
export const isLineKey = (v: unknown): v is LineKey => typeof v === 'string' && byKey.has(v)

export const TEXT_PARTS = ['to_insurer', 'to_client', 'knowledge'] as const
export const TABLE_PARTS = ['client_data', 'insurer_asks'] as const
export const PARTS = [...TEXT_PARTS, ...TABLE_PARTS] as const
export type Part = (typeof PARTS)[number]
export const isPart = (v: unknown): v is Part => typeof v === 'string' && (PARTS as readonly string[]).includes(v)

/** A table row: item, the typical value or the question, and how often the study saw it. */
export type Row = { item: string; detail: string; seen: string }

function knowledgeFrom(l: Study): string {
  return [
    `Rounds: ${l.rounds}`, `Brochure pricing: ${l.priced}`, `Cycle: ${l.cycle}`, `Markets: ${l.markets}`, `Deadline: ${l.deadline}`,
    `Tone to insurers: ${l.tone.to_insurer}`, `Tone to clients: ${l.tone.to_client}`,
    `Gaps against the request builder:\n${l.gaps.map(g => `- ${g}`).join('\n')}`,
  ].join('\n\n')
}

/** The study's text for a part: plain text, or JSON rows for a table part. */
export function studyText(key: LineKey, part: Part): string {
  const l = byKey.get(key)
  if (!l) return ''
  switch (part) {
    case 'to_insurer': return l.t_ins
    case 'to_client': return l.t_cli
    case 'knowledge': return knowledgeFrom(l)
    case 'client_data': return JSON.stringify(l.fields.map(([item, detail, seen]): Row => ({ item, detail, seen })))
    case 'insurer_asks': return JSON.stringify(l.asks.map(([item, n]): Row => ({ item, detail: '', seen: `${n} threads` })))
  }
}

/** Rows from a stored table body; anything unreadable is an empty table. */
export function rowsFrom(body: string): Row[] {
  try {
    const v = JSON.parse(body)
    if (!Array.isArray(v)) return []
    return v.filter(r => r && typeof r === 'object').map(r => ({ item: String(r.item ?? ''), detail: String(r.detail ?? ''), seen: String(r.seen ?? '') }))
  } catch {
    return []
  }
}

const MAX_BODY = 40_000

/** A body as it may be saved: text trimmed and bounded; table rows cleaned, blank rows dropped. Null when nothing is left. */
export function bodyFrom(part: Part, v: unknown): string | null {
  if ((TABLE_PARTS as readonly string[]).includes(part)) {
    if (!Array.isArray(v)) return null
    const rows = v.map(r => ({ item: String(r?.item ?? '').trim().slice(0, 500), detail: String(r?.detail ?? '').trim().slice(0, 2000), seen: String(r?.seen ?? '').trim().slice(0, 100) }))
      .filter(r => r.item)
    return JSON.stringify(rows)
  }
  if (typeof v !== 'string') return null
  const t = v.replace(/\r\n/g, '\n').trim()
  return t ? t.slice(0, MAX_BODY) : null
}
