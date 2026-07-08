'use client'

import React, { useState } from 'react'
import { FolderPlus, Check, ExternalLink, Loader2 } from 'lucide-react'

type CaseRow = { id: string; name: string; status: string }

/**
 * Manually attach the current engagement thread to an open Nexus case — where you
 * actually notice a new related email. Once linked, the case treats it as evidence
 * (its replies feed the "new replies" bell).
 */
export function AddToCaseControl({ threadId }: { threadId: string | null }) {
  const [open, setOpen]     = useState(false)
  const [cases, setCases]   = useState<CaseRow[] | null>(null)
  const [linked, setLinked] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy]     = useState(false)

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
    <div className="relative flex-shrink-0 px-5 py-1.5 border-b border-[--border-subtle] bg-card/60 flex items-center gap-2">
      {linked ? (
        <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
          <Check size={12} /> Added to “{linked.name}”
          <a href={`/nexus?case=${linked.id}`} className="text-primary hover:underline inline-flex items-center gap-0.5 ml-1">
            Open in Nexus <ExternalLink size={10} />
          </a>
        </span>
      ) : (
        <button onClick={toggle} aria-expanded={open}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground/70 hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded">
          <FolderPlus size={12} /> Add to Nexus case
        </button>
      )}

      {open && (
        <div className="absolute top-full left-5 z-20 mt-1 w-64 max-h-64 overflow-y-auto rounded-lg border border-[--border-subtle] bg-card p-1"
          style={{ boxShadow: '0 12px 32px -12px rgba(16,24,40,0.28)' }}>
          {cases === null ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground/60 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Loading…</div>
          ) : cases.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground/60">No open cases.</div>
          ) : cases.map(c => (
            <button key={c.id} disabled={busy} onClick={() => add(c)}
              className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] text-foreground/85 hover:bg-muted/60 disabled:opacity-50 truncate">
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
