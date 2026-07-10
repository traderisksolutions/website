'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { activityLabel, relTime } from '@/lib/activity-labels'

export type ActivityRow = {
  id: string
  created_at: string
  user_name: string | null
  user_email: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  new_value: Record<string, unknown> | null
}

// Deterministic avatar colour from a name/email.
function tint(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return `hsl(${h} 55% 45%)`
}
const initials = (name: string) => name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'

// Compact "Last handled by {name} · {when}" line for a case/thread header.
export function LastHandledBy({ resourceId, className }: { resourceId: string; className?: string }) {
  const [row, setRow] = useState<ActivityRow | null>(null)
  useEffect(() => {
    let live = true
    fetch(`/api/activity?resource_id=${encodeURIComponent(resourceId)}&limit=1`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: ActivityRow[]) => { if (live) setRow(rows[0] ?? null) })
      .catch(() => {})
    return () => { live = false }
  }, [resourceId])
  if (!row) return null
  const who = row.user_name || row.user_email?.split('@')[0] || 'Someone'
  return (
    <span className={className ?? 'text-[10.5px] text-muted-foreground/55'}>
      Last handled by <span className="font-medium text-foreground/70">{who}</span> · {activityLabel(row.action)} · {relTime(row.created_at)}
    </span>
  )
}

export function ActivityFeed({ resourceId, limit = 50, emptyText = 'No activity yet.' }: { resourceId?: string; limit?: number; emptyText?: string }) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null)

  const load = useCallback(async () => {
    const q = new URLSearchParams({ limit: String(limit) })
    if (resourceId) q.set('resource_id', resourceId)
    const res = await fetch(`/api/activity?${q}`, { cache: 'no-store' })
    setRows(res.ok ? await res.json() : [])
  }, [resourceId, limit])

  useEffect(() => { load() }, [load])

  if (rows === null) return <p className="text-[12px] text-muted-foreground/60 px-1 py-3">Loading activity…</p>
  if (rows.length === 0) return <p className="text-[12px] text-muted-foreground/50 px-1 py-3">{emptyText}</p>

  return (
    <div className="flex flex-col">
      {rows.map((r, i) => {
        const who = r.user_name || r.user_email?.split('@')[0] || 'Someone'
        return (
          <div key={r.id} className={`flex items-start gap-2.5 py-2 ${i < rows.length - 1 ? 'border-b border-[--border-subtle]/60' : ''}`}>
            <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white mt-0.5" style={{ background: tint(who) }}>
              {initials(who)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-foreground/85 leading-snug">
                <span className="font-semibold">{who}</span> {activityLabel(r.action)}
                {!resourceId && r.resource_type && <span className="text-muted-foreground/50"> · {r.resource_type}</span>}
              </p>
              <p className="text-[10px] text-muted-foreground/45">{relTime(r.created_at)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
