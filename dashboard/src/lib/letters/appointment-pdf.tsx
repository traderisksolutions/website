/**
 * The appointment letter as a PDF, A4, top to bottom:
 *   the client's letterhead band: its logo left, its address right; blank when neither is given,
 *     so the client can print it on its own paper
 *   the TRS logo and "Prepared by" line
 *   the letter
 * Text comes from letterParts(): the template, or the letter text as edited in the editor.
 */
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { letterParts, type AppointmentLetter, type Block } from './appointment'

const s = StyleSheet.create({
  page:   { paddingHorizontal: 72, paddingBottom: 90, fontFamily: 'Geist', fontSize: 10.5, lineHeight: 1.55, color: '#0f1412' },
  band:   { height: 70, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  bandLogo: { maxHeight: 56, maxWidth: 170, objectFit: 'contain' },
  bandAddr: { fontSize: 8.5, color: '#4a5550', textAlign: 'right', lineHeight: 1.45, maxWidth: 220 },
  head:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 26, paddingBottom: 14, borderBottom: '0.5pt solid #e4e7e3' },
  logo:   { width: 118 },
  prep:   { fontSize: 8, color: '#4a5550', textAlign: 'right', lineHeight: 1.45 },
  date:   { marginTop: 22 },
  title:  { marginTop: 28, fontWeight: 600, fontSize: 12.5 },
  re:     { marginTop: 4, fontWeight: 600 },
  para:   { marginTop: 12 },
  li:     { marginTop: 6, flexDirection: 'row' },
  bullet: { width: 16 },
  sign:   { marginTop: 56, width: 190, borderTop: '0.75pt solid #0f1412', paddingTop: 4 },
  bold:   { fontWeight: 600 },
})

function Runs({ b }: { b: Block }) {
  return <Text>{b.runs.map((r, i) => <Text key={i} style={{ ...(r.b ? { fontWeight: 600 } : {}), ...(r.i ? { fontStyle: 'italic' as const } : {}), ...(r.u ? { textDecoration: 'underline' as const } : {}) }}>{r.text}</Text>)}</Text>
}

export function AppointmentLetterPdf({ letter, logoSrc }: { letter: AppointmentLetter; logoSrc?: string | Buffer | null }) {
  const p = letterParts(letter)
  return (
    <Document title={`${p.title} - ${p.company}`} author={p.company}>
      <Page size="A4" style={{ ...s.page, paddingTop: 40 }}>
        <View style={s.band}>
          {p.clientLogo ? <Image src={p.clientLogo} style={s.bandLogo} /> : <View />}
          {p.clientAddress.length > 0 && <Text style={s.bandAddr}>{p.clientAddress.join('\n')}</Text>}
        </View>
        <View style={s.head}>
          {logoSrc ? <Image src={logoSrc} style={s.logo} /> : <Text style={s.bold}>Trade Risk Solutions</Text>}
          <Text style={s.prep}>Prepared by{'\n'}Trade Risk Solutions Pte. Ltd.</Text>
        </View>
        <View>{p.addressee.map((a, i) => <Text key={i}>{a}</Text>)}</View>
        <Text style={s.date}>{p.date}</Text>
        <Text style={s.title}>{p.title}</Text>
        {p.re ? <Text style={s.re}>Re: {p.re}</Text> : null}
        {p.blocks.map((b, i) => b.kind === 'li'
          ? <View key={i} style={s.li}><Text style={s.bullet}>{b.ordered ? `${b.n}.` : '•'}</Text><View style={{ flex: 1 }}><Runs b={b} /></View></View>
          : <View key={i} style={s.para}><Runs b={b} /></View>)}
        {p.entities.length > 0 && (
          <View style={s.para}>
            <Text>List of entities:</Text>
            {p.entities.map((e, i) => <View key={i} style={s.li}><Text style={s.bullet}>•</Text><Text>{e}</Text></View>)}
          </View>
        )}
        <Text style={s.para}>{p.closing}</Text>
        <View style={s.sign} wrap={false}>
          <Text>{p.name}</Text>
          <Text>{p.designation}</Text>
          <Text style={s.bold}>{p.company}</Text>
        </View>
      </Page>
    </Document>
  )
}
