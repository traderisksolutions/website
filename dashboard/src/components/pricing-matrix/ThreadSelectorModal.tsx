'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Loader2, X, MessageSquare, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

type Lead = { id: string; first_name: string | null; last_name: string | null; email: string | null; company: string | null; thread_id?: string | null }

/** Nexus-style picker: search existing engagement contacts/threads to reply into. */
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-card shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h3 className="text-[14px] font-bold text-foreground">Reply to a thread</h3>
          <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="px-5 pt-3">
          <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
            <Search size={14} className="text-muted-foreground/50" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, email or company…"
              className="flex-1 text-[13px] bg-transparent focus:outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading ? <div className="py-10 text-center"><Loader2 size={18} className="animate-spin text-muted-foreground mx-auto" /></div>
          : filtered.length === 0 ? <p className="py-10 text-center text-[12.5px] text-muted-foreground">{q ? 'No matching conversations.' : 'No email conversations yet — reply is available once a thread exists.'}</p>
          : (
            <ul className="flex flex-col gap-0.5">
              {filtered.map(l => (
                <li key={l.id}>
                  <button disabled={!!busyLabel} onClick={() => { setPickedId(l.id); onPick(l.id) }}
                    className={cn('w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left hover:bg-muted/50 disabled:opacity-60',
                      pickedId === l.id && 'bg-primary/5')}>
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-medium text-foreground truncate">{name(l)}</span>
                      <span className="block text-[11px] text-muted-foreground/70 truncate">{l.email}{l.company ? ` · ${l.company}` : ''}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide">
                      {pickedId === l.id && busyLabel ? <Loader2 size={13} className="animate-spin text-primary" />
                        : l.thread_id ? <span className="inline-flex items-center gap-1 text-primary"><MessageSquare size={12} /> Thread</span>
                        : <span className="inline-flex items-center gap-1 text-muted-foreground/50"><Mail size={12} /> New</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {busyLabel && <div className="px-5 py-2.5 border-t border-border text-[11.5px] text-muted-foreground flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> {busyLabel}</div>}
      </div>
    </div>
  )
}
