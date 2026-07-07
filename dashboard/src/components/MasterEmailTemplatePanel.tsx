'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'

// One global master copy the RFQ agent follows for every insurance line. The AI
// uses it as the house style/skeleton, filling the {placeholders} and adapting
// nuance per insurer. Stored in app_settings under `rfq_email_template`.

export const RFQ_TEMPLATE_KEY = 'rfq_email_template'

export const RFQ_PLACEHOLDERS = [
  '{insured}', '{product_line}', '{insurer_name}', '{contact_name}',
  '{broker_name}', '{key_details}', '{deadline}',
] as const

const DEFAULT_SUBJECT = 'Request for Quotation — {product_line} for {insured}'
const DEFAULT_BODY =
`Dear {contact_name},

We are seeking a quotation on behalf of our client, {insured}, for {product_line} cover.

{key_details}

We would appreciate your terms by {deadline}. Please let us know if you require any further information to prepare your quote.

Kind regards,
{broker_name}
Trade Risk Solutions`

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

export default function MasterEmailTemplatePanel() {
  const [tpl,     setTpl]     = useState<Template | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/settings?key=${RFQ_TEMPLATE_KEY}`, { cache: 'no-store' })
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
        body:    JSON.stringify({ key: RFQ_TEMPLATE_KEY, value: JSON.stringify(tpl) }),
      })
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    } finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>RFQ Email Template</CardTitle>
        <CardDescription>
          The master copy the RFQ agent follows for every insurance line. When drafting to an insurer,
          the AI references this for tone and structure, fills the placeholders, and adapts nuance per
          recipient. One template, used everywhere.
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
                rows={14}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">Available placeholders (click to copy):</span>
              <div className="flex flex-wrap gap-1.5">
                {RFQ_PLACEHOLDERS.map(p => (
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
