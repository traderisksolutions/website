'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'

// Source of truth for the "Send documents" email raised from the Debit Notes drawer and the
// new-debit-note flow — SendDocumentsModal reads this instead of a hardcoded subject/body.
// Stored in app_settings under `debit_note_email_template`.

export const DEBIT_NOTE_TEMPLATE_KEY = 'debit_note_email_template'

export const DEBIT_NOTE_PLACEHOLDERS = [
  '{debit_note_no}', '{company_name}', '{contact_name}', '{amount}', '{currency}', '{insurer}',
] as const

const DEFAULT_SUBJECT = 'Debit Note {debit_note_no} — {company_name}'
const DEFAULT_BODY =
`Dear {contact_name},

Please find attached the document(s) for Debit Note {debit_note_no}.

Thank you.`

type Template = { subject: string; body: string }

function parseTemplate(value: string | null): Template {
  if (!value) return { subject: DEFAULT_SUBJECT, body: DEFAULT_BODY }
  try {
    const t = JSON.parse(value) as Partial<Template>
    return { subject: t.subject ?? DEFAULT_SUBJECT, body: t.body ?? DEFAULT_BODY }
  } catch {
    // Legacy plain-text value → treat as body.
    return { subject: DEFAULT_SUBJECT, body: value }
  }
}

export default function DebitNoteEmailTemplatePanel() {
  const [tpl,     setTpl]     = useState<Template | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/settings?key=${DEBIT_NOTE_TEMPLATE_KEY}`, { cache: 'no-store' })
    const row = res.ok ? await res.json() : null
    setTpl(parseTemplate(row?.value ?? null))
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!tpl) return
    setSaving(true); setSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key: DEBIT_NOTE_TEMPLATE_KEY, value: JSON.stringify(tpl) }),
      })
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    } finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Debit Note draft email message</CardTitle>
        <CardDescription>
          The source of truth for the &quot;Send documents&quot; email raised from a debit note. Fills the
          placeholders per debit note when sending.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {tpl === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/80">Subject</label>
              <Input value={tpl.subject} onChange={e => setTpl({ ...tpl, subject: e.target.value })} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/80">Body</label>
              <textarea
                value={tpl.body}
                onChange={e => setTpl({ ...tpl, body: e.target.value })}
                rows={10}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">Available placeholders (click to copy):</span>
              <div className="flex flex-wrap gap-1.5">
                {DEBIT_NOTE_PLACEHOLDERS.map(p => (
                  <button
                    key={p}
                    onClick={() => navigator.clipboard.writeText(p)}
                    className="text-[11px] font-mono rounded-md border border-border bg-muted/40 px-2 py-1 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                    title="Copy"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save template'}</Button>
              {saved && <span className="text-xs text-emerald-600 font-medium">Saved ✓</span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
