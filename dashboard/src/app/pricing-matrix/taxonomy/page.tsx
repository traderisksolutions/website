'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Tags, Loader2, Plus, Archive, ArchiveRestore, Check, X, Pencil } from 'lucide-react'
import { MetricCard, MetricGrid } from '@/components/shared/metric-card'
import { StatusPill, REVIEW_STATUS } from '@/components/shared/status-pill'
import { TableShell, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/shared/table-shell'

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
    <div className="max-w-5xl mx-auto px-6 py-6">
      <Link href="/pricing-matrix" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft size={14} /> Pricing Matrix
      </Link>
      <h1 className="text-[18px] font-semibold text-foreground mb-1 flex items-center gap-2"><Tags size={17} className="text-primary" /> Terminology</h1>
      <p className="text-[12.5px] text-muted-foreground/80 mb-5">
        Every insurer words the same benefit differently. This is the shared list every calculator&rsquo;s coverage
        and benefit wording resolves to, so a quote can compare &ldquo;General Outpatient&rdquo; vs &ldquo;GP Visits&rdquo; as one thing.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-16 justify-center"><Loader2 size={15} className="animate-spin" /> Loading…</div>
      ) : (
        <>
          <MetricGrid className="mb-6">
            <MetricCard label="Active categories" value={activeCategories.length} />
            <MetricCard label="Pending terminology" value={pending.length} sub={pending.length ? 'awaiting review' : 'all caught up'} />
          </MetricGrid>

          {error && <p className="text-[12.5px] text-rose-600 mb-3">{error}</p>}

          <section className="mb-8">
            <h2 className="text-[13.5px] font-semibold text-foreground mb-2">Pending terminology queue</h2>
            {pending.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground py-6 text-center border border-dashed border-border rounded-xl">
                No unmapped terminology right now — new wording surfaces here automatically when a calculator is extracted.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {pending.map(s => (
                  <div key={s.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <StatusPill status={s.status} config={REVIEW_STATUS} />
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground/60">{s.source === 'coverage' ? 'Coverage' : 'Benefit term'}</span>
                        </div>
                        <p className="text-[13.5px] font-medium text-foreground truncate">{s.term}</p>
                        <p className="text-[11.5px] text-muted-foreground/70">{s.pm_calculators?.insurer_name ?? 'Manually added'}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {assigningId === s.id ? (
                          <>
                            <select
                              autoFocus
                              defaultValue=""
                              onChange={e => e.target.value && approveSynonym(s.id, e.target.value)}
                              className="text-[12.5px] border border-border rounded-md px-2 py-1 bg-background"
                            >
                              <option value="" disabled>Assign category…</option>
                              {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <button onClick={() => setAssigningId(null)} className="text-muted-foreground/60 hover:text-foreground"><X size={14} /></button>
                          </>
                        ) : (
                          <button onClick={() => setAssigningId(s.id)} disabled={busyId === s.id} className="text-[12px] font-semibold text-primary hover:underline disabled:opacity-50">
                            {busyId === s.id ? <Loader2 size={13} className="animate-spin" /> : 'Approve'}
                          </button>
                        )}
                        <button onClick={() => rejectSynonym(s.id)} disabled={busyId === s.id} title="Reject" className="text-muted-foreground/50 hover:text-rose-500 disabled:opacity-50">
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-[13.5px] font-semibold text-foreground mb-2">Categories</h2>
            <TableShell>
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
                    <TableCell>
                      {renamingId === c.id ? (
                        <div className="flex items-center gap-1.5">
                          <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                            className="text-[13px] border border-border rounded-md px-2 py-1 bg-background" />
                          <button onClick={() => saveRename(c.id)} disabled={busyId === c.id} className="text-emerald-600"><Check size={15} /></button>
                          <button onClick={() => setRenamingId(null)} className="text-muted-foreground/60 hover:text-foreground"><X size={15} /></button>
                        </div>
                      ) : (
                        <span className="font-medium text-foreground">{c.name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${c.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                        {c.status === 'active' ? 'Active' : 'Archived'}
                      </span>
                      {c.is_protected && <span className="ml-1.5 text-[10.5px] text-muted-foreground/60">protected</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {!c.is_protected && renamingId !== c.id && (
                        <div className="inline-flex items-center gap-2">
                          <button onClick={() => { setRenamingId(c.id); setRenameValue(c.name) }} title="Rename" className="text-muted-foreground/50 hover:text-foreground"><Pencil size={14} /></button>
                          <button onClick={() => toggleArchive(c)} disabled={busyId === c.id} title={c.status === 'active' ? 'Archive' : 'Restore'} className="text-muted-foreground/50 hover:text-foreground disabled:opacity-50">
                            {c.status === 'active' ? <Archive size={14} /> : <ArchiveRestore size={14} />}
                          </button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </TableShell>

            <div className="flex items-center gap-2 mt-3">
              <input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="New category name…"
                onKeyDown={e => e.key === 'Enter' && addCategory()}
                className="text-[13px] border border-border rounded-md px-2.5 py-1.5 bg-background flex-1 max-w-xs" />
              <button onClick={addCategory} disabled={savingCategory || !newCategory.trim()}
                className="flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline disabled:opacity-50">
                {savingCategory ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add category
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
