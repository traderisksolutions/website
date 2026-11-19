/**
 * The Employment Benefits proposal as an A4 portrait PDF (eb-proposal.ts), in the website's design:
 * a green band, the TRS mark, EB Garamond titles, Geist text, tables with a rule under the head,
 * hairlines between rows and columns, figures centred, the lowest total in mint. Nathan's order:
 * premium by cover, then each category's plans and benefits, then the census. Server only.
 */
import { join } from 'node:path'
import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { registerPdfFonts, PDF_GREEN, PDF_HAIR, PDF_INK, PDF_MUT, PDF_SUB } from '../pdf-fonts'
import type { ProposalModel } from './eb-proposal'

const G2 = '#1f4e3a', MINT = '#e0fcd8', RULE = PDF_INK
const n0 = (v: number) => Math.round(v).toLocaleString('en-SG')
const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 54, fontSize: 8.4, fontFamily: 'Geist', color: PDF_INK, lineHeight: 1.35 },
  band: { height: 7, backgroundColor: PDF_GREEN },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 40, paddingTop: 18 },
  ref: { fontFamily: 'Geist Mono', fontSize: 7, color: PDF_MUT, letterSpacing: 0.6 },
  body: { paddingHorizontal: 40, paddingTop: 20 },
  eyebrow: { fontFamily: 'Geist Mono', fontSize: 7.2, color: G2, letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontFamily: 'EB Garamond', fontWeight: 500, fontSize: 25, marginTop: 4, lineHeight: 1.1 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, marginBottom: 6 },
  metaItem: { marginRight: 16, fontSize: 8, color: PDF_SUB },
  metaValue: { color: PDF_INK, fontWeight: 500 },
  h: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1.2, borderBottomColor: PDF_GREEN, paddingBottom: 5, marginTop: 16, marginBottom: 8 },
  hText: { fontFamily: 'EB Garamond', fontWeight: 500, fontSize: 15, color: PDF_GREEN, lineHeight: 1.3 },
  hMeta: { fontSize: 7.4, color: PDF_SUB },
  sub: { fontSize: 7.6, fontWeight: 600, color: PDF_SUB, marginTop: 8, marginBottom: 3 },
  thRow: { flexDirection: 'row', borderBottomWidth: 0.9, borderBottomColor: RULE },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: PDF_HAIR },
  grpRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#d5d9d4' },
  totRow: { flexDirection: 'row', borderTopWidth: 0.9, borderTopColor: RULE, borderBottomWidth: 0.9, borderBottomColor: RULE },
  th: { fontSize: 7, fontWeight: 600, color: PDF_SUB, paddingVertical: 4, paddingHorizontal: 4, textAlign: 'center' },
  td: { paddingVertical: 3.4, paddingHorizontal: 4, textAlign: 'center' },
  first: { textAlign: 'left', paddingLeft: 0 },
  col: { borderLeftWidth: 0.5, borderLeftColor: PDF_HAIR },
  bold: { fontWeight: 600 },
  dim: { color: PDF_MUT },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 5, fontSize: 7, color: PDF_SUB },
  swatch: { width: 8, height: 8, backgroundColor: MINT, marginRight: 4 },
  foot: { position: 'absolute', left: 40, bottom: 20, width: 400, fontSize: 6.6, color: PDF_MUT, lineHeight: 1.35 },
  pageNo: { position: 'absolute', right: 40, bottom: 20, fontSize: 6.6, color: PDF_MUT },
})

const LABEL_W = 24
const colW = (n: number) => `${(100 - LABEL_W) / Math.max(1, n)}%`

function Head({ first, cols }: { first: string; cols: string[] }) {
  return (
    <View style={s.thRow} wrap={false}>
      <Text style={[s.th, s.first, { width: `${LABEL_W}%` }]}>{first}</Text>
      {cols.map(c => <Text key={c} style={[s.th, s.col, { width: colW(cols.length) }]}>{c}</Text>)}
    </View>
  )
}

function Row({ label, values, style, best, dimDash = true }: { label: string; values: string[]; style?: typeof s.tr; best?: number | null; dimDash?: boolean }) {
  return (
    <View style={style ?? s.tr} wrap={false}>
      <Text style={[s.td, s.first, { width: `${LABEL_W}%` }]}>{label}</Text>
      {values.map((v, i) => <Text key={i} style={[s.td, s.col, { width: colW(values.length) }, best === i ? { backgroundColor: MINT } : {}, dimDash && v === '—' ? s.dim : {}]}>{v}</Text>)}
    </View>
  )
}

function Top({ m, version, prepared }: { m: ProposalModel; version: number; prepared: string }) {
  return (
    <View fixed>
      <View style={s.band} />
      <View style={s.top}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: 'TRS Mark', fontSize: 13, letterSpacing: 2.2, color: PDF_GREEN, lineHeight: 1 }}>TRS</Text>
          <Text style={{ fontSize: 7.5, color: PDF_SUB, marginLeft: 8 }}>Trade Risk Solutions</Text>
        </View>
        <Text style={s.ref}>{`EMPLOYEE BENEFITS PROPOSAL V${version} · ${prepared.toUpperCase()}`}</Text>
      </View>
    </View>
  )
}

function ProposalDocument({ m, version, prepared, preparedBy }: { m: ProposalModel; version: number; prepared: string; preparedBy: string | null }) {
  const cols = m.products
  const foot = <>
    <Text fixed style={s.foot}>{m.notes.join(' ')}</Text>
    <Text fixed style={s.pageNo} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
  </>
  return (
    <Document title={`Employee Benefits proposal — ${m.company}`} author="Trade Risk Solutions Pte Ltd">
      <Page size="A4" style={s.page}>
        <Top m={m} version={version} prepared={prepared} />
        {foot}
        <View style={s.body}>
          <Text style={s.eyebrow}>Employee Benefits proposal</Text>
          <Text style={s.title}>{m.company}</Text>
          <View style={s.meta}>
            {[['Period', m.period], ['Lives', `${m.employees} employees${m.dependants ? `, ${m.dependants} dependants` : ''}`], ['Basis', `${m.basis}, net of GST`], ...(preparedBy ? [['Prepared by', preparedBy]] : [])].map(([l, v]) => (
              <Text key={l} style={s.metaItem}>{l} <Text style={s.metaValue}>{v}</Text></Text>
            ))}
          </View>

          <View style={s.h}><Text style={s.hText}>Annual premium</Text><Text style={s.hMeta}>S$ a year</Text></View>
          <Head first="Cover" cols={cols} />
          {m.byCover.map(r => <Row key={r.key} label={r.cover} values={r.values.map((v, i) => (r.included[i] && !v ? 'In hospital plan' : v ? n0(v) : '—'))} />)}
          <Row label="Total" values={m.totals.map(t => (t ? n0(t) : '—'))} style={s.totRow} best={m.lowest} />
          <Row label="A life" values={m.perLife.map(v => (v ? n0(v) : '—'))} />
          <View style={s.legend}><View style={s.swatch} /><Text>Lowest total</Text></View>

          {m.categories.map(c => (
            <View key={c.name} break={m.categories.length > 1 && c !== m.categories[0]}>
              <View style={s.h} wrap={false}>
                <Text style={s.hText}>{c.name}</Text>
                <Text style={s.hMeta}>{`${c.employees} employees · ${c.lives} lives · S$ a year: ${c.totals.map(n0).join(' · ')}`}</Text>
              </View>
              <Text style={s.sub}>Plans</Text>
              <Head first="Cover" cols={cols} />
              {c.plans.map(p => <Row key={p.cover} label={p.cover} values={p.words} />)}
              {c.benefits.length > 0 && <>
                <Text style={s.sub}>Benefits</Text>
                <Head first="Benefit" cols={cols} />
                {c.benefits.map((b, i) => {
                  const grp = i === 0 || c.benefits[i - 1].cover !== b.cover
                  return (
                    <View key={`${b.cover}|${b.label}|${i}`}>
                      {grp && <View style={s.grpRow} wrap={false}><Text style={[s.td, s.first, s.bold, { color: G2 }]}>{b.cover}</Text></View>}
                      <Row label={b.label} values={b.values} />
                    </View>
                  )
                })}
              </>}
            </View>
          ))}
        </View>
      </Page>

      {m.census.length > 0 && (
        <Page size="A4" style={s.page}>
          <Top m={m} version={version} prepared={prepared} />
          {foot}
          <View style={s.body}>
            <View style={s.h}><Text style={s.hText}>Census</Text><Text style={s.hMeta}>{`${m.census.length} lives`}</Text></View>
            <View style={s.thRow} fixed>
              {['No.', 'Name', 'Category', 'Relationship', 'Date of birth', 'Occ. class', 'Age'].map((h, i) => (
                <Text key={h} style={[s.th, i ? s.col : {}, { width: ['6%', '30%', '18%', '14%', '14%', '9%', '9%'][i], textAlign: i === 1 || i === 2 || i === 3 ? 'left' : 'center' }]}>{h}</Text>
              ))}
            </View>
            {m.census.map((p, n) => (
              <View key={n} style={s.tr} wrap={false}>
                {[String(n + 1), p.name, p.category, p.relationship, p.dob ?? '—', p.occupation ?? '—', p.age != null ? String(p.age) : '—'].map((v, i) => (
                  <Text key={i} style={[s.td, i ? s.col : {}, { width: ['6%', '30%', '18%', '14%', '14%', '9%', '9%'][i], textAlign: i === 1 || i === 2 || i === 3 ? 'left' : 'center' }]}>{v}</Text>
                ))}
              </View>
            ))}
          </View>
        </Page>
      )}
    </Document>
  )
}

export async function renderProposalPdf(m: ProposalModel, o: { version: number; prepared: string; preparedBy: string | null }): Promise<Buffer> {
  registerPdfFonts(join(process.cwd(), 'public', 'fonts'))
  return renderToBuffer(<ProposalDocument m={m} version={o.version} prepared={o.prepared} preparedBy={o.preparedBy} />)
}
