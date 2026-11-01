/**
 * The ladder's rows: counted from outbound_origin (what people approved and how much they
 * changed), switched by people, never by the count alone.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { isUnedited } from '@/lib/analytics/autonomy/origin'
import { LADDER_ORDER, canSwitchOn, nextStatus, type LadderRow, type LadderStatus } from './rules'

type Row = Record<string, any>

export const killSwitch = () => (process.env.AUTONOMY_AUTOSEND ?? 'on').toLowerCase() === 'off'

export async function loadLadder(): Promise<LadderRow[]> {
  const rows = await sbTry<LadderRow[]>('autonomy_ladder?select=*&order=rung.asc', [])
  return rows.length ? rows : LADDER_ORDER.map((c, i) => ({ draft_class: c, rung: i + 1, status: 'manual' as LadderStatus, approvals_unedited: 0, approvals_total: 0, min_unedited: 20, last_graduated_at: null, paused_by: null, paused_reason: null }))
}

export const ladderMap = (rows: LadderRow[]) => new Map(rows.map(r => [r.draft_class, r]))

/**
 * Recounts every class from the approvals on record: an outbound message whose origin is an
 * agent's draft a person sent (agent_approved), grouped by that draft's class. Unedited means a
 * tenth or less of the draft changed. manual ↔ candidate follow the count; auto and paused stay.
 */
export async function recountLadder(): Promise<{ classes: number; counted: number }> {
  const origins = await sbTry<Row[]>('outbound_origin?origin=eq.agent_approved&draft_id=not.is.null&select=draft_id,edit_share&limit=20000', [])
  const ids = Array.from(new Set(origins.map(o => o.draft_id as string)))
  const cls = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 100) {
    for (const d of await sbTry<Row[]>(`ai_drafts?id=in.(${ids.slice(i, i + 100).join(',')})&draft_class=not.is.null&select=id,draft_class`, [])) cls.set(d.id, d.draft_class)
  }
  const tally = new Map<string, { total: number; unedited: number }>()
  for (const o of origins) {
    const c = cls.get(o.draft_id); if (!c) continue
    const t = tally.get(c) ?? { total: 0, unedited: 0 }
    t.total++; if (isUnedited(o.edit_share == null ? null : Number(o.edit_share))) t.unedited++
    tally.set(c, t)
  }
  const rows = await loadLadder()
  for (const r of rows) {
    const t = tally.get(r.draft_class) ?? { total: 0, unedited: 0 }
    const status = nextStatus(r, t.unedited)
    await sb('autonomy_ladder?on_conflict=draft_class', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ draft_class: r.draft_class, rung: r.rung, status, approvals_total: t.total, approvals_unedited: t.unedited, min_unedited: r.min_unedited, updated_at: new Date().toISOString() }) })
  }
  return { classes: rows.length, counted: origins.length }
}

/** A person switches a class on (from candidate), pauses it, or puts it back to manual. */
export async function setClassStatus(draftClass: string, action: 'auto' | 'pause' | 'manual', by: string, reason?: string | null): Promise<LadderRow> {
  const [row] = await sb<LadderRow[]>(`autonomy_ladder?draft_class=eq.${enc(draftClass)}&select=*&limit=1`)
  if (!row) throw new Error('Unknown draft class')
  let patch: Row
  if (action === 'auto') {
    if (!canSwitchOn(row)) throw new Error(`${draftClass} is not a candidate: ${row.approvals_unedited} of ${row.min_unedited} unedited approvals`)
    patch = { status: 'auto', last_graduated_at: new Date().toISOString(), paused_by: null, paused_reason: null }
  } else if (action === 'pause') {
    patch = { status: 'paused', paused_by: by, paused_reason: reason?.trim() || 'paused by a person' }
  } else {
    patch = { status: nextStatus({ status: 'manual', min_unedited: row.min_unedited }, row.approvals_unedited), paused_by: null, paused_reason: null, last_graduated_at: null }
  }
  const [out] = await sb<LadderRow[]>(`autonomy_ladder?draft_class=eq.${enc(draftClass)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...patch, changed_by: by, updated_at: new Date().toISOString() }) })
  return out
}

/** The kill switch a person can pull from the page: every class paused at once. */
export async function pauseAll(by: string, reason = 'paused all'): Promise<number> {
  const rows = await sb<LadderRow[]>('autonomy_ladder?status=in.(auto,candidate)', { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'paused', paused_by: by, paused_reason: reason, changed_by: by, updated_at: new Date().toISOString() }) })
  return rows.length
}

/** Pauses one class because a send failed: a bounce or a refused address is a reason to stop. */
export async function pauseClass(draftClass: string, reason: string): Promise<void> {
  await sbTry(`autonomy_ladder?draft_class=eq.${enc(draftClass)}&status=eq.auto`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'paused', paused_by: 'agent', paused_reason: reason.slice(0, 300), updated_at: new Date().toISOString() }) })
}
