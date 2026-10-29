import type { Metadata } from 'next'
import { Archivo, EB_Garamond, Geist, Geist_Mono } from 'next/font/google'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import { ConfigProvider } from 'antd'
import './globals.css'
import ConditionalShell from '@/components/ConditionalShell'
import { apiKeyBootScript } from '@/lib/api-gate/boot-script'

// The TRS website's faces: Geist for the interface, EB Garamond for titles, Geist Mono for
// references and counts. --font-inter is kept as an alias so older inline styles still resolve.
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
const serif = EB_Garamond({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-serif', display: 'swap' })
const mono  = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })
// The wordmark: Archivo extended, as on the website.
const mark  = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' })

export const metadata: Metadata = {
  title:       'TRS Dashboard',
  description: 'Trade Risk Solutions — Internal Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The dashboard's API key, wired into window.fetch before any component
  // runs — see src/lib/api-gate/boot-script.ts for why it is done this way
  // and why the key being visible here is fine. Read per render rather
  // than baked into the bundle, so rotating it is a redeploy of config
  // rather than a rebuild.
  const apiKeyBoot = apiKeyBootScript(process.env.WEB_API_KEY)

  return (
    <html lang="en">
      <head>
        {apiKeyBoot ? <script dangerouslySetInnerHTML={{ __html: apiKeyBoot }} /> : null}
        {/* The two Chinese characters of the wordmark only (text= keeps the download to a few KB). */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zhi+Mang+Xing&text=%E4%BF%9D%E9%A3%8E&display=swap" />
      </head>
      <body className={`${geist.variable} ${serif.variable} ${mono.variable} ${mark.variable} font-sans antialiased`} style={{ ['--font-inter' as string]: 'var(--font-geist)' }}>
        <AntdRegistry>
          <ConfigProvider theme={{
            token: {
              colorPrimary:     '#132c1c',
              fontFamily:       'Geist, -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
              borderRadius:     10,
              colorBorder:      '#d5d9d4',
              colorText:        '#0f1412',
              colorTextSecondary: '#4a5550',
              colorBgContainer: '#ffffff',
            },
          }}>
            <ConditionalShell>{children}</ConditionalShell>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  )
}
