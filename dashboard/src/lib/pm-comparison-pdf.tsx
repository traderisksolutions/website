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
const TOTAL_BG = '#E7F5EE'
const TOTAL_FG = '#0F6B47'
const CATEGORY_BG = '#F1F3F5'

const styles = StyleSheet.create({
  page:        { padding: 30, fontSize: 8, fontFamily: 'Helvetica', color: '#1a1a1a' },
  brandBar:    { height: 4, backgroundColor: NAVY, marginBottom: 14, borderRadius: 2 },
  titleRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, paddingBottom: 10, borderBottom: '1pt solid #E4E7EC' },
  title:       { fontSize: 15, fontWeight: 700, color: NAVY },
  titleSub:    { fontSize: 7.5, color: '#98A2B3', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.6 },
  brand:       { fontSize: 8.5, fontWeight: 700, color: NAVY, textAlign: 'right' },
  metaRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, backgroundColor: '#F8FAFC', borderRadius: 4, paddingVertical: 8, paddingHorizontal: 10 },
  metaCol:     { flexDirection: 'column' },
  metaLine:    { flexDirection: 'row', marginBottom: 2 },
  metaLabel:   { color: '#667085', width: 90 },
  metaValue:   { fontWeight: 700, color: '#1a1a1a' },
  sectionGap:  { marginTop: 18 },
  sectionLabel:{ fontSize: 7, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  headerRow:   { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 5, borderRadius: 2 },
  headerLabel: { width: 130, color: '#fff', fontWeight: 700, paddingLeft: 6 },
  headerCellC: { flex: 1, color: '#fff', fontWeight: 700, textAlign: 'center' },
  row:         { flexDirection: 'row', paddingVertical: 3.5, borderBottom: '0.5pt solid #e5e7eb' },
  rowAlt:      { backgroundColor: '#FAFBFC' },
  rowLabel:    { width: 130, paddingLeft: 6, color: '#374151' },
  cellC:       { flex: 1, textAlign: 'center' },
  cellL:       { flex: 1, textAlign: 'left', paddingLeft: 4 },
  cellUnconf:  { color: '#B54708' },
  totalRow:    { flexDirection: 'row', backgroundColor: TOTAL_BG, paddingVertical: 5, borderTop: '1pt solid ' + TOTAL_FG },
  totalLabel:  { width: 130, paddingLeft: 6, fontWeight: 700, color: TOTAL_FG },
  totalCell:   { flex: 1, textAlign: 'center', fontWeight: 700, color: TOTAL_FG },
  categoryBar: { flexDirection: 'row', backgroundColor: CATEGORY_BG, paddingVertical: 3.5, marginTop: 5, borderLeft: '2pt solid ' + NAVY },
  categoryTxt: { fontSize: 7.5, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 0.5, paddingLeft: 6 },
  footer:      { marginTop: 16, fontSize: 6.5, color: '#98A2B3' },
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
        <View style={styles.brandBar} fixed />
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>Employee Benefits — Coverage Comparison</Text>
            <Text style={styles.titleSub}>Preliminary — subject to final underwriting</Text>
          </View>
          <Text style={styles.brand}>Trade Risk Solutions</Text>
        </View>

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

        <Text style={styles.sectionLabel}>Pricing summary</Text>
        <TableHeader doc={doc} />
        <Rows doc={doc} rows={doc.pricing_rows} />
        {doc.total_rows.map((r, i) => (
          <View key={i} style={styles.totalRow}>
            <Text style={styles.totalLabel}>{r.label}</Text>
            {doc.insurer_ids.map(id => <Text key={id} style={styles.totalCell}>{r.per_insurer[id] ?? ''}</Text>)}
          </View>
        ))}

        <View style={styles.sectionGap}>
          <Text style={styles.sectionLabel}>Plan selection</Text>
          <TableHeader doc={doc} left="Coverage" />
          <Rows doc={doc} rows={doc.plan_rows} align="left" />
        </View>

        <View style={styles.sectionGap}>
          <Text style={styles.sectionLabel}>Benefit schedule (selected plans)</Text>
          <TableHeader doc={doc} left="Benefit" />
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
