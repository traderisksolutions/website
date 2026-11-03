/**
 * GET   /api/forms                    → { forms } every client form, active or not
 * GET   /api/forms?search=<filename>  → { found } attachments TRS staff have sent, to add as a form
 * POST  /api/forms { attachment_id, line, kind, title, flow? }  adds a form (admin)
 * PATCH /api/forms { id, active?, line?, flow?, kind?, title? }  edits a form (admin)
 *
 * The library the data requests attach by rule (src/lib/forms/library.ts).
 */
import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { sb, sbTry, enc } from '@/lib/crm/db'
import { createClient } from '@/lib/supabase/server'
import { clearFormsCache } from '@/lib/forms/library'
import { isValidProductLine } from '@/lib/product-lines'

export const dynamic = 'force-dynamic'
const KINDS = ['proposal_form', 'template', 'brochure', 'product_summary', 'claim_form', 'letter']
const FLOWS = ['contract', 'products', 'event', 'sme', 'lawyers', 'technology']
const MISSING = /does not exist|42P01|PGRST205/

async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) return false
  const [row] = await sbTry<{ is_admin: boolean | null }[]>(`employee_profiles?user_id=eq.${enc(user.id)}&select=is_admin&limit=1`, [])
  return !!row?.is_admin
}

export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const q = (req.nextUrl.searchParams.get('search') ?? '').trim()
  try {
    if (q) {
      if (q.length < 3) return json({ found: [] })
      const atts = await sb<{ id: string; message_id: string; filename: string; mime_type: string | null; storage_url: string | null; created_at: string }[]>(`email_attachments?filename=ilike.*${enc(q)}*&select=id,message_id,filename,mime_type,storage_url,created_at&order=created_at.desc&limit=60`)
      const msgs = atts.length ? await sb<{ id: string; from_address: string | null; subject: string | null; sent_at: string | null }[]>(`email_messages?id=in.(${atts.map(a => a.message_id).join(',')})&select=id,from_address,subject,sent_at`) : []
      const by = new Map(msgs.map(m => [m.id, m]))
      const found = atts.filter(a => /trade-risksol\.com/i.test(by.get(a.message_id)?.from_address ?? '')).slice(0, 20)
        .map(a => ({ id: a.id, filename: a.filename, sent_at: by.get(a.message_id)?.sent_at ?? a.created_at, subject: by.get(a.message_id)?.subject ?? null, stored: !!a.storage_url }))
      return json({ found })
    }
    return json({ forms: await sb('client_forms?select=*&order=line.asc,active.desc,sent_count.desc&limit=1000') })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return MISSING.test(msg) ? json({ forms: [], migrationPending: true }) : json({ error: msg }, 500)
  }
}

export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  if (!(await isAdmin())) return json({ error: 'Only an administrator can add client forms.' }, 403)
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const line = String(b.line ?? ''), kind = String(b.kind ?? 'proposal_form'), title = String(b.title ?? '').trim(), flow = b.flow ? String(b.flow) : null
  if (!isValidProductLine(line)) return json({ error: 'Choose a product line' }, 400)
  if (!KINDS.includes(kind)) return json({ error: 'Unknown kind' }, 400)
  if (flow && !FLOWS.includes(flow)) return json({ error: 'Unknown flow' }, 400)
  const [a] = await sbTry<{ id: string; filename: string; mime_type: string | null; storage_url: string | null }[]>(`email_attachments?id=eq.${enc(String(b.attachment_id ?? ''))}&select=id,filename,mime_type,storage_url&limit=1`, [])
  if (!a) return json({ error: 'Attachment not found' }, 404)
  const [row] = await sb<unknown[]>('client_forms', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    line, flow, kind, title: title || a.filename, filename: a.filename, mime_type: a.mime_type, file_ref: a.storage_url || `gmail:${a.id}`,
    attach_on: kind === 'brochure' || kind === 'claim_form' || kind === 'letter' ? ['new_request'] : ['new_request', 'renewal'], created_by: who.email,
  }) })
  clearFormsCache()
  return json({ form: row })
}

export async function PATCH(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  if (!(await isAdmin())) return json({ error: 'Only an administrator can change client forms.' }, 403)
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = String(b.id ?? '')
  const set: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof b.active === 'boolean') set.active = b.active
  if (typeof b.line === 'string') { if (!isValidProductLine(b.line)) return json({ error: 'Choose a product line' }, 400); set.line = b.line }
  if (b.flow === null || typeof b.flow === 'string') { if (b.flow && !FLOWS.includes(b.flow as string)) return json({ error: 'Unknown flow' }, 400); set.flow = b.flow || null }
  if (typeof b.kind === 'string') { if (!KINDS.includes(b.kind)) return json({ error: 'Unknown kind' }, 400); set.kind = b.kind }
  if (typeof b.title === 'string' && b.title.trim()) set.title = b.title.trim()
  await sb(`client_forms?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(set) })
  clearFormsCache()
  return json({ ok: true })
}
