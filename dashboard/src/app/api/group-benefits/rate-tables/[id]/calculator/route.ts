/**
 * Insurer Excel calculator → RULES for a rate table (1:1).
 *
 * POST  /api/group-benefits/rate-tables/[id]/calculator   { storage_path, filename }
 *   Signs a read URL for the uploaded xlsx, calls the Python analyzer (/api/analyze_xlsx),
 *   and stores the detected rules + audit log on the rate table (status → in_review).
 * PATCH /api/group-benefits/rate-tables/[id]/calculator   { rules, approved }
 *   Saves the reviewed rules; approved=true flips rules_status → approved.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'

export const maxDuration = 120

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const BUCKET = 'group-benefits'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}
async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
const patchTable = (id: string, body: Record<string, unknown>) =>
  fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify(body) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { storage_path, filename } = await req.json() as { storage_path?: string; filename?: string }
    if (!storage_path) return NextResponse.json({ error: 'storage_path required' }, { status: 400 })

    // Load the table (for insurer name context).
    const table = await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}&select=insurer_name&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null)

    await patchTable(id, { calculator_path: storage_path, calculator_filename: filename ?? null, rules_status: 'analyzing', rules_updated_at: new Date().toISOString() })

    // Sign a short-lived read URL and hand it to the Python analyzer (fetches + parses it).
    const signRes = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${storage_path}`, {
      method: 'POST', headers: sbH(), body: JSON.stringify({ expiresIn: 300 }),
    })
    if (!signRes.ok) {
      await patchTable(id, { rules_status: 'error', rules_log: { error: `sign failed: ${(await signRes.text()).slice(0, 200)}` } })
      return NextResponse.json({ error: 'Could not sign the uploaded file' }, { status: 502 })
    }
    const signed = (await signRes.json() as { signedURL?: string }).signedURL
    const xlsx_url = `${SB_URL}/storage/v1${signed}`

    // Same-deployment Python serverless function.
    const origin = new URL(req.url).origin
    const pyRes = await fetch(`${origin}/api/analyze_xlsx`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xlsx_url, insurer_name: table?.insurer_name ?? null }),
    })
    const analysis = await pyRes.json().catch(() => ({ error: 'analyzer returned non-JSON' }))
    if (!pyRes.ok || analysis.error) {
      await patchTable(id, { rules_status: 'error', rules_log: { error: analysis.error ?? `analyzer ${pyRes.status}` } })
      return NextResponse.json({ error: `Analysis failed: ${analysis.error ?? pyRes.status}` }, { status: 502 })
    }

    await patchTable(id, {
      rules: analysis.rules ?? {},
      rules_log: { structural_map: analysis.structural_map ?? [], detection_log: analysis.detection_log ?? [], warnings: analysis.warnings ?? [] },
      rules_status: 'in_review', rules_updated_at: new Date().toISOString(),
    })
    void logActivity({ action: 'gb.calculator_analyzed', resource_type: 'gb_rate_table', resource_id: id, new_value: { rules: Object.keys(analysis.rules ?? {}).length } })
    return NextResponse.json({ ok: true, rules: analysis.rules, detection_log: analysis.detection_log, structural_map: analysis.structural_map, warnings: analysis.warnings })
  } catch (e) {
    await patchTable(id, { rules_status: 'error' }).catch(() => {})
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { rules, approved } = await req.json() as { rules?: Record<string, unknown>; approved?: boolean }
    const body: Record<string, unknown> = { rules_updated_at: new Date().toISOString() }
    if (rules && typeof rules === 'object') body.rules = rules
    if (typeof approved === 'boolean') body.rules_status = approved ? 'approved' : 'in_review'
    await patchTable(id, body)
    void logActivity({ action: approved ? 'gb.calculator_approved' : 'gb.calculator_saved', resource_type: 'gb_rate_table', resource_id: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
