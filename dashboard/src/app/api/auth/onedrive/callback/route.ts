import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY!
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
}

// GET /api/auth/onedrive/callback
// Microsoft redirects here after the employee grants Files.Read.All access. Exchanges the auth
// code for tokens and upserts the employee_profiles row — mirrors /api/auth/gmail/callback.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code   = searchParams.get('code')
  const userId = searchParams.get('state')
  const error  = searchParams.get('error')

  if (error || !code || !userId) {
    console.error('[onedrive/callback] OAuth error:', error ?? 'missing code or state')
    return NextResponse.redirect(`${origin}/debit-notes/historical?onedrive_error=cancelled`)
  }

  const tenantId    = process.env.MICROSOFT_TENANT_ID || 'common'
  const redirectUri = `${origin}/api/auth/onedrive/callback`

  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
      scope:         'offline_access Files.Read.All User.Read',
    }),
  })

  if (!tokenRes.ok) {
    console.error('[onedrive/callback] token exchange failed:', await tokenRes.text())
    return NextResponse.redirect(`${origin}/debit-notes/historical?onedrive_error=token`)
  }

  const tokens: { access_token?: string; refresh_token?: string } = await tokenRes.json()

  if (!tokens.refresh_token) {
    console.error('[onedrive/callback] no refresh_token in response')
    return NextResponse.redirect(`${origin}/debit-notes/historical?onedrive_error=no_refresh_token`)
  }

  let accountEmail: string | null = null
  if (tokens.access_token) {
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (meRes.ok) {
      const me: { mail?: string; userPrincipalName?: string } = await meRes.json()
      accountEmail = me.mail ?? me.userPrincipalName ?? null
    }
  }

  const upsertRes = await fetch(`${SB_URL}/rest/v1/employee_profiles?on_conflict=user_id`, {
    method:  'POST',
    headers: { ...sbHeaders(), Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({
      user_id:                userId,
      onedrive_account_email: accountEmail,
      onedrive_refresh_token: tokens.refresh_token,
      onedrive_connected_at:  new Date().toISOString(),
    }),
  })

  if (!upsertRes.ok) {
    console.error('[onedrive/callback] profile upsert failed:', await upsertRes.text())
    return NextResponse.redirect(`${origin}/debit-notes/historical?onedrive_error=db`)
  }

  console.log('[onedrive/callback] connected OneDrive for user', userId, '→', accountEmail)
  return NextResponse.redirect(`${origin}/debit-notes/historical?onedrive_connected=1`)
}
