import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

// GET /api/auth/onedrive/connect
// Redirects the authenticated employee to Microsoft's OAuth consent screen requesting delegated
// read access to their OneDrive, for the historical debit-note bulk import. Mirrors
// /api/auth/gmail/connect exactly — the user_id is passed as OAuth `state` so the callback knows
// which employee_profiles row to store the refresh token against.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID
  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common'
  if (!clientId) {
    return NextResponse.json({ error: 'MICROSOFT_CLIENT_ID not set' }, { status: 500 })
  }

  const origin      = req.nextUrl.origin
  const redirectUri = `${origin}/api/auth/onedrive/callback`

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    response_mode: 'query',
    // Files.Read.All to list/download; offline_access for a refresh_token; User.Read to identify
    // which Microsoft account was connected.
    scope:         'offline_access Files.Read.All User.Read',
    state:         user.id,
  })

  return NextResponse.redirect(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`)
}
