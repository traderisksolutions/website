import { sb, sbTry, enc } from '@/lib/crm/db'

/**
 * The contact row for a draft's first recipient. A recipient not yet in contacts (an insurer
 * desk, a client's new HR contact) gets a minimal row, under the case's company, so the draft
 * can be stored; ai_drafts.contact_id was NOT NULL on production and every such draft failed.
 */
export async function contactIdFor(email: string | null | undefined, companyId: string | null): Promise<string | null> {
  const e = (email ?? '').trim().toLowerCase()
  if (!e.includes('@')) return null
  const [hit] = await sbTry<{ id: string }[]>(`contacts?email=ilike.${enc(e)}&select=id&limit=1`, [])
  if (hit?.id) return hit.id
  try {
    const [made] = await sb<{ id: string }[]>('contacts', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ email: e, company_id: companyId, source: 'agent_draft' }) })
    return made?.id ?? null
  } catch {
    const [again] = await sbTry<{ id: string }[]>(`contacts?email=ilike.${enc(e)}&select=id&limit=1`, [])
    return again?.id ?? null
  }
}

/**
 * The first name to greet a recipient with: the contact's first name, else the display name the
 * person signs their mail with, else a readable first segment of the address ("alex.hp@" is
 * Alex). Null means the draft says Sir/Madam.
 */
export async function greetingFor(email: string | null | undefined): Promise<string | null> {
  const e = (email ?? '').trim().toLowerCase()
  if (!e.includes('@')) return null
  const [person] = await sbTry<{ first_name: string | null }[]>(`contacts?email=ilike.${enc(e)}&select=first_name&limit=1`, [])
  if (person?.first_name?.trim()) return person.first_name.trim()
  const [m] = await sbTry<{ from_address: string }[]>(`email_messages?from_address=ilike.*${enc(e)}*&select=from_address&order=sent_at.desc&limit=1`, [])
  return firstNameFrom(m?.from_address ?? null, e)
}

/** Pure: "Mei Ling Tan <meiling.tan@x>" → "Mei Ling"; "alex.hp@x" → "Alex"; "hr@x" → null. */
export function firstNameFrom(fromHeader: string | null, email: string): string | null {
  const display = String(fromHeader ?? '').replace(/<[^>]*>/, '').replace(/["']/g, '').trim()
  if (display && !display.includes('@')) {
    const words = display.split(/[\s,]+/).filter(w => /^[A-Za-z][A-Za-z'.-]*$/.test(w))
    if (words.length >= 2 && words.length <= 4 && !/\b(pte|ltd|llp|inc|team|claims|hr|admin|accounts|support)\b/i.test(display)) {
      // Family-name-first order (TAN Mei Ling) puts the surname in capitals; take the rest.
      const rest = /^[A-Z]{2,}$/.test(words[0]) ? words.slice(1) : words.slice(0, words.length === 2 ? 1 : 2)
      return rest.map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    }
    if (words.length === 1 && words[0].length >= 3) return words[0][0].toUpperCase() + words[0].slice(1).toLowerCase()
  }
  const local = email.split('@')[0].split(/[._-]/)[0]
  if (/^[a-z]{4,}$/.test(local) && !/^(admin|info|sales|claims|accounts|support|office|contact|enquiry|team|finance|mail|noreply|underwriting|marketing|service|services|enquiries|reception)$/.test(local)) return local[0].toUpperCase() + local.slice(1)
  return null
}
