import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function key() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return k
}

function headers() {
  return {
    apikey:        key(),
    Authorization: `Bearer ${key()}`,
    'Content-Type': 'application/json',
    Prefer:        'return=minimal',
  }
}

// GET /api/leads — fetch all leads ordered by created_at desc
export async function GET() {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/inbound_leads?select=*&order=created_at.desc&limit=200`,
      { headers: headers(), cache: 'no-store' }
    )
    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json({ error: body }, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Maps inbound_leads.status to contacts.engagement_stage
const STAGE_MAP: Record<string, string> = {
  contacted: 'engaged',
  engaged:   'engaged',
  qualified: 'qualified',
  proposal:  'proposal',
  converted: 'converted',
}

const STAGE_ORDER = ['engaged', 'qualified', 'proposal', 'converted']

// PATCH /api/leads — update status and/or notes for one lead
export async function PATCH(req: NextRequest) {
  try {
    const { id, status, notes } = await req.json() as { id?: string; status?: string; notes?: string }
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const patch: Record<string, unknown> = {}
    if (status !== undefined) patch.status = status
    if (notes  !== undefined) patch.notes  = notes
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

    const res = await fetch(
      `${SB_URL}/rest/v1/inbound_leads?id=eq.${id}`,
      { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) }
    )
    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json({ error: body }, { status: res.status })
    }

    // Sync pipeline stage to contacts table when status changes to a pipeline stage
    if (status !== undefined && STAGE_MAP[status]) {
      try {
        const newStage = STAGE_MAP[status]

        // Fetch the lead to get email + existing contact_id
        const leadRes = await fetch(
          `${SB_URL}/rest/v1/inbound_leads?id=eq.${id}&select=email,first_name,last_name,company,contact_id&limit=1`,
          { headers: headers() }
        )
        const leadRows = leadRes.ok ? await leadRes.json() : []
        const lead     = Array.isArray(leadRows) ? leadRows[0] : null

        if (lead?.email) {
          const encoded  = encodeURIComponent(lead.email)
          const exRes    = await fetch(
            `${SB_URL}/rest/v1/contacts?email=eq.${encoded}&select=id,engagement_stage&limit=1`,
            { headers: headers() }
          )
          const exRows   = exRes.ok ? await exRes.json() : []
          const existing = Array.isArray(exRows) ? exRows[0] : null

          if (existing) {
            // Only advance the stage — never downgrade
            const currentIdx = STAGE_ORDER.indexOf(existing.engagement_stage ?? '')
            const newIdx     = STAGE_ORDER.indexOf(newStage)
            if (newIdx > currentIdx) {
              await fetch(`${SB_URL}/rest/v1/contacts?id=eq.${existing.id}`, {
                method:  'PATCH',
                headers: headers(),
                body:    JSON.stringify({ engagement_stage: newStage }),
              })
            }
          } else {
            // No contact yet — create one linked to this lead
            const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null
            await fetch(`${SB_URL}/rest/v1/contacts`, {
              method:  'POST',
              headers: { ...headers(), Prefer: 'return=minimal' },
              body:    JSON.stringify({
                email:            lead.email,
                full_name:        fullName,
                company:          lead.company ?? null,
                source:           'website',
                engagement_stage: newStage,
                inbound_lead_id:  id,
              }),
            })
          }
        }
      } catch { /* non-fatal — status update already succeeded */ }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
