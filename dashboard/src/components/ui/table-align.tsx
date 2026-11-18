'use client'

import { useEffect } from 'react'

/**
 * Every header takes its column's alignment (Jarod, 19 Nov 2026): a column of names, subjects or
 * free text is left, header included; a column of numbers, dates, chips and short words is
 * centred, header included. The cells already carry their alignment (`RegisterCell align`,
 * `.cell-left`); only the headers were centred regardless. Mounted once in the shell, it watches
 * the page and sets each `table.trs-table` and `table.xl-grid` header to the computed alignment of its column's cells,
 * so every register and hand-built table follows without touching the call sites.
 */
export function alignHeaders(root: ParentNode = document) {
  root.querySelectorAll<HTMLTableElement>('table.trs-table, table.xl-grid').forEach(tb => {
    const head = tb.tHead?.rows[0]
    if (!head) return
    const rows = Array.from(tb.tBodies).flatMap(b => Array.from(b.rows)).filter(r => !r.classList.contains('reg-group'))
    Array.from(head.cells).forEach((th, j) => {
      if (th.colSpan > 1) return
      const cells = rows.map(r => r.cells[j]).filter((c): c is HTMLTableCellElement => !!c && c.colSpan === 1 && !!c.textContent?.trim())
      if (!cells.length) return
      const left = cells.some(c => { const a = getComputedStyle(c).textAlign; return a === 'left' || a === 'start' })
      const want = left ? 'left' : 'center'
      if (th.style.textAlign !== want) th.style.textAlign = want
      // A header with an inline-flex label (sortable or not) needs its box placed too.
      const inner = th.firstElementChild as HTMLElement | null
      if (inner && getComputedStyle(inner).display.includes('flex')) {
        const jc = left ? 'flex-start' : 'center'
        if (inner.style.justifyContent !== jc) inner.style.justifyContent = jc
      }
    })
  })
}

export function TableAlign() {
  useEffect(() => {
    let queued = false
    const run = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; alignHeaders() }) }
    run()
    const mo = new MutationObserver(run)
    mo.observe(document.body, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])
  return null
}
