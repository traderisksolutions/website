/** POST /api/public/hr/[token]/upload  multipart `file` (.xlsx or .csv) → read, saved as the draft → { read } */
import { NextRequest } from 'next/server'
import { readSpreadsheet } from '@/lib/hr/spreadsheet'
import { recordEvent, saveDraft } from '@/lib/hr/links'
import { errorMessage, openLink, pjson } from '@/lib/hr/public'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const r = await openLink(params.token)
  if ('response' in r) return r.response
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return pjson({ error: 'Attach an Excel (.xlsx) or CSV file' }, 400)
  if (file.size > MAX_BYTES) return pjson({ error: 'The file is over 10 MB' }, 400)
  if (!/\.(xlsx|xlsm|xls|csv|tsv|txt)$/i.test(file.name)) return pjson({ error: 'The file must be .xlsx or .csv' }, 400)
  try {
    const read = readSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name)
    if (read.employees.length === 0 && read.skipped.length === 0) return pjson({ error: 'No rows with a name were found in the file' }, 422)
    if (read.employees.length > 2000) return pjson({ error: 'Over 2,000 people; split the file' }, 400)
    await saveDraft(r.link.id, read, r.link.company_id)
    await recordEvent(r.link.id, 'uploaded', { filename: file.name, employees: read.employees.length, dependants: read.dependants.length, skipped: read.skipped.length })
    return pjson({ read })
  } catch (e) {
    await recordEvent(r.link.id, 'error', { stage: 'upload', message: errorMessage(e) }).catch(() => {})
    return pjson({ error: errorMessage(e) }, 422)
  }
}
