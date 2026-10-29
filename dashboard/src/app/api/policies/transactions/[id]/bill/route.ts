/**
 * POST /api/policies/transactions/[id]/bill → { bundle_id }
 * Puts the insurer's movement note (its own PDF) into the debit-note review queue, tied to the
 * transaction, and starts reading it. When the broker approves it there, the TRS debit or credit
 * note is linked back and the movements it covers are marked billed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { bundleForTransaction } from '@/lib/policies/movement-flow'
import { internalHeaders } from '@/lib/api-gate/internal'

export const dynamic = 'force-dynamic'
export const maxDuration = 200

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Transaction id is not valid' }, { status: 400 })
  try {
    const { bundleId } = await bundleForTransaction(id)
    // Read the insurer's PDF with the same extraction a manual upload uses, under the broker's session.
    const x = await fetch(`${req.nextUrl.origin}/api/debit-notes/imports/bundles/${bundleId}/extract`, {
      // The machine pair passes the API gate; the cookie carries the broker's session for the route itself.
      method: 'POST', headers: internalHeaders({ cookie: req.headers.get('cookie') ?? '' }),
    })
    return NextResponse.json({ bundle_id: bundleId, extracted: x.ok }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not raise the note'
    return NextResponse.json({ error: msg }, { status: /already linked|no document|no longer/.test(msg) ? 400 : 500 })
  }
}
