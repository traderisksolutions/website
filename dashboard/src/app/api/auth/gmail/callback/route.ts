import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY!
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
}

// GET /api/auth/gmail/callback
// Google redirects here after the employee grants gmail.send access.
// Exchanges the auth code for tokens and upserts the employee_profiles row.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code   = searchParams.get('code')
  const userId = searchParams.get('state')  // set by /api/auth/gmail/connect
  const error  = searchParams.get('error')

  if (error || !code || !userId) {
    console.error('[gmail/callback] OAuth error:', error ?? 'missing code or state')
    return NextResponse.redirect(`${origin}/settings?gmail_error=cancelled`)
  }

  const redirectUri = `${origin}/api/auth/gmail/callback`

  // Exchange auth code for access + refresh tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    console.error('[gmail/callback] token exchange failed:', await tokenRes.text())
    return NextResponse.redirect(`${origin}/settings?gmail_error=token`)
  }

  const tokens: { access_token?: string; refresh_token?: string } = await tokenRes.json()

  if (!tokens.refresh_token) {
    // Google only returns refresh_token on first consent or when prompt=consent.
    // If missing here, the user likely already granted access — they need to revoke
    // and reconnect to get a fresh refresh_token.
    console.error('[gmail/callback] no refresh_token — user may need to revoke access and reconnect')
    return NextResponse.redirect(`${origin}/settings?gmail_error=no_refresh_token`)
  }

  // Fetch the Gmail address from Google userinfo
  let gmailEmail: string | null = null
  if (tokens.access_token) {
    const uiRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (uiRes.ok) {
      const ui: { email?: string } = await uiRes.json()
      gmailEmail = ui.email ?? null
    }
  }

  // Upsert employee_profiles — merge-duplicates on user_id
  const upsertRes = await fetch(`${SB_URL}/rest/v1/employee_profiles?on_conflict=user_id`, {
    method:  'POST',
    headers: { ...sbHeaders(), Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({
      user_id:              userId,
      gmail_email:          gmailEmail,
      gmail_refresh_token:  tokens.refresh_token,
      gmail_connected_at:   new Date().toISOString(),
    }),
  })

  if (!upsertRes.ok) {
    console.error('[gmail/callback] profile upsert failed:', await upsertRes.text())
    return NextResponse.redirect(`${origin}/settings?gmail_error=db`)
  }

  console.log('[gmail/callback] connected Gmail for user', userId, '→', gmailEmail)
  return NextResponse.redirect(`${origin}/settings?gmail_connected=1`)
}
