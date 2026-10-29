'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ChevronUp, ChevronDown } from 'lucide-react'
import { Btn, Field, Segmented, inputCls, textareaCls } from '@/components/crm/primitives'
import { KnowledgeStatusChip } from './chips'
import { SECTIONS, SECTION_BY_KEY, marketLabel, type KnowledgeEntry, type KnowledgeSection } from '@/lib/marketing/knowledge-schema'
import { fmtDate } from '@/lib/marketing/labels'

const INK = '#0f1412'
const MUTED = '#4a5550'
const RULE = '#e6e8e4'

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
      className="fixed right-0 z-40 w-full sm:w-[480px] bg-white flex flex-col outline-none"
      style={{ top: 56, bottom: 0, borderLeft: `1px solid ${RULE}`, boxShadow: '-24px 0 48px -32px rgba(15,20,18,0.25)', color: INK }}>
      <div className="flex-shrink-0 px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${RULE}` }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[22px] font-medium leading-[1.2] tracking-[-0.01em]" style={{ textWrap: 'balance' }}>{existing ? existing.title : 'New entry'}</h2>
            <p className="m-0 mt-2 flex items-center gap-2 flex-wrap text-[13.5px]" style={{ color: MUTED }}>
              {existing && <KnowledgeStatusChip status={existing.status} />}
              <span>{meta.label}</span>
              {existing && <span>· updated {fmtDate(existing.updated_at)}{existing.updated_by ? ` by ${existing.updated_by}` : ''}</span>}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 -mr-2 -mt-1">
            <button type="button" onClick={onPrev} disabled={!onPrev} aria-label="Previous entry" className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f2ee] disabled:opacity-30 disabled:cursor-default" style={{ color: MUTED }}><ChevronUp size={18} /></button>
            <button type="button" onClick={onNext} disabled={!onNext} aria-label="Next entry" className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f2ee] disabled:opacity-30 disabled:cursor-default" style={{ color: MUTED }}><ChevronDown size={18} /></button>
            <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f2ee]" style={{ color: MUTED }}><X size={18} /></button>
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
          <div className="flex flex-wrap gap-3 text-[14px]">
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
        {error && <p className="m-0 text-[13px]" role="alert">{error}</p>}
      </div>
      <div className="flex-shrink-0 px-6 py-4 flex items-center gap-2 flex-wrap" style={{ borderTop: `1px solid ${RULE}` }}>
        <Btn level="primary" disabled={!!busy || !valid} onClick={() => save()}>{busy === 'save' ? 'Saving…' : existing ? 'Save' : 'Add entry'}</Btn>
        {form.status !== 'verified' && <Btn level="secondary" disabled={!!busy || !valid} onClick={() => save('verified')}>{busy === 'verified' ? 'Saving…' : 'Save as verified'}</Btn>}
        {form.status === 'verified' && existing && <Btn level="secondary" disabled={!!busy} onClick={() => save('draft')}>Back to draft</Btn>}
        {existing && <Btn level="tertiary" disabled={!!busy} onClick={archive} className="ml-auto">Archive</Btn>}
      </div>
    </aside>
  )
}
