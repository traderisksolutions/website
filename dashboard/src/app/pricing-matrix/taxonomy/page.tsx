'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Archive, ArchiveRestore, Check, X, Pencil } from 'lucide-react'
import { StatusPill, REVIEW_STATUS } from '@/components/shared/status-pill'
import { TableShell, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/shared/table-shell'
import { Btn, Chip, Empty, Spinner, inputCls } from '@/components/crm/primitives'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const iconBtn = 'w-8 h-8 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4] disabled:opacity-50'

type Category = {
  id: string; name: string; description: string | null
  sort_order: number; is_protected: boolean; status: 'active' | 'archived'
}
type Synonym = {
  id: string; term: string; source: 'coverage' | 'benefit_term'
  status: 'pending' | 'approved' | 'rejected'; created_at: string
  pm_taxonomy_categories: { name: string } | null
  pm_calculators: { insurer_name: string | null } | null
}

async function safeJson<T>(r: Response): Promise<T & { error?: string }> {
  try { return await r.json() } catch { return { error: `HTTP ${r.status}` } as T & { error?: string } }
}

/** Terminology: the shared category list every calculator's wording resolves to, plus the queue
 *  of new wording waiting to be mapped. */
export default function TaxonomyManagerPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [pending, setPending] = useState<Synonym[]>([])
  const [loading, setLoading] = useState(true)
  const [newCategory, setNewCategory] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [cRes, sRes] = await Promise.all([
      fetch('/api/pricing-matrix/taxonomy/categories', { cache: 'no-store' }),
      fetch('/api/pricing-matrix/taxonomy/synonyms?status=pending', { cache: 'no-store' }),
    ])
    setCategories(cRes.ok ? await cRes.json() : [])
    setPending(sRes.ok ? await sRes.json() : [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const activeCategories = categories.filter(c => c.status === 'active')

  async function addCategory() {
    if (!newCategory.trim()) return
    setSavingCategory(true); setError(null)
    try {
      const res = await fetch('/api/pricing-matrix/taxonomy/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCategory.trim() }),
      })
      const d = await safeJson<{ error?: string }>(res)
      if (!res.ok) { setError(d.error ?? 'Could not create category'); return }
      setNewCategory(''); load()
    } finally { setSavingCategory(false) }
  }

  async function saveRename(id: string) {
    if (!renameValue.trim()) return
    setBusyId(id)
    try {
      await fetch(`/api/pricing-matrix/taxonomy/categories/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: renameValue.trim() }),
      })
      setRenamingId(null); load()
    } finally { setBusyId(null) }
  }

  async function toggleArchive(c: Category) {
    setBusyId(c.id)
    try {
      await fetch(`/api/pricing-matrix/taxonomy/categories/${c.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: c.status === 'active' ? 'archived' : 'active' }),
      })
      load()
    } finally { setBusyId(null) }
  }

  async function approveSynonym(id: string, categoryId: string) {
    if (!categoryId) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/pricing-matrix/taxonomy/synonyms/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category_id: categoryId }),
      })
      if (!res.ok) { const d = await safeJson<{ error?: string }>(res); setError(d.error ?? 'Could not approve'); return }
      setAssigningId(null); load()
    } finally { setBusyId(null) }
  }

  async function rejectSynonym(id: string) {
    setBusyId(id)
    try {
      await fetch(`/api/pricing-matrix/taxonomy/synonyms/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reject: true }),
      })
      load()
    } finally { setBusyId(null) }
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
        <Link href="/pricing-matrix" className="inline-flex items-center gap-1.5 text-[14px] no-underline hover:underline" style={{ color: MUTED }}>← Pricing Matrix</Link>
        <div className="mt-3 flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0 max-w-[640px]">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Terminology</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>The shared category list every calculator&rsquo;s coverage and benefit wording resolves to.</p>
            <p className="m-0 mt-2 text-[13.5px] tabular-nums" style={{ color: MUTED }}>{loading ? 'Loading…' : `${activeCategories.length} active categor${activeCategories.length === 1 ? 'y' : 'ies'} · ${pending.length} term${pending.length === 1 ? '' : 's'} pending`}</p>
          </div>
          <form className="flex items-center gap-3 flex-wrap" onSubmit={e => { e.preventDefault(); addCategory() }}>
            <input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="New category name" aria-label="New category name" className="h-12 w-[240px] rounded-[12px] border bg-white px-4 text-[15px] outline-none focus:border-[#202124]" style={{ borderColor: '#dadce0' }} />
            <button type="submit" disabled={savingCategory || !newCategory.trim()} className="h-12 px-6 rounded-[12px] text-white text-[15px] font-medium border-0 cursor-pointer whitespace-nowrap hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: INK }}>{savingCategory ? 'Adding…' : 'Add category'}</button>
          </form>
        </div>

        {error && <p role="alert" className="m-0 mt-5 text-[14px]" style={{ color: '#3c4043' }}>{error}</p>}

        {loading ? <Spinner /> : (
          <div className="mt-8 flex flex-col">
            <section className="pb-8">
              <h2 className="m-0 mb-3 text-[16px] font-medium tracking-[-0.01em] leading-tight">Pending terms</h2>
              {pending.length === 0 ? (
                <Empty compact>No unmapped terms. New wording appears here when a calculator is extracted.</Empty>
              ) : (
                <ul className="m-0 p-0 list-none rounded-[16px] overflow-hidden bg-white" style={{ border: `1px solid ${RULE}` }}>
                  {pending.map(s => (
                    <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3 flex-wrap hover:bg-[#f8f9fa]" style={{ borderBottom: `1px solid ${RULE}` }}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-medium truncate" style={{ color: INK }}>{s.term}</span>
                          <Chip>{s.source === 'coverage' ? 'Coverage' : 'Benefit term'}</Chip>
                          <StatusPill status={s.status} config={REVIEW_STATUS} />
                        </div>
                        <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: MUTED }}>{s.pm_calculators?.insurer_name ?? 'Added manually'}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {assigningId === s.id ? (
                          <>
                            <select
                              autoFocus
                              defaultValue=""
                              onChange={e => e.target.value && approveSynonym(s.id, e.target.value)}
                              className={`${inputCls} w-auto h-9`}
                              aria-label="Assign category"
                            >
                              <option value="" disabled>Assign category</option>
                              {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <button type="button" onClick={() => setAssigningId(null)} aria-label="Cancel" className={iconBtn} style={{ color: MUTED }}><X size={14} /></button>
                          </>
                        ) : (
                          <Btn level="secondary" onClick={() => setAssigningId(s.id)} disabled={busyId === s.id} loading={busyId === s.id}>Approve</Btn>
                        )}
                        <Btn level="tertiary" onClick={() => rejectSynonym(s.id)} disabled={busyId === s.id}>Reject</Btn>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="pt-8" style={{ borderTop: `1px solid ${RULE}` }}>
              <h2 className="m-0 mb-3 text-[16px] font-medium tracking-[-0.01em] leading-tight">Categories</h2>
                <TableShell label="Categories" minWidth={560}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="min-w-[220px]">
                          {renamingId === c.id ? (
                            <div className="flex items-center gap-1.5">
                              <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveRename(c.id); if (e.key === 'Escape') setRenamingId(null) }} className={`${inputCls} h-9 w-64`} aria-label="Category name" />
                              <button type="button" onClick={() => saveRename(c.id)} disabled={busyId === c.id} aria-label="Save" className={iconBtn} style={{ color: INK }}>{busyId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}</button>
                              <button type="button" onClick={() => setRenamingId(null)} aria-label="Cancel" className={iconBtn} style={{ color: MUTED }}><X size={15} /></button>
                            </div>
                          ) : (
                            <span className="block text-[15px] font-medium leading-tight truncate" style={{ color: INK }}>{c.name}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            <Chip>{c.status === 'active' ? 'Active' : 'Archived'}</Chip>
                            {c.is_protected && <Chip>Protected</Chip>}
                          </span>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {!c.is_protected && renamingId !== c.id && (
                            <span className="inline-flex items-center gap-2">
                              <Btn level="secondary" size="xs" onClick={() => { setRenamingId(c.id); setRenameValue(c.name) }} aria-label={`Rename ${c.name}`}><Pencil size={13} /> Rename</Btn>
                              <Btn level="secondary" size="xs" onClick={() => toggleArchive(c)} disabled={busyId === c.id} aria-label={`${c.status === 'active' ? 'Archive' : 'Restore'} ${c.name}`}>
                                {c.status === 'active' ? <><Archive size={13} /> Archive</> : <><ArchiveRestore size={13} /> Restore</>}
                              </Btn>
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {categories.length === 0 && <TableRow><TableCell colSpan={3} className="py-16 text-center text-[15px]" style={{ color: MUTED }}>No categories yet.</TableCell></TableRow>}
                  </TableBody>
                </TableShell>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
