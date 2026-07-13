/**
 * Resolve the best CONTACT for an email thread (#3): the external client if one can be
 * found, otherwise the specific TRS employee who handled it (a real person — not the shared
 * operations@ mailbox — mapped to the seeded 1-of-12 contact), otherwise nothing.
 * Used by the internal-contact backfill; ingestion applies the same idea inline.
 */

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[a-z]{2,}/gi

export const isInternalEmail = (e: string) => /@trade-risksol\.com$/i.test(e.trim())
const isAutomated = (e: string) => {
  const l = e.toLowerCase()
  return l.includes('noreply') || l.includes('no-reply') || l.includes('mailer-daemon') || l.includes('postmaster') || l.includes('donotreply')
}
// Shared/non-person mailboxes — attributing a thread to these is what makes the sidebar
// read "Operations Team" / "Trade Risk Solutions" instead of the person who sent it.
const SHARED_MAILBOXES = new Set(['operations@trade-risksol.com', 'road-plus@trade-risksol.com'])
const isPersonalInternal = (e: string) => isInternalEmail(e) && !SHARED_MAILBOXES.has(e.toLowerCase())
const isUsableClient      = (e: string) => !!e && !isInternalEmail(e) && !isAutomated(e)

// Pull a bare email out of a raw address that may include a display name, angle brackets or
// an Outlook "<mailto:…>" suffix, e.g. `Trade Risk Solutions <operations@trade-risksol.com>`.
const extractEmail = (raw: string | null | undefined): string | null => {
  if (!raw) return null
  const m = raw.match(EMAIL_RE)
  return m ? m[0].toLowerCase() : null
}

async function upsertContactByEmail(rawEmail: string, isEmployee: boolean): Promise<string | null> {
  const email = rawEmail.trim().toLowerCase()
  const body: Record<string, unknown> = { email, source: 'email' }
  if (isEmployee) body.is_employee = true
  // ignore-duplicates so we never overwrite a seeded employee's name/company.
  await fetch(`${SB_URL}/rest/v1/contacts?on_conflict=email`, {
    method: 'POST', headers: sbH('return=minimal,resolution=ignore-duplicates'),
    body: JSON.stringify(body),
  })
  const r = await fetch(`${SB_URL}/rest/v1/contacts?email=ilike.${encodeURIComponent(email)}&select=id&limit=1`, { headers: sbH(), cache: 'no-store' })
  const rows = r.ok ? await r.json() : []
  return Array.isArray(rows) ? (rows[0]?.id ?? null) : null
}

export type ResolvedContact = { contactId: string | null; kind: 'client' | 'employee' | 'none'; email: string | null }

export async function resolveBestContactForThread(threadId: string): Promise<ResolvedContact> {
  const mRes = await fetch(
    `${SB_URL}/rest/v1/email_messages?thread_id=eq.${encodeURIComponent(threadId)}&select=direction,from_address,body_text&order=sent_at.asc&limit=20`,
    { headers: sbH(), cache: 'no-store' },
  )
  const msgs: { direction: string; from_address: string | null; body_text: string | null }[] = mRes.ok ? await mRes.json() : []
  if (!Array.isArray(msgs) || msgs.length === 0) return { contactId: null, kind: 'none', email: null }

  const fromEmails = msgs.map(m => extractEmail(m.from_address)).filter((e): e is string => !!e)
  // All email addresses appearing anywhere in the bodies, in document order (top-down) —
  // the signature of the person who wrote the latest message appears before the quoted chain.
  const bodyEmails = (msgs.map(m => m.body_text ?? '').join('\n').match(EMAIL_RE) ?? []).map(e => e.toLowerCase())

  // 1. External client — an inbound sender, then any external address in the bodies.
  const clientEmail = fromEmails.find(e => msgsHasInbound(msgs, e) && isUsableClient(e))
    ?? fromEmails.find(isUsableClient)
    ?? bodyEmails.find(isUsableClient)
    ?? null
  if (clientEmail) {
    const id = await upsertContactByEmail(clientEmail, false)
    if (id) return { contactId: id, kind: 'client', email: clientEmail }
  }

  // 2. Employee — prefer a real person over the shared mailbox: personal From, then personal
  //    address in the body (signature), then any internal From, then any internal in body.
  const employeeEmail =
       fromEmails.find(isPersonalInternal)
    ?? bodyEmails.find(isPersonalInternal)
    ?? fromEmails.find(isInternalEmail)
    ?? bodyEmails.find(isInternalEmail)
    ?? null
  if (employeeEmail) {
    const id = await upsertContactByEmail(employeeEmail, true)
    if (id) return { contactId: id, kind: 'employee', email: employeeEmail }
  }

  return { contactId: null, kind: 'none', email: null }
}

// True when some inbound message was sent from `email`.
function msgsHasInbound(msgs: { direction: string; from_address: string | null }[], email: string): boolean {
  return msgs.some(m => m.direction === 'inbound' && extractEmail(m.from_address) === email)
}
