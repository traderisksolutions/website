'use client'

/**
 * Company by typing: a match on /api/companies?search= sets the id; free text keeps the name with no
 * id; "Add as a new company" creates the record (POST /api/companies) so quotes, threads and the
 * company page meet on one name. Used by Send HR a link and Quick quote.
 */
import { useEffect, useRef, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Field, inputCls } from '@/components/crm/primitives'

export type CompanyPick = { id: string | null; name: string }
type CompanyHit = { id: string; name: string; domain?: string | null }
const MUTED = '#4a5550'

export function CompanyField({ value, onChange, allowCreate = false, label = 'Company', listId = 'company-options' }: { value: CompanyPick; onChange: (v: CompanyPick) => void; allowCreate?: boolean; label?: string; listId?: string }) {
  const [hits, setHits] = useState<CompanyHit[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current)
    const term = q.trim()
    if (!term) { setHits([]); return }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/companies?search=${encodeURIComponent(term)}`, { cache: 'no-store' })
        const rows = res.ok ? await res.json() as CompanyHit[] : []
        setHits(Array.isArray(rows) ? rows.slice(0, 8) : [])
        setActive(0)
      } catch { setHits([]) }
    }, 180)
  }

  const pick = (h: CompanyHit) => { onChange({ id: h.id, name: h.name }); setOpen(false); setHits([]) }
  const exact = hits.some(h => h.name.trim().toLowerCase() === value.name.trim().toLowerCase())
  const canCreate = allowCreate && value.name.trim().length >= 3 && !value.id && !exact

  async function create() {
    setCreating(true); setError(null)
    try {
      const res = await fetch('/api/companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: value.name.trim() }) })
      const d = await res.json().catch(() => ({})) as { id?: string; name?: string; error?: string }
      if (!res.ok || !d.id) { setError(d.error ?? `Company not added (${res.status})`); return }
      onChange({ id: d.id, name: d.name ?? value.name.trim() }); setOpen(false); setHits([])
    } finally { setCreating(false) }
  }

  const hint = error ?? (value.id ? 'Matched to a company record.' : value.name.trim() ? 'No company record matched; the name is kept as typed.' : undefined)
  return (
    <div ref={box} className="relative">
      <Field label={label} hint={hint}>
        <span className="relative block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#6f7a74' }} />
          <input
            value={value.name} role="combobox" aria-expanded={open} aria-controls={listId} aria-label={label} autoComplete="off"
            onFocus={() => { if (hits.length || canCreate) setOpen(true) }}
            onChange={e => { onChange({ id: null, name: e.target.value }); setOpen(true); search(e.target.value) }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, hits.length - 1)); setOpen(true) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
              else if (e.key === 'Enter' && open && hits[active]) { e.preventDefault(); pick(hits[active]) }
              else if (e.key === 'Escape') setOpen(false)
            }}
            placeholder="Search companies or type a name" className={cn(inputCls, 'pl-9')} />
        </span>
      </Field>
      {open && (hits.length > 0 || canCreate) && (
        <ul id={listId} role="listbox"
          className="absolute left-0 top-full mt-1 z-30 w-full max-h-[260px] overflow-auto rounded-[12px] bg-white p-1.5 m-0 list-none"
          style={{ border: '1px solid #e6e8e4', boxShadow: '0 12px 32px rgba(15,20,18,0.12)' }}>
          {hits.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => pick(h)}
                className={cn('w-full text-left px-3 py-2 rounded-[8px] border-0 cursor-pointer', i === active ? 'bg-[#f1f2ee]' : 'bg-transparent')}>
                <span className="block text-[14px] truncate" style={{ color: '#0f1412' }}>{h.name}</span>
                {h.domain && <span className="block text-[12.5px] truncate" style={{ color: MUTED }}>{h.domain}</span>}
              </button>
            </li>
          ))}
          {canCreate && (
            <li role="option" aria-selected={false}>
              <button type="button" onClick={() => void create()} disabled={creating}
                className="w-full text-left px-3 py-2 rounded-[8px] border-0 cursor-pointer bg-transparent inline-flex items-center gap-2 text-[14px]" style={{ color: '#0f1412' }}>
                <Plus size={14} /> {creating ? 'Adding…' : `Add "${value.name.trim()}" as a new company`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
