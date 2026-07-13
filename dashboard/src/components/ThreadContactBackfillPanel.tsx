'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// One-off maintenance (#3): re-attribute threads whose contact is the generic company
// placeholder (no email) to the real client — or the TRS employee who handled it. Loops
// POST /api/admin/backfill-thread-contacts by offset until done.
export default function ThreadContactBackfillPanel() {
  const [running, setRunning] = useState(false)
  const [done,    setDone]    = useState(false)
  const [status,  setStatus]  = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  async function run() {
    setRunning(true); setDone(false); setError(null)
    let offset = 0, processed = 0, updated = 0
    try {
      for (let i = 0; i < 1000; i++) {   // safety cap
        const res = await fetch(`/api/admin/backfill-thread-contacts?limit=100&offset=${offset}`, { method: 'POST' })
        if (!res.ok) { setError(`Failed (${res.status}): ${await res.text().catch(() => '')}`); break }
        const d = await res.json() as { processed?: number; updated?: number; nextOffset?: number; done?: boolean }
        processed += d.processed ?? 0
        updated   += d.updated ?? 0
        offset     = d.nextOffset ?? offset + 100
        setStatus(`Scanned ${processed} threads · re-attributed ${updated}`)
        if (d.done) { setDone(true); break }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backfill failed')
    } finally { setRunning(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thread contacts — backfill</CardTitle>
        <CardDescription>
          Re-attribute threads showing the generic “Trade Risk Solutions” contact to the real
          client, or the employee who handled the thread. Safe to run repeatedly.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Button onClick={run} disabled={running}>{running ? 'Backfilling…' : done ? 'Run again' : 'Re-attribute contacts'}</Button>
          {done && !error && <span className="text-xs text-emerald-600 font-medium">Done ✓</span>}
        </div>
        {status && <p className="text-[12px] text-muted-foreground">{status}</p>}
        {error && <p className="text-[12px] text-rose-600">{error}</p>}
      </CardContent>
    </Card>
  )
}
