/**
 * GET  /api/claims/second-opinion — corpcover claim second-opinion requests, newest first.
 * POST /api/claims/second-opinion — multipart { intakeId, files[] }: read the documents, rule on
 *      each reason the insurer gave, save the report on the intake. Staff only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { analyseClaim, type UploadedFile } from '@/lib/claim-review/analyse'
import { getClaimIntake, intakeContext, listClaimIntakes, saveReport } from '@/lib/claim-review/store'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_FILES = 8, MAX_BYTES = 4.4 * 1024 * 1024 // Vercel caps a function request body at 4.5 MB
const TYPES = /^(application\/pdf|image\/(png|jpeg|webp|gif)|text\/plain)$/

export async function GET(req: NextRequest) {
  const deny = await requireStaffOrCron(req)
  if (deny) return deny
  try { return NextResponse.json({ intakes: await listClaimIntakes() }) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const deny = await requireStaffOrCron(req)
  if (deny) return deny
  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Send the files as multipart form data.' }, { status: 400 }) }
  const row = await getClaimIntake(String(form.get('intakeId') ?? ''))
  if (!row) return NextResponse.json({ error: 'Claim request not found.' }, { status: 404 })

  const files: UploadedFile[] = []
  let total = 0
  for (const v of form.getAll('files')) {
    if (!(v instanceof File)) continue
    if (!TYPES.test(v.type)) return NextResponse.json({ error: `${v.name}: send PDF, PNG, JPG or text.` }, { status: 400 })
    const data = Buffer.from(await v.arrayBuffer())
    total += data.length
    files.push({ name: v.name.slice(0, 120), type: v.type, data })
  }
  if (!files.length) return NextResponse.json({ error: 'Add the policy and the insurer\'s letter.' }, { status: 400 })
  if (files.length > MAX_FILES || total > MAX_BYTES) return NextResponse.json({ error: `Up to ${MAX_FILES} files and 4.4 MB in total. Compress large scans first.` }, { status: 413 })

  try {
    const report = await analyseClaim(files, intakeContext(row))
    await saveReport(row, report)
    return NextResponse.json({ report })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'The review failed.' }, { status: 502 })
  }
}
