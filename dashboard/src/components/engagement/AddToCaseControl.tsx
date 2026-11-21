'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { btnClass } from '@/components/crm/primitives'
import { nexusFetch } from '@/lib/nexus/fetch'

type CaseRow = { id: string; name: string; status: string }

/**
 * Attach the current thread to an open Nexus case, from where a related email is noticed.
 * Once linked, the case treats it as evidence (its replies feed the "new replies" bell).
 */
export function AddToCaseControl({ threadId }: { threadId: string | null }) {
  const [open, setOpen]     = useState(false)
  const [cases, setCases]   = useState<CaseRow[] | null>(null)
  const [linked, setLinked] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy]     = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && cases === null) {
      const res  = await nexusFetch('/api/nexus/cases', { cache: 'no-store' })
      const rows = res.ok ? await res.json() : []
      setCases((Array.isArray(rows) ? rows : []).filter((c: CaseRow) => c.status === 'open'))
    }
  }

  async function add(c: CaseRow) {
    if (!threadId) return
    setBusy(true)
    try {
      const res = await nexusFetch(`/api/nexus/cases/${c.id}/threads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, party_type: 'other' }),
      })
      if (res.ok) { setLinked({ id: c.id, name: c.name }); setOpen(false) }
    } finally { setBusy(false) }
  }

  if (!threadId) return null

  return (
    <div ref={ref} className="relative text-body text-trs-muted">
      {linked ? (
        <span className="px-3">
          Added to {linked.name} · <a href={`/nexus/cases?case=${linked.id}`} className="underline underline-offset-[3px] decoration-trs-subtle hover:decoration-trs-ink text-trs-ink">Open in Nexus</a>
        </span>
      ) : (
        <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="listbox" className={btnClass('tertiary', 'xs')}>Add to Nexus case</button>
      )}

      {open && (
        <div role="listbox" aria-label="Open cases" className="absolute top-full left-0 z-20 mt-1.5 w-64 max-h-64 overflow-y-auto rounded border border-trs-line bg-white p-1.5 shadow-[0_12px_32px_rgba(15,20,18,0.12)]">
          {cases === null ? (
            <div className="px-2.5 py-2 text-small flex items-center gap-1.5 text-trs-muted"><Loader2 size={11} className="animate-spin" /> Loading…</div>
          ) : cases.length === 0 ? (
            <div className="px-2.5 py-2 text-small text-trs-muted">No open cases.</div>
          ) : cases.map(c => (
            <button key={c.id} type="button" role="option" aria-selected={false} disabled={busy} onClick={() => add(c)}
              className="w-full text-left px-2.5 py-1.5 rounded text-body bg-transparent border-0 cursor-pointer hover:bg-trs-tint disabled:opacity-50 truncate text-trs-ink">
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
