'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

type CaseRow = { id: string; name: string; status: string }

const INK = '#202124'
const MUTED = '#5f6368'
const HAIR = '#e8eaed'
const LINK = 'bg-transparent border-0 p-0 cursor-pointer text-[13px] underline underline-offset-[3px] decoration-[#9aa0a6] hover:decoration-[#202124]'

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
      const res  = await fetch('/api/nexus/cases', { cache: 'no-store' })
      const rows = res.ok ? await res.json() : []
      setCases((Array.isArray(rows) ? rows : []).filter((c: CaseRow) => c.status === 'open'))
    }
  }

  async function add(c: CaseRow) {
    if (!threadId) return
    setBusy(true)
    try {
      const res = await fetch(`/api/nexus/cases/${c.id}/threads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, party_type: 'other' }),
      })
      if (res.ok) { setLinked({ id: c.id, name: c.name }); setOpen(false) }
    } finally { setBusy(false) }
  }

  if (!threadId) return null

  return (
    <div ref={ref} className="relative text-[13px]" style={{ color: MUTED }}>
      {linked ? (
        <span>
          Added to {linked.name} · <a href={`/nexus?case=${linked.id}`} className="underline underline-offset-[3px] decoration-[#9aa0a6] hover:decoration-[#202124]" style={{ color: INK }}>Open in Nexus</a>
        </span>
      ) : (
        <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="listbox" className={LINK} style={{ color: INK }}>Add to Nexus case</button>
      )}

      {open && (
        <div role="listbox" aria-label="Open cases" className="absolute top-full left-0 z-20 mt-1.5 w-64 max-h-64 overflow-y-auto rounded-[12px] bg-white p-1.5" style={{ border: `1px solid ${HAIR}`, boxShadow: '0 12px 32px rgba(32,33,36,0.12)' }}>
          {cases === null ? (
            <div className="px-2.5 py-2 text-[12.5px] flex items-center gap-1.5" style={{ color: MUTED }}><Loader2 size={11} className="animate-spin" /> Loading…</div>
          ) : cases.length === 0 ? (
            <div className="px-2.5 py-2 text-[12.5px]" style={{ color: MUTED }}>No open cases.</div>
          ) : cases.map(c => (
            <button key={c.id} type="button" role="option" aria-selected={false} disabled={busy} onClick={() => add(c)}
              className="w-full text-left px-2.5 py-1.5 rounded-[8px] text-[13.5px] bg-transparent border-0 cursor-pointer hover:bg-[#f8f9fa] disabled:opacity-50 truncate" style={{ color: INK }}>
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
