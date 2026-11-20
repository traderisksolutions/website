'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Btn, textareaCls } from '@/components/crm/primitives'
import { cn } from '@/lib/utils'

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
        <CardTitle>Debit note email</CardTitle>
        </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {tpl === null ? (
          <p className="text-body text-trs-muted">Loading…</p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-small font-medium text-trs-ink">Subject</label>
              <Input value={tpl.subject} onChange={e => setTpl({ ...tpl, subject: e.target.value })} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-small font-medium text-trs-ink">Body</label>
              <textarea
                value={tpl.body}
                onChange={e => setTpl({ ...tpl, body: e.target.value })}
                rows={10}
                className={cn(textareaCls, 'leading-relaxed font-mono')}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-small text-trs-muted">Available placeholders (click to copy):</span>
              <div className="flex flex-wrap gap-1.5">
                {DEBIT_NOTE_PLACEHOLDERS.map(p => (
                  <Btn
                    key={p}
                    size="xs"
                    level="secondary"
                    onClick={() => navigator.clipboard.writeText(p)}
                    className="text-small font-mono"
                    title="Copy"
                  >
                    {p}
                  </Btn>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save template'}</Button>
              {saved && <span className="text-small text-trs-ink font-medium">Saved ✓</span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
