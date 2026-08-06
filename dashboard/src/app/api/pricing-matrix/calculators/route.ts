/**
 * GET  /api/pricing-matrix/calculators          → list calculators (newest first)
 * POST /api/pricing-matrix/calculators           → create a draft calculator from an uploaded
 *   xlsx (and optional brochure pdf) already in storage.
 *   body: { xlsx_path, xlsx_filename, brochure_path?, brochure_filename?, insurer_id?,
 *           insurer_name?, label?, effective_date? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { SB_URL, sbH }               from '@/lib/pm-storage'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const url = `${SB_URL}/rest/v1/pm_calculators?select=id,insurer_id,insurer_name,label,xlsx_filename,brochure_filename,effective_date,version,status,created_at,approved_at,updated_at,change_summary&order=created_at.desc&limit=200`
    const res = await fetch(url, { headers: sbH(), cache: 'no-store' })
    return NextResponse.json(res.ok ? await res.json() : [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const b = await req.json() as {
      xlsx_path?: string; xlsx_filename?: string; brochure_path?: string; brochure_filename?: string
      insurer_id?: string; insurer_name?: string; label?: string; effective_date?: string
    }
    if (!b.xlsx_path) return NextResponse.json({ error: 'xlsx_path required (upload the calculator .xlsx first)' }, { status: 400 })

    const row = {
      insurer_id:        b.insurer_id ?? null,
      insurer_name:      b.insurer_name ?? null,
      label:             b.label ?? null,
      xlsx_path:         b.xlsx_path,
      xlsx_filename:     b.xlsx_filename ?? 'calculator.xlsx',
      brochure_path:     b.brochure_path ?? null,
      brochure_filename: b.brochure_filename ?? null,
      effective_date:    b.effective_date || null,
      status:            'draft',
      uploaded_by:       user.id,
    }
    const ins = await fetch(`${SB_URL}/rest/v1/pm_calculators`, { method: 'POST', headers: sbH('return=representation'), body: JSON.stringify(row) })
    if (!ins.ok) return NextResponse.json({ error: await ins.text() }, { status: 500 })
    const created = (await ins.json())[0]

    void logActivity({ action: 'pm.calculator_uploaded', resource_type: 'pm_calculator', resource_id: created?.id, new_value: { xlsx: b.xlsx_filename, brochure: b.brochure_filename ?? null } })
    return NextResponse.json({ id: created?.id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
