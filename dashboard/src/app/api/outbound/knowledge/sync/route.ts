import { NextResponse } from 'next/server'
import { getGDriveToken, listDocsInFolder, exportDocText, parseDocName } from '@/lib/gdrive'
import { SB_URL, sbHeaders } from '@/lib/sb'

// POST /api/outbound/knowledge/sync
// Syncs Google Docs, TXT, and PDF files from GOOGLE_DRIVE_OUTBOUND_FOLDER_ID into ob_knowledge_base.
// Uses GOOGLE_SERVICE_ACC_OUTBOUND_JSON service account — isolated from the engagement GDrive.
// Upserts by gdrive_doc_id — existing entries keep their is_active / sort_order.
// Returns { synced, errors[] }
export async function POST() {
  const folderId = process.env.GOOGLE_DRIVE_OUTBOUND_FOLDER_ID
  if (!folderId) {
    return NextResponse.json(
      { error: 'GOOGLE_DRIVE_OUTBOUND_FOLDER_ID not set', code: 'GDRIVE_NOT_CONFIGURED' },
      { status: 501 }
    )
  }

  if (!process.env.GOOGLE_SERVICE_ACC_OUTBOUND_JSON) {
    return NextResponse.json(
      { error: 'GOOGLE_SERVICE_ACC_OUTBOUND_JSON not set', code: 'GDRIVE_NOT_CONFIGURED' },
      { status: 501 }
    )
  }

  let token: string
  try {
    token = await getGDriveToken()
  } catch (e) {
    return NextResponse.json(
      { error: `Auth failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    )
  }

  let docs: Awaited<ReturnType<typeof listDocsInFolder>>
  try {
    docs = await listDocsInFolder(folderId, token)
  } catch (e) {
    return NextResponse.json(
      { error: `Drive list failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    )
  }

  if (docs.length === 0) {
    return NextResponse.json({ synced: 0, errors: [], message: 'No docs found in folder' })
  }

  const synced: string[] = []
  const errors: string[] = []
  const now = new Date().toISOString()

  for (const doc of docs) {
    try {
      const content                   = await exportDocText(doc.id, token, doc.mimeType)
      const { productType, title }    = parseDocName(doc.name)

      // Upsert by gdrive_doc_id
      const res = await fetch(`${SB_URL}/rest/v1/ob_knowledge_base`, {
        method:  'POST',
        headers: {
          ...sbHeaders('return=representation'),
          Prefer: 'return=representation,resolution=merge-duplicates',
        },
        body: JSON.stringify({
          gdrive_doc_id:         doc.id,
          gdrive_doc_name:       doc.name,
          gdrive_last_synced_at: now,
          product_type:          productType,
          title,
          content:               content.trim(),
          source:                'gdrive',
        }),
      })

      if (!res.ok) {
        errors.push(`${doc.name}: upsert failed (${res.status})`)
      } else {
        synced.push(doc.name)
      }
    } catch (e) {
      errors.push(`${doc.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ synced: synced.length, errors, synced_titles: synced })
}
