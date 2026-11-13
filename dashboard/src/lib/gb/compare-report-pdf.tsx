/**
 * The client report from Compare cover as an A4 landscape PDF (src/lib/gb/compare-report.ts): the
 * premium summary first, then every benefit row, today beside the five products. Server only.
 */
import { join } from 'node:path'
import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from '@react-pdf/renderer'
import { longDate, sgd } from './report-model'
import { registerPdfFonts } from '../pdf-fonts'
import type { CompareReport, ReportColumn } from './compare-report'

Font.registerHyphenationCallback(word => [word])
const INK = '#202124', MUTED = '#5f6368', FAINT = '#80868b', RULE = '#dadce0', HAIR = '#ececec', TODAY = '#f3f7f4', UP = '#1d6b3f', DOWN = '#a3361f'
const s = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 56, paddingHorizontal: 32, fontSize: 8, fontFamily: 'Geist', color: INK, lineHeight: 1.35 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  eyebrow: { fontSize: 7.5, letterSpacing: 1, color: MUTED, fontWeight: 600 },
  title: { fontSize: 22, fontFamily: 'EB Garamond', fontWeight: 500, marginBottom: 12, lineHeight: 1.2 },
  meta: { flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: INK, borderBottomWidth: 0.5, borderBottomColor: RULE, paddingVertical: 7, marginBottom: 14 },
  metaCell: { flex: 1 }, metaLabel: { fontSize: 7, color: FAINT, marginBottom: 2 }, metaValue: { fontSize: 9 },
  h2: { fontSize: 10.5, fontWeight: 600, marginBottom: 5, marginTop: 6 },
  thRow: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: RULE, paddingBottom: 4 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: HAIR, paddingVertical: 4 },
  th: { fontSize: 7.5, fontWeight: 600, paddingRight: 6 },
  td: { paddingRight: 6 },
  label: { color: MUTED },
  sub: { fontSize: 6.8, color: FAINT, marginTop: 1 },
  bold: { fontWeight: 600 },
  foot: { position: 'absolute', left: 32, right: 32, bottom: 20, fontSize: 6.8, color: FAINT, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 5 },
})
const LABEL_W = 16, COL_W = (100 - LABEL_W) / 6
const cut = (t: string, n = 120) => t.length > n ? `${t.slice(0, n - 1)}…` : t

function Head({ cols }: { cols: (ReportColumn & { label?: string })[] }) {
  return (
    <View style={s.thRow} fixed>
      <Text style={[s.th, { width: `${LABEL_W}%` }]} />
      {cols.map((c, i) => <View key={c.name} style={[s.td, { width: `${COL_W}%`, backgroundColor: i === 0 ? TODAY : undefined, paddingLeft: i === 0 ? 4 : 0 }]}><Text style={s.th}>{c.name}</Text>{i === 0 && c.label && c.label !== 'Today' ? <Text style={s.sub}>{c.label}</Text> : null}</View>)}
    </View>
  )
}

function CompareReportDocument({ m }: { m: CompareReport }) {
  const cols = [m.today, ...m.products]
  const cell = (i: number) => ({ width: `${COL_W}%`, backgroundColor: i === 0 ? TODAY : undefined, paddingLeft: i === 0 ? 4 : 0 })
  return (
    <Document title={`Group benefits comparison — ${m.company}`} author="Trade Risk Solutions Pte Ltd">
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text fixed style={s.foot}>{m.notes[0]} Prepared by Trade Risk Solutions Pte Ltd.</Text>
        <View style={s.top}>
          <View>
            <Text style={{ fontFamily: 'TRS Mark', fontSize: 15, letterSpacing: 2.4, color: '#132c1c', lineHeight: 1 }}>TRS</Text>
            <View style={{ height: 4 }} />
            <Text style={{ fontFamily: 'TRS Brush', fontSize: 11, color: '#132c1c', lineHeight: 1 }}>保风</Text>
          </View>
          <Text style={s.eyebrow}>GROUP BENEFITS COMPARISON</Text>
        </View>
        <Text style={s.title}>{m.company}</Text>
        <View style={s.meta}>
          {[['Policy start', longDate(m.effectiveDate)], ['Basis', m.basis], ['Members', `${m.lives} (${m.employees} employees)`], ['Prepared', longDate(m.prepared)]].map(([l, v]) => (
            <View key={l} style={s.metaCell}><Text style={s.metaLabel}>{l}</Text><Text style={s.metaValue}>{v}</Text></View>
          ))}
        </View>

        <Text style={s.h2}>Annual premium</Text>
        <Head cols={cols} />
        <View style={s.tr} wrap={false}>
          <Text style={[s.td, s.label, { width: `${LABEL_W}%` }]}>Total</Text>
          {cols.map((c, i) => (
            <View key={c.name} style={[s.td, cell(i)]}>
              <Text style={[s.bold, { fontSize: 10 }]}>{c.total != null ? sgd(c.total) : '—'}</Text>
              {i === 0 ? <Text style={s.sub}>{m.today.source === 'last_year' ? 'last year' : m.today.source === 'renewal' ? 'renewal, same plans' : 'not on file'}</Text>
                : c.delta != null && c.pct != null ? <Text style={[s.sub, { color: c.delta > 0 ? DOWN : UP }]}>{c.delta > 0 ? '+' : '−'}{Math.abs(c.pct * 100).toFixed(1)}% · {c.delta > 0 ? '+' : '−'}{sgd(Math.abs(c.delta))}</Text> : null}
            </View>
          ))}
        </View>
        {m.covers.map((cv, k) => (
          <View key={cv} style={s.tr} wrap={false}>
            <Text style={[s.td, s.label, { width: `${LABEL_W}%` }]}>{cv}</Text>
            {cols.map((c, i) => (
              <View key={c.name} style={[s.td, cell(i)]}>
                <Text>{cut(c.covers[k].words, 70)}</Text>
                <Text style={s.sub}>{c.covers[k].included ? 'in hospital premium' : c.covers[k].premium != null ? sgd(c.covers[k].premium!) : c.covers[k].words === 'None' ? '' : '—'}</Text>
              </View>
            ))}
          </View>
        ))}
        {m.shownFor && <Text style={[s.sub, { marginTop: 4 }]}>Plans shown for {m.shownFor}, the largest group; premiums are for every group.</Text>}
      </Page>

      <Page size="A4" orientation="landscape" style={s.page}>
        <Text fixed style={s.foot}>{m.notes.join(' ')} Benefits from the insurers&apos; brochures ({m.workbook}).</Text>
        <Text style={s.h2}>Benefits</Text>
        <Head cols={cols} />
        {m.covers.map(cv => (
          <View key={cv}>
            <Text style={[s.bold, { marginTop: 8, marginBottom: 2 }]}>{cv}</Text>
            {m.rows.filter(r => r.cover === cv).map(r => (
              <View key={r.label} style={s.tr} wrap={false}>
                <Text style={[s.td, s.label, { width: `${LABEL_W}%` }]}>{r.label}</Text>
                {r.values.map((v, i) => <Text key={i} style={[s.td, cell(i), { color: v === '—' ? FAINT : INK }]}>{cut(v)}</Text>)}
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  )
}

export async function renderCompareReportPdf(m: CompareReport): Promise<Buffer> {
  registerPdfFonts(join(process.cwd(), 'public', 'fonts'))
  return renderToBuffer(<CompareReportDocument m={m} />)
}

export const reportFilename = (company: string) => `${(company || 'Quotation').replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-')}-group-benefits-comparison.pdf`
