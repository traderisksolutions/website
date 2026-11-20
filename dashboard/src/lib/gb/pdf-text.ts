/**
 * The text of a PDF, page by page, laid out as rows of cells: text items on one baseline make a
 * line, and a gap wider than a space between two items starts a new cell (a tab). Read from
 * pdf.js's text items through pdf-parse, so a table keeps its columns. Server only. No model.
 * A scan returns pages with empty text.
 */
type Item = { str?: string; transform?: number[]; width?: number; height?: number }
type Doc = { numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: Item[] }>; cleanup?: () => void }> }

/** Items of one page as lines of tab-separated cells. Pure. */
export function layoutItems(raw: Item[]): string {
  const items = raw.filter(i => typeof i.str === 'string' && i.str.trim() && i.transform).map(i => {
    const [, , c, d, x, y] = i.transform!
    const h = Math.hypot(c, d) || i.height || 10
    return { s: i.str!.trim(), x, y, w: i.width ?? 0, h }
  }).sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: (typeof items)[] = []
  for (const it of items) {
    const line = lines.find(l => Math.abs(l[0].y - it.y) <= Math.max(2, it.h * 0.45))
    if (line) line.push(it); else lines.push([it])
  }
  return lines.map(l => {
    l.sort((a, b) => a.x - b.x)
    let out = '', end = -Infinity
    for (const it of l) {
      const gap = it.x - end
      out += !out ? it.s : gap > Math.max(4, it.h * 0.8) ? `\t${it.s}` : `${gap > 0.5 ? ' ' : ''}${it.s}`
      end = Math.max(end, it.x + it.w)
    }
    return out
  }).join('\n')
}

export async function pdfPages(bytes: Buffer): Promise<{ num: number; text: string }[]> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(bytes) })
  try {
    // load() is the pdf.js document pdf-parse opens for getText; not in its typings (as in commission/redact.ts).
    const doc = await (parser as unknown as { load(): Promise<Doc> }).load()
    const pages: { num: number; text: string }[] = []
    for (let n = 1; n <= Math.min(doc.numPages, 60); n++) {
      const page = await doc.getPage(n)
      pages.push({ num: n, text: layoutItems((await page.getTextContent()).items) })
      page.cleanup?.()
    }
    return pages
  } finally {
    await parser.destroy().catch(() => {})
  }
}

export const isPdf = (name: string, bytes?: Buffer) => /\.pdf$/i.test(name) || (!!bytes && bytes.subarray(0, 5).toString('latin1') === '%PDF-')
