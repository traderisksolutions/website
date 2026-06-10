import { NextResponse } from 'next/server'
import { getGDriveToken, listDocsInFolder, exportDocText, parseDocName } from '@/lib/gdrive'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:         k,
    Authorization:  `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:         prefer,
  }
}

// POST /api/outbound/knowledge/sync
// Syncs all Google Docs from GDRIVE_KNOWLEDGE_FOLDER_ID into ob_knowledge_base.
// Upserts by gdrive_doc_id — existing entries keep their is_active / sort_order.
// Returns { synced, errors[] }
export async function POST() {
  const folderId = process.env.GDRIVE_KNOWLEDGE_FOLDER_ID
  if (!folderId) {
    return NextResponse.json(
      { error: 'GDRIVE_KNOWLEDGE_FOLDER_ID not set', code: 'GDRIVE_NOT_CONFIGURED' },
      { status: 501 }
    )
  }

  if (!process.env.GDRIVE_SERVICE_ACCOUNT_KEY) {
    return NextResponse.json(
      { error: 'GDRIVE_SERVICE_ACCOUNT_KEY not set', code: 'GDRIVE_NOT_CONFIGURED' },
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
      const content                   = await exportDocText(doc.id, token)
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
