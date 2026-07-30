/**
 * GET /api/onedrive/browse?path=Debit%20Notes%2F2026
 * Folder browser for the "Pull from OneDrive" tab. Returns immediate children (folders + PDF
 * files) of the given path, '' for the drive root. Requires MS_GRAPH_* env vars to be set — see
 * src/lib/onedrive.ts for the one-time Azure AD app registration this needs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { getGraphToken, listChildren } from '@/lib/onedrive'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const path = req.nextUrl.searchParams.get('path') ?? ''
    const token = await getGraphToken()
    const items = await listChildren(path, token)
    return NextResponse.json(items.map(i => ({
      id: i.id, name: i.name, isFolder: !!i.folder, mimeType: i.file?.mimeType ?? null, size: i.size ?? null,
    })))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
