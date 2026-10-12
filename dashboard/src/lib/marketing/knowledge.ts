// Knowledge bank reads and writes, per site.
import { sb, enc } from '@/lib/sales/db'
import { SECTION_BY_KEY, isMarket, isSection, splitMarkdown, type KnowledgeEntry, type KnowledgeSection } from './knowledge-schema'

const COLS = 'id,site_id,section,title,body,attributes,markets,language,status,priority,source,created_at,updated_at,updated_by'

export async function listKnowledge(siteId: string): Promise<KnowledgeEntry[]> {
  return sb<KnowledgeEntry[]>(`knowledge_entries?site_id=eq.${siteId}&status=neq.archived&select=${COLS}&order=priority.desc,updated_at.desc&limit=2000`)
}

export type EntryInput = {
  id?: string
  section?: string
  title?: string
  body?: string
  attributes?: Record<string, unknown>
  markets?: unknown
  language?: string
  status?: string
  priority?: number
}

/** Validates and saves one entry (insert when no id). Returns the error text when rejected. */
export async function saveEntry(siteId: string, input: EntryInput, actor: string): Promise<{ id: string } | { error: string }> {
  if (!isSection(input.section)) return { error: 'A section is required' }
  const title = (input.title ?? '').trim().slice(0, 200)
  const body = (input.body ?? '').trim().slice(0, 40000)
  if (title.length < 3) return { error: 'A title is required' }
  if (body.length < 10) return { error: `${SECTION_BY_KEY[input.section].bodyLabel} is too short` }
  const allowed = new Set(SECTION_BY_KEY[input.section].attributeFields.map(f => f.key).concat(['code', 'language', 'currency']))
  const attributes: Record<string, string> = {}
  for (const [k, v] of Object.entries(input.attributes ?? {})) if (allowed.has(k) && typeof v === 'string' && v.trim()) attributes[k] = v.trim().slice(0, 4000)
  const markets = Array.isArray(input.markets) ? input.markets.filter(isMarket) : []
  const status = input.status === 'verified' || input.status === 'archived' ? input.status : 'draft'
  const language = input.language === 'id' ? 'id' : 'en'
  const priority = Math.max(0, Math.min(10, Math.floor(Number(input.priority ?? 0)) || 0))
  const row = { site_id: siteId, section: input.section, title, body, attributes, markets, language, status, priority, updated_at: new Date().toISOString(), updated_by: actor }
  const rows = input.id
    ? await sb<{ id: string }[]>(`knowledge_entries?id=eq.${input.id}&site_id=eq.${siteId}&select=id`, { method: 'PATCH', body: JSON.stringify(row) })
    : await sb<{ id: string }[]>('knowledge_entries?select=id', { method: 'POST', body: JSON.stringify({ ...row, source: 'manual' }) })
  if (!rows[0]) return { error: 'Entry not found' }
  return { id: rows[0].id }
}

export async function archiveEntry(siteId: string, id: string, actor: string): Promise<boolean> {
  const rows = await sb<{ id: string }[]>(`knowledge_entries?id=eq.${id}&site_id=eq.${siteId}&select=id`, { method: 'PATCH', body: JSON.stringify({ status: 'archived', updated_at: new Date().toISOString(), updated_by: actor }) })
  return rows.length > 0
}

/** Pasted markdown → draft entries, skipping titles the section already has. */
export async function importPaste(siteId: string, input: { markdown?: string; section?: string; markets?: unknown; title?: string }, actor: string): Promise<{ inserted: number } | { error: string }> {
  const markdown = (input.markdown ?? '').trim()
  if (markdown.length < 20) return { error: 'Paste at least a paragraph' }
  const section: KnowledgeSection = isSection(input.section) ? input.section : 'document'
  const markets = Array.isArray(input.markets) ? input.markets.filter(isMarket) : []
  const fallbackTitle = (input.title ?? '').trim().slice(0, 200) || `Pasted ${new Date().toISOString().slice(0, 10)}`
  const existing = new Set((await sb<{ title: string }[]>(`knowledge_entries?site_id=eq.${siteId}&section=eq.${section}&select=title&limit=5000`)).map(r => r.title))
  const rows = splitMarkdown(markdown.slice(0, 200000), fallbackTitle).filter(e => !existing.has(e.title))
    .map(e => ({ site_id: siteId, section, title: e.title, body: e.body.slice(0, 40000), attributes: {}, markets, language: 'en', status: 'draft', priority: 0, source: 'paste', updated_by: actor }))
  if (rows.length === 0) return { inserted: 0 }
  await sb('knowledge_entries', { method: 'POST', body: JSON.stringify(rows), prefer: 'return=minimal' })
  return { inserted: rows.length }
}

export const sectionCountPath = (siteId: string, section: string) => `knowledge_entries?site_id=eq.${siteId}&section=eq.${enc(section)}&status=neq.archived`
