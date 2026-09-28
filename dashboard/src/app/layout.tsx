import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import { ConfigProvider } from 'antd'
import './globals.css'
import ConditionalShell from '@/components/ConditionalShell'
import { apiKeyBootScript } from '@/lib/api-gate/boot-script'

const inter = Inter({
  subsets:  ['latin'],
  variable: '--font-inter',
  display:  'swap',
})

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
      {apiKeyBoot ? <head><script dangerouslySetInnerHTML={{ __html: apiKeyBoot }} /></head> : null}
      <body className={`${inter.variable} font-sans antialiased`}>
        <AntdRegistry>
          <ConfigProvider theme={{
            token: {
              colorPrimary:     '#202124',
              fontFamily:       'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              borderRadius:     10,
              colorBorder:      '#dadce0',
              colorText:        '#202124',
              colorTextSecondary: '#5f6368',
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
