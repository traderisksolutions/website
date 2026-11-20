'use client'

/**
 * Settings → Tone of voice. The firm's soul.md: one open-ended document every writing agent
 * reads before it drafts — client emails, Ask AI answers, group benefits replies, internal
 * summaries.
 *
 * Plain text in a monospaced field, because the document is markdown and its structure (headings,
 * bullets) is what the agents read. Administrators edit; everyone else reads, since knowing the
 * house voice is useful to the people whose drafts it shapes.
 */

import { useEffect, useMemo, useState } from 'react'
import { Btn, textareaCls } from '@/components/crm/primitives'
import { cn } from '@/lib/utils'

type Payload = { text: string; isDefault: boolean; updatedAt: string | null; defaultText: string; error?: string }

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : null

export function VoicePanel({ isAdmin }: { isAdmin: boolean }) {
  const [d, setD] = useState<Payload | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'save' | 'restore' | null>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)

  useEffect(() => {
    fetch('/api/settings/voice', { cache: 'no-store' })
      .then(r => r.json())
      .then((j: Payload) => { if (j.error) setMsg({ tone: 'error', text: j.error }); else { setD(j); setText(j.text) } })
      .catch(() => setMsg({ tone: 'error', text: 'Could not load the tone of voice.' }))
  }, [])

  const dirty = !!d && text !== d.text
  const words = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text])

  async function save() {
    setBusy('save'); setMsg(null)
    try {
      const res = await fetch('/api/settings/voice', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const j = await res.json()
      if (!res.ok) { setMsg({ tone: 'error', text: j.error ?? 'Could not save.' }); return }
      setD(prev => prev ? { ...prev, text: text.trim(), isDefault: false, updatedAt: j.updatedAt } : prev)
      setText(text.trim())
      setMsg({ tone: 'ok', text: 'Saved. Agents use it from their next draft.' })
    } finally { setBusy(null) }
  }

  async function restore() {
    setBusy('restore'); setMsg(null); setConfirmRestore(false)
    try {
      const res = await fetch('/api/settings/voice', { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok) { setMsg({ tone: 'error', text: j.error ?? 'Could not restore.' }); return }
      setD(prev => prev ? { ...prev, text: j.text, isDefault: true, updatedAt: null } : prev)
      setText(j.text)
      setMsg({ tone: 'ok', text: 'Default restored.' })
    } finally { setBusy(null) }
  }

  if (!d) {
    return <p className={cn('m-0 mt-4 text-body', msg?.tone === 'error' ? 'text-trs-neg' : 'text-trs-muted')}>{msg?.text ?? 'Loading…'}</p>
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-body tabular-nums text-trs-muted">
          {d.isDefault ? 'Default' : `Edited ${when(d.updatedAt) ?? ''}`} · {words.toLocaleString()} words · read by client drafts, Ask AI, group benefits and summaries
        </p>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {!d.isDefault && (
              confirmRestore ? (
                <>
                  <span className="text-body text-trs-muted">Replace with the default?</span>
                  <Btn onClick={() => setConfirmRestore(false)}>Cancel</Btn>
                  <Btn level="danger" onClick={() => void restore()} disabled={!!busy}>
                    {busy === 'restore' ? 'Restoring…' : 'Restore default'}
                  </Btn>
                </>
              ) : (
                <Btn onClick={() => setConfirmRestore(true)} disabled={!!busy}>
                  Restore default
                </Btn>
              )
            )}
            <Btn level="primary" onClick={() => void save()} disabled={!dirty || !!busy}>
              {busy === 'save' ? 'Saving…' : 'Save'}
            </Btn>
          </div>
        )}
      </div>

      {msg && <p className={cn('m-0 text-body', msg.tone === 'error' ? 'text-trs-neg' : 'text-trs-pos')}>{msg.text}</p>}

      <label htmlFor="voice-soul" className="sr-only">Tone of voice</label>
      <textarea
        id="voice-soul"
        value={text}
        onChange={e => setText(e.target.value)}
        readOnly={!isAdmin}
        spellCheck
        rows={24}
        className={cn(textareaCls, 'border-trs-line px-4 py-3.5 font-mono leading-[1.6]', isAdmin ? 'bg-white' : 'bg-trs-tint')}
      />

      {!isAdmin && <p className="m-0 text-small text-trs-muted">Only an administrator can edit this.</p>}
    </div>
  )
}
