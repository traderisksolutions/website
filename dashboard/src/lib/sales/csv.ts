// CSV in and out. Pure; tested.

/** Minimal RFC 4180 parser: quoted fields with embedded commas, newlines and "" quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++ } else inQuotes = false }
      else field += c
      continue
    }
    if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\r') continue
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

/** Cells that a spreadsheet would run as a formula get a leading apostrophe: lead text is
 *  scraped from the open web and must not execute. */
export function csvCell(v: unknown): string {
  let s: string
  if (v === null || v === undefined) s = ''
  else if (Array.isArray(v)) s = v.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' | ')
  else if (typeof v === 'object') s = JSON.stringify(v)
  else s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export const csvRow = (cells: unknown[]) => cells.map(csvCell).join(',') + '\r\n'
export const BOM = '﻿'

import type { IngestContact, IngestLead } from './ingest'
import { FREE_MAIL } from './ingest-rules'

/** CSV from the lead tool → ingest leads. One row per person; rows of the same company group
 *  into one lead. Columns (header row, any order, case-insensitive): company*, country*,
 *  domain, industry, why_now, source_url, product_line, fit_score, intent_score,
 *  recommended_action, name*, title, email, email_basis, email_source_url, phone, phone_basis,
 *  linkedin_url, draft_message. domain falls back to the email's domain unless free-mail. */
export function csvToLeads(csv: string): { leads: IngestLead[]; rows: number; error?: string } {
  const table = parseCsv(csv).filter(r => r.some(c => c.trim()))
  const header = (table.shift() ?? []).map(h => h.trim().toLowerCase().replace(/[\s-]+/g, '_'))
  if (!header.includes('company') || !header.includes('country')) return { leads: [], rows: 0, error: 'Header row must include company and country' }
  const at = (r: string[], k: string) => { const i = header.indexOf(k); return i >= 0 ? (r[i] ?? '').trim() : '' }
  const byKey = new Map<string, IngestLead & { contacts: IngestContact[] }>()
  for (const r of table) {
    const email = at(r, 'email').toLowerCase()
    const emailDomain = email.includes('@') ? email.split('@')[1] : ''
    const domain = at(r, 'domain') || (emailDomain && !FREE_MAIL.test(emailDomain) ? emailDomain : '')
    const company = at(r, 'company')
    const key = `${(domain || company).toLowerCase()}|${at(r, 'country').toUpperCase()}`
    const lead = byKey.get(key) ?? {
      company, domain, country: at(r, 'country'), industry: at(r, 'industry') || undefined, why_now: at(r, 'why_now') || undefined,
      source_url: at(r, 'source_url') || undefined, product_line: at(r, 'product_line') || undefined,
      fit_score: at(r, 'fit_score') || undefined, intent_score: at(r, 'intent_score') || undefined, recommended_action: at(r, 'recommended_action') || undefined,
      contacts: [],
    }
    if (at(r, 'name') || email || at(r, 'phone')) {
      lead.contacts.push({
        name: at(r, 'name') || undefined, title: at(r, 'title') || undefined, email: email || undefined,
        email_basis: at(r, 'email_basis').toLowerCase() || undefined, email_source_url: at(r, 'email_source_url') || undefined,
        phone: at(r, 'phone') || undefined, phone_basis: at(r, 'phone_basis').toLowerCase() || undefined, linkedin_url: at(r, 'linkedin_url') || undefined,
        draft_message: at(r, 'draft_message') || undefined,
      })
    }
    byKey.set(key, lead)
  }
  return { leads: Array.from(byKey.values()), rows: table.length }
}
