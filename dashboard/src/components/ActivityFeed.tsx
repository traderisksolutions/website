'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { activityLabel, relTime } from '@/lib/activity-labels'
import { Avatar } from '@/components/crm/primitives'

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

const INK   = '#202124'
const BODY  = '#3c4043'
const MUTED = '#5f6368'
const HAIR  = '#e8eaed'

// Compact "Last handled by {name} · {when}" line for a case/thread header.
export function LastHandledBy({ resourceId, className }: { resourceId: string; className?: string }) {
  const [row, setRow] = useState<ActivityRow | null>(null)
  useEffect(() => {
    let live = true
    // "Handled" = the last meaningful change, not a passive open.
    fetch(`/api/activity?resource_id=${encodeURIComponent(resourceId)}&exclude=nexus.case_viewed&limit=1`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: ActivityRow[]) => { if (live) setRow(rows[0] ?? null) })
      .catch(() => {})
    return () => { live = false }
  }, [resourceId])
  if (!row) return null
  const who = row.user_name || row.user_email?.split('@')[0] || 'Someone'
  return (
    <span className={className ?? 'text-[12.5px]'} style={{ color: MUTED }}>
      Last handled by <span className="font-medium" style={{ color: BODY }}>{who}</span> · {activityLabel(row.action)} · {relTime(row.created_at)}
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

  if (rows === null) {
    return (
      <div className="flex flex-col gap-3 py-2" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full animate-pulse" style={{ background: '#f1f3f4' }} />
            <span className="h-3.5 w-56 rounded animate-pulse" style={{ background: '#f1f3f4' }} />
          </div>
        ))}
      </div>
    )
  }
  if (rows.length === 0) return <p className="m-0 py-5 text-[14px]" style={{ color: MUTED }}>{emptyText}</p>

  return (
    <ul className="m-0 p-0 flex flex-col">
      {rows.map((r, i) => {
        const who = r.user_name || r.user_email?.split('@')[0] || 'Someone'
        return (
          <li key={r.id} className="list-none flex items-start gap-3 py-2.5" style={{ borderBottom: i < rows.length - 1 ? `1px solid ${HAIR}` : 'none' }}>
            <Avatar name={who} className="w-7 h-7 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="m-0 text-[14px] leading-snug" style={{ color: BODY }}>
                <span className="font-medium" style={{ color: INK }}>{who}</span> {activityLabel(r.action)}
                {!resourceId && r.resource_type && <span style={{ color: MUTED }}> · {r.resource_type}</span>}
              </p>
              <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: MUTED }}>{relTime(r.created_at)}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
