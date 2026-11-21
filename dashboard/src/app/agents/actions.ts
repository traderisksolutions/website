'use server'
/**
 * AI Agents › Instructions and Knowledge (21 Nov 2026): the versions of a text, saving a new one,
 * restoring an old one as the newest. A text reaches the agents' model calls once saved.
 */
import { staffAction } from '@/lib/auth/action'
import { history, saveVersion } from '@/lib/agents/documents'
import { isKnowledgeKey, KNOWLEDGE_BY_KEY } from '@/lib/agents/knowledge'
import { AGENTS } from '@/lib/ai-agents'
import { logActivity } from '@/lib/log-activity'

const MAX = 20_000

function docKey(key: string): string {
  const [kind, id] = key.split(':')
  if (kind === 'agent' && id in AGENTS) return key
  if (kind === 'kn' && isKnowledgeKey(id) && KNOWLEDGE_BY_KEY[id].kind === 'text') return key
  throw new Error('That text is not known.')
}

export async function documentVersions(key: string) {
  return staffAction('agent document versions', async () => history(docKey(key)))
}

export async function saveDocument(key: string, body: string) {
  return staffAction('save agent document', async user => {
    const k = docKey(key)
    const text = String(body ?? '').replace(/\r\n/g, '\n').trimEnd()
    if (!text.trim()) throw new Error('Write the text before saving.')
    if (text.length > MAX) throw new Error(`The text is over ${MAX.toLocaleString('en-SG')} characters.`)
    const v = await saveVersion(k, text, user.email)
    void logActivity({ action: 'agents.document_saved', resource_type: 'agent_document', resource_id: k, new_value: { version: v.version } })
    return v
  })
}

export async function restoreVersion(key: string, version: number) {
  return staffAction('restore agent document', async user => {
    const k = docKey(key)
    const old = (await history(k)).find(v => v.version === version)
    if (!old) throw new Error('That version is not on file.')
    return saveVersion(k, old.body, user.email)
  })
}
