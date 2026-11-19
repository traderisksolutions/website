/**
 * The Employment Benefits proposal (Jarod, 19 Nov 2026): a quotation from /eb kept as it stood, the
 * proposal PDF built from it in Nathan's order (premium by cover, then plans and benefits per
 * category, then the census), the checks a broker reads before sending, and the client email
 * written by code from the same figures. Pure; tested in src/__tests__/gb-eb-proposal.test.ts.
 *
 *   snapshotFrom(...)     the quotation as /eb shows it, for the insurers ticked
 *   readSnapshot(raw)     a snapshot from a request body, bounded; null when it is not one
 *   proposalModel(s)      everything the PDF, the page and the email show
 *   proposalChecks(m)     covers chosen but not priced, lives without an age
 *   proposalEmail(m, …)   subject and HTML body, the premium table included
 *
 * No model is called anywhere here: every figure is the pricing engine's.
 */
import { longDate, sgd } from './report-model'
import { TIERS, type CoverKey, type Priced } from './eb-quote'
import type { Member } from '@/lib/gb-quote'

export type CoverCell = { plan: string; words: string; premium: number | null; locked: boolean }
export type SnapshotCategory = { name: string; employees: number; lives: number; covers: Record<CoverKey, Record<string, CoverCell>> }
export type CensusLife = { name: string; category: string; relationship: string; dob: string | null; occupation: string | null; age: number | null }
export type BenefitRow = { cover: string; label: string; values: string[] }   // one value per product, in Snapshot.products order
export type Snapshot = {
  company: string
  effectiveDate: string
  basis: 'renewal' | 'new_business'
  products: string[]
  categories: SnapshotCategory[]
  members: CensusLife[]
  /** Benefit rows of the chosen plans, per category, filled on the server from the house workbook. */
  benefits?: Record<string, BenefitRow[]>
  workbook: string | null
}

export const COVER_KEYS: CoverKey[] = TIERS.map(t => t.key)
export const COVER_NAME: Record<CoverKey, string> = Object.fromEntries(TIERS.map(t => [t.key, t.cover])) as Record<CoverKey, string>

type Picks = Record<string, Record<string, Record<CoverKey, string>>>   // category → product → cover → plan

/** The quotation as /eb shows it, for the insurers ticked, in the page's product order. */
export function snapshotFrom(input: {
  priced: Priced; picks: Picks; products: string[]; company: string; effectiveDate: string; basis: 'renewal' | 'new_business'; members: Member[]; categories: string[]
}): Snapshot {
  const products = input.priced.products.filter(p => input.products.includes(p))
  const categories = input.priced.categories.filter(c => input.categories.includes(c.name)).map(c => ({
    name: c.name, employees: c.employees, lives: c.lives,
    covers: Object.fromEntries(COVER_KEYS.map(k => [k, Object.fromEntries(products.map(p => {
      const pc = c.products[p]?.[k]
      const plan = input.picks[c.name]?.[p]?.[k] ?? ''
      const opt = pc?.options.find(o => o.plan === plan)
      return [p, { plan, words: plan ? opt?.words ?? plan : '', premium: plan ? opt?.premium ?? null : null, locked: !!pc?.locked }]
    }))])) as Record<CoverKey, Record<string, CoverCell>>,
  }))
  const members = input.members.filter(m => input.categories.includes(m.category)).map(m => ({
    name: m.name, category: m.category, relationship: m.relationship, dob: m.dob ?? null, occupation: m.occupation_class ?? null, age: m.age ?? null,
  }))
  return { company: input.company, effectiveDate: input.effectiveDate, basis: input.basis, products, categories, members, workbook: input.priced.workbook?.name ?? null }
}

const str = (v: unknown, n = 200) => (typeof v === 'string' ? v.slice(0, n) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A snapshot from a request body, bounded. Null when the shape is not one. */
export function readSnapshot(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const products = Array.isArray(r.products) ? r.products.map(p => str(p, 80)).filter(Boolean).slice(0, 8) : []
  const cats = Array.isArray(r.categories) ? r.categories.slice(0, 8) : []
  if (!str(r.company) || !/^\d{4}-\d{2}-\d{2}$/.test(str(r.effectiveDate, 10)) || !products.length || !cats.length) return null
  const categories: SnapshotCategory[] = cats.map(c => {
    const o = (c ?? {}) as Record<string, unknown>
    const covers = (o.covers ?? {}) as Record<string, Record<string, Record<string, unknown>>>
    return {
      name: str(o.name, 80) || 'All', employees: Math.max(0, Math.round(num(o.employees) ?? 0)), lives: Math.max(0, Math.round(num(o.lives) ?? 0)),
      covers: Object.fromEntries(COVER_KEYS.map(k => [k, Object.fromEntries(products.map(p => {
        const cell = covers[k]?.[p] ?? {}
        return [p, { plan: str(cell.plan, 80), words: str(cell.words, 160), premium: num(cell.premium), locked: cell.locked === true }]
      }))])) as Record<CoverKey, Record<string, CoverCell>>,
    }
  })
  const members: CensusLife[] = (Array.isArray(r.members) ? r.members.slice(0, 2000) : []).map(m => {
    const o = (m ?? {}) as Record<string, unknown>
    return { name: str(o.name, 120), category: str(o.category, 80), relationship: str(o.relationship, 40), dob: str(o.dob, 20) || null, occupation: str(o.occupation, 20) || null, age: num(o.age) }
  })
  return { company: str(r.company), effectiveDate: str(r.effectiveDate, 10), basis: r.basis === 'new_business' ? 'new_business' : 'renewal', products, categories, members, workbook: str(r.workbook, 160) || null }
}

export type ProposalModel = {
  company: string; period: string; basis: string; employees: number; dependants: number; lives: number
  products: string[]
  /** Premium by cover, summed over the categories, per product; null where no category has the cover. */
  byCover: { key: CoverKey; cover: string; values: (number | null)[]; included: boolean[] }[]
  totals: number[]
  perLife: (number | null)[]
  /** Index of the lowest total among products with a premium. */
  lowest: number | null
  categories: { name: string; employees: number; lives: number; totals: number[]; plans: { cover: string; words: string[] }[]; benefits: BenefitRow[] }[]
  census: CensusLife[]
  notes: string[]
}

const addDays = (iso: string, n: number) => { const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const shortDate = (iso: string) => longDate(iso).replace(/ (\w{3})\w*/, ' $1')

export function proposalModel(s: Snapshot): ProposalModel {
  const end = addDays(`${Number(s.effectiveDate.slice(0, 4)) + 1}${s.effectiveDate.slice(4, 10)}`, -1)
  const employees = s.categories.reduce((a, c) => a + c.employees, 0)
  const lives = s.categories.reduce((a, c) => a + c.lives, 0)
  const byCover = COVER_KEYS.map(k => {
    const values = s.products.map(p => s.categories.reduce<number | null>((a, c) => {
      const cell = c.covers[k]?.[p]
      return cell?.plan && cell.premium != null ? (a ?? 0) + cell.premium : a
    }, null))
    const included = s.products.map(p => s.categories.some(c => c.covers[k]?.[p]?.plan && c.covers[k][p].locked))
    return { key: k, cover: COVER_NAME[k], values, included }
  }).filter(r => r.values.some(v => v != null) || r.included.some(Boolean))
  const totals = s.products.map((_, i) => byCover.reduce((a, r) => a + (r.values[i] ?? 0), 0))
  const priced = totals.map((t, i) => ({ t, i })).filter(x => x.t > 0)
  const lowest = priced.length ? priced.reduce((a, b) => (b.t < a.t ? b : a)).i : null
  return {
    company: s.company, period: `${shortDate(s.effectiveDate)} to ${shortDate(end)}`, basis: s.basis === 'renewal' ? 'Renewal' : 'New business',
    employees, dependants: lives - employees, lives, products: s.products, byCover, totals,
    perLife: totals.map(t => (lives ? Math.round(t / lives) : null)), lowest,
    categories: s.categories.map(c => ({
      name: c.name, employees: c.employees, lives: c.lives,
      totals: s.products.map(p => COVER_KEYS.reduce((a, k) => a + (c.covers[k]?.[p]?.plan ? c.covers[k][p].premium ?? 0 : 0), 0)),
      plans: COVER_KEYS.filter(k => s.products.some(p => c.covers[k]?.[p]?.plan)).map(k => ({
        cover: COVER_NAME[k], words: s.products.map(p => { const x = c.covers[k]?.[p]; return x?.plan ? (x.locked ? `${x.plan} · in hospital plan` : x.plan) : '—' }),
      })),
      benefits: s.benefits?.[c.name] ?? [],
    })),
    census: s.members.map(p => ({ ...p, dob: p.dob && /^\d{4}-\d{2}-\d{2}/.test(p.dob) ? shortDate(p.dob) : p.dob })),
    notes: [
      'Annual premiums in Singapore dollars, net of GST. Indicative only and subject to each insurer’s underwriting.',
      'Benefits from each insurer’s current brochure. Not a policy document.',
    ],
  }
}

export type ProposalCheck = { kind: 'warn' | 'ok'; label: string; text: string }

/** What a broker reads before sending: covers chosen but not priced, and lives the census does not age. */
export function proposalChecks(s: Snapshot): ProposalCheck[] {
  const out: ProposalCheck[] = []
  for (const k of COVER_KEYS) {
    const misses: string[] = []
    for (const c of s.categories) {
      const at = s.products.filter(p => { const x = c.covers[k]?.[p]; return x?.plan && !x.locked && (x.premium == null || x.premium === 0) })
      if (at.length) misses.push(`${c.name} (${at.length === s.products.length ? 'every insurer' : at.join(', ')})`)
    }
    if (misses.length) out.push({ kind: 'warn', label: COVER_NAME[k], text: `Chosen but priced at S$0 or not priced: ${misses.join('; ')}.` })
  }
  const unaged = s.members.filter(m => !m.dob && m.age == null).length
  out.push(unaged
    ? { kind: 'warn', label: 'Census', text: `${unaged} of ${s.members.length} lives have no date of birth or age.` }
    : { kind: 'ok', label: 'Census', text: `${s.members.length} lives, each with a date of birth or age.` })
  return out
}

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const TD = 'border:1px solid #d5d9d4;padding:6px 12px;'

/** The client email, written by code from the proposal's own figures. HTML, with the premium table. */
export function proposalEmail(m: ProposalModel, first: string | null, sender: string | null): { subject: string; html: string } {
  const rows = m.products.map((p, i) => ({ p, t: m.totals[i], l: m.perLife[i] })).filter(r => r.t > 0).sort((a, b) => a.t - b.t)
  const table = `<table style="border-collapse:collapse;font-size:14px"><thead><tr><th style="${TD}text-align:left">Insurer</th><th style="${TD}text-align:center">Annual premium, net of GST</th><th style="${TD}text-align:center">A life</th></tr></thead><tbody>${
    rows.map(r => `<tr><td style="${TD}">${esc(r.p)}</td><td style="${TD}text-align:center">${sgd(r.t)}</td><td style="${TD}text-align:center">${r.l != null ? sgd(r.l) : '—'}</td></tr>`).join('')}</tbody></table>`
  const lives = `${m.employees} employee${m.employees === 1 ? '' : 's'}${m.dependants ? `, ${m.dependants} dependant${m.dependants === 1 ? '' : 's'}` : ''}`
  const html = [
    `<p>Dear ${esc(first ?? 'Sir or Madam')},</p>`,
    `<p>Please find attached the Employee Benefits proposal for ${esc(m.company)}, for ${esc(m.period)}, prepared on the latest member listing (${lives}).</p>`,
    table,
    '<p>Premiums are indicative and subject to each insurer’s underwriting. The proposal sets out the plans and benefits for each category.</p>',
    '<p>We would be glad to go through the options with you. Please let us know a convenient time.</p>',
    `<p>Warm regards,${sender ? `<br>${esc(sender)}` : ''}<br>Trade Risk Solutions</p>`,
  ].join('')
  return { subject: `Employee Benefits proposal for ${m.company}`, html }
}

export const proposalFilename = (company: string, version: number) =>
  `${company.replace(/[^A-Za-z0-9&.,() -]+/g, ' ').replace(/\s+/g, ' ').trim()} - Employee Benefits Proposal V${version}.pdf`
