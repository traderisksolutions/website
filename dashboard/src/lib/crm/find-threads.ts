/** Searching a company's unfiled mail by name (findUnfiledThreads in find-threads-server.ts). Pure. */

/** The words of a company name worth searching a subject for: "Acme Engineering Pte Ltd" → "Acme Engineering". */
export function nameProbe(name: string): string | null {
  const core = name.replace(/\b(pte\.?|ltd\.?|limited|private|llp|inc\.?|corp\.?|co\.?|sdn\.?|bhd\.?|\(s\)|singapore)\b/gi, ' ').replace(/[^\p{L}\p{N}&' -]/gu, ' ').replace(/\s+/g, ' ').trim()
  return core.length >= 3 ? core : null
}
