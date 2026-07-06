'use client'

import React, { useEffect, useState } from 'react'
import { Check, Sparkles, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PRODUCT_LINES, productLineLabel } from '@/lib/product-lines'
import RfqPanel from '@/components/nexus/RfqPanel'

/**
 * Inline RFQ workflow for the engagement dock. If this thread already has an RFQ
 * case, render the full RfqPanel (pick insurers → draft → attach → send → quotes
 * → chase). Otherwise offer to start one — auto-suggesting lines — without
 * leaving engagement.
 */
export default function ThreadRfqWorkflow({
  threadId, messageId, defaultInsured,
}: {
  threadId:       string
  messageId:      string | null
  defaultInsured: string
}) {
  const [caseId,  setCaseId]  = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/nexus/rfq/for-thread?thread_id=${threadId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { case_id: null })
      .then(d => { if (!cancelled) setCaseId(d.case_id ?? null) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [threadId])

  if (loading) return <div className="p-5 text-[12px] text-muted-foreground">Loading RFQ…</div>
  if (caseId)  return <RfqPanel caseId={caseId} />

  return (
    <StartInline
      threadId={threadId}
      messageId={messageId}
      defaultInsured={defaultInsured}
      onStarted={setCaseId}
    />
  )
}

// ── Inline starter (no modal) — used when the thread has no RFQ case yet ───────

function StartInline({
  threadId, messageId, defaultInsured, onStarted,
}: {
  threadId:       string
  messageId:      string | null
  defaultInsured: string
  onStarted:      (caseId: string) => void
}) {
  const [insured,   setInsured]   = useState(defaultInsured)
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [suggested, setSuggested] = useState<Set<string>>(new Set())
  const [loadingSuggest, setLoadingSuggest] = useState(true)
  const [creating,  setCreating]  = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/nexus/rfq/start', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ thread_id: threadId, message_id: messageId, suggest: true }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return
        const slugs: string[] = (data.suggested_lines ?? []).map((l: { product_line: string }) => l.product_line)
        setSuggested(new Set(slugs))
        setSelected(new Set(slugs))
        if (data.insured_name && !defaultInsured) setInsured(data.insured_name)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingSuggest(false) })
    return () => { cancelled = true }
  }, [threadId, messageId, defaultInsured])

  function toggle(slug: string) {
    setSelected(prev => { const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n })
  }

  async function create() {
    if (selected.size === 0) return
    setCreating(true); setError(null)
    try {
      const res = await fetch('/api/nexus/rfq/start', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id:     threadId,
          message_id:    messageId,
          product_lines: Array.from(selected),
          insured_name:  insured.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.case_id) throw new Error(data.error || 'Could not start RFQ')
      onStarted(data.case_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start RFQ')
      setCreating(false)
    }
  }

  return (
    <div className="p-5 flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary">
            <Sparkles size={12} strokeWidth={2.2} />
          </span>
          <h3 className="text-[13px] font-semibold text-foreground">Start a quotation request</h3>
        </div>
        <p className="text-[11.5px] text-muted-foreground mt-1">
          Turn this email into an RFQ and send it to insurers. Pick the lines of cover.
        </p>
      </div>

      <label className="flex flex-col gap-1.5 max-w-sm">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Insured / client</span>
        <input
          value={insured}
          onChange={e => setInsured(e.target.value)}
          placeholder="Company or person seeking cover"
          className="text-[12px] rounded-md border border-[--border-subtle] bg-background px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-primary/20"
        />
      </label>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between max-w-md">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Lines of cover</span>
          {loadingSuggest && <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1"><Sparkles size={10} className="animate-pulse" /> detecting…</span>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-w-2xl">
          {PRODUCT_LINES.map(p => {
            const on = selected.has(p.slug)
            return (
              <button
                key={p.slug}
                onClick={() => toggle(p.slug)}
                className={cn(
                  'flex items-center gap-2 text-left text-[11.5px] rounded-md px-2.5 py-2 border transition-colors',
                  on ? 'border-primary/40 bg-primary/[0.06] text-foreground' : 'border-[--border-subtle] text-muted-foreground hover:bg-muted',
                )}
              >
                <span className={cn('flex items-center justify-center w-3.5 h-3.5 rounded border flex-shrink-0', on ? 'bg-primary border-primary text-white' : 'border-[--border-subtle]')}>
                  {on && <Check size={9} strokeWidth={3} />}
                </span>
                <span className="truncate">{productLineLabel(p.slug)}</span>
                {suggested.has(p.slug) && <span className="ml-auto text-[9px] text-primary/70">✨</span>}
              </button>
            )
          })}
        </div>
      </div>

      {error && <p className="text-[11.5px] text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={create}
          disabled={creating || selected.size === 0}
          className="flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-40"
        >
          {creating ? 'Starting…' : <>Start RFQ <ArrowRight size={13} strokeWidth={2.2} /></>}
        </button>
        <span className="text-[11px] text-muted-foreground/70">{selected.size} line{selected.size === 1 ? '' : 's'} selected</span>
      </div>
    </div>
  )
}
