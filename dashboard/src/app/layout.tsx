import type { Metadata } from 'next'
import { Archivo } from 'next/font/google'
import './globals.css'
import ConditionalShell from '@/components/ConditionalShell'
import { apiKeyBootScript } from '@/lib/api-gate/boot-script'
import { createClient } from '@/lib/supabase/server'
import { releaseVersion } from '@/lib/version'

// One face, Helvetica, is set in globals.css; only the wordmark loads a web font.
// The wordmark: Archivo extended, as on the website.
const mark  = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' })

// Server actions take their time limit from the page they run on. The chat dock on every page starts
// Nexus analyses (300 s routes until 21 Nov 2026), so every page allows 300 s.
export const maxDuration = 300

export const metadata: Metadata = {
  title:       'TRS Dashboard',
  description: 'Trade Risk Solutions — Internal Dashboard',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The dashboard's API key, wired into window.fetch before any component
  // runs — see src/lib/api-gate/boot-script.ts for why it is done this way
  // and why the key being visible here is fine. Read per render rather
  // than baked into the bundle, so rotating it is a redeploy of config
  // rather than a rebuild.
  const apiKeyBoot = apiKeyBootScript(process.env.WEB_API_KEY)
  // The signed-in user, read from the signed cookie here (no database call) and written into the
  // page, so the browser does not ask /api/auth/me on every page (src/lib/supabase/client.ts).
  const { data: { user } } = await (await createClient()).auth.getUser()
  const userBoot = `window.__TRS_USER__=${JSON.stringify(user).replace(/</g, '\\u003c')};window.__TRS_VERSION__=${JSON.stringify(releaseVersion())};`

  return (
    <html lang="en">
      <head>
        {apiKeyBoot ? <script dangerouslySetInnerHTML={{ __html: apiKeyBoot }} /> : null}
        <script dangerouslySetInnerHTML={{ __html: userBoot }} />
        {/* The two Chinese characters of the wordmark only (text= keeps the download to a few KB). */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zhi+Mang+Xing&text=%E4%BF%9D%E9%A3%8E&display=swap" />
      </head>
      <body className={`${mark.variable} font-sans antialiased`}>
        <ConditionalShell>{children}</ConditionalShell>
      </body>
    </html>
  )
}
