'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { textareaCls } from '@/components/crm/primitives'

const INK = '#0f1412'
const MUTED = '#4a5550'

const HEADER = 'company,country,domain,industry,why_now,source_url,product_line,fit_score,intent_score,recommended_action,name,title,email,email_basis,email_source_url,phone,phone_basis,linkedin_url,draft_message'

/** CSV of leads from the lead tool, pasted or uploaded. One row per person; rows of the same
 *  company become one lead. Existing companies and people are matched, not duplicated. */
export function ImportLeadsDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (v: boolean) => void; onImported: () => void }) {
  const [csv, setCsv] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  async function run() {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/sales/leads/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csv, source: 'csv' }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(j.error ?? 'Import failed'); return }
      setMsg(`${j.rows} rows · ${j.accountsCreated} companies created · ${j.accountsMatched} matched · ${j.contactsCreated} people created · ${j.contactsUpdated + j.contactsMerged} updated · ${j.draftsCreated} drafts · ${j.skipped.length} skipped`)
      setCsv('')
      onImported()
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!busy) { onOpenChange(v); if (!v) setMsg(null) } }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[20px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Import leads</DialogTitle>
          <DialogDescription className="text-[14px]" style={{ color: MUTED }}>
            One row per person. Required columns: company, country, name. The header row may hold, in any order: {HEADER.replace(/,/g, ', ')}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2.5">
          <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()) }} />
          <div><Button variant="outline" size="sm" onClick={() => file.current?.click()}>Choose file</Button></div>
          <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={8} placeholder={`${HEADER}\nAcme Pte Ltd,SG,acme.com.sg,Logistics,...`} aria-label="CSV" className={`${textareaCls} font-mono text-[12px]`} />
          {msg && <p className="m-0 text-[13px]" style={{ color: MUTED }} aria-live="polite">{msg}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
          <Button onClick={run} disabled={busy || !csv.trim()}>{busy ? 'Importing…' : 'Import'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
