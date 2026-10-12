'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Field, inputCls, textareaCls } from '@/components/crm/primitives'
import { SECTIONS, marketLabel, type KnowledgeSection } from '@/lib/marketing/knowledge-schema'

const INK = '#202124'
const MUTED = '#5f6368'

/** Paste markdown or plain text. Each "# Heading" becomes its own entry; none means one entry. All land as drafts. */
export function PasteDialog({ open, onOpenChange, siteKey, defaultSection, markets, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; siteKey: string | null; defaultSection: KnowledgeSection; markets: string[]; onDone: (inserted: number) => void }) {
  const [section, setSection] = useState<KnowledgeSection>(defaultSection)
  const [picked, setPicked] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!siteKey) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/marketing/knowledge/import?site=${siteKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ markdown, section, markets: picked, title }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? 'Import failed'); return }
      setMarkdown(''); setTitle('')
      onDone(j.inserted ?? 0)
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!busy) { onOpenChange(v); if (!v) setError(null) } }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[20px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Paste text</DialogTitle>
          <DialogDescription className="text-[14px]" style={{ color: MUTED }}>Each line starting with a single # becomes its own entry; no headings means one entry. Everything is saved as a draft to verify.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Section"><select value={section} onChange={e => setSection(e.target.value as KnowledgeSection)} className={inputCls}>{SECTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
            <Field label="Title (when there are no headings)"><input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} /></Field>
          </div>
          <Field label="Text"><textarea value={markdown} onChange={e => setMarkdown(e.target.value)} rows={12} className={`${textareaCls} font-mono text-[12.5px]`} /></Field>
          <Field label="Applies to" hint="None selected = every market">
            <div className="flex flex-wrap gap-3 text-[14px]">
              {markets.map(m => <label key={m} className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={picked.includes(m)} onChange={e => setPicked(p => e.target.checked ? Array.from(new Set([...p, m])) : p.filter(x => x !== m))} />{marketLabel(m)}</label>)}
            </div>
          </Field>
          {error && <p className="m-0 text-[13px]" role="alert" style={{ color: INK }}>{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || markdown.trim().length < 20}>{busy ? 'Importing…' : 'Import as drafts'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
