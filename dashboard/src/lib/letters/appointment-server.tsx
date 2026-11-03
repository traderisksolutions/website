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

// The TRS logo (Oct 2026 identity), cropped, from public/letters.
const trsLogo = () => readFile(join(process.cwd(), 'public', 'letters', 'trs-logo.png')).catch(() => null)

export async function renderAppointmentPdf(letter: AppointmentLetter): Promise<Buffer> {
  registerPdfFonts(join(process.cwd(), 'public', 'fonts'))
  return renderToBuffer(<AppointmentLetterPdf letter={letter} logoSrc={await trsLogo()} />)
}

/** Pixel size of a PNG or JPEG, for the image's aspect in Word. Null when unreadable. */
export function imageSize(b: Buffer): { w: number; h: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const m = b[i + 1], len = b.readUInt16BE(i + 2)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) }
      i += 2 + len
    }
  }
  return null
}

// ── Word (.docx) ────────────────────────────────────────────────────────────────────────────

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const para = (text: string, o: { bold?: boolean; size?: number; after?: number; before?: number } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 0}" w:line="300" w:lineRule="auto"/></w:pPr><w:r><w:rPr>${o.bold ? '<w:b/>' : ''}<w:sz w:val="${o.size ?? 22}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`

const runsPara = (runs: { text: string; b?: boolean; i?: boolean; u?: boolean }[], o: { before?: number; indent?: boolean } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="${o.before ?? 0}" w:after="0" w:line="300" w:lineRule="auto"/>${o.indent ? '<w:ind w:left="360" w:hanging="360"/>' : ''}</w:pPr>${runs.map(r => `<w:r><w:rPr>${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}${r.u ? '<w:u w:val="single"/>' : ''}<w:sz w:val="22"/></w:rPr>${r.text.split('\t').map(x => `<w:t xml:space="preserve">${xml(x)}</w:t>`).join('<w:tab/>')}</w:r>`).join('')}</w:p>`

type Img = { rId: string; file: string; bytes: Buffer; ext: 'png' | 'jpeg'; cx: number; cy: number }

/** An image sized to fit maxW × maxH points, as a Word media part. */
function wordImage(rId: string, name: string, bytes: Buffer, ext: 'png' | 'jpeg', maxW: number, maxH: number): Img | null {
  const px = imageSize(bytes)
  if (!px || !px.w || !px.h) return null
  const k = Math.min(maxW / px.w, maxH / px.h)
  return { rId, file: `${name}.${ext}`, bytes, ext, cx: Math.round(px.w * k * 12700), cy: Math.round(px.h * k * 12700) }
}

const drawing = (im: Img, id: number) =>
  `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${im.cx}" cy="${im.cy}"/><wp:docPr id="${id}" name="${im.file}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${im.file}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${im.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${im.cx}" cy="${im.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`

/**
 * The letter as a Word document, A4, in the PDF's order: the client's letterhead band (logo left,
 * address right; blank space when neither), the TRS logo, then the letter.
 */
export async function buildAppointmentDocx(l: AppointmentLetter): Promise<Buffer> {
  const p = letterParts(l)
  const images: Img[] = []
  if (p.clientLogo) {
    const [, kind, b64] = p.clientLogo.match(/^data:image\/(png|jpe?g);base64,(.+)$/) ?? []
    const im = b64 ? wordImage('rIdClient', 'client-logo', Buffer.from(b64, 'base64'), kind === 'png' ? 'png' : 'jpeg', 170, 56) : null
    if (im) images.push(im)
  }
  const trs = await trsLogo()
  const trsImg = trs ? wordImage('rIdTrs', 'trs-logo', trs, 'png', 118, 60) : null
  if (trsImg) images.push(trsImg)
  const clientImg = images.find(i => i.rId === 'rIdClient')
  const cell = (inner: string, w: number) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${inner}</w:tc>`
  const band = clientImg || p.clientAddress.length
    ? `<w:tbl><w:tblPr><w:tblW w:w="9070" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4535"/><w:gridCol w:w="4535"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="1400"/></w:trPr>${
      cell(`<w:p>${clientImg ? drawing(clientImg, 1) : ''}</w:p>`, 4535)}${
      cell((p.clientAddress.length ? p.clientAddress : ['']).map(a => `<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="17"/></w:rPr><w:t xml:space="preserve">${xml(a)}</w:t></w:r></w:p>`).join(''), 4535)}</w:tr></w:tbl>`
    : para('', { after: 1240 })
  const body = [
    band,
    trsImg ? `<w:p><w:pPr><w:spacing w:before="200" w:after="400"/></w:pPr>${drawing(trsImg, 2)}</w:p>` : para('Trade Risk Solutions', { bold: true, before: 200, after: 400 }),
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
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${images.map(i => `<Relationship Id="${i.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${i.file}"/>`).join('')}</Relationships>`)
  for (const i of images) zip.file(`word/media/${i.file}`, i.bytes)
  zip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:lang w:val="en-SG"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>')
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`)
  return zip.generateAsync({ type: 'nodebuffer' })
}
