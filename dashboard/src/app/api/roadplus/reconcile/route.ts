import { NextResponse } from 'next/server'
import { withStaff } from '@/lib/auth/guard'

// POST /api/roadplus/reconcile → triggers the roadplus reconciliation sweep on the
// roadplus site (which alone holds the ECICS creds). Proxies so the secret stays
// server-side. Configure on this dashboard's Vercel project:
//   ROADPLUS_SITE_URL         = https://roadplus.com.sg
//   ROADPLUS_RECONCILE_SECRET = <roadplus ROADPLUS_WEBHOOK_SECRET (or dedicated)>
export const POST = withStaff(async () => {
  const site = process.env.ROADPLUS_SITE_URL
  const secret =
    process.env.ROADPLUS_RECONCILE_SECRET || process.env.ROADPLUS_WEBHOOK_SECRET
  if (!site || !secret) {
    return NextResponse.json(
      { configured: false, error: 'Set ROADPLUS_SITE_URL and ROADPLUS_RECONCILE_SECRET on the dashboard.' },
      { status: 200 },
    )
  }

  try {
    const res = await fetch(`${site.replace(/\/$/, '')}/api/reconcile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json({ configured: true, ...data }, { status: res.ok ? 200 : 502 })
  } catch (e) {
    return NextResponse.json({ configured: true, ok: false, error: String(e) }, { status: 502 })
  }
}, { error: 'Not authenticated' })
