/**
 * The references on file — policy numbers, claim numbers, insurer claim references — keyed by
 * refKey, so a token read off an email finds its policy, claim or case. Cached for 5 minutes.
 */
import { sbTry } from '@/lib/crm/db'
import { refKey, findReferences } from './signals'

export type RefTarget =
  | { kind: 'policy'; policyId: string; companyId: string | null }
  | { kind: 'claim'; claimId: string; workItemId: string | null; companyId: string | null; field: 'insurer_ref' | 'policy_number' }
  | { kind: 'work_item'; workItemId: string; companyId: string | null }

type Row = Record<string, any>
let cache: { at: number; index: Map<string, RefTarget[]> } | null = null

/** Forget the cached index — after an agent records a new claim or policy number, say. */
export function clearReferenceCache() { cache = null }

export async function referenceIndex(): Promise<Map<string, RefTarget[]>> {
  if (cache && Date.now() - cache.at < 300_000) return cache.index
  const [policies, claims, items] = await Promise.all([
    sbTry<Row[]>('policies?policy_number=not.is.null&select=id,company_id,policy_number&limit=5000', []),
    sbTry<Row[]>('claims?select=id,work_item_id,company_id,insurer_ref,policy_number&limit=5000', []),
    sbTry<Row[]>('work_items?closed_at=is.null&policy_number=not.is.null&select=id,company_id,policy_number&limit=5000', []),
  ])
  const index = new Map<string, RefTarget[]>()
  const add = (raw: string | null | undefined, t: RefTarget) => {
    // A case's policy_number field can hold prose ("00987600 (Example Life, incumbent)"): take its tokens.
    for (const part of String(raw ?? '').split(/[\s,;()]+/)) {
      const k = refKey(part)
      if (k.length < 6 || (k.match(/\d/g) ?? []).length < 3) continue
      index.set(k, [...(index.get(k) ?? []), t])
    }
  }
  for (const p of policies) add(p.policy_number, { kind: 'policy', policyId: p.id, companyId: p.company_id ?? null })
  for (const c of claims) {
    add(c.insurer_ref, { kind: 'claim', claimId: c.id, workItemId: c.work_item_id ?? null, companyId: c.company_id ?? null, field: 'insurer_ref' })
    add(c.policy_number, { kind: 'claim', claimId: c.id, workItemId: c.work_item_id ?? null, companyId: c.company_id ?? null, field: 'policy_number' })
  }
  for (const w of items) add(w.policy_number, { kind: 'work_item', workItemId: w.id, companyId: w.company_id ?? null })
  cache = { at: Date.now(), index }
  return index
}

export async function referencesIn(text: string) {
  const index = await referenceIndex()
  return findReferences(text, index)
}

/** The one client the references point at, when they agree. */
export function companyOfReferences(hits: { value: RefTarget[] }[]): string | null {
  const ids = new Set(hits.flatMap(h => h.value.map(v => v.companyId)).filter((x): x is string => !!x))
  return ids.size === 1 ? Array.from(ids)[0] : null
}
