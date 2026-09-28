'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pencil, Trash2, ToggleLeft, ToggleRight, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/Tip'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Chip, Field, Segmented, inputCls, textareaCls } from '@/components/crm/primitives'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'

const PRODUCT_TYPES = ['Business Assets', 'Business Liabilities', 'Workforce', 'API', 'General'] as const
type ProductType = typeof PRODUCT_TYPES[number]

// Product type is a category, not a state, so it may sit on a soft field. Ink text throughout.
const PT_FIELD: Record<ProductType, string> = {
  'Business Assets':      '#FFF6D8',
  'Business Liabilities': '#EAF2FF',
  'Workforce':            '#F1EEFF',
  'API':                  '#EAF6EC',
  'General':              '#F5F5F3',
}

function ProductChip({ pt }: { pt: ProductType }) {
  return (
    <span className="inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap leading-4" style={{ background: PT_FIELD[pt] ?? PT_FIELD.General, color: '#3c4043' }}>
      {pt}
    </span>
  )
}

interface KnowledgeEntry {
  id: string
  product_type: ProductType
  title: string
  content: string
  source: 'manual' | 'gdrive'
  gdrive_doc_name: string | null
  gdrive_last_synced_at: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })

export default function KnowledgePage() {
  const [entries,    setEntries]    = useState<KnowledgeEntry[]>([])
  const [loading,    setLoading]    = useState(true)
  const [filterPt,   setFilterPt]   = useState<string>('all')
  const [q,          setQ]          = useState('')
  const [error,      setError]      = useState<string | null>(null)
  const [syncing,    setSyncing]    = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  // New entry modal
  const [showModal, setShowModal]   = useState(false)
  const [newPt,     setNewPt]       = useState<ProductType>('General')
  const [newTitle,  setNewTitle]    = useState('')
  const [newContent,setNewContent]  = useState('')
  const [creating,  setCreating]    = useState(false)

  // Inline edit
  const [editId,      setEditId]      = useState<string | null>(null)
  const [editTitle,   setEditTitle]   = useState('')
  const [editContent, setEditContent] = useState('')
  const [editPt,      setEditPt]      = useState<ProductType>('General')
  const [saving,      setSaving]      = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/outbound/knowledge')
      const data = await res.json()
      setEntries(Array.isArray(data) ? data : [])
    } catch {
      setError('Failed to load knowledge base')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const needle = q.trim().toLowerCase()
  const filtered = entries
    .filter(e => filterPt === 'all' || e.product_type === filterPt)
    .filter(e => !needle || `${e.title} ${e.content} ${e.gdrive_doc_name ?? ''}`.toLowerCase().includes(needle))

  async function syncFromDrive() {
    setSyncing(true)
    setSyncResult(null)
    setError(null)
    try {
      const res  = await fetch('/api/outbound/knowledge/sync', { method: 'POST' })
      const data = await res.json()
      if (data.code === 'GDRIVE_NOT_CONFIGURED') {
        setError('Google Drive is not configured. Add GDRIVE_SERVICE_ACCOUNT_KEY and GDRIVE_KNOWLEDGE_FOLDER_ID to the Vercel environment.')
      } else if (!res.ok) {
        setError(data.error ?? 'Sync failed')
      } else {
        setSyncResult(`Synced ${data.synced} doc${data.synced !== 1 ? 's' : ''}${data.errors?.length ? ` (${data.errors.length} errors)` : ''}`)
        await load()
      }
    } catch {
      setError('Sync request failed')
    } finally {
      setSyncing(false)
    }
  }

  async function createEntry() {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/outbound/knowledge', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ product_type: newPt, title: newTitle.trim(), content: newContent.trim() }),
      })
      if (!res.ok) throw new Error('Failed')
      setShowModal(false); setNewTitle(''); setNewContent(''); setNewPt('General')
      await load()
    } catch {
      setError('Failed to create entry')
    } finally {
      setCreating(false)
    }
  }

  async function saveEdit(id: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/outbound/knowledge/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: editTitle, content: editContent, product_type: editPt }),
      })
      if (!res.ok) throw new Error('Failed')
      setEditId(null)
      await load()
    } catch {
      setError('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(entry: KnowledgeEntry) {
    try {
      await fetch(`/api/outbound/knowledge/${entry.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ is_active: !entry.is_active }),
      })
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, is_active: !e.is_active } : e))
    } catch {
      setError('Failed to update entry')
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm('Delete this knowledge entry?')) return
    try {
      await fetch(`/api/outbound/knowledge/${id}`, { method: 'DELETE' })
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch {
      setError('Failed to delete entry')
    }
  }

  function startEdit(entry: KnowledgeEntry) {
    setEditId(entry.id)
    setEditTitle(entry.title)
    setEditContent(entry.content)
    setEditPt(entry.product_type)
  }

  const gdriveDocs   = entries.filter(e => e.source === 'gdrive')
  const lastSynced   = gdriveDocs.length > 0
    ? gdriveDocs.reduce((acc, e) => {
        if (!e.gdrive_last_synced_at) return acc
        return !acc || e.gdrive_last_synced_at > acc ? e.gdrive_last_synced_at : acc
      }, null as string | null)
    : null

  const folderHint = process.env.NEXT_PUBLIC_GDRIVE_FOLDER_HINT ?? 'GDRIVE_KNOWLEDGE_FOLDER_ID env var'
  const anyFilter = filterPt !== 'all' || !!needle

  const countLine = loading
    ? 'Loading…'
    : [
        anyFilter ? `${filtered.length} of ${entries.length} document${entries.length === 1 ? '' : 's'}` : `${entries.length} document${entries.length === 1 ? '' : 's'}`,
        gdriveDocs.length > 0 ? `${gdriveDocs.length} from Google Drive` : 'none from Google Drive',
        lastSynced ? `last sync ${fmtDateTime(lastSynced)}` : null,
      ].filter(Boolean).join(' · ')

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1000px] px-6 sm:px-12 pt-12 pb-20">

        {/* Header */}
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Knowledge base</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>{countLine}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#80868b' }} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search documents" aria-label="Search documents"
                className="h-12 w-[220px] sm:w-[280px] rounded-[12px] border bg-white pl-11 pr-9 text-[15px] outline-none focus:border-[#202124] transition-colors" style={{ borderColor: '#dadce0' }} />
              {q && (
                <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><X size={13} /></button>
              )}
            </label>
            <span className="inline-flex items-center gap-1">
              <button type="button" onClick={syncFromDrive} disabled={syncing} className="h-12 px-4 rounded-[12px] border bg-white text-[15px] cursor-pointer hover:bg-[#f8f9fa] disabled:opacity-50 disabled:cursor-not-allowed" style={{ borderColor: '#dadce0', color: INK }}>
                {syncing ? 'Syncing…' : 'Sync from Drive'}
              </button>
              <Tip text={`Pulls Google Docs from the configured Drive folder (${folderHint}).`} />
            </span>
            <button type="button" onClick={() => setShowModal(true)} className="h-12 px-6 rounded-[12px] text-white text-[15px] font-medium border-0 cursor-pointer whitespace-nowrap hover:opacity-90" style={{ background: INK }}>
              Add document
            </button>
          </div>
        </div>

        {/* Category filter */}
        <div className="mt-6">
          <Segmented
            value={filterPt}
            onChange={setFilterPt}
            options={['all', ...PRODUCT_TYPES].map(pt => {
              const count = pt === 'all' ? entries.length : entries.filter(e => e.product_type === pt).length
              return { value: pt, label: pt === 'all' ? 'All' : pt, count: count > 0 ? count : undefined }
            })}
          />
        </div>

        {error && (
          <p className="mt-6 mb-0 text-[14px] flex items-center gap-3 flex-wrap" style={{ color: '#3c4043' }} role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>Dismiss</button>
          </p>
        )}
        {syncResult && (
          <p className="mt-6 mb-0 text-[14px] flex items-center gap-3 flex-wrap" style={{ color: MUTED }} role="status">
            <span>{syncResult}</span>
            <button type="button" onClick={() => setSyncResult(null)} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>Dismiss</button>
          </p>
        )}

        {/* Documents */}
        <div className="mt-6">
          {loading ? (
            <div className="rounded-[16px] overflow-hidden bg-white" style={{ border: `1px solid ${RULE}` }} aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-[96px] px-6 flex flex-col justify-center gap-2.5" style={{ borderBottom: `1px solid ${RULE}` }}>
                  <span className="h-3.5 w-2/5 rounded bg-[#f1f3f4] animate-pulse" />
                  <span className="h-3 w-4/5 rounded bg-[#f1f3f4] animate-pulse" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>
              {anyFilter
                ? <>No documents match. <button type="button" onClick={() => { setFilterPt('all'); setQ('') }} className="underline bg-transparent border-0 p-0 cursor-pointer" style={{ color: INK }}>Clear filters</button></>
                : 'No documents yet. Sync from Drive or add one.'}
            </p>
          ) : (
            <ul className="m-0 p-0 list-none rounded-[16px] overflow-hidden bg-white" style={{ border: `1px solid ${RULE}` }}>
              {filtered.map(entry => {
                const isEditing = editId === entry.id
                return (
                  <li key={entry.id} className={cn('px-6 py-4', !entry.is_active && !isEditing && 'opacity-50')} style={{ borderBottom: `1px solid ${RULE}` }}>
                    {isEditing ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex gap-2 items-center flex-wrap">
                          <select value={editPt} onChange={e => setEditPt(e.target.value as ProductType)} className={cn(inputCls, 'w-auto')} aria-label="Product type">
                            {PRODUCT_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                          </select>
                          <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className={cn(inputCls, 'flex-1 min-w-[200px] font-medium')} aria-label="Title" />
                        </div>
                        <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={8} className={textareaCls} aria-label="Content" />
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => setEditId(null)}>Cancel</Button>
                          <Button variant="outline" size="sm" onClick={() => saveEdit(entry.id)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="m-0 text-[15px] font-medium" style={{ color: INK }}>{entry.title}</p>
                            <ProductChip pt={entry.product_type} />
                            {entry.source === 'gdrive' && <Chip>Drive</Chip>}
                            {!entry.is_active && <Chip>Inactive</Chip>}
                          </div>
                          {entry.content ? (
                            <p className="m-0 mt-1.5 text-[13px] leading-relaxed line-clamp-3" style={{ color: '#3c4043' }}>{entry.content}</p>
                          ) : (
                            <p className="m-0 mt-1.5 text-[13px]" style={{ color: MUTED }}>No content yet.</p>
                          )}
                          {entry.source === 'gdrive' && entry.gdrive_last_synced_at && (
                            <p className="m-0 mt-1.5 text-[12.5px]" style={{ color: MUTED }}>
                              Last synced {fmtDateTime(entry.gdrive_last_synced_at)}{entry.gdrive_doc_name ? ` · ${entry.gdrive_doc_name}` : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-0.5 flex-shrink-0">
                          <button type="button" onClick={() => toggleActive(entry)} aria-label={entry.is_active ? 'Deactivate' : 'Activate'} title={entry.is_active ? 'Deactivate' : 'Activate'}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-[8px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: entry.is_active ? INK : '#9aa0a6' }}>
                            {entry.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                          </button>
                          <button type="button" onClick={() => startEdit(entry)} aria-label="Edit" title="Edit"
                            className="w-8 h-8 inline-flex items-center justify-center rounded-[8px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}>
                            <Pencil size={14} />
                          </button>
                          <button type="button" onClick={() => deleteEntry(entry.id)} aria-label="Delete" title="Delete"
                            className="w-8 h-8 inline-flex items-center justify-center rounded-[8px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: '#c5221f' }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* New document dialog */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>New document</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3">
              <Field label="Product type">
                <select value={newPt} onChange={e => setNewPt(e.target.value as ProductType)} className={inputCls}>
                  {PRODUCT_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                </select>
              </Field>
              <Field label="Title">
                <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Marine cargo key selling points" className={inputCls} />
              </Field>
            </div>
            <Field label="Content" hint="For bulk import, add Google Docs to the Drive folder and use Sync from Drive.">
              <textarea value={newContent} onChange={e => setNewContent(e.target.value)} rows={7}
                placeholder="Product knowledge, selling points, coverage details, key differentiators" className={textareaCls} />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowModal(false); setNewTitle(''); setNewContent('') }}>Cancel</Button>
            <Button onClick={createEntry} disabled={creating || !newTitle.trim()}>
              {creating ? 'Saving…' : 'Save document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
