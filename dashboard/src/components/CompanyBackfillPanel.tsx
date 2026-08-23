'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// One-off maintenance (Sales Loop v2, Phase 5 / F3): resolve contacts.company_id for existing
// contacts that only have the free-text company name, retroactively, using the same dedup
// resolver the three lead-creation paths now run at intake. Loops
// POST /api/admin/backfill-contact-companies until done — that route always re-queries from the
// front (a resolved row stops matching), so this does NOT track an offset, unlike
// ThreadContactBackfillPanel's loop.
export default function CompanyBackfillPanel() {
  const [running, setRunning] = useState(false)
  const [done,    setDone]    = useState(false)
  const [status,  setStatus]  = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  async function run() {
    setRunning(true); setDone(false); setError(null)
    let processed = 0, updated = 0
    try {
      for (let i = 0; i < 1000; i++) {   // safety cap
        const res = await fetch('/api/admin/backfill-contact-companies?limit=100', { method: 'POST' })
        if (!res.ok) { setError(`Failed (${res.status}): ${await res.text().catch(() => '')}`); break }
        const d = await res.json() as { processed?: number; updated?: number; done?: boolean }
        processed += d.processed ?? 0
        updated   += d.updated ?? 0
        setStatus(`Scanned ${processed} contact${processed !== 1 ? 's' : ''} · linked ${updated} to a company`)
        if (d.done) { setDone(true); break }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backfill failed')
    } finally { setRunning(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact companies — backfill</CardTitle>
        <CardDescription>
          Link existing contacts to a real company record using their free-text company name —
          the same match Debit Notes already use. Recommended, not required. Safe to run repeatedly.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Button onClick={run} disabled={running}>{running ? 'Backfilling…' : done ? 'Run again' : 'Link companies'}</Button>
          {done && !error && <span className="text-xs text-emerald-600 font-medium">Done ✓</span>}
        </div>
        {status && <p className="text-[12px] text-muted-foreground">{status}</p>}
        {error && <p className="text-[12px] text-rose-600">{error}</p>}
      </CardContent>
    </Card>
  )
}
