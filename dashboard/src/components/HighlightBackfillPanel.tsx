'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// One-off maintenance: recover email highlights for messages ingested before we
// stored HTML. Loops POST /api/admin/backfill-highlights (100 at a time, using
// your session) until nothing remains, showing live progress.
export default function HighlightBackfillPanel() {
  const [running, setRunning] = useState(false)
  const [done,    setDone]    = useState(false)
  const [status,  setStatus]  = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  async function run() {
    setRunning(true); setDone(false); setError(null)
    let processed = 0, withHighlights = 0
    try {
      for (let i = 0; i < 500; i++) {   // safety cap; each pass = 100 messages
        const res = await fetch('/api/admin/backfill-highlights?limit=100', { method: 'POST' })
        if (!res.ok) { setError(`Failed (${res.status}): ${await res.text().catch(() => '')}`); break }
        const d = await res.json() as { processed?: number; updated_with_highlights?: number; remaining?: number }
        processed      += d.processed ?? 0
        withHighlights += d.updated_with_highlights ?? 0
        setStatus(`Processed ${processed} · ${withHighlights} had highlights · ~${d.remaining ?? 0} remaining`)
        if (!d.processed || (d.remaining ?? 0) <= 0) { setDone(true); break }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backfill failed')
    } finally { setRunning(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email highlights — backfill</CardTitle>
        <CardDescription>
          Recover highlights for emails received before highlight capture was added. Re-pulls each
          message’s HTML from Gmail and extracts what the sender highlighted. Safe to run repeatedly.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Button onClick={run} disabled={running}>{running ? 'Backfilling…' : done ? 'Run again' : 'Backfill highlights'}</Button>
          {done && !error && <span className="text-xs text-emerald-600 font-medium">Done ✓</span>}
        </div>
        {status && <p className="text-[12px] text-muted-foreground">{status}</p>}
        {error && <p className="text-[12px] text-rose-600">{error}</p>}
        <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
          Runs in batches of 100 (newest first). It may take a few minutes on a large mailbox; keep this tab open.
        </p>
      </CardContent>
    </Card>
  )
}
