import React from 'react'

/** A numbered step heading: the order the work is done in. */
export function Step({ n, children, className }: { n: number; children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`m-0 text-[16px] font-medium tracking-[-0.01em] inline-flex items-center gap-2.5 ${className ?? ''}`}>
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-semibold tabular-nums" style={{ background: '#f1f3f4', color: '#202124' }}>{n}</span>
      {children}
    </h2>
  )
}
