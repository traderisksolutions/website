/**
 * Projects and parties under one client (20 Nov 2026). A contractor such as CCCC runs many sites at
 * once ("Dover Drive", "Tuas Tower"); its threads name the site in the subject. Code reads the
 * subjects and suggests each name that repeats across two or more threads; a person confirms it
 * before anything is saved (today_threads.project). Parties are read from who is on the threads.
 * Pure and browser-safe. Tested in projects.test.ts.
 */

export type SubjectThread = { threadId: string; subject: string | null | undefined }
export type ProjectSuggestion = { name: string; threadIds: string[] }

/** Words that name a kind of cover, a step or a document, never a site. */
const GENERIC = new Set(`
re fw fwd aw tr redraft draft trs ext external urgent reminder chaser follow up followup update updated
the and of for to in on at a an with from by our your new revised final copy via per
insurance insurances insurer insurers insured policy policies renewal renewals quote quotes quotation quotations
request requests requested rfq invitation enquiry inquiry submission placement proposal form forms
claim claims car el pl wica gpa gtl gci ghs gmm gp eb pa cgl ear mlop tpl dno
employer employers employee employees liability contractors contractor all risk risks works work
stage preliminary prelim tender tenders survey document documents doc docs schedule debit note invoice
premium payment certificate cover note endorsement wording terms condition conditions summary
group medical dental benefits benefit health hospital surgical life accident personal public
professional indemnity marine cargo property fire motor bond bonds performance
mix development developments residential commercial project projects package site
pte ltd limited company co inc llp sg singapore holdings group
jan feb mar apr may jun jul aug sep sept oct nov dec january february march april june july august
september october november december
`.split(/\s+/).filter(Boolean))

const PREFIX = /^\s*((re|fw|fwd|aw|tr|redraft)\s*:\s*|\[[^\]]*\]\s*|\(trs\)\s*)+/i

/** The words of a subject, with reply prefixes and the (TRS) tag removed. */
export function subjectWords(subject: string | null | undefined): string[] {
  const s = String(subject ?? '').replace(PREFIX, ' ').replace(/\(trs\)/gi, ' ')
  return s.split(/[^\p{L}\p{N}&']+/u).map(w => w.replace(/^'+|'+$/g, '')).filter(Boolean)
}

const isContent = (w: string, exclude: ReadonlySet<string>) => {
  const l = w.toLowerCase()
  return l.length >= 3 && !GENERIC.has(l) && !exclude.has(l) && !/^\d+$/.test(l) && !/^\d{1,2}(st|nd|rd|th)$/.test(l)
}

/**
 * Names that repeat across two or more threads: runs of one to four words, starting and ending on
 * a word that is not generic, the client's own name and the insurers' names left out (`exclude`,
 * lower case). The name on the most threads wins; a longer name beats a shorter one on the same
 * threads; a name whose threads all sit under a name already chosen is not offered again. At most five.
 */
export function suggestProjects(threads: readonly SubjectThread[], exclude: Iterable<string> = [], taken: Iterable<string> = []): ProjectSuggestion[] {
  const ex = new Set(Array.from(exclude, x => x.toLowerCase()))
  const already = new Set(Array.from(taken, x => x.toLowerCase().trim()))
  const grams = new Map<string, { ids: Set<string>; shapes: Map<string, number>; len: number }>()
  for (const t of threads) {
    const words = subjectWords(t.subject)
    const seen = new Set<string>()
    for (let i = 0; i < words.length; i++) {
      if (!isContent(words[i], ex)) continue
      for (let n = 1; n <= 4 && i + n <= words.length; n++) {
        const run = words.slice(i, i + n)
        if (!isContent(run[run.length - 1], ex)) continue
        // A one-word name must look like a name: capitalised, at least four letters.
        if (n === 1 && !(/^\p{Lu}/u.test(run[0]) && run[0].length >= 4)) continue
        const key = run.join(' ').toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        const g = grams.get(key) ?? { ids: new Set<string>(), shapes: new Map<string, number>(), len: n }
        g.ids.add(t.threadId)
        const shape = run.join(' ')
        g.shapes.set(shape, (g.shapes.get(shape) ?? 0) + 1)
        grams.set(key, g)
      }
    }
  }
  const ranked = [...grams.entries()].filter(([, g]) => g.ids.size >= 2)
    .sort((a, b) => b[1].ids.size - a[1].ids.size || b[1].len - a[1].len || a[0].localeCompare(b[0]))
  const chosen: { key: string; ids: Set<string>; name: string }[] = []
  for (const [key, g] of ranked) {
    if (already.has(key)) continue
    if (chosen.some(c => [...g.ids].every(id => c.ids.has(id)))) continue
    // One word ("Dover") reads better as the name it most often starts ("Dover Drive") when that
    // name is on at least three quarters of its threads; the threads stay the word's.
    let shapes = g.shapes
    if (g.len === 1) {
      const ext = ranked.filter(([k, x]) => x.len > 1 && k.startsWith(`${key} `) && x.ids.size >= 0.75 * g.ids.size)
        .sort((a, b) => b[1].ids.size - a[1].ids.size || a[1].len - b[1].len)[0]
      if (ext) shapes = ext[1].shapes
    }
    const name = [...shapes.entries()].sort((a, b) => b[1] - a[1] || (/\p{Lu}/u.test(b[0]) ? 1 : 0) - (/\p{Lu}/u.test(a[0]) ? 1 : 0))[0][0]
    if (already.has(name.toLowerCase())) continue
    chosen.push({ key, ids: g.ids, name })
    if (chosen.length >= 5) break
  }
  return chosen.map(c => ({ name: c.name, threadIds: [...c.ids] }))
}

/**
 * The words of a company's name and of insurers' names, for `exclude`, with each name's initials
 * ("China Communications Construction Company Limited" → cccc, ccccl): subjects often use them.
 */
export function nameWords(...names: (string | null | undefined)[]): string[] {
  return names.flatMap(n => {
    const ws = subjectWords(n).map(w => w.toLowerCase())
    const core = ws.filter(w => !/^(pte|ltd|limited|llp|inc|the|and|of)$/.test(w))
    const initials = [ws, core].map(x => x.map(w => w[0]).join('')).filter(i => i.length >= 3)
    return [...ws, ...initials]
  })
}

// ── Parties ──────────────────────────────────────────────────────────────────────────────────────

export type PartyPerson = { name: string | null; email: string }
export type Parties = { client: PartyPerson[]; insurers: { insurer: string; people: PartyPerson[] }[]; others: PartyPerson[] }

const domainOf = (e: string) => e.toLowerCase().split('@')[1] ?? ''
const within = (domain: string, ds: Iterable<string>) => { for (const d of ds) if (domain === d || domain.endsWith(`.${d}`)) return true; return false }
const AUTOMATED = /^(no-?reply|do[-_]?not[-_]?reply|mailer-daemon|postmaster|notifications?)\b/i

/**
 * Who is on a set of threads, by side: the client's people (the client's domains), each insurer's
 * people (an insurer's domains, named by insurer), everyone else outside TRS. TRS and automated
 * senders are left out. When the client has no domain on file, people on client threads who are
 * not an insurer's count as the client's.
 */
export function partiesOf(
  people: readonly (PartyPerson & { side?: 'client' | 'insurer' | null })[],
  clientDomains: readonly string[], insurerDomains: ReadonlyMap<string, string>,
): Parties {
  const byEmail = new Map<string, PartyPerson & { side?: 'client' | 'insurer' | null }>()
  for (const p of people) {
    const email = String(p.email ?? '').trim().toLowerCase()
    if (!email.includes('@') || /@trade-risksol\.com$/i.test(email) || AUTOMATED.test(email)) continue
    const cur = byEmail.get(email)
    if (!cur) byEmail.set(email, { ...p, email, name: p.name?.replace(/["']/g, '').trim() || null })
    else if (!cur.name && p.name) cur.name = p.name.replace(/["']/g, '').trim() || null
  }
  const out: Parties = { client: [], insurers: [], others: [] }
  const clientDs = clientDomains.map(d => d.toLowerCase())
  for (const p of byEmail.values()) {
    const d = domainOf(p.email)
    let insurer: string | null = null
    for (const [dom, name] of insurerDomains) if (d === dom || d.endsWith(`.${dom}`)) { insurer = name || dom; break }
    const person = { name: p.name, email: p.email }
    if (insurer) {
      const g = out.insurers.find(x => x.insurer === insurer)
      if (g) g.people.push(person); else out.insurers.push({ insurer, people: [person] })
    } else if (clientDs.length ? within(d, clientDs) : p.side === 'client') out.client.push(person)
    else out.others.push(person)
  }
  out.insurers.sort((a, b) => a.insurer.localeCompare(b.insurer))
  return out
}
