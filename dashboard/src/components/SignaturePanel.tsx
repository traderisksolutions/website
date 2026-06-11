'use client'

import React, { useEffect, useState } from 'react'

interface UserSignature {
  id:               string
  name:             string
  title:            string | null
  phone:            string | null
  email:            string | null
  company_tagline:  string | null
  is_active:        boolean
}

const inputStyle: React.CSSProperties = {
  width: '100%', fontSize: 12, padding: '7px 10px',
  border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff',
  color: '#111', boxSizing: 'border-box',
}

export default function SignaturePanel() {
  const [sigs,       setSigs]       = useState<UserSignature[]>([])
  const [loading,    setLoading]    = useState(true)
  const [editId,     setEditId]     = useState<string | null>(null)
  const [showForm,   setShowForm]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', title: '', phone: '', email: '', company_tagline: '' })

  useEffect(() => {
    fetch('/api/signatures')
      .then(r => r.ok ? r.json() : [])
      .then(setSigs)
      .catch(() => setSigs([]))
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError(null)
    try {
      const payload = {
        name:            form.name.trim(),
        title:           form.title.trim()           || null,
        phone:           form.phone.trim()           || null,
        email:           form.email.trim()           || null,
        company_tagline: form.company_tagline.trim() || null,
      }
      if (editId) {
        const res     = await fetch(`/api/signatures/${editId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const updated = await res.json()
        setSigs(prev => prev.map(s => s.id === editId ? { ...s, ...updated } : s))
        setEditId(null)
      } else {
        const res     = await fetch('/api/signatures', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const created = await res.json()
        setSigs(prev => [...prev, created])
        setShowForm(false)
      }
      setForm({ name: '', title: '', phone: '', email: '', company_tagline: '' })
    } catch { setError('Save failed') }
    finally { setSaving(false) }
  }

  async function toggleActive(sig: UserSignature) {
    await fetch(`/api/signatures/${sig.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !sig.is_active }),
    })
    setSigs(prev => prev.map(s => s.id === sig.id ? { ...s, is_active: !sig.is_active } : s))
  }

  async function deleteSig(id: string) {
    await fetch(`/api/signatures/${id}`, { method: 'DELETE' })
    setSigs(prev => prev.filter(s => s.id !== id))
    setConfirmDel(null)
  }

  function startEdit(sig: UserSignature) {
    setEditId(sig.id)
    setForm({
      name:            sig.name,
      title:           sig.title           ?? '',
      phone:           sig.phone           ?? '',
      email:           sig.email           ?? '',
      company_tagline: sig.company_tagline ?? '',
    })
    setShowForm(false)
  }

  function cancelEdit() {
    setEditId(null)
    setForm({ name: '', title: '', phone: '', email: '', company_tagline: '' })
  }

  return (
    <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111' }}>Email Signatures</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#aaa' }}>Select a signature when sending replies from the Engagement view</p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); cancelEdit() }}
          style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 8, border: '1px solid #1d4ed8', background: '#1d4ed8', color: '#fff', cursor: 'pointer' }}
        >
          + Add Signature
        </button>
      </div>

      {(showForm || editId) && (
        <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
          <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 600, color: '#374151' }}>
            {editId ? 'Edit Signature' : 'New Signature'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Full Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Jarod Hong" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Title</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Risk Analyst" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Phone</label>
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="e.g. +65 9123 4567" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Email Address</label>
              <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="e.g. jarod@trade-risksol.com" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Company Tagline / Website</label>
              <input value={form.company_tagline} onChange={e => setForm(p => ({ ...p, company_tagline: e.target.value }))} placeholder="e.g. Trade Risk Solutions | www.trade-risksol.com" style={inputStyle} />
            </div>
          </div>
          {error && <p style={{ margin: '0 0 8px', fontSize: 11, color: '#ef4444' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving}
              style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#1d4ed8', color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { cancelEdit(); setShowForm(false) }}
              style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: '8px 0' }}>
        {loading && <p style={{ margin: '16px 20px', fontSize: 13, color: '#bbb' }}>Loading…</p>}
        {!loading && sigs.length === 0 && !showForm && (
          <p style={{ margin: '16px 20px', fontSize: 13, color: '#bbb', fontStyle: 'italic' }}>No signatures yet. Add one above.</p>
        )}
        {sigs.map(sig => (
          <div key={sig.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 20px', borderBottom: '1px solid #f5f5f5',
            background: editId === sig.id ? '#eff6ff' : '#fff',
            opacity: sig.is_active ? 1 : 0.5,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111' }}>{sig.name}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#888' }}>
                {[sig.title, sig.phone, sig.email].filter(Boolean).join(' · ') || 'No details set'}
              </p>
              {sig.company_tagline && (
                <p style={{ margin: '1px 0 0', fontSize: 11, color: '#bbb' }}>{sig.company_tagline}</p>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button onClick={() => toggleActive(sig)}
                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, border: '1px solid', cursor: 'pointer',
                  borderColor: sig.is_active ? '#bbf7d0' : '#e5e7eb',
                  background:  sig.is_active ? '#f0fdf4' : '#f9fafb',
                  color:       sig.is_active ? '#15803d' : '#9ca3af' }}>
                {sig.is_active ? 'Active' : 'Inactive'}
              </button>
              <button onClick={() => startEdit(sig)}
                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer' }}>
                Edit
              </button>
              {confirmDel === sig.id ? (
                <>
                  <button onClick={() => deleteSig(sig.id)}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer' }}>
                    Confirm
                  </button>
                  <button onClick={() => setConfirmDel(null)}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirmDel(sig.id)}
                  style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#ef4444', cursor: 'pointer' }}>
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
