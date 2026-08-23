'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BookMarked, Plus, RefreshCw, Loader2, AlertCircle,
  Pencil, Trash2, Check, X, ToggleLeft, ToggleRight,
  CloudOff, Cloud,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppScrollPage, AppPageHeader } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

const PRODUCT_TYPES = ['Business Assets', 'Business Liabilities', 'Workforce', 'API', 'General'] as const
type ProductType = typeof PRODUCT_TYPES[number]

// A categorical tag legend (not a status vocabulary), kept local and centralized here rather
// than scattered inline hex per usage.
const PT_COLORS: Record<ProductType, { color: string; bg: string }> = {
  'Business Assets':      { color: '#92400e', bg: '#fef3c7' },
  'Business Liabilities': { color: '#1e40af', bg: '#dbeafe' },
  'Workforce':            { color: '#5b21b6', bg: '#ede9fe' },
  'API':                  { color: '#065f46', bg: '#d1fae5' },
  'General':              { color: 'hsl(var(--muted-foreground))', bg: 'hsl(var(--muted))' },
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

export default function KnowledgePage() {
  const [entries,    setEntries]    = useState<KnowledgeEntry[]>([])
  const [loading,    setLoading]    = useState(true)
  const [filterPt,   setFilterPt]   = useState<string>('all')
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

  const filtered = filterPt === 'all'
    ? entries
    : entries.filter(e => e.product_type === filterPt)

  async function syncFromDrive() {
    setSyncing(true)
    setSyncResult(null)
    setError(null)
    try {
      const res  = await fetch('/api/outbound/knowledge/sync', { method: 'POST' })
      const data = await res.json()
      if (data.code === 'GDRIVE_NOT_CONFIGURED') {
        setError('Google Drive not configured — add GDRIVE_SERVICE_ACCOUNT_KEY and GDRIVE_KNOWLEDGE_FOLDER_ID to Vercel env vars')
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

  return (
    <AppScrollPage maxWidth="900px">
      <AppPageHeader
        title="Product Knowledge"
        description="AI uses these docs when drafting campaign emails. Source from Google Drive or add manually."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={syncFromDrive} disabled={syncing} className="gap-1.5">
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {syncing ? 'Syncing…' : 'Sync from Drive'}
            </Button>
            <Button size="sm" onClick={() => setShowModal(true)} className="gap-1.5">
              <Plus size={13} /> New Entry
            </Button>
          </div>
        }
      />

      {/* GDrive status bar */}
      <div className="flex items-center gap-2.5 flex-wrap rounded-[10px] px-4 py-3 mb-4 bg-card" style={{ boxShadow: 'var(--card-shadow)' }}>
        {gdriveDocs.length > 0
          ? <Cloud size={14} className="flex-shrink-0" style={{ color: 'var(--success)' }} />
          : <CloudOff size={14} className="flex-shrink-0 text-muted-foreground/40" />
        }
        <span className="text-[12px] text-muted-foreground flex-1">
          {gdriveDocs.length > 0
            ? `${gdriveDocs.length} doc${gdriveDocs.length !== 1 ? 's' : ''} synced from Google Drive${lastSynced ? ` · Last sync: ${new Date(lastSynced).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}`
            : 'No Google Drive docs synced yet.'
          }
        </span>
        <span className="text-[11px] text-muted-foreground/60">
          Folder ID: <code className="font-mono bg-muted px-1 rounded-[3px]">
            {process.env.NEXT_PUBLIC_GDRIVE_FOLDER_HINT ?? 'GDRIVE_KNOWLEDGE_FOLDER_ID env var'}
          </code>
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-3.5 py-2.5 mb-3.5 rounded-lg text-[13px]" style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border, var(--error))', color: 'var(--error)' }}>
          <AlertCircle size={14} className="mt-px flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="bg-transparent border-none cursor-pointer" style={{ color: 'var(--error)' }}><X size={14} /></button>
        </div>
      )}

      {syncResult && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 mb-3.5 rounded-lg text-[13px]" style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success)' }}>
          <Check size={14} />
          <span className="flex-1">{syncResult}</span>
          <button onClick={() => setSyncResult(null)} className="bg-transparent border-none cursor-pointer" style={{ color: 'var(--success)' }}><X size={14} /></button>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {['all', ...PRODUCT_TYPES].map(pt => {
          const count = pt === 'all' ? entries.length : entries.filter(e => e.product_type === pt).length
          return (
            <button key={pt} onClick={() => setFilterPt(pt)} aria-pressed={filterPt === pt} className={cn('filter-pill', filterPt === pt && 'active')}>
              {pt === 'all' ? 'All' : pt} {count > 0 && <span className="opacity-60">({count})</span>}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={20} className="animate-spin text-muted-foreground/40" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon-wrap"><BookMarked size={20} /></div>
          <p className="empty-title">{filterPt === 'all' ? 'No knowledge entries yet' : `No entries for ${filterPt}`}</p>
          <p className="empty-desc">Sync from Google Drive or add manually. Gemini will use these when drafting emails.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(entry => {
            const isEditing = editId === entry.id
            const ptColor   = PT_COLORS[entry.product_type] ?? PT_COLORS.General
            return (
              <div
                key={entry.id}
                className="rounded-[10px] px-[18px] py-4 bg-card"
                style={{ boxShadow: 'var(--card-shadow)', opacity: entry.is_active ? 1 : 0.5, borderLeft: `3px solid ${entry.is_active ? ptColor.color : 'var(--border-subtle)'}` }}
              >
                {isEditing ? (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex gap-2 items-center">
                      <select
                        value={editPt}
                        onChange={e => setEditPt(e.target.value as ProductType)}
                        className="text-[12px] px-2 py-1 rounded-md bg-muted text-foreground"
                        style={{ border: '1px solid var(--border-subtle)' }}
                      >
                        {PRODUCT_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                      </select>
                      <input
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        className="flex-1 text-[13px] font-semibold px-2 py-1.5 rounded-md bg-muted text-foreground"
                        style={{ border: '1px solid var(--border-subtle)' }}
                      />
                    </div>
                    <textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      rows={8}
                      className="w-full text-[12px] px-2.5 py-2 rounded-md bg-muted text-foreground/90 resize-y font-[inherit] leading-relaxed box-border"
                      style={{ border: '1px solid var(--border-subtle)' }}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditId(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => saveEdit(entry.id)} disabled={saving} className="gap-1.5">
                        {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start gap-2 mb-1.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0" style={{ color: ptColor.color, background: ptColor.bg }}>
                        {entry.product_type}
                      </span>
                      {entry.source === 'gdrive' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0" style={{ color: '#2563eb', background: '#dbeafe' }}>
                          Drive
                        </span>
                      )}
                      <p className="m-0 text-[13px] font-semibold text-foreground flex-1">{entry.title}</p>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => toggleActive(entry)} title={entry.is_active ? 'Deactivate' : 'Activate'} className="bg-transparent border-none cursor-pointer p-[3px]" style={{ color: entry.is_active ? 'var(--success)' : 'hsl(var(--muted-foreground) / 0.4)' }}>
                          {entry.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        </button>
                        <button onClick={() => startEdit(entry)} className="bg-transparent border-none cursor-pointer p-[3px] text-muted-foreground">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteEntry(entry.id)} className="bg-transparent border-none cursor-pointer p-[3px]" style={{ color: 'var(--error)' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    {entry.content ? (
                      <p className="m-0 text-[12px] text-muted-foreground leading-relaxed overflow-hidden line-clamp-3">
                        {entry.content}
                      </p>
                    ) : (
                      <p className="m-0 text-[12px] text-muted-foreground/40 italic">No content yet — click edit to add.</p>
                    )}
                    {entry.source === 'gdrive' && entry.gdrive_last_synced_at && (
                      <p className="mt-1.5 mb-0 text-[10px] text-muted-foreground/50">
                        Last synced {new Date(entry.gdrive_last_synced_at).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })}
                        {entry.gdrive_doc_name ? ` · ${entry.gdrive_doc_name}` : ''}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* New entry modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>New Knowledge Entry</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex gap-2.5">
              <div className="flex-1">
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1 uppercase tracking-wide">Product Type *</label>
                <select
                  value={newPt}
                  onChange={e => setNewPt(e.target.value as ProductType)}
                  className="w-full px-2.5 py-2 text-[13px] rounded-[7px] bg-muted text-foreground"
                  style={{ border: '1px solid var(--border-subtle)' }}
                >
                  {PRODUCT_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                </select>
              </div>
              <div className="flex-[2]">
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1 uppercase tracking-wide">Title *</label>
                <input
                  autoFocus
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g. Marine Cargo Key Selling Points"
                  className="w-full px-2.5 py-2 text-[13px] rounded-[7px] bg-muted text-foreground box-border"
                  style={{ border: '1px solid var(--border-subtle)' }}
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground block mb-1 uppercase tracking-wide">Content</label>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                rows={7}
                placeholder="Paste product knowledge, selling points, coverage details, key differentiators…"
                className="w-full px-2.5 py-2 text-[12px] rounded-[7px] bg-muted text-foreground/90 resize-y font-[inherit] leading-relaxed box-border"
                style={{ border: '1px solid var(--border-subtle)' }}
              />
            </div>
            <p className="m-0 text-[11px] text-muted-foreground/60 leading-relaxed">
              Tip: for bulk import, add Google Docs to your Drive folder and use <strong>Sync from Drive</strong>.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowModal(false); setNewTitle(''); setNewContent('') }}>Cancel</Button>
            <Button onClick={createEntry} disabled={creating || !newTitle.trim()} className="gap-1.5">
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {creating ? 'Saving…' : 'Save Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppScrollPage>
  )
}
