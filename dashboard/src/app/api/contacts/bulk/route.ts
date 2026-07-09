/**
 * POST /api/contacts/bulk
 *   { mode: 'preview', rows }  → classify each row: new | duplicate | invalid (+ the
 *                                existing contact when matched by email OR phone).
 *   { mode: 'commit',  rows }  → apply per-row actions: insert | update | skip.
 *
 * Backs the bulk CSV importer on the Active Contacts page.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type Fields = { first_name?: string; last_name?: string; email?: string; phone?: string; company?: string }
type Existing = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; company: string | null }

const cleanEmail = (e?: string) => e?.trim().toLowerCase() || ''
const cleanPhone = (p?: string) => (p ?? '').replace(/\D/g, '')
const clean = (s?: string) => s?.trim() || null

async function loadExisting(emails: string[], phones: string[]): Promise<{ byEmail: Map<string, Existing>; byPhone: Map<string, Existing> }> {
  const byEmail = new Map<string, Existing>()
  const byPhone = new Map<string, Existing>()
  const select = 'id,first_name,last_name,email,phone,company'

  if (emails.length) {
    const list = emails.map(e => `"${e}"`).join(',')
    const r = await fetch(`${SB_URL}/rest/v1/contacts?email=in.(${list})&select=${select}`, { headers: sbH(), cache: 'no-store' })
    for (const c of (r.ok ? await r.json() : []) as Existing[]) if (c.email) byEmail.set(c.email.toLowerCase(), c)
  }
  if (phones.length) {
    // Phones can be formatted; fetch non-null and match on digits.
    const r = await fetch(`${SB_URL}/rest/v1/contacts?phone=not.is.null&select=${select}&limit=5000`, { headers: sbH(), cache: 'no-store' })
    for (const c of (r.ok ? await r.json() : []) as Existing[]) { const d = cleanPhone(c.phone ?? ''); if (d) byPhone.set(d, c) }
  }
  return { byEmail, byPhone }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { mode, rows } = await req.json() as { mode: 'preview' | 'commit'; rows: (Fields & { action?: string; existing_id?: string })[] }
    if (!Array.isArray(rows)) return NextResponse.json({ error: 'rows required' }, { status: 400 })

    // ── Preview: classify each row ──────────────────────────────────────────────
    if (mode === 'preview') {
      const emails = Array.from(new Set(rows.map(r => cleanEmail(r.email)).filter(Boolean)))
      const phones = Array.from(new Set(rows.map(r => cleanPhone(r.phone)).filter(Boolean)))
      const { byEmail, byPhone } = await loadExisting(emails, phones)

      const out = rows.map((r, index) => {
        const email = cleanEmail(r.email)
        const phone = cleanPhone(r.phone)
        if (!email && !phone) return { index, status: 'invalid' as const, existing: null }
        const existing = (email && byEmail.get(email)) || (phone && byPhone.get(phone)) || null
        return { index, status: existing ? ('duplicate' as const) : ('new' as const), existing }
      })
      return NextResponse.json({ rows: out })
    }

    // ── Commit: apply actions ───────────────────────────────────────────────────
    let inserted = 0, updated = 0, skipped = 0, failed = 0
    for (const r of rows) {
      const action = r.action ?? 'insert'
      if (action === 'skip') { skipped++; continue }

      const email = cleanEmail(r.email)
      const phone = clean(r.phone)
      const body = { first_name: clean(r.first_name), last_name: clean(r.last_name), email: email || null, phone: phone || null, company: clean(r.company) }

      try {
        if (action === 'update' && r.existing_id) {
          // Overwrite provided (non-empty) fields on the matched contact.
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
          for (const [k, v] of Object.entries(body)) if (v) patch[k] = v
          const res = await fetch(`${SB_URL}/rest/v1/contacts?id=eq.${r.existing_id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify(patch) })
          res.ok ? updated++ : failed++
        } else {
          if (!body.email && !body.phone) { failed++; continue }
          const res = await fetch(`${SB_URL}/rest/v1/contacts${body.email ? '?on_conflict=email' : ''}`, {
            method: 'POST', headers: sbH(body.email ? 'return=minimal,resolution=merge-duplicates' : 'return=minimal'),
            body: JSON.stringify({ ...body, source: 'manual' }),
          })
          res.ok ? inserted++ : failed++
        }
      } catch { failed++ }
    }

    void logActivity({ action: 'contacts.bulk_import', resource_type: 'contact', new_value: { inserted, updated, skipped, failed } })
    return NextResponse.json({ inserted, updated, skipped, failed })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
