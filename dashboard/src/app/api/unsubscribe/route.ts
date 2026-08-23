import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'
import { verifyLeadIdSignature } from '@/lib/unsubscribe-token'

// GET /api/unsubscribe?lead=<outbound_leads.id>&sig=<hmac>
// Public, no login — the link is signed (see src/lib/unsubscribe-token.ts) so it can't be
// used to unsubscribe an arbitrary lead by guessing UUIDs. Deliberately a GET (clickable
// from an email body with no form/JS required) even though it mutates state — the risk of a
// forged/prefetched GET here is "someone stops getting emails they didn't ask to stop", not
// a meaningful harm, and every mainstream ESP unsubscribe link works the same way.
export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const leadId = req.nextUrl.searchParams.get('lead')
  const sig    = req.nextUrl.searchParams.get('sig')

  if (!leadId || !sig || !verifyLeadIdSignature(leadId, sig)) {
    return NextResponse.redirect(`${origin}/unsubscribed?ok=0`)
  }

  const now = new Date().toISOString()

  await fetch(`${SB_URL}/rest/v1/outbound_leads?id=eq.${leadId}`, {
    method:  'PATCH',
    headers: sbHeaders(),
    body:    JSON.stringify({ opt_out: true, opt_out_at: now }),
  })

  // Halt every enrollment for this lead, not just the campaign the clicked email came from —
  // opt_out is a lead-level preference, so it must stop everything already queued.
  await fetch(`${SB_URL}/rest/v1/ob_campaign_leads?lead_id=eq.${leadId}&send_status=in.(queued,sent)`, {
    method:  'PATCH',
    headers: sbHeaders(),
    body:    JSON.stringify({ send_status: 'unsubscribed', send_scheduled_at: null }),
  })

  return NextResponse.redirect(`${origin}/unsubscribed?ok=1`)
}
