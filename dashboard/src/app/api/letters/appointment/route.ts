/**
 * GET  /api/letters/appointment?company_id=&placement_id= → the prefill for the form (client,
 *      project title and programme from the placement) and the company's letter status.
 * POST /api/letters/appointment { company_id, placement_id?, client_name, project_title,
 *      programme, date, signatory_name?, designation?, draft_email? }
 *      → renders the letter as PDF and Word, files both in the company's data room (Drive,
 *        <Company>/Letters/), and, with draft_email, drafts the email to the client with both
 *        attached into Drafts to approve. Nothing is sent.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { enc, sb, sbTry } from '@/lib/crm/db'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'
import { LETTER_DRAFT_TYPE, letterFileName, letterProblems, letterStatus, type AppointmentLetter } from '@/lib/letters/appointment'
import { buildAppointmentDocx, renderAppointmentPdf } from '@/lib/letters/appointment-server'
import { fileDocument } from '@/lib/documents/ingest'
import * as docs from '@/lib/documents/store'
import * as pstore from '@/lib/placement/store'
import { productLineLabel } from '@/lib/product-lines'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Company = { id: string; company_name: string; address: string | null }

async function companyOf(id: string) {
  return (await sbTry<Company[]>(`companies?id=eq.${enc(id)}&select=id,company_name,address&limit=1`, []))[0] ?? null
}

async function statusFor(companyId: string) {
  const [rows, live] = await Promise.all([
    sbTry<{ id: string; doc_type: string; source: string; status: string; received_at: string | null; created_at: string; drive_url: string | null }[]>(
      `policy_documents?company_id=eq.${enc(companyId)}&doc_type=eq.broker_appointment&select=id,doc_type,source,status,received_at,created_at,drive_url`, []),
    sbTry<{ id: string }[]>(`policies?company_id=eq.${enc(companyId)}&lifecycle=in.(live,bound,renewal_due)&select=id&limit=1`, []),
  ])
  return letterStatus(rows, live.length > 0)
}

export async function GET(req: NextRequest) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const q = new URL(req.url).searchParams
  const companyId = q.get('company_id'), placementId = q.get('placement_id')
  if (!isUuid(companyId)) return fail('Company id is not valid')
  if (placementId && !isUuid(placementId)) return fail('Placement id is not valid')
  try {
    const company = await companyOf(companyId)
    if (!company) return fail('Company not found', 404)
    let projectTitle = '', programme = ''
    if (placementId) {
      const bundle = await pstore.loadPlacement(placementId)
      const p = bundle?.placements[0]
      if (p) {
        projectTitle = p.title ?? ''
        const lines = (bundle?.lines ?? []).filter(l => l.status !== 'dropped').map(l => l.label ?? productLineLabel(l.product_line))
        programme = lines.length ? `${lines.join(' and ')} insurance for the ${p.title ?? 'project'}` : ''
      }
    }
    return NextResponse.json({
      prefill: { client_name: company.company_name, project_title: projectTitle, programme, date: new Date().toISOString().slice(0, 10) },
      status: await statusFor(companyId),
    })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const b = await readBody<Record<string, unknown>>(req)
  if (!b) return fail('Send the letter fields')
  const str = (v: unknown) => typeof v === 'string' ? v.trim().slice(0, 600) : ''
  const companyId = str(b.company_id), placementId = str(b.placement_id) || null
  if (!isUuid(companyId)) return fail('Company id is not valid')
  if (placementId && !isUuid(placementId)) return fail('Placement id is not valid')
  const letter: AppointmentLetter = {
    clientName: str(b.client_name), projectTitle: str(b.project_title), programme: str(b.programme), date: str(b.date),
    signatoryName: str(b.signatory_name) || null, designation: str(b.designation) || null,
  }
  const problems = letterProblems(letter)
  if (problems.length) return fail(problems.join(' '))
  try {
    const company = await companyOf(companyId)
    if (!company) return fail('Company not found', 404)
    const [pdf, docx] = await Promise.all([renderAppointmentPdf(letter), buildAppointmentDocx(letter)])
    const now = new Date().toISOString()
    const saved: { format: 'pdf' | 'docx'; id: string; url: string | null; drive_file_id: string | null; filename: string; mime: string }[] = []
    for (const [format, bytes, mime] of [['pdf', pdf, 'application/pdf'], ['docx', docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']] as const) {
      const filename = letterFileName(letter, format)
      const row = await docs.insertDocument({
        company_id: companyId, policy_id: null, doc_type: 'broker_appointment', title: `Appointment letter to sign · ${letter.projectTitle}`.slice(0, 120),
        filename, mime_type: mime, size_bytes: bytes.length, source: 'generated', received_at: now, classified_by: 'broker', confidence: 1,
        needs_review: false, status: 'unfiled', uploaded_by: actor,
      })
      if (!row) throw new Error('The letter could not be saved')
      const filed = await fileDocument(row, bytes)
      saved.push({ format, id: filed.id, url: filed.drive_url, drive_file_id: filed.drive_file_id, filename, mime })
    }

    let draftId: string | null = null
    if (b.draft_email === true) {
      const placement = placementId ? (await pstore.loadPlacement(placementId))?.placements[0] ?? null : null
      let contact = placement?.client_contact_id ? await pstore.sbTryContact(placement.client_contact_id) : null
      if (!contact?.email) {
        contact = (await sbTry<{ id: string; email: string | null; name: string | null }[]>(`contacts?company_id=eq.${enc(companyId)}&email=not.is.null&is_employee=is.false&select=id,email,first_name&order=updated_at.desc&limit=1`, [])
          .then(r => r.map(c => ({ id: c.id, email: c.email, name: null }))))[0] ?? null
      }
      if (!contact?.email) return NextResponse.json({ documents: saved, draft_error: 'No client contact with an email on this company, so no email was drafted. Download the files instead.' }, { status: 201 })
      const body = [
        'Dear Sir / Madam,',
        '',
        `Please find attached the letter appointing Trade Risk Solutions as your insurance broker for ${letter.projectTitle}. Insurers ask for it before they will discuss the risk with us.`,
        '',
        'Could you print it on your company letterhead, sign it, and send the signed copy back to us? The Word version is attached in case you prefer to edit it.',
        '',
        'Thank you.',
      ].join('\n')
      const draft = await pstore.createDraft({ contact_id: contact.id, to_email: contact.email, subject: `Letter of broker appointment: ${letter.projectTitle}`, body, thread_id: placement?.client_thread_id ?? null, email_type: LETTER_DRAFT_TYPE })
      if (draft) {
        draftId = draft.id
        await sb(`ai_drafts?id=eq.${enc(draft.id)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            attachments: saved.filter(s => s.drive_file_id).map(s => ({ filename: s.filename, mime_type: s.mime, storage_url: `drivefile:${s.drive_file_id}` })),
            context_used: { company_id: companyId, placement_id: placementId, kind: 'appointment_letter' },
          }),
        })
      }
    }
    if (placementId) {
      await pstore.log({ company_id: companyId, placement_id: placementId, kind: 'decision', actor, text: `Appointment letter prepared for ${letter.projectTitle}${draftId ? ' and drafted to the client' : ''}`, detail: { ai_draft_id: draftId, document_ids: saved.map(s => s.id) } })
    }
    return NextResponse.json({ documents: saved, draft_id: draftId, status: await statusFor(companyId) }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
