'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Field, inputCls, textareaCls } from '@/components/crm/primitives'
import { newArticle } from '@/app/marketing/actions'

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
      const r = await newArticle(siteKey, { title, topic, markdown, status: 'draft' })
      if (!r.ok) { setError(r.error); return }
      const j = r.data as { id: string }
      setTitle(''); setTopic(''); setMarkdown('')
      onCreated(j.id)
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!busy) { onOpenChange(v); if (!v) setError(null) } }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-heading font-medium text-trs-ink">New article</DialogTitle>
          <DialogDescription className="text-body text-trs-muted">Markdown body. Saved as a draft; the editor publishes it.</DialogDescription>
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
          <Field label="Body (markdown)"><textarea value={markdown} onChange={e => setMarkdown(e.target.value)} rows={12} className={`${textareaCls} font-mono text-small`} placeholder={'Opening paragraph.\n\n## First question heading?\n\nText…'} /></Field>
          {error && <p className="m-0 text-body text-trs-ink" role="alert" >{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={create} disabled={busy || title.trim().length < 3 || markdown.trim().length < 50}>{busy ? 'Saving…' : 'Save draft'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
