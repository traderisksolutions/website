/**
 * Intake: the first agent to see every stored message. One job — say what the message is, put
 * the history inside it on record, tie it to its case, and hand the work on. It decides nothing
 * about the case itself and never drafts.
 *
 *   intake · message    one stored email (enqueued by the ingest route)
 *   intake · read_case  the case worker reads one client, debounced 10 minutes per client
 */
import { createHash } from 'node:crypto'
import { sb, sbTry, enc, inChunks, isInternal, isAutomated, bareEmail } from '@/lib/crm/db'
import { enqueue, skip, type AgentTask } from '@/lib/agent-tasks/queue'
import { workCompany } from '@/lib/casework/run'
import { readHistory, type HistoryMessage } from './history'
import { isClaimLike, isOutOfOffice, refKey, senderKind, subjectCore, type SenderKind } from './signals'
import { bestCase, debouncedRunAfter, type CaseCandidate, type CaseMatch, type JoinedBy } from './match'
import { referencesIn, companyOfReferences, type RefTarget } from './references'
import { gapsFor, leftOffTrs } from './gaps'
import type { ClaimMailPayload, Gap, OpenMidwayPayload, ReadCasePayload } from './handoffs'

type Row = Record<string, any>

let insurerCache: { at: number; domains: Set<string>; ids: Set<string> } | null = null
async function insurers() {
  if (insurerCache && Date.now() - insurerCache.at < 600_000) return insurerCache
  const rows = await sbTry<Row[]>('companies?kind=eq.insurer&select=id,domains,domain', [])
  const domains = new Set<string>()
  for (const r of rows) for (const d of [...(r.domains ?? []), r.domain]) if (d) domains.add(String(d).toLowerCase())
  insurerCache = { at: Date.now(), domains, ids: new Set(rows.map(r => r.id as string)) }
  return insurerCache
}

export const rebuiltHash = (m: HistoryMessage) =>
  createHash('sha1').update([m.fromAddress ?? m.fromName ?? '', m.sentAtText ?? '', m.subject ?? '', m.body.replace(/\s+/g, ' ').slice(0, 400)].join('|')).digest('hex')

/** Is a rebuilt message one TRS already holds? Same sender within three minutes. */
async function alreadyHeld(m: HistoryMessage): Promise<boolean> {
  if (!m.fromAddress || !m.sentAt) return false
  const t = Date.parse(m.sentAt)
  const rows = await sbTry<Row[]>(`email_messages?from_address=ilike.*${enc(m.fromAddress)}*&sent_at=gte.${enc(new Date(t - 180_000).toISOString())}&sent_at=lte.${enc(new Date(t + 180_000).toISOString())}&select=id&limit=1`, [])
  return rows.length > 0
}

/** Stores the rebuilt messages TRS does not hold. Returns their ids, oldest first. */
async function storeRebuilt(threadId: string, messageId: string, rebuilt: HistoryMessage[]): Promise<{ ids: string[]; kept: HistoryMessage[] }> {
  const kept: HistoryMessage[] = []
  for (const m of rebuilt.slice(0, 15)) if (!(await alreadyHeld(m))) kept.push(m)
  if (!kept.length) return { ids: [], kept }
  const rows = kept.map(m => ({
    thread_id: threadId, source_message_id: messageId, origin: m.origin, position: m.position,
    from_address: m.fromAddress, from_name: m.fromName, to_addresses: m.to, cc_addresses: m.cc,
    sent_at: m.sentAt, sent_at_text: m.sentAtText, subject: m.subject, body_text: m.body,
    attachments_named: m.attachmentsNamed, trs_copied: [m.fromAddress, ...m.to, ...m.cc].some(a => a && isInternal(a)),
    hash: rebuiltHash(m),
  }))
  await sb('rebuilt_messages?on_conflict=hash', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows) })
  const stored = await sbTry<Row[]>(`rebuilt_messages?hash=in.(${rows.map(r => r.hash).join(',')})&select=id,position&order=position.asc`, [])
  return { ids: stored.map(r => r.id as string), kept }
}

/** The open cases this message could belong to, with what each is matched on. */
async function candidates(opts: { companyIds: string[]; refItemIds: string[]; people: string[] }): Promise<CaseCandidate[]> {
  const ids = new Set(opts.refItemIds)
  for (const c of opts.companyIds) for (const r of await sbTry<Row[]>(`work_items?company_id=eq.${enc(c)}&closed_at=is.null&select=id&limit=40`, [])) ids.add(r.id)
  if (opts.people.length) {
    const parts = await sbTry<Row[]>(`email_participants?email=in.(${opts.people.slice(0, 20).map(p => `"${p}"`).join(',')})&deleted_at=is.null&select=thread_id&order=created_at.desc&limit=400`, [])
    const threadIds = Array.from(new Set(parts.map(p => p.thread_id as string)))
    const links = await inChunks(threadIds, 60, chunk => sbTry<Row[]>(`work_item_threads?thread_id=in.(${chunk.join(',')})&select=work_item_id`, []))
    for (const l of links) ids.add(l.work_item_id)
  }
  const list = Array.from(ids).slice(0, 40)
  if (!list.length) return []
  const items = await sbTry<Row[]>(`work_items?id=in.(${list.join(',')})&closed_at=is.null&select=id,case_type,company_id,title,policy_number,policy_id,last_activity_at,work_item_threads(thread_id,email_threads(subject)),claims(insurer_ref,policy_number)`, [])
  const threadIds = items.flatMap(i => (i.work_item_threads ?? []).map((t: Row) => t.thread_id as string))
  const people = await inChunks(threadIds, 60, chunk => sbTry<Row[]>(`email_participants?thread_id=in.(${chunk.join(',')})&deleted_at=is.null&select=thread_id,email`, []))
  const peopleBy = new Map<string, Set<string>>()
  for (const p of people) { const e = String(p.email ?? '').toLowerCase(); if (!e || isInternal(e)) continue; peopleBy.set(p.thread_id, (peopleBy.get(p.thread_id) ?? new Set()).add(e)) }
  return items.map(i => {
    const threads: Row[] = i.work_item_threads ?? []
    // claims.work_item_id is unique, so PostgREST embeds one object rather than an array.
    const claims: Row[] = ([] as Row[]).concat(i.claims ?? [])
    return {
      workItemId: i.id, caseType: i.case_type, companyId: i.company_id, title: i.title,
      claimRefs: claims.map(c => refKey(c.insurer_ref)).filter((k: string) => k.length >= 6),
      policyRefs: [i.policy_number, ...claims.map(c => c.policy_number)].flatMap(p => String(p ?? '').split(/[\s,;()]+/)).map(refKey).filter(k => k.length >= 6 && (k.match(/\d/g) ?? []).length >= 3),
      people: Array.from(new Set(threads.flatMap(t => Array.from(peopleBy.get(t.thread_id) ?? [])))),
      subjectWords: Array.from(new Set([i.title, ...threads.map(t => t.email_threads?.subject)].flatMap(s => subjectCore(s)))),
      lastActivity: i.last_activity_at,
    }
  })
}

/** Queues the case worker for a client, or pushes back the one already queued (a burst). */
export async function scheduleRead(p: { companyId: string; threadId: string; messageId: string; mode: ReadCasePayload['opened_mode']; gaps: Gap[]; by: 'intake' }) {
  const [open] = await sbTry<Row[]>(`agent_tasks?agent=eq.intake&kind=eq.read_case&company_id=eq.${enc(p.companyId)}&status=eq.queued&select=id,payload&limit=1`, [])
  const runAfter = debouncedRunAfter(Date.now())
  if (open) {
    const was = open.payload as ReadCasePayload
    const payload: ReadCasePayload = {
      company_id: p.companyId,
      thread_ids: Array.from(new Set([...(was.thread_ids ?? []), p.threadId])),
      message_ids: Array.from(new Set([...(was.message_ids ?? []), p.messageId])),
      opened_mode: was.opened_mode !== 'normal' ? was.opened_mode : p.mode,
      gaps: [...(was.gaps ?? []), ...p.gaps].slice(0, 40),
    }
    await sb(`agent_tasks?id=eq.${enc(open.id)}&status=eq.queued`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ run_after: runAfter, payload }) })
    return open.id as string
  }
  const payload: ReadCasePayload = { company_id: p.companyId, thread_ids: [p.threadId], message_ids: [p.messageId], opened_mode: p.mode, gaps: p.gaps }
  await enqueue({ agent: 'intake', kind: 'read_case', idem_key: `readcase:${p.companyId}:${p.messageId}`, created_by_agent: p.by, company_id: p.companyId, thread_id: p.threadId, payload, run_after: runAfter })
  return null
}

export type IntakeResult = {
  kind: SenderKind; out_of_office: boolean; forward: boolean; first_held: boolean
  rebuilt: number; refs: string[]; matched: CaseMatch | null; handed: string[]
}

export async function intakeMessage(task: AgentTask): Promise<IntakeResult | 'handled'> {
  const messageId = String(task.payload.message_id ?? task.message_id ?? '')
  const [msg] = await sbTry<Row[]>(`email_messages?id=eq.${enc(messageId)}&select=id,thread_id,direction,from_address,subject,body_text,sent_at,has_attachments`, [])
  if (!msg) { await skip(task.id, 'message not found'); return 'handled' }
  const [thread] = await sbTry<Row[]>(`email_threads?id=eq.${enc(msg.thread_id)}&select=id,subject,company_id`, [])
  const from = bareEmail(msg.from_address)
  const ins = await insurers()
  const kind = senderKind(from, { isInternal, isAutomated, insurerDomains: ins.domains })
  const ooo = isOutOfOffice(msg.subject, msg.body_text)
  const handed: string[] = []
  const day = new Date().toISOString().slice(0, 10)

  if (msg.has_attachments) {
    await enqueue({ agent: 'document_clerk', kind: 'attachments', idem_key: `docs:${msg.id}`, created_by_agent: 'intake', message_id: msg.id, thread_id: msg.thread_id, company_id: thread?.company_id ?? null, payload: { message_id: msg.id } })
    handed.push('document_clerk')
  }
  if (kind === 'automated' || ooo) return { kind, out_of_office: ooo, forward: false, first_held: false, rebuilt: 0, refs: [], matched: null, handed }

  const history = readHistory(msg.body_text ?? '', msg.subject)
  const held = await sbTry<Row[]>(`email_messages?thread_id=eq.${enc(msg.thread_id)}&deleted_at=is.null&select=id,sent_at&order=sent_at.asc&limit=1`, [])
  const firstHeld = held[0]?.id === msg.id
  const forward = /^\s*(fw|fwd|wg|转发)\s*[:：]/i.test(msg.subject ?? '') || history.messages.some(m => m.origin === 'forward')

  let rebuiltIds: string[] = []
  let rebuilt: HistoryMessage[] = []
  if ((forward || firstHeld) && history.messages.length) {
    const r = await storeRebuilt(msg.thread_id, msg.id, history.messages)
    rebuiltIds = r.ids; rebuilt = r.kept
  }

  const text = [msg.subject, history.top, ...history.messages.map(m => `${m.subject ?? ''}\n${m.body}`)].join('\n')
  const refHits = await referencesIn(text)
  const claimLike = isClaimLike(msg.subject, text)
  const refItemIds = refHits.flatMap(h => h.value.map((v: RefTarget) => v.kind === 'claim' ? v.workItemId : v.kind === 'work_item' ? v.workItemId : null)).filter((x): x is string => !!x)
  const refCompany = companyOfReferences(refHits)
  const people = Array.from(new Set([from, ...history.messages.flatMap(m => [m.fromAddress, ...m.to, ...m.cc])].filter((e): e is string => !!e && !isInternal(e) && !isAutomated(e))))
  const companyId: string | null = thread?.company_id && !ins.ids.has(thread.company_id) ? thread.company_id : refCompany

  const [link] = await sbTry<Row[]>(`work_item_threads?thread_id=eq.${enc(msg.thread_id)}&select=work_item_id,joined_by,work_items(case_type,company_id)`, [])
  let matched: CaseMatch | null = link ? { workItemId: link.work_item_id, score: 1, joinedBy: 'thread', evidence: 'thread already on the case' } : null
  let matchedType: string | null = link?.work_items?.case_type ?? null
  let matchedCompany: string | null = link?.work_items?.company_id ?? null
  if (!matched) {
    const cands = await candidates({ companyIds: companyId ? [companyId] : [], refItemIds, people })
    const m = bestCase({ refs: refHits.map(h => h.key), people, subjectWords: subjectCore(msg.subject), sentAt: msg.sent_at ?? new Date().toISOString(), claimLike }, cands)
    if (m) {
      const joinedBy: JoinedBy = forward && (m.joinedBy === 'subject' || m.joinedBy === 'people') ? 'forward' : m.joinedBy
      matched = { ...m, joinedBy }
      const c = cands.find(x => x.workItemId === m.workItemId)
      matchedType = c?.caseType ?? null
      matchedCompany = c?.companyId ?? null
      await sbTry('work_item_threads?on_conflict=work_item_id,thread_id', null, {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ work_item_id: m.workItemId, thread_id: msg.thread_id, side: thread?.company_id && ins.ids.has(thread.company_id) ? 'insurer' : kind === 'internal' ? 'internal' : 'client', joined_by: joinedBy, joined_evidence: m.evidence }),
      })
    }
  }

  if (!thread?.company_id && kind !== 'internal') {
    await enqueue({ agent: 'resolver', kind: 'thread', idem_key: `resolve:${msg.thread_id}`, created_by_agent: 'intake', thread_id: msg.thread_id, message_id: msg.id, payload: { thread_id: msg.thread_id, sender: from || null, subject: msg.subject ?? null }, run_after: new Date(Date.now() + 120_000).toISOString() })
    handed.push('resolver')
  }

  const caseCompany = matchedCompany ?? companyId
  if (caseCompany) {
    await enqueue({ agent: 'knowledge_keeper', kind: 'seed_company', idem_key: `seed:${caseCompany}:${day}`, created_by_agent: 'intake', company_id: caseCompany, payload: { company_id: caseCompany } })
    if (kind === 'client') await enqueue({ agent: 'knowledge_keeper', kind: 'read_message', idem_key: `facts:${msg.id}`, created_by_agent: 'intake', company_id: caseCompany, message_id: msg.id, payload: { message_id: msg.id, company_id: caseCompany } })
    handed.push('knowledge_keeper')
  }

  if (matched) {
    if (matchedType === 'claim') {
      const [claim] = await sbTry<Row[]>(`claims?work_item_id=eq.${enc(matched.workItemId)}&select=id`, [])
      const payload: ClaimMailPayload = { work_item_id: matched.workItemId, claim_id: claim?.id ?? null, thread_id: msg.thread_id, message_id: msg.id, joined_by: matched.joinedBy, rebuilt_ids: rebuiltIds }
      await enqueue({ agent: 'claims', kind: 'case_mail', idem_key: `claimmail:${msg.id}`, created_by_agent: 'intake', work_item_id: matched.workItemId, company_id: caseCompany, thread_id: msg.thread_id, message_id: msg.id, payload })
      handed.push('claims')
    } else if (caseCompany) {
      await scheduleRead({ companyId: caseCompany, threadId: msg.thread_id, messageId: msg.id, mode: 'normal', gaps: [], by: 'intake' })
      handed.push('intake.read_case')
    }
  } else if (rebuilt.length) {
    // TRS has no record of this conversation: open it from what the history says.
    const files = await sbTry<Row[]>(`email_attachments?thread_id=eq.${enc(msg.thread_id)}&select=filename`, [])
    const gaps = gapsFor(rebuilt, files.map(f => f.filename).filter(Boolean), { refFound: refHits.length > 0, claimLike })
    const mode = forward ? 'from_forward' : 'midway'
    if (claimLike) {
      const payload: OpenMidwayPayload = { thread_id: msg.thread_id, message_id: msg.id, company_id: caseCompany, opened_mode: mode, rebuilt_ids: rebuiltIds, refs: refHits.map(h => h.key), gaps, left_off_trs: leftOffTrs(rebuilt, isInternal) }
      await enqueue({ agent: 'claims', kind: 'open_midway', idem_key: `midway:${msg.thread_id}`, created_by_agent: 'intake', company_id: caseCompany, thread_id: msg.thread_id, message_id: msg.id, payload })
      handed.push('claims')
    } else if (caseCompany) {
      await scheduleRead({ companyId: caseCompany, threadId: msg.thread_id, messageId: msg.id, mode, gaps, by: 'intake' })
      handed.push('intake.read_case')
    }
  } else if (caseCompany) {
    await scheduleRead({ companyId: caseCompany, threadId: msg.thread_id, messageId: msg.id, mode: 'normal', gaps: [], by: 'intake' })
    handed.push('intake.read_case')
  }

  return { kind, out_of_office: ooo, forward, first_held: firstHeld, rebuilt: rebuiltIds.length, refs: refHits.map(h => h.key), matched, handed }
}

/** The case worker reads one client. A model failure throws, so the task retries. */
export async function readCase(task: AgentTask) {
  const p = task.payload as ReadCasePayload
  const r = await workCompany(p.company_id, { write: true })
  if (r.note && r.note !== 'no recent threads') throw new Error(r.note)
  if (p.opened_mode !== 'normal' && p.thread_ids?.length) {
    const joinedBy: JoinedBy = p.opened_mode === 'from_forward' ? 'forward' : 'quoted'
    const links = await sbTry<Row[]>(`work_item_threads?thread_id=in.(${p.thread_ids.join(',')})&select=work_item_id,thread_id,joined_by`, [])
    for (const l of links) {
      if (!l.joined_by) await sbTry(`work_item_threads?work_item_id=eq.${enc(l.work_item_id)}&thread_id=eq.${enc(l.thread_id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ joined_by: joinedBy, joined_evidence: p.opened_mode === 'from_forward' ? 'opened from a forward' : 'opened from quoted history' }) })
    }
    for (const id of Array.from(new Set(links.map(l => l.work_item_id as string)))) {
      await sbTry('work_item_events', null, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: id, kind: 'note', actor: 'intake', detail: { opened_mode: p.opened_mode, gaps: p.gaps, task_id: task.id } }) })
    }
  }
  return { stored: r.stored, cases: r.cases.length, dropped: r.dropped }
}
