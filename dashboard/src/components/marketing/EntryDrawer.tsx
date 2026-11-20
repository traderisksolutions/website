'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ChevronUp, ChevronDown } from 'lucide-react'
import { Btn, Field, Segmented, inputCls, textareaCls } from '@/components/crm/primitives'
import { KnowledgeStatusChip } from './chips'
import { SECTIONS, SECTION_BY_KEY, marketLabel, type KnowledgeEntry, type KnowledgeSection } from '@/lib/marketing/knowledge-schema'
import { fmtDate } from '@/lib/marketing/labels'

type Form = { section: KnowledgeSection; title: string; body: string; attributes: Record<string, string>; markets: string[]; status: 'draft' | 'verified'; priority: number; language: 'en' | 'id' }

const fromEntry = (e: KnowledgeEntry | null, section: KnowledgeSection): Form => ({
  section: e?.section ?? section, title: e?.title ?? '', body: e?.body ?? '', attributes: e?.attributes ?? {}, markets: e?.markets ?? [],
  status: e?.status === 'verified' ? 'verified' : 'draft', priority: e?.priority ?? 0, language: e?.language === 'id' ? 'id' : 'en',
})

/** One knowledge entry, in the right-hand drawer the Companies and Leads pages use. */
export function EntryDrawer({ entry, siteKey, defaultSection, markets, onClose, onChanged, onPrev, onNext }: {
  entry: KnowledgeEntry | 'new' | null; siteKey: string | null; defaultSection: KnowledgeSection; markets: string[]
  onClose: () => void; onChanged: (note: string) => void; onPrev?: () => void; onNext?: () => void
}) {
  const existing = entry && entry !== 'new' ? entry : null
  const [form, setForm] = useState<Form>(() => fromEntry(existing, defaultSection))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const panel = useRef<HTMLElement>(null)
  const key = existing ? `${existing.id}:${existing.updated_at}` : entry ? 'new' : 'none'

  useEffect(() => { setForm(fromEntry(existing, defaultSection)); setError(null) }, [key, defaultSection]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!entry) return
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) { if (e.key === 'Escape') onClose(); return }
      if (e.key === 'Escape') onClose()
      if ((e.key === 'j' || e.key === 'ArrowDown') && onNext) { e.preventDefault(); onNext() }
      if ((e.key === 'k' || e.key === 'ArrowUp') && onPrev) { e.preventDefault(); onPrev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [entry, onClose, onNext, onPrev])

  if (!entry) return null
  const meta = SECTION_BY_KEY[form.section]

  async function save(status?: 'draft' | 'verified') {
    if (!siteKey) return
    setBusy(status ?? 'save'); setError(null)
    try {
      const res = await fetch(`/api/marketing/knowledge?site=${siteKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, status: status ?? form.status, id: existing?.id }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? 'Could not save'); return }
      onChanged(existing ? 'Saved' : 'Entry added')
      if (!existing) onClose()
    } finally { setBusy(null) }
  }

  async function archive() {
    if (!siteKey || !existing) return
    setBusy('archive')
    try {
      const res = await fetch(`/api/marketing/knowledge?site=${siteKey}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: existing.id }) })
      if (!res.ok) { setError('Could not archive'); return }
      onChanged('Archived'); onClose()
    } finally { setBusy(null) }
  }

  const valid = form.title.trim().length >= 3 && form.body.trim().length >= 10

  return (
    <aside ref={panel} tabIndex={-1} role="dialog" aria-label={existing ? existing.title : 'New entry'}
      className="fixed right-0 top-[var(--top-nav-h)] bottom-0 z-40 w-full sm:w-[480px] bg-white flex flex-col outline-none border-l border-trs-line shadow-[-24px_0_48px_-32px_rgba(15,20,18,0.25)] text-trs-ink">
      <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-trs-line">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-heading font-medium leading-[1.2] tracking-[-0.01em] [text-wrap:balance]">{existing ? existing.title : 'New entry'}</h2>
            <p className="m-0 mt-2 flex items-center gap-2 flex-wrap text-body text-trs-muted">
              {existing && <KnowledgeStatusChip status={existing.status} />}
              <span>{meta.label}</span>
              {existing && <span>· updated {fmtDate(existing.updated_at)}{existing.updated_by ? ` by ${existing.updated_by}` : ''}</span>}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 -mr-2 -mt-1">
            <Btn onClick={onPrev} disabled={!onPrev} aria-label="Previous entry" level="tertiary" className="w-9 h-9 p-0 rounded-full border-0 hover:bg-trs-field disabled:opacity-30 disabled:cursor-default"><ChevronUp size={18} /></Btn>
            <Btn onClick={onNext} disabled={!onNext} aria-label="Next entry" level="tertiary" className="w-9 h-9 p-0 rounded-full border-0 hover:bg-trs-field disabled:opacity-30 disabled:cursor-default"><ChevronDown size={18} /></Btn>
            <Btn onClick={onClose} aria-label="Close" level="tertiary" className="w-9 h-9 p-0 rounded-full border-0 hover:bg-trs-field"><X size={18} /></Btn>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-4">
        <Field label="Section">
          <select value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value as KnowledgeSection }))} className={inputCls}>{SECTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        </Field>
        <Field label="Title"><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputCls} placeholder="Short, specific name" /></Field>
        <Field label={meta.bodyLabel} hint={meta.bodyHint}><textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={9} className={textareaCls} /></Field>
        {meta.attributeFields.map(f => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            {f.multiline
              ? <textarea value={form.attributes[f.key] ?? ''} onChange={e => setForm(x => ({ ...x, attributes: { ...x.attributes, [f.key]: e.target.value } }))} rows={3} className={textareaCls} />
              : <input value={form.attributes[f.key] ?? ''} onChange={e => setForm(x => ({ ...x, attributes: { ...x.attributes, [f.key]: e.target.value } }))} className={inputCls} />}
          </Field>
        ))}
        <Field label="Applies to" hint="None selected = every market">
          <div className="flex flex-wrap gap-3 text-body">
            {markets.map(m => (
              <label key={m} className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.markets.includes(m)} onChange={e => setForm(f => ({ ...f, markets: e.target.checked ? Array.from(new Set([...f.markets, m])) : f.markets.filter(x => x !== m) }))} />
                {marketLabel(m)}
              </label>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Language"><Segmented value={form.language} onChange={v => setForm(f => ({ ...f, language: v }))} options={[{ value: 'en', label: 'English' }, { value: 'id', label: 'Bahasa' }]} /></Field>
          <Field label="Priority (0 to 10)"><input type="number" min={0} max={10} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} className={inputCls} /></Field>
        </div>
        {error && <p className="m-0 text-body" role="alert">{error}</p>}
      </div>
      <div className="flex-shrink-0 px-6 py-4 flex items-center gap-2 flex-wrap border-t border-trs-line">
        <Btn level="primary" disabled={!!busy || !valid} onClick={() => save()}>{busy === 'save' ? 'Saving…' : existing ? 'Save' : 'Add entry'}</Btn>
        {form.status !== 'verified' && <Btn level="secondary" disabled={!!busy || !valid} onClick={() => save('verified')}>{busy === 'verified' ? 'Saving…' : 'Save as verified'}</Btn>}
        {form.status === 'verified' && existing && <Btn level="secondary" disabled={!!busy} onClick={() => save('draft')}>Back to draft</Btn>}
        {existing && <Btn level="tertiary" disabled={!!busy} onClick={archive} className="ml-auto">Archive</Btn>}
      </div>
    </aside>
  )
}
