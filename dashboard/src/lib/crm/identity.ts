/**
 * Company identity: deciding whether a name we just read is a company we already know.
 *
 * This is the part that keeps the CRM from filling up with near-duplicates. "Mister Mobile",
 * "Mister Mobile Yishun" and "Mister Mobile Trading Pte Ltd" must all land on one record, while
 * "Fong Group 2023" and "Fong Seng Fast Food" must stay apart. Matching therefore works on the
 * distinctive core of a name (legal suffixes removed), on every alias we have confirmed before,
 * and on a containment rule that is deliberately asymmetric: a short name inside a longer one is
 * the same company, but two names that merely share a common word are not.
 */
import { sbTry, sb, enc } from './db'
import { companyCore, normalizeName } from './resolve'
import type { Company } from './types'

export interface AliasRow { id: string; company_id: string; alias: string; alias_norm: string; source: string }

/** The matching key for a name: its distinctive core. */
export const aliasKey = (name: string) => companyCore(name)

/** Words too common to identify anyone on their own. */
const WEAK = new Set([
  'group', 'holdings', 'trading', 'services', 'service', 'engineering', 'construction', 'capital',
  'management', 'international', 'asia', 'global', 'singapore', 'medical', 'insurance', 'solutions',
  'technology', 'technologies', 'industries', 'enterprise', 'enterprises', 'associates', 'partners',
  'consulting', 'development', 'investment', 'investments', 'the', 'and', 'for', 'new', 'pte', 'ltd',
])

/** Fold a simple plural so "Foundation" and "Foundations" are the same word. */
const stem = (t: string) => (t.length >= 5 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t)

const strongTokens = (core: string) =>
  core.split(' ').filter(t => t.length >= 3 && !WEAK.has(t)).map(stem).filter(t => !WEAK.has(t))

export type MatchStrength = 'exact' | 'alias' | 'contained' | 'overlap' | 'none'
export interface NameMatch { companyId: string; strength: MatchStrength; score: number; matchedOn: string }

export interface IdentityIndex {
  byCore: Map<string, string>          // normalised core → company id
  byAlias: Map<string, string>         // normalised alias → company id
  companies: Map<string, Company>
}

export function buildIdentityIndex(companies: Company[], aliases: AliasRow[]): IdentityIndex {
  const byCore = new Map<string, string>()
  const seenCore = new Map<string, Set<string>>()
  for (const c of companies) {
    const core = aliasKey(c.name)
    if (!core) continue
    seenCore.set(core, (seenCore.get(core) ?? new Set()).add(c.id))
  }
  seenCore.forEach((owners, core) => { if (owners.size === 1) byCore.set(core, Array.from(owners)[0]) })

  const byAlias = new Map<string, string>()
  for (const a of aliases) if (a.alias_norm) byAlias.set(a.alias_norm, a.company_id)

  return { byCore, byAlias, companies: new Map(companies.map(c => [c.id, c])) }
}

/**
 * Find the company a name refers to. Returns the best match with how it was reached, so the
 * caller can require more confidence before acting on a weaker one.
 */
export function matchName(name: string, index: IdentityIndex): NameMatch | null {
  const core = aliasKey(name)
  if (!core || core.length < 3) return null

  const exact = index.byCore.get(core)
  if (exact) return { companyId: exact, strength: 'exact', score: 1, matchedOn: core }

  const alias = index.byAlias.get(core)
  if (alias) return { companyId: alias, strength: 'alias', score: 1, matchedOn: core }

  const tokens = strongTokens(core)
  if (tokens.length === 0) return null

  let best: NameMatch | null = null
  const consider = (candidateCore: string, companyId: string) => {
    const cTokens = strongTokens(candidateCore)
    if (cTokens.length === 0) return

    // Containment: every distinctive word of the shorter name appears in the longer one.
    const [short, long] = tokens.length <= cTokens.length ? [tokens, cTokens] : [cTokens, tokens]
    const containedAll = short.every(t => long.includes(t))
    if (containedAll && short.length >= 1 && short.join('').length >= 6) {
      const score = 0.9 - Math.min(0.2, (long.length - short.length) * 0.05)
      if (!best || score > best.score) best = { companyId, strength: 'contained', score, matchedOn: candidateCore }
      return
    }

    // Otherwise require substantial overlap of distinctive words. Weaker matches are still
    // reported so the review queue can offer them as "did you mean"; only the caller decides
    // what is strong enough to act on unattended.
    const shared = tokens.filter(t => cTokens.includes(t))
    if (shared.length < 2) return
    const score = shared.length / Math.max(tokens.length, cTokens.length)
    if (score >= 0.6 && (!best || score > best.score)) best = { companyId, strength: 'overlap', score, matchedOn: candidateCore }
  }

  index.byCore.forEach((companyId, candidateCore) => consider(candidateCore, companyId))
  index.byAlias.forEach((companyId, candidateAlias) => consider(candidateAlias, companyId))
  return best
}

// ── Persistence ───────────────────────────────────────────────────────────────────────────────

export async function loadAliases(): Promise<AliasRow[]> {
  return sbTry<AliasRow[]>(`company_aliases?select=id,company_id,alias,alias_norm,source&limit=5000`, [])
}

/** Remember a spelling for a company. Silently does nothing if the alias is already claimed. */
export async function recordAlias(companyId: string, alias: string, source: 'manual' | 'learned' | 'ai' | 'seed', createdBy?: string | null): Promise<void> {
  const norm = aliasKey(alias)
  if (!norm || norm.length < 3) return
  await sbTry(`company_aliases?on_conflict=alias_norm`, null, {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ company_id: companyId, alias: alias.trim(), alias_norm: norm, source, created_by: createdBy ?? null }),
  })
}

export async function aliasesFor(companyId: string): Promise<AliasRow[]> {
  return sbTry<AliasRow[]>(`company_aliases?company_id=eq.${enc(companyId)}&select=id,company_id,alias,alias_norm,source&order=alias.asc`, [])
}

export async function deleteAlias(id: string): Promise<void> {
  await sb(`company_aliases?id=eq.${enc(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
}

export { normalizeName }
