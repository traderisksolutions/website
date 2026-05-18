import type { Metadata } from 'next'
import { Archivo, Libre_Baskerville } from 'next/font/google'
import './globals.css'
import ConditionalShell from '@/components/ConditionalShell'

const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
})

const libreBaskerville = Libre_Baskerville({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-heading',
  display: 'swap',
})

export const metadata: Metadata = {
  title:       'TRS Dashboard',
  description: 'Trade Risk Solutions — Internal Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${libreBaskerville.variable}`}>
        <ConditionalShell>{children}</ConditionalShell>
      </body>
    </html>
  )
}
