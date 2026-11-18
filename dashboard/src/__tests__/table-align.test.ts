import { describe, it, expect } from 'vitest'
import { alignHeaders } from '@/components/ui/table-align'

function table(cells: string[][]) {
  document.body.innerHTML = `<table class="trs-table"><thead><tr>${cells[0].map(() => '<th style="text-align:center">H</th>').join('')}</tr></thead><tbody>${
    cells.map(r => `<tr>${r.map(c => { const [t, a] = c.split('|'); return `<td style="text-align:${a}">${t}</td>` }).join('')}</tr>`).join('')}</tbody></table>`
  return document.querySelectorAll('th')
}

describe('alignHeaders', () => {
  it('gives each header its column\'s alignment: names left, figures centred', () => {
    const th = table([['Example Client Pte Ltd|left', '19,600|center'], ['Client D Logistics|left', '6,500|center']])
    alignHeaders()
    expect(th[0].style.textAlign).toBe('left')
    expect(th[1].style.textAlign).toBe('center')
  })
  it('leaves a header alone when its column is empty', () => {
    const th = table([['|left', 'x|center']])
    alignHeaders()
    expect(th[0].style.textAlign).toBe('center')
  })
})
