// HR Connect public pages: /connect/<token>. No dashboard shell (ConditionalShell exempts
// /connect/), no session (middleware PUBLIC_PATHS). The token in the URL is the credential.
import type { Metadata } from 'next'
import '../connect.css'
import { LinkProvider } from '@/components/hr-connect/link-context'
import { Frame } from '@/components/hr-connect/frame'

export const metadata: Metadata = {
  title: 'Employee list · Trade Risk Solutions',
  robots: { index: false, follow: false },
}

export default function ConnectLayout({ children, params }: { children: React.ReactNode; params: { token: string } }) {
  return (
    <LinkProvider token={params.token}>
      <Frame>{children}</Frame>
    </LinkProvider>
  )
}
