/**
 * POST /api/debit-notes/[id]/email-attachment
 * Copies the debit note's stored PDF into the `email-attachments` bucket the Engagement send
 * route (`/api/email/send`) actually reads from, and returns the {filename, mime_type,
 * storage_url} shape the compose panel already expects — so "Send via Engagement" is just:
 * call this, stash the result + recipient in sessionStorage, navigate to /engagement.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH as debitSbH, storageKeySegment } from '@/lib/debit-note-storage'
import { randomUUID }                from 'node:crypto'

const EMAIL_BUCKET = 'email-attachments'

function emailStH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const dnRes = await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${id}&select=debit_note_no,pdf_storage_url&limit=1`, { headers: debitSbH(), cache: 'no-store' })
    const dn = dnRes.ok ? (await dnRes.json())[0] : null
    if (!dn?.pdf_storage_url) return NextResponse.json({ error: 'PDF not available for this debit note' }, { status: 404 })

    const pdfRes = await fetch(`${SB_URL}/storage/v1/object/debit-notes/${dn.pdf_storage_url}`, { headers: debitSbH() })
    if (!pdfRes.ok) return NextResponse.json({ error: 'Could not read stored PDF' }, { status: 502 })
    const bytes = Buffer.from(await pdfRes.arrayBuffer())

    const filename = `${dn.debit_note_no}.pdf`
    const path = `outgoing/${randomUUID()}/${storageKeySegment(filename)}`
    const upRes = await fetch(`${SB_URL}/storage/v1/object/${EMAIL_BUCKET}/${path}`, {
      method: 'POST', headers: { ...emailStH(), 'Content-Type': 'application/pdf' },
      body: bytes as unknown as BodyInit,
    })
    if (!upRes.ok) return NextResponse.json({ error: await upRes.text() }, { status: 502 })

    return NextResponse.json({ filename, mime_type: 'application/pdf', storage_url: path })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
