import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import { ConfigProvider } from 'antd'
import './globals.css'
import ConditionalShell from '@/components/ConditionalShell'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title:       'TRS Dashboard',
  description: 'Trade Risk Solutions — Internal Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <AntdRegistry>
          <ConfigProvider theme={{
            token: {
              colorPrimary:  '#1677FF',
              fontFamily:    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              borderRadius:  8,
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
