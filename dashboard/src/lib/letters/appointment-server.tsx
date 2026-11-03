/**
 * Server half of the appointment letter: renders the PDF (brand fonts from public/fonts) and the
 * Word file. Import only from API routes.
 */
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { renderToBuffer } from '@react-pdf/renderer'
import { registerPdfFonts } from '@/lib/pdf-fonts'
import { AppointmentLetterPdf } from './appointment-pdf'
import JSZip from 'jszip'
import { letterParts, type AppointmentLetter } from './appointment'

export async function renderAppointmentPdf(letter: AppointmentLetter): Promise<Buffer> {
  registerPdfFonts(join(process.cwd(), 'public', 'fonts'))
  // The TRS logo (Oct 2026 identity), cropped, from public/letters.
  const logo = await readFile(join(process.cwd(), 'public', 'letters', 'trs-logo.png')).catch(() => null)
  return renderToBuffer(<AppointmentLetterPdf letter={letter} logoSrc={logo} />)
}

// ── Word (.docx) ────────────────────────────────────────────────────────────────────────────

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const para = (text: string, o: { bold?: boolean; size?: number; after?: number; before?: number } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 0}" w:line="300" w:lineRule="auto"/></w:pPr><w:r><w:rPr>${o.bold ? '<w:b/>' : ''}<w:sz w:val="${o.size ?? 22}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`

const runsPara = (runs: { text: string; b?: boolean; i?: boolean; u?: boolean }[], o: { before?: number; indent?: boolean } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="${o.before ?? 0}" w:after="0" w:line="300" w:lineRule="auto"/>${o.indent ? '<w:ind w:left="360" w:hanging="360"/>' : ''}</w:pPr>${runs.map(r => `<w:r><w:rPr>${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}${r.u ? '<w:u w:val="single"/>' : ''}<w:sz w:val="22"/></w:rPr>${r.text.split('\t').map(x => `<w:t xml:space="preserve">${xml(x)}</w:t>`).join('<w:tab/>')}</w:r>`).join('')}</w:p>`

/** The letter as a Word document: A4, top margin left free for the client's letterhead. */
export async function buildAppointmentDocx(l: AppointmentLetter): Promise<Buffer> {
  const p = letterParts(l)
  const body = [
    ...p.addressee.map(a => para(a)),
    para(p.date, { before: 360 }),
    para(p.title, { bold: true, size: 26, before: 480 }),
    ...(p.re ? [para(`Re: ${p.re}`, { bold: true, before: 80 })] : []),
    ...p.blocks.map((b, i) => runsPara(b.kind === 'li' ? [{ text: `${b.ordered ? `${b.n}.` : '•'}\t` }, ...b.runs] : b.runs, { before: i === 0 ? 360 : b.kind === 'li' ? 80 : 200, indent: b.kind === 'li' })),
    ...(p.entities.length ? [para('List of entities:', { before: 200 }), ...p.entities.map(e => runsPara([{ text: `•\t${e}` }], { before: 60, indent: true }))] : []),
    para(p.closing, { before: 200 }),
    para('', { before: 960 }),
    para('______________________________'),
    para(p.name, { before: 80 }),
    para(p.designation),
    para(p.company, { bold: true }),
  ].join('')
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
  zip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:lang w:val="en-SG"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>')
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="2835" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`)
  return zip.generateAsync({ type: 'nodebuffer' })
}
