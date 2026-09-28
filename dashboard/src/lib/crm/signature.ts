/**
 * Reading a person's position off their email signature.
 *
 * Done once per contact, the first time they appear, and again only if a later signature
 * carries a different title. The model sees only the tail of one message — where signatures
 * live — so each read is a few hundred tokens.
 */
import { sbTry, enc } from './db'
import { geminiJson } from './ai'

export interface SignatureRead {
  name: string | null
  title: string | null
  company: string | null
  phone: string | null
}

const SYSTEM = `You read the signature block at the end of a business email and return the sender's details. Only use what is actually written in the signature. If there is no signature, return nulls. Never guess a title from the email address.`

const SCHEMA = `Return one JSON object: { "name": string|null, "title": string|null, "company": string|null, "phone": string|null }
- title: their job position as written, e.g. "Finance Manager", "Director", "HR Executive". null if absent.
- company: the organisation name as written in the signature (the legal name if shown, e.g. "Flavia Holdings Pte Ltd"), null if absent.
- Ignore legal disclaimers, quoted earlier emails, and TRS's own signature.`

/** The last part of the body, where a signature would be, with quoted history cut off. */
export function signatureTail(body: string | null | undefined): string {
  const text = (body ?? '').replace(/\r/g, '')
  const cut = text.search(/^\s*(?:>|On .{0,80}\bwrote:|-{2,}\s*Original Message|_{5,}|From:\s)/m)
  const own = cut > 0 ? text.slice(0, cut) : text
  return own.trim().slice(-1500)
}

export async function readSignature(body: string | null | undefined, senderEmail: string, resourceId?: string | null): Promise<SignatureRead | null> {
  const tail = signatureTail(body)
  if (tail.length < 20) return null
  const res = await geminiJson<Partial<SignatureRead>>({
    system: SYSTEM,
    prompt: `${SCHEMA}\n\nSENDER ADDRESS: ${senderEmail}\n\nEND OF EMAIL:\n${tail}`,
    feature: 'crm_triage',
    resourceId: resourceId ?? null,
    temperature: 0,
    maxOutputTokens: 300,
  })
  if (!res.data) return null
  const clean = (v: unknown, max: number) => {
    const s = typeof v === 'string' ? v.trim() : ''
    return s && s.toLowerCase() !== 'null' ? s.slice(0, max) : null
  }
  return {
    name: clean(res.data.name, 80),
    title: clean(res.data.title, 80),
    company: clean(res.data.company, 120),
    phone: clean(res.data.phone, 40),
  }
}

/**
 * Read the signature for a contact if we have not done so, store what it says, and return the
 * organisation named in it so the caller can use it to match a company.
 */
export async function ensureSignatureRead(contactId: string, senderEmail: string, body: string | null | undefined): Promise<string | null> {
  const rows = await sbTry<{ id: string; title: string | null; company: string | null; signature_read_at: string | null; first_name: string | null }[]>(
    `contacts?id=eq.${enc(contactId)}&select=id,title,company,signature_read_at,first_name&limit=1`, [])
  const c = rows[0]
  if (!c) return null
  if (c.signature_read_at && c.title) return c.company

  const read = await readSignature(body, senderEmail, contactId)
  const patch: Record<string, unknown> = { signature_read_at: new Date().toISOString() }
  if (read?.title) patch.title = read.title
  if (read?.company && !c.company) patch.company = read.company
  if (read?.phone) patch.phone = read.phone
  if (read?.name && !c.first_name) {
    const parts = read.name.split(/\s+/)
    patch.first_name = parts[0]
    if (parts.length > 1) patch.last_name = parts.slice(1).join(' ')
  }
  await sbTry(`contacts?id=eq.${enc(contactId)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) })
  return read?.company ?? c.company ?? null
}
