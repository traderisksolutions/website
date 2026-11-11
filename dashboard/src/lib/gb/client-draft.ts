/**
 * The email to the client after the pricing options are read: the premium summary per option,
 * how the figures were derived, and what TRS suggests, in the voice of TRS's own past emails.
 *
 * Every figure and every bullet is written by code from the pricing pack. A model pass then
 * rewrites only the prose paragraphs in TRS's voice, with three of TRS's past client emails as
 * the sample; the result is kept only when it carries exactly the figures the code wrote. The
 * client report PDF (benefits side by side, with the options page) is attached. Nothing sends:
 * the draft waits in the thread's bar.
 */
import { sb, sbTry, enc, isInternal } from '@/lib/crm/db'
import { callGemini } from '../ai-call'
import { GEMINI_FLASH } from '../gemini-models'
import { ownWords } from '@/lib/admin/b/relay/intent'
import { storeUpload } from '@/lib/storage/drive-upload'
import { loadScenarios, type ScenarioPack } from './scenario-run'
import { analysisAsScenarios, loadAnalysis } from './analysis'
import { headline, type ScenarioInsurer } from './scenarios'
import { shortInsurer } from './insurer-names'
import { buildReportModel, longDate, type ReportOptions, type ReportQuotation } from './report-model'
import { renderReportPdf } from './report-pdf'
import { COVER_NAMES_KEY, type CoverNames } from './cover-names'

type Row = Record<string, any>

export type OptionRow = { insurer: string; total: number; net: number; unpriced: number; current: boolean }
export type OptionFacts = { name: string; summary: string; changes: string[]; rows: OptionRow[]; headline: OptionRow | null }
export type ClientFacts = {
  company: string
  employees: number
  dependants: number
  effectiveDate: string | null
  basis: 'new_business' | 'renewal'
  currentInsurer: string | null
  /** The current insurer's total on the card going out of force (the expiring price), scenario A. */
  expiringCardTotal: number | null
  options: OptionFacts[]
  /** Members the cheapest alternative insurer leaves unpriced, with the engine's reason. */
  unpriced: { insurer: string; members: string[]; note: string }
  /** Members aged 70 or over at the effective date. */
  older: { name: string; age: number }[]
  budget: number | null
  budgetText: string | null
  wishes: string[]
  currentPlan: string
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-SG')}`
/** "Dental off (optional in the brief); Major medical off" → "dropping dental and major medical"; "Dental at the top tier" → "dental at the top tier". */
export function phrase(changes: string[]): string {
  const items = changes.map(c => c.replace(/\s*\([^)]*\)/g, '').trim()).filter(Boolean)
  if (!items.length) return 'this option'
  const offs = items.filter(c => / off$/.test(c))
  if (offs.length === items.length) return `dropping ${offs.map(c => c.replace(/ off$/, '').toLowerCase()).join(' and ')}`
  return items.map(c => c.charAt(0).toLowerCase() + c.slice(1)).join(' and ')
}
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
/** The engine's reason for an unpriced line, in the client's words. */
export function gapReason(note: string): string {
  if (/renewal[- ]only/i.test(note)) return 'the rate for this age applies to renewals only, not to a new entrant'
  if (/under 16|not eligible/i.test(note)) return 'below the plan\u2019s minimum age'
  if (/no rate|above|over/i.test(note)) return 'above the package age limit'
  return note.toLowerCase()
}
/** Members as a client reads them: the given name before any comma or bracket. */
const shortName = (n: string) => n.split(/[,(]/)[0].trim()
const pct = (a: number, b: number) => `${Math.round(((b - a) / b) * 100)}%`

export function reportOptions(pack: ScenarioPack): ReportOptions {
  const insurers = new Map<string, { current: boolean; order: number }>()
  pack.scenarios[0]?.insurers.filter(i => i.inForce && !i.excluded).forEach((i, n) => insurers.set(i.insurer, { current: i.current, order: n }))
  return {
    names: pack.scenarios.map(s => s.name),
    summaries: pack.scenarios.map(s => s.summary),
    rows: [...insurers].map(([key, v]) => {
      const per = pack.scenarios.map(s => s.insurers.find(i => i.insurer === key && i.inForce))
      return { insurer: shortInsurer(per[0]?.insurer_name ?? key), current: v.current, totals: per.map(i => i?.total ?? null), unpriced: per.map(i => i?.missing ?? 0) }
    }),
    notes: ['Totals include 9% GST.', ...pack.notes],
  }
}

const ageAt = (dob: string | null | undefined, age: number | null | undefined, on: string): number | null => {
  if (dob && /^\d{4}-\d{2}-\d{2}/.test(dob)) { const y = +dob.slice(0, 4), md = dob.slice(5, 10); return +on.slice(0, 4) - y - (on.slice(5, 10) < md ? 1 : 0) }
  return typeof age === 'number' ? age : null
}

/** Pure: the facts the email is written from. */
export function clientFacts(q: { company_name: string | null; census: Row[] | null }, pack: ScenarioPack): ClientFacts {
  const rowOf = (i: ScenarioInsurer): OptionRow => ({ insurer: shortInsurer(i.insurer_name), total: i.total, net: i.net, unpriced: i.missing, current: i.current })
  const options = pack.scenarios.map(s => {
    const live = s.insurers.filter(i => i.inForce && !i.excluded).sort((a, b) => a.total - b.total)
    const h = headline(s.insurers)
    return { name: s.name, summary: s.summary, changes: s.changes, rows: live.map(rowOf), headline: h ? rowOf(h) : null }
  })
  const a = pack.scenarios[0]
  const expiring = a?.insurers.find(i => i.current && !i.inForce) ?? null
  const on = pack.effectiveDate
  const older = (q.census ?? []).map(m => ({ name: String(m.name ?? ''), age: ageAt(m.dob, m.age, on) })).filter((m): m is { name: string; age: number } => m.age != null && m.age >= 70)
  const cheapestAlt = a?.insurers.filter(i => i.inForce && !i.excluded && !i.current).sort((x, y) => x.total - y.total)[0] ?? null
  const gaps = cheapestAlt?.gaps ?? []
  const unpriced = { insurer: cheapestAlt ? shortInsurer(cheapestAlt.insurer_name) : '', members: Array.from(new Set(gaps.map(g => g.member))), note: gaps[0]?.note ? gapReason(gaps[0].note) : '' }
  const noDeps = pack.dependants === 0
  return {
    company: q.company_name ?? pack.brief.company ?? 'your company',
    employees: pack.employees, dependants: pack.dependants, effectiveDate: pack.effectiveDate, basis: pack.basis,
    currentInsurer: pack.brief.currentInsurer ? shortInsurer(pack.brief.currentInsurer) : null,
    expiringCardTotal: expiring?.total ?? null,
    options: noDeps ? options.map(o => ({ ...o, summary: o.summary.replace(/ · dependants medical$/, '') })) : options,
    unpriced, older,
    budget: pack.brief.budget, budgetText: pack.brief.budgetText,
    wishes: pack.brief.wishes.map(w => w.detail ?? `${w.cover} ${w.change}`),
    currentPlan: (a?.summary ?? '').replace(/ · dependants medical$/, noDeps ? '' : ' · dependants medical'),
  }
}

/** Pure: what TRS suggests, as bullets, from the facts alone. */
export function suggestionLines(f: ClientFacts): string[] {
  const out: string[] = []
  const a = f.options[0]
  if (!a) return out
  const cur = a.rows.find(r => r.current) ?? null
  const complete = a.rows.filter(r => r.unpriced === 0)
  const bestAlt = complete.find(r => !r.current) ?? null
  const cheapestAny = a.rows[0] ?? null
  if (f.budget != null) {
    const within = a.rows.filter(r => r.total <= f.budget!)
    out.push(within.length ? `Within the budget of ${money(f.budget)}: ${within.map(r => `${r.insurer} at ${money(r.total)}`).join(', ')}.` : `No insurer meets the budget of ${money(f.budget)} on the like-for-like basis; the lower-cost option is the nearest.`)
  }
  if (cur && bestAlt && bestAlt.total < cur.total * 0.9) {
    out.push(`${bestAlt.insurer} covers every member at ${money(bestAlt.total)}, ${pct(bestAlt.total, cur.total)} below the renewal at ${cur.insurer} (${money(cur.total)}). We recommend taking firm terms from ${bestAlt.insurer}.`)
  } else if (cur && cur.unpriced === 0 && cheapestAny && !cheapestAny.current && cheapestAny.unpriced > 0) {
    const saving = cur.total - cheapestAny.total
    const names = f.unpriced.members.length ? f.unpriced.members : f.older.map(o => o.name)
    const n = names.length
    const who = n ? `${n} member${n === 1 ? '' : 's'} (${names.map(shortName).join(', ')})${f.unpriced.note ? `: ${f.unpriced.note}` : ''}` : `${cheapestAny.unpriced} member line${cheapestAny.unpriced === 1 ? '' : 's'}`
    out.push(`Renewing with ${cur.insurer} at ${money(cur.total)} keeps every member covered${f.expiringCardTotal ? `; the increase from the expiring rate card is ${pct(f.expiringCardTotal, cur.total)}` : ''}.`)
    out.push(`${cheapestAny.insurer} prices the rest of the team at ${money(cheapestAny.total)}, about ${money(saving)} less, but its package rates do not take ${who}; a change of insurer is underwritten as new business. We suggest asking ${cheapestAny.insurer} to confirm terms for ${n === 1 ? 'that member' : 'those members'} before deciding, and we can do so on your go-ahead.`)
  } else if (cur) {
    out.push(`Renewing with ${cur.insurer} at ${money(cur.total)} is the straightforward option${f.expiringCardTotal ? `, an increase of ${pct(f.expiringCardTotal, cur.total)} on the expiring rate card` : ''}.`)
  } else if (cheapestAny) {
    out.push(`${cheapestAny.insurer} is the lowest at ${money(cheapestAny.total)}${cheapestAny.unpriced ? `, with ${cheapestAny.unpriced} member line${cheapestAny.unpriced === 1 ? '' : 's'} to be confirmed by the insurer` : ''}.`)
  }
  const enh = f.options[2], lower = f.options[1]
  const sameInsurer = (o: OptionFacts | undefined, ins: string | undefined) => o?.rows.find(r => r.insurer === ins) ?? null
  const ref = cur ?? a.headline
  if (enh && ref) {
    const e = sameInsurer(enh, ref.insurer)
    if (e && e.total > ref.total) out.push(`${cap(phrase(enh.changes))} adds ${money(e.total - ref.total)} a year at ${ref.insurer} (${money(e.total)} in all).`)
  }
  if (lower && ref) {
    const l = sameInsurer(lower, ref.insurer)
    if (l && l.total < ref.total) out.push(`${cap(phrase(lower.changes))} saves ${money(ref.total - l.total)} a year at ${ref.insurer} (${money(l.total)} in all).`)
  }
  return out
}

/** Pure: the email as code writes it. The tone pass may rewrite the prose, never the figures. */
export function codeDraft(f: ClientFacts, firstName: string | null): { subject: string; body: string } {
  const start = f.effectiveDate ? longDate(f.effectiveDate) : null
  const subject = `(TRS) ${f.company} - Employee Benefits ${f.basis === 'renewal' ? 'Renewal' : 'Proposal'}${start ? ` ${start.slice(-4)}` : ''} - EB pricing estimate`
  const anyStar = f.options.some(o => o.rows.some(r => r.unpriced > 0 && !r.current))
  const star = anyStar ? ' *' : ''
  const lines: string[] = []
  lines.push(`Dear ${firstName ?? 'Sir/Madam'},`, '')
  lines.push(`Thank you for the member listing. We have priced the ${start ? `${start} ` : ''}${f.basis === 'renewal' ? 'renewal' : 'programme'} for ${f.employees} employee${f.employees === 1 ? '' : 's'}${f.dependants ? ` and ${f.dependants} dependant${f.dependants === 1 ? '' : 's'}` : ''} across the insurers with current rate cards, on the basis of ${f.basis === 'renewal' ? 'maintaining the current coverage' : 'the coverage requested'} (${f.currentPlan}).${f.wishes.length ? ` ${f.wishes[0].charAt(0).toUpperCase()}${f.wishes[0].slice(1)} is shown as a separate option.` : ''}`, '')
  lines.push('Plan Premium Summary (annual, incl. 9% GST):', '')
  f.options.forEach((o, i) => {
    lines.push(`${i + 1}. ${o.name} - ${o.summary}`)
    for (const r of o.rows) lines.push(`   - ${r.insurer}${r.current ? ' (current insurer, renewal)' : ''}: ${money(r.total)}${r.unpriced > 0 && !r.current ? star : ''}`)
    lines.push('')
  })
  if (anyStar) {
    const names = f.unpriced.members.length ? f.unpriced.members : f.older.map(o => o.name)
    const who = names.length ? `${names.length} member${names.length === 1 ? '' : 's'} (${names.map(shortName).join(', ')})` : 'some member lines'
    lines.push(`* ${who} not priced on this insurer's package rates${f.unpriced.note ? ` (${f.unpriced.note})` : ''}; a change of insurer is underwritten as new business and the insurer would confirm terms for ${names.length === 1 ? 'that member' : 'them'} separately.`, '')
  }
  lines.push('How these figures are derived:')
  lines.push(`- Each member is priced on the insurer's current rate card at their age on ${start ?? 'the policy start date'}.`)
  if (f.currentInsurer && f.basis === 'renewal') lines.push(`- ${f.currentInsurer} is priced as a renewal on its renewal rate card; every other insurer as new business, which is how a change of insurer is underwritten.`)
  lines.push('- Plans are matched to the current benefits at each insurer; where an insurer has no equal plan, the nearest is used and noted in the attached comparison.')
  lines.push('- Figures are package rates before any underwriting loading or discount, and before the insurer’s firm quotation.', '')
  const sug = suggestionLines(f)
  if (sug.length) { lines.push('Our suggestion:'); for (const l of sug) lines.push(`- ${l}`); lines.push('') }
  lines.push('The attached comparison sets out the benefits of each plan side by side. Do let us know which option you would like us to take firm terms on, and we will revert with the insurer’s quotation and the enrolment steps.', '')
  lines.push('Warmest Regards,', '', '{owner_name}', 'Trade Risk Solutions')
  return { subject, body: lines.join('\n') }
}

/** Pure: every money figure in a text, as written. */
export const figuresOf = (text: string): Set<string> => new Set(Array.from(text.matchAll(/\$\s?[\d,]+(?:\.\d+)?/g)).map(m => m[0].replace(/\s/g, '')))

/** Pure: a rewrite is accepted only when it carries exactly the figures the code draft carries. */
export function keepsFigures(rewrite: string, source: string): boolean {
  const a = figuresOf(rewrite), b = figuresOf(source)
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  const ratio = rewrite.length / Math.max(1, source.length)
  return ratio > 0.6 && ratio < 1.6 && rewrite.includes('{owner_name}')
}

const TONE_SYSTEM = `You rewrite an email from a Singapore insurance broker (Trade Risk Solutions) to a client, in the voice of the broker's own past emails, which follow as samples.

Voice: courteous and plain. Short paragraphs. "Dear <first name>," then thanks for what the client sent, then the figures, then a clear next step. Sign-off "Warmest Regards," then the placeholder {owner_name} on its own line, then "Trade Risk Solutions". No marketing adjectives, no exclamation marks except where the samples use "Thank you!", no apologies, nothing the draft does not say.

Rules:
- Rewrite only prose paragraphs. Keep every line that starts with a digit, a dash, an asterisk, "Plan Premium Summary", "How these figures", "Our suggestion", "Warmest Regards", "{owner_name}" or "Trade Risk Solutions" exactly as given, in the same order.
- Never add, remove, round or reword a figure, an insurer name, a date or a member count.
- Return the whole email as plain text. No subject line, no markdown.`

async function exemplars(): Promise<string[]> {
  const rows = await sbTry<Row[]>(`email_messages?direction=eq.outbound&deleted_at=is.null&or=(body_text.ilike.*Premium%20Summary*,body_text.ilike.*feasible%20options*,body_text.ilike.*quotes%20comparison*,body_text.ilike.*comparison%20for%20the%20upcoming*)&select=body_text,from_address&order=sent_at.desc&limit=12`, [])
  const seen = new Set<string>()
  return rows.map(r => ownWords(r.body_text).trim()).filter(t => t.length > 300 && t.length < 2500 && !seen.has(t.slice(0, 80)) && seen.add(t.slice(0, 80))).slice(0, 3)
}

async function tonePass(draft: string, by: string | null, quotationId: string): Promise<{ body: string; rewritten: boolean }> {
  const samples = await exemplars()
  if (!samples.length) return { body: draft, rewritten: false }
  const r = await callGemini({
    agent: 'group_benefit', feature: 'gb_client_draft', model: GEMINI_FLASH, system: `${TONE_SYSTEM}\n\nSAMPLES OF THE BROKER'S OWN EMAILS:\n\n${samples.map((s, i) => `--- sample ${i + 1}\n${s}`).join('\n\n')}`,
    parts: [{ text: `EMAIL TO REWRITE:\n\n${draft}` }], temperature: 0.3, maxOutputTokens: 3_000, thinkingShare: 0.15, metadata: { quotation_id: quotationId, by },
  }).catch(() => ({ text: null as string | null, error: 'tone pass failed' }))
  const text = (r.text ?? '').replace(/^```[a-z]*\s*|\s*```$/g, '').trim()
  return text && keepsFigures(text, draft) ? { body: text, rewritten: true } : { body: draft, rewritten: false }
}

const bare = (a: string | null | undefined) => (String(a ?? '').match(/<(.+?)>/)?.[1] ?? String(a ?? '')).trim().toLowerCase()
const nameOf = (a: string | null | undefined) => (String(a ?? '').includes('<') ? String(a).split('<')[0].replace(/"/g, '').trim() : '') || null

export type ClientDraft = {
  to: string; toName: string | null; cc: string[]; firstName: string | null; subject: string; body: string; rewritten: boolean
  attachments: { filename: string; mime_type: string; storage_url: string }[]
  facts: ClientFacts
}

/** The client on the thread: the last person outside TRS who wrote on it; the others outside TRS who wrote are copied. */
export async function clientOnThread(threadId: string): Promise<{ email: string; name: string | null; cc: string[] } | null> {
  const msgs = await sbTry<Row[]>(`email_messages?thread_id=eq.${enc(threadId)}&deleted_at=is.null&direction=eq.inbound&select=from_address,sent_at&order=sent_at.desc&limit=30`, [])
  const outside = msgs.filter(x => !isInternal(bare(x.from_address)))
  const m = outside[0]
  if (!m) return null
  const email = bare(m.from_address)
  let name = nameOf(m.from_address)
  if (!name) {
    const [c] = await sbTry<Row[]>(`contacts?email=ilike.${enc(email)}&select=first_name,last_name&limit=1`, [])
    name = [c?.first_name, c?.last_name].filter(Boolean).join(' ') || null
  }
  if (!name) {
    // janice.sim@ → Janice
    const local = email.split('@')[0].split(/[._-]/)[0]
    name = local && /^[a-z]{2,}$/i.test(local) ? local.charAt(0).toUpperCase() + local.slice(1) : null
  }
  const cc = Array.from(new Set(outside.map(x => bare(x.from_address)).filter(e => e && e !== email)))
  return { email, name, cc }
}

export async function composeClientDraft(quotationId: string, threadId: string, by: string | null): Promise<ClientDraft> {
  const [q] = await sb<(ReportQuotation & { census: Row[] | null })[]>(`gb_quotations?id=eq.${enc(quotationId)}&select=id,company_name,effective_date,basis,member_count,census,results,category_map,benefits_analysis,notes,created_at,priorities,requirement&limit=1`)
  if (!q) throw new Error('Quotation not found.')
  const an = await loadAnalysis(quotationId)
  const pack = an ? analysisAsScenarios(an, q.company_name) : await loadScenarios(quotationId)
  if (!pack) throw new Error('Run the analysis first: the email is written from it.')
  const client = await clientOnThread(threadId)
  if (!client) throw new Error('No client on this thread to write to.')
  const firstName = client.name ? client.name.split(/\s+/)[0] : null
  const facts = clientFacts(q, pack)
  const draft = codeDraft(facts, firstName)
  const tone = await tonePass(draft.body, by, quotationId)

  // The client report, with the options page, as the attachment.
  const [names] = await sbTry<Row[]>(`app_settings?key=eq.${COVER_NAMES_KEY}&select=value&limit=1`, [])
  let coverNames: CoverNames = {}
  try { coverNames = JSON.parse(names?.value ?? '{}') } catch { /* canonical */ }
  const pdf = await renderReportPdf(buildReportModel(q, coverNames, reportOptions(pack)))
  const filename = `${(q.company_name || 'Quotation').replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-')}-group-benefits-comparison.pdf`
  const storage_url = await storeUpload('email-outgoing', filename, 'application/pdf', Buffer.from(pdf))

  return { to: client.email, toName: client.name, cc: client.cc, firstName, subject: draft.subject, body: tone.body, rewritten: tone.rewritten, attachments: [{ filename, mime_type: 'application/pdf', storage_url }], facts }
}
