/**
 * Reads and writes of agent_documents (20261121_x_agent_documents.sql): the versions of each agent's
 * instructions and each knowledge text. The newest version is in force. Server only. No model.
 */
import { db, rows } from '@/lib/db/client'
import { composeGuidance, type AgentKey, type DocVersion } from './knowledge'

const COLS = 'doc_key,version,body,created_by,created_at'
let cache: { at: number; docs: Map<string, DocVersion> } | null = null

/** The version in force of every text, cached a minute: one read a minute however many model calls. */
export async function inForce(): Promise<Map<string, DocVersion>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.docs
  const all = await rows('Agent documents', db().from('agent_documents').select(COLS).order('doc_key').order('version', { ascending: false }).limit(2000)) as DocVersion[]
  const docs = new Map<string, DocVersion>()
  for (const d of all) if (!docs.has(d.doc_key)) docs.set(d.doc_key, d)
  cache = { at: Date.now(), docs }
  return docs
}

/** What a model call for this agent carries; nothing when no text is saved or the table is missing. */
export async function guidanceFor(agent: AgentKey, json: boolean): Promise<{ text: string; versions: Record<string, number> }> {
  try { return composeGuidance(agent, await inForce(), json) } catch { return { text: '', versions: {} } }
}

export async function history(docKey: string): Promise<DocVersion[]> {
  return rows('Agent document versions', db().from('agent_documents').select(COLS).eq('doc_key', docKey).order('version', { ascending: false }).limit(200)) as Promise<DocVersion[]>
}

/** Saves a new version; returns it. A restore is a save of an old version's text. */
export async function saveVersion(docKey: string, body: string, by: string): Promise<DocVersion> {
  const latest = (await history(docKey))[0]
  if (latest && latest.body === body) return latest
  const [row] = await rows('Agent document', db().from('agent_documents').insert({ doc_key: docKey, version: (latest?.version ?? 0) + 1, body, created_by: by }).select(COLS)) as DocVersion[]
  cache = null
  return row
}
