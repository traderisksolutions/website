// The knowledge file: one plain-text file per site, every save a new row in knowledge_versions.
// Nothing is overwritten. The current version is mirrored into knowledge_entries (source =
// 'file') so the Python engine keeps reading the table it already knows.
//
// File format: lines starting with `# ` open a block; the lines under a heading are its body.
// `## ` and deeper stay inside the body. Text before the first heading is not mirrored.
import { sb } from '@/lib/sales/db'
import type { KnowledgeSection } from './knowledge-schema'

export type KnowledgeVersion = {
  version: number
  text: string
  word_count: number
  heading_count: number
  created_by: string | null
  created_at: string
}
export type KnowledgeVersionMeta = Omit<KnowledgeVersion, 'text'>

export const TEXT_MIN = 20
export const TEXT_MAX = 200_000
export const MIGRATION_PENDING_LINE = 'Migration 20261019_marketing_v2 is not applied yet.'

const META = 'version,word_count,heading_count,created_by,created_at'
const FULL = `${META},text`

/** PostgREST says the v2 tables are not there: the dashboard deployed before the migration ran. */
export function isMigrationPending(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /does not exist|42P01|PGRST205/.test(msg)
}

const isUniqueConflict = (e: unknown) => /\(409\)|23505/.test(e instanceof Error ? e.message : String(e))

// ── Reads ────────────────────────────────────────────────────────────────

export async function getCurrentVersion(siteId: string): Promise<KnowledgeVersion | null> {
  const rows = await sb<KnowledgeVersion[]>(`knowledge_versions?site_id=eq.${siteId}&select=${FULL}&order=version.desc&limit=1`)
  return rows[0] ?? null
}

/** Newest first, without the text. */
export async function listVersions(siteId: string): Promise<KnowledgeVersionMeta[]> {
  return sb<KnowledgeVersionMeta[]>(`knowledge_versions?site_id=eq.${siteId}&select=${META}&order=version.desc&limit=1000`)
}

export async function getVersion(siteId: string, n: number): Promise<KnowledgeVersion | null> {
  if (!Number.isInteger(n) || n < 1) return null
  const rows = await sb<KnowledgeVersion[]>(`knowledge_versions?site_id=eq.${siteId}&version=eq.${n}&select=${FULL}&limit=1`)
  return rows[0] ?? null
}

// ── Pure helpers ─────────────────────────────────────────────────────────

const normalise = (text: string) => text.replace(/\r\n?/g, '\n')

export const wordCount = (text: string) => normalise(text).split(/\s+/).filter(Boolean).length
export const headingCount = (text: string) => (normalise(text).match(/^# \S/gm) ?? []).length

const MARKET_CODE: Record<string, string> = {
  singapore: 'SG', sg: 'SG',
  'hong kong': 'HK', hongkong: 'HK', hk: 'HK',
  malaysia: 'MY', my: 'MY',
  indonesia: 'ID', id: 'ID',
}

export type FileBlock = { section: KnowledgeSection; title: string; body: string; markets: string[] }

/** Heading text → section, title and markets. Case-insensitive on the heading's first words. */
export function sectionFor(heading: string): Pick<FileBlock, 'section' | 'title' | 'markets'> {
  const title = heading.trim().slice(0, 200)
  const h = title.toLowerCase()
  if (h.startsWith('do not write')) return { section: 'business', title: 'Do not write', markets: [] }
  if (h.startsWith('business')) return { section: 'business', title, markets: [] }
  if (h.startsWith('approved claim')) return { section: 'claim', title, markets: [] }
  if (h.startsWith('market')) {
    const after = title.split(',').slice(1).join(',').trim().toLowerCase()
    const code = MARKET_CODE[after]
    return { section: 'market', title, markets: code ? [code] : [] }
  }
  if (h.startsWith('case stud')) return { section: 'case_study', title, markets: [] }
  return { section: 'product', title, markets: [] }
}

/** The file → one block per `# ` heading. Blocks with a body under 10 characters are dropped. */
export function splitFile(text: string): FileBlock[] {
  const lines = normalise(text).split('\n')
  const out: FileBlock[] = []
  let heading: string | null = null
  let buf: string[] = []
  const flush = () => {
    if (heading === null) return
    const meta = sectionFor(heading)
    const body = buf.join('\n').trim().slice(0, 40_000)
    if (meta.title && body.length >= 10) out.push({ ...meta, body })
  }
  for (const line of lines) {
    const m = line.match(/^# (.*)$/)
    if (m) { flush(); heading = m[1]; buf = [] }
    else if (heading !== null) buf.push(line)
  }
  flush()
  return out
}

// ── Writes ───────────────────────────────────────────────────────────────

async function nextVersion(siteId: string): Promise<number> {
  const rows = await sb<{ version: number }[]>(`knowledge_versions?site_id=eq.${siteId}&select=version&order=version.desc&limit=1`)
  return (rows[0]?.version ?? 0) + 1
}

/** Replaces the file's mirror in knowledge_entries: every `# ` block becomes one verified entry. */
export async function syncEntriesFromFile(siteId: string, text: string, actor: string): Promise<{ inserted: number }> {
  await sb(`knowledge_entries?site_id=eq.${siteId}&source=eq.file`, { method: 'DELETE', prefer: 'return=minimal' })
  const blocks = splitFile(text)
  if (blocks.length === 0) return { inserted: 0 }
  const now = new Date().toISOString()
  const rows = blocks.map(b => ({
    site_id: siteId, section: b.section, title: b.title, body: b.body, attributes: {}, markets: b.markets,
    language: 'en', status: 'verified', priority: 5, source: 'file', updated_at: now, updated_by: actor,
  }))
  await sb('knowledge_entries', { method: 'POST', body: JSON.stringify(rows), prefer: 'return=minimal' })
  return { inserted: rows.length }
}

/** Saves the text as version max+1 (one retry on a version clash), then mirrors it into entries. */
export async function saveVersion(siteId: string, input: string, actor: string): Promise<{ version: number } | { error: string }> {
  const text = normalise(typeof input === 'string' ? input : '')
  if (text.trim().length < TEXT_MIN) return { error: `The file must be at least ${TEXT_MIN} characters` }
  if (text.length > TEXT_MAX) return { error: `The file is over ${TEXT_MAX.toLocaleString('en-SG')} characters` }
  const base = { site_id: siteId, text, word_count: wordCount(text), heading_count: headingCount(text), created_by: actor }
  const insert = (version: number) => sb('knowledge_versions', { method: 'POST', body: JSON.stringify({ ...base, version }), prefer: 'return=minimal' })
  let version = await nextVersion(siteId)
  try { await insert(version) }
  catch (e) {
    if (!isUniqueConflict(e)) throw e
    version = await nextVersion(siteId)
    await insert(version)
  }
  await syncEntriesFromFile(siteId, text, actor)
  return { version }
}
