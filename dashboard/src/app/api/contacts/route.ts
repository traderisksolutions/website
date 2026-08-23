import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { resolveCompany }            from '@/lib/debit-note-commit'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

const SELECT = 'id,first_name,last_name,email,phone,company,source,engagement_stage,created_at'

function shape(c: Record<string, unknown>) {
  return {
    id:         c.id,
    first_name: c.first_name ?? null,
    last_name:  c.last_name ?? null,
    email:      c.email ?? null,
    phone:      c.phone ?? null,
    company:    c.company ?? null,
    source:     c.source ?? 'manual',
    status:     (c.engagement_stage as string) || 'new',
    created_at: c.created_at,
  }
}

// GET /api/contacts?q=term
//   with q   → search the whole contacts table (name / email / company) — used by
//              the insurer-directory person picker (returns real contacts.id).
//   without  → manually-added contacts (source='manual'), so they surface on the
//              Active Contacts page (leads / conversations / CC cover the rest).
export async function GET(req: NextRequest) {
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const q = new URL(req.url).searchParams.get('q')?.trim()
    let url: string
    if (q) {
      const like = `*${q.replace(/[(),*]/g, ' ').trim()}*`
      const or   = ['first_name', 'last_name', 'email', 'company'].map(f => `${f}.ilike.${like}`).join(',')
      url = `${SB_URL}/rest/v1/contacts?or=(${encodeURIComponent(or)})&select=${SELECT}&order=created_at.desc&limit=50`
    } else {
      url = `${SB_URL}/rest/v1/contacts?source=eq.manual&select=${SELECT}&order=created_at.desc&limit=200`
    }
    const res  = await fetch(url, { headers: sbHeaders(), cache: 'no-store' })
    const rows = res.ok ? await res.json() : []
    return NextResponse.json((Array.isArray(rows) ? rows : []).map(shape))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/contacts → { first_name?, last_name?, email?, phone?, company?, isReferral?, notes? }
// Manually add a person to Active Contacts. All fields optional, but the contacts
// table requires at least one of email / phone. Idempotent on email.
//
// isReferral: true also logs an inbound_leads row (source='referral') so the referral gets a
// real, trackable lead record — status lifecycle, shows up in Pipeline — instead of just a bare
// contacts row with no lead history (Sales Loop v2, Phase 4 / F1).
export async function POST(req: NextRequest) {
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json() as {
      first_name?: string; last_name?: string; email?: string; phone?: string; company?: string
      isReferral?: boolean; notes?: string
    }
    const email = body.email?.trim().toLowerCase() || null
    const phone = body.phone?.trim() || null
    if (email && !email.includes('@')) return NextResponse.json({ error: 'invalid email' }, { status: 400 })
    if (!email && !phone)              return NextResponse.json({ error: 'email or phone required' }, { status: 400 })

    const first_name = body.first_name?.trim() || null
    const last_name  = body.last_name?.trim()  || null
    const company    = body.company?.trim()    || null

    // Resolve/create the real companies row now, at intake, rather than waiting until a Debit
    // Note is raised — see debit-note-commit.ts's resolveCompany, reused verbatim (Sales Loop
    // v2, Phase 5 / F3). Omitted entirely (not set to null) when there's nothing to resolve, so
    // a merge-duplicates upsert never clobbers an already-linked company on an existing contact.
    const companyId = company ? await resolveCompany({ companyName: company }).catch(() => null) : null

    const record: Record<string, unknown> = { first_name, last_name, email, phone, company, source: 'manual' }
    if (companyId) record.company_id = companyId

    // Idempotent on email so we never create a duplicate person.
    const res = await fetch(`${SB_URL}/rest/v1/contacts${email ? '?on_conflict=email' : ''}`, {
      method:  'POST',
      headers: sbHeaders(email ? 'return=representation,resolution=merge-duplicates' : 'return=representation'),
      body:    JSON.stringify(record),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    const rows = await res.json()
    const row  = Array.isArray(rows) ? rows[0] : rows
    void logActivity({ action: 'contact.created', resource_type: 'contact', resource_id: row?.id, new_value: { email, source: 'manual' } })

    if (body.isReferral) {
      void fetch(`${SB_URL}/rest/v1/inbound_leads`, {
        method:  'POST',
        headers: sbHeaders('return=minimal'),
        body:    JSON.stringify({
          contact_id: row?.id ?? null, company_id: companyId, source: 'referral', status: 'new',
          first_name, last_name, email, phone, company,
          details: body.notes?.trim() || null,
        }),
      }).catch(() => {})
      void logActivity({ action: 'lead.referral_logged', resource_type: 'contact', resource_id: row?.id, new_value: { email, company } })
    }

    return NextResponse.json(shape(row))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
