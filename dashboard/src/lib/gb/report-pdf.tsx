/**
 * The client report as a PDF — A4, laid out for paper rather than printed from the web page.
 *
 * Column widths are set as shares of the page, so a five-cover comparison fits the width instead
 * of running off the right edge the way the browser print of the web table did. Long benefit
 * wording wraps inside its cell and is cut at 180 characters; the schedule has the rest.
 * Server-only (filesystem read for the logo).
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image, Font, renderToBuffer } from '@react-pdf/renderer'
import { longDate, sgd, type ReportModel } from './report-model'

// Whole words only. The default hyphenator split "Insurance" and "Policy" mid-word.
Font.registerHyphenationCallback(word => [word])

const INK = '#202124', MUTED = '#5f6368', FAINT = '#80868b', RULE = '#dadce0', HAIR = '#ececec'

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 64, paddingHorizontal: 36, fontSize: 8.5, fontFamily: 'Helvetica', color: INK, lineHeight: 1.35 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  eyebrow: { fontSize: 7.5, letterSpacing: 1, color: MUTED, fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 16, lineHeight: 1.2 },
  meta: { flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: INK, borderBottomWidth: 0.5, borderBottomColor: RULE, paddingVertical: 8, marginBottom: 18 },
  metaCell: { flex: 1 },
  metaLabel: { fontSize: 7, color: FAINT, marginBottom: 2 },
  metaValue: { fontSize: 9 },
  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 6, marginTop: 4 },
  table: { marginBottom: 16 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: HAIR, paddingVertical: 5 },
  thRow: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: RULE, paddingBottom: 4 },
  th: { fontSize: 6.8, color: MUTED, fontFamily: 'Helvetica-Bold', letterSpacing: 0.4, paddingRight: 6 },
  td: { paddingRight: 6 },
  num: { textAlign: 'right' },
  bold: { fontFamily: 'Helvetica-Bold' },
  sub: { fontSize: 6.8, color: FAINT, marginTop: 1 },
  small: { fontSize: 7.3 },
  censusRow: { flexDirection: 'row', gap: 24, marginBottom: 14 },
  li: { flexDirection: 'row', marginBottom: 3 },
  footLine: { position: 'absolute', left: 36, right: 36, bottom: 22, fontSize: 6.8, color: FAINT, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 6 },
})

const cut = (t: string | null, n = 150) => (t == null ? '—' : t.length > n ? `${t.slice(0, n - 1)}…` : t)

function ReportDocument({ m, logo }: { m: ReportModel; logo: string | null }) {
  const n = m.covers.length
  // Shares of the width: the insurer column, then the covers, then total and PEPM.
  const insurerW = n > 5 ? 24 : 28
  const coverW = (100 - insurerW - 13 - 12) / Math.max(n, 1)
  const planCoverW = (100 - insurerW) / Math.max(n, 1)
  const fs = n > 5 ? { fontSize: 7.5 } : {}

  return (
    <Document title={`Group benefits comparison — ${m.company}`} author="Trade Risk Solutions Pte Ltd">
      <Page size="A4" style={s.page}>
        {/* Static text: in this document a fixed Text with a render prop (page numbers) was dropped. */}
        <Text fixed style={s.footLine}>Estimates only. Final premiums are subject to insurer underwriting and acceptance. {m.gstNote} Prepared by Trade Risk Solutions Pte Ltd.</Text>
        <View style={s.top}>
          {logo ? <Image src={logo} style={{ height: 24 }} /> : <Text style={s.bold}>Trade Risk Solutions</Text>}
          <Text style={s.eyebrow}>GROUP BENEFITS COMPARISON</Text>
        </View>
        <Text style={s.title}>{m.company}</Text>
        <View style={s.meta}>
          {[['Policy start', longDate(m.effectiveDate)], ['Basis', m.basis], ['Members', `${m.profile.members} (${m.profile.employees} employees)`], ['Prepared', longDate(m.prepared)]].map(([l, v]) => (
            <View key={l} style={s.metaCell}><Text style={s.metaLabel}>{l}</Text><Text style={s.metaValue}>{v}</Text></View>
          ))}
        </View>

        <Text style={s.h2}>Annual premium by insurer</Text>
        <View style={s.table}>
          <View style={s.thRow}>
            <Text style={[s.th, { width: `${insurerW}%` }]}>INSURER</Text>
            {m.covers.map(c => <Text key={c.code} style={[s.th, s.num, { width: `${coverW}%` }]}>{c.abbrev}</Text>)}
            <Text style={[s.th, s.num, { width: '13%' }]}>ANNUAL TOTAL</Text>
            <Text style={[s.th, s.num, { width: '12%' }]}>PER EMPLOYEE PER MONTH</Text>
          </View>
          {m.rows.map(r => (
            <View key={r.tableId} style={s.tr} wrap={false}>
              <View style={[s.td, { width: `${insurerW}%` }]}>
                <Text style={s.bold}>{r.insurer}</Text>
                {r.notQuoted.length > 0 && <Text style={s.sub}>Not quoted: {r.notQuoted.join(', ')}</Text>}
                {r.unpriced > 0 && <Text style={s.sub}>{r.unpriced} member line{r.unpriced === 1 ? '' : 's'} not priced</Text>}
              </View>
              {m.covers.map(c => {
                const v = r.cells[c.code]
                return (
                  <View key={c.code} style={[s.td, { width: `${coverW}%` }]}>
                    <Text style={[s.num, fs, { color: v ? INK : FAINT }]}>{!v ? '—' : v.amount != null ? sgd(v.amount) : `in ${v.inside}`}</Text>
                    {v && v.amount != null && v.extra.length > 0 && <Text style={[s.sub, s.num]}>incl. {v.extra.join(', ')}</Text>}
                  </View>
                )
              })}
              <Text style={[s.td, s.num, s.bold, fs, { width: '13%' }]}>{sgd(r.total)}</Text>
              <Text style={[s.td, s.num, fs, { width: '12%' }]}>{sgd(r.pepm, 2)}</Text>
            </View>
          ))}
        </View>

        <Text style={s.h2}>Plans priced</Text>
        <View style={s.table}>
          <View style={s.thRow}>
            <Text style={[s.th, { width: `${insurerW}%` }]}>INSURER</Text>
            {m.covers.map(c => <Text key={c.code} style={[s.th, { width: `${planCoverW}%` }]}>{c.abbrev}</Text>)}
          </View>
          {m.rows.map(r => (
            <View key={r.tableId} style={s.tr} wrap={false}>
              <Text style={[s.td, s.bold, { width: `${insurerW}%` }]}>{r.insurer}</Text>
              {m.covers.map(c => <Text key={c.code} style={[s.td, s.small, { width: `${planCoverW}%`, color: r.cells[c.code] ? INK : FAINT }]}>{r.cells[c.code]?.plan ?? '—'}</Text>)}
            </View>
          ))}
        </View>

        <Text style={s.h2}>Census</Text>
        <View style={s.censusRow}>
          {[['Members', String(m.profile.members)], ['Employees', String(m.profile.employees)], ['Dependants', String(m.profile.dependants)], ['Average age, employees', String(m.profile.averageAgeEmployees ?? '—')]].map(([l, v]) => (
            <View key={l}><Text style={s.metaLabel}>{l}</Text><Text style={s.metaValue}>{v}</Text></View>
          ))}
          {m.profile.bands.map(b => (
            <View key={b.label}><Text style={s.metaLabel}>{b.label}</Text><Text style={s.metaValue}>{b.count}</Text></View>
          ))}
        </View>

        {m.benefits.length > 0 && <Text style={s.h2} break>Key benefits</Text>}
        {m.benefits.map(t => {
          const bw = 24, iw = (100 - bw) / Math.max(t.insurers.length, 1)
          return (
            <View key={t.cover} style={s.table}>
              <View style={s.thRow} wrap={false}>
                <Text style={[s.th, { width: `${bw}%` }]}>{t.title.toUpperCase()}</Text>
                {t.insurers.map(i => (
                  <View key={i.tableId} style={{ width: `${iw}%`, paddingRight: 6 }}>
                    <Text style={[s.small, s.bold]}>{i.insurer}</Text>
                    <Text style={[s.sub, { marginTop: 0 }]}>{i.plan}</Text>
                  </View>
                ))}
              </View>
              {t.rows.map(r => (
                <View key={r.name} style={s.tr} wrap={false}>
                  <Text style={[s.td, s.small, { width: `${bw}%`, color: MUTED }]}>{r.name}</Text>
                  {r.values.map((v, i) => <Text key={i} style={[s.td, s.small, { width: `${iw}%`, color: v ? INK : FAINT }]}>{cut(v)}</Text>)}
                </View>
              ))}
            </View>
          )
        })}

        {m.basisLines.length > 0 && (
          <View wrap={false}>
            <Text style={s.h2}>Basis of this comparison</Text>
            {m.basisLines.map((l, i) => (
              <View key={i} style={s.li}><Text style={[s.small, { width: 8 }]}>•</Text><Text style={[s.small, { flex: 1, color: MUTED }]}>{l}</Text></View>
            ))}
          </View>
        )}

      </Page>
    </Document>
  )
}

export async function renderReportPdf(m: ReportModel): Promise<Buffer> {
  const p = join(process.cwd(), 'public', 'debit-note', 'trs-logo.png')
  return renderToBuffer(<ReportDocument m={m} logo={existsSync(p) ? p : null} />)
}
