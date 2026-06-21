'use client'

// Shared doc typography components used across all /overview/* section pages.
// CollapsibleSection uses useState, so this file must stay 'use client'.
// Importing pages must also be client components.

import { useState } from 'react'

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[18px] font-bold text-foreground tracking-tight mb-1.5">{children}</h2>
}

export function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15px] font-semibold text-foreground tracking-tight mb-1 mt-6">{children}</h3>
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">{children}</p>
}

export function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] text-muted-foreground leading-[1.7] mb-5">{children}</p>
}

export function Callout({ color, children }: { color: string; children: React.ReactNode }) {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    blue:   { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' },
    amber:  { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
    green:  { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
    purple: { bg: '#f5f3ff', border: '#c4b5fd', text: '#6d28d9' },
  }
  const c = colors[color] ?? colors.blue
  return (
    <div className="rounded-lg px-4 py-3 mb-4"
      style={{ background: c.bg, border: `1px solid ${c.border}`, borderLeft: `4px solid ${c.border}` }}>
      <p className="text-[13px] leading-[1.65] m-0" style={{ color: c.text }}>{children}</p>
    </div>
  )
}

export function Steps({ items }: { items: { title: string; body: React.ReactNode }[] }) {
  return (
    <div className="flex flex-col mb-5">
      {items.map((item, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center flex-shrink-0">
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[12px] font-bold text-primary-foreground flex-shrink-0">
              {i + 1}
            </div>
            {i < items.length - 1 && <div className="w-0.5 flex-1 bg-border my-1" />}
          </div>
          <div className={i < items.length - 1 ? 'pb-5 pt-1' : 'pt-1'}>
            <p className="text-[13px] font-semibold text-foreground mb-1">{item.title}</p>
            <div className="text-[13px] text-muted-foreground leading-[1.65]">{item.body}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function Badge({ label, color }: { label: string; color: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    blue:   { bg: '#E6F4FF',                text: '#1677FF' },
    amber:  { bg: 'rgba(245,158,11,0.12)',  text: '#b45309' },
    purple: { bg: 'rgba(124,58,237,0.10)',  text: '#7c3aed' },
    orange: { bg: 'rgba(217,119,6,0.10)',   text: '#d97706' },
    green:  { bg: 'rgba(5,150,105,0.10)',   text: '#059669' },
    gray:   { bg: 'rgba(107,114,128,0.10)', text: '#4b5563' },
  }
  const c = map[color] ?? map.blue
  return (
    <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full mr-1.5 mb-1"
      style={{ background: c.bg, color: c.text }}>
      {label}
    </span>
  )
}

export function Divider() {
  return <div className="h-px bg-border my-5" />
}

export function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-0.5">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full text-left rounded-md cursor-pointer px-2.5 py-2 border-0 transition-colors hover:bg-muted/50"
        style={{ background: open ? 'hsl(var(--muted) / 0.4)' : 'transparent' }}
      >
        <span
          className="text-[10px] text-muted-foreground flex-shrink-0 transition-transform duration-150"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', lineHeight: 1 }}
        >
          ▶
        </span>
        <span
          className="text-[14px] font-bold tracking-tight"
          style={{ color: open ? 'hsl(var(--foreground))' : 'hsl(var(--foreground) / 0.7)' }}
        >
          {title}
        </span>
      </button>
      {open && (
        <div className="pl-6 pt-2 pb-1">
          {children}
        </div>
      )}
    </div>
  )
}
