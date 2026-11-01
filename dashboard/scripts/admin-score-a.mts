/**
 * Scores the deterministic half of Phase A against labelled cases. READ-ONLY: it never writes.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/admin-score-a.mts <cases_checked.json>
 *
 * The cases file is the case worker's trial output (one row per case: client, threads, policy
 * number). It holds client data — keep it outside this public repo.
 *
 * 1. Resolver   for every case thread, the client the resolver names (ignoring how it is filed
 *               today) against the thread's current filing and the case's client name.
 * 2. Case join  (hints only — intake writes a join on the thread or a claim reference alone) each thread of a multi-thread case, read as if it were new mail, against every
 *               case built from the OTHER threads: does it join its own case, a wrong one, none?
 * 3. Stitcher   how much history the parser rebuilds from these threads, and how completely.
 */
import { readFileSync } from 'node:fs'
import { sbTry, inChunks, isInternal, isAutomated, bareEmail } from '@/lib/crm/db'
import { companyCore } from '@/lib/crm/resolve'
import { readHistory } from '@/lib/admin/a/history'
import { referenceTokens, refKey, subjectCore, isClaimLike } from '@/lib/admin/a/signals'
import { bestCase, type CaseCandidate } from '@/lib/admin/a/match'
import { threadEvidence, resolveEvidence } from '@/lib/admin/a/resolver'

type Row = Record<string, any>
const file = process.argv[2]
if (!file) { console.error('usage: admin-score-a.mts <cases_checked.json>'); process.exit(1) }
const cases: { id: number; client: string; caseType: string; title: string; threads: string[]; policy: string | null }[] =
  (JSON.parse(readFileSync(file, 'utf8')) as Row[]).map((r, id) => ({ id, client: r.clean?.client ?? '', caseType: r.clean?.case_type ?? 'other', title: r.clean?.title ?? '', threads: r.clean?.threads ?? [], policy: r.clean?.policy_number ?? null }))
const threadIds = Array.from(new Set(cases.flatMap(c => c.threads)))
console.log(`cases ${cases.length}, threads ${threadIds.length}`)

const threads = await inChunks(threadIds, 40, ch => sbTry<Row[]>(`email_threads?id=in.(${ch.join(',')})&select=id,subject,company_id,companies(company_name)`, []))
const msgs = await inChunks(threadIds, 20, ch => sbTry<Row[]>(`email_messages?thread_id=in.(${ch.join(',')})&deleted_at=is.null&select=id,thread_id,from_address,subject,body_text,sent_at&order=sent_at.asc`, []))
const parts = await inChunks(threadIds, 20, ch => sbTry<Row[]>(`email_participants?thread_id=in.(${ch.join(',')})&deleted_at=is.null&select=thread_id,email`, []))
const tById = new Map(threads.map(t => [t.id, t]))
const msgsBy = new Map<string, Row[]>()
for (const m of msgs) msgsBy.set(m.thread_id, [...(msgsBy.get(m.thread_id) ?? []), m])
const peopleBy = new Map<string, Set<string>>()
for (const p of parts) { const e = bareEmail(p.email); if (e && !isInternal(e) && !isAutomated(e)) peopleBy.set(p.thread_id, (peopleBy.get(p.thread_id) ?? new Set()).add(e)) }

const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(1)}%` : 'n/a'
const sameName = (a: string, b: string) => { const x = companyCore(a), y = companyCore(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)) }

// ── 1. Resolver ─────────────────────────────────────────────────────────────────────────────
const clientOf = new Map<string, string>()
for (const c of cases) for (const t of c.threads) if (!clientOf.has(t)) clientOf.set(t, c.client)
const steps: Record<string, number> = {}
const stepRight: Record<string, number> = {}
let resolved = 0, agreeFiling = 0, filedCompared = 0, agreeName = 0, unresolved = 0, insurerThreads = 0
for (const id of threadIds) {
  const t = tById.get(id)
  if (!t) continue
  const ev = await threadEvidence(id)
  if (!ev) continue
  const r = await resolveEvidence(ev)
  if (!r) { unresolved++; continue }
  resolved++
  steps[r.step] = (steps[r.step] ?? 0) + 1
  const [c] = await sbTry<Row[]>(`companies?id=eq.${r.companyId}&select=company_name`, [])
  if (t.company_id) { filedCompared++; if (t.company_id === r.companyId) agreeFiling++ }
  if (c && sameName(c.company_name, clientOf.get(id) ?? '')) { agreeName++; stepRight[r.step] = (stepRight[r.step] ?? 0) + 1 } else if (process.env.SCORE_DEBUG) console.log(`   MISS ${r.step} ${r.evidence} | resolved "${c?.company_name}" vs case client "${clientOf.get(id)}"`)
}
const insurers = new Set((await sbTry<Row[]>('companies?kind=eq.insurer&select=id', [])).map(r => r.id))
for (const id of threadIds) if (insurers.has(tById.get(id)?.company_id)) insurerThreads++
console.log('\n1. Resolver (threads, ignoring current filing)')
console.log(`   resolved ${resolved}/${threadIds.length} (${pct(resolved, threadIds.length)}), left for a person ${unresolved}`)
console.log(`   by step ${JSON.stringify(steps)}`)
console.log(`   agrees with current filing ${agreeFiling}/${filedCompared} (${pct(agreeFiling, filedCompared)}) — ${insurerThreads} threads are filed under an insurer today, so disagreement there is expected`)
console.log(`   names the case's client ${agreeName}/${resolved} (${pct(agreeName, resolved)})`)
console.log(`   right by step ${Object.entries(steps).map(([k, n]) => `${k} ${stepRight[k] ?? 0}/${n}`).join(', ')}`)

// ── 2. Case join ────────────────────────────────────────────────────────────────────────────
const candidateFor = (c: typeof cases[number], exclude: string | null): CaseCandidate => {
  const ts = c.threads.filter(t => t !== exclude)
  const last = ts.flatMap(t => msgsBy.get(t) ?? []).map(m => m.sent_at).sort().pop() ?? null
  return {
    workItemId: String(c.id), caseType: c.caseType, companyId: null, title: c.title,
    claimRefs: [], policyRefs: String(c.policy ?? '').split(/[\s,;()]+/).map(refKey).filter(k => k.length >= 6 && (k.match(/\d/g) ?? []).length >= 3),
    people: Array.from(new Set(ts.flatMap(t => Array.from(peopleBy.get(t) ?? [])))),
    subjectWords: Array.from(new Set([c.title, ...ts.map(t => tById.get(t)?.subject)].flatMap(s => subjectCore(s)))),
    nameWords: subjectCore(c.client),
    lastActivity: last,
  }
}
let trials = 0, right = 0, wrong = 0, none = 0, falseJoins = 0, singles = 0
const byHow: Record<string, number> = {}
const allRefs = new Set(cases.flatMap(c => candidateFor(c, null).policyRefs))
for (const c of cases) {
  for (const t of c.threads) {
    const ms = msgsBy.get(t) ?? []
    const m = ms[ms.length - 1]
    if (!m) continue
    const text = `${m.subject ?? ''}\n${m.body_text ?? ''}`
    const sig = { refs: referenceTokens(text, 200).filter(r => allRefs.has(r)), people: Array.from(peopleBy.get(t) ?? []), subjectWords: subjectCore(m.subject ?? tById.get(t)?.subject), sentAt: m.sent_at, claimLike: isClaimLike(m.subject, text) }
    const others = cases.filter(o => o.id !== c.id).map(o => candidateFor(o, null))
    if (c.threads.length >= 2) {
      trials++
      const pick = bestCase(sig, [candidateFor(c, t), ...others])
      if (!pick) none++
      else if (pick.workItemId === String(c.id)) { right++; byHow[pick.joinedBy] = (byHow[pick.joinedBy] ?? 0) + 1 }
      else { wrong++; if (process.env.SCORE_DEBUG) console.log(`   WRONG ${pick.joinedBy} ${pick.evidence} | "${c.title}" → "${cases[+pick.workItemId].title}"`) }
    } else {
      singles++
      // A thread that is its own case should join no other case.
      const fj = bestCase(sig, others)
      if (fj) { falseJoins++; if (process.env.SCORE_DEBUG) console.log(`   FALSE ${fj.joinedBy} ${fj.evidence} | "${c.title}" → "${cases[+fj.workItemId].title}"`) }
    }
  }
}
console.log('\n2. Case-join hints (rules only; intake WRITES a join only for the same thread or an insurer claim reference — these are hints the case reader may take)')
console.log(`   multi-thread cases: ${trials} threads — own case ${right} (${pct(right, trials)}), wrong case ${wrong} (${pct(wrong, trials)}), left to the reader ${none} (${pct(none, trials)})`)
console.log(`   joined by ${JSON.stringify(byHow)}`)
console.log(`   single-thread cases: ${singles} threads — wrongly joined to another case ${falseJoins} (${pct(falseJoins, singles)})`)

// ── 3. Stitcher ─────────────────────────────────────────────────────────────────────────────
let withHistory = 0, rebuilt = 0, withFrom = 0, withDate = 0, forwards = 0, firstHeldWithHistory = 0
for (const id of threadIds) {
  const ms = msgsBy.get(id) ?? []
  ms.forEach((m, i) => {
    const h = readHistory(m.body_text ?? '', m.subject)
    if (!h.messages.length) return
    withHistory++
    if (i === 0) firstHeldWithHistory++
    for (const x of h.messages) { rebuilt++; if (x.fromAddress) withFrom++; if (x.sentAt) withDate++; if (x.origin === 'forward') forwards++ }
  })
}
console.log('\n3. Stitcher')
console.log(`   messages ${msgs.length}; with history ${withHistory} (${pct(withHistory, msgs.length)}); first-held message carries history in ${firstHeldWithHistory}/${threadIds.length} threads`)
console.log(`   history messages read ${rebuilt}: sender address ${pct(withFrom, rebuilt)}, date parsed ${pct(withDate, rebuilt)}, forwarded ${forwards}`)
