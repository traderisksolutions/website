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

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'

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
    return <p className="m-0 mt-4 text-[14px]" style={{ color: msg?.tone === 'error' ? '#c5221f' : MUTED }}>{msg?.text ?? 'Loading…'}</p>
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[13px] tabular-nums" style={{ color: MUTED }}>
          {d.isDefault ? 'Default' : `Edited ${when(d.updatedAt) ?? ''}`} · {words.toLocaleString()} words · read by client drafts, Ask AI, group benefits and summaries
        </p>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {!d.isDefault && (
              confirmRestore ? (
                <>
                  <span className="text-[13px]" style={{ color: MUTED }}>Replace with the default?</span>
                  <button type="button" onClick={() => setConfirmRestore(false)}
                          className="h-9 px-3.5 rounded-[10px] bg-white text-[13.5px] border cursor-pointer" style={{ borderColor: '#dadce0', color: INK }}>Cancel</button>
                  <button type="button" onClick={() => void restore()} disabled={!!busy}
                          className="h-9 px-3.5 rounded-[10px] bg-white text-[13.5px] border cursor-pointer disabled:opacity-50" style={{ borderColor: '#dadce0', color: '#c5221f' }}>
                    {busy === 'restore' ? 'Restoring…' : 'Restore default'}
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmRestore(true)} disabled={!!busy}
                        className="h-9 px-3.5 rounded-[10px] bg-white text-[13.5px] border cursor-pointer disabled:opacity-50" style={{ borderColor: '#dadce0', color: INK }}>
                  Restore default
                </button>
              )
            )}
            <button type="button" onClick={() => void save()} disabled={!dirty || !!busy}
                    className="h-9 px-4 rounded-[10px] text-white text-[13.5px] font-medium border-0 cursor-pointer disabled:opacity-40" style={{ background: INK }}>
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {msg && <p className="m-0 text-[13px]" style={{ color: msg.tone === 'error' ? '#c5221f' : '#137333' }}>{msg.text}</p>}

      <label htmlFor="voice-soul" className="sr-only">Tone of voice</label>
      <textarea
        id="voice-soul"
        value={text}
        onChange={e => setText(e.target.value)}
        readOnly={!isAdmin}
        spellCheck
        className="w-full min-h-[560px] rounded-[12px] px-4 py-3.5 text-[13.5px] leading-[1.6] resize-y focus:outline-none focus:ring-2 focus:ring-[#202124]/15"
        style={{ border: `1px solid ${RULE}`, color: INK, background: isAdmin ? '#fff' : '#f8f9fa',
                 fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
      />

      {!isAdmin && <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Only an administrator can edit this.</p>}
    </div>
  )
}
