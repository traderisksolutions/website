'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BookMarked, Plus, RefreshCw, Loader2, AlertCircle,
  Pencil, Trash2, Check, X, ToggleLeft, ToggleRight,
  CloudOff, Cloud,
} from 'lucide-react'

const PRODUCT_TYPES = ['Business Assets', 'Business Liabilities', 'Workforce', 'API', 'General'] as const
type ProductType = typeof PRODUCT_TYPES[number]

const PT_COLORS: Record<ProductType, { color: string; bg: string }> = {
  'Business Assets':      { color: '#92400e', bg: '#fef3c7' },
  'Business Liabilities': { color: '#1e40af', bg: '#dbeafe' },
  'Workforce':            { color: '#5b21b6', bg: '#ede9fe' },
  'API':                  { color: '#065f46', bg: '#d1fae5' },
  'General':              { color: '#555',    bg: '#f4f4f5' },
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

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, padding: '16px 18px',
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
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookMarked size={18} style={{ color: '#888' }} />
            Product Knowledge
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#aaa' }}>
            AI uses these docs when drafting campaign emails. Source from Google Drive or add manually.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={syncFromDrive}
            disabled={syncing}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 13px', borderRadius: 7, border: '1px solid #e5e5e5',
              background: '#fff', color: '#444', fontSize: 12, fontWeight: 500, cursor: syncing ? 'default' : 'pointer',
              opacity: syncing ? 0.6 : 1,
            }}
          >
            {syncing
              ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              : <RefreshCw size={12} />
            }
            {syncing ? 'Syncing…' : 'Sync from Drive'}
          </button>
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: '#111', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={13} /> New Entry
          </button>
        </div>
      </div>

      {/* GDrive status bar */}
      <div style={{
        ...card, padding: '12px 16px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        {gdriveDocs.length > 0
          ? <Cloud size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
          : <CloudOff size={14} style={{ color: '#ccc', flexShrink: 0 }} />
        }
        <span style={{ fontSize: 12, color: '#555', flex: 1 }}>
          {gdriveDocs.length > 0
            ? `${gdriveDocs.length} doc${gdriveDocs.length !== 1 ? 's' : ''} synced from Google Drive${lastSynced ? ` · Last sync: ${new Date(lastSynced).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}`
            : 'No Google Drive docs synced yet.'
          }
        </span>
        <span style={{ fontSize: 11, color: '#aaa' }}>
          Folder ID: <code style={{ fontFamily: 'monospace', background: '#f4f4f5', padding: '1px 4px', borderRadius: 3 }}>
            {process.env.NEXT_PUBLIC_GDRIVE_FOLDER_HINT ?? 'GDRIVE_KNOWLEDGE_FOLDER_ID env var'}
          </code>
        </span>
      </div>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', marginBottom: 14,
          borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13,
        }}>
          <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}>×</button>
        </div>
      )}

      {syncResult && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 14,
          borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: 13,
        }}>
          <Check size={14} />
          <span style={{ flex: 1 }}>{syncResult}</span>
          <button onClick={() => setSyncResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}>×</button>
        </div>
      )}

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {['all', ...PRODUCT_TYPES].map(pt => {
          const count  = pt === 'all' ? entries.length : entries.filter(e => e.product_type === pt).length
          const active = filterPt === pt
          return (
            <button
              key={pt}
              onClick={() => setFilterPt(pt)}
              style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: active ? 600 : 400,
                border: `1px solid ${active ? '#111' : '#e5e5e5'}`,
                background: active ? '#111' : '#fafafa',
                color: active ? '#fff' : '#555', cursor: 'pointer',
              }}
            >
              {pt === 'all' ? 'All' : pt} {count > 0 && <span style={{ opacity: 0.6 }}>({count})</span>}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#ccc' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px 24px' }}>
          <BookMarked size={28} style={{ color: '#e5e5e5', marginBottom: 10 }} />
          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#555' }}>
            {filterPt === 'all' ? 'No knowledge entries yet' : `No entries for ${filterPt}`}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#aaa' }}>
            Sync from Google Drive or add manually. Gemini will use these when drafting emails.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(entry => {
            const isEditing = editId === entry.id
            const ptColor   = PT_COLORS[entry.product_type] ?? PT_COLORS.General
            return (
              <div key={entry.id} style={{
                ...card,
                opacity: entry.is_active ? 1 : 0.5,
                borderLeft: `3px solid ${entry.is_active ? ptColor.color : '#e5e5e5'}`,
              }}>
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <select
                        value={editPt}
                        onChange={e => setEditPt(e.target.value as ProductType)}
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e5e5', background: '#fafafa', color: '#111' }}
                      >
                        {PRODUCT_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                      </select>
                      <input
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e5e5', background: '#fafafa', color: '#111' }}
                      />
                    </div>
                    <textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      rows={8}
                      style={{ width: '100%', fontSize: 12, padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e5e5', background: '#fafafa', color: '#333', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditId(null)} style={{ padding: '5px 12px', fontSize: 12, borderRadius: 6, border: '1px solid #e5e5e5', background: '#fff', color: '#555', cursor: 'pointer' }}>
                        Cancel
                      </button>
                      <button
                        onClick={() => saveEdit(entry.id)}
                        disabled={saving}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', background: '#111', color: '#fff', cursor: 'pointer' }}
                      >
                        {saving ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={11} />}
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, flexShrink: 0,
                        color: ptColor.color, background: ptColor.bg,
                      }}>
                        {entry.product_type}
                      </span>
                      {entry.source === 'gdrive' && (
                        <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 500, color: '#2563eb', background: '#dbeafe', flexShrink: 0 }}>
                          Drive
                        </span>
                      )}
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111', flex: 1 }}>{entry.title}</p>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={() => toggleActive(entry)}
                          title={entry.is_active ? 'Deactivate' : 'Activate'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: entry.is_active ? '#22c55e' : '#ccc' }}
                        >
                          {entry.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        </button>
                        <button
                          onClick={() => startEdit(entry)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: '#888' }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: '#f87171' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    {entry.content ? (
                      <p style={{
                        margin: 0, fontSize: 12, color: '#666', lineHeight: 1.6,
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                      }}>
                        {entry.content}
                      </p>
                    ) : (
                      <p style={{ margin: 0, fontSize: 12, color: '#ccc', fontStyle: 'italic' }}>No content yet — click edit to add.</p>
                    )}
                    {entry.source === 'gdrive' && entry.gdrive_last_synced_at && (
                      <p style={{ margin: '6px 0 0', fontSize: 10, color: '#bbb' }}>
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
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 30px', maxWidth: 520, width: '92%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <p style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: '#111' }}>New Knowledge Entry</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Product Type *
                  </label>
                  <select
                    value={newPt}
                    onChange={e => setNewPt(e.target.value as ProductType)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 7, border: '1px solid #e5e5e5', background: '#fafafa', color: '#111' }}
                  >
                    {PRODUCT_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                  </select>
                </div>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Title *
                  </label>
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="e.g. Marine Cargo Key Selling Points"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 7, border: '1px solid #e5e5e5', background: '#fafafa', color: '#111', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Content
                </label>
                <textarea
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  rows={7}
                  placeholder="Paste product knowledge, selling points, coverage details, key differentiators…"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 7, border: '1px solid #e5e5e5', background: '#fafafa', color: '#333', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}
                />
              </div>
              <p style={{ margin: 0, fontSize: 11, color: '#aaa', lineHeight: 1.5 }}>
                Tip: for bulk import, add Google Docs to your Drive folder and use <strong>Sync from Drive</strong>.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => { setShowModal(false); setNewTitle(''); setNewContent('') }} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #e5e5e5', background: '#fff', color: '#333', fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={createEntry}
                disabled={creating || !newTitle.trim()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: '#111', color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: creating || !newTitle.trim() ? 'default' : 'pointer',
                  opacity: creating || !newTitle.trim() ? 0.45 : 1,
                }}
              >
                {creating ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />}
                {creating ? 'Saving…' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        textarea { outline: none; }
        input { outline: none; }
        select { outline: none; }
      `}</style>
    </div>
  )
}
