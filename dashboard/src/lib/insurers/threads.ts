/**
 * Which insurers an email thread involves, and which of the client's policies it is about.
 * Pure rules, tested; the sweep in thread-sweep.ts does the reading and writing.
 *
 *   insurer  1. an inbound message from the insurer's email domain
 *            2. TRS's subject convention "(TRS) GE - Weima (…)" / "TRS (QBE): Beijing Gas"
 *   policy   1. the policy number appears in the subject
 *            2. the client has one policy with that insurer
 *            3. one of the client's policies with that insurer is named in the subject
 *            4. else the agent estimates from the thread, or a broker picks
 */
export type InsurerRef = { id: string; company_name: string; domain: string | null; domains: string[] | null }
export type PolicyRef = { id: string; company_id: string | null; insurer: string | null; policy_number: string | null; cover_note_no?: string | null; class_of_insurance: string | null; label: string | null }

const STOP = /\b(insurance|insurances|assurance|general|singapore|s'pore|pte|ltd|limited|berhad|bhd|company|co|corporation|the|sg|malaysia|asia|pacific|international)\b/g
export const insurerKey = (s: string | null | undefined): string =>
  (s ?? '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(STOP, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Short names TRS uses in subjects, keyed by a word in the insurer's own name. */
const ALIASES: [string, string[]][] = [
  ['great eastern', ['ge', 'gegi', 'great eastern']], ['taiping', ['ctpis', 'china taiping', 'taiping', 'china taping']],
  ['taping', ['ctpis', 'china taiping', 'taiping']], ['hl', ['hla', 'hl', 'hlas', 'hl assurance']], ['tokio', ['tmis', 'tokio marine', 'tokio']],
  ['berkley', ['berkley', 'bhsi']], ['bhsi', ['bhsi', 'berkshire']], ['income', ['income', 'ntuc income']], ['allianz', ['allianz', 'allianz trade', 'agcs']],
]

export const emailDomain = (addr: string | null | undefined): string => (addr ?? '').toLowerCase().match(/@([a-z0-9.-]+)/)?.[1] ?? ''

export function insurerByDomain(domain: string, insurers: InsurerRef[]): InsurerRef | null {
  if (!domain) return null
  for (const c of insurers) for (const d of [c.domain, ...(c.domains ?? [])]) {
    const k = (d ?? '').toLowerCase().replace(/^www\./, '').trim()
    if (k && (domain === k || domain.endsWith('.' + k))) return c
  }
  return null
}

/** The insurer a TRS subject names: "(TRS) GE - Weima", "TRS (QBE): Beijing Gas", "(TRS-MP) Ergo - …". */
export function insurerFromSubject(subject: string | null | undefined, insurers: InsurerRef[]): InsurerRef | null {
  const s = subject ?? ''
  const m = s.match(/\(\s*TRS[^)]*\)\s*([^-–:|]+?)\s*[-–:|]/i) ?? s.match(/\bTRS\s*\(\s*([^)]+?)\s*\)/i)
  if (!m) return null
  const tok = m[1].toLowerCase().trim()
  for (const c of insurers) {
    const k = insurerKey(c.company_name)
    if (k && (k === insurerKey(tok) || k.split(' ')[0] === tok)) return c
    for (const [word, al] of ALIASES) if ((` ${k} `).includes(` ${word} `) && al.includes(tok)) return c
  }
  return null
}

/** Names that are one insurer: the short form TRS uses and the legal name. */
const SAME: string[][] = [['bhsi', 'berkshire'], ['ge', 'gegi', 'great'], ['ctpis', 'china', 'taiping', 'taping'], ['tmis', 'tokio'], ['hla', 'hl', 'hlas'], ['ntuc', 'income']]
const head = (k: string) => { const w = k.split(' ')[0]; const g = SAME.find(x => x.includes(w)); return g ? g[0] : w }

export const sameInsurer = (policyInsurer: string | null | undefined, insurerName: string): boolean => {
  const a = insurerKey(policyInsurer), b = insurerKey(insurerName)
  if (!a || !b) return false
  return a === b || head(a) === head(b)
}

export type PolicyGuess = { policy_id: string | null; how: string; candidates: PolicyRef[] }

export function guessPolicy(subject: string | null | undefined, clientId: string | null, insurerName: string, policies: PolicyRef[]): PolicyGuess {
  if (!clientId) return { policy_id: null, how: 'thread has no client', candidates: [] }
  const cands = policies.filter(p => p.company_id === clientId && sameInsurer(p.insurer, insurerName))
  const subj = (subject ?? '').toLowerCase()
  const squash = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '')
  const byNo = cands.filter(p => [p.policy_number, p.cover_note_no].some(n => n && squash(n).length >= 5 && squash(subj).includes(squash(n))))
  if (byNo.length === 1) return { policy_id: byNo[0].id, how: 'policy no. in subject', candidates: cands }
  if (cands.length === 1) return { policy_id: cands[0].id, how: 'only policy with this insurer', candidates: cands }
  const byLine = cands.filter(p => (p.label ?? p.class_of_insurance ?? '').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3 && !['insurance', 'policy'].includes(w)).some(w => subj.includes(w)))
  if (byLine.length === 1) return { policy_id: byLine[0].id, how: 'cover named in subject', candidates: cands }
  return { policy_id: null, how: cands.length ? 'several policies' : 'no policy with this insurer', candidates: cands }
}
