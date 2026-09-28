'use client'

import { useEffect, useState } from 'react'

// Thin progress bar with an optional step label + percentage: an ink bar on a #e8eaed track.
// Used under the AI-Analysis "Generate" and the reply panel's Assist menu (#3).
//
// Pass `value` (0–100) for a determinate, filling bar with a "· 42%" readout — the
// AI calls have no true progress signal, so callers drive it with useFauxProgress
// (a monotonic ease toward ~92% while active, snapping to 100 on completion).
export function InlineProgress({ label, value, className = '' }: { label?: string; value?: number; className?: string }) {
  const determinate = typeof value === 'number'
  const pct = determinate ? Math.max(0, Math.min(100, value!)) : 0
  return (
    <div className={`flex flex-col gap-1.5 ${className}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={determinate ? Math.round(pct) : undefined}>
      {label && (
        <span className="text-[12.5px] flex items-center gap-1.5" style={{ color: '#80868b' }}>
          <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#202124' }} aria-hidden />
          {label}{determinate && <span className="tabular-nums">· {Math.round(pct)}%</span>}
        </span>
      )}
      <div className="relative h-1 w-full overflow-hidden rounded-full" style={{ background: '#e8eaed' }}>
        {determinate ? (
          <span
            className="absolute left-0 top-0 h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%`, background: '#202124' }}
          />
        ) : (
          <span className="absolute top-0 h-full rounded-full animate-trs-indeterminate" style={{ background: '#202124', opacity: 0.7 }} />
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
