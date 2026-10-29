/**
 * GET /api/cron/nexus — daily at 08:20 SGT (vercel.json "20 0 * * *"; the TRS Vercel team is on Hobby, which allows daily crons only). New mail is also read on ingest. Bearer CRON_SECRET.
 *   1. Reads every email message created since the cursor (app_settings 'nexus_reader_cursor'),
 *      up to 60 a run, and retries failed reads. follow_up_reads keeps each message to one read.
 *   2. Syncs the record sources: RFQ dispatches, renewals, debit notes.
 * ?dry=1 runs the source sync without writing and reads no email.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/crm/db'
import { getAppSetting } from '@/lib/app-settings'
import { readSince } from '@/lib/nexus/reader'
import { syncSources } from '@/lib/nexus/sources'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CURSOR_KEY = 'nexus_reader_cursor'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  const bearer = secret !== '' && req.headers.get('authorization') === `Bearer ${secret}`
  if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const dry = new URL(req.url).searchParams.get('dry') === '1'
  try {
    let email: Awaited<ReturnType<typeof readSince>> | null = null
    if (!dry) {
      // First run: start 24 hours back rather than reading the whole archive.
      const cursor = await getAppSetting(CURSOR_KEY, new Date(Date.now() - 86_400_000).toISOString())
      email = await readSince(cursor)
      if (email.cursor !== cursor) {
        await sb('app_settings?on_conflict=key', {
          method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ key: CURSOR_KEY, value: email.cursor, updated_at: new Date().toISOString() }),
        })
      }
    }
    const sources = await syncSources(new Date(), { dryRun: dry })
    console.log('[nexus] email', JSON.stringify(email), 'sources', JSON.stringify(sources))
    return NextResponse.json({ ok: true, email, sources })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    console.error('[nexus] cron failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
