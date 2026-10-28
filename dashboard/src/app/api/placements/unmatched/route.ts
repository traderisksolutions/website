/**
 * GET /api/placements/unmatched → { replies: [{ ...placement_unmatched, candidates: [{ dispatch_id, insurer_name, to_email, ref, company_name, line_label }] }] }
 * Emails the agent thinks answer a quote request but could not tie to one: an insurer writing
 * on a fresh thread with no reference, or two requests with the same subject. Open ones only.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { sbTry } from '@/lib/crm/db'
import type { UnmatchedRow } from '@/lib/placement/store'
import { errorResponse, gate } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'

type Candidate = {
  id: string; insurer_name: string; to_email: string
  placements: { ref: string; companies: { company_name: string } | null } | null
  placement_lines: { label: string | null; product_line: string } | null
}

export async function GET(req: NextRequest) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  try {
    const rows = await sbTry<UnmatchedRow[]>('placement_unmatched?status=eq.open&order=created_at.desc&limit=100', [])
    const ids = [...new Set(rows.flatMap(r => r.candidate_dispatch_ids))]
    const cands = ids.length
      ? await sbTry<Candidate[]>(`placement_dispatches?id=in.(${ids.join(',')})&select=id,insurer_name,to_email,placements(ref,companies(company_name)),placement_lines(label,product_line)`, [])
      : []
    const byId = new Map(cands.map(c => [c.id, {
      dispatch_id: c.id, insurer_name: c.insurer_name, to_email: c.to_email, ref: c.placements?.ref ?? null,
      company_name: c.placements?.companies?.company_name ?? null, line_label: c.placement_lines?.label ?? c.placement_lines?.product_line ?? null,
    }]))
    return NextResponse.json({ replies: rows.map(r => ({ ...r, candidates: r.candidate_dispatch_ids.map(id => byId.get(id)).filter(Boolean) })) })
  } catch (e) {
    return errorResponse(e)
  }
}
