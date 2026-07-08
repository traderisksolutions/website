/**
 * POST /api/nexus/rfq/quotes/extract   Body: { dispatch_id }
 *
 * Internal, fire-and-forget quote capture — called from email ingest when an
 * insurer reply is linked. Reads the insurer email body + attachment text and
 * persists a structured rfq_quotes row (with evidence). Always 200.
 */
import { NextRequest, NextResponse } from 'next/server'
import { extractAndStoreQuote }      from '@/lib/rfq-quote-extract'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    if (req.headers.get('x-internal-secret') !== (process.env.CRON_SECRET ?? '')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const { dispatch_id } = await req.json().catch(() => ({})) as { dispatch_id?: string }
    if (!dispatch_id) return NextResponse.json({ ok: true, skipped: 'no dispatch_id' })

    const row = await extractAndStoreQuote(dispatch_id).catch(() => null)
    return NextResponse.json({ ok: true, captured: !!row })
  } catch (e) {
    return NextResponse.json({ ok: true, error: String(e) })
  }
}
