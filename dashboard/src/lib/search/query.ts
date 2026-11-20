/**
 * Email search (20 Nov 2026): one box finds a thread by a name, an address, a subject, a file name
 * or any word of its mail. The index is thread_search (supabase/migrations/20261120_thread_search.sql,
 * docs/search.md); this file builds the queries against it and shapes the answer. Pure and
 * browser-safe. Tested in src/__tests__/search-query.test.ts.
 */

export type SearchTerms = {
  /** Lower-case words of two or more characters, at most eight, in the order typed. */
  words: string[]
  /** A to_tsquery for the 'simple' configuration: every word as a prefix, all required. Empty when no word. */
  tsquery: string
  /** The longest word, for the trigram filter on subject, people and files; null when under three characters. */
  trigram: string | null
}

/** Words of a search. Addresses stay whole ("jiaqing@cccc.com"); everything else splits on punctuation. */
export function searchTerms(q: string): SearchTerms {
  const raw = String(q ?? '').toLowerCase().slice(0, 120)
  const words: string[] = []
  for (const part of raw.split(/\s+/)) {
    if (!part) continue
    const pieces = /^[^\s@]+@[^\s@]+$/.test(part) ? [part.replace(/[^\p{L}\p{N}@._-]/gu, '')] : part.split(/[^\p{L}\p{N}]+/u)
    for (const p of pieces) if (p.length >= 2 && !words.includes(p)) words.push(p)
  }
  const kept = words.slice(0, 8)
  // to_tsquery needs each term quoted safely: only letters, digits and @._- survive, and the term
  // is wrapped in single quotes so "." or "-" never reads as an operator.
  const tsquery = kept.map(w => `'${w.replace(/[^\p{L}\p{N}@._-]/gu, '')}':*`).filter(t => t !== "'':*").join(' & ')
  const longest = [...kept].sort((a, b) => b.length - a.length)[0]
  return { words: kept, tsquery, trigram: longest && longest.length >= 3 ? longest : null }
}

/** Every word appears in the text (case-insensitive). */
export const hasEvery = (text: string, words: readonly string[]) => { const t = text.toLowerCase(); return words.every(w => t.includes(w)) }

export type Person = { name: string | null; email: string }

/** "Name <email>; Name2 <email2>" (the index's people column) back into people. */
export function parsePeople(s: string | null | undefined): Person[] {
  const out: Person[] = []
  for (const part of String(s ?? '').split(/;\s*|\n/)) {
    const m = part.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
    const email = (m ? m[2] : part).trim().toLowerCase()
    if (!email.includes('@')) continue
    const name = m ? m[1].replace(/["']/g, '').trim() || null : null
    if (!out.some(p => p.email === email)) out.push({ name, email })
  }
  return out
}

/** People as the index stores them. */
export const peopleText = (ps: readonly Person[]) => ps.map(p => (p.name ? `${p.name} <${p.email}>` : `<${p.email}>`)).join('; ')

export type IndexRow = {
  thread_id: string; company_id: string | null; mailboxes: string[] | null; subject: string | null
  people: string | null; attachments: string | null; last_message_at: string | null
}

export type ThreadHit = {
  threadId: string; subject: string; companyId: string | null; companyName: string | null; companyKind: string | null
  people: Person[]; lastAt: string | null; mailboxes: string[]; inbox: string
  /** The viewer may open the mail (visibility.ts); when false, `owner` names whose inbox holds it. */
  canOpen: boolean; owner: string | null
  /** Where the words were found: subject, people, a file name, or the text of the mail. */
  via: 'subject' | 'people' | 'file' | 'text'
}
export type PersonHit = Person & { threads: number; lastAt: string | null }
export type CompanyHit = { id: string; name: string; kind: string | null }
export type FileHit = { filename: string; threadId: string; subject: string; lastAt: string | null; canOpen: boolean; owner: string | null; attachmentId: string | null }
export type SearchAnswer = { index: true; threads: ThreadHit[]; people: PersonHit[]; companies: CompanyHit[]; files: FileHit[] }

/** Where the words were found on a thread, the most telling place first. */
export function viaOf(row: Pick<IndexRow, 'subject' | 'people' | 'attachments'>, words: readonly string[]): ThreadHit['via'] {
  if (hasEvery(row.subject ?? '', words)) return 'subject'
  if (hasEvery(row.people ?? '', words)) return 'people'
  if (hasEvery(row.attachments ?? '', words)) return 'file'
  return 'text'
}

/**
 * A thread the viewer may not open is listed only when the words are in its subject, its people or
 * its file names, never because of the text of its mail: the search must not tell what a
 * colleague's private email says.
 */
export function listable(row: Pick<IndexRow, 'subject' | 'people' | 'attachments'>, words: readonly string[], canOpen: boolean): boolean {
  return canOpen || hasEvery([row.subject, row.people, row.attachments].filter(Boolean).join(' '), words)
}

/** The people on the found threads whose name or address holds every word: newest thread first, counted. */
export function peopleHits(threads: readonly Pick<ThreadHit, 'people' | 'lastAt'>[], words: readonly string[], max = 6): PersonHit[] {
  const by = new Map<string, PersonHit>()
  for (const t of threads) for (const p of t.people) {
    if (/@trade-risksol\.com$/i.test(p.email) || !hasEvery(`${p.name ?? ''} ${p.email}`, words)) continue
    const cur = by.get(p.email)
    if (!cur) by.set(p.email, { ...p, threads: 1, lastAt: t.lastAt })
    else { cur.threads++; if (!cur.name && p.name) cur.name = p.name; if (String(t.lastAt ?? '') > String(cur.lastAt ?? '')) cur.lastAt = t.lastAt }
  }
  return [...by.values()].sort((a, b) => String(b.lastAt ?? '').localeCompare(String(a.lastAt ?? ''))).slice(0, max)
}

/** File names on the found threads that hold every word, one per name, newest first. */
export function fileHits(rows: readonly (Pick<IndexRow, 'thread_id' | 'attachments'> & { subject: string; lastAt: string | null; canOpen: boolean; owner: string | null })[], words: readonly string[], max = 8): FileHit[] {
  const out: FileHit[] = []
  const seen = new Set<string>()
  for (const r of [...rows].sort((a, b) => String(b.lastAt ?? '').localeCompare(String(a.lastAt ?? '')))) {
    for (const f of String(r.attachments ?? '').split('\n').map(x => x.trim()).filter(Boolean)) {
      if (seen.has(f.toLowerCase()) || !hasEvery(f, words)) continue
      seen.add(f.toLowerCase())
      out.push({ filename: f, threadId: r.thread_id, subject: r.subject, lastAt: r.lastAt, canOpen: r.canOpen, owner: r.owner, attachmentId: null })
      if (out.length >= max) return out
    }
  }
  return out
}
