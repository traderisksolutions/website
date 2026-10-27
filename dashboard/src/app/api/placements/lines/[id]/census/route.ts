/**
 * POST /api/placements/lines/[id]/census  multipart `file` (.xlsx or .csv) → { census: Member[], issues }
 * Reads an employee list the broker uploads for this line. Nothing is written; the caller then
 * posts the census to /price.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { readSpreadsheet } from '@/lib/hr/spreadsheet'
import { toCensus } from '@/lib/hr/types'
import { loadLine } from '@/lib/placement/eb'
import { errorResponse, fail, gate, isUuid } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Line id is not valid')
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return fail('Attach an Excel (.xlsx) or CSV file')
  if (file.size > MAX_BYTES) return fail('The file is over 10 MB')
  if (!/\.(xlsx|xlsm|xls|csv|tsv|txt)$/i.test(file.name)) return fail('The file must be .xlsx or .csv')
  try {
    if (!(await loadLine(id))) return fail('Line not found', 404)
    const read = readSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name)
    if (read.employees.length === 0 && read.skipped.length === 0) return fail('No rows with a name were found in the file', 422)
    if (read.employees.length > 2000) return fail('Over 2,000 people; split the file')
    const issues = [
      ...read.skipped.map(s => `${s.key}: ${s.reason}`),
      ...read.employees.flatMap(e => e.issues.map(i => `${e.name}: ${i}`)),
      ...read.dependants.flatMap(d => d.issues.map(i => `${d.name}: ${i}`)),
    ]
    return NextResponse.json({ census: toCensus(read), issues, counts: { employees: read.employees.length, dependants: read.dependants.length, skipped: read.skipped.length }, filename: file.name })
  } catch (e) {
    return errorResponse(e)
  }
}
