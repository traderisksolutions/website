/**
 * POST /api/placements/[id]/rounds { line_id, spec, reason, change_summary?, source_log_id?, contact_ids? }
 *   → { round, dispatches, drafts, unrouted }
 * Opens the next round on one line: the previous round closes, every insurer contact on file for
 * the product line gets a fresh draft, or only the contact_ids given. When source_log_id names
 * the client change that prompted it, that log entry is marked acted.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as store from '@/lib/placement/store'
import { openRounds } from '@/lib/placement/workflow'
import { describeChanges, specDiff } from '@/lib/placement/spec'
import type { PlacementLogEntry, RoundReason } from '@/lib/placement/types'
import { contactIdsFrom, errorResponse, fail, gate, isSpec, isUuid, readBody, specFrom } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const REASONS: RoundReason[] = ['client_change', 'insurer_query', 'expiry', 'broker']
const isReason = (v: unknown): v is RoundReason => typeof v === 'string' && (REASONS as string[]).includes(v)

type Body = { line_id?: unknown; spec?: unknown; reason?: unknown; change_summary?: unknown; source_log_id?: unknown; contact_ids?: unknown }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Placement id is not valid')
  const b = await readBody<Body>(req)
  if (!b) return fail('Body must be a JSON object')
  if (!isUuid(b.line_id)) return fail('line_id is required')
  if (!isSpec(b.spec)) return fail('spec must be an object')
  if (!isReason(b.reason)) return fail(`reason must be one of ${REASONS.join(', ')}`)
  if (b.change_summary != null && typeof b.change_summary !== 'string') return fail('change_summary must be text')
  if (b.source_log_id != null && b.source_log_id !== '' && !isUuid(b.source_log_id)) return fail('source_log_id is not valid')
  const contactIds = contactIdsFrom(b.contact_ids)
  if (contactIds === false) return fail('contact_ids must be a list of contact ids')

  try {
    const bundle = await store.loadPlacement(id)
    const placement = bundle?.placements[0]
    if (!bundle || !placement) return fail('Placement not found', 404)
    if (placement.status === 'closed') return fail('Placement is closed', 409)
    const line = bundle.lines.find(l => l.id === b.line_id)
    if (!line) return fail('Line not found on this placement', 404)

    const spec = specFrom(b.spec)
    const prevRound = bundle.rounds.filter(r => r.line_id === line.id).sort((x, y) => y.round_no - x.round_no)[0] ?? null
    const prevSpec = prevRound?.spec ?? line.spec
    const change_summary = (typeof b.change_summary === 'string' && b.change_summary.trim()) || describeChanges(specDiff(prevSpec, spec)) || null

    let source: PlacementLogEntry | null = null
    if (isUuid(b.source_log_id)) {
      source = bundle.log.find(e => e.id === b.source_log_id) ?? null
      if (!source) return fail('source_log_id not found on this placement', 404)
    }

    const r = await openRounds(placement, [{ line, spec, reason: b.reason, change_summary, source_message_id: source?.message_id ?? null }], actor, { contactIds })

    if (source) {
      await store.patchNoTs('placement_log', `id=eq.${source.id}`, { detail: { ...(source.detail ?? {}), acted: true, round_id: r.rounds[0]?.id ?? null } })
    }
    return NextResponse.json({ round: r.rounds[0] ?? null, dispatches: r.dispatches, drafts: r.drafts, unrouted: r.unrouted }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
