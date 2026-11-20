/**
 * The reads and writes behind an Employment Benefits proposal (eb-proposal.ts). Server only; no
 * model is called.
 *
 *   saveQuotation(s, meta, actor)   keeps a quotation from /eb, with the benefit rows of its plans
 *   loadQuotation(id) / listForCompany(companyId) / listAll()
 *   keepProposalPdf(q, actor)       renders the PDF and keeps it in the Shared Drive
 *   ensureDraft(q, actor)           the email draft on the client thread, the PDF attached
 *   markSent(q, actor, to)          the proposal went: the row, the Working on line and the log
 */
import { enc, sb, sbTry } from '@/lib/crm/db'
import { storeUpload } from '@/lib/storage/drive-upload'
import { clientOnThread } from './client-draft'
import { loadWorkbook } from './workbook'
import { COVER_KEYS, COVER_NAME, proposalEmail, proposalFilename, proposalModel, type BenefitRow, type Snapshot } from './eb-proposal'
import { renderProposalPdf } from './eb-proposal-pdf'
import * as placement from '@/lib/placement/store'
import { logActivity } from '@/lib/log-activity'

type Row = Record<string, any>
export type EbQuotationRow = {
  id: string; company_id: string | null; company_name: string; thread_id: string | null; effective_date: string | null; basis: string | null
  products: string[]; snapshot: Snapshot; version: number; proposal_ref: string | null; proposal_name: string | null; draft_id: string | null
  sent_at: string | null; sent_by: string | null; sent_to: string | null; created_by: string | null; created_at: string; updated_at: string | null
}
const COLS = 'id,company_id,company_name,thread_id,effective_date,basis,products,snapshot,version,proposal_ref,proposal_name,draft_id,sent_at,sent_by,sent_to,created_by,created_at,updated_at'
const EB_LINES = ['employee_benefits', 'group_health']

/** Benefit rows of the chosen plans, per category, from the house workbook. */
export async function benefitRows(s: Snapshot): Promise<Record<string, BenefitRow[]>> {
  const wb = await loadWorkbook()
  if (!wb) return {}
  const values: Record<string, Record<string, string>> = {}
  const labels: [string, string, string][] = []          // cover, id, label in workbook order
  const seen = new Set<string>()
  for (const b of wb.benefits) {
    (values[`${b.insurer}|${b.cover}|${b.plan}`] ??= {})[b.id] = b.value
    if (!seen.has(`${b.cover}|${b.id}`)) { seen.add(`${b.cover}|${b.id}`); labels.push([b.cover, b.id, b.label]) }
  }
  const out: Record<string, BenefitRow[]> = {}
  for (const c of s.categories) {
    const rows: BenefitRow[] = []
    for (const k of COVER_KEYS) {
      const cover = COVER_NAME[k]
      for (const [cv, id, label] of labels) {
        if (cv !== cover) continue
        const vals = s.products.map(p => { const plan = c.covers[k]?.[p]?.plan; return plan ? values[`${p}|${cover}|${plan}`]?.[id] ?? '—' : '—' })
        if (vals.some(v => v && v !== '—')) rows.push({ cover, label, values: vals.map(v => v || '—') })
      }
    }
    out[c.name] = rows
  }
  return out
}

export async function saveQuotation(s: Snapshot, meta: { company_id: string | null; thread_id: string | null }, actor: string): Promise<EbQuotationRow> {
  const benefits = await benefitRows(s).catch(() => ({}))
  const prior = await sbTry<Row[]>(meta.company_id ? `eb_quotations?company_id=eq.${enc(meta.company_id)}&select=id` : `eb_quotations?company_name=eq.${enc(s.company)}&select=id`, [])
  const [row] = await sb<EbQuotationRow[]>('eb_quotations', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    company_id: meta.company_id, company_name: s.company, thread_id: meta.thread_id, effective_date: s.effectiveDate, basis: s.basis,
    products: s.products, snapshot: { ...s, benefits }, version: prior.length + 1, created_by: actor,
  }) })
  void logActivity({ action: 'gb.eb_quotation_saved', resource_type: 'eb_quotation', resource_id: row.id, new_value: { company: s.company, products: s.products }, metadata: { by: actor } })
  return row
}

export async function loadQuotation(id: string): Promise<EbQuotationRow | null> {
  const [q] = await sbTry<EbQuotationRow[]>(`eb_quotations?id=eq.${enc(id)}&select=${COLS}&limit=1`, [])
  return q ?? null
}

export async function listForCompany(companyId: string): Promise<EbQuotationRow[]> {
  return sbTry<EbQuotationRow[]>(`eb_quotations?company_id=eq.${enc(companyId)}&select=${COLS}&order=created_at.desc&limit=20`, [])
}

/** One register row: the quotation without its snapshot. */
export type EbRegisterRow = Pick<EbQuotationRow, 'id' | 'company_id' | 'company_name' | 'effective_date' | 'basis' | 'products' | 'version' | 'sent_at' | 'sent_to' | 'created_at' | 'updated_at'>
const REGISTER_COLS = 'id,company_id,company_name,effective_date,basis,products,version,sent_at,sent_to,created_at,updated_at'

/** Every quotation, newest first, without the snapshots (the Quotation register). */
export async function listAll(limit = 500): Promise<EbRegisterRow[]> {
  return sb<EbRegisterRow[]>(`eb_quotations?select=${REGISTER_COLS}&order=created_at.desc&limit=${Math.min(Math.max(1, limit), 500)}`)
}

const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
const shortToday = () => new Date(`${today()}T00:00:00Z`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export async function proposalPdf(q: EbQuotationRow, preparedBy: string | null): Promise<Buffer> {
  return renderProposalPdf(proposalModel(q.snapshot), { version: q.version, prepared: shortToday(), preparedBy })
}

/** Renders the PDF as it stands and keeps it in the Shared Drive; the row remembers the copy. */
export async function keepProposalPdf(q: EbQuotationRow, preparedBy: string | null): Promise<{ ref: string; filename: string }> {
  const filename = proposalFilename(q.company_name, q.version)
  const ref = await storeUpload('group-benefits/proposals', filename, 'application/pdf', await proposalPdf(q, preparedBy))
  await sb(`eb_quotations?id=eq.${enc(q.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ proposal_ref: ref, proposal_name: filename, updated_at: new Date().toISOString() }) })
  return { ref, filename }
}

export type ProposalDraft = { draftId: string; to: string; cc: string[]; subject: string; html: string; attachment: { filename: string; mime_type: string; storage_url: string }; threadId: string | null }

/** The contact for an address: the one on file (any case), else a new row. */
async function contactFor(email: string, name: string | null, company: string): Promise<string | null> {
  const [c] = await sbTry<Row[]>(`contacts?email=ilike.${enc(email)}&select=id&limit=1`, [])
  if (c) return c.id as string
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  const [made] = await sbTry<Row[]>('contacts', [], { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    email, source: 'email', company, ...(parts.length ? { first_name: parts[0], last_name: parts.slice(1).join(' ') || parts[0] } : {}),
  }) })
  return (made?.id as string | undefined) ?? null
}

/** The pending draft for this proposal, made once: on the client thread when there is one, to `to` otherwise. */
export async function ensureDraft(q: EbQuotationRow, actor: { email: string; name: string | null }, to?: string | null): Promise<ProposalDraft | { error: string; status: number }> {
  if (q.draft_id) {
    const [d] = await sbTry<Row[]>(`ai_drafts?id=eq.${enc(q.draft_id)}&select=id,status,to_email,cc,subject,body,context_used,attachments,thread_id&limit=1`, [])
    if (d && d.status !== 'sent' && d.attachments?.[0]) {
      return { draftId: d.id, to: d.to_email ?? '', cc: d.cc ? String(d.cc).split(/,\s*/).filter(Boolean) : [], subject: d.subject ?? '', html: d.context_used?.body_html ?? d.body ?? '', attachment: d.attachments[0], threadId: d.thread_id ?? null }
    }
  }
  const client = q.thread_id ? await clientOnThread(q.thread_id) : null
  const email = (client?.email ?? to ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) return { error: 'No client on this quotation’s thread. Enter the client’s email address.', status: 409 }
  // The contact first: a draft needs one, and the PDF is kept only once the draft can be made.
  const contactId = await contactFor(email, client?.name ?? null, q.company_name)
  if (!contactId) return { error: 'The client contact could not be found or made.', status: 500 }
  const { ref, filename } = await keepProposalPdf(q, actor.name)
  const m = proposalModel(q.snapshot)
  const first = client?.name ? client.name.split(/\s+/)[0] : null
  const e = proposalEmail(m, first, actor.name)
  const attachment = { filename, mime_type: 'application/pdf', storage_url: ref }
  const cc = client?.cc ?? []
  const [d] = await sb<Row[]>('ai_drafts', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    contact_id: contactId, thread_id: q.thread_id, channel: 'email', status: 'pending', generated_by: 'manual',
    body: e.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), subject: e.subject, to_email: email, cc: cc.length ? cc.join(', ') : null,
    attachments: [attachment], email_type: 'gb_proposal', context_used: { agent: 'group_benefit', kind: 'eb_proposal', quotation_id: q.id, thread_id: q.thread_id, body_html: e.html },
  }) })
  await sb(`eb_quotations?id=eq.${enc(q.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ draft_id: d.id, updated_at: new Date().toISOString() }) })
  return { draftId: d.id, to: email, cc, subject: e.subject, html: e.html, attachment, threadId: q.thread_id }
}

/** Keeps what the person typed on the draft, so Save draft and a reload show the same email. */
export async function saveDraft(q: EbQuotationRow, f: { to: string; cc: string[]; subject: string; html: string }): Promise<void> {
  if (!q.draft_id) return
  const [d] = await sbTry<Row[]>(`ai_drafts?id=eq.${enc(q.draft_id)}&select=context_used,status&limit=1`, [])
  if (!d || d.status === 'sent') return
  await sb(`ai_drafts?id=eq.${enc(q.draft_id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
    to_email: f.to, cc: f.cc.length ? f.cc.join(', ') : null, subject: f.subject,
    body: f.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), context_used: { ...(d.context_used ?? {}), body_html: f.html },
  }) })
}

/** The proposal went: the row, the client side of the Employment Benefits line on Working on, and the log. */
export async function markSent(q: EbQuotationRow, actor: string, to: string): Promise<void> {
  const at = new Date().toISOString()
  await sb(`eb_quotations?id=eq.${enc(q.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ sent_at: at, sent_by: actor, sent_to: to, updated_at: at }) })
  if (!q.company_id) return
  const placements = await sbTry<Row[]>(`placements?company_id=eq.${enc(q.company_id)}&select=id`, [])
  if (!placements.length) return
  const lines = await sbTry<Row[]>(`placement_lines?placement_id=in.(${placements.map(p => p.id).join(',')})&product_line=in.(${EB_LINES.join(',')})&status=neq.dropped&select=id,placement_id,label,product_line&order=created_at.desc&limit=1`, [])
  const line = lines[0]
  if (!line) return
  await placement.patch('placement_lines', `id=eq.${line.id}`, { client_stage: 'quote_sent' })
  await placement.log({ company_id: q.company_id, placement_id: line.placement_id, line_id: line.id, kind: 'note', actor, text: `${line.label ?? 'Employee Benefits'}: proposal V${q.version} sent to ${to}`, detail: { eb_quotation_id: q.id } })
}
