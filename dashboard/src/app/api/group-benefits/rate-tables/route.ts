/**
 * GET  /api/group-benefits/rate-tables            → list rate tables (newest first)
 * POST /api/group-benefits/rate-tables            → record a rate PDF, create a draft table
 *   JSON { storage_path: 'drivefile:<id>', filename }  the browser already uploaded it to Drive
 *   multipart/form-data: file (pdf)                     small-file fallback, stored here
 * The PDF lives in Drive (group-benefits/rate-tables/<YYYY-MM>/); source_pdf_url holds its ref.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { isDriveRef }                from '@/lib/storage/attachment-bytes'
import { storeUpload }               from '@/lib/storage/drive-upload'

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://trs-api-335840130686.asia-southeast1.run.app'
const MAX     = 25 * 1024 * 1024

function sbH(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const url = `${SB_URL}/rest/v1/gb_rate_tables?select=id,insurer_id,insurer_name,product_code,product_name,plan_year,effective_date,status,version,source_pdf_name,created_at,approved_at,calculator_filename,rules_status,rules_updated_at,verification:rules->verification&order=created_at.desc&limit=200`
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

    let storageUrl: string
    let sourceName: string

    if ((req.headers.get('content-type') ?? '').includes('application/json')) {
      // The browser already uploaded the PDF straight to Drive (bypassing the ~4.5 MB
      // function body limit); we just record the reference.
      const { storage_path, filename } = await req.json() as { storage_path?: string; filename?: string }
      if (!isDriveRef(storage_path)) return NextResponse.json({ error: 'storage_path must be a drivefile: reference' }, { status: 400 })
      storageUrl = storage_path
      sourceName = filename || 'rates.pdf'
    } else {
      // Fallback: small file posted through the function.
      const form = await req.formData()
      const file = form.get('file') as File | null
      if (!file) return NextResponse.json({ error: 'No PDF provided' }, { status: 400 })
      if (file.type !== 'application/pdf') return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
      if (file.size > MAX) return NextResponse.json({ error: 'PDF too large (max 25 MB)' }, { status: 400 })
      storageUrl = await storeUpload('group-benefits/rate-tables', file.name, 'application/pdf', Buffer.from(await file.arrayBuffer()))
      sourceName = file.name
    }

    // Metadata (insurer/product/age basis/year/effective date) is read from the PDF by the
    // extractor and written back to the row; the reviewer can correct it.
    const row = {
      product_code:    '',
      age_basis:       'next_birthday',
      source_pdf_url:  storageUrl,
      source_pdf_name: sourceName,
      status:          'draft',
      uploaded_by:     user.id,
    }
    const ins = await fetch(`${SB_URL}/rest/v1/gb_rate_tables`, { method: 'POST', headers: sbH('return=representation'), body: JSON.stringify(row) })
    if (!ins.ok) return NextResponse.json({ error: await ins.text() }, { status: 500 })
    const created = (await ins.json())[0]

    void logActivity({ action: 'gb.rate_table_uploaded', resource_type: 'gb_rate_table', resource_id: created?.id, new_value: { file: sourceName } })
    return NextResponse.json({ id: created?.id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
