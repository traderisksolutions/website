/**
 * Server half of the letter of undertaking: the PDF and the Word file, both from
 * undertakingParts(), and prepareUndertaking(), which files them in the client's data room and
 * returns the attachments for the email that asks the client to sign. Import only server-side.
 */
import { join } from 'node:path'
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import JSZip from 'jszip'
import { registerPdfFonts } from '@/lib/pdf-fonts'
import { fileDocument } from '@/lib/documents/ingest'
import * as docs from '@/lib/documents/store'
import { undertakingParts, undertakingProblems, undertakingFileName, type UndertakingLetter } from './undertaking'

const s = StyleSheet.create({
  page:   { paddingTop: 142, paddingHorizontal: 72, paddingBottom: 72, fontFamily: 'Geist', fontSize: 10.5, lineHeight: 1.55, color: '#0f1412' },
  head:   { color: '#6f7a74', fontSize: 9 },
  date:   { marginTop: 18 },
  block:  { marginTop: 14 },
  title:  { marginTop: 22, fontFamily: 'Geist', fontWeight: 600, fontSize: 12 },
  row:    { flexDirection: 'row', marginTop: 4 },
  key:    { width: 120, fontWeight: 600 },
  val:    { flex: 1 },
  para:   { marginTop: 14 },
  sign:   { marginTop: 56, width: 220, borderTop: '0.75pt solid #0f1412', paddingTop: 4 },
  bold:   { fontWeight: 600 },
})

export function UndertakingLetterPdf({ letter }: { letter: UndertakingLetter }) {
  const p = undertakingParts(letter)
  return (
    <Document title={`${p.title} - ${p.company}`} author={p.company}>
      <Page size="A4" style={s.page}>
        <View>{p.letterhead.map((l, i) => <Text key={i} style={s.head}>{l}</Text>)}</View>
        <Text style={s.date}>{p.date}</Text>
        <View style={s.block}>{p.addressee.map((a, i) => <Text key={i}>{a}</Text>)}</View>
        <Text style={s.block}>{p.attention}</Text>
        <Text style={s.block}>{p.salutation}</Text>
        <Text style={s.title}>{p.title}</Text>
        <View style={s.block}>
          {p.table.map(([k, v]) => <View key={k} style={s.row}><Text style={s.key}>{k}</Text><Text style={s.val}>: {v}</Text></View>)}
        </View>
        {p.body.map((t, i) => <Text key={i} style={s.para}>{t}</Text>)}
        <Text style={s.para}>{p.closing}</Text>
        <View style={s.sign}>
          <Text>{p.signature}</Text>
          <Text>Name: {p.name}</Text>
          <Text>Designation: {p.designation}</Text>
          <Text style={s.bold}>{p.company}</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderUndertakingPdf(letter: UndertakingLetter): Promise<Buffer> {
  registerPdfFonts(join(process.cwd(), 'public', 'fonts'))
  return renderToBuffer(<UndertakingLetterPdf letter={letter} />)
}

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const para = (text: string, o: { bold?: boolean; size?: number; after?: number; before?: number } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 0}" w:line="300" w:lineRule="auto"/></w:pPr><w:r><w:rPr>${o.bold ? '<w:b/>' : ''}<w:sz w:val="${o.size ?? 22}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`

/** The letter as a Word document, the way the client edits and prints it on letterhead. */
export async function buildUndertakingDocx(l: UndertakingLetter): Promise<Buffer> {
  const p = undertakingParts(l)
  const body = [
    ...p.letterhead.map(t => para(t, { size: 18 })),
    para(p.date, { before: 360 }),
    ...p.addressee.map((a, i) => para(a, { before: i === 0 ? 280 : 0 })),
    para(p.attention, { before: 280 }),
    para(p.salutation, { before: 280 }),
    para(p.title, { bold: true, size: 24, before: 360 }),
    ...p.table.map(([k, v]) => para(`${k}\t: ${v}`, { before: 80 })),
    ...p.body.map((t, i) => para(t, { before: i === 0 ? 360 : 200 })),
    para(p.closing, { before: 280 }),
    para('', { before: 960 }),
    para('__________________________________'),
    para(p.signature, { before: 80 }),
    para(`Name: ${p.name}`),
    para(`Designation: ${p.designation}`),
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

export type LetterAttachment = { filename: string; mime_type: string; storage_url: string; message_id: string }

/**
 * Renders the letter in both formats, files them in the client's data room (Drive, <Company>/Letters)
 * and returns the attachments for the email that asks the client to sign. Empty when the letter
 * cannot be produced or filed; the ask then goes without it and says so.
 */
export async function prepareUndertaking(companyId: string, letter: UndertakingLetter, actor = 'relay'): Promise<{ attachments: LetterAttachment[]; problems: string[] }> {
  const problems = undertakingProblems(letter)
  if (problems.length) return { attachments: [], problems }
  const [pdf, docx] = await Promise.all([renderUndertakingPdf(letter), buildUndertakingDocx(letter)])
  const now = new Date().toISOString()
  const attachments: LetterAttachment[] = []
  for (const [format, bytes, mime] of [['pdf', pdf, 'application/pdf'], ['docx', docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']] as const) {
    const filename = undertakingFileName(letter, format)
    const row = await docs.insertDocument({
      company_id: companyId, policy_id: null, doc_type: 'other', title: `Letter of undertaking to sign · ${letter.projectTitle}`.slice(0, 120),
      filename, mime_type: mime, size_bytes: bytes.length, source: 'generated', received_at: now, classified_by: 'broker', confidence: 1,
      needs_review: false, status: 'unfiled', uploaded_by: actor,
    })
    if (!row) continue
    const filed = await fileDocument(row, bytes)
    if (filed.drive_file_id) attachments.push({ filename, mime_type: mime, storage_url: `drivefile:${filed.drive_file_id}`, message_id: '' })
  }
  return { attachments, problems: attachments.length ? [] : ['The letter could not be filed to the data room.'] }
}
