/**
 * GET  /api/housekeeping/since  → what the filing agent did since this person last cleared it
 * POST /api/housekeeping/since  → clear it, and move their mark to now
 *
 * The window is anchored on the last DISMISSAL, not the last sign-in. Someone who never signs
 * out would otherwise have a last-sign-in that is always "now", and would never see a banner
 * again — the one reading of "since you last logged in" that quietly shows nobody anything.
 *
 * Only the agent's own rows appear: audit_logs is mostly people's edits, and showing a
 * colleague's work back as though a machine had done it would be worse than showing nothing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { HOUSEKEEPING_ACTOR, type HousekeepingAction } from '@/lib/agent-activity'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
/** How far back to look for somebody who has never dismissed. */
const FIRST_RUN_DAYS = 7

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

interface Row {
  action: string
  resource_id: string | null
  created_at: string
  new_value: { subject?: string; basis?: string; company_id?: string; thread_subject?: string } | null
}

async function currentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email ? { id: user.id, email: user.email } : null
}

/** One line per kind of action, with the figure first, as the house voice wants it. */
function summarise(rows: Row[]): { action: string; text: string; count: number; detail: string[] }[] {
  const by = new Map<string, Row[]>()
  for (const r of rows) {
    const list = by.get(r.action) ?? []
    list.push(r)
    by.set(r.action, list)
  }
  const names = (rs: Row[]) =>
    Array.from(new Set(rs.map(r => r.new_value?.subject).filter((v): v is string => !!v)))

  /**
   * What unfurls under a summary line: one line per thing acted on, with how many times and on
   * what basis. This is the part that makes a wrong decision findable — a count alone says
   * something happened, not what it happened to.
   */
  const detailOf = (rs: Row[]): string[] => {
    const by = new Map<string, { n: number; basis: string | null }>()
    for (const r of rs) {
      const key = r.new_value?.subject ?? 'unnamed'
      const prev = by.get(key)
      by.set(key, { n: (prev?.n ?? 0) + 1, basis: prev?.basis ?? r.new_value?.basis ?? null })
    }
    return Array.from(by.entries())
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 12)
      .map(([subject, v]) => `${subject}${v.n > 1 ? ` \u00b7 ${v.n}` : ''}${v.basis ? ` \u2014 ${v.basis}` : ''}`)
  }

  const out: { action: string; text: string; count: number; detail: string[] }[] = []

  const filed = by.get('thread.filed') ?? []
  if (filed.length) {
    const clients = names(filed)
    out.push({
      action: 'thread.filed', count: filed.length, detail: detailOf(filed),
      text: `Filed ${filed.length} conversation${filed.length === 1 ? '' : 's'} to ${clients.length} client${clients.length === 1 ? '' : 's'}`,
    })
  }

  const created = by.get('company.created') ?? []
  if (created.length) {
    const n = names(created)
    out.push({
      action: 'company.created', count: created.length, detail: detailOf(created),
      text: `Created ${created.length} compan${created.length === 1 ? 'y' : 'ies'} from names it had not met — ${n.slice(0, 4).join(', ')}${n.length > 4 ? ` and ${n.length - 4} more` : ''}`,
    })
  }

  const domains = by.get('domain.attached') ?? []
  if (domains.length) {
    out.push({
      action: 'domain.attached', count: domains.length, detail: detailOf(domains),
      text: `Gave ${domains.length} compan${domains.length === 1 ? 'y' : 'ies'} a new email domain, so their mail files itself from now on`,
    })
  }

  const merged = by.get('company.merged') ?? []
  if (merged.length) {
    out.push({
      action: 'company.merged', count: merged.length, detail: detailOf(merged),
      text: `Merged ${merged.length} duplicate compan${merged.length === 1 ? 'y' : 'ies'} — ${names(merged).slice(0, 3).join(', ')}`,
    })
  }

  const sigs = by.get('signature.read') ?? []
  if (sigs.length) {
    out.push({
      action: 'signature.read', count: sigs.length, detail: detailOf(sigs),
      text: `Read ${sigs.length} signature${sigs.length === 1 ? '' : 's'} into contact records`,
    })
  }

  return out
}

export async function GET(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const uRes = await fetch(
      `${SB_URL}/rest/v1/app_users?email=eq.${encodeURIComponent(user.email)}&select=housekeeping_seen_at&limit=1`,
      { headers: sbHeaders(), cache: 'no-store' })
    const uRows = uRes.ok ? await uRes.json() as { housekeeping_seen_at: string | null }[] : []
    const seenAt = uRows[0]?.housekeeping_seen_at ?? null
    const since = seenAt ?? new Date(Date.now() - FIRST_RUN_DAYS * 86_400_000).toISOString()

    const res = await fetch(
      `${SB_URL}/rest/v1/audit_logs?user_email=eq.${encodeURIComponent(HOUSEKEEPING_ACTOR)}` +
      `&created_at=gt.${encodeURIComponent(since)}` +
      `&select=action,resource_id,created_at,new_value&order=created_at.desc&limit=1000`,
      { headers: sbHeaders(), cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: (await res.text()).slice(0, 200) }, { status: res.status })
    const rows = await res.json() as Row[]

    // Threads the agent deliberately would not guess on. Not an action it took, but the thing a
    // person has to do next, so it belongs in the same glance.
    const pendRes = await fetch(`${SB_URL}/rest/v1/email_threads?company_id=is.null&deleted_at=is.null&select=id`,
      { headers: { ...sbHeaders(), Prefer: 'count=exact' }, cache: 'no-store' })
    const range = pendRes.headers.get('content-range') ?? ''
    const pending = Number(range.split('/')[1] ?? 0) || 0

    return NextResponse.json({
      since,
      firstRun: !seenAt,
      total: rows.length,
      items: summarise(rows),
      pending,
      // The raw rows, newest first, for the full log behind "See all".
      log: rows.slice(0, 60).map(r => ({
        at: r.created_at,
        action: r.action as HousekeepingAction,
        subject: r.new_value?.subject ?? null,
        basis: r.new_value?.basis ?? null,
        resourceId: r.resource_id,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const now = new Date().toISOString()
    const res = await fetch(`${SB_URL}/rest/v1/app_users?email=eq.${encodeURIComponent(user.email)}`, {
      method: 'PATCH', headers: sbHeaders('return=minimal'),
      body: JSON.stringify({ housekeeping_seen_at: now }),
    })
    if (!res.ok) return NextResponse.json({ error: (await res.text()).slice(0, 200) }, { status: res.status })
    return NextResponse.json({ ok: true, seenAt: now })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
