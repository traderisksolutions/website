/**
 * The appointment letter as a PDF: A4, plain, the top 50mm left free so the client prints it on
 * its own letterhead. Text comes from letterParts() so the PDF and the Word file never differ.
 */
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { letterParts, type AppointmentLetter } from './appointment'

const s = StyleSheet.create({
  page:  { paddingTop: 142, paddingHorizontal: 72, paddingBottom: 72, fontFamily: 'Geist', fontSize: 10.5, lineHeight: 1.55, color: '#0f1412' },
  date:  { marginTop: 22 },
  title: { marginTop: 28, fontFamily: 'Geist', fontWeight: 600, fontSize: 12.5 },
  re:    { marginTop: 4 },
  para:  { marginTop: 14 },
  sign:  { marginTop: 64, width: 190, borderTop: '0.75pt solid #0f1412', paddingTop: 4 },
  bold:  { fontWeight: 600 },
})

export function AppointmentLetterPdf({ letter }: { letter: AppointmentLetter }) {
  const p = letterParts(letter)
  return (
    <Document title={`${p.title} - ${p.company}`} author={p.company}>
      <Page size="A4" style={s.page}>
        <View>{p.addressee.map((a, i) => <Text key={i}>{a}</Text>)}</View>
        <Text style={s.date}>{p.date}</Text>
        <Text style={s.title}>{p.title}</Text>
        <Text style={s.re}>Re: {p.re}</Text>
        {p.body.map((t, i) => <Text key={i} style={s.para}>{t}</Text>)}
        <Text style={s.para}>{p.closing}</Text>
        <View style={s.sign}>
          <Text>{p.name}</Text>
          <Text>{p.designation}</Text>
          <Text style={s.bold}>{p.company}</Text>
        </View>
      </Page>
    </Document>
  )
}
