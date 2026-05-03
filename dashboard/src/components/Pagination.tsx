'use client'

import React from 'react'

const T = {
  activeBg:      '#111',
  activeColor:   '#fff',
  hoverBg:       '#f4f4f5',
  disabledColor: '#d1d5db',
  border:        '#e5e5e5',
  text:          '#555',
}

function buildRange(totalPages: number, current: number, delta = 2): (number | '…')[] {
  const out: (number | '…')[] = []
  let last: number | null = null
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= current - delta && i <= current + delta)) {
      if (last !== null && i - last > 1) out.push('…')
      out.push(i)
      last = i
    }
  }
  return out
}

interface PaginationProps {
  total:    number
  page:     number
  perPage:  number
  onChange: (page: number) => void
  compact?: boolean
}

export default function Pagination({ total, page, perPage, onChange, compact = false }: PaginationProps) {
  const totalPages = Math.ceil(total / perPage)
  if (totalPages <= 1) return null

  const pages   = buildRange(totalPages, page)
  const atFirst = page === 1
  const atLast  = page === totalPages

  return (
    <nav aria-label="Pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: compact ? 4 : 6, padding: '14px 0' }}>
      <Btn disabled={atFirst} onClick={() => onChange(page - 1)} compact={compact}>← Prev</Btn>

      {!compact && pages.map((p, i) =>
        p === '…'
          ? <span key={`e${i}`} style={{ padding: '0 3px', color: '#bbb', fontSize: 13, userSelect: 'none' }}>…</span>
          : <Btn
              key={p}
              active={p === page}
              onClick={() => onChange(Number(p))}
              aria-current={p === page ? 'page' : undefined}
              compact={compact}
            >
              {p}
            </Btn>
      )}

      {!compact && (
        <span style={{ fontSize: 11, color: '#bbb', padding: '0 6px', whiteSpace: 'nowrap' }}>
          {page} / {totalPages}
        </span>
      )}

      <Btn disabled={atLast} onClick={() => onChange(page + 1)} compact={compact}>Next →</Btn>
    </nav>
  )
}

function Btn({
  children, active, disabled, onClick, 'aria-current': ariaCurrent, compact,
}: {
  children: React.ReactNode
  active?:      boolean
  disabled?:    boolean
  onClick?:     () => void
  'aria-current'?: 'page'
  compact?:     boolean
}) {
  return (
    <button
      type="button"
      aria-current={ariaCurrent}
      disabled={disabled}
      onClick={!disabled ? onClick : undefined}
      style={{
        minWidth:    compact ? 28 : 34,
        height:      compact ? 28 : 32,
        padding:     compact ? '0 8px' : '0 11px',
        fontSize:    compact ? 11 : 12,
        fontWeight:  active ? 600 : 400,
        borderRadius: 6,
        border:      '1px solid',
        borderColor: active ? T.activeBg : T.border,
        background:  active ? T.activeBg : disabled ? '#fafafa' : '#fff',
        color:       active ? T.activeColor : disabled ? T.disabledColor : T.text,
        cursor:      disabled ? 'not-allowed' : 'pointer',
        transition:  'background 0.1s, color 0.1s',
        textAlign:   'center',
        userSelect:  'none',
      }}
    >
      {children}
    </button>
  )
}
