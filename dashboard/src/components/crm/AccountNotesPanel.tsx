'use client'

import { useState } from 'react'
import { SectionCard, Empty, Btn, textareaCls } from './primitives'

const BODY = '#3c4043'

/** The company's account notes, as written. The agent reads the same text when it drafts replies and briefs. */
export function AccountNotesPanel({ notes, onSave }: { notes: string | null; onSave: (notes: string) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true); setError(null)
    try { await onSave(draft); setEditing(false) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
    finally { setSaving(false) }
  }

  const actions = editing ? (
    <>
      <Btn level="tertiary" onClick={() => { setDraft(notes ?? ''); setEditing(false); setError(null) }} disabled={saving}>Cancel</Btn>
      <Btn level="primary" onClick={save} loading={saving}>Save</Btn>
    </>
  ) : <Btn onClick={() => { setDraft(notes ?? ''); setEditing(true) }}>Edit</Btn>

  return (
    <SectionCard title="Account notes" actions={actions}>
      {editing ? (
        <>
          <textarea className={textareaCls} rows={18} value={draft} onChange={e => setDraft(e.target.value)} />
          {error && <p className="m-0 mt-2 text-[14px]" style={{ color: '#c5221f' }}>{error}</p>}
        </>
      ) : notes?.trim() ? (
        <div className="text-[14px] leading-[1.6] whitespace-pre-wrap break-words" style={{ color: BODY }}>{notes}</div>
      ) : <Empty compact>No notes.</Empty>}
    </SectionCard>
  )
}
