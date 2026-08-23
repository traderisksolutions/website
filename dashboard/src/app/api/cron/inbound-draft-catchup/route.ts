import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

export const maxDuration = 120

// GET /api/cron/inbound-draft-catchup
// Called hourly. Safety net for the instant pg_net trigger (see
// supabase-migration-inbound-auto-draft.sql) — scans for inbound leads that should have a
// draft but don't (e.g. the trigger failed, or was never enabled) and generates one via the
// same route the trigger and the UI's "Generate" button both call.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const dueRes = await fetch(
    `${SB_URL}/rest/v1/inbound_leads` +
    `?ai_draft_id=is.null&source=neq.whatsapp_click&email=not.is.null` +
    `&select=id&order=created_at.asc&limit=20`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  const due: { id: string }[] = dueRes.ok ? await dueRes.json() : []
  if (due.length === 0) return NextResponse.json({ drafted: 0, at: new Date().toISOString() })

  let drafted = 0
  const errors: string[] = []

  for (const lead of due) {
    try {
      const res = await fetch(`${origin}/api/inbound/auto-draft`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
        body:    JSON.stringify({ leadId: lead.id }),
      })
      if (res.ok) {
        const data = await res.json()
        if (!data.skipped) drafted++
      } else {
        errors.push(`${lead.id}: ${res.status}`)
      }
    } catch (e) {
      errors.push(`${lead.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ drafted, checked: due.length, errors, at: new Date().toISOString() })
}
