/**
 * Scores the endorsement loop's readers against real mail, read-only. Writes nothing.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/endorsements-score.mts [company-name-filter] [max-companies]
 *
 * For every client with a live policy (or the one named), every inbound client message of the last
 * 180 days is read with the rules (sheets, then body) and every insurer note PDF with the note
 * reader. Prints what was read, per message, so a person can check each hit; the summary counts
 * hits per reader. No model is called.
 */
import { sbTry, enc, bareEmail, isInternal } from '@/lib/crm/db'
import { latestText } from '@/lib/nexus/reader'
import { parseMovementBody } from '@/lib/admin/b/endorsements/parse-body'
import { parseMovementRows } from '@/lib/admin/b/endorsements/parse-sheet'
import { isSpreadsheet, sheetRows } from '@/lib/admin/b/endorsements/read-xlsx'
import { readNoteText } from '@/lib/admin/b/endorsements/read-note'
import { attachmentRefBytes, gmailRef } from '@/lib/storage/attachment-bytes'

type Row = Record<string, any>
const [filter, maxArg] = process.argv.slice(2)
const MAX = Number(maxArg ?? 12)
const since = new Date(Date.now() - 180 * 86_400_000).toISOString()

const insurers = new Set((await sbTry<Row[]>('companies?kind=in.(insurer,tpa)&select=domains,domain', [])).flatMap(c => [...(c.domains ?? []), c.domain]).filter(Boolean).map((d: string) => d.toLowerCase()))
// policies has two links to companies (client and chosen insurer), so the client is read separately.
const live = await sbTry<Row[]>('policies?lifecycle=in.(bound,live,renewal_due)&company_id=not.is.null&select=company_id', [])
const ids = Array.from(new Set(live.map(p => p.company_id)))
const names = new Map<string, Row>()
for (let i = 0; i < ids.length; i += 60) for (const c of await sbTry<Row[]>(`companies?id=in.(${ids.slice(i, i + 60).join(',')})&select=id,company_name,kind`, [])) names.set(c.id, c)
const byCompany = new Map<string, string>()
for (const id of ids) { const c = names.get(id); if (c && ['client', null].includes(c.kind ?? null) && (!filter || String(c.company_name).toLowerCase().includes(filter.toLowerCase()))) byCompany.set(id, c.company_name) }
const companies = Array.from(byCompany.entries()).slice(0, MAX)
console.log(`companies: ${companies.length}${filter ? ` (filter "${filter}")` : ''}; window since ${since.slice(0, 10)}\n`)

const totals = { messages: 0, clientMessages: 0, sheetHits: 0, bodyHits: 0, movements: 0, notePdfs: 0, notesRead: 0, notesWithAmount: 0 }
for (const [companyId, name] of companies) {
  const threads = await sbTry<Row[]>(`email_threads?company_id=eq.${enc(companyId)}&deleted_at=is.null&select=id&limit=400`, [])
  const tids = threads.map(t => t.id)
  const msgs: Row[] = []
  for (let i = 0; i < tids.length; i += 40) msgs.push(...await sbTry<Row[]>(`email_messages?thread_id=in.(${tids.slice(i, i + 40).join(',')})&direction=eq.inbound&sent_at=gte.${enc(since)}&deleted_at=is.null&select=id,subject,from_address,sent_at,body_text,has_attachments&order=sent_at.asc&limit=400`, []))
  const atts: Row[] = []
  const mids = msgs.map(m => m.id)
  for (let i = 0; i < mids.length; i += 40) atts.push(...await sbTry<Row[]>(`email_attachments?message_id=in.(${mids.slice(i, i + 40).join(',')})&select=id,message_id,filename,mime_type,parsed_text`, []))
  const attsBy = new Map<string, Row[]>()
  for (const a of atts) attsBy.set(a.message_id, [...(attsBy.get(a.message_id) ?? []), a])
  console.log(`## ${name} — ${msgs.length} inbound messages, ${atts.length} attachments`)
  for (const m of msgs) {
    totals.messages++
    const from = bareEmail(m.from_address)
    const dom = from.split('@')[1] ?? ''
    const fromInsurer = Array.from(insurers).some(d => dom === d || dom.endsWith(`.${d}`))
    const mine = attsBy.get(m.id) ?? []
    if (fromInsurer) {
      for (const a of mine) {
        if (!/\.pdf$/i.test(a.filename) || !a.parsed_text) continue
        totals.notePdfs++
        const r = readNoteText(a.parsed_text, `attachment: ${a.filename}`)
        if (!r) continue
        totals.notesRead++
        if (r.amount != null) totals.notesWithAmount++
        console.log(`  NOTE ${m.sent_at?.slice(0, 10)} ${a.filename.slice(0, 60)} → ${r.kind} ${r.event} ${r.note_no ?? '(no no.)'} ${r.amount ?? '(no amount)'} ${r.member_names.join('/') || ''}${r.needs_review ? ' [review]' : ''}`)
      }
      continue
    }
    if (isInternal(from)) continue
    totals.clientMessages++
    const found: string[] = []
    for (const a of mine) {
      if (!isSpreadsheet(a.filename, a.mime_type)) continue
      const bytes = await attachmentRefBytes(gmailRef(a.id)).catch(() => null)
      if (!bytes) continue
      for (const s of sheetRows(bytes, a.filename)) {
        const ms = parseMovementRows(s.rows, a.filename)
        if (ms.length) { totals.sheetHits++; totals.movements += ms.length; found.push(`sheet ${a.filename.slice(0, 50)}: ${ms.map(x => `${x.kind} ${x.name}${x.effective_on ? ` ${x.effective_on}` : ''}`).join('; ')}`) }
      }
    }
    const text = latestText(m.body_text, 6000)
    const ms = parseMovementBody(text, m.sent_at?.slice(0, 10))
    if (ms.length) { totals.bodyHits++; totals.movements += ms.length; found.push(`body: ${ms.map(x => `${x.kind} ${x.name}${x.last_day ? ` last ${x.last_day}` : x.effective_on ? ` ${x.effective_on}` : ''}`).join('; ')}`) }
    if (found.length) console.log(`  MOVE ${m.sent_at?.slice(0, 10)} "${String(m.subject ?? '').slice(0, 50)}"\n    ${found.join('\n    ')}`)
  }
}
console.log('\nsummary', JSON.stringify(totals))
