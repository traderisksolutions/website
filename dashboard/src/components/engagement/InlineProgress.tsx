'use client'

import { useEffect, useState } from 'react'

// Thin progress bar with an optional step label + percentage. Used under the
// AI-Analysis "Generate" and Reply "Generate reply" buttons (#3).
//
// Pass `value` (0–100) for a determinate, filling bar with a "· 42%" readout — the
// AI calls have no true progress signal, so callers drive it with useFauxProgress
// (a monotonic ease toward ~92% while active, snapping to 100 on completion).
export function InlineProgress({ label, value, className = '' }: { label?: string; value?: number; className?: string }) {
  const determinate = typeof value === 'number'
  const pct = determinate ? Math.max(0, Math.min(100, value!)) : 0
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <span className="text-[10px] font-medium text-primary/80 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          {label}{determinate && <span className="tabular-nums text-primary/60">· {Math.round(pct)}%</span>}
        </span>
      )}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
        {determinate ? (
          <span
            className="absolute left-0 top-0 h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        ) : (
          <span className="absolute top-0 h-full rounded-full bg-primary/70 animate-trs-indeterminate" />
        )}
      </div>
    </div>
  )
}

// Simulated progress for an operation with no real progress signal: eases toward a
// ceiling (~92%) while `active`, resets to 0 when it ends. Reads as steady forward
// motion with a real percentage, rather than a meaningless sweeping segment.
export function useFauxProgress(active: boolean): number {
  const [pct, setPct] = useState(0)
  useEffect(() => {
    if (!active) { setPct(0); return }
    setPct(6)
    const iv = setInterval(() => {
      setPct(p => (p < 92 ? p + Math.max(0.6, (92 - p) * 0.08) : p))
    }, 200)
    return () => clearInterval(iv)
  }, [active])
  return pct
}
