import { NextResponse } from 'next/server'
import { enc, sb } from '@/lib/sales/db'
import { verifyUnsubscribeToken } from '@/lib/sales/unsubscribe'

// One-click, no-login unsubscribe for campaign email: GET from the footer link, POST from mail
// clients honouring List-Unsubscribe-Post (RFC 8058). The address goes on the permanent
// suppression list and is suppressed in the audience and among sales contacts.
export const dynamic = 'force-dynamic'

async function unsubscribe(request: Request): Promise<'ok' | 'invalid'> {
  const { searchParams } = new URL(request.url)
  const contactId = searchParams.get('c') ?? ''
  const token = searchParams.get('t') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(contactId) || !token || !verifyUnsubscribeToken(contactId, token)) return 'invalid'
  const contact = (await sb<{ id: string; email: string }[]>(`sales_campaign_contacts?id=eq.${contactId}&select=id,email&limit=1`))[0]
  if (!contact) return 'ok'
  const email = contact.email.toLowerCase()
  const now = new Date().toISOString()
  await sb('sales_suppressions?on_conflict=email', { method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates', body: JSON.stringify({ email, reason: 'unsubscribed' }) })
  await sb(`sales_campaign_contacts?email=ilike.${enc(email)}&status=in.(review,pending,active)`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'unsubscribed', next_send_at: null, updated_at: now }) })
  await sb(`sales_audience?email=eq.${enc(email)}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ suppressed: true, suppression_reason: 'unsubscribed', updated_at: now }) })
  await sb(`sales_contacts?email=ilike.${enc(email)}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ suppressed: true, suppression_reason: 'unsubscribed', email_status: 'suppressed' }) })
  await sb(`sales_outreach?email=ilike.${enc(email)}&status=in.(pending_approval,approved,queued)`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'suppressed' }) })
  return 'ok'
}

export async function GET(request: Request) {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  try {
    const r = await unsubscribe(request)
    return NextResponse.redirect(`${origin}/unsubscribed?ok=${r === 'ok' ? 1 : 0}`)
  } catch (e) {
    console.error('sales unsubscribe failed', e instanceof Error ? e.message : e)
    return NextResponse.redirect(`${origin}/unsubscribed?ok=0`)
  }
}

export async function POST(request: Request) {
  try { return new NextResponse(null, { status: (await unsubscribe(request)) === 'invalid' ? 400 : 200 }) }
  catch { return new NextResponse(null, { status: 500 }) }
}
