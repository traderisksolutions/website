'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Sparkles, ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PRODUCT_LINES, productLineLabel } from '@/lib/product-lines'

/**
 * Manual "Start RFQ" workflow — the escape hatch when auto-detection misses an
 * RFQ. Apple frosted-glass sheet: auto-suggests lines, employee confirms, we
 * open a Nexus case and route to it.
 */
export default function StartRfqModal({
  threadId, messageId, defaultInsured, onClose,
}: {
  threadId:       string
  messageId:      string | null
  defaultInsured: string
  onClose:        () => void
}) {
  const router = useRouter()
  const [insured,   setInsured]   = useState(defaultInsured)
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [suggested, setSuggested] = useState<Set<string>>(new Set())
  const [loadingSuggest, setLoadingSuggest] = useState(true)
  const [creating,  setCreating]  = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  // Auto-detect candidate lines on open (no writes) → pre-tick them.
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
    setSelected(prev => {
      const next = new Set(prev)
      next.has(slug) ? next.delete(slug) : next.add(slug)
      return next
    })
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
      router.push(`/nexus?case=${data.case_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start RFQ')
      setCreating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/25 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={cn(
          'w-full max-w-md rounded-2xl overflow-hidden',
          'bg-white/75 dark:bg-neutral-900/75 backdrop-blur-2xl',
          'ring-1 ring-black/[0.06] shadow-2xl',
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary">
                <Sparkles size={13} strokeWidth={2.2} />
              </span>
              <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Start a quotation request</h2>
            </div>
            <p className="text-[12px] text-muted-foreground mt-1.5 leading-snug">
              Turn this email into an RFQ and send it to insurers. Pick the lines of cover.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground transition-colors -mt-0.5">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          {/* Insured */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Insured / client</span>
            <input
              value={insured}
              onChange={e => setInsured(e.target.value)}
              placeholder="Company or person seeking cover"
              className="text-[13px] rounded-lg border border-black/[0.08] bg-white/60 dark:bg-white/[0.04] px-3 py-2 outline-none focus:ring-2 focus:ring-primary/25"
            />
          </label>

          {/* Product lines */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Lines of cover</span>
              {loadingSuggest && (
                <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                  <Sparkles size={10} className="animate-pulse" /> detecting…
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-0.5">
              {PRODUCT_LINES.map(p => {
                const on = selected.has(p.slug)
                return (
                  <button
                    key={p.slug}
                    onClick={() => toggle(p.slug)}
                    className={cn(
                      'flex items-center gap-2 text-left text-[12px] rounded-lg px-2.5 py-2 border transition-all',
                      on
                        ? 'border-primary/40 bg-primary/[0.07] text-foreground'
                        : 'border-black/[0.06] bg-white/40 dark:bg-white/[0.02] text-muted-foreground hover:border-black/15',
                    )}
                  >
                    <span className={cn(
                      'flex items-center justify-center w-4 h-4 rounded-[5px] border flex-shrink-0 transition-colors',
                      on ? 'bg-primary border-primary text-white' : 'border-black/20',
                    )}>
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="truncate">{productLineLabel(p.slug)}</span>
                    {suggested.has(p.slug) && (
                      <span className="ml-auto text-[9px] font-semibold text-primary/70">✨</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {error && <p className="text-[11.5px] text-destructive">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[11px] text-muted-foreground/70">
              {selected.size} line{selected.size === 1 ? '' : 's'} selected
            </span>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="text-[12px] px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
              <button
                onClick={create}
                disabled={creating || selected.size === 0}
                className="flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 transition-opacity"
              >
                {creating ? 'Starting…' : <>Start RFQ <ArrowRight size={13} strokeWidth={2.2} /></>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
