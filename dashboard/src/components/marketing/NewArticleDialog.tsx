'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Field, inputCls, textareaCls } from '@/components/crm/primitives'

const INK = '#202124'
const MUTED = '#5f6368'

/** A hand-written article. Saved as a draft; publish from the editor. */
export function NewArticleDialog({ open, onOpenChange, siteKey, topics, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; siteKey: string | null; topics: string[]; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    if (!siteKey) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/marketing/articles?site=${siteKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, topic, markdown, status: 'draft' }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? 'Could not create the article'); return }
      setTitle(''); setTopic(''); setMarkdown('')
      onCreated(j.id)
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!busy) { onOpenChange(v); if (!v) setError(null) } }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[20px] font-medium tracking-[-0.01em]" style={{ color: INK }}>New article</DialogTitle>
          <DialogDescription className="text-[14px]" style={{ color: MUTED }}>Markdown body. Saved as a draft; the editor publishes it.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field label="Title"><input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} /></Field>
          {topics.length > 0 && (
            <Field label="Topic">
              <select value={topic} onChange={e => setTopic(e.target.value)} className={inputCls}>
                <option value="">No topic</option>
                {topics.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          )}
          <Field label="Body (markdown)"><textarea value={markdown} onChange={e => setMarkdown(e.target.value)} rows={12} className={`${textareaCls} font-mono text-[12.5px]`} placeholder={'Opening paragraph.\n\n## First question heading?\n\nText…'} /></Field>
          {error && <p className="m-0 text-[13px]" role="alert" style={{ color: INK }}>{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={create} disabled={busy || title.trim().length < 3 || markdown.trim().length < 50}>{busy ? 'Saving…' : 'Save draft'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
