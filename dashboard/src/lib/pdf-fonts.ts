/**
 * The TRS brand faces for PDF documents (debit notes, appointment letters), from Google Fonts:
 * Geist for text, EB Garamond for titles, Geist Mono for references, and the wordmark's Archivo
 * Expanded ("TRS") and Zhi Mang Xing ("保风") subsets. Files live in public/fonts.
 * The text faces have their GSUB table removed: react-pdf maps a ligature glyph back to its
 * first letter only, so "fi" and "tt" ligatures made copied text read "confrm", "remitance".
 *
 * `base` is a filesystem directory on the server (renderToBuffer) or the URL "/fonts" in the
 * browser (the live preview). Registration is global to react-pdf, so it runs once per base.
 */
import { Font } from '@react-pdf/renderer'

let registered: string | null = null

export function registerPdfFonts(base: string): void {
  if (registered === base) return
  const f = (name: string) => `${base.replace(/\/$/, '')}/${name}`
  Font.register({ family: 'Geist', fonts: [
    { src: f('Geist-Regular.woff'), fontWeight: 400 },
    { src: f('Geist-Medium.woff'), fontWeight: 500 },
    { src: f('Geist-SemiBold.woff'), fontWeight: 600 },
  ] })
  Font.register({ family: 'EB Garamond', src: f('EBGaramond-Medium.woff'), fontWeight: 500 })
  Font.register({ family: 'Geist Mono', src: f('GeistMono-Medium.woff'), fontWeight: 500 })
  Font.register({ family: 'TRS Mark', src: f('Archivo-Expanded-Medium-TRS.woff') })
  Font.register({ family: 'TRS Brush', src: f('ZhiMangXing-trs.woff') })
  // Words never hyphenate mid-name on a debit note.
  Font.registerHyphenationCallback(word => [word])
  registered = base
}

export const PDF_INK = '#0f1412'
export const PDF_SUB = '#4a5550'
export const PDF_MUT = '#7a847f'
export const PDF_HAIR = '#e6e8e4'
export const PDF_GREEN = '#132c1c'

