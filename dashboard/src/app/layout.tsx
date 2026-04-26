import type { Metadata } from 'next'
import { Archivo, Libre_Baskerville } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'

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
        <Sidebar />
        <div
          className="min-h-screen flex flex-col"
          style={{ marginLeft: 'var(--sidebar-width)', background: 'var(--content-bg)' }}
        >
          {children}
        </div>
      </body>
    </html>
  )
}
