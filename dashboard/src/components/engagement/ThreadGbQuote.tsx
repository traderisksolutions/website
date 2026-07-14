'use client'

import React, { useState } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { NewQuoteWizard } from '@/components/group-benefits/NewQuoteWizard'
import type { Member } from '@/lib/gb-quote'

/**
 * Engagement dock "GB Quote" tab (Phase 3). Extracts the employee census from the client's
 * emailed spreadsheet, then runs the multi-insurer quote and can draft the reply.
 */
export default function ThreadGbQuote({ threadId, defaultCompany, onDraftReply }: {
  threadId: string
  defaultCompany?: string
  onDraftReply?: (body: string) => void
}) {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [files, setFiles]     = useState<string[]>([])
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function extract() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/group-benefits/extract-census', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId }),
      })
      const d = await res.json()
      if (d.error && !(d.members?.length)) { setError(d.error); return }
      setMembers(d.members ?? []); setFiles(d.files ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction failed')
    } finally { setBusy(false) }
  }

  if (members && members.length > 0) {
    return (
      <div className="p-4">
        <p className="text-[11.5px] text-muted-foreground mb-3">
          Census extracted from <span className="font-medium text-foreground/70">{files.join(', ') || 'attachment'}</span> — {members.length} member{members.length === 1 ? '' : 's'}. Review and quote below.
        </p>
        <NewQuoteWizard initialMembers={members} initialCompany={defaultCompany} onDraftReply={onDraftReply} />
      </div>
    )
  }

  return (
    <div className="p-6 flex flex-col items-center gap-3 text-center">
      <FileSpreadsheet size={26} className="text-muted-foreground/40" />
      <p className="text-[12.5px] text-muted-foreground max-w-sm">
        Extract the employee census from the client&apos;s emailed spreadsheet (xlsx/csv), then quote across insurers and draft the reply.
      </p>
      <button onClick={extract} disabled={busy}
        className="flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {busy && <Loader2 size={13} className="animate-spin" />}{busy ? 'Extracting…' : 'Extract census from attachment'}
      </button>
      {members && members.length === 0 && <p className="text-[12px] text-amber-600">No members could be extracted from the attachment.</p>}
      {error && <p className="text-[12px] text-rose-600 max-w-sm">{error}</p>}
    </div>
  )
}
