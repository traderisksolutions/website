/**
 * Renders the client-facing "Coverage Comparison" PDF from a ComparisonDoc (pm-comparison-doc.ts).
 * Landscape A4 so up to ~5-6 insurer columns stay readable — the same layout shape as the target
 * brochure-style comparison (pricing summary -> plan selection -> full benefit schedule, grouped
 * by category), built with the same @react-pdf/renderer primitives as debit-note-pdf.tsx and the
 * navy/striped-row palette already used in gb-export.ts.
 */
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { ComparisonDoc, ComparisonRow } from '@/lib/pm-comparison-doc'
import { UNCONFIRMED_TAG } from '@/lib/pm-compare'

const NAVY = '#0C338A'
const NAVY_SOFT = '#EAF0F9'
const TOTAL_BG = '#E7F5EE'
const TOTAL_FG = '#0F6B47'
const CATEGORY_BG = '#F1F3F5'

const styles = StyleSheet.create({
  page:        { padding: 28, fontSize: 8, fontFamily: 'Helvetica', color: '#1a1a1a' },
  title:       { fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 6 },
  metaRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  metaCol:     { flexDirection: 'column' },
  metaLine:    { flexDirection: 'row', marginBottom: 1 },
  metaLabel:   { color: '#667085', width: 90 },
  metaValue:   { fontWeight: 700 },
  sectionGap:  { marginTop: 16 },
  headerRow:   { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 4 },
  headerLabel: { width: 130, color: '#fff', fontWeight: 700, paddingLeft: 4 },
  headerCellC: { flex: 1, color: '#fff', fontWeight: 700, textAlign: 'center' },
  row:         { flexDirection: 'row', paddingVertical: 3, borderBottom: '0.5pt solid #e5e7eb' },
  rowAlt:      { backgroundColor: '#FAFBFC' },
  rowLabel:    { width: 130, paddingLeft: 4, color: '#374151' },
  cellC:       { flex: 1, textAlign: 'center' },
  cellL:       { flex: 1, textAlign: 'left', paddingLeft: 4 },
  cellUnconf:  { color: '#B54708' },
  totalRow:    { flexDirection: 'row', backgroundColor: TOTAL_BG, paddingVertical: 4 },
  totalLabel:  { width: 130, paddingLeft: 4, fontWeight: 700, color: TOTAL_FG },
  totalCell:   { flex: 1, textAlign: 'center', fontWeight: 700, color: TOTAL_FG },
  categoryBar: { flexDirection: 'row', backgroundColor: CATEGORY_BG, paddingVertical: 3, marginTop: 4 },
  categoryTxt: { fontSize: 7.5, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 0.5, paddingLeft: 4 },
  footer:      { marginTop: 14, fontSize: 6.5, color: '#98A2B3' },
})

function TableHeader({ doc, left = 'Coverage' }: { doc: ComparisonDoc; left?: string }) {
  return (
    <View style={styles.headerRow} fixed>
      <Text style={styles.headerLabel}>{left}</Text>
      {doc.insurer_ids.map(id => <Text key={id} style={styles.headerCellC}>{doc.insurer_names[id]}</Text>)}
    </View>
  )
}

function Rows({ doc, rows, align = 'center' }: { doc: ComparisonDoc; rows: ComparisonRow[]; align?: 'left' | 'center' }) {
  const base = align === 'center' ? styles.cellC : styles.cellL
  return (
    <>
      {rows.map((r, i) => (
        <View key={i} style={i % 2 === 1 ? [styles.row, styles.rowAlt] : styles.row}>
          <Text style={styles.rowLabel}>{r.label}</Text>
          {doc.insurer_ids.map(id => {
            const v = r.per_insurer[id] ?? ''
            const unconfirmed = v.startsWith(UNCONFIRMED_TAG)
            return <Text key={id} style={unconfirmed ? [base, styles.cellUnconf] : base}>{unconfirmed ? v.slice(UNCONFIRMED_TAG.length) : v}</Text>
          })}
        </View>
      ))}
    </>
  )
}
const hasUnconfirmed = (doc: ComparisonDoc) => doc.benefit_rows.some(g => g.rows.some(r => Object.values(r.per_insurer).some(v => v.startsWith(UNCONFIRMED_TAG))))

export function ComparisonPdfDocument({ doc }: { doc: ComparisonDoc }) {
  const livesLabel = `${doc.lives.employees} / ${doc.lives.dependants}`
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <Text style={styles.title}>Employee Benefits — Coverage Comparison (Preliminary)</Text>

        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <View style={styles.metaLine}><Text style={styles.metaLabel}>Company:</Text><Text style={styles.metaValue}>{doc.company ?? '—'}</Text></View>
            <View style={styles.metaLine}><Text style={styles.metaLabel}>Prepared by:</Text><Text style={styles.metaValue}>TRS</Text></View>
          </View>
          <View style={styles.metaCol}>
            <View style={styles.metaLine}><Text style={styles.metaLabel}>Quotation date:</Text><Text style={styles.metaValue}>{doc.quotation_date}</Text></View>
            <View style={styles.metaLine}><Text style={styles.metaLabel}>Effective date:</Text><Text style={styles.metaValue}>{doc.effective_date ?? '—'}</Text></View>
            <View style={styles.metaLine}><Text style={styles.metaLabel}>Lives (EE / Dep):</Text><Text style={styles.metaValue}>{livesLabel}</Text></View>
          </View>
        </View>

        <TableHeader doc={doc} />
        <Rows doc={doc} rows={doc.pricing_rows} />
        {doc.total_rows.map((r, i) => (
          <View key={i} style={styles.totalRow}>
            <Text style={styles.totalLabel}>{r.label}</Text>
            {doc.insurer_ids.map(id => <Text key={id} style={styles.totalCell}>{r.per_insurer[id] ?? ''}</Text>)}
          </View>
        ))}

        <View style={styles.sectionGap}>
          <TableHeader doc={doc} left="Plan selection" />
          <Rows doc={doc} rows={doc.plan_rows} align="left" />
        </View>

        <View style={styles.sectionGap}>
          <TableHeader doc={doc} left="Benefit schedule" />
          {doc.benefit_rows.map((g, gi) => (
            <View key={gi}>
              <View style={styles.categoryBar}><Text style={styles.categoryTxt}>{g.category}</Text></View>
              <Rows doc={doc} rows={g.rows} align="left" />
            </View>
          ))}
        </View>

        {hasUnconfirmed(doc) && <Text style={[styles.footer, styles.cellUnconf]}>Orange values could not be confirmed against the selected plan tier — shown for reference, worth a second look.</Text>}
        <Text style={styles.footer}>e&o — premiums from each insurer's own approved calculator; plan tiers and benefit terms as extracted and reviewed. Generated by Trade Risk Solutions.</Text>
      </Page>
    </Document>
  )
}

export async function renderComparisonPdf(doc: ComparisonDoc): Promise<Buffer> {
  const buf = await renderToBuffer(<ComparisonPdfDocument doc={doc} />)
  return Buffer.from(buf)
}
