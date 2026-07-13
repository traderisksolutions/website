/**
 * Resolve the best CONTACT for an email thread (#3): the external client if one can be
 * found, otherwise the TRS employee who handled it (mapped to the seeded 1-of-12 contact),
 * otherwise nothing. Used by the internal-contact backfill; ingestion applies the same
 * client-first / employee-fallback logic inline.
 */

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

const isInternal  = (e: string) => /@trade-risksol\.com$/i.test(e.trim())
const isAutomated = (e: string) => {
  const l = e.toLowerCase()
  return l.includes('noreply') || l.includes('no-reply') || l.includes('mailer-daemon') || l.includes('postmaster') || l.includes('donotreply')
}
const isUsableClient = (e: string) => !!e && !isInternal(e) && !isAutomated(e)
const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[a-z]{2,}/gi

async function upsertContactByEmail(rawEmail: string, isEmployee: boolean): Promise<string | null> {
  const email = rawEmail.trim().toLowerCase()
  const body: Record<string, unknown> = { email, source: 'email' }
  if (isEmployee) body.is_employee = true
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

  // 1. External client — an inbound sender first, then any external address in a To:/Cc:
  //    line inside the (possibly forwarded) bodies.
  const inboundClient = msgs.find(m => m.direction === 'inbound' && m.from_address && isUsableClient(m.from_address))?.from_address
  let clientEmail: string | null = inboundClient ?? null
  if (!clientEmail) {
    const allBody = msgs.map(m => m.body_text ?? '').join('\n')
    const re = /^(?:To|Cc|CC|From)\s*:[^\n]+/gim
    let lm: RegExpExecArray | null
    scan: while ((lm = re.exec(allBody)) !== null) {
      for (const e of lm[0].match(EMAIL_RE) ?? []) {
        if (isUsableClient(e)) { clientEmail = e; break scan }
      }
    }
  }
  if (clientEmail) {
    const id = await upsertContactByEmail(clientEmail, false)
    if (id) return { contactId: id, kind: 'client', email: clientEmail.toLowerCase() }
  }

  // 2. Employee fallback — the first internal sender (resolves to the seeded 1-of-12).
  const internalSender = msgs.map(m => m.from_address).find(e => e && isInternal(e)) as string | undefined
  if (internalSender) {
    const id = await upsertContactByEmail(internalSender, true)
    if (id) return { contactId: id, kind: 'employee', email: internalSender.toLowerCase() }
  }

  return { contactId: null, kind: 'none', email: null }
}
