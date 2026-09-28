'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Chip } from '@/components/crm/primitives'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'

type Lead = { id: string; first_name: string | null; last_name: string | null; email: string | null; company: string | null; thread_id?: string | null }

/** Picker: search existing engagement contacts/threads to reply into. */
export function ThreadSelectorModal({ onPick, onClose, busyLabel }: {
  onPick: (leadId: string) => void
  onClose: () => void
  busyLabel?: string | null   // set by the parent while prepare-reply runs
}) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [pickedId, setPickedId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/leads', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((rows: Lead[]) => setLeads(Array.isArray(rows) ? rows : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const name = (l: Lead) => [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || 'Unknown'
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    // Only real conversations — a reply + its attachments load via the thread, so a lead with no
    // thread would silently drop the draft/attachments.
    const withThread = leads.filter(l => l.thread_id)
    const base = s ? withThread.filter(l => `${name(l)} ${l.email ?? ''} ${l.company ?? ''}`.toLowerCase().includes(s)) : withThread
    return base.slice(0, 60)
  }, [leads, q])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" style={{ background: 'rgba(32,33,36,0.28)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="thread-pick" className="w-full max-w-[560px] rounded-[16px] bg-white flex flex-col max-h-[76vh]" style={{ boxShadow: '0 24px 64px rgba(32,33,36,0.2)', color: INK }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 id="thread-pick" className="m-0 text-[20px] font-medium tracking-[-0.01em]">Reply to a thread</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><X size={16} /></button>
        </div>
        <div className="px-6 pb-3">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#9aa0a6' }} />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, email or company" aria-label="Search conversations"
              className="w-full h-10 rounded-[10px] border border-[#dadce0] bg-white pl-10 pr-3.5 text-[14px] outline-none focus:border-[#202124] placeholder:text-[#80868b]" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {loading ? <div className="py-10 flex justify-center"><Loader2 size={18} className="animate-spin" style={{ color: MUTED }} /></div>
          : filtered.length === 0 ? <p className="m-0 py-10 text-center text-[14px]" style={{ color: MUTED }}>{q ? 'No matching conversations.' : 'No email conversations yet. Reply is available once a thread exists.'}</p>
          : (
            <ul className="m-0 p-0 list-none flex flex-col gap-0.5">
              {filtered.map(l => (
                <li key={l.id}>
                  <button type="button" disabled={!!busyLabel} onClick={() => { setPickedId(l.id); onPick(l.id) }}
                    className={cn('w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[10px] text-left border-0 cursor-pointer disabled:opacity-60 hover:bg-[#f8f9fa]', pickedId === l.id ? 'bg-[#f1f3f4]' : 'bg-transparent')}>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium truncate" style={{ color: INK }}>{name(l)}</span>
                      <span className="block text-[12.5px] truncate" style={{ color: MUTED }}>{l.email}{l.company ? ` · ${l.company}` : ''}</span>
                    </span>
                    <span className="flex items-center shrink-0">
                      {pickedId === l.id && busyLabel ? <Loader2 size={13} className="animate-spin" style={{ color: MUTED }} />
                        : l.thread_id ? <Chip>Thread</Chip> : <Chip>New</Chip>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {busyLabel && <div className="px-6 py-3 text-[13px] flex items-center gap-2" style={{ borderTop: `1px solid ${RULE}`, color: MUTED }}><Loader2 size={13} className="animate-spin" /> {busyLabel}</div>}
      </div>
    </div>
  )
}
