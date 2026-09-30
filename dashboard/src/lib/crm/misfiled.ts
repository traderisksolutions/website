/**
 * Insurer mail that is really about a client.
 *
 * TRS names the client in almost every subject, in one of two house shapes:
 *
 *     (TRS) Liberty - BLL's Transportation and Trading Pte Ltd | Motor
 *     TRS (RHI) : Healthway Medical Group Pte Ltd - Policy renewal
 *
 * `resolveThread` already moves such a thread onto the client when that client has a company
 * record. What it cannot do is move a thread onto a client that does not exist yet, so those
 * threads stay filed under the insurer where nobody looks at them. This finds them, reads the
 * name out of the subject, and puts each one on the triage page as a decision: link it to a
 * company we already have, create the company, or say it really is insurer-only correspondence.
 *
 * Deliberately conservative. Only the two house shapes are read, never a guess at a capitalised
 * word, because a wrong client on an insurer thread is worse than an unread one.
 */
import { sbTry, enc, normalizeCompany } from './db'
import { buildCompanyIndex, matchByName, companyCore } from './resolve'
import type { Company } from './types'

/** Cover words and document nouns that name a product, not a client. */
const NOT_A_CLIENT = new Set([
  'policy', 'policies', 'renewal', 'renewals', 'quotation', 'quote', 'quotes', 'claim', 'claims',
  'endorsement', 'invoice', 'debit note', 'cover note', 'certificate', 'proposal', 'enquiry',
  'professional indemnity', 'public liability', 'work injury compensation', 'wic', 'd o', 'cyber',
  'motor fleet', 'group personal accident', 'gpa', 'employee benefits', 'travel', 'marine cargo',
  'performance bond', 'security bond', 'advance payment bond', 'all risks', 'fire',
])

const TRAILING_COVER = /\s*[|·–-]\s*(policy|renewal|quotation|quote|claim|endorsement|insurance|cover|wic|d&o|cyber|pi|gpa|cargo|motor|bond)\b.*$/i

/** A cover named after the client, with no separator: "Gourmetz Motor Fleet" is Gourmetz. Kept
 *  tight to real insurance covers, because this name prefills the create-company field. */
const TRAILING_COVER_BARE = new RegExp(
  '\\s+(' + [
    'motor fleet', 'fleet', 'marine cargo( insurance)?', 'cargo( insurance)?', 'work injury compensation',
    'professional indemnity', 'public liability', 'employee benefits', 'group travel', 'travel insurance',
    'all risks', 'performance bond', 'security bond', 'advance payment bond', 'group personal accident',
    'endorsement', 'renewal', 'policy', 'quotation',
  ].join('|') + ')\\s*$', 'i')

/** The client named in a TRS subject line, or null when the subject does not use the house shape. */
export function clientFromSubject(subject: string | null | undefined): string | null {
  return subjectCandidates(subject)[0] ?? null
}

/**
 * Both names a TRS subject offers, best first. The house shape is "(TRS) Insurer - Client", but
 * staff sometimes write "(TRS) Client - Cover", so the other side is returned as a fallback and
 * the caller picks whichever is not the insurer the thread is already filed under.
 */
export function subjectCandidates(subject: string | null | undefined): string[] {
  const after = parseSide(subject, 'after')
  const before = parseSide(subject, 'before')
  return [after, before].filter((x): x is string => !!x && x.length >= 3)
}

function parseSide(subject: string | null | undefined, side: 'after' | 'before'): string | null {
  const s = (subject ?? '').replace(/^\s*(re|fw|fwd|回复|答复)\s*[::]\s*/gi, '').trim()
  if (!s) return null

  // (TRS) Insurer - Client   |   (TRS) Insurer- Client
  let m = /\(\s*TRS\s*\)\s*([^-–|:]{1,40}?)\s*[-–]\s*(.+)$/i.exec(s)
  // TRS (Insurer) : Client
  if (!m) { const c = /\bTRS\s*\(([^)]{1,40})\)\s*[:：]\s*(.+)$/i.exec(s); if (c) m = c }
  if (!m) return null
  if (side === 'before' && !/\(\s*TRS\s*\)/i.test(s)) return null

  let name = (side === 'after' ? m[2] : m[1]).replace(TRAILING_COVER, '').split(/\s*[|]\s*/)[0].trim()
  name = name.replace(/\s*[-–]\s*(renewal|policy|quotation|claim|endorsement|premium|staff|emergency|notification).*$/i, '').trim()
  // "Whampoa Soya Bean Pte Ltd Renewal for 2026", "… Policy No : 2026/123" — the client, then admin.
  name = name.replace(/\s+(policy\s*(no|number)\b|renewal\s+for\b|premium\s+calculation\b|notification\s+of\b).*$/i, '').trim()
  name = name.replace(/\s{2,}/g, ' ')
  for (let prev = ''; prev !== name;) { prev = name; const cut = name.replace(TRAILING_COVER_BARE, '').trim(); if (cut.length >= 3) name = cut }
  name = name.replace(/[.,;:]+$/, '').trim()
  if (name.length < 3 || name.length > 70) return null
  if (NOT_A_CLIENT.has(name.toLowerCase())) return null
  if (!/[a-z]/i.test(name)) return null
  return name
}

export interface MisfiledThread {
  id: string
  subject: string | null
  lastMessageAt: string | null
  filedUnder: { id: string; name: string; kind: string }
  /** The name read out of the subject. */
  looksLike: string
  /** An existing company that name matches, when there is one — then it is a one-click link. */
  match: { id: string; name: string } | null
}

type ThreadRow = { id: string; subject: string | null; last_message_at: string | null; company_id: string }

/**
 * Threads filed under an insurer or partner whose subject names something else. Threads a person
 * has already marked as insurer-only are left out, so a decision sticks.
 */
export async function listMisfiledThreads(): Promise<MisfiledThread[]> {
  const counterparties = (await sbTry<Record<string, unknown>[]>(
    `companies?kind=in.(insurer,partner)&select=*&limit=500`, [])).map(normalizeCompany)
  if (counterparties.length === 0) return []
  const byId = new Map<string, Company>(counterparties.map(c => [c.id, c]))

  const [threads, settled] = await Promise.all([
    sbTry<ThreadRow[]>(
      `email_threads?company_id=in.(${counterparties.map(c => c.id).join(',')})&deleted_at=is.null` +
      `&select=id,subject,last_message_at,company_id&order=last_message_at.desc.nullslast&limit=1000`, []),
    sbTry<{ thread_id: string }[]>(
      `company_link_suggestions?status=eq.accepted&verdict=eq.not_client&select=thread_id`, []),
  ])
  const done = new Set(settled.map(r => r.thread_id))
  const index = await buildCompanyIndex()

  const out: MisfiledThread[] = []
  for (const t of threads) {
    if (done.has(t.id)) continue
    const filed = byId.get(t.company_id)
    if (!filed) continue
    // Prefer a candidate that resolves to a client we already have; otherwise the first one
    // that is not simply the insurer this thread already sits under.
    let looksLike: string | null = null
    let matched: Company | null = null
    for (const c of subjectCandidates(t.subject)) {
      if (companyCore(c) === companyCore(filed.name)) continue
      const hit = matchByName(c, index)
      const m = hit ? index.byId.get(hit.companyId) ?? null : null
      if (m && m.kind === 'client' && m.id !== t.company_id) { looksLike = c; matched = m; break }
      if (!looksLike && !m) looksLike = c
    }
    if (!looksLike) continue
    if (matched && (matched.id === t.company_id || matched.kind !== 'client')) continue

    out.push({
      id: t.id,
      subject: t.subject,
      lastMessageAt: t.last_message_at,
      filedUnder: { id: filed.id, name: filed.name, kind: filed.kind },
      looksLike,
      match: matched ? { id: matched.id, name: matched.name } : null,
    })
  }
  return out
}

/** Grouped by the name read from the subject, so one decision can clear several threads. */
export function groupMisfiled(rows: MisfiledThread[]): { looksLike: string; match: MisfiledThread['match']; threads: MisfiledThread[] }[] {
  const by = new Map<string, MisfiledThread[]>()
  for (const r of rows) {
    const k = companyCore(r.looksLike) || r.looksLike.toLowerCase()
    by.set(k, [...(by.get(k) ?? []), r])
  }
  return Array.from(by.values())
    .map(threads => ({ looksLike: threads[0].looksLike, match: threads[0].match, threads }))
    .sort((a, b) => b.threads.length - a.threads.length || a.looksLike.localeCompare(b.looksLike))
}

export { enc }
