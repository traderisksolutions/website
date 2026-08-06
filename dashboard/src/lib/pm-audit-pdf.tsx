/**
 * Renders the "how we got this number" quote audit trail PDF — one section per insurer: inputs,
 * the plain-English paragraph (pm-quote-audit.ts), then the existing per-member breakdown
 * (InsurerResult.members) as a table. Same @react-pdf/renderer conventions and navy/striped-row
 * palette as pm-comparison-pdf.tsx/debit-note-pdf.tsx. Landscape, since the per-member table can
 * run to many coverage columns — same reasoning as the comparison PDF.
 */
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { QuoteResult, InsurerResult } from '@/lib/pm-quote'

const NAVY = '#0C338A'
const NAVY_SOFT = '#EAF0F9'

const styles = StyleSheet.create({
  page:        { padding: 28, fontSize: 8, fontFamily: 'Helvetica', color: '#1a1a1a' },
  title:       { fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 2 },
  subtitle:    { fontSize: 8, color: '#667085', marginBottom: 14 },
  insurerBlock:{ marginTop: 14 },
  insurerName: { fontSize: 11, fontWeight: 700, color: NAVY, backgroundColor: NAVY_SOFT, paddingVertical: 4, paddingHorizontal: 6, marginBottom: 6 },
  paragraph:   { fontSize: 8.5, lineHeight: 1.5, color: '#374151', marginBottom: 8 },
  headerRow:   { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 3 },
  headerCell:  { color: '#fff', fontWeight: 700, textAlign: 'right', paddingRight: 4 },
  headerCellL: { color: '#fff', fontWeight: 700, textAlign: 'left', paddingLeft: 4 },
  row:         { flexDirection: 'row', paddingVertical: 2.5, borderBottom: '0.5pt solid #e5e7eb' },
  rowAlt:      { backgroundColor: '#FAFBFC' },
  cellL:       { textAlign: 'left', paddingLeft: 4 },
  cellR:       { textAlign: 'right', paddingRight: 4 },
  totalRow:    { flexDirection: 'row', paddingVertical: 3, borderTop: '1pt solid ' + NAVY, marginTop: 1 },
  totalLabel:  { fontWeight: 700, paddingLeft: 4 },
  totalCell:   { fontWeight: 700, textAlign: 'right', paddingRight: 4 },
  footer:      { marginTop: 14, fontSize: 6.5, color: '#98A2B3' },
})

const money = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const nameCol = { width: 110 }
const numCol = { flex: 1, minWidth: 0 }

function InsurerSection({ ins, text }: { ins: InsurerResult; text: string }) {
  if (ins.error) {
    return (
      <View style={styles.insurerBlock}>
        <Text style={styles.insurerName}>{ins.insurer_name}</Text>
        <Text style={styles.paragraph}>{ins.error}</Text>
      </View>
    )
  }
  const cols = ins.coverage_lines
  return (
    <View style={styles.insurerBlock} wrap={false}>
      <Text style={styles.insurerName}>{ins.insurer_name}</Text>
      <Text style={styles.paragraph}>{text}</Text>

      <View style={styles.headerRow}>
        <Text style={[styles.headerCellL, nameCol]}>Member</Text>
        {cols.map(c => <Text key={c.code} style={[styles.headerCell, numCol]}>{c.label}</Text>)}
        <Text style={[styles.headerCell, numCol]}>Subtotal</Text>
      </View>
      {ins.members.map((m, i) => (
        <View key={m.row} style={i % 2 === 1 ? [styles.row, styles.rowAlt] : styles.row}>
          <Text style={[styles.cellL, nameCol]}>{m.name}</Text>
          {cols.map(c => <Text key={c.code} style={[styles.cellR, numCol]}>{money(m.lines[c.code])}</Text>)}
          <Text style={[styles.cellR, numCol]}>{money(m.subtotal)}</Text>
        </View>
      ))}
      <View style={styles.totalRow}>
        <Text style={[styles.totalLabel, nameCol]}>Total</Text>
        {cols.map(c => <Text key={c.code} style={[styles.totalCell, numCol]}>{money(ins.by_line[c.code])}</Text>)}
        <Text style={[styles.totalCell, numCol]}>{money(ins.grand)}</Text>
      </View>
    </View>
  )
}

export function AuditPdfDocument({ company, generated, result, text }: {
  company: string | null; generated: string; result: QuoteResult; text: Record<string, string>
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <Text style={styles.title}>Quote Audit Trail</Text>
        <Text style={styles.subtitle}>{company ? `${company} — ` : ''}Generated {generated}</Text>
        {result.insurers.map(ins => <InsurerSection key={ins.calculator_id} ins={ins} text={text[ins.calculator_id] ?? ''} />)}
        <Text style={styles.footer}>Every figure here is copied from the insurer's own approved rate table, computed once and never re-derived. Trade Risk Solutions.</Text>
      </Page>
    </Document>
  )
}

export async function renderAuditPdf(company: string | null, generated: string, result: QuoteResult, text: Record<string, string>): Promise<Buffer> {
  const buf = await renderToBuffer(<AuditPdfDocument company={company} generated={generated} result={result} text={text} />)
  return Buffer.from(buf)
}
