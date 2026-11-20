/**
 * The contact id for an email address: the existing contact (matched case-insensitively), or a new
 * one. The contacts table has no unique key on email, so an upsert with on_conflict=email fails
 * (Postgres 42P10) and every draft to a new address failed with it ("Send by email", 20 Nov 2026).
 * Look up first, insert only when none; the same as contactFor in src/lib/gb/eb-proposal-store.ts.
 */
import { sbTry, enc } from '@/lib/crm/db'

type Io = {
  find: (email: string) => Promise<string | null>
  insert: (row: Record<string, string>) => Promise<string | null>
}

const live: Io = {
  find: async email => (await sbTry<{ id: string }[]>(`contacts?email=ilike.${enc(email)}&select=id&limit=1`, []))[0]?.id ?? null,
  insert: async row => (await sbTry<{ id: string }[]>('contacts', [], { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }))[0]?.id ?? null,
}

export async function contactIdFor(rawEmail: string, extra: { name?: string | null; company?: string | null; source?: string } = {}, io: Io = live): Promise<string | null> {
  const email = String(rawEmail ?? '').trim().toLowerCase()   // contacts are stored lowercased
  if (!email.includes('@')) return null
  const found = await io.find(email)
  if (found) return found
  const row: Record<string, string> = { email, source: extra.source ?? 'email' }
  const parts = (extra.name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length) { row.first_name = parts[0]; row.last_name = parts.slice(1).join(' ') || parts[0] }
  if (extra.company) row.company = extra.company
  // A row made by another request between the two steps is found again rather than duplicated.
  return (await io.insert(row)) ?? await io.find(email)
}
