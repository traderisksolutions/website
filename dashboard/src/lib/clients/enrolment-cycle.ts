/**
 * Enrolment cycles, by rule (Client 360 phase 3, 14 Nov 2026). A top client sends its joiners and
 * leavers to the insurer on a cycle (the largest: monthly, HR straight to the insurer's eligibility
 * team with TRS copied); the insurer confirms. TRS's part is noticing what did not happen:
 *
 *   1. a submission of the last 21 days the insurer has not confirmed after 5 working days → a
 *      ready-made chase to the insurer on that thread;
 *   2. a monthly or quarterly cycle whose next submission is 3 days late → a ready-made reminder
 *      to the client (a weekly flow of new hires comes when people are hired, so it gets none).
 *
 * Both are drafts in the Inbox for a person to approve and send; nothing sends here, and no model
 * is called. Each is prepared once (keyed by thread and submission, or by cycle and month).
 *
 * classify, pendingSubmissions and workingDaysBetween are pure; tested in
 * src/__tests__/enrolment-cycle.test.ts.
 */
export type CycleMessage = { id: string; thread_id: string; direction: string; from: string; sent_at: string; has_attachments: boolean; subject: string; body: string; to: string[] }
export type Kind = 'submission' | 'confirmation' | null

const SUBMIT = /enrol|movement|new ?born|new hire|joiner|leaver|addition|deletion|member/i
const CONFIRM = /pleased to confirm the enrolment|enrolments? (have|has) been (successfully )?completed|successfully (enrolled|added)|confirm(ed)? (the )?(enrolment|addition|deletion)/i
const domainOf = (e: string) => e.toLowerCase().split('@')[1] ?? ''

/** What a message is in the cycle. Pure. */
export function classify(m: Pick<CycleMessage, 'direction' | 'from' | 'has_attachments' | 'subject' | 'body'>, sides: { client: Set<string>; insurer: Set<string> }): Kind {
  if (m.direction !== 'inbound') return null
  const d = domainOf(m.from)
  if (sides.insurer.has(d) && CONFIRM.test(m.body)) return 'confirmation'
  if (sides.client.has(d) && m.has_attachments && SUBMIT.test(`${m.subject} ${m.body.slice(0, 600)}`)) return 'submission'
  return null
}

/** Working days from a to b (Monday to Friday; public holidays not known here). Pure. */
export function workingDaysBetween(a: string, b: string): number {
  let n = 0
  const d = new Date(`${a.slice(0, 10)}T00:00:00Z`), end = new Date(`${b.slice(0, 10)}T00:00:00Z`)
  while (d < end) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++ }
  return n
}

/**
 * Submissions the insurer has not confirmed: no confirmation anywhere in the cycle after the
 * submission and before the next one (the insurer often answers on its own "RE:" thread), at least
 * `days` working days old and at most `maxAgeDays` old (an old month is not worth a chase). Pure.
 */
export function pendingSubmissions(messages: CycleMessage[], sides: { client: Set<string>; insurer: Set<string> }, today: string, days = 5, maxAgeDays = 21): CycleMessage[] {
  const sorted = [...messages].sort((x, y) => x.sent_at.localeCompare(y.sent_at))
  const kinds = sorted.map(m => classify(m, sides))
  const out: CycleMessage[] = []
  sorted.forEach((m, i) => {
    if (kinds[i] !== 'submission') return
    const nextSub = sorted.findIndex((_, j) => j > i && kinds[j] === 'submission' && sorted[j].sent_at.slice(0, 10) !== m.sent_at.slice(0, 10))
    const until = nextSub < 0 ? sorted.length : nextSub
    const confirmed = kinds.slice(i + 1, until).includes('confirmation')
    const age = (Date.parse(today) - Date.parse(m.sent_at.slice(0, 10))) / 86_400_000
    if (!confirmed && age <= maxAgeDays && workingDaysBetween(m.sent_at, today) >= days) out.push(m)
  })
  return out
}

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore' })
const month = (iso: string) => new Date(iso).toLocaleDateString('en-SG', { month: 'long', year: 'numeric', timeZone: 'Asia/Singapore' })

/** The chase to the insurer, in TRS's words. Pure. */
export function insurerChase(client: string, m: CycleMessage): { subject: string; body: string } {
  return {
    subject: /^re:/i.test(m.subject) ? m.subject : `RE: ${m.subject}`,
    body: `Dear Eligibility Team,\n\nOn ${longDate(m.sent_at)}, ${client} sent the enrolment in "${m.subject.replace(/^(re|fw|fwd):\s*/i, '')}", with the member list attached. We have not yet received your confirmation.\n\nPlease confirm the enrolment, or let us know what is outstanding.\n\nKind regards,`,
  }
}

/** The reminder to the client, in TRS's words. Pure. */
export function clientReminder(client: string, first: string | null, due: string, last: CycleMessage): { subject: string; body: string } {
  return {
    subject: `${client}: enrolment for ${month(due)}`,
    body: `Dear ${first ?? 'Sir or Madam'},\n\nYour last enrolment was sent on ${longDate(last.sent_at)}. If there are joiners or leavers for ${month(due)}, please send the list to the insurer with us in copy, as before. If there are none this month, no action is needed.\n\nKind regards,`,
  }
}

/** Runs both checks for the top 20%'s enrolment cycles. Server only. */
export async function runEnrolmentCycles(opts: { today?: string; dryRun?: boolean } = {}): Promise<{ chases: number; reminders: number; planned: { kind: 'chase' | 'reminder'; business: string; thread_id: string; to: string; subject: string }[] }> {
  const { sbTry, enc, inChunks, bareEmail } = await import('@/lib/crm/db')
  const { loadAdminDesk } = await import('./admin-desk-load')
  const { directory } = await import('@/lib/admin/k/deposit')
  const { insurerDomains } = await import('@/lib/nexus/reader')
  const { createDraft, contactIdFor } = await import('@/lib/placement/store')
  const { cycleKey } = await import('./admin-desk')
  const today = opts.today ?? new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
  const [desk, dir, insurer] = await Promise.all([loadAdminDesk(), directory(), insurerDomains()])
  const planned: { kind: 'chase' | 'reminder'; business: string; thread_id: string; to: string; subject: string }[] = []
  let chases = 0, reminders = 0
  for (const b of desk.businesses) {
    const cycles = b.cycles.filter(c => c.type === 'Members and endorsements')
    if (!cycles.length) continue
    const client = new Set(b.members.flatMap(id => { const c = dir.byId.get(id); return [c?.domain, ...((c?.domains as string[] | null) ?? [])].filter(Boolean).map(String).map(x => x.toLowerCase()) }))
    const sides = { client, insurer }
    for (const c of cycles) {
      // Every thread of the cycle: the business's threads whose subject has the cycle's key.
      const key = cycleKey(c.label)
      const threads = (await sbTry<{ thread_id: string; title: string }[]>(`company_ledger?group_id=eq.${enc(b.id)}&kind=in.(email_in,email_out)&thread_id=not.is.null&select=thread_id,title&limit=3000`, []))
        .filter(t => cycleKey(t.title) === key)
      const ids = [...new Set(threads.map(t => t.thread_id))]
      const rows = await inChunks(ids, 60, ch => sbTry<{ id: string; thread_id: string; direction: string; from_address: string | null; sent_at: string; has_attachments: boolean | null; subject: string | null; body_text: string | null }[]>(`email_messages?thread_id=in.(${ch.join(',')})&deleted_at=is.null&select=id,thread_id,direction,from_address,sent_at,has_attachments,subject,body_text`, []))
      const parts = await inChunks(rows.map(r => r.id), 80, ch => sbTry<{ message_id: string; email: string }[]>(`email_participants?message_id=in.(${ch.join(',')})&deleted_at=is.null&select=message_id,email`, []))
      const to = new Map<string, string[]>()
      for (const p of parts) to.set(p.message_id, [...(to.get(p.message_id) ?? []), p.email.toLowerCase()])
      const msgs: CycleMessage[] = rows.map(r => ({ id: r.id, thread_id: r.thread_id, direction: r.direction, from: bareEmail(r.from_address), sent_at: r.sent_at, has_attachments: !!r.has_attachments, subject: r.subject ?? '', body: r.body_text ?? '', to: to.get(r.id) ?? [] }))

      // 1. Submissions the insurer has not confirmed.
      for (const m of pendingSubmissions(msgs, sides, today)) {
        const insurerTo = m.to.find(e => insurer.has(domainOf(e))) ?? msgs.filter(x => x.thread_id === m.thread_id && insurer.has(domainOf(x.from))).map(x => x.from)[0]
        if (!insurerTo) continue
        const kind = 'enrolment_chase'
        const done = await sbTry<{ id: string }[]>(`ai_drafts?email_type=eq.${kind}&thread_id=eq.${enc(m.thread_id)}&created_at=gte.${enc(m.sent_at)}&select=id&limit=1`, [])
        if (done.length) continue
        const e = insurerChase(b.name, m)
        planned.push({ kind: 'chase', business: b.name, thread_id: m.thread_id, to: insurerTo, subject: e.subject })
        if (opts.dryRun) continue
        const contact = await contactIdFor(insurerTo)
        if (contact && await createDraft({ contact_id: contact, to_email: insurerTo, subject: e.subject, body: e.body, thread_id: m.thread_id, email_type: kind, cc: [m.from] })) chases++
      }

      // 2. The next submission is late: only for a cycle on the calendar (monthly or quarterly); new hires come when they come.
      if (c.cadence !== 'monthly' && c.cadence !== 'quarterly') continue
      const subs = msgs.filter(m => classify(m, sides) === 'submission').sort((x, y) => x.sent_at.localeCompare(y.sent_at))
      const last = subs[subs.length - 1]
      if (!last) continue
      const due = new Date(Date.parse(last.sent_at.slice(0, 10)) + c.everyDays * 86_400_000).toISOString().slice(0, 10)
      if (Date.parse(today) < Date.parse(due) + 3 * 86_400_000) continue
      const kind = 'enrolment_reminder'
      const done = await sbTry<{ id: string }[]>(`ai_drafts?email_type=eq.${kind}&thread_id=eq.${enc(last.thread_id)}&created_at=gte.${enc(due)}&select=id&limit=1`, [])
      if (done.length) continue
      const [who] = await sbTry<{ first_name: string | null }[]>(`contacts?email=ilike.${enc(last.from)}&select=first_name&limit=1`, [])
      const e = clientReminder(b.name, who?.first_name ?? null, due, last)
      planned.push({ kind: 'reminder', business: b.name, thread_id: last.thread_id, to: last.from, subject: e.subject })
      if (opts.dryRun) continue
      const contact = await contactIdFor(last.from)
      if (contact && await createDraft({ contact_id: contact, to_email: last.from, subject: e.subject, body: e.body, thread_id: last.thread_id, email_type: kind })) reminders++
    }
  }
  return { chases, reminders, planned }
}
