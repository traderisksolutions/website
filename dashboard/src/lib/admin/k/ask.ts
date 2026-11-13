/**
 * Ask about this client: a question answered from one business's repository only (13 Nov 2026).
 *
 * The context is the group's records, each line labelled: facts [F], policies [P], debit notes
 * [D], claims [C], requests [R], quotations and placements [Q], recent ledger entries [L], and
 * totals code worked out [T]. Nothing from another business is loaded, so nothing from another
 * business can be said. The model answers in words and cites the labels it used; it never adds
 * figures up. Code then keeps only labels that exist, and refuses an answer that cites nothing or
 * states a figure the context does not contain (the Nexus rule: every figure has a source).
 *
 * buildAskContext and checkAnswer are pure; tested in src/__tests__/client-ask.test.ts.
 */
import { entryOf } from './catalogue'

type Row = Record<string, any>
export type AskSource = { id: string; label: string; href: string | null }
export type AskContext = { text: string; sources: Map<string, AskSource> }
export type AskInput = {
  business: string
  facts: Row[]; policies: Row[]; debitNotes: Row[]; claims: Row[]; requests: Row[]; quotations: Row[]; ledger: Row[]
  today: string
}

const money = (n: unknown) => { const x = Number(n); return Number.isFinite(x) ? `S$${x.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' }
const clip = (s: unknown, n: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }

/** The labelled context for one business. Pure. */
export function buildAskContext(i: AskInput): AskContext {
  const lines: string[] = []
  const sources = new Map<string, AskSource>()
  const add = (id: string, line: string, label: string, href: string | null) => { lines.push(`[${id}] ${line}`); sources.set(id, { id, label, href }) }
  // Totals by year, worked out here so the model never adds.
  const years = new Map<string, { premium: number; commission: number; notes: number; claims: number; paid: number }>()
  const y = (d: unknown) => String(d ?? '').slice(0, 4) || 'undated'
  for (const n of i.debitNotes) { const k = y(n.issue_date); const t = years.get(k) ?? { premium: 0, commission: 0, notes: 0, claims: 0, paid: 0 }; t.premium += Number(n.gross_amount) || 0; t.commission += Number(n.commission) || 0; t.notes++; years.set(k, t) }
  for (const c of i.claims) { const k = y(c.loss_date ?? c.notified_at ?? c.created_at); const t = years.get(k) ?? { premium: 0, commission: 0, notes: 0, claims: 0, paid: 0 }; t.claims++; t.paid += Number(c.amount_settled) || 0; years.set(k, t) }
  lines.push(`BUSINESS: ${i.business}. TODAY: ${i.today}.`, 'TOTALS (worked out from the records below):')
  for (const [k, t] of [...years].sort()) add(`T${k}`, `${k}: premium billed ${money(t.premium)} on ${t.notes} debit notes; commission ${money(t.commission)}; ${t.claims} claims, ${money(t.paid)} paid`, `Totals ${k}`, null)
  lines.push('FACTS (each with the words it was read from):')
  i.facts.slice(0, 250).forEach((f, k) => add(`F${k + 1}`, `${entryOf(f.key)?.entry.label ?? f.key} (${f.key}) = ${clip(f.value, 160)}${f.quote ? ` — "${clip(f.quote, 120)}"` : ''} [${f.source_kind}${f.source_date ? `, ${f.source_date}` : ''}]`, `${entryOf(f.key)?.entry.label ?? f.key}: ${clip(f.value, 60)}`, null))
  lines.push('POLICIES:')
  i.policies.slice(0, 80).forEach((p, k) => add(`P${k + 1}`, `${p.class_of_insurance ?? p.product_line ?? 'Policy'} ${p.policy_number ?? ''} with ${p.insurer ?? '?'}, ${p.start_date ?? '?'} to ${p.end_date ?? '?'}, ${p.lifecycle ?? ''}`, `Policy ${p.policy_number ?? p.class_of_insurance ?? ''}`, `/policies/${p.id}`))
  lines.push('DEBIT NOTES:')
  i.debitNotes.slice(0, 120).forEach((n, k) => add(`D${k + 1}`, `${n.debit_note_no} ${n.issue_date ?? ''} ${n.insurer ?? ''} ${n.event_type ?? ''}: gross ${money(n.gross_amount)}${n.commission != null ? `, commission ${money(n.commission)}` : ''}`, `Debit note ${n.debit_note_no}`, `/debit-notes?open=${n.id}`))
  lines.push('CLAIMS:')
  i.claims.slice(0, 150).forEach((c, k) => add(`C${k + 1}`, `${c.class ?? ''} ${c.insurer_name ?? ''} claimant ${c.claimant ?? '?'}, loss ${c.loss_date ?? '?'}, stage ${c.stage ?? '?'}${c.amount_claimed != null ? `, claimed ${money(c.amount_claimed)}` : ''}${c.amount_settled != null ? `, paid ${money(c.amount_settled)}` : ''}`, `Claim ${c.claimant ?? ''}`, `/claims?claim=${c.id}`))
  lines.push('REQUESTS (follow-ups):')
  i.requests.slice(0, 80).forEach((r, k) => add(`R${k + 1}`, `${r.status} · ${r.owner_party} owes · ${clip(r.what, 120)} · since ${String(r.since_at ?? '').slice(0, 10)}${r.due_at ? ` · due ${String(r.due_at).slice(0, 10)}` : ''}`, clip(r.what, 60), r.thread_id ? `/engagement?lead=${r.thread_id}` : null))
  lines.push('QUOTATIONS AND PLACEMENTS:')
  i.quotations.slice(0, 40).forEach((q, k) => add(`Q${k + 1}`, `${q.title} · ${String(q.occurred_at).slice(0, 10)} · ${clip(q.summary, 160)}`, clip(q.title, 60), q.links?.[0]?.url ?? null))
  lines.push('RECENT RECORD ENTRIES (newest first):')
  i.ledger.slice(0, 120).forEach((e, k) => add(`L${k + 1}`, `${String(e.occurred_at).slice(0, 10)} ${e.kind} ${e.party ?? ''}: ${clip(e.title, 100)} — ${clip(e.summary, 260)}`, clip(e.title, 60), e.thread_id ? `/engagement?lead=${e.thread_id}` : e.links?.[0]?.url ?? null))
  return { text: lines.join('\n'), sources }
}

/** Figures an answer states: amounts, percentages and numbers of three or more digits. */
const figuresOf = (s: string) => (s.match(/\d[\d,]*(?:\.\d+)?%?/g) ?? []).map(x => x.replace(/,/g, '')).filter(x => /%$/.test(x) || x.replace(/\.\d+$/, '').length >= 3)

export type Answer = { answer: string; sources: AskSource[]; refused: string | null }

/**
 * The model's answer, checked. Pure. Keeps cited labels that exist; refuses an answer that cites
 * nothing or states a figure the context does not hold, so nothing unsupported reaches a person.
 */
export function checkAnswer(raw: unknown, ctx: AskContext): Answer {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Row
  const answer = typeof o.answer === 'string' ? o.answer.trim().slice(0, 2000) : ''
  const cited = [...new Set([...(Array.isArray(o.sources) ? o.sources : []), ...(answer.match(/\[([A-Z]\w{0,8})\]/g) ?? []).map(x => x.slice(1, -1))].map(String))]
  const sources = cited.map(id => ctx.sources.get(id)).filter((s): s is AskSource => !!s)
  const clean = answer.replace(/\s*\[[A-Z]\w{0,8}\]/g, '').trim()
  if (!clean) return { answer: '', sources: [], refused: 'No answer came back. Ask again.' }
  if (o.on_file === false) return { answer: clean, sources: [], refused: null }
  if (!sources.length) return { answer: '', sources: [], refused: 'The answer cited nothing on file, so it is not shown.' }
  const haystack = ctx.text.replace(/,/g, '')
  const missing = figuresOf(clean).filter(f => !haystack.includes(f))
  if (missing.length) return { answer: '', sources, refused: `The answer stated ${missing.slice(0, 3).join(', ')}, which is not in the records, so it is not shown.` }
  return { answer: clean, sources, refused: null }
}

export const ASK_SYSTEM = `You answer a TRS broker's question about ONE client business, using ONLY the CONTEXT: its facts, policies, debit notes, claims, requests, quotations, record entries and the totals worked out for you.
Rules:
- Every statement cites the labels it rests on, in brackets, e.g. "Premium billed in 2026 was S$263,250.00 [T2026]."
- Never add, subtract or estimate figures. Use a total from TOTALS, or list the items with their own figures.
- Copy figures exactly as the context writes them.
- When the context does not answer the question, say what is not on file, set on_file to false, and cite nothing.
- Plain, short sentences. No advice beyond what the records show.
Answer JSON only: {"answer": "...", "sources": ["T2026", "D3"], "on_file": true}`
