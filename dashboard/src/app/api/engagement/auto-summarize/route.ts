import { NextRequest, NextResponse } from 'next/server'
import { runAutoSummarize }          from '@/lib/run-auto-summarize'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  if (req.headers.get('x-internal-secret') !== (process.env.CRON_SECRET ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let thread_id: string, message_id: string
  try {
    ;({ thread_id, message_id } = await req.json())
    if (!thread_id || !message_id) throw new Error('missing ids')
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  try {
    await runAutoSummarize(thread_id, message_id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    console.error('[auto-summarize] fatal:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
