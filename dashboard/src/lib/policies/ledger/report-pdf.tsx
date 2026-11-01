/**
 * The renewal report as a TRS-branded PDF: the same letterhead, faces and rules as the debit
 * note (debit-note-pdf.tsx), one plain table per section, the options table, the dates TRS
 * works to, and what is not on file. No filesystem access here; the server half registers the
 * fonts and renders (report.ts).
 */
import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { PDF_GREEN, PDF_HAIR, PDF_INK, PDF_MUT, PDF_SUB } from '@/lib/pdf-fonts'
import { TRS_LETTERHEAD } from '@/lib/debit-note-pdf'
import type { ReportModel, ReportSection } from './report-model'

const s = StyleSheet.create({
  // paddingBottom reserves room for the fixed footnote and company line, so a section breaks before them.
  page:     { paddingTop: 40, paddingHorizontal: 44, paddingBottom: 96, fontSize: 9, fontFamily: 'Geist', color: PDF_INK, lineHeight: 1.4 },
  head:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: `1.2pt solid ${PDF_GREEN}` },
  mark:     { alignItems: 'center' },
  markT:    { fontFamily: 'TRS Mark', fontSize: 21, lineHeight: 1, letterSpacing: 4.2, color: PDF_GREEN, paddingLeft: 4.2 },
  markC:    { fontFamily: 'TRS Brush', fontSize: 15, lineHeight: 1, letterSpacing: 5, color: PDF_GREEN, paddingLeft: 5 },
  markGap:  { height: 6 },
  titleBox: { alignItems: 'flex-end' },
  title:    { fontFamily: 'EB Garamond', fontWeight: 500, fontSize: 24, lineHeight: 1 },
  number:   { fontFamily: 'Geist Mono', fontWeight: 500, fontSize: 10.5, color: PDF_GREEN, marginTop: 4 },
  parties:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  to:       { width: '52%' },
  label:    { fontSize: 7, color: PDF_MUT, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 3 },
  client:   { fontWeight: 600 },
  meta:     { width: '40%' },
  metaRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  metaKey:  { color: PDF_SUB },
  metaVal:  { textAlign: 'right' },
  section:  { marginTop: 16 },
  h2:       { fontFamily: 'EB Garamond', fontWeight: 500, fontSize: 14, lineHeight: 1.1 },
  period:   { fontFamily: 'Geist Mono', fontSize: 7.5, color: PDF_SUB, marginTop: 2, marginBottom: 6 },
  th:       { flexDirection: 'row', paddingBottom: 4, borderBottom: `1pt solid ${PDF_INK}` },
  thLabel:  { flex: 1, fontSize: 7.5, color: PDF_SUB, fontWeight: 500 },
  thNum:    { width: 96, fontSize: 7.5, color: PDF_SUB, fontWeight: 500, textAlign: 'right' },
  tr:       { flexDirection: 'row', paddingVertical: 4.5, borderBottom: `0.5pt solid ${PDF_HAIR}` },
  tdLabel:  { flex: 1, color: PDF_SUB },
  tdNum:    { width: 96, textAlign: 'right', fontFamily: 'Geist Mono', fontSize: 8.5 },
  tdWide:   { width: 150, textAlign: 'right', fontFamily: 'Geist Mono', fontSize: 8.5 },
  optTr:    { flexDirection: 'row', paddingVertical: 5, borderBottom: `0.5pt solid ${PDF_HAIR}` },
  optName:  { width: '34%' },
  optAmt:   { width: '26%', textAlign: 'right', fontFamily: 'Geist Mono', fontSize: 8.5, paddingRight: 10 },
  optBasis: { flex: 1, color: PDF_SUB },
  foot:     { position: 'absolute', bottom: 28, left: 44, right: 44 },
  note:     { fontSize: 7.2, color: PDF_SUB, lineHeight: 1.45, paddingTop: 6, borderTop: `0.5pt solid ${PDF_HAIR}` },
  company:  { marginTop: 6, paddingTop: 6, borderTop: `1.2pt solid ${PDF_GREEN}`, fontSize: 7.5, color: PDF_SUB },
  pageNo:   { position: 'absolute', top: 24, right: 44, fontSize: 7.5, color: PDF_MUT, fontFamily: 'Geist Mono' },
})

function Section({ sec }: { sec: ReportSection }) {
  const compare = sec.key === 'prior'
  return (
    <View style={s.section} wrap={false}>
      <Text style={s.h2}>{sec.title}</Text>
      <Text style={s.period}>{sec.period}</Text>
      <View style={s.th}>
        <Text style={s.thLabel}>Figure</Text>
        {compare ? <><Text style={s.thNum}>This period</Text><Text style={s.thNum}>Last period</Text><Text style={s.thNum}>Change</Text></> : <Text style={s.tdWide}> </Text>}
      </View>
      {sec.rows.map((r, i) => (
        <View key={i} style={s.tr}>
          <Text style={s.tdLabel}>{r.label}</Text>
          {compare ? <><Text style={s.tdNum}>{r.now}</Text><Text style={s.tdNum}>{r.prior}</Text><Text style={s.tdNum}>{r.change}</Text></> : <Text style={s.tdWide}>{r.now}</Text>}
        </View>
      ))}
    </View>
  )
}

export function RenewalReportDocument({ m }: { m: ReportModel }) {
  const first = m.sections.filter(x => x.key !== 'prior')
  const prior = m.sections.find(x => x.key === 'prior')
  const Foot = () => (
    <View style={s.foot} fixed>
      <Text style={s.note}>{m.footnote}</Text>
      <Text style={s.company}>{TRS_LETTERHEAD.companyName} · Co. Reg. No. {TRS_LETTERHEAD.coRegNo} · {TRS_LETTERHEAD.footerAddress} · +65 {TRS_LETTERHEAD.phone}</Text>
    </View>
  )
  const PageNo = () => <Text style={s.pageNo} fixed render={({ pageNumber, totalPages }) => `${m.policy.number} · page ${pageNumber} of ${totalPages}`} />
  return (
    <Document title={`${m.title} · ${m.client}`} author={TRS_LETTERHEAD.companyName}>
      <Page size="A4" style={s.page}>
        <PageNo />
        <View style={s.head}>
          <View style={s.mark}><View><Text style={s.markT}>TRS</Text></View><View style={s.markGap} /><View><Text style={s.markC}>保风</Text></View></View>
          <View style={s.titleBox}><Text style={s.title}>Renewal report</Text><Text style={s.number}>{m.policy.number}</Text></View>
        </View>
        <View style={s.parties}>
          <View style={s.to}>
            <Text style={s.label}>Prepared for</Text>
            <Text style={s.client}>{m.client}</Text>
            <Text style={{ marginTop: 3, color: PDF_SUB }}>{m.title} · {m.policy.insurer}</Text>
          </View>
          <View style={s.meta}>
            <View style={s.metaRow}><Text style={s.metaKey}>As of</Text><Text style={s.metaVal}>{m.as_of}</Text></View>
            <View style={s.metaRow}><Text style={s.metaKey}>Period</Text><Text style={s.metaVal}>{m.policy.period}</Text></View>
            <View style={s.metaRow}><Text style={s.metaKey}>Currency</Text><Text style={s.metaVal}>{m.currency}</Text></View>
          </View>
        </View>
        {first.map(sec => <Section key={sec.key} sec={sec} />)}
        {prior ? <Section sec={prior} /> : null}
        <Foot />
      </Page>

      <Page size="A4" style={s.page}>
        <PageNo />
        <View style={s.section} wrap={false}>
          <Text style={s.h2}>Renewal options</Text>
          <Text style={s.period}>Next period · {m.currency}</Text>
          <View style={s.th}><Text style={{ ...s.thLabel, width: '34%', flex: 0 }}>Option</Text><Text style={{ ...s.thNum, width: '26%', paddingRight: 10 }}>Premium</Text><Text style={{ ...s.thLabel }}>Basis</Text></View>
          {m.options.map((o, i) => (
            <View key={i} style={s.optTr}><Text style={s.optName}>{o.option}</Text><Text style={s.optAmt}>{o.premium}</Text><Text style={s.optBasis}>{o.basis}</Text></View>
          ))}
        </View>
        <View style={s.section} wrap={false}>
          <Text style={s.h2}>What TRS will do</Text>
          <Text style={s.period}>Dates</Text>
          <View style={s.th}><Text style={s.thLabel}>Step</Text><Text style={s.tdWide}> </Text></View>
          {m.plan.map((r, i) => (
            <View key={i} style={s.tr}><Text style={s.tdLabel}>{r.step}</Text><Text style={s.tdWide}>{r.date}</Text></View>
          ))}
        </View>
        {m.not_on_file.length ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Not on file</Text>
            <Text style={s.period}>Figures shown as — above, and where each comes from</Text>
            <View style={s.th}><Text style={s.thLabel}>Figure</Text><Text style={{ ...s.thLabel, flex: 1.4 }}>Source</Text></View>
            {m.not_on_file.map((r, i) => (
              <View key={i} style={s.tr}><Text style={s.tdLabel}>{r.item}</Text><Text style={{ flex: 1.4 }}>{r.source}</Text></View>
            ))}
          </View>
        ) : null}
        <Foot />
      </Page>
    </Document>
  )
}
