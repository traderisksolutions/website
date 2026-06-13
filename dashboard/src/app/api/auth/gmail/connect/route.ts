import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

// GET /api/auth/gmail/connect
// Redirects the authenticated employee to Google's OAuth consent screen
// requesting gmail.send scope. The user_id is passed as OAuth `state` so
// the callback can store the token against the right employee profile.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const clientId   = process.env.GMAIL_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'GMAIL_CLIENT_ID not set' }, { status: 500 })
  }

  const origin      = req.nextUrl.origin
  const redirectUri = `${origin}/api/auth/gmail/callback`

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/gmail.send',
    access_type:   'offline',
    prompt:        'consent',    // always show consent so we always get a refresh_token
    login_hint:    user.email ?? '',
    state:         user.id,      // thread user_id through OAuth so callback knows who this is
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/auth?${params}`)
}
